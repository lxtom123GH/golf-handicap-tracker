import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoundId } from '../../src/round-id.js';

describe('createRoundId', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('keeps starts in the same millisecond unique', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-12T00:00:00.000Z'));
        vi.stubGlobal('crypto', {
            randomUUID: vi.fn()
                .mockReturnValueOnce('round-a')
                .mockReturnValueOnce('round-b'),
        });

        const first = createRoundId();
        const second = createRoundId();

        expect(first).toBe('round_1791763200000_round-a');
        expect(second).toBe('round_1791763200000_round-b');
        expect(first).not.toBe(second);
    });
});
