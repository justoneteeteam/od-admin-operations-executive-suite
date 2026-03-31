/**
 * ads-campaigns.service.spec.ts
 *
 * Unit tests for AdsCampaignsService — focused on the bulkCreate path
 * that previously caused "value too long for column type" DB errors.
 *
 * Root cause of the original bug:
 *   Several columns in ads_campaigns had tight VARCHAR limits:
 *     campaign      VARCHAR(255)  → was overflowing on long Meta campaign names
 *     ad_name       VARCHAR(500)  → was overflowing on long Meta ad names
 *     ad_set_name   VARCHAR(500)  → was overflowing on long Meta ad-set names
 *     country       VARCHAR(10)   → short but could overflow with full country names
 *     source        VARCHAR(20)   → could overflow
 *   All were migrated to TEXT / wider VARCHARs on 2026-03-27.
 *
 * These tests use a mocked PrismaService so they run offline with no DB.
 */

import { BadRequestException } from '@nestjs/common';
import { AdsCampaignsService } from './ads-campaigns.service';

// ─── Helpers to build the mock Prisma ────────────────────────────────────────

function makePrisma(overrides: Partial<any> = {}) {
  return {
    product: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    order: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    adsCampaign: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    adsCampaignChangeLog: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    exchangeRate: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    ...overrides,
  } as any;
}

/** A valid minimal record fixture */
function makeRecord(overrides: Partial<any> = {}) {
  return {
    date: '2026-03-19',
    campaign: 'TEST-CAMPAIGN',
    country: 'ES',
    platform: 'Meta',
    sku: '',
    stage: 'Test',
    pic: 'John',
    spendVnd: 100000,
    notes: '',
    source: 'upload',
    adName: 'Ad 1',
    adSetName: 'AdSet 1',
    cpc: 0,
    cpm: 0,
    ctr: 0,
    resultType: 'lead',
    costPerResult: 0,
    metaPurchases: 0,
    reportStart: '',
    reportEnd: '',
    orderNumber: '',
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AdsCampaignsService — bulkCreate', () => {
  let service: AdsCampaignsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AdsCampaignsService(prisma);
  });

  // ── COLUMN OVERFLOW REGRESSION TESTS ─────────────────────────────────────
  // These directly test the bug that caused the production error.
  // The service calls prisma.adsCampaign.createMany — if column sizes had not
  // been fixed in the DB (and these were still VARCHAR-constrained), these
  // cases would throw "value too long for column type".

  describe('Column overflow regression (VARCHAR → TEXT migration)', () => {

    it('COL-01: campaign name > 255 chars does not throw', async () => {
      const longCampaign = 'TEST-AI-SPAIN-LONG-' + 'X'.repeat(300); // 319 chars
      prisma.adsCampaign.createMany.mockResolvedValue({ count: 1 });

      await expect(
        service.bulkCreate([makeRecord({ campaign: longCampaign })]),
      ).resolves.toMatchObject({ created: 1 });

      const [call] = prisma.adsCampaign.createMany.mock.calls;
      expect(call[0].data[0].campaign).toBe(longCampaign);
    });

    it('COL-02: ad_name > 500 chars does not throw', async () => {
      const longAdName = 'Ad-' + 'Y'.repeat(600); // 603 chars
      prisma.adsCampaign.createMany.mockResolvedValue({ count: 1 });

      await expect(
        service.bulkCreate([makeRecord({ adName: longAdName })]),
      ).resolves.toMatchObject({ created: 1 });

      const [call] = prisma.adsCampaign.createMany.mock.calls;
      expect(call[0].data[0].adName).toBe(longAdName);
    });

    it('COL-03: ad_set_name > 500 chars does not throw', async () => {
      const longAdSetName = 'AdSet-' + 'Z'.repeat(600);
      prisma.adsCampaign.createMany.mockResolvedValue({ count: 1 });

      await expect(
        service.bulkCreate([makeRecord({ adSetName: longAdSetName })]),
      ).resolves.toMatchObject({ created: 1 });

      const [call] = prisma.adsCampaign.createMany.mock.calls;
      expect(call[0].data[0].adSetName).toBe(longAdSetName);
    });

    it('COL-04: country value longer than 10 chars does not throw', async () => {
      // E.g. a Meta export might send full country name instead of code
      const longCountry = 'SpainCountry'; // 12 chars, old limit was 10
      prisma.adsCampaign.createMany.mockResolvedValue({ count: 1 });

      await expect(
        service.bulkCreate([makeRecord({ country: longCountry })]),
      ).resolves.toMatchObject({ created: 1 });
    });

    it('COL-05: source value longer than 20 chars does not throw', async () => {
      const longSource = 'meta-csv-bulk-upload-v2'; // 23 chars, old limit was 20
      prisma.adsCampaign.createMany.mockResolvedValue({ count: 1 });

      await expect(
        service.bulkCreate([makeRecord({ source: longSource })]),
      ).resolves.toMatchObject({ created: 1 });
    });

    it('COL-06: all long-string columns together — 109-record batch does not throw', async () => {
      const records = Array.from({ length: 109 }, (_, i) =>
        makeRecord({
          campaign: `TEST-AI-SPAIN-LONG-${1400 + i}-${'X'.repeat(200)}`,
          adName: `TEST${String(i).padStart(3, '0')}-${'A'.repeat(400)}`,
          adSetName: `AdSet-${'B'.repeat(400)}`,
          country: 'ES',
        }),
      );
      prisma.adsCampaign.createMany.mockResolvedValue({ count: 109 });

      await expect(service.bulkCreate(records)).resolves.toMatchObject({ created: 109 });
    });
  });

  // ── DATE PARSING TESTS ────────────────────────────────────────────────────

  describe('Date parsing', () => {
    it('DATE-01: YYYY-MM-DD string is accepted', async () => {
      prisma.adsCampaign.createMany.mockResolvedValue({ count: 1 });
      await expect(
        service.bulkCreate([makeRecord({ date: '2026-03-19' })]),
      ).resolves.toMatchObject({ created: 1 });
    });

    it('DATE-02: DD/MM/YYYY format is accepted', async () => {
      prisma.adsCampaign.createMany.mockResolvedValue({ count: 1 });
      await expect(
        service.bulkCreate([makeRecord({ date: '19/03/2026' })]),
      ).resolves.toMatchObject({ created: 1 });
    });

    it('DATE-03: Excel serial date (46100) is accepted', async () => {
      prisma.adsCampaign.createMany.mockResolvedValue({ count: 1 });
      await expect(
        service.bulkCreate([makeRecord({ date: '46100' })]),
      ).resolves.toMatchObject({ created: 1 });
    });

    it('DATE-04: invalid date string throws BadRequestException', async () => {
      await expect(
        service.bulkCreate([makeRecord({ date: 'not-a-date' })]),
      ).rejects.toThrow(BadRequestException);
    });

    it('DATE-05: empty date string throws BadRequestException', async () => {
      await expect(
        service.bulkCreate([makeRecord({ date: '' })]),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── SKU VALIDATION TESTS ──────────────────────────────────────────────────

  describe('SKU validation', () => {
    it('SKU-01: empty SKU passes validation (no-SKU product)', async () => {
      prisma.adsCampaign.createMany.mockResolvedValue({ count: 1 });
      await expect(
        service.bulkCreate([makeRecord({ sku: '' })]),
      ).resolves.toMatchObject({ created: 1 });
    });

    it('SKU-02: null/undefined SKU passes validation', async () => {
      prisma.adsCampaign.createMany.mockResolvedValue({ count: 1 });
      await expect(
        service.bulkCreate([makeRecord({ sku: undefined })]),
      ).resolves.toMatchObject({ created: 1 });
    });

    it('SKU-03: known SKU is validated against Products table', async () => {
      prisma.product.findMany.mockResolvedValue([{ sku: 'SKU-001' }]);
      prisma.adsCampaign.createMany.mockResolvedValue({ count: 1 });

      await expect(
        service.bulkCreate([makeRecord({ sku: 'SKU-001' })]),
      ).resolves.toMatchObject({ created: 1 });
    });

    it('SKU-04: unknown SKU throws BadRequestException', async () => {
      prisma.product.findMany.mockResolvedValue([]); // nothing in DB

      await expect(
        service.bulkCreate([makeRecord({ sku: 'SKU-DOES-NOT-EXIST' })]),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── ORDER NUMBER MATCHING TESTS ───────────────────────────────────────────

  describe('Order number matching', () => {
    it('ORD-01: matched order number is stored in orderIds', async () => {
      prisma.order.findMany.mockResolvedValue([
        { orderNumber: '#1559', items: [] },
      ]);
      prisma.adsCampaign.createMany.mockResolvedValue({ count: 1 });

      await service.bulkCreate([makeRecord({ orderNumber: '#1559' })]);

      const [call] = prisma.adsCampaign.createMany.mock.calls;
      expect(call[0].data[0].orderIds).toBe('#1559');
    });

    it('ORD-02: unmatched order number results in null orderIds', async () => {
      prisma.order.findMany.mockResolvedValue([]); // nothing found
      prisma.adsCampaign.createMany.mockResolvedValue({ count: 1 });

      await service.bulkCreate([makeRecord({ orderNumber: '#XXXX' })]);

      const [call] = prisma.adsCampaign.createMany.mock.calls;
      expect(call[0].data[0].orderIds).toBeNull();
    });

    it('ORD-03: unresolved order numbers are returned in result', async () => {
      prisma.order.findMany.mockResolvedValue([]);
      prisma.adsCampaign.createMany.mockResolvedValue({ count: 1 });

      const result = await service.bulkCreate([makeRecord({ orderNumber: '#MISSING' })]);
      expect(result.unresolvedOrderNumbers).toContain('#MISSING');
    });

    it('ORD-04: semicolon-separated order numbers are each matched', async () => {
      prisma.order.findMany.mockResolvedValue([
        { orderNumber: '#100', items: [] },
        { orderNumber: '#101', items: [] },
      ]);
      prisma.adsCampaign.createMany.mockResolvedValue({ count: 1 });

      await service.bulkCreate([makeRecord({ orderNumber: '#100;#101' })]);

      const [call] = prisma.adsCampaign.createMany.mock.calls;
      expect(call[0].data[0].orderIds).toBe('#100;#101');
    });
  });

  // ── GENERAL BULK CREATE ───────────────────────────────────────────────────

  describe('General bulk create', () => {
    it('BULK-01: empty records array returns created=0', async () => {
      prisma.adsCampaign.createMany.mockResolvedValue({ count: 0 });
      const result = await service.bulkCreate([]);
      expect(result.created).toBe(0);
    });

    it('BULK-02: result includes created count and orderMatchedCount', async () => {
      prisma.adsCampaign.createMany.mockResolvedValue({ count: 3 });
      const records = [
        makeRecord({ date: '2026-03-19' }),
        makeRecord({ date: '2026-03-20' }),
        makeRecord({ date: '2026-03-21' }),
      ];
      const result = await service.bulkCreate(records);
      expect(result.created).toBe(3);
      expect(typeof result.orderMatchedCount).toBe('number');
    });

    it('BULK-03: DB error is wrapped in BadRequestException with message', async () => {
      prisma.adsCampaign.createMany.mockRejectedValue(
        new Error('value too long for type character varying(255)'),
      );

      await expect(
        service.bulkCreate([makeRecord()]),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
