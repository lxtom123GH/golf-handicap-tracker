#!/usr/bin/env node
// ==========================================
// scripts/merge-traced-holes.mjs — the human merge step for traced holes
// ==========================================
//
//   node scripts/merge-traced-holes.mjs public/courses/keperra.traced.json \
//        --into public/courses/keperra.json --kinds green,bunker --holes 10,15,24
//
// Copies the chosen feature kinds for the chosen holes from a traced file
// into the course file the app serves, replacing any existing features of
// those kinds on that hole. Never touches tee, green points, line or
// bearing in the target (those stay authoritative), and only merges into
// holes that already exist there unless --allow-new is given. Records
// per-feature provenance so the wizard's attribution line can say where a
// polygon came from.

import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const src = args[0];
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const into = opt('--into');
const kinds = new Set((opt('--kinds', 'green')).split(',').map(s => s.trim()).filter(Boolean));
const holesArg = opt('--holes', '');
const only = holesArg ? new Set(holesArg.split(',').map(Number)) : null;
const allowNew = args.includes('--allow-new');
if (!src || !into) { console.error('usage: merge-traced-holes.mjs <traced.json> --into <course.json> [--kinds green,bunker] [--holes 10,15] [--allow-new]'); process.exit(2); }

const traced = JSON.parse(readFileSync(src, 'utf8'));
const course = JSON.parse(readFileSync(into, 'utf8'));
course.holes ||= {};
const report = [];
for (const [k, th] of Object.entries(traced.holes || {})) {
    const n = Number(k);
    if (only && !only.has(n)) continue;
    let ch = course.holes[n];
    if (!ch) {
        if (!allowNew) { report.push(`hole ${n}: not in target, skipped (use --allow-new to copy the whole hole)`); continue; }
        ch = course.holes[n] = { ...th, features: { type: 'FeatureCollection', features: [] } };
    }
    // `fairwayLine` is a hole-level field (brief §7b.2), merged by name like a kind.
    let copiedLine = false;
    if (kinds.has('fairwayLine') && Array.isArray(th.fairwayLine) && th.fairwayLine.length >= 3) {
        ch.fairwayLine = th.fairwayLine.map(p => ({ lat: p.lat, lon: p.lon, widthM: Number(p.widthM) || 35 }));
        copiedLine = true;
    }
    const incoming = (th.features?.features || []).filter(f => kinds.has(f.properties?.golf));
    if (!incoming.length && !copiedLine) { report.push(`hole ${n}: no ${[...kinds].join('/')} in the traced file, skipped`); continue; }
    if (!incoming.length) { report.push(`hole ${n}: fairwayLine copied (${ch.fairwayLine.length} pts)`); ch.featuresSource = { ...(ch.featuresSource || {}), traced: { provider: traced.source?.provider, licence: traced.source?.licence, attribution: traced.source?.attribution, kinds: [...kinds], mergedAt: new Date().toISOString().slice(0, 10) } }; continue; }
    ch.features ||= { type: 'FeatureCollection', features: [] };
    const before = (ch.features.features || []).length;
    const kept = (ch.features.features || []).filter(f => !kinds.has(f.properties?.golf));
    const replaced = before - kept.length;
    const stamped = incoming.map(f => ({
        ...f,
        properties: {
            ...f.properties,
            source: th.features?.source?.provider || traced.source?.provider || 'traced',
            model: th.features?.source?.model || traced.source?.model || undefined,
            tracedAt: traced.source?.tracedAt,
        },
    }));
    ch.features.features = [...kept, ...stamped];
    ch.featuresSource = { ...(ch.featuresSource || {}), traced: { provider: traced.source?.provider, licence: traced.source?.licence, attribution: traced.source?.attribution, kinds: [...kinds], mergedAt: new Date().toISOString().slice(0, 10) } };
    report.push(`hole ${n}: +${stamped.length} ${[...kinds].join('/')} (replaced ${replaced} existing)`);
}
course.attributions = Array.from(new Set([...(course.attributions || []), course.source?.attribution, traced.source?.attribution].filter(Boolean)));
writeFileSync(into, JSON.stringify(course));
console.log(report.join('\n'));
console.log(`wrote ${into} (${Math.round(JSON.stringify(course).length / 1024)} KB)`);
