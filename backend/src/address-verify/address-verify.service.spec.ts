import { AddressVerifyService } from './address-verify.service';

/**
 * Integration Tests — AddressVerifyService (I-01 to I-15)
 *
 * Uses mock/stub for Loqate HTTP client and database cache.
 * Validates full verify() logic including fallback transitions.
 */
describe('AddressVerifyService', () => {
    let service: AddressVerifyService;
    let mockPrisma: any;

    // Spy on axios.post for HTTP call interception
    const axiosPostSpy = jest.fn();

    beforeEach(() => {
        // Reset environment
        delete process.env.LOQATE_ENABLED;
        delete process.env.LOQATE_API_KEY;
        delete process.env.LOQATE_TIMEOUT_MS;
        delete process.env.LOQATE_CACHE_TTL_SEC;

        // Mock PrismaService with loqateAddressCache methods
        mockPrisma = {
            loqateAddressCache: {
                findUnique: jest.fn().mockResolvedValue(null),
                upsert: jest.fn().mockResolvedValue({}),
            },
        };

        service = new AddressVerifyService(mockPrisma);

        // Override callLoqateApi to use our spy instead of real axios
        service.callLoqateApi = axiosPostSpy;
        axiosPostSpy.mockReset();
    });

    afterEach(() => {
        delete process.env.LOQATE_ENABLED;
        delete process.env.LOQATE_API_KEY;
        delete process.env.LOQATE_TIMEOUT_MS;
        delete process.env.LOQATE_CACHE_TTL_SEC;
    });

    // ──────────────────────────────────────────────────────────────
    // I-01: LOQATE_ENABLED=false → skip entirely
    // ──────────────────────────────────────────────────────────────
    it('I-01: LOQATE_ENABLED=false → no HTTP call, source=local_fallback', async () => {
        process.env.LOQATE_ENABLED = 'false';

        const result = await service.verify('12 Baker St, London', 'Spain', false);

        expect(result.source).toBe('local_fallback');
        expect(axiosPostSpy).not.toHaveBeenCalled();
        expect(mockPrisma.loqateAddressCache.findUnique).not.toHaveBeenCalled();
    });

    // ──────────────────────────────────────────────────────────────
    // I-02: Blocked customer → skip entirely
    // ──────────────────────────────────────────────────────────────
    it('I-02: Blocked customer → no HTTP call, source=local_fallback, 0 DB reads', async () => {
        process.env.LOQATE_ENABLED = 'true';

        const result = await service.verify('12 Baker St', 'Spain', true);

        expect(result.source).toBe('local_fallback');
        expect(axiosPostSpy).not.toHaveBeenCalled();
        expect(mockPrisma.loqateAddressCache.findUnique).not.toHaveBeenCalled();
    });

    // ──────────────────────────────────────────────────────────────
    // I-03: Cache MISS → API called, result cached
    // ──────────────────────────────────────────────────────────────
    it('I-03: Cache MISS → 1 HTTP call, cache written, source=loqate', async () => {
        process.env.LOQATE_ENABLED = 'true';
        process.env.LOQATE_API_KEY = 'test-key';

        axiosPostSpy.mockResolvedValue({
            Matches: [{ AVC: 'V44-I44-P3-100' }],
        });

        const result = await service.verify('12 Baker St, London W1U 6TN', 'Spain', false);

        expect(result.source).toBe('loqate');
        expect(result.avc).toBe('V44-I44-P3-100');
        expect(axiosPostSpy).toHaveBeenCalledTimes(1);
        expect(mockPrisma.loqateAddressCache.upsert).toHaveBeenCalledTimes(1);

        // Verify TTL is ~24h in the future
        const upsertCall = mockPrisma.loqateAddressCache.upsert.mock.calls[0][0];
        const expiresAt = upsertCall.create.expiresAt;
        const diffMs = expiresAt.getTime() - Date.now();
        expect(diffMs).toBeGreaterThan(23 * 3600 * 1000); // At least 23h
        expect(diffMs).toBeLessThanOrEqual(25 * 3600 * 1000); // At most 25h
    });

    // ──────────────────────────────────────────────────────────────
    // I-04: Cache HIT → API not called
    // ──────────────────────────────────────────────────────────────
    it('I-04: Cache HIT → 0 HTTP calls, source=cache', async () => {
        process.env.LOQATE_ENABLED = 'true';

        mockPrisma.loqateAddressCache.findUnique.mockResolvedValue({
            avc: 'V44-I44-P3-100',
            hasHouseNumber: true,
            addressFormatScore: 0,
            missingHouseNumberScore: 0,
            expiresAt: new Date(Date.now() + 3600000), // 1h from now
        });

        const result = await service.verify('12 Baker St, London', 'Spain', false);

        expect(result.source).toBe('cache');
        expect(result.avc).toBe('V44-I44-P3-100');
        expect(result.hasHouseNumber).toBe(true);
        expect(result.addressFormatScore).toBe(0);
        expect(axiosPostSpy).not.toHaveBeenCalled();
    });

    // ──────────────────────────────────────────────────────────────
    // I-05: Cache EXPIRED → treated as MISS, API called
    // ──────────────────────────────────────────────────────────────
    it('I-05: Cache EXPIRED → 1 HTTP call, new cache entry written', async () => {
        process.env.LOQATE_ENABLED = 'true';

        mockPrisma.loqateAddressCache.findUnique.mockResolvedValue({
            avc: 'V44-I44-P3-100',
            hasHouseNumber: true,
            addressFormatScore: 0,
            missingHouseNumberScore: 0,
            expiresAt: new Date(Date.now() - 3600000), // 1h ago — expired
        });

        axiosPostSpy.mockResolvedValue({
            Matches: [{ AVC: 'V34-I44-P2-095' }],
        });

        const result = await service.verify('Baker St, London', 'Spain', false);

        expect(result.source).toBe('loqate');
        expect(axiosPostSpy).toHaveBeenCalledTimes(1);
        expect(mockPrisma.loqateAddressCache.upsert).toHaveBeenCalledTimes(1);
    });

    // ──────────────────────────────────────────────────────────────
    // I-06: Loqate V44 — Premise match
    // ──────────────────────────────────────────────────────────────
    it('I-06: Loqate V44 → addressFormatScore=0, missingHouseNumberScore=0, hasHouseNumber=true', async () => {
        process.env.LOQATE_ENABLED = 'true';

        axiosPostSpy.mockResolvedValue({
            Matches: [{ AVC: 'V44-I44-P3-100' }],
        });

        const result = await service.verify('12 Baker St, London', 'Spain', false);

        expect(result.addressFormatScore).toBe(0);
        expect(result.missingHouseNumberScore).toBe(0);
        expect(result.hasHouseNumber).toBe(true);
        expect(result.source).toBe('loqate');
    });

    // ──────────────────────────────────────────────────────────────
    // I-07: Loqate V34 — Thoroughfare only
    // ──────────────────────────────────────────────────────────────
    it('I-07: Loqate V34 → addressFormatScore=0, missingHouseNumberScore=1, hasHouseNumber=false', async () => {
        process.env.LOQATE_ENABLED = 'true';

        axiosPostSpy.mockResolvedValue({
            Matches: [{ AVC: 'V34-I44-P2-095' }],
        });

        const result = await service.verify('Baker St, London', 'Spain', false);

        expect(result.addressFormatScore).toBe(0);
        expect(result.missingHouseNumberScore).toBe(1);
        expect(result.hasHouseNumber).toBe(false);
    });

    // ──────────────────────────────────────────────────────────────
    // I-08: Loqate N1 — not verified
    // ──────────────────────────────────────────────────────────────
    it('I-08: Loqate N1 → addressFormatScore=3, missingHouseNumberScore=1, hasHouseNumber=false', async () => {
        process.env.LOQATE_ENABLED = 'true';

        axiosPostSpy.mockResolvedValue({
            Matches: [{ AVC: 'N1-I1-P1-000' }],
        });

        const result = await service.verify('Unknown Address', 'Spain', false);

        expect(result.addressFormatScore).toBe(3);
        expect(result.missingHouseNumberScore).toBe(1);
        expect(result.hasHouseNumber).toBe(false);
    });

    // ──────────────────────────────────────────────────────────────
    // I-09: Loqate timeout → fallback
    // ──────────────────────────────────────────────────────────────
    it('I-09: Loqate timeout → source=local_fallback, no exception thrown', async () => {
        process.env.LOQATE_ENABLED = 'true';
        process.env.LOQATE_TIMEOUT_MS = '100';

        axiosPostSpy.mockRejectedValue(new Error('timeout of 100ms exceeded'));

        const result = await service.verify('12 Baker St', 'Spain', false);

        expect(result.source).toBe('local_fallback');
        // Should NOT throw
    });

    // ──────────────────────────────────────────────────────────────
    // I-10: Loqate HTTP 500 → fallback
    // ──────────────────────────────────────────────────────────────
    it('I-10: Loqate HTTP 500 → source=local_fallback', async () => {
        process.env.LOQATE_ENABLED = 'true';

        axiosPostSpy.mockRejectedValue(new Error('Request failed with status code 500'));

        const result = await service.verify('12 Baker St', 'Spain', false);

        expect(result.source).toBe('local_fallback');
    });

    // ──────────────────────────────────────────────────────────────
    // I-11: Loqate malformed JSON → fallback
    // ──────────────────────────────────────────────────────────────
    it('I-11: Loqate malformed response → source=local_fallback', async () => {
        process.env.LOQATE_ENABLED = 'true';

        axiosPostSpy.mockResolvedValue({ SomeOtherField: 'garbage' });

        const result = await service.verify('12 Baker St', 'Spain', false);

        expect(result.source).toBe('local_fallback');
    });

    // ──────────────────────────────────────────────────────────────
    // I-12: Scores do not double-count (good address, Loqate V44)
    // ──────────────────────────────────────────────────────────────
    it('I-12: Scores do not double-count — Loqate V44 overrides regex +1', async () => {
        process.env.LOQATE_ENABLED = 'true';

        // Regex would score missingHouseNumber=1 for "Baker St" (no digit before comma)
        // But Loqate V44 says premise found → should override to 0
        axiosPostSpy.mockResolvedValue({
            Matches: [{ AVC: 'V44-I44-P3-100' }],
        });

        const result = await service.verify('Baker St, London', 'Spain', false);

        expect(result.source).toBe('loqate');
        expect(result.missingHouseNumberScore).toBe(0);
        expect(result.hasHouseNumber).toBe(true);
    });

    // ──────────────────────────────────────────────────────────────
    // I-13: Scores do not double-count — bad address, Loqate V34
    // ──────────────────────────────────────────────────────────────
    it('I-13: Scores do not double-count — Loqate V34 overrides regex +3+1', async () => {
        process.env.LOQATE_ENABLED = 'true';

        // Regex would score addressFormat=3 + missingHouseNumber=1 = 4
        // Loqate V34 (street found, no premise) → addressFormat=0, missingHouseNumber=1 → total=1
        axiosPostSpy.mockResolvedValue({
            Matches: [{ AVC: 'V34-I44-P2-095' }],
        });

        const result = await service.verify('Some Street, XXXXX', 'Spain', false);

        expect(result.addressFormatScore).toBe(0);
        expect(result.missingHouseNumberScore).toBe(1);
    });

    // ──────────────────────────────────────────────────────────────
    // I-14: No retry on timeout
    // ──────────────────────────────────────────────────────────────
    it('I-14: No retry on timeout — exactly 1 HTTP call made', async () => {
        process.env.LOQATE_ENABLED = 'true';

        let callCount = 0;
        axiosPostSpy.mockImplementation(async () => {
            callCount++;
            if (callCount === 1) throw new Error('timeout');
            return { Matches: [{ AVC: 'V44-I44-P3-100' }] };
        });

        const result = await service.verify('12 Baker St', 'Spain', false);

        expect(callCount).toBe(1);
        expect(result.source).toBe('local_fallback');
    });

    // ──────────────────────────────────────────────────────────────
    // I-15: Result always has source field
    // ──────────────────────────────────────────────────────────────
    it('I-15: Result always has source field — never undefined', async () => {
        // Test all three paths

        // Path 1: disabled
        process.env.LOQATE_ENABLED = 'false';
        const r1 = await service.verify('12 Baker St', 'Spain', false);
        expect(['loqate', 'cache', 'local_fallback']).toContain(r1.source);
        expect(r1.source).toBeDefined();

        // Path 2: enabled + success
        process.env.LOQATE_ENABLED = 'true';
        axiosPostSpy.mockResolvedValue({ Matches: [{ AVC: 'V44-I44-P3-100' }] });
        const r2 = await service.verify('12 Baker St', 'Spain', false);
        expect(['loqate', 'cache', 'local_fallback']).toContain(r2.source);
        expect(r2.source).toBeDefined();

        // Path 3: enabled + error
        axiosPostSpy.mockRejectedValue(new Error('network error'));
        const r3 = await service.verify('12 Baker St', 'Spain', false);
        expect(['loqate', 'cache', 'local_fallback']).toContain(r3.source);
        expect(r3.source).toBeDefined();
    });
});
