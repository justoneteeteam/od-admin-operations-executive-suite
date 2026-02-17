import { Controller, Post, Body, Res, Get, Query } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { Response } from 'express';

@Controller('notifications')
export class NotificationsController {
    constructor(private readonly whatsappService: WhatsappService) { }

    @Post('callbacks/twilio')
    async handleTwilioCallback(@Body() body: any) {
        // Twilio sends form-urlencoded usually, but NestJS might parse it if configured.
        // Body usually contains MessageSid, MessageStatus, To, From.
        await this.whatsappService.handleStatusCallback(body);
        return { status: 'ok' }; // Twilio expects 200 OK
    }

    // Temporary Test Endpoint
    @Post('test')
    async sendTestMessage(@Body() body: { to: string; orderId: string }) {
        // In a real scenario, we'd lookup the order and customer.
        // Here we just test the sending capability.
        return await this.whatsappService.sendTemplateMessage(
            body.to,
            'order_in_transit',
            ['Test Customer', 'ORD-TEST-123', 'https://17track.net/test'],
            { orderId: body.orderId }
        );
    }
}
