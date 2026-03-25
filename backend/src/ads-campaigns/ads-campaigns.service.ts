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

        // Resolve orderNumber(s) → semicolon-separated order numbers
        let orderIds: string | null = null;
        if (dto.orderNumber) {
            // Support semicolon-separated order numbers
            const nums = dto.orderNumber.split(';').map(s => s.trim()).filter(Boolean);
            const matched: string[] = [];
            for (const num of nums) {
                const order = await this.prisma.order.findUnique({
                    where: { orderNumber: num },
                    select: { orderNumber: true },
                });
                if (order) matched.push(order.orderNumber);
            }
            if (matched.length > 0) orderIds = matched.join(';');
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
                orderIds,
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

        // Batch-resolve all orderNumbers → validated order numbers
        // Each record's orderNumber may contain semicolon-separated values
        const allOrderNums = new Set<string>();
        for (const r of records) {
            if (r.orderNumber) {
                for (const num of r.orderNumber.split(';').map(s => s.trim()).filter(Boolean)) {
                    allOrderNums.add(num);
                }
            }
        }

        const matchedOrderNums = new Set<string>();
        const unresolvedOrderNumbers: string[] = [];

        if (allOrderNums.size > 0) {
            const orders = await this.prisma.order.findMany({
                where: { orderNumber: { in: [...allOrderNums] } },
                select: { orderNumber: true },
            });
            for (const order of orders) {
                matchedOrderNums.add(order.orderNumber);
            }
            for (const num of allOrderNums) {
                if (!matchedOrderNums.has(num)) unresolvedOrderNumbers.push(num);
            }
        }

        // Helper: parse date strings that may be Excel serial numbers, DD/MM/YYYY, or YYYY-MM-DD
        const parseDate = (val: any): Date | null => {
            if (!val && val !== 0) return null;
            const s = String(val).trim();
            if (!s) return null;

            // Detect pure numeric → Excel date serial number (e.g. 46100 → 2026-03-19)
            if (/^\d{4,6}$/.test(s)) {
                const serial = parseInt(s, 10);
                const d = new Date((serial - 25569) * 86400 * 1000);
                if (!isNaN(d.getTime()) && d.getFullYear() >= 1900 && d.getFullYear() <= 2100) {
                    return d;
                }
            }

            // Handle DD/MM/YYYY format
            const slashParts = s.split('/');
            if (slashParts.length === 3) {
                const iso = `${slashParts[2]}-${slashParts[1].padStart(2, '0')}-${slashParts[0].padStart(2, '0')}`;
                const d = new Date(iso);
                if (!isNaN(d.getTime()) && d.getFullYear() >= 1900 && d.getFullYear() <= 2100) {
                    return d;
                }
            }

            // Standard ISO parse (YYYY-MM-DD or full ISO string)
            const d = new Date(s);
            if (!isNaN(d.getTime()) && d.getFullYear() >= 1900 && d.getFullYear() <= 2100) {
                return d;
            }

            return null;
        };

        const data = records.map(r => {
            let orderIds: string | null = null;
            if (r.orderNumber) {
                const nums = r.orderNumber.split(';').map(s => s.trim()).filter(Boolean);
                const matched = nums.filter(n => matchedOrderNums.has(n));
                if (matched.length > 0) orderIds = matched.join(';');
            }

            // Parse and validate date
            const parsedDate = parseDate(r.date);
            if (!parsedDate) {
                throw new BadRequestException(
                    `Invalid date "${r.date}" in campaign "${r.campaign}". Expected YYYY-MM-DD format.`,
                );
            }

            return {
                date: parsedDate,
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
                reportStart: parseDate(r.reportStart),
                reportEnd: parseDate(r.reportEnd),
                orderIds,
            };
        });

        try {
            const result = await this.prisma.adsCampaign.createMany({ data });
            return {
                created: result.count,
                orderMatchedCount: matchedOrderNums.size,
                unresolvedOrderNumbers,
            };
        } catch (err: any) {
            console.error('bulkCreate error:', err?.message || err);
            console.error('First record data:', JSON.stringify(data[0], null, 2));
            throw new BadRequestException(
                `Failed to save records: ${err?.message || 'Unknown database error'}`,
            );
        }
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

    async bulkDelete(ids: string[]) {
        if (!ids || ids.length === 0) {
            throw new BadRequestException('No IDs provided for deletion.');
        }
        const result = await this.prisma.adsCampaign.deleteMany({
            where: { id: { in: ids } },
        });
        return { deleted: result.count };
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

        // 3. Collect all order numbers from campaign order_ids AND unique SKUs
        const allOrderNumbers = new Set<string>();
        for (const c of campaigns) {
            if (c.orderIds) {
                for (const num of c.orderIds.split(';').map(s => s.trim()).filter(Boolean)) {
                    allOrderNumbers.add(num);
                }
            }
        }
        const skus: string[] = [...new Set(campaigns.map(c => c.sku).filter((s): s is string => !!s))];

        // 4. Fetch orders by order_ids (direct match)
        let ordersByNumber = new Map<string, { orderNumber: string; confirmationStatus: string | null; orderStatus: string | null; totalAmount: any }>();
        if (allOrderNumbers.size > 0) {
            const orders = await this.prisma.order.findMany({
                where: { orderNumber: { in: [...allOrderNumbers] } },
                select: { orderNumber: true, confirmationStatus: true, orderStatus: true, totalAmount: true },
            });
            for (const o of orders) {
                ordersByNumber.set(o.orderNumber, o);
            }
        }

        // 5. Also fetch orders by SKU for campaigns without order_ids (fallback)
        const allDates = campaigns.map(c => c.date);
        const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
        const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
        maxDate.setHours(23, 59, 59, 999);

        const skuLeads: Record<string, number> = {};
        const skuConfirmedLeads: Record<string, number> = {};
        const skuOrders: Record<string, number> = {};
        const skuRevenue: Record<string, number> = {};

        if (skus.length > 0) {
            // Fetch ALL orders matching SKUs in date range (leads = any matched order)
            const allSkuOrders = await this.prisma.order.findMany({
                where: {
                    orderDate: { gte: minDate, lte: maxDate },
                    items: { some: { sku: { in: skus } } },
                },
                include: { items: { select: { sku: true } } },
            });

            for (const order of allSkuOrders) {
                for (const sku of new Set(order.items.map(i => i.sku))) {
                    if (skus.includes(sku)) {
                        // Leads = all matched orders
                        skuLeads[sku] = (skuLeads[sku] || 0) + 1;
                        // Confirmed leads = orders with confirmationStatus 'Confirmed'
                        if (order.confirmationStatus === 'Confirmed') {
                            skuConfirmedLeads[sku] = (skuConfirmedLeads[sku] || 0) + 1;
                        }
                        // Orders & revenue = Delivered orders only
                        if (order.orderStatus === 'Delivered') {
                            skuOrders[sku] = (skuOrders[sku] || 0) + 1;
                            skuRevenue[sku] = (skuRevenue[sku] || 0) + Number(order.totalAmount);
                        }
                    }
                }
            }
        }

        // 6. Enrich campaigns — prefer order_ids-based metrics, fallback to SKU-based
        const enriched = campaigns.map(c => {
            const dateStr = c.date.toISOString().split('T')[0];
            const rate = rateMap.get(dateStr) || defaultRate;
            const spendEur = Number(c.spendVnd) * rate;

            let leads = 0;
            let confirmedLeads = 0;
            let orders = 0;
            let revenue = 0;
            const matchedOrderDetails: { orderNumber: string; confirmationStatus: string | null; orderStatus: string | null; totalAmount: number }[] = [];

            if (c.orderIds) {
                // Use direct order_ids matching
                const nums = c.orderIds.split(';').map(s => s.trim()).filter(Boolean);
                for (const num of nums) {
                    const order = ordersByNumber.get(num);
                    if (order) {
                        leads++;  // Any matched order = a lead
                        matchedOrderDetails.push({
                            orderNumber: order.orderNumber,
                            confirmationStatus: order.confirmationStatus,
                            orderStatus: order.orderStatus,
                            totalAmount: Number(order.totalAmount) || 0,
                        });
                        if (order.confirmationStatus === 'Confirmed') confirmedLeads++;
                        if (order.orderStatus === 'Delivered') {
                            orders++;
                            revenue += Number(order.totalAmount) || 0;
                        }
                    }
                }
            } else if (c.sku) {
                // Fallback: SKU-based matching
                leads = skuLeads[c.sku] || 0;
                confirmedLeads = skuConfirmedLeads[c.sku] || 0;
                orders = skuOrders[c.sku] || 0;
                revenue = skuRevenue[c.sku] || 0;
            }

            const roas = spendEur > 0 ? revenue / spendEur : 0;
            const cpo = orders > 0 ? spendEur / orders : 0;
            const cpl = leads > 0 ? spendEur / leads : 0;
            const cvr = leads > 0 ? (orders / leads) * 100 : 0;

            return {
                ...c,
                spendVnd: Number(c.spendVnd),
                spendEur: Math.round(spendEur * 100) / 100,
                leads,
                confirmedLeads,
                orders,
                revenueEur: Math.round(revenue * 100) / 100,
                roas: Math.round(roas * 100) / 100,
                cpo: Math.round(cpo * 100) / 100,
                cpl: Math.round(cpl * 100) / 100,
                cvr: Math.round(cvr * 100) / 100,
                matchedOrderDetails,
            };
        });

        // 7. Aggregate KPIs
        const totalSpendVnd = enriched.reduce((s, c) => s + c.spendVnd, 0);
        const totalSpendEur = enriched.reduce((s, c) => s + c.spendEur, 0);
        const totalRevenue = enriched.reduce((s, c) => s + c.revenueEur, 0);
        const totalLeads = enriched.reduce((s, c) => s + c.leads, 0);
        const totalConfirmedLeads = enriched.reduce((s, c) => s + c.confirmedLeads, 0);
        const totalOrders = enriched.reduce((s, c) => s + c.orders, 0);

        const kpis = {
            totalSpendVnd: Math.round(totalSpendVnd),
            totalSpendEur: Math.round(totalSpendEur * 100) / 100,
            totalRevenue: Math.round(totalRevenue * 100) / 100,
            totalLeads,
            totalConfirmedLeads,
            totalOrders,
            roas: totalSpendEur > 0 ? Math.round((totalRevenue / totalSpendEur) * 100) / 100 : 0,
            cpo: totalOrders > 0 ? Math.round((totalSpendEur / totalOrders) * 100) / 100 : 0,
            cpl: totalLeads > 0 ? Math.round((totalSpendEur / totalLeads) * 100) / 100 : 0,
            cvr: totalLeads > 0 ? Math.round((totalOrders / totalLeads) * 10000) / 100 : 0,
        };

        // 8. Chart data: group by date
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
