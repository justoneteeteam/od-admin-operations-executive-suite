import { Controller, Get, Post, Delete, Param, Body } from '@nestjs/common';
import { ExchangeRatesService } from './exchange-rates.service';

@Controller('exchange-rates')
export class ExchangeRatesController {
    constructor(private readonly service: ExchangeRatesService) { }

    @Get()
    findAll() {
        return this.service.findAll();
    }

    @Get(':date')
    findByDate(@Param('date') date: string) {
        return this.service.findByDate(date);
    }

    @Post()
    upsert(@Body() body: { date: string; vndToEur: number }) {
        return this.service.upsert(body.date, body.vndToEur);
    }

    @Post('bulk')
    bulkUpsert(@Body() body: { rates: { date: string; vndToEur: number }[] }) {
        return this.service.bulkUpsert(body.rates);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.service.remove(id);
    }
}
