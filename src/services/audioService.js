/**
 * audioService.js — v6.14.0 Silver Bullet Edition
 * Handles recording and uploading of audio diaries to Firebase Storage.
 * Audit-hardened for iOS Safari, Android Chrome, and unstable mobile connections.
 */
import { auth, storage } from '../firebase-config.js';
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

/**
 * Returns the best-supported MIME type for the current browser/device.
 * Ordered to prefer the best codec first, with a final '' fallback that
 * lets the browser pick its own default (critical for edge-case iOS versions).
 */
function getSupportedMimeType() {
    const types = [
        'audio/webm;codecs=opus', // Chrome/Android — best quality
        'audio/webm',             // Chrome/Android — general
        'audio/mp4;codecs=aac',   // iOS Safari — ideal
        'audio/mp4',              // iOS Safari — general
        'audio/ogg;codecs=opus',  // Firefox desktop
        '',                       // Last resort: let browser choose
    ];
    return types.find(t => t === '' || MediaRecorder.isTypeSupported(t)) ?? '';
}

export const AudioService = {
    mediaRecorder: null,
    audioChunks: [],
    stream: null,

    /**
     * Requests microphone access, re-using an existing live stream when possible.
     * Verifies track readyState to prevent reuse of stopped/ended streams.
     * @returns {Promise<boolean>}
     */
    async requestPermissions() {
        try {
            // Only reuse the stream if all tracks are still live
            const isLive = this.stream?.getTracks().some(t => t.readyState === 'live');
            if (!isLive) {
                this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            }
            return true;
        } catch (e) {
            console.error("Audio permissions denied:", e);
            this.stream = null;
            return false;
        }
    },

    /**
     * Starts the audio recording process.
     * Uses a ranked MIME type check for maximum cross-browser/cross-device compatibility.
     */
    async startRecording() {
        const hasPermission = await this.requestPermissions();
        if (!hasPermission) throw new Error("Microphone permission required");

        this.audioChunks = [];

        const mimeType = getSupportedMimeType();
        const options = mimeType ? { mimeType } : {};

        this.mediaRecorder = new MediaRecorder(this.stream, options);

        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                this.audioChunks.push(event.data);
            }
        };

        this.mediaRecorder.start();
        console.log(`[AudioService] Recording started — MIME: ${this.mediaRecorder.mimeType || 'browser default'}`);
    },

    /**
     * Stops recording and resolves with the final audio Blob.
     * Explicitly stops all MediaStream tracks to turn off the hardware microphone indicator.
     * @returns {Promise<Blob>}
     */
    stopRecording() {
        return new Promise((resolve, reject) => {
            if (!this.mediaRecorder) return reject(new Error("No active recorder"));

            this.mediaRecorder.onstop = () => {
                const blob = new Blob(this.audioChunks, { type: this.mediaRecorder.mimeType });

                // CRITICAL: Stop tracks explicitly to kill the microphone hardware light
                if (this.stream) {
                    this.stream.getTracks().forEach(track => track.stop());
                    this.stream = null;
                }
                this.mediaRecorder = null;
                this.audioChunks = [];
                resolve(blob);
            };

            this.mediaRecorder.stop();
        });
    },

    /**
     * Uploads the audio Blob to Firebase Storage under a user-isolated path.
     * Includes a 30-second race timeout for resilience on mobile networks.
     * @param {Blob} blob - The recorded audio data.
     * @param {string} roundId - The ID of the current round.
     * @returns {Promise<string>} The download URL of the uploaded file.
     */
    async uploadDiary(blob, roundId) {
        if (!auth.currentUser) throw new Error("User must be authenticated to upload");

        const uid = auth.currentUser.uid;
        const timestamp = Date.now();
        // Safely detect extension from the actual blob MIME type
        const extension = blob.type.includes('ogg') ? 'ogg'
            : blob.type.includes('webm') ? 'webm'
                : 'mp4';

        const storageRef = ref(storage, `audio_diaries/${uid}/${roundId}_${timestamp}.${extension}`);
        console.log(`[AudioService] Uploading to: ${storageRef.fullPath}`);

        // Race the upload against a 30s timeout to prevent UI hanging on poor connections
        const uploadPromise = uploadBytes(storageRef, blob).then(snap => getDownloadURL(snap.ref));
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Upload timed out. Please check your connection and try again.")), 30000)
        );

        return await Promise.race([uploadPromise, timeoutPromise]);
    }
};
