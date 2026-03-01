import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PrismaModule } from '../prisma/prisma.module';

import { ProfitsModule } from '../profits/profits.module';
import { InventoryModule } from '../inventory/inventory.module';
import { RiskScoringModule } from '../risk-scoring/risk-scoring.module';

@Module({
  imports: [PrismaModule, ProfitsModule, InventoryModule, RiskScoringModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule { }
