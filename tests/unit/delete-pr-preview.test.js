// delete-pr-preview.test.js — the PR preview cleanup only ever touches the
// closed PR's own channel, never "live" or another PR's (pr26 vs pr260).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { channelsForPr } from '../../scripts/delete-pr-preview.mjs';

const P = 'projects/golf-handicap-tracker-b677c/sites/golf-handicap-tracker-b677c/channels/';
const ALL = ['live', 'pr260-feat-d31-no-remount', 'pr26-old', 'pr2600-x', 'pr275-feat-d32-map-first', 'xpr260-y'].map((c) => P + c);

describe('channelsForPr', () => {
    it('picks only "pr<N>-…" for that exact PR', () => {
        expect(channelsForPr(260, ALL)).toEqual(['pr260-feat-d31-no-remount']);
        expect(channelsForPr('26', ALL)).toEqual(['pr26-old']);
    });
    it('never returns live, and nothing for a PR with no channel', () => {
        expect(channelsForPr(1, ALL)).toEqual([]);
        expect(channelsForPr(260, [P + 'live'])).toEqual([]);
    });
    it('rejects a non-numeric PR (no "pr-" wildcard)', () => {
        expect(() => channelsForPr('', ALL)).toThrow();
        expect(() => channelsForPr('26*', ALL)).toThrow();
    });
});

describe('workflows', () => {
    const wf = (f) => fs.readFileSync(path.resolve(__dirname, '../../.github/workflows', f), 'utf8');
    it('cleanup runs on PR close, from main, with the hosting service account', () => {
        const y = wf('firebase-preview-cleanup.yml');
        expect(y).toMatch(/types: \[closed\]/);
        expect(y).toMatch(/ref: \$\{\{ github\.event\.repository\.default_branch \}\}/);
        // Never sparse: self-hosted runners reuse the workspace and checkout does
        // not undo sparse mode, so the next job lost package-lock.json (08 Oct).
        expect(y).not.toMatch(/sparse-checkout/);
        expect(y).toMatch(/node scripts\/delete-pr-preview\.mjs \$\{\{ github\.event\.pull_request\.number \}\}/);
    });
    it('previews expire after 3 days as a backstop', () => {
        expect(wf('firebase-preview.yml')).toMatch(/expires: 3d/);
    });
});
