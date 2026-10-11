// @vitest-environment node
//
// STORAGE RULES — pending accounts cannot upload (pre-publish security gate,
// 2026-10-09).
//
// A self-registered account sits in the pending-approval holding pen
// (isApproved:false) until an admin approves it. Before this gate it could
// upload unlimited audio of any type to audio_diaries/{uid}/ and swing videos
// to videos/{uid}/. Uploads now need an APPROVED owner (isApproved == true, or
// an admin — the same definition as functions/approval.js), and audio diaries
// are audio/* only and under 25 MB. Read/delete stay owner-only as before.
//
// storage.rules reads users/{uid} from Firestore (cross-service rules), so this
// suite runs against BOTH emulators; `npm run test:rules` starts them.
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';
import { doc, setDoc } from 'firebase/firestore';

let testEnv;

const APPROVED = 'approveduser00000000000000';
const PENDING = 'pendinguser000000000000000';
const ADMIN = 'adminuser00000000000000000';     // isAdmin, no isApproved field
const LEGACY = 'legacyuser0000000000000000';    // no isApproved field at all
const NODOC = 'nodocuser00000000000000000';     // signed in, no users/{uid} doc
const MB = 1024 * 1024;

beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
        projectId: 'demo-golf-tracker',
        firestore: {
            rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'),
            host: '127.0.0.1',
            port: Number(process.env.EMU_FIRESTORE_PORT || 8080)
        },
        storage: {
            rules: readFileSync(resolve(__dirname, '../../storage.rules'), 'utf8'),
            host: '127.0.0.1',
            port: Number(process.env.EMU_STORAGE_PORT || 9199)
        },
    });
    await testEnv.clearFirestore();
    await testEnv.clearStorage();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, 'users', APPROVED), { isApproved: true });
        await setDoc(doc(db, 'users', PENDING), { isApproved: false });
        await setDoc(doc(db, 'users', ADMIN), { isAdmin: true });
        await setDoc(doc(db, 'users', LEGACY), { displayName: 'Legacy' });
    });
}, 30000);

afterAll(async () => { await testEnv.cleanup(); });

const storageOf = (uid) => testEnv.authenticatedContext(uid).storage();
const bytes = (n) => new Uint8Array(n);
const audio = (uid, path, size = 10, contentType = 'audio/webm;codecs=opus') =>
    uploadBytes(ref(storageOf(uid), path), bytes(size), { contentType });

describe('audio_diaries/{uid}', () => {
    it('lets an approved owner upload, read and delete their diary', async () => {
        const path = `audio_diaries/${APPROVED}/r1_1.webm`;
        await assertSucceeds(audio(APPROVED, path));
        await assertSucceeds(getBytes(ref(storageOf(APPROVED), path)));
        await assertSucceeds(deleteObject(ref(storageOf(APPROVED), path)));
    });

    it('accepts every type the recorder emits, and an admin without isApproved', async () => {
        for (const [ext, type] of [['webm', 'audio/webm'], ['mp4', 'audio/mp4'], ['ogg', 'audio/ogg;codecs=opus']]) {
            await assertSucceeds(audio(APPROVED, `audio_diaries/${APPROVED}/t.${ext}`, 10, type));
        }
        await assertSucceeds(audio(ADMIN, `audio_diaries/${ADMIN}/r1_1.mp4`, 10, 'audio/mp4'));
    });

    it('refuses a pending account, a legacy doc without isApproved, and no user doc', async () => {
        await assertFails(audio(PENDING, `audio_diaries/${PENDING}/r1_1.webm`));
        await assertFails(audio(LEGACY, `audio_diaries/${LEGACY}/r1_1.webm`));
        await assertFails(audio(NODOC, `audio_diaries/${NODOC}/r1_1.webm`));
    });

    it('refuses non-audio content types', async () => {
        await assertFails(audio(APPROVED, `audio_diaries/${APPROVED}/x.bin`, 10, 'application/octet-stream'));
        await assertFails(audio(APPROVED, `audio_diaries/${APPROVED}/x.mp4`, 10, 'video/mp4'));
        await assertFails(audio(APPROVED, `audio_diaries/${APPROVED}/x.html`, 10, 'text/html'));
    });

    it('caps a diary below 25 MB', async () => {
        await assertSucceeds(audio(APPROVED, `audio_diaries/${APPROVED}/under.webm`, 25 * MB - 1));
        await assertFails(audio(APPROVED, `audio_diaries/${APPROVED}/over.webm`, 25 * MB));
    }, 120000);

    it('keeps another user out of the diary folder entirely', async () => {
        const path = `audio_diaries/${APPROVED}/private.webm`;
        await assertSucceeds(audio(APPROVED, path));
        await assertFails(audio(ADMIN, path));
        await assertFails(getBytes(ref(storageOf(PENDING), path)));
        await assertFails(deleteObject(ref(storageOf(ADMIN), path)));
        await assertFails(getBytes(ref(testEnv.unauthenticatedContext().storage(), path)));
    });
});

describe('videos/{uid}', () => {
    const video = (uid, name = 'swing.mp4') =>
        uploadBytes(ref(storageOf(uid), `videos/${uid}/${name}`), bytes(10), { contentType: 'video/mp4' });

    it('lets an approved owner (or an admin) upload a swing video', async () => {
        await assertSucceeds(video(APPROVED));
        await assertSucceeds(video(ADMIN));
    });

    it('refuses an upload from a pending account', async () => {
        await assertFails(video(PENDING));
        await assertFails(video(LEGACY));
    });
});
