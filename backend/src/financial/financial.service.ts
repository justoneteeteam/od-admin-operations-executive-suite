import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFinancialRecordDto, UpdateFinancialRecordDto } from './dto/create-financial-record.dto';
import * as XLSX from 'xlsx';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse');

export interface ParsedPerOrderRow {
    store: string;
    orderNumber: string;
    concept: string;
    weightKg: number;
    shippingEur: number;
    fulfillmentEur: number;
    codEur: number;
    totalEur: number;
    expenseEur: number;
    description: string;
    orderId: string | null;
    market: string | null;
    fulfillmentCenterId: string | null;
    matched: boolean;
    amountVnd: number | null;
}

export interface ParsedMonthlyRow {
    shop: string;
    orders: number;
    totalEur: number;
    expenseEur: number;
    description: string;
    amountVnd: number | null;
}

export interface FfeuInvoiceHeader {
    invoiceNumber: string;
    dateFrom: string;
    dateTo: string;
    numberOfOrders: number;
    totalDue: number;
    bankName: string;
    bankNumber: string;
    country: string;
    taxNumber: string;
    subtotalFees: number;
    vat: number;
    totalFees: number;
    totalOrders: number;
}

export interface FfeuFeeRow {
    item: string;
    total: number | null;  // quantity / count
    amountEur: number;
    category: string;      // CALL CENTER FEES | SHIPPING FEES | FULFILLEMENT | ORDERS
    description: string;
}

@Injectable()
export class FinancialService {
    private readonly logger = new Logger(FinancialService.name);

    constructor(private prisma: PrismaService) {}

    // ═══════════════════════════════════════════════════════════════
    // XLSX UPLOAD & PARSE
    // ═══════════════════════════════════════════════════════════════

    async uploadPerOrderInvoice(
        fileBuffer: Buffer,
        filename: string,
        fulfillmentCenterId: string,
        periodMonth?: string,
        uploadedBy?: string,
    ) {
        // Guard against malformed files
        if (!fileBuffer || fileBuffer.length === 0) {
            throw new BadRequestException('Uploaded file is empty');
        }
        const rawRows = this._parseInvoice(fileBuffer);
        if (!rawRows.length) {
            throw new BadRequestException('XLSX file is empty or has no data rows');
        }
        // Validate required columns
        const requiredHeaders = [
            'Store',
            'Order',
            'Concept',
            'Weight Kg',
            'Shippings €',
            'Fulfillments €',
            'Cash on delivery €',
            'Total €',
        ];
        const missing = requiredHeaders.filter((h) => !(h in rawRows[0]));
        if (missing.length) {
            throw new BadRequestException(`Missing required columns: ${missing.join(', ')}`);
        }
        // Parse XLSX


        if (!rawRows.length) {
            throw new BadRequestException('XLSX file is empty or has no data rows');
        }

        // Get latest exchange rate
        const currentRate = await this.getLatestExchangeRate();

        // Parse rows
        const parsedRows: ParsedPerOrderRow[] = [];
        for (const row of rawRows) {
            const store = String(row['Store'] || '').trim();
            const orderNumber = String(row['Order'] || '').trim();
            const concept = String(row['Concept'] || '').trim();
            const weightKg = this.parseMoneyValue(row['Weight Kg']);
            const shippingEur = this.parseMoneyValue(row['Shippings €']);
            const fulfillmentEur = this.parseMoneyValue(row['Fulfillments €']);
            const codEur = this.parseMoneyValue(row['Cash on delivery €']);
            const totalEur = this.parseMoneyValue(row['Total €']);

            // Expense = shipping + fulfillment. COD is NOT an expense.
            const expenseEur = shippingEur + fulfillmentEur;
            const description = `Beeping — ${orderNumber} (${concept})`;

            // Calculate VND
            const amountVnd = currentRate ? expenseEur / Number(currentRate.vndToEur) : null;

            parsedRows.push({
                store,
                orderNumber,
                concept,
                weightKg,
                shippingEur,
                fulfillmentEur,
                codEur,
                totalEur,
                expenseEur,
                description,
                orderId: null,
                market: null,
                fulfillmentCenterId,
                matched: false,
                amountVnd,
            });
        }

        // Match orders
        let matched = 0;
        let unmatched = 0;
        for (const row of parsedRows) {
            if (!row.orderNumber) {
                unmatched++;
                continue;
            }
            const order = await this.findOrderByNumber(row.orderNumber);
            if (order) {
                row.orderId = order.id;
                row.market = order.shippingCountry || null;
                row.fulfillmentCenterId = order.fulfillmentCenterId || fulfillmentCenterId;
                row.matched = true;
                matched++;
            } else {
                unmatched++;
            }
        }

        const totalAmountEur = parsedRows.reduce((sum, r) => sum + r.expenseEur, 0);

        // Create upload record
        const upload = await this.prisma.fulfillmentInvoiceUpload.create({
            data: {
                fulfillmentCenterId,
                invoiceType: 'per_order',
                periodMonth: periodMonth || null,
                filename,
                totalLines: parsedRows.length,
                matchedLines: matched,
                unmatchedLines: unmatched,
                totalAmountEur,
                status: 'pending',
                rawData: parsedRows as any,
                uploadedBy: uploadedBy || null,
            },
        });

        return {
            uploadId: upload.id,
            rows: parsedRows,
            summary: {
                total: parsedRows.length,
                matched,
                unmatched,
                totalAmountEur: Math.round(totalAmountEur * 100) / 100,
            },
        };
    }

    async uploadMonthlyInvoice(
        fileBuffer: Buffer,
        filename: string,
        fulfillmentCenterId: string,
        periodMonth?: string,
        uploadedBy?: string,
    ) {
        if (!fileBuffer || fileBuffer.length === 0) {
            throw new BadRequestException('Uploaded file is empty');
        }
const rawRows = this._parseInvoice(fileBuffer);
        if (!rawRows.length) {
            throw new BadRequestException('XLSX file is empty or has no data rows');
        }
        // Validate required columns for monthly format
        const requiredHeaders = ['Orders', 'Total €'];
        const missing = requiredHeaders.filter((h) => !(h in rawRows[0]));
        if (missing.length) {
            throw new BadRequestException(`Missing required columns: ${missing.join(', ')}`);
        }

        const currentRate = await this.getLatestExchangeRate();

        const parsedRows: ParsedMonthlyRow[] = rawRows.map((row) => {
            const shop = String(row['Shop'] || 'Spain').trim();
            const orders = parseInt(String(row['Orders'] || '0'), 10) || 0;
            const totalEur = this.parseMoneyValue(row['Total €']);
            const description = `Beeping Monthly — ${shop}`;
            const amountVnd = currentRate ? totalEur / Number(currentRate.vndToEur) : null;

            return {
                shop,
                orders,
                totalEur,
                expenseEur: totalEur,
                description,
                amountVnd,
            };
        });

        const totalAmountEur = parsedRows.reduce((sum, r) => sum + r.expenseEur, 0);

        const upload = await this.prisma.fulfillmentInvoiceUpload.create({
            data: {
                fulfillmentCenterId,
                invoiceType: 'monthly',
                periodMonth: periodMonth || null,
                filename,
                totalLines: parsedRows.length,
                matchedLines: 0,
                unmatchedLines: 0,
                totalAmountEur,
                status: 'pending',
                rawData: parsedRows as any,
                uploadedBy: uploadedBy || null,
            },
        });

        return {
            uploadId: upload.id,
            rows: parsedRows,
            summary: {
                total: parsedRows.length,
                matched: 0,
                unmatched: 0,
                totalAmountEur: Math.round(totalAmountEur * 100) / 100,
            },
        };
    }

    async uploadFfeuPdfInvoice(
        fileBuffer: Buffer,
        filename: string,
        fulfillmentCenterId: string,
        periodMonth?: string,
        uploadedBy?: string,
    ) {
        if (!fileBuffer || fileBuffer.length === 0) {
            throw new BadRequestException('Uploaded file is empty');
        }

        const { header, rows } = await this._parseFfeuPdf(fileBuffer);

        const currentRate = await this.getLatestExchangeRate();
        const rateValue = currentRate ? Number(currentRate.vndToEur) : null;

        // Annotate VND amounts
        const annotatedRows = rows.map((row) => ({
            ...row,
            amountVnd: rateValue ? row.amountEur / rateValue : null,
        }));

        // Total expense = sum of all fee rows (excluding ORDERS section which is revenue)
        const totalAmountEur = annotatedRows
            .filter((r) => r.category !== 'ORDERS')
            .reduce((sum, r) => sum + r.amountEur, 0);

        const upload = await this.prisma.fulfillmentInvoiceUpload.create({
            data: {
                fulfillmentCenterId,
                invoiceType: 'monthly',
                periodMonth: periodMonth || null,
                filename,
                totalLines: annotatedRows.length,
                matchedLines: 0,
                unmatchedLines: 0,
                totalAmountEur,
                status: 'pending',
                rawData: { header, rows: annotatedRows } as any,
                uploadedBy: uploadedBy || null,
            },
        });

        return {
            uploadId: upload.id,
            invoiceFormat: 'ffeu_pdf' as const,
            header,
            rows: annotatedRows,
            summary: {
                total: annotatedRows.length,
                matched: 0,
                unmatched: 0,
                totalAmountEur: Math.round(totalAmountEur * 100) / 100,
            },
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // IMPORT (writes financial_records + updates orders)
    // ═══════════════════════════════════════════════════════════════

    async importInvoice(uploadId: string) {
        const upload = await this.prisma.fulfillmentInvoiceUpload.findUnique({
            where: { id: uploadId },
        });

        if (!upload) {
            throw new NotFoundException(`Upload ${uploadId} not found`);
        }
        if (upload.status !== 'pending') {
            throw new BadRequestException(`Upload already ${upload.status}. Cannot import again.`);
        }

        // rawData can be a flat array (per_order / monthly XLSX)
        // or { header, rows } object (FFEU PDF monthly)
        const rawData = upload.rawData as any;
        const rows: any[] = Array.isArray(rawData)
            ? rawData
            : (rawData?.rows ?? []);
        if (!rows || !rows.length) {
            throw new BadRequestException('No data to import');
        }

        const currentRate = await this.getLatestExchangeRate();
        const rateValue = currentRate ? Number(currentRate.vndToEur) : null;

        // Build transaction operations
        const operations: any[] = [];
        let updatedOrders = 0;

        if (upload.invoiceType === 'per_order') {
            for (const row of rows) {
                const amountVnd = rateValue ? row.expenseEur / rateValue : null;

                operations.push(
                    this.prisma.financialRecord.create({
                        data: {
                            date: new Date(),
                            description: row.description,
                            category: 'Fulfillment',
                            market: row.market || null,
                            amountEur: row.expenseEur,
                            amountVnd: amountVnd,
                            exchangeRate: rateValue,
                            source: 'beeping',
                            orderId: row.orderId || null,
                            fulfillmentCenterId: upload.fulfillmentCenterId,
                            invoiceUploadId: uploadId,
                        },
                    }),
                );

                // Update order fulfillment cost if matched
                if (row.orderId) {
                    operations.push(
                        this.prisma.order.update({
                            where: { id: row.orderId },
                            data: { fulfillmentCost: row.expenseEur },
                        }),
                    );
                    updatedOrders++;
                }
            }
        } else {
            // Monthly invoice — could be FFEU PDF or simple monthly XLSX
            // Detect FFEU format: rawData has { header, rows } shape
            const isFfeu = rows[0] && 'category' in rows[0] && 'item' in rows[0];

            if (isFfeu) {
                // FFEU PDF: each fee row becomes its own financial record
                const feeRows = rows.filter((r: any) => r.category !== 'ORDERS' && r.amountEur > 0);
                for (const row of feeRows) {
                    const amountVnd = rateValue ? (row.amountEur as number) / rateValue : null;
                    // Map FFEU category to financial category
                    const financialCategory = (() => {
                        const cat = (row.category as string).toUpperCase();
                        if (cat.includes('SHIPPING')) return 'Fulfillment';
                        if (cat.includes('CALL CENTER')) return 'Fulfillment';
                        if (cat.includes('FULFILLEMENT') || cat.includes('FULFILLMENT')) return 'Fulfillment';
                        return 'Fulfillment';
                    })();

                    operations.push(
                        this.prisma.financialRecord.create({
                            data: {
                                date: new Date(),
                                description: row.description || `FFEU — ${row.item}`,
                                category: financialCategory,
                                market: null,
                                amountEur: row.amountEur,
                                amountVnd,
                                exchangeRate: rateValue,
                                source: 'ffeu',
                                orderId: null,
                                fulfillmentCenterId: upload.fulfillmentCenterId,
                                invoiceUploadId: uploadId,
                            },
                        }),
                    );
                }
            } else {
                // Standard monthly XLSX rows
                for (const row of rows) {
                    const amountVnd = rateValue ? row.expenseEur / rateValue : null;

                    operations.push(
                        this.prisma.financialRecord.create({
                            data: {
                                date: new Date(),
                                description: row.description,
                                category: 'Fulfillment',
                                market: null,
                                amountEur: row.expenseEur,
                                amountVnd: amountVnd,
                                exchangeRate: rateValue,
                                source: 'beeping',
                                orderId: null,
                                fulfillmentCenterId: upload.fulfillmentCenterId,
                                invoiceUploadId: uploadId,
                            },
                        }),
                    );
                }
            }
        }

        // Update upload status
        operations.push(
            this.prisma.fulfillmentInvoiceUpload.update({
                where: { id: uploadId },
                data: {
                    status: 'imported',
                    importedAt: new Date(),
                },
            }),
        );

        // Execute in a single transaction
        await this.prisma.$transaction(operations);

        // operations includes 1 status-update at the end — subtract it for the count
        const importedCount = operations.length - 1;

        return {
            imported: importedCount,
            updatedOrders,
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // FINANCIAL RECORDS CRUD
    // ═══════════════════════════════════════════════════════════════

    async findAllRecords(filters: {
        month?: string;
        category?: string;
        market?: string;
        source?: string;
    }) {
        const where: any = {};

        if (filters.month) {
            const [year, month] = filters.month.split('-').map(Number);
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 0); // last day of month
            where.date = { gte: startDate, lte: endDate };
        }
        if (filters.category) where.category = filters.category;
        if (filters.market) where.market = filters.market;
        if (filters.source) where.source = filters.source;

        return this.prisma.financialRecord.findMany({
            where,
            include: {
                order: { select: { id: true, orderNumber: true } },
                fulfillmentCenter: { select: { id: true, name: true } },
            },
            orderBy: { date: 'desc' },
        });
    }

    async createRecord(dto: CreateFinancialRecordDto) {
        let amountVnd = dto.amountVnd ?? null;
        let amountEur = dto.amountEur ?? null;
        let exchangeRate = dto.exchangeRate ?? null;

        if (!amountEur && amountVnd) {
            const rate = await this.getLatestExchangeRate();
            if (rate) {
                exchangeRate = Number(rate.vndToEur);
                amountEur = amountVnd / exchangeRate;
            } else {
                amountEur = 0; // fallback if no exchange rate
            }
        } else if (!amountVnd && amountEur) {
            const rate = await this.getLatestExchangeRate();
            if (rate) {
                exchangeRate = Number(rate.vndToEur);
                amountVnd = amountEur * exchangeRate;
            }
        }

        return this.prisma.financialRecord.create({
            data: {
                date: new Date(dto.date),
                description: dto.description,
                category: dto.category,
                market: dto.market || null,
                amountEur: amountEur as number,
                amountVnd,
                exchangeRate,
                source: dto.source || 'manual',
                spendType: dto.spendType || null,
                orderId: dto.orderId || null,
                fulfillmentCenterId: dto.fulfillmentCenterId || null,
                notes: dto.notes || null,
            },
            include: {
                order: { select: { id: true, orderNumber: true } },
                fulfillmentCenter: { select: { id: true, name: true } },
            },
        });
    }

    async updateRecord(id: string, dto: UpdateFinancialRecordDto) {
        const existing = await this.prisma.financialRecord.findUnique({ where: { id } });
        if (!existing) {
            throw new NotFoundException(`Financial record ${id} not found`);
        }

        const data: any = {};
        if (dto.date !== undefined) data.date = new Date(dto.date);
        if (dto.description !== undefined) data.description = dto.description;
        if (dto.category !== undefined) data.category = dto.category;
        if (dto.market !== undefined) data.market = dto.market || null;
        if (dto.amountEur !== undefined) data.amountEur = dto.amountEur;
        if (dto.amountVnd !== undefined) data.amountVnd = dto.amountVnd;
        if (dto.exchangeRate !== undefined) data.exchangeRate = dto.exchangeRate;
        if (dto.source !== undefined) data.source = dto.source;
        if (dto.spendType !== undefined) data.spendType = dto.spendType || null;
        if (dto.orderId !== undefined) data.orderId = dto.orderId || null;
        if (dto.fulfillmentCenterId !== undefined) data.fulfillmentCenterId = dto.fulfillmentCenterId || null;
        if (dto.notes !== undefined) data.notes = dto.notes || null;

        return this.prisma.financialRecord.update({
            where: { id },
            data,
            include: {
                order: { select: { id: true, orderNumber: true } },
                fulfillmentCenter: { select: { id: true, name: true } },
            },
        });
    }

    async deleteRecord(id: string) {
        const existing = await this.prisma.financialRecord.findUnique({ where: { id } });
        if (!existing) {
            throw new NotFoundException(`Financial record ${id} not found`);
        }
        await this.prisma.financialRecord.delete({ where: { id } });
        return { deleted: true, id };
    }

    async bulkDeleteRecords(ids: string[]) {
        const result = await this.prisma.financialRecord.deleteMany({
            where: { id: { in: ids } },
        });
        return { deletedCount: result.count };
    }

    async getRecordsSummary(filters: { month?: string; market?: string }) {
        const where: any = {};

        if (filters.month) {
            const [year, month] = filters.month.split('-').map(Number);
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 0);
            where.date = { gte: startDate, lte: endDate };
        }
        if (filters.market) where.market = filters.market;

        const records = await this.prisma.financialRecord.findMany({ where });

        const totalEur = records.reduce((sum, r) => sum + Number(r.amountEur), 0);
        const totalVnd = records.reduce((sum, r) => sum + (r.amountVnd ? Number(r.amountVnd) : 0), 0);

        const byCategory: Record<string, number> = {
            Ads: 0,
            Software: 0,
            COGS: 0,
            Office: 0,
            'Rate Exchange': 0,
            'Shipping Fee': 0,
            Other: 0,
        };
        for (const r of records) {
            const cat = r.category as string;
            if (byCategory[cat] !== undefined) {
                byCategory[cat] += Number(r.amountEur);
            } else {
                byCategory['Other'] += Number(r.amountEur);
            }
        }

        // Round values
        for (const key of Object.keys(byCategory)) {
            byCategory[key] = Math.round(byCategory[key] * 100) / 100;
        }

        return {
            totalEur: Math.round(totalEur * 100) / 100,
            totalVnd: Math.round(totalVnd * 100) / 100,
            byCategory,
            recordCount: records.length,
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════

    async getUniqueSources(): Promise<string[]> {
        const records = await this.prisma.financialRecord.findMany({
            select: { source: true },
            distinct: ['source'],
        });
        return records.map(r => r.source).filter(Boolean) as string[];
    }

    async bulkCreateRecords(records: CreateFinancialRecordDto[]) {
        const currentRate = await this.getLatestExchangeRate();
        const rateValue = currentRate ? Number(currentRate.vndToEur) : null;

        const operations = records.map((r) => {
            let amountVnd = r.amountVnd ?? null;
            let amountEur = r.amountEur ?? null;
            let exchangeRate = r.exchangeRate ?? rateValue;

            if (!amountEur && amountVnd && exchangeRate) {
                amountEur = amountVnd / exchangeRate;
            } else if (!amountVnd && amountEur && exchangeRate) {
                amountVnd = amountEur * exchangeRate;
            }

            return this.prisma.financialRecord.create({
                data: {
                    date: new Date(r.date),
                    description: r.description,
                    category: r.category,
                    market: r.market || null,
                    amountEur: amountEur || 0,
                    amountVnd,
                    spendType: r.spendType || null,
                    exchangeRate,
                    source: r.source || 'manual',
                    notes: r.notes || null,
                },
            });
        });

        await this.prisma.$transaction(operations);
        return { importedCount: operations.length };
    }

    private parseMoneyValue(val: any): number {
        if (val === null || val === undefined) return 0;
        if (typeof val === 'number') return val;
        const cleaned = String(val).replace(/€/g, '').replace(/\s/g, '').replace(',', '.').trim();
        const parsed = parseFloat(cleaned);
        return isNaN(parsed) ? 0 : parsed;
    }

    private async findOrderByNumber(orderNumber: string) {
        if (!orderNumber) return null;
        try {
            const results: any[] = await this.prisma.$queryRaw`
                SELECT id, order_number, shipping_country, fulfillment_center_id
                FROM orders
                WHERE order_number ILIKE '%' || ${orderNumber} || '%'
                LIMIT 1
            `;
            if (results.length > 0) {
                return {
                    id: results[0].id,
                    orderNumber: results[0].order_number,
                    shippingCountry: results[0].shipping_country,
                    fulfillmentCenterId: results[0].fulfillment_center_id,
                };
            }
            return null;
        } catch (err) {
            this.logger.warn(`Order lookup failed for ${orderNumber}: ${err.message}`);
            return null;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // P&L REPORT
    // ═══════════════════════════════════════════════════════════════

    async getPnlReport(year: number) {
        const startOfYear = new Date(year, 0, 1);
        const endOfYear = new Date(year, 11, 31, 23, 59, 59);

        // Get exchange rate for VND→EUR conversion (for R&D from ads)
        const currentRate = await this.getLatestExchangeRate();
        const vndToEur = currentRate ? Number(currentRate.vndToEur) : null;

        // Helper: month index (0-11) from a Date
        const monthOf = (d: Date | string) => new Date(d).getMonth();

        // Initialize 12-month data structure
        const months: string[] = [];
        const emptyMonth = () => ({
            sale: 0, return: 0, netSale: 0,
            cogs: 0, returnCogs: 0, netCogs: 0,
            storageFee: 0, ads: 0, fulfillment: 0, rnd: 0,
            commission: 0, transactionFee: 0,
            variableCostsTotal: 0,
            testingFee: 0, people: 0, office: 0, other: 0,
            rateExchange: 0, software: 0,
            fixedCostsTotal: 0,
            totalExpense: 0, profitLoss: 0,
        });
        const monthData = Array.from({ length: 12 }, () => emptyMonth());
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        for (let i = 0; i < 12; i++) months.push(monthNames[i]);

        // ─── 1. SALE: paid orders ────────────────────────────────
        const paidOrders = await this.prisma.order.findMany({
            where: {
                paymentStatus: 'Paid',
                orderDate: { gte: startOfYear, lte: endOfYear },
            },
            select: { orderDate: true, totalAmount: true },
        });
        for (const o of paidOrders) {
            const m = monthOf(o.orderDate);
            monthData[m].sale += Number(o.totalAmount) || 0;
        }

        // ─── 2. RETURN: returned orders ──────────────────────────
        const returnedOrders = await this.prisma.order.findMany({
            where: {
                orderStatus: 'Returned',
                orderDate: { gte: startOfYear, lte: endOfYear },
            },
            select: { orderDate: true, totalAmount: true, shippingFee: true },
        });
        for (const o of returnedOrders) {
            const m = monthOf(o.orderDate);
            monthData[m].return += (Number(o.totalAmount) || 0) + (Number(o.shippingFee) || 0);
        }

        // ─── 3. COGS: product cost of paid orders ───────────────
        const paidOrdersWithItems = await this.prisma.order.findMany({
            where: {
                paymentStatus: 'Paid',
                orderDate: { gte: startOfYear, lte: endOfYear },
            },
            select: {
                orderDate: true,
                items: {
                    select: {
                        quantity: true,
                        unitCost: true,
                        product: { select: { unitCost: true } },
                    },
                },
            },
        });
        for (const o of paidOrdersWithItems) {
            const m = monthOf(o.orderDate);
            for (const item of o.items) {
                // Use item-level unitCost first, fall back to product unitCost
                const cost = Number(item.unitCost) || Number(item.product?.unitCost) || 0;
                monthData[m].cogs += cost * item.quantity;
            }
        }

        // ─── 4. RETURN COGS: product cost of returned orders ────
        const returnedOrdersWithItems = await this.prisma.order.findMany({
            where: {
                orderStatus: 'Returned',
                orderDate: { gte: startOfYear, lte: endOfYear },
            },
            select: {
                orderDate: true,
                items: {
                    select: {
                        quantity: true,
                        unitCost: true,
                        product: { select: { unitCost: true } },
                    },
                },
            },
        });
        for (const o of returnedOrdersWithItems) {
            const m = monthOf(o.orderDate);
            for (const item of o.items) {
                const cost = Number(item.unitCost) || Number(item.product?.unitCost) || 0;
                monthData[m].returnCogs += cost * item.quantity;
            }
        }

        // ─── 5. FINANCIAL RECORDS: expenses by category ─────────
        const financialRecords = await this.prisma.financialRecord.findMany({
            where: {
                date: { gte: startOfYear, lte: endOfYear },
            },
            select: { date: true, category: true, amountEur: true },
        });

        const categoryMapping: Record<string, keyof ReturnType<typeof emptyMonth>> = {
            'Storage fee': 'storageFee',
            'Ads': 'ads',
            'Fulfillment': 'fulfillment',
            'Commission': 'commission',
            'Transaction fee': 'transactionFee',
            'Testing fee': 'testingFee',
            'People': 'people',
            'Office': 'office',
            'Other': 'other',
            'Others': 'other',
            'Rate Exchange': 'rateExchange',
            'Software': 'software',
        };

        for (const r of financialRecords) {
            const m = monthOf(r.date);
            const field = categoryMapping[r.category];
            if (field && typeof monthData[m][field] === 'number') {
                (monthData[m][field] as number) += Number(r.amountEur) || 0;
            }
        }

        // ─── 6. R&D: Test/POC stage ads campaigns ───────────────
        const rdCampaigns = await this.prisma.adsCampaign.findMany({
            where: {
                stage: { in: ['Test', 'TEST', 'test', 'POC', 'poc', 'Poc'] },
                date: { gte: startOfYear, lte: endOfYear },
            },
            select: { date: true, spendVnd: true },
        });
        for (const c of rdCampaigns) {
            const m = monthOf(c.date);
            const spendVnd = Number(c.spendVnd) || 0;
            // Convert VND to EUR
            const spendEur = vndToEur ? spendVnd * vndToEur : 0;
            monthData[m].rnd += spendEur;
        }

        // ─── 7. CALCULATE DERIVED ROWS ──────────────────────────
        for (const d of monthData) {
            // Round all raw values
            d.sale = Math.round(d.sale * 100) / 100;
            d.return = Math.round(d.return * 100) / 100;
            d.cogs = Math.round(d.cogs * 100) / 100;
            d.returnCogs = Math.round(d.returnCogs * 100) / 100;
            d.storageFee = Math.round(d.storageFee * 100) / 100;
            d.ads = Math.round(d.ads * 100) / 100;
            d.fulfillment = Math.round(d.fulfillment * 100) / 100;
            d.rnd = Math.round(d.rnd * 100) / 100;
            d.commission = Math.round(d.commission * 100) / 100;
            d.transactionFee = Math.round(d.transactionFee * 100) / 100;
            d.testingFee = Math.round(d.testingFee * 100) / 100;
            d.people = Math.round(d.people * 100) / 100;
            d.office = Math.round(d.office * 100) / 100;
            d.other = Math.round(d.other * 100) / 100;
            d.rateExchange = Math.round(d.rateExchange * 100) / 100;
            d.software = Math.round(d.software * 100) / 100;

            // Derived
            d.netSale = Math.round((d.sale - d.return) * 100) / 100;
            d.netCogs = Math.round((d.cogs - d.returnCogs) * 100) / 100;
            d.variableCostsTotal = Math.round((d.netCogs + d.storageFee + d.ads + d.fulfillment + d.rnd + d.commission + d.transactionFee) * 100) / 100;
            d.fixedCostsTotal = Math.round((d.testingFee + d.people + d.office + d.other + d.rateExchange + d.software) * 100) / 100;
            d.totalExpense = Math.round((d.variableCostsTotal + d.fixedCostsTotal) * 100) / 100;
            d.profitLoss = Math.round((d.netSale - d.totalExpense) * 100) / 100;
        }

        return { year, months, data: monthData };
    }

    // ═══════════════════════════════════════════════════════════════
    // FULFILLMENT CENTER REPORT
    // ═══════════════════════════════════════════════════════════════

    async getFulfillmentReport(month?: string) {
        // Parse month filter
        let startDate: Date;
        let endDate: Date;

        if (month) {
            const [year, m] = month.split('-').map(Number);
            startDate = new Date(year, m - 1, 1);
            endDate = new Date(year, m, 0, 23, 59, 59);
        } else {
            const now = new Date();
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        }

        // Get all fulfillment centers
        const fulfillmentCenters = await this.prisma.fulfillmentCenter.findMany({
            select: { id: true, name: true, code: true, country: true },
        });

        // Get all orders in the month range with FC assigned
        const orders = await this.prisma.order.findMany({
            where: {
                fulfillmentCenterId: { not: null },
                orderDate: { gte: startDate, lte: endDate },
            },
            select: {
                id: true,
                fulfillmentCenterId: true,
                orderStatus: true,
                totalAmount: true,
                fulfillmentCost: true,
                orderDate: true,
                returnStockState: true,
                confirmationStatus: true,
            },
        });

        // Get fulfillment costs from financial records for this month
        const financialRecords = await this.prisma.financialRecord.findMany({
            where: {
                fulfillmentCenterId: { not: null },
                category: 'Fulfillment',
                date: { gte: startDate, lte: endDate },
            },
            select: {
                fulfillmentCenterId: true,
                amountEur: true,
                description: true,
            },
        });

        // Aggregate financial records by FC
        const fulfillmentCostByFc: Record<string, number> = {};
        const reshipmentCostByFc: Record<string, number> = {};
        for (const fr of financialRecords) {
            if (!fr.fulfillmentCenterId) continue;
            // Check if this is a reshipment cost (by description pattern)
            const desc = (fr.description || '').toLowerCase();
            if (desc.includes('reshipment') || desc.includes('re-ship') || desc.includes('reship')) {
                reshipmentCostByFc[fr.fulfillmentCenterId] =
                    (reshipmentCostByFc[fr.fulfillmentCenterId] || 0) + Number(fr.amountEur);
            } else {
                fulfillmentCostByFc[fr.fulfillmentCenterId] =
                    (fulfillmentCostByFc[fr.fulfillmentCenterId] || 0) + Number(fr.amountEur);
            }
        }

        // Aggregate orders by FC
        // "Confirm and Ship" -> must be Confirmed, and status indicates it left the warehouse.
        const sentStatuses = [
            'Shipped', 'InTransit', 'OutForDelivery', 'Delivered', 
            'Undelivered', 'Exception', 'NotFound', 'Expired', 
            'Returned', 'Return'
        ];

        const report = fulfillmentCenters.map((fc) => {
            const fcOrders = orders.filter((o) => o.fulfillmentCenterId === fc.id);
            const totalOrders = fcOrders.length;

            // Orders sent = fully confirmed AND package is dispatched
            const ordersSent = fcOrders.filter(
                (o) => o.confirmationStatus === 'Confirmed' && sentStatuses.includes(o.orderStatus)
            ).length;

            // Orders delivered
            const ordersDelivered = fcOrders.filter((o) => o.orderStatus === 'Delivered').length;

            // Orders returned (Count only if Stock Return State is exactly 'Restocked (Available)')
            const ordersReturned = fcOrders.filter((o) => o.returnStockState === 'restocked').length;

            // % Delivered / Sent
            const deliveryRate = ordersSent > 0 ? (ordersDelivered / ordersSent) * 100 : 0;

            // Return rate
            const returnRate = ordersSent > 0 ? (ordersReturned / ordersSent) * 100 : 0;

            // Revenue = sum of totalAmount for delivered orders
            const revenue = fcOrders
                .filter((o) => o.orderStatus === 'Delivered')
                .reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);

            // AOV = Average Order Value for all orders
            const totalOrderValue = fcOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
            const aov = totalOrders > 0 ? totalOrderValue / totalOrders : 0;

            // Fulfillment cost from financial records (uploaded via CodReconciliationTab)
            const fulfillmentCost = fulfillmentCostByFc[fc.id] || 0;

            // Cost per order = Fulfillment cost / Total orders uploaded
            const costPerOrder = totalOrders > 0 ? fulfillmentCost / totalOrders : 0;

            // Reshipment cost
            const reshipmentCost = reshipmentCostByFc[fc.id] || 0;

            // Fulfillment % of order revenue
            const fulfillmentPctRevenue = revenue > 0 ? (fulfillmentCost / revenue) * 100 : 0;

            // Profit = Revenue - Fulfillment Cost - Reshipment Cost
            const profit = revenue - fulfillmentCost - reshipmentCost;

            return {
                fulfillmentCenterId: fc.id,
                fulfillmentCenterName: fc.name,
                fulfillmentCenterCode: fc.code,
                country: fc.country,
                totalOrders,
                ordersSent,
                ordersDelivered,
                ordersReturned,
                deliveryRate: Math.round(deliveryRate * 100) / 100,
                returnRate: Math.round(returnRate * 100) / 100,
                fulfillmentCost: Math.round(fulfillmentCost * 100) / 100,
                costPerOrder: Math.round(costPerOrder * 100) / 100,
                reshipmentCost: Math.round(reshipmentCost * 100) / 100,
                aov: Math.round(aov * 100) / 100,
                revenue: Math.round(revenue * 100) / 100,
                fulfillmentPctRevenue: Math.round(fulfillmentPctRevenue * 100) / 100,
                profit: Math.round(profit * 100) / 100,
            };
        });

        // Include all FCs (even zero-order ones for visibility)
        const totals = {
            totalOrders: report.reduce((s, r) => s + r.totalOrders, 0),
            ordersSent: report.reduce((s, r) => s + r.ordersSent, 0),
            ordersDelivered: report.reduce((s, r) => s + r.ordersDelivered, 0),
            ordersReturned: report.reduce((s, r) => s + r.ordersReturned, 0),
            revenue: Math.round(report.reduce((s, r) => s + r.revenue, 0) * 100) / 100,
            fulfillmentCost: Math.round(report.reduce((s, r) => s + r.fulfillmentCost, 0) * 100) / 100,
            reshipmentCost: Math.round(report.reduce((s, r) => s + r.reshipmentCost, 0) * 100) / 100,
            profit: Math.round(report.reduce((s, r) => s + r.profit, 0) * 100) / 100,
        };

        return {
            month: month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
            centers: report,
            totals,
        };
    }

    async getLatestExchangeRate() {
        try {
            return await this.prisma.exchangeRate.findFirst({
                orderBy: { date: 'desc' },
            });
        } catch {
            return null;
        }
    }

    // Shared helper to parse an XLSX buffer and return rows
    private _parseInvoice(fileBuffer: Buffer): any[] {
        if (!fileBuffer || fileBuffer.length === 0) {
            throw new BadRequestException('Uploaded file is empty');
        }
        let workbook: XLSX.WorkBook;
        try {
            workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        } catch (e) {
            throw new BadRequestException('Failed to parse XLSX file');
        }
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows: any[] = XLSX.utils.sheet_to_json(sheet);
        if (!rows.length) {
            throw new BadRequestException('XLSX file is empty or has no data rows');
        }
        return rows;
    }

    // ═══════════════════════════════════════════════════════════════
    // FFEU PDF PARSER
    // ═══════════════════════════════════════════════════════════════

    private async _parseFfeuPdf(fileBuffer: Buffer): Promise<{ header: FfeuInvoiceHeader; rows: FfeuFeeRow[] }> {
        let pdfData: { text: string };
        try {
            const parseFunc = typeof pdfParse === 'function' ? pdfParse : (pdfParse.default || pdfParse);
            pdfData = await parseFunc(fileBuffer);
        } catch (e) {
            throw new BadRequestException('Failed to parse PDF file: ' + e.message);
        }
        const text = pdfData.text;
        const lines = text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);

        // ── Extract header fields ──────────────────────────────────
        const header: FfeuInvoiceHeader = {
            invoiceNumber: '',
            dateFrom: '',
            dateTo: '',
            numberOfOrders: 0,
            totalDue: 0,
            bankName: '',
            bankNumber: '',
            country: '',
            taxNumber: '',
            subtotalFees: 0,
            vat: 0,
            totalFees: 0,
            totalOrders: 0,
        };

        const fullText = lines.join(' ');

        // Invoice number: INVOICE #ESxxxx or INVOICE #XXX
        const invoiceMatch = fullText.match(/INVOICE\s*#([A-Z0-9]+)/i);
        if (invoiceMatch) header.invoiceNumber = invoiceMatch[1];

        // Date Transaction: YYYY-MM-DD - YYYY-MM-DD
        const dateMatch = fullText.match(/(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) { header.dateFrom = dateMatch[1]; header.dateTo = dateMatch[2]; }

        // Number Of Orders
        const ordersMatch = fullText.match(/Number\s+Of\s+Orders\s*:?\s*(\d+)/i);
        if (ordersMatch) header.numberOfOrders = parseInt(ordersMatch[1], 10);

        // Total Due
        const totalDueMatch = fullText.match(/Total\s+Due\s*:?\s*([\d,\.]+)\s*€/i);
        if (totalDueMatch) header.totalDue = this.parseMoneyValue(totalDueMatch[1]);

        // Bank name
        const bankNameMatch = fullText.match(/Bank\s+name\s*:?\s*([^\d]+?)(?:Bank Number|DK|\d)/i);
        if (bankNameMatch) header.bankName = bankNameMatch[1].trim();

        // Bank number (IBAN format)
        const bankNumMatch = fullText.match(/Bank\s+Number\s*:?\s*([A-Z0-9]+)/i);
        if (bankNumMatch) header.bankNumber = bankNumMatch[1].trim();

        // Country
        const countryMatch = fullText.match(/Country\s*:?\s*([A-Za-z,\.\s]+?)(?:Tax|$)/i);
        if (countryMatch) header.country = countryMatch[1].trim().replace(/,\s*$/, '');

        // Tax number
        const taxMatch = fullText.match(/Tax\s+number\s*:?\s*(\d+)/i);
        if (taxMatch) header.taxNumber = taxMatch[1];

        // Summary totals (usually near bottom)
        const subtotalMatch = fullText.match(/Subtotal\s+Fees\s*:?\s*([\d,\.]+)\s*€/i);
        if (subtotalMatch) header.subtotalFees = this.parseMoneyValue(subtotalMatch[1]);

        const vatMatch = fullText.match(/Vat\s*\([\d\s%]+\)\s*:?\s*([\d,\.]+)\s*€/i);
        if (vatMatch) header.vat = this.parseMoneyValue(vatMatch[1]);

        const totalFeesMatch = fullText.match(/Total\s+Fees\s*:?\s*([\d,\.]+)\s*€/i);
        if (totalFeesMatch) header.totalFees = this.parseMoneyValue(totalFeesMatch[1]);

        const totalOrdersMatch = fullText.match(/Total\s+Orders\s*:?\s*([\d,\.]+)\s*€/i);
        if (totalOrdersMatch) header.totalOrders = this.parseMoneyValue(totalOrdersMatch[1]);

        // ── Extract fee rows ──────────────────────────────────────
        const rows: FfeuFeeRow[] = [];
        let currentCategory = 'GENERAL';

        // Fee section headers
        const sectionHeaders = [
            'CALL CENTER FEES',
            'SHIPPING FEES',
            'FULFILLEMENT',
            'FULFILLMENT',
            'ORDERS',
        ];

        // Known fee line patterns: item name, optionally a number, then amount with €
        // We scan line by line looking for fee lines
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].toUpperCase();

            // Detect section headers
            for (const section of sectionHeaders) {
                if (line.includes(section)) {
                    currentCategory = section.replace('FULFILLEMENT', 'FULFILLEMENT');
                    break;
                }
            }

            // Skip header/footer lines
            if (
                line.includes('INVOICE') ||
                line.includes('DATE TRANSACTION') ||
                line.includes('NUMBER OF ORDERS') ||
                line.includes('INVOICE TO') ||
                line.includes('BILL TO') ||
                line.includes('TOTAL DUE') ||
                line.includes('BANK NAME') ||
                line.includes('BANK NUMBER') ||
                line.includes('TAX NUMBER') ||
                line.includes('COUNTRY') ||
                line.includes('SUBTOTAL FEES') ||
                line.includes('TOTAL FEES') ||
                line.includes('TOTAL ORDERS') ||
                line.includes('TOTAL PAYMENT') ||
                line.includes('VAT') ||
                line.includes('THANKS FOR') ||
                line.includes('NOTE:') ||
                line.includes('ITEM') ||
                line.includes('AMOUNT') ||
                sectionHeaders.some((s) => line.trim() === s || line.trim() === s + ' :')
            ) {
                continue;
            }

            // Try to match a fee line: "ITEM NAME  [count]  X.XX €"
            // Pattern: text, optional number, then number with optional decimal and €
            const feeLineMatch = lines[i].match(/^([A-Za-z &]+?)\s+(\d+)?\s*([\d]+[\.,][\d]+)\s*€?\s*$/);
            if (feeLineMatch) {
                const itemName = feeLineMatch[1].trim();
                const count = feeLineMatch[2] ? parseInt(feeLineMatch[2], 10) : null;
                const amount = this.parseMoneyValue(feeLineMatch[3]);

                if (amount === 0 && count === null) continue;

                rows.push({
                    item: itemName,
                    total: count,
                    amountEur: amount,
                    category: currentCategory,
                    description: `FFEU ${header.invoiceNumber || 'Invoice'} — ${itemName}`,
                });
                continue;
            }

            // Alternative: just amount with € at end of a text line (no count)
            const simpleMatch = lines[i].match(/^([A-Za-z &:]+?)\s+([\d]+[\.,][\d]+)\s*€?\s*$/);
            if (simpleMatch) {
                const itemName = simpleMatch[1].trim();
                const amount = this.parseMoneyValue(simpleMatch[2]);
                if (amount > 0) {
                    rows.push({
                        item: itemName,
                        total: null,
                        amountEur: amount,
                        category: currentCategory,
                        description: `FFEU ${header.invoiceNumber || 'Invoice'} — ${itemName}`,
                    });
                }
            }
        }

        this.logger.log(`FFEU PDF parsed: invoice=${header.invoiceNumber}, rows=${rows.length}`);

        if (rows.length === 0) {
            // Fallback: create one summary row from the totalDue
            this.logger.warn('FFEU PDF: no individual rows parsed, creating summary row from totalDue');
            rows.push({
                item: `Invoice ${header.invoiceNumber || ''} Total`,
                total: header.numberOfOrders || null,
                amountEur: header.totalDue,
                category: 'GENERAL',
                description: `FFEU ${header.invoiceNumber || 'Invoice'} — Total Due`,
            });
        }

        return { header, rows };
    }
}
