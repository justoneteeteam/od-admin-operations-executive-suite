import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingService } from '../tracking/tracking.service';

async function bootstrap() {
    console.log('Bootstrapping app for WA test...');
    const app = await NestFactory.createApplicationContext(AppModule);
    const prisma = app.get(PrismaService);
    const trackingService = app.get(TrackingService);

    console.log('Creating test customer and order...');

    // Create customer
    const customer = await prisma.customer.create({
        data: {
            name: 'Luke Pham',
            email: `test${Date.now()}@example.com`,
            phone: '+84932715104',
            country: 'Spain',
            language: 'es'
        }
    });

    // Create a product
    const product = await prisma.product.create({
        data: {
            name: 'T-Shirt',
            sku: `TSHIRT-${Date.now()}`,
            unitCost: 10,
            sellingPrice: 20,
            stockLevel: 100,
            isActive: true
        }
    });

    // Create a store
    const store = await prisma.storeSettings.create({
        data: {
            storeName: 'JustOneTee Spain'
        }
    });

    // Create order
    const orderNumber = `ORD-TEST-${Date.now()}`;
    const trackingNumber = `TRACK-${Date.now()}`;

    const order = await prisma.order.create({
        data: {
            orderNumber: orderNumber,
            customerId: customer.id,
            storeId: store.id,
            storeName: store.storeName,
            subtotal: 40.00,
            totalAmount: 50.00,
            shippingCountry: 'Spain', // triggers Spanish template
            shippingCity: 'Madrid',
            shippingAddressLine1: 'Test St 123',
            trackingNumber: trackingNumber,
            items: {
                create: [
                    {
                        productId: product.id,
                        quantity: 2,
                        unitPrice: 20,
                        subtotal: 40,
                        productName: 'T-Shirt',
                        sku: product.sku
                    }
                ]
            }
        },
        include: { customer: true, items: { include: { product: true } } }
    });

    console.log(`Created test order ${orderNumber}`);
    console.log('Triggering tracking webhook (In Transit)...');

    // Simulate 17Track webhook payload
    const payload = {
        event: 'TRACKING_UPDATED',
        data: {
            accepted: [
                {
                    number: trackingNumber,
                    track_info: {
                        latest_status: {
                            status: 'InTransit',
                            sub_status: 'InTransit_Arrival'
                        },
                        latest_event: {
                            description: 'Out for delivery',
                            location: 'Madrid',
                            time_utc: new Date().toISOString()
                        },
                        provider: {
                            provider: {
                                name: 'Correos',
                                key: 'correos'
                            }
                        }
                    }
                }
            ]
        }
    };

    await trackingService.handleWebhook(payload);

    console.log('Webhook processed. The WhatsApp message should be scheduled now (delayed by 5s).');

    // Wait 6 seconds to let the setTimeout finish before closing app context
    await new Promise(resolve => setTimeout(resolve, 6000));

    await app.close();
    console.log('Done!');
}

bootstrap().catch(console.error);
