// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { offlineShellManifest } from '../../vite.config.js';

describe('offline build inventory', () => {
    it('lists all generated entry and lazy JS/CSS assets, excluding data and imagery', () => {
        const emitFile = vi.fn();
        offlineShellManifest().generateBundle.call({ emitFile }, {}, {
            'assets/main-abc.js': {}, 'assets/lazy-def.js': {}, 'assets/main-abc.css': {},
            'assets/photo.jpg': {}, 'version.json': {}, 'index.html': {},
        });
        const file = emitFile.mock.calls[0][0];
        expect(file.fileName).toBe('offline-shell.json');
        expect(JSON.parse(file.source)).toEqual([
            '/assets/lazy-def.js', '/assets/main-abc.css', '/assets/main-abc.js',
        ]);
    });

    it('fails the build rather than advertise an empty offline shell', () => {
        expect(() => offlineShellManifest().generateBundle.call({ emitFile: vi.fn() }, {}, {})).toThrow();
    });
});
