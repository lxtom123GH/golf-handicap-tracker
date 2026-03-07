import { AppState } from '../state.js';
import { UI } from '../ui.js';
import { COURSE_DATA } from '../course-data.js';
import { calculateAllDistances } from './gps-engine.js';

let gpsWatchId = null;

function onGpsSuccess(position) {
  if (UI.btnToggleGps) UI.btnToggleGps.textContent = "📡 GPS: ON";
  if (UI.ocGpsWidget) UI.ocGpsWidget.classList.remove('hidden');
  updateGPSDistances(position.coords.latitude, position.coords.longitude);
}

function onGpsError(error) {
  console.warn("GPS Error:", error);
  alert("Unable to retrieve GPS location. Please check permissions.");
}

export function toggleGPS() {
  if (gpsWatchId) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
    if (UI.btnToggleGps) UI.btnToggleGps.textContent = "📡 GPS: OFF";
    if (UI.ocGpsWidget) UI.ocGpsWidget.classList.add('hidden');
    return;
  } 
  
  if (!navigator.geolocation) {
    alert("GPS not supported on this device.");
    return;
  }
  
  const options = { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 };
  gpsWatchId = navigator.geolocation.watchPosition(onGpsSuccess, onGpsError, options);
}

export function updateGPSDistances(lat, lon) {
  const distances = calculateAllDistances(lat, lon);
  
  if (!distances || !UI.ocGpsWidget) return;
  
  const f = distances.front ? distances.front + "m" : "--";
  const c = distances.centre ? distances.centre + "m" : "--";
  const b = distances.back ? distances.back + "m" : "--";
  
  UI.ocGpsWidget.innerHTML = `F: ${f} | C: ${c} | B: ${b}`;
}