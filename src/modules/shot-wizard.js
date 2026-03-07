// ==========================================
// shot-wizard.js
// Shot Tracking UI & Bag Management
// ==========================================
import { AppState } from '../state.js';
import { UI } from '../ui.js';
import { db } from '../firebase-config.js';
import { collection, addDoc, updateDoc, doc } from "firebase/firestore";

/**
 * Renders the club selection buttons based on the user's bag settings.
 */
export function renderBagButtons() {
    if (!UI.bagButtonsGrid) return;
    UI.bagButtonsGrid.innerHTML = '';

   // Sydney Protocol: Null-safe bag retrieval
const rawClubs = localStorage.getItem('golfAppClubs');
const savedClubs = rawClubs ? JSON.parse(rawClubs) : [];
    const bag = (AppState.playerClubs && Object.keys(AppState.playerClubs).length > 0) 
                ? AppState.playerClubs 
                : (savedClubs || {
                    driver: true,
                    woods: ['3 Wood'],
                    irons: ['Long Irons', 'Mid Irons', 'Short Iron'],
                    wedges: ['56'],
                    putter: true
                });

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

/**
 * Syncs the visual state of the Shot Wizard UI.
 */
export function syncShotWizardUI() {
    renderBagButtons();
    const wizard = document.getElementById('oncourse-wizard');
    if (!wizard) return;

    wizard.querySelectorAll('.btn-grid-compact').forEach(btn => btn.classList.remove('active-choice'));

    const data = AppState.currentShotData;
    ['startLine', 'trajectory', 'strikeQuality', 'shape', 'puttControl'].forEach(group => {
        if (data[group]) {
            const btn = wizard.querySelector(`[data-group="${group}"][data-val="${data[group]}"]`);
            if (btn) btn.classList.add('active-choice');
        }
    });

    document.querySelectorAll('.wiz-routine-btn').forEach(btn => {
        const field = btn.getAttribute('data-routine');
        const val = btn.getAttribute('data-val');
        if (data.routines && data.routines[field] === val) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    if (UI.btnWizardDelete) {
        UI.btnWizardDelete.classList.toggle('hidden', !data.id);
    }

    const puttingSection = document.getElementById('section-putting-outcome');
    if (data.club === 'Putter') puttingSection.classList.remove('hidden');
    else puttingSection.classList.add('hidden');
}

/**
 * Persists shot data to Firestore and updates local hole stats.
 */
export async function saveShotData(loadHoleCallback, showToastCallback) {
    if (!AppState.currentUser) return;
    
    const wizard = document.getElementById('oncourse-wizard');
    if (wizard) wizard.classList.add('hidden');
    document.body.classList.remove('active-wizard-mode'); 
    
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
                const par = AppState.currentCoursePars[AppState.currentHole - 1] || 4;
                if (payload.outcome === 'Green' && payload.shotNumber <= (par - 2)) {
                    if (!p.simpleStats[AppState.currentHole]) p.simpleStats[AppState.currentHole] = {};
                    p.simpleStats[AppState.currentHole].gir = true;
                }
                if (payload.club === 'Putter' && !payload.isOffGreen) {
                    if (!p.simpleStats[AppState.currentHole]) p.simpleStats[AppState.currentHole] = {};
                    p.simpleStats[AppState.currentHole].putts = (p.simpleStats[AppState.currentHole].putts || 0) + 1;
                }
                if (loadHoleCallback) loadHoleCallback();
            }
        }
        if (showToastCallback) showToastCallback("Shot Logged ⛳");
    } catch (e) {
        console.error("Save Shot Error:", e);
        if (showToastCallback) showToastCallback("Error saving shot.");
    }
}