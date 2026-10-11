// ==========================================================================
// update-watch.test.js — "is there a new version?" (owner, 2026-09-19)
// ==========================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    isNewerBuild, fetchRemoteBuild, updatedMessage, announcePendingUpdate,
    showUpdateBanner, hideUpdateBanner, startUpdateWatch, bindCheckForUpdates, ANNOUNCE_KEY,
} from '../../src/update-watch.js';

const LOCAL = { version: 'v7.0.0', commit: 'abc1234', stamp: '19 Sep, 8:40 pm' };

function mountDom() {
    document.body.innerHTML = `
        <div id="update-toast" class="hidden" role="status"></div>
        <div id="update-banner" class="hidden" role="status">
            <span id="update-banner-text"></span>
            <button type="button" id="btn-update-reload">Reload</button>
            <button type="button" id="btn-update-later">Later</button>
        </div>`;
}

const jsonResponse = (body, ok = true) => ({
    ok,
    headers: { get: () => 'application/json; charset=utf-8' },
    json: async () => body,
});
const htmlResponse = () => ({ ok: true, headers: { get: () => 'text/html' }, json: async () => { throw new Error('not json'); } });

beforeEach(() => { mountDom(); localStorage.clear(); });

describe('isNewerBuild — pure', () => {
    it('true only when both commits exist and differ', () => {
        expect(isNewerBuild({ commit: 'def5678' }, LOCAL)).toBe(true);
        expect(isNewerBuild({ commit: 'abc1234' }, LOCAL)).toBe(false);
    });
    it('never nags a dev build, an unstamped bundle or a broken remote', () => {
        expect(isNewerBuild({ commit: 'def5678' }, { ...LOCAL, commit: 'local' })).toBe(false);
        expect(isNewerBuild({ commit: 'def5678' }, { ...LOCAL, commit: null })).toBe(false);
        expect(isNewerBuild(null, LOCAL)).toBe(false);
        expect(isNewerBuild({ commit: '' }, LOCAL)).toBe(false);
    });
});

describe('fetchRemoteBuild — no-store, null on anything but JSON with a commit', () => {
    it('asks for /version.json with cache: no-store and returns the body', async () => {
        const fetchImpl = vi.fn(async () => jsonResponse({ version: 'v7.0.1', commit: 'def5678' }));
        const remote = await fetchRemoteBuild(fetchImpl);
        expect(fetchImpl).toHaveBeenCalledWith('/version.json', { cache: 'no-store' });
        expect(remote.commit).toBe('def5678');
    });
    it('returns null for the SPA fallback (HTML), a non-OK status, a throw, or no commit', async () => {
        expect(await fetchRemoteBuild(async () => htmlResponse())).toBeNull();
        expect(await fetchRemoteBuild(async () => jsonResponse({ commit: 'x' }, false))).toBeNull();
        expect(await fetchRemoteBuild(async () => { throw new Error('offline'); })).toBeNull();
        expect(await fetchRemoteBuild(async () => jsonResponse({ version: 'v1' }))).toBeNull();
    });
});

describe('the "Updated to …" toast on the first run of a new build', () => {
    it('updatedMessage matches the announce flag to the running build', () => {
        expect(updatedMessage('v7.0.0+abc1234', LOCAL)).toBe('Updated to v7.0.0 · abc1234 · built 19 Sep, 8:40 pm');
        expect(updatedMessage('v7.0.0+old', LOCAL)).toBeNull();
        expect(updatedMessage(null, LOCAL)).toBeNull();
        expect(updatedMessage('v7.0.0+abc1234', { version: null, commit: null })).toBeNull();
    });
    it('announcePendingUpdate shows the toast once and clears the flag', () => {
        localStorage.setItem(ANNOUNCE_KEY, 'v7.0.0+abc1234');
        const message = announcePendingUpdate({ local: LOCAL });
        expect(message).toContain('Updated to v7.0.0');
        const toast = document.getElementById('update-toast');
        expect(toast.classList.contains('hidden')).toBe(false);
        expect(toast.textContent).toBe(message);
        expect(localStorage.getItem(ANNOUNCE_KEY)).toBeNull();
        // Second boot: nothing pending, nothing shown.
        toast.classList.add('hidden');
        expect(announcePendingUpdate({ local: LOCAL })).toBeNull();
        expect(toast.classList.contains('hidden')).toBe(true);
    });
    it('blocked storage degrades to no toast, not a throw', () => {
        const storage = { getItem() { throw new Error('insecure'); }, removeItem() { } };
        expect(() => announcePendingUpdate({ storage, local: LOCAL })).not.toThrow();
        expect(announcePendingUpdate({ storage, local: LOCAL })).toBeNull();
    });
});

describe('the banner', () => {
    it('shows with the remote build named; Later hides it and reports back; Reload calls the handler', () => {
        const onReload = vi.fn(), onLater = vi.fn();
        expect(showUpdateBanner({ version: 'v7.0.1', commit: 'def5678' }, { onReload, onLater })).toBe(true);
        const el = document.getElementById('update-banner');
        expect(el.classList.contains('hidden')).toBe(false);
        expect(document.getElementById('update-banner-text').textContent).toContain('v7.0.1 · def5678');
        document.getElementById('btn-update-later').click();
        expect(el.classList.contains('hidden')).toBe(true);
        expect(onLater).toHaveBeenCalledTimes(1);
        showUpdateBanner({ commit: 'def5678' }, { onReload, onLater });
        document.getElementById('btn-update-reload').click();
        expect(onReload).toHaveBeenCalledTimes(1);
        hideUpdateBanner();
        expect(el.classList.contains('hidden')).toBe(true);
    });
    it('never writes style.display (Sydney) and is a no-op without the markup', () => {
        showUpdateBanner({ commit: 'def5678' }, { onReload: () => { } });
        expect(document.getElementById('update-banner').style.display).toBe('');
        document.body.innerHTML = '';
        expect(showUpdateBanner({ commit: 'def5678' })).toBe(false);
    });
});

describe('startUpdateWatch', () => {
    it('checks on foreground and on online; shows the banner for a newer commit', async () => {
        const fetchImpl = vi.fn(async () => jsonResponse({ version: 'v7.0.1', commit: 'def5678' }));
        const watch = startUpdateWatch({ fetchImpl, local: LOCAL, intervalMs: 0 });
        expect(await watch.check()).toBe(true);
        expect(document.getElementById('update-banner').classList.contains('hidden')).toBe(false);
        watch.stop();
    });
    it('Later silences that commit; a newer one shows again', async () => {
        let commit = 'def5678';
        const fetchImpl = vi.fn(async () => jsonResponse({ commit }));
        const watch = startUpdateWatch({ fetchImpl, local: LOCAL, intervalMs: 0 });
        await watch.check();
        document.getElementById('btn-update-later').click();
        expect(await watch.check()).toBe(false);
        commit = '9999999';
        expect(await watch.check()).toBe(true);
        watch.stop();
    });
    it('stays quiet offline, on the same commit, and in a dev build', async () => {
        const fetchImpl = vi.fn(async () => jsonResponse({ commit: 'def5678' }));
        const offlineWin = { navigator: { onLine: false }, addEventListener() { }, removeEventListener() { } };
        const w1 = startUpdateWatch({ fetchImpl, local: LOCAL, intervalMs: 0, win: offlineWin });
        expect(await w1.check()).toBe(false);
        expect(fetchImpl).not.toHaveBeenCalled();
        w1.stop();
        const w2 = startUpdateWatch({ fetchImpl: async () => jsonResponse({ commit: 'abc1234' }), local: LOCAL, intervalMs: 0 });
        expect(await w2.check()).toBe(false);
        w2.stop();
        const w3 = startUpdateWatch({ fetchImpl, local: { ...LOCAL, commit: 'local' }, intervalMs: 0 });
        expect(await w3.check()).toBe(false);
        w3.stop();
    });
    it('a forced check ignores an earlier Later (the Settings button asks explicitly)', async () => {
        const fetchImpl = vi.fn(async () => jsonResponse({ commit: 'def5678' }));
        const watch = startUpdateWatch({ fetchImpl, local: LOCAL, intervalMs: 0 });
        await watch.check();
        document.getElementById('btn-update-later').click();
        expect(await watch.check()).toBe(false);
        expect(await watch.check({ force: true })).toBe(true);
        expect(document.getElementById('update-banner').classList.contains('hidden')).toBe(false);
        watch.stop();
    });
    it('the online event and a visible visibilitychange trigger a check; stop() unhooks them', async () => {
        const fetchImpl = vi.fn(async () => jsonResponse({ commit: 'def5678' }));
        const watch = startUpdateWatch({ fetchImpl, local: LOCAL, intervalMs: 0 });
        window.dispatchEvent(new Event('online'));
        await Promise.resolve(); await Promise.resolve();
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        document.dispatchEvent(new Event('visibilitychange')); // jsdom: visibilityState 'visible'
        await Promise.resolve(); await Promise.resolve();
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        watch.stop();
        window.dispatchEvent(new Event('online'));
        await Promise.resolve(); await Promise.resolve();
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });
});

describe('bindCheckForUpdates — the Settings button (owner 2026-09-20)', () => {
    const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
    function mountSettings() {
        document.body.insertAdjacentHTML('beforeend', `
            <div id="app-update-card">
                <span id="settings-build"></span>
                <button type="button" id="btn-check-updates">Check for updates</button>
                <p id="check-updates-status"></p>
            </div>`);
    }
    it('prints the running build and says "latest" when the server agrees', async () => {
        mountSettings();
        const watch = startUpdateWatch({ fetchImpl: async () => jsonResponse({ commit: 'abc1234' }), local: LOCAL, intervalMs: 0 });
        bindCheckForUpdates(watch, { local: LOCAL });
        expect(document.getElementById('settings-build').textContent).toBe('v7.0.0 · abc1234 · built 19 Sep, 8:40 pm');
        document.getElementById('btn-check-updates').click();
        await settle();
        expect(document.getElementById('check-updates-status').textContent).toContain('latest version (v7.0.0 · abc1234)');
        expect(document.getElementById('update-banner').classList.contains('hidden')).toBe(true);
        watch.stop();
    });
    it('shows the banner and says so when a newer build exists, even after Later', async () => {
        mountSettings();
        const watch = startUpdateWatch({ fetchImpl: async () => jsonResponse({ version: 'v7.0.1', commit: 'def5678' }), local: LOCAL, intervalMs: 0 });
        await watch.check();
        document.getElementById('btn-update-later').click();
        bindCheckForUpdates(watch, { local: LOCAL });
        document.getElementById('btn-check-updates').click();
        await settle();
        expect(document.getElementById('check-updates-status').textContent).toContain('newer version is available');
        expect(document.getElementById('update-banner').classList.contains('hidden')).toBe(false);
        watch.stop();
    });
    it('says offline without fetching, and is a no-op without the markup', async () => {
        mountSettings();
        const fetchImpl = vi.fn(async () => jsonResponse({ commit: 'def5678' }));
        const offlineWin = { navigator: { onLine: false }, addEventListener() { }, removeEventListener() { } };
        const watch = startUpdateWatch({ fetchImpl, local: LOCAL, intervalMs: 0, win: offlineWin });
        bindCheckForUpdates(watch, { local: LOCAL, win: offlineWin });
        document.getElementById('btn-check-updates').click();
        await settle();
        expect(document.getElementById('check-updates-status').textContent).toContain('offline');
        expect(fetchImpl).not.toHaveBeenCalled();
        watch.stop();
        document.body.innerHTML = '';
        expect(bindCheckForUpdates(watch, { local: LOCAL })).toBeNull();
    });
});
