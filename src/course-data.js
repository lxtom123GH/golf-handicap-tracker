// ==========================================
// course-data.js
// Centralized Source of truth for Golf Course Ratings & GPS Coordinates
// ==========================================

// Physical coordinates for Keperra 1-27 (taken from CSV)
// Format: [CenterLat, CenterLng, FrontLat, FrontLng, BackLat, BackLng]
export const KEPERRA_GPS = {
    1: [-27.409223, 152.948465, -27.409265, 152.948628, -27.409194, 152.948293],
    2: [-27.407634, 152.944167, -27.407736, 152.944281, -27.407541, 152.944049],
    3: [-27.40571, 152.941892, -27.405839, 152.941966, -27.405623, 152.941759],
    4: [-27.404826, 152.940304, -27.404907, 152.940436, -27.404774, 152.940196],
    5: [-27.406926, 152.943427, -27.406811, 152.943344, -27.407044, 152.943505],
    6: [-27.40605, 152.943758, -27.406181, 152.943819, -27.40596, 152.943664],
    7: [-27.406842, 152.947469, -27.406822, 152.947334, -27.406853, 152.947588],
    8: [-27.4086, 152.947994, -27.408523, 152.947887, -27.408668, 152.948095],
    9: [-27.411494, 152.951746, -27.411543, 152.951608, -27.411492, 152.951872],
    10: [-27.40899, 152.949281, -27.409047, 152.949455, -27.408945, 152.94911],
    11: [-27.404978, 152.950434, -27.405094, 152.950334, -27.40488, 152.950519],
    12: [-27.40702, 152.950631, -27.406917, 152.950713, -27.407121, 152.950542],
    13: [-27.403197, 152.952839, -27.403335, 152.952795, -27.403061, 152.952876],
    14: [-27.404265, 152.950498, -27.404148, 152.950568, -27.404384, 152.950384],
    15: [-27.402325, 152.953051, -27.402329, 152.952889, -27.402317, 152.953228],
    16: [-27.405493, 152.952354, -27.405395, 152.952365, -27.405613, 152.952323],
    17: [-27.407159, 152.951931, -27.407045, 152.951942, -27.407273, 152.951927],
    18: [-27.410252, 152.951951, -27.411494, 152.951746, -27.410363, 152.952017],
    19: [-27.407856, 152.952223, -27.407972, 152.952162, -27.407743, 152.952323],
    20: [-27.40456, 152.954033, -27.404652, 152.953927, -27.404441, 152.954165],
    21: [-27.402548, 152.954108, -27.402678, 152.954164, -27.402462, 152.954008],
    22: [-27.402575, 152.957306, -27.402574, 152.957116, -27.402575, 152.957493],
    23: [-27.405169, 152.954475, -27.405077, 152.954482, -27.405256, 152.954451], // Fixed 27.405256 -> -27.405256
    24: [-27.403066, 152.957354, -27.40307, 152.957237, -27.40305, 152.957481],
    25: [-27.403901, 152.956475, -27.403841, 152.956628, -27.403937, 152.956331],
    26: [-27.406447, 152.953603, -27.406373, 152.953699, -27.40654, 152.9535],
    27: [-27.408589, 152.952474, -27.408505, 152.952533, -27.408706, 152.952423]
};

export const COURSE_DATA = {
    // Keperra 18-hole Combos (The 27-hole property logic)
    "Keperra - Old (1-18)": {
        "Yellow (Men)": {
            rating: 70.5, slope: 124, par: 72,
            pars: [5, 4, 4, 3, 5, 3, 4, 3, 5, 4, 5, 3, 5, 4, 4, 4, 3, 4],
            strokeIndex: [9, 10, 13, 14, 15, 18, 8, 17, 7, 4, 16, 6, 12, 11, 3, 2, 5, 1],
            physicalHoles: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
        },
        "Blue (Men)": {
            rating: 71.5, slope: 128, par: 72,
            pars: [5, 4, 4, 3, 5, 3, 4, 3, 5, 4, 5, 3, 5, 4, 4, 4, 3, 4],
            strokeIndex: [9, 10, 13, 14, 15, 18, 8, 17, 7, 4, 16, 6, 12, 11, 3, 2, 5, 1],
            physicalHoles: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
        }
    },
    "Keperra - North (10-27)": {
        "Yellow (Men)": {
            rating: 70.0, slope: 124, par: 71,
            pars: [4, 5, 3, 5, 4, 4, 4, 3, 4, 4, 4, 4, 4, 5, 4, 3, 4, 3],
            strokeIndex: [2, 15, 11, 12, 13, 7, 3, 9, 1, 16, 5, 10, 6, 8, 4, 17, 18, 14],
            physicalHoles: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27]
        },
        "Blue (Men)": {
            rating: 71.0, slope: 129, par: 71,
            pars: [4, 5, 3, 5, 4, 4, 4, 3, 4, 4, 4, 4, 4, 5, 4, 3, 4, 3],
            strokeIndex: [2, 15, 11, 12, 13, 7, 3, 9, 1, 16, 5, 10, 6, 8, 4, 17, 18, 14],
            physicalHoles: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27]
        }
    },
    "Keperra - West (19-9)": {
        "Yellow (Men)": {
            rating: 69.5, slope: 122, par: 71,
            pars: [4, 4, 4, 4, 5, 4, 3, 4, 3, 5, 4, 4, 3, 5, 3, 4, 3, 5],
            strokeIndex: [14, 1, 6, 2, 5, 3, 16, 18, 13, 8, 10, 9, 12, 11, 17, 7, 15, 4],
            physicalHoles: [19, 20, 21, 22, 23, 24, 25, 26, 27, 1, 2, 3, 4, 5, 6, 7, 8, 9]
        },
        "Blue (Men)": {
            rating: 70.5, slope: 127, par: 71,
            pars: [4, 4, 4, 4, 5, 4, 3, 4, 3, 5, 4, 4, 3, 5, 3, 4, 3, 5],
            strokeIndex: [14, 1, 6, 2, 5, 3, 16, 18, 13, 8, 10, 9, 12, 11, 17, 7, 15, 4],
            physicalHoles: [19, 20, 21, 22, 23, 24, 25, 26, 27, 1, 2, 3, 4, 5, 6, 7, 8, 9]
        }
    },

    // Legacy / 9-Hole options
    "Keperra – Old Course (9 holes)": {
        "Yellow (Men)": { rating: 70, slope: 124, par: 36, pars: [5, 4, 4, 3, 5, 3, 4, 3, 5], strokeIndex: [9, 10, 13, 14, 15, 18, 8, 17, 7], physicalHoles: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
        "Blue (Men)": { rating: 71, slope: 125, par: 36, pars: [5, 4, 4, 3, 5, 3, 4, 3, 5], strokeIndex: [9, 10, 13, 14, 15, 18, 8, 17, 7], physicalHoles: [1, 2, 3, 4, 5, 6, 7, 8, 9] }
    },
    "Keperra – North Course (9 holes)": {
        "Yellow (Men)": { rating: 71, slope: 124, par: 36, pars: [4, 5, 3, 5, 4, 4, 4, 3, 4], strokeIndex: [2, 15, 11, 12, 13, 7, 3, 9, 1], physicalHoles: [10, 11, 12, 13, 14, 15, 16, 17, 18] },
        "Blue (Men)": { rating: 72, slope: 131, par: 36, pars: [4, 5, 3, 5, 4, 4, 4, 3, 4], strokeIndex: [2, 15, 11, 12, 13, 7, 3, 9, 1], physicalHoles: [10, 11, 12, 13, 14, 15, 16, 17, 18] }
    },
    "Keperra – West Course (9 holes)": {
        "Yellow (Men)": { rating: 68, slope: 121, par: 35, pars: [4, 4, 4, 4, 5, 4, 3, 4, 3], strokeIndex: [14, 1, 6, 2, 5, 3, 16, 18, 13], physicalHoles: [19, 20, 21, 22, 23, 24, 25, 26, 27] },
        "Blue (Men)": { rating: 69, slope: 128, par: 35, pars: [4, 4, 4, 4, 5, 4, 3, 4, 3], strokeIndex: [14, 1, 6, 2, 5, 3, 16, 18, 13], physicalHoles: [19, 20, 21, 22, 23, 24, 25, 26, 27] }
    },

    // Other courses
    "Ashgrove GC": {
        // Operator-supplied from official Ashgrove scorecard (BL-4.01 Phase 3)
        "Blue (Men)": {
            rating: 67, slope: 124, par: 68,
            pars: [4, 4, 3, 5, 4, 3, 4, 4, 3, 3, 4, 4, 3, 5, 4, 4, 3, 4],
            strokeIndex: [1, 11, 7, 18, 14, 13, 17, 6, 15, 5, 9, 3, 2, 8, 10, 4, 12, 16],
            physicalHoles: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
        },
        "White (Men)": {
            rating: 65, slope: 115, par: 68,
            pars: [4, 4, 3, 5, 4, 3, 4, 4, 3, 3, 5, 4, 4, 3, 4, 4, 3, 4],
            strokeIndex: [1, 9, 12, 18, 11, 13, 17, 5, 15, 4, 7, 3, 6, 8, 10, 2, 14, 16],
            physicalHoles: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
        }
    },
    "McLeod GC": {
        // Operator-supplied from official McLeod scorecard (BL-4.01 Phase 3) — "Blue25" layout
        "Blue (Men)": {
            rating: 69, slope: 128, par: 69,
            pars: [4, 3, 5, 4, 4, 3, 4, 4, 5, 5, 4, 3, 4, 3, 4, 3, 4, 3],
            strokeIndex: [2, 4, 18, 9, 11, 12, 16, 13, 1, 7, 17, 15, 6, 10, 8, 14, 3, 5],
            physicalHoles: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
        }
    },
    "Bulimba Course": {
        // Operator-supplied from official Bulimba scorecard (BL-4.01 Phase 3) — par-3 course
        "White (Men)": {
            rating: 49, slope: 65, par: 54,
            pars: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
            strokeIndex: [10, 1, 8, 3, 14, 17, 16, 11, 6, 9, 2, 7, 4, 13, 18, 15, 12, 5],
            physicalHoles: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
        }
    },
    "Custom Course": {
        "Custom Tee": { rating: 72, slope: 113, par: 0, pars: [], strokeIndex: [], physicalHoles: [] }
    }
};

// WHS plausibility bounds, shared by auto-ratability (isRatableTee) and manual
// CR/SR/par validation (resolveRoundRatings) so the two never diverge (BL-4.01).
// Slope 55-155 is the WHS hard range; the rating floor is generous enough for
// legitimate short par-3 courses (e.g. Bulimba scratch 49) while still rejecting
// placeholder/garbage values.
export const RATING_MIN = 45, RATING_MAX = 90, SLOPE_MIN = 55, SLOPE_MAX = 155;

/**
 * True when a (rating, slope, par) triple is WHS-plausible. Applied identically
 * to stored tee data and to hand-entered values.
 * @returns {boolean}
 */
export function isPlausibleRating(rating, slope, par) {
    return Number(par) > 0
        && Number(slope) >= SLOPE_MIN && Number(slope) <= SLOPE_MAX
        && Number(rating) >= RATING_MIN && Number(rating) <= RATING_MAX;
}

/**
 * True when a tee carries a complete, plausible WHS rating so its stored
 * rating/slope/par can be trusted for handicap math. Tees that fail this
 * (par 0, implausible/missing rating or slope, empty pars/strokeIndex) are
 * "unratable" and require manual CR/SR/par entry to produce a counting round.
 * @param {Object} tee - A tee object from COURSE_DATA[course][tee].
 * @returns {boolean}
 */
export function isRatableTee(tee) {
    if (!tee) return false;
    return isPlausibleRating(tee.rating, tee.slope, tee.par)
        && Array.isArray(tee.pars) && tee.pars.length > 0
        && Array.isArray(tee.strokeIndex) && tee.strokeIndex.length > 0;
}
