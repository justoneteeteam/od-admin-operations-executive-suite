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
});
