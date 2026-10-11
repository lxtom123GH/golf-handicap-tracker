// ==========================================
// play-mode.js — the round on a full-screen map (pure part)
// ==========================================
//
// Owner 2026-10-06: "a play mode where the entire screen is the map and
// anything that I need to press during the round is a glass chip on the
// map". On by default for Simple and Detailed rounds, with a Settings switch
// to turn it off. It needs a course map: a course with no overlay file
// (McLeod, Bulimba, a Custom Course) keeps the normal round screen.
//
// Pure only (unit-tested). src/modules/play-mode.js does the DOM.

export const PLAY_MODE_KEY = 'golf.playMode';

/** 'on' (the default) or 'off'. Anything unknown is the default. */
export function normalisePlayMode(v) {
    return v === 'off' ? 'off' : 'on';
}

/** The stored preference. Never throws (private mode, blocked storage). */
export function readPlayMode(storage) {
    try {
        return normalisePlayMode(storage?.getItem(PLAY_MODE_KEY));
    } catch {
        return 'on';
    }
}

/** Store the preference; never throws. */
export function writePlayMode(storage, v) {
    try { storage?.setItem(PLAY_MODE_KEY, normalisePlayMode(v)); } catch { /* storage full or blocked */ }
}

/**
 * Should the round be shown on the map right now?
 * @param {{pref:string, roundActive:boolean, hasHoleMap:boolean}} s
 */
export function playModeWanted({ pref, roundActive, hasHoleMap }) {
    return normalisePlayMode(pref) === 'on' && roundActive === true && hasHoleMap === true;
}

/** The physical hole number for the round's current hole. */
export function physicalHoleFor(teeData, currentHole) {
    const n = teeData?.physicalHoles?.[currentHole - 1];
    return Number.isFinite(n) ? n : currentHole;
}

/** Label for the pull-up sheet's handle — a round chip on the left rail. */
export function sheetHandleLabel(players, open) {
    if (open) return '✕';
    return players > 1 ? `👥 ${players}` : '📊';
}

// ---- Shot view reach (owner 2026-10-06) --------------------------------
// "Most amateur players aren't going to be hitting further than 230 m ...
// if there's only 100 m to the pin then no point showing 250 m." The shot
// view frames the ball out to this, or to the green when it is closer.
export const REACH_KEY = 'golf.playReach';
export const DEFAULT_REACH_M = 230;

/** Whole metres, 100–300, in 10 m steps; anything else is the default. */
export function normaliseReach(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_REACH_M;
    return Math.min(300, Math.max(100, Math.round(n / 10) * 10));
}
export function readReach(storage) {
    try { return normaliseReach(storage?.getItem(REACH_KEY)); } catch { return DEFAULT_REACH_M; }
}
export function writeReach(storage, v) {
    try { storage?.setItem(REACH_KEY, String(normaliseReach(v))); } catch { /* blocked */ }
}

// ---- Club strip (owner 2026-10-06) --------------------------------------
// "Glass chips in a vertical strip with just three clubs showing, with
// arrows up and down." Longest at the top. Carries are typical amateur
// numbers, shown as a guide (≈) until the app learns the player's own.

/** Rough carry in metres for a club value as stored in My Bag; null = no guide. */
export function estimateCarryM(club) {
    const c = String(club || '').trim();
    if (!c || /putter/i.test(c)) return null;
    if (/driver/i.test(c)) return 210;
    // "3 Wood" / "3W", "4 Hybrid" / "4H", "7 Iron" / "7i" — no letter after.
    const num = (kind) => { const x = c.match(new RegExp('^([0-9]+) *(?:' + kind + ')(?![a-z])', 'i')); return x ? +x[1] : null; };
    let n = num('wood|w');
    if (n !== null) return ({ 2: 200, 3: 190, 4: 180, 5: 175, 7: 165, 9: 155 })[n] ?? Math.max(150, 205 - 5 * n);
    n = num('hybrid|h');
    if (n !== null) return 230 - 15 * n;
    n = num('iron|i');
    if (n !== null) return 230 - 12 * n; // the same estimate the wizard's club order uses
    if (/long *iron/i.test(c)) return 175;
    if (/mid *iron/i.test(c)) return 145;
    if (/short *iron/i.test(c)) return 120;
    if (/^(pw|pitching)/i.test(c)) return 105;
    if (/^(gw|gap|aw|approach)/i.test(c)) return 90;
    if (/^(sw|sand)/i.test(c)) return 75;
    if (/^(lw|lob)/i.test(c)) return 60;
    const loft = c.match(/^([0-9]{2}) *°?$/);
    if (loft && +loft[1] >= 44 && +loft[1] <= 64) return Math.round((215 - 2.5 * +loft[1]) / 5) * 5;
    return null;
}

/** [{label, val}] longest → shortest (by the guide carry); putter last. Stable. */
export function clubLadder(clubs) {
    return (clubs || [])
        .map((c, i) => ({ ...c, carry: estimateCarryM(c.val), i }))
        .sort((a, b) => {
            const ka = a.carry ?? -1, kb = b.carry ?? -1;
            return kb - ka || a.i - b.i;
        })
        .map(({ i, ...c }) => c);
}

/** First index of the 3 visible chips, keeping `sel` in the middle when it can. */
export function stripWindow(n, sel) {
    if (n <= 3) return 0;
    return Math.min(n - 3, Math.max(0, sel - 1));
}

// ---- Stats the player no longer presses (owner 2026-10-06) --------------

/**
 * GIR, worked out: on the green with two putts to spare for par. Needs the
 * putts — a chip-in from off the green (0 putts) is not a GIR. null = unknown
 * (no score yet, or putts not recorded).
 */
export function derivedGir({ par, gross, putts }) {
    const p = Number(par), g = Number(gross), n = Number(putts);
    if (!(p >= 3) || !(g > 0) || !(n >= 1)) return null;
    // Codex P2 (pass 4): putts can't reach the score (at least one stroke
    // gets the ball to the green) - an impossible total proves nothing.
    if (n >= g) return null;
    return g - n <= p - 2;
}

/**
 * Codex P2 (pass 5): the GIR every reader uses - card, review, the saved
 * round's totals, stat analysis. Worked out from score + putts whenever it
 * can be (so a restored round or an indirect edit can't leave a stale value
 * counted); otherwise the stored tap stands. Always a boolean.
 */
export function girOf({ par, gross, putts, stored }) {
    if (!(Number(gross) > 0)) return false; // an unplayed (or cleared) hole has no GIR
    const d = derivedGir({ par, gross, putts });
    return d === null ? !!stored : d;
}

/**
 * Simplify C25: was the fairway hit on this hole? Par 3s have no fairway, so
 * they never count. Reads the live card's `.fwy` and, for rounds saved before
 * the hole editor switched keys, the editor's old `.fir`.
 * @param {{fwy?:boolean, fir?:boolean}|undefined} stats - the hole's simpleStats
 * @param {number} par
 * @returns {boolean}
 */
export function fairwayHit(stats, par) {
    return Number(par) >= 4 && !!(stats && (stats.fwy || stats.fir));
}

/**
 * Detailed rounds: the fairway comes from where the tee shot finished — the
 * lie picked for shot 2 on a par 4/5. undefined = this shot says nothing.
 */
export function fairwayFromLie({ shotNumber, par, lie }) {
    if (Number(shotNumber) !== 2 || !(Number(par) >= 4) || !lie) return undefined;
    return lie === 'Fairway';
}

/** Routine chip: blank → ✓ → ✗ → blank. */
export function nextRoutine(v) {
    return v === 'ok' ? 'no' : (v === 'no' ? undefined : 'ok');
}
export function routineLabel(v) {
    return v === 'ok' ? 'Routine ✓' : (v === 'no' ? 'Routine ✗' : 'Routine');
}

// ---- Where the ball is (shot view anchor) -------------------------------

/**
 * The shot view's start, in hole-frame metres: your live GPS spot, else the
 * last logged shot's finish (measured or drawn), else the tee — the same
 * priority the shot wizard uses.
 */
export function ballStartXY({ fixXY = null, lastShot = null } = {}) {
    if (Array.isArray(fixXY) && fixXY.every(Number.isFinite)) return fixXY;
    const f = lastShot?.finishXY;
    if (f && Number.isFinite(f.x) && Number.isFinite(f.y)) return [f.x, f.y];
    const a = lastShot?.lineActual;
    if (Array.isArray(a) && a.length) {
        const e = a[a.length - 1];
        if (Number.isFinite(e?.x) && Number.isFinite(e?.y)) return [e.x, e.y];
    }
    return [0, 0];
}

/**
 * The hole is fitted between the top chips and the bottom ones; the side
 * rails sit over the map's edges, off the hole's centre line.
 */
export function fitInsetsFor({ topChipsBottom, bottomChipsTop, viewportH }) {
    const top = (topChipsBottom > 0 ? topChipsBottom : 48) + 8;
    const bottom = bottomChipsTop > 0 ? viewportH - bottomChipsTop + 8 : 72;
    return { top, bottom: Math.max(56, bottom) };
}
