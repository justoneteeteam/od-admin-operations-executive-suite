import { Controller, Post, Body, Headers, HttpCode, HttpException, HttpStatus } from '@nestjs/common';
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
        @Headers('x-shopify-shop-domain') shopDomain: string
    ) {
        try {
            await this.shopifyService.processOrderWebhook(payload, shopDomain);
            return { message: 'Order created successfully' };
        } catch (error) {
            // Return 500 so Shopify retries the webhook
            throw new HttpException(
                { message: 'Webhook processing failed', error: error.message },
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    @Public()
    @Post('fulfillment-create')
    @HttpCode(200)
    async handleFulfillmentCreate(
        @Body() payload: any,
        @Headers('x-shopify-shop-domain') shopDomain: string
    ) {
        try {
            await this.shopifyService.processFulfillmentWebhook(payload, shopDomain);
            return { message: 'Fulfillment processed successfully' };
        } catch (error) {
            // Return 500 so Shopify retries the webhook
            throw new HttpException(
                { message: 'Fulfillment webhook processing failed', error: error.message },
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }
}
