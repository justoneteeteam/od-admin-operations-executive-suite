
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';

import { ProfitsService } from '../profits/profits.service';
import { InventoryService } from '../inventory/inventory.service';

@Injectable()
export class OrdersService {
    constructor(
        private prisma: PrismaService,
        private profitsService: ProfitsService,
        private inventoryService: InventoryService
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

            return newOrder;
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
