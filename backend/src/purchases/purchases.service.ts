
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
        const { items, logisticCompanyIds, ...purchaseData } = data;

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

        // Sanitize optional UUID fields – empty strings are not valid UUIDs
        if (!purchaseData.warehouseId) {
            purchaseData.warehouseId = null;
        }

        try {
            const processedItems = items
                ? items.map((item: any) => ({
                    productId: item.productId,
                    warehouseId: item.warehouseId || null,
                    partnerSku: item.partnerSku || null,
                    quantity: item.quantity,
                    unitCost: item.unitCost,
                    purchasePrice: item.purchasePrice || item.unitCost,
                    taxPercent: item.taxPercent || 0,
                    purchaseTaxAmount: item.purchaseTaxAmount || item.taxAmount || 0,
                    purchaseDiscountAmount: item.purchaseDiscountAmount || item.discountAmount || 0,
                    subtotal: item.subtotal || (item.quantity * item.unitCost),
                    domesticShippingFeeCny: item.domesticShippingFeeCny || 0,
                    vndCurrencyRate: item.vndCurrencyRate || 0,
                    parcelKg: item.parcelKg || 0,
                    internationalShippingFeeCny: item.internationalShippingFeeCny || 0,
                    internationalShippingFeeVnd: item.internationalShippingFeeVnd || 0,
                }))
                : [];

            // Auto-calculate totals if not provided
            const itemsSubtotal = processedItems.length > 0
                ? processedItems.reduce((sum: number, item: any) => sum + (Number(item.subtotal) || 0), 0)
                : 0;

            const sub = Number(purchaseData.subtotal) || itemsSubtotal;
            const tax = Number(purchaseData.purchaseTaxAmount) || 0;
            const ship = Number(purchaseData.purchaseShippingCost) || 0;
            const total = Number(purchaseData.totalAmount) || (sub + tax + ship);

            // Auto-infer fulfillmentCenterId from the first item's warehouse
            let inferredFcId = purchaseData.fulfillmentCenterId || null;
            if (!inferredFcId && processedItems.length > 0) {
                const firstWhId = processedItems.find((i: any) => i.warehouseId)?.warehouseId;
                if (firstWhId) {
                    const wh = await this.prisma.warehouse.findUnique({ where: { id: firstWhId }, select: { fulfillmentCenterId: true } });
                    inferredFcId = wh?.fulfillmentCenterId || null;
                }
            }

            // Explicitly pick only valid Purchase model fields (prevent extra fields from breaking Prisma)
            const newPurchase = await this.prisma.purchase.create({
                data: {
                    purchaseOrderNumber,
                    supplierId: purchaseData.supplierId,
                    fulfillmentCenterId: inferredFcId,
                    warehouseId: purchaseData.warehouseId || null,
                    orderDate: purchaseData.orderDate ? new Date(purchaseData.orderDate) : new Date(),
                    expectedDeliveryDate: purchaseData.expectedDeliveryDate ? new Date(purchaseData.expectedDeliveryDate) : null,
                    receivedDate: purchaseData.receivedDate ? new Date(purchaseData.receivedDate) : null,
                    trackingNumber: purchaseData.trackingNumber || null,
                    fulfillmentRef: purchaseData.fulfillmentRef || null,
                    notes: purchaseData.notes || null,
                    purchaseStatus: purchaseData.purchaseStatus || 'Draft',
                    subtotal: sub,
                    totalAmount: total,
                    purchaseTaxAmount: tax,
                    purchaseShippingCost: ship,
                    items: {
                        create: processedItems
                    },
                    ...(logisticCompanyIds?.length > 0 && {
                        logisticCompanies: {
                            create: logisticCompanyIds.map((lcId: string) => ({
                                logisticCompanyId: lcId,
                            })),
                        },
                    }),
                },
                include: {
                    items: { include: { product: true, warehouse: true } },
                    supplier: true,
                    fulfillmentCenter: true,
                    warehouse: true,
                    logisticCompanies: { include: { logisticCompany: true } },
                },
            });

            // Auto-calculate weighted average product cost (EUR) for each product
            await this.updateProductCostsFromPurchase(processedItems);

            return newPurchase;

        } catch (error) {
            console.error('Purchase create error:', error);
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
                    items: {
                        include: {
                            product: true,
                            warehouse: true,
                        },
                    },
                    logisticCompanies: { include: { logisticCompany: true } },
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
                        warehouse: true,
                    },
                },
                logisticCompanies: { include: { logisticCompany: true } },
            },
        });

        if (!purchase) {
            throw new NotFoundException(`Purchase with ID ${id} not found`);
        }

        return purchase;
    }

    async update(id: string, data: any) {
        const { items, logisticCompanyIds, ...purchaseData } = data;

        try {
            // If logisticCompanyIds provided, delete existing and re-create
            if (logisticCompanyIds !== undefined) {
                await this.prisma.purchaseLogisticCompany.deleteMany({ where: { purchaseId: id } });
                if (logisticCompanyIds.length > 0) {
                    await this.prisma.purchaseLogisticCompany.createMany({
                        data: logisticCompanyIds.map((lcId: string) => ({
                            purchaseId: id,
                            logisticCompanyId: lcId,
                        })),
                    });
                }
            }

            // If items provided, delete existing items and re-create
            let affectedProductIds: string[] = [];
            if (items && items.length > 0) {
                // Collect product IDs from OLD items so their costs get recalculated too
                const oldItems = await this.prisma.purchaseItem.findMany({
                    where: { purchaseId: id },
                    select: { productId: true },
                });
                const oldProductIds = oldItems.map((i) => i.productId);

                await this.prisma.purchaseItem.deleteMany({ where: { purchaseId: id } });

                const processedItems = items.map((item: any) => ({
                    purchaseId: id,
                    productId: item.productId,
                    warehouseId: item.warehouseId || null,
                    partnerSku: item.partnerSku || null,
                    quantity: item.quantity,
                    unitCost: item.unitCost,
                    purchasePrice: item.purchasePrice || item.unitCost,
                    taxPercent: item.taxPercent || 0,
                    purchaseTaxAmount: item.purchaseTaxAmount || item.taxAmount || 0,
                    purchaseDiscountAmount: item.purchaseDiscountAmount || item.discountAmount || 0,
                    subtotal: item.subtotal || (item.quantity * item.unitCost),
                    domesticShippingFeeCny: item.domesticShippingFeeCny || 0,
                    vndCurrencyRate: item.vndCurrencyRate || 0,
                    parcelKg: item.parcelKg || 0,
                    internationalShippingFeeCny: item.internationalShippingFeeCny || 0,
                    internationalShippingFeeVnd: item.internationalShippingFeeVnd || 0,
                }));

                await this.prisma.purchaseItem.createMany({ data: processedItems });

                const newProductIds = processedItems.map((i) => i.productId);
                affectedProductIds = [...new Set([...oldProductIds, ...newProductIds])];
            }

            // Explicitly pick only valid Purchase model fields
            const updateData: any = {};
            if (purchaseData.supplierId) updateData.supplierId = purchaseData.supplierId;
            if (purchaseData.fulfillmentCenterId) updateData.fulfillmentCenterId = purchaseData.fulfillmentCenterId;
            if ('warehouseId' in purchaseData) updateData.warehouseId = purchaseData.warehouseId || null;
            if (purchaseData.orderDate) updateData.orderDate = new Date(purchaseData.orderDate);
            if ('trackingNumber' in purchaseData) updateData.trackingNumber = purchaseData.trackingNumber || null;
            if ('fulfillmentRef' in purchaseData) updateData.fulfillmentRef = purchaseData.fulfillmentRef || null;
            if ('notes' in purchaseData) updateData.notes = purchaseData.notes || null;
            if (purchaseData.purchaseStatus) updateData.purchaseStatus = purchaseData.purchaseStatus;
            if (purchaseData.subtotal !== undefined) updateData.subtotal = Number(purchaseData.subtotal) || 0;
            if (purchaseData.totalAmount !== undefined) updateData.totalAmount = Number(purchaseData.totalAmount) || 0;
            if (purchaseData.purchaseTaxAmount !== undefined) updateData.purchaseTaxAmount = Number(purchaseData.purchaseTaxAmount) || 0;
            if (purchaseData.purchaseShippingCost !== undefined) updateData.purchaseShippingCost = Number(purchaseData.purchaseShippingCost) || 0;

            const updatedPurchase = await this.prisma.purchase.update({
                where: { id },
                data: updateData,
                include: {
                    items: { include: { product: true, warehouse: true } },
                    supplier: true,
                    fulfillmentCenter: true,
                    warehouse: true,
                    logisticCompanies: { include: { logisticCompany: true } },
                },
            });

            // Recalculate weighted average product costs for all affected products
            if (affectedProductIds.length > 0) {
                await this.updateProductCostsForProducts(affectedProductIds);
            }

            return updatedPurchase;
        } catch (error) {
            console.error('Purchase update error:', error);
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

    async removeMany(ids: string[]) {
        if (!ids || ids.length === 0) return { count: 0 };

        // Delete child rows first to avoid FK constraints
        await this.prisma.purchaseItem.deleteMany({
            where: { purchaseId: { in: ids } },
        });
        await this.prisma.purchaseLogisticCompany.deleteMany({
            where: { purchaseId: { in: ids } },
        });

        const result = await this.prisma.purchase.deleteMany({
            where: { id: { in: ids } },
        });
        return { count: result.count };
    }

    /**
     * Recalculate weighted average unit cost (EUR) for specified products
     * from ALL their purchase items across all purchases.
     *
     * Formula per purchase item:
     *   landedCostVnd = ((buyPricePerUnit × qty) + domShip + intlShip - discount) / qty
     *   landedCostEur = landedCostVnd × vndToEurRate
     *
     * Weighted average = Σ(landedCostEur × qty) / Σ(qty)
     */
    private async updateProductCostsForProducts(productIds: string[]) {
        for (const productId of productIds) {
            // Fetch ALL purchase items for this product across all purchases
            const allItems = await this.prisma.purchaseItem.findMany({
                where: { productId },
            });

            if (allItems.length === 0) continue;

            let totalWeightedCost = 0;
            let totalQuantity = 0;

            for (const item of allItems) {
                const qty = Number(item.quantity) || 0;
                if (qty <= 0) continue;

                const buyPrice = Number(item.purchasePrice) || 0;
                const domShip = Number(item.domesticShippingFeeCny) || 0;
                const intlShip = Number(item.internationalShippingFeeVnd) || 0;
                const discount = Number(item.purchaseDiscountAmount) || 0;
                const vndToEur = Number(item.vndCurrencyRate) || 0;

                // Per-unit landed cost in VND
                const totalCostVnd = (buyPrice * qty) + domShip + intlShip - discount;
                const costPerUnitVnd = totalCostVnd / qty;

                // Convert to EUR
                const costPerUnitEur = costPerUnitVnd * vndToEur;

                totalWeightedCost += costPerUnitEur * qty;
                totalQuantity += qty;
            }

            if (totalQuantity > 0) {
                const weightedAvgCost = totalWeightedCost / totalQuantity;

                await this.prisma.product.update({
                    where: { id: productId },
                    data: {
                        unitCost: Math.round(weightedAvgCost * 100) / 100,
                        weightedAverageCost: Math.round(weightedAvgCost * 100) / 100,
                    },
                });
            }
        }
    }

    /**
     * Legacy wrapper – extracts product IDs from a processed items array
     * and delegates to updateProductCostsForProducts.
     */
    private async updateProductCostsFromPurchase(purchaseItems: any[]) {
        const productIds = [...new Set(purchaseItems.map((item: any) => item.productId))];
        await this.updateProductCostsForProducts(productIds);
    }

    async receiveGoods(
        purchaseId: string,
        receivedItems: Array<{ purchaseItemId: string; productId: string; quantity: number; warehouseId: string; partnerSku?: string }>
    ) {
        const purchase = await this.findOne(purchaseId);

        // Calculate allocation ratio for Landed Cost (Shipping + Tax + Other)
        const p = purchase as any;
        const totalExtraCost = Number(p.purchaseShippingCost || 0) + Number(p.purchaseTaxAmount || 0) + Number(p.otherCosts || 0);
        const purchaseSubtotal = Number(p.subtotal || 1); // Avoid div by zero

        for (const receivedItem of receivedItems) {
            // Find matching purchase item by ID or fallback to productId
            const purchaseItem = purchase.items.find((item: any) =>
                receivedItem.purchaseItemId ? item.id === receivedItem.purchaseItemId : item.productId === receivedItem.productId
            );
            if (!purchaseItem) continue;

            // Determine warehouse: receivedItem > purchaseItem > header
            const warehouseId = receivedItem.warehouseId || (purchaseItem as any).warehouseId || purchase.warehouseId;
            if (!warehouseId) continue; // Can't receive without a warehouse

            // Determine partnerSku: receivedItem input > purchaseItem stored value
            const partnerSku = receivedItem.partnerSku || (purchaseItem as any).partnerSku || undefined;

            // Allocation based on value
            const itemSubtotal = Number(purchaseItem.quantity) * Number(purchaseItem.unitCost);
            const valueRatio = itemSubtotal / purchaseSubtotal;
            const allocatedExtra = totalExtraCost * valueRatio;
            const unitAllocatedExtra = allocatedExtra / purchaseItem.quantity;

            const landedUnitCost = Number(purchaseItem.unitCost) + unitAllocatedExtra;

            // Update Inventory (Increment) — pass partnerSku to set child SKU
            await this.inventoryService.adjustStock(
                receivedItem.productId,
                warehouseId,
                receivedItem.quantity,
                `Received PO ${purchase.purchaseOrderNumber}`,
                undefined, // userId
                'purchase_in',
                partnerSku  // 7th param: sets InventoryLevel.partnerSku
            );

            // Update Purchase Item (Received Qty, Landed Cost, and partnerSku if provided)
            const itemUpdateData: any = {
                receivedQuantity: { increment: receivedItem.quantity },
                landedCost: landedUnitCost
            };
            if (partnerSku) {
                itemUpdateData.partnerSku = partnerSku;
            }
            if (!purchaseItem.warehouseId && warehouseId) {
                itemUpdateData.warehouseId = warehouseId;
            }
            await this.prisma.purchaseItem.update({
                where: { id: purchaseItem.id },
                data: itemUpdateData
            });
        }

        // Check if fully received
        const updatedPurchase = await this.findOne(purchaseId);
        const allReceived = updatedPurchase.items.every((item: any) => (item.receivedQuantity || 0) >= item.quantity);

        await this.updateStatus(purchaseId, allReceived ? 'Received' : 'Partially Received');

        return updatedPurchase;
    }

    /**
     * Returns incoming stock from Ordered POs (not yet received).
     * Groups by productId + warehouseId, summing remaining qty.
     */
    async getIncomingStock() {
        const orderedItems = await this.prisma.purchaseItem.findMany({
            where: {
                purchase: {
                    purchaseStatus: { in: ['Ordered', 'Partially Received'] }
                },
                warehouseId: { not: null },
            },
            include: {
                product: { select: { id: true, name: true, sku: true } },
                warehouse: { select: { id: true, name: true, fulfillmentCenterId: true } },
                purchase: { select: { purchaseOrderNumber: true, purchaseStatus: true, expectedDeliveryDate: true } },
            },
        });

        // Group by productId + warehouseId
        const grouped: Record<string, any> = {};
        for (const item of orderedItems) {
            const remaining = item.quantity - (item.receivedQuantity || 0);
            if (remaining <= 0) continue;
            const key = `${item.productId}_${item.warehouseId}`;
            if (!grouped[key]) {
                grouped[key] = {
                    productId: item.productId,
                    productName: item.product.name,
                    productSku: item.product.sku,
                    warehouseId: item.warehouseId,
                    warehouseName: item.warehouse?.name || 'Unknown',
                    incomingQty: 0,
                    purchaseOrders: [],
                };
            }
            grouped[key].incomingQty += remaining;
            grouped[key].purchaseOrders.push({
                poNumber: item.purchase.purchaseOrderNumber,
                status: item.purchase.purchaseStatus,
                expectedDate: item.purchase.expectedDeliveryDate,
                remainingQty: remaining,
            });
        }

        return Object.values(grouped);
    }
}
