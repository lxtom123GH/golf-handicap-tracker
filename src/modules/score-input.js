import { AppState } from '../state.js';
import { UI } from '../ui.js';
import { renderBagButtons } from './card-render.js';
import { db } from "../firebase-config.js";
import { collection, addDoc, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { loadHole } from "../oncourse.js";

export function startNewShotInput(forcedShotNum = null) {
    const shotNum = forcedShotNum || (AppState.currentHoleShots?.length || 0) + 1;
    AppState.currentShotData = {
        hole: AppState.currentHole,
        shotNumber: shotNum,
        roundId: AppState.activeRoundId,
        timestamp: new Date().toISOString()
    };

    setWizardActive(true);
    const wizard = document.getElementById('oncourse-wizard');
    if (wizard) {
        wizard.classList.remove('hidden');
        wizard.scrollTop = 0;
    }

    syncShotWizardUI();
}

export function loadExistingShotData(shotId) {
    const existing = AppState.currentHoleShots.find(s => s.id === shotId);
    if (existing) {
        AppState.currentShotData = { ...existing };
        setWizardActive(true);
        const wizard = document.getElementById('oncourse-wizard');
        if (wizard) {
            wizard.classList.remove('hidden');
            wizard.scrollTop = 0;
        }
        syncShotWizardUI();
    }
}

/**
 * Synchronizes the visual state of the Shot Wizard UI to match the current in-memory shot data.
 * Updates button active states across all intent/result grids.
 * @returns {void}
 */
export function syncShotWizardUI() {
    renderBagButtons();

    const wizard = document.getElementById('oncourse-wizard');
    if (!wizard) return;

    // Reset all intent/grid buttons
    wizard.querySelectorAll('.btn-grid-compact').forEach(btn => btn.classList.remove('active-choice'));

    // Populate choices
    const data = AppState.currentShotData;
    ['startLine', 'trajectory', 'strikeQuality', 'shape', 'puttControl'].forEach(group => {
        if (data[group]) {
            const btn = wizard.querySelector(`[data-group="${group}"][data-val="${data[group]}"]`);
            if (btn) btn.classList.add('active-choice');
        }
    });

    // Populate routines
    document.querySelectorAll('.wiz-routine-btn').forEach(btn => {
        const field = btn.getAttribute('data-routine');
        const val = btn.getAttribute('data-val');
        if (data.routines && data.routines[field] === val) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    // Show/Hide delete
    if (UI.btnWizardDelete) {
        UI.btnWizardDelete.classList.toggle('hidden', !data.id);
    }

    // Toggle Putter Section
    const puttingSection = document.getElementById('section-putting-outcome');
    if (data.club === 'Putter') puttingSection.classList.remove('hidden');
    else puttingSection.classList.add('hidden');
}

export function setWizardActive(isActive) {
    if (isActive) {
        document.body.classList.add('active-wizard-mode');
    } else {
        document.body.classList.remove('active-wizard-mode');
    }
}

export async function saveShotData() {
    if (!AppState.currentUser) return;
    document.getElementById('oncourse-wizard').classList.add('hidden');
    setWizardActive(false); // Deactivate wizard mode
    const payload = { uid: AppState.currentUser.uid, ...AppState.currentShotData };
    try {
        if (AppState.currentShotData.id) {
            await updateDoc(doc(db, "shots", AppState.currentShotData.id), payload);
            const idx = AppState.currentHoleShots.findIndex(s => s.id === AppState.currentShotData.id);
            if (idx !== -1) AppState.currentHoleShots[idx] = { ...payload, id: AppState.currentShotData.id };
        } else {
            const docRef = await addDoc(collection(db, "shots"), payload);
            AppState.currentHoleShots.push({ ...payload, id: docRef.id });
            const p = AppState.liveRoundGroups.find(x => x.uid === AppState.currentUser.uid);
            if (p) {
                p.scores[AppState.currentHole] = (p.scores[AppState.currentHole] || 0) + 1;

                // TASK 1: Automated GIR Logic
                const holeIdx = AppState.currentHole - 1;
                const par = AppState.currentCoursePars[holeIdx] || 4;
                if (payload.outcome === 'Green' && payload.shotNumber <= (par - 2)) {
                    if (!p.simpleStats[AppState.currentHole]) p.simpleStats[AppState.currentHole] = {};
                    p.simpleStats[AppState.currentHole].gir = true;
                }

                // TASK 2: Putter Stats (Exclude Fringe)
                if (payload.club === 'Putter' && !payload.isOffGreen) {
                    if (!p.simpleStats[AppState.currentHole]) p.simpleStats[AppState.currentHole] = {};
                    p.simpleStats[AppState.currentHole].putts = (p.simpleStats[AppState.currentHole].putts || 0) + 1;
                }

                loadHole();
            }
        }
        showToast("Shot Logged ⛳");
    } catch (e) {
        showToast("Error saving shot.");
    }
}

export async function deleteShotData() {
    if (!AppState.currentUser || !AppState.currentShotData.id) return;
    if (!confirm("Are you sure you want to delete this shot?")) return;

    document.getElementById('oncourse-wizard').classList.add('hidden');
    try {
        await deleteDoc(doc(db, "shots", AppState.currentShotData.id));

        // Remove from local state
        AppState.currentHoleShots = AppState.currentHoleShots.filter(s => s.id !== AppState.currentShotData.id);

        // Update player score
        const p = AppState.liveRoundGroups.find(x => x.uid === AppState.currentUser.uid);
        if (p) {
            p.scores[AppState.currentHole] = Math.max(0, (p.scores[AppState.currentHole] || 0) - 1);
            loadHole();
        }

        showToast("Shot Deleted 🗑️");
        AppState.currentShotData = {};
    } catch (e) {
        console.error(e);
        showToast("Error deleting shot.");
    }
}

export function showToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
        background: rgba(0,0,0,0.8); color: white; padding: 10px 20px;
        border-radius: 20px; z-index: 10000; font-size: 0.9rem;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}
