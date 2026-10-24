import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { coldStartPreview } from '../../src/cold-start.js';
import { countCountingRounds } from '../../src/round-validity.js';

const round = (over = {}) => ({
    slope: 113,
    adjustedGross: 90,
    rating: 72,
    notCounting: false,
    ...over
});

describe('cold-start preview', () => {
    it('counts only valid counting rounds toward the unlock', () => {
        expect(countCountingRounds([
            round(),
            round({ notCounting: true }),
            round({ adjustedGross: null }),
            round()
        ])).toBe(2);
    });

    it('does not count malformed numeric strings as index rounds', () => {
        const imported = [round({ slope: '113', adjustedGross: '90', rating: '72' }),
            round({ slope: '113', adjustedGross: '91', rating: '72' }),
            round({ slope: '113', adjustedGross: '92', rating: '72' })];

        expect(countCountingRounds(imported)).toBe(0);
    });

    it('uses the performance gate count when stats are absent', () => {
        const noStats = [round({ stats: null }), round({ stats: null }), round({ stats: null })];

        expect(coldStartPreview(noStats, 'performance')).toContain('0 of 3 rounds with putts logged');
    });

    it('names the performance requirement when more rounds exist without stats', () => {
        const noStats = Array.from({ length: 5 }, () => round({ stats: null }));
        const html = coldStartPreview(noStats, 'performance');

        expect(html).toContain('0 of 3 rounds with putts logged');
        expect(html).not.toContain('0 of 3 rounds logged');
    });

    it('labels index holes and completed-score trend progress', () => {
        const rounds = [round(), round({ notCounting: true })];

        // The index needs 54 holes (WHS), not three rounds: one 18 is 18 of 54.
        expect(coldStartPreview(rounds, 'index')).toContain('18 of 54 counting holes');
        expect(coldStartPreview(rounds, 'trend')).toContain('1 of 3 completed 18-hole scores');
    });

    it('leaves a neutral placeholder in static HTML until JavaScript has data', () => {
        const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

        expect(html).not.toContain('Log 0 of 3 rounds');
    });

    it('shows feature-specific progress without pretending to show an example', () => {
        const html = coldStartPreview([round({ stats: { putts: 34 } })], 'performance');

        expect(html).toContain('1 of 3 rounds with putts logged');
        expect(html).toContain('What this unlocks');
        expect(html).not.toMatch(/example only|no sample data is added/i);
        expect(html).toContain('putts, greens in regulation and fairways');
    });
});
