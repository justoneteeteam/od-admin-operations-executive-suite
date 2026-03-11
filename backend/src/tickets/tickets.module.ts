import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { IncidentAutoService } from './incident-auto.service';
import { IncidentSheetsService } from './incident-sheets.service';
import { TrackingModule } from '../tracking/tracking.module';

@Module({
    imports: [PrismaModule, forwardRef(() => TrackingModule)],
    controllers: [TicketsController],
    providers: [TicketsService, IncidentAutoService, IncidentSheetsService],
    exports: [TicketsService, IncidentAutoService, IncidentSheetsService],
})
export class TicketsModule {}
