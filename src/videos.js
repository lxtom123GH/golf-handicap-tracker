// ==========================================
// videos.js — swing-video upload, library & quotas (BL-VID-01, video plan P2)
// ==========================================
//
// Files live in Storage at videos/{uid}/{id}.{ext} (owner-write, owner+coach+
// admin read, 100 MB/file rules cap). Metadata lives in the Firestore `videos`
// collection. Per-user totals are tracked on the user doc:
//   videoQuotaBytes — admin-set limit (default 500 MB when absent)
//   videoBytesUsed  — running total, updated transactionally on upload/delete
// Quota enforcement is client-side (honest-user grade — these are mates, and
// the 100 MB/file Storage rule bounds the abuse ceiling); upgrade path if
// strangers ever join: function-issued upload URLs (noted in MASTER_BACKLOG).

import { db, storage, auth, functions } from './firebase-config.js';
import { httpsCallable } from 'firebase/functions';
import {
    collection, query, where, orderBy, getDocs, addDoc, deleteDoc, doc,
    getDoc, serverTimestamp, runTransaction, increment, updateDoc
} from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { AppState } from './state.js';
import { escapeHtml } from './escape.js';
import { showToast } from './modules/score-input.js';

export const DEFAULT_QUOTA_BYTES = 500 * 1024 * 1024; // 500 MB unless admin raises it
const MAX_FILE_BYTES = 100 * 1024 * 1024;             // mirrors the Storage rule

export function formatBytes(n) {
    if (!Number.isFinite(n) || n <= 0) return '0 MB';
    const mb = n / (1024 * 1024);
    return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

async function quotaFor(uid) {
    const snap = await getDoc(doc(db, 'users', uid));
    const d = snap.exists() ? snap.data() : {};
    return {
        quota: Number(d.videoQuotaBytes) > 0 ? Number(d.videoQuotaBytes) : DEFAULT_QUOTA_BYTES,
        used: Number(d.videoBytesUsed) || 0
    };
}

async function bumpUsage(uid, deltaBytes) {
    await updateDoc(doc(db, 'users', uid), { videoBytesUsed: increment(deltaBytes) });
}

/** Upload one video for the signed-in user. Returns the new doc id. */
async function uploadVideo(file, { angle, note }, onProgress) {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('Not signed in.');
    if (!file.type.startsWith('video/')) throw new Error('That file is not a video.');
    if (file.size >= MAX_FILE_BYTES) throw new Error(`Videos are capped at ${formatBytes(MAX_FILE_BYTES)} each — trim the clip first.`);

    const { quota, used } = await quotaFor(uid);
    if (used + file.size > quota) {
        throw new Error(`This would exceed your ${formatBytes(quota)} video allowance `
            + `(${formatBytes(used)} used). Delete an old video or ask the admin for more room.`);
    }

    const ext = (file.name.split('.').pop() || 'mp4').toLowerCase();
    const path = `videos/${uid}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const task = uploadBytesResumable(storageRef(storage, path), file, { contentType: file.type });

    await new Promise((resolve, reject) => {
        task.on('state_changed',
            s => onProgress && onProgress(Math.round((s.bytesTransferred / s.totalBytes) * 100)),
            reject, resolve);
    });

    const docRef = await addDoc(collection(db, 'videos'), {
        uid, path,
        bytes: file.size,
        contentType: file.type,
        angle: angle || 'Other',
        note: note || '',
        createdAt: serverTimestamp()
    });
    await bumpUsage(uid, file.size);
    return docRef.id;
}

async function deleteVideo(v) {
    await deleteObject(storageRef(storage, v.path)).catch(err => {
        // Missing file shouldn't strand the metadata (e.g. emulator wipe).
        if (err.code !== 'storage/object-not-found') throw err;
    });
    await deleteDoc(doc(db, 'videos', v.id));
    await bumpUsage(v.uid, -v.bytes);
}

/**
 * Render a user's video library into a container. Shared by the Practice tab
 * (self, canDelete) and the Coach dashboard (student, read-only).
 */
export async function renderVideoLibrary(uid, container, { canDelete = false } = {}) {
    if (!container) return;
    container.innerHTML = '<p style="color:#94a3b8;">Loading videos…</p>';
    try {
        const q = query(collection(db, 'videos'), where('uid', '==', uid), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        if (snap.empty) {
            container.innerHTML = '<p style="color:#94a3b8;">No swing videos yet.</p>';
            return;
        }
        container.innerHTML = '';
        for (const d of snap.docs) {
            const v = { id: d.id, ...d.data() };
            const row = document.createElement('div');
            row.style.cssText = 'border:1px solid #e2e8f0; border-radius:10px; padding:10px; margin-bottom:12px;';
            const when = v.createdAt?.toDate ? v.createdAt.toDate().toLocaleDateString() : '';
            row.innerHTML = `
                <div class="vid-stage" style="position:relative; width:100%;">
                    <video controls preload="metadata" playsinline
                        style="width:100%; max-height:320px; border-radius:8px; background:#000; display:block;"></video>
                    <canvas class="vid-canvas" style="position:absolute; inset:0; width:100%; height:100%; pointer-events:none;"></canvas>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px; font-size:0.85rem; flex-wrap:wrap; gap:6px;">
                    <span><strong class="vid-angle"></strong> <span class="vid-note" style="color:#64748b;"></span></span>
                    <span style="color:#94a3b8;">${escapeHtml(when)} · ${formatBytes(v.bytes)}</span>
                </div>
                <div style="display:flex; gap:6px; margin-top:6px; align-items:center; flex-wrap:wrap;">
                    <span style="font-size:0.75rem; color:#64748b;">Speed:</span>
                    <button type="button" class="btn-text vid-rate" data-rate="0.25" style="padding:2px 8px;">¼×</button>
                    <button type="button" class="btn-text vid-rate" data-rate="0.5" style="padding:2px 8px;">½×</button>
                    <button type="button" class="btn-text vid-rate" data-rate="1" style="padding:2px 8px; font-weight:700;">1×</button>
                    <span style="width:6px;"></span>
                    <button type="button" class="btn-text vid-step" data-dir="-1" aria-label="Back one frame" style="padding:2px 8px;">◀ frame</button>
                    <button type="button" class="btn-text vid-step" data-dir="1" aria-label="Forward one frame" style="padding:2px 8px;">frame ▶</button>
                    <button type="button" class="btn-text vid-annotate" style="padding:2px 8px; color:#2563eb;">✏️ Annotate</button>
                    <button type="button" class="btn-text vid-ai" style="padding:2px 8px; color:#8b5cf6;">🤖 AI analysis</button>
                    ${canDelete ? '<button type="button" class="btn-text vid-delete" aria-label="Delete video" style="margin-left:auto; color:#ef4444;">🗑️ Delete</button>' : ''}
                </div>
                <div class="vid-ai-result hidden"
                    style="margin-top:8px; background:#faf5ff; border:1px solid #e9d5ff; border-radius:8px; padding:10px 12px; font-size:0.85rem; white-space:pre-wrap;"></div>
                <div class="vid-annotate-bar hidden" style="display:flex; gap:8px; margin-top:6px; align-items:center; font-size:0.8rem; color:#64748b;">
                    Drag on the video to draw lines.
                    <button type="button" class="btn-text vid-anno-undo" style="padding:2px 8px;">↩ Undo</button>
                    <button type="button" class="btn-text vid-anno-clear" style="padding:2px 8px;">Clear</button>
                    <button type="button" class="btn-text vid-anno-save" style="padding:2px 8px; color:#10b981; font-weight:700;">💾 Save</button>
                </div>`;
            // User-controlled strings via textContent only (BL-4.17 discipline):
            row.querySelector('.vid-angle').textContent = v.angle || 'Video';
            row.querySelector('.vid-note').textContent = v.note || '';
            const player = row.querySelector('video');
            getDownloadURL(storageRef(storage, v.path))
                .then(url => { player.src = url; })
                .catch(() => { player.replaceWith(Object.assign(document.createElement('p'), { textContent: 'Video file unavailable.', style: 'color:#ef4444;' })); });
            row.querySelectorAll('.vid-rate').forEach(b => b.addEventListener('click', () => {
                player.playbackRate = parseFloat(b.getAttribute('data-rate'));
                row.querySelectorAll('.vid-rate').forEach(x => x.style.fontWeight = '400');
                b.style.fontWeight = '700';
            }));
            // BL-VID-02: frame stepping (30fps assumption — plenty for review).
            row.querySelectorAll('.vid-step').forEach(b => b.addEventListener('click', () => {
                player.pause();
                player.currentTime = Math.max(0, player.currentTime + parseInt(b.getAttribute('data-dir'), 10) / 30);
            }));
            bindAnnotations(row, player, v);
            bindAiAnalysis(row, v);
            const del = row.querySelector('.vid-delete');
            if (del) del.addEventListener('click', async () => {
                if (!confirm('Delete this video? This cannot be undone.')) return;
                try {
                    await deleteVideo(v);
                    row.remove();
                    refreshQuotaLine();
                    showToast('Video deleted 🗑️');
                } catch (e) {
                    console.error('[Videos] delete failed:', e);
                    showToast('Could not delete video.');
                }
            });
            container.appendChild(row);
        }
    } catch (e) {
        console.error('[Videos] library load failed:', e);
        container.innerHTML = '<p style="color:#ef4444;">Could not load videos.</p>';
    }
}

/**
 * BL-VID-02: straight-line drawing over a video (shaft plane, spine angle…).
 * Segments are stored NORMALISED (0-1) so they survive any display size, as
 * plain JSON on the video doc (`annotations`) — tiny, editable, never burned
 * into the file. Owner and coach may save (rules: annotations-only update).
 */
function bindAnnotations(row, player, v) {
    const canvas = row.querySelector('.vid-canvas');
    const bar = row.querySelector('.vid-annotate-bar');
    const toggle = row.querySelector('.vid-annotate');
    if (!canvas || !bar || !toggle) return;

    let segments = Array.isArray(v.annotations) ? [...v.annotations] : [];
    let drawing = null; // {x1, y1} normalised, while dragging
    let active = false;

    const ctx = canvas.getContext('2d');
    const syncSize = () => {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
        redraw();
    };
    const redraw = (preview) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#f59e0b';
        ctx.lineCap = 'round';
        [...segments, ...(preview ? [preview] : [])].forEach(s => {
            ctx.beginPath();
            ctx.moveTo(s.x1 * canvas.width, s.y1 * canvas.height);
            ctx.lineTo(s.x2 * canvas.width, s.y2 * canvas.height);
            ctx.stroke();
        });
    };
    // Draw stored annotations as soon as the video has a size.
    player.addEventListener('loadedmetadata', syncSize);
    if (segments.length) requestAnimationFrame(syncSize);

    const norm = (e) => {
        const r = canvas.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return { x: 0, y: 0 }; // not laid out yet
        return {
            x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
            y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
        };
    };
    canvas.addEventListener('pointerdown', (e) => {
        if (!active) return;
        e.preventDefault();
        try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
        const p = norm(e);
        drawing = { x1: p.x, y1: p.y };
    });
    canvas.addEventListener('pointermove', (e) => {
        if (!active || !drawing) return;
        const p = norm(e);
        redraw({ ...drawing, x2: p.x, y2: p.y });
    });
    canvas.addEventListener('pointerup', (e) => {
        if (!active || !drawing) return;
        const p = norm(e);
        // Ignore accidental taps (zero-length lines).
        if (Math.hypot(p.x - drawing.x1, p.y - drawing.y1) > 0.01) {
            segments.push({ ...drawing, x2: p.x, y2: p.y });
        }
        drawing = null;
        redraw();
    });

    toggle.addEventListener('click', () => {
        active = !active;
        bar.classList.toggle('hidden', !active);
        canvas.style.pointerEvents = active ? 'auto' : 'none';
        canvas.style.touchAction = active ? 'none' : '';
        toggle.style.fontWeight = active ? '700' : '400';
        if (active) { player.pause(); syncSize(); }
    });
    row.querySelector('.vid-anno-undo').addEventListener('click', () => { segments.pop(); redraw(); });
    row.querySelector('.vid-anno-clear').addEventListener('click', () => { segments = []; redraw(); });
    row.querySelector('.vid-anno-save').addEventListener('click', async () => {
        try {
            await updateDoc(doc(db, 'videos', v.id), { annotations: segments });
            showToast('Annotations saved ✏️');
        } catch (e) {
            console.error('[Videos] annotation save failed:', e);
            showToast('Could not save annotations.');
        }
    });
}

function analysisErrorCopy(error) {
    // Codes only: callable messages can contain arbitrary service diagnostics.
    const messages = {
        'functions/unauthenticated': 'Sign in again, then reopen this video to request analysis.',
        'functions/permission-denied': 'Your account cannot analyse this video. Ask its owner or an admin to check your access.',
        'functions/not-found': 'This video could not be found. Refresh the video library and check whether it is still there.',
        'functions/resource-exhausted': 'An AI service limit was reached. Check your AI allowance before requesting another analysis.',
        'functions/failed-precondition': 'This video does not meet the analysis requirements. Check its size (about 19 MB maximum); if it is already smaller, ask an admin to check the video record.',
        'functions/invalid-argument': 'The analysis request was not accepted. Refresh the video library and reopen the video.'
    };
    return Object.hasOwn(messages, error?.code) ? messages[error.code]
        : 'Analysis could not be confirmed. Refresh the video library and check for a saved result before requesting another analysis.';
}

/**
 * BL-VID-03: Gemini swing analysis. The callable checks owner/coach/admin
 * server-side, spends one unit of the shared daily AI quota, grounds the
 * prompt in the player's dispersion data, and writes the result onto the
 * video doc — so a stored analysis renders for free on later loads.
 */
function bindAiAnalysis(row, v) {
    const btn = row.querySelector('.vid-ai');
    const out = row.querySelector('.vid-ai-result');
    if (!btn || !out) return;

    const render = (a) => {
        out.textContent = `${a.analysis || ''}${a.drill ? '\n\n🎯 Drill: ' + a.drill : ''}`;
        out.classList.remove('hidden');
    };
    if (v.aiAnalysis && v.aiAnalysis.analysis) render(v.aiAnalysis);

    btn.addEventListener('click', async () => {
        btn.disabled = true;
        out.textContent = '🤖 Analysing your swing… (this can take up to a minute)';
        out.classList.remove('hidden');
        try {
            const call = httpsCallable(functions, 'analyzeSwingVideo', { timeout: 300000 });
            const res = await call({ videoId: v.id });
            render(res.data || {});
        } catch (e) {
            console.error('[Videos] AI analysis failed:', e);
            out.textContent = analysisErrorCopy(e);
        } finally {
            btn.disabled = false;
        }
    });
}

async function refreshQuotaLine() {
    const el = document.getElementById('video-quota-line');
    const uid = auth.currentUser?.uid;
    if (!el || !uid) return;
    try {
        const { quota, used } = await quotaFor(uid);
        el.textContent = `${formatBytes(used)} of ${formatBytes(quota)} used`;
    } catch { /* cosmetic only */ }
}

/**
 * BL-VID-02: dual-angle synced comparison. Mark impact on each clip once;
 * from then on play/pause/frame-step drives both, offset so the impacts line
 * up. Sync state is in-memory only — it's a review tool, not data.
 */
function initCompare() {
    const selA = document.getElementById('compare-select-a');
    const selB = document.getElementById('compare-select-b');
    const loadBtn = document.getElementById('btn-load-compare');
    const stage = document.getElementById('compare-stage');
    if (!selA || !selB || !loadBtn || !stage) return;

    const vidA = document.getElementById('compare-video-a');
    const vidB = document.getElementById('compare-video-b');
    const status = document.getElementById('compare-sync-status');
    let impactA = null, impactB = null;

    async function populateSelects() {
        const uid = auth.currentUser?.uid;
        if (!uid) return;
        const snap = await getDocs(query(collection(db, 'videos'), where('uid', '==', uid), orderBy('createdAt', 'desc')));
        const options = snap.docs.map(d => {
            const v = d.data();
            const when = v.createdAt?.toDate ? v.createdAt.toDate().toLocaleDateString() : '';
            const label = `${v.angle || 'Video'} · ${when}${v.note ? ' · ' + v.note.slice(0, 20) : ''}`;
            return { path: v.path, label };
        });
        for (const sel of [selA, selB]) {
            sel.innerHTML = '<option value="">-- pick a video --</option>';
            options.forEach(o => {
                const opt = document.createElement('option');
                opt.value = o.path;
                opt.textContent = o.label; // textContent: note is user input
                sel.appendChild(opt);
            });
        }
    }
    // Refresh choices whenever the Practice tab opens (cheap, reuses the query).
    window.addEventListener('stateChange', (e) => {
        if (e.detail.property === 'activeTab' && e.detail.newValue === 'tab-practice' && auth.currentUser) {
            populateSelects().catch(() => {});
        }
    });

    loadBtn.addEventListener('click', async () => {
        if (!selA.value || !selB.value) { showToast('Pick two videos first.'); return; }
        try {
            vidA.src = await getDownloadURL(storageRef(storage, selA.value));
            vidB.src = await getDownloadURL(storageRef(storage, selB.value));
            impactA = impactB = null;
            document.getElementById('impact-a-label').textContent = '';
            document.getElementById('impact-b-label').textContent = '';
            status.textContent = 'Mark impact on both clips to lock the sync.';
            stage.classList.remove('hidden');
        } catch (e) {
            console.error('[Compare] load failed:', e);
            showToast('Could not load one of the videos.');
        }
    });

    const synced = () => impactA != null && impactB != null;
    document.getElementById('btn-mark-impact-a').addEventListener('click', () => {
        impactA = vidA.currentTime;
        document.getElementById('impact-a-label').textContent = `impact @ ${impactA.toFixed(2)}s`;
        if (synced()) status.textContent = '🔒 Synced on impact.';
    });
    document.getElementById('btn-mark-impact-b').addEventListener('click', () => {
        impactB = vidB.currentTime;
        document.getElementById('impact-b-label').textContent = `impact @ ${impactB.toFixed(2)}s`;
        if (synced()) status.textContent = '🔒 Synced on impact.';
    });

    const alignB = () => { if (synced()) vidB.currentTime = impactB + (vidA.currentTime - impactA); };
    document.getElementById('btn-compare-play').addEventListener('click', () => {
        if (vidA.paused) {
            alignB();
            vidA.play(); vidB.play();
        } else {
            vidA.pause(); vidB.pause();
            alignB(); // re-square any drift on pause
        }
    });
    const step = (dir) => {
        vidA.pause(); vidB.pause();
        vidA.currentTime = Math.max(0, vidA.currentTime + dir / 30);
        if (synced()) alignB();
        else vidB.currentTime = Math.max(0, vidB.currentTime + dir / 30);
    };
    document.getElementById('btn-compare-back').addEventListener('click', () => step(-1));
    document.getElementById('btn-compare-fwd').addEventListener('click', () => step(1));
    document.getElementById('btn-compare-slow').addEventListener('click', () => {
        const rate = vidA.playbackRate === 0.25 ? 1 : 0.25;
        vidA.playbackRate = rate; vidB.playbackRate = rate;
    });
}

/** Bind the Practice-tab card. Bootstrap-called. */
export function initVideos() {
    const input = document.getElementById('video-file-input');
    const btn = document.getElementById('btn-upload-video');
    const list = document.getElementById('video-library');
    const status = document.getElementById('video-upload-status');
    if (!input || !btn || !list) return;

    initCompare();

    btn.addEventListener('click', async () => {
        const file = input.files && input.files[0];
        if (!file) { showToast('Pick or record a video first.'); return; }
        const angle = document.getElementById('video-angle-select')?.value;
        const note = document.getElementById('video-note-input')?.value.trim();
        btn.disabled = true;
        try {
            await uploadVideo(file, { angle, note }, pct => {
                if (status) status.textContent = `Uploading… ${pct}%`;
            });
            if (status) status.textContent = '';
            input.value = '';
            const noteEl = document.getElementById('video-note-input');
            if (noteEl) noteEl.value = '';
            showToast('Video uploaded 🎥');
            renderVideoLibrary(auth.currentUser.uid, list, { canDelete: true });
            refreshQuotaLine();
        } catch (e) {
            console.error('[Videos] upload failed:', e);
            if (status) status.textContent = e.message || 'Upload failed.';
        } finally {
            btn.disabled = false;
        }
    });

    // Lazy-load the library the first time the Practice tab is opened.
    let loaded = false;
    window.addEventListener('stateChange', (e) => {
        if (e.detail.property === 'activeTab' && e.detail.newValue === 'tab-practice'
            && !loaded && auth.currentUser) {
            loaded = true;
            renderVideoLibrary(auth.currentUser.uid, list, { canDelete: true });
            refreshQuotaLine();
        }
    });
}
