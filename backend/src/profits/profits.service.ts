import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProfitsService {
    constructor(private prisma: PrismaService) { }

    /**
     * Calculates and saves profit metrics for an order.
     * Triggered when Order is CONFIRMED.
     */
    async calculateOrderProfit(orderId: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: {
                items: {
                    include: {
                        product: true,
                    }
                }
            }
        });

        if (!order) return;

        // 1. Calculate Revenue (Booked)
        // Formula: Sum(Item Price * Quantity)
        // Note: We use the price AT THE TIME OF ORDER (item.subtotal / item.quantity or item.unitPrice if stored)
        // OrderItem has unitPrice usually.
        // Schema check: OrderItem has unitPrice, subtotal.
        let revenue = 0;
        let cogs = 0;

        for (const item of order.items) {
            const quantity = item.quantity;
            const price = Number(item.unitPrice);
            const cost = Number(item.product?.unitCost) || 0;

            revenue += price * quantity;
            cogs += cost * quantity;
        }

        const shippingRevenue = Number(order.shippingFee) || 0;
        const totalRevenue = revenue + shippingRevenue;

        // Costs
        // Outbound Shipping Cost (Expense) is stored in fulfillmentCost or assumed 0 if not set
        const outboundShippingCost = Number(order.fulfillmentCost) || 0;

        // 2. Calculate Profit
        // Formula: Gross Profit = Revenue - COGS - Outbound Shipping
        const grossProfit = totalRevenue - cogs - outboundShippingCost;
        const netProfit = grossProfit; // Additional expenses can be subtracted here

        // Profit Margin
        const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
        const roiPercent = (cogs + outboundShippingCost) > 0 ? (netProfit / (cogs + outboundShippingCost)) * 100 : 0;

        // 3. Save to DB
        // Check if exists
        const existing = await this.prisma.profitCalculation.findFirst({
            where: { orderId: orderId }
        });

        const data = {
            orderId,
            revenue: totalRevenue,
            shippingRevenue,
            productCost: cogs,
            shippingCost: outboundShippingCost, // Storing Expense here in ProfitCalculation.shippingCost
            fulfillmentCost: 0,
            totalCosts: cogs + outboundShippingCost,
            grossProfit,
            netProfit,
            profitMargin,
            roiPercent,
            calculatedAt: new Date(),
        };

        if (existing) {
            await this.prisma.profitCalculation.update({
                where: { id: existing.id },
                data
            });
        } else {
            await this.prisma.profitCalculation.create({
                data
            });
        }

        console.log(`[Profits] Calculated for Order ${order.orderNumber}: Rev=${revenue}, Net=${netProfit}`);
    }

    /**
     * Records COD Collection.
     * Triggered when Order is DELIVERED.
     */
    async recordCollection(orderId: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: { items: true }
        });

        if (!order) return;

        // Formula: Sum(Item Price * Quantity) - same as Revenue for now
        // In reality, might differ if partial delivery, but user said "Order delivered = Price * Quantity"
        let collectedAmount = 0;
        for (const item of order.items) {
            collectedAmount += Number(item.unitPrice) * item.quantity;
        }

        // Update Order with collected amount
        await this.prisma.order.update({
            where: { id: orderId },
            data: {
                codCollectAmount: collectedAmount,
                codCollectedAt: new Date(),
                paymentStatus: 'Paid', // Assuming full payment
            }
        });

        console.log(`[Profits] Recorded Collection for Order ${order.orderNumber}: ${collectedAmount}`);
    }
}
