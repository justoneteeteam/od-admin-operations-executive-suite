import { Controller, Post, Query, Body, Res, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { TwilioVoiceService } from './twilio-voice.service';
import { WhisperTranscriptionService } from './whisper-transcription.service';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/public.decorator';
import * as twilio from 'twilio';

@Controller('twilio')
export class TwilioVoiceController {
    private readonly logger = new Logger(TwilioVoiceController.name);

    constructor(
        private readonly twilioVoiceService: TwilioVoiceService,
        private readonly whisperService: WhisperTranscriptionService,
        private readonly prisma: PrismaService,
    ) { }

    @Public()
    @Post('test-call')
    async testCall(@Query('orderId') orderId: string, @Query('scriptType') scriptType: 'short' | 'long' = 'short') {
        await this.twilioVoiceService.initiateConfirmationCall(orderId, scriptType);
        return { success: true };
    }

    // ───────────────────────────────────────
    // 1. TwiML Script Generator (Twilio calls this URL)
    // ───────────────────────────────────────
    @Public()
    @Post('call-script')
    async generateCallScript(
        @Query('orderId') orderId: string,
        @Query('scriptType') scriptType: 'short' | 'long',
        @Query('language') language: string,
        @Body() body: any,
        @Res() res: Response,
    ) {
        const answeredBy = body?.AnsweredBy || '';
        this.logger.log(`Generating ${scriptType} TwiML script for order ${orderId} (${language}), AnsweredBy=${answeredBy}`);

        // ── Synchronous AMD: if Twilio detected a machine, hang up immediately ──
        if (answeredBy && answeredBy !== 'human') {
            this.logger.warn(`Order ${orderId}: Machine detected (${answeredBy}). Returning hangup TwiML.`);

            // Update the call log to reflect machine detection
            const callSid = body?.CallSid;
            if (callSid) {
                const callLog = await this.prisma.callLog.findFirst({
                    where: { orderId, callSid },
                });
                if (callLog) {
                    await this.prisma.callLog.update({
                        where: { id: callLog.id },
                        data: {
                            callStatus: 'machine_detected',
                            skipReason: `Voicemail/machine detected: ${answeredBy}`,
                            completedAt: new Date(),
                        },
                    });
                }
            }

            const twiml = new twilio.twiml.VoiceResponse();
            twiml.hangup();
            res.type('text/xml');
            return res.send(twiml.toString());
        }

        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: { customer: true, items: { include: { product: true } } },
        });

        if (!order) {
            const twiml = new twilio.twiml.VoiceResponse();
            twiml.say('Error: Order not found.');
            twiml.hangup();
            res.type('text/xml');
            return res.send(twiml.toString());
        }

        const storeName = order.storeName || 'our store';
        const orderNumber = order.orderNumber;
        const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);
        const totalAmount = Number(order.totalAmount || 0);
        const address = this.formatAddress(order);
        const productList = order.items.map(i => i.productName).join(', ');

        const lang = language || 'es-ES';
        const twiml = new twilio.twiml.VoiceResponse();

        if (scriptType === 'short') {
            this.generateShortScript(twiml, lang, storeName, orderNumber, totalItems, totalAmount, orderId);
        } else {
            this.generateLongScript(twiml, lang, storeName, orderNumber, totalItems, totalAmount, address, productList, orderId);
        }

        res.type('text/xml');
        return res.send(twiml.toString());
    }

    // ───────────────────────────────────────
    // SHORT SCRIPT (LOW risk)
    // ───────────────────────────────────────
    private generateShortScript(
        twiml: twilio.twiml.VoiceResponse,
        lang: string,
        storeName: string,
        orderNumber: string,
        totalItems: number,
        totalAmount: number,
        orderId: string,
    ) {
        const isItalian = lang === 'it-IT';
        const voice = isItalian ? 'Polly.Bianca' : 'Polly.Lucia';

        // Greeting
        twiml.say({ voice, language: lang as any },
            isItalian
                ? `Buongiorno, chiamiamo da ${storeName} per confermare il suo ordine numero ${orderNumber}.`
                : `Hola, llamamos de ${storeName} para confirmar su pedido número ${orderNumber}.`
        );
        twiml.pause({ length: 1 });

        // Order summary
        const itemText = isItalian
            ? (totalItems === 1 ? 'un articolo' : `${totalItems} articoli`)
            : (totalItems === 1 ? 'un artículo' : `${totalItems} artículos`);

        twiml.say({ voice, language: lang as any },
            isItalian
                ? `${itemText} per ${totalAmount} euro, consegna in contrassegno.`
                : `${itemText} por ${totalAmount} euros, entrega contra reembolso.`
        );
        twiml.pause({ length: 1 });

        const appUrl = process.env.APP_URL
            || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null)
            || 'http://localhost:3000';

        // Gather response
        const gather = twiml.gather({
            input: ['speech', 'dtmf'],
            timeout: 5,
            numDigits: 1,
            speechTimeout: 'auto',
            language: lang as any,
            action: `${appUrl}/twilio/process-response?orderId=${orderId}&scriptType=short`,
            method: 'POST',
        });

        gather.say({ voice, language: lang as any },
            isItalian
                ? 'Per confermare, dica SÌ o prema uno. Per annullare, dica NO o prema due.'
                : 'Para confirmar, diga SÍ o presione uno. Para cancelar, diga NO o presione dos.'
        );

        // No response fallback
        twiml.say({ voice, language: lang as any },
            isItalian
                ? 'Non abbiamo ricevuto risposta. Riproveremo più tardi. Grazie.'
                : 'No hemos recibido respuesta. Volveremos a intentar más tarde. Gracias.'
        );
    }

    // ───────────────────────────────────────
    // LONG SCRIPT (MEDIUM risk)
    // ───────────────────────────────────────
    private generateLongScript(
        twiml: twilio.twiml.VoiceResponse,
        lang: string,
        storeName: string,
        orderNumber: string,
        totalItems: number,
        totalAmount: number,
        address: string,
        productList: string,
        orderId: string,
    ) {
        const isItalian = lang === 'it-IT';
        const voice = isItalian ? 'Polly.Bianca' : 'Polly.Lucia';

        // Greeting
        twiml.say({ voice, language: lang as any },
            isItalian
                ? `Buongiorno, chiamiamo da ${storeName} per confermare il suo ordine numero ${orderNumber}.`
                : `Hola, llamamos de ${storeName} para confirmar su pedido número ${orderNumber}.`
        );
        twiml.pause({ length: 1 });

        // Order summary
        const itemText = isItalian
            ? (totalItems === 1 ? 'un articolo' : `${totalItems} articoli`)
            : (totalItems === 1 ? 'un artículo' : `${totalItems} artículos`);

        twiml.say({ voice, language: lang as any },
            isItalian
                ? `Ha ${itemText} per ${totalAmount} euro, consegna in contrassegno.`
                : `Tiene ${itemText} por ${totalAmount} euros, entrega contra reembolso.`
        );
        twiml.pause({ length: 1 });

        // Products
        twiml.say({ voice, language: lang as any },
            isItalian
                ? `I prodotti sono: ${productList}.`
                : `Los productos son: ${productList}.`
        );
        twiml.pause({ length: 1 });

        // Address
        twiml.say({ voice, language: lang as any },
            isItalian
                ? `Può confermare il suo indirizzo di consegna? ${address}.`
                : `¿Puede confirmar su dirección de entrega? ${address}.`
        );
        twiml.pause({ length: 1 });

        const appUrl = process.env.APP_URL
            || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null)
            || 'http://localhost:3000';

        // Gather response
        const gather = twiml.gather({
            input: ['speech', 'dtmf'],
            timeout: 7,
            numDigits: 1,
            speechTimeout: 'auto',
            language: lang as any,
            action: `${appUrl}/twilio/process-response?orderId=${orderId}&scriptType=long`,
            method: 'POST',
        });

        gather.say({ voice, language: lang as any },
            isItalian
                ? 'È corretto? Per confermare, dica SÌ o prema uno. Per segnalare un problema, dica NO o prema due.'
                : '¿Es correcto? Para confirmar todo, diga SÍ o presione uno. Si hay algún problema, diga NO o presione dos.'
        );

        // No response fallback
        twiml.say({ voice, language: lang as any },
            isItalian
                ? 'Non abbiamo ricevuto risposta. Un agente la contatterà a breve. Grazie.'
                : 'No hemos recibido respuesta. Un agente le contactará pronto. Gracias.'
        );
    }

    // ───────────────────────────────────────
    // 2. Process Customer Response
    // ───────────────────────────────────────
    @Public()
    @Post('process-response')
    async processResponse(
        @Query('orderId') orderId: string,
        @Query('scriptType') scriptType: string,
        @Body() twilioData: any,
        @Res() res: Response,
    ) {
        const speechResult = (twilioData.SpeechResult || '').toLowerCase();
        const digits = twilioData.Digits || '';
        const confidence = parseFloat(twilioData.Confidence || '0');

        this.logger.log(`Order ${orderId}: Response received — speech="${speechResult}", digits="${digits}", confidence=${confidence}`);

        const intent = this.twilioVoiceService.analyzeIntent(speechResult, digits, confidence);

        const twiml = new twilio.twiml.VoiceResponse();

        // Update call log with result
        const latestLog = await this.prisma.callLog.findFirst({
            where: { orderId },
            orderBy: { createdAt: 'desc' },
        });
        if (latestLog) {
            await this.prisma.callLog.update({
                where: { id: latestLog.id },
                data: {
                    speechResult: speechResult || null,
                    speechConfidence: confidence || null,
                    dtmfInput: digits || null,
                    intentDetected: intent,
                    completedAt: new Date(),
                },
            });
        }

        if (intent === 'CONFIRMED') {
            await this.prisma.order.update({
                where: { id: orderId },
                data: {
                    confirmationStatus: 'Confirmed',
                    confirmedAt: new Date(),
                    confirmationNotes: `Auto-confirmed via Twilio call (${scriptType}). Speech: "${speechResult || 'DTMF-1'}", confidence: ${confidence}`,
                },
            });
            await this.updateRiskAssessmentResult(orderId, 'confirmed', speechResult, confidence, intent);
            this.logger.log(`Order ${orderId}: CONFIRMED via Twilio.`);

        } else if (intent === 'CANCELLED') {
            await this.prisma.order.update({
                where: { id: orderId },
                data: {
                    confirmationStatus: 'Declined',
                    orderStatus: 'Cancelled',
                    confirmationNotes: `Customer declined via Twilio call (${scriptType}). Speech: "${speechResult || 'DTMF-2'}"`,
                },
            });
            await this.updateRiskAssessmentResult(orderId, 'cancelled', speechResult, confidence, intent);
            this.logger.log(`Order ${orderId}: CANCELLED via Twilio.`);

        } else {
            await this.twilioVoiceService.forwardToCallCenter(orderId, speechResult, confidence, 'Unclear speech response');
            this.logger.log(`Order ${orderId}: UNCLEAR response — forwarded to call center.`);
        }

        // Just hang up — no spoken reply after customer presses a button
        twiml.hangup();
        res.type('text/xml');
        return res.send(twiml.toString());
    }

    // ───────────────────────────────────────
    // 3. Call Status Callback
    // ───────────────────────────────────────
    @Public()
    @Post('call-status')
    async handleCallStatus(
        @Query('orderId') orderId: string,
        @Body() statusData: any,
    ) {
        const { CallSid, CallStatus, CallDuration } = statusData;

        this.logger.log(`Order ${orderId}: Call status update — ${CallStatus} (SID: ${CallSid}, Duration: ${CallDuration}s)`);

        // Update the call log
        const callLog = await this.prisma.callLog.findFirst({
            where: { orderId, callSid: CallSid },
        });

        if (callLog) {
            await this.prisma.callLog.update({
                where: { id: callLog.id },
                data: {
                    callStatus: CallStatus,
                    callDuration: CallDuration ? parseInt(CallDuration) : null,
                    completedAt: new Date(),
                },
            });
        }

        // Handle failures → retry or escalate
        if (['no-answer', 'busy', 'failed', 'canceled'].includes(CallStatus)) {
            const scriptType = callLog?.scriptType as 'short' | 'long' || 'short';
            await this.twilioVoiceService.scheduleRetryCall(orderId, scriptType);
        }

        return { received: true };
    }

    // ───────────────────────────────────────
    // 4. Recording Callback (Twilio sends when recording is ready)
    // ───────────────────────────────────────
    @Public()
    @Post('recording-callback')
    async handleRecordingCallback(
        @Query('orderId') orderId: string,
        @Body() recordingData: any,
    ) {
        const { RecordingSid, RecordingUrl, RecordingStatus, RecordingDuration } = recordingData;

        this.logger.log(
            `Order ${orderId}: Recording callback — SID: ${RecordingSid}, Status: ${RecordingStatus}, Duration: ${RecordingDuration}s`,
        );

        if (RecordingStatus !== 'completed') {
            return { received: true, skipped: 'recording not completed' };
        }

        // Find the latest call log for this order
        const callLog = await this.prisma.callLog.findFirst({
            where: { orderId },
            orderBy: { createdAt: 'desc' },
        });

        if (!callLog) {
            this.logger.warn(`Order ${orderId}: No call log found for recording ${RecordingSid}`);
            return { received: true, error: 'no call log found' };
        }

        // Process recording asynchronously (don't block Twilio webhook response)
        this.whisperService.processRecording(callLog.id, RecordingUrl, RecordingSid).catch(err => {
            this.logger.error(`Failed to process recording ${RecordingSid}: ${err.message}`);
        });

        return { received: true, processing: true };
    }

    // ───────────────────────────────────────
    // 5. Answering Machine Detection (AMD) Callback
    //    Twilio calls this when it detects human vs machine.
    //    If machine → hang up immediately so the script doesn't play to voicemail.
    // ───────────────────────────────────────
    @Public()
    @Post('amd-callback')
    async handleAmdCallback(
        @Query('orderId') orderId: string,
        @Body() amdData: any,
    ) {
        const { CallSid, AnsweredBy } = amdData;

        this.logger.log(
            `Order ${orderId}: AMD callback — SID: ${CallSid}, AnsweredBy: ${AnsweredBy}`,
        );

        // If answered by machine/fax → hang up immediately
        if (AnsweredBy && AnsweredBy !== 'human') {
            this.logger.warn(
                `Order ${orderId}: Answering machine detected (${AnsweredBy}). Hanging up call ${CallSid}.`,
            );

            try {
                // Hang up the call via Twilio API
                const accountSid = process.env.TWILIO_ACCOUNT_SID;
                const authToken = process.env.TWILIO_AUTH_TOKEN;
                if (accountSid && authToken) {
                    const twilioClient = new twilio.Twilio(accountSid, authToken);
                    await twilioClient.calls(CallSid).update({ status: 'completed' });
                    this.logger.log(`Order ${orderId}: Call ${CallSid} terminated (machine detected).`);
                }
            } catch (err) {
                this.logger.error(`Order ${orderId}: Failed to hang up machine call: ${err.message}`);
            }

            // Update call log to reflect machine detection
            const callLog = await this.prisma.callLog.findFirst({
                where: { orderId, callSid: CallSid },
            });

            if (callLog) {
                await this.prisma.callLog.update({
                    where: { id: callLog.id },
                    data: {
                        callStatus: 'machine_detected',
                        skipReason: `Voicemail/machine detected: ${AnsweredBy}`,
                        completedAt: new Date(),
                    },
                });
            }

            return { received: true, action: 'hung_up', answeredBy: AnsweredBy };
        }

        // Human answered — do nothing, let the TwiML script play normally
        this.logger.log(`Order ${orderId}: Human detected. Call proceeds normally.`);
        return { received: true, action: 'proceed', answeredBy: AnsweredBy };
    }

    // ───────────────────────────────────────
    // Helpers
    // ───────────────────────────────────────
    private async updateRiskAssessmentResult(
        orderId: string,
        result: string,
        transcription: string,
        confidence: number,
        intent: string,
    ) {
        const assessment = await this.prisma.riskAssessment.findFirst({
            where: { orderId },
            orderBy: { createdAt: 'desc' },
        });
        if (assessment) {
            await this.prisma.riskAssessment.update({
                where: { id: assessment.id },
                data: {
                    actionResult: result,
                    callTranscription: transcription || null,
                    callConfidence: confidence || null,
                    callIntentDetected: intent,
                },
            });
        }
    }

    private formatAddress(order: any): string {
        const parts = [
            order.shippingAddressLine1,
            order.shippingCity,
            order.shippingProvince,
            order.shippingPostalCode,
        ].filter(Boolean);
        return parts.join(', ');
    }

    private detectLang(country: string): string {
        const c = (country || '').toLowerCase().trim();
        if (c === 'italy' || c === 'it' || c === 'italia') return 'it-IT';
        return 'es-ES';
    }
}
