// ==========================================
// wakelock.js
// Screen Wake Lock API Wrapper
// ==========================================

let wakeLock = null;
let isWakeLockEnabled = false;

// Decision 12 (simplify 2026-10-07): keep-awake remembers the golfer's last
// choice instead of resetting to Off on every launch.
const KEEP_AWAKE_KEY = 'golf.keepAwake';
function rememberKeepAwake(on) {
    try {
        if (on) localStorage.setItem(KEEP_AWAKE_KEY, '1');
        else localStorage.removeItem(KEEP_AWAKE_KEY);
    } catch { /* storage unavailable: the toggle still works for this page */ }
}
function keepAwakeRemembered() {
    try { return localStorage.getItem(KEEP_AWAKE_KEY) === '1'; } catch { return false; }
}

let _applying = null; // a remembered re-apply in flight (a tap waits for it)

/** Re-apply a remembered "keep awake: on" (boot, and again at Start Round,
 * called synchronously inside the tap so iOS sees the gesture).
 * Resolves true when acquired, false when the golfer's "on" could not be
 * honoured, null when there was nothing to do. A call while one is in
 * flight shares its result, so Start Round still warns on a refusal
 * (Codex review P2). A call from a tap (`gesture: true`) while the boot
 * re-apply is still pending asks again inside the tap as well (Codex
 * review P2): iOS can refuse the gesture-less boot request. */
export function applyRememberedWakeLock({ gesture = false } = {}) {
    if (_applying) return gesture ? askAgainInGesture(_applying) : _applying;
    if (!keepAwakeRemembered() || isWakeLockEnabled || !('wakeLock' in navigator)) return Promise.resolve(null);
    isWakeLockEnabled = true;
    updateToggleUI(true); // the golfer's choice shows at once; a tap meanwhile means "off"
    _applying = requestWakeLock().then(ok => {
        if (!ok) { isWakeLockEnabled = false; updateToggleUI(false); }
        return ok;
    }).finally(() => { _applying = null; });
    return _applying;
}

/** Start Round tapped while the boot re-apply is pending: request a lock
 * now, inside the tap, then keep exactly one - the boot lock if it was
 * granted, else this one (unless the golfer has switched keep-awake off
 * meanwhile, or the toggle took its own lock). */
function askAgainInGesture(pending) {
    let extra;
    try { extra = Promise.resolve(navigator.wakeLock.request('screen')).catch(() => null); }
    catch { extra = Promise.resolve(null); }
    return Promise.all([pending, extra]).then(([ok, sentinel]) => {
        const keep = !ok && !isWakeLockEnabled && keepAwakeRemembered();
        if (sentinel && !keep) sentinel.release?.();
        if (ok || isWakeLockEnabled) return true;
        if (!keepAwakeRemembered()) return null; // the golfer turned it off
        if (!sentinel) return false;
        wakeLock = sentinel;
        isWakeLockEnabled = true;
        updateToggleUI(true);
        return true;
    });
}

/**
 * Request Screen Wake Lock
 */
async function requestWakeLock() {
    if (!('wakeLock' in navigator)) {
        console.warn("[WakeLock] API not supported in this browser.");
        return false;
    }

    try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => {
            console.log("[WakeLock] Released.");
        });
        console.log("[WakeLock] Acquired successfully.");
        updateToggleUI(true);
        return true;
    } catch (err) {
        console.error(`[WakeLock] Failed to acquire: ${err.name}, ${err.message}`);
        return false;
    }
}

/**
 * Release Screen Wake Lock
 */
function releaseWakeLock() {
    if (wakeLock) {
        wakeLock.release();
        wakeLock = null;
    }
    updateToggleUI(false);
}

/**
 * Update the visual state of the wake lock buttons
 */
function updateToggleUI(isActive) {
    const btns = document.querySelectorAll('.wakelock-toggle');
    btns.forEach(btn => {
        if (isActive) {
            btn.classList.add('active');
            // Field test 2026-09-13: "🌙 Screen: Normal" read as night mode, and
            // the owner said in three months he would have to toggle it to find
            // out what it did. Name the action and the state.
            btn.innerHTML = '🔆 Keep screen awake: On';
            btn.style.backgroundColor = '#fbbf24'; // Amber
            btn.style.color = '#000';
        } else {
            btn.classList.remove('active');
            btn.innerHTML = '🔅 Keep screen awake: Off';
            btn.style.backgroundColor = '#64748b'; // Slate
            btn.style.color = '#fff';
        }
    });
}

/**
 * Handle visibility changes (auto-reacquire if enabled)
 */
async function handleVisibilityChange() {
    if (wakeLock !== null && document.visibilityState === 'visible' && isWakeLockEnabled) {
        await requestWakeLock();
    }
}

document.addEventListener('visibilitychange', handleVisibilityChange);

/**
 * Initialize Wake Lock toggles
 */
export function initWakeLock() {
    const btns = document.querySelectorAll('.wakelock-toggle');
    btns.forEach(btn => {
        btn.addEventListener('click', async () => {
            // The tap means the opposite of what the button SHOWS now. Read it
            // before waiting: a re-apply that fails meanwhile flips the state
            // to off, and flipping after the wait would turn it back on
            // (Codex review P2).
            const wantOn = !isWakeLockEnabled;
            if (_applying) await _applying; // settle a re-apply before acting
            if (!wantOn && !isWakeLockEnabled) { // already off (the re-apply failed)
                rememberKeepAwake(false);
                updateToggleUI(false);
                return;
            }
            isWakeLockEnabled = wantOn;
            if (isWakeLockEnabled) {
                const success = await requestWakeLock();
                if (!success) {
                    isWakeLockEnabled = false;
                    alert("Wake Lock not supported or failed to activate. Keep your screen on manually.");
                }
                rememberKeepAwake(success);
            } else {
                releaseWakeLock();
                rememberKeepAwake(false);
            }
        });
    });

    // iOS Fallback: Some versions require a video playing or similar, 
    // but the modern API is generally supported in iOS 14+. 
    // No explicit fallback needed for standard browsers, but we check support.
    if (!('wakeLock' in navigator)) {
        btns.forEach(btn => {
            btn.style.opacity = '0.5';
            btn.innerHTML = '🚫 Wake Lock Unsupported';
            btn.disabled = true;
        });
        return;
    }
    // Boot has no tap: if iOS refuses the remembered "on" here (a tab
    // reloaded mid-round has no Start Round tap to retry it), try again on
    // the golfer's next touch, which is a gesture.
    // A touch ON the keep-awake toggle is the golfer deciding: leave it to
    // the toggle's own handler (a retry here would flip the button before
    // the click reads it and invert the tap; Codex review P2).
    applyRememberedWakeLock().then(ok => {
        if (ok !== false) return;
        const retry = (e) => {
            document.removeEventListener('pointerdown', retry, true);
            if (e.target?.closest?.('.wakelock-toggle')) return;
            applyRememberedWakeLock().catch(() => {});
        };
        document.addEventListener('pointerdown', retry, true);
    }).catch(() => {});
}
