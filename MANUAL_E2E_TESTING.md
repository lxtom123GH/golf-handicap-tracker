# Manual End-to-End (E2E) Testing Guide

Since automated testing libraries (like Playwright/Cypress) require an Node.js/npm environment which is currently unavailable on this system, please follow this manual testing script to verify the application's core functionality.

**Prerequisites:**
1. Serve the `golf_handicap_tracker` directory using a local web server (e.g., using a VS Code Live Server extension or Python's `http.server`).
2. Open the app in your primary browser. Check the Developer Console (F12) for any obvious initial errors.

## Test Flow 1: Authentication & Onboarding
1. **Goal:** Verify that a new user can sign up and reach the dashboard.
2. **Steps:**
   - On the `index.html` main screen, try submitting a completely blank signup form. Ensure validation prevents submission.
   - Fill out an email and password that you control.
   - Click "Sign Up".
   - *Expected Result:* The app should transition to the main dashboard. It should show a welcome message and an empty state for rounds history.

## Test Flow 2: Core Loop - Adding a WHS Round
1. **Goal:** Verify the core value proposition works (adding a score and seeing the handicap update).
2. **Steps:**
   - In the dashboard, locate the "Add Round" section (or equivalent modal).
   - Enter a course name (e.g., "Pebble Beach").
   - Enter Rating (e.g., "75.5") and Slope (e.g., "145").
   - Enter an Adjusted Gross Score (e.g., "82").
   - Submit the form.
   - *Expected Result:* 
     - The round should immediately appear in the History table.
     - The "Current WHS Index" card at the top should update. If this is the FIRST round, the index might say "N/A" or "Need 3 scores", depending on the logic. 
     - Enter 2 more rounds with different scores to verify the index finally calculates and displays a number once 3 rounds are logged.

## Test Flow 3: History Management
1. **Goal:** Verify users can manage their past data.
2. **Steps:**
   - Find a round in the History table.
   - Click the "Exclude" button (toggle counting rules).
   - *Expected Result:* The row should visibly change (e.g., strikethrough), and the top-level WHS Index should recalculate immediately, excluding that round.
   - Click the "X" (Delete) button on a round.
   - Confirm the deletion prompt.
   - *Expected Result:* The round disappears, and the WHS Index recalculates.

## Test Flow 4: Security Rules Verification
1. **Goal:** Ensure data is isolated.
2. **Steps:**
   - Log out of your current account.
   - Log in (or sign up) with a completely different email.
   - *Expected Result:* The dashboard should be empty. You should NOT see the "Pebble Beach" round you added from the first account.
