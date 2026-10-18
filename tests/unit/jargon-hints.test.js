import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { initTermHints } from '../../src/term-hints.js';

const HTML = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const CSS = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf8');
const TERMS = ['Par', 'GIR', 'Stableford', 'CR', 'SR', 'DECADE', 'Vision54'];
const COPY_SNIPPETS = {
    Par: 'very good golfer',
    GIR: 'green in regulation',
    Stableford: 'Stableford points',
    CR: 'Course Rating',
    SR: 'Slope Rating',
    DECADE: /aggressive off the\s+tee/,
    Vision54: 'Vision54 Think/Play Box'
};

function render() {
    return new JSDOM(HTML).window.document;
}

describe('BL-UX-20 first-encounter jargon hints', () => {
    it('places an accessible native hint beside each requested term', () => {
        const document = render();

        for (const term of TERMS) {
            const hint = document.querySelector(`[data-term-hint="${term}"]`);
            expect(hint, `${term} hint`).not.toBeNull();
            expect(hint.dataset.termExplainer, `${term} source`).toBeTruthy();
            expect(hint.querySelector(':scope > summary')?.textContent.trim(), `${term} icon`).toBe('?');
            expect(hint.querySelector(':scope > summary')?.getAttribute('aria-label'), `${term} label`)
                .toMatch(new RegExp(`Explain ${term}`, 'i'));
            expect(document.getElementById(hint.dataset.termExplainer)?.classList.contains('explainer'))
                .toBe(true);
        }
    });

    it('copies the source explanation for every requested term', () => {
        const document = render();
        initTermHints(document);

        for (const term of TERMS) {
            const hint = document.querySelector(`[data-term-hint="${term}"]`);
            expect(hint.querySelector(':scope > .term-hint-body').textContent, `${term} copy source`)
                .toMatch(COPY_SNIPPETS[term] instanceof RegExp ? COPY_SNIPPETS[term] : new RegExp(COPY_SNIPPETS[term], 'i'));
        }
    });

    it('can initialise hints from an element root', () => {
        const document = render();
        const root = document.getElementById('tab-oncourse');

        initTermHints(root);

        expect(root.querySelector('[data-term-hint="GIR"] .term-hint-body').textContent)
            .toContain(COPY_SNIPPETS.GIR);
    });

    it('keeps hint overlays scrollable, viewport-safe, and outside stacking traps', () => {
        const hintCss = CSS.slice(CSS.indexOf('.term-hint {'), CSS.indexOf('/* Owner feedback', CSS.indexOf('.term-hint {')));

        expect(hintCss).toContain('position: fixed');
        expect(hintCss).toContain('.term-hint:not([open]) .term-hint-body');
        expect(hintCss).toContain('text-transform: none');
        expect(hintCss).toContain('font-size: var(--text-090)');
        expect(CSS).toContain('--text-090: 0.9rem;');
        expect(hintCss).toContain('max-height:');
        expect(hintCss).toContain('overflow-y: auto');
        expect(hintCss).toContain('visibility: hidden');
        expect(hintCss).not.toContain('.term-hint[open] {\n    z-index: 20;');

        const tabCss = CSS.slice(CSS.indexOf('.tab-content {'), CSS.indexOf('body[data-active-tab'));
        expect(tabCss).not.toContain('will-change: opacity, transform');
    });

    it('keeps the course-stat labels stable and the Vision54 hint outside the select label', () => {
        const document = render();

        expect(document.querySelectorAll('#oc-course-stats .oc-stat-label')).toHaveLength(3);
        const strategyLabel = document.querySelector('label[for="strategy-name-select"]');
        const visionHint = document.querySelector('[data-term-hint="Vision54"]');
        expect(strategyLabel?.contains(visionHint)).toBe(false);
        expect(strategyLabel?.control?.id).toBe('strategy-name-select');
    });

    it('dismisses open hints outside the current disclosure and on tab changes', async () => {
        const document = render();
        initTermHints(document);
        const gir = document.querySelector('[data-term-hint="GIR"]');
        const cr = document.querySelector('[data-term-hint="CR"]');
        const source = document.getElementById('explainer-course-ratings');

        const toggle = (details, open = true) => {
            details.open = open;
            details.dispatchEvent(new document.defaultView.Event('toggle'));
        };

        toggle(gir);
        expect(gir.open).toBe(true);
        expect(gir.hasAttribute('data-term-hint-positioned')).toBe(true);
        document.dispatchEvent(new document.defaultView.Event('pointerdown', { bubbles: true }));
        expect(gir.open).toBe(false);

        toggle(gir);
        toggle(cr);
        expect(gir.open).toBe(false);
        expect(cr.open).toBe(true);

        document.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: 'Escape' }));
        expect(cr.open).toBe(false);

        toggle(gir);
        toggle(source);
        expect(gir.open).toBe(false);
        toggle(source, false);

        toggle(gir);
        document.body.setAttribute('data-active-tab', 'tab-insights');
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(gir.open).toBe(false);
    });

    it('repositions an open hint when a nested scrolling container emits scroll', () => {
        const document = render();
        initTermHints(document);
        const hint = document.querySelector('[data-term-hint="GIR"]');
        const summary = hint.querySelector('summary');
        Object.defineProperty(hint.querySelector('.term-hint-body'), 'scrollHeight', { configurable: true, value: 100 });
        summary.getBoundingClientRect = () => ({ left: 40, top: 90, bottom: 135, width: 45, height: 45 });

        hint.open = true;
        hint.dispatchEvent(new document.defaultView.Event('toggle'));
        summary.getBoundingClientRect = () => ({ left: 40, top: 190, bottom: 235, width: 45, height: 45 });
        document.getElementById('tab-oncourse').dispatchEvent(new document.defaultView.Event('scroll'));

        expect(hint.style.getPropertyValue('--term-hint-top')).toBe('243px');
    });
});
