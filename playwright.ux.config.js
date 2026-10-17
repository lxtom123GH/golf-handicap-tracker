import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

// Reuse the demo-only servers and network guards, with a separate test set.
export default defineConfig({
    ...base,
    testIgnore: [],
    testMatch: '**/ux-harness.spec.js',
    projects: base.projects.filter(project => ['phone', 'iphone-se'].includes(project.name)),
});
