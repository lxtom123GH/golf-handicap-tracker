// ==========================================
// strategy.js — strategy periods & comparison (BL-DEC-01)
// ==========================================
//
// The owner's idea (2026-07-04): "from 1 Aug I'm playing the DECADE approach,
// review 1 Dec and try something different." Periods live on the user doc
// (strategyPeriods: [{name, start, end|null}]); rounds bucket by date and the
// comparison table averages per-18 stableford, putts and Tiger-5 mistakes so
// approaches can be compared like-for-like. Small samples are labelled, not
// hidden — 10+ rounds is when the numbers start meaning something.

import { db, auth } from './firebase-config.js';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { AppState } from './state.js';
import { escapeHtml } from './escape.js';
import { computeStrategyComparison } from './insights.js';
import { localToday } from './dates.js';

// Named, published course-management systems a player can adopt for a period
// (owner request 2026-07-04: "we've tried DECADE, now let's try another one").
// Each carries the on-course aim hint shown in the GPS widget while active.
export const STRATEGIES = {
    'DECADE (Fawcett)': {
        hint: 'Aim centre of green — never the flag. Driver unless there\'s a real reason not to.',
        par5: 'Par 5 = no-bogey hole: advance it, then lay to a FULL wedge.'
    },
    'Lowest Score Wins (Shot Zones)': {
        hint: 'Play to your Shot Zone — aim so your WHOLE dispersion cone finishes safe.',
        par5: 'Par 5: pick the layup spot first, plan the hole backwards from it.'
    },
    'Golf Sidekick 6-6-6': {
        hint: 'Ball in play, fat side of the green, no hero shots. Out of position? Take your medicine.',
        par5: 'Par 5: three boring shots beat one brilliant one.'
    },
    'Strokes-gained (Broadie)': {
        hint: 'Distance beats accuracy off the tee; into greens, long beats short — most trouble is short.',
        par5: 'Par 5: get it as far forward as safely possible — proximity wins.'
    },
    'No Flag Golf (Young)': {
        hint: 'The flag does not exist. Centre of every green, two putts, walk.',
        par5: 'Par 5: centre of the layup zone, centre of the green.'
    },
    'Four Foundations (Sherman)': {
        hint: 'War on double bogeys: pick the target where your miss still leaves a putt or an easy chip.',
        par5: 'Par 5: your expected score here is ~5.5 — take the boring route to it.'
    },
    'Vision54 Think/Play Box (Nilsson & Marriott)': {
        hint: 'Decide EVERYTHING behind the ball (think box), then step in and just swing (play box).',
        par5: 'Same routine, no extra thinking over the ball because it\'s a par 5.'
    },
    'Elements of Scoring (Floyd)': {
        hint: 'Play within yourself: take what the course gives, play comfortable, no big numbers.',
        par5: 'Score low by not scoring high — nothing fancy, avoid the blow-up.'
    },
    'Tiger-5 avoidance': {
        hint: 'Avoid the card-wreckers: no doubles, no three-putts. Boring is winning.',
        par5: 'Tiger rule #1: NO bogeys on par 5s. Protect this hole.'
    },
    'Personal par / bogey golf': {
        hint: 'Play to YOUR par — a 5 on a hard par 4 is a win. Chase nothing.',
        par5: 'Your par here might be 6. Three easy shots + two putts.'
    },
    'Conservative control': {
        hint: '3-wood or hybrid off the tee. Lay up to your favourite full-swing number.',
        par5: 'Position, position, position — full wedge third shot.'
    },
    'Custom': { hint: null, par5: null }
};
const SUGGESTED = Object.keys(STRATEGIES);

let _periods = null; // cached copy of users/{uid}.strategyPeriods

/**
 * The strategy period covering today (latest-starting wins). Loads and caches
 * the user's periods on first call — used by the GPS widget hint line.
 * @returns {Promise<null|{name: string, hint: string|null, par5: string|null}>}
 */
export async function getActiveStrategy() {
    const periods = await loadPeriods();
    const today = localToday();
    const active = periods
        .filter(p => p.start <= today && (!p.end || p.end >= today))
        .sort((a, b) => (a.start < b.start ? 1 : -1))[0];
    if (!active) return null;
    // Tolerant lookup: periods saved before the systems were (re)named — e.g.
    // "DECADE" vs "DECADE (Fawcett)" — still get their hints.
    const key = STRATEGIES[active.name] ? active.name
        : Object.keys(STRATEGIES).find(k =>
            k.split(' (')[0].toLowerCase() === active.name.split(' (')[0].toLowerCase());
    const def = (key && STRATEGIES[key]) || {};
    return { name: active.name, hint: def.hint || null, par5: def.par5 || null };
}

async function loadPeriods() {
    const uid = auth.currentUser?.uid;
    if (!uid) return [];
    if (_periods) return _periods;
    const snap = await getDoc(doc(db, 'users', uid));
    _periods = (snap.exists() && Array.isArray(snap.data().strategyPeriods))
        ? snap.data().strategyPeriods : [];
    return _periods;
}

async function savePeriods(periods) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    _periods = periods;
    await updateDoc(doc(db, 'users', uid), { strategyPeriods: periods });
}

/**
 * BL-OC2: the always-visible signal at the top of the Handicap tab. Shows the
 * active period (or an ended-period nudge); stays hidden until the player has
 * created at least one period so newcomers aren't shouted at.
 */
function renderBanner(periods) {
    const banner = document.getElementById('strategy-banner');
    const text = document.getElementById('strategy-banner-text');
    if (!banner || !text) return;
    const today = localToday();
    const active = (periods || [])
        .filter(p => p.start <= today && (!p.end || p.end >= today))
        .sort((a, b) => (a.start < b.start ? 1 : -1))[0];
    if (active) {
        text.textContent = `🧭 Playing ${active.name} since ${active.start}`;
        banner.classList.remove('hidden');
    } else if ((periods || []).length) {
        text.textContent = '🧭 No strategy period active — last one ended';
        banner.classList.remove('hidden');
    } else {
        banner.classList.add('hidden');
    }
}

async function render() {
    const listEl = document.getElementById('strategy-periods-list');
    const tableEl = document.getElementById('strategy-comparison');
    if (!listEl || !tableEl) return;

    const periods = await loadPeriods();
    renderBanner(periods);
    if (!periods.length) {
        listEl.innerHTML = '<p style="color:#94a3b8;">No strategy periods yet — start one below and every round from that date counts toward it.</p>';
        tableEl.innerHTML = '';
        return;
    }

    listEl.innerHTML = '';
    periods.forEach((p, i) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid #f1f5f9; font-size:0.9rem;';
        const label = document.createElement('span');
        label.innerHTML = `<strong></strong> <span style="color:#64748b;">${escapeHtml(p.start)} → ${p.end ? escapeHtml(p.end) : 'ongoing'}</span>`;
        label.querySelector('strong').textContent = p.name;
        row.appendChild(label);
        const btns = document.createElement('span');
        if (!p.end) {
            const endBtn = document.createElement('button');
            endBtn.type = 'button'; endBtn.className = 'btn-text'; endBtn.textContent = 'End today';
            endBtn.style.cssText = 'color:#2563eb; padding:2px 8px;';
            endBtn.addEventListener('click', async () => {
                // The player's day, not the UTC one (F-10): before 10am AEST this
                // used to end the period YESTERDAY, dropping that morning's
                // round out of the strategy it was played under.
                const copy = periods.map((x, j) => j === i ? { ...x, end: localToday() } : x);
                await savePeriods(copy); render();
            });
            btns.appendChild(endBtn);
        }
        const delBtn = document.createElement('button');
        delBtn.type = 'button'; delBtn.className = 'btn-text'; delBtn.textContent = '✕';
        delBtn.setAttribute('aria-label', `Delete period ${p.name}`);
        delBtn.style.cssText = 'color:#ef4444; padding:2px 8px;';
        delBtn.addEventListener('click', async () => {
            if (!confirm(`Delete the "${p.name}" period? (Rounds are untouched.)`)) return;
            await savePeriods(periods.filter((_, j) => j !== i)); render();
        });
        btns.appendChild(delBtn);
        row.appendChild(btns);
        listEl.appendChild(row);
    });

    const rows = computeStrategyComparison(AppState.currentRounds, periods);
    tableEl.innerHTML = `
        <table class="leaderboard-table" style="width:100%; font-size:0.85rem; margin-top:10px;">
            <thead><tr>
                <th>Strategy</th><th>Rounds</th><th>Stableford/18</th><th>Putts/18</th><th>🐯 Tiger-5/18</th>
            </tr></thead>
            <tbody>${rows.map(r => `
                <tr>
                    <td>${escapeHtml(r.name)}</td>
                    <td>${r.rounds}${r.rounds < 10 ? ' ⚠️' : ''}</td>
                    <td>${r.stableford ?? '—'}</td>
                    <td>${r.putts ?? '—'}</td>
                    <td>${r.tiger5 != null ? `${r.tiger5} <span style="color:#94a3b8;">(${r.tiger5Rounds}r)</span>` : '—'}</td>
                </tr>`).join('')}
            </tbody>
        </table>
        <p style="color:#94a3b8; font-size:0.75rem; margin-top:6px;">⚠️ under 10 rounds = small sample, treat as a hint not a verdict. Tiger-5 needs rounds saved after 2026-07-04 (per-hole detail).</p>`;
}

export function initStrategy() {
    const addBtn = document.getElementById('btn-add-strategy-period');
    if (!addBtn) return;

    const select = document.getElementById('strategy-name-select');
    if (select) {
        select.innerHTML = SUGGESTED.map(s => `<option value="${s}">${s}</option>`).join('');
    }

    addBtn.addEventListener('click', async () => {
        const sel = document.getElementById('strategy-name-select')?.value;
        const custom = document.getElementById('strategy-name-custom')?.value.trim();
        const start = document.getElementById('strategy-start-date')?.value;
        const name = sel === 'Custom' ? custom : sel;
        if (!name || !start) { alert('Pick a strategy name and a start date.'); return; }
        const periods = [...await loadPeriods(), { name, start, end: null }];
        await savePeriods(periods);
        render();
    });

    // Banner "Manage" → the Strategy Periods section on Insights.
    const manageBtn = document.getElementById('btn-strategy-banner-manage');
    if (manageBtn) {
        manageBtn.addEventListener('click', () => {
            document.querySelector('.tab-btn[data-target="tab-insights"]')?.click();
            setTimeout(() => document.getElementById('strategy-section')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
        });
    }

    // Re-render when the viewed rounds change (same trigger as insights).
    window.addEventListener('stateChange', (e) => {
        if (e.detail.property === 'currentRounds') render();
    });
}
