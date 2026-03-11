import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';

@Injectable()
export class TicketsService {
    private readonly logger = new Logger(TicketsService.name);

    constructor(private readonly prisma: PrismaService) {}

    // ─── TICKET NUMBERING ────────────────────────────────────────────
    private async generateTicketNumber(): Promise<string> {
        const lastTicket = await this.prisma.ticket.findFirst({
            orderBy: { createdAt: 'desc' },
            select: { ticketNumber: true },
        });
        const lastNum = lastTicket ? parseInt(lastTicket.ticketNumber.replace('INC-', ''), 10) : 0;
        return `INC-${String(lastNum + 1).padStart(4, '0')}`;
    }

    // ─── SLA DEADLINE CALCULATION ────────────────────────────────────
    /**
     * Calculate 72 business-hour deadline, skipping GMT+1 Saturday & Sunday.
     * Returns a UTC timestamp.
     */
    calculateSlaDeadline(startDate: Date): Date {
        const SLA_HOURS = 72;
        const GMT_PLUS_1_OFFSET = 1; // CET
        let remainingHours = SLA_HOURS;
        const cursor = new Date(startDate.getTime());

        while (remainingHours > 0) {
            // Get the hour in GMT+1
            const gmtPlus1Hour = (cursor.getUTCHours() + GMT_PLUS_1_OFFSET) % 24;
            const dayOfWeek = this.getDayOfWeekInGmtPlus1(cursor);

            // Skip Saturday (6) and Sunday (0) in GMT+1
            if (dayOfWeek === 6 || dayOfWeek === 0) {
                // Jump to next Monday 00:00 GMT+1
                const daysToMonday = dayOfWeek === 6 ? 2 : 1;
                cursor.setTime(cursor.getTime() + daysToMonday * 24 * 60 * 60 * 1000);
                // Set to 00:00 GMT+1 = 23:00 UTC (prev day)
                cursor.setUTCHours(24 - GMT_PLUS_1_OFFSET, 0, 0, 0);
                continue;
            }

            // Count this hour
            remainingHours--;
            cursor.setTime(cursor.getTime() + 60 * 60 * 1000);
        }

        return cursor;
    }

    private getDayOfWeekInGmtPlus1(date: Date): number {
        const adjusted = new Date(date.getTime() + 1 * 60 * 60 * 1000);
        return adjusted.getUTCDay();
    }

    // ─── CREATE ──────────────────────────────────────────────────────
    async create(dto: CreateTicketDto) {
        const ticketNumber = await this.generateTicketNumber();
        const slaDeadlineAt = this.calculateSlaDeadline(new Date());

        // Check for duplicate auto ticket
        if (dto.orderId) {
            const existing = await this.prisma.ticket.findFirst({
                where: {
                    orderId: dto.orderId,
                    source: '17track_auto',
                    deletedAt: null,
                },
            });
            if (existing) {
                throw new ConflictException(`Ticket already exists for this order: ${existing.ticketNumber}`);
            }
        }

        const ticket = await this.prisma.ticket.create({
            data: {
                ticketNumber,
                title: dto.title,
                description: dto.description,
                caseType: dto.caseType || 'other',
                priority: dto.priority || 'medium',
                source: 'manual',
                orderId: dto.orderId,
                customerId: dto.customerId,
                picId: dto.picId,
                picName: dto.picName,
                country: dto.country,
                slaDeadlineAt: slaDeadlineAt,
            },
            include: {
                order: { select: { orderNumber: true, totalAmount: true } },
                customer: { select: { name: true, phone: true } },
            },
        });

        // Add creation timeline event
        await this.prisma.ticketTimeline.create({
            data: {
                ticketId: ticket.id,
                eventType: 'system',
                channel: 'system',
                content: `Ticket created manually`,
            },
        });

        return ticket;
    }

    // ─── AUTO CREATE (from 17Track webhook) ──────────────────────────
    async createFromTracking(data: {
        orderId: string;
        customerId?: string;
        title: string;
        caseType: string;
        trackingSubstatus: string;
        country?: string;
        description?: string;
    }) {
        // Check duplicate
        const existing = await this.prisma.ticket.findFirst({
            where: {
                orderId: data.orderId,
                source: '17track_auto',
                deletedAt: null,
            },
        });
        if (existing) {
            this.logger.log(`Ticket already exists for order ${data.orderId}: ${existing.ticketNumber}`);
            return existing;
        }

        const ticketNumber = await this.generateTicketNumber();
        const slaDeadlineAt = this.calculateSlaDeadline(new Date());

        const ticket = await this.prisma.ticket.create({
            data: {
                ticketNumber,
                title: data.title,
                description: data.description,
                caseType: data.caseType,
                priority: 'high', // Auto incidents default to high
                source: '17track_auto',
                orderId: data.orderId,
                customerId: data.customerId,
                country: data.country,
                trackingSubstatus: data.trackingSubstatus,
                slaDeadlineAt: slaDeadlineAt,
            },
        });

        await this.prisma.ticketTimeline.create({
            data: {
                ticketId: ticket.id,
                eventType: 'system',
                channel: 'system',
                content: `Auto-created from 17Track: ${data.trackingSubstatus} — ${data.description || ''}`,
            },
        });

        this.logger.log(`Created incident ticket ${ticketNumber} (${data.caseType}) for order ${data.orderId}`);
        return ticket;
    }

    // ─── ADD TIMELINE EVENT TO EXISTING TICKET ──────────────────────
    async addTimelineEvent(orderId: string, content: string) {
        const ticket = await this.prisma.ticket.findFirst({
            where: { orderId, deletedAt: null },
            orderBy: { createdAt: 'desc' },
        });
        if (!ticket) return null;

        return this.prisma.ticketTimeline.create({
            data: {
                ticketId: ticket.id,
                eventType: 'system',
                channel: 'system',
                content,
            },
        });
    }

    // ─── FIND ALL (with filters) ─────────────────────────────────────
    async findAll(query: {
        status?: string;
        priority?: string;
        caseType?: string;
        search?: string;
        picId?: string;
        page?: number;
        limit?: number;
    }) {
        const where: any = { deletedAt: null };
        if (query.status) where.status = query.status;
        if (query.priority) where.priority = query.priority;
        if (query.caseType) where.caseType = query.caseType;
        if (query.picId) where.picId = query.picId;
        if (query.search) {
            where.OR = [
                { ticketNumber: { contains: query.search, mode: 'insensitive' } },
                { title: { contains: query.search, mode: 'insensitive' } },
            ];
        }

        const page = query.page || 1;
        const limit = query.limit || 50;

        const [tickets, total] = await Promise.all([
            this.prisma.ticket.findMany({
                where,
                include: {
                    order: { select: { orderNumber: true, totalAmount: true, shippingCountry: true } },
                    customer: { select: { name: true, phone: true } },
                    pic: { select: { fullName: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.ticket.count({ where }),
        ]);

        return { tickets, total, page, limit };
    }

    // ─── FIND ONE ────────────────────────────────────────────────────
    async findOne(id: string) {
        const ticket = await this.prisma.ticket.findFirst({
            where: { id, deletedAt: null },
            include: {
                order: {
                    include: {
                        items: { include: { product: true } },
                        customer: true,
                        trackingHistory: { orderBy: { createdAt: 'desc' } },
                        callLogs: { orderBy: { createdAt: 'desc' } },
                    },
                },
                customer: true,
                pic: { select: { fullName: true, email: true } },
                timeline: { orderBy: { createdAt: 'desc' } },
                messages: { orderBy: { createdAt: 'desc' } },
            },
        });

        if (!ticket) throw new NotFoundException('Ticket not found');
        return ticket;
    }

    // ─── UPDATE ──────────────────────────────────────────────────────
    async update(id: string, dto: UpdateTicketDto) {
        const ticket = await this.prisma.ticket.findFirst({
            where: { id, deletedAt: null },
        });
        if (!ticket) throw new NotFoundException('Ticket not found');

        return this.prisma.ticket.update({
            where: { id },
            data: dto as any,
        });
    }

    // ─── STATUS TRANSITION ───────────────────────────────────────────
    async updateStatus(id: string, newStatus: string) {
        const ticket = await this.prisma.ticket.findFirst({
            where: { id, deletedAt: null },
        });
        if (!ticket) throw new NotFoundException('Ticket not found');

        // Validate transitions
        if (ticket.status === 'closed') {
            throw new BadRequestException('Cannot change status of a closed ticket');
        }

        const updateData: any = { status: newStatus };

        if (newStatus === 'resolved') {
            updateData.resolvedAt = new Date();
            updateData.autoPaused = true;
        } else if (newStatus === 'closed') {
            updateData.closedAt = new Date();
            updateData.autoPaused = true;
        }

        const updated = await this.prisma.ticket.update({
            where: { id },
            data: updateData,
        });

        await this.prisma.ticketTimeline.create({
            data: {
                ticketId: id,
                eventType: 'status_change',
                channel: 'system',
                content: `Status changed: ${ticket.status} → ${newStatus}`,
            },
        });

        return updated;
    }

    // ─── RESOLVE WITH OUTCOME ────────────────────────────────────────
    async resolve(id: string, resolution: string) {
        const valid = ['return_to_warehouse', 'reshipment', 'resolved', 'cancelled'];
        if (!valid.includes(resolution)) {
            throw new BadRequestException(`Invalid resolution. Must be one of: ${valid.join(', ')}`);
        }

        const ticket = await this.prisma.ticket.findFirst({
            where: { id, deletedAt: null },
        });
        if (!ticket) throw new NotFoundException('Ticket not found');

        const updated = await this.prisma.ticket.update({
            where: { id },
            data: {
                status: 'resolved',
                resolution,
                resolvedAt: new Date(),
                autoPaused: true,
            },
        });

        await this.prisma.ticketTimeline.create({
            data: {
                ticketId: id,
                eventType: 'status_change',
                channel: 'system',
                content: `Resolved with outcome: ${resolution}`,
            },
        });

        return updated;
    }

    // ─── ASSIGN PIC ──────────────────────────────────────────────────
    async assign(id: string, picId: string, picName?: string) {
        const ticket = await this.prisma.ticket.findFirst({
            where: { id, deletedAt: null },
        });
        if (!ticket) throw new NotFoundException('Ticket not found');

        const updated = await this.prisma.ticket.update({
            where: { id },
            data: { picId, picName },
        });

        await this.prisma.ticketTimeline.create({
            data: {
                ticketId: id,
                eventType: 'system',
                channel: 'system',
                content: `Assigned to ${picName || picId}`,
            },
        });

        return updated;
    }

    // ─── SOFT DELETE ─────────────────────────────────────────────────
    async softDelete(id: string) {
        const ticket = await this.prisma.ticket.findFirst({
            where: { id, deletedAt: null },
        });
        if (!ticket) throw new NotFoundException('Ticket not found');

        return this.prisma.ticket.update({
            where: { id },
            data: { deletedAt: new Date() },
        });
    }

    // ─── STATS ───────────────────────────────────────────────────────
    async getStats() {
        const [open, inProgress, resolved, closed, slaBreached] = await Promise.all([
            this.prisma.ticket.count({ where: { status: 'open', deletedAt: null } }),
            this.prisma.ticket.count({ where: { status: 'in_progress', deletedAt: null } }),
            this.prisma.ticket.count({ where: { status: 'resolved', deletedAt: null } }),
            this.prisma.ticket.count({ where: { status: 'closed', deletedAt: null } }),
            this.prisma.ticket.count({ where: { slaBreached: true, deletedAt: null } }),
        ]);

        // Resolved this week
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const resolvedThisWeek = await this.prisma.ticket.count({
            where: {
                status: { in: ['resolved', 'closed'] },
                resolvedAt: { gte: weekAgo },
                deletedAt: null,
            },
        });

        // Auto sequences active
        const autoActive = await this.prisma.ticket.count({
            where: {
                autoStep: { gt: 0 },
                autoPaused: false,
                status: { in: ['open', 'in_progress'] },
                deletedAt: null,
            },
        });

        // Case type breakdown
        const caseTypeBreakdown = await this.prisma.ticket.groupBy({
            by: ['caseType'],
            _count: true,
            where: { deletedAt: null },
        });

        return {
            open,
            inProgress,
            resolved,
            closed,
            slaBreached,
            resolvedThisWeek,
            autoActive,
            caseTypeBreakdown: caseTypeBreakdown.map(ct => ({
                caseType: ct.caseType,
                count: ct._count,
            })),
        };
    }

    // ─── WORKFLOWS ───────────────────────────────────────────────────
    async getWorkflows() {
        return this.prisma.incidentWorkflow.findMany({
            orderBy: { createdAt: 'asc' },
        });
    }

    async updateWorkflow(caseType: string, data: { steps?: any; channelOrder?: any; title?: string; description?: string; isActive?: boolean }) {
        return this.prisma.incidentWorkflow.update({
            where: { caseType },
            data: {
                ...(data.steps !== undefined && { steps: data.steps }),
                ...(data.channelOrder !== undefined && { channelOrder: data.channelOrder }),
                ...(data.title !== undefined && { title: data.title }),
                ...(data.description !== undefined && { description: data.description }),
                ...(data.isActive !== undefined && { isActive: data.isActive }),
            },
        });
    }
}
