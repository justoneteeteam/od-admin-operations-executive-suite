import { Test, TestingModule } from '@nestjs/testing';
import { FinancialService } from './financial.service';
import { PrismaService } from '../prisma/prisma.service';
import * as XLSX from 'xlsx';
import { BadRequestException } from '@nestjs/common';

describe('FinancialService', () => {
  let service: FinancialService;
  let prisma: PrismaService;

  const mockPrisma = {
    fulfillmentInvoiceUpload: {
      create: jest.fn().mockResolvedValue({ id: 'upload-id' }),
    },
    financialRecord: {
      create: jest.fn().mockResolvedValue({}),
    },
    exchangeRate: {
      findFirst: jest.fn().mockResolvedValue({ vndToEur: '25000' }),
    },
    $transaction: jest.fn().mockResolvedValue({}),
    $queryRaw: jest.fn().mockResolvedValue([]),
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FinancialService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<FinancialService>(FinancialService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should throw BadRequestException for empty file', async () => {
    await expect(
      service.uploadPerOrderInvoice(Buffer.from([]), 'empty.xlsx', 'center-id'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should parse per-order invoice and create upload record', async () => {
    // Create a simple workbook with required headers
    const ws = XLSX.utils.json_to_sheet([
      {
        Store: 'Store A',
        Order: 'ORD123',
        Concept: 'Concept X',
        'Weight Kg': 1.2,
        'Shippings €': 5,
        'Fulfillments €': 3,
        'Cash on delivery €': 2,
        'Total €': 10,
      },
    ]);
    const wb = { SheetNames: ['Sheet1'], Sheets: { Sheet1: ws } } as XLSX.WorkBook;
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const result = await service.uploadPerOrderInvoice(
      buffer,
      'invoice.xlsx',
      'center-id',
      '2023-09',
      'user-id',
    );

    expect(result.summary.total).toBe(1);
    expect(result.summary.matched).toBe(0); // No order matching in mock
    expect(result.summary.unmatched).toBe(1);
    expect(prisma.fulfillmentInvoiceUpload.create).toHaveBeenCalled();
  });

  describe('createRecord', () => {
    it('should calculate amountVnd if amountEur is provided', async () => {
      // Mock findFirst exchangeRate
      prisma.exchangeRate.findFirst = jest.fn().mockResolvedValue({ eurToVnd: 26000, vndToEur: 26000 });
      prisma.financialRecord.create = jest.fn().mockResolvedValue({ id: 'frec1', amountEur: 100, amountVnd: 2600000 });
      
      const res = await service.createRecord({
        date: new Date().toISOString(),
        description: 'Test EUR',
        category: 'Test',
        market: 'VN',
        amountEur: 100,
        source: 'VCB',
      });

      expect(prisma.exchangeRate.findFirst).toHaveBeenCalled();
      expect(prisma.financialRecord.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          amountEur: 100,
          amountVnd: 2600000,
          source: 'VCB'
        })
      }));
    });

    it('should calculate amountEur if amountVnd is provided and amountEur is empty', async () => {
      prisma.exchangeRate.findFirst = jest.fn().mockResolvedValue({ eurToVnd: 26000, vndToEur: 26000 });
      prisma.financialRecord.create = jest.fn().mockResolvedValue({ id: 'frec2', amountEur: 100, amountVnd: 2600000 });
      
      const res = await service.createRecord({
        date: new Date().toISOString(),
        description: 'Test VND',
        category: 'Test',
        market: 'VN',
        amountVnd: 2600000,
        source: 'VCB',
      });

      expect(prisma.exchangeRate.findFirst).toHaveBeenCalled();
      expect(prisma.financialRecord.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          amountEur: 100,
          amountVnd: 2600000,
        })
      }));
    });
  });

  describe('bulkCreateRecords', () => {
    it('should bulk create records from an array', async () => {
      prisma.$transaction = jest.fn().mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);
      prisma.exchangeRate.findFirst = jest.fn().mockResolvedValue({ eurToVnd: 26000, vndToEur: 26000 });
      
      const res = await service.bulkCreateRecords([
        { date: new Date().toISOString(), description: 'Bulk 1', category: 'C1', market: 'M1', amountEur: 10, source: 'S1' },
        { date: new Date().toISOString(), description: 'Bulk 2', category: 'C1', market: 'M1', amountVnd: 26000, source: 'S2' },
      ]);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(res.importedCount).toBe(2);
    });
  });
});
