import { db } from './firebase-config.js';
import { collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";
import { clubGroup, computeRoutineImpact } from './insights.js';

// Coach idea #2 (2026-07-04): a driver miss pattern means something different
// from a wedge one, and coaches think in "since we changed X" windows — so the
// aggregation is filterable by club group and date range. Filter state is
// kept per-view and re-runs the (cached) aggregation.
let _shotsCache = { uid: null, shots: [] };
let _filters = { group: 'all', days: 0 }; // days 0 = all time

const GROUPS = [
    ['all', 'All'], ['driver', 'Driver'], ['woods', 'Woods'],
    ['irons', 'Irons'], ['wedges', 'Wedges'], ['putter', 'Putter']
];
const RANGES = [[0, 'All time'], [90, '90 days'], [30, '30 days']];

export async function aggregateShotPatterns(uid) {
    const dispEl = document.getElementById('coach-shot-dispersion');
    if (!dispEl) return;
    dispEl.innerHTML = '<p style="color:#94a3b8;">Analyzing shot history...</p>';

    try {
        // Fresh fetch on every dashboard open; the cache exists so filter
        // clicks re-render without re-querying.
        const q = query(
            collection(db, 'shots'),
            where('uid', '==', uid),
            orderBy('timestamp', 'desc'),
            limit(500)
        );
        const snap = await getDocs(q);
        _shotsCache = { uid, shots: snap.docs.map(d => d.data()) };
        _filters = { group: 'all', days: 0 };
        renderShotPatterns(uid, dispEl);
    } catch (e) {
        console.error("Aggregation error:", e);
        dispEl.innerHTML = '<p style="color:#ef4444;">Failed to load analytics.</p>';
    }
}

function renderShotPatterns(uid, dispEl) {
    const cutoff = _filters.days > 0 ? Date.now() - _filters.days * 86400000 : 0;
        const shots = _shotsCache.shots.filter(s =>
            (_filters.group === 'all' || clubGroup(s.club) === _filters.group) &&
            (!cutoff || (s.timestamp && new Date(s.timestamp).getTime() >= cutoff)));

        const filterBar = `
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px; align-items:center;">
                ${GROUPS.map(([k, label]) => `
                    <button type="button" class="btn-text disp-group" data-group="${k}"
                        style="padding:3px 10px; border-radius:99px; border:1px solid ${_filters.group === k ? '#1e3c72' : '#e2e8f0'}; background:${_filters.group === k ? '#1e3c72' : 'white'}; color:${_filters.group === k ? 'white' : '#475569'}; font-size:0.75rem; font-weight:600;">${label}</button>`).join('')}
                <span style="width:8px;"></span>
                ${RANGES.map(([d, label]) => `
                    <button type="button" class="btn-text disp-range" data-days="${d}"
                        style="padding:3px 10px; border-radius:99px; border:1px solid ${_filters.days === d ? '#1e3c72' : '#e2e8f0'}; background:${_filters.days === d ? '#1e3c72' : 'white'}; color:${_filters.days === d ? 'white' : '#475569'}; font-size:0.75rem; font-weight:600;">${label}</button>`).join('')}
            </div>`;

        if (!shots.length) {
            dispEl.innerHTML = filterBar + '<p style="color:#94a3b8;">No detailed shot data for this filter.</p>';
            bindDispersionFilters(uid, dispEl);
            return;
        }

        const stats = {
            total: 0,
            direction: { Left: 0, Straight: 0, Right: 0 },
            trajectory: { Low: 0, Medium: 0, High: 0 },
            shape: { Hook: 0, Draw: 0, Straight: 0, Fade: 0, Slice: 0 },
            // BL-MG-01 result-vs-target taps, laid out as the 3×3 grid the
            // player sees (long row on top):
            miss: {
                'Long Left': 0, 'Long': 0, 'Long Right': 0,
                'Left': 0, 'On Target': 0, 'Right': 0,
                'Short Left': 0, 'Short': 0, 'Short Right': 0
            },
            missTotal: 0
        };

        shots.forEach(s => {
            stats.total++;
            if (s.startLine && stats.direction[s.startLine] !== undefined) stats.direction[s.startLine]++;
            if (s.trajectory && stats.trajectory[s.trajectory] !== undefined) stats.trajectory[s.trajectory]++;
            if (s.shape && stats.shape[s.shape] !== undefined) stats.shape[s.shape]++;
            if (s.missPattern && stats.miss[s.missPattern] !== undefined) { stats.miss[s.missPattern]++; stats.missTotal++; }
        });

        const getPct = (val, total) => total > 0 ? Math.round((val / total) * 100) : 0;

        // Coach idea #1: routine adherence vs outcome, over the SAME filter.
        const routine = computeRoutineImpact(shots);

        dispEl.innerHTML = filterBar + `
            <div class="stat-group">
                <h4 style="font-size:0.85rem; color:#64748b; margin-bottom:10px; text-transform:uppercase;">Start Line</h4>
                <div style="display:flex; flex-direction:column; gap:8px;">
                    ${Object.entries(stats.direction).map(([k, v]) => `
                        <div style="font-size:0.9rem;">
                            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                                <span>${k}</span><span>${getPct(v, stats.total)}%</span>
                            </div>
                            <div style="height:6px; background:#f1f5f9; border-radius:3px; overflow:hidden;">
                                <div style="width:${getPct(v, stats.total)}%; height:100%; background:${k === 'Straight' ? '#10b981' : '#f59e0b'};"></div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="stat-group">
                <h4 style="font-size:0.85rem; color:#64748b; margin-bottom:10px; text-transform:uppercase;">Trajectory</h4>
                <div style="display:flex; flex-direction:column; gap:8px;">
                    ${Object.entries(stats.trajectory).map(([k, v]) => `
                        <div style="font-size:0.9rem;">
                            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                                <span>${k}</span><span>${getPct(v, stats.total)}%</span>
                            </div>
                            <div style="height:6px; background:#f1f5f9; border-radius:3px; overflow:hidden;">
                                <div style="width:${getPct(v, stats.total)}%; height:100%; background:#3867d6;"></div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="stat-group">
                <h4 style="font-size:0.85rem; color:#64748b; margin-bottom:10px; text-transform:uppercase;">Shot Shape</h4>
                <div style="display:flex; flex-direction:column; gap:8px;">
                    ${Object.entries(stats.shape).map(([k, v]) => `
                        <div style="font-size:0.9rem;">
                            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                                <span>${k}</span><span>${getPct(v, stats.total)}%</span>
                            </div>
                            <div style="height:6px; background:#f1f5f9; border-radius:3px; overflow:hidden;">
                                <div style="width:${getPct(v, stats.total)}%; height:100%; background:${k === 'Straight' ? '#10b981' : '#8b5cf6'};"></div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            ${stats.missTotal > 0 ? `
            <div class="stat-group">
                <h4 style="font-size:0.85rem; color:#64748b; margin-bottom:10px; text-transform:uppercase;">Result vs Target (${stats.missTotal} shots)</h4>
                <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:4px; text-align:center;">
                    ${Object.entries(stats.miss).map(([k, v]) => {
                        const pct = getPct(v, stats.missTotal);
                        const heat = pct === 0 ? '#f8fafc'
                            : k === 'On Target' ? `rgba(16,185,129,${0.25 + pct / 130})`
                            : `rgba(245,158,11,${0.2 + pct / 130})`;
                        return `
                        <div style="background:${heat}; border:1px solid #e2e8f0; border-radius:6px; padding:8px 2px;">
                            <div style="font-size:0.65rem; color:#475569; font-weight:600;">${k}</div>
                            <div style="font-size:0.95rem; font-weight:800;">${pct}%</div>
                        </div>`;
                    }).join('')}
                </div>
            </div>` : ''}
            ${routine ? `
            <div class="stat-group" style="grid-column: 1 / -1;">
                <div style="background:${routine.deltaPct >= 8 ? '#f0fdf4' : '#f8fafc'}; border:1px solid ${routine.deltaPct >= 8 ? '#bbf7d0' : '#e2e8f0'}; border-radius:8px; padding:10px 12px; font-size:0.9rem;">
                    🧠 <strong>Routine vs result:</strong> with the pre-shot routine, ${routine.passOnPct}% on target
                    (${routine.passN} shots); without it, ${routine.failOnPct}% (${routine.failN} shots)
                    ${routine.deltaPct > 0 ? `— the routine is worth <strong>+${routine.deltaPct}%</strong> on-target.` : '— no measurable difference yet.'}
                </div>
            </div>` : ''}
        `;
    bindDispersionFilters(uid, dispEl);
}

function bindDispersionFilters(uid, dispEl) {
    dispEl.querySelectorAll('.disp-group').forEach(b => b.addEventListener('click', () => {
        _filters.group = b.getAttribute('data-group');
        renderShotPatterns(uid, dispEl);
    }));
    dispEl.querySelectorAll('.disp-range').forEach(b => b.addEventListener('click', () => {
        _filters.days = parseInt(b.getAttribute('data-days'), 10) || 0;
        renderShotPatterns(uid, dispEl);
    }));
}
