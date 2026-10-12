import { AppState } from '../state.js';
import { UI } from '../ui.js';
import { clubGroup } from '../insights.js';
import { getLastGpsFix } from '../oncourse.js';
import { COURSE_DATA, getStrokeIndex } from '../course-data.js';
import { calculateHoleStableford, scoringUnavailableReason } from '../whs.js';
import { openHoleEditor } from '../oncourse.js';
import { jumpToHole } from '../oncourse.js';
import { escapeHtml } from '../escape.js';
import { STARTER_BAG, hasSavedBag } from '../bag.js';
import { girOf, fairwayHit } from '../play-mode.js';
import { computeSkins, computeMatchPlay, computeNassau, sideGameUnavailableReason } from '../side-games.js';
import { holeOrder } from '../round-hole-order.js';

/**
 * Task 3: Live Leaderboard Logic
 * Calculates Stableford points across all players in current session
 */
export function updateLiveLeaderboard() {
    const tbody = document.getElementById('oc-leaderboard-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const courseName = AppState.currentRoundCourseName;
    // Prefer the tee resolved at Start Round (BL-UX-08 family): the <select>
    // resets on reload, so a resumed round's leaderboard used stroke indexes
    // from a blank tee.
    const teeName = AppState.currentRoundTee || (UI.ocTeeSelect ? UI.ocTeeSelect.value : null);
    const teeData = COURSE_DATA[courseName]?.[teeName] || {};

    // The tee's real stroke index, or null — never the hole number (F-9).
    const strokeIndex = getStrokeIndex(teeData, AppState.currentRoundHoles || 18);

    const standings = AppState.liveRoundGroups.map(p => {
        let pts = 0;
        let thru = 0;
        const blocked = scoringUnavailableReason(strokeIndex, p.dailyHandicap);
        for (const h of holeOrder(AppState.currentRoundHoles || 18, AppState.currentRoundStartHole || 1)) {
            const gross = p.scores[h];
            if (gross > 0) {
                thru = h;
                if (blocked) continue;
                const hIdx = h - 1;
                const hPar = AppState.currentCoursePars[hIdx] || 4;
                // F-2: the chart wraps where the Daily Handicap was computed,
                // not where the round happens to be displayed.
                pts += calculateHoleStableford(gross, hPar, strokeIndex[hIdx], p.dailyHandicap, p.dailyHandicapHoles || AppState.currentRoundHoles);
            }
        }
        // A dash, not a plausible-looking number this round cannot support —
        // the four surfaces used to disagree about the same round.
        return { name: p.name, points: blocked ? null : pts, thru: thru };
    });

    // Sort by Stableford points desc
    standings.sort((a, b) => (b.points ?? -1) - (a.points ?? -1));

    standings.forEach((s, i) => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #f1f5f9';
        tr.innerHTML = `
            <td style="padding:12px 8px; font-weight:700; color:#64748b;">${i + 1}</td>
            <td style="padding:12px 8px; font-weight:600;">${escapeHtml(s.name)}</td>
            <td style="padding:12px 8px; text-align:center; color:#64748b;">${s.thru}</td>
            <td style="padding:12px 8px; text-align:right; font-weight:800; color:var(--primary-color);">${s.points ?? '—'}</td>
        `;
        tbody.appendChild(tr);
    });

    // PRODUCT SWEEP 2026-09-10 SECOND PASS F-4: this used to hand over
    // `teeData.strokeIndex` — the RAW field — thirty-six lines below the
    // getStrokeIndex() call that exists to validate it. So a tee shipping
    // `strokeIndex: []` had a dash and a notice on the leaderboard and a
    // settled skins result directly underneath.
    renderSideGamePanel(strokeIndex);
}

/**
 * Live side-game standings (Skins / Match Play / Nassau), rendered under the
 * leaderboard. Pure derived view over liveRoundGroups (src/side-games.js) —
 * nothing is persisted; it re-renders with every leaderboard update.
 */
function renderSideGamePanel(strokeIndex) {
    const panel = document.getElementById('oc-side-game-panel');
    if (!panel) return;

    const game = AppState.currentSideGame;
    const players = AppState.liveRoundGroups || [];
    if (!game || players.length < 2) {
        panel.classList.add('hidden');
        panel.innerHTML = '';
        return;
    }

    // The chart the Daily Handicaps were built for — the same number the
    // leaderboard above uses, so the two can never disagree again (F-2/F-3).
    const holes = players[0]?.dailyHandicapHoles || AppState.currentRoundHoles || 9;

    // The leaderboard shows a dash and a reason when a round can't be scored;
    // the side games now say the same thing instead of settling anyway (F-4).
    const blocked = sideGameUnavailableReason(players, strokeIndex);
    if (blocked) {
        panel.innerHTML = `<h3 style="margin:0 0 8px;">Side game</h3><div style="color:#64748b;">${escapeHtml(blocked)}</div>`;
        panel.classList.remove('hidden');
        return;
    }

    let html = '';

    if (game === 'skins') {
        const r = computeSkins(players, holes, strokeIndex);
        const rows = players
            .map(p => ({ name: p.name, skins: r.perPlayer[p.uid] || 0 }))
            .sort((a, b) => b.skins - a.skins)
            .map(s => `<div style="display:flex; justify-content:space-between; padding:4px 0;"><span>${escapeHtml(s.name)}</span><strong>${s.skins} skin${s.skins === 1 ? '' : 's'}</strong></div>`)
            .join('');
        const carry = r.carried > 0 ? `<div style="color:#f59e0b; font-size:0.85rem; margin-top:4px;">🔥 ${r.carried} skin${r.carried === 1 ? '' : 's'} carrying to the next hole</div>` : '';
        html = `<h3 style="margin:0 0 8px;">💰 Skins (net)</h3>${rows}${carry}`;
    } else if (game === 'matchplay' && players.length === 2) {
        const r = computeMatchPlay(players[0], players[1], holes, strokeIndex);
        html = `<h3 style="margin:0 0 8px;">⚔️ Match Play (net)</h3><div style="font-weight:700; font-size:1.05rem;">${escapeHtml(r.statusText)}</div>`;
    } else if (game === 'nassau' && players.length === 2) {
        const r = computeNassau(players[0], players[1], holes, strokeIndex);
        const seg = (label, m) => m ? `<div style="display:flex; justify-content:space-between; padding:4px 0;"><span>${label}</span><strong>${escapeHtml(m.statusText)}</strong></div>` : '';
        html = `<h3 style="margin:0 0 8px;">🎩 Nassau (net)</h3>${seg('Front 9', r.front)}${seg('Back 9', r.back)}${seg('Overall', r.overall)}`;
    } else {
        // 2-player game selected with a different group size — say so honestly.
        html = `<h3 style="margin:0 0 8px;">Side game</h3><div style="color:#64748b;">${game === 'skins' ? '' : 'Match Play and Nassau need exactly 2 players.'}</div>`;
    }

    panel.innerHTML = html;
    panel.classList.remove('hidden');
}

export function renderDetailedReview() {
    if (!UI.ocDetailedTbody) return;
    UI.ocDetailedTbody.innerHTML = '';

    const p = AppState.liveRoundGroups.find(x => x.uid === AppState.currentUser?.uid);
    if (!p) return;

    const courseName = AppState.currentRoundCourseName;
    // The tee <select> resets on reload; the round's own tee does not.
    const teeName = AppState.currentRoundTee || UI.ocTeeSelect.value;
    const teeData = COURSE_DATA[courseName]?.[teeName] || {};

    const maxHole = AppState.currentRoundHoles || 9;
    const si = getStrokeIndex(teeData, maxHole);
    const cardSI = scoringUnavailableReason(si, p.dailyHandicap) ? null : si;
    for (let h = 1; h <= maxHole; h++) {
        const score = p.scores[h] || 0;
        const holeIdx = h - 1;
        const hPar = AppState.currentCoursePars[holeIdx] || 4;
        const points = cardSI ? calculateHoleStableford(score, hPar, cardSI[holeIdx], p.dailyHandicap, p.dailyHandicapHoles || maxHole) : null;
        const putts = p.simpleStats[h]?.putts || 0;
        const statsStr = [
            fairwayHit(p.simpleStats[h], hPar) ? 'FIR' : '', // par 4/5 only (C25)
            girOf({ par: hPar, gross: score, putts, stored: p.simpleStats[h]?.gir }) ? 'GIR' : ''
        ].filter(Boolean).join(', ') || '-';

        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.innerHTML = `
            <td><strong>${h}</strong> <span style="font-size:0.7rem; opacity:0.6;">(P${hPar})</span></td>
            <td style="font-weight:bold;">${score || '-'}</td>
            <td>${points ?? '—'}</td>
            <td>${putts}</td>
            <td style="font-size:0.75rem;">${statsStr}</td>
        `;
        tr.addEventListener('click', () => openHoleEditor(h));
        UI.ocDetailedTbody.appendChild(tr);
    }
}

/**
 * S12 A3: order the bag row by likelihood for THIS shot. Pure, so the
 * unit tests cover every case and renderBagButtons only renders what
 * this returns.
 *
 * Irons are assumed authored long→short; the estimate ladder is
 * positional (est = 200 - 35 × index) unless the label carries a number,
 * in which case est = 230 - 12 × n. Only the ORDER is affected — same
 * buttons, same ids, every club stays tappable.
 *
 * @param {object} bag {driver, woods[], irons[], wedges[], putter}
 * @param {number|null} d metres from the anchor to the green centre
 * @param {number} shotNumber
 * @param {number|null} par the hole's par
 * @returns {Array<{key:string, items?:Array, label:string, standalone?:boolean}>}
 */
export function orderClubsFor(bag, d, shotNumber, par) {
    const cat = (key) => ({
        driver: { key: 'driver', label: 'Dr', standalone: true },
        woods: { key: 'woods', label: 'Woods', items: bag.woods },
        irons: { key: 'irons', label: 'Irons', items: bag.irons },
        wedges: { key: 'wedges', label: 'Wedges', items: bag.wedges },
        putter: { key: 'putter', label: 'Putter', standalone: true },
    }[key]);

    const ironEstimate = (label, idx) => {
        const n = parseInt(String(label), 10);
        return Number.isFinite(n) ? 230 - 12 * n : 200 - 35 * idx;
    };
    const ironsOutward = (items, ref) => {
        const withEst = (items || []).map((label, i) => ({ label, est: ironEstimate(label, i) }));
        withEst.sort((a, b) => Math.abs(a.est - ref) - Math.abs(b.est - ref));
        return withEst.map(w => w.label);
    };
    const ironsShortFirst = (items) => (items || []).slice().reverse();

    const teeOrder = ['driver', 'woods', 'irons', 'wedges', 'putter'];
    if (d == null) return teeOrder.map(cat); // unknown: today's order
    const irons = cat('irons');
    if (d > 220 || (Number(shotNumber) === 1 && Number(par) >= 4)) {
        return teeOrder.map(cat); // the tee-ball order is already right
    }
    if (d > 100) {
        const approachIrons = { ...irons, items: ironsOutward(bag.irons, d) };
        return [approachIrons, cat('driver'), cat('woods'), cat('wedges'), cat('putter')];
    }
    const shortIrons = { ...irons, items: ironsShortFirst(bag.irons) };
    return [cat('wedges'), cat('putter'), shortIrons, cat('woods'), cat('driver')];
}

// Owner-approved mockup 2026-10-04 (glass chips, sketch 003): the row is
// the 3 likeliest clubs + "All N"; All opens a non-scrolling grid of the
// whole bag. Open/closed survives re-renders but resets on a new shot.
let _clubGridOpen = false;
let _clubGridShotKey = null;


/** The player's bag (My Bag), or the starter bag while it is empty. */
export function currentBag() {
    const own = AppState.playerClubs && Object.keys(AppState.playerClubs).length > 0;
    return own ? AppState.playerClubs : STARTER_BAG;
}

/** Short pill label: 3 Wood→3W, Long Irons→Li, 7 Iron→7i. */
export function shortClubLabel(item) {
    if (item === 'Driver') return 'Dr';
    if (item === 'Putter') return 'Putter';
    let display = String(item).replace('Wood', 'W').replace('Iron', 'i').replace('Wedge', 'W');
    if (display === 'Long i' || display === 'Long is') display = 'Li';
    if (display === 'Mid i' || display === 'Mid is') display = 'Mi';
    if (display === 'Short i' || display === 'Short is') display = 'Si';
    // "3 W" → "3W", "7 i" → "7i": five across at 375 px needs every character.
    return display.replace(/^(\d+)\s+([Wi])$/, '$1$2');
}

/**
 * Flatten orderClubsFor's categories into [{label, val}] — clubs actually
 * in the bag, in the given order. Pure.
 */
export function flattenClubs(bag, categories) {
    const out = [];
    categories.forEach(cat => {
        if (cat.standalone) {
            if ((cat.key === 'driver' && bag.driver) || (cat.key === 'putter' && bag.putter)) {
                const val = cat.key === 'driver' ? 'Driver' : 'Putter';
                out.push({ label: cat.key === 'driver' ? 'Dr' : 'Putter', val });
            }
        } else {
            (cat.items || []).forEach(item => out.push({ label: shortClubLabel(item), val: item }));
        }
    });
    return out;
}

/**
 * The 3 chips: the likeliest club and its 2 neighbours in the ordering.
 * The selected club is always visible — it replaces the 3rd chip when it
 * isn't already one of the three. Pure.
 */
export function pickRowClubs(ordered, selected) {
    const row = ordered.slice(0, 3);
    if (selected && !row.some(c => c.val === selected)) {
        const hit = ordered.find(c => c.val === selected) || { label: shortClubLabel(selected), val: selected };
        if (row.length < 3) row.push(hit);
        else row[2] = hit;
    }
    return row;
}

/**
 * The "Not your clubs? Set up My Bag" hint shows with the All grid, until
 * the golfer has saved their own bag. Shown on every shot it sat between the
 * club row and the hole map and took ~34px off the map on a 375x667 phone
 * (hole-overlay.spec:56 on iphone-se); opening All is the moment a golfer
 * is looking for a club the starter bag doesn't have.
 */
function syncBagHint() {
    const bagHint = document.getElementById('bag-default-hint');
    if (bagHint) bagHint.classList.toggle('hidden', hasSavedBag() || !_clubGridOpen);
}

/** Open/close the All-clubs grid without a re-render. */
export function setClubGridOpen(open) {
    _clubGridOpen = !!open;
    syncBagHint();
    // Class lookups, not ids: both are injected here, not in index.html.
    const root = UI.bagButtonsGrid;
    const panel = root?.querySelector('.club-grid-panel');
    if (panel) panel.classList.toggle('hidden', !_clubGridOpen);
    const allBtn = root?.querySelector('.club-all-btn');
    if (allBtn) allBtn.setAttribute('aria-expanded', String(_clubGridOpen));
}

/**
 * Click on #bag-buttons-grid. Returns 'toggle' (All tapped), 'club' (a
 * club was chosen: AppState.currentShotData.club set, grid closed — the
 * caller re-syncs the wizard) or null.
 */
export function handleBagGridClick(target) {
    if (target?.closest?.('.club-all-btn')) {
        setClubGridOpen(!_clubGridOpen);
        return 'toggle';
    }
    const btn = target?.closest?.('.btn-grid-compact[data-val]');
    if (!btn) return null;
    AppState.currentShotData.club = btn.getAttribute('data-val');
    setClubGridOpen(false);
    return 'club';
}

export function renderBagButtons(d = null) {
    if (!UI.bagButtonsGrid) return;
    UI.bagButtonsGrid.innerHTML = '';

    // Owner feedback 2026-07-05: suggest likely clubs for the situation —
    // tee shot on a par 4/5 dims wedges/putter; a GPS fix near the green dims
    // the long stuff. Emphasis only: every club stays tappable (20m from the
    // green under a tree might genuinely be a 5-iron). Since 2026-10-04 the
    // dim lives in the All grid; the 3-chip row is already the likely set.
    const likelyGroups = suggestClubGroups();

    // S12 A3: the row is ordered by likelihood for the shot (orderClubsFor);
    // when the overlay gives no distance, fall back to the S4 pin distance.
    const dEff = d ?? AppState.currentShotData?.distanceToPinM ?? null;
    const shotNumber = AppState.currentShotData?.shotNumber || (AppState.currentHoleShots?.length || 0) + 1;
    const par = AppState.currentCoursePars?.[AppState.currentHole - 1] ?? null;

    const bag = currentBag();

    // A new shot starts with the grid closed — including hole 1 shot 1 of a
    // fresh round (Codex review P3, 2026-10-04), hence the round id.
    const shotKey = `${AppState.activeRoundId || ''}-${AppState.currentHole}-${shotNumber}`;
    if (shotKey !== _clubGridShotKey) { _clubGridShotKey = shotKey; _clubGridOpen = false; }
    // Owner feedback 2026-07-05: first shot of the round was a driving iron
    // with nothing to tap — surface the My Bag setup until the golfer has
    // saved their own bag (E35: state.js always fills in the starter bag, so
    // "is playerClubs empty?" was never true and the hint never showed).
    syncBagHint();

    const ordered = flattenClubs(bag, orderClubsFor(bag, dEff, shotNumber, par));
    const inBagOrder = flattenClubs(bag, orderClubsFor(bag, null, shotNumber, par));
    const suggested = ordered[0]?.val ?? null;
    const selected = AppState.currentShotData?.club || null;

    const makeBtn = ({ label, val }) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-grid-compact club-chip';
        if (selected === val) btn.classList.add('active-choice');
        btn.setAttribute('data-val', val);
        btn.setAttribute('title', val);
        btn.textContent = label;
        return btn;
    };

    // Row: 3 chips + All N. No sideways scroll (owner-approved 2026-10-04).
    const row = document.createElement('div');
    row.className = 'club-row';
    pickRowClubs(ordered, selected).forEach(c => row.appendChild(makeBtn(c)));
    const all = document.createElement('button');
    all.type = 'button';
    all.id = 'btn-all-clubs';
    all.className = 'club-all-btn';
    all.setAttribute('aria-controls', 'club-grid-panel');
    all.setAttribute('aria-expanded', String(_clubGridOpen));
    all.innerHTML = `<span class="club-all-icon" aria-hidden="true">▦</span>All ${inBagOrder.length}`;
    row.appendChild(all);
    UI.bagButtonsGrid.appendChild(row);

    // Grid: every club in bag order, 5 across, wrapping — never scrolls.
    const panel = document.createElement('div');
    panel.id = 'club-grid-panel';
    panel.className = 'club-grid-panel' + (_clubGridOpen ? '' : ' hidden');
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-label', 'All clubs');
    inBagOrder.forEach(c => {
        const btn = makeBtn(c);
        if (c.val === suggested) btn.classList.add('club-suggested');
        // Owner feedback 2026-07-05 (round 2): the dim must never fight the
        // selection highlight — your chosen club is always full-strength.
        if (selected !== c.val && likelyGroups && !likelyGroups.has(clubGroup(c.val))) {
            btn.classList.add('club-unlikely');
        }
        panel.appendChild(btn);
    });
    UI.bagButtonsGrid.appendChild(panel);
}

/**
 * Which club groups fit the current shot? null = no opinion (highlight all).
 * Tee shots use the hole's par; later shots use the live GPS distance when a
 * fresh fix exists. Bands are deliberately generous — this dims, not filters.
 */
function suggestClubGroups() {
    const par = AppState.currentCoursePars?.[AppState.currentHole - 1];
    const shotNum = AppState.currentShotData?.shotNumber || 1;

    if (shotNum === 1 && par >= 4) {
        return new Set(['driver', 'woods', 'irons']); // par 4/5 tee ball
    }
    if (shotNum === 1 && par === 3) {
        return new Set(['woods', 'irons', 'wedges']); // par-3 tee ball
    }
    const fix = getLastGpsFix();
    if (!fix || !Number.isFinite(fix.distM)) return null;
    if (fix.distM <= 30) return new Set(['wedges', 'putter']);
    if (fix.distM <= 120) return new Set(['irons', 'wedges']);
    if (fix.distM <= 200) return new Set(['woods', 'irons']);
    return new Set(['driver', 'woods', 'irons']);
}

export function renderHoleJumper() {
    const container = document.getElementById('hole-jumper-container');
    if (!container) return;
    const total = AppState.currentRoundHoles || 9;
    const order = holeOrder(total, AppState.currentRoundStartHole || 1);
    const activePosition = order.indexOf(AppState.currentHole);
    container.innerHTML = '';
    for (let i = 1; i <= total; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = i;
        const isCurrent = i === AppState.currentHole;
        const isDone = order.indexOf(i) < activePosition;
        // S12 A4: 56 px snap cells — the strip is a swipe, cells land centred.
        const baseStyle = 'min-width:56px; height:56px; border-radius:50%; border:2px solid; font-weight:700; font-size:0.95rem; cursor:pointer; flex-shrink:0; scroll-snap-align:center;';
        if (isCurrent) {
            btn.style.cssText = baseStyle + 'border-color:#1e3c72; background:#1e3c72; color:white;';
        } else if (isDone) {
            btn.style.cssText = baseStyle + 'border-color:#10b981; background:#dcfce7; color:#065f46;';
            // Played holes wear a tick.
            btn.textContent = '✓';
            btn.setAttribute('aria-label', `Hole ${i} played`);
        } else {
            btn.style.cssText = baseStyle + 'border-color:#cbd5e1; background:white; color:#475569;';
        }
        if (!btn.getAttribute('aria-label')) btn.setAttribute('aria-label', `Go to hole ${i}`);
        btn.addEventListener('click', () => jumpToHole(i));
        container.appendChild(btn);
    }
    // Auto-center active hole button
    const activeBtn = container.children[AppState.currentHole - 1];
    if (activeBtn) {
        activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
}
