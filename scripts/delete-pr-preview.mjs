// Deletes a closed PR's Firebase Hosting preview channel(s).
//
// Why: the project allows 50 hosting channels. Every PR's preview kept its
// channel for 7 days after the PR closed, so with many PRs in flight the next
// preview deploy failed "channel quota reached" (owner 2026-10-07: #260's
// build_and_preview went red on quota, not code). firebase-preview-cleanup.yml
// runs this when a PR is merged or closed.
//
// Usage: node scripts/delete-pr-preview.mjs <prNumber>
// Env:   FIREBASE_SA_JSON (service-account JSON), FIREBASE_PROJECT (optional)
import { execFileSync } from 'node:child_process';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PROJECT = process.env.FIREBASE_PROJECT || 'golf-handicap-tracker-b677c';

/** Channel IDs the hosting action made for this PR: "pr<N>-<branch…>". Never "live". */
export function channelsForPr(pr, channelNames) {
    const n = String(pr);
    if (!/^\d+$/.test(n)) throw new Error(`bad PR number: ${pr}`);
    return channelNames
        .map((name) => name.split('/').pop())
        .filter((id) => id !== 'live' && id.startsWith(`pr${n}-`));
}

function firebase(args) {
    // npx is a .cmd on Windows (the self-hosted runner), so go through the shell.
    return execFileSync('npx', ['--yes', 'firebase-tools@15', ...args, '--project', PROJECT, '--non-interactive'],
        { encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'inherit'] });
}

function main() {
    const pr = process.argv[2];
    const sa = process.env.FIREBASE_SA_JSON;
    if (!sa) throw new Error('FIREBASE_SA_JSON is not set');
    const dir = mkdtempSync(path.join(tmpdir(), 'fb-sa-'));
    const saPath = path.join(dir, 'sa.json');
    writeFileSync(saPath, sa, { mode: 0o600 });
    process.env.GOOGLE_APPLICATION_CREDENTIALS = saPath;
    try {
        const out = firebase(['hosting:channel:list', '--json']);
        const names = (JSON.parse(out.slice(out.indexOf('{'))).result?.channels || []).map((c) => c.name);
        const ids = channelsForPr(pr, names);
        if (!ids.length) { console.log(`PR #${pr}: no preview channel (already expired or never deployed).`); return; }
        for (const id of ids) {
            firebase(['hosting:channel:delete', id, '--force']);
            console.log(`PR #${pr}: deleted preview channel ${id}`);
        }
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();
