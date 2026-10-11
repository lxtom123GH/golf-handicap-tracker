// ==========================================
// dates.js
// The player's calendar day — one source of truth
// ==========================================
//
// PRODUCT SWEEP 2026-09-10 F-7/F-8/F-10: `new Date().toISOString().split('T')[0]`
// was duplicated across five files and used as "today". It is the UTC day, not
// the day the golfer is standing in. At Australia/Brisbane (UTC+10) it reads as
// YESTERDAY from local midnight until 10am — the whole normal morning-golf slot
// — so the round-date picker defaulted to yesterday, capped `max` at yesterday
// so the true date could not be typed, and "End today" on a strategy period
// ended it the day before. West of Greenwich the same expression fails the
// other way, running a day AHEAD in the evening.
//
// functions/quota.js:25 already rolls its daily counter on the local day by
// adding a fixed Brisbane offset before slicing. That is the right idea for a
// server that has no zone of its own; in the browser the zone is simply the
// player's, so the day comes from the local date components.

/**
 * The YYYY-MM-DD calendar day of an instant, in the local zone.
 *
 * @param {Date} [date] - The instant to read; defaults to now.
 * @returns {string|null} The local day as YYYY-MM-DD, or null if not a date.
 */
export function toLocalDateString(date = new Date()) {
    const d = (date instanceof Date) ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return null;
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * Today, as the player's calendar tells it. This is what belongs in an
 * `<input type="date">` value, in its `max`, and in any "is it still today?"
 * comparison against a date the picker produced.
 *
 * @returns {string} Today as YYYY-MM-DD in the local zone.
 */
export function localToday() {
    return toLocalDateString(new Date());
}

/**
 * Turns a YYYY-MM-DD day (what an `<input type="date">` gives you) into an
 * instant at LOCAL midnight. `new Date('2026-09-11')` parses as UTC midnight,
 * which is the previous day everywhere west of Greenwich and 10am here — so a
 * round stored that way renders back on the wrong date.
 *
 * @param {string|Date} value - A YYYY-MM-DD day, or a Date to pass through.
 * @returns {Date|null} Local midnight on that day, or null if unparseable.
 */
export function parseLocalDate(value) {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value !== 'string') return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!m) return null;
    const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const d = new Date(year, month - 1, day);
    // setFullYear keeps years 0-99 out of the 1900s, and the round-trip check
    // rejects a day that rolled over (31 February and friends).
    d.setFullYear(year);
    if (d.getMonth() !== month - 1 || d.getDate() !== day) return null;
    return d;
}

/**
 * Is a picked day later than the player's today? A future-dated round poisons
 * the handicap record's chronology, which is why the guard exists at all —
 * but compared against the UTC day it fired on the true local date for the
 * whole local morning and refused to start the round (F-7).
 *
 * @param {string} value - The picked day, YYYY-MM-DD.
 * @returns {boolean} True only when the day is genuinely in the future.
 */
export function isRoundDateInFuture(value) {
    if (!value) return false;
    return value > localToday();
}
