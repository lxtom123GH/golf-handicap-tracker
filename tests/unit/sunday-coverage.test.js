// @vitest-environment node
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import config from '../../playwright.config.js';

it('runs the West-round journey in WebKit with geolocation', () => {
    const project = config.projects.find(p => p.name === 'iphone-webkit');
    expect(project).toBeDefined();
    expect(project.use.browserName).toBe('webkit');
    expect(project.use.permissions).toContain('geolocation');
    expect(project.testMatch).toBe('**/keperra-west-round.spec.js');
});

it('invokes the WebKit install hook through the CI E2E command', () => {
    const ci = readFileSync('.github/workflows/test.yml', 'utf8');
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(ci.includes('npm run test:e2e')).toBe(true);
    expect(packageJson.scripts['test:e2e']).toBe('node scripts/run-e2e.mjs');
    expect(config.projects.some(project => project.name === 'iphone-webkit')).toBe(true);
    expect(config.globalSetup).toBe('./tests/e2e/helpers/install-webkit.js');
});
