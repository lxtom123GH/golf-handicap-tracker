/** Owns only the overlay's lock; the existing manual toggle stays independent. */
export function createOverlayWakeLock(isOpen) {
    let sentinel = null, generation = 0, pending = false;
    const release = lock => { try { Promise.resolve(lock?.release()).catch(() => {}); } catch (_) { /* browser revoked it */ } };
    function clear() {
        generation++;
        pending = false;
        const lock = sentinel;
        sentinel = null;
        release(lock);
    }
    async function sync() {
        if (!isOpen() || document.visibilityState !== 'visible') { clear(); return; }
        if (!navigator.wakeLock?.request || sentinel || pending) return;
        const ticket = ++generation;
        pending = true;
        try {
            const lock = await navigator.wakeLock.request('screen');
            if (ticket !== generation || !isOpen() || document.visibilityState !== 'visible') {
                release(lock);
                return;
            }
            sentinel = lock;
            lock.addEventListener('release', () => { if (sentinel === lock) sentinel = null; });
        } catch (_) { /* unavailable or denied: distances still work */ }
        finally { if (ticket === generation) pending = false; }
    }
    document.addEventListener('visibilitychange', sync);
    return { sync, destroy() { clear(); document.removeEventListener('visibilitychange', sync); } };
}
