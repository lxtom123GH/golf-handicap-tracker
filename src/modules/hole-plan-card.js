// S3 Part B: the hole-plan editor card — one builder, two homes. The coach
// draws the intended line for a student's hole (authorRole 'coach', from
// the athlete dashboard); the player draws their own (authorRole 'self',
// from Settings). The card is a course select, a hole select, the overlay
// canvas in single-curve (intended) mode, a note, and a fire-and-forget
// Save/Delete (F-11: never await the server ack — the mapper lesson).
//
// Sydney: the plan is drawn on the CANVAS (mountHoleOverlay), never a DOM
// overlay. One Firestore read when the hole selection changes, to prefill
// an existing plan; no listeners anywhere.

import { mountHoleOverlay, courseSlugFor, loadCourseOverlay } from '../hole-overlay.js';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase-config.js';
import { AppState } from '../state.js';

export const PLAN_MAX_POINTS = 48;

export function planIdFor(courseSlug, physicalHole) {
    return `${courseSlug}-${physicalHole}`;
}

// The courses with an overlay file — the same list the hole mapper offers.
const PLAN_COURSES = [
    { name: 'Keperra Country Golf Club', slug: 'keperra' },
    { name: 'Ashgrove Golf Club', slug: 'ashgrove' },
    { name: 'Redcliffe Golf Club', slug: 'redcliffe' },
    { name: 'Virginia Golf Club', slug: 'virginia' },
];

export function mountHolePlanCard(root, { authorRole, targetUid } = {}) {
    if (!root || !authorRole || !targetUid) return;
    root.innerHTML = '';

    root.innerHTML = `
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:8px;">
            <select class="plan-course-select" aria-label="Course"
                style="flex:1; min-height:44px; padding:6px 8px; border:1px solid var(--border-color); border-radius:8px; background:var(--bg-elevated, #fff);"></select>
            <select class="plan-hole-select" aria-label="Hole"
                style="flex:1; min-height:44px; padding:6px 8px; border:1px solid var(--border-color); border-radius:8px; background:var(--bg-elevated, #fff);"></select>
        </div>
        <canvas class="plan-canvas" aria-label="Draw the plan line: tap to place points"
            style="width:100%; max-width:100%; min-width:0; height:260px; border:1px solid var(--border-color); border-radius:8px; touch-action:none; display:block; background:#f8fafc;"></canvas>
        <div class="plan-status" style="font-size:0.88rem; color:#475569; margin:8px 0;">pick a course and hole, then draw the line</div>
        <input class="plan-note" type="text" maxlength="200" placeholder="note (optional, e.g. 'smooth draw')"
            aria-label="Plan note"
            style="width:100%; min-height:44px; padding:6px 10px; margin-bottom:8px; border:1px solid var(--border-color); border-radius:8px;" />
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button type="button" class="btn btn-secondary plan-clear"
                style="flex:1; min-height:44px;">↩ Clear</button>
            <button type="button" class="btn btn-secondary plan-delete hidden"
                style="flex:1; min-height:44px; color:#dc2626; border-color:#dc2626;">🗑 Delete plan</button>
            <button type="button" class="btn btn-primary plan-save" disabled
                style="flex:1; min-height:44px;">💾 Save plan</button>
        </div>`;

    const courseSel = root.querySelector('.plan-course-select');
    const holeSel = root.querySelector('.plan-hole-select');
    const canvas = root.querySelector('.plan-canvas');
    const status = root.querySelector('.plan-status');
    const noteEl = root.querySelector('.plan-note');
    const saveBtn = root.querySelector('.plan-save');
    const clearBtn = root.querySelector('.plan-clear');
    const deleteBtn = root.querySelector('.plan-delete');

    let ctl = null;
    let current = { slug: null, hole: null, frame: null };

    for (const c of PLAN_COURSES) {
        const o = document.createElement('option');
        o.value = c.slug;
        o.textContent = c.name;
        courseSel.appendChild(o);
    }

    function setStatus(text) { status.textContent = text; }

    function refreshSaveEnabled() {
        const line = ctl?.getCurves?.().intended || null;
        const ok = line && line.length >= 2 && line.length <= PLAN_MAX_POINTS;
        saveBtn.disabled = !ok;
        return line || null;
    }

    async function loadHole() {
        const slug = courseSel.value;
        const hole = Number(holeSel.value);
        if (!slug || !hole) return;
        const overlay = await loadCourseOverlay(slug);
        const holeData = overlay.holes[String(hole)];
        if (!holeData) return;
        // Fresh canvas for the hole; the plan editor draws ONE curve —
        // intended mode, exactly the wizard's draw path.
        ctl = mountHoleOverlay(canvas, holeData, {
            mode: 'intended',
            onChange: () => {
                const line = refreshSaveEnabled();
                if (line && line.length > PLAN_MAX_POINTS) {
                    setStatus(`${line.length} points — the cap is ${PLAN_MAX_POINTS}`);
                } else if (line) {
                    setStatus(`${line.length} point${line.length === 1 ? '' : 's'} drawn`);
                }
            },
        });
        current = { slug, hole, frame: ctl.frame };
        // Prefill an existing plan: the dashed under-line is the stored plan,
        // the note reappears, Delete shows. One getDoc — no listener.
        let existing = null;
        try {
            const snap = await getDoc(doc(db, 'users', targetUid, 'holePlans', planIdFor(slug, hole)));
            if (snap.exists()) existing = snap.data();
        } catch (e) {
            console.warn('[hole-plan-card] existing plan read failed (continuing without):', e?.code || e);
        }
        const rawLine = existing?.line || null;
        const pairs = Array.isArray(rawLine) ? rawLine.map((p) => [p.x, p.y]).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])) : null;
        ctl.setPlan(pairs && pairs.length >= 2 ? pairs : null);
        ctl.setCurves({ intended: null });
        noteEl.value = existing?.note || '';
        deleteBtn.classList.toggle('hidden', !existing);
        setStatus(existing
            ? `existing plan loaded (${pairs.length} points) — redraw and Save to replace it`
            : 'pick a course and hole, then draw the line');
        refreshSaveEnabled();
    }

    courseSel.addEventListener('change', async () => {
        holeSel.innerHTML = '';
        try {
            const overlay = await loadCourseOverlay(courseSel.value);
            const nums = Object.keys(overlay.holes).map(Number).sort((a, b) => a - b);
            for (const n of nums) {
                const o = document.createElement('option');
                o.value = String(n);
                o.textContent = `Hole ${n}`;
                holeSel.appendChild(o);
            }
            if (nums.length) await loadHole();
        } catch (e) {
            setStatus('course file failed to load');
        }
    });
    holeSel.addEventListener('change', loadHole);

    clearBtn.addEventListener('click', () => {
        ctl?.clear('intended'); // D29 review: clear(mode) needs the mode (a bare clear() cleared nothing)
        refreshSaveEnabled();
        setStatus('cleared — draw the line again');
    });

    // F-11: fire-and-forget — the button never awaits the server ack.
    // Offline the write queues and lands later; a rejection means the rules
    // refused it (or the auth is gone) and the status says so.
    saveBtn.addEventListener('click', () => {
        const line = refreshSaveEnabled();
        if (!line || !current.slug || !current.hole) return;
        const payload = {
            courseSlug: current.slug,
            physicalHole: current.hole,
            authorUid: AppState.currentUser.uid,
            authorRole,
            line: line.map(([x, y]) => ({ x, y })),
            frame: {
                origin: { lat: current.frame.origin[0], lon: current.frame.origin[1] },
                bearing: current.frame.bearing,
            },
            note: noteEl.value || '',
            updatedAt: new Date().toISOString(),
        };
        setDoc(doc(db, 'users', targetUid, 'holePlans', planIdFor(current.slug, current.hole)), payload)
            .then(() => setStatus(`saved ${line.length} point${line.length === 1 ? '' : 's'} — syncs when online`))
            .catch((e) => setStatus(`save refused: ${e?.code || 'error'}`));
        setStatus('saving…');
    });

    deleteBtn.addEventListener('click', () => {
        if (!current.slug || !current.hole) return;
        deleteDoc(doc(db, 'users', targetUid, 'holePlans', planIdFor(current.slug, current.hole)))
            .then(() => setStatus('plan deleted'))
            .catch((e) => setStatus(`delete refused: ${e?.code || 'error'}`));
        setStatus('deleting…');
    });

    courseSel.dispatchEvent(new Event('change'));
    return { destroy() { root.innerHTML = ''; ctl = null; } };
}
