import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const playwrightCli = require.resolve('@playwright/test/cli');
const projects = ['desktop', 'iphone-se', 'phone', 'iphone-webkit'];

for (const project of projects) {
    console.log(`\nRunning the ${project} E2E project in an isolated emulator process.\n`);
    const result = spawnSync(process.execPath, [playwrightCli, 'test', `--project=${project}`], {
        env: process.env,
        stdio: 'inherit',
    });

    if (result.error) {
        console.error(`Could not start Playwright for project "${project}": ${result.error.message}`);
        process.exit(1);
    }
    if (result.signal) {
        console.error(`Playwright project "${project}" stopped by ${result.signal}.`);
        process.exit(1);
    }
    if (result.status !== 0) {
        console.error(`Playwright project "${project}" failed with exit code ${result.status}.`);
        process.exit(result.status || 1);
    }
}
