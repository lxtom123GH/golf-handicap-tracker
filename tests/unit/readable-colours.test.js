import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const css = readFileSync('src/style.css', 'utf8');
const rgb = hex => [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
function luminance(channels) {
    return channels.map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
        .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
}

test.each(['coach', 'admin', 'feed'])('%s header gradient supports normal-size white text', role => {
    const section = html.split(`id="tab-${role}"`)[1];
    const header = section.split('</header>')[0];
    const gradient = header.match(/linear-gradient\([^)]*\)/)[0];
    const colours = [...gradient.matchAll(/#([\da-f]{6})/gi)].map(m => rgb(m[1]));
    expect(colours).toHaveLength(2);
    // The component-wise brightest bound is conservative across all stops,
    // including mixed-channel gradients. It does not waive axe incompletes.
    const brightest = [0, 1, 2].map(i => Math.max(...colours.map(c => c[i])));
    expect(1.05 / (luminance(brightest) + 0.05)).toBeGreaterThanOrEqual(4.5);
});

test.each(['success-readable', 'danger'])('%s solid action token supports AAA white text', name => {
    const hex = css.match(new RegExp(`--${name}: #([\\da-f]{6})`))[1];
    expect(1.05 / (luminance(rgb(hex)) + 0.05)).toBeGreaterThanOrEqual(7);
});

test('muted text is readable without fading excluded WHS rows', () => {
    const hex = css.match(/--text-muted: #([\da-f]{6})/)[1];
    expect(1.05 / (luminance(rgb(hex)) + 0.05)).toBeGreaterThanOrEqual(7);
    const row = css.match(/\.whs-record-table tr\.round-not-counting > td:not\(\.col-action\)\s*\{([^}]+)\}/)[1];
    expect(row).not.toMatch(/opacity\s*:/);
    expect(row).toContain('text-decoration: line-through');
});
