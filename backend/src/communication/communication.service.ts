import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CommunicationService {
    private readonly logger = new Logger(CommunicationService.name);

    constructor(private readonly prisma: PrismaService) {}

    // ─── TEMPLATES ─────────────────────────────────────────────────────

    async listTemplates(params?: { channel?: string; language?: string; search?: string }) {
        const where: any = {};
        if (params?.channel) where.channel = params.channel;
        if (params?.language) where.language = params.language;
        if (params?.search) {
            where.OR = [
                { templateName: { contains: params.search, mode: 'insensitive' } },
                { subject: { contains: params.search, mode: 'insensitive' } },
                { shortDescription: { contains: params.search, mode: 'insensitive' } },
            ];
        }

        return this.prisma.notificationTemplate.findMany({
            where,
            orderBy: { createdAt: 'desc' },
        });
    }

    async getTemplate(id: string) {
        const template = await this.prisma.notificationTemplate.findUnique({ where: { id } });
        if (!template) throw new NotFoundException('Template not found');
        return template;
    }

    async createTemplate(dto: {
        templateName: string;
        templateType: string;
        channel?: string;
        subject?: string;
        bodyTemplate: string;
        shortDescription?: string;
        variables?: any;
        language?: string;
    }) {
        return this.prisma.notificationTemplate.create({ data: dto });
    }

    async updateTemplate(id: string, dto: any) {
        const existing = await this.prisma.notificationTemplate.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Template not found');
        return this.prisma.notificationTemplate.update({ where: { id }, data: dto });
    }

    async deleteTemplate(id: string) {
        const existing = await this.prisma.notificationTemplate.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Template not found');
        return this.prisma.notificationTemplate.delete({ where: { id } });
    }

    // ─── SEQUENCES ─────────────────────────────────────────────────────

    async listSequences() {
        return this.prisma.communicationSequence.findMany({
            include: { _count: { select: { steps: true } } },
            orderBy: { createdAt: 'desc' },
        });
    }

    async getSequence(id: string) {
        const sequence = await this.prisma.communicationSequence.findUnique({
            where: { id },
            include: {
                steps: {
                    include: { template: { select: { id: true, templateName: true, channel: true, language: true } } },
                    orderBy: { stepOrder: 'asc' },
                },
            },
        });
        if (!sequence) throw new NotFoundException('Sequence not found');
        return sequence;
    }

    async createSequence(dto: {
        name: string;
        category: string;
        triggerEvent: string;
        description?: string;
        conditions?: any;
        whenStockNote?: any;
        isActive?: boolean;
        legacyCaseType?: string;
    }) {
        return this.prisma.communicationSequence.create({ data: dto });
    }

    async updateSequence(id: string, dto: any) {
        const existing = await this.prisma.communicationSequence.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Sequence not found');
        return this.prisma.communicationSequence.update({ where: { id }, data: dto });
    }

    async deleteSequence(id: string) {
        const existing = await this.prisma.communicationSequence.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Sequence not found');
        // Steps will cascade delete
        return this.prisma.communicationSequence.delete({ where: { id } });
    }

    // ─── SEQUENCE STEPS ────────────────────────────────────────────────

    async addStep(sequenceId: string, dto: {
        channel: string;
        label: string;
        stepOrder?: number;
        templateId?: string;
        delayMinutes?: number;
        trigger?: string;
        branches?: any;
        content?: string;
    }) {
        // Verify sequence exists
        const seq = await this.prisma.communicationSequence.findUnique({
            where: { id: sequenceId },
            include: { _count: { select: { steps: true } } },
        });
        if (!seq) throw new NotFoundException('Sequence not found');

        const stepOrder = dto.stepOrder ?? (seq._count.steps + 1);

        return this.prisma.sequenceStep.create({
            data: {
                sequenceId,
                channel: dto.channel,
                label: dto.label,
                stepOrder,
                templateId: dto.templateId || null,
                delayMinutes: dto.delayMinutes || 0,
                trigger: dto.trigger || 'auto',
                branches: dto.branches || null,
                content: dto.content || null,
            },
        });
    }

    async removeStep(stepId: string) {
        const step = await this.prisma.sequenceStep.findUnique({ where: { id: stepId } });
        if (!step) throw new NotFoundException('Step not found');
        return this.prisma.sequenceStep.delete({ where: { id: stepId } });
    }

    async reorderSteps(sequenceId: string, stepIds: string[]) {
        // Verify sequence exists
        const seq = await this.prisma.communicationSequence.findUnique({ where: { id: sequenceId } });
        if (!seq) throw new NotFoundException('Sequence not found');

        // Update each step's order
        const updates = stepIds.map((id, index) =>
            this.prisma.sequenceStep.update({
                where: { id },
                data: { stepOrder: index + 1 },
            })
        );

        return this.prisma.$transaction(updates);
    }

    // ─── CALL RECORDS ──────────────────────────────────────────────────

    async listCallRecords(params?: {
        type?: string;
        intent?: string;
        language?: string;
        search?: string;
        page?: number;
        limit?: number;
    }) {
        const where: any = { callStatus: { not: 'skipped' } };

        if (params?.type) where.scriptType = params.type;
        if (params?.intent) where.intentDetected = params.intent;
        if (params?.language) where.scriptLanguage = params.language;

        if (params?.search) {
            where.OR = [
                { callSid: { contains: params.search, mode: 'insensitive' } },
                { order: { orderNumber: { contains: params.search, mode: 'insensitive' } } },
            ];
        }

        const page = params?.page || 1;
        const limit = params?.limit || 50;

        const [records, total] = await Promise.all([
            this.prisma.callLog.findMany({
                where,
                include: {
                    order: {
                        select: {
                            id: true,
                            orderNumber: true,
                            confirmationStatus: true,
                            shippingCountry: true,
                            customer: { select: { name: true, phone: true } },
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.callLog.count({ where }),
        ]);

        // Aggregate stats
        const stats = await this.prisma.callLog.groupBy({
            by: ['intentDetected'],
            _count: { id: true },
        });

        const statsMap: Record<string, number> = {};
        stats.forEach(s => { statsMap[s.intentDetected || 'unknown'] = s._count.id; });

        return {
            records,
            total,
            page,
            totalPages: Math.ceil(total / limit),
            stats: {
                total,
                confirmed: statsMap['CONFIRMED'] || 0,
                cancelled: statsMap['CANCELLED'] || 0,
                noAnswer: statsMap['NO_ANSWER'] || 0,
                unclear: statsMap['UNCLEAR'] || 0,
            },
        };
    }

    async updateCsNote(id: string, note: string) {
        const callLog = await this.prisma.callLog.findUnique({ where: { id } });
        if (!callLog) throw new NotFoundException('Call log not found');
        return this.prisma.callLog.update({
            where: { id },
            data: { csNote: note },
        });
    }
}
