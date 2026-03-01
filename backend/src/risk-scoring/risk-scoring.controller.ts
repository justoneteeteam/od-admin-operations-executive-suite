import { Controller, Post, Param, Get, Patch, Body } from '@nestjs/common';
import { RiskScoringService } from './risk-scoring.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('risk-scoring')
export class RiskScoringController {
    constructor(
        private readonly riskScoringService: RiskScoringService,
        private readonly prisma: PrismaService
    ) { }

    @Post('assess/:orderId')
    async assessOrder(@Param('orderId') orderId: string) {
        return this.riskScoringService.assessOrder(orderId);
    }

    @Get('queue')
    async getCallCenterQueue() {
        return this.prisma.riskAssessment.findMany({
            where: {
                riskLevel: 'HIGH',
                actionResult: null // Not yet reviewed
            },
            include: {
                order: {
                    include: {
                        customer: true,
                        items: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    @Get(':orderId')
    async getRiskAssessment(@Param('orderId') orderId: string) {
        return this.prisma.riskAssessment.findFirst({
            where: { orderId },
            orderBy: { createdAt: 'desc' }
        });
    }

    @Patch(':id/review')
    async reviewAssessment(
        @Param('id') id: string,
        @Body() body: { actionResult: string; reviewNotes?: string; reviewerId?: string }
    ) {
        return this.prisma.riskAssessment.update({
            where: { id },
            data: {
                actionResult: body.actionResult, // e.g., 'approved', 'rejected', 'prepayment'
                reviewNotes: body.reviewNotes,
                reviewedBy: body.reviewerId,
                reviewedAt: new Date()
            }
        });
    }
}
