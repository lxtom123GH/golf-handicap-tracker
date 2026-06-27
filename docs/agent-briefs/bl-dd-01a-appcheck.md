# BL-DD-01a — Firebase App Check on AI callables (offload brief)

> **Implementer:** Antigravity 2.0 / Gemini. **Independent check:** Claude (cross-family).
> Produced by Opus 2026-06-27 from `MASTER_BACKLOG.md` BL-DD-01 (🔴 High) — line numbers read at
> HEAD (`origin/main` @ `bfeba85`). Follow `HANDOFF-antigravity-bl-4.x.md` + `LESSONS.md`
> (read LESSONS **first**; paste grep gates + the four-field Brief-feedback block).
> Branch `fix/bl-dd-01a-appcheck`. PR to main, **DO NOT MERGE**.
>
> This is **chunk a** of BL-DD-01 (App Check — block off-app/scripted abuse of the billed Gemini
> key). **Chunk b** (per-user daily Firestore quota — bounds an in-app abuser) is a SEPARATE
> later brief; do **not** add quota logic here.

## Why (verified at HEAD)
All 5 Gemini callables in `functions/index.js` check only `request.auth` and then call
`ai.models.generateContent` on the project's billed key:
`askAiCoach` (`:28`), `processRulesQuery` (`:54`), `analyzeRoundStats` (`:79`),
`generateAudioBriefing` (`:135`), `generatePracticePlan` (`:235`). There is **no** App Check
(grep `AppCheck` in `src/` → nothing). So anyone with a valid login token — including a script
hitting the callable endpoint directly, outside the app — can run up the bill. App Check makes
the callable reject any request that doesn't carry a valid attestation token from *our* web app.

The two Firestore triggers (`onRoundCreated` `:407`, `onRoundDeleted` `:457`) are **not**
client-callable — **do NOT** add `enforceAppCheck` to them.

## Decision recorded (MASTER_BACKLOG BL-DD-01)
App Check first (this brief), per-user quota second. **Enforcement mode for this brief:
enforce immediately** (set `enforceAppCheck: true` now). *Why:* the app has **no real users yet**
(STATUS: "before first real-user release"), so the usual monitor-first-then-enforce ramp isn't
needed and immediate enforcement is simpler + closes the hole now. *(If a live user base existed,
the alternative would be: ship client App Check, watch the App Check console "verified vs
unverified" metrics, then flip enforcement — NOT what we're doing here.)*

---

## ⚠️ USER (console) steps — NOT code; the implementer cannot do these
These must be done by the project owner in the Firebase console; the implementer should call them
out as prerequisites in the PR but cannot perform them:
1. **Firebase Console → App Check → Apps →** register the web app with the **reCAPTCHA v3**
   provider. Copy the **site key** (this is a *public* key — safe to ship in the client bundle).
2. Create a reCAPTCHA v3 key at the Google reCAPTCHA admin if not auto-created; add the site's
   domains (prod hosting domain).
3. **For local dev:** run the app on localhost once with the debug flag (added by FIX 1 below),
   copy the debug token the browser console prints, and register it under
   **App Check → Apps → (web app) → Manage debug tokens.** (Only needed to exercise an *enforced*
   real backend from localhost; the **emulator does not enforce App Check**, so emulator e2e is
   unaffected either way.)

The implementer's PR must state which value it expects for the site key (env var name below) so the
user can supply it; **do not invent or hardcode a fake key.**

---

## ① Implementation prompt (Antigravity 2.0 / Gemini)

```
TASK: Add Firebase App Check (reCAPTCHA v3) to the web client and ENFORCE it on the 5 callable
Cloud Functions. Branch fix/bl-dd-01a-appcheck. PR to main, DO NOT MERGE. Read
docs/agent-briefs/LESSONS.md first. This is BL-DD-01 chunk a (App Check ONLY) — do NOT add any
rate-limit/quota logic (that is chunk b, a separate brief). 2 commits: (1) client, (2) functions.

PREREQ (state in the PR, do not fake): the reCAPTCHA v3 site key is supplied by the project owner
as a Vite env var VITE_APPCHECK_SITE_KEY (a PUBLIC key). Read it via import.meta.env.

FIX 1 — Client App Check (src/firebase-config.js):
  (a) Add import: import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
  (b) AFTER `const app = initializeApp(firebaseConfig);` and BEFORE the other service getters,
      initialize App Check. Handle dev/localhost with the debug token flag:
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (isLocal) {
          // Debug token: SDK prints a token to the console on first run; register it in the
          // App Check console (Manage debug tokens) to exercise an enforced real backend locally.
          self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
        }
        const appCheckSiteKey = import.meta.env.VITE_APPCHECK_SITE_KEY;
        if (appCheckSiteKey) {
          initializeAppCheck(app, {
            provider: new ReCaptchaV3Provider(appCheckSiteKey),
            isTokenAutoRefreshEnabled: true,
          });
        } else {
          console.warn('[AppCheck] VITE_APPCHECK_SITE_KEY not set — App Check NOT initialized.');
        }
      The `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` line MUST run before initializeAppCheck.
  (c) Do NOT change region/getFunctions or the emulator-routing block (it stays as-is; the
      emulator does not enforce App Check, so no special handling needed there).
  (d) Add VITE_APPCHECK_SITE_KEY to .env.example (create it if absent) with a placeholder + comment
      "public reCAPTCHA v3 site key for Firebase App Check". Do NOT commit a real key or a .env.

FIX 2 — Enforce on the 5 callables (functions/index.js):
  Add `enforceAppCheck: true` to the onCall options object of EACH of these 5 functions ONLY:
    askAiCoach (~:28), processRulesQuery (~:54), analyzeRoundStats (~:79),
    generateAudioBriefing (~:135), generatePracticePlan (~:235)
  e.g.  onCall({ region: REGION, secrets: ["GEMINI_API_KEY"] }, ...)
     -> onCall({ region: REGION, secrets: ["GEMINI_API_KEY"], enforceAppCheck: true }, ...)
  Do NOT touch onRoundCreated / onRoundDeleted (Firestore triggers, not client-callable).
  Do NOT add any other option, dependency, or logic. firebase-functions ^4.9.0 supports
  enforceAppCheck on v2 onCall — no version bump.

HARD CONSTRAINTS (Sydney Protocol):
  - No new `!important` / `.style.display`; no NEW getFunctions/region call (the existing one stays).
  - No new functions deps; client uses the already-installed `firebase` (^12) `firebase/app-check`.
  - Do NOT add quota/rate-limit (chunk b). Do NOT enforce App Check on the Firestore triggers.

ACCEPTANCE:
  - `npm run build` clean (client resolves `firebase/app-check`).
  - `cd functions && npm run lint` (if present) / `node -c index.js`-equivalent: functions parse;
    no deploy required for the check.
  - Emulator e2e unaffected: `npm run test:e2e` (or the existing baseline) still passes BECAUSE the
    emulator does not enforce App Check — confirm the suite is unchanged, do not weaken any test.
  - GREP GATES (paste output):
      `grep -n "initializeAppCheck\|ReCaptchaV3Provider\|FIREBASE_APPCHECK_DEBUG_TOKEN" src/firebase-config.js`
        -> shows the init + debug-token guard
      `grep -c "enforceAppCheck: true" functions/index.js`  -> exactly 5
      `grep -n "enforceAppCheck" functions/index.js`  -> the 5 callables, NOT onRoundCreated/Deleted
      `grep -n "VITE_APPCHECK_SITE_KEY" src/firebase-config.js .env.example`  -> present in both
  - PR description: grep-gate output, the USER-console prereqs restated (site key + debug token),
    and the four-field Brief-feedback block (Clarity gaps / Rationale / Deviations / Coverage).
```

## ② Independent check prompt (Claude — cross-family, NOT Gemini)

```
You are reviewing BL-DD-01a (Firebase App Check) in a vanilla-JS/Firebase/Vite app. I'll paste the
diff (src/firebase-config.js, functions/index.js, .env.example). PASS/FAIL per item with file:line;
run your OWN greps.

1. CLIENT: src/firebase-config.js initializes App Check with ReCaptchaV3Provider using
   import.meta.env.VITE_APPCHECK_SITE_KEY, AFTER initializeApp and guarded for a missing key; the
   localhost branch sets self.FIREBASE_APPCHECK_DEBUG_TOKEN = true BEFORE initializeAppCheck. FAIL
   if a key is hardcoded, if init runs before the debug-token flag on localhost, or if the
   emulator-routing block or getFunctions/region was altered.
2. FUNCTIONS: exactly the 5 callables (askAiCoach, processRulesQuery, analyzeRoundStats,
   generateAudioBriefing, generatePracticePlan) gained `enforceAppCheck: true`; the two Firestore
   triggers did NOT. FAIL if the count != 5, if a trigger got it, or if any other option/logic
   changed. (`grep -c "enforceAppCheck: true" functions/index.js` == 5.)
3. SCOPE: NO quota/rate-limit was added (that's chunk b); no new deps; no new region/getFunctions
   call; .env.example has a placeholder (no real key / no committed .env).
4. SAFETY/BUILD: build clean; the existing test baseline is unchanged and not weakened (the
   emulator doesn't enforce App Check, so e2e should still pass without test edits — flag any test
   that was loosened).

Output: items 1-4 PASS/FAIL + evidence, verdict SHIP/FIX-FIRST, then a "Doc/Process update" line
(read the four feedback fields; capture a tagged LESSONS entry if a real defect/recurring miss,
else "nothing new"). REMINDER for the human: App Check must be REGISTERED + the debug token added
in the Firebase console, and VITE_APPCHECK_SITE_KEY set at build, or enforced callables will reject
the real app — call this out in the verdict.
```

---
*On completion: mark BL-DD-01 ✅ **chunk a only** in MASTER_BACKLOG (note "App Check shipped;
per-user quota = chunk b, still open") with the merge hash. Next BL-DD-01 work = chunk b
(per-user daily quota), briefed just-in-time. Per the sequencing, the chunk after 01a is
BL-DD-04 + BL-DD-08 (comp_rounds read+create together).*
