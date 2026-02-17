import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SuppliersService {
    constructor(private prisma: PrismaService) { }

    async create(data: any) {
        return this.prisma.supplier.create({ data });
    }

    async findAll() {
        return this.prisma.supplier.findMany({
            include: {
                _count: {
                    select: { products: true, purchases: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async findOne(id: string) {
        const supplier = await this.prisma.supplier.findUnique({
            where: { id },
            include: {
                products: true,
                purchases: {
                    take: 20,
                    orderBy: { orderDate: 'desc' },
                },
            },
        });

        if (!supplier) {
            throw new NotFoundException(`Supplier with ID ${id} not found`);
        }

        return supplier;
    }

    async update(id: string, data: any) {
        try {
            return await this.prisma.supplier.update({
                where: { id },
                data,
            });
        } catch (error) {
            throw new NotFoundException(`Supplier with ID ${id} not found`);
        }
    }

    async remove(id: string) {
        try {
            return await this.prisma.supplier.delete({
                where: { id },
            });
        } catch (error) {
            throw new NotFoundException(`Supplier with ID ${id} not found`);
        }
    }
}
