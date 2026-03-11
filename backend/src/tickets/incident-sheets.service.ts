import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

@Injectable()
export class IncidentSheetsService {
    private readonly logger = new Logger(IncidentSheetsService.name);

    constructor(private readonly prisma: PrismaService) {}

    // ─── CASE TYPE LABELS ────────────────────────────────────────────
    private readonly CASE_TYPE_LABELS: Record<string, string> = {
        address_issue: 'Address & Delivery Issue',
        customer_unavailable: 'Customer Not Available',
        delivery_refused: 'Delivery Refused',
        customs_issue: 'Customs/Import Issue',
        parcel_damaged_lost: 'Parcel Damaged/Lost',
        delivery_delay: 'Delivery Delay',
        access_issue: 'Courier Access Issue',
        pickup_warehouse_issue: 'Pickup/Warehouse Issue',
        other: 'Other',
    };

    // ─── APPEND TO INCIDENT CALL CENTER SHEET ────────────────────────
    async addToIncidentSheet(ticketId: string): Promise<number | null> {
        try {
            const ticket = await this.prisma.ticket.findUnique({
                where: { id: ticketId },
                include: {
                    order: {
                        include: {
                            items: true,
                            customer: true,
                        },
                    },
                    customer: true,
                },
            });

            if (!ticket) {
                this.logger.warn(`Ticket ${ticketId} not found`);
                return null;
            }

            // Get store settings with incident sheet config
            const store = await this.prisma.storeSettings.findFirst({
                where: {
                    incidentSheetId: { not: null },
                },
            });

            if (!store?.incidentSheetId) {
                this.logger.warn('No Incident Sheet configured. Skipping.');
                return null;
            }

            // Authenticate — use env vars (same as call center queue)
            const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
            const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

            if (!clientEmail || !privateKey) {
                this.logger.error('Google Sheets credentials not configured.');
                return null;
            }

            const auth = new JWT({
                email: clientEmail,
                key: privateKey,
                scopes: ['https://www.googleapis.com/auth/spreadsheets'],
            });

            const doc = new GoogleSpreadsheet(store.incidentSheetId, auth);
            await doc.loadInfo();

            const sheetName = store.incidentSheetName || 'Incident Queue';
            let sheet = doc.sheetsByTitle[sheetName];

            if (!sheet) {
                sheet = await doc.addSheet({
                    title: sheetName,
                    headerValues: [
                        'ID', 'Qty', 'Product', 'Total Price', 'Full Name',
                        'Shipping Address', 'Phone', 'Reason Call',
                        'Status', 'Call Status',
                    ],
                });
                this.logger.log(`Created new sheet "${sheetName}" in Incident spreadsheet.`);
            }

            const customer = ticket.customer || ticket.order?.customer;
            const order = ticket.order;
            const itemCount = order?.items?.length || 0;
            const productList = order?.items
                ?.map(i => `${i.quantity}x ${i.productName}`)
                .join(', ') || 'N/A';
            const address = order
                ? [order.shippingAddressLine1, order.shippingCity, order.shippingCountry]
                    .filter(Boolean).join(', ')
                : 'N/A';

            const row = await sheet.addRow({
                'ID': ticket.ticketNumber,
                'Qty': itemCount,
                'Product': productList,
                'Total Price': order?.totalAmount?.toString() || '0',
                'Full Name': customer?.name || 'Unknown',
                'Shipping Address': address,
                'Phone': customer?.phone || 'N/A',
                'Reason Call': this.CASE_TYPE_LABELS[ticket.caseType] || ticket.caseType,
                'Status': 'PENDING',
                'Call Status': '',
            });

            this.logger.log(`Ticket ${ticket.ticketNumber} added to Incident Sheet (row ${row.rowNumber})`);
            return row.rowNumber;

        } catch (error) {
            this.logger.error(`Failed to add to Incident Sheet: ${error.message}`, error.stack);
            return null;
        }
    }

    // ─── POLL CALL STATUS (Every 2 hours) ────────────────────────────
    @Cron('0 */2 * * *')
    async pollCallCenterStatus() {
        this.logger.log('Polling Incident Sheet for Call Status updates...');
        try {
            const store = await this.prisma.storeSettings.findFirst({
                where: { incidentSheetId: { not: null } },
            });

            if (!store?.incidentSheetId) return;

            const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
            const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
            if (!clientEmail || !privateKey) return;

            const auth = new JWT({
                email: clientEmail,
                key: privateKey,
                scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
            });

            const doc = new GoogleSpreadsheet(store.incidentSheetId, auth);
            await doc.loadInfo();

            const sheetName = store.incidentSheetName || 'Incident Queue';
            const sheet = doc.sheetsByTitle[sheetName];
            if (!sheet) return;

            const rows = await sheet.getRows();

            for (const row of rows) {
                const ticketNumber = row.get('ID');
                const callStatus = row.get('Call Status');
                
                if (!ticketNumber || !callStatus) continue;

                // Find the ticket
                const ticket = await this.prisma.ticket.findFirst({
                    where: { ticketNumber, deletedAt: null },
                });
                if (!ticket) continue;

                // Check if we already processed this call status
                const alreadyLogged = await this.prisma.ticketTimeline.findFirst({
                    where: {
                        ticketId: ticket.id,
                        eventType: 'call_center_update',
                        content: { contains: callStatus },
                    },
                });
                if (alreadyLogged) continue;

                // Log the call status update
                await this.prisma.ticketTimeline.create({
                    data: {
                        ticketId: ticket.id,
                        eventType: 'call_center_update',
                        channel: 'call',
                        content: `Call Center status: ${callStatus}`,
                    },
                });

                // Auto-resolve if confirmed
                const confirmedStatuses = ['confirmed', 'resolved', 'delivered', 'ok'];
                if (confirmedStatuses.some(s => callStatus.toLowerCase().includes(s))) {
                    if (ticket.status !== 'resolved' && ticket.status !== 'closed') {
                        await this.prisma.ticket.update({
                            where: { id: ticket.id },
                            data: {
                                status: 'resolved',
                                resolution: 'resolved',
                                resolvedAt: new Date(),
                                autoPaused: true,
                            },
                        });
                        this.logger.log(`Ticket ${ticketNumber} auto-resolved from call center confirmation`);
                    }
                }

                this.logger.log(`Updated ticket ${ticketNumber} with call status: ${callStatus}`);
            }
        } catch (err) {
            this.logger.error(`Incident Sheet poll error: ${err.message}`);
        }
    }
}
