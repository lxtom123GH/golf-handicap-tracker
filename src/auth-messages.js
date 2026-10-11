// User-facing copy only. Never echo a service error's message or other fields.
// Keep technical codes in result objects for diagnostics, outside the UI copy.
export function authErrorMessage(error) {
    switch (error?.code) {
        case 'app/missing-display-name':
            return 'Enter a display name, then try creating your account again.';
        case 'auth/missing-email':
        case 'auth/invalid-email':
            return 'Check your email address, then try again.';
        case 'auth/invalid-credential':
        case 'auth/invalid-login-credentials':
        case 'auth/user-not-found':
        case 'auth/wrong-password':
            return 'Check your email and password, then try again. If you have forgotten your password, choose Forgot password.';
        case 'auth/email-already-in-use':
            return 'Could not create the account with that email. Try signing in, or choose Forgot password.';
        case 'auth/weak-password':
            return 'Choose a stronger password with at least 6 characters, then try again.';
        case 'auth/too-many-requests':
            return 'Too many requests. Wait a few minutes, then try again.';
        case 'auth/network-request-failed':
            return 'Could not reach the sign-in service. Check your connection, then try again.';
        case 'auth/user-disabled':
            return 'This account cannot sign in. Ask the app administrator for help.';
        default:
            return 'Could not complete that request. Please try again. If it keeps happening, ask the app administrator for help.';
    }
}
