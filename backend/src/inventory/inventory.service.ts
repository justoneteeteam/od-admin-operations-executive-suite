import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class InventoryService {
    constructor(private prisma: PrismaService) { }

    async createWarehouse(data: { name: string; fulfillmentCenterId: string; location?: string }) {
        return this.prisma.warehouse.create({
            data,
        });
    }

    async getAllWarehouses() {
        return this.prisma.warehouse.findMany();
    }

    async getProductsWithStock(warehouseId?: string) {
        const whereClause: any = {};
        if (warehouseId && warehouseId !== 'all') {
            whereClause.warehouseId = warehouseId;
        }

        // Fetch levels
        const levels = await this.prisma.inventoryLevel.findMany({
            where: whereClause,
            include: {
                product: true
            }
        });

        // If warehouse selected, we only see products in that warehouse.
        // If 'all', we aggregate.

        const productMap = new Map<string, any>();

        for (const level of levels) {
            if (!productMap.has(level.productId)) {
                productMap.set(level.productId, {
                    ...level.product,
                    currentStock: 0,
                    reservedStock: 0,
                    warehouseBreakdown: []
                });
            }
            const p = productMap.get(level.productId);
            p.currentStock += level.currentQuantity;
            p.reservedStock += level.reservedQuantity;
            p.warehouseBreakdown.push({
                warehouseId: level.warehouseId,
                current: level.currentQuantity,
                reserved: level.reservedQuantity
            });
        }

        return Array.from(productMap.values());
    }

    async getDashboardMetrics(warehouseId?: string) {
        const totalProducts = await this.prisma.product.count({ where: { isActive: true } });

        // Aggregated Inventory Value (sum of current_qty * unit_cost)
        // Complex query or raw query might be needed for efficiency, but let's try Prisma aggregation
        // No direct relation from InventoryLevel to Product.unitCost easily in aggregate.
        // We can fetch all levels with product cost.

        const whereClause: any = {};
        if (warehouseId && warehouseId !== 'all') {
            whereClause.warehouseId = warehouseId;
        }

        const levels = await this.prisma.inventoryLevel.findMany({
            where: whereClause,
            include: {
                product: { select: { unitCost: true, sku: true } }
            }
        });

        let totalInventoryValue = 0;
        let lowStockCount = 0;
        let outOfStockCount = 0;

        // Map to track stock per product for low/out logic
        const productStock: Record<string, number> = {};

        for (const level of levels) {
            const cost = Number(level.product.unitCost) || 0;
            totalInventoryValue += level.currentQuantity * cost;

            if (!productStock[level.productId]) productStock[level.productId] = 0;
            productStock[level.productId] += level.currentQuantity;
        }

        // Determine Low/Out of Stock based on aggregated quantities (or per warehouse?)
        // Usually "Low Stock" is global or per SKUs.
        // Let's assume global for dashboard overview.
        const products = await this.prisma.product.findMany({ select: { id: true, reorderPoint: true } });

        for (const p of products) {
            const qty = productStock[p.id] || 0;
            if (qty === 0) {
                outOfStockCount++;
            } else if (qty <= (p.reorderPoint || 10)) {
                lowStockCount++;
            }
        }

        return {
            totalInventoryValue,
            lowStockCount,
            outOfStockCount,
            totalProducts
        };
    }

    async getInventoryLevels(productId: string) {
        const levels = await this.prisma.inventoryLevel.findMany({
            where: { productId },
            include: {
                warehouse: {
                    include: {
                        fulfillmentCenter: true,
                    },
                },
            },
        });

        const totalCurrent = levels.reduce((sum, level) => sum + level.currentQuantity, 0);
        const totalReserved = levels.reduce((sum, level) => sum + level.reservedQuantity, 0);
        const totalAvailable = totalCurrent - totalReserved;

        return {
            productId,
            totalCurrent,
            totalReserved,
            totalAvailable,
            warehouses: levels,
        };
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
            take: 100 // Limit for now
        });
    }

    async adjustStock(productId: string, warehouseId: string, quantityChange: number, reason: string, userId?: string, type: 'adjustment' | 'purchase_in' | 'order_out' | 'transfer_in' | 'transfer_out' | 'return_restock' = 'adjustment') {
        const level = await this.prisma.inventoryLevel.upsert({
            where: {
                productId_warehouseId: {
                    productId,
                    warehouseId,
                },
            },
            create: {
                productId,
                warehouseId,
                currentQuantity: quantityChange > 0 ? quantityChange : 0,
                reservedQuantity: 0,
            },
            update: {
                currentQuantity: { increment: quantityChange },
            },
        });

        // Log Transaction
        await this.prisma.inventoryTransaction.create({
            data: {
                type,
                quantity: quantityChange,
                productId,
                warehouseId,
                referenceId: reason,
                userId,
            },
        });


        return level;
    }

    async transferStock(productId: string, fromWarehouseId: string, toWarehouseId: string, quantity: number, reason: string, userId?: string) {
        return this.prisma.$transaction(async (prisma) => {
            // Check stock
            const sourceLevel = await prisma.inventoryLevel.findUnique({
                where: { productId_warehouseId: { productId, warehouseId: fromWarehouseId } }
            });

            if (!sourceLevel || sourceLevel.currentQuantity < quantity) {
                throw new BadRequestException(`Insufficient stock in source warehouse. Available: ${sourceLevel?.currentQuantity || 0}`);
            }

            // We use the existing adjustStock logic but need to interpret it within transaction if possible.
            // Since adjustStock is not transaction-aware (uses this.prisma), we should duplicate logic or refactor.
            // For now, let's just use prisma delegate passed to transaction if we refactored, but here we can just do the updates directly.

            // Decrement Source
            await prisma.inventoryLevel.update({
                where: { productId_warehouseId: { productId, warehouseId: fromWarehouseId } },
                data: { currentQuantity: { decrement: quantity } }
            });

            await prisma.inventoryTransaction.create({
                data: {
                    type: 'transfer_out',
                    quantity: -quantity,
                    productId,
                    warehouseId: fromWarehouseId,
                    referenceId: `Transfer to ${toWarehouseId}: ${reason}`,
                    userId
                }
            });

            // Increment Dest
            await prisma.inventoryLevel.upsert({
                where: { productId_warehouseId: { productId, warehouseId: toWarehouseId } },
                create: { productId, warehouseId: toWarehouseId, currentQuantity: quantity, reservedQuantity: 0 },
                update: { currentQuantity: { increment: quantity } }
            });

            await prisma.inventoryTransaction.create({
                data: {
                    type: 'transfer_in',
                    quantity: quantity,
                    productId,
                    warehouseId: toWarehouseId,
                    referenceId: `Transfer from ${fromWarehouseId}: ${reason}`,
                    userId
                }
            });

            return { success: true };
        });
    }

    async reserveStock(orderId: string) {
        const orderItems = await this.prisma.orderItem.findMany({
            where: { orderId },
        });

        // For simplicity in this iteration, we reserve from a default warehouse or the one assigned to product
        // In a real system, we'd need a logic to select warehouse. 
        // Assuming product has a 'primary' warehouse link via fulfillmentCenterId?
        // Actually Product has `fulfillmentCenterId`. We can find a warehouse in that FC.

        // Logic: Find warehouse for product -> Increment reserved
        // But `Product` links to `FulfillmentCenter`, not `Warehouse` directly (in original design).
        // New design adds `InventoryLevel` which links to `Warehouse`.
        // We need to pick a warehouse.
        // Strategy: Pick the warehouse with most stock? Or default one?
        // Let's implement a basic "First available warehouse with stock" strategy.

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
        const orderItems = await this.prisma.orderItem.findMany({
            where: { orderId },
        });

        for (const item of orderItems) {
            if (!item.productId) continue;

            // Find warehouse where stock was reserved
            // Simplified: Find first warehouse with reserved stock for this product
            // Ideally we track which warehouse fulfilled the item in OrderItem or a separate Allocation table
            const levels = await this.prisma.inventoryLevel.findMany({
                where: {
                    productId: item.productId,
                    reservedQuantity: { gte: item.quantity }
                },
            });

            if (levels.length > 0) {
                const warehouseId = levels[0].warehouseId;

                // Decrement Reserved AND Current
                await this.prisma.inventoryLevel.update({
                    where: { productId_warehouseId: { productId: item.productId, warehouseId } },
                    data: {
                        reservedQuantity: { decrement: item.quantity },
                        currentQuantity: { decrement: item.quantity }
                    },
                });

                // Record Transaction
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
