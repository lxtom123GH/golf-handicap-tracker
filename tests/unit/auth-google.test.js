/**
 * P-247 unit cover (no emulator, no Firebase): the popup/redirect choice, the
 * installed-PWA detection, and the plain-language messages - the parts the
 * Auth emulator cannot exercise. The sign-in itself is covered in
 * tests/auth/google-signin.test.js.
 */
import {
    chooseGoogleSignInMode, isStandaloneDisplay, isMobileUserAgent,
    googleSignInMessage, providerIds
} from '../../src/auth-google.js';

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

describe('chooseGoogleSignInMode', () => {
    it('redirects only when installed as a PWA', () => {
        expect(chooseGoogleSignInMode({ standalone: true, userAgent: IPHONE_UA })).toBe('redirect');
        expect(chooseGoogleSignInMode({ standalone: true, userAgent: DESKTOP_UA })).toBe('redirect');
    });

    it('uses the popup in a browser tab, phone or desktop (auth-google.js header says why)', () => {
        expect(chooseGoogleSignInMode({ standalone: false, userAgent: IPHONE_UA })).toBe('popup');
        expect(chooseGoogleSignInMode({ standalone: false, userAgent: ANDROID_UA })).toBe('popup');
        expect(chooseGoogleSignInMode({ standalone: false, userAgent: DESKTOP_UA })).toBe('popup');
        expect(chooseGoogleSignInMode()).toBe('popup');
    });
});

describe('isStandaloneDisplay', () => {
    it('reads iOS navigator.standalone', () => {
        expect(isStandaloneDisplay({ navigator: { standalone: true } })).toBe(true);
        expect(isStandaloneDisplay({ navigator: { standalone: false }, matchMedia: () => ({ matches: false }) })).toBe(false);
    });

    it('reads the display-mode media query elsewhere', () => {
        const win = { navigator: {}, matchMedia: q => ({ matches: q === '(display-mode: standalone)' }) };
        expect(isStandaloneDisplay(win)).toBe(true);
    });

    it('is false with no window or a throwing matchMedia', () => {
        expect(isStandaloneDisplay(undefined)).toBe(false);
        expect(isStandaloneDisplay({ navigator: {}, matchMedia: () => { throw new Error('no'); } })).toBe(false);
    });
});

describe('isMobileUserAgent', () => {
    it('spots phones and not desktops', () => {
        expect(isMobileUserAgent(IPHONE_UA)).toBe(true);
        expect(isMobileUserAgent(ANDROID_UA)).toBe(true);
        expect(isMobileUserAgent(DESKTOP_UA)).toBe(false);
        expect(isMobileUserAgent('')).toBe(false);
    });
});

describe('googleSignInMessage', () => {
    it('says Google is not switched on yet, and that email+password still works', () => {
        const msg = googleSignInMessage('auth/operation-not-allowed');
        expect(msg).toMatch(/not switched on/i);
        expect(msg).toMatch(/email and password still work/i);
    });

    it('every message offers email+password or a retry - never a dead end', () => {
        for (const code of [
            'auth/operation-not-allowed', 'auth/account-exists-with-different-credential',
            'auth/popup-blocked', 'auth/popup-closed-by-user', 'auth/cancelled-popup-request',
            'auth/unauthorized-domain', 'auth/network-request-failed', 'auth/redirect-did-not-return',
            'auth/credential-already-in-use', 'auth/some-code-we-never-saw', undefined
        ]) {
            expect(googleSignInMessage(code)).toMatch(/email and password|try again/i);
        }
    });
});

describe('providerIds', () => {
    it('lists the provider ids on a user, empty when there is none', () => {
        expect(providerIds({ providerData: [{ providerId: 'password' }, { providerId: 'google.com' }] }))
            .toEqual(['password', 'google.com']);
        expect(providerIds(null)).toEqual([]);
    });
});
