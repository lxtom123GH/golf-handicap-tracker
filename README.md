# Golf Handicap Tracker - Cloud Edition

A premium, PWA-ready golf score and activity tracker designed for high-performance use on the course.

## 📱 PWA Features
- **Standalone Display**: Native application feel with dedicated splash screens and no browser chrome.
- **Service Worker Lifecycle**: Automated cache purging and version management (currently v6.7.5).
- **Safe Area Support**: Optimized for edge-to-edge mobile displays with `safe-area-inset` protection for navigation.
- **Glassmorphism UI**: High-end translucent navigation with backdrop blurring for a premium experience.
- **GPS Integration**: Real-time yardage tracking (Front/Center/Back) with high-contrast, glove-friendly font sizes.

## 🔥 Firestore Architecture

The application uses Google Firestore for real-time synchronization across devices.

### `/users` Collection
Stores player identity and permission tiers.
- `displayName`: Player's public name.
- `handicapIndex`: The current calculated WHS Index.
- `isAdmin`: Boolean flag for Administrative Dashboard access.
- `isCoach`: Boolean flag for Coach Portal access.
- `following`: Sub-collection of followed player UIDs for social feed integration.
- `coaches`: Array of coach UIDs permitted to view the player's data.

### `/whs_rounds` Collection
Stores official round data for handicap calculation.
- `course`: Name of the golf course.
- `date`: Firestore Timestamp of the round.
- `adjustedGross`: The AGS used for WHS calculations.
- `rating / slope`: Course difficulty metrics.
- `stats`: Optional nested object containing `putts`, `gir`, and `fwy` hit percentages.

### `/shots` Collection
Stores granular tracking data for live rounds.
- `holeNumber`: The hole index (1-18).
- `club`: The club used (e.g., Driver, 7i, SW).
- `outcome`: The result of the shot (e.g., Fairway, Green, Miss-Left).
- `coordX / coordY`: Visual coordinates for shot plotting.

## Local UX harness

Run the demo-only UX views from Git Bash:

```sh
mkdir -p "$HOME/golf-harness-tmp"
export TMP="$HOME/golf-harness-tmp"
export TEMP="$TMP"
npm run ux:harness
```

The command starts isolated Auth and Firestore emulators on private ports,
builds the app for `demo-golf-tracker`, and seeds synthetic player, pending,
coach, and admin accounts. It checks the signed-out view too. Playwright runs
both phone and iPhone SE layouts, writes synthetic screenshots to
`docs/ux-harness-screenshots/`, and stubs the Functions emulator so the demo cannot
call paid AI. It uses the existing fixed demo project and loopback guards.
The pending persona has a verified email and is waiting for admin approval.

---

## 🧭 Navigation Lifecycle (v6.7.5)

The application employs a **Dynamic Refresh Architecture** to ensure data consistency without full-page reloads.

1.  **Direct Boot**: Upon authentication, the `Security Heartbeat` automatically redirects the user to their last-visted tab (persisted in `localStorage`).
2.  **Universal Hooks**: The `switchTab` navigation bridge triggers specific "Lifecycle Hooks" for dynamic modules:
    - **Admin Dashboard**: Triggers `refreshAdminDashboard()` to fetch the latest user management list.
    - **Coach Portal**: Triggers `refreshCoachDashboard()` to sync the athlete roster.
    - **Social Feed**: Triggers `refreshSocialFeed()` to pull the latest activity from your network.
3.  **Scroll Reset**: Every tab switch automatically executes `window.scrollTo(0, 0)` for a clean UI entry.
4.  **Authorized Initialization**: Admin and Coach specific logic is initialized **only after** roles are confirmed by the Firebase Auth callback, preventing empty dashboards.

---

## Credits and licences

- **Code:** © the author, all rights reserved. See `LICENSE`.
- **Course maps:** © OpenStreetMap contributors, available under the Open Database
  Licence (ODbL): https://www.openstreetmap.org/copyright
- **Aerial imagery** (`public/courses/imagery/`, and fairway lines traced from it):
  Includes material © State of Queensland (Department of Natural Resources and Mines,
  Manufacturing and Regional and Rural Development); © Planet Labs Netherlands B.V.
  reproduced under licence from Planet and Geoplex, all rights reserved. Source:
  Queensland Imagery – Latest State Program Public Basemap Service,
  https://www.data.qld.gov.au/dataset/queensland-imagery-latest-state-program-public-basemap-service.
  The service mixes State imagery (CC BY 4.0) with Planet imagery (CC BY-SA 4.0); the
  images here are used under Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0),
  https://creativecommons.org/licenses/by-sa/4.0/, which meets the terms of both.
  Changes: the images were cropped and resized from the original, and fairway lines
  were traced from them. These image files and traced lines keep that licence,
  separate from the code's.

  In consideration of the State of Queensland permitting use of this data you
  acknowledge and agree that the State gives no warranty in relation to the data
  (including accuracy, reliability, completeness, currency or suitability) and accepts
  no liability (including without limitation, liability in negligence) for any loss,
  damage or costs (including consequential damage) relating to any use of the data.
- **Font:** Outfit, SIL Open Font License, loaded from Google Fonts.
