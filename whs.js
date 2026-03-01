// ==========================================
// whs.js
// Core World Handicap System Math & DB Logic
// ==========================================
import { db, auth } from './firebase-config.js';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { AppState } from './state.js';
import { UI } from './ui.js';

let unsubscribeWHS = null;

// Core WHS Math
export function getAdjustmentFactor(count) {
    if (count < 3) return null;
    if (count === 3) return { use: 1, adj: -2.0 };
    if (count === 4) return { use: 1, adj: -1.0 };
    if (count === 5) return { use: 1, adj: 0 };
    if (count === 6) return { use: 2, adj: -1.0 };
    if (count >= 7 && count <= 8) return { use: 2, adj: 0 };
    if (count >= 9 && count <= 11) return { use: 3, adj: 0 };
    if (count >= 12 && count <= 14) return { use: 4, adj: 0 };
    if (count >= 15 && count <= 16) return { use: 5, adj: 0 };
    if (count >= 17 && count <= 18) return { use: 6, adj: 0 };
    return { use: 8, adj: 0 }; // 20 scores
}

// -------------------------------------------------------------------------------- //
// NEW WHS STABLEFORD & AGS CALCULATIONS
// -------------------------------------------------------------------------------- //

export function calculateDailyHandicap(handicapIndex, slopeRating) {
    if (handicapIndex === undefined || handicapIndex === null || isNaN(handicapIndex) || !slopeRating) return 0;
    // Australian Daily Handicap = Handicap Index x (Slope Rating / 113)
    return Math.round(handicapIndex * (slopeRating / 113));
}

export function calculateHoleStableford(grossScore, holePar, holeStrokeIndex, dailyHandicap) {
    if (!grossScore || isNaN(grossScore) || grossScore === 0) return 0;
    if (!holePar || !holeStrokeIndex) return 0;

    let strokesReceived = Math.floor(dailyHandicap / 18);
    let remainder = dailyHandicap % 18;

    // If Stroke Index is <= remainder, the player gets an extra stroke
    if (holeStrokeIndex <= remainder) {
        strokesReceived += 1;
    }

    let netScore = grossScore - strokesReceived;
    let points = holePar - netScore + 2;
    return Math.max(0, points);
}

export function convertStablefordToAGS(totalStableford, dailyHandicap, coursePar) {
    // AGS = Par + Daily Handicap - (Stableford Points - 36)
    return coursePar + dailyHandicap - (totalStableford - 36);
}

// -------------------------------------------------------------------------------- //


export function calculateIndex(rounds) {
    // Return early if no rounds at all
    if (!rounds || rounds.length === 0) return { "index": 0, "usedIds": [] };

    // Filter out "notCounting" rounds
    const scoreDiffs = rounds
        .filter(r => r.notCounting !== true)
        .map(r => {
            const diff = (113 / r.slope) * (r.adjustedGross - r.rating);
            return { id: r.id, diff: diff };
        });

    if (scoreDiffs.length < 3) return { "index": 0, "usedIds": [] };

    const count = Math.min(scoreDiffs.length, 20);
    const rules = getAdjustmentFactor(count);

    // Consider only the most recent 'count' differentials
    const recentDiffs = scoreDiffs.slice(0, count);

    // Sort by differential ascending to find the best ones
    const sortedDiffs = [...recentDiffs].sort((a, b) => a.diff - b.diff);

    // Take the best 'use' differentials
    const bestDiffs = sortedDiffs.slice(0, rules.use);
    const sum = bestDiffs.reduce((acc, curr) => acc + curr.diff, 0);

    let avg = sum / rules.use;
    avg += rules.adj;

    if (avg > 54) avg = 54;
    return { "index": Math.max(0, avg).toFixed(1), "usedIds": bestDiffs.map(d => d.id) };
}

// Database Subscriptions
export function listenToWHSRounds() {
    if (unsubscribeWHS) unsubscribeWHS();

    if (AppState.viewingPlayerId === null) {
        AppState.currentRounds = [];
        renderRoundsHistory();
        return;
    }

    const q = query(
        collection(db, "whs_rounds"),
        where("uid", "==", AppState.viewingPlayerId),
        orderBy("date", "desc")
    );

    UI.loadingState.classList.remove('hidden');
    UI.emptyState.classList.add('hidden');
    UI.historyTbody.innerHTML = '';

    unsubscribeWHS = onSnapshot(q, async (snapshot) => {
        UI.loadingState.classList.add('hidden');
        AppState.currentRounds = [];
        snapshot.forEach((doc) => {
            AppState.currentRounds.push({ id: doc.id, ...doc.data() });
        });

        const { index, usedIds } = calculateIndex(AppState.currentRounds);
        window.currentHandicapIndex = index; // Cache globally if needed by other legacy functions

        UI.handicapIndexEl.textContent = index > 0 ? index : 'N/A';
        UI.indexSubtextEl.textContent = AppState.currentRounds.filter(r => r.notCounting !== true).length < 3 ? "Need 3 scores to establish index" : "Current WHS Index";

        if (AppState.currentUser && AppState.viewingPlayerId === AppState.currentUser.uid) {
            updateUserHandicapIndexArray(index);
        }

        renderRoundsHistory(usedIds);
        renderTrendChart(AppState.currentRounds);
    }, (err) => {
        console.error("WHS Listen Error:", err);
        UI.loadingState.classList.add('hidden');
    });
}

// ==========================================
// Handicap Trend Chart (Chart.js)
// ==========================================
let _trendChart = null;
export function renderTrendChart(rounds) {
    const canvas = document.getElementById('handicap-chart');
    const noData = document.getElementById('chart-no-data');
    if (!canvas) return;

    // Filter to counting rounds with valid data, sorted oldest → newest
    const counting = rounds
        .filter(r => !r.notCounting && r.slope && r.adjustedGross && r.rating)
        .sort((a, b) => {
            const da = a.date?.toDate ? a.date.toDate() : new Date(a.date);
            const db_ = b.date?.toDate ? b.date.toDate() : new Date(b.date);
            return da - db_;
        });

    if (counting.length < 3) {
        canvas.style.display = 'none';
        if (noData) noData.classList.remove('hidden');
        return;
    }
    canvas.style.display = '';
    if (noData) noData.classList.add('hidden');

    const labels = counting.map(r => {
        const d = r.date?.toDate ? r.date.toDate() : new Date(r.date);
        return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
    });
    const diffs = counting.map(r => +((113 / r.slope) * (r.adjustedGross - r.rating)).toFixed(1));

    // Destroy previous chart instance
    if (_trendChart) { _trendChart.destroy(); _trendChart = null; }

    _trendChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Differential',
                data: diffs,
                borderColor: '#3867d6',
                backgroundColor: 'rgba(56,103,214,0.08)',
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#3867d6',
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => ` Differential: ${ctx.parsed.y}`
                    }
                }
            },
            scales: {
                y: {
                    reverse: false,
                    title: { display: true, text: 'Differential (lower = better)' },
                    grid: { color: 'rgba(0,0,0,0.04)' }
                },
                x: { grid: { display: false } }
            }
        }
    });
}

async function updateUserHandicapIndexArray(index) {
    if (!AppState.currentUser) return;
    try {
        const docRef = doc(db, "profiles", AppState.currentUser.uid);
        const docSnap = await getDoc(docRef);

        // Ensure indexHistory exists and push new index if it has changed
        if (docSnap.exists()) {
            let history = docSnap.data().indexHistory || [];
            const timestamp = new Date().toISOString();

            // Push if empty or if the last recorded index is different
            if (history.length === 0 || history[history.length - 1].index !== index) {
                history.push({ date: timestamp, index: index });
                if (history.length > 50) history.shift(); // Keep last 50 for trending

                await updateDoc(docRef, {
                    handicapIndex: index,
                    indexHistory: history
                });
            }
        } else {
            await setDoc(docRef, {
                handicapIndex: index,
                indexHistory: [{ date: new Date().toISOString(), index: index }]
            }, { merge: true });
        }
    } catch (e) {
        console.error("Failed to update profile handicap array:", e);
    }
}

// Rendering
export function renderRoundsHistory(usedIds = []) {
    UI.historyTbody.innerHTML = '';
    const uidMatches = AppState.currentUser && AppState.viewingPlayerId === AppState.currentUser.uid;
    window.currentUserIsAdmin = window.currentUserIsAdmin || false;

    if (AppState.currentRounds.length === 0) {
        UI.emptyState.classList.remove('hidden');
    } else {
        UI.emptyState.classList.add('hidden');
        AppState.currentRounds.forEach(round => {
            const tr = document.createElement('tr');

            // Strikethrough non-counting rounds visually
            if (round.notCounting) {
                tr.style.opacity = '0.5';
                tr.style.textDecoration = 'line-through';
            }

            const dif = ((113 / round.slope) * (round.adjustedGross - round.rating)).toFixed(1);
            let diffSpan = `<span>${dif}</span>`;
            if (usedIds.includes(round.id)) {
                diffSpan = `<span class="asterisk-highlight">${dif} *</span>`;
            }

            let dateObj = round.date;
            if (dateObj && dateObj.toDate) {
                dateObj = dateObj.toDate();
            } else if (typeof dateObj === 'string') {
                dateObj = new Date(dateObj);
            }
            const dateStr = dateObj ? dateObj.toLocaleDateString() : 'Unknown';

            tr.innerHTML = `
                <td>${dateStr}</td>
                <td>${round.course}</td>
                <td>${round.rating} / ${round.slope}</td>
                <td><strong>${round.adjustedGross}</strong></td>
                <td>${diffSpan}</td>
                <td>
                    <button class="btn btn-secondary btn-sm toggle-count-btn" data-id="${round.id}" title="Toggle Counting Rules">
                        ${round.notCounting ? 'Include' : 'Exclude'}
                    </button>
                    ${(uidMatches || window.currentUserIsAdmin) ? `<button class="btn btn-danger btn-sm del-round-btn" data-id="${round.id}">X</button>` : ''}
                </td>
            `;
            UI.historyTbody.appendChild(tr);
        });

        // Add event listeners using Event Delegation on the root tbody
    }
}

export async function addRound(course, rating, slope, adjustedGross, stats = null) {
    try {
        const roundData = {
            uid: AppState.currentUser.uid,
            course: course,
            rating: rating,
            slope: slope,
            adjustedGross: adjustedGross,
            date: serverTimestamp(),
            notCounting: false
        };
        if (stats && (stats.putts || stats.fwy || stats.gir)) {
            roundData.stats = stats;
        }
        await addDoc(collection(db, "whs_rounds"), roundData);
        return true;
    } catch (e) {
        console.error("Error adding document: ", e);
        return false;
    }
}

// Bind Global Window Functions for Event Delegation in app.js
window.deleteWhsRound = async function (id) {
    if (confirm("Are you sure you want to delete this round?")) {
        await deleteDoc(doc(db, "whs_rounds", id));
    }
};

window.toggleCountingRules = async function (id) {
    const roundDoc = AppState.currentRounds.find(r => r.id === id);
    if (!roundDoc) return;
    const isCurrentlyNotCounting = roundDoc.notCounting === true;

    // Check permission - must be owner or admin
    if (AppState.currentUser && (AppState.currentUser.uid === roundDoc.uid || window.currentUserIsAdmin)) {
        await updateDoc(doc(db, "whs_rounds", id), {
            notCounting: !isCurrentlyNotCounting
        });
    } else {
        alert("Permission denied");
    }
};
