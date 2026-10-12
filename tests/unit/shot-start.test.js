// ==========================================
// shot-start.test.js — is the hold-still GPS fix this shot's START or its
// Classifies accepted GPS fixes against an expected start position.

// ==========================================
import { describe, it, expect } from 'vitest';
import { classifyCaptureRole, expectedStartXY, SHOT_START } from '../../src/shot-start.js';

describe('classifyCaptureRole', () => {
    it('a distant first-shot fix → finish', () => {
        expect(classifyCaptureRole({ shotNumber: 1, fixXY: [-2.2, 122.8], expectedStartXY: [0, 0] })).toBe('finish');
    });
    it('tee shot logged on the tee (5 m off the mapped tee) → start', () => {
        expect(classifyCaptureRole({ shotNumber: 1, fixXY: [3, 4], expectedStartXY: [0, 0] })).toBe('start');
    });
    it('shot 1 with no expected start passed still uses the tee', () => {
        expect(classifyCaptureRole({ shotNumber: 1, fixXY: [0, 123] })).toBe('finish');
        expect(classifyCaptureRole({ shotNumber: 1, fixXY: [0, 5] })).toBe('start');
    });
    it('shot 2 fix 6 m from the previous finish → start', () => {
        expect(classifyCaptureRole({ shotNumber: 2, fixXY: [10, 206], expectedStartXY: [10, 200] })).toBe('start');
    });
    it('shot 2 fix 60 m from the previous finish → finish', () => {
        expect(classifyCaptureRole({ shotNumber: 2, fixXY: [10, 260], expectedStartXY: [10, 200] })).toBe('finish');
    });
    it('unknown expected start (shot 2+, nothing logged before) → start', () => {
        expect(classifyCaptureRole({ shotNumber: 2, fixXY: [10, 260], expectedStartXY: null })).toBe('start');
        expect(classifyCaptureRole({ shotNumber: 3, fixXY: [10, 260] })).toBe('start');
    });
    it('boundary: exactly nearM is still the start; just past it is the finish', () => {
        expect(SHOT_START.nearM).toBe(20);
        expect(classifyCaptureRole({ shotNumber: 1, fixXY: [0, 20], expectedStartXY: [0, 0] })).toBe('start');
        expect(classifyCaptureRole({ shotNumber: 1, fixXY: [0, 20.1], expectedStartXY: [0, 0] })).toBe('finish');
        expect(classifyCaptureRole({ shotNumber: 1, fixXY: [0, 30], expectedStartXY: [0, 0], nearM: 35 })).toBe('start');
    });
    it('accepts {x, y} objects and refuses garbage as start (old behaviour)', () => {
        expect(classifyCaptureRole({ shotNumber: 2, fixXY: { x: 0, y: 100 }, expectedStartXY: { x: 0, y: 0 } })).toBe('finish');
        expect(classifyCaptureRole({ shotNumber: 1, fixXY: null, expectedStartXY: [0, 0] })).toBe('start');
        expect(classifyCaptureRole({ shotNumber: 1, fixXY: [NaN, 100], expectedStartXY: [0, 0] })).toBe('start');
    });
});

describe('expectedStartXY', () => {
    it('shot 1 is the tee', () => {
        expect(expectedStartXY({ shotNumber: 1, prevShot: null })).toEqual([0, 0]);
    });
    it('shot 2+ prefers the previous finishXY, else the end of its actual line', () => {
        expect(expectedStartXY({ shotNumber: 2, prevShot: { finishXY: { x: 4, y: 180 }, lineActual: [{ x: 0, y: 0 }, { x: 9, y: 170 }] } })).toEqual([4, 180]);
        expect(expectedStartXY({ shotNumber: 2, prevShot: { lineActual: [{ x: 0, y: 0 }, { x: 9, y: 170 }] } })).toEqual([9, 170]);
    });
    it('shot 2+ with nothing known is null', () => {
        expect(expectedStartXY({ shotNumber: 2, prevShot: null })).toBeNull();
        expect(expectedStartXY({ shotNumber: 2, prevShot: { lineActual: [] } })).toBeNull();
    });
});
