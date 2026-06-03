# Comprehensive Cross-Module Audit & Roadmap

## Executive Summary
The PWA architecture is stabilizing around a micro-modular Vanilla JS structure. The recent extraction of `src/oncourse.js` into `src/modules/` successfully isolated the Locker Room UI and the Shot Wizard telemetry logic. The core Firebase infrastructure is correctly pinned, but significant front-end rendering debt (heavy `!important` CSS tags and destructive DOM rendering) threatens performance and offline resilience.

## Architectural Violations
### 1. The `!important` Epidemic
The `src/style.css` file contains widespread usage of `!important` tags, violating the zero-`!important` constraint. These tags cause severe cascading logic errors and make mobile responsive behavior extremely brittle.
**Violations Found:**
- Utility colors: `.text-success`, `.text-warning`, `.text-danger` (Lines 114-116).
- Display overrides: `display: block !important`, `display: none !important`, `visibility: hidden !important` (Lines 586-595, 840, 856, 904, 1085-1093).
- Navigation & Action Bars: Deeply nested safe-area overrides on `.fixed-action-btn` and bottom menus (Lines 1056-1073).

### 2. State-Driven UI Compliance
- **Direct DOM Manipulation**: Numerous files (`competitions.js`, `social.js`, `card-render.js`) execute raw `innerHTML` string interpolation rather than pushing payload objects to the `AppState` proxy.
- **Missing `data-active-tab`**: The `body[data-active-tab]` state constraint is completely missing. Modules currently rely on querying `.tab-content.active`, leading to potential race conditions during CSS animations.

### 3. Scroll Guarding (PIR-2026-03-08-01)
- The mandate to use `overflow-anchor: none` to prevent layout shifts during live scoring updates is entirely missing from `src/style.css` and the inline styles of `src/modules/card-render.js`. Leaderboard injections will cause disruptive scroll jumps on mobile devices.

## Optimization Opportunities
### 1. Haversine Telemetry (`telemetry.js`)
Currently, `telemetry.js` correctly triggers off the `gpsLocation` proxy event.
**Opportunity**: Introduce a spatial debounce (e.g., only calculate logic if the user has moved >5 meters) to prevent extreme battery drain and redundant Haversine calculations during passive GPS drift.

### 2. The 9-Box Tracking
**Opportunity**: The `updateLiveLeaderboard` logic recalculates total Stableford scores from scratch for every player on every single shot log. Moving the scoring logic to a progressive tally inside `AppState.liveRoundGroups` would drop the time complexity of the rendering loop.

## Security & Firebase Hardening Review
- **Emulator Sniffer**: The environment sniffer correctly routes `localhost` and `127.0.0.1` traffic to ports 9099, 8080, and 5001.
- **Regional Locking**: Cloud Functions correctly target `australia-southeast1` via `getFunctions(app, 'australia-southeast1')`.
- **Firestore Rules**: Granular RBAC (`isAdmin`, `isCoachOf`) successfully restricts `whs_rounds`, `shots`, and `practice_rounds` to only owners and authorized coaches. The schema is highly secure.
