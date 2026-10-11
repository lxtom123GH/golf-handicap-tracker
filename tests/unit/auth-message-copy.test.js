import { describe, it, expect, vi } from 'vitest';
import { authErrorMessage } from '../../src/auth-messages.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const sendPasswordResetEmail = vi.fn();
vi.mock('firebase/auth', () => ({ sendPasswordResetEmail: (...args) => sendPasswordResetEmail(...args) }));
const { requestPasswordReset } = await import('../../src/auth-reset.js');

describe('password reset copy does not expose raw service errors', () => {
    it('keeps the failure and technical code but replaces unsafe details with a next step', async () => {
        sendPasswordResetEmail.mockRejectedValue(Object.assign(new Error('Firebase: internal trace sample-private-marker'), { code: 'auth/internal-error' }));
        const result = await requestPasswordReset({}, 'test-player@example.invalid');
        expect(result.ok).toBe(false);
        expect(result.code).toBe('auth/internal-error');
        expect(result.message).not.toMatch(/Firebase|auth\/|sample-private-marker|internal trace/);
        expect(result.message).toMatch(/try again/i);
    });
});

describe('plain-language authentication guidance', () => {
    it('keeps the registration password requirement available before submission', () => {
        const doc = new JSDOM(readFileSync(path.join(root, 'index.html'), 'utf8')).window.document;
        const input = doc.getElementById('auth-password');
        const hint = doc.getElementById(input.getAttribute('aria-describedby'));
        expect(hint.textContent).toContain(`at least ${input.minLength} characters`);
        expect(hint.closest('.hidden,[hidden]')).toBeNull();
    });

    it.each([
        ['app/missing-display-name', /Enter a display name/],
        ['auth/invalid-email', /Check your email/],
        ['auth/email-already-in-use', /Try signing in/],
        ['auth/weak-password', /at least 6 characters/],
        ['auth/too-many-requests', /Wait a few minutes/],
        ['auth/network-request-failed', /Check your connection/],
        ['auth/user-disabled', /administrator/],
    ])('gives a next step for %s without raw details', (code, nextStep) => {
        const message = authErrorMessage({ code, message: 'sample-private-marker' });
        expect(message).toMatch(nextStep);
        expect(message).not.toContain('sample-private-marker');
        expect(message).not.toContain(code);
    });

    it('does not distinguish a missing account from a wrong password in sign-in copy', () => {
        const codes = ['auth/user-not-found', 'auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-login-credentials'];
        expect(new Set(codes.map(code => authErrorMessage({ code }))).size).toBe(1);
    });

    it.each([undefined, null, 'sample-private-marker', { message: 'sample-private-marker' }, { code: 'unexpected' }])(
        'uses safe actionable copy for an unknown error', error => {
            expect(authErrorMessage(error)).toContain('try again');
            expect(authErrorMessage(error)).not.toMatch(/sample-private-marker|unexpected/);
        }
    );
});
