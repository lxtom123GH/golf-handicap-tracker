// ==========================================================================
// club-order.test.js — S12 A3: the Club row's order per shot (pure)
// ==========================================================================

import { describe, it, expect } from 'vitest';
import { orderClubsFor } from '../../src/modules/card-render.js';

// The default bag (card-render's fallback) — labels only, authored long→short.
const BAG = {
    driver: true,
    woods: ['3 Wood'],
    irons: ['Long Irons', 'Mid Irons', 'Short Iron'],
    wedges: ['56'],
    putter: true
};

describe('S12 A3: orderClubsFor orders the row by likelihood', () => {
    it('tee shot: driver, woods, irons, wedges, putter (and any par-4/5 opener)', () => {
        const keys = (d, n, par) => orderClubsFor(BAG, d, n, par).map(c => c.key);
        expect(keys(250, 1, 4)).toEqual(['driver', 'woods', 'irons', 'wedges', 'putter']);
        expect(keys(250, 1, 5)).toEqual(keys(250, 1, 4));
        // Shot 1 on a par 4/5 is the tee order even with a short measured d.
        expect(keys(150, 1, 4)).toEqual(['driver', 'woods', 'irons', 'wedges', 'putter']);
    });

    it('approach (100 < d ≤ 220): irons lead, nearest the distance outward', () => {
        const cats = orderClubsFor(BAG, 150, 2, 4);
        expect(cats[0].key).toBe('irons');
        // Ladder: Long 200, Mid 165, Short 130 → at 150 m: Mid (15), Short (20), Long (50).
        expect(cats[0].items).toEqual(['Mid Irons', 'Short Iron', 'Long Irons']);
        expect(cats.map(c => c.key)).toEqual(['irons', 'driver', 'woods', 'wedges', 'putter']);
    });

    it('short (d ≤ 100): wedges, putter, then irons short-first', () => {
        const cats = orderClubsFor(BAG, 60, 3, 4);
        expect(cats.map(c => c.key)).toEqual(['wedges', 'putter', 'irons', 'woods', 'driver']);
        expect(cats[2].items).toEqual(['Short Iron', 'Mid Irons', 'Long Irons']);
    });

    it('numeric iron labels use the number ladder', () => {
        const bag = { driver: true, woods: [], irons: ['7 Iron', '8 Iron', '9 Iron'], wedges: ['56'], putter: true };
        const cats = orderClubsFor(bag, 140, 2, 4);
        // 7i ≈ 230-84 = 146, 8i ≈ 134, 9i ≈ 122 → at 140 m: 7 (6), 8 (6→ tie keeps order), 9.
        expect(cats[0].items[0]).toBe('7 Iron');
        expect(cats[0].items).toHaveLength(3);
    });

    it('unknown distance: today\'s order, authored irons', () => {
        const cats = orderClubsFor(BAG, null, 2, 4);
        expect(cats.map(c => c.key)).toEqual(['driver', 'woods', 'irons', 'wedges', 'putter']);
        expect(cats[2].items).toEqual(['Long Irons', 'Mid Irons', 'Short Iron']);
    });
});
