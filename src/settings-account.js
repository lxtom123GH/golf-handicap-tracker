/**
 * @file settings-account.js
 * @description Settings > Account (simplify 2026-10-07, E34). The card used to
 * be blank (nothing called the old window.refreshSettingsUI) and its "Send
 * Password Reset Email" button had no handler. It now shows the golfer's name
 * and email, names the role only for Coach/Admin, never shows the Firebase uid,
 * and the button sends the same reset the login screen's "Forgot password"
 * sends (src/auth-reset.js).
 */

import { requestPasswordReset, resetContinueUrl } from './auth-reset.js';

/**
 * Fill the Account card. Text only (textContent), so a display name can't
 * inject markup.
 * @param {HTMLElement|null} container  #settings-account-info
 * @param {{displayName?: string, email?: string, isAdmin?: boolean, isCoach?: boolean}} who
 */
export function renderAccountInfo(container, who) {
    if (!container) return;
    container.replaceChildren();
    const rows = [
        ['Name', (who && who.displayName) || '—'],
        ['Email', (who && who.email) || '—'],
    ];
    if (who && who.isAdmin) rows.push(['Role', 'Admin']);
    else if (who && who.isCoach) rows.push(['Role', 'Coach']);
    for (const [label, value] of rows) {
        const p = document.createElement('p');
        p.className = 'settings-account-row';
        const strong = document.createElement('strong');
        strong.textContent = label + ': ';
        p.append(strong, document.createTextNode(value));
        container.appendChild(p);
    }
}

/**
 * Does this account sign in with a password? A Google-only account has none,
 * so "Send Password Reset Email" would only confuse (review P3, PR #241).
 * Unknown provider data counts as password, the default sign-up path.
 * @param {{providerData?: Array<{providerId?: string}>}|null} user
 */
export function hasPasswordSignIn(user) {
    const providers = user && user.providerData;
    if (!Array.isArray(providers) || providers.length === 0) return true;
    return providers.some(p => p && p.providerId === 'password');
}

/**
 * Show the reset button only for accounts that have a password.
 * @param {HTMLElement|null} button
 * @param {object|null} user
 */
export function syncPasswordResetButton(button, user) {
    if (button) button.classList.toggle('hidden', !hasPasswordSignIn(user));
}

/**
 * Wire "Send Password Reset Email" once. It sends to the signed-in email.
 * @param {{button: HTMLButtonElement|null, msg: HTMLElement|null, auth: object,
 *          request?: typeof requestPasswordReset, origin?: string}} opts
 */
export function bindSettingsPasswordReset({ button, msg, auth, request = requestPasswordReset, origin }) {
    if (!button || !msg || button.dataset.bound === '1') return;
    button.dataset.bound = '1';
    button.addEventListener('click', async () => {
        const email = auth && auth.currentUser && auth.currentUser.email;
        button.disabled = true;
        msg.classList.remove('hidden', 'settings-pw-ok', 'settings-pw-err');
        msg.textContent = 'Sending…';
        try {
            const result = email
                ? await request(auth, email, { continueUrl: resetContinueUrl(origin) })
                : { ok: false, message: 'No email on this account.' };
            // A different golfer signed in while this was in flight: don't
            // show them the last golfer's address (review P3, PR #241).
            if ((auth && auth.currentUser && auth.currentUser.email) !== email) {
                msg.textContent = '';
                msg.classList.add('hidden');
                return;
            }
            msg.textContent = result.message;
            msg.classList.add(result.ok ? 'settings-pw-ok' : 'settings-pw-err');
        } catch (e) {
            msg.textContent = '❌ ' + ((e && e.message) || String(e));
            msg.classList.add('settings-pw-err');
        } finally {
            button.disabled = false;
        }
    });
}
