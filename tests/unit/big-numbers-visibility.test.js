import { it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

// PR #220 review F9: the big-numbers openers live inside #oncourse-hub, which
// ships hidden and is only revealed together with body.round-active.
const html = new DOMParser().parseFromString(readFileSync('index.html', 'utf8'), 'text/html');

it('both openers sit inside the On Course hub, which starts hidden', () => {
    const hub = html.getElementById('oncourse-hub');
    expect(hub.classList.contains('hidden')).toBe(true);
    for (const id of ['btn-big-numbers', 'oc-gps-widget']) {
        expect(hub.contains(html.getElementById(id))).toBe(true);
    }
});

it('every place that reveals the hub starts a round (adds body.round-active) first', () => {
    const files = ['src', 'src/modules'].flatMap(dir => readdirSync(dir)
        .filter(name => name.endsWith('.js')).map(name => `${dir}/${name}`));
    const reveals = [];
    for (const file of files) {
        const lines = readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, i) => {
            if (/(\bhub\w*|getElementById\('oncourse-hub'\))\??\.classList\.remove\('hidden'\)/.test(line)) {
                reveals.push({ file, line: i + 1, roundActive: lines.slice(Math.max(0, i - 8), i)
                    .some(prev => prev.includes("classList.add('round-active')")) });
            }
        });
    }
    expect(reveals.length).toBeGreaterThan(0);
    expect(reveals.filter(r => !r.roundActive)).toEqual([]);
});
