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
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
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
            model: "gemini-1.5-flash",
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
