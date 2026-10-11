// Run Playwright against emulators on PRIVATE ports, so a local run never
// collides with the dev emulators (8080/9099/4300) or the self-hosted CI
// runner on this box (firebase.ci.json, 18080/19099/14300).
//
// Usage: node scripts/run-e2e-isolated.mjs [playwright args...]
// Base port via E2E_PORT_BASE (default 30000): firestore +8080, auth +9099,
// preview +4300. The emulators are started by playwright.config.js's
// webServer with a generated config, or reused if already listening.
import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const base = Number(process.env.E2E_PORT_BASE || 30000);
const fs = base + 8080, auth = base + 9099, preview = base + 4300;
const config = 'firebase.e2e-isolated.local.json';
writeFileSync(config, JSON.stringify({
    firestore: { rules: 'firestore.rules', indexes: 'firestore.indexes.json' },
    emulators: {
        auth: { port: auth }, firestore: { port: fs }, ui: { enabled: false }, singleProjectMode: true,
        hub: { port: base + 4400 }, logging: { port: base + 4500 },
    },
}, null, 2));

const env = {
    ...process.env,
    EMU_CONFIG: config,
    EMU_FS_PORT: String(fs), EMU_AUTH_PORT: String(auth),
    VITE_EMU_FS_PORT: String(fs), VITE_EMU_AUTH_PORT: String(auth),
    VITE_PREVIEW_PORT: String(preview),
};
const cli = fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url));
let status;
try {
    const r = spawnSync(process.execPath, [cli, 'test', ...process.argv.slice(2)], { stdio: 'inherit', env });
    status = r.status ?? 1;
} finally {
    unlinkSync(config);
}
process.exit(status);
