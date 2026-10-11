/** Whether an invited identity has proved control of its email address. */
export function canAutoApproveInvite(user, inviteExists) {
    return user?.emailVerified === true && inviteExists === true;
}

/**
 * Check the invite list only when the auth token proves the email is verified.
 * An unverified password signup is created as pending and promoted after the
 * verification link is used.
 * @param {{emailVerified?: boolean}|null} user
 * @param {string} email
 * @param {(normalizedEmail: string) => Promise<boolean>} getInvite
 */
export async function canApproveFromInviteLookup(user, email, getInvite) {
    if (user?.emailVerified !== true || !email) return false;
    return canAutoApproveInvite(user, await getInvite(email.toLowerCase()));
}

/** Promote an existing pending account when its verified email is invited. */
export async function promoteVerifiedInvite(user, userData, { refreshToken, getInvite, approve }) {
    if (userData?.isApproved === true || userData?.isAdmin === true
        || !canAutoApproveInvite(user, true)) return userData;
    const email = user?.email || userData?.email || '';
    if (!email) return userData;
    await refreshToken(user, true);
    if (!await getInvite(email.toLowerCase())) return userData;
    await approve();
    return { ...userData, isApproved: true };
}

/** Copy and actions for an account held at the auth gate. */
export function pendingAuthState(user) {
    if (user?.emailVerified !== true) {
        return {
            needsEmailVerification: true,
            title: 'Check your inbox to finish joining',
            message: 'A Firebase verification email is required to finish joining. Check your inbox and spam folder, open its link, then return here and check your verification status.',
        };
    }
    return {
        needsEmailVerification: false,
        title: 'Account Pending',
        message: 'Your account is waiting for admin approval. Please contact the administrator to grant you access.',
    };
}

/** Create a password account, write its pending user doc, then request verification. */
export async function registerPasswordAccount({
    auth, email, password, displayName,
    createAccount, updateProfile, createUserDoc, sendVerification,
}) {
    const credential = await createAccount(auth, email, password);
    const user = credential.user;
    await updateProfile(user, { displayName });
    await createUserDoc(user, { displayName, email, authProvider: 'password' });
    if (user.emailVerified !== true) await sendVerification(user);
    return user;
}

/** Refresh both the Firebase profile and claims before checking the inbox flow. */
export async function refreshEmailVerification(user, { reloadUser, getIdToken }) {
    await reloadUser(user);
    await getIdToken(user, true);
    return user?.emailVerified === true;
}
