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

            // Get the call log to know the language + customer response
            const callLog = await this.prisma.callLog.findUnique({
                where: { id: callLogId },
                select: { scriptLanguage: true, speechResult: true, dtmfInput: true, intentDetected: true },
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

            let transcriptionText = transcription.text?.trim() || '';
            this.logger.log(`Transcription (Whisper raw): "${transcriptionText}"`);

            // Step 2: Use GPT to analyze the transcription — separate script from customer speech and translate
            const lang = callLog?.scriptLanguage || 'en';
            const isNonEnglish = lang !== 'en' && lang !== 'en-US' && lang !== 'en-GB';

            // Build context about known customer response from Twilio Gather
            let gatherContext = '';
            if (callLog?.speechResult) {
                gatherContext += `\nKnown customer speech (from Twilio speech recognition): "${callLog.speechResult}"`;
            }
            if (callLog?.dtmfInput) {
                gatherContext += `\nKnown customer DTMF input: pressed ${callLog.dtmfInput}`;
            }
            if (callLog?.intentDetected) {
                gatherContext += `\nDetected intent: ${callLog.intentDetected}`;
            }

            const analysisPrompt = `Analyze this transcription of an automated confirmation call recording. The recording contains BOTH an automated TTS script AND the customer's spoken responses.

The automated script follows this pattern: greeting from a store, order details (number, items, price), delivery method, then asks the customer to confirm (say YES/press 1) or cancel (say NO/press 2). If no response, it says "we did not receive a response."

Your job: Identify what the CUSTOMER said (separate from the automated script). The customer may have spoken during or after the script — their voice may be brief (e.g., just "no", "sí", "what?", "hello?").
${gatherContext}

Output in this EXACT format:
SCRIPT: [The automated script text only]
CUSTOMER: [What the customer said, or "No response detected" if silent]
ENGLISH_SCRIPT: [English translation of the script]
ENGLISH_CUSTOMER: [English translation of what the customer said]

Transcription to analyze:
"${transcriptionText}"`;

            let finalTranscription = transcriptionText;
            let translationText = transcriptionText;

            try {
                const gptResponse = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: 'You analyze call recordings and separate automated script from customer responses. Be precise and preserve all content.' },
                        { role: 'user', content: analysisPrompt },
                    ],
                    temperature: 0.1,
                    max_tokens: 3000,
                });

                const gptOutput = gptResponse.choices[0]?.message?.content?.trim() || '';
                this.logger.log(`GPT analysis: "${gptOutput}"`);

                // Parse the structured output
                const scriptMatch = gptOutput.match(/SCRIPT:\s*(.+?)(?=\nCUSTOMER:)/s);
                const customerMatch = gptOutput.match(/CUSTOMER:\s*(.+?)(?=\nENGLISH_SCRIPT:)/s);
                const engScriptMatch = gptOutput.match(/ENGLISH_SCRIPT:\s*(.+?)(?=\nENGLISH_CUSTOMER:)/s);
                const engCustomerMatch = gptOutput.match(/ENGLISH_CUSTOMER:\s*(.+)/s);

                const scriptText = scriptMatch?.[1]?.trim() || transcriptionText;
                const customerText = customerMatch?.[1]?.trim() || 'No response detected';
                const engScript = engScriptMatch?.[1]?.trim() || '';
                const engCustomer = engCustomerMatch?.[1]?.trim() || '';

                // Build the full transcription with clear separation
                finalTranscription = `${scriptText}\n\n--- Customer Response ---\n${customerText}`;
                if (isNonEnglish) {
                    translationText = `${engScript}\n\n--- Customer Response ---\n${engCustomer}`;
                } else {
                    translationText = finalTranscription;
                }
            } catch (gptError) {
                this.logger.error(`GPT analysis failed: ${gptError.message}. Using raw transcription.`);
                // Fallback: append Gather data if available
                const customerParts: string[] = [];
                if (callLog?.speechResult) customerParts.push(`Customer said: "${callLog.speechResult}"`);
                if (callLog?.dtmfInput) customerParts.push(`Customer pressed: ${callLog.dtmfInput}`);
                if (customerParts.length > 0) {
                    finalTranscription += '\n\n--- Customer Response ---\n' + customerParts.join(' | ');
                }
            }

            this.logger.log(`Final transcription: "${finalTranscription}"`);
            this.logger.log(`Final translation: "${translationText}"`);

            // Step 3: Score intention from the transcription
            const intentionScore = this.scoreIntention(transcriptionText, translationText);
            this.logger.log(`Intention score: ${intentionScore}%`);

            // Step 4: Update call log with all results
            await this.prisma.callLog.update({
                where: { id: callLogId },
                data: {
                    transcriptionText: finalTranscription,
                    transcriptionEnglish: translationText !== finalTranscription ? translationText : null,
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
