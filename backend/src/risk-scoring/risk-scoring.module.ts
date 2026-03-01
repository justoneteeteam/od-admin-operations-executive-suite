import { Module } from '@nestjs/common';
import { RiskScoringService } from './risk-scoring.service';
import { RiskScoringController } from './risk-scoring.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RiskScoringController],
  providers: [RiskScoringService],
  exports: [RiskScoringService]
})
export class RiskScoringModule { }
