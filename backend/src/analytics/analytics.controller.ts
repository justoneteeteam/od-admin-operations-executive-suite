import { Controller, Get, UseGuards, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; // Assuming generic auth guard exists or we skip for now

@Controller('analytics')
export class AnalyticsController {
    constructor(private readonly analyticsService: AnalyticsService) { }

    @Get('dashboard')
    async getDashboard(@Query() query: { period?: string, startDate?: string, endDate?: string }) {
        console.log('GET /analytics/dashboard query:', query);
        let start: Date | undefined;
        let end: Date | undefined;

        if (query.period) {
            const now = new Date();
            end = new Date(now);

            switch (query.period) {
                case 'TODAY':
                    start = new Date(now);
                    start.setHours(0, 0, 0, 0);
                    break;
                case '7 DAY':
                    start = new Date(now);
                    start.setDate(now.getDate() - 7);
                    start.setHours(0, 0, 0, 0);
                    break;
                case '30 DAY':
                    start = new Date(now);
                    start.setDate(now.getDate() - 30);
                    start.setHours(0, 0, 0, 0);
                    break;
                case 'CUSTOM':
                    if (query.startDate) start = new Date(query.startDate);
                    if (query.endDate) {
                        end = new Date(query.endDate);
                        end.setHours(23, 59, 59, 999);
                    }
                    break;
                case 'ALL TIME':
                    start = undefined;
                    end = undefined;
                    console.log('Using ALL TIME filter: start=undefined, end=undefined');
                    break;
            }
        }
        console.log(`Calling service with start=${start}, end=${end}`);
        return this.analyticsService.getDashboardMetrics(start, end);
    }
}
