import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as authApproval from '../../src/auth-approval.js';

const {
    canAutoApproveInvite, pendingAuthState, promoteVerifiedInvite,
    registerPasswordAccount, refreshEmailVerification
} = authApproval;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('verified invite approval policy', () => {
    it.each([
        ['unverified password account', { emailVerified: false }, true, false],
        ['verified password account', { emailVerified: true }, true, true],
        ['verified Google account', { emailVerified: true, providerId: 'google.com' }, true, true],
        ['verified account without an invite', { emailVerified: true }, false, false],
        ['missing user', null, true, false],
    ])('%s', (_label, user, invited, expected) => {
        expect(canAutoApproveInvite(user, invited)).toBe(expected);
    });

    it('gives an unverified account a clear inbox step and a verified non-invite the admin-pending state', () => {
        expect(pendingAuthState({ emailVerified: false })).toMatchObject({
            needsEmailVerification: true,
            title: expect.stringMatching(/check your inbox/i),
            message: expect.stringMatching(/finish joining/i),
        });
        expect(pendingAuthState({ emailVerified: true })).toMatchObject({
            needsEmailVerification: false,
            title: 'Account Pending',
            message: expect.stringMatching(/admin approval/i),
        });
    });

    it('promotes an invited account only after refreshing its verified token', async () => {
        const user = { email: 'Player@Example.org', emailVerified: true };
        const userData = { isApproved: false, email: user.email };
        const order = [];
        const result = await promoteVerifiedInvite(user, userData, {
            refreshToken: vi.fn(async (_target, force) => { order.push(`token:${force}`); }),
            getInvite: vi.fn(async email => { order.push(`invite:${email}`); return true; }),
            approve: vi.fn(async () => { order.push('approve'); }),
        });
        expect(result.isApproved).toBe(true);
        expect(order).toEqual(['token:true', 'invite:player@example.org', 'approve']);
    });

    it('does not query or promote an unverified invitee', async () => {
        const user = { email: 'player@example.org', emailVerified: false };
        const userData = { isApproved: false };
        const refreshToken = vi.fn();
        const getInvite = vi.fn();
        const approve = vi.fn();
        await expect(promoteVerifiedInvite(user, userData, { refreshToken, getInvite, approve }))
            .resolves.toBe(userData);
        expect(refreshToken).not.toHaveBeenCalled();
        expect(getInvite).not.toHaveBeenCalled();
        expect(approve).not.toHaveBeenCalled();
    });

    it('does not read the invite list until signup email verification', async () => {
        const getInvite = vi.fn(async () => true);
        const approved = await authApproval.canApproveFromInviteLookup(
            { emailVerified: false }, 'Player@Example.org', getInvite
        );

        expect(approved).toBe(false);
        expect(getInvite).not.toHaveBeenCalled();
    });

    it('uses a normalized invite lookup for an already verified signup', async () => {
        const getInvite = vi.fn(async () => true);
        const approved = await authApproval.canApproveFromInviteLookup(
            { emailVerified: true }, 'Player@Example.org', getInvite
        );

        expect(approved).toBe(true);
        expect(getInvite).toHaveBeenCalledExactlyOnceWith('player@example.org');
    });
});

describe('password registration verification workflow', () => {
    it('writes a pending password account, then asks Firebase to send verification email', async () => {
        const user = { uid: 'synthetic-user', email: 'player@example.org', emailVerified: false };
        const order = [];
        const result = await registerPasswordAccount({
            auth: { name: 'synthetic-auth' }, email: user.email, password: 'safe-test-password',
            displayName: 'Player',
            createAccount: vi.fn(async () => { order.push('create'); return { user }; }),
            updateProfile: vi.fn(async () => { order.push('profile'); }),
            createUserDoc: vi.fn(async (_user, fields) => {
                order.push('user-doc');
                expect(fields).toEqual({ displayName: 'Player', email: user.email, authProvider: 'password' });
            }),
            sendVerification: vi.fn(async () => { order.push('verification-email'); }),
        });
        expect(result).toBe(user);
        expect(order).toEqual(['create', 'profile', 'user-doc', 'verification-email']);
    });

    it('refreshes the Firebase user and ID token before checking verification status', async () => {
        const user = { emailVerified: false };
        const order = [];
        const verified = await refreshEmailVerification(user, {
            reloadUser: vi.fn(async target => { order.push('reload'); target.emailVerified = true; }),
            getIdToken: vi.fn(async (_target, forceRefresh) => { order.push(`token:${forceRefresh}`); }),
        });
        expect(verified).toBe(true);
        expect(order).toEqual(['reload', 'token:true']);
    });

    it('wires Firebase verification and the inbox state into the shipped signup UI', () => {
        const auth = readFileSync(path.join(root, 'src/auth-v2.js'), 'utf8');
        const approval = readFileSync(path.join(root, 'src/auth-approval.js'), 'utf8');
        const html = readFileSync(path.join(root, 'index.html'), 'utf8');
        expect(auth).toMatch(/registerPasswordAccount\(\{/);
        expect(auth).toMatch(/sendVerification:\s*sendEmailVerification/);
        expect(auth).toMatch(/checkEmailButton\.addEventListener\('click'/);
        expect(auth).toMatch(/resendVerificationButton\.addEventListener\('click'/);
        expect(auth).toMatch(/await sendEmailVerification\(user\)/);
        expect(auth).toMatch(/refreshEmailVerification\(/);
        expect(auth).toMatch(/promoteVerifiedInvite\(/);
        expect(auth).toMatch(/canApproveFromInviteLookup\(user,\s*email/);
        expect(html).toMatch(/id="btn-check-email"/);
        expect(html).toMatch(/id="btn-resend-verification"/);
        expect(approval).toMatch(/Check your inbox to finish joining/i);
    });
});
