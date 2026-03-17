import { Test, TestingModule } from '@nestjs/testing';
import { SkuCallSchedulerService } from './sku-call-scheduler.service';
import { TwilioVoiceService } from './twilio-voice.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Unit tests for the SKU product fix confirmation call scheduler.
 * Validates: toggle guard, SKU filtering, attempt caps, daily limits, picked-up guard.
 */
describe('SKU Call Scheduler', () => {
    let service: SkuCallSchedulerService;
    let voiceService: any;
    let prisma: any;

    const mockPrisma = {
        storeSettings: {
            findFirst: jest.fn(),
        },
        order: {
            findMany: jest.fn(),
        },
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SkuCallSchedulerService,
                {
                    provide: TwilioVoiceService,
                    useValue: {
                        initiateSkuConfirmationCall: jest.fn(),
                    },
                },
                {
                    provide: PrismaService,
                    useValue: mockPrisma,
                },
            ],
        }).compile();

        service = module.get(SkuCallSchedulerService);
        voiceService = module.get(TwilioVoiceService);
        prisma = module.get(PrismaService);

        jest.clearAllMocks();
    });

    // ─── Toggle guard ──────────────────────────────────────────────────

    it('should SKIP when enableSkuConfirmationCalls is false', async () => {
        mockPrisma.storeSettings.findFirst.mockResolvedValue({
            enableSkuConfirmationCalls: false,
        });

        await service.handleCron();

        expect(mockPrisma.storeSettings.findFirst).toHaveBeenCalled();
        expect(mockPrisma.order.findMany).not.toHaveBeenCalled();
        expect(voiceService.initiateSkuConfirmationCall).not.toHaveBeenCalled();
    });

    it('should SKIP when no store settings exist', async () => {
        mockPrisma.storeSettings.findFirst.mockResolvedValue(null);

        await service.handleCron();

        expect(mockPrisma.order.findMany).not.toHaveBeenCalled();
    });

    // ─── SKU filtering & attempt limits ─────────────────────────────

    it('should SKIP orders with 8+ total call attempts', async () => {
        mockPrisma.storeSettings.findFirst.mockResolvedValue({
            enableTwilioCalls: true,
        });

        const eightCalls = Array.from({ length: 8 }, (_, i) => ({
            id: `call-${i}`,
            callSid: `SID-${i}`,
            callStatus: 'no-answer',
            createdAt: new Date(Date.now() - (i + 1) * 3 * 60 * 60 * 1000),
        }));

        mockPrisma.order.findMany.mockResolvedValue([{
            id: 'order-1',
            orderNumber: 'ORD-001',
            riskAction: 'twilio_short',
            callLogs: eightCalls,
            items: [{ sku: 'LM-4820', productId: 'prod-1' }],
        }]);

        await service.handleCron();

        // Should NOT call because 8 attempts already made
        expect(voiceService.initiateSkuConfirmationCall).not.toHaveBeenCalled();
    });

    it('should SKIP orders with 4+ calls today', async () => {
        mockPrisma.storeSettings.findFirst.mockResolvedValue({
            enableSkuConfirmationCalls: true,
        });

        const todayCalls = Array.from({ length: 4 }, (_, i) => ({
            id: `call-${i}`,
            callSid: `SID-${i}`,
            callStatus: 'no-answer',
            createdAt: new Date(), // all today
        }));

        mockPrisma.order.findMany.mockResolvedValue([{
            id: 'order-1',
            orderNumber: 'ORD-001',
            riskAction: 'twilio_short',
            callLogs: todayCalls,
            items: [{ sku: 'LM-4820', productId: 'prod-1' }],
        }]);

        await service.handleCron();

        expect(voiceService.initiateSkuConfirmationCall).not.toHaveBeenCalled();
    });

    // ─── Picked-up guard ────────────────────────────────────────────

    it('should SKIP orders where customer already picked up', async () => {
        mockPrisma.storeSettings.findFirst.mockResolvedValue({
            enableSkuConfirmationCalls: true,
        });

        mockPrisma.order.findMany.mockResolvedValue([{
            id: 'order-1',
            orderNumber: 'ORD-001',
            riskAction: 'twilio_short',
            callLogs: [
                {
                    id: 'call-1',
                    callSid: 'SID-1',
                    callStatus: 'completed', // Customer picked up!
                    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
                },
            ],
            items: [{ sku: 'LM-4820', productId: 'prod-1' }],
        }]);

        await service.handleCron();

        // Should NOT call because customer already picked up
        expect(voiceService.initiateSkuConfirmationCall).not.toHaveBeenCalled();
    });

    // ─── Happy path ─────────────────────────────────────────────────

    it('should PROCEED for eligible SKU order with no previous calls', async () => {
        mockPrisma.storeSettings.findFirst.mockResolvedValue({
            enableSkuConfirmationCalls: true,
        });

        mockPrisma.order.findMany.mockResolvedValue([{
            id: 'order-1',
            orderNumber: 'ORD-001',
            riskAction: 'twilio_short',
            callLogs: [],
            items: [{ sku: 'LM-4820', productId: 'prod-1' }],
        }]);

        await service.handleCron();

        expect(voiceService.initiateSkuConfirmationCall).toHaveBeenCalledWith('order-1', 'short');
    });

    it('should PROCEED for order with 3 no-answer calls (under limits)', async () => {
        mockPrisma.storeSettings.findFirst.mockResolvedValue({
            enableSkuConfirmationCalls: true,
        });

        const calls = Array.from({ length: 3 }, (_, i) => ({
            id: `call-${i}`,
            callSid: `SID-${i}`,
            callStatus: 'no-answer',
            createdAt: new Date(Date.now() - (i + 1) * 3 * 60 * 60 * 1000), // spaced 3hr apart
        }));

        mockPrisma.order.findMany.mockResolvedValue([{
            id: 'order-2',
            orderNumber: 'ORD-002',
            riskAction: 'twilio_long',
            callLogs: calls,
            items: [{ sku: 'LM-4820', productId: 'prod-1' }],
        }]);

        await service.handleCron();

        expect(voiceService.initiateSkuConfirmationCall).toHaveBeenCalledWith('order-2', 'long');
    });

    it('should SKIP orders with last call less than 2 hours ago', async () => {
        mockPrisma.storeSettings.findFirst.mockResolvedValue({
            enableSkuConfirmationCalls: true,
        });

        mockPrisma.order.findMany.mockResolvedValue([{
            id: 'order-1',
            orderNumber: 'ORD-001',
            riskAction: 'twilio_short',
            callLogs: [{
                id: 'call-1',
                callSid: 'SID-1',
                callStatus: 'no-answer',
                createdAt: new Date(Date.now() - 30 * 60 * 1000), // 30 min ago (< 2hr)
            }],
            items: [{ sku: 'LM-4820', productId: 'prod-1' }],
        }]);

        await service.handleCron();

        expect(voiceService.initiateSkuConfirmationCall).not.toHaveBeenCalled();
    });
});
