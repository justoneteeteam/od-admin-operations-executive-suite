import { Test, TestingModule } from '@nestjs/testing';
import { TwilioCallSchedulerService } from './twilio-call-scheduler.service';
import { TwilioVoiceService } from './twilio-voice.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Unit tests to verify that the enableTwilioCalls toggle
 * properly blocks call execution when set to false/inactive.
 */
describe('Twilio Toggle Guards', () => {
    let schedulerService: TwilioCallSchedulerService;
    let voiceService: TwilioVoiceService;
    let prisma: any;

    const mockPrisma = {
        storeSettings: {
            findFirst: jest.fn(),
        },
        order: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
        },
        callLog: {
            count: jest.fn(),
            create: jest.fn(),
            findFirst: jest.fn(),
        },
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TwilioCallSchedulerService,
                {
                    provide: TwilioVoiceService,
                    useValue: {
                        initiateConfirmationCall: jest.fn(),
                    },
                },
                {
                    provide: PrismaService,
                    useValue: mockPrisma,
                },
            ],
        }).compile();

        schedulerService = module.get(TwilioCallSchedulerService);
        voiceService = module.get(TwilioVoiceService);
        prisma = module.get(PrismaService);

        jest.clearAllMocks();
    });

    // ─── TwilioCallSchedulerService ────────────────────────────────────

    describe('TwilioCallSchedulerService.handleCron', () => {
        it('should SKIP when enableTwilioCalls is false', async () => {
            mockPrisma.storeSettings.findFirst.mockResolvedValue({
                enableTwilioCalls: false,
            });

            await schedulerService.handleCron();

            // Should check store settings
            expect(mockPrisma.storeSettings.findFirst).toHaveBeenCalled();
            // Should NOT query for eligible orders
            expect(mockPrisma.order.findMany).not.toHaveBeenCalled();
            // Should NOT call any Twilio functions
            expect(voiceService.initiateConfirmationCall).not.toHaveBeenCalled();
        });

        it('should SKIP when no store settings exist', async () => {
            mockPrisma.storeSettings.findFirst.mockResolvedValue(null);

            await schedulerService.handleCron();

            expect(mockPrisma.storeSettings.findFirst).toHaveBeenCalled();
            expect(mockPrisma.order.findMany).not.toHaveBeenCalled();
        });

        it('should PROCEED when enableTwilioCalls is true', async () => {
            mockPrisma.storeSettings.findFirst.mockResolvedValue({
                enableTwilioCalls: true,
            });
            mockPrisma.order.findMany.mockResolvedValue([]); // No eligible orders

            await schedulerService.handleCron();

            expect(mockPrisma.storeSettings.findFirst).toHaveBeenCalled();
            // Should proceed to query eligible orders
            expect(mockPrisma.order.findMany).toHaveBeenCalled();
        });
    });
});
