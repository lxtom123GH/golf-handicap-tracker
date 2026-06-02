import { AppState } from '../state.js';
import { getDistance } from '../oncourse.js'; // Ensure getDistance calculates haversine

/**
 * Smart Score Defaults & Reverse-Engineered GPS Distance Tracking
 * Calculates drive distances and approach distances automatically based on current user location.
 */
export function recordTeeBoxLocation(lat, lon) {
    if (!AppState.currentShotData) return;

    // Store tee box location for the current hole
    if (!AppState.currentHoleTelemetry) AppState.currentHoleTelemetry = {};
    AppState.currentHoleTelemetry.teeLat = lat;
    AppState.currentHoleTelemetry.teeLon = lon;
}

export function inferDriveDistance(currentLat, currentLon) {
    if (!AppState.currentHoleTelemetry || !AppState.currentHoleTelemetry.teeLat) return 0;

    const teeLat = AppState.currentHoleTelemetry.teeLat;
    const teeLon = AppState.currentHoleTelemetry.teeLon;

    // Calculate distance using existing Haversine from getDistance
    return getDistance(teeLat, teeLon, currentLat, currentLon);
}

export function inferApproachDistance(currentLat, currentLon, greenLat, greenLon) {
    // Distance from current location (e.g. fairway/rough) to Green center
    return getDistance(currentLat, currentLon, greenLat, greenLon);
}
