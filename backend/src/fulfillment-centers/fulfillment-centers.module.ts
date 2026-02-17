import { Module } from '@nestjs/common';
import { FulfillmentCentersController } from './fulfillment-centers.controller';
import { FulfillmentCentersService } from './fulfillment-centers.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [FulfillmentCentersController],
  providers: [FulfillmentCentersService],
})
export class FulfillmentCentersModule { }
