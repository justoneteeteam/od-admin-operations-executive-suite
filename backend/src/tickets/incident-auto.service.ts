import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TicketsService } from './tickets.service';

/**
 * Maps 17Track substatus / description keywords → incident case_type.
 */
const SUBSTATUS_MAP: Record<string, string> = {
    'DeliveryFailure_InvalidAddress': 'address_issue',
    'DeliveryFailure_NoBody': 'customer_unavailable',
    'DeliveryFailure_Rejected': 'delivery_refused',
    'DeliveryFailure_Security': 'delivery_refused',
    'Exception_Returning': 'delivery_refused',
};

const KEYWORD_RULES: { keywords: string[]; caseType: string }[] = [
    { keywords: ['address', 'incorrect', 'incomplete', 'postal code', 'dirección', 'indirizzo'], caseType: 'address_issue' },
    { keywords: ['absent', 'not available', 'no response', 'unreachable', 'no localizar'], caseType: 'customer_unavailable' },
    { keywords: ['refused', 'rejected', 'rehusado', 'rechazado'], caseType: 'delivery_refused' },
    { keywords: ['customs', 'import', 'duties', 'aduanas', 'dogana'], caseType: 'customs_issue' },
    { keywords: ['damaged', 'broken', 'lost', 'destroyed', 'missing', 'dañado', 'perdido'], caseType: 'parcel_damaged_lost' },
    { keywords: ['delay', 'weather', 'sorting', 'backlog', 'hub', 'retraso'], caseType: 'delivery_delay' },
    { keywords: ['access', 'gate', 'security', 'blocked', 'inaccessible', 'acceso'], caseType: 'access_issue' },
    { keywords: ['misrouted', 'label', 'sorting error', 'not collected'], caseType: 'pickup_warehouse_issue' },
    { keywords: ['rescheduled', 'postponed', 'new date', 'reprogramado'], caseType: 'rescheduled' },
];

@Injectable()
export class IncidentAutoService {
    private readonly logger = new Logger(IncidentAutoService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly ticketsService: TicketsService,
    ) {}

    // ─── 17TRACK CLASSIFICATION ──────────────────────────────────────
    classifyCaseType(substatus: string | null, description: string | null): string {
        // 1. Try substatus mapping first
        if (substatus && SUBSTATUS_MAP[substatus]) {
            return SUBSTATUS_MAP[substatus];
        }

        // 2. Keyword match on description
        if (description) {
            const lowerDesc = description.toLowerCase();
            for (const rule of KEYWORD_RULES) {
                if (rule.keywords.some(kw => lowerDesc.includes(kw))) {
                    return rule.caseType;
                }
            }
        }

        return 'other';
    }

    // ─── HANDLE TRACKING EVENT (called from tracking.service.ts) ─────
    async handleTrackingEvent(params: {
        orderId: string;
        customerId?: string;
        mainStatus: string;
        substatus: string | null;
        description: string | null;
        country?: string;
    }) {
        const { orderId, customerId, mainStatus, substatus, description, country } = params;

        // Only trigger on incident statuses
        const incidentStatuses = ['DeliveryFailure', 'Exception', 'Undelivered'];
        if (!incidentStatuses.includes(mainStatus)) return;

        const caseType = this.classifyCaseType(substatus, description);

        // Special case: "rescheduled" adds timeline event to existing ticket
        if (caseType === 'rescheduled') {
            await this.ticketsService.addTimelineEvent(
                orderId,
                `Delivery rescheduled: ${description || 'Courier rescheduled delivery'}`,
            );
            this.logger.log(`Added rescheduled timeline event for order ${orderId}`);
            return;
        }

        // Create incident ticket
        try {
            await this.ticketsService.createFromTracking({
                orderId,
                customerId,
                title: this.buildTitle(caseType, description),
                caseType,
                trackingSubstatus: substatus || mainStatus,
                country,
                description: description || undefined,
            });
        } catch (err) {
            this.logger.error(`Failed to create incident ticket: ${err.message}`);
        }
    }

    private buildTitle(caseType: string, description: string | null): string {
        const titleMap: Record<string, string> = {
            address_issue: 'Address Issue',
            customer_unavailable: 'Customer Not Available',
            delivery_refused: 'Delivery Refused',
            customs_issue: 'Customs/Import Issue',
            parcel_damaged_lost: 'Parcel Damaged or Lost',
            delivery_delay: 'Delivery Delay',
            access_issue: 'Courier Access Issue',
            pickup_warehouse_issue: 'Pickup/Warehouse Issue',
            other: 'Other Incident',
        };
        const prefix = titleMap[caseType] || 'Incident';
        // Truncate description for title
        const suffix = description ? ` — ${description.substring(0, 60)}` : '';
        return `${prefix}${suffix}`;
    }

    // ─── SYNC UNDELIVERED ORDERS (Hourly fallback) ───────────────────
    @Cron('0 * * * *')
    async syncUndeliveredOrders() {
        this.logger.log('Running hourly undelivered orders sync...');
        try {
            const undeliveredOrders = await this.prisma.order.findMany({
                where: {
                    orderStatus: { in: ['Undelivered', 'DeliveryFailure', 'Exception'] },
                    tickets: { none: { source: '17track_auto', deletedAt: null } },
                },
                include: { customer: true },
                take: 100,
            });

            this.logger.log(`Found ${undeliveredOrders.length} undelivered orders without tickets`);

            for (const order of undeliveredOrders) {
                try {
                    // Get the latest tracking event to classify
                    const latestTracking = await this.prisma.trackingHistory.findFirst({
                        where: { orderId: order.id },
                        orderBy: { createdAt: 'desc' },
                    });

                    const caseType = latestTracking
                        ? this.classifyCaseType(latestTracking.substatus, latestTracking.description)
                        : 'other';

                    await this.ticketsService.createFromTracking({
                        orderId: order.id,
                        customerId: order.customerId,
                        title: `${this.buildTitle(caseType, latestTracking?.description || null)} — Order ${order.orderNumber}`,
                        caseType,
                        trackingSubstatus: latestTracking?.substatus || order.orderStatus,
                        country: order.shippingCountry,
                        description: latestTracking?.description || undefined,
                    });
                } catch (err) {
                    this.logger.error(`Sync ticket for order ${order.orderNumber}: ${err.message}`);
                }
            }
        } catch (err) {
            this.logger.error(`Undelivered sync cron error: ${err.message}`);
        }
    }

    // ─── SLA BREACH CHECKER (Every 15 min) ───────────────────────────
    @Cron('*/15 * * * *')
    async checkSlaBreaches() {
        this.logger.log('Checking SLA breaches...');
        try {
            const now = new Date();
            const breachedTickets = await this.prisma.ticket.findMany({
                where: {
                    slaBreached: false,
                    slaDeadlineAt: { lte: now },
                    status: { notIn: ['resolved', 'closed'] },
                    deletedAt: null,
                },
            });

            if (breachedTickets.length === 0) return;

            this.logger.warn(`Found ${breachedTickets.length} SLA breaches`);

            for (const ticket of breachedTickets) {
                await this.prisma.ticket.update({
                    where: { id: ticket.id },
                    data: {
                        slaBreached: true,
                        priority: 'urgent',
                    },
                });

                await this.prisma.ticketTimeline.create({
                    data: {
                        ticketId: ticket.id,
                        eventType: 'escalation',
                        channel: 'system',
                        content: '⚠️ SLA breached — 72h exceeded, escalated to urgent. Human decision required: Return to warehouse or Reshipment.',
                    },
                });
            }
        } catch (err) {
            this.logger.error(`SLA breach check error: ${err.message}`);
        }
    }
}
