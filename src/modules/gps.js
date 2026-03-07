import { UI } from '../ui.js';
import { calculateAllDistances } from './gps-engine.js';

let gpsWatchId = null;

function onGpsSuccess(position) {
  updateGPSDistances(position.coords.latitude, position.coords.longitude);
}

export function toggleGPS() {
  if (gpsWatchId) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
    if (UI.ocGpsWidget) UI.ocGpsWidget.classList.add('hidden');
    return;
  } 
  gpsWatchId = navigator.geolocation.watchPosition(onGpsSuccess, console.warn, { enableHighAccuracy: true });
}

export function updateGPSDistances(lat, lon) {
  const dists = calculateAllDistances(lat, lon);
  if (!dists || !UI.ocGpsWidget) return;

  const f = dists.front || '--';
  const c = dists.centre || '--';
  const b = dists.back || '--';

  UI.ocGpsWidget.innerHTML = `
    <div class="gps-display">
      <div class="gps-side">F <br> ${f}m</div>
      <div class="gps-hero">${c}<span>m</span></div>
      <div class="gps-side">B <br> ${b}m</div>
    </div>
  `;
}