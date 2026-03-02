import { UI } from './ui.js';

let isPlaying = false;
let swingCount = 0;
let animationFrameId = null;
let lastVisualState = 'READY';
let currentObjectUrl = null;

let vDelay = 0; let vBackswing = 0; let vDownswing = 0; let vImpactTime = 0; let vTotalDuration = 0;

export function initTempo() {
    if (!UI.tempoPlayBtn) return;

    UI.tempoResetCounter.addEventListener('click', () => { swingCount = 0; UI.tempoSwingCounter.textContent = swingCount; });
    UI.tempoSpeedSlider.addEventListener('input', (e) => UI.tempoSpeedDisplay.textContent = `${e.target.value}s`);
    UI.tempoDelaySlider.addEventListener('input', (e) => UI.tempoDelayDisplay.textContent = `${e.target.value}s`);

    UI.tempoLoopToggle.addEventListener('change', (e) => {
        UI.tempoDelayContainer.style.opacity = e.target.checked ? '1' : '0.5';
        UI.tempoDelayContainer.style.pointerEvents = e.target.checked ? 'auto' : 'none';
    });

    UI.tempoPlayBtn.addEventListener('click', togglePlay);
    UI.nativeAudioPlayer.addEventListener('ended', () => {
        if (!UI.tempoLoopToggle.checked && isPlaying) togglePlay();
    });
}

function audioBufferToWav(buffer) {
    const numOfChan = buffer.numberOfChannels, length = buffer.length * numOfChan * 2 + 44;
    const arrayBuffer = new ArrayBuffer(length), view = new DataView(arrayBuffer);
    let pos = 0, offset = 0, channels = [], i, sample;
    const setUint16 = (d) => { view.setUint16(pos, d, true); pos += 2; };
    const setUint32 = (d) => { view.setUint32(pos, d, true); pos += 4; };

    setUint32(0x46464952); setUint32(length - 8); setUint32(0x45564157); setUint32(0x20746d66);
    setUint32(16); setUint16(1); setUint16(numOfChan); setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan); setUint16(numOfChan * 2); setUint16(16);
    setUint32(0x61746164); setUint32(length - pos - 4);

    for (i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));
    while (pos < length) {
        for (i = 0; i < numOfChan; i++) {
            sample = Math.max(-1, Math.min(1, channels[i][offset]));
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
            view.setInt16(pos, sample, true); pos += 2;
        }
        offset++;
    }
    return new Blob([arrayBuffer], { type: "audio/wav" });
}

function buildTone(ctx, vibeType, startTime, duration, beatNumber) {
    const osc = ctx.createOscillator(), gainNode = ctx.createGain();
    gainNode.connect(ctx.destination);
    let isImpact = (beatNumber === 3), freq = 800, oscType = 'sine', decay = 0.1, sustain = 0.001;

    if (vibeType === 'classic') { freq = isImpact ? 1200 : 800; oscType = 'triangle'; decay = 0.08; }
    else if (vibeType === 'glock') { freq = isImpact ? 1500 : 1000; oscType = 'sine'; decay = 0.6; sustain = 0.1; }
    else if (vibeType === 'marimba') { freq = isImpact ? 600 : 400; oscType = 'sine'; decay = 0.2; }
    else if (vibeType === 'bass') { freq = isImpact ? 100 : 65; oscType = 'sine'; decay = 0.3; }

    osc.type = oscType; osc.frequency.setValueAtTime(freq, startTime); osc.connect(gainNode);
    gainNode.gain.setValueAtTime(0, startTime); gainNode.gain.linearRampToValueAtTime(1, startTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(sustain, startTime + decay);
    osc.start(startTime); osc.stop(startTime + decay);
}

function buildTick(ctx, startTime) {
    const osc = ctx.createOscillator(), gainNode = ctx.createGain();
    osc.type = 'square'; osc.frequency.setValueAtTime(1000, startTime); osc.connect(gainNode); gainNode.connect(ctx.destination);
    gainNode.gain.setValueAtTime(0, startTime); gainNode.gain.linearRampToValueAtTime(0.1, startTime + 0.005);
    gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + 0.05);
    osc.start(startTime); osc.stop(startTime + 0.05);
}

async function generateAudioTrack() {
    UI.tempoPlayBtn.textContent = "RENDERING...";
    const totalSwingTime = parseFloat(UI.tempoSpeedSlider.value);
    const ratio = parseInt(UI.tempoSelect.value);
    const vibe = UI.tempoVibeSelect.value;
    const isLooping = UI.tempoLoopToggle.checked;
    const delayTime = isLooping ? parseInt(UI.tempoDelaySlider.value) : 1;

    vBackswing = totalSwingTime * (ratio / (ratio + 1));
    vDownswing = totalSwingTime * (1 / (ratio + 1));
    vDelay = delayTime; vImpactTime = vDelay + vBackswing + vDownswing; vTotalDuration = vImpactTime + 1.0;

    const offlineCtx = new OfflineAudioContext(1, 44100 * vTotalDuration, 44100);
    if (delayTime >= 3) { buildTick(offlineCtx, delayTime - 3); buildTick(offlineCtx, delayTime - 2); buildTick(offlineCtx, delayTime - 1); }
    buildTone(offlineCtx, vibe, vDelay, 0, 1); buildTone(offlineCtx, vibe, vDelay + vBackswing, 0, 2); buildTone(offlineCtx, vibe, vImpactTime, 0, 3);

    const renderedBuffer = await offlineCtx.startRendering();
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = URL.createObjectURL(audioBufferToWav(renderedBuffer));

    UI.nativeAudioPlayer.src = currentObjectUrl;
    UI.nativeAudioPlayer.loop = isLooping;
}

function syncVisuals() {
    if (!isPlaying) return;
    const t = UI.nativeAudioPlayer.currentTime;
    let newState = '';

    if (t < vDelay) {
        newState = 'SETUP'; UI.tempoSwingState.textContent = `${Math.ceil(vDelay - t)}s`;
        UI.tempoCoreCircle.style.background = '#64748b'; UI.tempoCoreCircle.style.transform = "scale(1)";
    } else if (t >= vDelay && t < (vDelay + vBackswing)) {
        newState = 'BACK'; UI.tempoSwingState.textContent = "BACK";
        UI.tempoCoreCircle.style.background = '#a855f7'; UI.tempoCoreCircle.style.transform = "scale(0.8)";
    } else if (t >= (vDelay + vBackswing) && t < vImpactTime) {
        newState = 'TOP'; UI.tempoSwingState.textContent = "TOP";
        UI.tempoCoreCircle.style.background = '#eab308'; UI.tempoCoreCircle.style.transform = "scale(1.2)";
    } else if (t >= vImpactTime) {
        newState = 'IMPACT'; UI.tempoSwingState.textContent = "IMPACT!";
        UI.tempoCoreCircle.style.background = '#22c55e'; UI.tempoCoreCircle.style.transform = "scale(1)";
    }

    if (lastVisualState !== 'IMPACT' && newState === 'IMPACT') {
        UI.tempoRing.style.display = 'block'; UI.tempoRing.style.animation = "none"; void UI.tempoRing.offsetWidth;
        UI.tempoRing.style.animation = "tempoExpand 0.5s ease-out forwards";
        swingCount++; UI.tempoSwingCounter.textContent = swingCount;
    }
    lastVisualState = newState;
    animationFrameId = requestAnimationFrame(syncVisuals);
}

async function togglePlay() {
    if (isPlaying) {
        UI.nativeAudioPlayer.pause(); isPlaying = false; cancelAnimationFrame(animationFrameId);
        UI.tempoPlayBtn.textContent = "START"; UI.tempoPlayBtn.style.background = 'var(--primary-color)';
        UI.tempoSwingState.textContent = "READY"; UI.tempoCoreCircle.style.background = '#3b82f6';
        UI.tempoCoreCircle.style.transform = "scale(1)"; UI.tempoRing.style.display = 'none'; UI.tempoRing.style.animation = "";
        lastVisualState = 'READY';
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    } else {
        await generateAudioTrack();
        UI.nativeAudioPlayer.play(); isPlaying = true;
        UI.tempoPlayBtn.textContent = "STOP"; UI.tempoPlayBtn.style.background = 'var(--danger)';

        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({ title: `Tempo Loop`, artist: 'Golf Tracker' });
            navigator.mediaSession.setActionHandler('play', togglePlay); navigator.mediaSession.setActionHandler('pause', togglePlay);
            navigator.mediaSession.playbackState = 'playing';
        }
        animationFrameId = requestAnimationFrame(syncVisuals);
    }
}
