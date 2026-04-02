import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFinancialRecordDto } from './dto/create-financial-record.dto';
import * as XLSX from 'xlsx';

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
    clientName: string;
    shop: string;
    concept: string;
    orders: number;
    totalEur: number;
    expenseEur: number;
    description: string;
    amountVnd: number | null;
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
        const requiredHeaders = ['Client Name', 'Shop', 'Concept', 'Orders', 'Total €'];
        const missing = requiredHeaders.filter((h) => !(h in rawRows[0]));
        if (missing.length) {
            throw new BadRequestException(`Missing required columns: ${missing.join(', ')}`);
        }


        if (!rawRows.length) {
            throw new BadRequestException('XLSX file is empty or has no data rows');
        }

        const currentRate = await this.getLatestExchangeRate();

        const parsedRows: ParsedMonthlyRow[] = rawRows.map((row) => {
            const clientName = String(row['Client Name'] || '').trim();
            const shop = String(row['Shop'] || '').trim();
            const concept = String(row['Concept'] || '').trim();
            const orders = parseInt(String(row['Orders'] || '0'), 10) || 0;
            const totalEur = this.parseMoneyValue(row['Total €']);
            const description = `Beeping Monthly — ${concept} (${shop})`;
            const amountVnd = currentRate ? totalEur / Number(currentRate.vndToEur) : null;

            return {
                clientName,
                shop,
                concept,
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

        const rows = upload.rawData as any[];
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
            // Monthly invoice — no order matching
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

        return {
            imported: rows.length,
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
            Fulfillment: 0,
            Ads: 0,
            Personnel: 0,
            Others: 0,
        };
        for (const r of records) {
            const cat = r.category as string;
            if (byCategory[cat] !== undefined) {
                byCategory[cat] += Number(r.amountEur);
            } else {
                byCategory['Others'] += Number(r.amountEur);
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
}
