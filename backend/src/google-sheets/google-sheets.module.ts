import { Module, forwardRef } from '@nestjs/common';
import { GoogleSheetsService } from './google-sheets.service';
import { PrismaService } from '../prisma/prisma.service';
import { RiskScoringModule } from '../risk-scoring/risk-scoring.module';

@Module({
    imports: [forwardRef(() => RiskScoringModule)],
    providers: [GoogleSheetsService, PrismaService],
    exports: [GoogleSheetsService],
})
export class GoogleSheetsModule { }
