import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeRoundDoc, normalizePracticeRound } from '../../src/state.js';
import { calculateIndex } from '../../src/whs.js';
import { isValidRound } from '../../src/round-validity.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

describe('BL-4.13 hygiene contract', () => {
    it('keeps static admin markup static and removes dead UI residue', () => {
        const admin = read('src/admin.js');
        const ui = read('src/ui.js');
        const css = read('src/style.css');
        const html = read('index.html');
        const oncourse = read('src/oncourse.js');
        const auth = read('src/auth-v2.js');

        expect(admin).not.toMatch(/tabAdmin\.innerHTML\s*=/);
        expect(css).not.toContain('#oc-progress-bar');
        expect(html).not.toMatch(/\bid=["']oc-simple-stats-container["']/);
        expect(oncourse).not.toContain('oc-simple-stats-container');
        expect(auth).not.toContain('temp-submit-register');

        const uiObject = ui.match(/export const UI = \{([\s\S]*?)\n\};/);
        expect(uiObject).not.toBeNull();
        const uiKeys = [...uiObject[1].matchAll(/^ {4}([A-Za-z0-9_]+):/gm)].map(m => m[1]);
        const duplicateKeys = uiKeys.filter((key, index) => uiKeys.indexOf(key) !== index);
        expect(duplicateKeys).toEqual([]);
    });

    it('serializes E2E journeys that share emulator state', () => {
        const playwright = read('playwright.config.js');
        expect(playwright).toMatch(/workers:\s*1/);
        expect(playwright).toMatch(/retries:\s*1/);
    });

    it('normalizes the schemas consumed by WHS and Practice listeners', async () => {
        expect(normalizeRoundDoc({
            uid: 'player-1', course: 'Keperra', rating: 70.5, slope: 124,
            adjustedGross: 84, holesPlayed: 9
        })).toMatchObject({
            uid: 'player-1', course: 'Keperra', rating: 70.5, slope: 124,
            adjustedGross: 84, holesPlayed: 9
        });
        expect(normalizeRoundDoc({ course: 'Broken', rating: '70', slope: 0 }))
            .toMatchObject({ rating: null, slope: 0, adjustedGross: null });

        const importedNine = normalizeRoundDoc({
            id: 'legacy-nine', rating: 72, slope: 113, adjustedGross: 84, holes: 9
        });
        expect(importedNine.holesPlayed).toBeNull();
        expect(importedNine).not.toHaveProperty('stats');
        const importedLegacyIndex = calculateIndex([
            importedNine,
            { id: 'good-3', rating: 72, slope: 113, adjustedGross: 80 },
            { id: 'good-4', rating: 72, slope: 113, adjustedGross: 81 }
        ], null, 10);
        const explicitEighteenIndex = calculateIndex([
            { ...importedNine, id: 'legacy-eighteen', holesPlayed: 18 },
            { id: 'good-3', rating: 72, slope: 113, adjustedGross: 80 },
            { id: 'good-4', rating: 72, slope: 113, adjustedGross: 81 }
        ], null, 10);
        expect(importedLegacyIndex).toEqual(explicitEighteenIndex);

        const legacyScore = normalizeRoundDoc({
            id: 'legacy-score', rating: 72, slope: 113, score: 82, holes: 9
        });
        expect(legacyScore.adjustedGross).toBeNull();
        expect(calculateIndex([
            legacyScore,
            { id: 'good-1', rating: 72, slope: 113, adjustedGross: 80 },
            { id: 'good-2', rating: 72, slope: 113, adjustedGross: 81 }
        ]).index).toBeNull();

        for (const rating of [0, -1]) {
            const round = normalizeRoundDoc({ rating, slope: 113, adjustedGross: 80 });
            expect(round.rating).toBe(rating);
            expect(isValidRound(round)).toBe(true);
        }

        const practice = read('src/practice.js');
        expect(practice).toMatch(/list\.push\(\s*normalizePracticeRound\(\{\s*id:\s*docSnap\.id,\s*\.\.\.docSnap\.data\(\)\s*\}\)\s*\)/);
        expect(normalizePracticeRound({ uid: 'player-1', drillId: 'putting_9', score: '8' }))
            .toMatchObject({ uid: 'player-1', drillId: 'putting_9', score: null });
    });
});
