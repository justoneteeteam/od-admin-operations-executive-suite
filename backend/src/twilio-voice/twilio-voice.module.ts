import { Module } from '@nestjs/common';
import { TwilioVoiceService } from './twilio-voice.service';
import { TwilioVoiceController } from './twilio-voice.controller';
import { WhisperTranscriptionService } from './whisper-transcription.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TwilioCallSchedulerService } from './twilio-call-scheduler.service';
import { SkuCallSchedulerService } from './sku-call-scheduler.service';

@Module({
    imports: [PrismaModule, NotificationsModule],
    controllers: [TwilioVoiceController],
    providers: [TwilioVoiceService, TwilioCallSchedulerService, SkuCallSchedulerService, WhisperTranscriptionService],
    exports: [TwilioVoiceService, WhisperTranscriptionService],
})
export class TwilioVoiceModule { }
