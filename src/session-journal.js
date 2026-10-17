// ==========================================
// session-journal.js — test-mode play diagnostics (local only)
// ==========================================
//
// A bounded ring buffer of small events (GPS outcomes, connectivity, app
// errors, save attempts/acks, hole and round changes) kept in localStorage so
// a round can be reviewed afterwards. One tap in Settings exports a sanitised
// JSON file.
//
// Safety contract — the journal must NEVER break a save, GPS or a render:
//   * every exported function catches everything and never throws;
//   * nothing here awaits; writes to storage are debounced off the hot path;
//   * trackWrite() returns the caller's promise untouched;
//   * no network, no Firestore, no uploads — the file leaves the phone only
//     when the player exports it.
//
// Privacy: no emails, uids, names or tokens are recorded. Coordinates are
// stored only for GPS fixes during an active round (5 dp ≈ 1 m) and are
// stripped from the export unless the player ticks "Include positions".

export const JOURNAL_KEY = 'golf.journal.v1';
export const JOURNAL_PREF_KEY = 'golf.journal.enabled';
export const JOURNAL_MAX_ENTRIES = 500;
export const JOURNAL_MAX_BYTES = 200 * 1024;
const FLUSH_DELAY_MS = 800;
const GPS_FIX_EVERY_MS = 60000;
const MAX_STR = 200;

const GPS_CODES = { 1: 'PERMISSION_DENIED', 2: 'POSITION_UNAVAILABLE', 3: 'TIMEOUT' };
const SECRET_KEY_RE = /uid|email|token|password|apikey|api_key|secret|displayname|^name$|^key$/i;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const TOKEN_RE = /[A-Za-z0-9_\-+/=]{25,}/g;

let _entries = null;          // in-memory copy (also the fallback when storage fails)
let _degraded = null;         // { reason, at } once storage refused a write
let _memoryOnly = false;      // after a quota failure: stop touching storage
let _flushTimer = null;
let _lastFixLog = { at: 0, bucket: null };
const _ctx = { build: null, roundId: null, course: null, hole: null };
let _installed = false;
let _onFlush = null;          // the Settings card's refresh, if mounted

/** Read-only view of the journal health (`journal.degraded`). */
export const journal = {
    get degraded() { return _degraded; },
    get count() { try { return load().length; } catch { return 0; } },
};

function storage() {
    try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

function load() {
    if (_entries) return _entries;
    _entries = [];
    try {
        const raw = storage()?.getItem(JOURNAL_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) _entries = parsed.slice(-JOURNAL_MAX_ENTRIES);
        }
    } catch (e) {
        markDegraded(e);
    }
    return _entries;
}

function markDegraded(e) {
    const quota = e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);
    _degraded = {
        reason: quota ? 'storage full' : 'storage unavailable',
        error: clip(e && (e.name || e.message) || 'unknown'),
        at: new Date().toISOString(),
    };
    if (quota) {
        // Yield our space to the round itself: the live round persists to the
        // same origin quota and matters far more than a diagnostics log.
        _memoryOnly = true;
        try { storage()?.removeItem(JOURNAL_KEY); } catch { /* nothing to free */ }
    }
}

/** True unless the player turned "Record play diagnostics" off. */
export function isJournalEnabled() {
    try { return storage()?.getItem(JOURNAL_PREF_KEY) !== '0'; } catch { return true; }
}

export function setJournalEnabled(on) {
    try { storage()?.setItem(JOURNAL_PREF_KEY, on ? '1' : '0'); } catch { /* pref stays default */ }
}

function clip(s) {
    const str = String(s ?? '');
    return str.length > MAX_STR ? str.slice(0, MAX_STR) + '…' : str;
}

export function scrubString(s) {
    return clip(s).replace(EMAIL_RE, '[email]').replace(TOKEN_RE, '[redacted]');
}

/** Keep primitives only; drop secret-looking keys; scrub strings. */
function cleanFields(fields) {
    const out = {};
    if (!fields || typeof fields !== 'object') return out;
    for (const [k, v] of Object.entries(fields)) {
        if (SECRET_KEY_RE.test(k) || k === 't' || k === 'k') continue;
        if (v == null) continue;
        if (typeof v === 'number') { if (Number.isFinite(v)) out[k] = v; }
        else if (typeof v === 'boolean') out[k] = v;
        else if (typeof v === 'string') out[k] = scrubString(v);
    }
    return out;
}

function trimToBudget(list) {
    while (list.length > JOURNAL_MAX_ENTRIES) list.shift();
    let json = JSON.stringify(list);
    while (json.length > JOURNAL_MAX_BYTES && list.length > 1) {
        list.splice(0, Math.max(1, Math.floor(list.length / 10)));
        json = JSON.stringify(list);
    }
    return json;
}

/** Write the in-memory journal to storage now. Never throws. */
export function flushJournal() {
    try {
        if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
        const list = load();
        const json = trimToBudget(list);
        if (!_memoryOnly) {
            try { storage()?.setItem(JOURNAL_KEY, json); }
            catch (e) { markDegraded(e); }
        }
        try { _onFlush?.(); } catch { /* never */ }
    } catch (e) {
        try { _degraded = _degraded || { reason: 'journal error', error: clip(e?.message), at: new Date().toISOString() }; } catch { /* give up */ }
    }
}

function scheduleFlush() {
    try {
        if (_flushTimer) return;
        _flushTimer = setTimeout(() => { _flushTimer = null; flushJournal(); }, FLUSH_DELAY_MS);
    } catch { /* no timers: next record retries */ }
}

/** Append one event. Never throws, never blocks on storage. */
export function record(kind, fields) {
    try {
        if (!isJournalEnabled()) return;
        const entry = { t: new Date().toISOString(), k: String(kind), ...cleanFields(fields) };
        const list = load();
        list.push(entry);
        if (list.length > JOURNAL_MAX_ENTRIES) list.splice(0, list.length - JOURNAL_MAX_ENTRIES);
        scheduleFlush();
    } catch (e) {
        try { _degraded = _degraded || { reason: 'journal error', error: clip(e?.message), at: new Date().toISOString() }; } catch { /* give up */ }
    }
}

function round5(n) { return Math.round(n * 1e5) / 1e5; }

/** Coordinates only while a round is active; ~1 m precision. */
function position(lat, lon) {
    if (!_ctx.roundId || !Number.isFinite(lat) || !Number.isFinite(lon)) return {};
    return { lat: round5(lat), lon: round5(lon) };
}

function accBucket(a) { return a <= 10 ? 'good' : a <= 30 ? 'fair' : a <= 100 ? 'poor' : 'bad'; }

/** Raw watch fix. Throttled: first fix, a change of accuracy class, or once a minute. */
export function recordGpsFix(coords) {
    try {
        if (!coords) return;
        const acc = Number(coords.accuracy);
        const bucket = accBucket(acc);
        const now = Date.now();
        if (_lastFixLog.bucket === bucket && now - _lastFixLog.at < GPS_FIX_EVERY_MS) return;
        _lastFixLog = { at: now, bucket };
        record('gps-fix', { accM: Math.round(acc), hole: _ctx.hole, ...position(coords.latitude, coords.longitude) });
    } catch { /* never */ }
}

/** Watch error callback (PERMISSION_DENIED / POSITION_UNAVAILABLE / TIMEOUT). */
export function recordGpsError(err, extra) {
    try {
        _lastFixLog = { at: 0, bucket: null };
        record('gps-error', { code: err?.code, codeName: GPS_CODES[err?.code] || 'UNKNOWN', msg: err?.message, hole: _ctx.hole, ...cleanFields(extra) });
    } catch { /* never */ }
}

/** Per-shot hold-still capture decision (gps-capture.js decide()). */
export function recordGpsCapture(d) {
    try {
        if (!d) return;
        const fix = d.fix || null;
        const kept = d.state === 'accepted' || d.state === 'lowConfidence';
        record('gps-capture', {
            state: d.state,
            accM: fix && Number.isFinite(fix.accuracyM) ? Math.round(fix.accuracyM) : null,
            ms: d.elapsedMs,
            usable: d.fixCount?.usable,
            reason: d.state === 'preciseOff' ? 'Precise Location is off' : d.reason,
            hole: _ctx.hole,
            ...(kept && fix ? position(fix.lat, fix.lon) : {}),
        });
    } catch { /* never */ }
}

/**
 * Log a Firestore write's attempt and its later ack/failure. Returns the
 * SAME promise, so `trackWrite('shot', setDoc(...)).catch(...)` behaves
 * exactly like the bare call. Never awaits.
 */
export function trackWrite(kind, promise) {
    try {
        const t0 = Date.now();
        const hole = _ctx.hole;
        record('save', { what: kind, status: 'attempt', hole });
        if (promise && typeof promise.then === 'function') {
            promise.then(
                () => record('save', { what: kind, status: 'ack', ms: Date.now() - t0, hole }),
                (e) => record('save', { what: kind, status: 'failed', code: e?.code || e?.name, ms: Date.now() - t0, hole }),
            );
        }
    } catch { /* never */ }
    return promise;
}

/** Copy of the entries + header for the export. Never throws. */
export function journalSnapshot() {
    try {
        return { entries: load().map(e => ({ ...e })), header: { ..._ctx }, degraded: _degraded ? { ..._degraded } : null };
    } catch {
        return { entries: [], header: {}, degraded: _degraded };
    }
}

/** Empty the journal (memory and storage). Never throws. */
export function clearJournal() {
    try {
        _entries = [];
        if (!_memoryOnly) storage()?.removeItem(JOURNAL_KEY);
    } catch { /* memory already cleared */ }
    try { _onFlush?.(); } catch { /* never */ }
}

/** The Settings card registers here to refresh its count after a write. */
export function onJournalFlush(fn) { _onFlush = typeof fn === 'function' ? fn : null; }

