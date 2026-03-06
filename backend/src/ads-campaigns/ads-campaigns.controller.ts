import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { AdsCampaignsService } from './ads-campaigns.service';
import { CreateAdsCampaignDto, UpdateAdsCampaignDto, BulkCreateAdsCampaignDto } from './dto/ads-campaign.dto';

@Controller('ads-campaigns')
export class AdsCampaignsController {
    constructor(private readonly service: AdsCampaignsService) { }

    @Get()
    findAll(
        @Query('country') country?: string,
        @Query('stage') stage?: string,
        @Query('sku') sku?: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
    ) {
        return this.service.findAll({ country, stage, sku, startDate, endDate });
    }

    @Get('dashboard')
    getDashboard(
        @Query('country') country?: string,
        @Query('stage') stage?: string,
        @Query('sku') sku?: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
    ) {
        return this.service.getDashboard({ country, stage, sku, startDate, endDate });
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id);
    }

    @Get(':id/changelog')
    getChangeLog(@Param('id') id: string) {
        return this.service.getChangeLog(id);
    }

    @Post()
    create(@Body() dto: CreateAdsCampaignDto) {
        return this.service.create(dto);
    }

    @Post('bulk')
    bulkCreate(@Body() dto: BulkCreateAdsCampaignDto) {
        return this.service.bulkCreate(dto.records);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: UpdateAdsCampaignDto) {
        return this.service.update(id, dto);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.service.remove(id);
    }
}
