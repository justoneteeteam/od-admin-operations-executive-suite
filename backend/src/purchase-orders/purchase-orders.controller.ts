import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service';

@Controller('purchase-orders')
export class PurchaseOrdersController {
    constructor(private readonly purchaseOrdersService: PurchaseOrdersService) { }

    @Post()
    create(
        @Body() body: {
            supplierId?: string;
            warehouseId?: string;
            orderDate: string;
            expectedDelivery?: string;
            paymentTerms?: string;
            notes?: string;
            createdBy?: string;
            items: { productId: string; quantity: number; unitCost: number }[];
        }
    ) {
        return this.purchaseOrdersService.create(body);
    }

    @Get()
    findAll() {
        return this.purchaseOrdersService.findAll();
    }

    @Get('recommend')
    getRecommendation(
        @Query('productId') productId: string,
        @Query('warehouseId') warehouseId: string,
        @Query('coverDays') coverDays?: string,
    ) {
        return this.purchaseOrdersService.getRecommendation(productId, warehouseId, coverDays ? parseInt(coverDays) : 30);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.purchaseOrdersService.findOne(id);
    }

    @Patch(':id/receive')
    receive(@Param('id') id: string, @Body() body: { userId?: string }) {
        return this.purchaseOrdersService.receive(id, body?.userId);
    }
}
