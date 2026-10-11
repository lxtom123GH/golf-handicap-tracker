import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('../../src/ui.js', () => ({ UI: {} }));
let UI, frames, layoutReads;
beforeEach(async () => {
    vi.resetModules();
    ({ UI } = await import('../../src/ui.js'));
    document.body.innerHTML = '';
    for (const key of ['tempoPlayBtn', 'tempoResetCounter', 'tempoSwingCounter',
        'tempoSpeedDisplay', 'tempoDelayDisplay', 'tempoDelayContainer', 'tempoRing',
        'tempoSwingState', 'tempoCoreCircle']) UI[key] = document.createElement('div');
    const markup = new DOMParser().parseFromString(readFileSync('index.html', 'utf8'), 'text/html');
    UI.tempoRing = markup.getElementById('tempo-ring');
    for (const [key, value] of Object.entries({ tempoSpeedSlider: '1', tempoDelaySlider: '1',
        tempoSelect: '3', tempoVibeSelect: 'classic' })) {
        UI[key] = document.createElement('input');
        UI[key].value = value;
    }
    UI.tempoLoopToggle = document.createElement('input');
    UI.tempoLoopToggle.checked = true;
    UI.nativeAudioPlayer = document.createElement('audio');
    UI.nativeAudioPlayer.play = vi.fn(() => Promise.resolve());
    UI.nativeAudioPlayer.pause = vi.fn();
    layoutReads = vi.fn(() => 100);
    Object.defineProperty(UI.tempoRing, 'offsetWidth', { get: layoutReads });
    frames = new Map();
    let id = 0;
    vi.stubGlobal('requestAnimationFrame', cb => { frames.set(++id, cb); return id; });
    vi.stubGlobal('cancelAnimationFrame', frame => frames.delete(frame));
    vi.stubGlobal('OfflineAudioContext', class {
        destination = {};
        createOscillator() { return { frequency: { setValueAtTime() {} }, connect() {}, start() {}, stop() {} }; }
        createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {},
            exponentialRampToValueAtTime() {} }, connect() {} }; }
        async startRendering() {
            return { numberOfChannels: 1, length: 1, sampleRate: 44100, getChannelData: () => [0] };
        }
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:tempo-test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const { initTempo } = await import('../../src/tempo.js');
    initTempo();
    UI.tempoPlayBtn.click();
    await vi.waitFor(() => expect(UI.tempoPlayBtn.textContent).toBe('STOP'));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function paint(time) {
    UI.nativeAudioPlayer.currentTime = time;
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach(callback => callback());
}

describe('T3-tempo impact animation', () => {
    it('keeps the ring hidden before the first impact using the visibility class', () => {
        expect(UI.tempoRing.classList.contains('hidden')).toBe(true);
        expect(UI.tempoRing.style.display).toBe('');
    });

    it('restarts the ring after paint without a synchronous layout read', () => {
        paint(2);
        expect(UI.tempoRing.classList.contains('hidden')).toBe(false);
        expect(UI.tempoRing.style.display).toBe('');
        expect(layoutReads).not.toHaveBeenCalled();
        expect(UI.tempoSwingCounter.textContent).toBe('1');
        expect(UI.tempoRing.style.animation).toBe('none');
        paint(2.1);
        paint(2.2);
        expect(UI.tempoRing.style.animation).toContain('tempoExpand');
    });

    it.each([1, 2])('does not revive the impact ring when STOP cancels frame %s', pendingFrame => {
        paint(2);
        if (pendingFrame === 2) paint(2.1);
        UI.tempoPlayBtn.click();
        expect(frames.size).toBe(0);
        paint(2.2);
        expect(UI.tempoRing.style.animation).toBe('');
        expect(UI.tempoRing.classList.contains('hidden')).toBe(true);
        expect(UI.tempoRing.style.display).toBe('');
        expect(UI.tempoSwingState.textContent).toBe('READY');
    });

    it('animates and counts each loop impact once', () => {
        paint(2); paint(2.1); paint(2.2);
        paint(0); paint(2);
        expect(UI.tempoRing.style.animation).toBe('none');
        paint(2.1); paint(2.2); paint(2.3);
        expect(UI.tempoRing.style.animation).toContain('tempoExpand');
        expect(UI.tempoSwingCounter.textContent).toBe('2');
        expect(layoutReads).not.toHaveBeenCalled();
    });
});
