// ==========================================
// wakelock.js
// Screen Wake Lock API Wrapper
// ==========================================

let wakeLock = null;
let isWakeLockEnabled = false;

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
            btn.innerHTML = '☀️ Screen: Always On';
            btn.style.backgroundColor = '#fbbf24'; // Amber
            btn.style.color = '#000';
        } else {
            btn.classList.remove('active');
            btn.innerHTML = '🌙 Screen: Normal';
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
            isWakeLockEnabled = !isWakeLockEnabled;
            if (isWakeLockEnabled) {
                const success = await requestWakeLock();
                if (!success) {
                    isWakeLockEnabled = false;
                    alert("Wake Lock not supported or failed to activate. Keep your screen on manually.");
                }
            } else {
                releaseWakeLock();
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
    }
}
