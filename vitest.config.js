import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: [], // Optional setup scripts can go here
        exclude: ['**/node_modules/**', '**/dist/**', '**/tests/e2e/**', '**/tests/rules/**'],
    },
});
