// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

// Register the actual rules spec in a tiny hook harness; no emulator required.
const source = readFileSync('tests/rules/firestore.test.js', 'utf8').replace(/^import .*;$/gm, '');
const register = new Function('initializeTestEnvironment', 'readFileSync', 'resolve', '__dirname',
    'beforeAll', 'beforeEach', 'afterAll', 'it', 'describe', source);

afterEach(() => vi.restoreAllMocks());

function hooks(initialize) {
    const before = vi.fn(), after = vi.fn();
    register(initialize, () => 'rules', (...args) => args.join('/'), 'tests/rules',
        before, vi.fn(), after, vi.fn(), vi.fn());
    return { setup: before.mock.calls[0], cleanup: after.mock.calls[0][0] };
}

it('limits extra startup time to rules initialization, not every suite hook', () => {
    const { setup } = hooks(vi.fn());
    expect(setup[1]).toBe(20_000);
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.scripts['test:rules']).not.toContain('--hookTimeout');
});

it('reports slow initialization with elapsed time instead of silently passing', async () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValue(13_500);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cleanup = vi.fn();
    const { setup, cleanup: teardown } = hooks(vi.fn().mockResolvedValue({ cleanup }));
    await setup[0]();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/13500ms.*127\.0\.0\.1:/));
    await teardown();
    expect(cleanup).toHaveBeenCalledOnce();
});

it('keeps initialization failures visible and avoids a second cleanup error', async () => {
    const failure = new Error('emulator unreachable');
    const { setup, cleanup } = hooks(vi.fn().mockRejectedValue(failure));
    await expect(setup[0]()).rejects.toBe(failure);
    await expect(cleanup()).resolves.toBeUndefined();
});
