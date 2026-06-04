import { AppState } from '../state.js';
import { getDistance } from '../oncourse.js';

let lastLoggedLocation = null;

export function initializeTelemetryListener() {
    window.addEventListener('stateChange', (e) => {
        if (e.detail.property !== 'gpsLocation') return;
        const { lat, lon } = e.detail.newValue;
        if (!lat || !lon) return;

        if (lastLoggedLocation) {
            const distance = getDistance(lastLoggedLocation.lat, lastLoggedLocation.lon, lat, lon);
            if (distance < 5) return;
        }

        lastLoggedLocation = { lat, lon };

        const activeTab = document.querySelector('.tab-content.active');
        if (!activeTab || activeTab.id !== 'tab-oncourse') return;

        processLocationUpdate(lat, lon);
    });
}

function processLocationUpdate(lat, lon) {
    if (!AppState.activeRoundId || !AppState.currentHole) return;

    if (!AppState.currentHoleTelemetry) AppState.currentHoleTelemetry = {};
    const t = AppState.currentHoleTelemetry;

    const shots = AppState.currentHoleShots || [];
    if (shots.length === 0) {
        t.teeLat = lat;
        t.teeLon = lon;
    } else if (shots.length === 1 && t.teeLat && t.teeLon) {
        t.inferredDrive = getDistance(t.teeLat, t.teeLon, lat, lon);

        const pars = AppState.currentCoursePars || [];
        const holeIdx = AppState.currentHole - 1;

        if (pars[holeIdx] === 3) {
            t.inferredApproach = t.inferredDrive;
        }
    }
}

export function inferApproachDistance(currentLat, currentLon, greenLat, greenLon) {
    if (!currentLat || !currentLon || !greenLat || !greenLon) return 0;
    return getDistance(currentLat, currentLon, greenLat, greenLon);
}

export function recordTeeBoxLocation(lat, lon) {
    if (!AppState.currentHoleTelemetry) AppState.currentHoleTelemetry = {};
    AppState.currentHoleTelemetry.teeLat = lat;
    AppState.currentHoleTelemetry.teeLon = lon;
}
