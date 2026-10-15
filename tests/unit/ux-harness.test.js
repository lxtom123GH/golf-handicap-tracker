// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { uxHarnessCommand } from '../../scripts/dev-ux-emulators.mjs';
import { UX_PERSONAS, syntheticRounds } from '../e2e/helpers/ux-fixtures.js';

describe('one-command synthetic UX harness', () => {
    it('uses the existing private-port guarded runner and one selected spec', () => {
        const c = uxHarnessCommand();
        expect(c.args).toEqual(['scripts/run-e2e-isolated.mjs',
            'tests/e2e/local-ux-harness.spec.js', '--project=phone', '--headed']);
        expect(c.hold).toBe('1');
        expect(JSON.parse(readFileSync('package.json', 'utf8')).scripts['dev:emu'])
            .toBe('node scripts/dev-ux-emulators.mjs');
    });
    it('headless check exits, and the small phone is explicit', () => {
        const c = uxHarnessCommand(['--check', '--iphone-se']);
        expect(c.hold).toBe('0');
        expect(c.args).toContain('--project=iphone-se');
        expect(c.args).not.toContain('--headed');
    });
    it.each(['--project=production', '--config=other.js', '--port=80'])('refuses unexpected flags: %s', arg => {
        expect(() => uxHarnessCommand([arg])).toThrow();
    });
    it('covers five synthetic personas with one pending, coach and admin', () => {
        expect(UX_PERSONAS).toHaveLength(5);
        expect(UX_PERSONAS.every(p => p.name.startsWith('Test '))).toBe(true);
        expect(UX_PERSONAS.filter(p => p.approved === false)).toHaveLength(1);
        expect(UX_PERSONAS.filter(p => p.coach)).toHaveLength(1);
        expect(UX_PERSONAS.filter(p => p.admin)).toHaveLength(1);
    });
    it('creates 26 deterministic private rounds with varied 9/18-hole scores', () => {
        const rows = syntheticRounds('test-fixture-uid');
        expect(rows).toHaveLength(26);
        expect(rows.filter(r => r.holesPlayed === 9)).toHaveLength(9);
        expect(rows.filter(r => r.holesPlayed === 18)).toHaveLength(17);
        expect(rows.every(r => r.uid === 'test-fixture-uid' && r.visibility === 'private')).toBe(true);
        expect(rows.every(r => r.date instanceof Date && Number.isFinite(r.adjustedGross))).toBe(true);
        expect(new Set(rows.map(r => r.adjustedGross)).size).toBeGreaterThan(5);
        expect(rows).toEqual(syntheticRounds('test-fixture-uid'));
        expect(() => syntheticRounds('')).toThrow();
    });
});
