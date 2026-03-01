// ==========================================
// course-data.js
// Centralized Source of truth for Golf Course Ratings
// ==========================================

export const COURSE_DATA = {
    // Keperra 9-hole loops
    "Keperra – Old Course (9 holes)": {
        "Yellow (Men)": { rating: 70, slope: 124, par: 36, pars: [5, 4, 4, 3, 5, 3, 4, 3, 5], strokeIndex: [9, 10, 13, 14, 15, 18, 8, 17, 7] },
        "Blue (Men)": { rating: 71, slope: 125, par: 36, pars: [5, 4, 4, 3, 5, 3, 4, 3, 5], strokeIndex: [9, 10, 13, 14, 15, 18, 8, 17, 7] }
    },
    "Keperra – North Course (9 holes)": {
        "Yellow (Men)": { rating: 71, slope: 124, par: 36, pars: [4, 5, 3, 5, 4, 4, 4, 3, 4], strokeIndex: [2, 15, 11, 12, 13, 7, 3, 9, 1] },
        "Blue (Men)": { rating: 72, slope: 131, par: 36, pars: [4, 5, 3, 5, 4, 4, 4, 3, 4], strokeIndex: [2, 15, 11, 12, 13, 7, 3, 9, 1] }
    },
    "Keperra – West Course (9 holes)": {
        "Yellow (Men)": { rating: 68, slope: 121, par: 35, pars: [4, 4, 4, 4, 5, 4, 3, 4, 3], strokeIndex: [14, 1, 6, 2, 5, 3, 16, 18, 13] },
        "Blue (Men)": { rating: 69, slope: 128, par: 35, pars: [4, 4, 4, 4, 5, 4, 3, 4, 3], strokeIndex: [14, 1, 6, 2, 5, 3, 16, 18, 13] }
    },

    // Keperra 18-hole Combos (CR combined, Par combined, Men's Yellow selected as default baseline if unspecified)
    "Keperra – Old + North (Par 72)": {
        "Yellow (Men)": { rating: 70.5, slope: 124, par: 72, pars: [5, 4, 4, 3, 5, 3, 4, 3, 5, 4, 5, 3, 5, 4, 4, 4, 3, 4], strokeIndex: [9, 10, 13, 14, 15, 18, 8, 17, 7, 4, 16, 6, 12, 11, 3, 2, 5, 1] },
        "Blue (Men)": { rating: 71.5, slope: 128, par: 72, pars: [5, 4, 4, 3, 5, 3, 4, 3, 5, 4, 5, 3, 5, 4, 4, 4, 3, 4], strokeIndex: [9, 10, 13, 14, 15, 18, 8, 17, 7, 4, 16, 6, 12, 11, 3, 2, 5, 1] }
    },
    "Keperra – North + West (Par 71)": {
        "Yellow (Men)": { rating: 69.5, slope: 123, par: 71, pars: [4, 5, 3, 5, 4, 4, 4, 3, 4, 4, 4, 4, 4, 5, 4, 3, 4, 3], strokeIndex: [2, 15, 11, 12, 13, 7, 3, 9, 1, 16, 5, 10, 6, 8, 4, 17, 18, 14] },
        "Blue (Men)": { rating: 70.5, slope: 130, par: 71, pars: [4, 5, 3, 5, 4, 4, 4, 3, 4, 4, 4, 4, 4, 5, 4, 3, 4, 3], strokeIndex: [2, 15, 11, 12, 13, 7, 3, 9, 1, 16, 5, 10, 6, 8, 4, 17, 18, 14] }
    },
    "Keperra – West + Old (Par 71)": {
        "Yellow (Men)": { rating: 69, slope: 122, par: 71, pars: [4, 4, 4, 4, 5, 4, 3, 4, 3, 5, 4, 4, 3, 5, 3, 4, 3, 5], strokeIndex: [14, 1, 6, 2, 5, 3, 16, 18, 13, 8, 10, 9, 12, 11, 17, 7, 15, 4] },
        "Blue (Men)": { rating: 70, slope: 127, par: 71, pars: [4, 4, 4, 4, 5, 4, 3, 4, 3, 5, 4, 4, 3, 5, 3, 4, 3, 5], strokeIndex: [14, 1, 6, 2, 5, 3, 16, 18, 13, 8, 10, 9, 12, 11, 17, 7, 15, 4] }
    },

    // Other 9-hole courses
    "Ashgrove GC": {
        "White (Men 1-9)": { rating: 33, slope: 115, par: 35, pars: [] } // pars empty = require manual input
    },
    "McLeod GC": {
        "Blue (Men)": { rating: 69, slope: 126, par: 0, pars: [] }
    },
    "Bulimba Course": {
        "White (Men)": { rating: 49, slope: 65, par: 0, pars: [] }
    },
    "Custom Course": {
        "Custom Tee": { rating: 72, slope: 113, par: 0, pars: [] }
    }
};
