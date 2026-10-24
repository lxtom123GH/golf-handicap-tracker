import { gaScoreRecord, nineHoleStatus } from './ga-score-record.js';
import { userErrorMessage } from './user-messages.js';
// ==========================================
// coach.js
// Coach Portal & Player Management
// ==========================================

import { db, functions } from './firebase-config.js';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, addDoc, serverTimestamp, orderBy, limit, arrayUnion, arrayRemove } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { UI } from './ui.js';
import { AppState } from './state.js';
import { generateAIResponse } from './ai.js';
import { aggregateShotPatterns } from './analytics.js';
import { mountHolePlanCard } from './modules/hole-plan-card.js';
import { renderIntentPanel } from './modules/intent-render.js';
import { escapeHtml } from './escape.js';
import { roundDifferential } from './differential.js';
import { formatHandicap } from './handicap-decimal.js';

let _coachViewUid = null;
// F-10: an athlete's Handicap Index lives in `profiles`, not `users`, so it
// takes a read per athlete. Cached for the session so the roster loop and the
// detail view do not ask twice for the same person.
const _athleteIndexCache = new Map();

export function bindCoachTools() {
    const btnManageCoaches = document.getElementById('btn-manage-coaches');
    const manageContainer = document.getElementById('manage-coaches-container');
    const btnCloseCoaches = document.getElementById('btn-close-coaches');

    if (btnManageCoaches && manageContainer) {
        btnManageCoaches.addEventListener('click', () => {
            manageContainer.classList.remove('hidden');
            loadMyCoaches();
        });
    }
    if (btnCloseCoaches && manageContainer) {
        btnCloseCoaches.addEventListener('click', () => {
            manageContainer.classList.add('hidden');
        });
    }

    const form = document.getElementById('add-coach-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const emailInput = document.getElementById('coach-email');
            const email = emailInput?.value.trim();
            if (!email || !AppState.currentUser) return;
            try {
                // coaches[] stores coach UIDs. BL-DD-05: the users collection is
                // locked down, so resolve email→uid via a server callable
                // (returns only the uid, never the user doc).
                const resolveByEmail = httpsCallable(functions, 'resolveUserByEmail');
                const resolved = await resolveByEmail({ email });
                const coachUid = resolved.data?.uid;
                if (!coachUid) {
                    // F-22 (2026-09-10): the callable now answers only about
                    // accounts flagged as coaches, so "no match" and "that
                    // person is not a coach" are deliberately the same answer.
                    alert(`No coach is registered with the email ${email}. `
                        + `Ask them to have an admin mark their account as a coach.`);
                    return;
                }
                if (coachUid === AppState.currentUser.uid) {
                    alert("You can't add yourself as a coach.");
                    return;
                }
                const userRef = doc(db, "users", AppState.currentUser.uid);
                await updateDoc(userRef, { coaches: arrayUnion(coachUid) });
                emailInput.value = '';
                loadMyCoaches();
            } catch (e) {
                console.error("Add coach error", e);
                alert(userErrorMessage(e, 'Could not add the coach. Check your connection, then try again.'));
            }
        });
    }
}

async function loadMyCoaches() {
    const list = document.getElementById('my-coaches-list');
    if (!list || !AppState.currentUser) return;
    list.innerHTML = '<li>Loading your coaches… Please wait.</li>';
    try {
        const userRef = doc(db, "users", AppState.currentUser.uid);
        const userDoc = await getDoc(userRef);
        const coaches = userDoc.exists() ? (userDoc.data().coaches || []) : [];
        if (coaches.length === 0) {
            list.innerHTML = '<li>No coaches added yet. Enter your coach’s email address above to add them.</li>';
            return;
        }
        list.innerHTML = '';
        coaches.forEach(cid => {
            const li = document.createElement('li');
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.innerHTML = `<span>Coach UID: ${escapeHtml(cid)}</span> <button class="btn btn-danger btn-sm" onclick="removeCoach('${escapeHtml(cid)}')">Remove</button>`;
            list.appendChild(li);
        });
    } catch (e) {
        list.innerHTML = '<li>Could not load your coaches. Check your connection, then close and reopen Manage My Coaches.</li>';
    }
}

window.removeCoach = async function (cid) {
    if (!AppState.currentUser) return;
    try {
        const userRef = doc(db, "users", AppState.currentUser.uid);
        const userDoc = await getDoc(userRef);
        let coaches = userDoc.exists() ? (userDoc.data().coaches || []) : [];
        coaches = coaches.filter(c => c !== cid);
        await updateDoc(userRef, { coaches: coaches });
        loadMyCoaches();
    } catch (e) {
        alert(userErrorMessage(e, 'Could not remove the coach. Reopen Manage My Coaches to check the list before trying again.'));
    }
};

export function bindCoachDashboard() {
    if (!window.currentUserIsCoach && !window.currentUserIsAdmin) return;

    const rosterEl = document.getElementById('coach-roster-list');
    const rosterCount = document.getElementById('coach-roster-count');
    const playerView = document.getElementById('coach-player-view');
    const rosterSection = rosterEl?.parentElement;

    const btnBack = document.getElementById('btn-coach-back');
    if (btnBack) {
        btnBack.addEventListener('click', () => {
            playerView?.classList.add('hidden');
            rosterSection?.classList.remove('hidden');
            _coachViewUid = null;
        });
    }

    const btnAiPlan = document.getElementById('btn-coach-ai-plan');
    if (btnAiPlan) {
        btnAiPlan.addEventListener('click', () => {
            if (_coachViewUid) generateAIResponse(_coachViewUid, 'coach');
        });
    }

    const btnSaveNote = document.getElementById('btn-save-coach-note');
    if (btnSaveNote) {
        btnSaveNote.addEventListener('click', async () => {
            if (!_coachViewUid) return;
            const text = document.getElementById('coach-note-input')?.value.trim();
            if (!text) return;
            await addDoc(collection(db, 'users', _coachViewUid, 'coachNotes'), {
                coachUid: AppState.currentUser.uid,
                text,
                createdAt: serverTimestamp()
            });
            document.getElementById('coach-note-input').value = '';
            loadCoachNotes(_coachViewUid);
        });
    }

    const btnAssign = document.getElementById('btn-assign-drill');
    if (btnAssign) {
        btnAssign.addEventListener('click', async () => {
            if (!_coachViewUid) return;
            const name = document.getElementById('coach-drill-assign-name')?.value.trim();
            const notes = document.getElementById('coach-drill-assign-notes')?.value.trim();
            if (!name) return;
            const msgEl = document.getElementById('assign-drill-msg');
            try {
                await addDoc(collection(db, 'users', _coachViewUid, 'assignedDrills'), {
                    drillName: name,
                    notes: notes || '',
                    assignedBy: AppState.currentUser.uid,
                    assignedAt: serverTimestamp(),
                    completed: false
                });
                if (msgEl) { msgEl.textContent = '📌 Drill assigned!'; msgEl.style.color = '#10b981'; }
                document.getElementById('coach-drill-assign-name').value = '';
                document.getElementById('coach-drill-assign-notes').value = '';
            } catch (e) {
                if (msgEl) { msgEl.textContent = userErrorMessage(e, 'Could not assign the drill. Keep your notes here and try again.'); msgEl.style.color = '#ef4444'; }
            }
        });
    }

    loadCoachRoster();

    window.refreshCoachDashboard = async () => {
        const rosterEl = document.getElementById('coach-roster-list');
        if (rosterEl) rosterEl.innerHTML = '<p style="color:#64748b;">Refreshing your players… Please wait.</p>';
        await loadCoachRoster();
    };

    /**
     * An athlete's Handicap Index, read from where it is written.
     *
     * PRODUCT SWEEP 2026-09-10 SECOND PASS F-10: the roster's headline stat
     * and the individual player view both read `handicapIndex` off the
     * athlete's `users` document. Nothing in the client or the Cloud Functions
     * has ever written that field to `users` — whs.js writes it to `profiles`
     * (:490-499, :539-544), and functions/index.js:808-820 mirrors users into
     * profiles, one way, its own comment noting that profiles is what carries
     * the index. So a coach with ten athletes saw ten dashes, which after
     * PR #137 is also exactly what a genuinely unestablished index looks like.
     * `profiles` is readable by any authenticated account (the F-24 decision),
     * and oncourse.js:187-190 already reads it this way.
     *
     * Cached per session: the roster loop runs once per athlete and the detail
     * view asks again for the same person.
     *
     * @param {string} uid
     * @returns {Promise<number|null>} The index, or null if not established.
     */
    async function fetchAthleteIndex(uid) {
        if (_athleteIndexCache.has(uid)) return _athleteIndexCache.get(uid);
        let index = null;
        try {
            const snap = await getDoc(doc(db, 'profiles', uid));
            if (snap.exists()) {
                const parsed = parseFloat(snap.data().handicapIndex);
                if (Number.isFinite(parsed)) index = parsed;
            }
        } catch (e) {
            console.warn('[Coach] Could not read athlete profile:', e);
        }
        _athleteIndexCache.set(uid, index);
        return index;
    }

    async function loadCoachRoster() {
        if (!rosterEl) return;
        const myUid = AppState.currentUser.uid;

        // Fetch athletes who have linked this coach via their coaches[] array.
        const q = query(collection(db, 'users'), where('coaches', 'array-contains', myUid));
        const snap = await getDocs(q);
        const athletes = [];
        snap.forEach(d => {
            athletes.push({ uid: d.id, ...d.data() });
        });

        if (rosterCount) rosterCount.textContent = `${athletes.length} athlete${athletes.length !== 1 ? 's' : ''}`;

        if (!athletes.length) {
            rosterEl.innerHTML = '<p style="color:#94a3b8;">No players are linked to you yet. Ask a player to add your email address through Manage My Coaches.</p>';
            return;
        }

        rosterEl.innerHTML = '';
        for (const athlete of athletes) {
            const athleteHI = await fetchAthleteIndex(athlete.uid);
            // Trend analysis
            const roundsQuery = query(collection(db, 'whs_rounds'), where('uid', '==', athlete.uid), orderBy('date', 'desc'));
            const hiSnap = await getDocs(roundsQuery);
            const sourceRounds = [];
            hiSnap.forEach(docSnap => sourceRounds.push({ ...docSnap.data(), id: docSnap.id }));
            const rounds = gaScoreRecord(sourceRounds).completed.slice(0, 10);

            let trendBadge = '';
            if (rounds.length >= 4) {
                const half = Math.floor(rounds.length / 2);
                const recent = rounds.slice(0, half).reduce((a, b) => a + b.diff, 0) / half;
                const older = rounds.slice(half, half * 2).reduce((a, b) => a + b.diff, 0) / (rounds.length - half);
                const delta = recent - older;
                if (delta < -0.5) trendBadge = '<span class="status-badge success">📉 Improving</span>';
                else if (delta > 0.5) trendBadge = '<span class="status-badge error">📈 Declining</span>';
                else trendBadge = '<span class="status-badge info">→ Stable</span>';
            }

            const card = document.createElement('div');
            card.className = 'coach-roster-card';
            card.innerHTML = `
                <div class="athlete-info">
                    <div class="avatar">${escapeHtml((athlete.displayName || athlete.email || '?')[0].toUpperCase())}</div>
                    <div>
                        <div class="name">${escapeHtml(athlete.displayName || athlete.email)}</div>
                        <div class="meta">${trendBadge}</div>
                    </div>
                </div>
                <div class="athlete-stat">
                    <div class="value">${escapeHtml(athleteHI ?? '--')}</div>
                    <div class="label">HI</div>
                </div>
                <div style="display: flex; gap: 8px; margin-left: 15px;">
                    <button class="btn btn-primary btn-sm athlete-view-btn">View</button>
                    <button class="btn btn-danger btn-sm athlete-release-btn">Release</button>
                </div>
            `;

            const viewBtn = card.querySelector('.athlete-view-btn');
            if (viewBtn) viewBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                loadCoachPlayerView(athlete);
            });

            const releaseBtn = card.querySelector('.athlete-release-btn');
            if (releaseBtn) releaseBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm(`Are you sure you want to release ${athlete.displayName || athlete.email}? They will be removed from your roster.`)) {
                    // F-21 (2026-09-10): this write was denied by the rules and
                    // nothing caught it, so the roster silently re-rendered
                    // unchanged and the coach kept read access to the student's
                    // data. The rule now permits exactly this shape — remove
                    // only yourself, touch nothing else — and a future denial
                    // is visible instead of silent.
                    try {
                        await updateDoc(doc(db, 'users', athlete.uid), { coaches: arrayRemove(myUid) });
                    } catch (err) {
                        console.error('[Coach] Release failed:', err);
                        alert('Could not release this player. Please try again.');
                        return;
                    }
                    loadCoachRoster(); // Refresh the UI
                }
            });

            card.addEventListener('click', () => loadCoachPlayerView(athlete));
            rosterEl.appendChild(card);
        }
    }

    async function loadCoachPlayerView(athlete) {
        _coachViewUid = athlete.uid;
        rosterSection?.classList.add('hidden');
        playerView?.classList.remove('hidden');
        document.getElementById('coach-view-name').textContent = athlete.displayName || athlete.email;

        const athleteHI = await fetchAthleteIndex(athlete.uid);
        const roundsSnap = await getDocs(query(collection(db, 'whs_rounds'), where('uid', '==', athlete.uid), orderBy('date', 'desc')));
        const tbodyWhs = document.getElementById('coach-whs-tbody');
        if (tbodyWhs) {
            tbodyWhs.innerHTML = '';
            const sourceRounds = [];
            roundsSnap.forEach(d => sourceRounds.push({ ...d.data(), id: d.id }));
            const record = gaScoreRecord(sourceRounds);
            let putts = [], fwy = [], gir = [], diffs = record.completed.slice(0, 10).map(r => r.diff);
            sourceRounds.slice(0, 10).forEach(r => {
                const diffNum = roundDifferential(r, athleteHI);          // F-6
                const number = diffNum === null ? '--' : formatHandicap(diffNum);
                const diff = number + (r.holesPlayed === 9 ? `<small>${escapeHtml(nineHoleStatus(r, record))}</small>` : '');
                const date = r.date?.toDate ? r.date.toDate().toLocaleDateString('en-AU') : '--';
                if (r.stats?.putts) putts.push(r.stats.putts);
                if (r.stats?.fwy) fwy.push(r.stats.fwy);
                if (r.stats?.gir) gir.push(r.stats.gir);
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${date}</td><td>${escapeHtml(r.course)}</td><td>${r.adjustedGross}</td><td>${diff}</td><td>${r.stats?.putts ?? '--'}</td><td>${r.stats?.fwy ?? '--'}</td><td>${r.stats?.gir ?? '--'}</td>`;
                tbodyWhs.appendChild(tr);
            });
            const avg = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : '--';
            document.getElementById('coach-stat-putts').textContent = avg(putts);
            document.getElementById('coach-stat-fwy').textContent = fwy.length ? avg(fwy) + '/14' : '--';
            document.getElementById('coach-stat-gir').textContent = gir.length ? avg(gir) + '/18' : '--';
            // S2: the athlete's intent-vs-execution panel (shots, newest first).
            try {
                const shotsSnap = await getDocs(query(
                    collection(db, 'shots'),
                    where('uid', '==', athlete.uid),
                    orderBy('timestamp', 'desc'),
                    limit(500)
                ));
                const shots = [];
                shotsSnap.forEach(d => shots.push(d.data()));
                const intentCard = document.getElementById('coach-intent-card');
                if (intentCard) renderIntentPanel(intentCard, shots);
            } catch (e) {
                console.error('[Coach] intent panel failed:', e);
            }

            // S3 Part B: the hole-plan editor for THIS athlete — the coach
            // draws; the plan lands in the athlete's holePlans with
            // authorRole 'coach'.
            const planRoot = document.getElementById('coach-plan-root');
            if (planRoot) {
                document.getElementById('coach-plan-name').textContent = athlete.displayName || athlete.email;
                mountHolePlanCard(planRoot, { authorRole: 'coach', targetUid: athlete.uid });
            }
            document.getElementById('coach-view-hi').textContent = await fetchAthleteIndex(athlete.uid) ?? '--';
        }

        const pracSnap = await getDocs(query(collection(db, 'practice_rounds'), where('uid', '==', athlete.uid), orderBy('date', 'desc'), limit(10)));
        const tbodyPrac = document.getElementById('coach-practice-tbody');
        if (tbodyPrac) {
            tbodyPrac.innerHTML = '';
            pracSnap.forEach(d => {
                const p = d.data();
                const date = p.date?.toDate ? p.date.toDate().toLocaleDateString('en-AU') : '--';
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${date}</td><td>${escapeHtml(p.drillName)}</td><td>${escapeHtml(p.score)}</td>`;
                tbodyPrac.appendChild(tr);
            });
        }
        loadCoachNotes(athlete.uid);
        aggregateShotPatterns(athlete.uid);
        loadDrillImpact(athlete.uid);
        // BL-VID-01: the student's swing videos, read-only for the coach.
        import('./videos.js').then(m =>
            m.renderVideoLibrary(athlete.uid, document.getElementById('coach-student-videos'), { canDelete: false })
        ).catch(e => console.error('[Coach] video library failed:', e));
    }
}

/**
 * Coach idea #3 (2026-07-04): assigned drills with completion status and a
 * before/after comparison of the athlete's per-18 stats around each completed
 * drill's completedAt. Reports numbers; the coach judges relevance.
 */
async function loadDrillImpact(athleteUid) {
    const el = document.getElementById('coach-drill-impact');
    if (!el) return;
    el.innerHTML = '<p style="color:#94a3b8;">Loading assigned drills… Please wait.</p>';
    try {
        const [drillSnap, roundSnap] = await Promise.all([
            getDocs(query(collection(db, 'users', athleteUid, 'assignedDrills'), orderBy('assignedAt', 'desc'))),
            getDocs(query(collection(db, 'whs_rounds'), where('uid', '==', athleteUid)))
        ]);
        if (drillSnap.empty) {
            el.innerHTML = '<p style="color:#94a3b8;">No drills assigned yet. Use Assign Drill above to set the first one.</p>';
            return;
        }
        const rounds = roundSnap.docs.map(d => d.data());
        const { computeDrillImpact } = await import('./insights.js');

        el.innerHTML = '';
        drillSnap.forEach(d => {
            const drill = d.data();
            const row = document.createElement('div');
            row.style.cssText = 'padding:10px 0; border-bottom:1px solid #f1f5f9; font-size:0.9rem;';
            const title = document.createElement('div');
            title.style.fontWeight = '700';
            title.textContent = `${drill.completed ? '✅' : '⬜'} ${drill.drillName || 'Drill'}`;
            row.appendChild(title);

            if (drill.completed && drill.completedAt?.toDate) {
                const impact = computeDrillImpact(rounds, drill.completedAt.toDate().getTime());
                const line = document.createElement('div');
                line.style.cssText = 'color:#475569; margin-top:4px;';
                if (impact) {
                    const fmt = (b, a, lowerBetter) => {
                        const better = lowerBetter ? a < b : a > b;
                        return `${b} → <strong style="color:${better ? '#10b981' : '#ef4444'}">${a}</strong>`;
                    };
                    line.innerHTML = `Putts/18: ${fmt(impact.before.putts, impact.after.putts, true)}
                        · GIR/18: ${fmt(impact.before.gir, impact.after.gir, false)}
                        · FIR/18: ${fmt(impact.before.fwy, impact.after.fwy, false)}
                        ${impact.before.stableford != null && impact.after.stableford != null
                            ? `· Stableford: ${fmt(impact.before.stableford, impact.after.stableford, false)}` : ''}
                        <span style="color:#94a3b8;">(${impact.before.rounds} rounds before vs ${impact.after.rounds} after)</span>`;
                } else {
                    line.textContent = 'Completed — needs 2+ stat-carrying rounds on each side of the completion date to compare.';
                    line.style.color = '#94a3b8';
                }
                row.appendChild(line);
            }
            el.appendChild(row);
        });
    } catch (e) {
        console.error('[Coach] drill impact failed:', e);
        el.innerHTML = '<p style="color:#ef4444;">Could not load drill results. Check your connection, then reopen this player.</p>';
    }
}

async function loadCoachNotes(athleteUid) {
    const notesEl = document.getElementById('coach-notes-list');
    if (!notesEl) return;
    const snap = await getDocs(query(collection(db, 'users', athleteUid, 'coachNotes'), orderBy('createdAt', 'desc'), limit(10)));
    notesEl.innerHTML = '';
    if (snap.empty) {
        notesEl.innerHTML = '<p class="empty-msg">No notes yet. Write a note below, then choose Save Note.</p>';
        return;
    }
    snap.forEach(d => {
        const n = d.data();
        const date = n.createdAt?.toDate ? n.createdAt.toDate().toLocaleDateString('en-AU') : 'Just now';
        const row = document.createElement('div');
        row.className = 'coach-note-row';
        row.innerHTML = `<div class="date">${date}</div><div class="text">${escapeHtml(n.text)}</div>`;
        notesEl.appendChild(row);
    });
}
