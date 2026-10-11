import { describe, expect, it } from 'vitest';
import { firestorePort } from '../e2e/helpers/emulator.js';
import { createStorage } from '../vitest.setup.js';

describe('test harness compatibility', () => {
    it('accepts both the P030 and legacy CI Firestore port names', () => {
        expect(firestorePort({ EMU_FIRESTORE_PORT: '18081' })).toBe(18081);
        expect(firestorePort({ EMU_FS_PORT: '18080' })).toBe(18080);
        expect(firestorePort({ EMU_FIRESTORE_PORT: '18081', EMU_FS_PORT: '18080' })).toBe(18081);
        expect(firestorePort({})).toBe(8080);
    });

    it('does not let storage keys hide methods and supports direct property writes', () => {
        const storage = createStorage();
        storage.setItem('key', 'stored');
        storage.setItem('length', 'also stored');
        expect(storage.getItem('key')).toBe('stored');
        expect(storage.key(0)).toBe('key');
        expect(storage.length).toBe(2);

        storage.direct = 'property';
        expect(storage.getItem('direct')).toBe('property');
        delete storage.direct;
        expect(storage.getItem('direct')).toBeNull();
    });

});
