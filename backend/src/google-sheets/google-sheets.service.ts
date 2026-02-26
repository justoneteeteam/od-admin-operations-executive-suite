import { Injectable, Logger } from '@nestjs/common';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { PrismaService } from '../prisma/prisma.service';
import { Cron, CronExpression } from '@nestjs/schedule';

export interface SyncResult {
    success: boolean;
    totalRows: number;
    ordersCreated: number;
    ordersUpdated: number;
    itemsProcessed: number;
    customersCreated: number;
    errors: string[];
}

interface SheetRow {
    orderId: string;
    phone: string;
    storeName: string;
    customerName?: string;
    address?: string;
    city?: string;
    province?: string;
    country?: string;
    postalCode?: string;
    sku?: string;
    productName?: string;
    qty?: number;
    unitPrice?: number;
    shippingCost?: number;
    discount?: number;
    tax?: number;
    paymentType?: string;
    status?: string;
    trackingNumber?: string;
    courier?: string;
    notes?: string;
    rowIndex: number;
    orderDate?: string;
    fulfillmentCenter?: string;
    warehouse?: string;
}

@Injectable()
export class GoogleSheetsService {
    private readonly logger = new Logger(GoogleSheetsService.name);

    constructor(private prisma: PrismaService) { }

    private parseDate(dateStr?: string): Date | null {
        if (!dateStr) return null;
        const date = new Date(dateStr);
        return isNaN(date.getTime()) ? null : date;
    }

    @Cron('0 */3 * * *')
    async handleCronSync() {
        this.logger.log('Running scheduled Google Sheets sync for all connected stores');
        const stores = await this.prisma.storeSettings.findMany({
            where: { gsConnected: true, gsSpreadsheetId: { not: null } }
        });

        for (const store of stores) {
            try {
                this.logger.log(`Syncing store: ${store.storeName} (${store.id})`);
                const result = await this.syncFromSheet(store.id);
                if (!result.success) {
                    this.logger.error(`Store ${store.storeName} sync completed with errors: ${result.errors.join(', ')}`);
                }
            } catch (err: any) {
                this.logger.error(`Failed to sync store ${store.storeName}: ${err.message}`);
            }
        }
    }

    async syncFromSheet(storeId: string): Promise<SyncResult> {
        const result: SyncResult = {
            success: false,
            totalRows: 0,
            ordersCreated: 0,
            ordersUpdated: 0,
            itemsProcessed: 0,
            customersCreated: 0,
            errors: [],
        };

        try {
            // 1. Get store settings
            const store = await this.prisma.storeSettings.findUnique({
                where: { id: storeId },
            });

            if (!store) {
                result.errors.push('Store not found');
                return result;
            }

            if (!store.gsSpreadsheetId || !store.gsClientEmail || !store.gsPrivateKey) {
                result.errors.push('Google Sheets credentials are incomplete');
                return result;
            }

            // 2. Authenticate and load sheet
            // 2. Authenticate and load sheet
            // Sanitize private key: remove quotes if present, fix newlines
            let privateKey = store.gsPrivateKey;
            if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
                privateKey = privateKey.slice(1, -1);
            }
            privateKey = privateKey.replace(/\\n/g, '\n');

            const auth = new JWT({
                email: store.gsClientEmail,
                key: privateKey,
                scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
            });

            const doc = new GoogleSpreadsheet(store.gsSpreadsheetId, auth);
            await doc.loadInfo();

            const sheetName = store.gsSheetName || doc.sheetsByIndex[0]?.title;
            const sheet = store.gsSheetName
                ? doc.sheetsByTitle[store.gsSheetName]
                : doc.sheetsByIndex[0];

            if (!sheet) {
                result.errors.push(`Sheet "${sheetName}" not found in spreadsheet`);
                return result;
            }

            // 3. Get all rows
            const rows = await sheet.getRows();
            result.totalRows = rows.length;

            if (rows.length === 0) {
                result.success = true;
                return result;
            }

            // 4. Get column headers for mapping
            await sheet.loadHeaderRow();
            const headers = sheet.headerValues.map((h: string) => h.trim().toLowerCase());

            // 5. Parse rows into structured data
            const parsedRows = this.parseRows(rows, headers);

            // 6. Validate required fields
            const validRows: SheetRow[] = [];
            for (const row of parsedRows) {
                if (!row.orderId || !row.phone || !row.storeName) {
                    result.errors.push(
                        `Row ${row.rowIndex}: Missing required field(s) — ` +
                        `OrderID=${row.orderId || 'MISSING'}, Phone=${row.phone || 'MISSING'}, Store=${row.storeName || 'MISSING'}`
                    );
                    continue;
                }
                validRows.push(row);
            }

            // 7. Group rows by Order ID
            const orderGroups = new Map<string, SheetRow[]>();
            for (const row of validRows) {
                const key = row.orderId;
                if (!orderGroups.has(key)) {
                    orderGroups.set(key, []);
                }
                orderGroups.get(key)!.push(row);
            }

            // 8. Process each order group
            for (const [orderNumber, orderRows] of orderGroups) {
                try {
                    await this.processOrderGroup(orderNumber, orderRows, storeId, result);
                } catch (err: any) {
                    result.errors.push(`Order ${orderNumber}: ${err.message}`);
                }
            }

            // 9. Update store sync timestamp
            await this.prisma.storeSettings.update({
                where: { id: storeId },
                data: {
                    gsConnected: true,
                    gsLastSyncAt: new Date(),
                },
            });

            result.success = result.errors.length === 0;
        } catch (err: any) {
            this.logger.error('Sync failed', err.stack);
            result.errors.push(`Sync failed: ${err.message}`);
        }

        return result;
    }

    private parseRows(rows: any[], headers: string[]): SheetRow[] {
        // Build a flexible column mapper
        const colMap = this.buildColumnMap(headers);

        return rows.map((row, index) => {
            const get = (key: string) => {
                const colIndex = colMap.get(key);
                if (colIndex === undefined) return undefined;
                const val = row._rawData?.[colIndex] || row.get?.(headers[colIndex]) || '';
                return val.toString().trim() || undefined;
            };

            const getNum = (key: string) => {
                const val = get(key);
                if (!val) return undefined;
                const num = parseFloat(val.replace(/[^0-9.\-]/g, ''));
                return isNaN(num) ? undefined : num;
            };

            return {
                orderId: get('orderId') || '',
                phone: get('phone') || '',
                storeName: get('storeName') || '',
                customerName: get('customerName'),
                address: get('address'),
                city: get('city'),
                province: get('province'),
                country: get('country'),
                postalCode: get('postalCode'),
                sku: get('sku'),
                productName: get('productName'),
                qty: getNum('qty') || 1,
                unitPrice: getNum('unitPrice') || 0,
                shippingCost: getNum('shippingCost'),
                discount: getNum('discount'),
                paymentType: get('paymentType'),
                status: get('status'),
                trackingNumber: get('trackingNumber'),
                courier: get('courier'),
                notes: get('notes'),
                fulfillmentCenter: get('fulfillmentCenter'),
                warehouse: get('warehouse'),
                rowIndex: index + 2, // +2 for header row + 0-index
            } as SheetRow;
        });
    }

    private buildColumnMap(headers: string[]): Map<string, number> {
        const map = new Map<string, number>();

        const aliases: Record<string, string[]> = {
            orderId: ['order id', 'order no', 'order number', 'id', 'orderid'],
            phone: ['phone', 'phone number', 'mobile', 'contact', 'tel'],
            storeName: ['store name', 'store', 'shop', 'shop name'],
            customerName: ['customer name', 'customer', 'name', 'full name', 'buyer'],
            address: ['address', 'shipping address', 'street', 'address line 1'],
            city: ['city', 'town', 'emirate'],
            province: ['province', 'state', 'region'],
            country: ['country'],
            postalCode: ['postal code', 'zip code', 'zip', 'postcode'],
            sku: ['sku', 'product sku', 'item sku', 'product code'],
            productName: ['product name', 'product', 'item name', 'item', 'description'],
            qty: ['qty', 'quantity', 'amount', 'count'],
            unitPrice: ['unit price', 'price', 'unit cost', 'selling price'],
            shippingCost: ['shipping cost', 'shipping', 'delivery cost', 'freight'],
            discount: ['discount', 'discount amount'],
            paymentType: ['payment type', 'payment', 'payment method', 'pay type'],
            status: ['status', 'order status'],
            trackingNumber: ['tracking number', 'tracking', 'awb', 'tracking no'],
            courier: ['courier', 'carrier', 'shipping partner', 'logistics'],
            notes: ['notes', 'note', 'remarks', 'comment', 'comments'],
            fulfillmentCenter: ['fulfillment center', 'fc', 'fulfillment', 'fc name', 'fc location'],
            warehouse: ['warehouse', 'wh', 'warehouse location', 'wh name'],
        };

        for (const [field, aliasList] of Object.entries(aliases)) {
            for (let i = 0; i < headers.length; i++) {
                if (aliasList.includes(headers[i])) {
                    map.set(field, i);
                    break;
                }
            }
        }

        return map;
    }

    private async processOrderGroup(
        orderNumber: string,
        rows: SheetRow[],
        storeId: string,
        result: SyncResult,
    ) {
        const firstRow = rows[0];

        // 1. Find or create customer by phone
        let customer = await this.prisma.customer.findFirst({
            where: { phone: firstRow.phone },
        });

        if (!customer) {
            customer = await this.prisma.customer.create({
                data: {
                    name: firstRow.customerName || 'Unknown Customer',
                    phone: firstRow.phone,
                    addressLine1: firstRow.address,
                    city: firstRow.city,
                    province: firstRow.province,
                    country: firstRow.country || 'IT',
                    postalCode: firstRow.postalCode,
                },
            });
            result.customersCreated++;
        }

        // 2. Build order items & Enforce Strict SKU/Price logic
        const items: any[] = [];
        for (const row of rows) {
            const sku = row.sku;
            if (!sku || sku === 'N/A') {
                throw new Error(`Order ${orderNumber} skipped: Item has missing or empty SKU.`);
            }

            // Strict SKU Match
            const product = await this.prisma.product.findFirst({
                where: { sku: sku },
            });

            if (!product) {
                throw new Error(`Order ${orderNumber} skipped: Product with SKU '${sku}' not found in system.`);
            }

            const quantity = Number(row.qty) || 1;
            const unitPrice = Number(product.sellingPrice) || 0; // Enforce System Price

            items.push({
                productId: product.id,
                productName: product.name,
                sku: product.sku,
                quantity: quantity,
                unitPrice: unitPrice,
                subtotal: quantity * unitPrice,
            });
        }

        // 3. (Step removed as we already linked items above)

        // 4. Calculate totals
        const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
        const shippingFee = Number(firstRow.shippingCost) || 0;
        const discountGiven = Number(firstRow.discount) || 0;
        const taxCollected = Number(firstRow.tax) || 0; // Assuming 'tax' column exists or defaults to 0
        const totalAmount = subtotal + shippingFee + taxCollected - discountGiven;

        // Find fulfillment center if provided
        let fulfillmentCenterId: string | undefined = undefined;
        if (firstRow.fulfillmentCenter) {
            const fc = await this.prisma.fulfillmentCenter.findFirst({
                where: {
                    OR: [
                        { name: { contains: firstRow.fulfillmentCenter, mode: 'insensitive' } },
                        { code: { equals: firstRow.fulfillmentCenter, mode: 'insensitive' } }
                    ]
                }
            });
            if (fc) fulfillmentCenterId = fc.id;
        }

        // Handle internal notes to include warehouse if present
        let internalNotesString = '';
        if (firstRow.warehouse) {
            internalNotesString = `Warehouse Extracted: ${firstRow.warehouse}`;
        }

        // 5. Check if order exists
        const existingOrder = await this.prisma.order.findUnique({
            where: { orderNumber },
        });

        if (existingOrder) {
            // Update existing order
            await this.prisma.orderItem.deleteMany({
                where: { orderId: existingOrder.id },
            });

            await this.prisma.order.update({
                where: { id: existingOrder.id },
                data: {
                    storeName: firstRow.storeName,
                    shippingAddressLine1: firstRow.address || existingOrder.shippingAddressLine1,
                    shippingCity: firstRow.city || existingOrder.shippingCity,
                    shippingProvince: firstRow.province,
                    shippingCountry: firstRow.country || existingOrder.shippingCountry,
                    shippingPostalCode: firstRow.postalCode,
                    subtotal,
                    shippingFee,
                    discountGiven,
                    taxCollected,
                    totalAmount,
                    orderStatus: firstRow.status || existingOrder.orderStatus,
                    trackingNumber: firstRow.trackingNumber || existingOrder.trackingNumber,
                    courier: firstRow.courier || existingOrder.courier,
                    notes: firstRow.notes || existingOrder.notes,
                    internalNotes: internalNotesString ? (existingOrder.internalNotes ? `${existingOrder.internalNotes} | ${internalNotesString}` : internalNotesString) : (existingOrder.internalNotes || null),
                    fulfillmentCenterId: fulfillmentCenterId || existingOrder.fulfillmentCenterId,
                    lastSyncedAt: new Date(),
                    syncStatus: 'synced',
                },
            });

            // Re-create items logic remains similar but ensuring field names
            const itemsToCreate = items.map((item) => {
                return {
                    orderId: existingOrder.id,
                    productId: item.productId,
                    productName: item.productName || 'Unknown Product',
                    sku: item.sku || 'N/A',
                    quantity: Number(item.quantity) || 0,
                    unitPrice: Number(item.unitPrice) || 0,
                    subtotal: Number(item.subtotal) || 0,
                };
            });

            if (itemsToCreate.length > 0) {
                await this.prisma.orderItem.createMany({
                    data: itemsToCreate,
                });
            }
            result.ordersUpdated++;
        } else {
            // Create new order
            const orderDate = this.parseDate(firstRow.orderDate); // Helper method for date parsing

            const newOrder = await this.prisma.order.create({
                data: {
                    orderNumber,
                    customerId: customer.id,
                    storeId,
                    storeName: firstRow.storeName,
                    shippingAddressLine1: firstRow.address || 'N/A',
                    shippingCity: firstRow.city || 'N/A',
                    shippingCountry: firstRow.country || 'IT',
                    shippingProvince: firstRow.province,
                    shippingPostalCode: firstRow.postalCode,
                    subtotal,
                    shippingFee,
                    discountGiven,
                    taxCollected,
                    totalAmount,
                    orderStatus: firstRow.status || 'Pending',
                    paymentStatus: firstRow.paymentType || 'COD Pending',
                    trackingNumber: firstRow.trackingNumber,
                    courier: firstRow.courier,
                    notes: firstRow.notes,
                    internalNotes: internalNotesString || null,
                    fulfillmentCenterId: fulfillmentCenterId || null,
                    lastSyncedAt: new Date(),
                    syncStatus: 'synced',
                    orderDate: orderDate || new Date(),
                }
            });

            // Create items for new order
            const itemsToCreate = items.map((item) => {
                if (!(item as any).productId) return null;
                return {
                    orderId: newOrder.id,
                    productId: (item as any).productId,
                    productName: item.productName || 'Unknown Product',
                    sku: item.sku || 'N/A',
                    quantity: Number(item.quantity) || 0,
                    unitPrice: Number(item.unitPrice) || 0,
                    subtotal: Number(item.subtotal) || 0,
                };
            }).filter(i => i !== null) as any[];

            if (itemsToCreate.length > 0) {
                await this.prisma.orderItem.createMany({
                    data: itemsToCreate,
                });
            }
            result.ordersCreated++;
        }

        result.itemsProcessed += items.length;
    }
}
