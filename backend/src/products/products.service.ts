import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductsService {
    constructor(private prisma: PrismaService) { }

    async create(data: any) {
        return this.prisma.product.create({
            data: {
                name: data.name,
                sku: data.sku,
                description: data.description || null,
                category: data.category || null,
                unitCost: data.unitCost ?? 0,
                sellingPrice: data.sellingPrice ?? 0,
                stockLevel: data.stockLevel ?? 0,
                reorderPoint: data.reorderPoint ?? 10,
                primaryImageUrl: data.primaryImageUrl || null,
                ...(data.fulfillmentCenterId ? { fulfillmentCenter: { connect: { id: data.fulfillmentCenterId } } } : {}),
                ...(data.supplierId ? { supplier: { connect: { id: data.supplierId } } } : {}),
            },
        });
    }

    async findAll(filters?: { category?: string; stockStatus?: string; search?: string }) {
        const where: any = {};
        if (filters?.category) where.category = filters.category;
        if (filters?.stockStatus) where.stockStatus = filters.stockStatus;
        if (filters?.search) {
            where.OR = [
                { name: { contains: filters.search, mode: 'insensitive' as const } },
                { sku: { contains: filters.search, mode: 'insensitive' as const } },
            ];
        }

        return this.prisma.product.findMany({
            where,
            include: {
                supplier: true,
                fulfillmentCenter: true,
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async findOne(id: string) {
        const product = await this.prisma.product.findUnique({
            where: { id },
            include: {
                supplier: true,
                fulfillmentCenter: true,
            },
        });

        if (!product) {
            throw new NotFoundException(`Product with ID ${id} not found`);
        }

        return product;
    }

    async update(id: string, data: any) {
        try {
            const updateData: any = {};
            if (data.name !== undefined) updateData.name = data.name;
            if (data.sku !== undefined) updateData.sku = data.sku;
            if (data.description !== undefined) updateData.description = data.description || null;
            if (data.category !== undefined) updateData.category = data.category || null;
            if (data.unitCost !== undefined) updateData.unitCost = data.unitCost;
            if (data.sellingPrice !== undefined) updateData.sellingPrice = data.sellingPrice;
            if (data.stockLevel !== undefined) updateData.stockLevel = data.stockLevel;
            if (data.reorderPoint !== undefined) updateData.reorderPoint = data.reorderPoint;
            if (data.primaryImageUrl !== undefined) updateData.primaryImageUrl = data.primaryImageUrl || null;
            if (data.fulfillmentCenterId !== undefined) {
                updateData.fulfillmentCenter = data.fulfillmentCenterId
                    ? { connect: { id: data.fulfillmentCenterId } }
                    : { disconnect: true };
            }
            if (data.supplierId !== undefined) {
                updateData.supplier = data.supplierId
                    ? { connect: { id: data.supplierId } }
                    : { disconnect: true };
            }
            return await this.prisma.product.update({
                where: { id },
                data: updateData,
            });
        } catch (error) {
            throw new NotFoundException(`Product with ID ${id} not found`);
        }
    }

    async remove(id: string) {
        try {
            return await this.prisma.product.delete({
                where: { id },
            });
        } catch (error) {
            throw new NotFoundException(`Product with ID ${id} not found`);
        }
    }

    async removeMany(ids: string[]) {
        if (!ids || ids.length === 0) return { count: 0 };
        const result = await this.prisma.product.deleteMany({
            where: { id: { in: ids } },
        });
        return { count: result.count };
    }
}
