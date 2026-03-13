import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingService } from './tracking.service';
import axios from 'axios';

@Injectable()
export class TrackingPollService {
    private readonly logger = new Logger(TrackingPollService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly trackingService: TrackingService,
    ) { }

    @Cron('*/20 * * * *')
    async pollActiveTrackingNumbers() {
        this.logger.log('Starting scheduled tracking poll...');

        // Only poll orders that are NOT in a terminal state
        const activeOrders = await this.prisma.order.findMany({
            where: {
                trackingNumber: { not: null },
                shippingStatus: {
                    notIn: ['Delivered', 'Returned', 'Expired', 'Cancelled', 'Exception']
                }
            },
            select: { trackingNumber: true }
        });

        if (!activeOrders.length) {
            this.logger.log('No active tracking numbers found to poll.');
            return;
        }

        const numbers = activeOrders.map(o => o.trackingNumber!);
        this.logger.log(`Polling ${numbers.length} active tracking numbers`);

        // Batch in groups of 40 (17Track limit)
        for (let i = 0; i < numbers.length; i += 40) {
            const batch = numbers.slice(i, i + 40);
            await this.pollBatch(batch);
            await new Promise(r => setTimeout(r, 1000)); // rate limit buffer
        }
    }

    private async pollBatch(trackingNumbers: string[]) {
        try {
            const response = await axios.post(
                'https://api.17track.net/track/v2.2/gettrackinfo',
                trackingNumbers.map(n => ({ number: n })),
                {
                    headers: {
                        '17token': process.env.TRACK17_API_KEY,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const accepted = response.data?.data?.accepted || [];
            for (const item of accepted) {
                if (item.track_info) {
                    await this.trackingService.processTrackingItem(item);
                }
            }
        } catch (e) {
            this.logger.error(`Poll batch failed: ${e.message}`);
        }
    }
}
