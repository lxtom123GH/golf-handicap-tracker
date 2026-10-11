import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ call: vi.fn(), getDocs: vi.fn() }));
vi.mock('../../src/firebase-config.js', () => ({ db: {}, storage: {}, auth: {}, functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => mocks.call }));
vi.mock('firebase/firestore', () => ({
    collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(), getDocs: mocks.getDocs,
    addDoc: vi.fn(), deleteDoc: vi.fn(), doc: vi.fn(), getDoc: vi.fn(), serverTimestamp: vi.fn(),
    runTransaction: vi.fn(), increment: vi.fn(), updateDoc: vi.fn()
}));
vi.mock('firebase/storage', () => ({ ref: vi.fn(), getDownloadURL: () => Promise.resolve(''), uploadBytesResumable: vi.fn(), deleteObject: vi.fn() }));
vi.mock('../../src/state.js', () => ({ AppState: {} }));
vi.mock('../../src/modules/score-input.js', () => ({ showToast: vi.fn() }));
import { renderVideoLibrary } from '../../src/videos.js';
async function controls() {
    const container = document.createElement('div');
    document.body.append(container);
    await renderVideoLibrary('owner', container);
    return { button: container.querySelector('.vid-ai'), output: container.querySelector('.vid-ai-result') };
}
beforeEach(() => {
    vi.clearAllMocks(); document.body.innerHTML = '';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({});
    mocks.getDocs.mockResolvedValue({ empty: false, docs: [{ id: 'synthetic-video', data: () => ({ uid: 'owner', path: 'videos/owner/test.mp4', bytes: 12 }) }] });
});
afterEach(() => vi.restoreAllMocks());
describe('video AI analysis error copy', () => {
    it.each([
        ['functions/unauthenticated', 'Sign in again'], ['functions/permission-denied', 'access'],
        ['functions/not-found', 'Refresh'], ['functions/resource-exhausted', 'limit'],
        ['functions/failed-precondition', 'requirements'], ['functions/invalid-argument', 'Refresh'],
        ['functions/deadline-exceeded', 'before requesting another'], ['functions/internal', 'before requesting another'],
        ['functions/unknown', 'before requesting another']
    ])('uses safe next steps for %s without echoing service details', async (code, nextStep) => {
        mocks.call.mockRejectedValue({ code, message: 'PRIVATE_SERVICE_DETAIL <img src=x>' });
        const { button, output } = await controls(); button.click();
        await vi.waitFor(() => expect(button.disabled).toBe(false));
        expect(output.textContent).toContain(nextStep);
        expect(output.textContent).not.toContain('PRIVATE_SERVICE_DETAIL');
        expect(output.querySelector('img')).toBeNull();
        expect(mocks.call).toHaveBeenCalledTimes(1);
        expect(mocks.call).toHaveBeenCalledWith({ videoId: 'synthetic-video' });
    });
    it('handles a missing error object without hiding the next step', async () => {
        mocks.call.mockRejectedValue(null);
        const { button, output } = await controls(); button.click();
        await vi.waitFor(() => expect(button.disabled).toBe(false));
        expect(output.textContent).toContain('before requesting another');
    });
    it('keeps the button disabled until acknowledgement and renders the successful result', async () => {
        let resolve;
        mocks.call.mockImplementation(() => new Promise(r => { resolve = r; }));
        const { button, output } = await controls(); button.click(); button.click();
        expect(button.disabled).toBe(true); expect(mocks.call).toHaveBeenCalledTimes(1);
        expect(output.textContent).toContain('Analysing');
        resolve({ data: { analysis: 'Synthetic analysis', drill: 'Synthetic drill' } });
        await vi.waitFor(() => expect(button.disabled).toBe(false));
        expect(output.textContent).toContain('Synthetic analysis');
        expect(output.textContent).toContain('Synthetic drill');
    });
});
