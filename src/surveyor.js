/**
 * v6.21.0 - Surveyor Mode (GPS Ground Truth)
 * Core logic for high-accuracy coordinate capture and green center math.
 */

import { db } from './firebase-config';
import { doc, updateDoc } from 'firebase/firestore';
import { AppState } from './state';
import { UI } from './ui';
import { getDistance, updateGPSDistances } from './oncourse';
import { COURSE_DATA, KEPERRA_GPS } from './course-data';

let surveyorWatchId = null;
let currentAccuracy = Infinity;
let currentPos = null;

/**
 * Toggles the high-accuracy Surveyor Mode.
 */
export function toggleSurveyor() {
    if (surveyorWatchId) {
        stopSurveyor();
    } else {
        startSurveyor();
    }
}

function startSurveyor() {
    if (!navigator.geolocation) {
        console.error("Geolocation not supported");
        return;
    }

    const btnToggle = document.getElementById('btn-toggle-surveyor');
    if (btnToggle) btnToggle.textContent = "⌛ Locating...";

    const container = document.getElementById('surveyor-container');
    if (container) container.classList.remove('hidden');

    // Phase 2: Instant Resume
    if (AppState.currentPos) {
        currentPos = AppState.currentPos;
        currentAccuracy = AppState.currentPos.coords.accuracy;
        updateSurveyorUI(AppState.currentPos.coords);
    }

    surveyorWatchId = navigator.geolocation.watchPosition(
        (pos) => {
            currentPos = pos;
            AppState.currentPos = pos; // Persist
            currentAccuracy = pos.coords.accuracy;
            updateSurveyorUI(pos.coords);
        },
        (err) => {
            console.error("Surveyor GPS Error:", err);
            stopSurveyor();
            alert(`Surveyor Error: ${err.message}`);
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

function stopSurveyor() {
    if (surveyorWatchId) {
        navigator.geolocation.clearWatch(surveyorWatchId);
        surveyorWatchId = null;
    }

    const btnToggle = document.getElementById('btn-toggle-surveyor');
    if (btnToggle) btnToggle.textContent = "📍 Survey: OFF";

    const container = document.getElementById('surveyor-container');
    if (container) container.classList.add('hidden');

    currentAccuracy = Infinity;
    currentPos = null;
}

/**
 * Updates the Accuracy readout and enables/disables Pin buttons.
 * @param {Coordinates} coords 
 */
function updateSurveyorUI(coords) {
    const accuracySpan = document.getElementById('surveyor-accuracy');
    const statusMsg = document.getElementById('surveyor-status-msg');
    const pinButtons = document.querySelectorAll('.btn-survey-pin');

    if (accuracySpan) accuracySpan.textContent = `Accuracy: ${coords.accuracy.toFixed(1)}m`;

    // v6.23.0: Refined thresholds
    const isAccurate = coords.accuracy <= 15.0;
    const isExcellent = coords.accuracy < 5.0;

    accuracySpan.classList.remove('text-success', 'text-warning', 'text-danger');

    if (isAccurate) {
        pinButtons.forEach(btn => btn.disabled = false);
        if (isExcellent) {
            accuracySpan.classList.add('text-success');
            if (statusMsg) {
                statusMsg.textContent = "Excellent Accuracy ✅";
                statusMsg.style.color = "#10b981";
            }
        } else {
            accuracySpan.classList.add('text-warning');
            if (statusMsg) {
                statusMsg.textContent = "Good Accuracy (OK to Pin)";
                statusMsg.style.color = "#f59e0b";
            }
        }
    } else {
        accuracySpan.classList.add('text-danger');
        if (statusMsg) {
            statusMsg.textContent = "Searching for Signal... (>15m)";
            statusMsg.style.color = "#ef4444";
        }
        pinButtons.forEach(btn => btn.disabled = true);
    }
}

/**
 * Captures the current coordinates for a specific pin location.
 * @param {string} type - 'front', 'back', or 'override'
 */
export async function capturePin(type) {
    if (!currentPos || !AppState.currentRoundCourseName || !AppState.currentHole) return;

    // Retrieve button for visual feedback
    const btn = document.getElementById(`btn-pin-${type}`);
    const originalText = btn ? btn.textContent : '';

    if (!AppState.surveyData) AppState.surveyData = {};
    if (!AppState.surveyData[AppState.currentHole]) AppState.surveyData[AppState.currentHole] = {};

    // v6.26.3 - Hard Re-Fetch: Fallback to static mapping if no survey data exists
    let legacyData = AppState.surveyData[AppState.currentHole][type] ? { ...AppState.surveyData[AppState.currentHole][type] } : null;

    if (!legacyData) {
        const courseName = AppState.currentRoundCourseName;
        const teeData = COURSE_DATA[courseName]?.[Object.keys(COURSE_DATA[courseName])[0]] || {}; // Fallback to first tee if unknown
        const holeIdx = AppState.currentHole - 1;
        let physicalHole = holeIdx + 1;
        if (teeData.physicalHoles && teeData.physicalHoles[holeIdx]) {
            physicalHole = teeData.physicalHoles[holeIdx];
        }

        if (KEPERRA_GPS[physicalHole]) {
            const k = KEPERRA_GPS[physicalHole];
            // Map KEPERRA_GPS format to survey object
            if (type === 'center') legacyData = { lat: k[0], lng: k[1] };
            else if (type === 'front') legacyData = { lat: k[2], lng: k[3] };
            else if (type === 'back') legacyData = { lat: k[4], lng: k[5] };
        }
    }

    const lat = currentPos.coords.latitude;
    const lng = currentPos.coords.longitude;
    const accuracy = currentPos.coords.accuracy;
    const cleanAcc = Math.round(accuracy * 100) / 100;

    // 1. The 80m Sanity Check (Force Refresh Logic)
    try {
        let distanceToExisting = 0;
        console.log("DEBUG: Real Old Coord from DB was: " + JSON.stringify(legacyData));
        console.log(`[Surveyor] Capturing ${type}. Current: [${lat}, ${lng}], Legacy:`, legacyData);

        if (legacyData && legacyData.lat && legacyData.lng) {
            distanceToExisting = getDistance(lat, lng, legacyData.lat, legacyData.lng);
            console.log("DEBUG: Distance from CURRENT GPS to PREVIOUS PIN: " + distanceToExisting + "m");
            console.log(`[Surveyor] 80m Check: Distance is ${distanceToExisting.toFixed(2)}m`);

            if (distanceToExisting > 80) {
                if (!window.confirm(`WARNING: You are ${Math.round(distanceToExisting)}m from the existing green. Are you on the wrong hole? Overwrite anyway?`)) {
                    return;
                }
            } else {
                if (!window.confirm("Overwrite existing coordinate for this pin?")) {
                    return;
                }
            }
        } else {
            console.log("[Surveyor] No existing data found for this pin type. Skipping distance check.");
            if (!window.confirm("Overwrite existing coordinate for this pin?")) {
                return;
            }
        }
    } catch (e) {
        console.error("[Surveyor] Math / Calculation Failure in Sanity Check:", e);
    }

    // 2. Visual Feedback Start
    if (btn) {
        btn.textContent = "Saving...";
        btn.disabled = true;
    }

    const coords = {
        lat: lat,
        lng: lng,
        accuracy: cleanAcc,
        timestamp: Date.now()
    };

    console.log(`[Surveyor] Pinning ${type}:`, coords);

    // 3. The Audit Trail / History (v6.26.0)
    if (!AppState.surveyData[AppState.currentHole].pinHistory) {
        AppState.surveyData[AppState.currentHole].pinHistory = [];
    }

    if (legacyData) {
        // Build history object: what was replaced and what type it was
        const historyEntry = {
            type: type,
            data: legacyData,
            timestamp: Date.now()
        };
        AppState.surveyData[AppState.currentHole].pinHistory.push(historyEntry);
        // Limit history to last 5 entries
        if (AppState.surveyData[AppState.currentHole].pinHistory.length > 5) {
            AppState.surveyData[AppState.currentHole].pinHistory.shift();
        }
        console.log(`[Surveyor] History logged for ${type}. Current depth: ${AppState.surveyData[AppState.currentHole].pinHistory.length}`);
    }

    // Apply new payload
    AppState.surveyData[AppState.currentHole][type] = coords;

    // If we have both front and back, calculate center
    if (AppState.surveyData[AppState.currentHole].front && AppState.surveyData[AppState.currentHole].back) {
        const center = calculateMidpoint(
            AppState.surveyData[AppState.currentHole].front,
            AppState.surveyData[AppState.currentHole].back
        );
        AppState.surveyData[AppState.currentHole].greenCenter = center;
        console.log(`[Surveyor] Calculated Center for Hole ${AppState.currentHole}:`, center);
    }

    // Persist to Firestore
    await saveSurveyToFirestore(AppState.currentRoundCourseName, AppState.currentHole, AppState.surveyData[AppState.currentHole]);

    // 4. Visual Feedback & State Refresh Update
    if (btn) {
        btn.textContent = originalText;
        btn.disabled = false;
    }

    if (window.showToast) {
        window.showToast("Pin saved successfully!");
    } else {
        console.log("Pin saved successfully!");
    }

    // Show Undo Button (v6.26.0)
    const undoBtn = document.getElementById('btn-undo-pin');
    if (undoBtn) undoBtn.classList.remove('hidden');

    // Instantly refresh GPS distance bar using NEW coordinates
    console.log("[Surveyor] Forcing Global UI Refresh via custom event...");
    updateGPSDistances(lat, lng);

    // Global Event Sync (v6.26.3: Simple Trigger)
    window.dispatchEvent(new Event('holeUpdate'));
}

/**
 * Cartesian midpoint calculation for short distances.
 */
function calculateMidpoint(p1, p2) {
    return {
        lat: (p1.lat + p2.lat) / 2,
        lng: (p1.lng + p2.lng) / 2,
        accuracy: (p1.accuracy + p2.accuracy) / 2, // v6.23.1 fix: use 'accuracy' instead of 'acc'
        source: 'calculated'
    };
}

async function saveSurveyToFirestore(courseId, holeNum, data) {
    try {
        const holeRef = doc(db, "courses", courseId, "holes", holeNum.toString());
        await updateDoc(holeRef, { surveyData: data });
        console.log(`[Surveyor] Saved survey data for ${courseId} Hole ${holeNum}`);
    } catch (err) {
        console.error("[Surveyor] Persistence Error:", err);
    }
}

/**
 * Reverts the last pin capture using the pinHistory array.
 */
export async function undoLastPin() {
    if (!AppState.surveyData || !AppState.currentHole) return;
    const history = AppState.surveyData[AppState.currentHole].pinHistory;

    if (!history || history.length === 0) {
        console.log("No history found to undo.");
        return;
    }

    const lastAction = history.pop();
    const { type, data } = lastAction;

    console.log(`[Surveyor] Undo triggered for type: ${type}`, data);

    // Restore previous state
    AppState.surveyData[AppState.currentHole][type] = data;

    // Recalculate green center if needed
    if (AppState.surveyData[AppState.currentHole].front && AppState.surveyData[AppState.currentHole].back) {
        AppState.surveyData[AppState.currentHole].greenCenter = calculateMidpoint(
            AppState.surveyData[AppState.currentHole].front,
            AppState.surveyData[AppState.currentHole].back
        );
    }

    // Persist and Refresh
    await saveSurveyToFirestore(AppState.currentRoundCourseName, AppState.currentHole, AppState.surveyData[AppState.currentHole]);

    updateGPSDistances(data.lat, data.lng);

    window.dispatchEvent(new CustomEvent('holeUpdate', {
        detail: {
            lat: data.lat,
            lng: data.lng,
            type,
            hole: AppState.currentHole,
            updatedHole: AppState.surveyData[AppState.currentHole]
        }
    }));

    // Hide undo button if history empty
    const undoBtn = document.getElementById('btn-undo-pin');
    if (undoBtn && history.length === 0) undoBtn.classList.add('hidden');

    if (window.showToast) window.showToast(`Undo successful: Restored ${type} pin.`);
}

// Bind Undo Button globally if possible, or expect it to be bound in init
document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'btn-undo-pin') {
        undoLastPin();
    }
});
