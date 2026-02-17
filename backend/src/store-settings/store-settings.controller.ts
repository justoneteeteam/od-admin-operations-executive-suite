import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Param,
    Body,
} from '@nestjs/common';
import { StoreSettingsService } from './store-settings.service';
import { GoogleSheetsService } from '../google-sheets/google-sheets.service';

@Controller('store-settings')
export class StoreSettingsController {
    constructor(
        private readonly storeSettingsService: StoreSettingsService,
        private readonly googleSheetsService: GoogleSheetsService,
    ) { }

    @Get()
    findAll() {
        return this.storeSettingsService.findAll();
    }

    @Get('store-names')
    getStoreNames() {
        return this.storeSettingsService.getStoreNames();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.storeSettingsService.findOne(id);
    }

    @Post()
    create(@Body() data: any) {
        return this.storeSettingsService.create(data);
    }

    @Put(':id')
    update(@Param('id') id: string, @Body() data: any) {
        return this.storeSettingsService.update(id, data);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.storeSettingsService.remove(id);
    }

    @Post(':id/sync')
    syncFromSheet(@Param('id') id: string) {
        return this.googleSheetsService.syncFromSheet(id);
    }
}
