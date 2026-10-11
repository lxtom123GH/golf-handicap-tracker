import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

// Simplify 2026-10-07 E33: Settings must not tell golfers false things.
const repo = resolve(import.meta.dirname, '../..');
const html = readFileSync(resolve(repo, 'index.html'), 'utf8');
const stateSrc = readFileSync(resolve(repo, 'src/state.js'), 'utf8');
const document = new JSDOM(html).window.document;

describe('Settings copy matches what the app does', () => {
    it('GPS assist says on by default, as state.js makes it', () => {
        // state.js: assist is on unless the golfer switched it off.
        expect(stateSrc).toMatch(/gpsAssist = localStorage\.getItem\('golf\.gpsAssist'\) !== 'off'/);
        const text = document.getElementById('gps-assist-card').textContent.replace(/\s+/g, ' ');
        expect(text).toMatch(/On by default\./);
        expect(text).not.toMatch(/Off by default/);
        expect(html).not.toMatch(/GPS assist — default OFF/);
    });

    it('the Putts explainer points at the Insights tab', () => {
        const text = document.getElementById('explainer-stats').textContent.replace(/\s+/g, ' ');
        expect(text).toMatch(/on your Insights tab/);
        expect(text).not.toMatch(/Handicap tab/);
    });
});
