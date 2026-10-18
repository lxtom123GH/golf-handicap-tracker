import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const repo = resolve(import.meta.dirname, '../..');
const html = readFileSync(resolve(repo, 'index.html'), 'utf8');

describe('BL-UX-19 information architecture', () => {
    const dom = new JSDOM(html, { url: 'http://localhost/' });
    const document = dom.window.document;
    const handicap = document.getElementById('tab-whs');
    const insights = document.getElementById('tab-insights');

    it('keeps Handicap to identity/record; the Daily-HC calculator is gone (decision 7)', () => {
        expect(handicap.querySelector('#performance-insights-section')).toBeNull();
        expect(handicap.querySelector('#strategy-section')).toBeNull();
        expect(handicap.querySelector('#strategy-banner')).not.toBeNull();
        expect(handicap.querySelector('.dh-calc-details')).toBeNull();
        expect(document.getElementById('btn-calculate-daily')).toBeNull();
        // Its "Index vs Daily Handicap" explainer lives in "New to handicaps?" now.
        const newTo = document.getElementById('explainer-handicaps');
        expect(newTo.textContent).toMatch(/Index vs Daily Handicap/);
        expect(newTo.textContent).toMatch(/stroke allowance for the course/);
        expect(newTo.textContent).toMatch(/tees and round length/);
        expect(newTo.textContent).toMatch(/official lookup/);
        expect(handicap.querySelector('#history-tbody')).not.toBeNull();
        expect(handicap.querySelector('#handicap-chart')).not.toBeNull();
        expect(handicap.querySelector('#index-explainer')).not.toBeNull();
    });

    it('keeps analytics, club tendencies, strategy and practice metrics under Insights', () => {
        expect(insights.querySelector('#strategy-banner')).toBeNull();
        expect(insights.querySelector('#performance-insights-section')).not.toBeNull();
        expect(insights.querySelector('#btn-load-club-insights')).not.toBeNull();
        expect(insights.querySelector('#practice-metrics-section')).not.toBeNull();
        expect(insights.querySelector('#strategy-section')).not.toBeNull();
    });
});
