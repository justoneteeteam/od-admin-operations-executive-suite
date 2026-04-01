import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { PurchasesService } from './purchases.service';

@Controller('purchases')
export class PurchasesController {
    constructor(private readonly purchasesService: PurchasesService) { }

    @Post()
    create(@Body() createDto: any) {
        return this.purchasesService.create(createDto);
    }

    @Get()
    findAll(
        @Query('purchaseStatus') purchaseStatus?: string,
        @Query('supplierId') supplierId?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.purchasesService.findAll({
            purchaseStatus,
            supplierId,
            page: page ? parseInt(page) : undefined,
            limit: limit ? parseInt(limit) : undefined,
        });
    }

    @Get('incoming-stock')
    getIncomingStock() {
        return this.purchasesService.getIncomingStock();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.purchasesService.findOne(id);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() updateDto: any) {
        return this.purchasesService.update(id, updateDto);
    }

    @Patch(':id/status')
    updateStatus(@Param('id') id: string, @Body('purchaseStatus') purchaseStatus: string) {
        return this.purchasesService.updateStatus(id, purchaseStatus);
    }

    @Post('bulk-delete')
    removeMany(@Body('ids') ids: string[]) {
        return this.purchasesService.removeMany(ids);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.purchasesService.remove(id);
    }

    @Post(':id/receive')
    receiveGoods(
        @Param('id') id: string,
        @Body() data: {
            receivedItems: Array<{
                purchaseItemId: string;
                productId: string;
                quantity: number;
                warehouseId: string;
                partnerSku?: string;
            }>
        }
    ) {
        return this.purchasesService.receiveGoods(id, data.receivedItems);
    }
}
