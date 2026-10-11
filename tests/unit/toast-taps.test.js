// @vitest-environment jsdom
// Quick win 2 (simplify review 07 Oct 2026): toasts let taps through.
// Every "Shot N logged" toast (and the round-start wake toast) used to sit
// over the Log/club/Undo area for 2.5 s and swallow taps meant for it.
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: { currentUser: { uid: 'u1' } }, functions: {} }));
vi.mock('firebase/firestore', () => ({
    collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(), onSnapshot: vi.fn(),
    serverTimestamp: vi.fn(), doc: vi.fn(() => ({ id: 'x' })), getDoc: vi.fn(() => new Promise(() => { })),
    getDocs: vi.fn(async () => ({ forEach: () => { }, size: 0 })), addDoc: vi.fn(), setDoc: vi.fn(),
    updateDoc: vi.fn(), deleteDoc: vi.fn(), writeBatch: vi.fn(), increment: vi.fn(), arrayUnion: vi.fn(), arrayRemove: vi.fn(),
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('chart.js/auto', () => ({ default: vi.fn() }));

const CSS = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf8');

/** The toast block of the shipped style.css, applied to the jsdom page. */
function applyToastCss() {
    const start = CSS.indexOf('/* Toasts never take a tap');
    expect(start).toBeGreaterThan(-1);
    const end = CSS.indexOf('.update-toast {', start);
    const style = document.createElement('style');
    style.textContent = CSS.slice(start, end);
    document.head.appendChild(style);
}

const pe = (el) => getComputedStyle(el).pointerEvents;

let showToast, showBriefingToast;

describe('toasts never swallow a tap', () => {
    // Cold imports of the real modules can take several seconds under load.
    beforeAll(async () => {
        applyToastCss();
        ({ showToast } = await import('../../src/modules/score-input.js'));
        ({ showBriefingToast } = await import('../../src/ui.js'));
    }, 60_000);
    afterEach(() => { document.body.innerHTML = ''; });

    it('showToast ("Shot N logged", the wake toast) passes taps through', () => {
        showToast('Shot 1 logged');
        const toast = document.querySelector('[role="status"]');
        expect(toast.textContent).toBe('Shot 1 logged');
        expect(toast.classList.contains('app-toast')).toBe(true);
        expect(toast.style.pointerEvents).toBe(''); // no inline override
        expect(pe(toast)).toBe('none');
    });

    it('showBriefingToast passes taps through', () => {
        showBriefingToast('saved');
        const toast = [...document.body.children].find(e => e.textContent === 'saved');
        expect(toast.classList.contains('app-toast')).toBe(true);
        expect(pe(toast)).toBe('none');
    });

    it('the update and round-saved toasts pass taps through', () => {
        document.body.innerHTML = '<div id="u" class="update-toast" role="status"></div>'
            + '<div id="r" class="round-save-toast" role="status"></div>';
        expect(pe(document.getElementById('u'))).toBe('none');
        expect(pe(document.getElementById('r'))).toBe('none');
    });

    it('a button inside a toast still takes taps', () => {
        document.body.innerHTML = '<div class="app-toast"><button id="b">Undo</button></div>';
        expect(pe(document.getElementById('b'))).toBe('auto');
    });

    it('the shipped toast markup keeps its classes', () => {
        const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
        expect(html).toMatch(/id="update-toast" class="update-toast/);
        expect(html).toMatch(/id="round-save-toast" class="round-save-toast/);
    });
});
