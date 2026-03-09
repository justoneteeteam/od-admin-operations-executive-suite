import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RiskScoringService } from './risk-scoring.service';

@Injectable()
export class LoqateRetryService {
    private readonly logger = new Logger(LoqateRetryService.name);
    private isRunning = false;

    constructor(
        private readonly prisma: PrismaService,
        private readonly riskScoringService: RiskScoringService,
    ) {
        this.logger.log('LoqateRetryService initialized.');
    }

    /**
     * Runs every 6 hours — retries all orders still on local_fallback.
     * Deletes the stale assessment, then re-runs assessOrder() to get a fresh one.
     */
    @Cron(CronExpression.EVERY_6_HOURS)
    async retryLoqateVerification() {
        if (this.isRunning) {
            this.logger.warn('LoqateRetry: Previous run still in progress, skipping.');
            return;
        }
        this.isRunning = true;

        try {
            // Find risk assessments still using local_fallback
            const stale = await this.prisma.riskAssessment.findMany({
                where: { loqateSource: 'local_fallback' },
                select: { orderId: true, id: true },
                take: 50, // batch cap to avoid hammering Loqate API
            });

            if (stale.length === 0) {
                this.logger.log('LoqateRetry: No local_fallback orders to retry.');
                return;
            }

            this.logger.log(`LoqateRetry: Found ${stale.length} orders to re-verify.`);
            let succeeded = 0;
            let failed = 0;

            for (const assessment of stale) {
                try {
                    // Delete stale assessment so assessOrder() creates a fresh one
                    await this.prisma.riskAssessment.delete({
                        where: { id: assessment.id },
                    });

                    await this.riskScoringService.assessOrder(assessment.orderId);
                    succeeded++;

                    // Small delay to avoid rate-limiting Loqate API
                    await new Promise((r) => setTimeout(r, 300));
                } catch (err) {
                    failed++;
                    this.logger.error(
                        `LoqateRetry: Failed for order ${assessment.orderId}: ${err.message}`,
                    );
                }
            }

            this.logger.log(
                `LoqateRetry: Done. Succeeded: ${succeeded}, Failed: ${failed}`,
            );
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Purge expired Loqate cache entries daily at midnight.
     */
    @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
    async purgeExpiredCache() {
        try {
            const deleted = await this.prisma.$executeRaw`
                DELETE FROM loqate_address_cache WHERE expires_at < NOW()
            `;
            this.logger.log(`LoqateRetry: Purged ${deleted} expired cache entries.`);
        } catch (err) {
            this.logger.error(`LoqateRetry: Cache purge failed: ${err.message}`);
        }
    }
}
