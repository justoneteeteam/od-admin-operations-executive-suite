import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Twilio } from 'twilio';
import { SmsWhatsappDeliveryService } from '../notifications/sms-whatsapp-delivery.service';

@Injectable()
export class TwilioVoiceService {
    private client: Twilio;
    private readonly logger = new Logger(TwilioVoiceService.name);

    // Retry delays in minutes: immediate, 30 min, 4 hours
    private readonly RETRY_DELAYS = [0, 30, 240];
    private readonly MAX_ATTEMPTS = 3; // Updated to match RETRY_DELAYS length
    private readonly PRE_CALL_DELAY_MS = 8000; // 8 seconds

    constructor(
        private readonly prisma: PrismaService,
        @Inject(SmsWhatsappDeliveryService) private readonly smsService: SmsWhatsappDeliveryService,
    ) {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;

        if (!accountSid || !authToken) {
            this.logger.warn('Twilio credentials not configured. Voice calls will be skipped.');
            return;
        }

        this.client = new Twilio(accountSid, authToken);
        this.logger.log('Twilio Voice Service initialized.');
    }

    private async logSkip(orderId: string, scriptType: string, scriptLanguage: string, reason: string) {
        this.logger.log(`Order ${orderId}: Skipping call. Reason: ${reason}`);

        // For 'already_answered' and 'already_confirmed', don't persist a new log entry
        // — the scheduler re-invokes every cycle, which inflates the count unnecessarily.
        if (['already_answered', 'already_confirmed', 'sku_already_picked_up', 'sku_already_finalized'].includes(reason)) {
            return;
        }

        // Find attempt number (only count real attempts, not skipped entries)
        const existingAttempts = await this.prisma.callLog.count({
            where: { orderId, callStatus: { notIn: ['skipped'] } },
        });

        await this.prisma.callLog.create({
            data: {
                orderId,
                callSid: `SKIPPED-${Date.now()}`,
                attemptNumber: existingAttempts + 1,
                callStatus: 'skipped',
                skipReason: reason,
                scriptType,
                scriptLanguage,
            },
        });
    }

    /**
     * Initiate a confirmation call for an order.
     */
    async initiateConfirmationCall(orderId: string, scriptType: 'short' | 'long') {
        if (!this.client) {
            this.logger.warn(`Twilio not configured. Skipping call for order ${orderId}.`);
            return;
        }
        // Fetch order first so we can check its store settings
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: { customer: true },
        });

        if (!order || !order.customer) {
            this.logger.error(`Order ${orderId} or customer not found. Cannot call.`);
            return;
        }

        // Check if Twilio calls are enabled for this order's store
        const storeSettings = await this.prisma.storeSettings.findFirst({
            where: { id: order.storeId },
        });
        if (!storeSettings?.enableTwilioCalls) {
            this.logger.log(`Order ${orderId}: Twilio calls disabled for store "${storeSettings?.storeName || order.storeId}". Skipping.`);
            return;
        }

        const language = this.detectLanguage(order.shippingCountry);

        // Rule 1: Check if finalized
        if (
            ['Confirmed', 'Declined', 'Call Center'].includes(order.confirmationStatus || '') ||
            order.orderStatus === 'Cancelled'
        ) {
            await this.logSkip(orderId, scriptType, language, 'already_confirmed');
            return;
        }

        // Rule 2: Check if successful call exists
        const successfulCall = await this.prisma.callLog.findFirst({
            where: {
                orderId,
                callStatus: { in: ['completed', 'answered'] },
                callSid: { not: { startsWith: 'SKIPPED-' } },
            },
        });
        if (successfulCall) {
            await this.logSkip(orderId, scriptType, language, 'already_answered');
            return;
        }

        // Rule 3: Check max attempts (only count real attempts, not skipped entries)
        const existingAttempts = await this.prisma.callLog.count({
            where: { orderId, callStatus: { notIn: ['skipped'] } },
        });
        const attemptNumber = existingAttempts + 1;

        if (attemptNumber > this.MAX_ATTEMPTS) {
            await this.logSkip(orderId, scriptType, language, 'max_attempts');
            // Mark as No Answer when max attempts exhausted
            await this.prisma.riskAssessment.updateMany({
                where: { orderId },
                data: {
                    actionResult: 'no_answer_exhausted',
                    reviewNotes: `${this.MAX_ATTEMPTS} failed call attempt(s)`,
                },
            });
            await this.prisma.order.update({
                where: { id: orderId },
                data: {
                    confirmationStatus: 'No Answer',
                    confirmationNotes: `No answer after ${this.MAX_ATTEMPTS} call attempt(s)`,
                },
            });
            return;
        }

        // Rule 4: Active call in progress
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        const activeCall = await this.prisma.callLog.findFirst({
            where: {
                orderId,
                callStatus: { in: ['queued', 'ringing', 'in-progress', 'initiated'] },
                createdAt: { gte: tenMinutesAgo },
            },
        });
        if (activeCall) {
            await this.logSkip(orderId, scriptType, language, 'active_call_exists');
            return;
        }

        const customerPhone = order.customer.phone;
        if (!customerPhone || customerPhone === '0000000000') {
            this.logger.warn(`Order ${orderId}: Customer has no valid phone number. Forwarding to call center.`);
            await this.forwardToCallCenter(orderId, null, null, 'No valid phone number');
            return;
        }

        // Build the TwiML webhook URL
        const appUrl = process.env.APP_URL
            || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null)
            || 'http://localhost:3000';

        const twimlUrl = `${appUrl}/twilio/call-script?` +
            `orderId=${orderId}&` +
            `scriptType=${scriptType}&` +
            `language=${language}`;

        // Rule 5: Idempotency check via DB creation before Twilio call
        const idempotencyKey = `twilio-call:${orderId}:${scriptType}:${attemptNumber}`;

        // Removed early callLog creation; will be created after all guard checks

        // Rule 6: Final DB re-check
        const finalOrderCheck = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: { confirmationStatus: true, orderStatus: true }
        });

        if (
            ['Confirmed', 'Declined', 'Call Center'].includes(finalOrderCheck?.confirmationStatus || '') ||
            finalOrderCheck?.orderStatus === 'Cancelled'
        ) {
            // Order was finalized between initial check and now — skip without creating a log
            this.logger.log(`Order ${orderId}: Skipped call due to finalization race condition.`);
            return;
        }

        // Create call log entry after all checks passed
        const callLogEntry = await this.prisma.callLog.create({
            data: {
                orderId,
                callSid: `PENDING-${Date.now()}`,
                attemptNumber,
                callStatus: 'initiated',
                scriptType,
                scriptLanguage: language,
                idempotencyKey,
            },
        });
        // ── Pre-Call SMS Warning (first attempt only) ──
        if (attemptNumber === 1) {
            try {
                const preCallTemplate = this.getPreCallTemplateForCountry(order.shippingCountry);
                const twilioPhone = process.env.TWILIO_PHONE_NUMBER || '+12765311327';
                const customerName = order.customer.name || 'Customer';

                await this.smsService.sendTemplateMessage(
                    customerPhone,
                    preCallTemplate,
                    [customerName, order.orderNumber, twilioPhone],
                    { orderId, customerId: order.customerId },
                );
                this.logger.log(`Order ${orderId}: Pre-call SMS warning sent. Waiting ${this.PRE_CALL_DELAY_MS / 1000}s before calling...`);

                // Delay to let the SMS arrive before the phone rings
                await new Promise(resolve => setTimeout(resolve, this.PRE_CALL_DELAY_MS));
            } catch (smsError) {
                // Non-blocking: if SMS fails, still proceed with the call
                this.logger.warn(`Order ${orderId}: Pre-call SMS failed (${smsError.message}). Proceeding with call anyway.`);
            }
        }

        try {
            const call = await this.client.calls.create({
                to: customerPhone,
                from: process.env.TWILIO_PHONE_NUMBER || '+12765311327',
                url: twimlUrl,
                // Answering Machine Detection: hang up on voicemail, only play script to humans
                machineDetection: 'DetectMessageEnd',
                asyncAmd: 'true',
                asyncAmdStatusCallback: `${appUrl}/twilio/amd-callback?orderId=${orderId}`,
                asyncAmdStatusCallbackMethod: 'POST',
                record: true,
                recordingStatusCallback: `${appUrl}/twilio/recording-callback?orderId=${orderId}`,
                recordingStatusCallbackMethod: 'POST',
                statusCallback: `${appUrl}/twilio/call-status?orderId=${orderId}`,
                statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
                statusCallbackMethod: 'POST',
                method: 'POST',
            });

            // Update the log attempt with real SID
            await this.prisma.callLog.update({
                where: { id: callLogEntry.id },
                data: {
                    callSid: call.sid,
                    callStatus: call.status || 'initiated', // Can be queued/ringing etc from Twilio
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

            // Update the failed attempt
            await this.prisma.callLog.update({
                where: { id: callLogEntry.id },
                data: {
                    callStatus: 'failed',
                    skipReason: 'twilio_api_error',
                },
            });

            // If this was the last attempt, forward to call center
            if (attemptNumber >= this.MAX_ATTEMPTS) {
                await this.forwardToCallCenter(orderId, null, null, `Call initiation failed: ${error.message}`);
            }
        }
    }

    /**
     * Initiate a confirmation call for SKU product orders.
     * Separate flow: 8 max attempts, 4/day, 5-min pre-SMS delay on first call.
     * After 8 exhausted → forward to call center.
     */
    async initiateSkuConfirmationCall(orderId: string, scriptType: 'short' | 'long') {
        if (!this.client) {
            this.logger.warn(`Twilio not configured. Skipping SKU call for order ${orderId}.`);
            return;
        }

        // Check if SKU confirmation calls are enabled for this order's store
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: { customer: true },
        });

        if (!order || !order.customer) {
            this.logger.error(`Order ${orderId} or customer not found. Cannot make SKU call.`);
            return;
        }

        const storeSettings = await this.prisma.storeSettings.findFirst({
            where: { id: order.storeId },
        });
        if (!storeSettings?.enableSkuConfirmationCalls) {
            this.logger.log(`Order ${orderId}: SKU confirmation calls disabled for store "${storeSettings?.storeName || order.storeId}". Skipping.`);
            return;
        }

        const language = this.detectLanguage(order.shippingCountry);
        const SKU_MAX_ATTEMPTS = 8;
        const SKU_PRE_CALL_DELAY_MS = 300000; // 5 minutes

        // Rule 1: Check if already finalized
        if (
            ['Confirmed', 'Declined', 'Call Center'].includes(order.confirmationStatus || '') ||
            order.orderStatus === 'Cancelled'
        ) {
            await this.logSkip(orderId, scriptType, language, 'sku_already_finalized');
            return;
        }

        // Rule 2: PICKED-UP GUARD — if customer answered ANY previous call, STOP
        const successfulCall = await this.prisma.callLog.findFirst({
            where: {
                orderId,
                callStatus: { in: ['completed', 'answered'] },
                callSid: { not: { startsWith: 'SKIPPED-' } },
            },
        });
        if (successfulCall) {
            await this.logSkip(orderId, scriptType, language, 'sku_already_picked_up');
            return;
        }

        // Rule 3: Check max attempts (8 for SKU, only count real attempts)
        const existingAttempts = await this.prisma.callLog.count({
            where: { orderId, callStatus: { notIn: ['skipped'] } },
        });
        const attemptNumber = existingAttempts + 1;

        if (attemptNumber > SKU_MAX_ATTEMPTS) {
            await this.logSkip(orderId, scriptType, language, 'sku_max_attempts');
            // SKU products → forward to call center
            await this.forwardToCallCenter(orderId, null, null,
                `SKU product: ${SKU_MAX_ATTEMPTS} call attempts exhausted`);
            return;
        }

        // Rule 4: Active call in progress
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        const activeCall = await this.prisma.callLog.findFirst({
            where: {
                orderId,
                callStatus: { in: ['queued', 'ringing', 'in-progress', 'initiated'] },
                createdAt: { gte: tenMinutesAgo },
            },
        });
        if (activeCall) {
            await this.logSkip(orderId, scriptType, language, 'sku_active_call_exists');
            return;
        }

        const customerPhone = order.customer.phone;
        if (!customerPhone || customerPhone === '0000000000') {
            this.logger.warn(`Order ${orderId}: No valid phone for SKU call. Forwarding to call center.`);
            await this.forwardToCallCenter(orderId, null, null, 'SKU product: No valid phone number');
            return;
        }

        // Build TwiML webhook URL
        const appUrl = process.env.APP_URL
            || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null)
            || 'http://localhost:3000';

        const twimlUrl = `${appUrl}/twilio/call-script?` +
            `orderId=${orderId}&` +
            `scriptType=${scriptType}&` +
            `language=${language}`;

        // Idempotency check
        const idempotencyKey = `sku-call:${orderId}:${scriptType}:${attemptNumber}`;

        let callLogEntry;
        try {
            callLogEntry = await this.prisma.callLog.create({
                data: {
                    orderId,
                    callSid: `PENDING-SKU-${Date.now()}`,
                    attemptNumber,
                    callStatus: 'initiated',
                    scriptType,
                    scriptLanguage: language,
                    idempotencyKey,
                },
            });
        } catch (dbError: any) {
            if (dbError.code === 'P2002') {
                this.logger.warn(`Order ${orderId}: SKU idempotency key ${idempotencyKey} exists. Skipping.`);
                return;
            }
            throw dbError;
        }

        // Final re-check before calling
        const finalCheck = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: { confirmationStatus: true, orderStatus: true },
        });

        if (
            ['Confirmed', 'Declined', 'Call Center'].includes(finalCheck?.confirmationStatus || '') ||
            finalCheck?.orderStatus === 'Cancelled'
        ) {
            await this.prisma.callLog.update({
                where: { id: callLogEntry.id },
                data: { callStatus: 'skipped', skipReason: 'sku_finalized_race' },
            });
            return;
        }

        // ── Pre-Call SMS (first attempt only, 5 min delay) ──
        if (attemptNumber === 1) {
            try {
                const preCallTemplate = this.getPreCallTemplateForCountry(order.shippingCountry);
                const twilioPhone = process.env.TWILIO_PHONE_NUMBER || '+12765311327';
                const customerName = order.customer.name || 'Customer';

                await this.smsService.sendTemplateMessage(
                    customerPhone,
                    preCallTemplate,
                    [customerName, order.orderNumber, twilioPhone],
                    { orderId, customerId: order.customerId },
                );
                this.logger.log(`Order ${orderId}: SKU pre-call SMS sent. Waiting ${SKU_PRE_CALL_DELAY_MS / 1000}s...`);

                // 5-minute delay before calling
                await new Promise(resolve => setTimeout(resolve, SKU_PRE_CALL_DELAY_MS));
            } catch (smsError) {
                this.logger.warn(`Order ${orderId}: SKU pre-call SMS failed (${smsError.message}). Proceeding.`);
            }
        }

        try {
            const call = await this.client.calls.create({
                to: customerPhone,
                from: process.env.TWILIO_PHONE_NUMBER || '+12765311327',
                url: twimlUrl,
                // Answering Machine Detection for SKU calls too
                machineDetection: 'DetectMessageEnd',
                asyncAmd: 'true',
                asyncAmdStatusCallback: `${appUrl}/twilio/amd-callback?orderId=${orderId}`,
                asyncAmdStatusCallbackMethod: 'POST',
                record: true,
                recordingStatusCallback: `${appUrl}/twilio/recording-callback?orderId=${orderId}`,
                recordingStatusCallbackMethod: 'POST',
                statusCallback: `${appUrl}/twilio/call-status?orderId=${orderId}`,
                statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
                statusCallbackMethod: 'POST',
                method: 'POST',
            });

            // Update log with real SID
            await this.prisma.callLog.update({
                where: { id: callLogEntry.id },
                data: { callSid: call.sid, callStatus: call.status || 'initiated' },
            });

            // Update risk assessment
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
                        actionTaken: `sku_twilio_${scriptType}`,
                    },
                });
            }

            this.logger.log(`Order ${orderId}: SKU call initiated (attempt ${attemptNumber}/${SKU_MAX_ATTEMPTS}, SID: ${call.sid})`);
            return call.sid;
        } catch (error) {
            this.logger.error(`Order ${orderId}: SKU call failed: ${error.message}`, error.stack);

            await this.prisma.callLog.update({
                where: { id: callLogEntry.id },
                data: { callStatus: 'failed', skipReason: 'sku_twilio_api_error' },
            });

            // If last attempt, forward to call center
            if (attemptNumber >= SKU_MAX_ATTEMPTS) {
                await this.forwardToCallCenter(orderId, null, null,
                    `SKU product: Call initiation failed on final attempt: ${error.message}`);
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
            this.logger.log(`Order ${orderId}: No more retries. Marking as No Answer.`);

            await this.prisma.riskAssessment.updateMany({
                where: { orderId },
                data: {
                    actionResult: 'no_answer_exhausted',
                    reviewNotes: `${this.MAX_ATTEMPTS} failed call attempt(s)`,
                },
            });

            await this.prisma.order.update({
                where: { id: orderId },
                data: {
                    confirmationStatus: 'No Answer',
                    confirmationNotes: `No answer after ${this.MAX_ATTEMPTS} call attempt(s)`,
                },
            });
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
     * Get the pre-call SMS template name based on shipping country.
     */
    private getPreCallTemplateForCountry(country: string): string {
        const c = (country || '').toLowerCase().trim();
        if (c === 'italy' || c === 'it' || c === 'italia') return 'sms_pre_call_it';
        if (c === 'spain' || c === 'es' || c === 'españa' || c === 'espana') return 'sms_pre_call_es';
        return 'sms_pre_call_en';
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
