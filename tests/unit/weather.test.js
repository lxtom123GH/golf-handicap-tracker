import { describe, it, expect } from 'vitest';
import { bearingBetween, windComponents, playsLikeDistance, compassLabel, describeShot } from '../../src/weather.js';

describe('bearingBetween', () => {
    it('cardinal directions', () => {
        // Due north and due east from a point near Keperra
        expect(bearingBetween(-27.41, 152.95, -27.40, 152.95)).toBeCloseTo(0, 0);
        expect(bearingBetween(-27.41, 152.95, -27.41, 152.96)).toBeCloseTo(90, 0);
        expect(bearingBetween(-27.40, 152.95, -27.41, 152.95)).toBeCloseTo(180, 0);
    });
});

describe('windComponents', () => {
    it('pure headwind: wind FROM the direction the shot points', () => {
        const { headKmh, crossKmh } = windComponents(0, 0, 20);
        expect(headKmh).toBe(20);
        expect(crossKmh).toBe(0);
    });
    it('pure tailwind: wind from directly behind', () => {
        const { headKmh } = windComponents(180, 0, 20);
        expect(headKmh).toBe(-20);
    });
    it('pure crosswind from the right of the line', () => {
        const { headKmh, crossKmh } = windComponents(90, 0, 20);
        expect(headKmh).toBeCloseTo(0, 5);
        expect(crossKmh).toBe(20);
    });
});

describe('playsLikeDistance', () => {
    it('headwind lengthens ~1% per 1.6 km/h', () => {
        // 16 km/h head = +10% → 150m plays 165m
        expect(playsLikeDistance(150, { headKmh: 16, tempC: 20 })).toBe(165);
    });
    it('tailwind helps half as much', () => {
        // 16 km/h tail = -5% → 150m plays ~143m
        expect(playsLikeDistance(150, { headKmh: -16, tempC: 20 })).toBe(143);
    });
    it('cold air plays longer, capped at ±30%', () => {
        expect(playsLikeDistance(150, { headKmh: 0, tempC: 8 })).toBe(155); // +3%
        expect(playsLikeDistance(150, { headKmh: 160, tempC: 20 })).toBe(195); // capped +30%
    });
});

describe('compassLabel', () => {
    it('labels the 8 points and wraps', () => {
        expect(compassLabel(0)).toBe('N');
        expect(compassLabel(315)).toBe('NW');
        expect(compassLabel(359)).toBe('N');
    });
});

describe('describeShot', () => {
    it('summarises an into-wind shot', () => {
        const wx = { tempC: 15, windKmh: 16, windFromDeg: 0, isRaining: false };
        const r = describeShot(wx, 0, 150); // shot pointing north, wind from north
        expect(r.windWord).toBe('into wind');
        expect(r.playsM).toBeGreaterThan(150);
        expect(r.summary).toContain('16 km/h N');
    });
    it('flags a helping wind', () => {
        const wx = { tempC: 20, windKmh: 16, windFromDeg: 180, isRaining: false };
        expect(describeShot(wx, 0, 150).windWord).toBe('helping');
    });
});
