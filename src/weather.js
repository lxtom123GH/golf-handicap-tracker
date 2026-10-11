// ==========================================
// weather.js — course weather + "plays-like" distance (BL-WX-01)
// ==========================================
//
// Data: Open-Meteo current conditions (free, no API key). The math functions
// are pure and unit-tested; the fetch layer caches for 15 minutes and fails
// silent (offline on the course must never break the GPS widget).

const CACHE_MS = 15 * 60 * 1000;
let _cache = null; // { at, lat, lon, wx }

/**
 * Current conditions at a location via Open-Meteo. Returns
 * { tempC, windKmh, windFromDeg, isRaining } or null on any failure.
 */
export async function fetchCurrentWeather(lat, lon) {
    if (_cache && Date.now() - _cache.at < CACHE_MS
        && Math.abs(_cache.lat - lat) < 0.05 && Math.abs(_cache.lon - lon) < 0.05) {
        return _cache.wx;
    }
    try {
        const url = 'https://api.open-meteo.com/v1/forecast'
            + `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`
            + '&current=temperature_2m,wind_speed_10m,wind_direction_10m,precipitation'
            + '&wind_speed_unit=kmh&timezone=auto';
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        const c = data.current;
        if (!c) return null;
        const wx = {
            tempC: Number(c.temperature_2m),
            windKmh: Number(c.wind_speed_10m),
            windFromDeg: Number(c.wind_direction_10m),
            isRaining: Number(c.precipitation) > 0
        };
        _cache = { at: Date.now(), lat, lon, wx };
        return wx;
    } catch (e) {
        console.warn('[Weather] fetch failed (offline?):', e.message);
        return null;
    }
}

/** Initial great-circle bearing from point 1 to point 2, degrees 0-360. */
export function bearingBetween(lat1, lon1, lat2, lon2) {
    const toRad = d => d * Math.PI / 180;
    const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2))
        - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/**
 * Decompose wind onto a shot line. windFromDeg is the direction the wind
 * blows FROM (meteorological convention, what Open-Meteo returns).
 * @returns {{headKmh: number, crossKmh: number}} headKmh > 0 = headwind,
 *          crossKmh > 0 = wind from the right of the shot line.
 */
export function windComponents(windFromDeg, shotBearingDeg, windKmh) {
    // Angle between where the wind comes from and where the shot points:
    // 0° → pure headwind, 180° → pure tailwind.
    const rel = ((windFromDeg - shotBearingDeg) % 360 + 360) % 360;
    const relRad = rel * Math.PI / 180;
    return {
        headKmh: Math.round(Math.cos(relRad) * windKmh * 10) / 10,
        crossKmh: Math.round(Math.sin(relRad) * windKmh * 10) / 10
    };
}

/**
 * "Plays-like" distance for a shot — caddie heuristics, labelled an estimate
 * in the UI: headwind ~ +1% per 1.6 km/h (the classic 1%/mph), tailwind
 * helps about half as much, and temperature moves carry ~0.25% per °C from
 * a 20 °C baseline (cold air is denser → plays longer). Adjustment capped
 * at ±30% so gusty readings can't produce absurd numbers.
 */
export function playsLikeDistance(distM, { headKmh = 0, tempC = 20 } = {}) {
    let pct = 0;
    if (headKmh > 0) pct += headKmh / 1.6;        // headwind: 1% per mph
    else pct += (headKmh / 1.6) * 0.5;            // tailwind: half effect
    pct += (20 - tempC) * 0.25;                   // cold → longer
    pct = Math.max(-30, Math.min(30, pct));
    return Math.round(distM * (1 + pct / 100));
}

/** Compass label ("NW") for a degrees-from direction. */
export function compassLabel(deg) {
    const pts = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return pts[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

/**
 * One-line summary for the GPS widget. Pure — takes the weather, the shot
 * (player → green) and the measured distance, returns display strings.
 */
export function describeShot(wx, shotBearingDeg, distM) {
    const { headKmh } = windComponents(wx.windFromDeg, shotBearingDeg, wx.windKmh);
    const plays = playsLikeDistance(distM, { headKmh, tempC: wx.tempC });
    let windWord = 'calm';
    if (headKmh >= 5) windWord = 'into wind';
    else if (headKmh <= -5) windWord = 'helping';
    else if (wx.windKmh >= 8) windWord = 'crosswind';
    return {
        playsM: plays,
        deltaM: plays - Math.round(distM),
        windWord,
        summary: `${Math.round(wx.tempC)}°C · 💨 ${Math.round(wx.windKmh)} km/h ${compassLabel(wx.windFromDeg)}`
    };
}
