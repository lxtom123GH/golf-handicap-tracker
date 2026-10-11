// ==========================================
// update-watch.js — "is there a new version?" made visible
// ==========================================
//
// Owner, 2026-09-19: "I couldn't tell when I just reopened the Golf app
// whether there's a new version or not." Two things answer that:
//
// 1. An "Updated to …" toast on the first run of a new build. app-v4.js's
//    boot check already notices the build commit changed; it now leaves a
//    flag (localStorage 'app_version_announce') that bootstrap turns into a
//    toast once, so a golfer who opens the app after a deploy is told.
//
// 2. A "New version available" banner while the app is open. The shell is
//    network-first and sw.js's cache name is a constant, so the
//    service-worker 'updatefound' pattern (GI-bravo) never fires here. The
//    build emits /version.json (vite.config.js) and this module fetches it
//    with cache: 'no-store' when the app comes to the foreground, when the
//    browser comes back online, and every 15 minutes while visible. A
//    different commit → the banner, with Reload and Later. Later silences
//    that commit until the next one ships.
//
// Sydney: the banner and toast are static elements in index.html toggled by
// class; nothing here writes style.display. Reloading mid-round is safe —
// the round lives in localStorage (persistence.js PERSIST_FIELDS).

export const VERSION_URL = '/version.json';
export const POLL_MS = 15 * 60 * 1000;
export const ANNOUNCE_KEY = 'app_version_announce';
const TOAST_MS = 6000;

/** The build this bundle was stamped with (vite define). Nulls in dev/tests. */
export function currentBuild() {
    return {
        version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : null,
        commit: typeof __BUILD_COMMIT__ !== 'undefined' ? __BUILD_COMMIT__ : null,
        stamp: typeof __BUILD_STAMP__ !== 'undefined' ? __BUILD_STAMP__ : null,
    };
}

/**
 * Pure: is the remote build a different deploy from the running one?
 * A dev build ('local' commit) or an unstamped bundle never nags.
 */
export function isNewerBuild(remote, local) {
    if (!remote || typeof remote.commit !== 'string' || !remote.commit) return false;
    if (!local || typeof local.commit !== 'string' || !local.commit || local.commit === 'local') return false;
    return remote.commit !== local.commit;
}

/**
 * Fetch /version.json bypassing every cache. Returns null on any failure,
 * including the dev server's SPA fallback (index.html is not JSON).
 */
export async function fetchRemoteBuild(fetchImpl = globalThis.fetch) {
    try {
        if (typeof fetchImpl !== 'function') return null;
        const res = await fetchImpl(VERSION_URL, { cache: 'no-store' });
        if (!res || !res.ok) return null;
        const type = res.headers?.get?.('content-type') || '';
        if (!type.includes('json')) return null;
        const data = await res.json();
        return data && typeof data.commit === 'string' ? data : null;
    } catch {
        return null;
    }
}

/** Pure: the toast text for a pending announcement, or null when none. */
export function updatedMessage(announce, local = currentBuild()) {
    if (!announce || !local?.version || !local?.commit) return null;
    if (announce !== `${local.version}+${local.commit}`) return null;
    const built = local.stamp ? ` · built ${local.stamp}` : '';
    return `Updated to ${local.version} · ${local.commit}${built}`;
}

/** Show the status toast (#update-toast) for TOAST_MS. Class-toggled. */
export function showUpdateToast(message, doc = document) {
    const el = doc.getElementById('update-toast');
    if (!el) return false;
    el.textContent = message;
    el.classList.remove('hidden');
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => el.classList.add('hidden'), TOAST_MS);
    return true;
}

/**
 * Boot: if the previous run recorded a build change, say so once.
 * @returns {string|null} the message shown, or null
 */
export function announcePendingUpdate({ storage = null, local = currentBuild(), doc = document } = {}) {
    try {
        const store = storage || localStorage;
        const message = updatedMessage(store.getItem(ANNOUNCE_KEY), local);
        if (!message) return null;
        store.removeItem(ANNOUNCE_KEY);
        showUpdateToast(message, doc);
        return message;
    } catch (e) {
        console.warn('[Update] announcement skipped (storage unavailable):', e);
        return null;
    }
}

let _onReload = null;
let _onLater = null;

/** Show #update-banner for `remote`; Reload/Later are bound once. */
export function showUpdateBanner(remote, { onReload = null, onLater = null, doc = document } = {}) {
    const el = doc.getElementById('update-banner');
    if (!el) return false;
    const text = doc.getElementById('update-banner-text');
    if (text) {
        const what = remote?.version ? ` (${remote.version} · ${remote.commit})` : '';
        text.textContent = `New version available${what}. Your round is saved — reload when ready.`;
    }
    _onReload = onReload || (() => location.reload());
    _onLater = onLater || (() => { });
    if (!el.dataset.bound) {
        el.dataset.bound = '1';
        doc.getElementById('btn-update-reload')?.addEventListener('click', () => { _onReload?.(); });
        doc.getElementById('btn-update-later')?.addEventListener('click', () => { hideUpdateBanner(doc); _onLater?.(); });
    }
    el.classList.remove('hidden');
    return true;
}

export function hideUpdateBanner(doc = document) {
    doc.getElementById('update-banner')?.classList.add('hidden');
}

/**
 * Start watching for a newer deploy. Returns { check, stop }.
 * `check()` resolves true when a banner was shown.
 */
export function startUpdateWatch({
    fetchImpl = globalThis.fetch,
    intervalMs = POLL_MS,
    local = currentBuild(),
    doc = document,
    win = window,
    onNewer = null,
} = {}) {
    let dismissedCommit = null;
    let timer = null;

    /**
     * @param {{force?: boolean}} [opts] force: ignore an earlier "Later" —
     *   the golfer asked explicitly (the Settings button).
     */
    async function check({ force = false } = {}) {
        if (win.navigator && win.navigator.onLine === false) return false;
        const remote = await fetchRemoteBuild(fetchImpl);
        if (!isNewerBuild(remote, local)) return false;
        if (!force && remote.commit === dismissedCommit) return false;
        if (onNewer) onNewer(remote);
        else showUpdateBanner(remote, { doc, onLater: () => { dismissedCommit = remote.commit; } });
        return true;
    }

    const onVisible = () => { if (doc.visibilityState === 'visible') check(); };
    const onOnline = () => { check(); };
    doc.addEventListener('visibilitychange', onVisible);
    win.addEventListener('online', onOnline);
    if (intervalMs > 0) {
        timer = setInterval(() => { if (doc.visibilityState !== 'hidden') check(); }, intervalMs);
    }

    function stop() {
        doc.removeEventListener('visibilitychange', onVisible);
        win.removeEventListener('online', onOnline);
        if (timer) clearInterval(timer);
        timer = null;
    }

    return { check, stop };
}

/**
 * Owner 2026-09-20 ("what button do I press to see if there's an update?"):
 * the Settings card. Shows the running build and wires "Check for updates"
 * to the watcher's forced check. Returns the status text it settled on (for
 * tests), or null when the markup is absent.
 */
export function bindCheckForUpdates(watch, { doc = document, local = currentBuild(), win = window } = {}) {
    const btn = doc.getElementById('btn-check-updates');
    const status = doc.getElementById('check-updates-status');
    const build = doc.getElementById('settings-build');
    if (build) {
        build.textContent = local.version
            ? `${local.version} · ${local.commit || 'local'}${local.stamp ? ` · built ${local.stamp}` : ''}`
            : 'development build';
    }
    if (!btn || !watch) return null;
    const say = (t) => { if (status) status.textContent = t; };
    btn.addEventListener('click', async () => {
        if (win.navigator && win.navigator.onLine === false) { say('You are offline. Try again when connected.'); return; }
        btn.disabled = true;
        say('Checking…');
        try {
            const newer = await watch.check({ force: true });
            say(newer
                ? 'A newer version is available. Use the banner at the bottom to reload.'
                : `You are on the latest version (${local.version || 'dev'} · ${local.commit || 'local'}).`);
        } catch {
            say('Could not reach the server. Try again shortly.');
        } finally {
            btn.disabled = false;
        }
    });
    return status ? status.textContent : '';
}
