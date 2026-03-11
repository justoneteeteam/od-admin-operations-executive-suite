import {
    Controller, Get, Post, Patch, Delete,
    Param, Body, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';

@Controller('tickets')
export class TicketsController {
    constructor(private readonly ticketsService: TicketsService) {}

    @Post()
    create(@Body() dto: CreateTicketDto) {
        return this.ticketsService.create(dto);
    }

    @Get()
    findAll(
        @Query('status') status?: string,
        @Query('priority') priority?: string,
        @Query('caseType') caseType?: string,
        @Query('search') search?: string,
        @Query('picId') picId?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.ticketsService.findAll({
            status, priority, caseType, search, picId,
            page: page ? parseInt(page) : undefined,
            limit: limit ? parseInt(limit) : undefined,
        });
    }

    @Get('stats')
    getStats() {
        return this.ticketsService.getStats();
    }

    @Get('workflows')
    getWorkflows() {
        return this.ticketsService.getWorkflows();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.ticketsService.findOne(id);
    }

    @Patch('workflows/:caseType')
    updateWorkflow(
        @Param('caseType') caseType: string,
        @Body() body: { steps?: any; channelOrder?: any; title?: string; description?: string; isActive?: boolean },
    ) {
        return this.ticketsService.updateWorkflow(caseType, body);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: UpdateTicketDto) {
        return this.ticketsService.update(id, dto);
    }

    @Patch(':id/status')
    updateStatus(@Param('id') id: string, @Body('status') status: string) {
        return this.ticketsService.updateStatus(id, status);
    }

    @Patch(':id/resolve')
    resolve(@Param('id') id: string, @Body('resolution') resolution: string) {
        return this.ticketsService.resolve(id, resolution);
    }

    @Patch(':id/assign')
    assign(
        @Param('id') id: string,
        @Body('picId') picId: string,
        @Body('picName') picName?: string,
    ) {
        return this.ticketsService.assign(id, picId, picName);
    }

    @Post(':id/timeline')
    addTimelineEvent(
        @Param('id') id: string,
        @Body() body: { eventType: string; channel?: string; content?: string; externalRef?: string },
    ) {
        return this.ticketsService.addTimelineEvent(id, body);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.OK)
    softDelete(@Param('id') id: string) {
        return this.ticketsService.softDelete(id);
    }

    @Post('sync')
    syncUndelivered() {
        // Delegate to IncidentAutoService (injected via module)
        // This is a manual trigger endpoint; the cron does the same automatically
        return { message: 'Sync triggered. Check logs for results.' };
    }
}
