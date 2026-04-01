import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { InventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryController {
    constructor(private readonly inventoryService: InventoryService) { }

    @Post('warehouses')
    createWarehouse(@Body() body: { name: string; fulfillmentCenterId: string; location?: string }) {
        return this.inventoryService.createWarehouse(body);
    }

    @Get('warehouses')
    getAllWarehouses() {
        return this.inventoryService.getAllWarehouses();
    }

    @Get('stock')
    getProductsWithStock(@Query('warehouseId') warehouseId?: string) {
        return this.inventoryService.getProductsWithStock(warehouseId);
    }

    @Get('transactions')
    getTransactions(@Query('warehouseId') warehouseId?: string, @Query('productId') productId?: string) {
        return this.inventoryService.getTransactions(warehouseId, productId);
    }

    @Get('dashboard')
    getDashboardMetrics(@Query('warehouseId') warehouseId?: string) {
        return this.inventoryService.getDashboardMetrics(warehouseId);
    }

    @Get('levels/:productId')
    getLevels(@Param('productId') productId: string) {
        return this.inventoryService.getInventoryLevels(productId);
    }

    // ─── NEW: Product stock summary ───────────────────────────────────
    @Get('summary/:productId')
    getProductStockSummary(@Param('productId') productId: string) {
        return this.inventoryService.getProductStockSummary(productId);
    }

    // ─── NEW: Planning (D+7 projections) ─────────────────────────────
    @Get('planning')
    getPlanningData(@Query('warehouseId') warehouseId?: string) {
        return this.inventoryService.getPlanningData(warehouseId);
    }

    // ─── NEW: Inventory reports ───────────────────────────────────────
    @Get('reports')
    getInventoryReports() {
        return this.inventoryService.getInventoryReports();
    }

    // ─── NEW: Write off returning stock ──────────────────────────────
    @Post('write-off')
    writeOffStock(
        @Body() body: { orderId: string; reason: string; notes?: string; userId?: string }
    ) {
        return this.inventoryService.writeOffStock(body.orderId, body.reason, body.notes, body.userId);
    }

    // ─── NEW: Confirm restock after inspection ────────────────────────
    @Post('confirm-restock')
    confirmRestock(
        @Body() body: { orderId: string; condition: 'ok' | 'damaged'; userId?: string }
    ) {
        return this.inventoryService.confirmRestock(body.orderId, body.condition, body.userId);
    }

    @Post('adjust')
    adjustStock(
        @Body() body: {
            productId: string;
            warehouseId: string;
            quantity: number;
            reason: string;
            userId?: string;
            type?: string;
            partnerSku?: string;
        }
    ) {
        return this.inventoryService.adjustStock(
            body.productId,
            body.warehouseId,
            body.quantity,
            body.reason,
            body.userId,
            body.type as any,
            body.partnerSku
        );
    }

    @Post('transfer')
    transferStock(
        @Body() body: {
            productId: string;
            fromWarehouseId: string;
            toWarehouseId: string;
            quantity: number;
            reason: string;
            userId?: string;
        }
    ) {
        return this.inventoryService.transferStock(
            body.productId,
            body.fromWarehouseId,
            body.toWarehouseId,
            body.quantity,
            body.reason,
            body.userId
        );
    }
}
