/**
 * functions/quota.js — durable per-user daily AI quota (BL-DD-01, chunk b).
 *
 * Every Gemini callable (askAiCoach, processRulesQuery, analyzeRoundStats,
 * generateAudioBriefing, generatePracticePlan) is authed but was otherwise
 * uncapped, so a single logged-in user could drive unbounded billing against
 * the metered GEMINI_API_KEY. The practice-plan cache guard only helps that one
 * function. This adds a shared, cross-instance daily cap per user, stored in
 * Firestore so it survives cold starts and is consistent across instances.
 *
 * Kept dependency-free (no firebase-functions / firebase-admin import) so it is
 * unit-testable from the repo-root vitest with an in-memory fake: the caller
 * passes in `db` and `FieldValue`, and maps the thrown error to an HttpsError.
 *
 * Counter doc: quotas/{uid}/daily/{yyyy-mm-dd}. Written only by the Admin SDK
 * (rules bypassed); clients may read their own to show "N left today" but never
 * write it (firestore.rules).
 */

// yyyy-mm-dd in UTC. Passed around explicitly so callers/tests can pin the day.
function utcDay(now = new Date()) {
    return now.toISOString().slice(0, 10);
}

/**
 * Transactionally increment the caller's daily counter and throw
 * { code: 'resource-exhausted' } when it is already at/over `limit`. Incremented
 * BEFORE the billable call (fail-closed) so a retry storm can't slip under the
 * cap — it may slightly over-count on a failed AI call, which is the safe
 * direction for a billing guard.
 */
async function checkAndConsumeQuota(db, uid, FieldValue, { limit = 50, day = utcDay() } = {}) {
    if (!uid) {
        const e = new Error('checkAndConsumeQuota: missing uid');
        e.code = 'invalid-argument';
        throw e;
    }
    const ref = db.collection('quotas').doc(uid).collection('daily').doc(day);
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const used = snap.exists ? (snap.data().count || 0) : 0;
        if (used >= limit) {
            const e = new Error('Daily AI quota exceeded');
            e.code = 'resource-exhausted';
            throw e;
        }
        tx.set(ref, { count: used + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
}

module.exports = { checkAndConsumeQuota, utcDay };
