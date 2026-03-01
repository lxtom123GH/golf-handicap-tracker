// ==========================================
// coach.js
// Coach Portal & Player Management
// ==========================================

import { db } from './firebase-config.js';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, addDoc, serverTimestamp, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { UI } from './ui.js';
import { AppState } from './state.js';
import { generateAIResponse } from './ai.js';

let _coachViewUid = null;

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
            const coachUid = document.getElementById('coach-uid-input').value.trim();
            if (!coachUid || !AppState.currentUser) return;
            try {
                const userRef = doc(db, "users", AppState.currentUser.uid);
                const userDoc = await getDoc(userRef);
                let currentCoaches = userDoc.exists() ? (userDoc.data().coaches || []) : [];
                if (!currentCoaches.includes(coachUid)) {
                    currentCoaches.push(coachUid);
                    await updateDoc(userRef, { coaches: currentCoaches });
                }
                document.getElementById('coach-uid-input').value = '';
                loadMyCoaches();
            } catch (e) { console.error("Add coach error", e); }
        });
    }
}

async function loadMyCoaches() {
    const list = document.getElementById('my-coaches-list');
    if (!list || !AppState.currentUser) return;
    list.innerHTML = 'Loading...';
    try {
        const userRef = doc(db, "users", AppState.currentUser.uid);
        const userDoc = await getDoc(userRef);
        const coaches = userDoc.exists() ? (userDoc.data().coaches || []) : [];
        if (coaches.length === 0) {
            list.innerHTML = '<li>No coaches added yet.</li>';
            return;
        }
        list.innerHTML = '';
        coaches.forEach(cid => {
            const li = document.createElement('li');
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.innerHTML = `<span>Coach UID: ${cid}</span> <button class="btn btn-danger btn-sm" onclick="removeCoach('${cid}')">Remove</button>`;
            list.appendChild(li);
        });
    } catch (e) { }
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
    } catch (e) { }
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
                if (msgEl) { msgEl.textContent = `❌ ${e.message}`; msgEl.style.color = '#ef4444'; }
            }
        });
    }

    loadCoachRoster();

    async function loadCoachRoster() {
        if (!rosterEl) return;
        const myUid = AppState.currentUser.uid;

        let allUsers = AppState.allUsersCache;
        if (!allUsers) {
            const snap = await getDocs(collection(db, 'users'));
            allUsers = [];
            snap.forEach(d => allUsers.push({ uid: d.id, ...d.data() }));
            AppState.allUsersCache = allUsers;
        }

        const athletes = [];
        allUsers.forEach(data => {
            if (!data.isApproved || data.uid === myUid) return;
            const coaches = data.coaches || [];
            if (window.currentUserIsAdmin || coaches.includes(myUid)) {
                athletes.push(data);
            }
        });

        if (rosterCount) rosterCount.textContent = `${athletes.length} athlete${athletes.length !== 1 ? 's' : ''}`;

        if (!athletes.length) {
            rosterEl.innerHTML = '<p style="color:#94a3b8;">No athletes have granted you access yet.</p>';
            return;
        }

        rosterEl.innerHTML = '';
        for (const athlete of athletes) {
            const hiSnap = await getDocs(query(collection(db, 'whs_rounds'), where('uid', '==', athlete.uid)));
            let rounds = [];
            hiSnap.forEach(d => {
                const r = d.data();
                rounds.push({ diff: (113 / r.slope) * (r.adjustedGross - r.rating), date: r.date?.toDate?.() || new Date() });
            });
            rounds.sort((a, b) => b.date - a.date);

            let trendBadge = '';
            if (rounds.length >= 4) {
                const half = Math.floor(Math.min(rounds.length, 10) / 2);
                const recent = rounds.slice(0, half).reduce((a, b) => a + b.diff, 0) / half;
                const older = rounds.slice(half, half * 2).reduce((a, b) => a + b.diff, 0) / half;
                const delta = recent - older;
                if (delta < -0.5) trendBadge = '<span class="status-badge success">📉 Improving</span>';
                else if (delta > 0.5) trendBadge = '<span class="status-badge error">📈 Declining</span>';
                else trendBadge = '<span class="status-badge info">→ Stable</span>';
            }

            const card = document.createElement('div');
            card.className = 'coach-roster-card';
            card.innerHTML = `
                <div class="athlete-info">
                    <div class="avatar">${(athlete.displayName || '?')[0].toUpperCase()}</div>
                    <div>
                        <div class="name">${athlete.displayName || athlete.email}</div>
                        <div class="meta">${trendBadge}</div>
                    </div>
                </div>
                <div class="athlete-stat">
                    <div class="value">${athlete.handicapIndex ?? '--'}</div>
                    <div class="label">HI</div>
                </div>
            `;
            card.addEventListener('click', () => loadCoachPlayerView(athlete));
            rosterEl.appendChild(card);
        }
    }

    async function loadCoachPlayerView(athlete) {
        _coachViewUid = athlete.uid;
        rosterSection?.classList.add('hidden');
        playerView?.classList.remove('hidden');
        document.getElementById('coach-view-name').textContent = athlete.displayName || athlete.email;

        const roundsSnap = await getDocs(query(collection(db, 'whs_rounds'), where('uid', '==', athlete.uid), orderBy('date', 'desc'), limit(10)));
        const tbodyWhs = document.getElementById('coach-whs-tbody');
        if (tbodyWhs) {
            tbodyWhs.innerHTML = '';
            let putts = [], fwy = [], gir = [], diffs = [];
            roundsSnap.forEach(d => {
                const r = d.data();
                const diff = ((113 / r.slope) * (r.adjustedGross - r.rating)).toFixed(1);
                diffs.push(+diff);
                const date = r.date?.toDate ? r.date.toDate().toLocaleDateString('en-AU') : '--';
                if (r.stats?.putts) putts.push(r.stats.putts);
                if (r.stats?.fwy) fwy.push(r.stats.fwy);
                if (r.stats?.gir) gir.push(r.stats.gir);
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${date}</td><td>${r.course}</td><td>${r.adjustedGross}</td><td>${diff}</td><td>${r.stats?.putts ?? '--'}</td><td>${r.stats?.fwy ?? '--'}</td><td>${r.stats?.gir ?? '--'}</td>`;
                tbodyWhs.appendChild(tr);
            });
            const avg = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : '--';
            document.getElementById('coach-stat-putts').textContent = avg(putts);
            document.getElementById('coach-stat-fwy').textContent = fwy.length ? avg(fwy) + '/14' : '--';
            document.getElementById('coach-stat-gir').textContent = gir.length ? avg(gir) + '/18' : '--';
            document.getElementById('coach-view-hi').textContent = athlete.handicapIndex ?? '--';
        }

        const pracSnap = await getDocs(query(collection(db, 'practice_rounds'), where('uid', '==', athlete.uid), orderBy('date', 'desc'), limit(10)));
        const tbodyPrac = document.getElementById('coach-practice-tbody');
        if (tbodyPrac) {
            tbodyPrac.innerHTML = '';
            pracSnap.forEach(d => {
                const p = d.data();
                const date = p.date?.toDate ? p.date.toDate().toLocaleDateString('en-AU') : '--';
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${date}</td><td>${p.drillName}</td><td>${p.score}</td>`;
                tbodyPrac.appendChild(tr);
            });
        }
        loadCoachNotes(athlete.uid);
    }
}

async function loadCoachNotes(athleteUid) {
    const notesEl = document.getElementById('coach-notes-list');
    if (!notesEl) return;
    const snap = await getDocs(query(collection(db, 'users', athleteUid, 'coachNotes'), orderBy('createdAt', 'desc'), limit(10)));
    notesEl.innerHTML = '';
    if (snap.empty) {
        notesEl.innerHTML = '<p class="empty-msg">No notes yet.</p>';
        return;
    }
    snap.forEach(d => {
        const n = d.data();
        const date = n.createdAt?.toDate ? n.createdAt.toDate().toLocaleDateString('en-AU') : 'Just now';
        const row = document.createElement('div');
        row.className = 'coach-note-row';
        row.innerHTML = `<div class="date">${date}</div><div class="text">${n.text}</div>`;
        notesEl.appendChild(row);
    });
}
