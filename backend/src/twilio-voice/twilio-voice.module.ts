import { Module } from '@nestjs/common';
import { TwilioVoiceService } from './twilio-voice.service';
import { TwilioVoiceController } from './twilio-voice.controller';
import { WhisperTranscriptionService } from './whisper-transcription.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TwilioCallSchedulerService } from './twilio-call-scheduler.service';

@Module({
    imports: [PrismaModule, NotificationsModule],
    controllers: [TwilioVoiceController],
    providers: [TwilioVoiceService, TwilioCallSchedulerService, WhisperTranscriptionService],
    exports: [TwilioVoiceService],
})
export class TwilioVoiceModule { }
