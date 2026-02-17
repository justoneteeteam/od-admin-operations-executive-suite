import { Controller, Post, Body } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { TrackingService } from './tracking.service';

@Controller('tracking')
export class TrackingController {
    constructor(private readonly trackingService: TrackingService) { }

    @Public()
    @Post('webhook')
    async handleWebhook(@Body() payload: any) {
        await this.trackingService.handleWebhook(payload);
        return { status: 'success' };
    }
}
