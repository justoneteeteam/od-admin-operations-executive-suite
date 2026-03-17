import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TwilioVoiceService } from './twilio-voice.service';

@Injectable()
export class TwilioCallSchedulerService {
    private readonly logger = new Logger(TwilioCallSchedulerService.name);

    // Hard cutoff: 2026-03-08 00:00:00 UTC
    private readonly CALL_ELIGIBLE_FROM = new Date('2026-03-08T00:00:00Z');

    constructor(
        private readonly prisma: PrismaService,
        private readonly twilioVoiceService: TwilioVoiceService,
    ) {
        this.logger.log(`Twilio Call Scheduler initialized. Cutoff: ${this.CALL_ELIGIBLE_FROM.toISOString()}`);
    }

    /**
     * Cron job that runs every 5 minutes to find and trigger pending Twilio calls.
     */
    @Cron(CronExpression.EVERY_5_MINUTES)
    async handleCron() {
        this.logger.log('Starting Twilio call scheduler cron job...');

        try {
            // Check if Twilio calls are enabled in store settings
            const storeSettings = await this.prisma.storeSettings.findFirst();
            if (!storeSettings?.enableTwilioCalls) {
                this.logger.log('Twilio calls are disabled in store settings. Skipping scheduler.');
                return;
            }

            // Find orders that meet the criteria:
            // 1. Created on or after the cutoff
            // 2. riskAction is twilio_short or twilio_long
            // 3. confirmationStatus is Pending
            // 4. Have zero call logs (never attempted)
            const eligibleOrders = await this.prisma.order.findMany({
                where: {
                    createdAt: {
                        gte: this.CALL_ELIGIBLE_FROM,
                    },
                    riskAction: {
                        in: ['twilio_short', 'twilio_long'],
                    },
                    confirmationStatus: 'Pending',
                    callLogs: {
                        none: {}, // No call logs exist
                    },
                    // Exclude SKU product orders — handled by SkuCallSchedulerService
                    items: {
                        none: {
                            product: {
                                sku: { not: '' },
                            },
                        },
                    },
                },
                include: {
                    items: true,
                },
            });

            if (eligibleOrders.length === 0) {
                this.logger.log('No eligible pending orders found for Twilio calls.');
                return;
            }

            this.logger.log(`Found ${eligibleOrders.length} eligible orders for automated Twilio calls.`);

            for (const order of eligibleOrders) {
                try {
                    const scriptType = order.riskAction === 'twilio_long' ? 'long' : 'short';

                    this.logger.log(`Triggering automated '${scriptType}' call for order ${order.orderNumber}...`);

                    // We call initiateConfirmationCall directly.
                    // initiateConfirmationCall handles the internal checks (idempotency, store settings, etc.)
                    await this.twilioVoiceService.initiateConfirmationCall(order.id, scriptType);

                } catch (error) {
                    this.logger.error(`Failed to trigger call for order ${order.orderNumber}: ${error.message}`);
                }
            }
        } catch (error) {
            this.logger.error(`Twilio call scheduler cron error: ${error.message}`);
        }
    }
}
