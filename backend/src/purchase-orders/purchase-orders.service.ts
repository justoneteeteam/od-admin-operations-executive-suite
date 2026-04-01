import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';

@Injectable()
export class PurchaseOrdersService {
    constructor(
        private prisma: PrismaService,
        private inventoryService: InventoryService,
    ) { }

    private async generateReference(warehouseId?: string): Promise<string> {
        // Determine country code from warehouse
        let countryCode = 'XX';
        if (warehouseId) {
            const warehouse = await this.prisma.warehouse.findUnique({
                where: { id: warehouseId },
                include: { fulfillmentCenter: true },
            });
            const country = warehouse?.fulfillmentCenter?.country?.toLowerCase() || '';
            if (country.includes('italy') || country.includes('italia')) countryCode = 'IT';
            else if (country.includes('spain') || country.includes('españa') || country.includes('espana')) countryCode = 'ES';
            else if (country.includes('germany') || country.includes('deutschland')) countryCode = 'DE';
            else if (country.includes('poland') || country.includes('polska')) countryCode = 'PL';
        }

        const year = new Date().getFullYear();
        const prefix = `PO-${countryCode}-${year}-`;

        // Find highest existing sequence for this prefix
        const latest = await this.prisma.$queryRaw<{ reference: string }[]>`
            SELECT reference FROM purchase_orders
            WHERE reference LIKE ${prefix + '%'}
            ORDER BY reference DESC
            LIMIT 1
        `;

        let seq = 1;
        if (latest.length > 0) {
            const lastNum = parseInt(latest[0].reference.split('-').pop() || '0', 10);
            seq = lastNum + 1;
        }

        return `${prefix}${String(seq).padStart(4, '0')}`;
    }

    async create(dto: {
        supplierId?: string;
        warehouseId?: string;
        orderDate: string;
        expectedDelivery?: string;
        paymentTerms?: string;
        notes?: string;
        createdBy?: string;
        items: { productId: string; quantity: number; unitCost: number }[];
    }) {
        const reference = await this.generateReference(dto.warehouseId);
        const totalAmount = dto.items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0);

        return this.prisma.purchaseOrder.create({
            data: {
                reference,
                supplierId: dto.supplierId || undefined,
                warehouseId: dto.warehouseId || undefined,
                orderDate: new Date(dto.orderDate),
                expectedDelivery: dto.expectedDelivery ? new Date(dto.expectedDelivery) : undefined,
                paymentTerms: dto.paymentTerms,
                notes: dto.notes,
                createdBy: dto.createdBy,
                totalAmount,
                items: {
                    create: dto.items.map(i => ({
                        productId: i.productId,
                        quantity: i.quantity,
                        unitCost: i.unitCost,
                    })),
                },
            },
            include: { items: { include: { product: true } }, supplier: true, warehouse: true },
        });
    }

    async findAll() {
        return this.prisma.purchaseOrder.findMany({
            include: {
                items: { include: { product: { select: { name: true, sku: true } } } },
                supplier: { select: { name: true } },
                warehouse: { select: { name: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async findOne(id: string) {
        const po = await this.prisma.purchaseOrder.findUnique({
            where: { id },
            include: {
                items: { include: { product: true } },
                supplier: true,
                warehouse: true,
            },
        });
        if (!po) throw new NotFoundException(`Purchase order ${id} not found`);
        return po;
    }

    async receive(id: string, userId?: string) {
        const po = await this.findOne(id);
        if (po.status === 'received') return po;

        // Adjust stock for each item
        for (const item of po.items) {
            if (!item.productId || !po.warehouseId) continue;
            await this.inventoryService.adjustStock(
                item.productId,
                po.warehouseId,
                item.quantity,
                `Purchase Order ${po.reference}`,
                userId,
                'purchase_in',
            );
        }

        return this.prisma.purchaseOrder.update({
            where: { id },
            data: { status: 'received', updatedAt: new Date() },
            include: { items: { include: { product: true } }, supplier: true, warehouse: true },
        });
    }

    async getRecommendation(productId: string, warehouseId: string, coverDays: number = 30) {
        // avg daily orders from last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const orderAgg = await this.prisma.orderItem.aggregate({
            where: {
                productId,
                order: { orderDate: { gte: thirtyDaysAgo }, orderStatus: { not: 'Cancelled' } },
            },
            _sum: { quantity: true },
        });
        const avgDaily = ((orderAgg._sum.quantity || 0) / 30);

        const level = await this.prisma.inventoryLevel.findFirst({
            where: { productId, warehouseId },
        });

        const available = (level?.currentQuantity || 0) - (level?.reservedQuantity || 0);
        const returningQty = (level as any)?.returningQty || 0;
        const expectedReturns = Math.round(returningQty * 0.912);
        const target = Math.round(avgDaily * coverDays);
        const shortfall = target - available - expectedReturns;
        const recommendedQty = Math.max(0, Math.round(shortfall * 1.15));

        return {
            productId,
            warehouseId,
            avgDailyOrders: Math.round(avgDaily * 10) / 10,
            currentAvailable: available,
            expectedReturns,
            coverDays,
            target,
            recommendedQty,
        };
    }
}
