import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Twilio } from 'twilio';

@Injectable()
export class TwilioVoiceService {
    private client: Twilio;
    private readonly logger = new Logger(TwilioVoiceService.name);

    // Retry delays in minutes: immediate, 30 min, 4 hours
    private readonly RETRY_DELAYS = [0, 30, 240];
    private readonly MAX_ATTEMPTS = 3;

    constructor(private readonly prisma: PrismaService) {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;

        if (!accountSid || !authToken) {
            this.logger.warn('Twilio credentials not configured. Voice calls will be skipped.');
            return;
        }

        this.client = new Twilio(accountSid, authToken);
        this.logger.log('Twilio Voice Service initialized.');
    }

    /**
     * Initiate a confirmation call for an order.
     */
    async initiateConfirmationCall(orderId: string, scriptType: 'short' | 'long') {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: { customer: true, items: true },
        });

        if (!order || !order.customer) {
            this.logger.error(`Order ${orderId} or customer not found. Cannot call.`);
            return;
        }

        if (!this.client) {
            this.logger.warn(`Twilio not configured. Skipping call for order ${orderId}.`);
            return;
        }

        const customerPhone = order.customer.phone;
        if (!customerPhone || customerPhone === '0000000000') {
            this.logger.warn(`Order ${orderId}: Customer has no valid phone number. Forwarding to call center.`);
            await this.forwardToCallCenter(orderId, null, null, 'No valid phone number');
            return;
        }

        // Determine language from shipping country
        const language = this.detectLanguage(order.shippingCountry);

        // Get current attempt count for this order
        const existingAttempts = await this.prisma.callLog.count({
            where: { orderId },
        });
        const attemptNumber = existingAttempts + 1;

        if (attemptNumber > this.MAX_ATTEMPTS) {
            this.logger.log(`Order ${orderId}: Max call attempts (${this.MAX_ATTEMPTS}) reached. Forwarding to call center.`);
            await this.forwardToCallCenter(orderId, null, null, `${this.MAX_ATTEMPTS} failed call attempts`);
            return;
        }

        // Build the TwiML webhook URL
        const appUrl = process.env.APP_URL || process.env.RAILWAY_PUBLIC_DOMAIN
            ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
            : 'http://localhost:3000';

        const twimlUrl = `${appUrl}/twilio/call-script?` +
            `orderId=${orderId}&` +
            `scriptType=${scriptType}&` +
            `language=${language}`;

        try {
            const call = await this.client.calls.create({
                to: customerPhone,
                from: process.env.TWILIO_PHONE_NUMBER || '+12765311327',
                url: twimlUrl,
                statusCallback: `${appUrl}/twilio/call-status?orderId=${orderId}`,
                statusCallbackEvent: ['completed', 'no-answer', 'busy', 'failed'],
                statusCallbackMethod: 'POST',
                method: 'POST',
            });

            // Log the call attempt
            await this.prisma.callLog.create({
                data: {
                    orderId,
                    callSid: call.sid,
                    attemptNumber,
                    callStatus: 'initiated',
                    scriptType,
                    scriptLanguage: language,
                },
            });

            // Update risk assessment with call info
            const assessment = await this.prisma.riskAssessment.findFirst({
                where: { orderId },
                orderBy: { createdAt: 'desc' },
            });

            if (assessment) {
                const existingSids = (assessment.callSids as string[]) || [];
                await this.prisma.riskAssessment.update({
                    where: { id: assessment.id },
                    data: {
                        callAttempts: attemptNumber,
                        lastCallAttempt: new Date(),
                        callSids: [...existingSids, call.sid],
                        actionTaken: `twilio_${scriptType}`,
                    },
                });
            }

            this.logger.log(`Order ${orderId}: Call initiated (attempt ${attemptNumber}, SID: ${call.sid}, lang: ${language})`);
            return call.sid;
        } catch (error) {
            this.logger.error(`Order ${orderId}: Failed to initiate call: ${error.message}`, error.stack);

            // Log the failed attempt
            await this.prisma.callLog.create({
                data: {
                    orderId,
                    callSid: `FAILED-${Date.now()}`,
                    attemptNumber,
                    callStatus: 'failed',
                    scriptType,
                    scriptLanguage: language,
                },
            });

            // If this was the last attempt, forward to call center
            if (attemptNumber >= this.MAX_ATTEMPTS) {
                await this.forwardToCallCenter(orderId, null, null, `Call initiation failed: ${error.message}`);
            }
        }
    }

    /**
     * Schedule a retry call with delay.
     * Uses setTimeout for simplicity (in-memory; lost on restart).
     */
    async scheduleRetryCall(orderId: string, scriptType: 'short' | 'long') {
        const currentAttempts = await this.prisma.callLog.count({ where: { orderId } });
        const nextAttemptIndex = currentAttempts; // 0-indexed into RETRY_DELAYS

        if (nextAttemptIndex >= this.MAX_ATTEMPTS) {
            this.logger.log(`Order ${orderId}: No more retries. Forwarding to call center.`);
            await this.forwardToCallCenter(orderId, null, null, `${this.MAX_ATTEMPTS} failed call attempts`);
            return;
        }

        const delayMinutes = this.RETRY_DELAYS[nextAttemptIndex] || 0;
        const delayMs = delayMinutes * 60 * 1000;

        this.logger.log(`Order ${orderId}: Scheduling retry in ${delayMinutes} minutes (attempt ${nextAttemptIndex + 1}/${this.MAX_ATTEMPTS}).`);

        if (delayMs === 0) {
            // Immediate retry
            await this.initiateConfirmationCall(orderId, scriptType);
        } else {
            setTimeout(async () => {
                try {
                    await this.initiateConfirmationCall(orderId, scriptType);
                } catch (err) {
                    this.logger.error(`Order ${orderId}: Scheduled retry failed: ${err.message}`);
                }
            }, delayMs);
        }
    }

    /**
     * Forward an order to the call center via Google Sheets.
     */
    async forwardToCallCenter(
        orderId: string,
        transcription: string | null,
        confidence: number | null,
        reason: string,
    ) {
        this.logger.log(`Order ${orderId}: Forwarding to call center. Reason: ${reason}`);

        // Update risk assessment
        const assessment = await this.prisma.riskAssessment.findFirst({
            where: { orderId },
            orderBy: { createdAt: 'desc' },
        });

        if (assessment) {
            await this.prisma.riskAssessment.update({
                where: { id: assessment.id },
                data: {
                    forwardedToCallCenter: true,
                    actionResult: 'forwarded_to_call_center',
                    reviewNotes: transcription
                        ? `Speech unclear: "${transcription}" (confidence: ${confidence}). ${reason}`
                        : reason,
                    ...(transcription ? { callTranscription: transcription } : {}),
                    ...(confidence != null ? { callConfidence: confidence } : {}),
                    callIntentDetected: 'FORWARDED',
                },
            });
        }

        // Update order confirmation status
        await this.prisma.order.update({
            where: { id: orderId },
            data: {
                confirmationStatus: 'Call Center',
                confirmationNotes: `Forwarded to call center: ${reason}`,
            },
        });
    }

    /**
     * Detect language based on shipping country.
     */
    private detectLanguage(country: string): string {
        const c = (country || '').toLowerCase().trim();
        if (c === 'italy' || c === 'it' || c === 'italia') return 'it-IT';
        // Default to Spanish for Spain and everything else
        return 'es-ES';
    }

    /**
     * Analyze customer intent from speech and DTMF input.
     */
    analyzeIntent(speechResult: string, digits: string, confidence: number): 'CONFIRMED' | 'CANCELLED' | 'UNCLEAR' {
        // DTMF is most reliable
        if (digits === '1') return 'CONFIRMED';
        if (digits === '2') return 'CANCELLED';

        // Low confidence → unclear
        if (confidence < 0.6) return 'UNCLEAR';

        const speech = (speechResult || '').toLowerCase().trim();

        // Spanish + Italian confirmation patterns
        const confirmPatterns = [
            'sí', 'si', 'yes', 'confirmo', 'confirmar', 'correcto', 'vale', 'ok',
            'de acuerdo', 'perfecto', 'adelante', 'bueno',
            // Italian
            'confermo', 'confermare', 'corretto', 'va bene', 'esatto', 'giusto',
        ];

        // Spanish + Italian cancel patterns
        const cancelPatterns = [
            'no', 'cancelar', 'cancelo', 'rechazar', 'no quiero', 'no gracias',
            // Italian
            'annullare', 'annullo', 'non voglio', 'rifiutare',
        ];

        const hasConfirm = confirmPatterns.some(p => speech.includes(p));
        const hasCancel = cancelPatterns.some(p => speech.includes(p));

        if (hasConfirm && !hasCancel) return 'CONFIRMED';
        if (hasCancel && !hasConfirm) return 'CANCELLED';

        return 'UNCLEAR';
    }
}
