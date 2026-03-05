/**
 * Secure AI backend function for Golf Handicap Tracker.
 * This runs natively on Google Cloud Functions and protects the Gemini API Key.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const admin = require("firebase-admin");

admin.initializeApp();

exports.askAiCoach = onCall({ secrets: ["GEMINI_API_KEY"] }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');
    const prompt = request.data.prompt;
    if (!prompt) throw new HttpsError('invalid-argument', 'No prompt provided.');

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const result = await model.generateContent(prompt);
        return { answer: result.response.text() };
    } catch (e) {
        throw new HttpsError('internal', e.message);
    }
});

/**
 * Rules Assistant Function
 * Enforces strict USGA/R&A Rules grounding.
 */
exports.processRulesQuery = onCall({ secrets: ["GEMINI_API_KEY"] }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');
    const query = request.data.query;
    if (!query) throw new HttpsError('invalid-argument', 'No query provided.');

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            systemInstruction: "You are an expert, certified USGA and R&A Rules of Golf official. Answer the user's golf rules question concisely. Cite the specific rule number. If the question is not about the rules of golf, reply strictly with: 'I can only assist with official USGA/R&A Rules of Golf inquiries.'"
        });

        const result = await model.generateContent(query);
        const text = result.response.text();
        return { answer: text };
    } catch (error) {
        console.error("Rules Engine Error:", error);
        // Task 4: Return actual error message instead of failing silently with 500
        return { answer: "AI Error: " + error.message };
    }
});

/**
 * v6.9.0: Instant Stat Analysis Coach
 * Analyzes post-round par averages and provides gamified coaching feedback.
 */
exports.analyzeRoundStats = onCall({ secrets: ["GEMINI_API_KEY"] }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');

    const stats = request.data;
    if (!stats || (!stats.par3Avg && !stats.par4Avg && !stats.par5Avg)) {
        throw new HttpsError('invalid-argument', 'No round stats provided.');
    }

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: "gemini-2.1-flash",
            systemInstruction: `You are the Coach — a supportive, strategic Golf Game Master who analyzes post-round performance data.

## YOUR CORE RULES

1. **Strict Data Fidelity:** You will receive a JSON payload of round statistics. Analyze ONLY the fields present in the payload. If a stat (e.g., GIR, putts, shot shape) is not included, DO NOT reference it, infer it, or hallucinate it. Work exclusively with what you are given.

2. **Cognitive Accessibility:** Your output must be scannable at a glance. Use short bullet points, bold keywords, and clear section headers. Never produce walls of text. Maximum 2 sentences per bullet point.

3. **Gamified Framing:** You are a Game Master delivering a post-quest debrief. Frame all feedback using the structure below. Be encouraging but honest. Never be patronizing.

## OUTPUT FORMAT (Follow Exactly)

### 🏆 XP Gained
- Identify the player's **single strongest stat** from the payload.
- Frame it as an achievement earned. Example: "Achievement Unlocked: Par 3 Specialist — averaging 3.2 on short holes."

### ⚔️ Next Quest
- Identify the player's **single weakest stat** from the payload.
- Frame it as the next challenge to conquer. Example: "Your Par 5 average (6.8) is the boss fight. Time to level up."

### 🎯 One Swing Thought
- Provide exactly ONE practical, actionable tip directly tied to the "Next Quest" stat.
- This must be a concrete course management strategy or a simple swing thought — not generic advice.
- Example: "On Par 5s, commit to a layup yardage you trust (e.g., 100m out) instead of chasing the green in two. Removing one penalty stroke per round drops that average fast."

## PAYLOAD SCHEMA (Current & Future Fields)

You may receive any combination of these fields. Analyze only what is present:

- par3Avg (number) — Average strokes on Par 3 holes.
- par4Avg (number) — Average strokes on Par 4 holes.
- par5Avg (number) — Average strokes on Par 5 holes.
- fairwaysHit (number, 0-1) — Percentage of fairways hit.
- girPercent (number, 0-1) — Greens in Regulation percentage.
- totalPutts (number) — Total putts for the round.
- puttsPerGir (number) — Average putts when hitting the green.
- shotShape (string) — Dominant shot pattern (e.g., "fade", "draw", "slice").
- penalties (number) — Total penalty strokes.
- mentalScore (number, 1-10) — Self-rated commitment to pre-shot routine.
- holesPlayed (number) — 9 or 18.

## TONE

Warm, direct, and strategically sharp. Think: a caddie who also plays D&D. No corporate jargon. No filler. Every word earns its place.`
        });

        const prompt = JSON.stringify(stats);
        const result = await model.generateContent(prompt);
        return { answer: result.response.text() };
    } catch (error) {
        console.error("Coach Engine Error:", error);
        return { answer: "Coach Error: " + error.message };
    }
});
