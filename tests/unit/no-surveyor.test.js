// Decision 14 (simplify 2026-10-07): Surveyor mode is deleted - code, the
// ⋯ sheet button, its markup and wiring. The hole mapper (Settings) is the
// course tool. Old rounds carry no Surveyor data that anything must read:
// its pins were memory-only, and a stale pin no longer moves a green
// (gps-green-targets.test.js).
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const HTML = readFileSync('index.html', 'utf8');
const srcFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap(d =>
    d.isDirectory() ? srcFiles(`${dir}/${d.name}`) : d.name.endsWith('.js') ? [`${dir}/${d.name}`] : []);

describe('Surveyor mode is gone (decision 14)', () => {
    it('no module, no markup, no ⋯ sheet button', () => {
        expect(existsSync('src/surveyor.js')).toBe(false);
        for (const id of ['btn-toggle-surveyor', 'surveyor-container', 'btn-pin-front', 'btn-pin-back', 'btn-pin-override']) {
            expect(HTML, id).not.toContain(`id="${id}"`);
        }
        const doc = new DOMParser().parseFromString(HTML, 'text/html');
        expect(doc.querySelector('#oc-more-sheet')?.textContent || '').not.toMatch(/Survey/);
    });

    it('no source file still reaches for it', () => {
        for (const f of srcFiles('src')) {
            const t = readFileSync(f, 'utf8');
            expect(t, f).not.toMatch(/surveyor|surveyData|capturePin/);
        }
    });
});
