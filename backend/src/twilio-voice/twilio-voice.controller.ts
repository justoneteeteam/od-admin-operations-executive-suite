import { Controller, Post, Query, Body, Res, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { TwilioVoiceService } from './twilio-voice.service';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/public.decorator';
import * as twilio from 'twilio';

@Controller('twilio')
export class TwilioVoiceController {
    private readonly logger = new Logger(TwilioVoiceController.name);

    constructor(
        private readonly twilioVoiceService: TwilioVoiceService,
        private readonly prisma: PrismaService,
    ) { }

    // ───────────────────────────────────────
    // 1. TwiML Script Generator (Twilio calls this URL)
    // ───────────────────────────────────────
    @Public()
    @Post('call-script')
    async generateCallScript(
        @Query('orderId') orderId: string,
        @Query('scriptType') scriptType: 'short' | 'long',
        @Query('language') language: string,
        @Res() res: Response,
    ) {
        this.logger.log(`Generating ${scriptType} TwiML script for order ${orderId} (${language})`);

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

        // Gather response
        const gather = twiml.gather({
            input: ['speech', 'dtmf'],
            timeout: 5,
            numDigits: 1,
            speechTimeout: 'auto',
            language: lang as any,
            action: `/twilio/process-response?orderId=${orderId}&scriptType=short`,
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

        // Gather response
        const gather = twiml.gather({
            input: ['speech', 'dtmf'],
            timeout: 7,
            numDigits: 1,
            speechTimeout: 'auto',
            language: lang as any,
            action: `/twilio/process-response?orderId=${orderId}&scriptType=long`,
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

        // Determine language from order
        const order = await this.prisma.order.findUnique({ where: { id: orderId } });
        const lang = order ? this.detectLang(order.shippingCountry) : 'es-ES';
        const isItalian = lang === 'it-IT';
        const voice = isItalian ? 'Polly.Bianca' : 'Polly.Lucia';

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
            // ✅ Confirm the order
            await this.prisma.order.update({
                where: { id: orderId },
                data: {
                    confirmationStatus: 'Confirmed',
                    confirmedAt: new Date(),
                    confirmationNotes: `Auto-confirmed via Twilio call (${scriptType}). Speech: "${speechResult || 'DTMF-1'}", confidence: ${confidence}`,
                },
            });

            // Update risk assessment
            await this.updateRiskAssessmentResult(orderId, 'confirmed', speechResult, confidence, intent);

            twiml.say({ voice, language: lang as any },
                isItalian
                    ? 'Perfetto. Il suo ordine è confermato. Riceverà la consegna a breve. Grazie.'
                    : 'Perfecto. Su pedido está confirmado. Recibirá la entrega pronto. Gracias.'
            );
            this.logger.log(`Order ${orderId}: CONFIRMED via Twilio.`);

        } else if (intent === 'CANCELLED') {
            // ❌ Cancel the order
            await this.prisma.order.update({
                where: { id: orderId },
                data: {
                    confirmationStatus: 'Declined',
                    orderStatus: 'Cancelled',
                    confirmationNotes: `Customer declined via Twilio call (${scriptType}). Speech: "${speechResult || 'DTMF-2'}"`,
                },
            });

            await this.updateRiskAssessmentResult(orderId, 'cancelled', speechResult, confidence, intent);

            twiml.say({ voice, language: lang as any },
                isItalian
                    ? 'Va bene. Il suo ordine è stato annullato. Grazie per aver avvisato.'
                    : 'De acuerdo. Su pedido ha sido cancelado. Gracias por avisar.'
            );
            this.logger.log(`Order ${orderId}: CANCELLED via Twilio.`);

        } else {
            // ⚠️ Unclear → forward to call center
            await this.twilioVoiceService.forwardToCallCenter(orderId, speechResult, confidence, 'Unclear speech response');

            twiml.say({ voice, language: lang as any },
                isItalian
                    ? 'Non abbiamo compreso la sua risposta. Un agente la contatterà a breve. Grazie.'
                    : 'No hemos entendido su respuesta. Un agente le contactará pronto. Gracias.'
            );
            this.logger.log(`Order ${orderId}: UNCLEAR response — forwarded to call center.`);
        }

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
