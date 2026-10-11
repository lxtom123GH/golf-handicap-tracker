// @vitest-environment jsdom
// C27 (simplify 2026-10-07): in Play mode, GPS off shows ONE chip (📡 GPS).
// The 🔢 big-numbers opener did the same first thing (it starts GPS), so it
// never shows in Play mode; once GPS runs the pill opens big numbers.
// Drives the shipped index.html + style.css through jsdom's cascade.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const HTML = readFileSync('index.html', 'utf8');
const CSS = readFileSync('src/style.css', 'utf8');
const shown = id => getComputedStyle(document.getElementById(id)).display !== 'none';

beforeEach(() => {
    const doc = new DOMParser().parseFromString(HTML, 'text/html');
    document.head.innerHTML = `<style>${CSS}</style>`;
    document.body.innerHTML = doc.getElementById('oncourse-hub').outerHTML;
    document.body.className = 'play-mode round-active';
});

describe('Play mode: one GPS chip', () => {
    it('GPS off: 📡 GPS shows, the 🔢 opener does not', () => {
        expect(document.getElementById('oc-gps-widget').classList.contains('hidden')).toBe(true);
        expect(shown('btn-play-gps')).toBe(true);
        expect(shown('btn-big-numbers')).toBe(false);
    });

    it('GPS on: the pill replaces 📡, still no 🔢', () => {
        document.getElementById('oc-gps-widget').classList.remove('hidden');
        expect(shown('btn-play-gps')).toBe(false);
        expect(shown('btn-big-numbers')).toBe(false);
    });

    it('outside Play mode the text opener still covers GPS-off', () => {
        document.body.className = 'round-active';
        expect(shown('btn-big-numbers')).toBe(true);
    });
});
