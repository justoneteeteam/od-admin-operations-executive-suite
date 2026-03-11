import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import { LogisticCompaniesService } from './logistic-companies.service';

@Controller('logistic-companies')
export class LogisticCompaniesController {
    constructor(private readonly service: LogisticCompaniesService) {}

    @Get()
    findAll() {
        return this.service.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id);
    }

    @Post()
    create(@Body() body: any) {
        return this.service.create(body);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() body: any) {
        return this.service.update(id, body);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.service.remove(id);
    }
}
