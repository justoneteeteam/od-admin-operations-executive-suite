import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class InventoryService {
    constructor(private prisma: PrismaService) { }

    async createWarehouse(data: { name: string; fulfillmentCenterId: string; location?: string }) {
        return this.prisma.warehouse.create({ data });
    }

    async getAllWarehouses() {
        return this.prisma.warehouse.findMany({
            include: {
                fulfillmentCenter: { select: { id: true, name: true, code: true, country: true } },
            },
        });
    }

    async getProductsWithStock(warehouseId?: string) {
        // 1) Fetch ALL products with a valid SKU (exclude null, empty, NO-SKU prefixed)
        const allProducts = await this.prisma.product.findMany({
            where: {
                isActive: true,
                sku: { not: '' },
                NOT: [
                    { sku: { startsWith: 'NO-SKU' } },
                    { sku: { startsWith: 'NO SKU' } },
                    { sku: { startsWith: 'NOSKU' } },
                ],
            },
            orderBy: { name: 'asc' },
        });

        // 2) Fetch inventory levels (optionally filtered by warehouseId)
        const levelWhereClause: any = {};
        if (warehouseId && warehouseId !== 'all') {
            levelWhereClause.warehouseId = warehouseId;
        }

        const levels = await this.prisma.inventoryLevel.findMany({
            where: levelWhereClause,
            include: { warehouse: { select: { id: true, name: true, fulfillmentCenterId: true } } },
        });

        // 3) Build product map — start with all valid-SKU products at 0
        const productMap = new Map<string, any>();
        for (const product of allProducts) {
            productMap.set(product.id, {
                ...product,
                currentStock: 0,
                reservedStock: 0,
                outboundQty: 0,
                returningQty: 0,
                warehouseBreakdown: [],
            });
        }

        // 4) Layer inventory levels on top (left-join effect)
        for (const level of levels) {
            const p = productMap.get(level.productId);
            if (!p) continue; // skip levels for inactive or NO-SKU products

            p.currentStock += level.currentQuantity;
            p.reservedStock += level.reservedQuantity;
            p.outboundQty += (level as any).outboundQty || 0;
            p.returningQty += (level as any).returningQty || 0;
            p.warehouseBreakdown.push({
                warehouseId: level.warehouseId,
                warehouseName: level.warehouse?.name || null,
                fulfillmentCenterId: level.warehouse?.fulfillmentCenterId || null,
                current: level.currentQuantity,
                reserved: level.reservedQuantity,
                outbound: (level as any).outboundQty || 0,
                returning: (level as any).returningQty || 0,
                partnerSku: (level as any).partnerSku || null,
            });
        }

        return Array.from(productMap.values());
    }

    async getDashboardMetrics(warehouseId?: string) {
        const totalProducts = await this.prisma.product.count({ where: { isActive: true } });

        const whereClause: any = {};
        if (warehouseId && warehouseId !== 'all') {
            whereClause.warehouseId = warehouseId;
        }

        const levels = await this.prisma.inventoryLevel.findMany({
            where: whereClause,
            include: { product: { select: { unitCost: true, sku: true } } }
        });

        let totalInventoryValue = 0;
        let lowStockCount = 0;
        let outOfStockCount = 0;
        const productStock: Record<string, number> = {};

        for (const level of levels) {
            const cost = Number(level.product.unitCost) || 0;
            totalInventoryValue += level.currentQuantity * cost;
            if (!productStock[level.productId]) productStock[level.productId] = 0;
            productStock[level.productId] += level.currentQuantity;
        }

        const products = await this.prisma.product.findMany({ select: { id: true, reorderPoint: true } });

        for (const p of products) {
            const qty = productStock[p.id] || 0;
            if (qty === 0) outOfStockCount++;
            else if (qty <= (p.reorderPoint || 10)) lowStockCount++;
        }

        return { totalInventoryValue, lowStockCount, outOfStockCount, totalProducts };
    }

    async getInventoryLevels(productId: string) {
        const levels = await this.prisma.inventoryLevel.findMany({
            where: { productId },
            include: {
                warehouse: { include: { fulfillmentCenter: true } },
            },
        });

        const totalCurrent = levels.reduce((sum, l) => sum + l.currentQuantity, 0);
        const totalReserved = levels.reduce((sum, l) => sum + l.reservedQuantity, 0);
        const totalAvailable = totalCurrent - totalReserved;

        return { productId, totalCurrent, totalReserved, totalAvailable, warehouses: levels };
    }

    async getTransactions(warehouseId?: string, productId?: string) {
        const whereClause: any = {};
        if (warehouseId && warehouseId !== 'all') whereClause.warehouseId = warehouseId;
        if (productId) whereClause.productId = productId;

        return this.prisma.inventoryTransaction.findMany({
            where: whereClause,
            include: {
                product: { select: { name: true, sku: true } },
                warehouse: { select: { name: true } }
            },
            orderBy: { createdAt: 'desc' },
            take: 100
        });
    }

    async adjustStock(
        productId: string,
        warehouseId: string,
        quantityChange: number,
        reason: string,
        userId?: string,
        type: 'adjustment' | 'purchase_in' | 'order_out' | 'transfer_in' | 'transfer_out' | 'return_restock' | 'write_off' | 'manual_return' = 'adjustment',
        partnerSku?: string,
    ) {
        const createData: any = {
            productId, warehouseId,
            currentQuantity: quantityChange > 0 ? quantityChange : 0,
            reservedQuantity: 0,
        };
        const updateData: any = { currentQuantity: { increment: quantityChange } };

        if (partnerSku !== undefined) {
            createData.partnerSku = partnerSku;
            updateData.partnerSku = partnerSku;
        }

        const level = await this.prisma.inventoryLevel.upsert({
            where: { productId_warehouseId: { productId, warehouseId } },
            create: createData,
            update: updateData,
        });

        await this.prisma.inventoryTransaction.create({
            data: { type, quantity: quantityChange, productId, warehouseId, referenceId: reason, userId },
        });

        return level;
    }

    // ─── NEW: Update float columns atomically ─────────────────────────────
    async updateStockFloat(
        productId: string,
        warehouseId: string,
        field: 'outboundQty' | 'returningQty',
        delta: number
    ) {
        await this.prisma.inventoryLevel.upsert({
            where: { productId_warehouseId: { productId, warehouseId } },
            create: { productId, warehouseId, currentQuantity: 0, reservedQuantity: 0, [field]: Math.max(0, delta) },
            update: { [field]: { increment: delta } },
        });
    }

    // ─── NEW: Get stock summary for a single product ──────────────────────
    async getProductStockSummary(productId: string) {
        const levels = await this.prisma.inventoryLevel.findMany({
            where: { productId },
            include: { warehouse: { select: { id: true, name: true } } },
        });

        if (levels.length === 0) throw new NotFoundException(`No inventory records found for product ${productId}`);

        const totalCurrent = levels.reduce((s, l) => s + l.currentQuantity, 0);
        const totalReserved = levels.reduce((s, l) => s + l.reservedQuantity, 0);
        const totalOutbound = levels.reduce((s, l) => s + ((l as any).outboundQty || 0), 0);
        const totalReturning = levels.reduce((s, l) => s + ((l as any).returningQty || 0), 0);

        return {
            productId,
            available: totalCurrent - totalReserved,
            committed: totalReserved,
            outboundQty: totalOutbound,
            returningQty: totalReturning,
            totalFloat: totalOutbound + totalReturning,
            warehouses: levels.map(l => ({
                warehouseId: l.warehouseId,
                warehouseName: l.warehouse.name,
                current: l.currentQuantity,
                reserved: l.reservedQuantity,
                outbound: (l as any).outboundQty || 0,
                returning: (l as any).returningQty || 0,
            })),
        };
    }

    // ─── NEW: Write off returning stock ──────────────────────────────────
    async writeOffStock(orderId: string, reason: string, notes?: string, userId?: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: { items: true },
        });
        if (!order) throw new NotFoundException(`Order ${orderId} not found`);
        if ((order as any).returnStockState === 'written_off') {
            throw new BadRequestException('Stock already written off for this order');
        }

        await this.prisma.$transaction(async (tx) => {
            for (const item of order.items) {
                if (!item.productId) continue;

                // Find warehouse with highest returning_qty for this product
                const level = await tx.inventoryLevel.findFirst({
                    where: { productId: item.productId, returningQty: { gt: 0 } } as any,
                    orderBy: { returningQty: 'desc' } as any,
                });

                if (level) {
                    await tx.inventoryLevel.update({
                        where: { id: level.id },
                        data: { returningQty: { decrement: item.quantity } } as any,
                    });
                }

                await tx.inventoryTransaction.create({
                    data: {
                        type: 'write_off',
                        quantity: -item.quantity,
                        productId: item.productId,
                        warehouseId: level?.warehouseId || '',
                        referenceId: orderId,
                        reason: notes || reason,
                        userId,
                    },
                });
            }

            await tx.order.update({
                where: { id: orderId },
                data: {
                    returnStockState: 'written_off',
                    returnWriteOffReason: reason,
                    needsRestockConfirm: false,
                } as any,
            });
        });

        return { success: true, orderId, reason };
    }

    // ─── NEW: Confirm restock after inspection ───────────────────────────
    async confirmRestock(orderId: string, condition: 'ok' | 'damaged', userId?: string) {
        if (condition === 'damaged') {
            return this.writeOffStock(orderId, 'damaged', 'Confirmed damaged at inspection', userId);
        }

        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: { items: true },
        });
        if (!order) throw new NotFoundException(`Order ${orderId} not found`);

        await this.prisma.$transaction(async (tx) => {
            for (const item of order.items) {
                if (!item.productId) continue;

                const level = await tx.inventoryLevel.findFirst({
                    where: { productId: item.productId, returningQty: { gt: 0 } } as any,
                    orderBy: { returningQty: 'desc' } as any,
                });

                if (level) {
                    await tx.inventoryLevel.update({
                        where: { id: level.id },
                        data: {
                            returningQty: { decrement: item.quantity },
                            currentQuantity: { increment: item.quantity },
                        } as any,
                    });

                    await tx.inventoryTransaction.create({
                        data: {
                            type: 'return_restock',
                            quantity: item.quantity,
                            productId: item.productId,
                            warehouseId: level.warehouseId,
                            referenceId: orderId,
                            reason: 'Returned stock inspected and confirmed OK',
                            userId,
                        },
                    });
                }
            }

            await tx.order.update({
                where: { id: orderId },
                data: {
                    returnStockState: 'restocked',
                    needsRestockConfirm: false,
                } as any,
            });
        });

        return { success: true, orderId, condition };
    }

    // ─── NEW: Register return tracking number ────────────────────────────
    async registerReturnTracking(orderId: string, returnTrackingNumber: string) {
        const order = await this.prisma.order.findUnique({ where: { id: orderId } });
        if (!order) throw new NotFoundException(`Order ${orderId} not found`);

        // Register with 17track
        try {
            const axios = require('axios');
            const apiKey = process.env.TRACK17_API_KEY;
            if (apiKey) {
                await axios.post(
                    'https://api.17track.net/track/v2.2/register',
                    [{ number: returnTrackingNumber }],
                    { headers: { '17token': apiKey, 'Content-Type': 'application/json' } }
                );
            }
        } catch (e) {
            // Non-fatal — still save the tracking number even if 17track registration fails
        }

        return this.prisma.order.update({
            where: { id: orderId },
            data: {
                returnTrackingNumber,
                returnStockState: 'returning',
            } as any,
        });
    }

    // ─── NEW: Planning data (D+7 projections) ───────────────────────────
    async getPlanningData(warehouseId?: string) {
        const whereClause: any = {};
        if (warehouseId && warehouseId !== 'all') whereClause.warehouseId = warehouseId;

        const levels = await this.prisma.inventoryLevel.findMany({
            where: whereClause,
            include: { product: true, warehouse: true },
        });

        // Calculate avg daily orders per product from last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const productIds = [...new Set(levels.map(l => l.productId))];

        const orderCounts = await this.prisma.orderItem.groupBy({
            by: ['productId'],
            where: {
                productId: { in: productIds },
                order: { orderDate: { gte: thirtyDaysAgo }, orderStatus: { not: 'Cancelled' } },
            },
            _sum: { quantity: true },
        });

        const avgDailyMap = new Map<string, number>();
        for (const oc of orderCounts) {
            avgDailyMap.set(oc.productId!, (oc._sum.quantity || 0) / 30);
        }

        return levels.map(level => {
            const avgDaily = avgDailyMap.get(level.productId) || 0;
            const leadTime = 14; // default lead time days
            const returningQty = (level as any).returningQty || 0;
            const outboundQty = (level as any).outboundQty || 0;
            const available = level.currentQuantity - level.reservedQuantity;

            // Expected returns in 7 days (91.2% recovery rate assumption)
            const expectedReturns7d = Math.round(returningQty * 0.912);
            const projectedD7 = available - Math.round(avgDaily * 7) + expectedReturns7d;

            // Reorder point: avg_daily × (lead_time + 8.3 return journey) × 1.15 safety factor
            const reorderPoint = Math.round(avgDaily * (leadTime + 8.3) * 1.15);
            const daysOfStock = avgDaily > 0 ? Math.round(available / avgDaily) : 999;

            const status =
                available <= 0 ? 'out_of_stock' :
                    available <= reorderPoint ? 'reorder_now' :
                        projectedD7 <= reorderPoint ? 'reorder_soon' : 'healthy';

            return {
                productId: level.productId,
                productName: level.product.name,
                sku: level.product.sku,
                warehouseId: level.warehouseId,
                warehouseName: level.warehouse.name,
                available,
                outboundQty,
                returningQty,
                expectedReturns7d,
                projectedD7,
                reorderPoint,
                daysOfStock,
                avgDailyOrders: Math.round(avgDaily * 10) / 10,
                status,
            };
        });
    }

    // ─── NEW: Inventory reports ──────────────────────────────────────────
    async getInventoryReports() {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Return rate by market
        const delivered = await this.prisma.order.groupBy({
            by: ['shippingCountry'],
            where: { orderStatus: 'Delivered', orderDate: { gte: thirtyDaysAgo } },
            _count: true,
        });

        const returned = await this.prisma.order.groupBy({
            by: ['shippingCountry'],
            where: {
                returnStockState: { in: ['returning', 'restocked', 'written_off'] },
                orderDate: { gte: thirtyDaysAgo },
            } as any,
            _count: true,
        });

        const returnedMap = new Map(returned.map(r => [r.shippingCountry, r._count]));
        const returnRateByMarket = delivered.map(d => ({
            market: d.shippingCountry,
            deliveredCount: d._count,
            returnCount: returnedMap.get(d.shippingCountry) || 0,
            returnRate: d._count > 0 ? Math.round(((returnedMap.get(d.shippingCountry) || 0) / d._count) * 100 * 10) / 10 : 0,
        }));

        // Write-off breakdown
        const writeOffs = await this.prisma.inventoryTransaction.groupBy({
            by: ['reason'],
            where: { type: 'write_off', createdAt: { gte: thirtyDaysAgo } },
            _count: true,
            _sum: { quantity: true },
        });

        // Recovery rate: restocked / (restocked + written_off)
        const restockedCount = await this.prisma.order.count({
            where: { returnStockState: 'restocked', orderDate: { gte: thirtyDaysAgo } } as any,
        });
        const writtenOffCount = await this.prisma.order.count({
            where: { returnStockState: 'written_off', orderDate: { gte: thirtyDaysAgo } } as any,
        });
        const totalReturns = restockedCount + writtenOffCount;
        const recoveryRate = totalReturns > 0 ? Math.round((restockedCount / totalReturns) * 100 * 10) / 10 : 100;

        return {
            returnRateByMarket,
            recoveryRate: { rate: recoveryRate, target: 90, isBelowTarget: recoveryRate < 90 },
            writeOffBreakdown: writeOffs.map(w => ({
                reason: w.reason || 'Unknown',
                count: w._count,
                totalUnits: Math.abs(w._sum.quantity || 0),
            })),
        };
    }

    // ─── Existing transfer/reserve/fulfill methods (unchanged) ──────────

    async transferStock(productId: string, fromWarehouseId: string, toWarehouseId: string, quantity: number, reason: string, userId?: string) {
        return this.prisma.$transaction(async (prisma) => {
            const sourceLevel = await prisma.inventoryLevel.findUnique({
                where: { productId_warehouseId: { productId, warehouseId: fromWarehouseId } }
            });

            if (!sourceLevel || sourceLevel.currentQuantity < quantity) {
                throw new BadRequestException(`Insufficient stock in source warehouse. Available: ${sourceLevel?.currentQuantity || 0}`);
            }

            await prisma.inventoryLevel.update({
                where: { productId_warehouseId: { productId, warehouseId: fromWarehouseId } },
                data: { currentQuantity: { decrement: quantity } }
            });

            await prisma.inventoryTransaction.create({
                data: { type: 'transfer_out', quantity: -quantity, productId, warehouseId: fromWarehouseId, referenceId: `Transfer to ${toWarehouseId}: ${reason}`, userId }
            });

            await prisma.inventoryLevel.upsert({
                where: { productId_warehouseId: { productId, warehouseId: toWarehouseId } },
                create: { productId, warehouseId: toWarehouseId, currentQuantity: quantity, reservedQuantity: 0 },
                update: { currentQuantity: { increment: quantity } }
            });

            await prisma.inventoryTransaction.create({
                data: { type: 'transfer_in', quantity, productId, warehouseId: toWarehouseId, referenceId: `Transfer from ${fromWarehouseId}: ${reason}`, userId }
            });

            return { success: true };
        });
    }

    async reserveStock(orderId: string) {
        const orderItems = await this.prisma.orderItem.findMany({ where: { orderId } });

        for (const item of orderItems) {
            if (!item.productId) continue;

            const levels = await this.prisma.inventoryLevel.findMany({
                where: { productId: item.productId },
                orderBy: { currentQuantity: 'desc' },
            });

            if (levels.length > 0) {
                const warehouseId = levels[0].warehouseId;
                await this.prisma.inventoryLevel.update({
                    where: { productId_warehouseId: { productId: item.productId, warehouseId } },
                    data: { reservedQuantity: { increment: item.quantity } },
                });
            }
        }
    }

    async fulfillOrder(orderId: string) {
        const orderItems = await this.prisma.orderItem.findMany({ where: { orderId } });

        for (const item of orderItems) {
            if (!item.productId) continue;

            const levels = await this.prisma.inventoryLevel.findMany({
                where: { productId: item.productId, reservedQuantity: { gte: item.quantity } },
            });

            if (levels.length > 0) {
                const warehouseId = levels[0].warehouseId;

                // Decrement reserved + current, increment outboundQty (Option A)
                await this.prisma.inventoryLevel.update({
                    where: { productId_warehouseId: { productId: item.productId, warehouseId } },
                    data: {
                        reservedQuantity: { decrement: item.quantity },
                        currentQuantity: { decrement: item.quantity },
                        outboundQty: { increment: item.quantity },
                    } as any,
                });

                await this.prisma.inventoryTransaction.create({
                    data: {
                        type: 'order_out',
                        productId: item.productId,
                        warehouseId,
                        quantity: -item.quantity,
                        referenceId: orderId,
                        reason: 'Order Fulfilled',
                    }
                });
            }
        }
    }
}
