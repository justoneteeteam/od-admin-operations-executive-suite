import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrdersService } from '../../orders/orders.service';
import { StoreSettingsService } from '../../store-settings/store-settings.service';
import { TrackingService } from '../../tracking/tracking.service';
import { CreateOrderDto } from '../../orders/dto/create-order.dto';

@Injectable()
export class ShopifyService {
    private readonly logger = new Logger(ShopifyService.name);

    constructor(
        private prisma: PrismaService,
        private ordersService: OrdersService,
        private storeSettingsService: StoreSettingsService,
        private trackingService: TrackingService,
    ) { }

    // ──────────────────────────────────────────────
    //  Webhook Logging Helpers
    // ──────────────────────────────────────────────

    private async logWebhook(data: {
        source: string;
        eventType: string;
        shopDomain?: string;
        externalId?: string;
        orderNumber?: string;
        status: string;
        errorMessage?: string;
        payload?: any;
    }) {
        try {
            return await this.prisma.webhookLog.create({
                data: {
                    source: data.source,
                    eventType: data.eventType,
                    shopDomain: data.shopDomain || null,
                    externalId: data.externalId || null,
                    orderNumber: data.orderNumber || null,
                    status: data.status,
                    errorMessage: data.errorMessage || null,
                    payload: data.payload || null,
                },
            });
        } catch (logError) {
            // Never let logging crash the webhook pipeline
            this.logger.error('Failed to write webhook log', logError);
            return null;
        }
    }

    private async updateWebhookLog(id: string, status: string, errorMessage?: string) {
        try {
            await this.prisma.webhookLog.update({
                where: { id },
                data: { status, errorMessage: errorMessage || null },
            });
        } catch (logError) {
            this.logger.error(`Failed to update webhook log ${id}`, logError);
        }
    }

    // ──────────────────────────────────────────────
    //  Order Create Webhook
    // ──────────────────────────────────────────────

    async processOrderWebhook(payload: any, shopDomain: string) {
        const orderNumber = payload.name || String(payload.order_number || payload.id);
        const externalId = String(payload.id);

        this.logger.log(`Processing Shopify Webhook: Order ${orderNumber} (Shopify ID: ${externalId})`);

        // 1. Log the incoming webhook
        const log = await this.logWebhook({
            source: 'shopify',
            eventType: 'orders/create',
            shopDomain,
            externalId,
            orderNumber,
            status: 'received',
            payload,
        });

        try {
            // 2. Idempotency check — skip if order already exists
            const existingOrder = await this.prisma.order.findFirst({
                where: { orderNumber },
            });

            if (existingOrder) {
                this.logger.warn(`Order ${orderNumber} already exists (ID: ${existingOrder.id}). Skipping duplicate webhook.`);
                if (log) await this.updateWebhookLog(log.id, 'duplicate');
                return; // Return 200 so Shopify stops retrying
            }

            // 3. Resolve or Create Customer
            const customerEmail = payload.customer?.email || payload.email;
            const customerPhone = payload.customer?.phone || payload.phone || payload.shipping_address?.phone;

            let customerId: string;

            let customer = await this.prisma.customer.findFirst({
                where: {
                    OR: [
                        customerEmail ? { email: customerEmail } : null,
                        customerPhone ? { phone: customerPhone } : null,
                    ].filter(Boolean) as any,
                }
            });

            if (!customer) {
                // Create new customer
                customer = await this.prisma.customer.create({
                    data: {
                        name: payload.customer?.first_name ? `${payload.customer.first_name} ${payload.customer.last_name || ''}`.trim() : payload.shipping_address?.name || 'Unknown',
                        email: customerEmail,
                        phone: customerPhone || '0000000000',
                        country: payload.shipping_address?.country || 'Unknown',
                        city: payload.shipping_address?.city,
                        addressLine1: payload.shipping_address?.address1,
                        province: payload.shipping_address?.province,
                        postalCode: payload.shipping_address?.zip,
                    }
                });
            }
            customerId = customer.id;

            // 4. Resolve Products from Line Items
            const orderItems: any[] = [];
            const lineItems = payload.line_items || [];

            for (const item of lineItems) {
                const itemSku = item.sku || `NO-SKU-${item.variant_id || item.product_id || item.id || Math.random().toString(36).substring(7).toUpperCase()}`;

                let product = await this.prisma.product.findUnique({
                    where: { sku: itemSku }
                });

                if (!product) {
                    this.logger.log(`Product SKU ${itemSku} not found. Auto-creating product...`);
                    product = await this.prisma.product.create({
                        data: {
                            name: item.name || `Unknown Product (${itemSku})`,
                            sku: itemSku,
                            unitCost: 0,
                            sellingPrice: Number(item.price) || 0,
                        }
                    });
                }

                orderItems.push({
                    productId: product.id,
                    productName: item.name || product.name,
                    sku: itemSku,
                    quantity: item.quantity,
                    unitPrice: Number(item.price) || Number(product.sellingPrice),
                });
            }

            if (orderItems.length === 0) {
                throw new Error(`Order ${orderNumber} has no valid line items mapped to internal products.`);
            }

            // 5. Resolve Store from StoreSettings by domain
            let store = await this.prisma.storeSettings.findFirst({
                where: {
                    OR: [
                        { storeUrl: { contains: shopDomain } },
                        { storeName: shopDomain },
                    ]
                }
            });

            if (!store) {
                this.logger.log(`Store not found for domain '${shopDomain}'. Auto-creating store...`);
                store = await this.storeSettingsService.create({
                    storeName: shopDomain,
                    storeUrl: `https://${shopDomain}`,
                });
            }

            // 6. Extract traffic channel from note_attributes (UTM source)
            const noteAttributes = payload.note_attributes || [];
            const utmSource = noteAttributes.find(
                (attr: any) => attr.name?.toLowerCase() === 'utm_source' || attr.name?.toLowerCase() === 'utm source'
            )?.value?.toLowerCase() || null;

            // 7. Extract browser IP
            const browserIp = payload.browser_ip || null;

            this.logger.log(`Order ${orderNumber}: UTM source = ${utmSource || 'N/A'}, Browser IP = ${browserIp || 'N/A'}`);

            // 8. Construct CreateOrderDto
            const createOrderDto: CreateOrderDto = {
                orderNumber,
                customerId,
                storeId: store.id,
                storeName: store.storeName,
                shippingAddressLine1: payload.shipping_address?.address1 || 'N/A',
                shippingAddressLine2: payload.shipping_address?.address2,
                shippingCity: payload.shipping_address?.city || 'N/A',
                shippingProvince: payload.shipping_address?.province,
                shippingCountry: payload.shipping_address?.country || 'N/A',
                shippingPostalCode: payload.shipping_address?.zip,

                subtotal: Number(payload.subtotal_price) || 0,
                shippingFee: Number(payload.total_shipping_price_set?.shop_money?.amount || payload.total_shipping) || 0,
                taxCollected: Number(payload.total_tax) || 0,
                discountGiven: Number(payload.total_discounts) || 0,
                totalAmount: Number(payload.total_price) || 0,

                orderStatus: payload.fulfillment_status === 'fulfilled' ? 'Shipped' : 'Pending',
                notes: payload.note ? `${payload.note}\n[SHOPIFY_ORDER_ID:${payload.id}]` : `[SHOPIFY_ORDER_ID:${payload.id}]`,
                trafficChannel: utmSource,
                browserIp: browserIp,
                items: orderItems,
            };

            // 7. Save using OrdersService
            const newOrder = await this.ordersService.create(createOrderDto);
            if (newOrder) {
                this.logger.log(`Successfully created internal order: ${newOrder.id} (${orderNumber})`);
                if (log) await this.updateWebhookLog(log.id, 'processed');
            } else {
                this.logger.error(`Failed to create internal order for Shopify Order ${orderNumber}`);
                if (log) await this.updateWebhookLog(log.id, 'failed', 'ordersService.create returned null');
            }

        } catch (error) {
            this.logger.error(`Error processing webhook for Order ${orderNumber}: ${error.message}`, error.stack);
            if (log) await this.updateWebhookLog(log.id, 'failed', error.message);
            throw error; // Re-throw so controller returns 500 and Shopify retries
        }
    }

    // ──────────────────────────────────────────────
    //  Fulfillment Create Webhook
    // ──────────────────────────────────────────────

    async processFulfillmentWebhook(payload: any, shopDomain: string) {
        const externalOrderId = String(payload.order_id || '');
        this.logger.log(`Processing Shopify Fulfillment Webhook for Order ID: ${externalOrderId}`);

        // Log the incoming webhook
        const log = await this.logWebhook({
            source: 'shopify',
            eventType: 'fulfillments/create',
            shopDomain,
            externalId: externalOrderId,
            status: 'received',
            payload,
        });

        try {
            if (!payload.order_id) {
                this.logger.warn('Fulfillment payload missing order_id. Skipping.');
                if (log) await this.updateWebhookLog(log.id, 'failed', 'Missing order_id in payload');
                return;
            }

            // Find order by matching the appended hidden ID in notes
            const order = await this.prisma.order.findFirst({
                where: {
                    notes: {
                        contains: `[SHOPIFY_ORDER_ID:${payload.order_id}]`
                    }
                }
            });

            if (!order) {
                this.logger.warn(`Internal Order not found for Shopify Order ID: ${payload.order_id}. Cannot attach tracking.`);
                if (log) await this.updateWebhookLog(log.id, 'failed', `No internal order found for Shopify ID: ${payload.order_id}`);
                return;
            }

            // Extract tracking info
            const trackingNumber = payload.tracking_numbers?.[0] || payload.tracking_number;
            const trackingCompany = payload.tracking_companies?.[0] || payload.tracking_company;

            if (trackingNumber) {
                // Update order status and tracking details
                await this.prisma.order.update({
                    where: { id: order.id },
                    data: {
                        orderStatus: 'Shipped',
                        trackingNumber: trackingNumber,
                        courier: trackingCompany || order.courier,
                        shippedDate: new Date(),
                    }
                });

                // Also append to TrackingHistory table so it tracks properly for UI
                await this.prisma.trackingHistory.create({
                    data: {
                        orderId: order.id,
                        trackingNumber: trackingNumber,
                        carrierName: trackingCompany || 'Unknown',
                        status: 'Shipped',
                    }
                });

                // Register with 17Track
                this.trackingService.registerTracking(trackingNumber, trackingCompany)
                    .catch(e => this.logger.error(`Tracking Register Error for ${order.orderNumber}: ${e.message}`));

                this.logger.log(`Successfully attached Tracking Number ${trackingNumber} to Internal Order ${order.orderNumber}`);
                if (log) await this.updateWebhookLog(log.id, 'processed');
            } else {
                this.logger.log(`Fulfillment received for Order ${order.orderNumber} but no tracking number was included. Status untouched.`);
                if (log) await this.updateWebhookLog(log.id, 'processed');
            }

        } catch (error) {
            this.logger.error(`Error processing fulfillment webhook for Order ID ${payload.order_id}`, error.stack);
            if (log) await this.updateWebhookLog(log.id, 'failed', error.message);
            throw error; // Re-throw so controller returns 500
        }
    }
}
