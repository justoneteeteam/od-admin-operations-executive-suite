import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { OrdersService } from './orders.service';

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const ordersService = app.get(OrdersService);

    const firstOrderFromDb = await ordersService.findAll({ page: 1, limit: 1 });
    const orderId = firstOrderFromDb.data[0].id;
    const editOrder: any = await ordersService.findOne(orderId);

    // Simulate frontend stripping
    const { customer, items, trackingHistory, customerResponses, ...orderData } = editOrder;

    const cleanItems = items?.map(item => ({
        productId: item.productId,
        productName: item.productName || 'Unknown Product',
        sku: item.sku || 'N/A',
        quantity: Number(item.quantity) || 1,
        unitPrice: Number(item.unitPrice) || 0,
    }));

    const payload = {
        shippingAddressLine1: editOrder.shippingAddressLine1,
        shippingAddressLine2: editOrder.shippingAddressLine2,
        shippingCity: editOrder.shippingCity,
        shippingProvince: editOrder.shippingProvince,
        shippingPostalCode: editOrder.shippingPostalCode,
        shippingCountry: editOrder.shippingCountry,
        fulfillmentCenterId: editOrder.fulfillmentCenterId,
        trackingNumber: editOrder.trackingNumber,
        courier: editOrder.courier,
        notes: editOrder.notes,
        confirmationStatus: editOrder.confirmationStatus,
        orderStatus: editOrder.orderStatus,
        shippingFee: editOrder.shippingFee,
        taxCollected: editOrder.taxCollected,
        discountGiven: editOrder.discountGiven,
        paymentStatus: editOrder.paymentStatus,
        items: cleanItems
    };

    console.log("Attempting to update with payload keys:", Object.keys(payload));

    try {
        await ordersService.update(editOrder.id, payload);
        console.log("UPDATE SUCCESS!");
    } catch (e) {
        console.error("UPDATE FAILED:", e.message);
    }

    await app.close();
}

bootstrap().catch(console.error);
