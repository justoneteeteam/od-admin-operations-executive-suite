import { Module } from '@nestjs/common';
import { ShopifyController } from './shopify.controller';
import { ShopifyService } from './shopify.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { OrdersModule } from '../../orders/orders.module';
import { StoreSettingsModule } from '../../store-settings/store-settings.module';
import { TrackingModule } from '../../tracking/tracking.module';

@Module({
  imports: [PrismaModule, OrdersModule, StoreSettingsModule, TrackingModule],
  controllers: [ShopifyController],
  providers: [ShopifyService],
  exports: [ShopifyService],
})
export class ShopifyModule { }
