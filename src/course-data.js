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
    //
    // SOURCE (P-246, checked 2026-09-06): the 18-hole and 9-hole ratings/slopes
    // below are the official GolfLink slope charts for club 40106, supplied by
    // the owner on 2026-07-04 (photographs; the charts are not on a public URL
    // this session could reach - golf.org.au and golflink.com.au refuse
    // unauthenticated fetches). Men's pars and stroke indexes were re-checked
    // on 2026-09-06 against the club's own stroke-index page,
    // https://www.keperragolf.com.au/cms/stroke-index (GolfLink club ID 40106):
    // Old (1-18) and North (10-27) match exactly; West (19-27 + 1-9) SI matches
    // exactly, but that page lists physical hole 4 as par 4 when played as West
    // (par 3 below, as on Old). Left as-is pending the owner's card; the West
    // ratings were issued against par 71, which is the par the record carries.
    "Keperra - Old (1-18)": {
        "Yellow (Men)": {
            rating: 70.5, slope: 124, par: 72,
            pars: [5, 4, 4, 3, 5, 3, 4, 3, 5, 4, 5, 3, 5, 4, 4, 4, 3, 4],
            strokeIndex: [9, 10, 13, 14, 15, 18, 8, 17, 7, 4, 16, 6, 12, 11, 3, 2, 5, 1],
            physicalHoles: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
        },
        "Blue (Men)": {
            rating: 72, slope: 129, par: 72,
            pars: [5, 4, 4, 3, 5, 3, 4, 3, 5, 4, 5, 3, 5, 4, 4, 4, 3, 4],
            strokeIndex: [9, 10, 13, 14, 15, 18, 8, 17, 7, 4, 16, 6, 12, 11, 3, 2, 5, 1],
            physicalHoles: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
        }
    },
    "Keperra - North (10-27)": {
        "Yellow (Men)": {
            // 71/124 per the official GolfLink chart (was 70.0 — owner-supplied 2026-07-04)
            rating: 71, slope: 124, par: 71,
            pars: [4, 5, 3, 5, 4, 4, 4, 3, 4, 4, 4, 4, 4, 5, 4, 3, 4, 3],
            strokeIndex: [2, 15, 11, 12, 13, 7, 3, 9, 1, 16, 5, 10, 6, 8, 4, 17, 18, 14],
            physicalHoles: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27]
        },
        "Blue (Men)": {
            rating: 72, slope: 131, par: 71,
            pars: [4, 5, 3, 5, 4, 4, 4, 3, 4, 4, 4, 4, 4, 5, 4, 3, 4, 3],
            strokeIndex: [2, 15, 11, 12, 13, 7, 3, 9, 1, 16, 5, 10, 6, 8, 4, 17, 18, 14],
            physicalHoles: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27]
        }
    },
    "Keperra - West (19-9)": {
        "Yellow (Men)": {
            // 69/122 per the official GolfLink chart (was 69.5 — owner-supplied 2026-07-04)
            rating: 69, slope: 122, par: 71,
            pars: [4, 4, 4, 4, 5, 4, 3, 4, 3, 5, 4, 4, 3, 5, 3, 4, 3, 5],
            strokeIndex: [14, 1, 6, 2, 5, 3, 16, 18, 13, 8, 10, 9, 12, 11, 17, 7, 15, 4],
            physicalHoles: [19, 20, 21, 22, 23, 24, 25, 26, 27, 1, 2, 3, 4, 5, 6, 7, 8, 9]
        },
        "Blue (Men)": {
            rating: 70, slope: 129, par: 71,
            pars: [4, 4, 4, 4, 5, 4, 3, 4, 3, 5, 4, 4, 3, 5, 3, 4, 3, 5],
            strokeIndex: [14, 1, 6, 2, 5, 3, 16, 18, 13, 8, 10, 9, 12, 11, 17, 7, 15, 4],
            physicalHoles: [19, 20, 21, 22, 23, 24, 25, 26, 27, 1, 2, 3, 4, 5, 6, 7, 8, 9]
        }
    },

    // 9-hole nines — OFFICIAL GA/GolfLink 9-hole ratings (owner-supplied slope
    // charts, 2026-07-04; BL-UX-07). These are true 9-hole CR/SR (≈half the
    // 18-hole scale) — the previous values were 18-hole-scale ratings pasted
    // against 9-hole pars, which corrupted every 9-hole differential.
    // Notes from the charts:
    //  - GolfLink lists the North nine's (physical 10-18) 9-hole rating under
    //    "Old Course … 10-18".
    //  - No official 9-hole Yellow ratings are published — the old fabricated
    //    Yellow tees are removed.
    //  - West BLUE 9-hole wasn't in the loaded GolfLink list; add it when the
    //    owner captures it — White is the only official West nine rating so far.
    "Keperra – Old Course (9 holes)": {
        // strokeIndex is the nine's holes ranked 1..9 in their published 18-hole
        // order (was the raw 18-chart row — PRODUCT SWEEP 2026-09-10 F-3).
        "Blue (Men)": { rating: 35, slope: 126, par: 36, pars: [5, 4, 4, 3, 5, 3, 4, 3, 5], strokeIndex: [4, 6, 7, 1, 8, 9, 2, 3, 5], physicalHoles: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
        "White (Men)": { rating: 34, slope: 121, par: 36, pars: [5, 4, 4, 3, 5, 3, 4, 3, 5], strokeIndex: [4, 6, 7, 1, 8, 9, 2, 3, 5], physicalHoles: [1, 2, 3, 4, 5, 6, 7, 8, 9] }
    },
    "Keperra – North Course (9 holes)": {
        // 9-hole stroke index not published on the GolfLink 9-hole page for this
        // nine. PRODUCT SWEEP 2026-09-10 F-3: the 18-chart row used to be kept
        // here verbatim, which meant whs.js — whose `holeStrokeIndex <= remainder`
        // test assumes the index scale matches the handicap scale — gave a DH-7
        // player a stroke on 4 of 9 holes here and 7 of 9 at West, on identical
        // golf. The row is now the same holes RANKED 1..9 in their published
        // 18-hole order, which is the correct nine-hole allocation whatever the
        // official card turns out to say. Replace with the official 1..9 row
        // when GolfLink publishes it.
        "Blue (Men)": { rating: 37, slope: 131, par: 36, pars: [4, 5, 3, 5, 4, 4, 4, 3, 4], strokeIndex: [2, 9, 6, 7, 8, 4, 3, 5, 1], physicalHoles: [10, 11, 12, 13, 14, 15, 16, 17, 18] },
        "White (Men)": { rating: 36, slope: 127, par: 36, pars: [4, 5, 3, 5, 4, 4, 4, 3, 4], strokeIndex: [2, 9, 6, 7, 8, 4, 3, 5, 1], physicalHoles: [10, 11, 12, 13, 14, 15, 16, 17, 18] }
    },
    "Keperra – West Course (9 holes)": {
        // Blue is DERIVED (owner-approved 2026-07-04), not yet on GolfLink's 9-hole
        // page: the additive model reproduces the official Old-18 Blue exactly
        // (35+37=72 CR, (126+131)/2≈129 slope), so West Blue 9H CR = 70−35 = 35
        // (West-18) = 72−37 = 35 (North-18) ✓; slope 131 (North-18 derivation;
        // West-18 gives 132 — integer-rounding spread). Replace with the official
        // "West, Blue, Men, 1-9" figures when GolfLink publishes/loads them.
        "Blue (Men)": { rating: 35, slope: 131, par: 35, pars: [4, 4, 4, 4, 5, 4, 3, 4, 3], strokeIndex: [8, 3, 6, 1, 4, 2, 7, 9, 5], physicalHoles: [19, 20, 21, 22, 23, 24, 25, 26, 27] },
        "White (Men)": { rating: 33, slope: 112, par: 35, pars: [4, 4, 4, 4, 5, 4, 3, 4, 3], strokeIndex: [8, 3, 6, 1, 4, 2, 7, 9, 5], physicalHoles: [19, 20, 21, 22, 23, 24, 25, 26, 27] }
    },

    // Other courses
    "Ashgrove GC": {
        // Operator-supplied from official Ashgrove scorecard (BL-4.01 Phase 3).
        // SOURCE CHECK (P-246, read 2026-09-06): the club's course page,
        // https://www.ashgrovegolf.com.au/our-club/course, publishes 18 holes,
        // Blue 4946m par 68 Scratch Rating 67 Slope 124 - the Blue record below
        // matches it hole-for-hole (pars) and figure-for-figure. The same page
        // publishes Red 4497m par 69 Scratch Rating 69 Slope 129 (the women's
        // tee) but only one par column, so which hole is the Red par 5 is not
        // confirmable there - Red is NOT added; enter it from the card. The
        // White tee is not on the club page: its 65/115 stays on the operator's
        // scorecard authority only. No stroke index is published online; the
        // SI arrays remain the operator's card. Ashgrove is an 18-hole course
        // (not 9 played twice - the brief's "9 holes" was wrong).
        "Blue (Men)": {
            rating: 67, slope: 124, par: 68,
            source: "https://www.ashgrovegolf.com.au/our-club/course (read 2026-09-06; rating, slope, par, pars, lengths)",
            pars: [4, 4, 3, 5, 4, 3, 4, 4, 3, 3, 4, 4, 3, 5, 4, 4, 3, 4],
            lengths: [428, 304, 183, 434, 290, 112, 242, 305, 139, 160, 332, 311, 186, 457, 347, 334, 128, 254],
            strokeIndex: [1, 11, 7, 18, 14, 13, 17, 6, 15, 5, 9, 3, 2, 8, 10, 4, 12, 16],
            physicalHoles: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
        },
        "White (Men)": {
            rating: 65, slope: 115, par: 68,
            source: "operator-supplied Ashgrove scorecard (BL-4.01 Phase 3); not on the club's web page as of 2026-09-06",
            pars: [4, 4, 3, 5, 4, 3, 4, 4, 3, 3, 5, 4, 4, 3, 4, 4, 3, 4],
            strokeIndex: [1, 9, 12, 18, 11, 13, 17, 5, 15, 4, 7, 3, 6, 8, 10, 2, 14, 16],
            physicalHoles: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
        }
    },
    // Redcliffe Golf Club, Clontarf (P-246, read 2026-09-06). Rating/slope/par/
    // length are the club's own figures: https://www.redcliffegolf.com/cms/about-redcliffe/the-course/
    // ("Blue Course 6099 metres, Par 71, ACR 72, Slope 123"; "Red (Ladies)
    // 5431 metres, Par 73, AWCR 74, Slope 123"). The club publishes no
    // hole-by-hole card online, so pars/SI/lengths come from the Hole19
    // listing (https://www.hole19golf.com/australia/redcliffe-golf-club) and
    // were accepted only because they reconcile with the club's figures:
    // pars sum 35 + 36 = 71, lengths sum 3006 + 3093 = 6099, and SI 1-18 each
    // used exactly once. Red is NOT added: its per-hole pars (par 73) are not
    // published anywhere reachable - enter from the card.
    "Redcliffe GC": {
        "Blue (Men)": {
            rating: 72, slope: 123, par: 71,
            source: "https://www.redcliffegolf.com/cms/about-redcliffe/the-course/ (read 2026-09-06; rating, slope, par, length) + hole19golf.com card for pars/SI, reconciled",
            pars: [4, 3, 4, 5, 4, 4, 3, 4, 4, 5, 3, 4, 3, 4, 4, 5, 4, 4],
            lengths: [342, 176, 357, 436, 364, 388, 207, 319, 417, 471, 154, 422, 134, 295, 358, 506, 367, 386],
            strokeIndex: [16, 8, 11, 18, 9, 5, 4, 14, 1, 15, 10, 3, 17, 13, 7, 12, 6, 2],
            physicalHoles: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
        }
    },
    // Virginia Golf Club, Banyo - 27 holes (P-246, read 2026-09-06). Pars and
    // lengths per tee come from the club's own hole pages,
    // https://www.virginiagolf.com.au/cms/course/97/ (hole 1) and
    // https://www.virginiagolf.com.au/cms/course/2/ ... /27/ (they sum to
    // par 71 / Blue 6117m / White 5926m / Red par 73, 5462m for 1-18).
    // RATING UNKNOWN: no scratch rating or slope is published on the club site,
    // and golf.org.au / golflink.com.au refused every fetch. Aggregators quote
    // Blue 73/121, White 72/119, Red 74/125 - NOT entered, because they are not
    // an official or club page. No stroke index is published either. The tees
    // are deliberately unratable (rating/slope null) so the app asks for
    // CR/SR/par by hand: enter rating/slope from the scorecard.
    "Virginia GC - Championship (1-18)": {
        "Blue (Men)": {
            rating: null, slope: null, par: 71, ratingUnknown: true, // enter rating/slope from the scorecard
            source: "https://www.virginiagolf.com.au/cms/course/97/ ... /18/ (read 2026-09-06; pars + lengths only)",
            pars: [5, 4, 3, 4, 4, 4, 4, 4, 3, 4, 4, 3, 5, 3, 4, 5, 4, 4],
            lengths: [492, 383, 168, 327, 352, 412, 377, 355, 184, 313, 328, 135, 444, 161, 375, 523, 400, 388],
            strokeIndex: [],
            physicalHoles: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
        },
        "White (Men)": {
            rating: null, slope: null, par: 71, ratingUnknown: true, // enter rating/slope from the scorecard
            source: "https://www.virginiagolf.com.au/cms/course/97/ ... /18/ (read 2026-09-06; pars + lengths only)",
            pars: [5, 4, 3, 4, 4, 4, 4, 4, 3, 4, 4, 3, 5, 3, 4, 5, 4, 4],
            lengths: [483, 366, 162, 321, 339, 399, 354, 348, 178, 306, 320, 130, 431, 137, 364, 514, 387, 387],
            strokeIndex: [],
            physicalHoles: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
        },
        "Red (Women)": {
            // Holes 6 and 18 are par 5 from the Red tee (club hole pages).
            rating: null, slope: null, par: 73, ratingUnknown: true, // enter rating/slope from the scorecard
            source: "https://www.virginiagolf.com.au/cms/course/97/ ... /18/ (read 2026-09-06; pars + lengths only)",
            pars: [5, 4, 3, 4, 4, 5, 4, 4, 3, 4, 4, 3, 5, 3, 4, 5, 4, 5],
            lengths: [434, 320, 157, 319, 340, 393, 339, 335, 171, 205, 308, 126, 403, 135, 312, 411, 367, 387],
            strokeIndex: [],
            physicalHoles: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
        }
    },
    "Virginia GC - Heritage Nine (19-27)": {
        // The club's hole pages give 4,4,5,4,4,4,3,4,3 = par 35 (hole 23 is a
        // 205m par 4 there); aggregators list the Heritage nine as par 34.
        // Club pages win. No White lengths are published for 19-27.
        "Blue (Men)": {
            rating: null, slope: null, par: 35, ratingUnknown: true, // enter rating/slope from the scorecard
            source: "https://www.virginiagolf.com.au/cms/course/19/ ... /27/ (read 2026-09-06; pars + lengths only)",
            pars: [4, 4, 5, 4, 4, 4, 3, 4, 3],
            lengths: [320, 313, 400, 277, 205, 258, 92, 336, 163],
            strokeIndex: [],
            physicalHoles: [19, 20, 21, 22, 23, 24, 25, 26, 27]
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
    // Sandgate GC — 9 greens played twice for 18. The two nines use different
    // tees, so each nine has its own lengths AND its own stroke index.
    // Operator-supplied from the official club scorecard, photographed 2026-08-09.
    // Card checksums verified before entry: OUT 2967, IN 2977, TOT 5944, par 36/36/72,
    // and SI 1-18 each used exactly once across the 18. (Web aggregators publish a
    // corrupted card for this course — back nine duplicating the front, SI repeated
    // and 1/3/5/7/10/12/14/16/18 absent. Do not re-source from them.)
    "Sandgate GC (9 holes)": {
        // DERIVED 9-hole rating: the card publishes only the 18-hole ACR 71.0 /
        // Men's Slope 121. The front nine is 2967m of the 5944m total (49.9%), so
        // CR is taken as half (35.5) and slope carried across unchanged. Replace
        // with official GolfLink 9-hole figures when sourced — Keperra shows a
        // 9-hole slope can differ from its 18-hole parent (124 -> 126), so this
        // is an approximation, not a published rating.
        // strokeIndex is the nine's holes ranked 1..9 in their published 18-hole
        // order (was the raw 18-chart row — PRODUCT SWEEP 2026-09-10 F-3).
        "Men's": {
            rating: 35.5, slope: 121, par: 36,
            pars: [5, 4, 4, 4, 3, 4, 3, 5, 4],
            strokeIndex: [9, 1, 5, 8, 4, 2, 7, 3, 6],
            physicalHoles: [1, 2, 3, 4, 5, 6, 7, 8, 9]
        }
    },
    "Sandgate GC (1-18)": {
        // Full 18 = the same 9 greens twice, so physicalHoles repeats 1-9.
        // Rating/slope here are the card's published 18-hole figures (not derived).
        "Men's": {
            rating: 71, slope: 121, par: 72,
            pars: [5, 4, 4, 4, 3, 4, 3, 5, 4, 4, 4, 4, 4, 3, 5, 3, 5, 4],
            strokeIndex: [17, 2, 10, 15, 8, 4, 13, 6, 11, 5, 3, 1, 14, 16, 18, 12, 7, 9],
            physicalHoles: [1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2, 3, 4, 5, 6, 7, 8, 9]
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
 * How many holes a par belongs to. A par ≤ 40 is a nine — the same test
 * isPlausibleRating has used since BL-UX-07, named here so the handicap
 * functions in whs.js and their call sites share one discriminator instead of
 * repeating the magic 40 (PRODUCT SWEEP 2026-09-10 F-1/F-2: four separate
 * functions each handled the nine-hole case differently, and three of them
 * did not handle it at all).
 * @param {number} par - Par for the holes being played.
 * @returns {9|18}
 */
export function holesForPar(par) {
    return Number(par) > 0 && Number(par) <= 40 ? 9 : 18;
}

/**
 * How many holes a course RECORD covers, or null when it has none (Custom
 * Course, whose par is typed at Start Round).
 *
 * PRODUCT SWEEP 2026-09-10 SECOND PASS F-2: the "9 Holes / 18 Holes" toggle
 * set AppState.currentRoundHoles and nothing else, so an 18-hole record —
 * Ashgrove, McLeod, Bulimba — stayed selectable under the app's DEFAULT of
 * 9 Holes. The Daily Handicap was then computed from the tee's 18-hole par
 * while the stroke chart wrapped at nine: 12 strokes over a front nine where
 * Golf Australia gives 9. An 18-hole tee has no nine-hole Course Rating, so
 * the round cannot be rated correctly whatever the stroke chart does; the
 * course list has to stop offering the combination.
 *
 * @param {string} courseName - A key of COURSE_DATA.
 * @returns {9|18|null}
 */
export function holesForCourse(courseName) {
    const tees = COURSE_DATA[courseName];
    if (!tees) return null;
    for (const teeName of Object.keys(tees)) {
        const tee = tees[teeName];
        if (Array.isArray(tee?.pars) && tee.pars.length > 0) {
            return tee.pars.length <= 9 ? 9 : 18;
        }
        if (Number(tee?.par) > 0) return holesForPar(tee.par);
    }
    return null;
}

/**
 * The tee's published stroke index, or null when it does not have a usable one.
 *
 * PRODUCT SWEEP 2026-09-10 F-9: four Virginia tees ship `strokeIndex: []`, and
 * every scoring site fell through a `||` fallback that substituted the hole's
 * PLAYING ORDER for its difficulty ranking — so strokes went to holes 1,2,3…
 * instead of to the hardest holes, and the fabricated Stableford total became
 * the AGS and then the handicap index. Note `[]` is truthy, which is why the
 * guards written as `if (teeData.strokeIndex)` did not catch it; the absence
 * has to be made explicit in one place and branched on everywhere.
 *
 * @param {Object} teeData - A tee record from COURSE_DATA.
 * @param {number} [holes=18] - Holes being played; the index must cover them.
 * @returns {Array<number>|null} The stroke index, or null if unusable.
 */
export function getStrokeIndex(teeData, holes = 18) {
    const si = teeData && teeData.strokeIndex;
    if (!Array.isArray(si) || si.length < holes) return null;
    for (let i = 0; i < holes; i++) {
        if (!Number.isFinite(Number(si[i])) || si[i] < 1 || si[i] > si.length) return null;
    }
    return si;
}

/**
 * True when a (rating, slope, par) triple is WHS-plausible. Applied identically
 * to stored tee data and to hand-entered values.
 *
 * 9-hole aware (BL-UX-07): GA rates each nine separately, so a 9-hole Course
 * Rating runs at ~half the 18-hole scale (Keperra's nines: 33–37). A par ≤ 40
 * is treated as a nine and validated against halved rating bounds — which also
 * means an 18-hole-scale rating pasted against a 9-hole par (the exact data
 * bug that used to corrupt 9-hole differentials) is now rejected as unratable
 * instead of being trusted.
 * @returns {boolean}
 */
export function isPlausibleRating(rating, slope, par) {
    const p = Number(par), r = Number(rating), s = Number(slope);
    if (!(p > 0) || s < SLOPE_MIN || s > SLOPE_MAX) return false;
    const nineHole = p <= 40;
    const min = nineHole ? RATING_MIN / 2 : RATING_MIN;
    const max = nineHole ? RATING_MAX / 2 : RATING_MAX;
    return r >= min && r <= max;
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
