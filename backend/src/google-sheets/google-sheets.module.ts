import { Module } from '@nestjs/common';
import { GoogleSheetsService } from './google-sheets.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
    providers: [GoogleSheetsService, PrismaService],
    exports: [GoogleSheetsService],
})
export class GoogleSheetsModule { }
