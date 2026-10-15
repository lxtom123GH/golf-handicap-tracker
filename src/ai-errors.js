/** Explain AI failures without displaying arbitrary backend diagnostics. */
const APPROVAL_MESSAGE = 'Your account is awaiting approval. AI features unlock once an admin approves it.';

export function aiErrorMessage(err, fallback) {
    if (err?.code === 'functions/permission-denied' && err.message) {
        // Only this known server response establishes that approval is the cause.
        return err.message === APPROVAL_MESSAGE
            ? `${APPROVAL_MESSAGE} Ask the app administrator to approve your account.`
            : 'This account cannot use that AI feature. Ask the app administrator for help.';
    }
    if (err?.code === 'functions/resource-exhausted') {
        return 'Daily AI limit reached. Try again tomorrow.';
    }
    return fallback;
}
