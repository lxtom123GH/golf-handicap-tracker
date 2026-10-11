/**
 * intent-render.js — S2 Part B: per-club intent vs execution panel.
 * (brief: docs/agent-briefs/overlay-followons/S2-intent-vs-execution.md)
 *
 * Read-only view: normalise the shots of the selected club so the intended
 * line starts at (0,0) pointing up, draw intended (faint blue) + actual
 * (orange), the mean finish dot, the 1-sd dashed ellipse, 50 m ticks, and
 * the one-sentence verdict with the planned/executed count table.
 */

import { summariseClub, normaliseToIntent, MIN_SHOTS_FOR_PATTERN } from '../intent-analysis.js';
import { splinePath } from '../hole-overlay.js';

function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
}

function selectEl(container, clubs, current) {
    const wrap = el('div');
    const label = el('label', 'form-label', 'Club');
    label.style.marginRight = '8px';
    const sel = document.createElement('select');
    sel.className = 'form-select';
    sel.style.maxWidth = '160px';
    for (const c of clubs) {
        const o = document.createElement('option');
        o.value = c; o.textContent = c;
        sel.appendChild(o);
    }
    sel.value = current;
    wrap.appendChild(label);
    wrap.appendChild(sel);
    container.appendChild(wrap);
    return sel;
}

function toPxPair(p, s) { return [p[0] * s, p[1] * s]; }

function drawPanel(canvas, summary, norms) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 300;
    const cssH = 260;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, cssW, cssH);

    // Scale: fit the longest extent (intended chord ≈ carry) with a margin.
    let maxExtent = 10;
    for (const n of norms) {
        for (const curve of [n.intended, n.actual]) {
            for (const [x, y] of curve) maxExtent = Math.max(maxExtent, Math.abs(x), Math.abs(y));
        }
        const f = summary.finish;
        if (f.meanLongM) maxExtent = Math.max(maxExtent, Math.abs(f.meanLongM));
    }
    const pad = 30;
    const s = Math.min((cssW / 2 - pad) / maxExtent, (cssH - 2 * pad) / maxExtent);
    // Normalised frame: x right, y toward the hole → canvas y grows downward,
    // so y maps to (cssH - pad - y*s); x maps to (cssW/2 + x*s).
    const mapPt = (p) => [cssW / 2 + p[0] * s, cssH - pad - p[1] * s];

    // 50 m ticks on the left edge.
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px Outfit, sans-serif';
    ctx.textAlign = 'left';
    for (let m = 50; m <= maxExtent; m += 50) {
        const [, ty] = mapPt([0, m]);
        ctx.fillRect(cssW / 2 - 4, ty - 0.5, 8, 1);
        ctx.fillText(`${m} m`, 4, ty + 3);
    }

    // Intended: faint blue. Actual: orange.
    for (const n of norms) {
        ctx.strokeStyle = 'rgba(37,99,235,0.20)';
        ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        splinePath(ctx, n.intended.map(mapPt));
        ctx.stroke();
    }
    for (const n of norms) {
        ctx.strokeStyle = 'rgba(249,115,22,0.35)';
        ctx.lineWidth = 2.5;
        splinePath(ctx, n.actual.map(mapPt));
        ctx.stroke();
    }

    // Mean finish + 1-sd ellipse (dashed).
    const f = summary.finish;
    if (f.meanLongM !== null) {
        const [cx, cy] = mapPt([f.meanRightM, f.meanLongM]);
        ctx.fillStyle = '#f97316';
        ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
        if (f.sdRightM !== null && f.sdLongM !== null && (f.sdRightM > 0.1 || f.sdLongM > 0.1)) {
            ctx.strokeStyle = 'rgba(249,115,22,0.8)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.ellipse(cx, cy, Math.max(f.sdRightM * s, 2), Math.max(f.sdLongM * s, 2), 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }
}

function countRow(label, counts) {
    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(counts)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${k} ${Math.round(n / total * 100)}%`)
        .join(' · ') || `${label}: —`;
}

/**
 * Mount the panel into `container` (a card body). Re-renders on club change.
 */
export function renderIntentPanel(container, shots) {
    container.innerHTML = '';
    container.appendChild(el('p', 'hint', 'What you planned vs what you did — both lines per shot.'));

    const byClub = new Map();
    for (const s of shots || []) {
        if (!s || !s.club) continue;
        if (!byClub.has(s.club)) byClub.set(s.club, []);
        byClub.get(s.club).push(s);
    }
    const clubs = [...byClub.keys()].sort();

    const sentence = el('p', 'intent-sentence', '');
    const canvas = document.createElement('canvas');
    canvas.className = 'intent-canvas'; // sizing lives in style.css (no inline style, Sydney D-02)
    const table = el('div', 'intent-table hint', '');

    if (!clubs.length) {
        sentence.textContent = 'Log shots with both lines to see your pattern.';
        container.appendChild(sentence);
        container.appendChild(table);
        return;
    }

    const render = (club) => {
        const clubShots = byClub.get(club) || [];
        const summary = summariseClub(clubShots);
        sentence.textContent = summary.sentence;
        const norms = clubShots.map(normaliseToIntent).filter(Boolean);
        drawPanel(canvas, summary, norms);
        table.innerHTML = '';
        table.appendChild(el('div', '', `Planned — ${countRow('planned', summary.planned.startLine)} · shapes: ${countRow('shape', summary.planned.shape)}`));
        table.appendChild(el('div', '', `Executed — ${countRow('executed', summary.executed.startLine)} · shapes: ${countRow('shape', summary.executed.shape)}`));
        if (summary.n < MIN_SHOTS_FOR_PATTERN) {
            table.appendChild(el('div', 'hint', `${summary.n} of ${MIN_SHOTS_FOR_PATTERN} shots logged for ${club}.`));
        }
    };

    const sel = selectEl(container, clubs, clubs[0]);
    container.appendChild(canvas);
    container.appendChild(sentence);
    container.appendChild(table);
    sel.addEventListener('change', () => render(sel.value));
    render(clubs[0]);
}
