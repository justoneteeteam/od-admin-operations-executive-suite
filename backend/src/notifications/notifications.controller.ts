import { Controller, Post, Body, Res, Get, Query, Patch, Param } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappPersonalService } from './whatsapp.personal.service';
import { PrismaService } from '../prisma/prisma.service';
import { Response } from 'express';

@Controller('notifications')
export class NotificationsController {
    constructor(
        private readonly whatsappService: WhatsappService,
        private readonly whatsappPersonalService: WhatsappPersonalService,
        private readonly prisma: PrismaService
    ) { }

    @Post('callbacks/twilio')
    async handleTwilioCallback(@Body() body: any) {
        await this.whatsappService.handleStatusCallback(body);
        return { status: 'ok' };
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

    @Post('whatsapp/pair')
    async requestPairingCode(@Body() body: { phoneNumber: string }) {
        return await this.whatsappPersonalService.requestPairingCode(body.phoneNumber);
    }

    // --- Template Management Endpoints ---

    @Get('templates')
    async getTemplates(@Query('type') type?: string) {
        const where: any = {};
        if (type) {
            where.templateType = type;
        }
        const templates = await this.prisma.notificationTemplate.findMany({ where, orderBy: { templateName: 'asc' } });
        return templates;
    }

    @Patch('templates/:id')
    async updateTemplate(@Param('id') id: string, @Body() body: { bodyTemplate: string }) {
        const updated = await this.prisma.notificationTemplate.update({
            where: { id },
            data: { bodyTemplate: body.bodyTemplate },
        });
        return updated;
    }
}
