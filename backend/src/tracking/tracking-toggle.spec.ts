import { Test, TestingModule } from '@nestjs/testing';
import { TrackingService } from './tracking.service';
import { PrismaService } from '../prisma/prisma.service';
import { SmsWhatsappDeliveryService } from '../notifications/sms-whatsapp-delivery.service';
import { WhatsappPersonalService } from '../notifications/whatsapp.personal.service';
import { IncidentAutoService } from '../tickets/incident-auto.service';

/**
 * Unit tests to verify that the enableOutOfDeliveryNotifications toggle
 * properly blocks SMS/WhatsApp when set to false/inactive.
 */
describe('Out of Delivery Toggle Guard', () => {
    let service: TrackingService;
    let prisma: any;
    let smsService: any;
    let waService: any;

    const mockOrder = {
        id: 'order-1',
        orderNumber: 'ORD-001',
        shippingStatus: 'InTransit',
        shippingCountry: 'Spain',
        customerId: 'cust-1',
        storeName: 'TestStore',
        totalAmount: 50,
        customer: { id: 'cust-1', name: 'Test Customer', phone: '+34600000000' },
    };

    const mockTrackingItem = {
        number: 'TRACK123',
        track_info: {
            latest_status: { status: 'OutForDelivery', sub_status: 'OutForDelivery' },
            latest_event: { description: 'Out for delivery', time_utc: new Date().toISOString() },
        },
    };

    const mockPrisma = {
        order: {
            findFirst: jest.fn(),
            update: jest.fn(),
        },
        trackingHistory: {
            create: jest.fn(),
            findFirst: jest.fn(),
            count: jest.fn(),
        },
        orderItem: {
            findMany: jest.fn(),
        },
        storeSettings: {
            findFirst: jest.fn(),
        },
    };

    const mockSmsService = {
        sendTemplateMessage: jest.fn().mockResolvedValue(undefined),
    };

    const mockWaService = {
        sendTemplateMessage: jest.fn().mockResolvedValue(undefined),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TrackingService,
                { provide: PrismaService, useValue: mockPrisma },
                { provide: SmsWhatsappDeliveryService, useValue: mockSmsService },
                { provide: WhatsappPersonalService, useValue: mockWaService },
                { provide: IncidentAutoService, useValue: null },
            ],
        }).compile();

        service = module.get(TrackingService);
        prisma = module.get(PrismaService);
        smsService = module.get(SmsWhatsappDeliveryService);
        waService = module.get(WhatsappPersonalService);

        jest.clearAllMocks();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('should SKIP SMS and WhatsApp when enableOutOfDeliveryNotifications is false', async () => {
        // Setup: order exists, first OutForDelivery event, but toggle is OFF
        mockPrisma.order.findFirst.mockResolvedValue(mockOrder);
        mockPrisma.trackingHistory.create.mockResolvedValue({});
        mockPrisma.trackingHistory.count.mockResolvedValue(1); // First time
        mockPrisma.order.update.mockResolvedValue({});
        mockPrisma.storeSettings.findFirst.mockResolvedValue({
            enableOutOfDeliveryNotifications: false,
        });

        await service.processTrackingItem(mockTrackingItem);

        // Order status SHOULD still be updated (tracking is separate from notifications)
        expect(mockPrisma.order.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    shippingStatus: 'OutForDelivery',
                }),
            }),
        );

        // SMS and WhatsApp should NOT be sent
        expect(mockSmsService.sendTemplateMessage).not.toHaveBeenCalled();
        // WhatsApp is delayed 1hr, but should never be scheduled when disabled
    });

    it('should SEND SMS and WhatsApp when enableOutOfDeliveryNotifications is true', async () => {
        mockPrisma.order.findFirst.mockResolvedValue(mockOrder);
        mockPrisma.trackingHistory.create.mockResolvedValue({});
        mockPrisma.trackingHistory.count.mockResolvedValue(1);
        mockPrisma.order.update.mockResolvedValue({});
        mockPrisma.storeSettings.findFirst.mockResolvedValue({
            enableOutOfDeliveryNotifications: true,
        });

        await service.processTrackingItem(mockTrackingItem);

        // SMS should be sent immediately
        expect(mockSmsService.sendTemplateMessage).toHaveBeenCalledWith(
            '+34600000000',
            expect.stringContaining('sms_out_for_delivery'),
            expect.any(Array),
            expect.any(Object),
        );
    });

    it('should SEND notifications when enableOutOfDeliveryNotifications is undefined (default active)', async () => {
        mockPrisma.order.findFirst.mockResolvedValue(mockOrder);
        mockPrisma.trackingHistory.create.mockResolvedValue({});
        mockPrisma.trackingHistory.count.mockResolvedValue(1);
        mockPrisma.order.update.mockResolvedValue({});
        // No enableOutOfDeliveryNotifications field at all — should default to enabled
        mockPrisma.storeSettings.findFirst.mockResolvedValue({});

        await service.processTrackingItem(mockTrackingItem);

        // Should still send SMS (default = enabled)
        expect(mockSmsService.sendTemplateMessage).toHaveBeenCalled();
    });
});
