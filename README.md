# Golf Handicap Tracker - Cloud Edition

A professional-grade Golf Handicap Tracker and Performance Analytics platform built with modern web technologies. Focused on World Handicap System (WHS) compliance, sequential shot tracking, and AI-driven coaching insights.

## 🚀 Key Features

- **WHS Compliant Scoring**: Automatic calculation of Slopes, Ratings, and Handicap Differentials based on Australian WHS guidelines.
- **On-Course Tracking**: Real-time hole-by-hole score entry with integrated shot-level detail (Distance, Curve, Result).
- **Tempo Audio Engine**: An advanced metronome and swing cadence tool (`src/tempo.js`) to help players maintain consistent rhythms on the range.
- **AI Coach**: Powered by Google Gemini, the AI analyzes your last 10 rounds and practice sessions to generate custom lesson plans.
- **Coach Portal**: Professional interface for coaches to manage rosters, view athlete performance trends, and release students.
- **Custom Competitions**: Create and log rounds for multi-player competitions with custom scoring rules.

## 🏗️ Architecture

- **Frontend**: [Vite](https://vitejs.dev/) - Fast, modular ES6 development and optimized production builds.
- **Backend & Persistence**: [Firebase](https://firebase.google.com/)
    - **Firestore**: Real-time NoSQL database for player scores, shots, and user profiles.
    - **Authentication**: Secure email/password login and professional role-based access.
    - **Cloud Functions**: Backend logic for secure AI prompt generation.
    - **Hosting**: Scalable delivery of the application to mobile and desktop browsers.
- **State Management**: Reactive Proxy-based state system in `src/state.js` for seamless UI updates.
- **Scoring Engine**: Mathematical implementation of Stableford and WHS Adjusted Gross Score (AGS) in `src/whs.js`.

## 🛠️ Local Development

### Prerequisites

- Node.js (v18+)
- Firebase CLI (`npm install -g firebase-tools`)

### Setup

1. **Clone and Install**:
    ```bash
    git clone [repository-url]
    cd golf_handicap_tracker
    npm install
    ```

2. **Configure Firebase**:
    - Create a project on the [Firebase Console](https://console.firebase.google.com/).
    - Enable Firestore, Authentication, and Hosting.
    - Copy your config into `src/firebase-config.js`.

3. **Run Locally**:
    ```bash
    npm run dev
    ```
    The app will be available at `http://localhost:5173`.

### Testing

- **Unit Tests**: `npm run test:unit`
- **Security Rules**: `npm run test:rules`
- **End-to-End**: `npm run test:e2e`

## 📦 Deployment

```bash
npm run build
firebase deploy --only hosting
```

---
*Created with the help of Antigravity AI.*
