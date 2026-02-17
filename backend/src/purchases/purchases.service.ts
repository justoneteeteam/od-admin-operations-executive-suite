
import { Injectable, NotFoundException, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';

@Injectable()
export class PurchasesService {
    constructor(
        private prisma: PrismaService,
        private inventoryService: InventoryService
    ) { }

    async create(data: any) {
        const { items, ...purchaseData } = data;

        // Generate unique purchase order number
        const purchaseOrderNumber = `PO-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`;

        // Convert date strings to proper Date objects for Prisma DateTime fields
        if (purchaseData.orderDate) {
            purchaseData.orderDate = new Date(purchaseData.orderDate);
        }
        if (purchaseData.expectedDeliveryDate) {
            purchaseData.expectedDeliveryDate = new Date(purchaseData.expectedDeliveryDate);
        }
        if (purchaseData.receivedDate) {
            purchaseData.receivedDate = new Date(purchaseData.receivedDate);
        }

        try {
            const processedItems = items
                ? items.map((item: any) => ({
                    productId: item.productId,
                    quantity: item.quantity,
                    unitCost: item.unitCost,
                    purchasePrice: item.purchasePrice || item.unitCost, // Default to unitCost if purchasePrice missing
                    taxPercent: item.taxPercent,
                    purchaseTaxAmount: item.purchaseTaxAmount || item.taxAmount,
                    discountPercent: item.discountPercent,
                    purchaseDiscountAmount: item.purchaseDiscountAmount || item.discountAmount,
                    subtotal: item.quantity * item.unitCost,
                }))
                : [];

            // Auto-calculate totals if not provided
            if (!purchaseData.subtotal && processedItems.length > 0) {
                purchaseData.subtotal = processedItems.reduce((sum: number, item: any) => sum + item.subtotal, 0);
            }

            // Ensure numeric types for calculation
            const sub = Number(purchaseData.subtotal) || 0;
            const tax = Number(purchaseData.purchaseTaxAmount) || 0;
            const ship = Number(purchaseData.purchaseShippingCost) || 0;

            if (!purchaseData.totalAmount) {
                purchaseData.totalAmount = sub + tax + ship;
            }

            const newPurchase = await this.prisma.purchase.create({
                data: {
                    ...purchaseData,
                    purchaseOrderNumber,
                    subtotal: sub,
                    totalAmount: purchaseData.totalAmount,
                    purchaseStatus: 'Draft',
                    purchaseTaxAmount: tax,
                    purchaseShippingCost: ship,
                    items: {
                        create: processedItems
                    },
                },
                include: {
                    items: true,
                    supplier: true,
                    fulfillmentCenter: true,
                    warehouse: true,
                },
            });

            return newPurchase;

        } catch (error) {
            throw new HttpException({
                status: HttpStatus.INTERNAL_SERVER_ERROR,
                error: `Failed to create purchase: ${String(error)}`,
                details: JSON.stringify(error),
            }, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async findAll(filters?: {
        purchaseStatus?: string;
        supplierId?: string;
        page?: number;
        limit?: number;
    }) {
        const { page = 1, limit = 20, ...where } = filters || {};
        const skip = (page - 1) * limit;

        const whereClause: any = {};
        if (where.purchaseStatus) whereClause.purchaseStatus = where.purchaseStatus;
        if (where.supplierId) whereClause.supplierId = where.supplierId;

        const [purchases, total] = await Promise.all([
            this.prisma.purchase.findMany({
                where: whereClause,
                include: {
                    supplier: true,
                    fulfillmentCenter: true,
                    warehouse: true,
                    items: true,
                },
                orderBy: { orderDate: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.purchase.count({ where: whereClause }),
        ]);

        return {
            data: purchases,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async findOne(id: string) {
        const purchase = await this.prisma.purchase.findUnique({
            where: { id },
            include: {
                supplier: true,
                fulfillmentCenter: true,
                warehouse: true,
                items: {
                    include: {
                        product: true,
                    },
                },
            },
        });

        if (!purchase) {
            throw new NotFoundException(`Purchase with ID ${id} not found`);
        }

        return purchase;
    }

    async update(id: string, data: any) {
        const { items, ...purchaseData } = data;

        try {
            return await this.prisma.purchase.update({
                where: { id },
                data: purchaseData,
                include: {
                    items: true,
                    supplier: true,
                    fulfillmentCenter: true,
                    warehouse: true,
                },
            });
        } catch (error) {
            throw new NotFoundException(`Purchase with ID ${id} not found`);
        }
    }

    async updateStatus(id: string, status: string) {
        try {
            return await this.prisma.purchase.update({
                where: { id },
                data: { purchaseStatus: status },
            });
        } catch (error) {
            throw new NotFoundException(`Purchase with ID ${id} not found`);
        }
    }

    async remove(id: string) {
        try {
            return await this.prisma.purchase.delete({
                where: { id },
            });
        } catch (error) {
            throw new NotFoundException(`Purchase with ID ${id} not found`);
        }
    }


    async receiveGoods(
        purchaseId: string,
        receivedItems: Array<{ productId: string; quantity: number; warehouseId: string }>
    ) {
        const purchase = await this.findOne(purchaseId);

        // Calculate allocation ratio for Landed Cost (Shipping + Tax + Other)
        const p = purchase as any;
        const totalExtraCost = Number(p.purchaseShippingCost || 0) + Number(p.purchaseTaxAmount || 0) + Number(p.otherCosts || 0);
        const purchaseSubtotal = Number(p.subtotal || 1); // Avoid div by zero

        for (const receivedItem of receivedItems) {
            const purchaseItem = purchase.items.find((item: any) => item.productId === receivedItem.productId);
            if (!purchaseItem) continue;

            // Allocation based on value
            const itemSubtotal = Number(purchaseItem.quantity) * Number(purchaseItem.unitCost);
            const valueRatio = itemSubtotal / purchaseSubtotal;
            const allocatedExtra = totalExtraCost * valueRatio;
            const unitAllocatedExtra = allocatedExtra / purchaseItem.quantity;

            const landedUnitCost = Number(purchaseItem.unitCost) + unitAllocatedExtra;

            // Update Inventory (Increment)
            await this.inventoryService.adjustStock(
                receivedItem.productId,
                receivedItem.warehouseId,
                receivedItem.quantity,
                `Received PO ${purchase.purchaseOrderNumber}`,
                undefined, // userId
                'purchase_in'
            );

            // Update Purchase Item (Received Qty & Landed Cost)
            await this.prisma.purchaseItem.update({
                where: { id: purchaseItem.id },
                data: {
                    receivedQuantity: { increment: receivedItem.quantity },
                    landedCost: landedUnitCost
                }
            });
        }

        // Check if fully received
        const updatedPurchase = await this.findOne(purchaseId);
        const allReceived = updatedPurchase.items.every((item: any) => (item.receivedQuantity || 0) >= item.quantity);

        await this.updateStatus(purchaseId, allReceived ? 'Received' : 'Partially Received');

        return updatedPurchase;
    }
}
