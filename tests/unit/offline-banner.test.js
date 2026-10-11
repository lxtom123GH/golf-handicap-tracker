import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

it('keeps the offline status announcement from intercepting round controls', () => {
    document.body.innerHTML = readFileSync('index.html', 'utf8');
    const banner = document.getElementById('offline-banner');
    banner.classList.remove('hidden');
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.getAttribute('style')).toMatch(/(?:^|;)\s*pointer-events\s*:\s*none\s*(?:;|$)/);
});
