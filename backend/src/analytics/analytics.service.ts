
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
    constructor(private prisma: PrismaService) { }

    async getDashboardMetrics(startDate?: Date, endDate?: Date) {
        const dateFilter = startDate && endDate ? {
            createdAt: {
                gte: startDate,
                lte: endDate,
            },
        } : {};

        const profitDateFilter = startDate && endDate ? {
            order: {
                createdAt: {
                    gte: startDate,
                    lte: endDate,
                },
            },
        } : {};

        // 1. Total Revenue & Total Profit
        const profitStats = await this.prisma.profitCalculation.aggregate({
            _sum: {
                revenue: true,
                grossProfit: true,
                netProfit: true,
            },
            where: profitDateFilter,
        });

        console.log('ProfitStats Query Result:', profitStats);

        const totalRevenue = Number(profitStats._sum?.revenue) || 0;
        const totalProfit = Number(profitStats._sum?.netProfit) || 0;

        // 2. Return Rate
        // Formula: (Returned Items / Total Items Sold) * 100
        // OR (Returned Orders / Total Orders) * 100? Let's stick to simple "Returns count" for now or use the pre-calculated one if available.
        // Better: Query OrderItems where returnStatus is not null vs total items.

        // Let's use Order-level status for simplicity first.
        const totalOrders = await this.prisma.order.count({
            where: dateFilter,
        });
        const returnedOrders = await this.prisma.order.count({
            where: {
                orderStatus: { in: ['Returned', 'Refunded'] },
                ...dateFilter,
            },
        });

        const returnRate = totalOrders > 0 ? (returnedOrders / totalOrders) * 100 : 0;

        // 3. Market Share (Revenue by Country)
        // We need to group by order.shippingCountry and sum the revenue.
        // Since ProfitCalculation has orderId, we can join.
        // Prisma grouping with relation is tricky. Let's fetch Orders with totals.
        const ordersByCountry = await this.prisma.order.groupBy({
            by: ['shippingCountry'],
            _sum: {
                totalAmount: true,
            },
            where: {
                orderStatus: { not: 'Cancelled' }, // Exclude cancelled
                ...dateFilter,
            },
        });
        console.log('OrdersByCountry result:', ordersByCountry);

        const countryData = ordersByCountry.map(item => ({
            name: item.shippingCountry || 'Unknown',
            value: Number(item._sum.totalAmount) || 0,
            // Assign random color or map specific ones in frontend
        })).sort((a, b) => b.value - a.value).slice(0, 5); // Top 5

        // 4. Top Moving SKUs
        // Group OrderItem by sku/productName
        const topProducts = await this.prisma.orderItem.groupBy({
            by: ['sku', 'productName'],
            _sum: {
                quantity: true,
                subtotal: true, // Revenue
            },
            where: dateFilter,
            orderBy: {
                _sum: { subtotal: 'desc' },
            },
            take: 5,
        });
        console.log('TopProducts result:', topProducts);

        // We also need Returns for these products to calculate "Efficiency" (Return Rate per product)
        // This is expensive to do in one query. We'll do a separate count for returns per SKU.
        const productsPerf = await Promise.all(topProducts.map(async (p) => {
            const sold = Number(p._sum.quantity) || 0;
            const revenue = Number(p._sum.subtotal) || 0;

            // Count returns for this SKU
            // Assuming OrderItem has returnQuantity or we look at returnStatus
            // Schema: OrderItem has returnQuantity?
            // Let's check schema... yes: returnQuantity Int? @default(0)

            // Let's fetch aggregate return quantity
            const returnStats = await this.prisma.orderItem.aggregate({
                _sum: {
                    returnQuantity: true,
                },
                where: {
                    sku: p.sku,
                    ...dateFilter,
                },
            });

            const returned = Number(returnStats._sum.returnQuantity) || 0;
            const returnRate = sold > 0 ? (returned / sold) * 100 : 0;

            // Estimate profit (simplified: 30% margin if not calculated, or join with ProfitCalculation via Order... too complex for now)
            // Let's assume a margin or fetch unitCost if possible.
            // For dashboard speed, let's just estimate profit as 30% of revenue for now unless we have exact cost.
            // Wait, we have access to Product table via SKU.
            const product = await this.prisma.product.findUnique({
                where: { sku: p.sku },
                select: { unitCost: true }
            });

            const cost = Number(product?.unitCost) || 0;
            const profit = revenue - (cost * sold);

            return {
                name: p.productName,
                sku: p.sku,
                revenue,
                profit,
                returns: `${returnRate.toFixed(1)}%`,
            };
        }));

        return {
            metrics: [
                { label: 'Total Revenue', value: `$${totalRevenue.toLocaleString()}`, trend: '+12%', icon: 'payments', color: 'primary', border: 'border-l-primary' },
                { label: 'Return Rate', value: `${returnRate.toFixed(1)}%`, trend: '-0.5%', icon: 'assignment_return', color: 'red-500', border: 'border-l-red-500' },
                { label: 'Total Profit', value: `$${totalProfit.toLocaleString()}`, trend: '+8%', icon: 'account_balance', color: 'emerald-500', border: 'border-l-emerald-500' },
            ],
            countryData,
            productPerformance: productsPerf,
        };
    }
}
