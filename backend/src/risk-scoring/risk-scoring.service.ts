import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TwilioVoiceService } from '../twilio-voice/twilio-voice.service';
import { GoogleSheetsService } from '../google-sheets/google-sheets.service';
import { AddressVerifyService, AddressVerifyResult } from '../address-verify/address-verify.service';

/** Full scoring context passed between internal methods */
interface ScoringContext {
    order: any;
    customer: any;
    items: any[];
    recentOrders: any[];
}

/** Result of base scoring (Layer 1) */
interface BaseScoreResult {
    totalScore: number;
    isBlocked: boolean;
    isFirstOrder: boolean;
    recentOrderCount: number;
    factors: {
        blockedScore: number;
        itemScore: number;
        valueScore: number;
        frequencyScore: number;
        historyScore: number;
        addressFormatScore: number;
        missingHouseNumberScore: number;
        loqateSource: string;
        avc: string | null;
        hasHouseNumber: boolean;
    };
}

@Injectable()
export class RiskScoringService {
    private readonly logger = new Logger(RiskScoringService.name);

    constructor(
        private readonly prisma: PrismaService,
        @Inject(forwardRef(() => TwilioVoiceService)) private readonly twilioVoiceService: TwilioVoiceService,
        @Inject(forwardRef(() => GoogleSheetsService)) private readonly googleSheetsService: GoogleSheetsService,
        private readonly addressVerifyService: AddressVerifyService,
    ) { }

    /**
     * Main entry point to assess an order.
     */
    async assessOrder(orderId: string) {
        this.logger.log(`Starting risk assessment for order: ${orderId}`);

        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: {
                items: true,
                customer: true,
            },
        });

        if (!order) {
            throw new Error(`Order ${orderId} not found for risk assessment.`);
        }

        const customer = order.customer;
        if (!customer) {
            throw new Error(`Order ${orderId} has no customer linked.`);
        }

        // Load recent orders for frequency scoring
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const recentOrders = await this.prisma.order.findMany({
            where: {
                customerId: customer.id,
                id: { not: order.id },
                orderDate: { gte: sevenDaysAgo },
            },
            orderBy: { orderDate: 'desc' },
        });

        const ctx: ScoringContext = { order, customer, items: order.items, recentOrders };

        // Layer 1 — Base scoring (always runs)
        const baseResult = this.runBaseScore(ctx);

        // Layer 2 — Loqate enhancement (optional, conditional)
        const finalResult = await this.applyLoqateRefinement(ctx, baseResult);

        // Risk level decision
        const { riskLevel, action } = this.computeRiskLevel(finalResult.totalScore, finalResult.isBlocked);

        // Persist assessment
        const savedAssessment = await this.persistAssessment(orderId, customer.id, finalResult, riskLevel, action);

        // Update order
        await this.prisma.order.update({
            where: { id: order.id },
            data: {
                riskScore: finalResult.totalScore,
                riskLevel,
                riskAction: action,
                riskAssessedAt: new Date(),
                ...(finalResult.isBlocked
                    ? { orderStatus: 'Cancelled', internalNotes: 'Auto-rejected due to BLOCKED customer/risk policy.' }
                    : {}),
            },
        });

        this.logger.log(`Order ${orderId} assessed as ${riskLevel} (${finalResult.totalScore} pts). Action: ${action}`);

        // Trigger automated action
        await this.triggerAction(riskLevel, action, order);

        return savedAssessment;
    }

    /**
     * Layer 1 — Pure base scoring. No external calls. Always succeeds.
     */
    runBaseScore(ctx: ScoringContext): BaseScoreResult {
        const { order, customer, items, recentOrders } = ctx;

        // 1. Blocked check
        const isBlocked = customer.status === 'Blocked' || customer.isBlocked === true;
        const blockedScore = isBlocked ? 10 : 0;

        // 2. Item count
        const totalItems = items.reduce((sum: number, item: any) => sum + item.quantity, 0);
        let itemScore = 0;
        if (totalItems === 2) itemScore = 1;
        else if (totalItems >= 3) itemScore = 2;

        // 3. Order value
        const totalAmount = Number(order.totalAmount || 0);
        const valueScore = totalAmount > 50 ? 2 : 0;

        // 4. Frequency
        const twelveHoursAgo = new Date();
        twelveHoursAgo.setHours(twelveHoursAgo.getHours() - 12);

        let frequencyScore = 0;
        if (recentOrders.length >= 2) {
            frequencyScore = 2;
        } else if (recentOrders.length === 1 && recentOrders[0].orderDate >= twelveHoursAgo) {
            frequencyScore = 2;
        }

        // 5. History
        const historyScore = (customer.successfulDeliveries || 0) > 0 ? -1 : 0;
        const isFirstOrder = (customer.ordersCount || 0) <= 1 && recentOrders.length === 0;

        // 6 & 7. Address regex scoring
        const { isValid: postalValid, hasHouseNumber } = this.validateAddress(
            order.shippingCity,
            order.shippingPostalCode,
            order.shippingAddressLine1,
            order.shippingCountry,
        );

        const addressFormatScore = postalValid ? 0 : 3;
        const missingHouseNumberScore = hasHouseNumber ? 0 : 1;

        // Sum all scores
        let totalScore =
            blockedScore +
            itemScore +
            valueScore +
            frequencyScore +
            historyScore +
            addressFormatScore +
            missingHouseNumberScore;

        // Floor at 0
        if (totalScore < 0) totalScore = 0;

        return {
            totalScore,
            isBlocked,
            isFirstOrder,
            recentOrderCount: recentOrders.length,
            factors: {
                blockedScore,
                itemScore,
                valueScore,
                frequencyScore,
                historyScore,
                addressFormatScore,
                missingHouseNumberScore,
                loqateSource: 'local_fallback',
                avc: null,
                hasHouseNumber,
            },
        };
    }

    /**
     * Layer 2 — Loqate enhancement. On any error, returns baseResult unchanged.
     */
    async applyLoqateRefinement(ctx: ScoringContext, baseResult: BaseScoreResult): Promise<BaseScoreResult> {
        // Skip if blocked — no need for address refinement
        if (baseResult.isBlocked) {
            return baseResult;
        }

        try {
            const fullAddress = [
                ctx.order.shippingAddressLine1,
                ctx.order.shippingCity,
                ctx.order.shippingProvince,
                ctx.order.shippingPostalCode,
            ]
                .filter(Boolean)
                .join(', ');

            const loqateResult: AddressVerifyResult = await this.addressVerifyService.verify(
                fullAddress,
                ctx.order.shippingCountry || '',
                baseResult.isBlocked,
            );

            // If local_fallback, base scores already match — no change needed
            if (loqateResult.source === 'local_fallback') {
                return baseResult;
            }

            // Override address scores with Loqate results (no double-counting)
            const oldAddressTotal = baseResult.factors.addressFormatScore + baseResult.factors.missingHouseNumberScore;
            const newAddressTotal = loqateResult.addressFormatScore + loqateResult.missingHouseNumberScore;

            let newTotalScore = baseResult.totalScore - oldAddressTotal + newAddressTotal;
            if (newTotalScore < 0) newTotalScore = 0;

            return {
                ...baseResult,
                totalScore: newTotalScore,
                factors: {
                    ...baseResult.factors,
                    addressFormatScore: loqateResult.addressFormatScore,
                    missingHouseNumberScore: loqateResult.missingHouseNumberScore,
                    hasHouseNumber: loqateResult.hasHouseNumber,
                    loqateSource: loqateResult.source,
                    avc: loqateResult.avc,
                },
            };
        } catch (error) {
            this.logger.error(`Loqate refinement failed: ${error.message}`);
            return baseResult;
        }
    }

    /**
     * Regex validation for postal codes and house numbers.
     */
    private validateAddress(city: string, zip: string, addressLine: string, country: string) {
        let isValidFormat = true;
        const cleanZip = (zip || '').trim();
        const cleanCountry = (country || '').trim().toLowerCase();

        if (cleanCountry === 'spain' || cleanCountry === 'es' || cleanCountry === 'españa') {
            const spainRegex = /^(0[1-9]|[1-4][0-9]|5[0-2])[0-9]{3}$/;
            isValidFormat = spainRegex.test(cleanZip);
        } else if (cleanCountry === 'italy' || cleanCountry === 'it' || cleanCountry === 'italia') {
            const italyRegex = /^[0-9]{5}$/;
            isValidFormat = italyRegex.test(cleanZip);
        }

        const hasHouseNumber = /\d/.test(addressLine || '');

        return { isValid: isValidFormat, hasHouseNumber };
    }

    /**
     * Pure decision function. Returns RiskLevel + action.
     */
    computeRiskLevel(score: number, isBlocked: boolean): { riskLevel: string; action: string } {
        if (isBlocked || score >= 10) {
            return { riskLevel: 'BLOCKED', action: 'auto_reject' };
        }
        if (score >= 4) {
            return { riskLevel: 'HIGH', action: 'call_center' };
        }
        if (score >= 2) {
            return { riskLevel: 'MEDIUM', action: 'twilio_long' };
        }
        return { riskLevel: 'LOW', action: 'twilio_short' };
    }

    /**
     * Persist the RiskAssessment row with all Loqate metadata.
     */
    private async persistAssessment(
        orderId: string,
        customerId: string,
        result: BaseScoreResult,
        riskLevel: string,
        action: string,
    ) {
        return this.prisma.riskAssessment.create({
            data: {
                orderId,
                customerId,
                totalScore: result.totalScore,
                riskLevel,
                action,
                factors: result.factors as any,
                cityZipMatch: result.factors.addressFormatScore === 0,
                hasHouseNumber: result.factors.hasHouseNumber,
                addressVerified: result.factors.addressFormatScore === 0 && result.factors.hasHouseNumber,
                isFirstOrder: result.isFirstOrder,
                isBlocked: result.isBlocked,
                recentOrderCount: result.recentOrderCount,
                addressFormatScore: result.factors.addressFormatScore,
                missingHouseNumberScore: result.factors.missingHouseNumberScore,
                loqateSource: result.factors.loqateSource,
                loqateAvc: result.factors.avc,
            },
        });
    }

    /**
     * Trigger the appropriate action based on risk level.
     */
    private async triggerAction(riskLevel: string, action: string, order: any) {
        try {
            if (riskLevel === 'BLOCKED') {
                this.logger.log(`Order ${order.id}: BLOCKED — auto-rejected.`);
                return;
            }

            const storeSettings = await this.prisma.storeSettings.findFirst({
                where: { storeName: order.storeName },
            });

            const isItaly =
                order.shippingAddress?.country?.toLowerCase() === 'italy' ||
                order.shippingAddress?.country?.toLowerCase() === 'it';

            const isTwilioEnabled = isItaly || storeSettings?.enableTwilioCalls === true;

            if (riskLevel === 'LOW') {
                if (isTwilioEnabled) {
                    this.logger.log(`Order ${order.id}: LOW risk — initiating short Twilio call.`);
                    await this.twilioVoiceService.initiateConfirmationCall(order.id, 'short');
                } else {
                    this.logger.log(
                        `Order ${order.id}: LOW risk — Twilio calls disabled for store ${order.storeName}. Skipping call.`,
                    );
                }
                return;
            }

            if (riskLevel === 'MEDIUM') {
                if (isTwilioEnabled) {
                    this.logger.log(`Order ${order.id}: MEDIUM risk — initiating long Twilio call.`);
                    await this.twilioVoiceService.initiateConfirmationCall(order.id, 'long');
                } else {
                    this.logger.log(
                        `Order ${order.id}: MEDIUM risk — Twilio calls disabled for store ${order.storeName}. Skipping call.`,
                    );
                }
                return;
            }

            if (riskLevel === 'HIGH') {
                this.logger.log(`Order ${order.id}: HIGH risk — forwarding to call center.`);
                const totalItems =
                    order.items?.reduce((sum: number, i: any) => sum + i.quantity, 0) || 0;
                const address = [
                    order.shippingAddressLine1,
                    order.shippingCity,
                    order.shippingProvince,
                    order.shippingPostalCode,
                ]
                    .filter(Boolean)
                    .join(', ');

                await this.googleSheetsService.addToCallCenterQueue({
                    orderId: order.id,
                    orderNumber: order.orderNumber,
                    customerName: order.customer?.name || 'Unknown',
                    customerPhone: order.customer?.phone || '',
                    address,
                    totalAmount: Number(order.totalAmount || 0),
                    itemCount: totalItems,
                    riskLevel,
                    riskScore: order.riskScore || 0,
                    reason: 'High risk order',
                    priority: 'URGENT',
                });
                return;
            }
        } catch (error) {
            this.logger.error(
                `Order ${order.id}: Failed to trigger action "${action}": ${error.message}`,
                error.stack,
            );
        }
    }
}
