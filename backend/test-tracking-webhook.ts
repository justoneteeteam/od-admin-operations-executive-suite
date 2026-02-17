import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TrackingService } from './src/tracking/tracking.service';
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

    const trackingService = app.get(TrackingService);
    const prisma = app.get(PrismaService);

    const testTrackingNumber = `TRACK_TEST_${Date.now()}`;
    const testPhone = '+84932715104';

    console.log('Seeding Test Data with Tracking Number:', testTrackingNumber);
    // 1. Create/Find Customer
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

    // 2. Create Order
    // Check if order exists first to avoid duplicates if possible, or just create new
    const orderNumber = `ORD-${Date.now()}`;
    const order = await prisma.order.create({
        data: {
            orderNumber: orderNumber,
            customerId: customer.id,
            orderStatus: 'Shipped',
            trackingNumber: testTrackingNumber,
            totalAmount: 100,
            subtotal: 100,
            shippingCity: 'Ho Chi Minh',
            shippingCountry: 'Vietnam',
            shippingAddressLine1: '123 Test St',
            storeId: 'test-store',
        },
    });
    console.log('Created Test Order:', order.orderNumber);

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

    const payload = {
        event: 'TRACKING_UPDATED',
        data: {
            accepted: [
                {
                    number: testTrackingNumber,
                    track_info: {
                        latest_status: {
                            sub_status: 'InTransit_Arrival',
                        },
                    },
                },
            ],
        },
    };

    console.log('Simulating Webhook...');
    try {
        const result = await trackingService.handleWebhook(payload); // handleWebhook currently returns void?
        console.log('Webhook handled successfully.');
    } catch (error) {
        console.error('Error handling webhook:', error);
    }

    // Verification: did it create a CustomerResponse?
    // We need to wait a moment for the async operation if it wasn't awaited fully in handleWebhook.
    // handleWebhook awaits processTrackingItem, which awaits sendTemplateMessage. So it should be fine.

    const response = await prisma.customerResponse.findFirst({
        where: { orderId: order.id, messageTemplate: 'order_in_transit' },
        orderBy: { createdAt: 'desc' },
    });

    if (response) {
        console.log('SUCCESS: CustomerResponse found!', response);
    } else {
        console.error('FAILURE: No CustomerResponse found.');
    }

    // Verification 2: Did it update the Order Status?
    const updatedOrder = await prisma.order.findUnique({
        where: { id: order.id },
    });

    if (updatedOrder?.shippingStatus === 'In Transit' && updatedOrder?.orderStatus === 'In Transit') {
        console.log('SUCCESS: Order Shipping Status AND Order Status updated to "In Transit"');
    } else {
        console.error('FAILURE: Status mismatch. Shipping:', updatedOrder?.shippingStatus, 'Order:', updatedOrder?.orderStatus);
    }

    await app.close();
}

bootstrap();
