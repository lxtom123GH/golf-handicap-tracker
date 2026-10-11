import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

// functions/lookup.js is CommonJS and lives outside src/; require it directly so
// this stays a pure unit test (no emulator, no firebase-admin) — the same shape
// tests/unit/quota.test.js uses for functions/quota.js.
const require = createRequire(import.meta.url);
const {
    LOOKUP_DAILY_LIMIT,
    normaliseLookupEmail,
    callerMayLookUp,
    resolvableUidFrom,
} = require('../../functions/lookup.js');

// F-22 (product sweep 2026-09-10): resolveUserByEmail was an unrestricted
// email→uid oracle — any authenticated account could test any address in the
// world against the live user table, unmetered, and learn both membership and
// the uid. These are the three narrowings, each testable without a network.

describe('normaliseLookupEmail', () => {
    it('trims and accepts a plausible address', () => {
        expect(normaliseLookupEmail('  coach@example.org ')).toBe('coach@example.org');
    });

    it('rejects junk with invalid-argument', () => {
        for (const bad of ['', '   ', 'not-an-email', null, undefined, 'a@'.padEnd(300, 'x')]) {
            expect(() => normaliseLookupEmail(bad)).toThrow(
                expect.objectContaining({ code: 'invalid-argument' })
            );
        }
    });

    it('does NOT lowercase — the stored users.email keeps the case the signer typed', () => {
        // The Admin SDK query is an exact == against users.email, so folding
        // case here would stop resolving real accounts.
        expect(normaliseLookupEmail('Coach@Example.ORG')).toBe('Coach@Example.ORG');
    });
});

describe('callerMayLookUp', () => {
    it('admits an approved caller', () => {
        expect(callerMayLookUp({ isApproved: true })).toBe(true);
        expect(callerMayLookUp({ isApproved: true, isAdmin: true })).toBe(true);
    });

    it('refuses an unapproved or unknown caller', () => {
        // The pending-approval holding pen must not be a vantage point for
        // enumerating the user table.
        expect(callerMayLookUp({ isApproved: false })).toBe(false);
        expect(callerMayLookUp({})).toBe(false);
        expect(callerMayLookUp(null)).toBe(false);
        expect(callerMayLookUp(undefined)).toBe(false);
    });
});

describe('resolvableUidFrom', () => {
    it('returns the uid of a COACH — the only thing the add-coach flow needs', () => {
        expect(resolvableUidFrom({ id: 'c1', data: { isCoach: true, isApproved: true } })).toBe('c1');
    });

    it('returns null for an ordinary player, so the callable is not a membership oracle', () => {
        // A coach is already public: profiles/{uid} carries isCoach and the
        // picker at practice.js:544 lists them. An ordinary player's membership
        // is not, and this callable used to disclose it for any address.
        expect(resolvableUidFrom({ id: 'p1', data: { isCoach: false, isApproved: true } })).toBe(null);
        expect(resolvableUidFrom({ id: 'p2', data: { isApproved: true } })).toBe(null);
    });

    it('returns null for no match at all (indistinguishable from a non-coach)', () => {
        expect(resolvableUidFrom(null)).toBe(null);
        expect(resolvableUidFrom(undefined)).toBe(null);
    });
});

describe('LOOKUP_DAILY_LIMIT', () => {
    it('is a small per-caller daily allowance, well under the AI cap of 50', () => {
        expect(LOOKUP_DAILY_LIMIT).toBeGreaterThan(0);
        expect(LOOKUP_DAILY_LIMIT).toBeLessThanOrEqual(25);
    });
});
