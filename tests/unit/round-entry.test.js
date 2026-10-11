import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const HTML = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const CSS = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf8');

describe('BL-UX-18 round-entry affordance', () => {
    it('keeps the past-round trigger outside the active-round setup container', () => {
        const document = new JSDOM(HTML, { url: 'http://localhost/' }).window.document;
        const button = document.getElementById('btn-oc-log-past-round');

        expect(button).not.toBeNull();
        expect(button.closest('#oncourse-setup')).toBeNull();
        expect(button.textContent).toMatch(/to my record/i);
    });

    it('stacks the round-save status above the update status instead of overlapping it', () => {
        const document = new JSDOM(HTML, { url: 'http://localhost/' }).window.document;
        const toast = document.getElementById('round-save-toast');

        expect(toast).not.toBeNull();
        expect(toast.classList.contains('update-toast')).toBe(false);
        expect(CSS).toMatch(/\.round-save-toast\s*\{[^}]*bottom:\s*104px;/s);
    });
});
