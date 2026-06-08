
Running 14 tests using 3 workers

[1A[2K[1/14] [chromium] ΓÇ║ tests\logic-boundaries.spec.js:41:5 ΓÇ║ Phase 2: Logic & Boundary Suite - Golf Math Constraints ΓÇ║ WHS Limits: Assert UI rejects handicaps < -10.0 or > 54.0
[1A[2K[2/14] [chromium] ΓÇ║ tests\async-coach.spec.js:5:5 ΓÇ║ Phase 5: Multi-Context Interaction Suite ΓÇ║ Simulate Real-time Coaching: Player A connects -> Coach B gets notify
[1A[2K[3/14] [chromium] ΓÇ║ tests\logic-boundaries.spec.js:21:5 ΓÇ║ Phase 2: Logic & Boundary Suite - Golf Math Constraints ΓÇ║ Time Travel: Assert UI rejects future dates in round creation
[1A[2K[4/14] [chromium] ΓÇ║ tests\logic-boundaries.spec.js:58:5 ΓÇ║ Phase 2: Logic & Boundary Suite - Golf Math Constraints ΓÇ║ Fuzzing Scores: Assert UI rejects scores <= 0 and >= 20 for a single hole
[1A[2K  1) [chromium] ΓÇ║ tests\logic-boundaries.spec.js:41:5 ΓÇ║ Phase 2: Logic & Boundary Suite - Golf Math Constraints ΓÇ║ WHS Limits: Assert UI rejects handicaps < -10.0 or > 54.0 

    Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeHidden[2m([22m[2m)[22m failed

    Locator:  locator('#auth-overlay')
    Expected: hidden
    Received: visible
    Timeout:  5000ms

    Call log:
    [2m  - Expect "toBeHidden" with timeout 5000ms[22m
    [2m  - waiting for locator('#auth-overlay')[22m
    [2m    9 ├ù locator resolved to <div id="auth-overlay" class="auth-overlay">ΓÇª</div>[22m
    [2m      - unexpected value "visible"[22m


      15 |             await page.fill('#auth-password', 'password123');
      16 |             await page.click('#btn-login');
    > 17 |             await expect(page.locator('#auth-overlay')).toBeHidden();
         |                                                         ^
      18 |         }
      19 |     });
      20 |
        at C:\Users\lxtom\.gemini\antigravity\scratch\golf_handicap_tracker\tests\logic-boundaries.spec.js:17:57

    Error Context: test-results\logic-boundaries-Phase-2-L-6ec3e-cts-handicaps--10-0-or-54-0-chromium\error-context.md


[1A[2K  2) [chromium] ΓÇ║ tests\logic-boundaries.spec.js:21:5 ΓÇ║ Phase 2: Logic & Boundary Suite - Golf Math Constraints ΓÇ║ Time Travel: Assert UI rejects future dates in round creation 

    Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeHidden[2m([22m[2m)[22m failed

    Locator:  locator('#auth-overlay')
    Expected: hidden
    Received: visible
    Timeout:  5000ms

    Call log:
    [2m  - Expect "toBeHidden" with timeout 5000ms[22m
    [2m  - waiting for locator('#auth-overlay')[22m
    [2m    9 ├ù locator resolved to <div id="auth-overlay" class="auth-overlay">ΓÇª</div>[22m
    [2m      - unexpected value "visible"[22m


      15 |             await page.fill('#auth-password', 'password123');
      16 |             await page.click('#btn-login');
    > 17 |             await expect(page.locator('#auth-overlay')).toBeHidden();
         |                                                         ^
      18 |         }
      19 |     });
      20 |
        at C:\Users\lxtom\.gemini\antigravity\scratch\golf_handicap_tracker\tests\logic-boundaries.spec.js:17:57

    Error Context: test-results\logic-boundaries-Phase-2-L-7e734-ure-dates-in-round-creation-chromium\error-context.md


[1A[2K[5/14] [chromium] ΓÇ║ tests\logic-boundaries.spec.js:79:5 ΓÇ║ Phase 2: Logic & Boundary Suite - Golf Math Constraints ΓÇ║ Sub-Score Logic: Assert UI throws an error if Putts > Total Score or Penalties >= Total Score
[1A[2K[6/14] [chromium] ΓÇ║ tests\logic-boundaries.spec.js:83:5 ΓÇ║ Phase 2: Logic & Boundary Suite - Golf Math Constraints ΓÇ║ Chip-in Validation: Explicitly verify that Putts = 0 is successfully accepted when Score > 0
[1A[2K  3) [chromium] ΓÇ║ tests\logic-boundaries.spec.js:58:5 ΓÇ║ Phase 2: Logic & Boundary Suite - Golf Math Constraints ΓÇ║ Fuzzing Scores: Assert UI rejects scores <= 0 and >= 20 for a single hole 

    Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeHidden[2m([22m[2m)[22m failed

    Locator:  locator('#auth-overlay')
    Expected: hidden
    Received: visible
    Timeout:  5000ms

    Call log:
    [2m  - Expect "toBeHidden" with timeout 5000ms[22m
    [2m  - waiting for locator('#auth-overlay')[22m
    [2m    9 ├ù locator resolved to <div id="auth-overlay" class="auth-overlay">ΓÇª</div>[22m
    [2m      - unexpected value "visible"[22m


      15 |             await page.fill('#auth-password', 'password123');
      16 |             await page.click('#btn-login');
    > 17 |             await expect(page.locator('#auth-overlay')).toBeHidden();
         |                                                         ^
      18 |         }
      19 |     });
      20 |
        at C:\Users\lxtom\.gemini\antigravity\scratch\golf_handicap_tracker\tests\logic-boundaries.spec.js:17:57

    Error Context: test-results\logic-boundaries-Phase-2-L-06c99--0-and-20-for-a-single-hole-chromium\error-context.md


[1A[2K[7/14] [chromium] ΓÇ║ tests\quota-guards.spec.js:16:5 ΓÇ║ Phase 3: Infrastructure & Quota Suite ΓÇ║ The Double-Tap: Simulate rapid multi-clicks (5 in 1 sec) on "Generate AI Briefing"
[1A[2K  4) [chromium] ΓÇ║ tests\logic-boundaries.spec.js:79:5 ΓÇ║ Phase 2: Logic & Boundary Suite - Golf Math Constraints ΓÇ║ Sub-Score Logic: Assert UI throws an error if Putts > Total Score or Penalties >= Total Score 

    Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeHidden[2m([22m[2m)[22m failed

    Locator:  locator('#auth-overlay')
    Expected: hidden
    Received: visible
    Timeout:  5000ms

    Call log:
    [2m  - Expect "toBeHidden" with timeout 5000ms[22m
    [2m  - waiting for locator('#auth-overlay')[22m
    [2m    9 ├ù locator resolved to <div id="auth-overlay" class="auth-overlay">ΓÇª</div>[22m
    [2m      - unexpected value "visible"[22m


      15 |             await page.fill('#auth-password', 'password123');
      16 |             await page.click('#btn-login');
    > 17 |             await expect(page.locator('#auth-overlay')).toBeHidden();
         |                                                         ^
      18 |         }
      19 |     });
      20 |
        at C:\Users\lxtom\.gemini\antigravity\scratch\golf_handicap_tracker\tests\logic-boundaries.spec.js:17:57

    Error Context: test-results\logic-boundaries-Phase-2-L-02811-re-or-Penalties-Total-Score-chromium\error-context.md


[1A[2K  5) [chromium] ΓÇ║ tests\logic-boundaries.spec.js:83:5 ΓÇ║ Phase 2: Logic & Boundary Suite - Golf Math Constraints ΓÇ║ Chip-in Validation: Explicitly verify that Putts = 0 is successfully accepted when Score > 0 

    Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeHidden[2m([22m[2m)[22m failed

    Locator:  locator('#auth-overlay')
    Expected: hidden
    Received: visible
    Timeout:  5000ms

    Call log:
    [2m  - Expect "toBeHidden" with timeout 5000ms[22m
    [2m  - waiting for locator('#auth-overlay')[22m
    [2m    9 ├ù locator resolved to <div id="auth-overlay" class="auth-overlay">ΓÇª</div>[22m
    [2m      - unexpected value "visible"[22m


      15 |             await page.fill('#auth-password', 'password123');
      16 |             await page.click('#btn-login');
    > 17 |             await expect(page.locator('#auth-overlay')).toBeHidden();
         |                                                         ^
      18 |         }
      19 |     });
      20 |
        at C:\Users\lxtom\.gemini\antigravity\scratch\golf_handicap_tracker\tests\logic-boundaries.spec.js:17:57

    Error Context: test-results\logic-boundaries-Phase-2-L-77b1c-fully-accepted-when-Score-0-chromium\error-context.md


[1A[2K[8/14] [chromium] ΓÇ║ tests\quota-guards.spec.js:44:5 ΓÇ║ Phase 3: Infrastructure & Quota Suite ΓÇ║ Cache Hit Check: Request practice drill when active one exists local state
[1A[2K[9/14] [chromium] ΓÇ║ tests\security-rbac.spec.js:16:5 ΓÇ║ Phase 4: Security & RBAC Suite ΓÇ║ The Peeping Tom: Assert standard Player navigating to /coach-dashboard is instantly redirected
[1A[2K  6) [chromium] ΓÇ║ tests\quota-guards.spec.js:16:5 ΓÇ║ Phase 3: Infrastructure & Quota Suite ΓÇ║ The Double-Tap: Simulate rapid multi-clicks (5 in 1 sec) on "Generate AI Briefing" 

    Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeHidden[2m([22m[2m)[22m failed

    Locator:  locator('#auth-overlay')
    Expected: hidden
    Received: visible
    Timeout:  5000ms

    Call log:
    [2m  - Expect "toBeHidden" with timeout 5000ms[22m
    [2m  - waiting for locator('#auth-overlay')[22m
    [2m    9 ├ù locator resolved to <div id="auth-overlay" class="auth-overlay">ΓÇª</div>[22m
    [2m      - unexpected value "visible"[22m


      10 |             await page.fill('#auth-password', 'password123');
      11 |             await page.click('#btn-login');
    > 12 |             await expect(page.locator('#auth-overlay')).toBeHidden();
         |                                                         ^
      13 |         }
      14 |     });
      15 |
        at C:\Users\lxtom\.gemini\antigravity\scratch\golf_handicap_tracker\tests\quota-guards.spec.js:12:57

    Error Context: test-results\quota-guards-Phase-3-Infra-4d687-ec-on-Generate-AI-Briefing--chromium\error-context.md


[1A[2K[10/14] [chromium] ΓÇ║ tests\security-rbac.spec.js:36:5 ΓÇ║ Phase 4: Security & RBAC Suite ΓÇ║ Data Isolation: Assert Firestore Security Rules block Player B from reading Player A unshared round ID
[1A[2K  7) [chromium] ΓÇ║ tests\quota-guards.spec.js:44:5 ΓÇ║ Phase 3: Infrastructure & Quota Suite ΓÇ║ Cache Hit Check: Request practice drill when active one exists local state 

    Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeHidden[2m([22m[2m)[22m failed

    Locator:  locator('#auth-overlay')
    Expected: hidden
    Received: visible
    Timeout:  5000ms

    Call log:
    [2m  - Expect "toBeHidden" with timeout 5000ms[22m
    [2m  - waiting for locator('#auth-overlay')[22m
    [2m    9 ├ù locator resolved to <div id="auth-overlay" class="auth-overlay">ΓÇª</div>[22m
    [2m      - unexpected value "visible"[22m


      10 |             await page.fill('#auth-password', 'password123');
      11 |             await page.click('#btn-login');
    > 12 |             await expect(page.locator('#auth-overlay')).toBeHidden();
         |                                                         ^
      13 |         }
      14 |     });
      15 |
        at C:\Users\lxtom\.gemini\antigravity\scratch\golf_handicap_tracker\tests\quota-guards.spec.js:12:57

    Error Context: test-results\quota-guards-Phase-3-Infra-dad17-tive-one-exists-local-state-chromium\error-context.md


[1A[2K  8) [chromium] ΓÇ║ tests\security-rbac.spec.js:16:5 ΓÇ║ Phase 4: Security & RBAC Suite ΓÇ║ The Peeping Tom: Assert standard Player navigating to /coach-dashboard is instantly redirected 

    Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeHidden[2m([22m[2m)[22m failed

    Locator:  locator('#auth-overlay')
    Expected: hidden
    Received: visible
    Timeout:  5000ms

    Call log:
    [2m  - Expect "toBeHidden" with timeout 5000ms[22m
    [2m  - waiting for locator('#auth-overlay')[22m
    [2m    9 ├ù locator resolved to <div id="auth-overlay" class="auth-overlay">ΓÇª</div>[22m
    [2m      - unexpected value "visible"[22m


      10 |             await page.fill('#auth-password', 'password123');
      11 |             await page.click('#btn-login');
    > 12 |             await expect(page.locator('#auth-overlay')).toBeHidden();
         |                                                         ^
      13 |         }
      14 |     });
      15 |
        at C:\Users\lxtom\.gemini\antigravity\scratch\golf_handicap_tracker\tests\security-rbac.spec.js:12:57

    Error Context: test-results\security-rbac-Phase-4-Secu-78ea9-ard-is-instantly-redirected-chromium\error-context.md


[1A[2K[11/14] [chromium] ΓÇ║ tests\ui-ergonomics.spec.js:16:5 ΓÇ║ UI Ergonomics Suite ΓÇ║ WHS Handicap Database: Ensure no horizontal scrolling
[1A[2K[12/14] [chromium] ΓÇ║ tests\ui-ergonomics.spec.js:28:5 ΓÇ║ UI Ergonomics Suite ΓÇ║ Live Scoring +/- buttons have touch target size >= 44x44 pixels
[1A[2K  9) [chromium] ΓÇ║ tests\security-rbac.spec.js:36:5 ΓÇ║ Phase 4: Security & RBAC Suite ΓÇ║ Data Isolation: Assert Firestore Security Rules block Player B from reading Player A unshared round ID 

    Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeHidden[2m([22m[2m)[22m failed

    Locator:  locator('#auth-overlay')
    Expected: hidden
    Received: visible
    Timeout:  5000ms

    Call log:
    [2m  - Expect "toBeHidden" with timeout 5000ms[22m
    [2m  - waiting for locator('#auth-overlay')[22m
    [2m    9 ├ù locator resolved to <div id="auth-overlay" class="auth-overlay">ΓÇª</div>[22m
    [2m      - unexpected value "visible"[22m


      10 |             await page.fill('#auth-password', 'password123');
      11 |             await page.click('#btn-login');
    > 12 |             await expect(page.locator('#auth-overlay')).toBeHidden();
         |                                                         ^
      13 |         }
      14 |     });
      15 |
        at C:\Users\lxtom\.gemini\antigravity\scratch\golf_handicap_tracker\tests\security-rbac.spec.js:12:57

    Error Context: test-results\security-rbac-Phase-4-Secu-0681a--Player-A-unshared-round-ID-chromium\error-context.md


[1A[2K[13/14] [chromium] ΓÇ║ tests\ui-ergonomics.spec.js:48:5 ΓÇ║ UI Ergonomics Suite ΓÇ║ Add Club modal tag-balance check does not swallow main-app
[1A[2K  10) [chromium] ΓÇ║ tests\ui-ergonomics.spec.js:28:5 ΓÇ║ UI Ergonomics Suite ΓÇ║ Live Scoring +/- buttons have touch target size >= 44x44 pixels 

    Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeHidden[2m([22m[2m)[22m failed

    Locator:  locator('#auth-overlay')
    Expected: hidden
    Received: visible
    Timeout:  5000ms

    Call log:
    [2m  - Expect "toBeHidden" with timeout 5000ms[22m
    [2m  - waiting for locator('#auth-overlay')[22m
    [2m    9 ├ù locator resolved to <div id="auth-overlay" class="auth-overlay">ΓÇª</div>[22m
    [2m      - unexpected value "visible"[22m


      10 |             await page.fill('#auth-password', 'password123');
      11 |             await page.click('#btn-login');
    > 12 |             await expect(page.locator('#auth-overlay')).toBeHidden();
         |                                                         ^
      13 |         }
      14 |     });
      15 |
        at C:\Users\lxtom\.gemini\antigravity\scratch\golf_handicap_tracker\tests\ui-ergonomics.spec.js:12:57

    Error Context: test-results\ui-ergonomics-UI-Ergonomic-dd44b-ch-target-size-44x44-pixels-chromium\error-context.md


[1A[2K  11) [chromium] ΓÇ║ tests\ui-ergonomics.spec.js:16:5 ΓÇ║ UI Ergonomics Suite ΓÇ║ WHS Handicap Database: Ensure no horizontal scrolling 

    Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeHidden[2m([22m[2m)[22m failed

    Locator:  locator('#auth-overlay')
    Expected: hidden
    Received: visible
    Timeout:  5000ms

    Call log:
    [2m  - Expect "toBeHidden" with timeout 5000ms[22m
    [2m  - waiting for locator('#auth-overlay')[22m
    [2m    9 ├ù locator resolved to <div id="auth-overlay" class="auth-overlay">ΓÇª</div>[22m
    [2m      - unexpected value "visible"[22m


      10 |             await page.fill('#auth-password', 'password123');
      11 |             await page.click('#btn-login');
    > 12 |             await expect(page.locator('#auth-overlay')).toBeHidden();
         |                                                         ^
      13 |         }
      14 |     });
      15 |
        at C:\Users\lxtom\.gemini\antigravity\scratch\golf_handicap_tracker\tests\ui-ergonomics.spec.js:12:57

    Error Context: test-results\ui-ergonomics-UI-Ergonomic-c3f01-ure-no-horizontal-scrolling-chromium\error-context.md


[1A[2K[14/14] [chromium] ΓÇ║ tests\ux-bag-management.spec.js:16:5 ΓÇ║ UX State Persistence Suite: Bag Management ΓÇ║ Add/Remove custom club, assert persistence across reload, and assert in Live Scoring detailed stats
[1A[2K  12) [chromium] ΓÇ║ tests\ui-ergonomics.spec.js:48:5 ΓÇ║ UI Ergonomics Suite ΓÇ║ Add Club modal tag-balance check does not swallow main-app 

    Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeHidden[2m([22m[2m)[22m failed

    Locator:  locator('#auth-overlay')
    Expected: hidden
    Received: visible
    Timeout:  5000ms

    Call log:
    [2m  - Expect "toBeHidden" with timeout 5000ms[22m
    [2m  - waiting for locator('#auth-overlay')[22m
    [2m    9 ├ù locator resolved to <div id="auth-overlay" class="auth-overlay">ΓÇª</div>[22m
    [2m      - unexpected value "visible"[22m


      10 |             await page.fill('#auth-password', 'password123');
      11 |             await page.click('#btn-login');
    > 12 |             await expect(page.locator('#auth-overlay')).toBeHidden();
         |                                                         ^
      13 |         }
      14 |     });
      15 |
        at C:\Users\lxtom\.gemini\antigravity\scratch\golf_handicap_tracker\tests\ui-ergonomics.spec.js:12:57

    Error Context: test-results\ui-ergonomics-UI-Ergonomic-e0025-k-does-not-swallow-main-app-chromium\error-context.md


[1A[2K  13) [chromium] ΓÇ║ tests\ux-bag-management.spec.js:16:5 ΓÇ║ UX State Persistence Suite: Bag Management ΓÇ║ Add/Remove custom club, assert persistence across reload, and assert in Live Scoring detailed stats 

    Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeHidden[2m([22m[2m)[22m failed

    Locator:  locator('#auth-overlay')
    Expected: hidden
    Received: visible
    Timeout:  5000ms

    Call log:
    [2m  - Expect "toBeHidden" with timeout 5000ms[22m
    [2m  - waiting for locator('#auth-overlay')[22m
    [2m    9 ├ù locator resolved to <div id="auth-overlay" class="auth-overlay">ΓÇª</div>[22m
    [2m      - unexpected value "visible"[22m


      10 |             await page.fill('#auth-password', 'password123');
      11 |             await page.click('#btn-login');
    > 12 |             await expect(page.locator('#auth-overlay')).toBeHidden();
         |                                                         ^
      13 |         }
      14 |     });
      15 |
        at C:\Users\lxtom\.gemini\antigravity\scratch\golf_handicap_tracker\tests\ux-bag-management.spec.js:12:57

    Error Context: test-results\ux-bag-management-UX-State-fc099-Live-Scoring-detailed-stats-chromium\error-context.md


[1A[2K  13 failed
    [chromium] ΓÇ║ tests\logic-boundaries.spec.js:21:5 ΓÇ║ Phase 2: Logic & Boundary Suite - Golf Math Constraints ΓÇ║ Time Travel: Assert UI rejects future dates in round creation 
    [chromium] ΓÇ║ tests\logic-boundaries.spec.js:41:5 ΓÇ║ Phase 2: Logic & Boundary Suite - Golf Math Constraints ΓÇ║ WHS Limits: Assert UI rejects handicaps < -10.0 or > 54.0 
    [chromium] ΓÇ║ tests\logic-boundaries.spec.js:58:5 ΓÇ║ Phase 2: Logic & Boundary Suite - Golf Math Constraints ΓÇ║ Fuzzing Scores: Assert UI rejects scores <= 0 and >= 20 for a single hole 
    [chromium] ΓÇ║ tests\logic-boundaries.spec.js:79:5 ΓÇ║ Phase 2: Logic & Boundary Suite - Golf Math Constraints ΓÇ║ Sub-Score Logic: Assert UI throws an error if Putts > Total Score or Penalties >= Total Score 
    [chromium] ΓÇ║ tests\logic-boundaries.spec.js:83:5 ΓÇ║ Phase 2: Logic & Boundary Suite - Golf Math Constraints ΓÇ║ Chip-in Validation: Explicitly verify that Putts = 0 is successfully accepted when Score > 0 
    [chromium] ΓÇ║ tests\quota-guards.spec.js:16:5 ΓÇ║ Phase 3: Infrastructure & Quota Suite ΓÇ║ The Double-Tap: Simulate rapid multi-clicks (5 in 1 sec) on "Generate AI Briefing" 
    [chromium] ΓÇ║ tests\quota-guards.spec.js:44:5 ΓÇ║ Phase 3: Infrastructure & Quota Suite ΓÇ║ Cache Hit Check: Request practice drill when active one exists local state 
    [chromium] ΓÇ║ tests\security-rbac.spec.js:16:5 ΓÇ║ Phase 4: Security & RBAC Suite ΓÇ║ The Peeping Tom: Assert standard Player navigating to /coach-dashboard is instantly redirected 
    [chromium] ΓÇ║ tests\security-rbac.spec.js:36:5 ΓÇ║ Phase 4: Security & RBAC Suite ΓÇ║ Data Isolation: Assert Firestore Security Rules block Player B from reading Player A unshared round ID 
    [chromium] ΓÇ║ tests\ui-ergonomics.spec.js:16:5 ΓÇ║ UI Ergonomics Suite ΓÇ║ WHS Handicap Database: Ensure no horizontal scrolling 
    [chromium] ΓÇ║ tests\ui-ergonomics.spec.js:28:5 ΓÇ║ UI Ergonomics Suite ΓÇ║ Live Scoring +/- buttons have touch target size >= 44x44 pixels 
    [chromium] ΓÇ║ tests\ui-ergonomics.spec.js:48:5 ΓÇ║ UI Ergonomics Suite ΓÇ║ Add Club modal tag-balance check does not swallow main-app 
    [chromium] ΓÇ║ tests\ux-bag-management.spec.js:16:5 ΓÇ║ UX State Persistence Suite: Bag Management ΓÇ║ Add/Remove custom club, assert persistence across reload, and assert in Live Scoring detailed stats 
  1 passed (48.3s)
