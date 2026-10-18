// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const css = readFileSync('src/style.css', 'utf8');
const tokens = {
    '--space-8': '8px', '--space-10': '10px',
    '--radius-8': '8px', '--radius-12': '12px',
    '--text-085': '0.85rem', '--text-090': '0.9rem', '--text-100': '1rem',
};
describe('exact-value visual tokens', () => {
    for (const [name, value] of Object.entries(tokens)) {
        it(`${name} preserves its documented value without local overrides`, () => {
            const definitions = [...css.matchAll(new RegExp(`${name}\\s*:\\s*([^;]+);`, 'g'))];
            expect(definitions.map(match => match[1].trim())).toEqual([value]);
            expect(css).toContain(`var(${name})`);
            expect(css.indexOf(`${name}:`)).toBeGreaterThan(css.indexOf(':root {'));
            expect(css.indexOf(`${name}:`)).toBeLessThan(css.indexOf('}', css.indexOf(':root {')));
        });
    }
});
