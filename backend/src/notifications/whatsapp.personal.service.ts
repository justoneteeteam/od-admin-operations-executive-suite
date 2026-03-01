import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Client, LocalAuth } from 'whatsapp-web.js';
import * as QRCode from 'qrcode';

@Injectable()
export class WhatsappPersonalService implements OnModuleInit, OnModuleDestroy {
    private client: Client;
    private readonly logger = new Logger(WhatsappPersonalService.name);

    // State 
    private currentQrCode: string | null = null;
    public isConnected: boolean = false;
    public clientPhone: string | null = null;
    public pairingCode: string | null = null;

    constructor(@Inject(PrismaService) private prisma: PrismaService) { }

    async onModuleInit() {
        this.logger.log('Initializing Personal WhatsApp Client...');
        this.initializeClient();
    }

    async onModuleDestroy() {
        if (this.client) {
            await this.client.destroy();
        }
    }

    private clientInitialized = false;

    private initializeClient() {
        // Run headless on Railway/Docker (no display), visible window only on local dev
        const isServer = !!(process.env.RAILWAY_ENVIRONMENT || process.env.PUPPETEER_EXECUTABLE_PATH || process.env.NODE_ENV === 'production');
        const puppeteerConfig: any = {
            headless: isServer,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
        };

        // On Railway/Docker, use the system-installed Chromium
        if (process.env.PUPPETEER_EXECUTABLE_PATH) {
            puppeteerConfig.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
            this.logger.log(`Using Chromium at: ${process.env.PUPPETEER_EXECUTABLE_PATH}`);
        }

        this.client = new Client({
            authStrategy: new LocalAuth({
                clientId: 'admin-erp-whatsapp'
            }),
            puppeteer: puppeteerConfig
        });

        // 1. QR Code generated
        this.client.on('qr', async (qr) => {
            this.logger.log('WhatsApp QR Code received. Awaiting scan...');
            this.isConnected = false;
            this.clientInitialized = true;
            this.currentQrCode = await QRCode.toDataURL(qr, { margin: 2, width: 300 });
        });

        // 2. Client is authenticated
        this.client.on('authenticated', () => {
            this.logger.log('WhatsApp Personal Client Authenticated!');
            this.currentQrCode = null;
        });

        // 3. Client is ready (fully loaded chats, etc)
        this.client.on('ready', () => {
            this.logger.log('WhatsApp Personal Client Ready to send messages!');
            this.isConnected = true;
            this.clientInitialized = true;
            this.clientPhone = this.client.info?.wid?.user || null;
            this.currentQrCode = null;
        });

        // 4. Client disconnected or logged out
        this.client.on('disconnected', (reason) => {
            this.logger.warn(`WhatsApp disconnected: ${reason}`);
            this.isConnected = false;
            this.clientPhone = null;
            this.clientInitialized = false;

            this.logger.log('Re-initializing WhatsApp client...');
            this.client.destroy().then(() => {
                this.initializeClient();
            }).catch(err => {
                this.logger.error('Failed to destroy client during restart', err);
            });
        });

        // 5. Catch initialization errors (e.g., missing chromium)
        this.client.initialize().catch(err => {
            this.logger.error('Failed to initialize WhatsApp client: ', err?.message || err);
            this.isConnected = false;
            this.clientInitialized = false;
        });
    }

    public getStatus() {
        return {
            connected: this.isConnected,
            phone: this.clientPhone,
            hasQr: !!this.currentQrCode
        };
    }

    public getQrCode() {
        return this.currentQrCode;
    }

    public async disconnect() {
        if (this.client && this.isConnected) {
            this.logger.log('Logging out of WhatsApp web session manually.');
            await this.client.logout(); // Triggers the 'disconnected' event
            return { success: true };
        }
        return { success: false, message: 'Not connected' };
    }

    /**
     * Request a pairing code for phone number linking (alternative to QR)
     * User enters this 8-digit code in their WhatsApp app under Linked Devices
     */
    public async requestPairingCode(phoneNumber: string) {
        try {
            if (this.isConnected) {
                return { success: false, message: 'Already connected' };
            }

            if (!this.clientInitialized || !this.client) {
                return { success: false, message: 'WhatsApp client is still initializing. Please wait a few seconds and try again, or check if Chromium is installed on the server.' };
            }

            // Strip all non-digit characters
            const cleanNumber = phoneNumber.replace(/\D/g, '');
            this.logger.log(`Requesting pairing code for: ${cleanNumber}`);

            const code = await (this.client as any).requestPairingCode(cleanNumber);
            this.pairingCode = code;
            this.logger.log(`Pairing code generated: ${code}`);
            return { success: true, pairingCode: code };
        } catch (error) {
            this.logger.error(`Failed to request pairing code: ${error.message}`, error.stack);
            return { success: false, message: error.message };
        }
    }

    /**
     * Compose and send a message using a template from the database
     */
    async sendTemplateMessage(
        toE164: string, // e.g. +1234567890
        templateName: string,
        variables: string[],
        context: { orderId?: string; customerId?: string }
    ) {
        try {
            if (!this.isConnected) {
                throw new Error('Personal WhatsApp client is not connected. Please scan QR code in Settings.');
            }

            // 1. Get Template
            const template = await this.prisma.notificationTemplate.findUnique({
                where: { templateName },
            });

            if (!template) {
                throw new Error(`Template ${templateName} not found`);
            }

            // 2. Replace Variables
            let body = template.bodyTemplate;
            variables.forEach((val, index) => {
                body = body.replace(`{{${index + 1}}}`, val);
            });

            // 3. Send via WhatsApp Web JS
            // Format phone number to WhatsApp ID format (remove +, add @c.us)
            const chatId = `${toE164.replace('+', '')}@c.us`;

            this.logger.log(`Attempting to send Personal WhatsApp to ${chatId}`);

            // Using a simple delay to mimic human speed slightly (optional, but good practice)
            await new Promise(resolve => setTimeout(resolve, 1000));

            const message = await this.client.sendMessage(chatId, body);

            // 4. Log to CustomerResponse
            await this.prisma.customerResponse.create({
                data: {
                    orderId: context.orderId || '00000000-0000-0000-0000-000000000000',
                    customerId: context.customerId,
                    notificationType: 'whatsapp_personal',
                    messageContent: body,
                    messageTemplate: templateName,
                    sentAt: new Date(),
                    externalMessageId: message.id.id,
                    externalStatus: 'sent',
                    status: 'sent',
                },
            });

            this.logger.log(`Personal WhatsApp sent to ${toE164}: ${message.id.id}`);
            return { success: true, messageId: message.id.id };
        } catch (error) {
            this.logger.error(`Failed to send Personal WhatsApp: ${error.message}`, error.stack);
            throw error;
        }
    }
}
