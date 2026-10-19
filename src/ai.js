import { aiErrorMessage } from './ai-errors.js';
// ==========================================
// ai.js
// AI Coach — Live Gemini Integration
// ==========================================

import { db, functions } from './firebase-config.js';
import { collection, query, where, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { UI } from './ui.js';
import { AppState } from './state.js';
import { formatHandicap, grossDifferentialDecimal, meanHandicap } from './handicap-decimal.js';

let _lastAiUid = null;
let _lastAiRole = null;
let _aiGeneratorBound = false;

/**
 * Initializes and binds event listeners for the AI Coach interface.
 * Injects the AI modal into the DOM if not already present and sets up 
 * role-based visibility for the "Ask AI" buttons.
 */
export function bindAiGenerator() {
    if (_aiGeneratorBound) return;
    _aiGeneratorBound = true;
    // Inject the modal if it doesn't exist
    if (!document.getElementById('ai-modal-overlay')) {
        const modalContainer = document.createElement('div');
        modalContainer.id = 'ai-modal-container';
        modalContainer.innerHTML = `
            <div id="ai-modal-overlay" class="hidden" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.65);z-index:2000;display:flex;justify-content:center;align-items:center;padding:20px;">
                <div class="card" style="width:100%;max-width:720px;max-height:90vh;display:flex;flex-direction:column;gap:0;padding:0;overflow:hidden;border-radius:16px;">
                    <div style="background:linear-gradient(135deg,#6d28d9,#8b5cf6);padding:20px 24px;display:flex;align-items:center;justify-content:space-between;">
                        <div>
                            <h2 id="ai-modal-title" style="margin:0;color:white;font-size:1.2rem;">✨ AI Coach</h2>
                            <p id="ai-modal-subtitle" style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:0.82rem;">Powered by Gemini</p>
                        </div>
                        <button id="btn-close-ai-modal" aria-label="Close AI Modal" style="background:rgba(255,255,255,0.15);border:none;color:white;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:1.1rem;display:flex;align-items:center;justify-content:center;">✕</button>
                    </div>
                    <div id="ai-loading" class="hidden" style="padding:40px;text-align:center;">
                        <div style="width:48px;height:48px;border:4px solid #e2e8f0;border-top-color:#8b5cf6;border-radius:50%;animation:ai-spin 0.8s linear infinite;margin:0 auto 16px;"></div>
                        <p style="color:#64748b;font-size:0.95rem;">Analysing your stats… Please wait. You can close this window while you wait.</p>
                    </div>
                    <div id="ai-response-area" class="hidden" style="flex:1;overflow-y:auto;padding:24px;">
                        <div id="ai-response-content" style="font-size:0.92rem;line-height:1.7;color:#1e293b;"></div>
                    </div>
                    <div id="ai-error-area" class="hidden" style="padding:24px;text-align:center;color:#ef4444;"><p id="ai-error-msg"></p></div>
                    <div style="padding:16px 24px;border-top:1px solid #e2e8f0;display:flex;gap:10px;background:#f8fafc;">
                        <button id="btn-regenerate-ai" class="btn btn-primary" style="flex:1;margin:0;background:#8b5cf6;border-color:#8b5cf6;">🔄 Regenerate</button>
                        <button id="btn-close-ai-modal-2" class="btn btn-secondary" style="flex:1;margin:0;">Close</button>
                    </div>
                </div>
            </div>
            <style>
                @keyframes ai-spin { to { transform: rotate(360deg) } }
            </style>
        `;
        document.body.appendChild(modalContainer);

        // Re-cache UI elements that were just injected
        UI.aiModalOverlay = document.getElementById('ai-modal-overlay');
        UI.aiModalTitle = document.getElementById('ai-modal-title');
        UI.btnCloseAiModal = document.getElementById('btn-close-ai-modal');
    }

    // (BL-4.13) btn-ai-player / btn-ai-coach never existed in index.html —
    // their bind branches were dead. The player "Ask AI Coach" was removed
    // (simplify E39: the Practice Caddy is the one AI plan); the live entry
    // point is #btn-coach-ai-plan (coach dashboard).
    const btnRegenerate = document.getElementById('btn-regenerate-ai');

    // Coach users who aren't admins never see the coach AI plan.
    if (window.currentUserIsCoach && !window.currentUserIsAdmin) {
        const btnCoachAiPlan = document.getElementById('btn-coach-ai-plan');
        if (btnCoachAiPlan) btnCoachAiPlan.style.display = 'none';
        return;
    }

    if (btnRegenerate) {
        btnRegenerate.addEventListener('click', () => {
            if (_lastAiUid) generateAIResponse(_lastAiUid, _lastAiRole);
        });
    }
    if (UI.btnCloseAiModal) {
        UI.btnCloseAiModal.addEventListener('click', () => UI.aiModalOverlay.classList.add('hidden'));
    }
    const btnClose2 = document.getElementById('btn-close-ai-modal-2');
    if (btnClose2) {
        btnClose2.addEventListener('click', () => UI.aiModalOverlay.classList.add('hidden'));
    }
}

/**
 * Basic markdown parser converting Gemini's text responses into HTML.
 * Handles headers, bold/italic text, and lists.
 * 
 * @param {string} md - The raw markdown text from the AI.
 * @returns {string} Sanitized HTML string for rendering.
 */
function markdownToHtml(md) {
    return md
        .replace(/^### (.+)/gm, '<h3 style="margin:16px 0 6px;color:#6d28d9;">$1</h3>')
        .replace(/^## (.+)/gm, '<h2 style="margin:20px 0 8px;color:#4c1d95;border-bottom:2px solid #ede9fe;padding-bottom:6px;">$1</h2>')
        .replace(/^# (.+)/gm, '<h1 style="margin:0 0 16px;color:#3b0764;">$1</h1>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/^- (.+)/gm, '<li style="margin:4px 0;">$1</li>')
        .replace(/(<li.*<\/li>)/gs, '<ul style="padding-left:20px;margin:8px 0;">$1</ul>')
        .replace(/\n\n/g, '</p><p style="margin:10px 0;">')
        .replace(/^(?!<[hul])/gm, '')
        .trim();
}

/**
 * Orchestrates the AI analysis pipeline:
 * 1. Fetches recent rounds, drills, and shot data for the target user.
 * 2. Processes stats into a human-readable prompt with trend analysis.
 * 3. Calls the 'askAiCoach' Firebase Cloud Function.
 * 4. Renders the resulting Gemini response into the UI modal.
 * 
 * @param {string} uid - The Firestore UID of the player to analyze.
 * @param {string} role - Either 'player' (self-analysis) or 'coach' (student-analysis).
 */
export async function generateAIResponse(uid, role) {
    if (!UI.aiModalOverlay) return;

    // Record here (not in per-button handlers) so 🔁 Regenerate works no
    // matter which entry point opened the modal — the old recording lived in
    // handlers for buttons that never existed, so regenerate was always inert.
    _lastAiUid = uid;
    _lastAiRole = role;

    UI.aiModalOverlay.classList.remove('hidden');
    document.getElementById('ai-loading').classList.remove('hidden');
    document.getElementById('ai-response-area').classList.add('hidden');
    document.getElementById('ai-error-area').classList.add('hidden');
    document.getElementById('btn-regenerate-ai').disabled = true;

    const titleEl = document.getElementById('ai-modal-title');
    const subtitleEl = document.getElementById('ai-modal-subtitle');
    if (titleEl) titleEl.textContent = role === 'player' ? '✨ Your AI Training Plan' : '✨ Lesson Plan Generator';
    if (subtitleEl) subtitleEl.textContent = 'Powered by Gemini — Analysing your data...';

    try {
        const [roundsSnap, pracSnap, shotsSnap] = await Promise.all([
            getDocs(query(collection(db, 'whs_rounds'), where('uid', '==', uid))),
            getDocs(query(collection(db, 'practice_rounds'), where('uid', '==', uid))),
            getDocs(query(collection(db, 'shots'), where('uid', '==', uid)))
        ]);

        let rounds = [];
        roundsSnap.forEach(d => {
            const r = d.data();
            const exactDiff = grossDifferentialDecimal(r);
            rounds.push({ diff: exactDiff.toNumber(), exactDiff, date: r.date?.toDate?.() || new Date(r.date), stats: r.stats || null });
        });
        rounds.sort((a, b) => b.date - a.date);
        const recent5 = rounds.slice(0, 5).map(r => formatHandicap(r.exactDiff));
        const recent10 = rounds.slice(0, 10).map(r => r.exactDiff);

        let trend = 'insufficient data to determine trend';
        if (recent10.length >= 4) {
            const half = Math.floor(recent10.length / 2);
            const recentAvg = meanHandicap(recent10.slice(0, half));
            // Preserve the existing denominator for this diagnostic trend;
            // any odd-window behaviour is outside this rounding-only change.
            const olderAvg = recent10.slice(half).reduce((sum, value) => sum.plus(value), recentAvg.times(0)).div(half);
            const delta = recentAvg.minus(olderAvg);
            if (delta.lt(-0.5)) trend = `IMPROVING (differential has dropped ${formatHandicap(delta.abs())} strokes recently)`;
            else if (delta.gt(0.5)) trend = `DECLINING (differential has increased ${formatHandicap(delta)} strokes recently — needs attention)`;
            else trend = 'STABLE (no significant change)';
        }

        const puttsList = rounds.filter(r => r.stats?.putts).map(r => r.stats.putts);
        const fwyList = rounds.filter(r => r.stats?.fwy).map(r => r.stats.fwy);
        const girList = rounds.filter(r => r.stats?.gir).map(r => r.stats.gir);
        const avg = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : null;

        const statsData = [];
        if (avg(puttsList)) statsData.push({ name: 'Putting', value: +avg(puttsList), benchmark: 32, higherIsBad: true });
        if (avg(fwyList)) statsData.push({ name: 'Fairways Hit', value: +avg(fwyList), benchmark: 7, higherIsBad: false });
        if (avg(girList)) statsData.push({ name: 'Greens in Regulation', value: +avg(girList), benchmark: 9, higherIsBad: false });
        const weakest = statsData.length ? statsData.sort((a, b) => {
            const aGap = a.higherIsBad ? a.value - a.benchmark : a.benchmark - a.value;
            const bGap = b.higherIsBad ? b.value - b.benchmark : b.benchmark - b.value;
            return bGap - aGap;
        })[0] : null;

        let pracSummary = [];
        pracSnap.forEach(d => {
            const p = d.data();
            pracSummary.push(`${p.drillName} (score: ${p.score})`);
        });

        let misses = {};
        shotsSnap.forEach(d => {
            const s = d.data();
            if (s.shape && s.shape !== 'Straight') { misses[s.shape] = (misses[s.shape] || 0) + 1; }
        });
        const topMiss = Object.entries(misses).sort((a, b) => b[1] - a[1])[0];

        let prompt = role === 'player' ? `You are an elite PGA Tour-level golf coach. Analyse the following player data and generate a highly specific, actionable 45-minute solo practice plan. Focus on their single biggest weakness, not generic advice.\n\n` : `You are a senior Director of Coaching at an elite golf academy. A junior coach needs a detailed 60-minute in-person lesson plan for their student. Base it strictly on the data below and be specific.\n\n`;
        prompt += `${role === 'player' ? '**Player Stats:**' : '**Student Stats:**'}\n`;
        prompt += `- Recent Differentials (newest first): [${recent5.join(', ')}]\n`;
        prompt += `- Trend: ${trend}\n`;
        prompt += `- Avg Putts/Round: ${avg(puttsList) || 'Not tracked yet'}\n`;
        prompt += `- Avg Fairways Hit: ${avg(fwyList) ? avg(fwyList) + '/14' : 'Not tracked yet'}\n`;
        prompt += `- Avg GIR: ${avg(girList) ? avg(girList) + '/18' : 'Not tracked yet'}\n`;
        if (weakest) prompt += `- **Identified Weakest Area: ${weakest.name}** (avg ${weakest.value} vs benchmark ~${weakest.benchmark})\n`;
        if (topMiss) prompt += `- Most common miss: ${topMiss[0]} (${topMiss[1]} shots)\n`;
        prompt += `\n**Practice Drills Logged (recent):**\n`;
        prompt += pracSummary.length ? pracSummary.slice(0, 6).join(', ') : 'No drills logged yet.';
        prompt += `\n\n`;

        if (role === 'player') {
            prompt += `Generate a 45-minute practice plan with:\n1. Exactly which area to focus on and why (cite the stats)\n2. 3 specific drills with exact reps/constraints\n3. How to measure success before leaving the range\n\nFormat with clear Markdown headers and bullet points.`;
        } else {
            prompt += `Generate a 60-minute lesson plan with:\n1. The single biggest leak identified from the data (cite exactly why)\n2. Three blocks: Warm-up/Discovery (10 min), Skill Acquisition (35 min), Pressure Testing (15 min)\n3. 2–3 discovery questions to ask the student at the start\n4. Specific drills for each block with constraints\n\nFormat with clear Markdown headers. Be concise and practical.`;
        }

        const askAiCoach = httpsCallable(functions, 'askAiCoach');

        const response = await askAiCoach({ prompt: prompt });
        const rawText = response.data.answer || 'No advice was returned. Choose Regenerate to try again.';
        const html = markdownToHtml(rawText);

        document.getElementById('ai-loading').classList.add('hidden');
        document.getElementById('ai-response-area').classList.remove('hidden');
        document.getElementById('ai-response-content').innerHTML = `<p style="margin:10px 0;">${html}</p>`;
        if (subtitleEl) subtitleEl.textContent = 'Powered by Gemini · Tap Regenerate for a fresh plan';

    } catch (e) {
        console.error('Gemini API error:', e);
        document.getElementById('ai-loading').classList.add('hidden');
        document.getElementById('ai-error-area').classList.remove('hidden');
        document.getElementById('ai-error-msg').textContent = aiErrorMessage(e, 'Could not create the advice. Check your connection, then choose Regenerate to try again.');
    } finally {
        document.getElementById('btn-regenerate-ai').disabled = false;
    }
}

