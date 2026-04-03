import { Injectable, Logger, Inject, Optional, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SmsWhatsappDeliveryService } from '../notifications/sms-whatsapp-delivery.service';
import { WhatsappPersonalService } from '../notifications/whatsapp.personal.service';
import { IncidentAutoService } from '../tickets/incident-auto.service';

@Injectable()
export class TrackingService {
    private readonly logger = new Logger(TrackingService.name);

    constructor(
        @Inject(PrismaService) private readonly prisma: PrismaService,
        @Inject(SmsWhatsappDeliveryService) private readonly smsWhatsappDeliveryService: SmsWhatsappDeliveryService,
        @Inject(WhatsappPersonalService) private readonly whatsappPersonalService: WhatsappPersonalService,
        @Optional() @Inject(forwardRef(() => IncidentAutoService)) private readonly incidentAutoService: IncidentAutoService,
    ) { }

    async handleWebhook(payload: any) {
        this.logger.log('Received Webhook Payload', JSON.stringify(payload));
        require('fs').appendFileSync('/tmp/webhook.log', `Webhook Hit! Payload: ${JSON.stringify(payload)}\n`);

        const event = payload.event;

        if (event === 'TRACKING_UPDATED' && payload.data) {
            // Webhook pushes single object in data usually, or sometimes arrays
            const items = Array.isArray(payload.data) ? payload.data : [payload.data];
            require('fs').appendFileSync('/tmp/webhook.log', `Items count: ${items.length}\n`);

            for (const item of items) {
                // Ignore if it's missing the tracking number
                if (item && item.number) {
                    require('fs').appendFileSync('/tmp/webhook.log', `Processing item: ${item.number}\n`);
                    await this.processTrackingItem(item);
                }
            }
        }
    }

    async processTrackingItem(item: any) {
        const trackingNumber = item.number;
        const subStatus = item.track_info?.latest_status?.sub_status; // "InTransit_Arrival"

        this.logger.log(`Processing ${trackingNumber}, Status: ${subStatus}`);
        require('fs').appendFileSync('/tmp/webhook.log', `processTrackingItem started for ${trackingNumber}, subStatus: ${subStatus}\n`);

        // 1. Find Order by Tracking Number — check BOTH outbound and return
        const order = await this.prisma.order.findFirst({
            where: {
                OR: [
                    { trackingNumber: trackingNumber },
                    { returnTrackingNumber: trackingNumber } as any,
                ]
            },
            include: { customer: true, items: true },
        });

        if (!order) {
            this.logger.warn(`Order not found for tracking number: ${trackingNumber}`);
            require('fs').appendFileSync('/tmp/webhook.log', `Order NOT FOUND for ${trackingNumber}\n`);
            return;
        }

        // Determine if this event is for the return leg
        const isReturn = (order as any).returnTrackingNumber === trackingNumber;

        // Save Tracking History Log
        const carrierName = item.track_info?.latest_provider?.provider?.name || item.track_info?.provider?.provider?.name || item.track_info?.latest_provider?.provider?.alias || null;
        const carrierCode = item.track_info?.latest_provider?.provider?.key?.toString() || item.track_info?.provider?.provider?.key?.toString() || null;
        const mainStatus = item.track_info?.latest_status?.status || 'Unknown';
        const description = item.track_info?.latest_event?.description || null;
        const location = item.track_info?.latest_event?.location || null;
        const timeUtcStr = item.track_info?.latest_event?.time_utc;
        const statusDate = timeUtcStr ? new Date(timeUtcStr) : new Date();

        await this.prisma.trackingHistory.create({
            data: {
                orderId: order.id,
                trackingNumber: trackingNumber,
                carrierCode: carrierCode,
                carrierName: carrierName,
                status: mainStatus,
                substatus: subStatus || null,
                description: description,
                location: location,
                statusDate: statusDate,
                rawData: item as any
            }
        });

        // Update Courier if missing on the Order
        if (!order.courier && carrierName) {
            await this.prisma.order.update({
                where: { id: order.id },
                data: { courier: carrierName }
            });
        }

        if (mainStatus === 'OutForDelivery') {
            // "PickUp" natively in some 17track docs, but "OutForDelivery" comes through occasionally
            if (order.shippingStatus === 'OutForDelivery') {
                this.logger.log(`Order ${order.orderNumber} is already 'OutForDelivery'. Skipping duplicate SMS.`);
                return;
            }

            // DEDUPLICATION GUARD: Prevent double sending SMS/WhatsApp if already notified via webhook or poll
            const alreadyNotified = await this.prisma.trackingHistory.findFirst({
                where: {
                    orderId: order.id,
                    status: 'OutForDelivery',
                }
            });

            // If history already has it from a previous webhook/poll run, skip SMS
            // Note: The history we JUST created above is included, so we check if count > 1 OR we check before inserting.
            // Since we inserted above, findFirst might return the one we just inserted.
            // Let's count how many OutForDelivery logs exist for this order.
            const outForDeliveryLogsCount = await this.prisma.trackingHistory.count({
                where: {
                    orderId: order.id,
                    status: 'OutForDelivery',
                }
            });

            if (outForDeliveryLogsCount > 1) {
                this.logger.log(`Already sent OutForDelivery notification for ${order.orderNumber}. Skipping.`);
                return;
            }

            if (!order.customer) {
                this.logger.warn(`Customer not found for order: ${order.orderNumber}`);
                return;
            }

            // Check if Out of Delivery notifications are enabled in store settings
            const storeSettings = await this.prisma.storeSettings.findFirst();
            const outOfDeliveryEnabled = (storeSettings as any)?.enableOutOfDeliveryNotifications !== false;

            // 2. Prepare Variables for SMS Template
            // Variables: 1=CustomerName, 2=OrderNumber
            const customerName = order.customer.name;
            const safeName = customerName || 'Customer';

            // 3. Determine Template based on Country for SMS
            const smsTemplateName = this.getTemplateForCountry(order.shippingCountry);

            // 4. Update Order Status
            await this.prisma.order.update({
                where: { id: order.id },
                data: {
                    shippingStatus: 'OutForDelivery',
                    orderStatus: 'OutForDelivery',
                },
            });
            this.logger.log(`Updated Order ${order.orderNumber} shipping status to 'OutForDelivery'`);

            // Only send notifications if enabled in store settings
            if (!outOfDeliveryEnabled) {
                this.logger.log(`Out of Delivery notifications disabled. Skipping SMS/WhatsApp for Order ${order.orderNumber}`);
            } else {
                // 5a. Send IMMEDIATE Twilio SMS
                try {
                    await this.smsWhatsappDeliveryService.sendTemplateMessage(
                        order.customer.phone,
                        smsTemplateName,
                        [safeName, order.orderNumber],
                        { orderId: order.id, customerId: order.customerId }
                    );
                    this.logger.log(`[SMS] Out for Delivery sent immediately for Order ${order.orderNumber} (${smsTemplateName})`);
                } catch (e) {
                    this.logger.error(`Failed to send SMS for Order ${order.orderNumber}: ${e.message}`, e.stack);
                }

                // 5b. Schedule 1 HOUR DELAY Personal WhatsApp
                const delayMs = 60 * 60 * 1000; // 1 hour
                this.logger.log(`[WhatsApp] Scheduling Personal WhatsApp for Order ${order.orderNumber} in 1 hour.`);

                setTimeout(async () => {
                    try {
                        const waTemplateName = this.getWhatsappTemplateForCountry(order.shippingCountry);
                        const storeName = order.storeName || 'Our Store';
                        const codAmount = order.totalAmount ? order.totalAmount.toString() : '0.00';

                        // Format items list
                        const orderItems = await this.prisma.orderItem.findMany({
                            where: { orderId: order.id },
                            include: { product: true }
                        });
                        const itemsText = orderItems.map(item => `${item.quantity}x ${item.product.name}`).join(', ');

                        await this.whatsappPersonalService.sendTemplateMessage(
                            order.customer.phone,
                            waTemplateName,
                            [safeName, storeName, codAmount, itemsText],
                            { orderId: order.id, customerId: order.customerId }
                        );
                        this.logger.log(`[WhatsApp] Delayed message sent successfully for Order ${order.orderNumber}`);
                    } catch (e) {
                        this.logger.error(`[WhatsApp] Delayed send failed for Order ${order.orderNumber}: ${e.message}`);
                    }
                }, delayMs);
            }

        } else if (mainStatus === 'InTransit' || mainStatus === 'Transit' || mainStatus === 'In Transit' || subStatus === 'InTransit_Arrival') {
            if (order.shippingStatus !== 'InTransit' && order.shippingStatus !== 'OutForDelivery' && order.shippingStatus !== 'Delivered') {
                await this.prisma.order.update({
                    where: { id: order.id },
                    data: {
                        shippingStatus: 'InTransit',
                        orderStatus: 'InTransit',
                    },
                });
                this.logger.log(`Updated Order ${order.orderNumber} shipping status to 'InTransit'`);
            }
        } else if (mainStatus === 'Shipped' || mainStatus === 'InfoReceived' || mainStatus === 'Pending') {
            if (order.shippingStatus !== 'Shipped' && order.shippingStatus !== 'InTransit' && order.shippingStatus !== 'OutForDelivery' && order.shippingStatus !== 'Delivered') {
                await this.prisma.order.update({
                    where: { id: order.id },
                    data: {
                        shippingStatus: 'Shipped',
                        orderStatus: 'Shipped',
                    },
                });
                this.logger.log(`Updated Order ${order.orderNumber} shipping status to 'Shipped'`);
            }
        } else if (mainStatus === 'Delivered' || (subStatus && subStatus.startsWith('Delivered'))) {
            // Package was delivered - update order to Delivered
            if (order.shippingStatus !== 'Delivered') {
                await this.prisma.order.update({
                    where: { id: order.id },
                    data: {
                        shippingStatus: 'Delivered',
                        orderStatus: 'Delivered',
                        deliveredDate: statusDate,
                    },
                });
                this.logger.log(`Updated Order ${order.orderNumber} to 'Delivered'`);
            }
        } else if (mainStatus === 'Returned') {
            await this.prisma.order.update({
                where: { id: order.id },
                data: {
                    shippingStatus: 'Returned',
                    orderStatus: 'Returned',
                    returnInitiatedDate: statusDate,
                    returnReason: description || 'Returned to sender by carrier',
                },
            });
            this.logger.log(`Updated Order ${order.orderNumber} to 'Returned'`);
        } else if (mainStatus === 'Undelivered' || mainStatus === 'DeliveryFailure' || mainStatus === 'AvailableForPickup') {
            await this.prisma.order.update({
                where: { id: order.id },
                data: {
                    shippingStatus: 'Undelivered',
                    orderStatus: 'Undelivered',
                    returnStockState: 'returning',
                    notes: order.notes ? `${order.notes}\n[Tracking] ${mainStatus}: ${description}` : `[Tracking] ${mainStatus}: ${description}`
                } as any,
            });
            this.logger.log(`Updated Order ${order.orderNumber} to 'Undelivered', return_stock_state='returning'`);

            // Update inventory float: outbound_qty -1, returning_qty +1
            const orderItemsForFloat = await this.prisma.orderItem.findMany({ where: { orderId: order.id } });
            for (const item of orderItemsForFloat) {
                if (!item.productId) continue;
                const level = await this.prisma.inventoryLevel.findFirst({
                    where: { productId: item.productId, outboundQty: { gt: 0 } } as any,
                    orderBy: { outboundQty: 'desc' } as any,
                });
                if (level) {
                    await this.prisma.inventoryLevel.update({
                        where: { id: level.id },
                        data: {
                            outboundQty: { decrement: item.quantity },
                            returningQty: { increment: item.quantity },
                        } as any,
                    });
                }
            }
        } else if (mainStatus === 'Exception') {
            const extraData: any = {
                shippingStatus: 'Exception',
                orderStatus: 'Exception',
                notes: order.notes ? `${order.notes}\n[Tracking] Exception: ${description}` : `[Tracking] Exception: ${description}`
            };
            // Exception_Returned = arrived back at FC. Set restock banner, don't auto-restock.
            if (subStatus === 'Exception_Returned') {
                extraData.needsRestockConfirm = true;
            }
            await this.prisma.order.update({ where: { id: order.id }, data: extraData });
            this.logger.log(`Updated Order ${order.orderNumber} to 'Exception' (sub: ${subStatus})`);

        } else if (mainStatus === 'Expired') {
            await this.prisma.order.update({
                where: { id: order.id },
                data: {
                    shippingStatus: 'Expired',
                    orderStatus: 'Expired',
                    notes: order.notes ? `${order.notes}\n[Tracking] Expired: ${description}` : `[Tracking] Expired: ${description}`
                },
            });
            this.logger.log(`Updated Order ${order.orderNumber} to 'Expired'`);
        } else if (mainStatus === 'NotFound') {
            if (order.shippingStatus !== 'NotFound' && order.orderStatus !== 'Processing') {
                await this.prisma.order.update({
                    where: { id: order.id },
                    data: {
                        shippingStatus: 'NotFound',
                        orderStatus: 'NotFound',
                    },
                });
                this.logger.log(`Updated Order ${order.orderNumber} to 'NotFound'`);
            }
        }

        // ─── INCIDENT TICKET AUTO-CREATION HOOK ─────────────────────
        const incidentStatuses = ['DeliveryFailure', 'Undelivered', 'Exception'];
        if (incidentStatuses.includes(mainStatus) && this.incidentAutoService) {
            try {
                await this.incidentAutoService.handleTrackingEvent({
                    orderId: order.id,
                    customerId: order.customerId,
                    mainStatus,
                    substatus: subStatus,
                    description,
                    country: order.shippingCountry,
                });
            } catch (err) {
                this.logger.error(`Incident hook error for ${order.orderNumber}: ${err.message}`);
            }
        }
    }

    private getTemplateForCountry(country: string): string {
        if (!country) return 'sms_out_for_delivery_en';

        const normalizedCountry = country.toLowerCase().trim();

        if (normalizedCountry === 'italy' || normalizedCountry === 'italia') {
            return 'sms_out_for_delivery_it';
        }

        if (normalizedCountry === 'spain' || normalizedCountry === 'españa' || normalizedCountry === 'espana') {
            return 'sms_out_for_delivery_es';
        }

        return 'sms_out_for_delivery_en'; // Default to English
    }

    private getWhatsappTemplateForCountry(country: string): string {
        if (!country) return 'wa_arrival_en';

        const normalizedCountry = country.toLowerCase().trim();

        if (normalizedCountry === 'italy' || normalizedCountry === 'italia') {
            return 'wa_arrival_it';
        }

        if (normalizedCountry === 'spain' || normalizedCountry === 'españa' || normalizedCountry === 'espana') {
            return 'wa_arrival_es';
        }

        return 'wa_arrival_en'; // Default to English
    }

    // ─── CARRIER NAME → 17TRACK NUMERIC CODE MAP ──────────────────
    private static readonly CARRIER_CODE_MAP: Record<string, number> = {
        // Italy
        'brt': 100026, 'bartolini': 100026, 'brt bartolini': 100026, 'brt bartolini(dpd)': 100026,
        'gls italy': 100024, 'gls (it)': 100024, 'gls it': 100024,
        'sda': 100019, 'poste italiane': 9071, 'nexive': 100087,
        'tnt italy': 100065, 'tnt (it)': 100065,
        'sailpost': 100051, 'fercam': 100458,
        'hr parcel': 100243, 'hrp': 100243,
        // Spain
        'correos': 19181, 'correos spain': 19181,
        'correos express': 100048, 'correosexpress': 100048,
        'seur': 100438, 'mrw': 100175,
        'gls spain': 100189, 'gls (es)': 100189, 'nacex': 100436,
        'tipsa': 100185, 'celeritas': 100219, 'sending': 100248,
        // International
        'dhl': 100001, 'dhl express': 100001, 'dhl paket': 7041,
        'ups': 100002, 'fedex': 100003, 'tnt': 100004,
        'gls': 100005, 'dpd': 100007, 'aramex': 100006,
        // Portugal
        'ctt': 16101, 'ctt express': 100114,
        // France
        'colissimo': 6051, 'chronopost': 100273, 'mondial relay': 100304,
        // Germany
        'hermes': 100018,
    };

    // ─── TRACKING NUMBER PATTERN → CARRIER AUTO-DETECTION ─────────
    // Patterns ordered from most specific to least specific
    private static readonly CARRIER_PATTERNS: Array<{ pattern: RegExp; carrier: number; name: string }> = [
        // ── Spain ──────────────────────────────────────────────
        // Correos Express: 16-digit all-numeric (often starts with 3, 5, 0)
        { pattern: /^\d{16}$/, carrier: 100048, name: 'Correos Express' },
        // MRW: 5-digit/7-digit separated by slash, or 12-digit numeric
        { pattern: /^\d{5}\/\d{7}$/, carrier: 100175, name: 'MRW' },
        // Correos Spain (national postal): UPU format EE123456789ES
        { pattern: /^[A-Z]{2}\d{9}ES$/i, carrier: 19181, name: 'Correos Spain' },

        // ── Italy ──────────────────────────────────────────────
        // BRT/Bartolini: 12 or 14-digit pure numeric
        { pattern: /^\d{12}$/, carrier: 100026, name: 'BRT Bartolini' },
        { pattern: /^\d{14}$/, carrier: 100026, name: 'BRT Bartolini' },
        // GLS Italy: national format "Y" + digit + up to 9 digits, or 11-digit numeric
        { pattern: /^[A-Z]\d{1,10}$/i, carrier: 100024, name: 'GLS Italy' },
        { pattern: /^\d{11}$/, carrier: 100024, name: 'GLS Italy' },
        // SDA: often 14-15 alphanumeric starting with letters
        { pattern: /^[A-Z]{2}\d{12,14}$/i, carrier: 100019, name: 'SDA' },

        // ── International ──────────────────────────────────────
        // UPS: always starts with "1Z" + 16 alphanumeric
        { pattern: /^1Z[A-Z0-9]{16}$/i, carrier: 100002, name: 'UPS' },
        // FedEx: 12, 15, or 20-digit numeric; or starts with 96/61
        { pattern: /^(96|61)\d{18,20}$/, carrier: 100003, name: 'FedEx' },
        { pattern: /^\d{15}$/, carrier: 100003, name: 'FedEx' },
        // DHL Express: 10-digit numeric
        { pattern: /^\d{10}$/, carrier: 100001, name: 'DHL Express' },
        // DHL eCommerce / DHL Paket: often starts with JJD or GM
        { pattern: /^JJD\d{16,20}$/i, carrier: 7041, name: 'DHL Paket' },
        { pattern: /^GM\d{16,20}$/i, carrier: 7041, name: 'DHL Paket' },
        // TNT: alphanumeric, 9-digit numeric or GE/GD prefix
        { pattern: /^GE\d{9}[A-Z]{2}$/i, carrier: 100004, name: 'TNT' },
        // GLS generic: starts with specific prefixes
        { pattern: /^[A-Z]{2}\d{9}[A-Z]{2}$/i, carrier: 100005, name: 'GLS' },
    ];

    /**
     * Detect carrier from tracking number format/pattern.
     * Returns the 17Track numeric carrier code, or undefined if no pattern matches.
     */
    private detectCarrierFromNumber(trackingNumber: string): { carrier: number; name: string } | undefined {
        const trimmed = trackingNumber.trim();
        for (const rule of TrackingService.CARRIER_PATTERNS) {
            if (rule.pattern.test(trimmed)) {
                return { carrier: rule.carrier, name: rule.name };
            }
        }
        return undefined;
    }

    private resolveCarrierCode(carrierInput?: string): number | undefined {
        if (!carrierInput) return undefined;

        // If already a number, use it directly
        const asNum = Number(carrierInput);
        if (!isNaN(asNum) && asNum > 0) return asNum;

        // Normalize and look up
        const normalized = carrierInput.toLowerCase().trim();
        return TrackingService.CARRIER_CODE_MAP[normalized];
    }

    // Register tracking number with 17Track (Phase 2)
    async registerTracking(trackingNumber: string, carrierCode?: string): Promise<{ status: 'registered' | 'already_registered' | 'rejected' | 'error'; detail?: string }> {
        this.logger.log(`Registering tracking: ${trackingNumber} (carrier input: ${carrierCode || 'auto-detect'})`);

        try {
            const apiKey = process.env.TRACK17_API_KEY;
            this.logger.log(`[DEBUG] TRACK17_API_KEY length=${apiKey?.length}, val=${apiKey?.substring(0, 4)}...${apiKey?.substring((apiKey?.length || 0) - 4)}`);
            if (!apiKey) {
                this.logger.warn('TRACK17_API_KEY is not set in environment variables. Cannot register tracking.');
                return { status: 'error', detail: 'TRACK17_API_KEY not configured' };
            }

            const axios = require('axios');

            // Step 1: Resolve explicit carrier name to 17Track numeric code
            let numericCarrier = this.resolveCarrierCode(carrierCode);
            if (carrierCode && numericCarrier) {
                this.logger.log(`Resolved carrier "${carrierCode}" → 17Track code ${numericCarrier}`);
            } else if (carrierCode && !numericCarrier) {
                this.logger.warn(`Could not resolve carrier "${carrierCode}" to a 17Track code.`);
            }

            // Step 2: If no carrier resolved, try pattern-based detection from tracking number
            if (!numericCarrier) {
                const detected = this.detectCarrierFromNumber(trackingNumber);
                if (detected) {
                    numericCarrier = detected.carrier;
                    this.logger.log(`Pattern-detected carrier: "${detected.name}" (code ${detected.carrier}) from tracking number format`);
                }
            }

            const result = await this.attemptRegister(axios, apiKey, trackingNumber, numericCarrier);

            // Step 3: If still rejected with carrier-not-detected, try DB order courier lookup as last resort
            if (result.status === 'rejected' && result._errCode === -18019903 && !numericCarrier) {
                this.logger.log(`All detection failed for ${trackingNumber}. Attempting to resolve carrier from order DB...`);
                const order = await this.prisma.order.findFirst({
                    where: { trackingNumber },
                    select: { courier: true }
                });
                const fallbackCarrier = this.resolveCarrierCode(order?.courier ?? undefined);
                if (fallbackCarrier) {
                    this.logger.log(`Found order courier "${order?.courier}" → 17Track code ${fallbackCarrier}. Retrying...`);
                    const retryResult = await this.attemptRegister(axios, apiKey, trackingNumber, fallbackCarrier);
                    return { status: retryResult.status, detail: retryResult.detail };
                } else {
                    this.logger.warn(`No resolvable carrier found for ${trackingNumber}. Order courier: "${order?.courier || 'none'}"`);
                }
            }

            return { status: result.status, detail: result.detail };
        } catch (error) {
            const respData = error?.response?.data ? JSON.stringify(error.response.data) : 'no response body';
            const respStatus = error?.response?.status || 'no status';
            this.logger.error(`Failed to register ${trackingNumber} with 17Track: ${error.message} | status=${respStatus} | body=${respData}`, error.stack);
            return { status: 'error', detail: `${error.message} | body: ${respData}` };
        }
    }

    private async attemptRegister(axios: any, apiKey: string, trackingNumber: string, numericCarrier?: number): Promise<{ status: 'registered' | 'already_registered' | 'rejected' | 'error'; detail?: string; _errCode?: number }> {
        const payload: any = { number: trackingNumber };
        if (numericCarrier) {
            payload.carrier = numericCarrier;
        }

        const response = await axios.post(
            'https://api.17track.net/track/v2.2/register',
            [payload],
            {
                headers: {
                    '17token': apiKey,
                    'Content-Type': 'application/json'
                }
            }
        );

        const data = response.data;
        if (data.code === 0 && data.data?.accepted?.length > 0) {
            this.logger.log(`Successfully registered tracking number ${trackingNumber} with 17Track.`);
            await this.pullAndProcessCurrentStatus(trackingNumber);
            return { status: 'registered' };
        } else if (data.data?.rejected?.length > 0) {
            const rejection = data.data.rejected[0];
            const errCode = rejection?.error?.code;
            if (errCode === -18019901) {
                this.logger.log(`Tracking number ${trackingNumber} is already registered with 17Track.`);
                return { status: 'already_registered' };
            }
            this.logger.warn(`17Track rejected tracking number ${trackingNumber}: ${JSON.stringify(data.data.rejected)}`);
            return { status: 'rejected', detail: JSON.stringify(rejection?.error || rejection), _errCode: errCode };
        } else {
            this.logger.warn(`Unexpected response from 17Track register API: ${JSON.stringify(data)}`);
            return { status: 'error', detail: 'Unexpected API response' };
        }
    }

    async pullAndProcessCurrentStatus(trackingNumber: string) {
        try {
            const apiKey = process.env.TRACK17_API_KEY;
            if (!apiKey) return;
            const axios = require('axios');

            this.logger.log(`Pulling current backfill status for tracking number: ${trackingNumber}`);
            const response = await axios.post(
                'https://api.17track.net/track/v2.2/gettrackinfo',
                [{ number: trackingNumber }],
                { headers: { '17token': apiKey, 'Content-Type': 'application/json' } }
            );

            const accepted = response.data?.data?.accepted;
            if (!accepted?.length) return;

            const item = accepted[0];
            if (item.track_info) {
                await this.processTrackingItem(item);
            }
        } catch (error) {
            this.logger.error(`Failed to pull backfill status for ${trackingNumber}: ${error.message}`);
        }
    }
}
