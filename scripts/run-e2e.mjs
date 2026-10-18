import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const playwrightCli = require.resolve('@playwright/test/cli');
console.log('\nRunning the full E2E matrix in one emulator process.\n');
const result = spawnSync(process.execPath, [playwrightCli, 'test'].concat(process.argv.slice(2)), {
    env: process.env,
    stdio: 'inherit',
});

if (result.error) {
    console.error(`Could not start Playwright: ${result.error.message}`);
    process.exit(1);
}
if (result.signal) {
    console.error(`The E2E suite stopped by ${result.signal}.`);
    process.exit(1);
}
if (result.status !== 0) {
    console.error(`The E2E suite failed with exit code ${result.status}.`);
    process.exit(result.status || 1);
}
