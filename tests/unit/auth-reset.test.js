/**
 * P-229 unit cover for the two behaviours the Auth emulator cannot show:
 * the message we print on a 200 (prod has email enumeration protection on, so
 * a 200 does not mean an email went out), and the fallback when the hosting
 * origin is not an authorized domain and Firebase rejects the continue URL.
 */
import { vi } from 'vitest';

const sendPasswordResetEmail = vi.fn();
vi.mock('firebase/auth', () => ({ sendPasswordResetEmail: (...a) => sendPasswordResetEmail(...a) }));

const { requestPasswordReset, resetContinueUrl } = await import('../../src/auth-reset.js');

const auth = { name: 'stub' };

beforeEach(() => {
    sendPasswordResetEmail.mockReset();
});

describe('resetContinueUrl', () => {
    it('points at the app root', () => {
        expect(resetContinueUrl('https://golf-handicap-tracker-b677c.web.app'))
            .toBe('https://golf-handicap-tracker-b677c.web.app/');
        expect(resetContinueUrl('http://localhost:5173/')).toBe('http://localhost:5173/');
    });

    it('is undefined when there is no usable origin', () => {
        expect(resetContinueUrl('')).toBeUndefined();
        expect(resetContinueUrl('null')).toBeUndefined();  // file:// origin
    });
});

describe('requestPasswordReset', () => {
    it('does not claim an email was sent, because a 200 does not mean that', async () => {
        sendPasswordResetEmail.mockResolvedValue(undefined);
        const result = await requestPasswordReset(auth, 'owner@example.com', {});
        expect(result.ok).toBe(true);
        expect(result.message).toContain('If an account exists for owner@example.com');
        expect(result.message).toContain('spam');
        expect(result.message).not.toMatch(/Reset email sent/i);
    });

    it('trims the typed address', async () => {
        sendPasswordResetEmail.mockResolvedValue(undefined);
        await requestPasswordReset(auth, '  owner@example.com \n', {});
        expect(sendPasswordResetEmail).toHaveBeenCalledWith(auth, 'owner@example.com');
    });

    it('retries without the continue URL when the origin is not an authorized domain', async () => {
        sendPasswordResetEmail
            .mockRejectedValueOnce(Object.assign(new Error('unauthorized'), { code: 'auth/unauthorized-continue-uri' }))
            .mockResolvedValueOnce(undefined);

        const result = await requestPasswordReset(auth, 'owner@example.com', { continueUrl: 'https://preview.example/' });

        expect(result.ok).toBe(true);
        expect(result.usedContinueUrl).toBe(false);
        expect(sendPasswordResetEmail).toHaveBeenCalledTimes(2);
        expect(sendPasswordResetEmail).toHaveBeenLastCalledWith(auth, 'owner@example.com');
    });

    it('surfaces a real failure instead of swallowing it', async () => {
        sendPasswordResetEmail.mockRejectedValue(
            Object.assign(new Error('Too many requests'), { code: 'auth/too-many-requests' })
        );
        const result = await requestPasswordReset(auth, 'owner@example.com', { continueUrl: 'https://x.example/' });
        expect(result.ok).toBe(false);
        expect(result.code).toBe('auth/too-many-requests');
        expect(result.message).toContain('Too many requests');
        expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);  // no pointless retry
    });

    it('refuses an empty address without calling Firebase', async () => {
        const result = await requestPasswordReset(auth, '  ', {});
        expect(result.ok).toBe(false);
        expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    });
});
