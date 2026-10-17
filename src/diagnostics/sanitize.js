// Flight recorder: the allowlist sanitizer.
//
// Every diagnostic event passes through sanitizeEvent() BEFORE it is
// persisted, and again before it is exported or uploaded. Only known event
// types and known field names survive, each with a fixed type and shape.
// There is no free text: no messages, no notes, no names, no URLs with
// queries, no tokens, emails or UIDs. Anything that does not match is dropped
// (and counted), never stored "as is".
//
// The sanitizer never traverses caller objects: it reads at most MAX_KEYS
// own top-level properties, each inside try/catch (throwing getters), and
// only accepts primitives. Cyclic, deep, BigInt and huge inputs therefore cost
// a bounded amount of work.

export const SCHEMA = 'golf-flightrec/1';

export const EVENT_TYPES = new Set([
    'boot', 'session', 'round_start', 'round_end', 'hole', 'score', 'tab',
    'gps', 'gps_err', 'gps_stop', 'net', 'vis', 'page', 'sw', 'error',
    'rejection', 'write', 'slow', 'rec', 'upload', 'auth',
]);

const ENUMS = {
    status: new Set(['attempt', 'ack', 'rejected', 'queued', 'committed', 'failed', 'skipped', 'on', 'off']),
    kind: new Set(['round', 'round-other', 'shot', 'plan', 'state', 'chunk', 'config', 'record', 'flush', 'idb', 'local', 'memory', 'export', 'clear']),
    vis: new Set(['visible', 'hidden', 'prerender']),
    plat: new Set(['ios', 'android', 'other']),
    storage: new Set(['idb', 'local', 'memory', 'none']),
    sw: new Set(['controllerchange', 'none', 'controlled']),
    state: new Set(['in', 'out', 'switch', 'denied', 'unavailable', 'timeout', 'other']),
};

// Value ALLOWLISTS (Codex review 1, P1): a pattern such as "short letters"
// lets short private values through ('Alex', 'John Smith'), so every string
// field is either a known value or a strict generated-identifier format.
const ROUND_RE = /^round_\d{13}$/;                  // round_<Date.now()>
const FILE_RE = /^[a-z][a-z0-9-]{0,40}-[A-Za-z0-9_-]{8}\.js$/; // Vite asset 'index-ByBMoM4s.js'
const FILE_NAMES = new Set(['sw.js', 'index.html']);
const ERROR_NAMES = new Set([
    'Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'EvalError', 'URIError',
    'AggregateError', 'FirebaseError', 'DOMException', 'QuotaExceededError', 'AbortError',
    'NotAllowedError', 'SecurityError', 'NetworkError', 'TimeoutError', 'InvalidStateError',
    'NotFoundError', 'DataError', 'UnknownError', 'VersionError', 'ConstraintError',
    'TransactionInactiveError', 'NotSupportedError', 'ChunkLoadError',
    // recorder sentinels
    'Other', 'Unknown', 'Nullish', 'String', 'Primitive', 'NoErrorObject',
]);
const FIRESTORE_CODES = ['cancelled', 'unknown', 'invalid-argument', 'deadline-exceeded', 'not-found',
    'already-exists', 'permission-denied', 'resource-exhausted', 'failed-precondition', 'aborted',
    'out-of-range', 'unimplemented', 'internal', 'unavailable', 'data-loss', 'unauthenticated'];
const CODES = new Set([
    ...FIRESTORE_CODES, ...FIRESTORE_CODES.map(c => `firestore/${c}`), ...FIRESTORE_CODES.map(c => `functions/${c}`),
    'auth/network-request-failed', 'auth/user-token-expired', 'auth/internal-error',
    // GPS PositionError codes and small DOMException numeric codes
    '0', '1', '2', '3', '11', '18', '19', '20', '22', '23',
    // cloud uploader reasons
    'not-eligible', 'not-started', 'killed', 'unacked', 'refused', 'errors', 'session-cap', 'day-cap', 'fault', 'signed-out',
]);
const COURSES = new Set(['keperra', 'ashgrove', 'redcliffe', 'virginia']);
const TABS = new Set(['tab-admin', 'tab-coach', 'tab-comp', 'tab-feed', 'tab-insights', 'tab-oncourse', 'tab-practice', 'tab-settings', 'tab-whs']);
const BUILD_RE = /^(?:v?\d{1,3}\.\d{1,3}\.\d{1,3}|dev)\+(?:[0-9a-f]{40}|unknown|local)$|^unknown$/; // 'v7.0.0+<40-hex>'
// A run of 20+ letters/digits with no separator looks like a UID, push id or
// token; no allowlisted field legitimately carries one (build has its own regex).
const LONG_RUN_RE = /[A-Za-z0-9]{20,}/;

// Field name -> validator. A validator returns the clean value or undefined.
const int = (min, max) => v => (typeof v === 'number' && Number.isFinite(v)) ? Math.min(max, Math.max(min, Math.round(v))) : undefined;
const num1 = (min, max) => v => (typeof v === 'number' && Number.isFinite(v)) ? Math.round(Math.min(max, Math.max(min, v)) * 10) / 10 : undefined;
const bool = v => (typeof v === 'boolean' ? v : undefined);
const re = (rx, max) => v => (typeof v === 'string' && v.length <= max && rx.test(v)) ? v : undefined;
const oneOf = set => v => (typeof v === 'string' && v.length <= 48 && set.has(v)) ? v : undefined;
const fileName = v => (typeof v === 'string' && v.length <= 64 && (FILE_NAMES.has(v) || (FILE_RE.test(v) && !LONG_RUN_RE.test(v)))) ? v : undefined;
const buildRe = v => (typeof v === 'string' && v.length <= 64 && BUILD_RE.test(v)) ? v : undefined;
const en = set => v => (typeof v === 'string' && set.has(v)) ? v : undefined;
const distOrNull = v => (v === null ? null : int(0, 2000)(v));

export const FIELDS = {
    hole: int(0, 54), phys: int(0, 54), holes: int(0, 54), shot: int(0, 30),
    acc: num1(0, 100000), spd: num1(0, 500), age: int(0, 86400000),
    f: distOrNull, c: distOrNull, b: distOrNull,
    n: int(0, 1e9), ms: int(0, 86400000), seq: int(0, 1e9), op: int(0, 1e9),
    line: int(0, 1e7), col: int(0, 1e7), depth: int(0, 10),
    vw: int(0, 10000), vh: int(0, 10000), dpr: num1(0, 10),
    online: bool, standalone: bool, persisted: bool, quiet: bool, cause: bool,
    status: en(ENUMS.status), kind: en(ENUMS.kind), vis: en(ENUMS.vis),
    plat: en(ENUMS.plat), storage: en(ENUMS.storage), sw: en(ENUMS.sw), state: en(ENUMS.state),
    round: re(ROUND_RE, 19), code: oneOf(CODES), name: oneOf(ERROR_NAMES),
    course: oneOf(COURSES), tab: oneOf(TABS),
    src: fileName, build: buildRe,
    // Recorder self-report counters (no payload, just numbers).
    dropped: int(0, 1e9), evicted: int(0, 1e9), failed: int(0, 1e9), committed: int(0, 1e9),
};

export const MAX_KEYS = 24;
export const MAX_EVENT_BYTES = 400;

/**
 * Returns a clean event object { t, k, ...fields } or null when the input is
 * not an allowed event. Never throws.
 */
export function sanitizeEvent(raw) {
    try {
        if (!raw || typeof raw !== 'object') return null;
        let k, t;
        try { k = raw.k; t = raw.t; } catch { return null; }
        if (typeof k !== 'string' || !EVENT_TYPES.has(k)) return null;
        if (typeof t !== 'number' || !Number.isFinite(t) || t < 0) return null;
        const out = { t: Math.round(t), k };
        let keys;
        try { keys = Object.keys(raw); } catch { return null; }
        let seen = 0;
        for (const key of keys) {
            if (key === 't' || key === 'k') continue;
            if (++seen > MAX_KEYS) break;
            const check = Object.prototype.hasOwnProperty.call(FIELDS, key) ? FIELDS[key] : null;
            if (!check) continue;
            let v;
            try { v = raw[key]; } catch { continue; }
            const clean = check(v);
            if (clean !== undefined) out[key] = clean;
        }
        // Hard per-event byte cap. With the field shapes above an event cannot
        // reach it, but the cap is the guarantee, not the arithmetic.
        if (JSON.stringify(out).length > MAX_EVENT_BYTES) return { t: out.t, k: out.k, status: 'skipped' };
        return out;
    } catch {
        return null;
    }
}

/** Basename of a script URL, without query, fragment or userinfo. */
export function fileOf(url) {
    try {
        if (typeof url !== 'string' || !url) return undefined;
        const s = url.slice(0, 2048).split(/[?#]/)[0];
        const base = s.slice(s.lastIndexOf('/') + 1);
        return fileName(base);
    } catch { return undefined; }
}

const FRAME_RE = /([^\s()@]+?):(\d+):(\d+)\)?\s*$/m;

/**
 * Structured fields from an Error-like value. Takes name, code and the top
 * stack frame's file basename + line:col only; never the message, which can
 * carry user data. Error.cause and AggregateError are followed to a fixed
 * depth for their NAME only.
 */
export function errorFields(err) {
    const out = {};
    try {
        if (err === null || err === undefined) { out.name = 'Nullish'; return out; }
        const type = typeof err;
        if (type !== 'object' && type !== 'function') { out.name = type === 'string' ? 'String' : 'Primitive'; return out; }
        let name, code, stack, cause, errors;
        try { name = err.name; } catch { /* throwing getter */ }
        try { code = err.code; } catch { /* throwing getter */ }
        try { stack = err.stack; } catch { /* throwing getter */ }
        try { cause = err.cause; } catch { /* throwing getter */ }
        try { errors = err.errors; } catch { /* throwing getter */ }
        out.name = (typeof name === 'string' && ERROR_NAMES.has(name)) ? name : 'Other';
        if (typeof code === 'string' && CODES.has(code)) out.code = code;
        else if (typeof code === 'number' && CODES.has(String(code))) out.code = String(code);
        if (typeof stack === 'string') {
            const lines = stack.slice(0, 4096).split('\n').slice(0, 8);
            for (const l of lines) {
                const m = FRAME_RE.exec(l);
                if (!m) continue;
                const f = fileOf(m[1]);
                if (f) { out.src = f; out.line = Number(m[2]); out.col = Number(m[3]); }
                break;
            }
        }
        if (cause !== undefined) out.cause = true;
        if (Array.isArray(errors)) out.n = errors.length;
        // Depth of the cause chain, bounded (cycles stop at the bound).
        let d = 0, c = cause;
        while (c && typeof c === 'object' && d < 5) {
            d++;
            try { c = c.cause; } catch { break; }
        }
        if (d) out.depth = d;
    } catch {
        out.name = 'Unknown';
    }
    return out;
}
