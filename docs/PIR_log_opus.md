
> golf_handicap_tracker@6.19.0 test:e2e
> playwright test


Running 14 tests using 2 workers

[1A[2K[2m[WebServer] [22m(node:18463) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
[2m[WebServer] [22m(Use `node --trace-deprecation ...` to show where the warning was created)

[1A[2K[1/14] [chromium] › tests/logic-boundaries.spec.js:41:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Time Travel: Assert UI rejects future dates in round creation
[1A[2K[2/14] [chromium] › tests/async-coach.spec.js:5:5 › Phase 5: Multi-Context Interaction Suite › Simulate Real-time Coaching: Player A connects -> Coach B gets notify
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

[1A[2K[Worker 3] [Browser] LOG: [Dev] Connecting to Firebase Local Emulators...

[1A[2K[Worker 3] [Browser] INFO: WARNING: You are using the Auth Emulator, which is intended for local testing only.  Do not use with production credentials.

[1A[2K[chromium] › tests/logic-boundaries.spec.js:61:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › WHS Limits: Assert UI rejects handicaps < -10.0 or > 54.0
[Worker 2] [Browser] ERROR: Failed to load resource: net::ERR_FAILED

[1A[2K[chromium] › tests/logic-boundaries.spec.js:79:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Fuzzing Scores: Assert UI rejects scores <= 0 and >= 20 for a single hole
[Worker 3] [Browser] DEBUG: [vite] connecting...

[1A[2K[Worker 3] [Browser] DEBUG: [vite] connected.

[1A[2K[Worker 3] [Browser] LOG: [Dev] Connecting to Firebase Local Emulators...

[1A[2K[Worker 3] [Browser] INFO: WARNING: You are using the Auth Emulator, which is intended for local testing only.  Do not use with production credentials.

[1A[2K[Worker 3] [Browser] LOG: ServiceWorker registration successful with scope:  http://localhost:5173/

[1A[2K[Worker 3] [Browser] ERROR: Failed to load resource: net::ERR_FAILED

[1A[2K[chromium] › tests/logic-boundaries.spec.js:61:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › WHS Limits: Assert UI rejects handicaps < -10.0 or > 54.0
[Worker 2] Login failed, attempting registration for test-worker-2@example.com

[1A[2K[Worker 2] [Browser] ERROR: Failed to load resource: net::ERR_FAILED

[1A[2K[chromium] › tests/logic-boundaries.spec.js:79:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Fuzzing Scores: Assert UI rejects scores <= 0 and >= 20 for a single hole
[Worker 3] Login failed, attempting registration for test-worker-3@example.com

[1A[2K[Worker 3] [Browser] ERROR: Failed to load resource: net::ERR_FAILED

[1A[2K  3) [chromium] › tests/logic-boundaries.spec.js:61:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › WHS Limits: Assert UI rejects handicaps < -10.0 or > 54.0

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

    Error Context: test-results/logic-boundaries-Phase-2-L-6ec3e-cts-handicaps--10-0-or-54-0-chromium/error-context.md


[1A[2K  4) [chromium] › tests/logic-boundaries.spec.js:79:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Fuzzing Scores: Assert UI rejects scores <= 0 and >= 20 for a single hole

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

    Error Context: test-results/logic-boundaries-Phase-2-L-06c99--0-and-20-for-a-single-hole-chromium/error-context.md


[1A[2K[5/14] [chromium] › tests/logic-boundaries.spec.js:100:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Sub-Score Logic: Assert UI throws an error if Putts > Total Score or Penalties >= Total Score
[1A[2K[chromium] › tests/logic-boundaries.spec.js:100:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Sub-Score Logic: Assert UI throws an error if Putts > Total Score or Penalties >= Total Score
[Worker 4] [Browser] DEBUG: [vite] connecting...

[1A[2K[Worker 4] [Browser] DEBUG: [vite] connected.

[1A[2K[6/14] [chromium] › tests/logic-boundaries.spec.js:104:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Chip-in Validation: Explicitly verify that Putts = 0 is successfully accepted when Score > 0
[1A[2K[Worker 4] [Browser] LOG: [Dev] Connecting to Firebase Local Emulators...

[1A[2K[Worker 4] [Browser] INFO: WARNING: You are using the Auth Emulator, which is intended for local testing only.  Do not use with production credentials.

[1A[2K[Worker 4] [Browser] DEBUG: [vite] connecting...

[1A[2K[Worker 4] [Browser] DEBUG: [vite] connected.

[1A[2K[Worker 4] [Browser] LOG: [Dev] Connecting to Firebase Local Emulators...

[1A[2K[Worker 4] [Browser] INFO: WARNING: You are using the Auth Emulator, which is intended for local testing only.  Do not use with production credentials.

[1A[2K[Worker 4] [Browser] LOG: ServiceWorker registration successful with scope:  http://localhost:5173/

[1A[2K[chromium] › tests/logic-boundaries.spec.js:104:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Chip-in Validation: Explicitly verify that Putts = 0 is successfully accepted when Score > 0
[Worker 5] [Browser] DEBUG: [vite] connecting...

[1A[2K[chromium] › tests/logic-boundaries.spec.js:100:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Sub-Score Logic: Assert UI throws an error if Putts > Total Score or Penalties >= Total Score
[Worker 4] [Browser] ERROR: Failed to load resource: net::ERR_FAILED

[1A[2K[chromium] › tests/logic-boundaries.spec.js:104:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Chip-in Validation: Explicitly verify that Putts = 0 is successfully accepted when Score > 0
[Worker 5] [Browser] DEBUG: [vite] connected.

[1A[2K[Worker 5] [Browser] LOG: [Dev] Connecting to Firebase Local Emulators...

[1A[2K[Worker 5] [Browser] INFO: WARNING: You are using the Auth Emulator, which is intended for local testing only.  Do not use with production credentials.

[1A[2K[Worker 5] [Browser] DEBUG: [vite] connecting...

[1A[2K[Worker 5] [Browser] DEBUG: [vite] connected.

[1A[2K[Worker 5] [Browser] LOG: [Dev] Connecting to Firebase Local Emulators...

[1A[2K[Worker 5] [Browser] INFO: WARNING: You are using the Auth Emulator, which is intended for local testing only.  Do not use with production credentials.

[1A[2K[Worker 5] [Browser] LOG: ServiceWorker registration successful with scope:  http://localhost:5173/

[1A[2K[Worker 5] [Browser] ERROR: Failed to load resource: net::ERR_FAILED

[1A[2K[chromium] › tests/logic-boundaries.spec.js:100:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Sub-Score Logic: Assert UI throws an error if Putts > Total Score or Penalties >= Total Score
[Worker 4] Login failed, attempting registration for test-worker-4@example.com

[1A[2K[Worker 4] [Browser] ERROR: Failed to load resource: net::ERR_FAILED

[1A[2K[chromium] › tests/logic-boundaries.spec.js:104:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Chip-in Validation: Explicitly verify that Putts = 0 is successfully accepted when Score > 0
[Worker 5] Login failed, attempting registration for test-worker-5@example.com

[1A[2K[Worker 5] [Browser] ERROR: Failed to load resource: net::ERR_FAILED

[1A[2K  5) [chromium] › tests/logic-boundaries.spec.js:100:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Sub-Score Logic: Assert UI throws an error if Putts > Total Score or Penalties >= Total Score

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

    Error Context: test-results/logic-boundaries-Phase-2-L-02811-re-or-Penalties-Total-Score-chromium/error-context.md


[1A[2K  6) [chromium] › tests/logic-boundaries.spec.js:104:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Chip-in Validation: Explicitly verify that Putts = 0 is successfully accepted when Score > 0

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

    Error Context: test-results/logic-boundaries-Phase-2-L-77b1c-fully-accepted-when-Score-0-chromium/error-context.md


[1A[2K[7/14] [chromium] › tests/quota-guards.spec.js:31:5 › Phase 3: Infrastructure & Quota Suite › The Double-Tap: Simulate rapid multi-clicks (5 in 1 sec) on "Generate AI Briefing"
[1A[2K[chromium] › tests/quota-guards.spec.js:31:5 › Phase 3: Infrastructure & Quota Suite › The Double-Tap: Simulate rapid multi-clicks (5 in 1 sec) on "Generate AI Briefing"
[Worker 6] [Browser] DEBUG: [vite] connecting...

[1A[2K[Worker 6] [Browser] DEBUG: [vite] connected.

[1A[2K[Worker 6] [Browser] LOG: [Dev] Connecting to Firebase Local Emulators...

[1A[2K[Worker 6] [Browser] INFO: WARNING: You are using the Auth Emulator, which is intended for local testing only.  Do not use with production credentials.

[1A[2K[Worker 6] [Browser] DEBUG: [vite] connecting...

[1A[2K[Worker 6] [Browser] DEBUG: [vite] connected.

[1A[2K[8/14] [chromium] › tests/quota-guards.spec.js:55:5 › Phase 3: Infrastructure & Quota Suite › Cache Hit Check: Request practice drill when active one exists local state
[1A[2K[Worker 6] [Browser] LOG: [Dev] Connecting to Firebase Local Emulators...

[1A[2K[Worker 6] [Browser] INFO: WARNING: You are using the Auth Emulator, which is intended for local testing only.  Do not use with production credentials.

[1A[2K[Worker 6] [Browser] LOG: ServiceWorker registration successful with scope:  http://localhost:5173/

[1A[2K[Worker 6] [Browser] ERROR: Failed to load resource: net::ERR_FAILED

[1A[2K[chromium] › tests/quota-guards.spec.js:55:5 › Phase 3: Infrastructure & Quota Suite › Cache Hit Check: Request practice drill when active one exists local state
[Worker 7] [Browser] DEBUG: [vite] connecting...

[1A[2K[Worker 7] [Browser] DEBUG: [vite] connected.

[1A[2K[Worker 7] [Browser] LOG: [Dev] Connecting to Firebase Local Emulators...

[1A[2K[Worker 7] [Browser] INFO: WARNING: You are using the Auth Emulator, which is intended for local testing only.  Do not use with production credentials.

[1A[2K[Worker 7] [Browser] DEBUG: [vite] connecting...

[1A[2K[Worker 7] [Browser] DEBUG: [vite] connected.

[1A[2K[Worker 7] [Browser] LOG: [Dev] Connecting to Firebase Local Emulators...

[1A[2K[Worker 7] [Browser] INFO: WARNING: You are using the Auth Emulator, which is intended for local testing only.  Do not use with production credentials.

[1A[2K[Worker 7] [Browser] LOG: ServiceWorker registration successful with scope:  http://localhost:5173/

[1A[2K[Worker 7] [Browser] ERROR: Failed to load resource: net::ERR_FAILED

[1A[2K[chromium] › tests/quota-guards.spec.js:31:5 › Phase 3: Infrastructure & Quota Suite › The Double-Tap: Simulate rapid multi-clicks (5 in 1 sec) on "Generate AI Briefing"
[Worker 6] [Browser] ERROR: Failed to load resource: net::ERR_FAILED

[1A[2K[chromium] › tests/quota-guards.spec.js:55:5 › Phase 3: Infrastructure & Quota Suite › Cache Hit Check: Request practice drill when active one exists local state
[Worker 7] [Browser] ERROR: Failed to load resource: net::ERR_FAILED

[1A[2K  7) [chromium] › tests/quota-guards.spec.js:31:5 › Phase 3: Infrastructure & Quota Suite › The Double-Tap: Simulate rapid multi-clicks (5 in 1 sec) on "Generate AI Briefing"

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


      25 |                 await page.click('#temp-submit-register');
      26 |             }
    > 27 |             await expect(page.locator('#auth-overlay')).toBeHidden({ timeout: 15000 });
         |                                                         ^
      28 |         }
      29 |     });
      30 |
        at /app/tests/quota-guards.spec.js:27:57

    Error Context: test-results/quota-guards-Phase-3-Infra-4d687-ec-on-Generate-AI-Briefing--chromium/error-context.md


[1A[2K  8) [chromium] › tests/quota-guards.spec.js:55:5 › Phase 3: Infrastructure & Quota Suite › Cache Hit Check: Request practice drill when active one exists local state

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


      25 |                 await page.click('#temp-submit-register');
      26 |             }
    > 27 |             await expect(page.locator('#auth-overlay')).toBeHidden({ timeout: 15000 });
         |                                                         ^
      28 |         }
      29 |     });
      30 |
        at /app/tests/quota-guards.spec.js:27:57

    Error Context: test-results/quota-guards-Phase-3-Infra-dad17-tive-one-exists-local-state-chromium/error-context.md


[1A[2K[9/14] [chromium] › tests/security-rbac.spec.js:29:5 › Phase 4: Security & RBAC Suite › The Peeping Tom: Assert standard Player navigating to /coach-dashboard is instantly redirected
[1A[2K[10/14] [chromium] › tests/security-rbac.spec.js:49:5 › Phase 4: Security & RBAC Suite › Data Isolation: Assert Firestore Security Rules block Player B from reading Player A unshared round ID
[1A[2K  9) [chromium] › tests/security-rbac.spec.js:29:5 › Phase 4: Security & RBAC Suite › The Peeping Tom: Assert standard Player navigating to /coach-dashboard is instantly redirected

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


      23 |                 await page.click('#temp-submit-register');
      24 |             }
    > 25 |             await expect(page.locator('#auth-overlay')).toBeHidden({ timeout: 15000 });
         |                                                         ^
      26 |         }
      27 |     });
      28 |
        at /app/tests/security-rbac.spec.js:25:57

    Error Context: test-results/security-rbac-Phase-4-Secu-78ea9-ard-is-instantly-redirected-chromium/error-context.md


[1A[2K  10) [chromium] › tests/security-rbac.spec.js:49:5 › Phase 4: Security & RBAC Suite › Data Isolation: Assert Firestore Security Rules block Player B from reading Player A unshared round ID

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


      23 |                 await page.click('#temp-submit-register');
      24 |             }
    > 25 |             await expect(page.locator('#auth-overlay')).toBeHidden({ timeout: 15000 });
         |                                                         ^
      26 |         }
      27 |     });
      28 |
        at /app/tests/security-rbac.spec.js:25:57

    Error Context: test-results/security-rbac-Phase-4-Secu-0681a--Player-A-unshared-round-ID-chromium/error-context.md


[1A[2K[11/14] [chromium] › tests/ui-ergonomics.spec.js:28:5 › UI Ergonomics Suite › WHS Handicap Database: Ensure no horizontal scrolling
[1A[2K[12/14] [chromium] › tests/ui-ergonomics.spec.js:40:5 › UI Ergonomics Suite › Live Scoring +/- buttons have touch target size >= 44x44 pixels
[1A[2K  11) [chromium] › tests/ui-ergonomics.spec.js:28:5 › UI Ergonomics Suite › WHS Handicap Database: Ensure no horizontal scrolling

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


      22 |                 await page.click('#temp-submit-register');
      23 |             }
    > 24 |             await expect(page.locator('#auth-overlay')).toBeHidden({ timeout: 15000 });
         |                                                         ^
      25 |         }
      26 |     });
      27 |
        at /app/tests/ui-ergonomics.spec.js:24:57

    Error Context: test-results/ui-ergonomics-UI-Ergonomic-c3f01-ure-no-horizontal-scrolling-chromium/error-context.md


[1A[2K  12) [chromium] › tests/ui-ergonomics.spec.js:40:5 › UI Ergonomics Suite › Live Scoring +/- buttons have touch target size >= 44x44 pixels

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


      22 |                 await page.click('#temp-submit-register');
      23 |             }
    > 24 |             await expect(page.locator('#auth-overlay')).toBeHidden({ timeout: 15000 });
         |                                                         ^
      25 |         }
      26 |     });
      27 |
        at /app/tests/ui-ergonomics.spec.js:24:57

    Error Context: test-results/ui-ergonomics-UI-Ergonomic-dd44b-ch-target-size-44x44-pixels-chromium/error-context.md


[1A[2K[13/14] [chromium] › tests/ui-ergonomics.spec.js:60:5 › UI Ergonomics Suite › Add Club modal tag-balance check does not swallow main-app
[1A[2K[14/14] [chromium] › tests/ux-bag-management.spec.js:28:5 › UX State Persistence Suite: Bag Management › Add/Remove custom club, assert persistence across reload, and assert in Live Scoring detailed stats
[1A[2K  13) [chromium] › tests/ui-ergonomics.spec.js:60:5 › UI Ergonomics Suite › Add Club modal tag-balance check does not swallow main-app

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


      22 |                 await page.click('#temp-submit-register');
      23 |             }
    > 24 |             await expect(page.locator('#auth-overlay')).toBeHidden({ timeout: 15000 });
         |                                                         ^
      25 |         }
      26 |     });
      27 |
        at /app/tests/ui-ergonomics.spec.js:24:57

    Error Context: test-results/ui-ergonomics-UI-Ergonomic-e0025-k-does-not-swallow-main-app-chromium/error-context.md


[1A[2K  14) [chromium] › tests/ux-bag-management.spec.js:28:5 › UX State Persistence Suite: Bag Management › Add/Remove custom club, assert persistence across reload, and assert in Live Scoring detailed stats

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


      22 |                 await page.click('#temp-submit-register');
      23 |             }
    > 24 |             await expect(page.locator('#auth-overlay')).toBeHidden({ timeout: 15000 });
         |                                                         ^
      25 |         }
      26 |     });
      27 |
        at /app/tests/ux-bag-management.spec.js:24:57

    Error Context: test-results/ux-bag-management-UX-State-fc099-Live-Scoring-detailed-stats-chromium/error-context.md


[1A[2K  14 failed
    [chromium] › tests/async-coach.spec.js:5:5 › Phase 5: Multi-Context Interaction Suite › Simulate Real-time Coaching: Player A connects -> Coach B gets notify
    [chromium] › tests/logic-boundaries.spec.js:41:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Time Travel: Assert UI rejects future dates in round creation
    [chromium] › tests/logic-boundaries.spec.js:61:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › WHS Limits: Assert UI rejects handicaps < -10.0 or > 54.0
    [chromium] › tests/logic-boundaries.spec.js:79:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Fuzzing Scores: Assert UI rejects scores <= 0 and >= 20 for a single hole
    [chromium] › tests/logic-boundaries.spec.js:100:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Sub-Score Logic: Assert UI throws an error if Putts > Total Score or Penalties >= Total Score
    [chromium] › tests/logic-boundaries.spec.js:104:5 › Phase 2: Logic & Boundary Suite - Golf Math Constraints › Chip-in Validation: Explicitly verify that Putts = 0 is successfully accepted when Score > 0
    [chromium] › tests/quota-guards.spec.js:31:5 › Phase 3: Infrastructure & Quota Suite › The Double-Tap: Simulate rapid multi-clicks (5 in 1 sec) on "Generate AI Briefing"
    [chromium] › tests/quota-guards.spec.js:55:5 › Phase 3: Infrastructure & Quota Suite › Cache Hit Check: Request practice drill when active one exists local state
    [chromium] › tests/security-rbac.spec.js:29:5 › Phase 4: Security & RBAC Suite › The Peeping Tom: Assert standard Player navigating to /coach-dashboard is instantly redirected
    [chromium] › tests/security-rbac.spec.js:49:5 › Phase 4: Security & RBAC Suite › Data Isolation: Assert Firestore Security Rules block Player B from reading Player A unshared round ID
    [chromium] › tests/ui-ergonomics.spec.js:28:5 › UI Ergonomics Suite › WHS Handicap Database: Ensure no horizontal scrolling
    [chromium] › tests/ui-ergonomics.spec.js:40:5 › UI Ergonomics Suite › Live Scoring +/- buttons have touch target size >= 44x44 pixels
    [chromium] › tests/ui-ergonomics.spec.js:60:5 › UI Ergonomics Suite › Add Club modal tag-balance check does not swallow main-app
    [chromium] › tests/ux-bag-management.spec.js:28:5 › UX State Persistence Suite: Bag Management › Add/Remove custom club, assert persistence across reload, and assert in Live Scoring detailed stats
