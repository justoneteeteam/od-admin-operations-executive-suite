import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WhisperTranscriptionService {
    private readonly logger = new Logger(WhisperTranscriptionService.name);
    private openai: OpenAI | null = null;

    constructor(private readonly prisma: PrismaService) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (apiKey) {
            this.openai = new OpenAI({ apiKey });
            this.logger.log('OpenAI Whisper service initialized.');
        } else {
            this.logger.warn('OPENAI_API_KEY not set. Whisper transcription disabled.');
        }
    }

    /**
     * Process a Twilio call recording:
     * 1. Download recording audio from Twilio
     * 2. Transcribe using Whisper (original language)
     * 3. Translate to English using Whisper translation
     * 4. Score the intention
     * 5. Update the call_log record
     */
    async processRecording(callLogId: string, recordingUrl: string, recordingSid: string): Promise<void> {
        if (!this.openai) {
            this.logger.warn('Whisper not configured. Saving recording URL only.');
            await this.prisma.callLog.update({
                where: { id: callLogId },
                data: { recordingUrl },
            });
            return;
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

            const response = await fetch(audioUrl, {
                headers: {
                    'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
                },
            });

            if (!response.ok) {
                throw new Error(`Failed to download recording: ${response.status} ${response.statusText}`);
            }

            const audioBuffer = Buffer.from(await response.arrayBuffer());
            this.logger.log(`Downloaded recording: ${audioBuffer.length} bytes`);

            // Get the call log to know the language
            const callLog = await this.prisma.callLog.findUnique({
                where: { id: callLogId },
                select: { scriptLanguage: true },
            });

            // Step 1: Transcribe in original language
            const audioFile = new File([audioBuffer], 'recording.wav', { type: 'audio/wav' });

            const transcription = await this.openai.audio.transcriptions.create({
                model: 'whisper-1',
                file: audioFile,
                language: this.mapLanguageCode(callLog?.scriptLanguage),
            });

            const transcriptionText = transcription.text?.trim() || '';
            this.logger.log(`Transcription (original): "${transcriptionText}"`);

            // Step 2: Translate to English (if not already English)
            let translationText = transcriptionText;
            const lang = callLog?.scriptLanguage || 'en';
            if (lang !== 'en' && lang !== 'en-US' && lang !== 'en-GB' && transcriptionText) {
                const audioFileForTranslation = new File([audioBuffer], 'recording.wav', { type: 'audio/wav' });
                const translation = await this.openai.audio.translations.create({
                    model: 'whisper-1',
                    file: audioFileForTranslation,
                });
                translationText = translation.text?.trim() || transcriptionText;
                this.logger.log(`Translation (English): "${translationText}"`);
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
        } catch (error) {
            this.logger.error(`Failed to process recording ${recordingSid}: ${error.message}`, error.stack);
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
