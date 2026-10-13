// ==========================================
// insights-render.js — DOM layer for src/insights.js + the index trust card
// ==========================================
import { db } from '../firebase-config.js';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { AppState } from '../state.js';
import { escapeHtml } from '../escape.js';
import { computeCategoryInsights, computeClubTendencies } from '../insights.js';
import { coldStartPreview } from '../cold-start.js';
import { renderIntentPanel } from './intent-render.js';

/**
 * "Why this index?" — plain-language breakdown of the WHS calculation, from
 * calculateIndex's details. Called by whs.js on every recalculation.
 */
export function renderIndexExplainer(index, details, rounds) {
    if (!Array.isArray(rounds)) {
        console.error('[Insights] renderIndexExplainer requires the current rounds');
        return;
    }
    const el = document.getElementById('index-explainer');
    if (!el) return;
    if (!details) {
        el.innerHTML = coldStartPreview(rounds, 'index');
        return;
    }

    const parts = [];
    parts.push(`Your index of <strong>${escapeHtml(String(index))}</strong> is the average of your best `
        + `<strong>${details.scoresUsed}</strong> score differential${details.scoresUsed === 1 ? '' : 's'} `
        + `from your last <strong>${details.of}</strong> completed 18-hole score${details.of === 1 ? '' : 's'}`
        + (details.adj ? `, with the small-record adjustment of <strong>${details.adj}</strong>` : '') + '.');

    if (details.lowHI != null) {
        parts.push(`Your Low HI (best index in the last 12 months) is <strong>${details.lowHI.toFixed(1)}</strong>.`);
        if (details.hardCapped) {
            parts.push(`⛑️ The <strong>hard cap</strong> is holding you at Low HI + 5.0 — uncapped it would be ${details.preCap.toFixed(1)}.`);
        } else if (details.softCapped) {
            parts.push(`🪶 The <strong>soft cap</strong> halved your rise beyond Low HI + 3.0 — uncapped it would be ${details.preCap.toFixed(1)}.`);
        } else {
            parts.push(`No caps applied — you're within 3.0 of your Low HI.`);
        }
    } else if (details.of < 20) {
        parts.push(`Caps start once you have 20 scores (${20 - details.of} to go).`);
    }
    if (details.pendingNines) parts.push('A nine-hole score is pending another nine and is not included yet.');
    parts.push(`The rounds marked <strong>*</strong> in the table below are the ones counting right now.`);

    el.innerHTML = parts.join(' ');
}

/** Bar-pair renderer for a category (you vs cohort benchmark). */
function categoryRow(c) {
    const max = Math.max(c.yours, c.bench) * 1.2 || 1;
    const bar = (v, color) =>
        `<div style="height:8px; background:#f1f5f9; border-radius:4px; overflow:hidden; flex:1;">
            <div style="width:${Math.min(100, (v / max) * 100)}%; height:100%; background:${color};"></div>
        </div>`;
    const ahead = c.betterWhenLower ? c.yours <= c.bench : c.yours >= c.bench;
    const delta = c.deltaStrokes != null
        ? ` <span style="color:${c.deltaStrokes <= 0 ? '#10b981' : '#ef4444'}; font-weight:700;">(${c.deltaStrokes > 0 ? '+' : ''}${c.deltaStrokes} strokes vs cohort)</span>`
        : '';
    return `
        <div style="margin-bottom:14px;">
            <div style="display:flex; justify-content:space-between; font-size:0.9rem; margin-bottom:4px;">
                <strong>${escapeHtml(c.label)} ${ahead ? '✅' : '▲'}</strong>
                <span>you ${c.yours} · typical ${c.bench} <span style="color:#94a3b8;">${escapeHtml(c.unit)}</span>${delta}</span>
            </div>
            <div style="display:flex; gap:6px; align-items:center;">
                <span style="font-size:0.7rem; color:#64748b; width:34px;">You</span>${bar(c.yours, ahead ? '#10b981' : '#f59e0b')}
            </div>
            <div style="display:flex; gap:6px; align-items:center; margin-top:3px;">
                <span style="font-size:0.7rem; color:#94a3b8; width:34px;">Typ.</span>${bar(c.bench, '#cbd5e1')}
            </div>
        </div>`;
}

/** Category insights card — re-rendered whenever the viewed rounds change. */
export function renderCategoryInsights() {
    const el = document.getElementById('performance-insights');
    if (!el) return;
    const hi = parseFloat(AppState.handicapIndex);
    const result = computeCategoryInsights(AppState.currentRounds, Number.isFinite(hi) ? hi : null);
    if (!result) {
        el.innerHTML = coldStartPreview(AppState.currentRounds, 'performance');
        return;
    }
    el.innerHTML = result.categories.map(categoryRow).join('')
        + `<div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:10px 12px; font-size:0.9rem;">
             🎯 <strong>Biggest opportunity:</strong> ${escapeHtml(result.focus.label)} — worth taking to the Practice Caddy.
           </div>
           <div style="color:#94a3b8; font-size:0.75rem; margin-top:8px;">Based on your last ${result.roundsUsed} rounds with stats; "typical" = published averages for your handicap band.</div>`;
}

/** One-tap club tendencies from the player's detailed shot history. */
function bindClubInsights() {
    const btn = document.getElementById('btn-load-club-insights');
    const out = document.getElementById('club-insights');
    if (!btn || !out) return;

    btn.addEventListener('click', async () => {
        btn.disabled = true;
        out.innerHTML = '<p style="color:#94a3b8;">Reading your shot history…</p>';
        try {
            const q = query(
                collection(db, 'shots'),
                where('uid', '==', AppState.viewingPlayerId || AppState.currentUser?.uid),
                orderBy('timestamp', 'desc'),
                limit(500)
            );
            const snap = await getDocs(q);
            const shots = [];
            snap.forEach(d => shots.push(d.data()));
            // S2: the intent-vs-execution panel needs only the shots — render
            // it before the tendencies gate so it works below 5+ shots/club.
            const intentCard = document.getElementById('intent-card');
            if (intentCard) renderIntentPanel(intentCard, shots);
            const clubs = computeClubTendencies(shots);
            if (!clubs.length) {
                out.innerHTML = '<p style="color:#94a3b8;">Not enough detailed shots yet — play a round in <strong>Detailed</strong> mode and track shots with the wizard (5+ shots per club needed).</p>';
                return;
            }
            out.innerHTML = clubs.map(c => {
                // Prefer true dispersion (result vs target) when the club has
                // enough missPattern taps; fall back to start-line bias.
                const verdict = c.topResultMiss
                    ? `misses ${escapeHtml(c.topResultMiss.pattern)} ${c.topResultMiss.pct}%`
                    : (c.topMiss ? 'misses ' + escapeHtml(c.topMiss) : 'no miss bias');
                const middle = c.onTargetPct != null
                    ? `${c.onTargetPct}% on target`
                    : `${c.straightPct}% straight`;
                return `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid #f1f5f9; font-size:0.9rem;">
                    <strong style="width:80px;">${escapeHtml(c.club)}</strong>
                    <span style="color:#64748b;">${c.count} shots</span>
                    <span>${middle}</span>
                    <span style="font-weight:700; color:${(c.topResultMiss || c.topMiss) ? '#f59e0b' : '#10b981'};">${verdict}</span>
                </div>`;
            }).join('');
        } catch (e) {
            console.error('[Insights] club tendencies failed:', e);
            out.innerHTML = '<p style="color:#ef4444;">Could not load shot history.</p>';
        } finally {
            btn.disabled = false;
        }
    });
}

/** Wire the insights card to state and bind the club button. Bootstrap-called. */
export function initInsights() {
    bindClubInsights();
    window.addEventListener('stateChange', (e) => {
        if (e.detail.property === 'currentRounds' || e.detail.property === 'handicapIndex') {
            renderCategoryInsights();
        }
    });
}
