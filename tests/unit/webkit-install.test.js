// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }));
import { spawnSync } from 'node:child_process';
import installWebkit from '../e2e/helpers/install-webkit.js';

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

it('installs WebKit and platform dependencies in CI without a shell', () => {
    vi.stubEnv('CI', 'true');
    spawnSync.mockReturnValue({ status: 0 });
    installWebkit();
    const [command, args, options] = spawnSync.mock.calls[0];
    expect(command).toBe(process.execPath);
    expect(args.slice(1)).toEqual(['install', '--with-deps', 'webkit']);
    expect(options.shell).not.toBe(true);
});

it('does not install browsers in local runs', () => {
    vi.stubEnv('CI', '');
    installWebkit();
    expect(spawnSync).not.toHaveBeenCalled();
});

it('reports install failure so CI cannot silently skip WebKit', () => {
    vi.stubEnv('CI', 'true');
    spawnSync.mockReturnValue({ status: 1 });
    expect(installWebkit).toThrow('WebKit installation failed (exit 1)');
});
