import { describe, it, expect } from 'vitest';
import { wizardStepText } from '../../src/wizard-flow.js';

describe('resolved map availability controls the shot prompt', () => {
    it.each([
        {}, { hasIntended: true }, { hasActual: true }, { flightUnseen: true },
    ])('never requests drawing without a map: %j', state => {
        expect(wizardStepText({ ...state, hasMap: false }))
            .toBe('No map for this hole yet - pick the club and result');
    });
    it('preserves mapped and legacy step prompts', () => {
        expect(wizardStepText({ hasMap: true })).toBe(wizardStepText({}));
        expect(wizardStepText({ hasMap: true, hasIntended: true })).toContain('draw what happened');
    });
});
