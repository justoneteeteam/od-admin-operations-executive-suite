import { Module, forwardRef } from '@nestjs/common';
import { RiskScoringService } from './risk-scoring.service';
import { RiskScoringController } from './risk-scoring.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { TwilioVoiceModule } from '../twilio-voice/twilio-voice.module';
import { GoogleSheetsModule } from '../google-sheets/google-sheets.module';

@Module({
  imports: [PrismaModule, forwardRef(() => TwilioVoiceModule), forwardRef(() => GoogleSheetsModule)],
  controllers: [RiskScoringController],
  providers: [RiskScoringService],
  exports: [RiskScoringService]
})
export class RiskScoringModule { }
