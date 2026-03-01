// ==========================================
// config.js
// App-wide configuration constants
// ==========================================

// Gemini API Key - used for AI Coach live responses
// This is safe for a private internal app
export const GEMINI_API_KEY = "AIzaSyCiQREk9sGYYrUKtUhMxnAx_l-gzG9qCoQ";
export const GEMINI_MODEL = "gemini-2.0-flash";
export const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
