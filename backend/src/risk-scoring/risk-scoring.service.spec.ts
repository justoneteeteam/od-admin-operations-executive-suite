/**
 * Mock ESM modules that cause issues in Jest
 */
jest.mock('google-spreadsheet', () => ({
  GoogleSpreadsheet: jest.fn(),
}));
jest.mock('google-auth-library', () => ({
  JWT: jest.fn(),
}));
jest.mock('../google-sheets/google-sheets.service', () => ({
  GoogleSheetsService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../twilio-voice/twilio-voice.service', () => ({
  TwilioVoiceService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../address-verify/address-verify.service', () => ({
  AddressVerifyService: jest.fn().mockImplementation(() => ({})),
}));

import { RiskScoringService } from './risk-scoring.service';

/**
 * Unit Tests — Base Scoring Layer (U-01 to U-18) + Risk Level Decisions (D-01 to D-10)
 *
 * Pure function tests. Mock all dependencies. No database, no network.
 */
describe('RiskScoringService', () => {
  let service: RiskScoringService;

  // Minimal mock dependencies — not used by runBaseScore/computeRiskLevel
  const mockPrisma = {} as any;
  const mockTwilio = {} as any;
  const mockGoogleSheets = {} as any;
  const mockAddressVerify = {} as any;

  beforeEach(() => {
    service = new RiskScoringService(mockPrisma, mockTwilio, mockGoogleSheets, mockAddressVerify);
  });

  // ──────────────────────────────────────────────────────────────
  // Helper: build a ScoringContext for runBaseScore
  // ──────────────────────────────────────────────────────────────
  function buildCtx(overrides: {
    itemQuantities?: number[];
    totalAmount?: number;
    recentOrders?: any[];
    successfulDeliveries?: number;
    ordersCount?: number;
    customerStatus?: string;
    isBlocked?: boolean;
    shippingPostalCode?: string;
    shippingAddressLine1?: string;
    shippingCountry?: string;
    shippingCity?: string;
  } = {}) {
    const items = (overrides.itemQuantities || [1]).map((qty, i) => ({
      id: `item-${i}`,
      quantity: qty,
    }));

    return {
      order: {
        id: 'order-1',
        totalAmount: overrides.totalAmount ?? 20,
        shippingPostalCode: overrides.shippingPostalCode ?? '28001',
        shippingAddressLine1: overrides.shippingAddressLine1 ?? '12 Calle Mayor',
        shippingCountry: overrides.shippingCountry ?? 'Spain',
        shippingCity: overrides.shippingCity ?? 'Madrid',
        shippingProvince: 'Madrid',
        items,
      },
      customer: {
        id: 'cust-1',
        status: overrides.customerStatus ?? 'Standard',
        isBlocked: overrides.isBlocked ?? false,
        successfulDeliveries: overrides.successfulDeliveries ?? 0,
        ordersCount: overrides.ordersCount ?? 1,
      },
      items,
      recentOrders: overrides.recentOrders ?? [],
    };
  }

  // ──────────────────────────────────────────────────────────────
  // U-01 to U-18: Base Scoring Layer
  // ──────────────────────────────────────────────────────────────

  describe('Base Scoring — runBaseScore', () => {
    it('U-01: No risk factors → score = 0', () => {
      const ctx = buildCtx({
        itemQuantities: [1],
        totalAmount: 20,
        successfulDeliveries: 0,
        shippingPostalCode: '28001',
        shippingAddressLine1: '12 Calle Mayor',
        shippingCountry: 'Spain',
      });
      const result = service.runBaseScore(ctx);
      expect(result.totalScore).toBe(0);
      expect(result.factors.blockedScore).toBe(0);
      expect(result.factors.itemScore).toBe(0);
      expect(result.factors.valueScore).toBe(0);
      expect(result.factors.frequencyScore).toBe(0);
      expect(result.factors.historyScore).toBe(0);
      expect(result.factors.addressFormatScore).toBe(0);
      expect(result.factors.missingHouseNumberScore).toBe(0);
    });

    it('U-02: 2 items → +1', () => {
      const ctx = buildCtx({ itemQuantities: [1, 1] });
      const result = service.runBaseScore(ctx);
      expect(result.factors.itemScore).toBe(1);
    });

    it('U-03: 3 items → +2', () => {
      const ctx = buildCtx({ itemQuantities: [1, 1, 1] });
      const result = service.runBaseScore(ctx);
      expect(result.factors.itemScore).toBe(2);
    });

    it('U-04: 5 items → +2 (cap at ≥3)', () => {
      const ctx = buildCtx({ itemQuantities: [1, 1, 1, 1, 1] });
      const result = service.runBaseScore(ctx);
      expect(result.factors.itemScore).toBe(2);
    });

    it('U-05: High value (totalAmount=75) → +2', () => {
      const ctx = buildCtx({ totalAmount: 75 });
      const result = service.runBaseScore(ctx);
      expect(result.factors.valueScore).toBe(2);
    });

    it('U-06: Borderline value (totalAmount=50) → 0 (> 50 required)', () => {
      const ctx = buildCtx({ totalAmount: 50 });
      const result = service.runBaseScore(ctx);
      expect(result.factors.valueScore).toBe(0);
    });

    it('U-07: Frequency — 2 orders in 7 days → +2', () => {
      const recent = [
        { id: 'o1', orderDate: new Date(Date.now() - 3 * 86400000) },
        { id: 'o2', orderDate: new Date(Date.now() - 5 * 86400000) },
      ];
      const ctx = buildCtx({ recentOrders: recent });
      const result = service.runBaseScore(ctx);
      expect(result.factors.frequencyScore).toBe(2);
    });

    it('U-08: Frequency — 1 order in 12h → +2', () => {
      const recent = [{ id: 'o1', orderDate: new Date(Date.now() - 6 * 3600000) }];
      const ctx = buildCtx({ recentOrders: recent });
      const result = service.runBaseScore(ctx);
      expect(result.factors.frequencyScore).toBe(2);
    });

    it('U-09: Frequency — both windows → +2 (not +4, rule is OR)', () => {
      const recent = [
        { id: 'o1', orderDate: new Date(Date.now() - 2 * 3600000) },
        { id: 'o2', orderDate: new Date(Date.now() - 5 * 86400000) },
      ];
      const ctx = buildCtx({ recentOrders: recent });
      const result = service.runBaseScore(ctx);
      expect(result.factors.frequencyScore).toBe(2);
    });

    it('U-10: Positive history (successfulDeliveries=3) → -1', () => {
      const ctx = buildCtx({ successfulDeliveries: 3 });
      const result = service.runBaseScore(ctx);
      expect(result.factors.historyScore).toBe(-1);
    });

    it('U-11: Floor at zero — only positive history, no risk factors → totalScore=0', () => {
      const ctx = buildCtx({ successfulDeliveries: 5 });
      const result = service.runBaseScore(ctx);
      expect(result.totalScore).toBe(0);
      expect(result.factors.historyScore).toBe(-1);
    });

    it('U-12: Blocked customer → +10 + isBlocked=true', () => {
      const ctx = buildCtx({ customerStatus: 'Blocked' });
      const result = service.runBaseScore(ctx);
      expect(result.factors.blockedScore).toBe(10);
      expect(result.isBlocked).toBe(true);
    });

    it('U-12b: Blocked via isBlocked flag → +10 + isBlocked=true', () => {
      const ctx = buildCtx({ isBlocked: true });
      const result = service.runBaseScore(ctx);
      expect(result.factors.blockedScore).toBe(10);
      expect(result.isBlocked).toBe(true);
    });

    it('U-13: Address — invalid postal code → +3', () => {
      const ctx = buildCtx({
        shippingAddressLine1: 'Rua das Flores',
        shippingPostalCode: 'XXXXX',
        shippingCountry: 'Spain',
      });
      const result = service.runBaseScore(ctx);
      expect(result.factors.addressFormatScore).toBe(3);
      expect(result.factors.loqateSource).toBe('local_fallback');
    });

    it('U-14: Address — missing house number → +1', () => {
      const ctx = buildCtx({
        shippingAddressLine1: 'C. del Pintor Francisco Carretero',
        shippingPostalCode: '28001',
        shippingCountry: 'Spain',
      });
      const result = service.runBaseScore(ctx);
      expect(result.factors.missingHouseNumberScore).toBe(1);
      expect(result.factors.hasHouseNumber).toBe(false);
    });

    it('U-15: Address — both invalid postal + no house number → +4', () => {
      const ctx = buildCtx({
        shippingAddressLine1: 'C. del Pintor Francisco Carretero',
        shippingPostalCode: 'XXXXX',
        shippingCountry: 'Spain',
      });
      const result = service.runBaseScore(ctx);
      expect(result.factors.addressFormatScore).toBe(3);
      expect(result.factors.missingHouseNumberScore).toBe(1);
      expect(result.totalScore).toBe(4);
    });

    it('U-16: Address — valid → both scores 0', () => {
      const ctx = buildCtx({
        shippingAddressLine1: '12 Baker Street',
        shippingPostalCode: '28001',
        shippingCountry: 'Spain',
      });
      const result = service.runBaseScore(ctx);
      expect(result.factors.addressFormatScore).toBe(0);
      expect(result.factors.missingHouseNumberScore).toBe(0);
      expect(result.factors.hasHouseNumber).toBe(true);
    });

    it('U-17: Combined high risk → all sub-scores populated', () => {
      const recent = [
        { id: 'o1', orderDate: new Date(Date.now() - 1 * 86400000) },
        { id: 'o2', orderDate: new Date(Date.now() - 3 * 86400000) },
      ];
      const ctx = buildCtx({
        customerStatus: 'Blocked',
        itemQuantities: [1, 1, 1],
        totalAmount: 80,
        recentOrders: recent,
        successfulDeliveries: 0,
        shippingAddressLine1: 'Some Street',
        shippingPostalCode: 'XXXXX',
        shippingCountry: 'Spain',
      });
      const result = service.runBaseScore(ctx);
      expect(result.factors.blockedScore).toBe(10);
      expect(result.factors.itemScore).toBe(2);
      expect(result.factors.valueScore).toBe(2);
      expect(result.factors.frequencyScore).toBe(2);
      expect(result.factors.addressFormatScore).toBe(3);
      expect(result.factors.missingHouseNumberScore).toBe(1);
      expect(result.isBlocked).toBe(true);
      expect(result.totalScore).toBe(20);
    });

    it('U-18: loqateSource always set to local_fallback', () => {
      const ctx = buildCtx();
      const result = service.runBaseScore(ctx);
      expect(result.factors.loqateSource).toBe('local_fallback');
    });
  });

  // ──────────────────────────────────────────────────────────────
  // D-01 to D-10: Risk Level Decision
  // ──────────────────────────────────────────────────────────────

  describe('Risk Level Decision — computeRiskLevel', () => {
    it('D-01: score=0, isBlocked=false → LOW', () => {
      expect(service.computeRiskLevel(0, false)).toEqual({ riskLevel: 'LOW', action: 'twilio_short' });
    });

    it('D-02: score=1, isBlocked=false → LOW', () => {
      expect(service.computeRiskLevel(1, false)).toEqual({ riskLevel: 'LOW', action: 'twilio_short' });
    });

    it('D-03: score=2, isBlocked=false → MEDIUM', () => {
      expect(service.computeRiskLevel(2, false)).toEqual({ riskLevel: 'MEDIUM', action: 'twilio_long' });
    });

    it('D-04: score=3, isBlocked=false → MEDIUM', () => {
      expect(service.computeRiskLevel(3, false)).toEqual({ riskLevel: 'MEDIUM', action: 'twilio_long' });
    });

    it('D-05: score=4, isBlocked=false → HIGH', () => {
      expect(service.computeRiskLevel(4, false)).toEqual({ riskLevel: 'HIGH', action: 'call_center' });
    });

    it('D-06: score=9, isBlocked=false → HIGH', () => {
      expect(service.computeRiskLevel(9, false)).toEqual({ riskLevel: 'HIGH', action: 'call_center' });
    });

    it('D-07: score=10, isBlocked=false → BLOCKED', () => {
      expect(service.computeRiskLevel(10, false)).toEqual({ riskLevel: 'BLOCKED', action: 'auto_reject' });
    });

    it('D-08: score=15, isBlocked=false → BLOCKED', () => {
      expect(service.computeRiskLevel(15, false)).toEqual({ riskLevel: 'BLOCKED', action: 'auto_reject' });
    });

    it('D-09: score=0, isBlocked=true → BLOCKED (flag overrides score)', () => {
      expect(service.computeRiskLevel(0, true)).toEqual({ riskLevel: 'BLOCKED', action: 'auto_reject' });
    });

    it('D-10: score=3, isBlocked=true → BLOCKED (flag overrides score)', () => {
      expect(service.computeRiskLevel(3, true)).toEqual({ riskLevel: 'BLOCKED', action: 'auto_reject' });
    });
  });
});
