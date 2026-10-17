// Flight recorder entry point, called once from app bootstrap. Everything is
// best effort: any failure leaves the app exactly as it was without a recorder.

import { startFlightRecorder, noteAccount } from './hooks.js';
import { mountFlightRecorderCard, setCloudStatusSource } from './panel.js';
import { cloudStatusText } from './cloud-upload.js';

const CLOUD_DELAY_MS = 30000; // let boot, auth and the round restore settle first

export function bootFlightRecorder() {
    try { startFlightRecorder(); } catch { /* ignore */ }
    try { mountFlightRecorderCard(); } catch { /* ignore */ }
    let uploader = null;
    let currentUid = null;
    let cloudTimer = null;
    try { setCloudStatusSource(() => cloudStatusText(uploader ? uploader.status() : { state: 'off', reason: currentUid ? 'not-eligible' : 'not-started' })); } catch { /* ignore */ }
    Promise.all([import('../firebase-config.js'), import('firebase/auth')])
        .then(([{ auth }, { onAuthStateChanged }]) => {
            onAuthStateChanged(auth, user => {
                try {
                    const uid = user?.uid || null;
                    if (uid === currentUid) return;
                    if (uploader) { uploader.stop('signed-out'); uploader = null; }
                    if (cloudTimer) { clearTimeout(cloudTimer); cloudTimer = null; }
                    currentUid = uid;
                    noteAccount(uid).catch(() => {});
                    if (!uid) return;
                    cloudTimer = setTimeout(() => {
                        cloudTimer = null;
                        if (currentUid !== uid) return;
                        import('./cloud-upload.js')
                            .then(m => m.startCloudUpload(uid))
                            .then(up => { if (currentUid === uid) uploader = up; else up?.stop('signed-out'); })
                            .catch(() => { /* cloud stays off; local recording is unaffected */ });
                    }, CLOUD_DELAY_MS);
                } catch { /* ignore */ }
            });
        })
        .catch(() => { /* no auth module: local recording only */ });
}
