import { Controller, Post, Body, Res, Get, Query } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappPersonalService } from './whatsapp.personal.service';
import { Response } from 'express';

@Controller('notifications')
export class NotificationsController {
    constructor(
        private readonly whatsappService: WhatsappService,
        private readonly whatsappPersonalService: WhatsappPersonalService
    ) { }

    @Post('callbacks/twilio')
    async handleTwilioCallback(@Body() body: any) {
        // Twilio sends form-urlencoded usually, but NestJS might parse it if configured.
        // Body usually contains MessageSid, MessageStatus, To, From.
        await this.whatsappService.handleStatusCallback(body);
        return { status: 'ok' }; // Twilio expects 200 OK
    }

    // Temporary SMS Test Endpoint
    @Post('test')
    async sendTestMessage(@Body() body: { to: string; orderId: string }) {
        return await this.whatsappService.sendTemplateMessage(
            body.to,
            'order_in_transit',
            ['Test Customer', 'ORD-TEST-123', 'https://17track.net/test'],
            { orderId: body.orderId }
        );
    }

    // --- Personal WhatsApp Endpoints ---

    @Get('whatsapp/status')
    async getWhatsappStatus() {
        return this.whatsappPersonalService.getStatus();
    }

    @Get('whatsapp/qr')
    async getWhatsappQr() {
        const qr = this.whatsappPersonalService.getQrCode();
        if (!qr) {
            return { success: false, message: 'QR Code not available (might be connected or initializing)' };
        }
        return { success: true, qrCode: qr };
    }

    @Post('whatsapp/disconnect')
    async disconnectWhatsapp() {
        return await this.whatsappPersonalService.disconnect();
    }
}
