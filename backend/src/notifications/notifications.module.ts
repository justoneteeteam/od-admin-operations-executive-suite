import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { WhatsappService } from './whatsapp.service';
import { WhatsappPersonalService } from './whatsapp.personal.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [NotificationsController],
    providers: [WhatsappService, WhatsappPersonalService],
    exports: [WhatsappService, WhatsappPersonalService],
})
export class NotificationsModule { }
