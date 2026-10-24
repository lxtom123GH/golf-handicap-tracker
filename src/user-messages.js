/** Copy created locally for an input correction, never a service diagnostic. */
export class InputMessage extends Error {}

/** Keep service messages, URLs, document paths and stacks out of user-facing copy. */
export function userErrorMessage(error, fallback = 'Could not complete this action. Please try again.') {
    if (error instanceof InputMessage) return error.message;
    switch (error?.code) {
        case 'unauthenticated':
        case 'functions/unauthenticated':
        case 'storage/unauthenticated':
            return 'Sign in again, then retry this action.';
        case 'permission-denied':
        case 'functions/permission-denied':
        case 'storage/unauthorized':
            return 'This account cannot complete that action. Ask the app administrator for help.';
        case 'unavailable':
        case 'functions/unavailable':
        case 'auth/network-request-failed':
        case 'storage/retry-limit-exceeded':
            return 'Could not reach the service. Check your connection, then try again.';
        default:
            return fallback;
    }
}
