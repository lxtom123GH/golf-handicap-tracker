import { describe, it, expect } from 'vitest';
import { createCapture, GPS_POLICY } from '../../src/gps-capture.js';

/** Injectable clock: starts at t=100000, advances only when told. */
function fakeClock() {
    let t = 100000;
    return {
        now: () => t,
        advance: (ms) => { t += ms; },
    };
}

const fix = (accuracyM, { at, speedMps = null } = {}) => ({
    lat: -27.4, lon: 152.9, accuracyM, speedMps,
    at: at ?? 'use-clocks',
});

const offsetLat = (metres) => -27.4 + metres / 111_320;
const distanceM = (a, b) => {
    const latScale = 111_320;
    const lonScale = latScale * Math.cos((a.lat + b.lat) / 2 * Math.PI / 180);
    return Math.hypot((a.lat - b.lat) * latScale, (a.lon - b.lon) * lonScale);
};

describe('GPS_POLICY numbers (tests cite the object, not literals)', () => {
    it('exposes the spec-fixed values', () => {
        expect(GPS_POLICY).toMatchObject({
            acceptNowM: 8, acceptWindowM: 12, lowConfidenceM: 30,
            windowMs: 4000, maxFixAgeMs: 2000, maxSpeedMps: 0.7, preciseOffM: 1000,
            agreementFloorM: 3, reportedAccuracyFloorM: 2,
        });
    });
});

describe('createCapture — acceptance paths', () => {
    it('a 6 m fix after a 9 m fix accepts at once (convergence)', () => {
        const c = fakeClock();
        const cap = createCapture(c.now);
        cap.push(fix(9, { at: c.now() }));
        c.advance(500);
        const d = cap.push(fix(6, { at: c.now() }));
        expect(d.state).toBe('accepted');
        expect(d.fix.accuracyM).toBe(6);
    });

    it('a lone 6 m fix waits — one good fix is not convergence', () => {
        const c = fakeClock();
        const cap = createCapture(c.now);
        const d = cap.push(fix(6, { at: c.now() }));
        expect(d.state).toBe('waiting');
    });

    it('20-15-11 m over 4 s accepts at the end with the 11 m fix', () => {
        const c = fakeClock();
        const cap = createCapture(c.now);
        cap.push(fix(20, { at: c.now() }));
        c.advance(1500); cap.push(fix(15, { at: c.now() }));
        c.advance(1500); cap.push(fix(11, { at: c.now() }));
        c.advance(1100);
        const d = cap.decide({ final: true });
        expect(d.state).toBe('accepted');
        expect(d.fix.accuracyM).toBe(11);
        expect(d.elapsedMs).toBeGreaterThanOrEqual(GPS_POLICY.windowMs - 100);
    });

    it('window-end decision happens automatically once windowMs has passed', () => {
        const c = fakeClock();
        const cap = createCapture(c.now);
        cap.push(fix(20, { at: c.now() }));
        c.advance(GPS_POLICY.windowMs + 1);
        expect(cap.decide().state).toBe('lowConfidence'); // 20 m best
    });
});

describe('createCapture — low confidence and refusal', () => {
    it('20-18-16 gives lowConfidence with the 16 m fix', () => {
        const c = fakeClock();
        const cap = createCapture(c.now);
        cap.push(fix(20, { at: c.now() }));
        cap.push(fix(18, { at: c.now() }));
        cap.push(fix(16, { at: c.now() }));
        const d = cap.decide({ final: true });
        expect(d.state).toBe('lowConfidence');
        expect(d.fix.accuracyM).toBe(16);
    });

    it('45-40 refuses', () => {
        const c = fakeClock();
        const cap = createCapture(c.now);
        cap.push(fix(45, { at: c.now() }));
        cap.push(fix(40, { at: c.now() }));
        const d = cap.decide({ final: true });
        expect(d.state).toBe('refused');
        expect(d.fix.accuracyM).toBe(40);
        expect(d.reason).toMatch(/45|too far/);
    });

    it('no usable fix inside the window refuses outright', () => {
        const c = fakeClock();
        const cap = createCapture(c.now);
        const d = cap.decide({ final: true });
        expect(d.state).toBe('refused');
        expect(d.fix).toBeNull();
    });
});

describe('createCapture — preciseOff and ignored fixes', () => {
    it('1500-1400 gives preciseOff', () => {
        const c = fakeClock();
        const cap = createCapture(c.now);
        cap.push(fix(1500, { at: c.now() }));
        const d = cap.push(fix(1400, { at: c.now() }));
        expect(d.state).toBe('preciseOff');
    });

    it('a 5 m fix while walking (1.2 m/s) is ignored, not accepted', () => {
        const c = fakeClock();
        const cap = createCapture(c.now);
        cap.push(fix(5, { at: c.now(), speedMps: 1.2 }));
        const d = cap.decide({ final: true });
        expect(d.state).toBe('refused');           // nothing usable → refuse
        expect(d.fixCount.ignored).toBe(1);
        expect(d.fixCount.usable).toBe(0);
    });

    it('a fix 3 s old is ignored (stale)', () => {
        const c = fakeClock();
        const cap = createCapture(c.now);
        cap.push(fix(6, { at: c.now() - (GPS_POLICY.maxFixAgeMs + 1000) }));
        const d = cap.decide({ final: true });
        expect(d.fixCount.ignored).toBe(1);
        expect(d.state).toBe('refused');
    });

    it('speedMps null is stationary (desktop/emulator) — the fix is usable', () => {
        const c = fakeClock();
        const cap = createCapture(c.now);
        cap.push(fix(6, { at: c.now(), speedMps: null }));
        const d = cap.decide({ final: true });
        expect(d.state).toBe('accepted');
    });

    it('a decision is frozen — late pushes do not reopen it', () => {
        const c = fakeClock();
        const cap = createCapture(c.now);
        cap.push(fix(9, { at: c.now() }));
        cap.push(fix(6, { at: c.now() }));
        const d1 = cap.decide({ final: true });
        expect(d1.state).toBe('accepted');
        const d2 = cap.push(fix(50, { at: c.now() }));
        expect(d2).toBe(d1);
        expect(d2.fix.accuracyM).toBe(6);
    });
});

describe('createCapture — boundaries ±0.1 at each threshold', () => {
    it('acceptNowM boundary: 8.0 converges with a good prev, 8.1 with prev needs the window', () => {
        const c = fakeClock();
        const capA = createCapture(c.now);
        capA.push(fix(9, { at: c.now() }));
        expect(capA.push(fix(GPS_POLICY.acceptNowM, { at: c.now() })).state).toBe('accepted');

        const capB = createCapture(c.now);
        capB.push(fix(9, { at: c.now() }));
        expect(capB.push(fix(GPS_POLICY.acceptNowM + 0.1, { at: c.now() })).state).toBe('waiting');
    });

    it('acceptPrevM boundary: prev at exactly 10 converges, 10.1 does not', () => {
        const c = fakeClock();
        const capA = createCapture(c.now);
        capA.push(fix(GPS_POLICY.acceptPrevM, { at: c.now() }));
        expect(capA.push(fix(6, { at: c.now() })).state).toBe('accepted');

        const capB = createCapture(c.now);
        capB.push(fix(GPS_POLICY.acceptPrevM + 0.1, { at: c.now() }));
        expect(capB.push(fix(6, { at: c.now() })).state).toBe('waiting');
    });

    it('acceptWindowM boundary at window end: 12.0 accepted, 12.1 lowConfidence', () => {
        const c = fakeClock();
        const capA = createCapture(c.now);
        capA.push(fix(GPS_POLICY.acceptWindowM, { at: c.now() }));
        expect(capA.decide({ final: true }).state).toBe('accepted');

        const capB = createCapture(c.now);
        capB.push(fix(GPS_POLICY.acceptWindowM + 0.1, { at: c.now() }));
        expect(capB.decide({ final: true }).state).toBe('lowConfidence');
    });

    it('lowConfidenceM boundary at window end: 30.0 lowConfidence, 30.1 refused', () => {
        const c = fakeClock();
        const capA = createCapture(c.now);
        capA.push(fix(GPS_POLICY.lowConfidenceM, { at: c.now() }));
        expect(capA.decide({ final: true }).state).toBe('lowConfidence');

        const capB = createCapture(c.now);
        capB.push(fix(GPS_POLICY.lowConfidenceM + 0.1, { at: c.now() }));
        expect(capB.decide({ final: true }).state).toBe('refused');
    });

    it('maxSpeedMps boundary: exactly 0.7 is stationary, above is moving', () => {
        const c = fakeClock();
        const capA = createCapture(c.now);
        capA.push(fix(6, { at: c.now(), speedMps: GPS_POLICY.maxSpeedMps }));
        expect(capA.decide({ final: true }).state).toBe('accepted');

        const capB = createCapture(c.now);
        capB.push(fix(6, { at: c.now(), speedMps: GPS_POLICY.maxSpeedMps + 0.1 }));
        expect(capB.decide({ final: true }).state).toBe('refused');
    });

    it('maxFixAgeMs boundary: exactly 2000 ms old is usable, a hair more is stale', () => {
        const c = fakeClock();
        const capA = createCapture(c.now);
        capA.push(fix(6, { at: c.now() - GPS_POLICY.maxFixAgeMs }));
        expect(capA.decide({ final: true }).state).toBe('accepted');

        const capB = createCapture(c.now);
        capB.push(fix(6, { at: c.now() - GPS_POLICY.maxFixAgeMs - 1 }));
        expect(capB.decide({ final: true }).state).toBe('refused');
    });

    it('best = smallest accuracy; ties go to the newest', () => {
        const c = fakeClock();
        const cap = createCapture(c.now);
        cap.push(fix(12, { at: c.now() }));
        c.advance(1);
        cap.push(fix(10, { at: c.now() }));
        c.advance(1);
        cap.push(fix(10, { at: c.now() }));
        const d = cap.decide({ final: true });
        expect(d.fix.accuracyM).toBe(10);
        expect(d.fix.at).toBe(100002); // tie metadata comes from the newest best fix
    });
});

describe('createCapture — agreeing-fix average', () => {
    it('averages symmetric noise closer to the truth without overstating accuracy', () => {
        const c = fakeClock();
        const cap = createCapture(c.now);
        const truth = { lat: -27.4, lon: 152.9 };
        cap.push({ ...fix(12, { at: c.now() }), lat: offsetLat(6) });
        cap.push({ ...fix(12, { at: c.now() }), lat: truth.lat });
        cap.push({ ...fix(12, { at: c.now() }), lat: offsetLat(-6) });

        const d = cap.decide({ final: true });
        expect(d.state).toBe('accepted');
        expect(distanceM(d.fix, truth)).toBeLessThan(distanceM({ lat: offsetLat(-6), lon: truth.lon }, truth));
        expect(d.fix.lat).toBeCloseTo(truth.lat, 7);
        expect(d.fix.accuracyM).toBe(12);
    });

    it('excludes a distant outlier from the averaged position', () => {
        const c = fakeClock();
        const cap = createCapture(c.now);
        const truth = { lat: -27.4, lon: 152.9 };
        cap.push({ ...fix(11, { at: c.now() }), lat: truth.lat });
        cap.push({ ...fix(12, { at: c.now() }), lat: offsetLat(2) });
        cap.push({ ...fix(13, { at: c.now() }), lat: offsetLat(40) });

        const d = cap.decide({ final: true });
        expect(d.state).toBe('accepted');
        expect(distanceM(d.fix, truth)).toBeLessThan(2);
        expect(d.fix.accuracyM).toBe(11);
    });

    it('weights each agreeing fix by inverse accuracy squared', () => {
        const c = fakeClock();
        const cap = createCapture(c.now);
        const truth = { lat: -27.4, lon: 152.9 };
        const distantOffsetM = 6;
        cap.push({ ...fix(11, { at: c.now() }), lat: truth.lat });
        cap.push({ ...fix(12, { at: c.now() }), lat: offsetLat(distantOffsetM) });

        const d = cap.decide({ final: true });
        const expectedOffsetM = distantOffsetM * (1 / 12 ** 2) / (1 / 11 ** 2 + 1 / 12 ** 2);
        expect(d.state).toBe('accepted');
        expect(distanceM(d.fix, truth)).toBeCloseTo(expectedOffsetM, 2);
    });

    it('returns a single accepted fix exactly as before', () => {
        const c = fakeClock();
        const cap = createCapture(c.now);
        const single = fix(6, { at: c.now() });
        cap.push(single);

        const d = cap.decide({ final: true });
        expect(d.state).toBe('accepted');
        expect(d.fix).toEqual(single);
    });

    it('repeated callbacks do not make reported accuracy look better', () => {
        const c = fakeClock();
        const cap = createCapture(c.now, { ...GPS_POLICY, acceptPrevM: 0 });
        for (let i = 0; i < 100; i++) cap.push(fix(4, { at: c.now() }));

        expect(cap.decide({ final: true }).fix.accuracyM).toBe(4);
    });

    it('applies a minimum reported-accuracy floor to averaged fixes', () => {
        const c = fakeClock();
        const policy = { ...GPS_POLICY, acceptPrevM: 0, reportedAccuracyFloorM: 3 };
        const cap = createCapture(c.now, policy);
        for (let i = 0; i < 100; i++) cap.push(fix(1, { at: c.now() }));

        expect(cap.decide({ final: true }).fix.accuracyM).toBe(3);
    });
});
