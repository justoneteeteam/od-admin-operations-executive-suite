import { Module, forwardRef } from '@nestjs/common';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';
import { TrackingPollService } from './tracking-poll.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TicketsModule } from '../tickets/tickets.module';

@Module({
    imports: [PrismaModule, NotificationsModule, forwardRef(() => TicketsModule)],
    controllers: [TrackingController],
    providers: [TrackingService, TrackingPollService],
    exports: [TrackingService, TrackingPollService],
})
export class TrackingModule { }
