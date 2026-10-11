// ==========================================
// undo-card.js — glass "Shot 2 logged · 6i · Fairway · 140 m  [Undo]" card
// ==========================================
//
// Glass chips PR 2 (owner-approved mockup 2026-10-04, sketch 003
// 03-logged-undo.png): after logging a shot, a card sits in the thumb zone
// for 6 s with an Undo button. It replaces the plain "logged" toast for new
// shots; role=status keeps it announced (and the e2e /logged/ contract).
//
// Pure DOM, no app state: the caller passes the text and what Undo does.
// One card at a time — a new one replaces the old (whose undo then lapses).

export const UNDO_CARD_MS = 6000;

let _current = null;

/** Remove the card on screen (if any) without running its undo. */
export function dismissUndoCard() {
    if (!_current) return;
    clearTimeout(_current.timer);
    _current.el.remove();
    _current = null;
}

/**
 * Show the card. Undo runs `onUndo` once and removes the card; the timer
 * removes it silently.
 * @param {string} text
 * @param {() => void} onUndo
 * @param {number} [ms]
 * @returns {HTMLElement} the card
 */
export function showUndoCard(text, onUndo, ms = UNDO_CARD_MS) {
    dismissUndoCard();
    const el = document.createElement('div');
    el.className = 'undo-card';
    el.setAttribute('role', 'status');

    const msg = document.createElement('span');
    msg.className = 'undo-card-text';
    msg.textContent = text;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'undo-card-btn';
    btn.textContent = 'Undo';

    el.append(msg, btn);
    document.body.appendChild(el);

    const entry = { el, timer: setTimeout(() => { if (_current === entry) dismissUndoCard(); }, ms) };
    btn.addEventListener('click', () => {
        if (_current !== entry) return;
        dismissUndoCard();
        onUndo();
    });
    _current = entry;
    return el;
}
