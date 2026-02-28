import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrdersService } from '../../orders/orders.service';
import { CreateOrderDto } from '../../orders/dto/create-order.dto';

@Injectable()
export class ShopifyService {
    private readonly logger = new Logger(ShopifyService.name);

    constructor(
        private prisma: PrismaService,
        private ordersService: OrdersService,
    ) { }

    async processOrderWebhook(payload: any, shopDomain: string) {
        this.logger.log(`Processing Shopify Webhook: Order #${payload.order_number}`);

        try {
            // 1. Resolve or Create Customer
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

            // 2. Resolve Products from Line Items
            const orderItems: any[] = [];
            const lineItems = payload.line_items || [];

            for (const item of lineItems) {
                let product = await this.prisma.product.findUnique({
                    where: { sku: item.sku }
                });

                if (!product) {
                    this.logger.log(`Product SKU ${item.sku} not found. Auto-creating product...`);
                    product = await this.prisma.product.create({
                        data: {
                            name: item.name || `Unknown Product (${item.sku})`,
                            sku: item.sku,
                            unitCost: 0,
                            sellingPrice: Number(item.price) || 0,
                        }
                    });
                }

                orderItems.push({
                    productId: product.id,
                    productName: item.name || product.name,
                    sku: item.sku,
                    quantity: item.quantity,
                    unitPrice: Number(item.price) || Number(product.sellingPrice),
                });
            }

            if (orderItems.length === 0) {
                throw new Error(`Order #${payload.order_number} has no valid line items mapped to internal products.`);
            }

            // 3. Construct CreateOrderDto
            const createOrderDto: CreateOrderDto = {
                customerId,
                storeId: shopDomain,
                storeName: shopDomain,
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
                notes: payload.note || undefined,
                items: orderItems,
            };

            // 4. Save using OrdersService
            const newOrder = await this.ordersService.create(createOrderDto);
            this.logger.log(`Successfully created internal order: ${newOrder.id}`);

        } catch (error) {
            this.logger.error(`Error processing webhook payload for Order #${payload.order_number}`, error.stack);
            throw error;
        }
    }
}
