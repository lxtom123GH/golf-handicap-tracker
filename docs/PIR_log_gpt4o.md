
> golf_handicap_tracker@6.19.0 test:e2e
> playwright test


Running 14 tests using 2 workers

[1A[2K[2m[WebServer] [22m(node:15360) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
[2m[WebServer] [22m(Use `node --trace-deprecation ...` to show where the warning was created)

[1A[2K[1/14] [chromium] › tests/logic-boundaries.spec.js:41:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Time Travel: Assert UI rejects future dates in round creation
[1A[2K[2/14] [chromium] › tests/async-coach.spec.js:5:5 › Phase 5: Multi-Context Interaction Suite › Simulate Real-time Coaching: Player A connects -> Coach B gets notify
[1A[2K[2m[WebServer] [22m

[1A[2K[chromium] › tests/logic-boundaries.spec.js:41:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Time Travel: Assert UI rejects future dates in round creation
[Worker 1] [Browser] DEBUG: [vite] connecting...

[1A[2K[Worker 1] [Browser] DEBUG: [vite] connected.

[1A[2K[Worker 1] [Browser] LOG: [Dev] Connecting to Firebase Local Emulators...

[1A[2K[Worker 1] [Browser] INFO: WARNING: You are using the Auth Emulator, which is intended for local testing only.  Do not use with production credentials.

[1A[2K[Worker 1] [Browser] DEBUG: [vite] connecting...

[1A[2K[Worker 1] [Browser] DEBUG: [vite] connected.

[1A[2K[Worker 1] [Browser] LOG: [Dev] Connecting to Firebase Local Emulators...

[1A[2K[Worker 1] [Browser] INFO: WARNING: You are using the Auth Emulator, which is intended for local testing only.  Do not use with production credentials.

[1A[2K[Worker 1] [Browser] LOG: ServiceWorker registration successful with scope:  http://localhost:5173/

[1A[2K[Worker 1] [Browser] ERROR: Failed to load resource: net::ERR_FAILED

[1A[2K[Worker 1] Login failed, attempting registration for test-worker-1@example.com

[1A[2K[Worker 1] [Browser] ERROR: Failed to load resource: net::ERR_FAILED

[1A[2K[2m[WebServer] [22m

[1A[2K  1) [chromium] › tests/logic-boundaries.spec.js:41:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Time Travel: Assert UI rejects future dates in round creation

    Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeHidden[2m([22m[2m)[22m failed

    Locator:  locator('#auth-overlay')
    Expected: hidden
    Received: visible
    Timeout:  15000ms

    Call log:
    [2m  - Expect "toBeHidden" with timeout 15000ms[22m
    [2m  - waiting for locator('#auth-overlay')[22m
    [2m    19 × locator resolved to <div id="auth-overlay" class="auth-overlay">…</div>[22m
    [2m       - unexpected value "visible"[22m


      35 |             }
      36 |
    > 37 |             await expect(page.locator('#auth-overlay')).toBeHidden({ timeout: 15000 });
         |                                                         ^
      38 |         }
      39 |     });
      40 |
        at /app/tests/logic-boundaries.spec.js:37:57

    Error Context: test-results/logic-boundaries-Phase-2-L-7e734-ure-dates-in-round-creation-chromium/error-context.md


[1A[2K  2) [chromium] › tests/async-coach.spec.js:5:5 › Phase 5: Multi-Context Interaction Suite › Simulate Real-time Coaching: Player A connects -> Coach B gets notify

    Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeHidden[2m([22m[2m)[22m failed

    Locator:  locator('#auth-overlay')
    Expected: hidden
    Received: visible
    Timeout:  15000ms

    Call log:
    [2m  - Expect "toBeHidden" with timeout 15000ms[22m
    [2m  - waiting for locator('#auth-overlay')[22m
    [2m    19 × locator resolved to <div id="auth-overlay" class="auth-overlay">…</div>[22m
    [2m       - unexpected value "visible"[22m


      33 |                 await playerPage.click('#temp-submit-register');
      34 |             }
    > 35 |             await expect(playerPage.locator('#auth-overlay')).toBeHidden({ timeout: 15000 });
         |                                                               ^
      36 |         }
      37 |
      38 |         // 2. Coach logic (login as coach)
        at /app/tests/async-coach.spec.js:35:63

    Error Context: test-results/async-coach-Phase-5-Multi--f6876-nects---Coach-B-gets-notify-chromium/error-context.md


[1A[2K[3/14] [chromium] › tests/logic-boundaries.spec.js:61:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › WHS Limits: Assert UI rejects handicaps < -10.0 or > 54.0
[1A[2K[chromium] › tests/logic-boundaries.spec.js:61:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › WHS Limits: Assert UI rejects handicaps < -10.0 or > 54.0
[Worker 2] [Browser] DEBUG: [vite] connecting...

[1A[2K[Worker 2] [Browser] DEBUG: [vite] connected.

[1A[2K[Worker 2] [Browser] LOG: [Dev] Connecting to Firebase Local Emulators...

[1A[2K[Worker 2] [Browser] INFO: WARNING: You are using the Auth Emulator, which is intended for local testing only.  Do not use with production credentials.

[1A[2K[4/14] [chromium] › tests/logic-boundaries.spec.js:79:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Fuzzing Scores: Assert UI rejects scores <= 0 and >= 20 for a single hole
[1A[2K[Worker 2] [Browser] DEBUG: [vite] connecting...

[1A[2K[Worker 2] [Browser] DEBUG: [vite] connected.

[1A[2K[Worker 2] [Browser] LOG: [Dev] Connecting to Firebase Local Emulators...

[1A[2K[Worker 2] [Browser] INFO: WARNING: You are using the Auth Emulator, which is intended for local testing only.  Do not use with production credentials.

[1A[2K[Worker 2] [Browser] LOG: ServiceWorker registration successful with scope:  http://localhost:5173/

[1A[2K[chromium] › tests/logic-boundaries.spec.js:79:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Fuzzing Scores: Assert UI rejects scores <= 0 and >= 20 for a single hole
[Worker 3] [Browser] DEBUG: [vite] connecting...

[1A[2K[Worker 3] [Browser] DEBUG: [vite] connected.

[1A[2K[chromium] › tests/logic-boundaries.spec.js:61:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › WHS Limits: Assert UI rejects handicaps < -10.0 or > 54.0
[Worker 2] [Browser] ERROR: Failed to load resource: the server responded with a status of 400 (Bad Request)

[1A[2K[chromium] › tests/logic-boundaries.spec.js:79:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Fuzzing Scores: Assert UI rejects scores <= 0 and >= 20 for a single hole
[Worker 3] [Browser] LOG: [Dev] Connecting to Firebase Local Emulators...

[1A[2K[Worker 3] [Browser] INFO: WARNING: You are using the Auth Emulator, which is intended for local testing only.  Do not use with production credentials.

[1A[2K[Worker 3] [Browser] DEBUG: [vite] connecting...

[1A[2K[Worker 3] [Browser] DEBUG: [vite] connected.

[1A[2K[Worker 3] [Browser] LOG: [Dev] Connecting to Firebase Local Emulators...

[1A[2K[Worker 3] [Browser] INFO: WARNING: You are using the Auth Emulator, which is intended for local testing only.  Do not use with production credentials.

[1A[2K[Worker 3] [Browser] LOG: ServiceWorker registration successful with scope:  http://localhost:5173/

[1A[2K[Worker 3] [Browser] ERROR: Failed to load resource: the server responded with a status of 400 (Bad Request)

[1A[2K[chromium] › tests/logic-boundaries.spec.js:61:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › WHS Limits: Assert UI rejects handicaps < -10.0 or > 54.0
[Worker 2] Login failed, attempting registration for test-worker-2@example.com

[1A[2K[Worker 2] [Browser] LOG: [State] currentUser changed: _UserImpl

[1A[2K[Worker 2] [Browser] LOG: [Auth] User detected: SbQFZ56kJwZ4EYFOlGXpXzjbLxUJ Fetching doc...

[1A[2K[chromium] › tests/logic-boundaries.spec.js:79:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Fuzzing Scores: Assert UI rejects scores <= 0 and >= 20 for a single hole
[Worker 3] Login failed, attempting registration for test-worker-3@example.com

[1A[2K[Worker 3] [Browser] LOG: [State] currentUser changed: _UserImpl

[1A[2K[Worker 3] [Browser] LOG: [Auth] User detected: 7AsKZ6ZQPZJiKeJgZvyMpwrwrCUo Fetching doc...

[1A[2K[Worker 3] [Browser] LOG: [Auth] User doc not found, retry 0

[1A[2K[chromium] › tests/logic-boundaries.spec.js:61:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › WHS Limits: Assert UI rejects handicaps < -10.0 or > 54.0
[Worker 2] [Browser] LOG: [Auth] User doc not found, retry 0

[1A[2K[Worker 2] [Browser] LOG: [Auth] User approved, hiding overlay...

[1A[2K[chromium] › tests/logic-boundaries.spec.js:79:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Fuzzing Scores: Assert UI rejects scores <= 0 and >= 20 for a single hole
[Worker 3] [Browser] LOG: [Auth] User approved, hiding overlay...

[1A[2K[Worker 3] [Browser] LOG: [State] viewingPlayerId changed: 7AsKZ6ZQPZJiKeJgZvyMpwrwrCUo

[1A[2K[Worker 3] [Browser] LOG: App Ready: Bootstrapping modules...

[1A[2K[chromium] › tests/logic-boundaries.spec.js:61:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › WHS Limits: Assert UI rejects handicaps < -10.0 or > 54.0
[Worker 2] [Browser] LOG: [State] viewingPlayerId changed: SbQFZ56kJwZ4EYFOlGXpXzjbLxUJ

[1A[2K[Worker 2] [Browser] LOG: App Ready: Bootstrapping modules...

[1A[2K[Worker 2] [Browser] LOG: [Navigation] Initializing Clean Slate Architecture...

[1A[2K[Worker 2] [Browser] LOG: [Navigation] switching to: tab-oncourse

[1A[2K[Worker 2] [Browser] LOG: [UI] Version Injected from Meta: v6.23.1 - Surveyor Logic Fix

[1A[2K[Worker 2] [Browser] LOG: [Navigation] switching to: tab-oncourse

[1A[2K[Worker 2] [Browser] LOG: [Auth] Bootstrap complete, removing cloak.

[1A[2K[chromium] › tests/logic-boundaries.spec.js:79:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Fuzzing Scores: Assert UI rejects scores <= 0 and >= 20 for a single hole
[Worker 3] [Browser] LOG: [Navigation] Initializing Clean Slate Architecture...

[1A[2K[Worker 3] [Browser] LOG: [Navigation] switching to: tab-oncourse

[1A[2K[Worker 3] [Browser] LOG: [UI] Version Injected from Meta: v6.23.1 - Surveyor Logic Fix

[1A[2K[Worker 3] [Browser] LOG: [Navigation] switching to: tab-oncourse

[1A[2K[Worker 3] [Browser] LOG: [Auth] Bootstrap complete, removing cloak.

[1A[2K[Worker 3] [Browser] LOG: [Navigation] switching to: tab-oncourse

[1A[2K[5/14] [chromium] › tests/logic-boundaries.spec.js:100:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Sub-Score Logic: Assert UI throws an error if Putts > Total Score or Penalties >= Total Score
[1A[2K[chromium] › tests/logic-boundaries.spec.js:61:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › WHS Limits: Assert UI rejects handicaps < -10.0 or > 54.0
[Worker 2] [Browser] LOG: [State] usedIds changed: []

[1A[2K[Worker 2] [Browser] LOG: [State] handicapIndex changed: 0

[1A[2K[Worker 2] [Browser] LOG: [State] currentRounds changed: []

[1A[2K[chromium] › tests/logic-boundaries.spec.js:100:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Sub-Score Logic: Assert UI throws an error if Putts > Total Score or Penalties >= Total Score
[Worker 3] [Browser] DEBUG: [vite] connecting...

[1A[2K[Worker 3] [Browser] DEBUG: [vite] connected.

[1A[2K[chromium] › tests/logic-boundaries.spec.js:61:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › WHS Limits: Assert UI rejects handicaps < -10.0 or > 54.0
[Worker 2] [Browser] LOG: [State] currentPracticeRounds changed: []

[1A[2K[Worker 2] [Browser] ERROR: [Practice Caddy] Load active fail: FirebaseError: No matching allow statements

[1A[2K[Worker 2] [Browser] LOG: [Navigation] switching to: tab-whs

[1A[2K[Worker 2] [Browser] LOG: [State] activeTab changed: tab-whs

[1A[2K[chromium] › tests/logic-boundaries.spec.js:100:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Sub-Score Logic: Assert UI throws an error if Putts > Total Score or Penalties >= Total Score
[Worker 3] [Browser] LOG: [Dev] Connecting to Firebase Local Emulators...

[1A[2K[Worker 3] [Browser] INFO: WARNING: You are using the Auth Emulator, which is intended for local testing only.  Do not use with production credentials.

[1A[2K[Worker 3] [Browser] DEBUG: [vite] connecting...

[1A[2K[Worker 3] [Browser] DEBUG: [vite] connected.

[1A[2K[6/14] [chromium] › tests/logic-boundaries.spec.js:104:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Chip-in Validation: Explicitly verify that Putts = 0 is successfully accepted when Score > 0
[1A[2K[Worker 3] [Browser] LOG: [Dev] Connecting to Firebase Local Emulators...

[1A[2K[Worker 3] [Browser] INFO: WARNING: You are using the Auth Emulator, which is intended for local testing only.  Do not use with production credentials.

[1A[2K[Worker 3] [Browser] LOG: ServiceWorker registration successful with scope:  http://localhost:5173/

[1A[2K[chromium] › tests/logic-boundaries.spec.js:104:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Chip-in Validation: Explicitly verify that Putts = 0 is successfully accepted when Score > 0
[Worker 2] [Browser] DEBUG: [vite] connecting...

[1A[2K[Worker 2] [Browser] DEBUG: [vite] connected.

[1A[2K[Worker 2] [Browser] LOG: [Dev] Connecting to Firebase Local Emulators...

[1A[2K[Worker 2] [Browser] INFO: WARNING: You are using the Auth Emulator, which is intended for local testing only.  Do not use with production credentials.

[1A[2K[chromium] › tests/logic-boundaries.spec.js:100:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Sub-Score Logic: Assert UI throws an error if Putts > Total Score or Penalties >= Total Score
[Worker 3] [Browser] LOG: [State] currentUser changed: _UserImpl

[1A[2K[Worker 3] [Browser] LOG: [Auth] User detected: 7AsKZ6ZQPZJiKeJgZvyMpwrwrCUo Fetching doc...

[1A[2K[chromium] › tests/logic-boundaries.spec.js:104:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Chip-in Validation: Explicitly verify that Putts = 0 is successfully accepted when Score > 0
[Worker 2] [Browser] DEBUG: [vite] connecting...

[1A[2K[Worker 2] [Browser] DEBUG: [vite] connected.

[1A[2K[Worker 2] [Browser] LOG: [Dev] Connecting to Firebase Local Emulators...

[1A[2K[Worker 2] [Browser] INFO: WARNING: You are using the Auth Emulator, which is intended for local testing only.  Do not use with production credentials.

[1A[2K[chromium] › tests/logic-boundaries.spec.js:100:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Sub-Score Logic: Assert UI throws an error if Putts > Total Score or Penalties >= Total Score
[Worker 3] [Browser] LOG: [Auth] User approved, hiding overlay...

[1A[2K[Worker 3] [Browser] LOG: [State] viewingPlayerId changed: 7AsKZ6ZQPZJiKeJgZvyMpwrwrCUo

[1A[2K[Worker 3] [Browser] LOG: App Ready: Bootstrapping modules...

[1A[2K[Worker 3] [Browser] LOG: [Navigation] Initializing Clean Slate Architecture...

[1A[2K[Worker 3] [Browser] LOG: [Navigation] switching to: tab-oncourse

[1A[2K[Worker 3] [Browser] LOG: [UI] Version Injected from Meta: v6.23.1 - Surveyor Logic Fix

[1A[2K[Worker 3] [Browser] LOG: [Navigation] switching to: tab-oncourse

[1A[2K[Worker 3] [Browser] LOG: [Auth] Bootstrap complete, removing cloak.

[1A[2K[chromium] › tests/logic-boundaries.spec.js:104:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Chip-in Validation: Explicitly verify that Putts = 0 is successfully accepted when Score > 0
[Worker 2] [Browser] LOG: ServiceWorker registration successful with scope:  http://localhost:5173/

[1A[2K[chromium] › tests/logic-boundaries.spec.js:100:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Sub-Score Logic: Assert UI throws an error if Putts > Total Score or Penalties >= Total Score
[Worker 3] [Browser] LOG: [State] usedIds changed: []

[1A[2K[Worker 3] [Browser] LOG: [State] handicapIndex changed: 0

[1A[2K[Worker 3] [Browser] LOG: [State] currentRounds changed: []

[1A[2K[Worker 3] [Browser] LOG: [State] currentPracticeRounds changed: []

[1A[2K[Worker 3] [Browser] ERROR: [Practice Caddy] Load active fail: FirebaseError: No matching allow statements

[1A[2K[chromium] › tests/logic-boundaries.spec.js:104:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Chip-in Validation: Explicitly verify that Putts = 0 is successfully accepted when Score > 0
[Worker 2] [Browser] LOG: [State] currentUser changed: _UserImpl

[1A[2K[Worker 2] [Browser] LOG: [Auth] User detected: SbQFZ56kJwZ4EYFOlGXpXzjbLxUJ Fetching doc...

[1A[2K[Worker 2] [Browser] LOG: [Auth] User approved, hiding overlay...

[1A[2K[Worker 2] [Browser] LOG: [State] viewingPlayerId changed: SbQFZ56kJwZ4EYFOlGXpXzjbLxUJ

[1A[2K[Worker 2] [Browser] LOG: App Ready: Bootstrapping modules...

[1A[2K[Worker 2] [Browser] LOG: [Navigation] Initializing Clean Slate Architecture...

[1A[2K[Worker 2] [Browser] LOG: [Navigation] switching to: tab-oncourse

[1A[2K[Worker 2] [Browser] LOG: [UI] Version Injected from Meta: v6.23.1 - Surveyor Logic Fix

[1A[2K[Worker 2] [Browser] LOG: [Navigation] switching to: tab-oncourse

[1A[2K[Worker 2] [Browser] LOG: [Auth] Bootstrap complete, removing cloak.

[1A[2K[Worker 2] [Browser] LOG: [State] usedIds changed: []

[1A[2K[Worker 2] [Browser] LOG: [State] handicapIndex changed: 0

[1A[2K[Worker 2] [Browser] LOG: [State] currentRounds changed: []

[1A[2K[Worker 2] [Browser] LOG: [State] currentPracticeRounds changed: []

[1A[2K[Worker 2] [Browser] ERROR: [Practice Caddy] Load active fail: FirebaseError: No matching allow statements

[1A[2K[7/14] [chromium] › tests/quota-guards.spec.js:31:5 › Phase 3: Infrastructure & Quota Suite › The Double-Tap: Simulate rapid multi-clicks (5 in 1 sec) on "Generate AI Briefing"
[1A[2K[chromium] › tests/quota-guards.spec.js:31:5 › Phase 3: Infrastructure & Quota Suite › The Double-Tap: Simulate rapid multi-clicks (5 in 1 sec) on "Generate AI Briefing"
[Worker 3] [Browser] DEBUG: [vite] connecting...

[1A[2K[Worker 3] [Browser] DEBUG: [vite] connected.

[1A[2K[Worker 3] [Browser] LOG: [Dev] Connecting to Firebase Local Emulators...

[1A[2K[Worker 3] [Browser] INFO: WARNING: You are using the Auth Emulator, which is intended for local testing only.  Do not use with production credentials.

[1A[2K[Worker 3] [Browser] DEBUG: [vite] connecting...

[1A[2K[Worker 3] [Browser] DEBUG: [vite] connected.

[1A[2K[Worker 3] [Browser] LOG: [Dev] Connecting to Firebase Local Emulators...

[1A[2K[Worker 3] [Browser] INFO: WARNING: You are using the Auth Emulator, which is intended for local testing only.  Do not use with production credentials.

[1A[2K[Worker 3] [Browser] LOG: ServiceWorker registration successful with scope:  http://localhost:5173/

[1A[2K[8/14] [chromium] › tests/quota-guards.spec.js:55:5 › Phase 3: Infrastructure & Quota Suite › Cache Hit Check: Request practice drill when active one exists local state
[1A[2K[Worker 3] [Browser] ERROR: Failed to load resource: the server responded with a status of 400 (Bad Request)

[1A[2K[chromium] › tests/quota-guards.spec.js:55:5 › Phase 3: Infrastructure & Quota Suite › Cache Hit Check: Request practice drill when active one exists local state
[Worker 2] [Browser] DEBUG: [vite] connecting...

[1A[2K[Worker 2] [Browser] DEBUG: [vite] connected.

[1A[2K[Worker 2] [Browser] LOG: [Dev] Connecting to Firebase Local Emulators...

[1A[2K[Worker 2] [Browser] INFO: WARNING: You are using the Auth Emulator, which is intended for local testing only.  Do not use with production credentials.

[1A[2K[Worker 2] [Browser] DEBUG: [vite] connecting...

[1A[2K[Worker 2] [Browser] DEBUG: [vite] connected.

[1A[2K[Worker 2] [Browser] LOG: [Dev] Connecting to Firebase Local Emulators...

[1A[2K[Worker 2] [Browser] INFO: WARNING: You are using the Auth Emulator, which is intended for local testing only.  Do not use with production credentials.

[1A[2K[Worker 2] [Browser] LOG: ServiceWorker registration successful with scope:  http://localhost:5173/

[1A[2K[Worker 2] [Browser] ERROR: Failed to load resource: the server responded with a status of 400 (Bad Request)

[1A[2K[chromium] › tests/quota-guards.spec.js:31:5 › Phase 3: Infrastructure & Quota Suite › The Double-Tap: Simulate rapid multi-clicks (5 in 1 sec) on "Generate AI Briefing"
[Worker 3] [Browser] LOG: [State] currentUser changed: _UserImpl

[1A[2K[Worker 3] [Browser] LOG: [Auth] User detected: uQDNW1ttTzOlHXNfRYoctX82C1C4 Fetching doc...

[1A[2K[Worker 3] [Browser] LOG: [Auth] User doc not found, retry 0

[1A[2K[chromium] › tests/quota-guards.spec.js:55:5 › Phase 3: Infrastructure & Quota Suite › Cache Hit Check: Request practice drill when active one exists local state
[Worker 2] [Browser] LOG: [State] currentUser changed: _UserImpl

[1A[2K[Worker 2] [Browser] LOG: [Auth] User detected: VUhuMYRW2ia6QbhdOQ1uP8iFU4uJ Fetching doc...

[1A[2K[Worker 2] [Browser] LOG: [Auth] User doc not found, retry 0

[1A[2K[chromium] › tests/quota-guards.spec.js:31:5 › Phase 3: Infrastructure & Quota Suite › The Double-Tap: Simulate rapid multi-clicks (5 in 1 sec) on "Generate AI Briefing"
[Worker 3] [Browser] LOG: [Auth] User approved, hiding overlay...

[1A[2K[Worker 3] [Browser] LOG: [State] viewingPlayerId changed: uQDNW1ttTzOlHXNfRYoctX82C1C4

[1A[2K[Worker 3] [Browser] LOG: App Ready: Bootstrapping modules...

[1A[2K[Worker 3] [Browser] LOG: [Navigation] Initializing Clean Slate Architecture...

[1A[2K[Worker 3] [Browser] LOG: [Navigation] switching to: tab-oncourse

[1A[2K[Worker 3] [Browser] LOG: [UI] Version Injected from Meta: v6.23.1 - Surveyor Logic Fix

[1A[2K[Worker 3] [Browser] LOG: [Navigation] switching to: tab-oncourse

[1A[2K[Worker 3] [Browser] LOG: [Auth] Bootstrap complete, removing cloak.

[1A[2K[Worker 3] [Browser] LOG: [State] usedIds changed: []

[1A[2K[Worker 3] [Browser] LOG: [State] handicapIndex changed: 0

[1A[2K[Worker 3] [Browser] LOG: [State] currentRounds changed: []

[1A[2K[Worker 3] [Browser] LOG: [Navigation] switching to: tab-practice

[1A[2K[Worker 3] [Browser] LOG: [State] activeTab changed: tab-practice

[1A[2K[Worker 3] [Browser] LOG: [State] currentPracticeRounds changed: []

[1A[2K[Worker 3] [Browser] ERROR: [Practice Caddy] Load active fail: FirebaseError: No matching allow statements

[1A[2K[Worker 3] [Browser] ERROR: Failed to load resource: net::ERR_FAILED

[1A[2K[Worker 3] [Browser] ERROR: [Practice Caddy] Generation error: FirebaseError: internal

[1A[2K[Worker 3] [Browser] ERROR: Failed to load resource: net::ERR_FAILED

[1A[2K[Worker 3] [Browser] ERROR: [Practice Caddy] Generation error: FirebaseError: internal

[1A[2K[Worker 3] [Browser] ERROR: Failed to load resource: net::ERR_FAILED

[1A[2K[Worker 3] [Browser] ERROR: [Practice Caddy] Generation error: FirebaseError: internal

[1A[2K[Worker 3] [Browser] ERROR: Failed to load resource: net::ERR_FAILED

[1A[2K[Worker 3] [Browser] ERROR: [Practice Caddy] Generation error: FirebaseError: internal

[1A[2K[chromium] › tests/quota-guards.spec.js:55:5 › Phase 3: Infrastructure & Quota Suite › Cache Hit Check: Request practice drill when active one exists local state
[Worker 2] [Browser] LOG: [Auth] User approved, hiding overlay...

[1A[2K[Worker 2] [Browser] LOG: [State] viewingPlayerId changed: VUhuMYRW2ia6QbhdOQ1uP8iFU4uJ

[1A[2K[Worker 2] [Browser] LOG: App Ready: Bootstrapping modules...

[1A[2K[Worker 2] [Browser] LOG: [Navigation] Initializing Clean Slate Architecture...

[1A[2K[Worker 2] [Browser] LOG: [Navigation] switching to: tab-oncourse

[1A[2K[Worker 2] [Browser] LOG: [UI] Version Injected from Meta: v6.23.1 - Surveyor Logic Fix

[1A[2K[Worker 2] [Browser] LOG: [Navigation] switching to: tab-oncourse

[1A[2K[Worker 2] [Browser] LOG: [Auth] Bootstrap complete, removing cloak.

[1A[2K[chromium] › tests/quota-guards.spec.js:31:5 › Phase 3: Infrastructure & Quota Suite › The Double-Tap: Simulate rapid multi-clicks (5 in 1 sec) on "Generate AI Briefing"
[Worker 3] [Browser] ERROR: Failed to load resource: net::ERR_FAILED

[1A[2K[Worker 3] [Browser] ERROR: [Practice Caddy] Generation error: FirebaseError: internal

[1A[2K[chromium] › tests/quota-guards.spec.js:55:5 › Phase 3: Infrastructure & Quota Suite › Cache Hit Check: Request practice drill when active one exists local state
[Worker 2] [Browser] LOG: [State] usedIds changed: []

[1A[2K[Worker 2] [Browser] LOG: [State] handicapIndex changed: 0

[1A[2K[Worker 2] [Browser] LOG: [State] currentRounds changed: []

[1A[2K[Worker 2] [Browser] LOG: [Navigation] switching to: tab-practice

[1A[2K[Worker 2] [Browser] LOG: [State] activeTab changed: tab-practice

[1A[2K[Worker 2] [Browser] LOG: [State] currentPracticeRounds changed: []

[1A[2K[Worker 2] [Browser] ERROR: [Practice Caddy] Load active fail: FirebaseError: No matching allow statements

[1A[2K  3) [chromium] › tests/quota-guards.spec.js:31:5 › Phase 3: Infrastructure & Quota Suite › The Double-Tap: Simulate rapid multi-clicks (5 in 1 sec) on "Generate AI Briefing"

    Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBeLessThanOrEqual[2m([22m[32mexpected[39m[2m)[22m

    Expected: <= [32m1[39m
    Received:    [31m5[39m

      50 |
      51 |         // Assert only 1 request was dispatched due to button disabling
    > 52 |         expect(requestCount).toBeLessThanOrEqual(1);
         |                              ^
      53 |     });
      54 |
      55 |     test('Cache Hit Check: Request practice drill when active one exists local state', async ({ page }) => {
        at /app/tests/quota-guards.spec.js:52:30

    Error Context: test-results/quota-guards-Phase-3-Infra-4d687-ec-on-Generate-AI-Briefing--chromium/error-context.md


[1A[2K[9/14] [chromium] › tests/security-rbac.spec.js:49:5 › Phase 4: Security & RBAC Suite › Data Isolation: Assert Firestore Security Rules block Player B from reading Player A unshared round ID
[1A[2K[10/14] [chromium] › tests/security-rbac.spec.js:29:5 › Phase 4: Security & RBAC Suite › The Peeping Tom: Assert standard Player navigating to /coach-dashboard is instantly redirected
[1A[2K[11/14] [chromium] › tests/ui-ergonomics.spec.js:28:5 › UI Ergonomics Suite › WHS Handicap Database: Ensure no horizontal scrolling
[1A[2K[12/14] [chromium] › tests/ui-ergonomics.spec.js:40:5 › UI Ergonomics Suite › Live Scoring +/- buttons have touch target size >= 44x44 pixels
[1A[2K[13/14] [chromium] › tests/ui-ergonomics.spec.js:60:5 › UI Ergonomics Suite › Add Club modal tag-balance check does not swallow main-app
[1A[2K[14/14] [chromium] › tests/ux-bag-management.spec.js:28:5 › UX State Persistence Suite: Bag Management › Add/Remove custom club, assert persistence across reload, and assert in Live Scoring detailed stats
[1A[2K  4) [chromium] › tests/ui-ergonomics.spec.js:40:5 › UI Ergonomics Suite › Live Scoring +/- buttons have touch target size >= 44x44 pixels

    [31mTest timeout of 30000ms exceeded.[39m

    Error: page.selectOption: Test timeout of 30000ms exceeded.
    Call log:
    [2m  - waiting for locator('#oc-course-select')[22m
    [2m    - locator resolved to <select id="oc-course-select">…</select>[22m
    [2m  - attempting select option action[22m
    [2m    2 × waiting for element to be visible and enabled[22m
    [2m      - element is not visible[22m
    [2m    - retrying select option action[22m
    [2m    - waiting 20ms[22m
    [2m    2 × waiting for element to be visible and enabled[22m
    [2m      - element is not visible[22m
    [2m    - retrying select option action[22m
    [2m      - waiting 100ms[22m
    [2m    54 × waiting for element to be visible and enabled[22m
    [2m       - element is not visible[22m
    [2m     - retrying select option action[22m
    [2m       - waiting 500ms[22m


      40 |     test('Live Scoring +/- buttons have touch target size >= 44x44 pixels', async ({ page }) => {
      41 |         await page.click('[data-target="tab-oncourse"]');
    > 42 |         await page.selectOption('#oc-course-select', "Ashgrove GC");
         |                    ^
      43 |         await page.click('#btn-oc-start');
      44 |
      45 |         // Open Editor
        at /app/tests/ui-ergonomics.spec.js:42:20

    Error Context: test-results/ui-ergonomics-UI-Ergonomic-dd44b-ch-target-size-44x44-pixels-chromium/error-context.md


[1A[2K  4 failed
    [chromium] › tests/async-coach.spec.js:5:5 › Phase 5: Multi-Context Interaction Suite › Simulate Real-time Coaching: Player A connects -> Coach B gets notify
    [chromium] › tests/logic-boundaries.spec.js:41:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Time Travel: Assert UI rejects future dates in round creation
    [chromium] › tests/quota-guards.spec.js:31:5 › Phase 3: Infrastructure & Quota Suite › The Double-Tap: Simulate rapid multi-clicks (5 in 1 sec) on "Generate AI Briefing"
    [chromium] › tests/ui-ergonomics.spec.js:40:5 › UI Ergonomics Suite › Live Scoring +/- buttons have touch target size >= 44x44 pixels
  1 skipped
  9 passed (1.4m)
