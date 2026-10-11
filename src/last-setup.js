// ==========================================
// last-setup.js — remember how you started your last rounds
// ==========================================
//
// Owner 2026-10-05: "it would be good to make it easier and faster to start a
// new round". The On Course setup screen offers a one-tap Play again card,
// uses your last choices as its defaults, and picks the course you are
// standing at when the phone already knows where you are.
//
// This file is the pure part: storage, validation, wording and the GPS pick.
// No DOM, no AppState, no Firebase (src/modules/quick-start.js wires it up).
//
// Stored per user under `golf.lastSetup.<uid>` (same style as
// `golf.shotEntry`): the most recent setup per course, newest first. Nothing
// secret is kept, and never a daily handicap: that is per day and is worked
// out again from the handicap index every round.

import { distanceM } from './geo.js';

const MAX_SETUPS = 6;
const MAX_PLAYERS = 8;
export const GPS_PICK_RADIUS_M = 1500;

/** localStorage key for a user's remembered setups. */
export function lastSetupKey(uid) {
    return `golf.lastSetup.${uid}`;
}

const str = (v) => (typeof v === 'string' ? v.trim() : '');

/**
 * Clean a stored or about-to-be-stored setup, or null if it is unusable.
 * @returns {{course:string, tee:string, holes:9|18, mode:'simple'|'detailed',
 *   players:Array<{uid:string,name:string,isGuest:boolean}>, selfIncluded:boolean,
 *   savedAt:number}|null}
 */
export function normaliseSetup(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const course = str(raw.course);
    const tee = str(raw.tee);
    // A Custom Course needs its par and ratings typed in; nothing to replay.
    if (!course || !tee || course === 'Custom Course') return null;
    const holes = Number(raw.holes);
    if (holes !== 9 && holes !== 18) return null;
    const mode = raw.mode === 'detailed' ? 'detailed' : 'simple';
    const seen = new Set();
    const players = [];
    for (const p of Array.isArray(raw.players) ? raw.players : []) {
        const uid = str(p?.uid);
        if (!uid || seen.has(uid)) continue;
        seen.add(uid);
        players.push({ uid, name: str(p.name) || 'Player', isGuest: p.isGuest === true });
        if (players.length >= MAX_PLAYERS) break;
    }
    const selfIncluded = raw.selfIncluded !== false;
    if (!selfIncluded && players.length === 0) return null;
    const savedAt = Number.isFinite(raw.savedAt) ? raw.savedAt : 0;
    return { course, tee, holes, mode, players, selfIncluded, savedAt };
}

/** The user's remembered setups, newest first. Never throws. */
export function readSetups(storage, uid) {
    if (!storage || !uid) return [];
    try {
        const raw = JSON.parse(storage.getItem(lastSetupKey(uid)) || 'null');
        const list = Array.isArray(raw?.setups) ? raw.setups : [];
        return list.map(normaliseSetup).filter(Boolean);
    } catch {
        return [];
    }
}

/**
 * Remember a setup as the newest (one entry per course). Never throws: a full
 * or blocked storage must not stop a round starting.
 * @returns {Array} the list as now stored (or as it was, if unusable)
 */
export function recordSetup(storage, uid, setup, now = Date.now()) {
    const s = normaliseSetup({ ...setup, savedAt: now });
    const existing = readSetups(storage, uid);
    if (!s || !storage || !uid) return existing;
    const list = [s, ...existing.filter(x => x.course !== s.course)].slice(0, MAX_SETUPS);
    try {
        storage.setItem(lastSetupKey(uid), JSON.stringify({ v: 1, setups: list }));
    } catch { /* storage full or blocked: the round still starts */ }
    return list;
}

/**
 * Check a remembered setup against what the screen can offer TODAY.
 * @param {Object} setup
 * @param {{courseData:Object, holesForCourse:Function, courseOptions:Iterable<string>,
 *   playerOptions:Map<string,{name?:string,hc?:number}>}} ctx
 * @returns {Object|null} the setup with players resolved, or null to fall back
 *   silently to the normal form.
 */
export function validateSetup(setup, ctx) {
    const s = normaliseSetup(setup);
    if (!s || !ctx) return null;
    const options = new Set(ctx.courseOptions || []);
    if (!options.has(s.course)) return null;
    const teeData = ctx.courseData?.[s.course]?.[s.tee];
    if (!teeData) return null;
    // A tee without a usable rating needs Par/CR/SR typed in: use the form.
    if (ctx.isRatableTee && !ctx.isRatableTee(teeData)) return null;
    const courseHoles = ctx.holesForCourse ? ctx.holesForCourse(s.course) : null;
    const holes = courseHoles === 9 || courseHoles === 18 ? courseHoles : s.holes;
    const pick = ctx.playerOptions instanceof Map ? ctx.playerOptions : new Map();
    const players = [];
    for (const p of s.players) {
        const opt = pick.get(p.uid);
        if (!opt) continue; // no longer pickable (a deleted guest, a friend gone)
        const hc = Number(opt.hc);
        players.push({
            uid: p.uid,
            name: str(opt.name) || p.name,
            isGuest: p.isGuest,
            ...(opt.hc !== undefined && opt.hc !== null && Number.isFinite(hc) ? { hc } : {}),
        });
    }
    if (!s.selfIncluded && players.length === 0) return null;
    return { ...s, holes, players };
}

/** Plain-English lines for the Play again card. */
export function describeSetup(setup, courseLabel) {
    const names = setup.players.map(p => (p.isGuest ? `${p.name} (guest)` : p.name));
    let players;
    if (setup.selfIncluded) players = names.length ? ['You', ...names].join(', ') : 'Just you';
    else players = names.join(', ');
    return {
        title: courseLabel || setup.course,
        details: `${setup.tee} tees · ${setup.holes} holes · ${setup.mode === 'detailed' ? 'Detailed' : 'Simple'}`,
        players,
    };
}

const pt = (p) => (p && Number.isFinite(p.lat) && Number.isFinite(p.lon) ? [p.lat, p.lon] : null);

/** Every tee, green and hole-line point in a course overlay file. */
export function overlayPoints(overlay) {
    const out = [];
    for (const h of Object.values(overlay?.holes || {})) {
        for (const p of [pt(h?.tee), pt(h?.green?.centre), ...(Array.isArray(h?.line) ? h.line.map(pt) : [])]) {
            if (p) out.push(p);
        }
    }
    return out;
}

/** The overlay's tee for a physical hole number, as [lat, lon], or null. */
export function teePoint(overlay, physicalHole) {
    return pt(overlay?.holes?.[physicalHole]?.tee);
}

/**
 * The known course the player is standing at: the nearest one with any hole
 * point within `maxM`. A fix vaguer than that can't tell courses apart.
 * @param {{lat:number, lon:number, accuracyM?:number}} fix
 * @param {Array<{slug:string, points:Array<[number,number]>}>} anchors
 * @returns {{slug:string, distM:number}|null}
 */
export function nearestCourse(fix, anchors, maxM = GPS_PICK_RADIUS_M) {
    if (!fix || !Number.isFinite(fix.lat) || !Number.isFinite(fix.lon)) return null;
    if (Number.isFinite(fix.accuracyM) && fix.accuracyM > maxM) return null;
    let best = null;
    for (const a of anchors || []) {
        for (const p of a.points || []) {
            const d = distanceM([fix.lat, fix.lon], p);
            if (d <= maxM && (!best || d < best.distM)) best = { slug: a.slug, distM: d };
        }
    }
    return best;
}

/**
 * Which course option to pre-select at a club: one at the round length shown
 * if there is one (any length otherwise), nearest first tee first.
 * @param {Array<{value:string, holes:number|null, firstTee:[number,number]|null}>} candidates
 */
export function pickCourseOption(candidates, fix, preferHoles) {
    if (!candidates?.length) return null;
    const atLength = candidates.filter(c => c.holes === preferHoles || c.holes === null);
    const pool = atLength.length ? atLength : candidates;
    const here = fix && Number.isFinite(fix.lat) && Number.isFinite(fix.lon) ? [fix.lat, fix.lon] : null;
    const dist = (c) => (here && c.firstTee ? distanceM(here, c.firstTee) : Infinity);
    let best = pool[0];
    for (const c of pool) if (dist(c) < dist(best)) best = c;
    return best.value;
}

/** The most recent remembered setup at a club (by overlay slug), or null. */
export function pickSetupForSlug(setups, slug, slugFor) {
    if (!slug) return null;
    return (setups || []).find(s => slugFor(s.course) === slug) || null;
}
