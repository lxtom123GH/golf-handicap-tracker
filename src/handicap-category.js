// Setup-only choices. Weak keys prevent carrying a category into another round,
// account or serialized score/backup. Never infer it from names or tee colours.
const choices = new WeakMap();
export function playerHandicapCategory(player) { return choices.get(player) || null; }
export function setPlayerHandicapCategory(player, value) {
    if (!player || typeof player !== 'object') return;
    if (value === 'men' || value === 'women') choices.set(player, value);
    else choices.delete(player);
}

/** A labelled rating category can contradict an explicit choice. Reject that
 * mismatch; an unlabelled/custom rating remains the user's supplied input. */
export function categoryForRating(category, teeName = '') {
    if (category !== 'men' && category !== 'women') return null;
    const label = String(teeName).toLowerCase();
    if (/\bwomen\b/.test(label)) return category === 'women' ? category : null;
    if (/\bmen\b/.test(label)) return category === 'men' ? category : null;
    return category;
}
