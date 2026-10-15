import { InputMessage } from './user-messages.js';
// ==========================================
// guests.js — golfers who play with you but have no account
// ==========================================
//
// THE PRODUCT PROBLEM. You play with your dad and your brothers. They have no
// club membership and no way to track a handicap, and they are never going to
// sign up to an app to play four times a year. You want to mark their card and
// have it build them a handicap.
//
// WHY NOT JUST LET A MARKER WRITE A PARTNER'S ROUND. That was the shape the app
// already had, and the 2026-09-10 sweep found it silently broken: it wrote one
// `whs_rounds` document per player in the group, `firestore.rules` allowed only
// your own, every partner document was refused, and the locker room said "Round
// Saved Successfully" regardless. The fix in PR #138 made the refusal honest.
// Making the WRITE succeed instead would mean allowing any authenticated user to
// write into any other user's handicap record — and in a handicap system the
// record is the product. That cannot be the answer.
//
// A GUEST IS AN IDENTITY YOU OWN. `guests/guest_<id>` carries `ownerUid` and a
// display name. Their rounds are ordinary `whs_rounds` documents whose `uid` is
// the guest id and which name you as `guestOwnerUid`. So "write a round for
// someone else" becomes "write a round for a player who belongs to me", which
// the rules can check — and everything downstream (calculateIndex, the scoring
// record, the trend chart) works on them unchanged, because a guest's rounds are
// just rounds.
//
// THE PREFIX IS LOAD-BEARING. Guest ids must start with `guest_`. Without it,
// anyone could create `guests/<someone-else's-uid>`, name themselves the owner,
// and write rounds into a real golfer's index. Firebase Auth uids are
// 28-character alphanumerics and never contain an underscore, so the prefix
// makes a guest id incapable of naming a real account. The rules enforce it; so
// does this module, because a client that mints a bad id would just meet a
// permission error it cannot explain.

import { db, auth } from './firebase-config.js';
import {
    collection, doc, setDoc, getDocs, deleteDoc, query, where, serverTimestamp
} from "firebase/firestore";

/** Guest ids are prefixed so they can never collide with a Firebase Auth uid. */
export const GUEST_ID_PREFIX = 'guest_';

export function isGuestId(uid) {
    return typeof uid === 'string' && uid.startsWith(GUEST_ID_PREFIX) && uid.length > GUEST_ID_PREFIX.length;
}

/**
 * Mint a guest id. Random rather than derived from the name, so two guests can
 * share a name and renaming one never moves their rounds.
 */
export function newGuestId() {
    const rand = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID().replace(/-/g, '')
        : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    return `${GUEST_ID_PREFIX}${rand}`;
}

/**
 * Create a guest owned by the signed-in user.
 * @param {string} displayName
 * @returns {Promise<{uid: string, name: string}>}
 */
export async function createGuest(displayName) {
    const name = String(displayName || '').trim();
    if (!name) throw new InputMessage('Enter a name for the guest, then try again.');
    if (name.length > 60) throw new InputMessage('Use a guest name of 60 characters or fewer, then try again.');

    const ownerUid = auth.currentUser?.uid;
    if (!ownerUid) throw new InputMessage('Sign in before adding a guest.');

    const uid = newGuestId();
    await setDoc(doc(db, 'guests', uid), {
        ownerUid,
        displayName: name,
        createdAt: serverTimestamp(),
    });
    return { uid, name };
}

/** Every guest the signed-in user owns. */
export async function listGuests() {
    const ownerUid = auth.currentUser?.uid;
    if (!ownerUid) return [];
    const snap = await getDocs(
        query(collection(db, 'guests'), where('ownerUid', '==', ownerUid))
    );
    return snap.docs.map(d => {
        const data = d.data();
        const hc = parseFloat(data.dailyHandicap);
        return {
            uid: d.id,
            name: data.displayName || 'Guest',
            // Owner 2026-09-20: a guest has no profile handicap index, so the
            // number typed at Start Round is remembered HERE and prefills the
            // next round. 0 is a real scratch handicap, so test for finite.
            dailyHandicap: Number.isFinite(hc) ? hc : null,
        };
    });
}

/**
 * Remember a guest's daily handicap (owner 2026-09-20: "how do I put in a
 * daily handicap for them?" — once, not every round). Fire-and-forget at the
 * call site (F-11): a slow write must never hold up Start Round.
 * @param {string} uid guest id
 * @param {number|null} dailyHandicap null clears it, back to automatic
 */
export async function setGuestHandicap(uid, dailyHandicap) {
    if (!isGuestId(uid)) throw new Error('Not a guest id.');
    const ownerUid = auth.currentUser?.uid;
    if (!ownerUid) throw new Error('Sign in first.');
    const value = Number.isFinite(parseFloat(dailyHandicap)) ? parseFloat(dailyHandicap) : null;
    // merge:true — never clobber displayName/ownerUid, which the rules check.
    await setDoc(doc(db, 'guests', uid), { dailyHandicap: value }, { merge: true });
}

/**
 * Remove a guest. Their ROUNDS are deliberately left alone: a handicap record
 * someone built over a season should not evaporate because the host tidied a
 * dropdown, and the rules still let the owner delete the rounds explicitly.
 */
export async function deleteGuest(uid) {
    if (!isGuestId(uid)) throw new Error('Not a guest id.');
    await deleteDoc(doc(db, 'guests', uid));
}
