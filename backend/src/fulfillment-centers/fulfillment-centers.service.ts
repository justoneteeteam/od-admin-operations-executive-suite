import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FulfillmentCentersService {
    constructor(private prisma: PrismaService) { }

    async create(data: any) {
        const { warehouses, ...centerData } = data;

        return this.prisma.fulfillmentCenter.create({
            data: {
                ...centerData,
                warehouses: warehouses && warehouses.length > 0 ? {
                    create: warehouses.map((w: any) => ({
                        name: w.name,
                        location: w.location
                    }))
                } : undefined
            },
            include: {
                warehouses: true
            }
        });
    }

    async findAll() {
        return this.prisma.fulfillmentCenter.findMany({
            include: {
                _count: {
                    select: { orders: true, products: true },
                },
                warehouses: true, // Include warehouses for dropdowns
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async findOne(id: string) {
        const center = await this.prisma.fulfillmentCenter.findUnique({
            where: { id },
            include: {
                orders: {
                    take: 20,
                    orderBy: { orderDate: 'desc' },
                },
                products: {
                    take: 50,
                },
                warehouses: true,
            },
        });

        if (!center) {
            throw new NotFoundException(`Fulfillment Center with ID ${id} not found`);
        }

        return center;
    }

    async update(id: string, data: any) {
        try {
            return await this.prisma.fulfillmentCenter.update({
                where: { id },
                data,
            });
        } catch (error) {
            throw new NotFoundException(`Fulfillment Center with ID ${id} not found`);
        }
    }

    async remove(id: string) {
        try {
            return await this.prisma.fulfillmentCenter.delete({
                where: { id },
            });
        } catch (error) {
            throw new NotFoundException(`Fulfillment Center with ID ${id} not found`);
        }
    }
}
