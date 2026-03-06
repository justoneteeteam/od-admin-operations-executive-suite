import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ExchangeRatesService {
    constructor(private prisma: PrismaService) { }

    async findAll() {
        return this.prisma.exchangeRate.findMany({ orderBy: { date: 'desc' } });
    }

    async findByDate(date: string) {
        const rate = await this.prisma.exchangeRate.findUnique({
            where: { date: new Date(date) },
        });
        if (!rate) throw new NotFoundException(`No exchange rate for ${date}`);
        return rate;
    }

    async upsert(date: string, vndToEur: number) {
        const dateObj = new Date(date);
        return this.prisma.exchangeRate.upsert({
            where: { date: dateObj },
            update: { vndToEur },
            create: { date: dateObj, vndToEur },
        });
    }

    async bulkUpsert(rates: { date: string; vndToEur: number }[]) {
        const results = await Promise.all(
            rates.map(r => this.upsert(r.date, r.vndToEur)),
        );
        return { upserted: results.length };
    }

    async remove(id: string) {
        return this.prisma.exchangeRate.delete({ where: { id } });
    }
}
