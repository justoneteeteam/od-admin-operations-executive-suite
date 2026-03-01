import { Module } from '@nestjs/common';
import { GoogleSheetsService } from './google-sheets.service';
import { PrismaService } from '../prisma/prisma.service';
import { RiskScoringModule } from '../risk-scoring/risk-scoring.module';

@Module({
    imports: [RiskScoringModule],
    providers: [GoogleSheetsService, PrismaService],
    exports: [GoogleSheetsService],
})
export class GoogleSheetsModule { }
