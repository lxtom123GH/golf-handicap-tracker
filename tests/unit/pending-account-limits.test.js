// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'node:fs';
import { aiErrorMessage } from '../../src/ai-errors.js';

// Pre-publish security gate (2026-10-09): pending (self-registered, not yet
// approved) accounts could call every paid Gemini callable and upload audio
// without limit. These tests pin the closure without an emulator:
//   - functions/approval.js (pure, like quota.js / lookup.js) is unit-tested
//     with an in-memory Firestore stand-in;
//   - functions/index.js is checked statically: every Gemini caller goes
//     through enforceAiQuota, which checks approval BEFORE consuming quota;
//   - the deploy workflow ships storage.rules, and the recorder names an audio
//     content type. The Storage rules themselves are evaluated in the emulator
//     by tests/rules/storage.test.js (npm run test:rules).
const require = createRequire(import.meta.url);
const { isApprovedMember, assertApprovedMember, PENDING_APPROVAL_MESSAGE } =
    require('../../functions/approval.js');
const { callerMayLookUp } = require('../../functions/lookup.js');

function fakeDb(users) {
    const reads = [];
    return {
        reads,
        collection: (c) => ({
            doc: (id) => ({
                async get() {
                    reads.push(`${c}/${id}`);
                    const data = users[id];
                    return { exists: data !== undefined, data: () => data };
                },
            }),
        }),
    };
}

describe('isApprovedMember', () => {
    it('admits isApproved === true and admins', () => {
        expect(isApprovedMember({ isApproved: true })).toBe(true);
        expect(isApprovedMember({ isAdmin: true })).toBe(true);
        expect(isApprovedMember({ isApproved: false, isAdmin: true })).toBe(true);
    });

    it('refuses pending, unknown and truthy-but-not-true values', () => {
        expect(isApprovedMember({ isApproved: false })).toBe(false);
        expect(isApprovedMember({})).toBe(false);
        expect(isApprovedMember({ isApproved: 'true' })).toBe(false);
        expect(isApprovedMember({ isApproved: 1, isAdmin: 'yes' })).toBe(false);
        expect(isApprovedMember(null)).toBe(false);
        expect(isApprovedMember(undefined)).toBe(false);
    });

    it('is the same predicate resolveUserByEmail Gate 1 uses', () => {
        for (const d of [{ isApproved: true }, { isAdmin: true }, { isApproved: false }, {}, null]) {
            expect(callerMayLookUp(d)).toBe(isApprovedMember(d));
        }
    });
});

describe('assertApprovedMember', () => {
    it('resolves with the user data for an approved caller', async () => {
        const db = fakeDb({ alice: { isApproved: true, displayName: 'A' } });
        await expect(assertApprovedMember(db, 'alice')).resolves.toMatchObject({ displayName: 'A' });
        expect(db.reads).toEqual(['users/alice']);
    });

    it('rejects a pending caller with permission-denied and the friendly message', async () => {
        const db = fakeDb({ pat: { isApproved: false } });
        await expect(assertApprovedMember(db, 'pat')).rejects.toMatchObject({
            code: 'permission-denied', message: PENDING_APPROVAL_MESSAGE,
        });
    });

    it('rejects a caller with no user doc, and a missing uid without reading', async () => {
        const db = fakeDb({});
        await expect(assertApprovedMember(db, 'ghost')).rejects.toMatchObject({ code: 'permission-denied' });
        await expect(assertApprovedMember(db, undefined)).rejects.toMatchObject({ code: 'permission-denied' });
        expect(db.reads).toEqual(['users/ghost']);
    });
});

describe('functions/index.js — every Gemini callable is approval-gated before quota', () => {
    const src = readFileSync('functions/index.js', 'utf8');
    const blocks = src.split(/\nexports\./).slice(1).map((b) => ({ name: b.match(/^\w+/)[0], body: b }));

    it('enforceAiQuota checks approval before consuming quota', () => {
        const fn = src.slice(src.indexOf('async function enforceAiQuota'));
        const gate = fn.indexOf('requireApprovedCaller(uid)');
        const consume = fn.indexOf('checkAndConsumeQuota(');
        expect(gate).toBeGreaterThan(-1);
        expect(consume).toBeGreaterThan(gate);
        expect(src).toMatch(/requireApprovedCaller[\s\S]*assertApprovedMember\(admin\.firestore\(\), uid\)[\s\S]*HttpsError\("permission-denied"/);
    });

    it('covers each callable that reaches Gemini, quota first', () => {
        const ai = blocks.filter((b) => b.body.includes('getAiClient()'));
        expect(ai.map((b) => b.name).sort()).toEqual([
            'analyzeRoundStats', 'analyzeSwingVideo', 'askAiCoach',
            'generateAudioBriefing', 'generatePracticePlan', 'processRulesQuery',
        ]);
        for (const b of ai) {
            const quota = b.body.indexOf('await enforceAiQuota(');
            expect(quota, b.name).toBeGreaterThan(-1);
            expect(b.body.indexOf('getAiClient()'), b.name).toBeGreaterThan(quota);
        }
    });

    it('does not consume quota directly anywhere but enforceAiQuota and the lookup allowance', () => {
        const direct = blocks.filter((b) => b.body.includes('checkAndConsumeQuota(')).map((b) => b.name);
        expect(direct).toEqual(['resolveUserByEmail']);
    });
});

describe('shipping the Storage limits', () => {
    it('the production deploy ships Storage rules', () => {
        const wf = readFileSync('.github/workflows/deploy-production.yml', 'utf8');
        expect(wf).toMatch(/firebase deploy --only firestore:rules,firestore:indexes,storage /);
        expect(wf).toContain('name: Deploy Firestore rules, indexes and Storage rules');
    });

    it('the recorder names an audio content type even when the blob has none', () => {
        const svc = readFileSync('src/services/audioService.js', 'utf8');
        expect(svc).toContain('const contentType = blob.type || `audio/${extension}`;');
        expect(svc).toContain('uploadBytes(storageRef, blob, { contentType })');
    });
});

describe('aiErrorMessage', () => {
    it('shows the awaiting-approval and daily-limit messages as sent', () => {
        expect(aiErrorMessage({ code: 'functions/permission-denied', message: PENDING_APPROVAL_MESSAGE }, 'x'))
            .toBe(PENDING_APPROVAL_MESSAGE);
        expect(aiErrorMessage({ code: 'functions/resource-exhausted', message: 'Daily AI limit reached' }, 'x'))
            .toBe('Daily AI limit reached');
    });

    it('falls back for anything else', () => {
        expect(aiErrorMessage({ code: 'functions/internal', message: 'INTERNAL' }, 'fallback')).toBe('fallback');
        expect(aiErrorMessage(new Error('boom'), 'fallback')).toBe('fallback');
        expect(aiErrorMessage(null, 'fallback')).toBe('fallback');
        expect(aiErrorMessage({ code: 'functions/permission-denied', message: '' }, 'fallback')).toBe('fallback');
    });
});
