import { describe, expect, it } from 'vitest';
import {
    assertDemoHarnessEnvironment, assertDemoHarnessProject, assertDemoHarnessTarget,
} from '../../src/ux-harness-safety.js';

describe('UX harness project safety', () => {
    it('fails loudly when configured with the production Firebase project', () => {
        expect(() => assertDemoHarnessProject('golf-handicap-tracker-b677c'))
            .toThrow(/demo-golf-tracker/);
    });

    it('rejects a production project inherited by the harness runner', () => {
        expect(() => assertDemoHarnessEnvironment({ GCLOUD_PROJECT: 'golf-handicap-tracker-b677c' }))
            .toThrow(/demo-golf-tracker/);
    });

    it('accepts the dedicated demo project', () => {
        expect(assertDemoHarnessProject('demo-golf-tracker')).toBe('demo-golf-tracker');
    });

    it('refuses a non-local emulator endpoint even when the project is a demo', () => {
        expect(() => assertDemoHarnessTarget({
            projectId: 'demo-golf-tracker',
            authHost: 'auth.example.com:9099',
            firestoreHost: '127.0.0.1:8080',
        })).toThrow(/non-local Auth emulator host/);
    });
});
