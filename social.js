// ==========================================
// social.js — Friends & Activity Feed
// ==========================================
import { db } from './firebase-config.js';
import { AppState } from './state.js';
import {
    collection, doc, setDoc, deleteDoc, getDocs,
    query, where, orderBy, limit, getDoc
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

export function initSocialFeed() {
    const btnSearch = document.getElementById('btn-feed-search');
    const searchInput = document.getElementById('feed-search-input');
    if (!btnSearch || !searchInput) return;

    btnSearch.addEventListener('click', async () => {
        const term = searchInput.value.trim().toLowerCase();
        if (!term) return;
        const resultsEl = document.getElementById('feed-search-results');
        resultsEl.textContent = 'Searching...';

        try {
            if (!AppState.allUsersCache) {
                const snap = await getDocs(collection(db, 'users'));
                AppState.allUsersCache = [];
                snap.forEach(d => AppState.allUsersCache.push({ uid: d.id, ...d.data() }));
            }

            const matches = [];
            AppState.allUsersCache.forEach(data => {
                if (data.uid === AppState.currentUser.uid) return;
                if (!data.isApproved) return;
                const name = (data.displayName || '').toLowerCase();
                if (name.includes(term)) matches.push(data);
            });

            if (!matches.length) {
                resultsEl.textContent = 'No players found.';
                return;
            }

            resultsEl.innerHTML = '';
            matches.forEach(player => {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f5f9;';
                row.innerHTML = `
                    <span style="font-weight:600;">${player.displayName || player.email}</span>
                    <button data-uid="${player.uid}" class="btn btn-primary btn-sm follow-btn" style="width:auto;margin:0;">Follow</button>
                `;
                row.querySelector('.follow-btn').addEventListener('click', async (e) => {
                    const uid = e.target.dataset.uid;
                    await followPlayer(uid);
                    e.target.textContent = '✓ Following';
                    e.target.disabled = true;
                    loadFollowing();
                    loadFeed();
                });
                resultsEl.appendChild(row);
            });
        } catch (err) {
            resultsEl.textContent = 'Error searching. Try again.';
        }
    });

    loadFollowing();
    loadFeed();
}

async function followPlayer(targetUid) {
    const myUid = AppState.currentUser.uid;
    await setDoc(doc(db, 'users', myUid, 'following', targetUid), {
        followedAt: new Date().toISOString()
    });
}

export async function unfollowPlayer(targetUid) {
    const myUid = AppState.currentUser.uid;
    await deleteDoc(doc(db, 'users', myUid, 'following', targetUid));
    loadFollowing();
    loadFeed();
}

async function loadFollowing() {
    const listEl = document.getElementById('feed-following-list');
    if (!listEl) return;
    const myUid = AppState.currentUser.uid;
    const snap = await getDocs(collection(db, 'users', myUid, 'following'));
    listEl.innerHTML = '';

    if (snap.empty) {
        listEl.innerHTML = '<li style="color:#94a3b8;">Not following anyone yet.</li>';
        return;
    }

    for (const d of snap.docs) {
        const uid = d.id;
        const userSnap = await getDoc(doc(db, 'users', uid));
        const name = userSnap.exists() ? (userSnap.data().displayName || uid) : uid;
        const li = document.createElement('li');
        li.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f1f5f9;';
        li.innerHTML = `<span>${name}</span><button data-uid="${uid}" class="btn btn-secondary btn-sm unfollow-btn" style="width:auto;margin:0;font-size:0.78rem;">Unfollow</button>`;
        li.querySelector('.unfollow-btn').addEventListener('click', (e) => unfollowPlayer(e.target.dataset.uid));
        listEl.appendChild(li);
    }
}

async function loadFeed() {
    const feedEl = document.getElementById('feed-activity-list');
    if (!feedEl) return;
    const myUid = AppState.currentUser.uid;
    feedEl.innerHTML = '<p style="color:#94a3b8;">Loading...</p>';

    const followingSnap = await getDocs(collection(db, 'users', myUid, 'following'));
    if (followingSnap.empty) {
        feedEl.innerHTML = '<p style="color:#94a3b8;">Follow some players to see their recent rounds here.</p>';
        return;
    }

    const followedUids = followingSnap.docs.map(d => d.id);
    // Firestore 'in' queries support max 30 UIDs
    const uidsChunk = followedUids.slice(0, 10);

    const roundsSnap = await getDocs(
        query(collection(db, 'whs_rounds'), where('uid', 'in', uidsChunk), orderBy('date', 'desc'), limit(20))
    );

    if (roundsSnap.empty) {
        feedEl.innerHTML = '<p style="color:#94a3b8;">No recent rounds from people you follow.</p>';
        return;
    }

    // Get display names
    const nameCache = {};
    for (const uid of uidsChunk) {
        const u = await getDoc(doc(db, 'users', uid));
        nameCache[uid] = u.exists() ? (u.data().displayName || uid) : uid;
    }

    feedEl.innerHTML = '';
    roundsSnap.forEach(d => {
        const r = d.data();
        const diff = ((113 / r.slope) * (r.adjustedGross - r.rating)).toFixed(1);
        const date = r.date?.toDate ? r.date.toDate().toLocaleDateString('en-AU') : new Date(r.date).toLocaleDateString('en-AU');
        const card = document.createElement('div');
        card.style.cssText = 'background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;';
        card.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
                <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#3867d6,#4b7bec);color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.9rem;">
                    ${(nameCache[r.uid] || '?')[0].toUpperCase()}
                </div>
                <div>
                    <strong>${nameCache[r.uid] || 'Unknown'}</strong>
                    <span style="color:#94a3b8;font-size:0.8rem;margin-left:8px;">${date}</span>
                </div>
            </div>
            <div style="font-size:0.88rem;color:#475569;">
                ⛳ <strong>${r.course}</strong> &nbsp;·&nbsp; Score: <strong>${r.adjustedGross}</strong> &nbsp;·&nbsp; Diff: <strong>${diff}</strong>
            </div>
        `;
        feedEl.appendChild(card);
    });
}
