import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    UseInterceptors,
    UploadedFile,
    BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FinancialService } from './financial.service';
import { CreateFinancialRecordDto, UpdateFinancialRecordDto } from './dto/create-financial-record.dto';

@Controller('financial')
export class FinancialController {
    constructor(private readonly financialService: FinancialService) {}

    // ─── Invoice Upload & Import ─────────────────────────────────

    @Post('invoices/upload')
    @UseInterceptors(FileInterceptor('file'))
    async uploadInvoice(
        @UploadedFile() file: Express.Multer.File,
        @Body('fulfillment_center_id') fulfillmentCenterId: string,
        @Body('period_month') periodMonth?: string,
        @Body('invoice_type') invoiceType?: string,
    ) {
        if (!file) {
            throw new BadRequestException('No file uploaded');
        }
        if (!fulfillmentCenterId) {
            throw new BadRequestException('fulfillment_center_id is required');
        }

        const type = invoiceType || 'per_order';

        if (type === 'monthly') {
            return this.financialService.uploadMonthlyInvoice(
                file.buffer,
                file.originalname,
                fulfillmentCenterId,
                periodMonth,
            );
        }

        return this.financialService.uploadPerOrderInvoice(
            file.buffer,
            file.originalname,
            fulfillmentCenterId,
            periodMonth,
        );
    }

    @Post('invoices/:uploadId/import')
    async importInvoice(@Param('uploadId') uploadId: string) {
        return this.financialService.importInvoice(uploadId);
    }

    // ─── Financial Records CRUD ──────────────────────────────────

    @Get('records')
    async findAllRecords(
        @Query('month') month?: string,
        @Query('category') category?: string,
        @Query('market') market?: string,
        @Query('source') source?: string,
    ) {
        return this.financialService.findAllRecords({ month, category, market, source });
    }

    @Post('records')
    async createRecord(@Body() dto: CreateFinancialRecordDto) {
        return this.financialService.createRecord(dto);
    }

    @Put('records/:id')
    async updateRecord(
        @Param('id') id: string,
        @Body() dto: UpdateFinancialRecordDto,
    ) {
        return this.financialService.updateRecord(id, dto);
    }

    @Delete('records/:id')
    async deleteRecord(@Param('id') id: string) {
        return this.financialService.deleteRecord(id);
    }

    @Post('records/bulk-delete')
    async bulkDeleteRecords(@Body('ids') ids: string[]) {
        if (!ids || !ids.length) {
            throw new BadRequestException('ids array is required');
        }
        return this.financialService.bulkDeleteRecords(ids);
    }

    @Get('records/summary')
    async getRecordsSummary(
        @Query('month') month?: string,
        @Query('market') market?: string,
    ) {
        return this.financialService.getRecordsSummary({ month, market });
    }

    @Post('records/bulk')
    async bulkCreateRecords(@Body('records') records: CreateFinancialRecordDto[]) {
        return this.financialService.bulkCreateRecords(records);
    }

    // ─── P&L Report ───────────────────────────────────────────

    @Get('pnl')
    async getPnlReport(@Query('year') year?: string) {
        const y = year ? parseInt(year, 10) : new Date().getFullYear();
        return this.financialService.getPnlReport(y);
    }

    // ─── Utility ──────────────────────────────────────────────

    @Get('exchange-rate')
    async getLatestExchangeRate() {
        return this.financialService.getLatestExchangeRate();
    }

    @Get('sources')
    async getUniqueSources() {
        return this.financialService.getUniqueSources();
    }
}
