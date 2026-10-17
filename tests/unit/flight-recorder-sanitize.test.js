// Flight recorder: the allowlist sanitizer (src/diagnostics/sanitize.js).
// Privacy fixtures go IN raw; what comes out is all that can ever be stored.
import { describe, it, expect } from 'vitest';
import { sanitizeEvent, errorFields, fileOf, MAX_EVENT_BYTES } from '../../src/diagnostics/sanitize.js';

const T = 1_760_000_000_000;
const JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
const UID = 'aBcDeFgHiJkLmNoPqRsTuVwXyZ12'; // 28 chars, Firebase-uid shaped

const PRIVATE = [
    'alex@example.com', 'lxtom123@gmail.com', JWT, `Bearer ${JWT}`, 'bearer abc.def',
    UID, 'https://x.example/a?token=abc#frag', 'https://user:pw@x.example/p',
    'Played with John Smith', 'note: sliced into trees', '-27.4123,152.9876',
];

describe('sanitizeEvent: allowlist only', () => {
    it('drops unknown event types and non-objects', () => {
        expect(sanitizeEvent({ t: T, k: 'whatever' })).toBeNull();
        expect(sanitizeEvent(null)).toBeNull();
        expect(sanitizeEvent('gps')).toBeNull();
        expect(sanitizeEvent({ k: 'gps' })).toBeNull();          // no time
        expect(sanitizeEvent({ t: NaN, k: 'gps' })).toBeNull();
    });

    it('keeps typed allowlisted fields and drops everything else', () => {
        const out = sanitizeEvent({
            t: T, k: 'gps', hole: 7, acc: 4.26, f: 140, c: 152, b: null,
            lat: -27.41, lon: 152.98, latitude: -27.4, coords: { lat: 1 },
            email: 'alex@example.com', uid: UID, name2: 'x', note: 'free text', displayName: 'Alex',
        });
        expect(out).toEqual({ t: T, k: 'gps', hole: 7, acc: 4.3, f: 140, c: 152, b: null });
    });

    it('never stores any private fixture in ANY string field', () => {
        const stringFields = ['round', 'code', 'name', 'course', 'tab', 'tee', 'src', 'build', 'status', 'kind'];
        for (const v of PRIVATE) {
            const raw = { t: T, k: 'error' };
            for (const f of stringFields) raw[f] = v;
            const out = sanitizeEvent(raw);
            const bytes = JSON.stringify(out);
            expect(bytes).not.toContain('@');
            expect(bytes).not.toContain('eyJ');
            expect(bytes).not.toContain(UID);
            expect(bytes).not.toContain('?');
            expect(bytes).not.toContain(' ');
            expect(bytes.toLowerCase()).not.toContain('bearer');
        }
    });

    it('rejects nested objects, arrays, BigInt, functions and symbols as field values', () => {
        const out = sanitizeEvent({ t: T, k: 'write', kind: { a: 1 }, n: 10n, ms: [1], code: () => 'x', status: Symbol('s') });
        expect(out).toEqual({ t: T, k: 'write' });
    });

    it('survives throwing getters, cycles and huge or Unicode strings with bounded work', () => {
        const evil = { t: T, k: 'error' };
        Object.defineProperty(evil, 'code', { enumerable: true, get() { throw new Error('boom'); } });
        evil.self = evil;
        evil.name = 'É'.repeat(1_000_000);
        evil.course = '😀'.repeat(10);
        const out = sanitizeEvent(evil);
        expect(out).toEqual({ t: T, k: 'error' });
    });

    it('reads at most MAX_KEYS fields of a wide object', () => {
        const wide = { t: T, k: 'gps' };
        for (let i = 0; i < 10000; i++) wide['x' + i] = i;
        wide.hole = 3; // after the cap: not read
        expect(sanitizeEvent(wide)).toEqual({ t: T, k: 'gps' });
    });

    it('clamps numbers and never emits more than MAX_EVENT_BYTES', () => {
        const out = sanitizeEvent({ t: T, k: 'gps', acc: 1e300, hole: -5, f: 99999 });
        expect(out).toEqual({ t: T, k: 'gps', acc: 100000, hole: 0, f: 2000 });
        const all = { t: T, k: 'boot', build: 'v7.0.0+' + 'a'.repeat(40), code: 'a'.repeat(48), course: 'a'.repeat(40), tab: 'b'.repeat(40), name: 'N'.repeat(40), src: 'f'.repeat(64), round: 'r'.repeat(24), tee: 'T'.repeat(16) };
        expect(JSON.stringify(sanitizeEvent(all)).length).toBeLessThanOrEqual(MAX_EVENT_BYTES);
    });

    it('accepts the real values the app produces', () => {
        expect(sanitizeEvent({ t: T, k: 'round_start', round: 'round_1760000000000', course: 'ashgrove', tee: 'Blue', holes: 18, hole: 10 }))
            .toEqual({ t: T, k: 'round_start', round: 'round_1760000000000', course: 'ashgrove', tee: 'Blue', holes: 18, hole: 10 });
        expect(sanitizeEvent({ t: T, k: 'write', kind: 'round', op: 3, status: 'rejected', code: 'permission-denied', ms: 812 }).code).toBe('permission-denied');
        expect(sanitizeEvent({ t: T, k: 'boot', build: 'v7.0.0+63ad26b32f6330da973fac0582d03e7b89f93c04' }).build).toBe('v7.0.0+63ad26b32f6330da973fac0582d03e7b89f93c04');
    });
});

describe('errorFields: structure only, never the message', () => {
    it('keeps name, code and the top frame basename without query', () => {
        const e = new TypeError('Cannot read alex@example.com token=' + JWT);
        e.code = 'firestore/unavailable';
        e.stack = `TypeError: Cannot read alex@example.com\n    at f (https://golf.example/assets/index-Ab12.js?v=${JWT}#x:12:34)\n    at g (https://golf.example/assets/other.js:1:2)`;
        const f = errorFields(e);
        expect(f).toEqual({ name: 'TypeError', code: 'firestore/unavailable', src: 'index-Ab12.js', line: 12, col: 34 });
        expect(JSON.stringify(f)).not.toContain('alex');
    });

    it('follows Error.cause to a bounded depth, even when cyclic', () => {
        const a = new Error('a'); const b = new Error('b');
        a.cause = b; b.cause = a;
        const f = errorFields(a);
        expect(f.cause).toBe(true);
        expect(f.depth).toBe(5);
    });

    it('counts AggregateError members', () => {
        const f = errorFields(new AggregateError([new Error('x'), new Error('y')], 'secret text'));
        expect(f.name).toBe('AggregateError');
        expect(f.n).toBe(2);
    });

    it('handles arbitrary rejection values and throwing getters', () => {
        expect(errorFields('alex@example.com')).toEqual({ name: 'String' });
        expect(errorFields(undefined)).toEqual({ name: 'Nullish' });
        expect(errorFields(42)).toEqual({ name: 'Primitive' });
        const evil = {}; Object.defineProperty(evil, 'name', { get() { throw new Error('x'); } });
        Object.defineProperty(evil, 'stack', { get() { throw new Error('x'); } });
        expect(errorFields(evil)).toEqual({ name: 'Unknown' });
        expect(errorFields({ name: 'has spaces and alex@example.com' }).name).toBe('Unknown');
    });

    it('fileOf strips path, query, fragment and userinfo', () => {
        expect(fileOf('https://u:p@h.example/a/b/c.js?x=1#y')).toBe('c.js');
        expect(fileOf('https://h.example/a/?token=abc')).toBeUndefined();
        expect(fileOf(42)).toBeUndefined();
    });
});
