/**
 * v6.21.0 - Surveyor Mode (GPS Ground Truth)
 * Core logic for high-accuracy coordinate capture and green center math.
 */

import { db } from './firebase-config';
import { doc, updateDoc } from 'firebase/firestore';
import { AppState } from './state';
import { UI } from './ui';
import { getDistance, updateGPSDistances } from './oncourse';

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

    surveyorWatchId = navigator.geolocation.watchPosition(
        (pos) => {
            currentPos = pos;
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
    if (!currentPos || currentAccuracy > 5.0) return;
    if (!AppState.currentRoundCourseName || !AppState.currentHole) return;

    // Retrieve button for visual feedback
    const btn = document.getElementById(`btn-pin-${type}`);
    const originalText = btn ? btn.textContent : '';

    if (!AppState.surveyData) AppState.surveyData = {};
    if (!AppState.surveyData[AppState.currentHole]) AppState.surveyData[AppState.currentHole] = {};

    const existingData = AppState.surveyData[AppState.currentHole][type];
    const lat = currentPos.coords.latitude;
    const lng = currentPos.coords.longitude;
    const accuracy = currentPos.coords.accuracy;
    const cleanAcc = Math.round(accuracy * 100) / 100;

    // 1. The 80m Sanity Check
    if (existingData && existingData.lat && existingData.lng) {
        const dist = getDistance(lat, lng, existingData.lat, existingData.lng);
        if (dist > 80) {
            if (!window.confirm("WARNING: You are over 80m from the existing green. Are you on the wrong hole? Overwrite anyway?")) {
                return;
            }
        } else {
            if (!window.confirm("Overwrite existing coordinate for this pin?")) {
                return;
            }
        }
    } else {
        if (!window.confirm("Overwrite existing coordinate for this pin?")) {
            return;
        }
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

    // 3. The Rollback Payload
    if (existingData) {
        AppState.surveyData[AppState.currentHole][`previous_${type}`] = existingData;
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
        alert("Pin saved successfully!");
    }

    // Instantly refresh GPS distance bar
    updateGPSDistances(lat, lng);
}

/**
 * Cartesian midpoint calculation for short distances.
 */
function calculateMidpoint(p1, p2) {
    return {
        lat: (p1.lat + p2.lat) / 2,
        lng: (p1.lng + p2.lng) / 2,
        acc: (p1.acc + p2.acc) / 2, // Average accuracy
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
