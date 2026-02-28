import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './src/prisma/prisma.service';
import { TrackingModule } from './src/tracking/tracking.module';
import { NotificationsModule } from './src/notifications/notifications.module';
import { PrismaModule } from './src/prisma/prisma.module';

async function bootstrap() {
    const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [TrackingModule, NotificationsModule, PrismaModule],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    const prisma = app.get(PrismaService);
    const testTrackingNumber = '32300027789699501083398';

    console.log('Adding Test Order for Tracking Number:', testTrackingNumber);
    // 1. Create/Find Customer
    const testPhone = '+84932715104';
    let customer = await prisma.customer.findFirst({
        where: { phone: testPhone },
    });

    if (!customer) {
      customer = await prisma.customer.create({
          data: {
              name: 'Test Customer',
              phone: testPhone,
              email: 'test@example.com',
              country: 'Vietnam',
          },
      });
      console.log('Created Test Customer:', customer.id);
    } else {
      console.log('Found Existing Customer:', customer.id);
    }

    const orderNumber = `ORD-TEST-${Date.now()}`;
    const order = await prisma.order.create({
        data: {
            orderNumber: orderNumber,
            customerId: customer.id,
            orderStatus: 'Processing',
            trackingNumber: testTrackingNumber,
            totalAmount: 100,
            subtotal: 100,
            shippingCity: 'Ho Chi Minh',
            shippingCountry: 'Vietnam',
            shippingAddressLine1: '123 Test St',
            storeId: 'test-store',
        },
    });

    // 3. Ensure Template Exists
    await prisma.notificationTemplate.upsert({
        where: { templateName: 'order_in_transit' },
        update: {},
        create: {
            templateName: 'order_in_transit',
            templateType: 'whatsapp',
            bodyTemplate: 'Hello {{1}}, your order {{2}} is now In Transit! 🚚 Track it here: {{3}}',
            variables: ['customerName', 'orderNumber', 'trackingUrl'],
            isActive: true,
            lastUsedAt: new Date(),
        },
    });
    console.log('Ensured Template exists');

    console.log('Created Test Order:', order.orderNumber, 'with Tracking Number:', order.trackingNumber);
    await app.close();
}

bootstrap();
