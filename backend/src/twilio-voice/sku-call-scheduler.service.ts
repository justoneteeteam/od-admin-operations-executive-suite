import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TwilioVoiceService } from './twilio-voice.service';

@Injectable()
export class SkuCallSchedulerService {
    private readonly logger = new Logger(SkuCallSchedulerService.name);

    // Hard cutoff: same as main scheduler
    private readonly CALL_ELIGIBLE_FROM = new Date('2026-03-08T00:00:00Z');

    // SKU flow limits
    private readonly MAX_ATTEMPTS = 8;
    private readonly MAX_PER_DAY = 4;
    private readonly MIN_GAP_MS = 2 * 60 * 60 * 1000; // 2 hours between calls

    constructor(
        private readonly prisma: PrismaService,
        private readonly twilioVoiceService: TwilioVoiceService,
    ) {
        this.logger.log(`SKU Call Scheduler initialized. Max ${this.MAX_ATTEMPTS} attempts, ${this.MAX_PER_DAY}/day, 2hr gap.`);
    }

    /**
     * Cron job: every 5 min, find SKU product orders needing confirmation calls.
     * SKU product = order item's product exists in the products table with a valid SKU.
     */
    @Cron(CronExpression.EVERY_5_MINUTES)
    async handleCron() {
        this.logger.log('Starting SKU call scheduler cron...');

        try {
            // Check if SKU confirmation calls are enabled
            const storeSettings = await this.prisma.storeSettings.findFirst();
            if (!storeSettings?.enableSkuConfirmationCalls) {
                this.logger.log('SKU confirmation calls disabled. Skipping SKU scheduler.');
                return;
            }

            // Find pending orders with SKU products (product exists in catalog)
            const eligibleOrders = await this.prisma.order.findMany({
                where: {
                    createdAt: { gte: this.CALL_ELIGIBLE_FROM },
                    riskAction: { in: ['twilio_short', 'twilio_long'] },
                    confirmationStatus: 'Pending',
                    // SKU filter: at least one item references a product with a non-empty SKU
                    items: {
                        some: {
                            product: {
                                sku: { not: '' },
                            },
                        },
                    },
                },
                include: {
                    items: true,
                    callLogs: {
                        orderBy: { createdAt: 'desc' },
                    },
                },
            });

            if (eligibleOrders.length === 0) {
                this.logger.log('No eligible SKU orders found.');
                return;
            }

            const now = new Date();
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

            // Filter by attempt limits, daily caps, and gap
            const filtered = eligibleOrders.filter(order => {
                const realCalls = order.callLogs.filter(
                    (c: any) => c.callStatus !== 'skipped' && !c.callSid?.startsWith('SKIPPED-'),
                );

                // Guard: customer already picked up → STOP
                const pickedUp = realCalls.some(
                    (c: any) => ['completed', 'answered'].includes(c.callStatus),
                );
                if (pickedUp) return false;

                // Guard: max 8 total attempts
                if (realCalls.length >= this.MAX_ATTEMPTS) return false;

                // Guard: max 4 calls today
                const todayCalls = realCalls.filter(
                    (c: any) => new Date(c.createdAt) >= todayStart,
                );
                if (todayCalls.length >= this.MAX_PER_DAY) return false;

                // Guard: 2-hour gap from last call
                const lastCall = realCalls[0];
                if (lastCall && (now.getTime() - new Date(lastCall.createdAt).getTime()) < this.MIN_GAP_MS) {
                    return false;
                }

                return true;
            });

            this.logger.log(`Found ${eligibleOrders.length} SKU orders, ${filtered.length} eligible after filtering.`);

            for (const order of filtered) {
                try {
                    const scriptType = order.riskAction === 'twilio_long' ? 'long' : 'short';
                    this.logger.log(`Triggering SKU confirmation call for order ${order.orderNumber} (${scriptType})...`);
                    await this.twilioVoiceService.initiateSkuConfirmationCall(order.id, scriptType);
                } catch (error) {
                    this.logger.error(`Failed SKU call for order ${order.orderNumber}: ${error.message}`);
                }
            }
        } catch (error) {
            this.logger.error(`SKU call scheduler cron error: ${error.message}`);
        }
    }
}
