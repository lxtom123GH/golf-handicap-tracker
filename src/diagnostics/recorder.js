// Flight recorder core: a bounded, local-first diagnostic journal.
//
// Contract (see the PR body and tests/unit/flight-recorder.test.js):
// - record() is synchronous, O(1), never throws and never awaits. Play code
//   (scoring, GPS, saves) calls it and moves on.
// - Every event is sanitized (allowlist) BEFORE it is queued, so nothing
//   unsafe reaches memory, IndexedDB or localStorage.
// - Three honest states: an event is QUEUED (in memory only), COMMITTED (a
//   storage transaction reported success) or FAILED (storage refused it; the
//   event survives in the in-memory window only).
// - Hard numeric caps: per event, queue, in-memory window, persistent bytes and
//   events, per session, per minute. Everything over a cap is counted
//   (dropped / evicted), never silently lost.
// - IndexedDB first; on any open/transaction failure, localStorage with a
//   small budget; on any localStorage failure, memory only. Storage problems
//   never reach the app. The recorder's own key is the only thing it ever
//   removes - round state and round backups are never touched.
// - If the recorder itself misbehaves repeatedly it disables itself for the
//   session and says so in its status.

import { sanitizeEvent, SCHEMA } from './sanitize.js';

export const CAPS = Object.freeze({
    QUEUE_EVENTS: 200,        // unflushed events held in memory
    WINDOW_EVENTS: 500,       // recent-events window kept in memory for export
    BATCH_EVENTS: 100,        // one persisted batch (one IDB record / upload chunk)
    BATCH_BYTES: 48000,
    STORE_BYTES: 1_000_000,   // IndexedDB total, oldest batches evicted first
    STORE_EVENTS: 8000,
    LOCAL_BYTES: 120_000,     // localStorage fallback budget (UTF-16 units)
    SESSION_EVENTS: 15000,
    PER_MINUTE: 120,
    FLUSH_MS: 15000,
    INTERNAL_FAULTS: 5,       // self-disable after this many internal faults
    RECORD_BYTES: 64000,      // max size of one stored record we will parse
});

export const ENABLED_KEY = 'golf.flightrec.enabled';
export const LOCAL_KEY = 'golf.flightrec.v1';
export const CLEARED_KEY = 'golf.flightrec.clearedAt';
const DB_NAME = 'golf-flightrec';
const STORE = 'batches';

/** Full build identity of the executing bundle (embedded at build time). */
export function executingBuild() {
    try {
        const v = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
        const c = typeof __BUILD_COMMIT_FULL__ !== 'undefined' && __BUILD_COMMIT_FULL__ ? __BUILD_COMMIT_FULL__ : 'unknown';
        return `${v}+${c}`;
    } catch { return 'unknown'; }
}

function randomId() {
    try {
        const a = new Uint8Array(6);
        globalThis.crypto.getRandomValues(a);
        return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
    } catch {
        return Math.random().toString(16).slice(2, 14).padEnd(12, '0');
    }
}

function safeLocal() {
    try { return globalThis.localStorage || null; } catch { return null; }
}

// ---- storage backends -----------------------------------------------------
// Each backend: { name, put(batch) -> Promise, list() -> Promise<batch[]>,
// keys() -> Promise<string[]>, get(key) -> Promise<batch|null>, clear() }.
// A batch: { key, sid, seq, build, t, events:[...] }.

function batchKey(b, bytes) {
    return `${String(b.t).padStart(15, '0')}|${b.sid}|${b.seq}|${bytes}|${b.events.length}`;
}
function parseKey(k) {
    const p = String(k).split('|');
    return { t: Number(p[0]), sid: p[1], seq: Number(p[2]), bytes: Number(p[3]) || 0, n: Number(p[4]) || 0 };
}

function txDone(tx) {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('tx error'));
        tx.onabort = () => reject(tx.error || new Error('tx abort'));
    });
}
function reqP(req) {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('request error'));
    });
}

export function idbBackend(idb = globalThis.indexedDB, { timeoutMs = 4000 } = {}) {
    let dbp = null;
    const open = () => {
        if (dbp) return dbp;
        dbp = new Promise((resolve, reject) => {
            if (!idb || typeof idb.open !== 'function') { reject(new Error('no indexedDB')); return; }
            let settled = false;
            const timer = setTimeout(() => { if (!settled) { settled = true; reject(new Error('idb open timeout')); } }, timeoutMs);
            let req;
            try { req = idb.open(DB_NAME, 1); } catch (e) { clearTimeout(timer); reject(e); return; }
            req.onupgradeneeded = () => { try { req.result.createObjectStore(STORE); } catch { /* exists */ } };
            req.onsuccess = () => { clearTimeout(timer); if (settled) return; settled = true; resolve(req.result); };
            req.onerror = () => { clearTimeout(timer); if (settled) return; settled = true; reject(req.error || new Error('idb open error')); };
            req.onblocked = () => { clearTimeout(timer); if (settled) return; settled = true; reject(new Error('idb blocked')); };
        });
        dbp.catch(() => { dbp = null; });
        return dbp;
    };
    return {
        name: 'idb',
        async put(b, json) {
            const db = await open();
            const tx = db.transaction(STORE, 'readwrite');
            const done = txDone(tx);
            tx.objectStore(STORE).put(json, b.key);
            await done;
            // Prune oldest batches past the caps, using sizes carried in keys
            // (no value reads). The batch above is already committed, so a
            // failed prune is reported as zero evictions, not as a failed put.
            try {
            const tx2 = db.transaction(STORE, 'readwrite');
            const done2 = txDone(tx2);
            const store = tx2.objectStore(STORE);
            const keys = (await reqP(store.getAllKeys())) || [];
            let bytes = 0, n = 0;
            for (const k of keys) { const p = parseKey(k); bytes += p.bytes; n += p.n; }
            let evicted = 0;
            for (const k of keys) {
                if (bytes <= CAPS.STORE_BYTES && n <= CAPS.STORE_EVENTS) break;
                const p = parseKey(k);
                store.delete(k);
                bytes -= p.bytes; n -= p.n; evicted += p.n;
            }
            await done2;
            return { evicted };
            } catch { return { evicted: 0 }; }
        },
        async keys() {
            const db = await open();
            const tx = db.transaction(STORE, 'readonly');
            return ((await reqP(tx.objectStore(STORE).getAllKeys())) || []).map(String);
        },
        async get(key) {
            const db = await open();
            const tx = db.transaction(STORE, 'readonly');
            const v = await reqP(tx.objectStore(STORE).get(key));
            return parseBatch(v, key);
        },
        async list() {
            const keys = await this.keys();
            const out = [];
            for (const k of keys) { const b = await this.get(k); if (b) out.push(b); }
            return out;
        },
        async clear() {
            const db = await open();
            const tx = db.transaction(STORE, 'readwrite');
            const done = txDone(tx);
            tx.objectStore(STORE).clear();
            await done;
        },
    };
}

function parseBatch(v, key) {
    try {
        if (typeof v !== 'string' || v.length > CAPS.RECORD_BYTES) return null;
        const b = JSON.parse(v);
        if (!b || typeof b !== 'object' || !Array.isArray(b.events)) return null;
        return { key: String(key), sid: String(b.sid || '').slice(0, 24), seq: Number(b.seq) || 0, build: String(b.build || 'unknown').slice(0, 64), t: Number(b.t) || 0, events: b.events.slice(0, CAPS.BATCH_EVENTS) };
    } catch { return null; }
}

export function localBackend(storage = safeLocal()) {
    const read = () => {
        const raw = storage.getItem(LOCAL_KEY);
        if (!raw) return [];
        if (raw.length > CAPS.LOCAL_BYTES * 2) { storage.removeItem(LOCAL_KEY); return []; } // oversized: discard before parsing
        try {
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr.filter(x => x && typeof x === 'object' && typeof x.key === 'string' && typeof x.json === 'string') : [];
        } catch { storage.removeItem(LOCAL_KEY); return []; }
    };
    return {
        name: 'local',
        async put(b, json) {
            if (!storage) throw new Error('no localStorage');
            const arr = read();
            arr.push({ key: b.key, json });
            let evicted = 0;
            let s = JSON.stringify(arr);
            while (s.length > CAPS.LOCAL_BYTES && arr.length > 1) {
                evicted += parseKey(arr.shift().key).n;
                s = JSON.stringify(arr);
            }
            if (s.length > CAPS.LOCAL_BYTES) throw new Error('batch over local budget');
            try {
                storage.setItem(LOCAL_KEY, s);
            } catch (e) {
                // Give the space back at once: the live round needs it more.
                try { storage.removeItem(LOCAL_KEY); } catch { /* ignore */ }
                throw e;
            }
            return { evicted };
        },
        async keys() { return read().map(x => x.key); },
        async get(key) { const x = read().find(r => r.key === key); return x ? parseBatch(x.json, x.key) : null; },
        async list() { return read().map(x => parseBatch(x.json, x.key)).filter(Boolean); },
        async clear() { storage.removeItem(LOCAL_KEY); },
    };
}

// ---- the recorder ----------------------------------------------------------

export function createRecorder(opts = {}) {
    const now = opts.now || (() => Date.now());
    const setT = opts.setTimeout || ((f, ms) => setTimeout(f, ms));
    const clearT = opts.clearTimeout || (id => clearTimeout(id));
    const storage = 'storage' in opts ? opts.storage : safeLocal();
    const backends = opts.backends || [idbBackend(), localBackend(storage)];
    let backendIdx = 0;

    const build = opts.build || executingBuild();
    const sid = opts.sessionId || randomId();
    let seq = 0;
    let queue = [];
    let recent = [];
    let timer = null;
    let flushing = null;
    let faults = 0;
    let disabledReason = null;
    let minuteStart = 0, minuteCount = 0, sessionCount = 0;
    const counters = { recorded: 0, committed: 0, failed: 0, dropped: 0, evicted: 0, flushes: 0 };
    const dropReasons = {};
    let lastCommitAt = null, lastFailCode = null;
    const committedListeners = [];

    let enabled = true;
    try { enabled = storage?.getItem(ENABLED_KEY) !== 'off'; } catch { enabled = true; }

    function drop(reason, n = 1) {
        counters.dropped += n;
        dropReasons[reason] = (dropReasons[reason] || 0) + n;
    }
    function fault(where) {
        faults++;
        lastFailCode = `fault-${where}`.slice(0, 48);
        if (faults >= CAPS.INTERNAL_FAULTS && !disabledReason) {
            disabledReason = 'recorder-faults';
            queue = [];
        }
    }

    function record(k, fields) {
        try {
            if (!enabled || disabledReason) return false;
            const t = now();
            if (t - minuteStart >= 60000) { minuteStart = t; minuteCount = 0; }
            if (minuteCount >= CAPS.PER_MINUTE) { drop('rate'); return false; }
            if (sessionCount >= CAPS.SESSION_EVENTS) { drop('session'); return false; }
            const raw = Object.assign({}, fields && typeof fields === 'object' ? pick(fields) : null, { t, k });
            const ev = sanitizeEvent(raw);
            if (!ev) { drop('invalid'); return false; }
            minuteCount++; sessionCount++;
            counters.recorded++;
            if (queue.length >= CAPS.QUEUE_EVENTS) { queue.shift(); drop('queue'); }
            queue.push(ev);
            recent.push(ev);
            if (recent.length > CAPS.WINDOW_EVENTS) recent.shift();
            schedule(queue.length >= CAPS.BATCH_EVENTS ? 0 : CAPS.FLUSH_MS);
            return true;
        } catch {
            fault('record');
            return false;
        }
    }

    // Shallow copy of at most 24 own primitive fields, each read guarded.
    function pick(fields) {
        const out = {};
        let keys = [];
        try { keys = Object.keys(fields).slice(0, 24); } catch { return out; }
        for (const key of keys) {
            try { const v = fields[key]; if (v === null || typeof v !== 'object') out[key] = v; } catch { /* throwing getter */ }
        }
        return out;
    }

    function schedule(ms) {
        try {
            if (timer !== null && ms > 0) return;
            if (timer !== null) clearT(timer);
            timer = setT(() => { timer = null; flush().catch(() => fault('flush')); }, ms);
        } catch { fault('schedule'); }
    }

    function readClearedAt() {
        try { return Number(storage?.getItem(CLEARED_KEY)) || 0; } catch { return 0; }
    }

    async function flush() {
        if (flushing) return flushing;
        flushing = (async () => {
            try {
                while (queue.length && !disabledReason) {
                    const clearedAt = readClearedAt();
                    const events = queue.splice(0, CAPS.BATCH_EVENTS).filter(e => e.t >= clearedAt);
                    if (!events.length) continue;
                    const b = { sid, seq: seq++, build, t: events[0].t, events };
                    let json = JSON.stringify({ v: 1, sid: b.sid, seq: b.seq, build: b.build, t: b.t, events });
                    if (json.length > CAPS.BATCH_BYTES) { drop('batch-bytes', events.length); continue; }
                    b.key = batchKey(b, json.length);
                    counters.flushes++;
                    let ok = false;
                    while (backendIdx < backends.length && !ok) {
                        try {
                            const res = await backends[backendIdx].put(b, json);
                            counters.evicted += Number(res?.evicted) || 0;
                            ok = true;
                        } catch (e) {
                            lastFailCode = String(e?.name || 'Error').slice(0, 40);
                            backendIdx++; // fall back: idb -> local -> memory only
                        }
                    }
                    if (ok) {
                        counters.committed += events.length;
                        lastCommitAt = now();
                        for (const cb of committedListeners.slice()) {
                            try { cb(b); } catch { /* listener faults never reach play */ }
                        }
                    } else {
                        counters.failed += events.length; // still in the memory window
                    }
                }
            } catch {
                fault('flush');
            } finally {
                flushing = null;
            }
        })();
        return flushing;
    }

    function storageName() {
        return backendIdx < backends.length ? backends[backendIdx].name : 'memory';
    }

    function status() {
        return {
            schema: SCHEMA, build, sessionId: sid, enabled, disabledReason,
            storage: storageName(), queued: queue.length, window: recent.length,
            ...counters, dropReasons: { ...dropReasons }, lastCommitAt, lastFailCode,
        };
    }

    // Every backend used so far (an IDB that failed mid-session may still
    // hold the earlier batches). Each read is guarded.
    async function storedBatches() {
        const out = [];
        const last = Math.min(backendIdx, backends.length - 1);
        for (let i = 0; i <= last; i++) {
            try { out.push(...(await backends[i].list())); } catch { /* unreadable backend */ }
        }
        return out;
    }

    /** Sanitized snapshot for export. Never throws. */
    async function snapshot() {
        try {
            const stored = await storedBatches();
            const clean = arr => arr.map(sanitizeEvent).filter(Boolean);
            const batches = stored.map(b => ({ sid: b.sid, seq: b.seq, build: b.build, status: 'committed', events: clean(b.events) }));
            const storedCount = batches.reduce((s, b) => s + b.events.length, 0);
            if (queue.length) batches.push({ sid, seq: null, build, status: 'queued', events: clean(queue) });
            // When storage failed, the memory window is the only record.
            if (!stored.length && counters.failed) batches.push({ sid, seq: null, build, status: 'failed', events: clean(recent) });
            const all = batches.flatMap(b => b.events);
            const times = all.map(e => e.t);
            return {
                schema: SCHEMA, exportedAt: new Date(now()).toISOString(), exportBuild: build,
                note: 'Diagnostics only: event types, codes, counts, accuracy, distances shown. No positions, names, emails, UIDs, notes or messages.',
                status: status(), storedEvents: storedCount,
                retainedFrom: times.length ? Math.min(...times) : null,
                retainedTo: times.length ? Math.max(...times) : null,
                batches,
            };
        } catch {
            return { schema: SCHEMA, exportBuild: build, status: status(), batches: [], error: 'snapshot-failed' };
        }
    }

    async function clearAll() {
        queue = [];
        recent = [];
        try { storage?.setItem(CLEARED_KEY, String(now())); } catch { /* ignore */ }
        for (const b of backends) { try { await b.clear(); } catch { /* ignore */ } }
        counters.committed = 0; counters.failed = 0;
    }

    function setEnabled(on) {
        enabled = !!on;
        try { storage?.setItem(ENABLED_KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
        if (!enabled) queue = [];
    }

    /** Remove the localStorage fallback copy (persistence needs the space). */
    // Returns true only when a copy existed and was removed.
    function releaseLocal() {
        try {
            if (!storage || storage.getItem(LOCAL_KEY) === null) return false;
            storage.removeItem(LOCAL_KEY);
            // Stay off localStorage for the rest of the session: memory only.
            if (backends[backendIdx]?.name === 'local') backendIdx = backends.length;
            return true;
        } catch { return false; }
    }

    function onCommitted(cb) {
        committedListeners.push(cb);
        return () => { const i = committedListeners.indexOf(cb); if (i >= 0) committedListeners.splice(i, 1); };
    }

    async function getBatch(key) {
        const b = backendIdx < backends.length ? backends[backendIdx] : null;
        if (!b) return null;
        try { return await b.get(key); } catch { return null; }
    }
    async function storedKeys() {
        const b = backendIdx < backends.length ? backends[backendIdx] : null;
        if (!b) return [];
        try { return await b.keys(); } catch { return []; }
    }

    return { record, flush, status, snapshot, clearAll, setEnabled, releaseLocal, onCommitted, getBatch, storedKeys, parseKey, sessionId: sid, build };
}

// ---- the app's singleton ----------------------------------------------------
let _rec = null;
export function recorder() {
    if (!_rec) {
        try { _rec = createRecorder(); } catch { _rec = null; }
    }
    return _rec;
}

/** The one call play code makes. Never throws, never awaits. */
export function fr(k, fields) {
    try { return recorder()?.record(k, fields) || false; } catch { return false; }
}

let _op = 0;
/**
 * Record a Firestore write's attempt and its real server outcome. Returns the
 * SAME promise it was given, so callers keep their own .catch and their
 * fire-and-forget behaviour. A write that never settles (offline) stays an
 * 'attempt' - it is never reported as acknowledged.
 */
export function trackWrite(kind, promise) {
    try {
        const op = ++_op;
        const start = Date.now();
        fr('write', { kind, op, status: 'attempt', online: typeof navigator !== 'undefined' ? navigator.onLine : undefined });
        if (promise && typeof promise.then === 'function') {
            promise.then(
                () => fr('write', { kind, op, status: 'ack', ms: Date.now() - start }),
                e => { let code; try { code = e?.code; } catch { /* ignore */ } fr('write', { kind, op, status: 'rejected', ms: Date.now() - start, code }); }
            );
        }
    } catch { /* never reaches the save path */ }
    return promise;
}

/** For persistence.js: drop the recorder's localStorage copy. Never throws. */
export function releaseRecorderStorage() {
    try {
        if (_rec) return _rec.releaseLocal();
        const ls = globalThis.localStorage;
        if (!ls || ls.getItem(LOCAL_KEY) === null) return false;
        ls.removeItem(LOCAL_KEY);
        return true;
    } catch { return false; }
}

/** Test seam: drop the singleton. */
export function _resetRecorderForTests() { _rec = null; _op = 0; }
