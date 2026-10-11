// Simplify 2026-10-07 E39: one AI practice plan. The player "✨ Ask AI Coach"
// button is gone; the Practice Caddy's Generate is the only one.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const repo = resolve(import.meta.dirname, '../..');
const read = (p) => readFileSync(resolve(repo, p), 'utf8');

describe('Practice has one AI plan button', () => {
    it('no Ask AI Coach button on Practice; the Caddy Generate stays', () => {
        const doc = new JSDOM(read('index.html')).window.document;
        expect(doc.getElementById('btn-ask-ai')).toBeNull();
        expect(doc.getElementById('tab-practice').textContent).not.toMatch(/Ask\s+AI\s+Coach/);
        expect(doc.getElementById('btn-generate-practice')).not.toBeNull();
    });

    it('no code still looks for it', () => {
        for (const f of ['src/practice.js', 'src/ai.js', 'src/ui.js']) {
            expect(read(f), f).not.toMatch(/btn-ask-ai/);
        }
        expect(read('src/practice.js')).not.toMatch(/from '\.\/ai\.js'/);
    });
});
