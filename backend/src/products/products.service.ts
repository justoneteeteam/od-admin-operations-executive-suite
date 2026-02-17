import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductsService {
    constructor(private prisma: PrismaService) { }

    async create(data: any) {
        return this.prisma.product.create({ data });
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
            return await this.prisma.product.update({
                where: { id },
                data,
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
}
