import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WhisperTranscriptionService {
    private readonly logger = new Logger(WhisperTranscriptionService.name);
    private openai: OpenAI | null = null;

    constructor(private readonly prisma: PrismaService) {}

    /**
     * Lazy-init OpenAI client — checks env var at runtime so it picks up
     * keys added after the process started.
     */
    private getOpenAI(): OpenAI | null {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            return null;
        }
        if (!this.openai) {
            this.openai = new OpenAI({ apiKey });
            this.logger.log('OpenAI Whisper client initialized.');
        }
        return this.openai;
    }

    /**
     * Process a Twilio call recording:
     * 1. Download recording audio from Twilio
     * 2. Transcribe using Whisper (original language)
     * 3. Translate to English using Whisper translation
     * 4. Score the intention
     * 5. Update the call_log record
     */
    async processRecording(callLogId: string, recordingUrl: string, recordingSid: string): Promise<{ success: boolean; error?: string; transcription?: string }> {
        const openai = this.getOpenAI();
        if (!openai) {
            this.logger.warn('Whisper not configured (OPENAI_API_KEY not set). Saving recording URL only.');
            await this.prisma.callLog.update({
                where: { id: callLogId },
                data: { recordingUrl },
            });
            return { success: false, error: 'OPENAI_API_KEY not set. Whisper transcription disabled.' };
        }

        try {
            this.logger.log(`Processing recording ${recordingSid} for call log ${callLogId}`);

            // Save recording URL immediately
            await this.prisma.callLog.update({
                where: { id: callLogId },
                data: { recordingUrl },
            });

            // Download the recording from Twilio (add .wav for audio format)
            const audioUrl = `${recordingUrl}.wav`;
            const accountSid = process.env.TWILIO_ACCOUNT_SID;
            const authToken = process.env.TWILIO_AUTH_TOKEN;

            this.logger.log(`Downloading recording from: ${audioUrl}`);

            const response = await fetch(audioUrl, {
                headers: {
                    'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
                },
            });

            if (!response.ok) {
                const errText = await response.text().catch(() => '');
                const errMsg = `Failed to download recording: ${response.status} ${response.statusText} — ${errText.substring(0, 200)}`;
                this.logger.error(errMsg);
                return { success: false, error: errMsg };
            }

            const audioBuffer = Buffer.from(await response.arrayBuffer());
            this.logger.log(`Downloaded recording: ${audioBuffer.length} bytes`);

            if (audioBuffer.length < 100) {
                const errMsg = `Recording too small (${audioBuffer.length} bytes), likely empty or invalid`;
                this.logger.error(errMsg);
                return { success: false, error: errMsg };
            }

            // Get the call log to know the language
            const callLog = await this.prisma.callLog.findUnique({
                where: { id: callLogId },
                select: { scriptLanguage: true },
            });

            // Step 1: Transcribe in original language — use Blob for Node.js compat
            const audioFile = new Blob([audioBuffer], { type: 'audio/wav' });
            // @ts-ignore — OpenAI SDK accepts Blob with name property
            audioFile.name = 'recording.wav';

            const transcription = await openai.audio.transcriptions.create({
                model: 'whisper-1',
                file: audioFile as any,
                language: this.mapLanguageCode(callLog?.scriptLanguage),
            });

            const transcriptionText = transcription.text?.trim() || '';
            this.logger.log(`Transcription (original): "${transcriptionText}"`);

            // Step 2: Translate to English using GPT (if not already English)
            // GPT text translation is far more accurate than Whisper's audio translation
            let translationText = transcriptionText;
            const lang = callLog?.scriptLanguage || 'en';
            if (lang !== 'en' && lang !== 'en-US' && lang !== 'en-GB' && transcriptionText) {
                const gptResponse = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a translator. Translate the following text to English. Return ONLY the English translation, nothing else. Preserve the full content — do not summarize or shorten.',
                        },
                        {
                            role: 'user',
                            content: transcriptionText,
                        },
                    ],
                    temperature: 0.1,
                    max_tokens: 2000,
                });
                translationText = gptResponse.choices[0]?.message?.content?.trim() || transcriptionText;
                this.logger.log(`Translation (English via GPT): "${translationText}"`);
            }

            // Step 3: Score intention from the transcription
            const intentionScore = this.scoreIntention(transcriptionText, translationText);
            this.logger.log(`Intention score: ${intentionScore}%`);

            // Step 4: Update call log with all results
            await this.prisma.callLog.update({
                where: { id: callLogId },
                data: {
                    transcriptionText,
                    transcriptionEnglish: translationText !== transcriptionText ? translationText : null,
                    intentionScore,
                },
            });

            this.logger.log(`Recording ${recordingSid} processed successfully.`);
            return { success: true, transcription: transcriptionText };
        } catch (error) {
            this.logger.error(`Failed to process recording ${recordingSid}: ${error.message}`, error.stack);
            return { success: false, error: error.message };
        }
    }

    /**
     * Score the customer's intention from transcript text (0-100).
     * Higher = more clearly confirmed; Lower = more clearly cancelled/unclear.
     */
    private scoreIntention(originalText: string, englishText: string): number {
        const text = (englishText || originalText || '').toLowerCase();

        if (!text || text.length < 2) return 0;

        // Strong confirmation signals
        const strongConfirm = ['yes', 'confirm', 'correct', 'right', 'sure', 'perfect', 'okay', 'ok', 'agree',
            'sí', 'si', 'confirmo', 'correcto', 'vale', 'perfecto', 'de acuerdo', 'bueno',
            'confermo', 'corretto', 'va bene', 'esatto', 'giusto', 'certo'];

        // Strong cancel signals
        const strongCancel = ['no', 'cancel', 'don\'t want', 'refuse', 'reject', 'wrong', 'incorrect',
            'cancelar', 'cancelo', 'no quiero', 'rechazar',
            'annullare', 'annullo', 'non voglio', 'rifiutare', 'sbagliato'];

        // Uncertainty signals
        const uncertainSignals = ['maybe', 'not sure', 'i don\'t know', 'what', 'repeat', 'again',
            'no sé', 'quizás', 'tal vez', 'repetir',
            'non so', 'forse', 'ripetere'];

        let score = 50; // Neutral starting point

        for (const pattern of strongConfirm) {
            if (text.includes(pattern)) { score += 25; break; }
        }
        for (const pattern of strongCancel) {
            if (text.includes(pattern)) { score -= 30; break; }
        }
        for (const pattern of uncertainSignals) {
            if (text.includes(pattern)) { score -= 15; break; }
        }

        // Clamp to 0-100
        return Math.max(0, Math.min(100, score));
    }

    /**
     * Map script language codes to Whisper language codes.
     */
    private mapLanguageCode(lang: string | null | undefined): string {
        const code = (lang || 'en').split('-')[0].toLowerCase();
        const map: Record<string, string> = {
            'es': 'es', 'it': 'it', 'fr': 'fr', 'de': 'de', 'pt': 'pt', 'en': 'en',
        };
        return map[code] || 'en';
    }
}
