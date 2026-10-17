// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
    appendImageryNotice, usesQldImagery, QLD_IMAGERY_NOTICE, QLD_IMAGERY_LICENCE_URL,
} from '../../src/imagery-notice.js';

const course = (slug) => JSON.parse(fs.readFileSync(`public/courses/${slug}.json`, 'utf8'));

describe('Queensland imagery notices', () => {
    it('adds licence link, source link and the required no-warranty acknowledgement', () => {
        const el = document.createElement('p');
        el.textContent = 'Map data x ';
        const details = appendImageryNotice(el, ['© OpenStreetMap contributors', 'Includes material © State of Queensland (...)']);
        expect(details).not.toBeNull();
        expect(details.className).toBe('imagery-notice');
        expect(el.textContent).toContain('CC BY-SA 4.0');
        expect(el.textContent).toContain(QLD_IMAGERY_NOTICE);
        expect(QLD_IMAGERY_NOTICE).toMatch(/^In consideration of the State of Queensland permitting use of this data/);
        expect(QLD_IMAGERY_NOTICE).toMatch(/relating to any use of the data\.$/);
        const hrefs = [...el.querySelectorAll('a')].map(a => a.href);
        expect(hrefs).toContain(QLD_IMAGERY_LICENCE_URL);
        expect(hrefs.some(h => h.includes('data.qld.gov.au'))).toBe(true);
    });

    it('does nothing for OSM-only courses', () => {
        const el = document.createElement('p');
        expect(appendImageryNotice(el, ['© OpenStreetMap contributors'])).toBeNull();
        expect(el.childNodes.length).toBe(0);
        expect(usesQldImagery(undefined)).toBe(false);
    });

    it.each(['ashgrove', 'keperra'])('%s carries the service Copyright Text and every hole has imagery', (slug) => {
        const c = course(slug);
        expect(usesQldImagery(c.attributions)).toBe(true);
        const qld = c.attributions.find(a => /State of Queensland/.test(a));
        expect(qld).toContain('Includes material © State of Queensland (Department of Natural Resources and Mines, Manufacturing and Regional and Rural Development)');
        expect(qld).toContain('© Planet Labs Netherlands B.V. reproduced under licence from Planet and Geoplex, all rights reserved');
        if (slug === 'ashgrove') {
            const holes = Object.values(c.holes);
            expect(holes).toHaveLength(18);
            for (const h of holes) {
                expect(h.imagery.url).toBe(`/courses/imagery/ashgrove-${h.number}.jpg`);
                expect(fs.existsSync(`public${h.imagery.url}`)).toBe(true);
            }
            expect(fs.existsSync(`public${c.contextImagery.url}`)).toBe(true);
        }
    });
});
