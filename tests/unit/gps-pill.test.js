// @vitest-environment jsdom
// ==========================================
// gps-pill.test.js — glass chips PR 4: the hub GPS widget is a small pill
// ==========================================
// Reads the shipped index.html/style.css as text (like contracts.test.js) and
// drives the real big-numbers controller over the real markup.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { AppState } from '../../src/state.js';
import { createBigNumbersView } from '../../src/big-numbers.js';

const HTML = readFileSync('index.html', 'utf8');
const CSS = readFileSync('src/style.css', 'utf8');
const parsed = () => new DOMParser().parseFromString(HTML, 'text/html');

describe('glass chips PR 4: GPS pill', () => {
    it('the widget is one pill with centre, F and B — no inline layout styles', () => {
        const doc = parsed();
        const pill = doc.getElementById('oc-gps-widget');
        expect(pill.classList.contains('gps-pill')).toBe(true);
        expect(pill.classList.contains('hidden')).toBe(true); // GPS off at load
        expect(pill.getAttribute('style')).toBeNull();
        for (const id of ['gps-middle', 'gps-front', 'gps-back', 'gps-distance-mode']) {
            expect(pill.contains(doc.getElementById(id)), id).toBe(true);
        }
        expect(pill.textContent.replace(/\s+/g, ' ')).toMatch(/-- · F -- · B --/);
        // Still the keyboard-reachable opener of the big view.
        expect(pill.getAttribute('role')).toBe('button');
        expect(pill.getAttribute('aria-controls')).toBe('big-numbers-view');
    });

    it('weather / plays-like and the strategy hint moved into the big view, ids unchanged', () => {
        const doc = parsed();
        const big = doc.getElementById('big-numbers-view');
        const pill = doc.getElementById('oc-gps-widget');
        for (const id of ['gps-plays-like', 'gps-weather-summary', 'gps-plays-like-value', 'gps-strategy-hint']) {
            const el = doc.getElementById(id);
            expect(el, id).not.toBeNull();
            expect(big.contains(el), `${id} inside the big view`).toBe(true);
            expect(pill.contains(el), `${id} not in the pill`).toBe(false);
        }
        expect(doc.getElementById('gps-plays-like').classList.contains('hidden')).toBe(true);
        expect(doc.getElementById('gps-strategy-hint').classList.contains('hidden')).toBe(true);
    });

    it('the text button covers GPS-off and gives way to the pill (sibling rule, no JS)', () => {
        const doc = parsed();
        expect(doc.getElementById('oc-gps-widget').nextElementSibling.id).toBe('btn-big-numbers');
        expect(CSS).toMatch(/\.gps-pill:not\(\.hidden\)\s*\+\s*\.big-numbers-button\s*\{\s*display:\s*none;\s*\}/);
    });

    describe('with the real big-numbers controller', () => {
        let view;
        beforeEach(() => {
            const doc = parsed();
            document.body.innerHTML = doc.getElementById('oncourse-hub').outerHTML
                + doc.getElementById('big-numbers-view').outerHTML;
            AppState.bigNumbersOpen = false;
            AppState.currentHole = 1;
            AppState.currentCoursePars = [4];
            view = createBigNumbersView();
        });
        afterEach(() => { AppState.bigNumbersOpen = false; view.destroy(); });

        it('tapping the pill opens the big view, which shows the moved weather line', () => {
            document.getElementById('oc-gps-widget').click();
            expect(AppState.bigNumbersOpen).toBe(true);
            const big = document.getElementById('big-numbers-view');
            expect(big.classList.contains('hidden')).toBe(false);
            const row = document.getElementById('gps-plays-like');
            row.classList.remove('hidden'); // what oncourse.js updatePlaysLike does
            expect(big.contains(row)).toBe(true);
        });

        it('a tap on the moved weather line closes the view like any other tap', () => {
            document.getElementById('oc-gps-widget').click();
            document.getElementById('gps-plays-like').click();
            expect(AppState.bigNumbersOpen).toBe(false);
        });
    });
});
