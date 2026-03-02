/**
 * Secure AI backend function for Golf Handicap Tracker.
 * This runs natively on Google Cloud Functions and protects the Gemini API Key.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const admin = require("firebase-admin");

admin.initializeApp();

exports.askAiCoach = onCall({ secrets: ["GEMINI_API_KEY"] }, async (request) => {
    // 1. Authenticate Request
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'You must be logged in to use the AI Coach.');
    }

    const prompt = request.data.prompt;
    if (!prompt) {
        throw new HttpsError('invalid-argument', 'No prompt provided.');
    }

    try {
        // 2. Initialize securely using the Secret Manager injection
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new HttpsError('failed-precondition', 'Server is missing the AI configuration key.');
        }

        const genAI = new GoogleGenerativeAI(apiKey, { apiVersion: "v1beta" });
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        // 3. Make the API Call
        const result = await model.generateContent(prompt);
        const text = result.response.text();

        // 4. Return result back to the frontend Client
        return { answer: text };

    } catch (error) {
        console.error("AI execution error:", error);
        throw new HttpsError('internal', 'Failed to generate AI response: ' + error.message);
    }
});
