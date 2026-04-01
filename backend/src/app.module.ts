import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { OrdersModule } from './orders/orders.module';
import { CustomersModule } from './customers/customers.module';
import { ProductsModule } from './products/products.module';
import { FulfillmentCentersModule } from './fulfillment-centers/fulfillment-centers.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { PurchasesModule } from './purchases/purchases.module';
import { ProfitsModule } from './profits/profits.module';
import { StoreSettingsModule } from './store-settings/store-settings.module';
import { AnalyticsModule } from './analytics/analytics.module';

import { InventoryModule } from './inventory/inventory.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TrackingModule } from './tracking/tracking.module';
import { ShopifyModule } from './webhooks/shopify/shopify.module';
import { RiskScoringModule } from './risk-scoring/risk-scoring.module';
import { TwilioVoiceModule } from './twilio-voice/twilio-voice.module';
import { AdsCampaignsModule } from './ads-campaigns/ads-campaigns.module';
import { ExchangeRatesModule } from './exchange-rates/exchange-rates.module';
import { TicketsModule } from './tickets/tickets.module';
import { LogisticCompaniesModule } from './logistic-companies/logistic-companies.module';
import { CommunicationModule } from './communication/communication.module';

@Module({
  imports: [PrismaModule, UsersModule, AuthModule, OrdersModule, CustomersModule, ProductsModule, FulfillmentCentersModule, SuppliersModule, PurchasesModule, ProfitsModule, StoreSettingsModule, AnalyticsModule, InventoryModule, PurchaseOrdersModule, NotificationsModule, TrackingModule, ScheduleModule.forRoot(), ShopifyModule, RiskScoringModule, TwilioVoiceModule, AdsCampaignsModule, ExchangeRatesModule, TicketsModule, LogisticCompaniesModule, CommunicationModule],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule { }
