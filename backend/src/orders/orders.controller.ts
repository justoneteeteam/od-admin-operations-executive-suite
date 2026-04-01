import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    Query,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';

@Controller('orders')
export class OrdersController {
    constructor(private readonly ordersService: OrdersService) { }

    @Post()
    create(@Body() createOrderDto: CreateOrderDto) {
        return this.ordersService.create(createOrderDto);
    }

    @Post('import')
    importOrders(
        @Body() data: any[],
        @Query('skipRiskAssessment') skipRiskStr?: string,
        @Query('skipInventory') skipInvStr?: string,
    ) {
        const skipRisk = skipRiskStr === 'true';
        const skipInv = skipInvStr === 'true';
        return this.ordersService.importOrders(data, skipRisk, skipInv);
    }

    @Get()
    findAll(
        @Query('orderStatus') orderStatus?: string,
        @Query('confirmationStatus') confirmationStatus?: string,
        @Query('customerId') customerId?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('search') search?: string,
        @Query('searchType') searchType?: string,
        @Query('skuType') skuType?: string,
        @Query('trafficChannel') trafficChannel?: string,
    ) {
        return this.ordersService.findAll({
            orderStatus,
            confirmationStatus,
            customerId,
            search,
            searchType,
            skuType,
            trafficChannel,
            page: page ? parseInt(page) : undefined,
            limit: limit ? parseInt(limit) : undefined,
        });
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.ordersService.findOne(id);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() updateOrderDto: UpdateOrderDto) {
        return this.ordersService.update(id, updateOrderDto);
    }

    @Post(':id/return-tracking')
    registerReturnTracking(
        @Param('id') id: string,
        @Body('returnTrackingNumber') returnTrackingNumber: string
    ) {
        return this.ordersService.registerReturnTracking(id, returnTrackingNumber);
    }

    @Patch(':id/status')
    updateStatus(@Param('id') id: string, @Body('orderStatus') orderStatus: string) {
        return this.ordersService.updateStatus(id, orderStatus);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.ordersService.remove(id);
    }
}
