import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { SmsWhatsappDeliveryService } from './sms-whatsapp-delivery.service';
import { WhatsappPersonalService } from './whatsapp.personal.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [NotificationsController],
    providers: [SmsWhatsappDeliveryService, WhatsappPersonalService],
    exports: [SmsWhatsappDeliveryService, WhatsappPersonalService],
})
export class NotificationsModule { }
