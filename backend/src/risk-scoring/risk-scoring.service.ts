import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TwilioVoiceService } from '../twilio-voice/twilio-voice.service';
import { GoogleSheetsService } from '../google-sheets/google-sheets.service';

@Injectable()
export class RiskScoringService {
    private readonly logger = new Logger(RiskScoringService.name);

    constructor(
        private readonly prisma: PrismaService,
        @Inject(forwardRef(() => TwilioVoiceService)) private readonly twilioVoiceService: TwilioVoiceService,
        @Inject(forwardRef(() => GoogleSheetsService)) private readonly googleSheetsService: GoogleSheetsService,
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
            }
        });

        if (!order) {
            throw new Error(`Order ${orderId} not found for risk assessment.`);
        }

        const customer = order.customer;
        if (!customer) {
            throw new Error(`Order ${orderId} has no customer linked.`);
        }

        // 1. Calculate Score
        const assessment = await this.calculateScore(order, customer);

        // 2. Assign Risk Level & Action
        const { riskLevel, action } = this.determineRiskLevel(assessment.totalScore, assessment.isBlocked);

        // 3. Save to Database
        const savedAssessment = await this.prisma.riskAssessment.create({
            data: {
                orderId: order.id,
                customerId: customer.id,
                totalScore: assessment.totalScore,
                riskLevel: riskLevel,
                action: action,
                factors: assessment.factors as any,
                cityZipMatch: assessment.cityZipMatch,
                hasHouseNumber: assessment.hasHouseNumber,
                addressVerified: assessment.addressVerified,
                isFirstOrder: assessment.isFirstOrder,
                isBlocked: assessment.isBlocked,
                recentOrderCount: assessment.recentOrderCount,
            }
        });

        // 4. Update Order with Risk Info
        await this.prisma.order.update({
            where: { id: order.id },
            data: {
                riskScore: assessment.totalScore,
                riskLevel: riskLevel,
                riskAction: action,
                riskAssessedAt: new Date(),
                // Auto-reject if blocked
                ...(assessment.isBlocked ? { orderStatus: 'Cancelled', internalNotes: 'Auto-rejected due to BLOCKED customer/risk policy.' } : {})
            }
        });

        this.logger.log(`Order ${orderId} assessed as ${riskLevel} (${assessment.totalScore} pts). Action: ${action}`);

        // 5. Trigger automated action based on risk level
        await this.triggerAction(riskLevel, action, order);

        return savedAssessment;
    }

    /**
     * Performs the point calculation based on rules.
     */
    private async calculateScore(order: any, customer: any) {
        let totalScore = 0;
        const factors: Record<string, number> = {};

        // Blocked Check (Highest Priority)
        const isBlocked = customer.status === 'Blocked' || customer.isBlocked === true;
        if (isBlocked) {
            totalScore += 10;
            factors['blocked'] = 10;
        }

        // Items Count
        const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);
        let itemsScore = 0;
        if (totalItems === 2) itemsScore = 1;
        else if (totalItems >= 3) itemsScore = 2;
        totalScore += itemsScore;
        factors['items'] = itemsScore;

        // Order Value
        const totalAmount = Number(order.totalAmount || 0);
        let valueScore = 0;
        if (totalAmount > 50) valueScore = 2;
        totalScore += valueScore;
        factors['orderValue'] = valueScore;

        // Frequency
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const twelveHoursAgo = new Date();
        twelveHoursAgo.setHours(twelveHoursAgo.getHours() - 12);

        const recentOrders = await this.prisma.order.findMany({
            where: {
                customerId: customer.id,
                id: { not: order.id },
                orderDate: { gte: sevenDaysAgo }
            },
            orderBy: { orderDate: 'desc' }
        });

        let frequencyScore = 0;
        if (recentOrders.length >= 2) {
            frequencyScore = 2;
        } else if (recentOrders.length === 1 && recentOrders[0].orderDate >= twelveHoursAgo) {
            frequencyScore = 2; // < 12 hours since last order
        }
        totalScore += frequencyScore;
        factors['frequency'] = frequencyScore;

        // Customer History
        let historyScore = 0;
        const isFirstOrder = (customer.ordersCount || 0) <= 1 && recentOrders.length === 0;
        if ((customer.successfulDeliveries || 0) > 0) {
            historyScore = -1;
        }
        totalScore += historyScore;
        factors['history'] = historyScore;

        // Address Validation (Spain/Italy regex)
        const { isValid, hasHouseNumber } = this.validateAddress(
            order.shippingCity,
            order.shippingPostalCode,
            order.shippingAddressLine1,
            order.shippingCountry
        );

        let addressScore = 0;
        if (!isValid) {
            addressScore = 3;
        }
        totalScore += addressScore;
        factors['address'] = addressScore;

        // Prevent negative total scores
        if (totalScore < 0) totalScore = 0;

        return {
            totalScore,
            factors,
            cityZipMatch: isValid,
            hasHouseNumber: hasHouseNumber,
            addressVerified: isValid && hasHouseNumber,
            isFirstOrder,
            isBlocked,
            recentOrderCount: recentOrders.length
        };
    }

    /**
     * "Best effort" Regex/Pattern Match for Spain and Italy
     * Spain: 5 digits, starts with 01-52
     * Italy: 5 digits
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

        // Check for house number (looks for at least one digit in the address line)
        const hasHouseNumber = /\d/.test(addressLine || '');

        return {
            isValid: isValidFormat,
            hasHouseNumber
        };
    }

    /**
     * Translates point score into Risk Level
     */
    private determineRiskLevel(score: number, isBlocked: boolean) {
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
     * Trigger the appropriate action based on risk level.
     */
    private async triggerAction(riskLevel: string, action: string, order: any) {
        try {
            if (riskLevel === 'BLOCKED') {
                this.logger.log(`Order ${order.id}: BLOCKED — auto-rejected.`);
                return;
            }

            if (riskLevel === 'LOW') {
                this.logger.log(`Order ${order.id}: LOW risk — initiating short Twilio call.`);
                await this.twilioVoiceService.initiateConfirmationCall(order.id, 'short');
                return;
            }

            if (riskLevel === 'MEDIUM') {
                this.logger.log(`Order ${order.id}: MEDIUM risk — initiating long Twilio call.`);
                await this.twilioVoiceService.initiateConfirmationCall(order.id, 'long');
                return;
            }

            if (riskLevel === 'HIGH') {
                this.logger.log(`Order ${order.id}: HIGH risk — forwarding to call center.`);
                const totalItems = order.items?.reduce((sum: number, i: any) => sum + i.quantity, 0) || 0;
                const address = [order.shippingAddressLine1, order.shippingCity, order.shippingProvince, order.shippingPostalCode].filter(Boolean).join(', ');

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
            this.logger.error(`Order ${order.id}: Failed to trigger action "${action}": ${error.message}`, error.stack);
        }
    }
}
