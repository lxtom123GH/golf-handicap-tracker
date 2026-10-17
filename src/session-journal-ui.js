// ==========================================
// session-journal-ui.js — sanitised export + the Settings card
// ==========================================
//
// The card is injected next to the "App version" card (no index.html edit),
// and uses classes only (contracts.test.js: ids from src must exist in
// index.html). Every handler is wrapped: a broken export never breaks the
// Settings tab.

import {
    journalSnapshot, clearJournal, onJournalFlush, installJournal,
    isJournalEnabled, setJournalEnabled, scrubString, flushJournal,
} from './session-journal.js';

const SECRET_KEY_RE = /uid|email|token|password|apikey|api_key|secret|displayname|^name$|^key$/i;

export const JOURNAL_DISCLOSURE = 'This file holds app diagnostics only: times, GPS accuracy and outcomes, '
    + 'connection changes, app errors, save results, holes and the course name. '
    + 'No names, emails or account ids. Positions are included only if you ticked "Include positions".';

/** Defense-in-depth redaction over the whole export, after recording-time cleaning. */
function redact(value, includePositions) {
    if (Array.isArray(value)) return value.map(v => redact(v, includePositions));
    if (value && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            if (SECRET_KEY_RE.test(k)) continue;
            if (k === 'lat' || k === 'lon') {
                if (includePositions && typeof v === 'number' && Number.isFinite(v)) out[k] = Math.round(v * 1e5) / 1e5;
                continue;
            }
            out[k] = redact(v, includePositions);
        }
        return out;
    }
    if (typeof value === 'string') return scrubString(value);
    return value;
}

/** The export object. includePositions defaults to false (coordinates stripped). */
export function buildJournalExport({ includePositions = false } = {}) {
    try {
        const snap = journalSnapshot();
        return redact({
            format: 'golf-journal',
            version: 1,
            exportedAt: new Date().toISOString(),
            includesPositions: !!includePositions,
            disclosure: JOURNAL_DISCLOSURE,
            header: snap.header,
            degraded: snap.degraded,
            entries: snap.entries,
        }, !!includePositions);
    } catch (e) {
        return { format: 'golf-journal', version: 1, error: 'export failed', entries: [] };
    }
}

function fileName() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `golf-journal-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

function say(card, text) {
    const s = card.querySelector('.journal-status');
    if (s) s.textContent = text;
}

/** Re-render the count and the degraded warning. Never throws. */
export function refreshJournalCard() {
    try {
        const card = document.querySelector('.journal-card');
        if (!card) return;
        const snap = journalSnapshot();
        const count = card.querySelector('.journal-count');
        if (count) count.textContent = `${snap.entries.length} entries on this phone`;
        const warn = card.querySelector('.journal-degraded');
        if (warn) {
            warn.textContent = snap.degraded ? `Recording problem: ${snap.degraded.reason}` : '';
            warn.classList.toggle('hidden', !snap.degraded);
        }
    } catch { /* never */ }
}

function exportJson(card) {
    flushJournal();
    const includePositions = !!card.querySelector('.journal-positions')?.checked;
    return JSON.stringify(buildJournalExport({ includePositions }), null, 1);
}

function download(card) {
    try {
        const json = exportJson(card);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName();
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* ignore */ } }, 5000);
        say(card, 'Exported.');
    } catch {
        say(card, 'Export failed — try Copy instead.');
    }
}

function copy(card) {
    try {
        const json = exportJson(card);
        if (!navigator.clipboard?.writeText) { say(card, 'Copy is not available here.'); return; }
        navigator.clipboard.writeText(json)
            .then(() => say(card, 'Copied to clipboard.'))
            .catch(() => say(card, 'Copy failed.'));
    } catch {
        say(card, 'Copy failed.');
    }
}

const CARD_HTML = `
    <h3 style="margin:0 0 6px 0;">📓 Play diagnostics</h3>
    <p style="font-size:0.85rem; color:#64748b; margin:0 0 10px 0;">
        Keeps a small log on this phone only (GPS results, connection, errors, saves) so a round can be
        reviewed afterwards. Nothing is uploaded; export it when you want to share it.
    </p>
    <label class="bag-row"><input type="checkbox" class="journal-enabled"> Record play diagnostics</label>
    <label class="bag-row"><input type="checkbox" class="journal-positions"> Include positions in export</label>
    <p class="journal-degraded hidden" role="alert" style="font-size:0.85rem; color:#b91c1c; margin:8px 0 0;"></p>
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
        <button type="button" class="btn btn-secondary journal-export" style="margin:0; width:auto; min-height:44px;">Export</button>
        <button type="button" class="btn btn-secondary journal-copy" style="margin:0; width:auto; min-height:44px;">Copy</button>
        <button type="button" class="btn btn-secondary journal-clear" style="margin:0; width:auto; min-height:44px;">Clear journal</button>
    </div>
    <p style="font-size:0.8rem; color:#64748b; margin:8px 0 0;"><span class="journal-count"></span></p>
    <p class="journal-status" role="status" style="font-size:0.85rem; color:#475569; margin:4px 0 0; min-height:1.2em;"></p>`;

/** Inject the card after the App version card in Settings. Idempotent. */
export function mountJournalCard() {
    try {
        if (document.querySelector('.journal-card')) return;
        const anchor = document.getElementById('app-update-card');
        if (!anchor?.parentNode) return;
        const card = document.createElement('div');
        card.className = 'card journal-card';
        card.setAttribute('style', 'margin-top:20px; padding:15px; min-width:0;');
        card.innerHTML = CARD_HTML;
        anchor.parentNode.insertBefore(card, anchor.nextSibling);

        const enabled = card.querySelector('.journal-enabled');
        enabled.checked = isJournalEnabled();
        enabled.addEventListener('change', () => { setJournalEnabled(enabled.checked); refreshJournalCard(); });
        card.querySelector('.journal-export').addEventListener('click', () => download(card));
        card.querySelector('.journal-copy').addEventListener('click', () => copy(card));
        card.querySelector('.journal-clear').addEventListener('click', () => {
            try {
                if (typeof window.confirm === 'function' && !window.confirm('Clear the play diagnostics journal?')) return;
            } catch { /* no dialog: clear */ }
            clearJournal();
            say(card, 'Journal cleared.');
        });
        refreshJournalCard();
    } catch { /* never */ }
}

/** Boot entry point: listeners, header, card. Never throws. */
export function startJournal() {
    try {
        installJournal();
        onJournalFlush(refreshJournalCard);
        mountJournalCard();
    } catch { /* never */ }
}
