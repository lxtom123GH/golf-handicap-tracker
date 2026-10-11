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

it('invokes the WebKit install hook through the existing CI Playwright command', () => {
    const ci = readFileSync('.github/workflows/test.yml', 'utf8');
    expect(ci.includes('npx playwright test')).toBe(true);
    expect(config.globalSetup).toBe('./tests/e2e/helpers/install-webkit.js');
});
