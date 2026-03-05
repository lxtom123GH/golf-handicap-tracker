/**
 * Secure AI backend function for Golf Handicap Tracker.
 * v6.17.5: Region bridge fixed — frontend now targets australia-southeast1 explicitly.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { GoogleGenAI } = require("@google/genai");
const admin = require("firebase-admin");

admin.initializeApp();

const REGION = "australia-southeast1";
const MODEL_NAME = "gemini-2.5-flash";

// ==========================================
// Helper: Initialise AI client
// ==========================================
function getAiClient() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY secret not available.");
    return new GoogleGenAI({ apiKey });
}

// ==========================================
// askAiCoach
// ==========================================
exports.askAiCoach = onCall({ region: REGION, secrets: ["GEMINI_API_KEY"] }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');
    const prompt = request.data.prompt;
    if (!prompt) throw new HttpsError('invalid-argument', 'No prompt provided.');

    try {
        const ai = getAiClient();
        console.log(`[AI Coach] Using model: ${MODEL_NAME}`);
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
        });
        return { answer: response.text };
    } catch (e) {
        console.error("[AI Coach] Error:", e);
        throw new HttpsError('internal', e.message);
    }
});

// ==========================================
// processRulesQuery
// ==========================================
exports.processRulesQuery = onCall({ region: REGION, secrets: ["GEMINI_API_KEY"] }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');
    const query = request.data.query;
    if (!query) throw new HttpsError('invalid-argument', 'No query provided.');

    try {
        const ai = getAiClient();
        console.log(`[Rules AI] Using model: ${MODEL_NAME}`);
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: query,
            config: {
                systemInstruction: "You are an expert, certified USGA and R&A Rules of Golf official. Answer the user's golf rules question concisely. Cite the specific rule number. If the question is not about the rules of golf, reply strictly with: 'I can only assist with official USGA/R&A Rules of Golf inquiries.'"
            }
        });
        return { answer: response.text };
    } catch (error) {
        console.error("Rules Engine Error:", error);
        return { answer: "AI Error: " + error.message };
    }
});

// ==========================================
// analyzeRoundStats
// ==========================================
exports.analyzeRoundStats = onCall({ region: REGION, secrets: ["GEMINI_API_KEY"] }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');

    const stats = request.data;
    if (!stats || (!stats.par3Avg && !stats.par4Avg && !stats.par5Avg)) {
        throw new HttpsError('invalid-argument', 'No round stats provided.');
    }

    try {
        const ai = getAiClient();
        console.log(`[Stats AI] Using model: ${MODEL_NAME}`);
        const systemInstruction = `You are the Coach — a supportive, strategic Golf Game Master who analyzes post-round performance data.

## YOUR CORE RULES

1. **Strict Data Fidelity:** You will receive a JSON payload of round statistics. Analyze ONLY the fields present in the payload. If a stat (e.g., GIR, putts, shot shape) is not included, DO NOT reference it, infer it, or hallucinate it. Work exclusively with what you are given.

2. **Cognitive Accessibility:** Your output must be scannable at a glance. Use short bullet points, bold keywords, and clear section headers. Never produce walls of text. Maximum 2 sentences per bullet point.

3. **Gamified Framing:** You are a Game Master delivering a post-quest debrief. Frame all feedback using the structure below. Be encouraging but honest. Never be patronizing.

## OUTPUT FORMAT (Follow Exactly)

### 🏆 XP Gained
- Identify the player's **single strongest stat** from the payload.
- Frame it as an achievement earned.

### ⚔️ Next Quest
- Identify the player's **single weakest stat** from the payload.
- Frame it as the next challenge to conquer.

### 🎯 One Swing Thought
- Provide exactly ONE practical, actionable tip directly tied to the "Next Quest" stat.

## TONE
Warm, direct, and strategically sharp. Think: a caddie who also plays D&D. No corporate jargon. No filler.`;

        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: JSON.stringify(stats),
            config: { systemInstruction }
        });
        return { answer: response.text };
    } catch (error) {
        console.error("Coach Engine Error:", error);
        return { answer: "Coach Error: " + error.message };
    }
});

// ==========================================
// generateAudioBriefing — Caddy Brain (v6.17.4)
// ==========================================
/**
 * Multi-modal Cloud Function that ingests a raw audio diary and returns a
 * structured summary using gemini-2.5-flash inlineData (Base64).
 */
exports.generateAudioBriefing = onCall({ region: REGION, secrets: ["GEMINI_API_KEY"] }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');

    const { audioUrl } = request.data;
    if (!audioUrl) throw new HttpsError('invalid-argument', 'No audioUrl provided.');

    try {
        const ai = getAiClient();

        // Model Spy — prints available models so we can diagnose issues in Cloud Logs
        try {
            const models = await ai.models.list();
            const modelNames = [];
            for await (const m of models) { modelNames.push(m.name); }
            console.log("[Model Spy] Available models:", modelNames.join(", "));
        } catch (spyErr) {
            console.warn("[Model Spy] Could not list models:", spyErr.message);
        }

        console.log(`[Audio AI] Using model: ${MODEL_NAME}`);

        // 1. Fetch file from Storage
        const fetchResponse = await fetch(audioUrl);
        if (!fetchResponse.ok) throw new Error(`Could not fetch audio file. Status: ${fetchResponse.status}`);

        const buffer = await fetchResponse.arrayBuffer();
        const base64Audio = Buffer.from(buffer).toString('base64');

        // Detect MIME type from Content-Type header, fall back to audio/webm
        const contentType = fetchResponse.headers.get('content-type') || 'audio/webm';
        const mimeType = contentType.split(';')[0].trim();
        console.log(`[Audio AI] Detected MIME type: ${mimeType}, buffer size: ${buffer.byteLength} bytes`);

        if (buffer.byteLength < 1000) {
            return {
                writtenSummary: "Not enough audio data to analyze.",
                verbalBriefing: "I couldn't quite catch that. Try a longer recording next time!"
            };
        }

        // 2. Build the multi-modal prompt in @google/genai format
        const textPrompt = `You are an expert Golf Caddy. Listen to this raw audio diary. Ignore filler words.
Return a JSON object with exactly two fields:
"writtenSummary": A 3-bullet markdown list covering 1. One 'Big Win', 2. One technical fault, 3. One specific drill/focus.
"verbalBriefing": A short, natural, 2-3 sentence conversational summary intended to be read aloud.

If the audio is silent, too short, or contains no golf-related content, return:
{ "writtenSummary": "Not enough audio data to analyze.", "verbalBriefing": "I couldn't quite catch that. Try a longer recording next time!" }`;

        // 3. Generate content with @google/genai multi-part format
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: [
                {
                    role: "user",
                    parts: [
                        { text: textPrompt },
                        {
                            inlineData: {
                                data: base64Audio,
                                mimeType: mimeType
                            }
                        }
                    ]
                }
            ]
        });

        const responseText = response.text;
        console.log("[Audio AI] Raw response:", responseText.substring(0, 200));

        // 4. Safety: strip markdown code fences if model wraps output
        const cleanJson = responseText.replace(/```json\s*|```\s*/g, "").trim();
        try {
            return JSON.parse(cleanJson);
        } catch (e) {
            console.warn("[Briefing] JSON parse failed, returning raw text.");
            return {
                writtenSummary: responseText,
                verbalBriefing: "I've analyzed your round. Take a look at the summary for details."
            };
        }

    } catch (error) {
        console.error("[Audio Briefing] Fatal Error:", error);
        throw new HttpsError('internal', error.message || "Failed to generate briefing.");
    }
});

// ==========================================
// generatePracticePlan — AI Practice Caddy (v6.19.0)
// ==========================================
/**
 * Generates a 3-step PII-free practice drill from the user's latest AI round summary.
 * Uses a decoupled Firestore schema:
 *   - global_drills/{drillId}: de-identified, shareable drill steps
 *   - users/{uid}/practice_plans/active: personal tracking document
 *
 * Quota Guard: If an active drill already exists, returns it immediately — no Gemini call.
 */
exports.generatePracticePlan = onCall({ region: REGION, secrets: ["GEMINI_API_KEY"] }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');

    const uid = request.auth.uid;
    const db = admin.firestore();

    console.log(`[Practice Caddy] Request from uid: ${uid}`);

    // --- QUOTA GUARD: Check for an existing active plan ---
    const activePlanRef = db.collection('users').doc(uid).collection('practice_plans').doc('active');
    const activePlanSnap = await activePlanRef.get();

    if (activePlanSnap.exists && activePlanSnap.data().status === 'active') {
        const existingData = activePlanSnap.data();
        const drillSnap = await db.collection('global_drills').doc(existingData.drillId).get();
        console.log(`[Practice Caddy] Returning existing active plan: ${existingData.drillId}`);
        return {
            source: 'cache',
            drillId: existingData.drillId,
            steps: drillSnap.exists ? drillSnap.data().steps : [],
            category: drillSnap.exists ? drillSnap.data().category : 'General',
            targetMetric: drillSnap.exists ? drillSnap.data().targetMetric : '',
            completedSteps: existingData.completedSteps || [false, false, false],
        };
    }

    // --- GENERATION: Fetch latest aiSummary from Firestore ---
    const roundsSnap = await db.collection('users').doc(uid).collection('rounds')
        .orderBy('date', 'desc')
        .limit(5)
        .get();

    let aiSummary = null;
    for (const roundDoc of roundsSnap.docs) {
        const d = roundDoc.data();
        if (d.aiSummary) { aiSummary = d.aiSummary; break; }
    }

    // Fallback: use generic stats if no AI summary exists yet
    const inputText = aiSummary
        ? `Round summary: ${aiSummary}`
        : 'The golfer needs to improve consistency across all areas of the game, with particular focus on short game and putting.';

    console.log(`[Practice Caddy] Input for Gemini (first 200 chars): ${inputText.substring(0, 200)}`);

    const systemInstruction = `You are a professional golf practice coach. You will receive a summary of a golf round analysis.
Your job is to generate a 3-step practice drill plan based on the SKILLS and PATTERNS described.

CRITICAL RULES:
1. NEVER include player names, scores, dates, course names, or any identifying information.
2. Each drill must be a GENERIC skill instruction applicable to any golfer.
3. Identify ONE category from: [Putting, Short Game, Iron Play, Driver, Mental Game, Course Management].
4. Identify the targetMetric most relevant to the drill (e.g. "Putts Per Round", "GIR%", "Fairways Hit").

Return ONLY a valid JSON object with no markdown fences:
{
  "category": "<category>",
  "targetMetric": "<metric>",
  "steps": [
    "Step 1: <specific generic drill instruction>",
    "Step 2: <specific generic drill instruction>",
    "Step 3: <specific generic drill instruction>"
  ]
}`;

    try {
        const ai = getAiClient();
        console.log(`[Practice Caddy] Calling Gemini model: ${MODEL_NAME}`);
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: inputText,
            config: { systemInstruction }
        });

        const rawText = response.text;
        console.log(`[Practice Caddy] Raw Gemini response: ${rawText.substring(0, 300)}`);

        // Strip markdown fences if model wraps output
        const cleanJson = rawText.replace(/```json\s*|```\s*/g, "").trim();
        let drillData;
        try {
            drillData = JSON.parse(cleanJson);
        } catch (parseErr) {
            console.error(`[Practice Caddy] JSON parse failed: ${parseErr.message}`);
            throw new HttpsError('internal', 'AI returned invalid JSON. Please try again.');
        }

        if (!drillData.steps || drillData.steps.length !== 3) {
            throw new HttpsError('internal', 'AI did not return 3 drill steps. Please try again.');
        }

        // --- DECOUPLED WRITE: global_drills ---
        const drillRef = db.collection('global_drills').doc();
        await drillRef.set({
            steps: drillData.steps,
            category: drillData.category || 'General',
            targetMetric: drillData.targetMetric || '',
            generatedAt: admin.firestore.FieldValue.serverTimestamp(),
            completionCount: 0,
            averageRating: 0,
            ratingCount: 0,
        });
        console.log(`[Practice Caddy] Written to global_drills/${drillRef.id}`);

        // --- DECOUPLED WRITE: personal practice plan ---
        await activePlanRef.set({
            drillId: drillRef.id,
            status: 'active',
            completedSteps: [false, false, false],
            userRating: null,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`[Practice Caddy] Written to users/${uid}/practice_plans/active`);

        return {
            source: 'generated',
            drillId: drillRef.id,
            steps: drillData.steps,
            category: drillData.category || 'General',
            targetMetric: drillData.targetMetric || '',
            completedSteps: [false, false, false],
        };

    } catch (error) {
        console.error("[Practice Caddy] Fatal Error:", error);
        throw new HttpsError('internal', error.message || "Failed to generate practice plan.");
    }
});
