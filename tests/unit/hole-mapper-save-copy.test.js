import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mountHoleMapper, mapperAdd, mapperClose } from '../../src/hole-mapper.js';

const mocks = vi.hoisted(() => ({ setDoc: vi.fn() }));
vi.mock('../../src/state.js', () => ({ AppState: { currentUser: { uid: 'alice' } } }));
vi.mock('../../src/firebase-config.js', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({ doc: (_db, ...path) => path.join('/'), setDoc: mocks.setDoc }));
const hole = { tee: { lat: -27.41, lon: 152.95 }, green: { centre: { lat: -27.40, lon: 152.95 } } };
let handle;
const status = () => document.getElementById('mapper-status');
function mount() {
    handle = mountHoleMapper({ canvas: document.getElementById('mapper-canvas'), hole, slug: 'test', holeNumber: 1 });
    for (const xy of [[0, 0], [20, 0], [20, 20], [0, 20]]) mapperAdd(handle.model, 'green', xy);
    mapperClose(handle.model, 'green');
    return handle;
}
beforeEach(() => {
    vi.clearAllMocks();
    const ctx = new Proxy({}, { get: (target, key) => target[key] || (() => ({})) });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
    document.body.innerHTML = '<div id="hole-mapper"><canvas id="mapper-canvas" width="300" height="400"></canvas>'
        + '<div id="mapper-hole-label"></div><div id="mapper-pills"></div><div id="mapper-status"></div>'
        + '<div id="mapper-attribution"></div><button id="btn-mapper-save"></button></div>';
});
afterEach(() => { handle?.destroy(); vi.restoreAllMocks(); });

describe('mapper save acknowledgement copy', () => {
    it('confirms an immediately acknowledged online save', async () => {
        mocks.setDoc.mockResolvedValue();
        mount();
        document.getElementById('btn-mapper-save').click();
        await vi.waitFor(() => expect(status().textContent).toBe('saved 1 feature(s).'));
        expect(mocks.setDoc).toHaveBeenCalledTimes(1);
    });

    it('keeps an offline write pending until acknowledgement, then confirms it', async () => {
        let resolve;
        mocks.setDoc.mockImplementation(() => new Promise(r => { resolve = r; }));
        mount();
        document.getElementById('btn-mapper-save').click();
        await vi.waitFor(() => expect(status().textContent).toContain('Waiting for confirmation'));
        expect(status().textContent).not.toMatch(/saved/);
        expect(document.getElementById('btn-mapper-save').disabled).toBe(false);
        resolve();
        await vi.waitFor(() => expect(status().textContent).toBe('saved 1 feature(s).'));
    });

    it.each(['resolve', 'reject'])('a late %s cannot overwrite the next mount', async outcome => {
        let settle;
        mocks.setDoc.mockImplementation(() => new Promise((resolve, reject) => {
            settle = outcome === 'resolve' ? resolve : reject;
        }));
        mount();
        document.getElementById('btn-mapper-save').click();
        await vi.waitFor(() => expect(mocks.setDoc).toHaveBeenCalledTimes(1));
        handle.destroy();
        mount();
        const nextStatus = status().textContent;
        settle({ code: 'permission-denied', message: 'PRIVATE_SERVICE_DETAIL' });
        await new Promise(r => setTimeout(r, 0));
        expect(status().textContent).toBe(nextStatus);
    });

    it('finishes a requested save even when the mapper closes while imports load', async () => {
        mocks.setDoc.mockResolvedValue();
        mount();
        document.getElementById('btn-mapper-save').click();
        handle.destroy();
        const closedStatus = status().textContent;
        await vi.waitFor(() => expect(mocks.setDoc).toHaveBeenCalledTimes(1));
        expect(status().textContent).toBe(closedStatus);
    });

    it.each(['resolve', 'reject'])('an earlier save cannot %s over a newer pending save', async outcome => {
        let settleFirst, finishSecond;
        mocks.setDoc.mockImplementationOnce(() => new Promise((resolve, reject) => {
            settleFirst = outcome === 'resolve' ? resolve : reject;
        })).mockImplementationOnce(() => new Promise(resolve => { finishSecond = resolve; }));
        mount();
        document.getElementById('btn-mapper-save').click();
        await vi.waitFor(() => expect(mocks.setDoc).toHaveBeenCalledTimes(1));
        document.getElementById('btn-mapper-save').click();
        await vi.waitFor(() => expect(mocks.setDoc).toHaveBeenCalledTimes(2));
        settleFirst({ code: 'permission-denied' });
        await new Promise(r => setTimeout(r, 0));
        expect(status().textContent).toContain('Waiting for confirmation');
        finishSecond();
        await vi.waitFor(() => expect(status().textContent).toBe('saved 1 feature(s).'));
    });

    it('shows safe recovery when the write is refused', async () => {
        mocks.setDoc.mockRejectedValue({ code: 'permission-denied', message: 'PRIVATE_SERVICE_DETAIL' });
        mount();
        document.getElementById('btn-mapper-save').click();
        await vi.waitFor(() => expect(status().textContent).toContain('administrator'));
        expect(status().textContent).not.toMatch(/saved|PRIVATE_SERVICE_DETAIL/);
    });
});
