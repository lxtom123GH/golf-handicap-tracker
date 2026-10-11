// ==========================================
// wizard-flow.js — what the shot wizard's step line and buttons say (pure)
// ==========================================
//
// S11 (owner's first on-course test, 2026-09-18): "it was not clear when I
// was pressing buttons whether it was to save that shot / intended shot or
// whether it was to move me on to the next shot." Every label below is a
// pure function of the shot's state, so tests cover all combinations and
// the DOM code only copies strings.

/**
 * The three-step header line. S12 A1: it now says WHICH shot — the step
 * number was never the question on course; "shot 2 or 3?" was.
 * @param {{hasIntended:boolean, hasActual:boolean, flightUnseen:boolean, shotNumber?:number}} s
 */
export function wizardStepText(s) {
    const n = Number(s?.shotNumber) || 1;
    const hasIntended = !!s?.hasIntended, hasActual = !!s?.hasActual, unseen = !!s?.flightUnseen;
    if (hasActual || unseen) return `Shot ${n} · check the buttons, then log it`;
    if (hasIntended) return `Shot ${n} · hit it, then draw what happened`;
    return `Shot ${n} · draw the line you mean to hit`;
}

/**
 * Which save buttons show and what they say.
 * Returns { plan: string|null, log: string } — a null plan hides the
 * "Save plan" button; the log button always exists so a golfer who skips
 * drawing can still count the stroke.
 */
export function shotButtons(s) {
    const n = Number(s?.shotNumber) || 1;
    const hasIntended = !!s?.hasIntended, hasActual = !!s?.hasActual, unseen = !!s?.flightUnseen;
    if (hasActual || unseen) return { plan: null, log: `Log shot ${n}` };
    // Short on purpose: both fit one 55 px row at 375 px; the step line above
    // already says "hit the shot, then draw what happened".
    if (hasIntended) return { plan: 'Save plan', log: `Log shot ${n} · no actual` };
    return { plan: null, log: `Log shot ${n} · no line` };
}

/** Caption under the Intended / Actual pills. */
export function modeCaption(mode, flightUnseen) {
    if (flightUnseen) return 'Finish from GPS · no actual line to draw';
    return mode === 'actual' ? 'Drawing: actual line' : 'Drawing: intended line';
}

/** The hub button's label: plain, or the reminder that a plan is waiting. */
export function trackButtonLabel(plannedShotNumber) {
    return plannedShotNumber
        ? `🎯 Log shot ${plannedShotNumber} · draw what happened`
        : '🎯 Track My Shot';
}

/** Toast after logging: names the next action. */
export function loggedToast(shotNumber, holed) {
    if (holed) return `Shot ${shotNumber} logged · holed out 🎉`;
    return `Shot ${shotNumber} logged · Track My Shot for the next one`;
}

/**
 * Glass chips PR 2 (owner-approved mockup 2026-10-04): the card shown for 6 s
 * after logging, beside its Undo button — "Shot 2 logged · 6i · Fairway · 140 m".
 * Missing parts are left out, never invented. Keeps "logged" so the toast
 * contract (e2e: role=status with /logged/) holds.
 * @param {{shotNumber:number, clubLabel?:string, lie?:string, carryM?:number|null}} s
 */
export function undoCardText(s) {
    const parts = [`Shot ${Number(s?.shotNumber) || 1} logged`];
    if (s?.clubLabel) parts.push(s.clubLabel);
    if (s?.lie) parts.push(s.lie);
    if (Number.isFinite(s?.carryM) && s.carryM > 0) parts.push(`${Math.round(s.carryM)} m`);
    return parts.join(' · ');
}
