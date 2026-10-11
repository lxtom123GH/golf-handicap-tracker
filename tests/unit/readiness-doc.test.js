// @vitest-environment node
import { expect, it } from 'vitest';
import { existsSync } from 'node:fs';

it('keeps the dated personal readiness/deployment report out of the repo root', () => {
    expect(existsSync('SUNDAY-READINESS.md')).toBe(false);
});
