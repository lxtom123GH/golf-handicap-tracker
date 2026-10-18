// Flight recorder: hooks (GPS throttle, state taps), the Settings card, the
// persistence ordering (recorder storage released before round backups), and
// the optional cloud uploader (eligibility, kill switch, caps, idempotence).
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/firebase-config.js', () => ({ db: {}, auth: {}, functions: {} }));
vi.mock('firebase/firestore', () => ({
    collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(),
    onSnapshot: vi.fn(), addDoc: vi.fn(), serverTimestamp: vi.fn(), setDoc: vi.fn(),
    doc: vi.fn(), updateDoc: vi.fn(), getDoc: vi.fn(), getDocs: vi.fn(),
    writeBatch: vi.fn(), deleteDoc: vi.fn()
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('../../src/ui.js', () => ({ UI: { ocTeeSelect: null, ocAddedPlayersList: null, ocHoleEditorModal: null } }));
vi.mock('../../src/notifications.js', () => ({ initNotifications: vi.fn() }));
vi.mock('../../src/whs.js', () => ({
    calculateDailyHandicap: vi.fn(() => 0), calculateHoleStableford: vi.fn(() => 0),
    convertStablefordToAGS: vi.fn(() => 0), scoringUnavailableReason: vi.fn(() => null)
}));

import { AppState } from '../../src/state.js';
import { saveRoundState } from '../../src/persistence.js';
import { makeGpsTap, makeStateTap, GPS_EVERY_MS, GPS_MIN_MS, GPS_SESSION_MAX, noteAccount } from '../../src/diagnostics/hooks.js';
import { createRecorder, LOCAL_KEY, _resetRecorderForTests } from '../../src/diagnostics/recorder.js';
import { createCloudUploader, chunkDoc, chunkId, CLOUD_CAPS, ACKED_KEY, cloudStatusText } from '../../src/diagnostics/cloud-upload.js';
import { statusText, exportDiagnostics, mountFlightRecorderCard, exportFileName } from '../../src/diagnostics/panel.js';
import { createStorage } from '../vitest.setup.js';

const noTimer = { setTimeout: () => 1, clearTimeout: () => {} };

describe('GPS tap: no extra watch, active round only, hard floor and cap', () => {
    beforeEach(() => { AppState.activeRoundId = null; AppState.currentHole = 1; document.body.innerHTML = ''; });

    it('ignores fixes outside a round (late callbacks after end/cancel)', () => {
        const rec = vi.fn();
        const tap = makeGpsTap(rec, () => 1e6);
        tap({ accuracyM: 4, at: 1e6 });
        expect(rec).not.toHaveBeenCalled();
    });

    it('throttles to GPS_EVERY_MS, with a GPS_MIN_MS floor on accuracy-class changes, and caps per session', () => {
        AppState.activeRoundId = 'round_1';
        document.body.innerHTML = '<span id="gps-front">140m</span><span id="gps-middle">152m</span><span id="gps-back">---m</span>';
        let t = 1_000_000;
        const rec = vi.fn();
        const tap = makeGpsTap(rec, () => t);
        tap({ accuracyM: 4, speedMps: 1, at: t - 300, lat: -27, lon: 153 });
        expect(rec).toHaveBeenLastCalledWith('gps', expect.objectContaining({ acc: 4, f: 140, c: 152, b: null, age: 300, hole: 1 }));
        expect(rec.mock.calls[0][1]).not.toHaveProperty('lat');
        t += 1000; tap({ accuracyM: 40, at: t });              // class change but under the floor
        expect(rec).toHaveBeenCalledTimes(1);
        t += GPS_MIN_MS; tap({ accuracyM: 40, at: t });        // class change past the floor
        expect(rec).toHaveBeenCalledTimes(2);
        t += 1000; tap({ accuracyM: 40, at: t });              // same class, too soon
        expect(rec).toHaveBeenCalledTimes(2);
        for (let i = 0; i < GPS_SESSION_MAX + 50; i++) { t += GPS_EVERY_MS; tap({ accuracyM: 5, at: t }); }
        expect(rec).toHaveBeenCalledTimes(GPS_SESSION_MAX);
    });
});

describe('state tap: ids and counts only', () => {
    it('round start/end, hole, score and tab events carry no free text', () => {
        const rec = vi.fn();
        const tap = makeStateTap(rec);
        AppState.currentRoundCourseName = 'Ashgrove Golf Club';
        AppState.currentRoundTee = 'Blue';
        const ev = (property, oldValue, newValue) => ({ detail: { property, oldValue, newValue } });
        tap(ev('activeRoundId', null, 'round_1760000000000'));
        AppState.activeRoundId = 'round_1760000000000';
        tap(ev('currentHole', 1, 2));
        tap(ev('liveRoundGroups', [], [{ name: 'Alex Smith', notes: 'private' }]));
        tap(ev('activeTab', null, 'tab-oncourse'));
        tap(ev('activeRoundId', 'round_1760000000000', null));
        const kinds = rec.mock.calls.map(c => c[0]);
        expect(kinds).toEqual(['round_start', 'hole', 'score', 'tab', 'round_end']);
        expect(JSON.stringify(rec.mock.calls)).not.toMatch(/Alex|private|Ashgrove Golf Club/);
        AppState.activeRoundId = null;
    });
});

describe('account switch on a shared phone clears the previous journal', () => {
    it('a different uid clears; the same uid keeps; only a hash tag is stored', async () => {
        const st = createStorage();
        const rec = { clearAll: vi.fn(async () => true) };
        // First sign-in on this phone: an untagged journal is unowned, so it is cleared once.
        expect(await noteAccount('uidA0000000000000000000000000', rec, st)).toBe(true);
        expect(await noteAccount('uidA0000000000000000000000000', rec, st)).toBe(true);
        expect(rec.clearAll).toHaveBeenCalledTimes(1);
        expect(await noteAccount('uidB0000000000000000000000000', rec, st)).toBe(true);
        expect(rec.clearAll).toHaveBeenCalledTimes(2);
        expect(st.getItem('golf.flightrec.acct')).toMatch(/^[0-9a-f]{16}$/);
        expect(st.getItem('golf.flightrec.acct')).not.toContain('uidB');
    });
});

describe('persistence: recorder storage goes before any round backup', () => {
    beforeEach(() => { localStorage.clear(); _resetRecorderForTests(); });

    it('round-state quota failure releases the recorder copy, retries, and keeps backups', () => {
        AppState.currentUser = { uid: 'u1' };
        AppState.liveRoundGroups = [{ uid: 'u1', name: 'A', scores: {}, compStats: {}, simpleStats: {} }];
        AppState.currentHole = 3;
        AppState.activeRoundId = 'round_77';
        localStorage.setItem('round_backup_1', 'B1');
        localStorage.setItem(LOCAL_KEY, 'x'.repeat(1000));
        const proto = Object.getPrototypeOf(localStorage);
        const real = proto.setItem;
        let full = true, calls = 0;
        const spy = vi.spyOn(proto, 'setItem').mockImplementation(function (k, v) {
            if (k === 'golf_round_state') {
                calls++;
                if (full && localStorage.getItem(LOCAL_KEY) !== null) { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; }
            }
            return real.call(this, k, v);
        });
        try { expect(() => saveRoundState()).not.toThrow(); } finally { spy.mockRestore(); }
        expect(calls).toBe(2);
        expect(localStorage.getItem(LOCAL_KEY)).toBeNull();
        expect(localStorage.getItem('round_backup_1')).toBe('B1');
        expect(JSON.parse(localStorage.getItem('golf_round_state')).currentHole).toBe(3);
        AppState.activeRoundId = null;
    });
});

describe('Settings card and export', () => {
    it('mounts after #app-update-card with classes only and a truthful status', async () => {
        document.body.innerHTML = '<div><div id="app-update-card"></div></div>';
        const card = mountFlightRecorderCard();
        expect(card).not.toBeNull();
        expect(card.querySelectorAll('[id]')).toHaveLength(0);
        expect(document.querySelector('#app-update-card + .flightrec-card')).toBe(card);
        expect(card.querySelector('.flightrec-status').textContent).toMatch(/^On|Diagnostics/);
        clearInterval(card._flightrecInterval);
    });

    it('statusText distinguishes saved, waiting, failed, memory-only and self-disabled', () => {
        expect(statusText({ enabled: true, storage: 'idb', committed: 5, queued: 2, failed: 0, dropped: 0, evicted: 0 })).toBe('On · 5 saved · 2 waiting · storing on this phone');
        expect(statusText({ enabled: true, storage: 'memory', committed: 0, queued: 0, failed: 3, dropped: 1, evicted: 0 })).toMatch(/NOT being saved.*3 could not be saved.*1 skipped/);
        expect(statusText({ enabled: true, disabledReason: 'recorder-faults' })).toMatch(/stopped itself/);
        expect(statusText({ enabled: false })).toBe('Diagnostics off.');
    });

    it('a cancelled share keeps the data and says so; no share API falls back to download', async () => {
        const rec = createRecorder({ backends: [], storage: createStorage(), ...noTimer });
        rec.record('hole', { hole: 1 });
        const nav = { canShare: () => true, share: vi.fn(async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); }) };
        const r1 = await exportDiagnostics(rec, nav, document);
        expect(r1).toEqual({ ok: false, msg: 'Share cancelled. Nothing was deleted.' });
        URL.createObjectURL = vi.fn(() => 'blob:x');
        URL.revokeObjectURL = vi.fn();
        const r2 = await exportDiagnostics(rec, {}, document);
        expect(r2.ok).toBe(true);
        expect(r2.msg).toMatch(/Download started/);
        expect(rec.status().window).toBe(1); // nothing deleted
        expect(exportFileName(new Date(2026, 9, 18, 6, 5))).toBe('golf-diagnostics-20261018-0605.json');
    });

    it('a broken Blob/download path reports failure truthfully', async () => {
        const rec = createRecorder({ backends: [], storage: createStorage(), ...noTimer });
        URL.createObjectURL = vi.fn(() => { throw new Error('no blobs'); });
        const r = await exportDiagnostics(rec, {}, document);
        expect(r).toEqual({ ok: false, msg: 'Export failed on this device. Nothing was deleted.' });
    });
});

// ---- cloud ------------------------------------------------------------------
const UID = 'alexuid000000000000000000000';
function rig({ cfg = { enabled: true, uid: UID }, write } = {}) {
    let t = 1_760_000_000_000;
    const rows = new Map();
    const be = {
        name: 'idb',
        async put(b, json) { rows.set(b.key, json); return { evicted: 0 }; },
        async keys() { return [...rows.keys()].sort(); },
        async get(k) { const v = rows.get(k); return v ? { key: k, ...JSON.parse(v) } : null; },
        async list() { return []; }, async clear() { rows.clear(); },
    };
    const st = createStorage();
    const rec = createRecorder({ backends: [be], storage: st, now: () => t, ...noTimer, sessionId: 'abcdefabcdef', owner: '0123456789abcdef' });
    const config = { current: cfg };
    const writes = [];
    const up = createCloudUploader({ isolation: () => 'confirmed',
        rec, storage: st, now: () => t, online: () => true,
        getConfig: vi.fn(async () => config.current),
        writeChunk: write || vi.fn(async (u, id, data) => { writes.push({ u, id, data }); }),
    });
    return { rec, up, st, writes, config, rows, advance: ms => { t += ms; } };
}
async function commitOne(r, hole = 1) { r.rec.record('hole', { hole }); await r.rec.flush(); }

describe('cloud upload: eligibility and kill switch', () => {
    beforeEach(() => { vi.useRealTimers(); });

    it('no config doc (the default) means nothing is ever uploaded', async () => {
        const r = rig({ cfg: null });
        await r.up.start(UID);
        await commitOne(r);
        await r.up.tick();
        expect(r.writes).toHaveLength(0);
        expect(r.up.status()).toMatchObject({ state: 'off', reason: 'not-eligible' });
        expect(cloudStatusText(r.up.status())).toMatch(/off \(not enabled for this account\)/);
    });

    it('account isolation not confirmed: nothing is uploaded even when eligible', async () => {
        const r = rig();
        const up = createCloudUploader({ isolation: () => 'failed', rec: r.rec, storage: r.st, online: () => true, getConfig: async () => ({ enabled: true, uid: UID }), writeChunk: vi.fn(async () => {}) });
        await up.start(UID);
        await commitOne(r);
        await up.tick();
        expect(up.status()).toMatchObject({ state: 'off', reason: 'not-isolated' });
    });

    it('a config naming another uid, or enabled !== true, is not eligible', async () => {
        for (const cfg of [{ enabled: true, uid: 'someoneelse0000000000000000' }, { enabled: 'true', uid: UID }, { uid: UID }]) {
            const r = rig({ cfg });
            await r.up.start(UID);
            await commitOne(r);
            await r.up.tick();
            expect(r.writes).toHaveLength(0);
        }
    });

    it('uploads only COMMITTED batches, one chunk per tick, with idempotent ids', async () => {
        const r = rig();
        r.rec.record('hole', { hole: 1 });
        await r.up.start(UID);
        await r.up.tick();
        expect(r.writes).toHaveLength(0); // queued, not committed: nothing to send
        await r.rec.flush();
        r.advance(1000); await commitOne(r, 2);
        await r.up.tick();
        expect(r.writes).toHaveLength(1);
        expect(r.writes[0].id).toBe('abcdefabcdef_0');
        expect(r.writes[0].u).toBe(UID);
        await r.up.tick();
        expect(r.writes.map(w => w.id)).toEqual(['abcdefabcdef_0', 'abcdefabcdef_1']);
        expect(JSON.parse(r.st.getItem(ACKED_KEY))).toEqual(['abcdefabcdef_0', 'abcdefabcdef_1']);
    });

    it('acknowledged ids survive a reload and are not resent', async () => {
        const r = rig();
        await r.up.start(UID);
        await commitOne(r);
        await r.up.tick();
        const up2 = createCloudUploader({ isolation: () => 'confirmed', rec: r.rec, storage: r.st, online: () => true, getConfig: async () => ({ enabled: true, uid: UID }), writeChunk: vi.fn(async () => {}) });
        await up2.start(UID); // backlog scan finds the same committed batch
        await up2.tick();
        expect(r.writes).toHaveLength(1);
    });

    it('kill switch: config turned off mid-session stops uploads', async () => {
        const r = rig();
        await r.up.start(UID);
        await commitOne(r);
        await r.up.tick();
        r.config.current = { enabled: false, uid: UID };
        r.advance(CLOUD_CAPS.CONFIG_TTL_MS + 1);
        await commitOne(r, 3);
        await r.up.tick();
        expect(r.writes).toHaveLength(1);
        expect(r.up.status()).toMatchObject({ state: 'off', reason: 'killed' });
    });

    it('server refusal or an unacknowledged write stops for the session; errors back off then stop', async () => {
        const denied = rig({ write: async () => { throw Object.assign(new Error('x'), { code: 'permission-denied' }); } });
        await denied.up.start(UID); await commitOne(denied); await denied.up.tick();
        expect(denied.up.status().reason).toBe('refused');

        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const hang = rig({ write: () => new Promise(() => {}) });
        await hang.up.start(UID); await commitOne(hang);
        const p = hang.up.tick();
        await vi.advanceTimersByTimeAsync(CLOUD_CAPS.ACK_TIMEOUT_MS + 10);
        await p;
        expect(hang.up.status().reason).toBe('unacked');
        vi.useRealTimers();

        let n = 0;
        const flaky = rig({ write: async () => { n++; throw Object.assign(new Error('x'), { code: 'unavailable' }); } });
        await flaky.up.start(UID); await commitOne(flaky);
        for (let i = 0; i < 5; i++) await flaky.up.tick();
        expect(n).toBe(CLOUD_CAPS.MAX_FAILURES);
        expect(flaky.up.status().reason).toBe('errors');
    });

    it('daily write cap is enforced from storage', async () => {
        const r = rig();
        r.st.setItem('golf.flightrec.uploadDay', JSON.stringify({ day: new Date(1_760_000_000_000).toISOString().slice(0, 10), n: CLOUD_CAPS.DAY_WRITES }));
        await r.up.start(UID); await commitOne(r); await r.up.tick();
        expect(r.writes).toHaveLength(0);
        expect(r.up.status().reason).toBe('day-cap');
    });

    it('chunkDoc re-sanitizes, fixes the field set and the 30-day expiry', () => {
        const d = chunkDoc({ sid: 'abcdefabcdef', seq: 4, build: 'v7.0.0+unknown', t: 1000, events: [{ t: 1, k: 'gps', acc: 3, email: 'a@b.co' }, { t: 2, k: 'bogus' }] });
        expect(Object.keys(d).sort()).toEqual(['build', 'events', 'expireAt', 'n', 'seq', 'sid', 'v']);
        expect(d.n).toBe(1);
        expect(d.events).toBe('[{"t":1,"k":"gps","acc":3}]');
        expect(d.expireAt).toBe(1000 + 30 * 24 * 3600 * 1000);
        expect(chunkId({ sid: 'abcdefabcdef', seq: 4 })).toBe('abcdefabcdef_4');
    });
});
