import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TwilioVoiceModule } from '../twilio-voice/twilio-voice.module';
import { CommunicationService } from './communication.service';
import { CommunicationController } from './communication.controller';

@Module({
    imports: [PrismaModule, TwilioVoiceModule],
    controllers: [CommunicationController],
    providers: [CommunicationService],
    exports: [CommunicationService],
})
export class CommunicationModule {}
