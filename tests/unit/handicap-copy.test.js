// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const doc=new JSDOM(readFileSync('index.html','utf8')).window.document;
const text=doc.getElementById('explainer-handicaps').textContent.replace(/\s+/g,' ');
describe('handicap terminology and claim boundaries', () => {
    it('separates nine-hole and eighteen-hole Stableford totals', () => {
        expect(text).toContain('Nine net pars total 18 points; eighteen net pars total 36 points.');
        expect(text).not.toContain('36 means you played to your handicap');
    });
    it('explains AGS without equating it to raw strokes', () => {
        expect(text).toContain('adjusted gross score');
        expect(text).toContain('It may differ from the total strokes you actually took.');
    });
    it('does not promise a bad score can never affect the index', () => {
        expect(text).toContain('A new score can change which older scores count.');
        expect(text).not.toContain("One bad round can't hurt it");
    });
    it('qualifies app records and points competition players to their official record', () => {
        expect(doc.getElementById('oc-past-round-note').textContent).toBe('Saved to your scoring record in this app.');
        expect(doc.body.textContent).not.toMatch(/official WHS (?:record|profile|handicap)/);
        expect(doc.body.textContent).toContain('It does not submit a score to Golf Australia.');
        expect(text).toContain('use your official record for competitions');
    });
});
