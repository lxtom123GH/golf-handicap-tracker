import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { isVideoPathOwnedByUid } = require('../../functions/lib/video-security.js');

describe('video Storage path ownership', () => {
    it('accepts a direct child in the owner prefix', () => {
        expect(isVideoPathOwnedByUid('videos/alice/swing.mp4', 'alice')).toBe(true);
    });

    it('rejects a path in another user\'s prefix', () => {
        expect(isVideoPathOwnedByUid('videos/bob/swing.mp4', 'alice')).toBe(false);
    });

    it('rejects nested paths and malformed values', () => {
        expect(isVideoPathOwnedByUid('videos/alice/nested/swing.mp4', 'alice')).toBe(false);
        expect(isVideoPathOwnedByUid('videos/alice/', 'alice')).toBe(false);
        expect(isVideoPathOwnedByUid(null, 'alice')).toBe(false);
        expect(isVideoPathOwnedByUid('videos/alice/swing.mp4', '')).toBe(false);
    });
});
