import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shotEntryVisibility } from '../../src/shot-entry.js';

beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
});

afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
});

describe('shot-entry device preference at boot', () => {
    it('opens Map first without writing a preference on a fresh device', async () => {
        const { AppState } = await import('../../src/state.js');
        expect(AppState.shotEntry).toBe('map');
        expect(localStorage.getItem('golf.shotEntry')).toBeNull();
    });

    it.each(['both', 'draw', 'buttons', 'map'])('preserves the saved %s choice', async (pref) => {
        localStorage.setItem('golf.shotEntry', pref);
        const { AppState } = await import('../../src/state.js');
        expect(AppState.shotEntry).toBe(pref);
        expect(localStorage.getItem('golf.shotEntry')).toBe(pref);
    });

    it('uses Map first when storage cannot be read', async () => {
        const read = vi.spyOn(Object.getPrototypeOf(localStorage), 'getItem').mockImplementation(() => {
            throw new DOMException('Storage unavailable', 'SecurityError');
        });
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { AppState } = await import('../../src/state.js');
        expect(read).toHaveBeenCalledWith('golf.shotEntry');
        expect(AppState.shotEntry).toBe('map');
    });

    it('renders Map first for an invalid saved choice without overwriting storage', async () => {
        localStorage.setItem('golf.shotEntry', 'invalid');
        const { AppState } = await import('../../src/state.js');
        expect(shotEntryVisibility(AppState.shotEntry).mapFirst).toBe(true);
        expect(localStorage.getItem('golf.shotEntry')).toBe('invalid');
    });
});
