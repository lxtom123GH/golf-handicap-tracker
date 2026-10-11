// Quick win 1 (simplify review 07 Oct 2026): Logout reloads the page, so a
// second sign-in can't run the app setup twice (a past round saved twice).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { logOutAndReload, needsFreshPage } from '../../src/auth-logout.js';

describe('needsFreshPage (sign-outs that bypass the Logout button)', () => {
    it('is false on first load, before anyone was admitted', () => {
        expect(needsFreshPage(null, null)).toBe(false);
        expect(needsFreshPage(null, 'u1')).toBe(false);
    });
    it('is false for the same golfer again', () => {
        expect(needsFreshPage('u1', 'u1')).toBe(false);
    });
    it('is true when an admitted golfer is signed out (other tab, revoked session)', () => {
        expect(needsFreshPage('u1', null)).toBe(true);
    });
    it('is true when a different golfer replaces the admitted one', () => {
        expect(needsFreshPage('u1', 'u2')).toBe(true);
    });
});

describe('logOutAndReload', () => {
    it('signs out first, then reloads', async () => {
        const calls = [];
        const auth = { name: 'stub' };
        const signOut = vi.fn(async (a) => { calls.push(['signOut', a]); });
        const reload = vi.fn(() => calls.push(['reload']));
        await logOutAndReload(signOut, auth, reload);
        expect(calls).toEqual([['signOut', auth], ['reload']]);
    });

    it('still reloads when sign-out fails', async () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        const reload = vi.fn();
        await logOutAndReload(() => Promise.reject(new Error('offline')), {}, reload);
        expect(reload).toHaveBeenCalledTimes(1);
        err.mockRestore();
    });

    it('still reloads when sign-out throws synchronously', async () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        const reload = vi.fn();
        await logOutAndReload(() => { throw new Error('boom'); }, {}, reload);
        expect(reload).toHaveBeenCalledTimes(1);
        err.mockRestore();
    });
});

describe('both Logout buttons go through logOutAndReload', () => {
    const src = readFileSync(resolve(__dirname, '../../src/auth-v2.js'), 'utf8');

    it('wires #btn-logout and #btn-pending-logout to the reload path', () => {
        expect(src).toMatch(/btnLogout\.addEventListener\('click',\s*\(\)\s*=>\s*logOutAndReload\(signOut,\s*auth\)\)/);
        expect(src).toMatch(/btnPendingLogout\.addEventListener\('click',\s*\(\)\s*=>\s*logOutAndReload\(signOut,\s*auth\)\)/);
    });

    it('the auth gate reloads before any setup when the admitted golfer changes', () => {
        const gate = src.slice(src.indexOf('async function runAuthGate'));
        const check = gate.indexOf('needsFreshPage(admittedUid');
        expect(check).toBeGreaterThan(-1);
        expect(check).toBeLessThan(gate.indexOf('if (user) {'));
    });

    it('has no bare signOut(auth) click handler left', () => {
        expect(src).not.toMatch(/=>\s*signOut\(auth\)/);
    });
});
