import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { FulfillmentCentersService } from './fulfillment-centers.service';

@Controller('fulfillment-centers')
export class FulfillmentCentersController {
    constructor(private readonly fulfillmentCentersService: FulfillmentCentersService) { }

    @Post()
    create(@Body() createDto: any) {
        return this.fulfillmentCentersService.create(createDto);
    }

    @Get()
    findAll() {
        return this.fulfillmentCentersService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.fulfillmentCentersService.findOne(id);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() updateDto: any) {
        return this.fulfillmentCentersService.update(id, updateDto);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.fulfillmentCentersService.remove(id);
    }
}
