import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAdsCampaignDto, UpdateAdsCampaignDto } from './dto/ads-campaign.dto';

@Injectable()
export class AdsCampaignsService {
    constructor(private prisma: PrismaService) { }

    // ─── CRUD ────────────────────────────────────────────────────────────

    async findAll(filters?: {
        country?: string;
        stage?: string;
        sku?: string;
        startDate?: string;
        endDate?: string;
    }) {
        const where: any = {};
        if (filters?.country) where.country = filters.country;
        if (filters?.stage) where.stage = filters.stage;
        if (filters?.sku) where.sku = filters.sku;
        if (filters?.startDate || filters?.endDate) {
            where.date = {};
            if (filters.startDate) where.date.gte = new Date(filters.startDate);
            if (filters.endDate) where.date.lte = new Date(filters.endDate);
        }

        return this.prisma.adsCampaign.findMany({
            where,
            orderBy: { date: 'desc' },
        });
    }

    async findOne(id: string) {
        const record = await this.prisma.adsCampaign.findUnique({ where: { id } });
        if (!record) throw new NotFoundException('Campaign record not found');
        return record;
    }

    async create(dto: CreateAdsCampaignDto) {
        if (dto.sku) await this.validateSku(dto.sku);

        // Resolve orderNumber → order_id
        let orderId: string | undefined;
        if (dto.orderNumber) {
            const order = await this.prisma.order.findUnique({
                where: { orderNumber: dto.orderNumber },
                select: { id: true },
            });
            if (order) orderId = order.id;
        }

        return this.prisma.adsCampaign.create({
            data: {
                date: new Date(dto.date),
                campaign: dto.campaign,
                country: dto.country,
                platform: dto.platform,
                sku: dto.sku || '',
                stage: dto.stage,
                pic: dto.pic,
                spendVnd: dto.spendVnd,
                notes: dto.notes,
                source: dto.source || 'manual',
                adName: dto.adName,
                adSetName: dto.adSetName,
                cpc: dto.cpc,
                cpm: dto.cpm,
                ctr: dto.ctr,
                resultType: dto.resultType,
                costPerResult: dto.costPerResult,
                metaPurchases: dto.metaPurchases,
                reportStart: dto.reportStart ? new Date(dto.reportStart) : null,
                reportEnd: dto.reportEnd ? new Date(dto.reportEnd) : null,
                orderId,
            },
        });
    }

    async bulkCreate(records: CreateAdsCampaignDto[]) {
        // Validate only non-empty SKUs
        const skus = [...new Set(records.map(r => r.sku).filter((s): s is string => !!s))];
        if (skus.length > 0) {
            const existingProducts = await this.prisma.product.findMany({
                where: { sku: { in: skus } },
                select: { sku: true },
            });
            const existingSkus = new Set(existingProducts.map(p => p.sku));
            const invalidSkus = skus.filter(s => !existingSkus.has(s));

            if (invalidSkus.length > 0) {
                throw new BadRequestException(
                    `Unknown SKUs: ${invalidSkus.join(', ')}. These must exist in the Products table.`,
                );
            }
        }

        // Batch-resolve all orderNumbers → order UUIDs
        const orderNumbers = [...new Set(records.map(r => r.orderNumber).filter((n): n is string => !!n))];
        const orderMap = new Map<string, string>(); // orderNumber → order.id
        const unresolvedOrderNumbers: string[] = [];

        if (orderNumbers.length > 0) {
            const orders = await this.prisma.order.findMany({
                where: { orderNumber: { in: orderNumbers } },
                select: { id: true, orderNumber: true },
            });
            for (const order of orders) {
                orderMap.set(order.orderNumber, order.id);
            }
            for (const num of orderNumbers) {
                if (!orderMap.has(num)) unresolvedOrderNumbers.push(num);
            }
        }

        const data = records.map(r => ({
            date: new Date(r.date),
            campaign: r.campaign,
            country: r.country,
            platform: r.platform,
            sku: r.sku || '',
            stage: r.stage,
            pic: r.pic,
            spendVnd: r.spendVnd,
            notes: r.notes,
            source: r.source || 'upload',
            adName: r.adName,
            adSetName: r.adSetName,
            cpc: r.cpc,
            cpm: r.cpm,
            ctr: r.ctr,
            resultType: r.resultType,
            costPerResult: r.costPerResult,
            metaPurchases: r.metaPurchases,
            reportStart: r.reportStart ? new Date(r.reportStart) : null,
            reportEnd: r.reportEnd ? new Date(r.reportEnd) : null,
            orderId: r.orderNumber ? (orderMap.get(r.orderNumber) || null) : null,
        }));

        const result = await this.prisma.adsCampaign.createMany({ data });
        return {
            created: result.count,
            orderMatchedCount: orderMap.size,
            unresolvedOrderNumbers,
        };
    }

    async update(id: string, dto: UpdateAdsCampaignDto, changedBy?: string) {
        const existing = await this.findOne(id);
        if (dto.sku) await this.validateSku(dto.sku);

        // Build change log entries
        const changes: { fieldName: string; oldValue: string; newValue: string }[] = [];
        const fieldsToTrack: (keyof UpdateAdsCampaignDto)[] = ['date', 'campaign', 'country', 'platform', 'sku', 'stage', 'pic', 'spendVnd', 'notes'];

        for (const field of fieldsToTrack) {
            if (dto[field] !== undefined) {
                const oldVal = String((existing as any)[field] ?? '');
                const newVal = String(dto[field] ?? '');
                if (oldVal !== newVal) {
                    changes.push({ fieldName: field, oldValue: oldVal, newValue: newVal });
                }
            }
        }

        // Update the record
        const updateData: any = { ...dto };
        if (dto.date) updateData.date = new Date(dto.date);

        const updated = await this.prisma.adsCampaign.update({
            where: { id },
            data: updateData,
        });

        // Write change logs
        if (changes.length > 0) {
            await this.prisma.adsCampaignChangeLog.createMany({
                data: changes.map(c => ({
                    adsCampaignId: id,
                    fieldName: c.fieldName,
                    oldValue: c.oldValue,
                    newValue: c.newValue,
                    changedBy: changedBy || 'system',
                })),
            });
        }

        return { updated, changes };
    }

    async remove(id: string) {
        await this.findOne(id);
        return this.prisma.adsCampaign.delete({ where: { id } });
    }

    async getChangeLog(id: string) {
        return this.prisma.adsCampaignChangeLog.findMany({
            where: { adsCampaignId: id },
            orderBy: { createdAt: 'desc' },
        });
    }

    // ─── DASHBOARD ───────────────────────────────────────────────────────

    async getDashboard(filters?: {
        country?: string;
        stage?: string;
        sku?: string;
        startDate?: string;
        endDate?: string;
    }) {
        // 1. Get filtered campaigns
        const campaigns = await this.findAll(filters);
        if (campaigns.length === 0) {
            return {
                kpis: { totalSpendVnd: 0, totalSpendEur: 0, totalRevenue: 0, totalLeads: 0, totalOrders: 0, roas: 0, cpo: 0, cpl: 0, cvr: 0 },
                campaigns: [],
                chartData: [],
            };
        }

        // 2. Get exchange rates for all campaign dates
        const dateStrings = [...new Set(campaigns.map(c => c.date.toISOString().split('T')[0]))];
        const rates = await this.prisma.exchangeRate.findMany({
            where: { date: { in: dateStrings.map(d => new Date(d)) } },
        });
        const rateMap = new Map<string, number>(rates.map(r => [r.date.toISOString().split('T')[0], Number(r.vndToEur)]));

        // Default fallback rate
        const defaultRate = rates.length > 0
            ? Number(rates[rates.length - 1].vndToEur)
            : 0.0000370;

        // 3. Get unique SKUs from campaigns (filter out nulls)
        const skus: string[] = [...new Set(campaigns.map(c => c.sku).filter((s): s is string => !!s))];

        // 4. Build date range for orders query
        const allDates = campaigns.map(c => c.date);
        const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
        const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
        maxDate.setHours(23, 59, 59, 999);

        // 5. Count Leads: orders with confirmationStatus = 'Confirmed', matched by SKU
        const confirmedOrders = await this.prisma.order.findMany({
            where: {
                confirmationStatus: 'Confirmed',
                orderDate: { gte: minDate, lte: maxDate },
                items: { some: { sku: { in: skus } } },
            },
            include: { items: { select: { sku: true } } },
        });

        // 6. Count Orders + Revenue: orders with orderStatus = 'Delivered', matched by SKU
        const deliveredOrders = await this.prisma.order.findMany({
            where: {
                orderStatus: 'Delivered',
                orderDate: { gte: minDate, lte: maxDate },
                items: { some: { sku: { in: skus } } },
            },
            include: { items: { select: { sku: true } } },
        });

        // 7. Build per-SKU metrics
        const skuLeads: Record<string, number> = {};
        const skuOrders: Record<string, number> = {};
        const skuRevenue: Record<string, number> = {};

        for (const order of confirmedOrders) {
            const orderSkus = new Set(order.items.map(i => i.sku));
            for (const sku of orderSkus) {
                if (skus.includes(sku)) {
                    skuLeads[sku] = (skuLeads[sku] || 0) + 1;
                }
            }
        }

        for (const order of deliveredOrders) {
            const orderSkus = new Set(order.items.map(i => i.sku));
            for (const sku of orderSkus) {
                if (skus.includes(sku)) {
                    skuOrders[sku] = (skuOrders[sku] || 0) + 1;
                    skuRevenue[sku] = (skuRevenue[sku] || 0) + Number(order.totalAmount);
                }
            }
        }

        // 8. Enrich campaigns with computed fields
        const enriched = campaigns.map(c => {
            const dateStr = c.date.toISOString().split('T')[0];
            const rate = rateMap.get(dateStr) || defaultRate;
            const spendEur = Number(c.spendVnd) * rate;
            const leads = c.sku ? (skuLeads[c.sku] || 0) : 0;
            const orders = c.sku ? (skuOrders[c.sku] || 0) : 0;
            const revenue = c.sku ? (skuRevenue[c.sku] || 0) : 0;
            const roas = spendEur > 0 ? revenue / spendEur : 0;
            const cpo = orders > 0 ? spendEur / orders : 0;
            const cpl = leads > 0 ? spendEur / leads : 0;
            const cvr = leads > 0 ? (orders / leads) * 100 : 0;

            return {
                ...c,
                spendVnd: Number(c.spendVnd),
                spendEur: Math.round(spendEur * 100) / 100,
                leads,
                orders,
                revenueEur: Math.round(revenue * 100) / 100,
                roas: Math.round(roas * 100) / 100,
                cpo: Math.round(cpo * 100) / 100,
                cpl: Math.round(cpl * 100) / 100,
                cvr: Math.round(cvr * 100) / 100,
            };
        });

        // 9. Aggregate KPIs
        const totalSpendVnd = enriched.reduce((s, c) => s + c.spendVnd, 0);
        const totalSpendEur = enriched.reduce((s, c) => s + c.spendEur, 0);
        const totalRevenue = enriched.reduce((s, c) => s + c.revenueEur, 0);
        const totalLeads = enriched.reduce((s, c) => s + c.leads, 0);
        const totalOrders = enriched.reduce((s, c) => s + c.orders, 0);

        const kpis = {
            totalSpendVnd: Math.round(totalSpendVnd),
            totalSpendEur: Math.round(totalSpendEur * 100) / 100,
            totalRevenue: Math.round(totalRevenue * 100) / 100,
            totalLeads,
            totalOrders,
            roas: totalSpendEur > 0 ? Math.round((totalRevenue / totalSpendEur) * 100) / 100 : 0,
            cpo: totalOrders > 0 ? Math.round((totalSpendEur / totalOrders) * 100) / 100 : 0,
            cpl: totalLeads > 0 ? Math.round((totalSpendEur / totalLeads) * 100) / 100 : 0,
            cvr: totalLeads > 0 ? Math.round((totalOrders / totalLeads) * 10000) / 100 : 0,
        };

        // 10. Chart data: group by date
        const dateMap = new Map<string, { spendEur: number; revenue: number; leads: number; orders: number }>();
        for (const c of enriched) {
            const dateStr = c.date.toISOString().split('T')[0];
            const existing = dateMap.get(dateStr) || { spendEur: 0, revenue: 0, leads: 0, orders: 0 };
            existing.spendEur += c.spendEur;
            existing.revenue += c.revenueEur;
            existing.leads += c.leads;
            existing.orders += c.orders;
            dateMap.set(dateStr, existing);
        }
        const chartData = Array.from(dateMap.entries())
            .map(([date, data]) => ({ date, ...data }))
            .sort((a, b) => a.date.localeCompare(b.date));

        return { kpis, campaigns: enriched, chartData };
    }

    // ─── HELPERS ─────────────────────────────────────────────────────────

    private async validateSku(sku: string) {
        const product = await this.prisma.product.findUnique({ where: { sku } });
        if (!product) {
            throw new BadRequestException(`SKU "${sku}" does not exist in the Products table.`);
        }
        return product;
    }
}
