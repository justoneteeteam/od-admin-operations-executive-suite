import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createHash } from 'crypto';
import axios from 'axios';

/**
 * Result returned by AddressVerifyService.verify().
 * Always has a `source` field — never undefined.
 */
export interface AddressVerifyResult {
    source: 'loqate' | 'cache' | 'local_fallback';
    avc: string | null;
    hasHouseNumber: boolean;
    addressFormatScore: 0 | 3;
    missingHouseNumberScore: 0 | 1;
    durationMs: number | null;
}

interface ParsedAvc {
    verificationChar: string;   // V, N, I
    granularityDigit: number;   // 1-5
    raw: string;
}

@Injectable()
export class AddressVerifyService {
    private readonly logger = new Logger(AddressVerifyService.name);

    constructor(private readonly prisma: PrismaService) { }

    // ─── Configuration helpers ──────────────────────────────────────

    private get loqateEnabled(): boolean {
        return (process.env.LOQATE_ENABLED || 'false').toLowerCase() === 'true';
    }

    private get loqateApiKey(): string {
        return process.env.LOQATE_API_KEY || '';
    }

    private get loqateTimeoutMs(): number {
        return parseInt(process.env.LOQATE_TIMEOUT_MS || '3000', 10);
    }

    private get loqateCacheTtlSec(): number {
        return parseInt(process.env.LOQATE_CACHE_TTL_SEC || '86400', 10);
    }

    private get loqateEndpoint(): string {
        return process.env.LOQATE_ENDPOINT || 'https://api.addressy.com/Cleansing/International/Batch/v1.00/json4.ws';
    }

    // ─── Main entry point ───────────────────────────────────────────

    /**
     * Verifies an address. Never throws.
     * Checks: flags → cache → API → fallback.
     */
    async verify(address: string, country: string, isBlocked: boolean): Promise<AddressVerifyResult> {
        // R1: Feature flag check
        if (!this.loqateEnabled) {
            this.logger.debug('loqate_disabled — using local fallback');
            return this.buildResultFromRegex(address, country);
        }

        // R2: Blocked customers skip Loqate
        if (isBlocked) {
            this.logger.debug('loqate_skipped_blocked — using local fallback');
            return this.buildResultFromRegex(address, country);
        }

        const hash = this.buildCacheKey(address);

        // R3: Cache check
        const cached = await this.checkCache(hash);
        if (cached) {
            this.logger.debug(`loqate_cache_hit — hash=${hash.substring(0, 12)}…`);
            return {
                source: 'cache',
                avc: cached.avc,
                hasHouseNumber: cached.hasHouseNumber,
                addressFormatScore: cached.addressFormatScore as 0 | 3,
                missingHouseNumberScore: cached.missingHouseNumberScore as 0 | 1,
                durationMs: null,
            };
        }

        // R4: Single API call, no retry
        try {
            const startMs = Date.now();
            const loqateResponse = await this.callLoqateApi(address);
            const durationMs = Date.now() - startMs;

            // R5: Response validation (Loqate batch API returns an array of results)
            const firstResult = Array.isArray(loqateResponse) ? loqateResponse[0] : loqateResponse;

            if (!firstResult || !Array.isArray(firstResult.Matches) || firstResult.Matches.length === 0) {
                this.logger.warn('loqate_fallback_bad_response — malformed response');
                return this.buildResultFromRegex(address, country);
            }

            // Sometimes if the address is completely unidentifiable, Loqate won't return an AVC string.
            // Treat it as "Not Verified" (N1).
            const avcRaw: string = firstResult.Matches[0]?.AVC || 'N1-I1-P1-000';


            const parsedAvc = this.parseAvc(avcRaw);
            const result = this.buildResultFromAvc(parsedAvc, durationMs);

            // Store in cache
            await this.storeCache(hash, result);

            return result;
        } catch (error) {
            this.logger.error(
                `loqate_fallback_error — Loqate API call failed: ${error.message}`,
                error.stack,
            );
            return this.buildResultFromRegex(address, country);
        }
    }

    // ─── Cache key algorithm ────────────────────────────────────────

    /**
     * Normalize address → SHA-256 hex hash.
     * 1. Lowercase
     * 2. Trim
     * 3. Collapse whitespace
     * 4. Remove punctuation except commas and hyphens
     * 5. SHA-256
     */
    buildCacheKey(address: string): string {
        let normalized = (address || '').toLowerCase().trim();
        normalized = normalized.replace(/\s+/g, ' ');
        normalized = normalized.replace(/[^\w\s,-]/g, '');
        const hash = createHash('sha256').update(normalized).digest('hex');
        return `loqate:addr:${hash}`;
    }

    // ─── Cache operations ───────────────────────────────────────────

    async checkCache(hash: string): Promise<{
        avc: string;
        hasHouseNumber: boolean;
        addressFormatScore: number;
        missingHouseNumberScore: number;
    } | null> {
        try {
            const entry = await this.prisma.loqateAddressCache.findUnique({
                where: { addressHash: hash },
            });

            if (!entry) return null;

            // Check TTL
            if (entry.expiresAt < new Date()) {
                return null; // Expired — treat as cache miss
            }

            return {
                avc: entry.avc,
                hasHouseNumber: entry.hasHouseNumber,
                addressFormatScore: entry.addressFormatScore,
                missingHouseNumberScore: entry.missingHouseNumberScore,
            };
        } catch (error) {
            this.logger.warn(`Cache read error: ${error.message}`);
            return null;
        }
    }

    async storeCache(hash: string, result: AddressVerifyResult): Promise<void> {
        try {
            const ttlMs = this.loqateCacheTtlSec * 1000;
            const expiresAt = new Date(Date.now() + ttlMs);

            await this.prisma.loqateAddressCache.upsert({
                where: { addressHash: hash },
                create: {
                    addressHash: hash,
                    avc: result.avc || '',
                    hasHouseNumber: result.hasHouseNumber,
                    addressFormatScore: result.addressFormatScore,
                    missingHouseNumberScore: result.missingHouseNumberScore,
                    source: 'loqate',
                    expiresAt,
                },
                update: {
                    avc: result.avc || '',
                    hasHouseNumber: result.hasHouseNumber,
                    addressFormatScore: result.addressFormatScore,
                    missingHouseNumberScore: result.missingHouseNumberScore,
                    expiresAt,
                },
            });
        } catch (error) {
            this.logger.warn(`Cache write error: ${error.message}`);
        }
    }

    // ─── Loqate API call ────────────────────────────────────────────

    async callLoqateApi(address: string): Promise<any> {
        const response = await axios.post(
            this.loqateEndpoint,
            {
                Key: this.loqateApiKey,
                Addresses: [{ Address: address }],
            },
            {
                timeout: this.loqateTimeoutMs,
                headers: { 'Content-Type': 'application/json' },
            },
        );
        return response.data;
    }

    // ─── AVC parsing ────────────────────────────────────────────────

    /**
     * Parse AVC code: [VerificationChar][GranularityDigit][additional…]
     * V = Verified, N = Not Verified, I = Insufficient
     * Granularity: 1=AdminArea, 2=Locality, 3=Thoroughfare, 4=Premise, 5=DeliveryPoint
     */
    parseAvc(avc: string): ParsedAvc {
        const verificationChar = avc.charAt(0).toUpperCase();
        const granularityDigit = parseInt(avc.charAt(1), 10) || 0;
        return { verificationChar, granularityDigit, raw: avc };
    }

    /**
     * Map parsed AVC to score deltas per Section 3.4.
     */
    buildResultFromAvc(parsed: ParsedAvc, durationMs: number): AddressVerifyResult {
        // V4x+ or V5x+ → Premise/DeliveryPoint — house confirmed
        if (parsed.verificationChar === 'V' && parsed.granularityDigit >= 4) {
            return {
                source: 'loqate',
                avc: parsed.raw,
                hasHouseNumber: true,
                addressFormatScore: 0,
                missingHouseNumberScore: 0,
                durationMs,
            };
        }

        // V3x → Thoroughfare only — street found, no premise
        if (parsed.verificationChar === 'V' && parsed.granularityDigit === 3) {
            return {
                source: 'loqate',
                avc: parsed.raw,
                hasHouseNumber: false,
                addressFormatScore: 0,
                missingHouseNumberScore: 1,
                durationMs,
            };
        }

        // V1x, V2x → Area/Locality — low confidence
        // Nx → Not verified
        // Ix → Insufficient data
        return {
            source: 'loqate',
            avc: parsed.raw,
            hasHouseNumber: false,
            addressFormatScore: 3,
            missingHouseNumberScore: 1,
            durationMs,
        };
    }

    // ─── Local regex fallback ───────────────────────────────────────

    /**
     * Local regex scoring — the permanent safety net.
     * Same rules as base scoring Layer 1.
     */
    buildResultFromRegex(address: string, country: string): AddressVerifyResult {
        const cleanCountry = (country || '').trim().toLowerCase();
        let addressFormatScore: 0 | 3 = 0;

        // Extract postal code — look for patterns at the end or in the address
        const postalMatch = address.match(/\b(\d{4,6})\b/);
        const postalCode = postalMatch ? postalMatch[1] : '';

        if (cleanCountry === 'spain' || cleanCountry === 'es' || cleanCountry === 'españa') {
            const spainRegex = /^(0[1-9]|[1-4][0-9]|5[0-2])[0-9]{3}$/;
            if (!spainRegex.test(postalCode)) {
                addressFormatScore = 3;
            }
        } else if (cleanCountry === 'italy' || cleanCountry === 'it' || cleanCountry === 'italia') {
            const italyRegex = /^[0-9]{5}$/;
            if (!italyRegex.test(postalCode)) {
                addressFormatScore = 3;
            }
        }

        // House number: look for digit before first comma
        const beforeComma = address.split(',')[0] || '';
        const hasHouseNumber = /\d+/.test(beforeComma);
        const missingHouseNumberScore: 0 | 1 = hasHouseNumber ? 0 : 1;

        return {
            source: 'local_fallback',
            avc: null,
            hasHouseNumber,
            addressFormatScore,
            missingHouseNumberScore,
            durationMs: null,
        };
    }
}
