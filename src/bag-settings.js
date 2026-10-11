import { AppState } from './state.js';
import { BAG_KEY, bagFromChecks } from './bag.js';

// Settings > My Bag. Lives outside On Course and is bound by app bootstrap
// (PR #218 finding 8). E35: every tick saves at once, like every other
// Settings switch; there is no Update button.

let bagHideTimer = null;

// Leaving Settings drops the confirmation and its pending hide, so a stale
// timer never touches the message on a later visit.
window.addEventListener('stateChange', ({ detail }) => {
    if (detail.property !== 'activeTab' || detail.newValue === 'tab-settings') return;
    clearTimeout(bagHideTimer);
    bagHideTimer = null;
    document.getElementById('bag-msg')?.classList.add('hidden');
});

export function bindBagSettings() {
    const card = document.getElementById('my-bag-card');
    if (card && card.dataset.bound !== '1') {
        card.dataset.bound = '1';
        card.addEventListener('change', (e) => {
            if (!e.target.classList || !e.target.classList.contains('bag-check')) return;
            const newBag = bagFromChecks(card);
            AppState.playerClubs = newBag;
            let saved = true;
            try {
                localStorage.setItem(BAG_KEY, JSON.stringify(newBag));
            } catch (err) {
                // Storage off or full: the bag only lives until reload, so
                // don't say "Saved" (PR #246 review).
                saved = false;
                console.warn('[Bag] could not save to this device', err);
            }
            const msg = document.getElementById('bag-msg');
            if (msg) {
                msg.textContent = saved
                    ? '✅ Saved'
                    : "⚠️ Couldn't save on this device: your bag will reset when the app reloads.";
                msg.classList.toggle('bag-msg-error', !saved);
                msg.classList.remove('hidden');
                // Each save restarts the hide deadline.
                clearTimeout(bagHideTimer);
                bagHideTimer = setTimeout(() => {
                    bagHideTimer = null;
                    msg.classList.add('hidden');
                }, saved ? 2000 : 6000);
            }
        });
    }

    // Sync UI with state
    if (AppState.playerClubs) {
        document.querySelectorAll('.bag-check').forEach(chk => {
            const cat = chk.getAttribute('data-cat');
            const val = chk.getAttribute('data-val');
            if (cat === 'driver' || cat === 'putter') {
                chk.checked = !!AppState.playerClubs[cat];
            } else {
                chk.checked = AppState.playerClubs[cat]?.includes(val);
            }
        });
    }
}
