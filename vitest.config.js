import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        globals: true,
        maxWorkers: 4,
        setupFiles: ['./tests/vitest.setup.js'],
        exclude: ['**/node_modules/**', '**/dist/**', '**/tests/e2e/**'],
    },
});
