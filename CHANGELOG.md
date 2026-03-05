# Changelog - Golf Handicap Tracker

## [v6.7.5] - 2026-03-05
### Added
- **Glassmorphism Navigation**: Implemented translucent tab bar with backdrop-filter blur for a premium UI feel.
- **Safe Area Hardening**: Added `env(safe-area-inset-bottom)` support for edge-to-edge mobile displays.
- **High-Contrast GPS**: Increased yardage display weight (900) and size (2.2rem) for direct sunlight readability.
- **Scroll Reset**: Automatic scroll-to-top on tab navigation.
### Fixed
- **Navigation Overlap**: Increased container padding-bottom to 120px to prevent the fixed nav bar from obscuring interactive buttons.

## [v6.1.7] - 2026-03-04
### Added
- **Full Refresh Hooks**: Integrated universal `refreshCoachDashboard` and `refreshSocialFeed` hooks into the navigation bridge.
- **Security Heartbeat**: Implemented explicit UI synchronization in the Auth callback to boot directly into authorized states.
### Changed
- **Feed Lifecycle**: Removed one-shot initialization for the Social Feed, making it refresh on every click.

## [v6.1.6] - 2026-03-04
### Fixed
- **Admin Dashboard Stabilization**: Moved `bindAdminTools` into the `onAuthStateChanged` callback to ensure roles are confirmed before dashboard construction.
- **Stale User List**: Implemented `window.refreshAdminDashboard` with fresh Firestore fetches to eliminate stale data bugs.

## [v6.1.5] - 2026-03-04
### Fixed
- **Structural Restoration**: Resolved a critical DOM failure where secondary tabs (Settings, Admin) were physically nested inside the On-Course tab content. All tabs are now siblings under the main-app container.
- **Tag Balance**: Performed a full audit and closure of all tracking sections to prevent visual artifacts.

## [v6.1.3] - 2026-03-03
### Fixed
- **Service Worker Deadlock**: Renamed cache to `golf-cache-v6.1.3` and added `self.skipWaiting()` to ensure immediate updates.
- **Cache Purging**: Implemented selective cache deletion in the activation listener.
