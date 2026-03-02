import { db } from './firebase-config.js';
import { collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";

export async function aggregateShotPatterns(uid) {
    const dispEl = document.getElementById('coach-shot-dispersion');
    if (!dispEl) return;
    dispEl.innerHTML = '<p style="color:#94a3b8;">Analyzing shot history...</p>';

    try {
        const q = query(
            collection(db, 'shots'),
            where('uid', '==', uid),
            orderBy('timestamp', 'desc'),
            limit(500)
        );
        const snap = await getDocs(q);
        if (snap.empty) {
            dispEl.innerHTML = '<p style="color:#94a3b8;">No detailed shot data available for this athlete.</p>';
            return;
        }

        const stats = {
            total: 0,
            direction: { Left: 0, Straight: 0, Right: 0 },
            trajectory: { Low: 0, Medium: 0, High: 0 },
            curve: { Draw: 0, Straight: 0, Fade: 0 }
        };

        snap.forEach(d => {
            const s = d.data();
            stats.total++;
            if (s.line && stats.direction[s.line] !== undefined) stats.direction[s.line]++;
            if (s.trajectory && stats.trajectory[s.trajectory] !== undefined) stats.trajectory[s.trajectory]++;
            if (s.curve && stats.curve[s.curve] !== undefined) stats.curve[s.curve]++;
        });

        const getPct = (val, total) => total > 0 ? Math.round((val / total) * 100) : 0;

        dispEl.innerHTML = `
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
                    ${Object.entries(stats.curve).map(([k, v]) => `
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
        `;
    } catch (e) {
        console.error("Aggregation error:", e);
        dispEl.innerHTML = '<p style="color:#ef4444;">Failed to load analytics.</p>';
    }
}
