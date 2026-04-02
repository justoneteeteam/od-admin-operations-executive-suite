import { Test, TestingModule } from '@nestjs/testing';
import { FinancialController } from './financial.controller';
import { FinancialService } from './financial.service';

describe('FinancialController', () => {
  let controller: FinancialController;
  let service: FinancialService;

  const mockFinancialService = {
    bulkCreateRecords: jest.fn().mockResolvedValue({ importedCount: 5 }),
    getLatestExchangeRate: jest.fn().mockResolvedValue({ vndToEur: 26000 }),
    getUniqueSources: jest.fn().mockResolvedValue(['MB Bank', 'VCB Card 1234']),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FinancialController],
      providers: [
        {
          provide: FinancialService,
          useValue: mockFinancialService,
        },
      ],
    }).compile();

    controller = module.get<FinancialController>(FinancialController);
    service = module.get<FinancialService>(FinancialService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('bulkCreateRecords', () => {
    it('should call bulkCreateRecords service with array of records', async () => {
      const records = [{ date: new Date().toISOString(), description: 'Test', amountEur: 10, source: 'Test', category: 'Cat' }];
      const res = await controller.bulkCreateRecords(records);
      expect(service.bulkCreateRecords).toHaveBeenCalledWith(records);
      expect(res.importedCount).toBe(5);
    });
  });

  describe('getLatestExchangeRate', () => {
    it('should call getLatestExchangeRate service', async () => {
      const res = await controller.getLatestExchangeRate();
      expect(service.getLatestExchangeRate).toHaveBeenCalled();
      expect(res?.vndToEur).toBe(26000);
    });
  });

  describe('getUniqueSources', () => {
    it('should call getUniqueSources service', async () => {
      const res = await controller.getUniqueSources();
      expect(service.getUniqueSources).toHaveBeenCalled();
      expect(res).toContain('MB Bank');
    });
  });
});
