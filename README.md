# Golf Handicap Tracker - Cloud Edition

A premium, PWA-ready golf score and activity tracker designed for high-performance use on the course.

## 📱 PWA Features
- **Standalone Display**: Native application feel with dedicated splash screens and no browser chrome.
- **Service Worker Lifecycle**: Automated cache purging and version management (currently v6.1.8).
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

---

## 🧭 Navigation Lifecycle (v6.1.8)

The application employs a **Dynamic Refresh Architecture** to ensure data consistency without full-page reloads.

1.  **Direct Boot**: Upon authentication, the `Security Heartbeat` automatically redirects the user to their last-visted tab (persisted in `localStorage`).
2.  **Universal Hooks**: The `switchTab` navigation bridge triggers specific "Lifecycle Hooks" for dynamic modules:
    - **Admin Dashboard**: Triggers `refreshAdminDashboard()` to fetch the latest user management list.
    - **Coach Portal**: Triggers `refreshCoachDashboard()` to sync the athlete roster.
    - **Social Feed**: Triggers `refreshSocialFeed()` to pull the latest activity from your network.
3.  **Scroll Reset**: Every tab switch automatically executes `window.scrollTo(0, 0)` for a clean UI entry.
4.  **Authorized Initialization**: Admin and Coach specific logic is initialized **only after** roles are confirmed by the Firebase Auth callback, preventing empty dashboards.
