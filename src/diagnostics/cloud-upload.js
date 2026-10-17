// Flight recorder: optional cloud upload (separate from the local recorder).
//
// Safety contract:
// - Uploads only batches the local store has COMMITTED (read back from it),
//   so local recording is always first and is enough on its own.
// - Runs on its own timer, never awaited by play code; one write in flight at
//   a time, only while the browser reports online.
// - Eligible only when the server-side config doc diagnosticsConfig/upload
//   names THIS account's uid and says enabled: true. That doc is writable by
//   nobody through the app (rules: write if false); with no doc, nothing
//   uploads. The rules re-check the same doc on every chunk write, so turning
//   it off (the remote kill switch) refuses new writes server-side at once.
// - Idempotent chunk ids `${sessionId}_${seq}`; acknowledged ids are kept in
//   localStorage so a reload does not resend them; a resend of identical data
//   is a no-op the rules allow.
// - Hard caps: chunks per session, writes per day, bytes per chunk, failures.
//   A write that is not acknowledged within ACK_TIMEOUT_MS (e.g. it sits in
//   the SDK's offline queue) stops uploading for the session. That queued
//   write may still reach the server later; the rules decide it then.

import { sanitizeEvent } from './sanitize.js';
import { recorder, fr } from './recorder.js';

export const CLOUD_CAPS = Object.freeze({
    SESSION_CHUNKS: 300,
    DAY_WRITES: 400,
    CHUNK_BYTES: 50000,
    TICK_MS: 60000,
    ACK_TIMEOUT_MS: 20000,
    MAX_FAILURES: 3,
    CONFIG_TTL_MS: 10 * 60000,
    PENDING_MAX: 40,
    ACKED_MAX: 600,
    RETENTION_MS: 30 * 24 * 3600 * 1000,
    BACKLOG_MS: 24 * 3600 * 1000,
});
export const ACKED_KEY = 'golf.flightrec.acked';
export const DAY_KEY = 'golf.flightrec.uploadDay';

export function chunkId(b) { return `${b.sid}_${b.seq}`; }

/** The exact document a chunk write sends (pure; tests pin it to the rules). */
export function chunkDoc(b, toTimestamp = ms => ms) {
    const events = (Array.isArray(b?.events) ? b.events : []).map(sanitizeEvent).filter(Boolean);
    const json = JSON.stringify(events);
    if (json.length > CLOUD_CAPS.CHUNK_BYTES) return null;
    return {
        v: 1, sid: String(b.sid), seq: Number(b.seq), build: String(b.build).slice(0, 64),
        n: events.length, events: json,
        expireAt: toTimestamp(Number(b.t) + CLOUD_CAPS.RETENTION_MS),
    };
}

export function createCloudUploader(o) {
    const rec = o.rec;
    const now = o.now || (() => Date.now());
    const storage = o.storage ?? (() => { try { return globalThis.localStorage; } catch { return null; } })();
    const online = o.online || (() => { try { return navigator.onLine !== false; } catch { return true; } });
    const st = { state: 'off', reason: 'not-started', sent: 0, failures: 0, lastAckAt: null };
    let uid = null, cfgAt = 0, cfgOk = false, busy = false, dead = false, iv = null;
    let pending = [];
    let acked = [];
    try { const a = JSON.parse(storage?.getItem(ACKED_KEY) || '[]'); if (Array.isArray(a)) acked = a.filter(x => typeof x === 'string').slice(-CLOUD_CAPS.ACKED_MAX); } catch { acked = []; }

    const stop = reason => { dead = true; st.state = 'off'; st.reason = reason; pending = []; if (iv) { clearInterval(iv); iv = null; } fr('upload', { status: 'off', code: reason }); };
    // The daily cap fails CLOSED: an unreadable counter counts as exhausted,
    // and a write that cannot reserve its slot (verified by read-back) is not sent.
    const dayCount = () => {
        try {
            if (!storage) return Infinity;
            const d = JSON.parse(storage.getItem(DAY_KEY) || 'null');
            const today = new Date(now()).toISOString().slice(0, 10);
            return d && d.day === today ? Number(d.n) || 0 : 0;
        } catch { return Infinity; }
    };
    const reserveDay = () => {
        try {
            const n = dayCount() + 1;
            if (!Number.isFinite(n)) return false;
            const v = JSON.stringify({ day: new Date(now()).toISOString().slice(0, 10), n });
            storage.setItem(DAY_KEY, v);
            return storage.getItem(DAY_KEY) === v;
        } catch { return false; }
    };
    const markAcked = id => {
        acked.push(id);
        if (acked.length > CLOUD_CAPS.ACKED_MAX) acked = acked.slice(-CLOUD_CAPS.ACKED_MAX);
        try { storage?.setItem(ACKED_KEY, JSON.stringify(acked)); } catch { /* ignore */ }
    };
    const enqueue = key => {
        if (dead || pending.includes(key)) return;
        pending.push(key);
        if (pending.length > CLOUD_CAPS.PENDING_MAX) pending.shift();
    };

    async function checkConfig() {
        if (now() - cfgAt < CLOUD_CAPS.CONFIG_TTL_MS && cfgAt) return cfgOk;
        cfgAt = now();
        let cfg = null;
        try { cfg = await o.getConfig(); } catch { cfg = null; }
        cfgOk = !!(cfg && cfg.enabled === true && typeof cfg.uid === 'string' && cfg.uid === uid);
        return cfgOk;
    }

    async function tick() {
        if (busy || dead || !uid) return;
        busy = true;
        try {
            if (!online()) return;
            if (!(await checkConfig())) { stop(st.state === 'on' ? 'killed' : 'not-eligible'); return; }
            st.state = 'on'; st.reason = null;
            while (pending.length && !dead) {
                const key = pending[0];
                const b = await rec.getBatch(key);
                if (!b) { pending.shift(); continue; }
                const id = chunkId(b);
                if (acked.includes(id)) { pending.shift(); continue; }
                if (b.seq >= CLOUD_CAPS.SESSION_CHUNKS || st.sent >= CLOUD_CAPS.SESSION_CHUNKS) { stop('session-cap'); return; }
                if (dayCount() >= CLOUD_CAPS.DAY_WRITES) { stop('day-cap'); return; }
                const data = chunkDoc(b, o.toTimestamp);
                if (!data) { pending.shift(); continue; }
                if (!reserveDay()) { stop('day-cap'); return; }
                let timer;
                const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(Object.assign(new Error('unacked'), { code: 'unacked' })), CLOUD_CAPS.ACK_TIMEOUT_MS); });
                try {
                    await Promise.race([o.writeChunk(uid, id, data), timeout]);
                    clearTimeout(timer);
                    markAcked(id); pending.shift(); st.sent++; st.lastAckAt = now(); st.failures = 0;
                } catch (e) {
                    clearTimeout(timer);
                    const code = String(e?.code || 'error');
                    if (code === 'unacked') { stop('unacked'); return; }
                    if (/permission-denied/.test(code)) { stop('refused'); return; }
                    st.failures++;
                    if (st.failures >= CLOUD_CAPS.MAX_FAILURES) { stop('errors'); return; }
                    return; // try again next tick
                }
                break; // one chunk per tick: a hard frequency cap independent of events
            }
        } catch {
            stop('fault');
        } finally {
            busy = false;
        }
    }

    async function start(forUid) {
        try {
            if (dead || !forUid || uid) return;
            uid = forUid;
            if (!(await checkConfig())) { stop('not-eligible'); return; }
            st.state = 'on'; st.reason = null;
            fr('upload', { status: 'on' });
            rec.onCommitted(b => { try { enqueue(b.key); } catch { /* ignore */ } });
            // Backlog from earlier in the day (e.g. before a reload), oldest first.
            const keys = await rec.storedKeys();
            const since = now() - CLOUD_CAPS.BACKLOG_MS;
            for (const k of keys) { if (rec.parseKey(k).t >= since) enqueue(k); }
            iv = setInterval(() => { tick().catch(() => {}); }, CLOUD_CAPS.TICK_MS);
        } catch { stop('fault'); }
    }

    const status = () => ({ ...st, pending: pending.length });
    return { start, tick, status, stop, _pending: () => pending.slice() };
}

export function cloudStatusText(s) {
    if (!s) return 'Cloud upload: off.';
    if (s.state === 'on') return `Cloud upload: on (this account only) · ${s.sent} sent · ${s.pending} waiting`;
    const why = { 'not-eligible': 'not enabled for this account', 'not-started': 'not signed in', killed: 'switched off remotely', unacked: 'paused, no server reply', refused: 'refused by server', errors: 'paused after errors', 'session-cap': 'limit reached', 'day-cap': 'daily limit reached', fault: 'stopped', 'signed-out': 'signed out' }[s.reason] || 'off';
    return `Cloud upload: off (${why}). Local recording is unaffected.`;
}

/** App wiring (Firestore). Dynamically imported, so the recorder never depends on it. */
export async function startCloudUpload(uid) {
    const rec = recorder();
    if (!rec || !uid) return null;
    const [{ db }, fs] = await Promise.all([import('../firebase-config.js'), import('firebase/firestore')]);
    const up = createCloudUploader({
        rec,
        toTimestamp: ms => fs.Timestamp.fromMillis(ms),
        getConfig: async () => {
            const snap = await fs.getDoc(fs.doc(db, 'diagnosticsConfig', 'upload'));
            return snap.exists() ? snap.data() : null;
        },
        writeChunk: (u, id, data) => fs.setDoc(fs.doc(db, 'users', u, 'diagnosticChunks', id), data),
    });
    await up.start(uid);
    return up;
}
