import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { WhatsappService } from './whatsapp.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [NotificationsController],
    providers: [WhatsappService],
    exports: [WhatsappService],
})
export class NotificationsModule { }
