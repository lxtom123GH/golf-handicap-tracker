// @vitest-environment jsdom
// Track A item 8 (simplify review 07 Oct 2026): the hole mapper's handle had
// no destroy(). The ✕ threw, the next open never mounted, and the card's
// buttons kept every earlier mount's listeners.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { mountHoleMapper } from '../../src/hole-mapper.js';

const HOLE = {
    tee: { lat: -27.4112264, lon: 152.9524138 },
    green: { centre: { lat: -27.40899, lon: 152.949281 } },
};

beforeAll(() => {
    // jsdom has no 2D canvas; a do-nothing context is enough for the mount.
    const ctx = new Proxy({}, {
        get: (t, k) => (k in t ? t[k] : () => ({ data: [0, 0, 0, 0] })),
        set: (t, k, v) => { t[k] = v; return true; },
    });
    HTMLCanvasElement.prototype.getContext = function () { return ctx; };
});

beforeEach(() => {
    document.body.innerHTML = `
        <div id="hole-mapper">
            <span id="mapper-hole-label"></span><div id="mapper-pills"></div>
            <canvas id="mapper-canvas" width="300" height="400"></canvas>
            <div id="mapper-status"></div><div id="mapper-attribution"></div>
            <button id="btn-mapper-exit"></button><button id="btn-mapper-undo"></button>
            <button id="btn-mapper-close-ring"></button><button id="btn-mapper-save" disabled></button>
        </div>`;
});

const mount = () => mountHoleMapper({
    canvas: document.getElementById('mapper-canvas'), hole: HOLE, slug: 'keperra', holeNumber: 10,
});
const pill = (kind) => document.querySelector(`.mapper-pill[data-kind="${kind}"]`);

describe('hole mapper destroy()', () => {
    it('the handle has a destroy that hides the card and is safe to call twice', () => {
        const a = mount();
        expect(typeof a.destroy).toBe('function');
        a.destroy();
        a.destroy();
        expect(document.getElementById('hole-mapper').classList.contains('hidden')).toBe(true);
        expect(document.getElementById('hole-mapper')._mapper).toBe(null);
    });

    it('a second mount after destroy owns the buttons alone (no stacked listeners)', () => {
        const a = mount();
        a.destroy();
        const b = mount();
        expect(document.getElementById('hole-mapper')._mapper).toBe(b);

        // The card's own buttons: only B reacts.
        pill('water').click();
        expect(b.model.activeKind).toBe('water');
        expect(a.model.activeKind).toBe('green');

        // Canvas pointer listeners of A are gone too: a tap adds to B only.
        const canvas = document.getElementById('mapper-canvas');
        for (const type of ['pointerdown', 'pointerup']) {
            canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: 100, clientY: 200 }));
        }
        expect(b.model.drafts.water?.vertices?.length).toBe(1); // the tap reached B
        expect(a.model.drafts).toEqual({});
    });

    it('a second mount without a close (double tap on Open) replaces the first', () => {
        const a = mount();
        const b = mount();
        expect(document.getElementById('hole-mapper')._mapper).toBe(b);
        expect(document.getElementById('hole-mapper').classList.contains('hidden')).toBe(false);
        // The shared canvas and buttons: one tap is one vertex, on B only.
        const canvas = document.getElementById('mapper-canvas');
        for (const type of ['pointerdown', 'pointerup']) {
            canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: 100, clientY: 200 }));
        }
        expect(b.model.drafts.green?.vertices?.length).toBe(1);
        expect(a.model.drafts).toEqual({}); // the first mount no longer listens
        document.getElementById('btn-mapper-undo').click();
        expect(b.model.drafts.green).toBeUndefined();
    });

    it('the ✕ button destroys the mount it belongs to', () => {
        const a = mount();
        document.getElementById('btn-mapper-exit').click();
        expect(document.getElementById('hole-mapper').classList.contains('hidden')).toBe(true);
        pill('water').click(); // a destroyed mount no longer reacts
        expect(a.model.activeKind).toBe('green');
    });
});
