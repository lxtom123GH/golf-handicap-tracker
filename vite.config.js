import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Owner feedback 2026-07-05: the displayed version was a hand-maintained meta
// tag that went stale for weeks while ~40 PRs shipped, making a current build
// look old. Stamp the truth at build time instead: package.json version +
// build moment + commit. ui.js renders these; the meta tag is now fallback only.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

let commit = 'local';
try {
    commit = execSync('git rev-parse --short HEAD').toString().trim();
} catch { /* not a git checkout (e.g. some CI tarballs) — 'local' is honest */ }
// Flight recorder: the FULL sha of the executing bundle, embedded at build
// time ('unknown' when not a git checkout). No metadata fetch is needed to
// identify the code that is actually running.
let commitFull = 'unknown';
try {
    commitFull = execSync('git rev-parse HEAD').toString().trim();
} catch { /* 'unknown' is honest */ }

// CI builds run in UTC — pin the stamp to Brisbane so "built 1 AM" can't
// happen to an afternoon deploy (owner feedback 2026-07-05).
const stamp = new Date().toLocaleString('en-AU', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: 'Australia/Brisbane'
});

// Owner 2026-09-19: "I couldn't tell whether there's a new version." The
// build also emits /version.json so the running app can ask the live site
// what the latest deploy is (src/update-watch.js fetches it with no-store;
// firebase.json serves it no-store). Same stamp as the defines above.
const versionJson = () => ({
    name: 'golf-version-json',
    generateBundle() {
        this.emitFile({
            type: 'asset',
            fileName: 'version.json',
            source: JSON.stringify({
                version: `v${pkg.version}`, commit, stamp, builtAt: new Date().toISOString()
            })
        });
    }
});

// Only generated same-origin build assets; no API responses or user data.
export const offlineShellManifest = () => ({
    name: 'golf-offline-shell-manifest',
    generateBundle(_options, bundle) {
        const assets = Object.keys(bundle)
            .filter(name => /^assets\/[\w.-]+\.(?:js|css)$/.test(name))
            .sort().map(name => `/${name}`);
        if (!assets.length) throw new Error('No JavaScript/CSS assets for the offline shell');
        this.emitFile({ type: 'asset', fileName: 'offline-shell.json', source: JSON.stringify(assets) });
    }
});

export default defineConfig({
    plugins: [versionJson(), offlineShellManifest()],
    define: {
        __APP_VERSION__: JSON.stringify(`v${pkg.version}`),
        __BUILD_STAMP__: JSON.stringify(stamp),
        __BUILD_COMMIT__: JSON.stringify(commit),
        __BUILD_COMMIT_FULL__: JSON.stringify(commitFull)
    },
    build: {
        chunkSizeWarningLimit: 1000
    }
});
