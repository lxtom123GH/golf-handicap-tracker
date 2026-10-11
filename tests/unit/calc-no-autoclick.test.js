// Quick win 4 / Track A item 5 (simplify review 07 Oct 2026): nothing
// auto-clicks the Daily Handicap calculator. It used to fire on every Viewing
// change (opening/closing "Log a past round"), popping "Please fill in valid
// numbers". The e2e spec past-round-no-popup.spec.js covers the real page.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(process.cwd(), 'src/app-v4.js'), 'utf8');

describe('the Daily Handicap calculator is never auto-clicked', () => {
    it('no code clicks btnCalculateDaily programmatically', () => {
        expect(src).not.toMatch(/btnCalculateDaily\.click\(\)/);
        expect(src).not.toMatch(/btn-calculate-daily'\)\??\.click\(\)/);
    });

    it('a Viewing change hides the previous player\'s result instead', () => {
        const at = src.indexOf("UI.playerSelect.addEventListener('change'");
        expect(at).toBeGreaterThan(-1);
        const handler = src.slice(at, src.indexOf('listenToWHSRounds();', at));
        expect(handler).toMatch(/playerChanged && UI\.dailyHandicapResult\) UI\.dailyHandicapResult\.classList\.add\('hidden'\)/);
        // "changed" is read BEFORE viewingPlayerId is overwritten
        expect(handler.indexOf('const playerChanged')).toBeLessThan(handler.indexOf('AppState.viewingPlayerId = selectedUid'));
    });
});
