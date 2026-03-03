import { Module, forwardRef } from '@nestjs/common';
import { GoogleSheetsService } from './google-sheets.service';
import { PrismaService } from '../prisma/prisma.service';
import { RiskScoringModule } from '../risk-scoring/risk-scoring.module';
import { TrackingModule } from '../tracking/tracking.module';

@Module({
    imports: [forwardRef(() => RiskScoringModule), TrackingModule],
    providers: [GoogleSheetsService, PrismaService],
    exports: [GoogleSheetsService],
})
export class GoogleSheetsModule { }
