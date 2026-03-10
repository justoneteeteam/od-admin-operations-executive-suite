import { Controller, Post, Body } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { TrackingService } from './tracking.service';

@Controller('tracking')
export class TrackingController {
    constructor(
        private readonly trackingService: TrackingService,
    ) { }

    @Public()
    @Post('webhook')
    async handleWebhook(@Body() payload: any) {
        await this.trackingService.handleWebhook(payload);
        return { status: 'success' };
    }

    @Post('register')
    async registerTracking(@Body() body: { trackingNumber: string; carrierCode?: string }) {
        // Always call 17Track API — it handles duplicates via rejection codes
        const result = await this.trackingService.registerTracking(body.trackingNumber, body.carrierCode);
        return { ...result, trackingNumber: body.trackingNumber };
    }
}
