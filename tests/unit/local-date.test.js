// ==========================================================================
// local-date.test.js
// F-7 / F-8 / F-10 — the calendar day is the PLAYER's day, not the UTC day
// ==========================================================================
//
// `new Date().toISOString().split('T')[0]` was duplicated across five files.
// It is the UTC day. East of Greenwich that reads as YESTERDAY for the whole
// local morning — ten hours of it at Australia/Brisbane (UTC+10) — so:
//   F-7  the round-date picker defaulted to yesterday AND capped `max` at it,
//        so typing the true local date tripped "Round date can't be in the
//        future" and the round would not start at all;
//   F-10 "End today" ended a strategy period yesterday, and a period starting
//        today was reported as not active until 10am.
// West of Greenwich the same expression fails the other way: after 19:00 in
// New York the UTC day is TOMORROW, so `max` would have permitted a
// future-dated round. Both directions are pinned below.
//
// F-8 is the same clock in a different disguise: the "Log a past round" form
// has a required Date Played that nothing read, and addRound stamped
// serverTimestamp() instead.
//
// Date's local fields are supplied by a small IANA-timezone fixture instead
// of mutating process.env.TZ. That keeps these expectations independent of
// the runner's process timezone and the machine's configured timezone.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/firebase-config.js', () => ({
    db: {},
    auth: { currentUser: { uid: 'u1' } },
    functions: {}
}));

let lastAddDoc = null;
let lastUpdateDoc = null;

vi.mock('firebase/firestore', () => ({
    collection: vi.fn((_db, name) => ({ _path: name })),
    query: vi.fn((c) => c),
    where: vi.fn(),
    orderBy: vi.fn(),
    onSnapshot: vi.fn(),
    serverTimestamp: vi.fn(() => 'SERVER_TS'),
    // doc(db, 'coll', id) AND the client-minted doc(collection(db,'coll'))
    // form addRound now uses — the latter needs no network, which is the
    // whole point of F-9.
    doc: vi.fn((dbOrCollRef, col, id) => (typeof col === 'string'
        ? { _path: `${col}/${id}`, id }
        : { _path: `${dbOrCollRef?._path}/minted`, id: 'minted' })),
    getDoc: vi.fn(async () => ({ exists: () => true, data: () => ({ strategyPeriods: [] }) })),
    getDocs: vi.fn(async () => ({ forEach: () => { }, size: 0 })),
    addDoc: vi.fn(async (ref, data) => { lastAddDoc = { ref, data }; return { id: 'new-doc' }; }),
    // F-9: addRound issues a setDoc against a client-minted id instead of
    // awaiting addDoc. Record the whs_rounds write whichever door it comes
    // through, so these date assertions still describe the document written.
    setDoc: vi.fn(async (ref, data) => {
        if (String(ref?._path).startsWith('whs_rounds')) lastAddDoc = { ref, data };
    }),
    updateDoc: vi.fn(async (ref, data) => { lastUpdateDoc = { ref, data }; }),
    deleteDoc: vi.fn(async () => { }),
    writeBatch: vi.fn(() => ({ delete: vi.fn(), commit: vi.fn(async () => { }) }))
}));

vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('../../src/notifications.js', () => ({ initNotifications: vi.fn() }));

const NativeDate = globalThis.Date;
let FakeDateBase = null;
let testTimeZone = null;

function zonedParts(epoch) {
    const date = new FakeDateBase(epoch);
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: testTimeZone,
        era: 'short',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, Number(value)]));
    // Intl uses 1 BC for astronomical year 0; Date uses the signed year.
    const isBC = parts.find(({ type }) => type === 'era').value === 'BC';
    return {
        year: isBC ? 1 - values.year : values.year,
        month: values.month,
        day: values.day,
        hour: values.hour,
        minute: values.minute,
        second: values.second,
        millisecond: date.getUTCMilliseconds(),
    };
}

function wallClockEpoch({ year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0 }) {
    const date = new FakeDateBase(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(hour, minute, second, millisecond);
    return date.getTime();
}

function epochForZonedWallClock(parts) {
    const targetWallClock = wallClockEpoch(parts);
    // Sample both sides of a nearby transition. Iterative correction can
    // oscillate across a skipped time or settle on the later repeated time.
    const offsets = new Set([-86_400_000, 0, 86_400_000].map(delta => {
        const epoch = targetWallClock + delta;
        return wallClockEpoch(zonedParts(epoch)) - epoch;
    }));
    const candidates = [...offsets]
        .map(offset => targetWallClock - offset)
        .sort((a, b) => a - b);
    // Native Date chooses the earlier instant in an overlap; in a gap it
    // advances by the gap duration (including Lord Howe's half-hour gap).
    return candidates.find(epoch => wallClockEpoch(zonedParts(epoch)) === targetWallClock)
        ?? candidates.at(-1);
}

function dateClassForTestZone(BaseDate) {
    return class ZonedDate extends BaseDate {
        constructor(...args) {
            if (testTimeZone && args.length >= 2) {
                const [year, month, day = 1, hour = 0, minute = 0, second = 0, millisecond = 0] = args;
                const normalized = new BaseDate(0);
                normalized.setUTCFullYear(Number(year) < 100 ? Number(year) + 1900 : Number(year), Number(month), Number(day));
                normalized.setUTCHours(Number(hour), Number(minute), Number(second), Number(millisecond));
                super(epochForZonedWallClock({
                    year: normalized.getUTCFullYear(),
                    month: normalized.getUTCMonth() + 1,
                    day: normalized.getUTCDate(),
                    hour: normalized.getUTCHours(),
                    minute: normalized.getUTCMinutes(),
                    second: normalized.getUTCSeconds(),
                    millisecond: normalized.getUTCMilliseconds(),
                }));
                return;
            }
            super(...args);
        }

        getFullYear() { return zonedParts(this.getTime()).year; }
        getMonth() { return zonedParts(this.getTime()).month - 1; }
        getDate() { return zonedParts(this.getTime()).day; }
        getDay() { return new FakeDateBase(wallClockEpoch(zonedParts(this.getTime()))).getUTCDay(); }
        getHours() { return zonedParts(this.getTime()).hour; }
        getMinutes() { return zonedParts(this.getTime()).minute; }
        getSeconds() { return zonedParts(this.getTime()).second; }
        getMilliseconds() { return zonedParts(this.getTime()).millisecond; }

        getTimezoneOffset() {
            return (this.getTime() - wallClockEpoch(zonedParts(this.getTime()))) / 60_000;
        }

        setFullYear(year, month, day) {
            const current = zonedParts(this.getTime());
            return this.setTime(epochForZonedWallClock({
                ...current,
                year: Number(year),
                month: month === undefined ? current.month : Number(month) + 1,
                day: day === undefined ? current.day : Number(day),
            }));
        }
    };
}

/** Run `fn` as if the browser sat in `tz` at the instant `iso`. */
function at(tz, iso, fn) {
    if (!vi.isFakeTimers()) {
        vi.useFakeTimers({ toFake: ['Date'] });
        FakeDateBase = globalThis.Date;
    }
    testTimeZone = tz;
    globalThis.Date = dateClassForTestZone(FakeDateBase);
    vi.setSystemTime(new FakeDateBase(iso));
    return fn();
}

afterEach(() => {
    vi.useRealTimers();
    globalThis.Date = NativeDate;
    FakeDateBase = null;
    testTimeZone = null;
});

// --------------------------------------------------------------------------
// The helper itself
// --------------------------------------------------------------------------

describe('timezone fixture matches native Date at DST transitions', () => {
    it.each([
        ['America/New_York', [2026, 2, 8, 2, 30], '2026-03-08T07:30:00.000Z'],
        ['America/New_York', [2026, 10, 1, 1, 30], '2026-11-01T05:30:00.000Z'],
        ['Australia/Sydney', [2026, 9, 4, 2, 30], '2026-10-03T16:30:00.000Z'],
        ['Australia/Sydney', [2026, 3, 5, 2, 30], '2026-04-04T15:30:00.000Z'],
        ['Australia/Lord_Howe', [2026, 9, 4, 2, 15], '2026-10-03T15:45:00.000Z'],
        ['Australia/Lord_Howe', [2026, 3, 5, 1, 45], '2026-04-04T14:45:00.000Z'],
    ])('%s wall clock %j resolves to %s', (zone, fields, expected) => {
        at(zone, '2026-01-01T00:00:00Z', () => {
            // Assert the instant, not a round-trip through the same fake getters.
            expect(new Date(...fields).toISOString()).toBe(expected);
            const moved = new Date(fields[0] - 1, ...fields.slice(1));
            moved.setFullYear(fields[0]);
            expect(moved.toISOString()).toBe(expected);
        });
    });
});

describe('localToday — the boundaries the UTC day gets wrong', () => {
    it('is the local day at local midnight (UTC+10: the UTC day is still yesterday)', async () => {
        const { localToday } = await import('../../src/dates.js');
        // 2026-09-11T00:00+10:00 === 2026-09-10T14:00Z
        at('Australia/Brisbane', '2026-09-10T14:00:00Z', () => {
            expect(new Date().toISOString().slice(0, 10)).toBe('2026-09-10'); // the defect
            expect(localToday()).toBe('2026-09-11');
        });
    });

    it('is still the local day at 09:59, the last minute of the broken window', async () => {
        const { localToday } = await import('../../src/dates.js');
        at('Australia/Brisbane', '2026-09-10T23:59:00Z', () => {
            expect(new Date().toISOString().slice(0, 10)).toBe('2026-09-10');
            expect(localToday()).toBe('2026-09-11');
        });
    });

    it('agrees with the UTC day from 10:00 local, when the two clocks meet', async () => {
        const { localToday } = await import('../../src/dates.js');
        at('Australia/Brisbane', '2026-09-11T00:00:00Z', () => {
            expect(new Date().toISOString().slice(0, 10)).toBe('2026-09-11');
            expect(localToday()).toBe('2026-09-11');
        });
    });

    it('rolls the month at local midnight, not ten hours later', async () => {
        const { localToday } = await import('../../src/dates.js');
        at('Australia/Brisbane', '2026-08-31T14:30:00Z', () => {
            expect(new Date().toISOString().slice(0, 10)).toBe('2026-08-31');
            expect(localToday()).toBe('2026-09-01');
        });
    });

    it('rolls the year at local midnight', async () => {
        const { localToday } = await import('../../src/dates.js');
        at('Australia/Brisbane', '2025-12-31T14:30:00Z', () => {
            expect(new Date().toISOString().slice(0, 10)).toBe('2025-12-31');
            expect(localToday()).toBe('2026-01-01');
        });
    });

    it('is the local day WEST of Greenwich too, where the UTC day runs ahead', async () => {
        const { localToday } = await import('../../src/dates.js');
        // 2025-12-31T20:00-05:00 === 2026-01-01T01:00Z — UTC has already
        // rolled into the new year; the player has not.
        at('America/New_York', '2026-01-01T01:00:00Z', () => {
            expect(new Date().toISOString().slice(0, 10)).toBe('2026-01-01');
            expect(localToday()).toBe('2025-12-31');
        });
    });

    it('pads single-digit months and days', async () => {
        const { localToday } = await import('../../src/dates.js');
        at('Australia/Brisbane', '2026-01-04T23:00:00Z', () => {
            expect(localToday()).toBe('2026-01-05');
        });
    });
});

describe('parseLocalDate — a picked YYYY-MM-DD is local midnight', () => {
    it.each(['0000', '0001', '0042', '0099'])('preserves year %s through the timezone fixture', async year => {
        const { parseLocalDate } = await import('../../src/dates.js');
        at('UTC', '2026-01-01T00:00:00Z', () => {
            const d = parseLocalDate(`${year}-01-05`);
            expect(d.getFullYear()).toBe(Number(year));
            expect(d.toISOString()).toBe(`${year}-01-05T00:00:00.000Z`);
        });
    });

    it('does not shift the day (new Date(str) would parse it as UTC midnight)', async () => {
        const { parseLocalDate } = await import('../../src/dates.js');
        at('America/New_York', '2026-09-11T15:00:00Z', () => {
            // The bare-string parse lands on 2026-09-10 19:00 local.
            expect(new Date('2026-09-11').getDate()).toBe(10);
            const d = parseLocalDate('2026-09-11');
            expect(d.getFullYear()).toBe(2026);
            expect(d.getMonth()).toBe(8);
            expect(d.getDate()).toBe(11);
            expect(d.getHours()).toBe(0);
        });
    });

    it('round-trips localToday through parseLocalDate on both sides of midnight', async () => {
        const { localToday, parseLocalDate } = await import('../../src/dates.js');
        for (const iso of ['2026-09-10T14:00:00Z', '2026-09-10T23:59:00Z', '2026-09-11T00:00:00Z']) {
            at('Australia/Brisbane', iso, () => {
                const today = localToday();
                const back = parseLocalDate(today);
                expect(`${back.getFullYear()}-${String(back.getMonth() + 1).padStart(2, '0')}-${String(back.getDate()).padStart(2, '0')}`)
                    .toBe(today);
            });
        }
    });

    it('rejects anything that is not a YYYY-MM-DD day', async () => {
        const { parseLocalDate } = await import('../../src/dates.js');
        expect(parseLocalDate('')).toBeNull();
        expect(parseLocalDate(null)).toBeNull();
        expect(parseLocalDate('not-a-date')).toBeNull();
        expect(parseLocalDate('2026-13-40')).toBeNull();
    });
});

// --------------------------------------------------------------------------
// F-7 — the on-course round-date picker
// --------------------------------------------------------------------------

describe('F-7 the round-date picker uses the player\'s day', () => {
    beforeEach(() => {
        vi.resetModules();
        document.body.innerHTML = '<input type="date" id="oc-round-date">';
    });

    it('defaults to today and caps max at today, at 09:00 local', async () => {
        const { seedRoundDatePicker } = await import('../../src/oncourse.js');
        at('Australia/Brisbane', '2026-09-10T23:00:00Z', () => {
            seedRoundDatePicker();
            const el = document.getElementById('oc-round-date');
            expect(el.value).toBe('2026-09-11');
            expect(el.max).toBe('2026-09-11');
        });
    });

    it('does not cap max a day EARLY, so the true local date stays selectable', async () => {
        const { seedRoundDatePicker } = await import('../../src/oncourse.js');
        at('Australia/Brisbane', '2026-09-10T23:00:00Z', () => {
            seedRoundDatePicker();
            const el = document.getElementById('oc-round-date');
            el.value = '2026-09-11';
            expect(el.value <= el.max).toBe(true);
        });
    });

    it('does not cap max a day LATE west of Greenwich, so tomorrow stays refused', async () => {
        const { seedRoundDatePicker } = await import('../../src/oncourse.js');
        at('America/New_York', '2026-01-01T01:00:00Z', () => {
            seedRoundDatePicker();
            const el = document.getElementById('oc-round-date');
            expect(el.max).toBe('2025-12-31');
        });
    });
});

describe('F-7 the Start Round future-date guard uses the player\'s day', () => {
    it('accepts the true local day at 09:00 local instead of alerting', async () => {
        vi.resetModules();
        const { isRoundDateInFuture } = await import('../../src/dates.js');
        at('Australia/Brisbane', '2026-09-10T23:00:00Z', () => {
            expect(isRoundDateInFuture('2026-09-11')).toBe(false);
            expect(isRoundDateInFuture('2026-09-12')).toBe(true);
        });
    });

    it('still refuses a genuinely future day', async () => {
        vi.resetModules();
        const { isRoundDateInFuture } = await import('../../src/dates.js');
        at('Australia/Brisbane', '2026-09-11T05:00:00Z', () => {
            expect(isRoundDateInFuture('2026-09-12')).toBe(true);
            expect(isRoundDateInFuture('2026-09-11')).toBe(false);
        });
    });
});

// --------------------------------------------------------------------------
// F-8 — "Log a past round" must keep the Date Played
// --------------------------------------------------------------------------

describe('F-8 addRound files the round on the date played', () => {
    beforeEach(() => { vi.resetModules(); lastAddDoc = null; });

    it('writes the picked day at local midnight, not the moment of entry', async () => {
        const { addRound } = await import('../../src/whs.js');
        const { AppState } = await import('../../src/state.js');
        AppState.currentUser = { uid: 'u1' };

        await at('Australia/Brisbane', '2026-09-10T23:00:00Z', async () => {
            await addRound('Keperra - Old', 70.5, 124, 88, null, false, { datePlayed: '2026-08-16' });
        });

        expect(lastAddDoc).toBeTruthy();
        const d = lastAddDoc.data.date;
        expect(d).toBeInstanceOf(Date);
        expect(d.getFullYear()).toBe(2026);
        expect(d.getMonth()).toBe(7);
        expect(d.getDate()).toBe(16);
        expect(d.getHours()).toBe(0);
    });

    it('keeps the entry instant separately, so the audit trail survives', async () => {
        const { addRound } = await import('../../src/whs.js');
        const { AppState } = await import('../../src/state.js');
        AppState.currentUser = { uid: 'u1' };

        await addRound('Keperra - Old', 70.5, 124, 88, null, false, { datePlayed: '2026-08-16' });

        expect(lastAddDoc.data.createdAt).toBe('SERVER_TS');
    });

    it('falls back to the server timestamp when no date was picked', async () => {
        const { addRound } = await import('../../src/whs.js');
        const { AppState } = await import('../../src/state.js');
        AppState.currentUser = { uid: 'u1' };

        await addRound('Keperra - Old', 70.5, 124, 88);

        expect(lastAddDoc.data.date).toBe('SERVER_TS');
    });
});

// --------------------------------------------------------------------------
// F-10 — strategy periods
// --------------------------------------------------------------------------

describe('F-10 strategy periods run on the player\'s day', () => {
    const strategyDom = () => {
        document.body.innerHTML = `
            <div id="strategy-banner" class="hidden"><span id="strategy-banner-text"></span></div>
            <div id="strategy-section"></div>
            <div id="strategy-periods-list"></div>
            <div id="strategy-comparison"></div>
            <select id="strategy-name-select"></select>
            <input id="strategy-name-custom">
            <input type="date" id="strategy-start-date">
            <button id="btn-add-strategy-period"></button>
            <button id="btn-strategy-banner-manage"></button>
            <button class="tab-btn" data-target="tab-insights"></button>
        `;
    };

    beforeEach(() => { vi.resetModules(); lastUpdateDoc = null; strategyDom(); });

    it('shows a period starting today as active at 08:00 local', async () => {
        const { initStrategy } = await import('../../src/strategy.js');
        const fs = await import('firebase/firestore');
        fs.getDoc.mockResolvedValue({
            exists: () => true,
            data: () => ({ strategyPeriods: [{ name: 'DECADE (Fawcett)', start: '2026-09-11', end: null }] })
        });

        await at('Australia/Brisbane', '2026-09-10T22:00:00Z', async () => {
            initStrategy();
            document.getElementById('btn-add-strategy-period');
            // render() runs off the stateChange hook; drive it directly.
            window.dispatchEvent(new CustomEvent('stateChange', { detail: { property: 'currentRounds' } }));
            await new Promise(r => setTimeout(r, 0));
            await new Promise(r => setTimeout(r, 0));
        });

        expect(document.getElementById('strategy-banner-text').textContent)
            .toContain('Playing DECADE (Fawcett)');
    });

    it('"End today" writes the player\'s day, not yesterday', async () => {
        const { initStrategy } = await import('../../src/strategy.js');
        const fs = await import('firebase/firestore');
        fs.getDoc.mockResolvedValue({
            exists: () => true,
            data: () => ({ strategyPeriods: [{ name: 'DECADE (Fawcett)', start: '2026-09-01', end: null }] })
        });

        await at('Australia/Brisbane', '2026-09-10T22:00:00Z', async () => {
            initStrategy();
            window.dispatchEvent(new CustomEvent('stateChange', { detail: { property: 'currentRounds' } }));
            await new Promise(r => setTimeout(r, 0));
            await new Promise(r => setTimeout(r, 0));

            const endBtn = [...document.querySelectorAll('#strategy-periods-list button')]
                .find(b => b.textContent === 'End today');
            expect(endBtn, 'the End today button should have rendered').toBeTruthy();
            endBtn.click();
            await new Promise(r => setTimeout(r, 0));
        });

        expect(lastUpdateDoc).toBeTruthy();
        expect(lastUpdateDoc.data.strategyPeriods[0].end).toBe('2026-09-11');
    });

    it('scrolls to Strategy Periods after the tab switch handler completes', async () => {
        const { initStrategy } = await import('../../src/strategy.js');
        const section = document.getElementById('strategy-section');
        const tab = document.querySelector('.tab-btn');
        const order = [];
        tab.addEventListener('click', () => {
            order.push('tab');
            section.hidden = false;
        });
        section.scrollIntoView = vi.fn();

        initStrategy();
        document.getElementById('btn-strategy-banner-manage').click();

        expect(order).toEqual(['tab']);
        expect(section.scrollIntoView).not.toHaveBeenCalled();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(order).toEqual(['tab']);
        expect(section.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    });
});

// --------------------------------------------------------------------------
// F-8 — the wiring: the form must actually hand the date over
// --------------------------------------------------------------------------
//
// The defect was not in addRound's shape, it was that nothing read the field.
// This drives the real submit handler bindWHSForm binds.

vi.mock('../../src/auth-v2.js', () => ({ setupAuthUI: vi.fn() }));

describe('F-8 the Log a past round form hands the Date Played to addRound', () => {
    const formDom = () => {
        document.body.innerHTML = `
            <form id="add-round-form">
                <select id="course-select"></select>
                <div id="course-name-custom-group"></div>
                <input id="course-name">
                <input type="date" id="date">
                <input id="course-rating" value="70.5">
                <input id="slope-rating" value="124">
                <input id="course-par" value="72">
                <input type="radio" name="entry-mode" value="manual-ags" id="mode-manual-ags" checked>
                <input type="radio" name="entry-mode" value="hole-by-hole" id="mode-hole-by-hole">
                <input type="radio" name="entry-mode" value="total-stableford" id="mode-total-stableford">
                <div id="hole-grid-container"></div>
                <span id="calc-stableford-pts"></span>
                <input id="total-stableford-pts">
                <input id="score" value="88">
                <input id="stat-putts"><input id="stat-fwy"><input id="stat-gir">
                <input type="checkbox" id="is-counting" checked>
                <div id="add-round-container"></div>
                <div id="round-save-toast" class="hidden" role="status"></div>
                <button type="submit">Save</button>
            </form>`;
    };

    beforeEach(() => { vi.resetModules(); lastAddDoc = null; formDom(); });

    it('writes the typed Date Played, not the moment of entry', async () => {
        const { UI } = await import('../../src/ui.js');
        const { AppState } = await import('../../src/state.js');
        const { bindWHSForm } = await import('../../src/app-v4.js');

        UI.addRoundForm = document.getElementById('add-round-form');
        UI.addRoundContainer = document.getElementById('add-round-container');
        UI.handicapIndexEl = { value: '18.0' };
        AppState.currentUser = { uid: 'u1' };
        AppState.viewingPlayerId = 'u1';

        bindWHSForm();
        document.getElementById('date').value = '2026-08-16';
        document.getElementById('add-round-form').dispatchEvent(new Event('submit', { cancelable: true }));
        await new Promise(r => setTimeout(r, 20));

        expect(lastAddDoc, 'addRound should have written a document').toBeTruthy();
        const d = lastAddDoc.data.date;
        expect(d).toBeInstanceOf(Date);
        expect(d.getMonth()).toBe(7);
        expect(d.getDate()).toBe(16);
        expect(document.getElementById('round-save-toast').textContent)
            .toMatch(/saved to your WHS record/i);
        expect(document.getElementById('round-save-toast').classList.contains('hidden')).toBe(false);
    // Cold import of the whole app (vi.resetModules above) - ~1.5 s on an idle
    // box, but it blew the default 5 s on a loaded CI runner (2026-10-05, PR
    // #230). The assertions are what matter; the budget is not under test.
    }, 20_000);

    it('opens the past-round logger from On Course, not the Handicap record', async () => {
        document.getElementById('add-round-container').classList.add('hidden');
        const onCourseButton = document.createElement('button');
        onCourseButton.id = 'btn-oc-log-past-round';
        document.body.appendChild(onCourseButton);
        const playerSelect = document.createElement('select');
        playerSelect.innerHTML = '<option value="u1">Coach</option>';
        document.body.appendChild(playerSelect);
        const recordName = document.createElement('span');
        const readonlyWarning = document.createElement('div');
        document.body.append(recordName, readonlyWarning);
        document.body.dataset.activeTab = 'tab-oncourse';

        const { UI } = await import('../../src/ui.js');
        const { AppState } = await import('../../src/state.js');
        const { bindWHSForm } = await import('../../src/app-v4.js');

        UI.addRoundForm = document.getElementById('add-round-form');
        UI.addRoundContainer = document.getElementById('add-round-container');
        UI.handicapIndexEl = { value: '18.0' };
        UI.playerSelect = playerSelect;
        UI.recordPlayerNameEl = recordName;
        UI.readonlyWarningContainer = readonlyWarning;
        AppState.currentUser = { uid: 'u1' };
        AppState.viewingPlayerId = 'student';

        bindWHSForm();
        onCourseButton.click();

        expect(UI.addRoundContainer.classList.contains('hidden')).toBe(false);
        expect(AppState.viewingPlayerId).toBe('u1');
    });

    it('re-subscribes WHS rounds when opening for a coach viewing a student', async () => {
        document.getElementById('add-round-container').classList.add('hidden');
        const onCourseButton = document.createElement('button');
        onCourseButton.id = 'btn-oc-log-past-round';
        document.body.appendChild(onCourseButton);
        const playerSelect = document.createElement('select');
        playerSelect.id = 'player-select';
        playerSelect.innerHTML = '<option value="u1">Coach</option><option value="student">Student</option>';
        document.body.appendChild(playerSelect);
        const recordName = document.createElement('span');
        const readonlyWarning = document.createElement('div');
        document.body.append(recordName, readonlyWarning);

        const { UI } = await import('../../src/ui.js');
        const { AppState } = await import('../../src/state.js');
        const { bindWHSForm } = await import('../../src/app-v4.js');
        const firestore = await import('firebase/firestore');

        UI.addRoundForm = document.getElementById('add-round-form');
        UI.addRoundContainer = document.getElementById('add-round-container');
        UI.handicapIndexEl = { value: '18.0' };
        UI.playerSelect = playerSelect;
        UI.recordPlayerNameEl = recordName;
        UI.readonlyWarningContainer = readonlyWarning;
        AppState.currentUser = { uid: 'u1' };
        AppState.viewingPlayerId = 'student';
        firestore.onSnapshot.mockClear();

        bindWHSForm();
        onCourseButton.click();

        expect(AppState.viewingPlayerId).toBe('u1');
        expect(firestore.onSnapshot).toHaveBeenCalledTimes(1);
    });

    it('restores a coach viewing a student when the logger is cancelled', async () => {
        document.getElementById('add-round-container').classList.add('hidden');
        const onCourseButton = document.createElement('button');
        onCourseButton.id = 'btn-oc-log-past-round';
        document.body.appendChild(onCourseButton);
        const closeButton = document.createElement('button');
        closeButton.id = 'btn-close-log-round';
        document.body.appendChild(closeButton);
        const playerSelect = document.createElement('select');
        playerSelect.innerHTML = '<option value="u1">Coach</option><option value="student">Student</option>';
        document.body.appendChild(playerSelect);
        const recordName = document.createElement('span');
        const readonlyWarning = document.createElement('div');
        document.body.append(recordName, readonlyWarning);

        const { UI } = await import('../../src/ui.js');
        const { AppState } = await import('../../src/state.js');
        const { bindWHSForm } = await import('../../src/app-v4.js');

        UI.addRoundForm = document.getElementById('add-round-form');
        UI.addRoundContainer = document.getElementById('add-round-container');
        UI.handicapIndexEl = { value: '18.0' };
        UI.playerSelect = playerSelect;
        UI.recordPlayerNameEl = recordName;
        UI.readonlyWarningContainer = readonlyWarning;
        AppState.currentUser = { uid: 'u1' };
        AppState.viewingPlayerId = 'student';

        bindWHSForm();
        onCourseButton.click();
        closeButton.click();

        expect(AppState.viewingPlayerId).toBe('student');
        expect(playerSelect.value).toBe('student');
        expect(readonlyWarning.classList.contains('hidden')).toBe(false);
    });

    it('does not open the round logger when signed out', async () => {
        document.getElementById('add-round-container').classList.add('hidden');
        const onCourseButton = document.createElement('button');
        onCourseButton.id = 'btn-oc-log-past-round';
        document.body.appendChild(onCourseButton);

        const { UI } = await import('../../src/ui.js');
        const { AppState } = await import('../../src/state.js');
        const { bindWHSForm } = await import('../../src/app-v4.js');

        UI.addRoundForm = document.getElementById('add-round-form');
        UI.addRoundContainer = document.getElementById('add-round-container');
        AppState.currentUser = null;
        AppState.viewingPlayerId = null;

        bindWHSForm();
        onCourseButton.click();

        expect(UI.addRoundContainer.classList.contains('hidden')).toBe(true);
    });
});
