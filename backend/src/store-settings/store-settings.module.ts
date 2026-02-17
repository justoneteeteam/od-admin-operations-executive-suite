import { Module } from '@nestjs/common';
import { StoreSettingsController } from './store-settings.controller';
import { StoreSettingsService } from './store-settings.service';
import { PrismaModule } from '../prisma/prisma.module';
import { GoogleSheetsModule } from '../google-sheets/google-sheets.module';

@Module({
    imports: [PrismaModule, GoogleSheetsModule],
    controllers: [StoreSettingsController],
    providers: [StoreSettingsService],
    exports: [StoreSettingsService],
})
export class StoreSettingsModule { }
