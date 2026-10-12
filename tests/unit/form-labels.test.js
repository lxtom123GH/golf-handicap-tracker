import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const doc = new JSDOM(html).window.document;
const controls = [...doc.querySelectorAll('input:not([type="hidden"]), select, textarea')];

function labelText(control) {
    const aria = control.getAttribute('aria-labelledby');
    if (aria) return aria.split(/\s+/).map(id => control.ownerDocument.getElementById(id)?.textContent || '').join(' ').trim();
    return control.getAttribute('aria-label')?.trim()
        || [...(control.labels || [])].map(label => label.textContent.trim()).join(' ').trim();
}

describe('static form label associations (not a runtime axe substitute)', () => {
    it('checks a non-empty inventory of every static form control', () => {
        expect(controls.length).toBeGreaterThanOrEqual(105);
        expect(controls.filter(control => !labelText(control)).map(control => control.id)).toEqual([]);
    }, 15_000);

    it('uses valid, non-empty references for explicit labels', () => {
        const labels = [...doc.querySelectorAll('label[for]')];
        expect(labels.length).toBeGreaterThan(0);
        for (const label of labels) {
            expect(doc.getElementById(label.htmlFor), label.htmlFor).not.toBeNull();
            expect(label.textContent.trim(), label.htmlFor).not.toBe('');
        }
        for (const control of controls.filter(c => c.hasAttribute('aria-labelledby'))) {
            for (const id of control.getAttribute('aria-labelledby').split(/\s+/)) {
                expect(doc.getElementById(id)?.textContent.trim(), id).toBeTruthy();
            }
        }
    });

    it('does not mistake a placeholder or nearby unassociated text for a label', () => {
        const negative = new JSDOM('<label>Course</label><input placeholder="Course">').window.document;
        expect(labelText(negative.querySelector('input'))).toBe('');
    });

    it('associates visible round setup labels with their exact controls', () => {
        for (const id of ['oc-round-date', 'oc-course-select', 'oc-custom-course-name', 'oc-tee-select', 'oc-finish-holes']) {
            expect(doc.getElementById(id).labels.length, id).toBeGreaterThan(0);
        }
    });
});
