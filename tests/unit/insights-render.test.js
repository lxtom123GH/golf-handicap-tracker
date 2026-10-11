import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/firebase-config.js', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
    collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(),
    limit: vi.fn(), getDocs: vi.fn()
}));

import { renderIndexExplainer } from '../../src/modules/insights-render.js';

describe('index explainer rendering', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="index-explainer"></div>';
    });

    it('does not abort a snapshot update when rounds are omitted', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});

        expect(() => renderIndexExplainer(null, null)).not.toThrow();
        expect(error).toHaveBeenCalledWith(expect.stringContaining('requires the current rounds'));
        expect(document.querySelector('#index-explainer').innerHTML).toBe('');
    });
});
