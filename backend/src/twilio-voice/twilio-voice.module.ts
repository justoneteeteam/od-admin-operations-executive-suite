import { Module } from '@nestjs/common';
import { TwilioVoiceService } from './twilio-voice.service';
import { TwilioVoiceController } from './twilio-voice.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
    imports: [PrismaModule, NotificationsModule],
    controllers: [TwilioVoiceController],
    providers: [TwilioVoiceService],
    exports: [TwilioVoiceService],
})
export class TwilioVoiceModule { }
