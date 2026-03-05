import { defineConfig, devices } from '@playwright/test';

/**
 * Chaos Suite: Firebase Emulator Isolation
 * Ensures all E2E tests target the local emulator rather than production data.
 */
export default defineConfig({
    testDir: './tests',
    testMatch: ['**/logic-boundaries.spec.js', '**/quota-guards.spec.js', '**/security-rbac.spec.js', '**/async-coach.spec.js', '**/ux-bag-management.spec.js', '**/ui-ergonomics.spec.js'],
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',
    use: {
        // Base URL targets the Firebase Local Hosting Emulator
        baseURL: 'http://localhost:5000',
        trace: 'on-first-retry',
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],

    // Automatically start and tear down Firebase Emulators
    webServer: {
        command: 'npx firebase emulators:start --project demo-chaos-test',
        url: 'http://localhost:5000',
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
    },
});
