// ==========================================
// social.js — Friends & Activity Feed
// ==========================================
import { db } from './firebase-config.js';
import { AppState } from './state.js';
import {
    collection, doc, setDoc, deleteDoc, getDocs,
    query, where, orderBy, limit, getDoc, startAfter
} from "firebase/firestore";

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

window.refreshSocialFeed = async () => {
    await loadFollowing();
    await loadFeed();
};

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
    try {
        const listEl = document.getElementById('feed-following-list');
        if (!listEl) return;
        const myUid = AppState.currentUser?.uid;
        if (!myUid) return;
        const snap = await getDocs(collection(db, 'users', myUid, 'following'));
        if (listEl) listEl.innerHTML = '';

        if (snap.empty) {
            if (listEl) listEl.innerHTML = '<li style="color:#94a3b8;">Not following anyone yet.</li>';
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
            if (listEl) listEl.appendChild(li);
        }
    } catch (err) {
        console.error("[Social] Failed to load following:", err);
    }
}

// Last document of the most recent feed page — fuels the "load more" cursor.
let lastFeedDoc = null;

function feedDash(value) {
    return (value === null || value === undefined || value === '') ? '—' : String(value);
}

function feedDifferential(value) {
    return (typeof value === 'number' && !Number.isNaN(value)) ? value.toFixed(1) : '—';
}

function feedDate(value) {
    if (!value) return '';
    const d = value?.toDate ? value.toDate() : new Date(value);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-AU');
}

function buildFeedCard(entry) {
    const card = document.createElement('div');
    card.style.cssText = 'background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:6px;';

    const avatar = document.createElement('div');
    avatar.style.cssText = 'width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#3867d6,#4b7bec);color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.9rem;';
    avatar.textContent = (entry.actorDisplayName || '?').charAt(0).toUpperCase();

    const nameBlock = document.createElement('div');
    const nameEl = document.createElement('strong');
    nameEl.textContent = entry.actorDisplayName || 'Unknown';
    const dateEl = document.createElement('span');
    dateEl.style.cssText = 'color:#94a3b8;font-size:0.8rem;margin-left:8px;';
    dateEl.textContent = feedDate(entry.date);
    nameBlock.appendChild(nameEl);
    nameBlock.appendChild(dateEl);

    header.appendChild(avatar);
    header.appendChild(nameBlock);

    const details = document.createElement('div');
    details.style.cssText = 'font-size:0.88rem;color:#475569;';

    const courseStrong = document.createElement('strong');
    courseStrong.textContent = feedDash(entry.courseName);
    const scoreStrong = document.createElement('strong');
    scoreStrong.textContent = feedDash(entry.adjustedGrossScore);
    const diffStrong = document.createElement('strong');
    diffStrong.textContent = feedDifferential(entry.handicapDifferential);

    details.append(
        '⛳ ', courseStrong, ' ·  Score: ', scoreStrong,
        ' ·  Diff: ', diffStrong
    );

    card.appendChild(header);
    card.appendChild(details);
    return card;
}

async function loadFeed(afterDoc = null) {
    try {
        const feedEl = document.getElementById('feed-activity-list');
        if (!feedEl) return;
        const myUid = AppState.currentUser?.uid;
        if (!myUid) return;

        if (!afterDoc) {
            feedEl.innerHTML = '<p style="color:#94a3b8;">Loading...</p>';
        }

        const constraints = [
            where('recipientUid', '==', myUid),
            orderBy('createdAt', 'desc'),
        ];
        if (afterDoc) constraints.push(startAfter(afterDoc));
        constraints.push(limit(20));

        const feedSnap = await getDocs(query(collection(db, 'feed'), ...constraints));

        if (feedSnap.empty) {
            if (!afterDoc) {
                feedEl.innerHTML = '<p style="color:#94a3b8;">Follow some players to see their recent rounds here.</p>';
            }
            return;
        }

        lastFeedDoc = feedSnap.docs[feedSnap.docs.length - 1];

        if (!afterDoc) feedEl.innerHTML = '';
        const existingLoadMore = feedEl.querySelector('.feed-load-more-btn');
        if (existingLoadMore) existingLoadMore.remove();

        feedSnap.forEach(d => feedEl.appendChild(buildFeedCard(d.data())));

        if (feedSnap.size === 20) {
            const loadMoreBtn = document.createElement('button');
            loadMoreBtn.className = 'btn btn-secondary btn-sm feed-load-more-btn';
            loadMoreBtn.style.cssText = 'width:100%;margin-top:8px;';
            loadMoreBtn.textContent = 'Load more';
            loadMoreBtn.addEventListener('click', () => loadFeed(lastFeedDoc));
            feedEl.appendChild(loadMoreBtn);
        }
    } catch (err) {
        console.error("[Social] Failed to load feed:", err);
        const feedEl = document.getElementById('feed-activity-list');
        if (feedEl) feedEl.innerHTML = '<p style="color:#ef4444;">Error loading activity feed. Please try again later.</p>';
    }
}
