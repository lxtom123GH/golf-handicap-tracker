import { AppState } from '../state.js';
import { UI } from '../ui.js';
import { COURSE_DATA, KEPERRA_GPS } from '../course-data.js';

export function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3, p1 = lat1 * Math.PI/180, p2 = lat2 * Math.PI/180;
  const dp = (lat2 - lat1) * Math.PI/180, dl = (lon2 - lon1) * Math.PI/180;
  const a = Math.sin(dp/2)**2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2)**2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function calculateAllDistances(lat, lon) {
  const courseName = AppState.currentRoundCourseName;
  const teeName = UI.ocTeeSelect.value;
  const teeData = COURSE_DATA[courseName]?.[teeName];

  if (!teeData || !teeData.physicalHoles) return null;

  // Get the actual hole number (1-27) from the physicalHoles array
  const physicalHoleId = teeData.physicalHoles[AppState.currentHole - 1];
  const gpsData = KEPERRA_GPS[physicalHoleId];

  if (!gpsData) return null;

  // Mapping based on your CSV format:
  // [0]CenterLat, [1]CenterLng, [2]FrontLat, [3]FrontLng, [4]BackLat, [5]BackLng
  return {
    centre: Math.round(getDistance(lat, lon, gpsData[0], gpsData[1])),
    front: Math.round(getDistance(lat, lon, gpsData[2], gpsData[3])),
    back: Math.round(getDistance(lat, lon, gpsData[4], gpsData[5]))
  };
}
