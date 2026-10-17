// Flight recorder: the Settings card (record toggle, status, export, clear).
// Injected after #app-update-card with classes only (no new ids), so the
// index.html id contract and style.css are untouched.

import { recorder, getIsolation } from './recorder.js';

const CARD_HTML = `
  <strong style="display:block; margin-bottom:4px;">🛰️ Diagnostics (flight recorder)</strong>
  <p style="font-size:0.85rem; color:#475569; margin:0 0 8px;">Records app events on this phone to help fix on-course bugs:
  errors, GPS accuracy and the distances shown, holes, saves and connection changes. No positions, names, emails, notes or messages.
  It stays on this phone unless you export it.</p>
  <label class="bag-row" style="min-height:44px;"><input type="checkbox" class="flightrec-toggle"> Record diagnostics</label>
  <p class="flightrec-status" role="status" style="font-size:0.85rem; color:#475569; margin:8px 0 0; min-height:1.2em;"></p>
  <p class="flightrec-cloud" style="font-size:0.8rem; color:#64748b; margin:4px 0 0;"></p>
  <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">
    <button type="button" class="btn btn-secondary flightrec-export" style="margin:0; width:auto; min-height:44px; padding:10px 16px;">Export diagnostics</button>
    <button type="button" class="btn btn-secondary flightrec-clear" style="margin:0; width:auto; min-height:44px; padding:10px 16px;">Clear</button>
  </div>
  <p class="flightrec-msg" role="status" style="font-size:0.85rem; color:#475569; margin:6px 0 0; min-height:1.2em;"></p>`;

export function statusText(s) {
    if (!s) return 'Diagnostics unavailable on this device.';
    if (s.disabledReason) return `Recorder stopped itself (${s.disabledReason}); the app is unaffected.`;
    if (!s.enabled) return 'Diagnostics off.';
    const where = s.storage === 'idb' ? 'storing on this phone' : s.storage === 'local' ? 'storing on this phone (small backup store)' : 'NOT being saved - memory only';
    const parts = [`On · ${s.committed} saved · ${s.queued} waiting · ${where}`];
    if (s.failed) parts.push(`${s.failed} could not be saved`);
    if (s.dropped) parts.push(`${s.dropped} skipped (limits)`);
    if (s.evicted) parts.push(`${s.evicted} oldest removed`);
    return parts.join(' · ');
}

export function exportFileName(d = new Date()) {
    const p = n => String(n).padStart(2, '0');
    return `golf-diagnostics-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

/** Export through the share sheet, else a download. Truthful result, never throws. */
export async function exportDiagnostics(rec = recorder(), nav = globalThis.navigator, doc = globalThis.document) {
    try {
        if (!rec) return { ok: false, msg: 'Diagnostics unavailable.' };
        await rec.flush().catch(() => {});
        // Stored batches only when this account is confirmed as their owner.
        const includeStored = getIsolation() === 'confirmed';
        const snap = await rec.snapshot({ includeStored });
        const scopeNote = includeStored ? '' : ' Only this session was included: older diagnostics on this phone could not be confirmed as yours.';
        const json = JSON.stringify(snap, null, 1);
        const name = exportFileName();
        let file = null;
        try { file = new File([json], name, { type: 'application/json' }); } catch { file = null; }
        if (file && nav?.canShare && nav.share) {
            let can = false;
            try { can = nav.canShare({ files: [file] }); } catch { can = false; }
            if (can) {
                try {
                    await nav.share({ files: [file], title: 'Golf diagnostics' });
                    return { ok: true, msg: 'Shared. The diagnostics are still on this phone.' + scopeNote };
                } catch (e) {
                    if (e?.name === 'AbortError') return { ok: false, msg: 'Share cancelled. Nothing was deleted.' };
                    // fall through to download
                }
            }
        }
        try {
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = doc.createElement('a');
            a.href = url; a.download = name; a.rel = 'noopener';
            doc.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* ignore */ } }, 30000);
            return { ok: true, msg: `Download started (${name}). Check your downloads; nothing was deleted.` + scopeNote };
        } catch {
            return { ok: false, msg: 'Export failed on this device. Nothing was deleted.' };
        }
    } catch {
        return { ok: false, msg: 'Export failed. Nothing was deleted.' };
    }
}

let _cloudStatus = () => 'Cloud upload: off.';
export function setCloudStatusSource(fn) { if (typeof fn === 'function') _cloudStatus = fn; }

export function mountFlightRecorderCard(doc = document) {
    try {
        const anchor = doc.getElementById('app-update-card');
        if (!anchor || doc.querySelector('.flightrec-card')) return null;
        const card = doc.createElement('div');
        card.className = 'card flightrec-card';
        card.setAttribute('style', 'margin-top:20px; padding:15px; min-width:0;');
        card.innerHTML = CARD_HTML;
        anchor.insertAdjacentElement('afterend', card);
        const rec = recorder();
        const toggle = card.querySelector('.flightrec-toggle');
        const status = card.querySelector('.flightrec-status');
        const cloud = card.querySelector('.flightrec-cloud');
        const msg = card.querySelector('.flightrec-msg');
        const refresh = () => {
            try {
                const s = rec?.status();
                toggle.checked = !!s?.enabled;
                status.textContent = statusText(s);
                cloud.textContent = _cloudStatus();
            } catch { /* ignore */ }
        };
        toggle.addEventListener('change', () => { try { rec?.setEnabled(toggle.checked); refresh(); } catch { /* ignore */ } });
        let busy = false;
        card.querySelector('.flightrec-export').addEventListener('click', async () => {
            if (busy) return;
            busy = true;
            msg.textContent = 'Preparing…';
            try { msg.textContent = (await exportDiagnostics(rec)).msg; } finally { busy = false; refresh(); }
        });
        card.querySelector('.flightrec-clear').addEventListener('click', async () => {
            try {
                if (!globalThis.confirm?.('Clear the diagnostics stored on this phone? Rounds are not affected.')) return;
                const ok = await rec?.clearAll();
                msg.textContent = ok === true
                    ? 'Diagnostics cleared. Rounds were not touched.'
                    : 'Clearing could not be confirmed on this phone; some diagnostics may remain. Rounds were not touched.';
            } catch { msg.textContent = 'Could not clear diagnostics.'; }
            refresh();
        });
        refresh();
        const iv = setInterval(() => { if (card.isConnected && card.offsetParent !== null) refresh(); }, 10000);
        card._flightrecInterval = iv;
        return card;
    } catch {
        return null;
    }
}
