/**
 * Simplify 2026-10-07 E34: Settings > Account shows who you are and its
 * password button works. Runs the real module over the shipped markup, and
 * checks auth-v2 actually calls it (the old renderer was never called).
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('firebase/auth', () => ({ sendPasswordResetEmail: vi.fn() }));

const repo = resolve(import.meta.dirname, '../..');
const html = readFileSync(resolve(repo, 'index.html'), 'utf8');
const { renderAccountInfo, bindSettingsPasswordReset, hasPasswordSignIn, syncPasswordResetButton } = await import('../../src/settings-account.js');

// Parse the 200 KB index.html once, at load: per-test parsing timed out
// under a loaded runner.
const settingsHtml = new DOMParser().parseFromString(html, 'text/html').getElementById('tab-settings').outerHTML;

function card() {
    document.body.innerHTML = settingsHtml;
    return {
        info: document.getElementById('settings-account-info'),
        button: document.getElementById('btn-change-password'),
        msg: document.getElementById('settings-pw-msg'),
    };
}

describe('Settings > Account card', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('shows name and email, no uid, and no role for an ordinary player', () => {
        const { info } = card();
        renderAccountInfo(info, { displayName: 'Pat <b>', email: 'pat@example.com', uid: 'abc123' });
        const text = info.textContent;
        expect(text).toContain('Name: Pat <b>');
        expect(text).toContain('Email: pat@example.com');
        expect(text).not.toContain('abc123');
        expect(text).not.toMatch(/Role/);
        expect(info.querySelector('b')).toBeNull();
    });

    it('names the role only for a coach or an admin', () => {
        const { info } = card();
        renderAccountInfo(info, { displayName: 'C', email: 'c@x', isCoach: true });
        expect(info.textContent).toContain('Role: Coach');
        renderAccountInfo(info, { displayName: 'A', email: 'a@x', isAdmin: true, isCoach: true });
        expect(info.textContent).toContain('Role: Admin');
        expect(info.textContent).not.toContain('Coach');
    });

    it('the reset button sends to the signed-in email and shows the result', async () => {
        const { button, msg } = card();
        const request = vi.fn(async () => ({ ok: true, message: 'link on its way' }));
        const auth = { currentUser: { email: 'alex@example.com' } };
        bindSettingsPasswordReset({ button, msg, auth, request, origin: 'https://app.example' });
        bindSettingsPasswordReset({ button, msg, auth, request, origin: 'https://app.example' });
        button.click();
        expect(button.disabled).toBe(true);
        await vi.waitFor(() => expect(msg.textContent).toBe('link on its way'));
        expect(request).toHaveBeenCalledTimes(1);
        expect(request).toHaveBeenCalledWith(auth, 'alex@example.com', { continueUrl: 'https://app.example/' });
        expect(msg.classList.contains('hidden')).toBe(false);
        expect(button.disabled).toBe(false);
    });

    it('a reset still in flight when the golfer changes shows nothing to the next one', async () => {
        const { button, msg } = card();
        let finish;
        const request = vi.fn(() => new Promise(r => { finish = r; }));
        const auth = { currentUser: { email: 'a@example.com' } };
        bindSettingsPasswordReset({ button, msg, auth, request, origin: 'https://app.example' });
        button.click();
        auth.currentUser = { email: 'b@example.com' };
        finish({ ok: true, message: 'If an account exists for a@example.com …' });
        await vi.waitFor(() => expect(button.disabled).toBe(false));
        expect(msg.textContent).not.toContain('a@example.com');
        expect(msg.classList.contains('hidden')).toBe(true);
    });

    it('hides the reset button for a Google-only account, shows it for a password one', () => {
        const { button } = card();
        expect(hasPasswordSignIn({ providerData: [{ providerId: 'google.com' }] })).toBe(false);
        syncPasswordResetButton(button, { providerData: [{ providerId: 'google.com' }] });
        expect(button.classList.contains('hidden')).toBe(true);
        syncPasswordResetButton(button, { providerData: [{ providerId: 'google.com' }, { providerId: 'password' }] });
        expect(button.classList.contains('hidden')).toBe(false);
        syncPasswordResetButton(button, { providerData: [] });
        expect(button.classList.contains('hidden')).toBe(false);
    });

    it('auth-v2 renders the card and binds the button when a golfer is admitted', () => {
        const src = readFileSync(resolve(repo, 'src/auth-v2.js'), 'utf8');
        expect(src).toMatch(/renderAccountInfo\(/);
        expect(src).toMatch(/bindSettingsPasswordReset\(/);
        expect(src).toMatch(/syncPasswordResetButton\(/);
        // Rendered on the admitted path, right after the user is set (not in
        // the pending branch).
        const admitted = src.indexOf('User approved, hiding overlay');
        const pending = src.indexOf('User not approved');
        const call = src.indexOf('renderAccountInfo(', admitted);
        expect(admitted).toBeGreaterThan(-1);
        expect(call).toBeGreaterThan(admitted);
        expect(call).toBeLessThan(pending);
        const ui = readFileSync(resolve(repo, 'src/ui.js'), 'utf8');
        expect(ui).not.toMatch(/refreshSettingsUI/);
    });
});
