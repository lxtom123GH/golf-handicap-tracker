import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../../src/escape';

describe('escapeHtml (BL-4.17)', () => {
    it('handles nullish values safely', () => {
        expect(escapeHtml(null)).toBe('');
        expect(escapeHtml(undefined)).toBe('');
    });

    it('neutralises executable markup and XSS payloads', () => {
        const payload = '<img src=x onerror=alert(1)>';
        const escaped = escapeHtml(payload);
        expect(escaped).not.toContain('<');
        expect(escaped).not.toContain('>');
        expect(escaped).toBe('&lt;img src=x onerror=alert(1)&gt;');
    });

    it('escapes quotes and ampersands for safe attribute interpolation', () => {
        const payload = 'Tom & Jerry "The Mouse" \'007\'';
        const escaped = escapeHtml(payload);
        expect(escaped).not.toContain('& ');
        expect(escaped).not.toContain('"');
        expect(escaped).not.toContain("'");
        expect(escaped).toBe('Tom &amp; Jerry &quot;The Mouse&quot; &#39;007&#39;');
    });

    it('converts numbers and booleans to string gracefully', () => {
        expect(escapeHtml(123)).toBe('123');
        expect(escapeHtml(true)).toBe('true');
    });
});
