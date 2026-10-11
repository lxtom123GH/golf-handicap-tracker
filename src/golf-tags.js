// The OSM `golf=*` tag a traced feature is saved under.
//
// The hole mapper's own kinds (MAPPER_KINDS) are short UI names. The course
// map (hole-overlay.js) only draws the OSM tags, so a trace saved as `water`
// never showed (simplify review 07 Oct 2026, Track A item 7). Every place that
// writes or exports a hand trace goes through golfTag(), so old `water`
// records are fixed on export too.

const TAGS = { water: 'water_hazard' };

/** The OSM golf tag for a mapper kind (or an already-stored tag). */
export function golfTag(kind) {
    return TAGS[kind] || kind;
}
