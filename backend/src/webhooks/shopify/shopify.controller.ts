import { Controller, Post, Body, Headers, HttpCode } from '@nestjs/common';
import { ShopifyService } from './shopify.service';
import { Public } from '../../auth/public.decorator';

@Controller('webhooks/shopify')
export class ShopifyController {
    constructor(private readonly shopifyService: ShopifyService) { }

    @Public()
    @Post('order-create')
    @HttpCode(200)
    async handleOrderCreate(
        @Body() payload: any,
        @Headers('x-shopify-topic') topic: string,
        @Headers('x-shopify-shop-domain') shopDomain: string
    ) {
        if (topic === 'orders/create') {
            try {
                await this.shopifyService.processOrderWebhook(payload, shopDomain);
                return { message: 'Order created successfully' };
            } catch (error) {
                console.error('Shopify Webhook processing failed:', error.message);
                return { message: 'Webhook received, but internal processing failed' };
            }
        }
        return { message: 'Ignored unsupported topic' };
    }

    @Public()
    @Post('fulfillment-create')
    @HttpCode(200)
    async handleFulfillmentCreate(
        @Body() payload: any,
        @Headers('x-shopify-topic') topic: string,
        @Headers('x-shopify-shop-domain') shopDomain: string
    ) {
        if (topic === 'fulfillments/create') {
            try {
                await this.shopifyService.processFulfillmentWebhook(payload, shopDomain);
                return { message: 'Fulfillment processed successfully' };
            } catch (error) {
                console.error('Shopify Fulfillment Webhook processing failed:', error.message);
                return { message: 'Webhook received, but internal processing failed' };
            }
        }
        return { message: 'Ignored unsupported topic' };
    }
}
