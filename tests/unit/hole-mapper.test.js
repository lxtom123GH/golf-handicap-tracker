// ==========================================================================
// hole-mapper.test.js — S6 Part 2a: the pure vertex-editing model
// ==========================================================================
// Frame-metre coordinates; no DOM. Every mutation (add / move / delete /
// close) is undoable, sizes are capped at 12 features / 200 vertices, and
// the save payload is GeoJSON with closed [lon, lat] rings.

import { describe, it, expect } from 'vitest';
import {
    createMapperModel, mapperAdd, mapperMove, mapperDelete, mapperClose,
    mapperUndo, ringAreaM2, mapperGeoJSON, MAPPER_LIMITS, MAPPER_KINDS,
} from '../../src/hole-mapper.js';
import { readFileSync, readdirSync } from 'node:fs';
import { stripIdentity } from '../../scripts/strip-identity.mjs';
import { resolve } from 'node:path';

const HOLE = {
    tee: { lat: -27.4112264, lon: 152.9524138 },
    green: { centre: { lat: -27.40899, lon: 152.949281 } },
};

describe('hole mapper: ring area', () => {
    it('a 10x10 square ring is 100 m² regardless of winding', () => {
        const ccw = [[0, 0], [10, 0], [10, 10], [0, 10]];
        const cw = [[0, 0], [0, 10], [10, 10], [10, 0]];
        expect(ringAreaM2(ccw)).toBeCloseTo(100, 6);
        expect(ringAreaM2(cw)).toBeCloseTo(100, 6);
    });
    it('fewer than 3 vertices has no area', () => {
        expect(ringAreaM2([[0, 0], [5, 5]])).toBe(0);
        expect(ringAreaM2([])).toBe(0);
        expect(ringAreaM2(null)).toBe(0);
    });
});

describe('hole mapper: add and close', () => {
    it('add places vertices on the open draft and close makes a feature', () => {
        const m = createMapperModel();
        for (const xy of [[0, 0], [20, 0], [20, 20], [0, 20]]) {
            expect(mapperAdd(m, 'green', xy).ok).toBe(true);
        }
        expect(m.drafts.green.vertices).toHaveLength(4);
        const res = mapperClose(m, 'green');
        expect(res.ok).toBe(true);
        expect(m.features).toHaveLength(1);
        expect(m.features[0].kind).toBe('green');
        expect(m.drafts.green).toBeUndefined();
    });
    it('close refuses an open ring with fewer than 3 vertices', () => {
        const m = createMapperModel();
        mapperAdd(m, 'bunker', [0, 0]);
        mapperAdd(m, 'bunker', [5, 5]);
        expect(mapperClose(m, 'bunker')).toEqual({ ok: false, reason: 'too-few-vertices' });
        expect(m.features).toHaveLength(0);
    });
    it('add switches the active kind to what is being drawn', () => {
        const m = createMapperModel({ activeKind: 'green' });
        mapperAdd(m, 'water', [0, 0]);
        expect(m.activeKind).toBe('water');
    });
    it('the 200-vertex cap holds on the open draft', () => {
        const m = createMapperModel();
        for (let i = 0; i < MAPPER_LIMITS.maxVertices; i++) {
            expect(mapperAdd(m, 'fairway', [i, 0]).ok).toBe(true);
        }
        expect(mapperAdd(m, 'fairway', [999, 0])).toEqual({ ok: false, reason: 'max-vertices' });
        expect(m.drafts.fairway.vertices).toHaveLength(MAPPER_LIMITS.maxVertices);
    });
    it('the 12-feature cap holds across kinds', () => {
        const m = createMapperModel();
        for (let i = 0; i < MAPPER_LIMITS.maxFeatures; i++) {
            mapperAdd(m, 'bunker', [i * 10, 0]);
            mapperAdd(m, 'bunker', [i * 10 + 5, 0]);
            mapperAdd(m, 'bunker', [i * 10 + 5, 5]);
            expect(mapperClose(m, 'bunker').ok).toBe(true);
        }
        expect(m.features).toHaveLength(MAPPER_LIMITS.maxFeatures);
        expect(mapperAdd(m, 'bunker', [0, 0]).ok).toBe(false);
        expect(mapperClose(m, 'bunker').reason).toBe('max-features');
    });
});

describe('hole mapper: move and delete', () => {
    it('move repositions a draft vertex and a closed-feature vertex', () => {
        const m = createMapperModel();
        for (const xy of [[0, 0], [10, 0], [10, 10]]) mapperAdd(m, 'green', xy);
        mapperClose(m, 'green');
        expect(mapperMove(m, { feature: m.features[0].id, index: 1 }, [99, 99]).ok).toBe(true);
        expect(m.features[0].vertices[1]).toEqual([99, 99]);
        mapperAdd(m, 'bunker', [1, 1]);
        expect(mapperMove(m, { draft: 'bunker', index: 0 }, [7, 7]).ok).toBe(true);
        expect(m.drafts.bunker.vertices[0]).toEqual([7, 7]);
    });
    it('delete removes a vertex from a closed feature', () => {
        const m = createMapperModel();
        for (const xy of [[0, 0], [10, 0], [10, 10], [5, 15]]) mapperAdd(m, 'green', xy);
        mapperClose(m, 'green');
        const before = m.features[0].vertices.length;
        expect(mapperDelete(m, { feature: m.features[0].id, index: 3 }).ok).toBe(true);
        expect(m.features[0].vertices).toHaveLength(before - 1);
    });
    it('moves and deletes reject unknown targets', () => {
        const m = createMapperModel();
        expect(mapperMove(m, { feature: 42, index: 0 }, [0, 0]).ok).toBe(false);
        expect(mapperDelete(m, { draft: 'green', index: 3 }).ok).toBe(false);
    });
});

describe('hole mapper: undo', () => {
    it('undo removes the last added vertex', () => {
        const m = createMapperModel();
        mapperAdd(m, 'green', [0, 0]);
        mapperAdd(m, 'green', [10, 0]);
        expect(mapperUndo(m).ok).toBe(true);
        expect(m.drafts.green.vertices).toEqual([[0, 0]]);
        expect(mapperUndo(m).ok).toBe(true);
        expect(m.drafts.green).toBeUndefined();
        expect(mapperUndo(m)).toEqual({ ok: false, reason: 'nothing-to-undo' });
    });
    it('undo restores a moved vertex to its previous position', () => {
        const m = createMapperModel();
        mapperAdd(m, 'green', [0, 0]);
        mapperMove(m, { draft: 'green', index: 0 }, [50, 50]);
        expect(m.drafts.green.vertices[0]).toEqual([50, 50]);
        expect(mapperUndo(m).ok).toBe(true);
        expect(m.drafts.green.vertices[0]).toEqual([0, 0]);
    });
    it('undo reinserts a deleted vertex at its index', () => {
        const m = createMapperModel();
        for (const xy of [[0, 0], [10, 0], [10, 10]]) mapperAdd(m, 'green', xy);
        mapperDelete(m, { draft: 'green', index: 1 });
        expect(m.drafts.green.vertices).toEqual([[0, 0], [10, 10]]);
        expect(mapperUndo(m).ok).toBe(true);
        expect(m.drafts.green.vertices).toEqual([[0, 0], [10, 0], [10, 10]]);
    });
    it('undo reopens a closed ring as the draft', () => {
        const m = createMapperModel();
        for (const xy of [[0, 0], [10, 0], [10, 10]]) mapperAdd(m, 'water', xy);
        mapperClose(m, 'water');
        expect(m.features).toHaveLength(1);
        expect(mapperUndo(m).ok).toBe(true);
        expect(m.features).toHaveLength(0);
        expect(m.drafts.water.vertices).toHaveLength(3);
    });
});

describe('hole mapper: GeoJSON payload', () => {
    it('saves water under the OSM tag the course map draws (water_hazard)', async () => {
        const { golfTag } = await import('../../src/golf-tags.js');
        const m = createMapperModel();
        for (const xy of [[0, 0], [10, 0], [10, 10]]) mapperAdd(m, 'water', xy);
        mapperClose(m, 'water');
        for (const opts of [{}, { firestoreSafe: true }]) {
            const fc = mapperGeoJSON(m, HOLE, {}, opts);
            expect(fc.features[0].properties.golf).toBe('water_hazard');
        }
        // every kind the mapper saves is one the overlay knows how to fill
        const overlay = readFileSync(resolve(process.cwd(), 'src/hole-overlay.js'), 'utf8');
        const fill = overlay.slice(overlay.indexOf('const FILL'), overlay.indexOf('const DRAW_ORDER'));
        for (const kind of MAPPER_KINDS) expect(fill).toContain(`${golfTag(kind)}:`);
        // old records exported with the old tag are normalised too
        expect(golfTag('water')).toBe('water_hazard');
        expect(golfTag('water_hazard')).toBe('water_hazard');
        expect(golfTag('bunker')).toBe('bunker');
        const exporter = readFileSync(resolve(process.cwd(), 'scripts/export-hand-traces.mjs'), 'utf8');
        expect(exporter).toMatch(/golf:\s*golfTag\(stored\.properties\?\.golf/);
    });

    it('the hand-trace exporter writes no tracer identity into public course data', () => {
        // The course files ship publicly: the exporter must not read the
        // tracer's authorUid (so it cannot copy it into a source block), and
        // no shipped course file may carry a uid or an email address.
        const exporter = readFileSync(resolve(process.cwd(), 'scripts/export-hand-traces.mjs'), 'utf8');
        expect(exporter).not.toMatch(/authorUid\s*[:,}]|\.authorUid|_authorUid/);
        expect(exporter).toMatch(/provider:\s*'hand-trace'/);
        // ...and what it writes goes through stripIdentity, which also cleans
        // legacy ids an older export left on holes this run does not touch.
        expect(exporter).toMatch(/writeFileSync\(tracedPath,\s*JSON\.stringify\(stripIdentity\(out\)\)\)/);
        const legacy = {
            source: { provider: 'hand-trace', tracedAt: '2026-01-01' },
            holes: {
                1: { features: { source: { provider: 'hand-trace', authorUid: 'u1', imagery: 'a.jpg' },
                    features: [{ properties: { golf: 'green', source: { provider: 'hand-trace', authorUid: 'u1' } } }] } },
                2: { par: 4, uid: 'u2', email: 'x@example.com', userId: 'u3' },
            },
        };
        const clean = stripIdentity(JSON.parse(JSON.stringify(legacy)));
        expect(JSON.stringify(clean)).not.toMatch(/authorUid|"uid"|userId|email/);
        expect(clean.holes[1].features.source).toEqual({ provider: 'hand-trace', imagery: 'a.jpg' });
        expect(clean.holes[1].features.features[0].properties).toEqual({ golf: 'green', source: { provider: 'hand-trace' } });
        expect(clean.holes[2]).toEqual({ par: 4 });
        expect(clean.source).toEqual(legacy.source);
        const dir = resolve(process.cwd(), 'public/courses');
        const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
        expect(files.length).toBeGreaterThan(0);
        for (const f of files) {
            const text = readFileSync(resolve(dir, f), 'utf8');
            expect(text, f).not.toMatch(/"(authorUid|uid|userId|email)"\s*:/i);
            expect(text, f).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
        }
    });

    it('emits closed [lon, lat] rings with the kind as golf property', () => {
        const m = createMapperModel();
        for (const xy of [[0, 0], [10, 0], [10, 10]]) mapperAdd(m, 'green', xy);
        mapperClose(m, 'green');
        const fc = mapperGeoJSON(m, HOLE, { authorUid: 'u1', imageryUrl: '/courses/imagery/keperra-10.jpg' });
        expect(fc.type).toBe('FeatureCollection');
        expect(fc.features).toHaveLength(1);
        const f = fc.features[0];
        expect(f.properties.golf).toBe('green');
        const ring = f.geometry.coordinates[0];
        expect(ring.length).toBe(4);
        expect(ring[0]).toEqual(ring[ring.length - 1]); // closed
        for (const [lon, lat] of ring) {
            expect(lon).toBeGreaterThan(152.9);
            expect(lon).toBeLessThan(153.0);
            expect(lat).toBeGreaterThan(-27.42);
            expect(lat).toBeLessThan(-27.40);
        }
        expect(fc.meta.authorUid).toBe('u1');
    });

    it('firestoreSafe stores the ring as {lon,lat} maps on geometry.ring', () => {
        const m = createMapperModel();
        for (const xy of [[0, 0], [10, 0], [10, 10]]) mapperAdd(m, 'green', xy);
        mapperClose(m, 'green');
        const fc = mapperGeoJSON(m, HOLE, {}, { firestoreSafe: true });
        const f = fc.features[0];
        // Firestore forbids arrays nested in arrays: no array may directly
        // contain another array anywhere in the payload.
        const raw = JSON.stringify(f.geometry);
        expect(raw).not.toContain('[[[');
        const ringArr = f.geometry.ring;
        expect(Array.isArray(ringArr)).toBe(true);
        expect(ringArr).toHaveLength(4); // 3 vertices + closure
        expect(ringArr[0]).toEqual(ringArr[ringArr.length - 1]);
        for (const p of ringArr) {
            expect(typeof p.lon).toBe('number');
            expect(typeof p.lat).toBe('number');
        }
        // The default shape stays real GeoJSON.
        const geo = mapperGeoJSON(m, HOLE, {});
        expect(geo.features[0].geometry.coordinates[0]).toHaveLength(4);
        expect(geo.features[0].geometry.coordinates[0][0]).toEqual(geo.features[0].geometry.coordinates[0][3]);
    });
});
