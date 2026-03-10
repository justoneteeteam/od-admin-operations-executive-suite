import { Controller, Post, Body } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { TrackingService } from './tracking.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('tracking')
export class TrackingController {
    constructor(
        private readonly trackingService: TrackingService,
        private readonly prisma: PrismaService,
    ) { }

    @Public()
    @Post('webhook')
    async handleWebhook(@Body() payload: any) {
        await this.trackingService.handleWebhook(payload);
        return { status: 'success' };
    }

    @Post('register')
    async registerTracking(@Body() body: { trackingNumber: string; carrierCode?: string }) {
        // Check if tracking history already exists (means 17Track is already pushing data)
        const existingHistory = await this.prisma.trackingHistory.findFirst({
            where: { trackingNumber: body.trackingNumber },
        });

        if (existingHistory) {
            return { status: 'already_registered', trackingNumber: body.trackingNumber };
        }

        await this.trackingService.registerTracking(body.trackingNumber, body.carrierCode);
        return { status: 'registered', trackingNumber: body.trackingNumber };
    }
}
