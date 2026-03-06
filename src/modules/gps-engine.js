// ==========================================
// gps-engine.js
// Isolated Haversine Math & Surveyor Logic
// ==========================================
import { AppState } from '../state.js';
import { UI } from '../ui.js';
import { COURSE_DATA, KEPERRA_GPS } from '../course-data.js';

let gpsWatchId = null;

export function toggleGPS() {
if (gpsWatchId) {
navigator.geolocation.clearWatch(gpsWatchId);
gpsWatchId = null;
if (UI.btnToggleGps) UI.btnToggleGps.textContent = "📡 GPS: OFF";
if (UI.ocGpsWidget) UI.ocGpsWidget.classList.add('hidden');
} else {
if (!navigator.geolocation) {
alert("GPS not supported on this device.");
return;
}

}

export function updateGPSDistances(lat, lon) {
const holeIdx = AppState.currentHole - 1;
const courseName = AppState.currentRoundCourseName;
const teeName = UI.ocTeeSelect.value;
const teeData = COURSE_DATA[courseName]?.[teeName] || {};

}

export function getDistance(lat1, lon1, lat2, lon2) {
const R = 6371e3; // Earth radius in meters
const phi1 = lat1 * Math.PI / 180;
const phi2 = lat2 * Math.PI / 180;
const deltaPhi = (lat2 - lat1) * Math.PI / 180;
const deltaLambda = (lon2 - lon1) * Math.PI / 180;

}