// Sydney Protocol: src/modules/gps.js
// Locale: en-AU (Australian Standard)
// Status: [RESTORED & MERGED]

import { UI } from '../ui.js';

let watchId = null;

export const toggleGPS = () => {
    if (!navigator.geolocation) {
        alert("GPS is not supported by this device.");
        return;
    }
    if (watchId === null) { startGpsTracking(); } else { stopGpsTracking(); }
};

const startGpsTracking = () => {
    watchId = navigator.geolocation.watchPosition(
        onGpsSuccess,
        onGpsError,
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
};

const onGpsSuccess = (position) => {
  if (UI.ocGpsWidget) UI.ocGpsWidget.classList.remove('hidden'); // Fix: Show widget
  if (UI.btnToggleGps) {
      UI.btnToggleGps.innerText = "🛰️ GPS: ON";
      UI.btnToggleGps.classList.add('active-gps');
  }
  
  // --- PRO STEP: Extract coordinates and fire the updater ---
  const lat = position.coords.latitude;
  const lng = position.coords.longitude;
  console.log(`[GPS] Signal Acquired at ${lat}, ${lng}`);
  
  updateGPSDistances(lat, lng); 
};

const onGpsError = (error) => {
    console.warn(`[GPS ERROR] ${error.message}`);
    stopGpsTracking();
    alert(`GPS Error: ${error.message}`);
};

const stopGpsTracking = () => {
    if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    if (UI.btnToggleGps) {
        UI.btnToggleGps.innerText = "🛰️ Start GPS";
        UI.btnToggleGps.classList.remove('active-gps');
    }
    if (UI.ocGpsWidget) UI.ocGpsWidget.classList.add('hidden');
};
/**
 * Updates the UI with calculated GPS distances to the green/hazards.
 * Exported to satisfy the Surveyor module (v6.21.0) and onGpsSuccess.
 * @param {number} lat - Current latitude
 * @param {number} lng - Current longitude 
 */
export const updateGPSDistances = (lat, lng) => {
  // This acts as the bridge between the raw GPS signal and the UI/Surveyor.
  // Distance calculation logic (via gps-engine) routes through here.
  console.log(`[GPS Engine] Updating distances for coordinates: ${lat}, ${lng}`);
  
  // Future Implementation: 
  // const distances = getDistance(...);
  // if (UI.gpsFront) UI.gpsFront.textContent = distances.front;
};