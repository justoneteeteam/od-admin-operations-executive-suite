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

    const testTrackingNumber = '32300027789699501083398';

    console.log('Testing Webhook with Tracking Number:', testTrackingNumber);
    
    // First let's check if the order exists
    const existingOrder = await prisma.order.findFirst({
        where: { trackingNumber: testTrackingNumber }
    });

    if (existingOrder) {
        console.log(`Order found for tracking number. Order ID: ${existingOrder.id}, Current Status: ${existingOrder.orderStatus}, Shipping Status: ${existingOrder.shippingStatus}`);
    } else {
        console.log(`No order found with tracking number ${testTrackingNumber}. The webhook will ignore it or fail.`);
    }

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

    console.log('\nSimulating Webhook...');
    try {
        await trackingService.handleWebhook(payload);
        console.log('Webhook handled successfully.');
    } catch (error) {
        console.error('Error handling webhook:', error);
    }

    if (existingOrder) {
        const updatedOrder = await prisma.order.findUnique({
            where: { id: existingOrder.id }
        });
        console.log(`\nPost-webhook Order Status: ${updatedOrder?.orderStatus}, Shipping Status: ${updatedOrder?.shippingStatus}`);
    }

    await app.close();
}

bootstrap();
