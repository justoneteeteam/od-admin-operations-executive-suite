import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LogisticCompaniesService {
    constructor(private prisma: PrismaService) {}

    async findAll() {
        return this.prisma.logisticCompany.findMany({
            orderBy: { name: 'asc' },
        });
    }

    async findOne(id: string) {
        const company = await this.prisma.logisticCompany.findUnique({ where: { id } });
        if (!company) throw new NotFoundException('Logistic company not found');
        return company;
    }

    async create(data: any) {
        return this.prisma.logisticCompany.create({ data });
    }

    async update(id: string, data: any) {
        await this.findOne(id);
        return this.prisma.logisticCompany.update({ where: { id }, data });
    }

    async remove(id: string) {
        await this.findOne(id);
        return this.prisma.logisticCompany.delete({ where: { id } });
    }
}
