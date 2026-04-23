
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';

import { ProfitsService } from '../profits/profits.service';
import { InventoryService } from '../inventory/inventory.service';
import { RiskScoringService } from '../risk-scoring/risk-scoring.service';
import { TrackingService } from '../tracking/tracking.service';
import { TwilioVoiceService } from '../twilio-voice/twilio-voice.service';

@Injectable()
export class OrdersService {
    constructor(
        private prisma: PrismaService,
        private profitsService: ProfitsService,
        private inventoryService: InventoryService,
        private riskScoringService: RiskScoringService,
        private trackingService: TrackingService,
        private twilioVoiceService: TwilioVoiceService
    ) { }

    async create(createOrderDto: CreateOrderDto) {
        const { items, orderNumber: providedOrderNumber, ...orderData } = createOrderDto;

        // Generate unique order number or use provided one
        const orderNumber = providedOrderNumber || `ORD-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`;

        // UUID regex for validation
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        try {
            const processedItems = await Promise.all(items.map(async (item) => {
                const { productId, ...itemData } = item;

                if (!productId || !uuidRegex.test(productId)) {
                    throw new Error(`Invalid or missing productId for item: ${itemData.productName}`);
                }

                // Ensure system pricing on Create
                const product = await this.prisma.product.findUnique({
                    where: { id: productId }
                });

                if (!product) {
                    throw new Error(`Product ID ${productId} not found.`);
                }

                const unitPrice = Number(product.sellingPrice) || 0;
                const subtotal = item.quantity * unitPrice;

                return {
                    ...itemData,
                    unitPrice,
                    subtotal,
                    product: { connect: { id: productId } },
                };
            }));

            // Auto-calculate totals if not provided
            if (!orderData.subtotal && processedItems.length > 0) {
                orderData.subtotal = processedItems.reduce((sum: number, item: any) => sum + item.subtotal, 0);
            }

            const sub = Number(orderData.subtotal) || 0;
            const ship = Number(orderData.shippingFee) || 0;
            const tax = Number(orderData.taxCollected) || 0;
            const disc = Number(orderData.discountGiven) || 0;

            if (!orderData.totalAmount) {
                orderData.totalAmount = sub + ship + tax - disc;
            }

            const newOrder = await this.prisma.order.create({
                data: {
                    ...orderData,
                    orderNumber,
                    subtotal: sub,
                    shippingFee: ship,
                    taxCollected: tax,
                    discountGiven: disc,
                    totalAmount: orderData.totalAmount,
                    orderStatus: 'Pending', // Default
                    items: {
                        create: processedItems
                    },
                },
                include: {
                    items: true,
                    customer: true,
                    fulfillmentCenter: true
                },
            });

            // Reserve Stock
            await this.inventoryService.reserveStock(newOrder.id);

            // Risk Assessment
            try {
                await this.riskScoringService.assessOrder(newOrder.id);

                // Fetch fresh order with updated riskAction
                const freshOrder = await this.prisma.order.findUnique({
                    where: { id: newOrder.id },
                    include: { items: true, customer: true, fulfillmentCenter: true },
                });

                // Auto-trigger Twilio call for NO-SKU orders
                await this.triggerCallIfEligible(freshOrder);

                return freshOrder;
            } catch (riskError) {
                console.error(`Risk assessment failed for order ${newOrder.id}:`, riskError);
                return newOrder;
            }
        } catch (error) {
            const fs = require('fs');
            fs.appendFileSync('error.log', new Date().toISOString() + ': ' + JSON.stringify(error, Object.getOwnPropertyNames(error), 2) + '\n');
            console.error('Order creation error:', error);
            throw error;
        }
    }

    private async triggerCallIfEligible(order: any): Promise<void> {
        try {
            // 1. Only trigger for orders that have at least one NO-SKU item
            const hasNoSkuItem = order.items?.some(
                (item: any) => item.sku?.startsWith('NO-SKU-')
            );
            if (!hasNoSkuItem) return;

            // 2. Check that Twilio calls are enabled for this store
            const storeSettings = await this.prisma.storeSettings.findFirst({
                where: { id: order.storeId },
                select: { enableTwilioCalls: true },
            });
            if (!storeSettings?.enableTwilioCalls) {
                console.log(`Order ${order.orderNumber}: Twilio calls disabled for store. Skipping.`);
                return;
            }

            // 3. Map riskAction to call script type
            const riskAction = order.riskAction;
            let scriptType: 'short' | 'long' | null = null;

            if (riskAction === 'twilio_short') {
                scriptType = 'short';
            } else if (riskAction === 'twilio_long') {
                scriptType = 'long';
            } else if (riskAction === 'auto_reject') {
                // Already handled by risk scoring — no call needed
                console.log(`Order ${order.orderNumber}: auto_reject — no call triggered.`);
                return;
            } else if (riskAction === 'call_center') {
                // Skip automated call, escalate directly to call center
                await this.twilioVoiceService.forwardToCallCenter(
                    order.id,
                    null,
                    null,
                    'High risk NO-SKU order — direct call center escalation',
                );
                return;
            } else {
                // No riskAction set or unrecognised — default to short call for all NO-SKU orders
                console.log(`Order ${order.orderNumber}: No riskAction set, defaulting to short call.`);
                scriptType = 'short';
            }

            // 4. Fire-and-forget with a 2s delay so:
            //    - The HTTP response returns to the frontend immediately
            //    - The DB idempotency key write is fully committed before the call starts
            setTimeout(async () => {
                try {
                    console.log(
                        `Order ${order.orderNumber}: Auto-triggering Twilio '${scriptType}' call for NO-SKU item.`
                    );
                    await this.twilioVoiceService.initiateConfirmationCall(order.id, scriptType);
                } catch (err: any) {
                    console.error(`Order ${order.orderNumber}: Auto-call failed: ${err.message}`);
                }
            }, 2000);

        } catch (err) {
            // Never crash order creation — this block is non-blocking
            console.error(`triggerCallIfEligible error for order ${order?.id}:`, err);
        }
    }

    /**
     * Parse date strings from CSV, handling European formats (DD/MM/YYYY, DD.MM.YYYY, DD-MM-YYYY).
     * Falls back to current date if the value is empty or unparseable.
     */
    private parseDate(value: any): Date {
        if (!value || value.toString().trim() === '') return new Date();

        const raw = value.toString().trim();

        // Try DD/MM/YYYY, DD.MM.YYYY, DD-MM-YYYY patterns
        const euroMatch = raw.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
        if (euroMatch) {
            const day = parseInt(euroMatch[1], 10);
            const month = parseInt(euroMatch[2], 10) - 1; // JS months are 0-indexed
            let year = parseInt(euroMatch[3], 10);
            if (year < 100) year += 2000;
            const d = new Date(year, month, day);
            if (!isNaN(d.getTime())) return d;
        }

        // Fallback: let JS try to parse natively (ISO, US formats, etc.)
        const parsed = new Date(raw);
        if (!isNaN(parsed.getTime())) return parsed;

        // If nothing works, default to now
        return new Date();
    }

    async findAll(filters?: {
        orderStatus?: string;
        confirmationStatus?: string;
        search?: string;
        searchType?: string;
        customerId?: string;
        skuType?: string;
        trafficChannel?: string;
        startDate?: Date;
        endDate?: Date;
        page?: number;
        limit?: number;
    }) {
        const { page = 1, limit = 20, ...where } = filters || {};
        const skip = (page - 1) * limit;

        const whereClause: any = {};

        if (where.orderStatus) whereClause.orderStatus = where.orderStatus;
        if (where.confirmationStatus) whereClause.confirmationStatus = where.confirmationStatus;
        if (where.customerId) whereClause.customerId = where.customerId;
        if (where.trafficChannel) whereClause.trafficChannel = where.trafficChannel;

        // SKU type filter: 'sku' = at least one real SKU item, 'non-sku' = all items are NO-SKU
        if (where.skuType === 'sku') {
            whereClause.items = { some: { sku: { not: { startsWith: 'NO-SKU-' } } } };
        } else if (where.skuType === 'non-sku') {
            whereClause.AND = [
                { items: { some: {} } },                              // has at least one item
                { items: { every: { sku: { startsWith: 'NO-SKU-' } } } }  // all items are NO-SKU
            ];
        }

        if (where.search) {
            const searchTerm = where.search.replace(/^#/, ''); // Strip leading '#'
            const type = where.searchType || 'orderNumber';

            if (type === 'orderNumber') {
                whereClause.orderNumber = { contains: searchTerm, mode: 'insensitive' };
            } else if (type === 'trackingNumber') {
                whereClause.trackingNumber = { contains: searchTerm, mode: 'insensitive' };
            } else if (type === 'customerName') {
                // Pre-query matching customers to avoid Prisma relation filter
                // type mismatch between Customer.id (text) and Order.customerId (uuid)
                const matchingCustomers = await this.prisma.customer.findMany({
                    where: { name: { contains: where.search, mode: 'insensitive' } },
                    select: { id: true }
                });
                const customerIds = matchingCustomers.map(c => c.id);
                if (customerIds.length > 0) {
                    whereClause.customerId = { in: customerIds };
                } else {
                    // No matching customers — return empty result immediately
                    return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
                }
            }
        }
        if (where.startDate || where.endDate) {
            whereClause.orderDate = {};
            if (where.startDate) whereClause.orderDate.gte = where.startDate;
            if (where.endDate) whereClause.orderDate.lte = where.endDate;
        }

        const [orders, total] = await Promise.all([
            this.prisma.order.findMany({
                where: whereClause,
                include: {
                    customer: true,
                    items: true,
                },
                orderBy: { orderDate: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.order.count({ where: whereClause }),
        ]);

        return {
            data: orders,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async findOne(id: string) {
        const order = await this.prisma.order.findUnique({
            where: { id },
            include: {
                customer: true,
                items: {
                    include: {
                        product: true,
                    },
                },
                fulfillmentCenter: true,
                trackingHistory: {
                    orderBy: {
                        statusDate: 'desc'
                    }
                },
                customerResponses: {
                    orderBy: {
                        sentAt: 'desc'
                    }
                },
                callLogs: {
                    orderBy: {
                        createdAt: 'desc'
                    }
                }
            },
        });

        if (!order) {
            throw new NotFoundException(`Order with ID ${id} not found`);
        }

        return order;
    }

    async update(id: string, updateOrderDto: UpdateOrderDto) {
        const { items, ...orderData } = updateOrderDto;

        try {
            const updateData: any = { ...orderData };

            // Rule 2: If tracking number is being set, auto-confirm the order
            if (updateData.trackingNumber && updateData.trackingNumber.trim() !== '') {
                if (!updateData.confirmationStatus) {
                    updateData.confirmationStatus = 'Confirmed';
                }
            }

            // Rule 3: Fulfillment center is required when order is confirmed
            if (updateData.confirmationStatus === 'Confirmed') {
                // Check if FC is being set in this update, or already exists on the order
                if (!updateData.fulfillmentCenterId) {
                    const existingOrder = await this.prisma.order.findUnique({
                        where: { id },
                        select: { fulfillmentCenterId: true },
                    });
                    if (!existingOrder?.fulfillmentCenterId) {
                        throw new Error('Fulfillment Center is required when confirming an order. Please assign a Fulfillment Center first.');
                    }
                }
            }

            if (items) {
                // Enforce System Price on Update
                const processedItems = await Promise.all(items.map(async (item) => {
                    const { productId, ...itemData } = item;

                    // Helper regex
                    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

                    if (productId && uuidRegex.test(productId)) {
                        const product = await this.prisma.product.findUnique({
                            where: { id: productId }
                        });

                        if (product) {
                            const unitPrice = Number(product.sellingPrice) || 0;
                            const subtotal = item.quantity * unitPrice;
                            return {
                                ...itemData,
                                unitPrice,
                                subtotal,
                                product: { connect: { id: productId } },
                            };
                        }
                    }

                    // Fallback if no product found (should catch error or allow legacy? User said Strict.)
                    // Plan says strict. But here strict means "automatically sync".
                    // If I throw error here, I might break updates for old data?
                    // Strict requirement: "If not import exact SKU match... system do not recognize".
                    // For manual updates, we assume user selects valid product.
                    // If productId is missing, it might be a text-only item? 
                    // The schema allows `productId` to be non-nullable? 
                    // Model OrderItem: productId String @map("product_id") @db.Uuid
                    // So productId IS required.

                    if (!productId) throw new Error("Product ID is required for order items.");
                    throw new Error(`Product with ID ${productId} not found.`);
                }));

                updateData.items = {
                    deleteMany: {},
                    create: processedItems
                };
            }

            const updatedOrder = await this.prisma.order.update({
                where: { id },
                data: updateData,
                include: {
                    items: true,
                    customer: true,
                },
            });

            // Trigger 17Track Registration if tracking number was updated
            if (updateData.trackingNumber && updateData.trackingNumber.trim() !== '') {
                const courier = updateData.courier || updatedOrder.courier;
                // Fire and forget (don't await so we don't block the request)
                this.trackingService.registerTracking(updateData.trackingNumber, courier).catch(e => console.error("Tracking Register Error:", e));
            }

            // Trigger Fulfillment if Shipped
            if (updatedOrder.orderStatus === 'Shipped') {
                await this.inventoryService.fulfillOrder(id);
            }

            // Trigger Sales Stock Deduction when Out for Delivery
            if (updatedOrder.orderStatus === 'OutForDelivery') {
                await this.inventoryService.deductSalesStock(id);
            }

            // Trigger Profit Calculation if confirmed
            if (updatedOrder.confirmationStatus === 'Confirmed') {
                await this.profitsService.calculateOrderProfit(id);
            }

            // Trigger Collection if delivered
            if (updatedOrder.orderStatus === 'Delivered') {
                await this.profitsService.recordCollection(id);
            }

            return updatedOrder;
        } catch (error) {
            console.error('Update Order Error:', error);
            throw new NotFoundException(`Order with ID ${id} not found or update failed`);
        }
    }

    async updateStatus(id: string, orderStatus: string) {
        try {
            const updatedOrder = await this.prisma.order.update({
                where: { id },
                data: { orderStatus },
            });

            if (orderStatus === 'Shipped') {
                await this.inventoryService.fulfillOrder(id);
            }

            // Trigger Sales Stock Deduction when Out for Delivery
            if (orderStatus === 'OutForDelivery') {
                await this.inventoryService.deductSalesStock(id);
            }

            if (orderStatus === 'Delivered') {
                await this.profitsService.recordCollection(id);
            }

            return updatedOrder;
        } catch (error) {
            throw new NotFoundException(`Order with ID ${id} not found`);
        }
    }

    async registerReturnTracking(id: string, returnTrackingNumber: string) {
        return this.inventoryService.registerReturnTracking(id, returnTrackingNumber);
    }

    async importOrders(data: any[], skipRiskAssessment: boolean, skipInventory: boolean) {
        const results = {
            created: 0,
            updated: 0,
            skipped: 0,
            errors: [] as { row: number, reason: string }[]
        };

        if (!data || !Array.isArray(data) || data.length === 0) {
            return results;
        }

        // Helper: Convert European decimal strings (e.g. "37,49" to 37.49)
        const parseEuropeanNumber = (val: any): number => {
            if (val === undefined || val === null || val === '') return 0;
            const cleaned = val.toString().replace(/\./g, '').replace(',', '.');
            return parseFloat(cleaned) || 0;
        };

        // Helper: Normalize phone numbers for strict matching
        const normalizePhone = (phone: any): string => {
            if (!phone) return '';
            // Treat "none", "n/a", "null", etc. as empty
            const raw = phone.toString().trim().toLowerCase();
            if (['none', 'n/a', 'na', 'null', '-', ''].includes(raw)) return '';
            const digits = phone.toString().replace(/[\s\-().]/g, '');
            if (digits.startsWith('+') || digits.startsWith('00')) return digits;
            if (digits.length >= 10) return '+' + digits;
            return digits;
        };

        // Group rows by order number to handle multi-item orders
        const ordersMap = new Map<string, any[]>();
        const blankOrders: any[][] = []; // Rows without an order number

        data.forEach((rawRow, index) => {
            const rowNum = index + 1; // 1-indexed for user display (excluding header)

            // Trim all fields (handles \r CRLF line endings)
            const row: any = Object.fromEntries(
                Object.entries(rawRow).map(([k, v]) => [k.trim(), String(v ?? '').trim()])
            );

            // Add original row number for error tracking
            row._originalRow = rowNum;

            let orderNumStr = row.order_number?.toString()?.trim();

            if (!orderNumStr) {
                blankOrders.push([row]); // Each blank row is a unique order
            } else {
                if (!ordersMap.has(orderNumStr)) {
                    ordersMap.set(orderNumStr, []);
                }
                ordersMap.get(orderNumStr)!.push(row);
            }
        });

        const allOrderGroups = [...Array.from(ordersMap.values()), ...blankOrders];

        for (const orderGroup of allOrderGroups) {
            const firstRow = orderGroup[0];
            const rowNum = firstRow._originalRow;
            const providedOrderNumber = firstRow.order_number?.toString()?.trim();

            try {
                // 1. Process Customer — always create a new customer per CSV row
                //    so the name from the CSV is always used correctly (duplicates allowed).
                let customerId: string | null = null;
                const phoneData = normalizePhone(firstRow.customer_phone);
                const nameData = firstRow.customer_name?.toString()?.trim() || 'Unknown Customer';

                // Check if the customer is blocked by phone (only if phone is provided)
                if (phoneData) {
                    const blockedCustomer = await this.prisma.customer.findFirst({
                        where: { phone: phoneData, isBlocked: true }
                    });
                    if (blockedCustomer) {
                        throw new Error(`Customer is blocked (Phone: ${phoneData}).`);
                    }
                }

                // Always create a new customer record so CSV name is preserved.
                // If email already exists, skip it to avoid unique constraint violation.
                const rawEmail = firstRow.customer_email?.toString()?.trim() || null;
                const emailData = rawEmail && !['none', 'n/a', 'na', 'null', '-'].includes(rawEmail.toLowerCase()) ? rawEmail : null;
                let emailForCreate = emailData;
                if (emailData) {
                    const existingEmail = await this.prisma.customer.findFirst({
                        where: { email: emailData }
                    });
                    if (existingEmail) {
                        emailForCreate = null; // Skip email to avoid unique constraint
                    }
                }

                const customer = await this.prisma.customer.create({
                    data: {
                        name: nameData,
                        phone: phoneData,
                        email: emailForCreate,
                        country: firstRow.shipping_country?.toString()?.trim() || 'Unknown'
                    }
                });
                customerId = customer.id;

                // 2. Process Items & Strict SKU Lookup
                const itemsToCreate: any[] = [];
                let calculatedSubtotal = 0;

                for (const row of orderGroup) {
                    const sku = row.sku?.toString()?.trim();
                    if (!sku) {
                        throw new Error(`Row ${row._originalRow}: Missing SKU.`);
                    }

                    const product = await this.prisma.product.findFirst({
                        where: { sku: sku }
                    });

                    if (!product) {
                        throw new Error(`Row ${row._originalRow}: Strict Product Match Failed - SKU '${sku}' not found.`);
                    }

                    const quantity = parseInt(row.quantity?.toString() || '1', 10);
                    const unitPrice = parseEuropeanNumber(row.price) || parseFloat(product.sellingPrice?.toString() || '0');
                    const subtotal = quantity * unitPrice;
                    calculatedSubtotal += subtotal;

                    itemsToCreate.push({
                        productName: product.name,
                        sku: product.sku,
                        quantity,
                        unitPrice,
                        subtotal,
                        product: { connect: { id: product.id } }
                    });
                }

                // 3. Upsert Order Logic
                const shippingFee = parseEuropeanNumber(firstRow.shipping_fee);
                const taxCollected = parseEuropeanNumber(firstRow.tax);
                const discountGiven = parseEuropeanNumber(firstRow.discount);
                const totalAmount = calculatedSubtotal + shippingFee + taxCollected - discountGiven;

                // ── Resolve storeId (FIX 3) ──
                const providedStoreId = firstRow.store_id?.toString()?.trim();
                const providedStoreName = firstRow.store_name?.toString()?.trim();

                let resolvedStoreId: string;
                if (providedStoreId) {
                    const storeExists = await this.prisma.storeSettings.findUnique({ where: { id: providedStoreId } });
                    if (!storeExists) throw new Error(`store_id '${providedStoreId}' not found in store_settings.`);
                    resolvedStoreId = providedStoreId;
                } else if (providedStoreName) {
                    const storeByName = await this.prisma.storeSettings.findFirst({ where: { storeName: { contains: providedStoreName, mode: 'insensitive' } } });
                    if (!storeByName) throw new Error(`Store '${providedStoreName}' not found.`);
                    resolvedStoreId = storeByName.id;
                } else {
                    const defaultStore = await this.prisma.storeSettings.findFirst({ orderBy: { createdAt: 'asc' } });
                    if (!defaultStore) throw new Error(`No stores found. Please create a store first.`);
                    resolvedStoreId = defaultStore.id;
                }

                const orderPayloadData = {
                    customerId,
                    storeId: resolvedStoreId,                                          // FIX 3
                    orderDate: this.parseDate(firstRow.order_date),
                    orderStatus: firstRow.order_status?.toString()?.trim() || 'Pending',
                    confirmationStatus: firstRow.confirmation_status?.toString()?.trim() || 'Pending',
                    // REMOVED: paymentMethod — column does not exist on Order model   // FIX 1
                    paymentStatus: firstRow.payment_status?.toString()?.trim() || 'Pending',
                    shippingAddressLine1: firstRow.shipping_address?.toString()?.trim() || '',
                    shippingPostalCode: firstRow.shipping_zipcode?.toString()?.trim() || null,
                    shippingCity: firstRow.shipping_city?.toString()?.trim() || '',
                    shippingProvince: firstRow.shipping_state?.toString()?.trim() || '', // FIX 2
                    shippingCountry: firstRow.shipping_country?.toString()?.trim() || 'Unknown',
                    subtotal: calculatedSubtotal,
                    shippingFee,
                    taxCollected,
                    discountGiven,
                    totalAmount,
                    notes: firstRow.notes?.toString()?.trim() || 'Imported via CSV',
                    trackingNumber: firstRow.tracking_number?.toString()?.trim() || null,
                    courier: firstRow.courier?.toString()?.trim() || null
                };

                // Rule 2: If tracking number present, auto-confirm
                if (orderPayloadData.trackingNumber) {
                    orderPayloadData.confirmationStatus = 'Confirmed';
                }

                let existingOrder: any = null;
                if (providedOrderNumber) {
                    existingOrder = await this.prisma.order.findUnique({
                        where: { orderNumber: providedOrderNumber }
                    });
                }

                let finalOrderId: string;

                if (existingOrder) {
                    // UPDATE existing (delete old items, replace with new)
                    const updatedOrder = await this.prisma.order.update({
                        where: { id: existingOrder.id },
                        data: {
                            ...orderPayloadData,
                            items: {
                                deleteMany: {}, // Clear existing items
                                create: itemsToCreate
                            }
                        }
                    });
                    finalOrderId = updatedOrder.id;
                    results.updated++;
                } else {
                    // CREATE new
                    const newOrder = await this.prisma.order.create({
                        data: {
                            ...orderPayloadData,
                            orderNumber: providedOrderNumber || `ORD-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`, // Use provided or generate new
                            items: {
                                create: itemsToCreate
                            }
                        }
                    });
                    finalOrderId = newOrder.id;
                    results.created++;
                }

                // Register tracking with 17Track for imported orders
                const finalTrackingNumber = orderPayloadData.trackingNumber;
                if (finalTrackingNumber && finalTrackingNumber.trim() !== '') {
                    const courier = orderPayloadData.courier || undefined;
                    this.trackingService.registerTracking(finalTrackingNumber, courier)
                        .catch(e => console.error('Import Tracking Register Error:', e));
                }

                // 4. Apply skip rules
                if (!skipInventory) {
                    await this.inventoryService.reserveStock(finalOrderId);
                }

                if (!skipRiskAssessment) {
                    try {
                        await this.riskScoringService.assessOrder(finalOrderId);
                    } catch (riskError) {
                        console.error(`Risk assessment failed for imported order ${finalOrderId}:`, riskError);
                    }
                }

            } catch (error: any) {
                // Determine if this was a multi-line failure or single-line
                const rowsAffected = orderGroup.map(r => r._originalRow).join(', ');
                results.errors.push({
                    row: rowNum, // The anchor row causing error
                    reason: `[Rows ${rowsAffected}]: ${error.message}`
                });
                results.skipped += orderGroup.length; // Skip the entire order payload
            }
        }

        return results;
    }

    async remove(id: string) {
        try {
            return await this.prisma.order.delete({
                where: { id },
            });
        } catch (error) {
            throw new NotFoundException(`Order with ID ${id} not found`);
        }
    }
}
