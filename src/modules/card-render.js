import { AppState } from '../state.js';
import { UI } from '../ui.js';
import { COURSE_DATA } from '../course-data.js';
import { calculateHoleStableford } from '../whs.js';
import { openHoleEditor } from '../oncourse.js';
import { jumpToHole } from '../oncourse.js';

/**
 * Task 3: Live Leaderboard Logic
 * Calculates Stableford points across all players in current session
 */
export function updateLiveLeaderboard() {
    const tbody = document.getElementById('oc-leaderboard-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const courseName = AppState.currentRoundCourseName;
    const teeName = UI.ocTeeSelect ? UI.ocTeeSelect.value : null;
    const teeData = COURSE_DATA[courseName]?.[teeName] || {};

    const standings = AppState.liveRoundGroups.map(p => {
        let pts = 0;
        let thru = 0;
        for (let h = 1; h <= AppState.currentRoundHoles; h++) {
            const gross = p.scores[h];
            if (gross > 0) {
                thru = h;
                const hIdx = h - 1;
                const hPar = AppState.currentCoursePars[hIdx] || 4;
                const hSI = teeData.strokeIndex?.[hIdx] || h;
                pts += calculateHoleStableford(gross, hPar, hSI, p.dailyHandicap);
            }
        }
        return { name: p.name, points: pts, thru: thru };
    });

    // Sort by Stableford points desc
    standings.sort((a, b) => b.points - a.points);

    standings.forEach((s, i) => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #f1f5f9';
        tr.innerHTML = `
            <td style="padding:12px 8px; font-weight:700; color:#64748b;">${i + 1}</td>
            <td style="padding:12px 8px; font-weight:600;">${s.name}</td>
            <td style="padding:12px 8px; text-align:center; color:#64748b;">${s.thru}</td>
            <td style="padding:12px 8px; text-align:right; font-weight:800; color:var(--primary-color);">${s.points}</td>
        `;
        tbody.appendChild(tr);
    });
}

export function renderDetailedReview() {
    if (!UI.ocDetailedTbody) return;
    UI.ocDetailedTbody.innerHTML = '';

    const p = AppState.liveRoundGroups.find(x => x.uid === AppState.currentUser?.uid);
    if (!p) return;

    const courseName = AppState.currentRoundCourseName;
    const teeName = UI.ocTeeSelect.value;
    const teeData = COURSE_DATA[courseName]?.[teeName] || {};

    const maxHole = AppState.currentRoundHoles || 9;
    for (let h = 1; h <= maxHole; h++) {
        const score = p.scores[h] || 0;
        const holeIdx = h - 1;
        const hPar = AppState.currentCoursePars[holeIdx] || 4;
        const hSI = teeData.strokeIndex?.[holeIdx] || (holeIdx + 1);
        const points = calculateHoleStableford(score, hPar, hSI, p.dailyHandicap);
        const putts = p.simpleStats[h]?.putts || 0;
        const statsStr = [
            (p.simpleStats[h]?.fir || p.simpleStats[h]?.fwy) ? 'FIR' : '',
            p.simpleStats[h]?.gir ? 'GIR' : ''
        ].filter(Boolean).join(', ') || '-';

        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.innerHTML = `
            <td><strong>${h}</strong> <span style="font-size:0.7rem; opacity:0.6;">(P${hPar})</span></td>
            <td style="font-weight:bold;">${score || '-'}</td>
            <td>${points}</td>
            <td>${putts}</td>
            <td style="font-size:0.75rem;">${statsStr}</td>
        `;
        tr.addEventListener('click', () => openHoleEditor(h));
        UI.ocDetailedTbody.appendChild(tr);
    }
}

export function renderBagButtons() {
    if (!UI.bagButtonsGrid) return;
    UI.bagButtonsGrid.innerHTML = '';

    const defaultBag = {
        driver: true,
        woods: ['3 Wood'],
        irons: ['Long Irons', 'Mid Irons', 'Short Iron'],
        wedges: ['56'],
        putter: true
    };
    const bag = (AppState.playerClubs && Object.keys(AppState.playerClubs).length > 0) ? AppState.playerClubs : defaultBag;

    const categories = [
        { key: 'driver', label: 'Dr', standalone: true },
        { key: 'woods', label: 'Woods', items: bag.woods },
        { key: 'irons', label: 'Irons', items: bag.irons },
        { key: 'wedges', label: 'Wedges', items: bag.wedges },
        { key: 'putter', label: 'Putter', standalone: true }
    ];

    categories.forEach(cat => {
        if (cat.standalone && bag[cat.key]) {
            addButton(cat.label, cat.key === 'driver' ? 'Driver' : 'Putter');
        } else if (cat.items && cat.items.length > 0) {
            cat.items.forEach(item => {
                // Shorten labels for pills
                let display = item.replace('Wood', 'W').replace('Iron', 'i').replace('Wedge', 'W');
                if (display === 'Long i') display = 'Li';
                if (display === 'Mid i') display = 'Mi';
                if (display === 'Short i') display = 'Si';
                addButton(display, item);
            });
        }
    });

    function addButton(label, val) {
        const btn = document.createElement('button');
        btn.className = 'btn-grid-compact';
        btn.style.minWidth = '60px';
        btn.style.whiteSpace = 'nowrap';
        if (AppState.currentShotData.club === val) btn.classList.add('active-choice');
        btn.setAttribute('data-val', val);
        btn.textContent = label;
        UI.bagButtonsGrid.appendChild(btn);
    }
}

export function renderHoleJumper() {
    const container = document.getElementById('hole-jumper-container');
    if (!container) return;
    const total = AppState.currentRoundHoles || 9;
    container.innerHTML = '';
    for (let i = 1; i <= total; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = i;
        const isCurrent = i === AppState.currentHole;
        const isDone = i < AppState.currentHole;
        const baseStyle = 'min-width:44px; height:44px; border-radius:50%; border:2px solid; font-weight:700; font-size:0.85rem; cursor:pointer; flex-shrink:0;';
        if (isCurrent) {
            btn.style.cssText = baseStyle + 'border-color:#1e3c72; background:#1e3c72; color:white;';
        } else if (isDone) {
            btn.style.cssText = baseStyle + 'border-color:#10b981; background:#dcfce7; color:#065f46;';
        } else {
            btn.style.cssText = baseStyle + 'border-color:#cbd5e1; background:white; color:#475569;';
        }
        btn.setAttribute('aria-label', `Go to hole ${i}`);
        btn.addEventListener('click', () => jumpToHole(i));
        container.appendChild(btn);
    }
    // Auto-center active hole button
    const activeBtn = container.children[AppState.currentHole - 1];
    if (activeBtn) {
        activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
}
