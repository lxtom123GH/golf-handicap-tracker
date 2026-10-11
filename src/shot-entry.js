// ==========================================================================
// shot-entry.js — S12 Part E: how the golfer logs each shot (pure).
// ==========================================================================
//
// 'both' (default)  — the map and the button grids, exactly as shipped.
// 'draw'            — the map stays; the intent/result button grids collapse
//                     into Details disclosures (still there, closed).
// 'buttons'         — the button grids stay; #section-line and the draw
//                     button hide.
// 'map'             — owner 2026-10-04 ("the map isn't full screen"): every
//                     new shot opens on the full-screen map (draw mode) with
//                     the club row + Log docked under it; Done shows the rest
//                     of the wizard. Grids stay open behind it, as in 'both'.
//
// Pure only: the visibility decision is a function of the preference
// (S12 E unit gate). AppState/storage wiring lives in event-binders.js.

export const SHOT_ENTRY_PREFS = ['draw', 'buttons', 'both', 'map'];

export function normaliseShotEntry(pref) {
    return SHOT_ENTRY_PREFS.includes(pref) ? pref : 'both';
}

export function shotEntryVisibility(pref) {
    const p = normaliseShotEntry(pref);
    return {
        pref: p,
        lineSection: p !== 'buttons',
        drawButton: p !== 'buttons',
        resultGridsOpen: p !== 'draw',
        mapFirst: p === 'map',
    };
}
