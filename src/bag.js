/**
 * @file bag.js
 * @description My Bag in one place (simplify 2026-10-07, E35).
 *
 * The starter bag used to live twice (state.js had '56°', card-render.js had
 * '56'), and because state.js always filled it in, card-render could never
 * tell that the golfer was still on it — so the "set up your real bag" hint
 * never showed. "Has the golfer saved a bag?" is now its own question: is
 * there a golfAppClubs entry on this device.
 */

export const BAG_KEY = 'golfAppClubs';

/** The bag a new golfer starts with until they tick their own in Settings. */
export const STARTER_BAG = Object.freeze({
    driver: true,
    woods: Object.freeze(['3 Wood']),
    irons: Object.freeze(['Long Irons', 'Mid Irons', 'Short Iron']),
    wedges: Object.freeze(['56°']),
    putter: true
});

/** A fresh, mutable copy of the starter bag. */
export function starterBag() {
    return {
        driver: STARTER_BAG.driver,
        woods: [...STARTER_BAG.woods],
        irons: [...STARTER_BAG.irons],
        wedges: [...STARTER_BAG.wedges],
        putter: STARTER_BAG.putter
    };
}

/** True once the golfer has saved a bag on this device. */
export function hasSavedBag() {
    try {
        return !!localStorage.getItem(BAG_KEY);
    } catch (e) {
        return false;
    }
}

/**
 * Build the bag object from the Settings checkboxes (.bag-check).
 * @param {ParentNode} root
 */
export function bagFromChecks(root) {
    const bag = { driver: false, woods: [], irons: [], wedges: [], putter: false };
    root.querySelectorAll('.bag-check').forEach(chk => {
        if (!chk.checked) return;
        const cat = chk.getAttribute('data-cat');
        const val = chk.getAttribute('data-val');
        if (cat === 'driver' || cat === 'putter') bag[cat] = true;
        else if (Array.isArray(bag[cat])) bag[cat].push(val);
    });
    return bag;
}
