
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';

import { ProfitsService } from '../profits/profits.service';
import { InventoryService } from '../inventory/inventory.service';
import { RiskScoringService } from '../risk-scoring/risk-scoring.service';
import { TrackingService } from '../tracking/tracking.service';

@Injectable()
export class OrdersService {
    constructor(
        private prisma: PrismaService,
        private profitsService: ProfitsService,
        private inventoryService: InventoryService,
        private riskScoringService: RiskScoringService,
        private trackingService: TrackingService
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
                // Return fresh order object with risk fields
                return await this.prisma.order.findUnique({
                    where: { id: newOrder.id },
                    include: { items: true, customer: true, fulfillmentCenter: true }
                });
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

    async findAll(filters?: {
        orderStatus?: string;
        confirmationStatus?: string;
        search?: string;
        customerId?: string;
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

        if (where.search) {
            whereClause.OR = [
                { orderNumber: { contains: where.search, mode: 'insensitive' } },
                {
                    customer: {
                        name: { contains: where.search, mode: 'insensitive' }
                    }
                }
            ];
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

            if (orderStatus === 'Delivered') {
                await this.profitsService.recordCollection(id);
            }

            return updatedOrder;
        } catch (error) {
            throw new NotFoundException(`Order with ID ${id} not found`);
        }
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
                // 1. Process Customer (Match by phone, block if rejected, create if missing)
                let customerId: string | null = null;
                const phoneData = normalizePhone(firstRow.customer_phone);
                const nameData = firstRow.customer_name?.toString()?.trim() || 'Unknown Customer';

                if (!phoneData) {
                    throw new Error("Missing 'customer_phone'.");
                }

                let customer = await this.prisma.customer.findFirst({
                    where: { phone: phoneData }
                });

                if (customer) {
                    if (customer.isBlocked) {
                        throw new Error(`Customer is blocked (Phone: ${phoneData}).`);
                    }
                    customerId = customer.id;
                } else {
                    customer = await this.prisma.customer.create({
                        data: {
                            name: nameData,
                            phone: phoneData,
                            email: firstRow.customer_email?.toString()?.trim(),
                            country: firstRow.shipping_country?.toString()?.trim() || 'Unknown'
                        }
                    });
                    customerId = customer.id;
                }

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

                const orderPayloadData = {
                    customerId,
                    storeId: firstRow.store_id?.toString()?.trim() || 'import-default',
                    orderDate: firstRow.order_date ? new Date(firstRow.order_date) : new Date(),
                    orderStatus: firstRow.order_status?.toString()?.trim() || 'Pending',
                    confirmationStatus: firstRow.confirmation_status?.toString()?.trim() || 'Pending',
                    paymentMethod: firstRow.payment_method?.toString()?.trim() || 'COD',
                    paymentStatus: firstRow.payment_status?.toString()?.trim() || 'Pending',
                    shippingAddressLine1: firstRow.shipping_address?.toString()?.trim() || '',
                    shippingCity: firstRow.shipping_city?.toString()?.trim() || '',
                    shippingState: firstRow.shipping_state?.toString()?.trim() || '',
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
