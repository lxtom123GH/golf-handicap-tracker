import { InputMessage, userErrorMessage } from './user-messages.js';
// ==========================================
// pending-rounds.js — marker-attested cards
// ==========================================
//
// HOW GOLF ACTUALLY WORKS, which is the point. One player marks the card for the
// group; the player whose card it is checks it and signs. Nothing reaches a
// handicap record on a marker's say-so alone, and nothing is lost either.
//
// So: you keep score for the fourball, each registered partner receives a
// pre-filled card, and it becomes a round on their record when THEY approve it.
//
// THE SECURITY ARGUMENT, and why this beats the alternative. Approving writes
// the round under the APPROVER's own credentials, so `whs_rounds` stays
// self-only and the rule the 2026-09-10 sweep found being violated (F-5) is
// never widened. A pending card is a proposal carrying no handicap weight; only
// its owner can turn it into a record. Contrast letting a marker write straight
// into someone else's record, which is what the app used to attempt and what
// the rules correctly refused.
//
// AND IT COMPOSES WITH GUESTS. A guest (see guests.js) has no account to approve
// with, so their card is written directly by the host who owns them. A
// registered player has an account, so their card is proposed and they sign it.
// Between them the whole fourball is covered, and neither route lets anybody
// write a handicap record they do not own.

import { db, auth } from './firebase-config.js';
import { escapeHtml } from './escape.js';
import {
    collection, doc, addDoc, setDoc, updateDoc, deleteDoc, getDocs,
    query, where, serverTimestamp
} from "firebase/firestore";

export const PENDING = 'pending';
export const APPROVED = 'approved';
export const DECLINED = 'declined';

/**
 * Propose a card to a registered player.
 *
 * @param {Object} params
 * @param {string} params.playerUid - whose card it is
 * @param {string} params.playerName
 * @param {Object} params.round - the same payload the save path builds
 * @returns {Promise<string|null>} the pending id, or null if it could not be proposed
 */
export async function proposeRound({ playerUid, playerName, round }) {
    const markerUid = auth.currentUser?.uid;
    if (!markerUid) throw new Error('Sign in before marking a card.');
    if (!playerUid || playerUid === markerUid) {
        // Your own round is saved directly; proposing it to yourself would be a
        // card you have to sign twice.
        return null;
    }
    const ref = await addDoc(collection(db, 'pending_rounds'), {
        ...round,
        uid: playerUid,          // whose round it will become
        playerUid,
        playerName: playerName || null,
        markerUid,
        markerName: auth.currentUser?.displayName || null,
        status: PENDING,
        proposedAt: serverTimestamp(),
    });
    return ref.id;
}

/** Cards waiting for the signed-in player to sign. */
export async function listPendingForMe() {
    const uid = auth.currentUser?.uid;
    if (!uid) return [];
    const snap = await getDocs(query(
        collection(db, 'pending_rounds'),
        where('playerUid', '==', uid),
        where('status', '==', PENDING),
    ));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Accept a card: write it to YOUR handicap record, then mark the proposal.
 *
 * The uid on the written round is taken from the signed-in user and never from
 * the proposal, so a doctored pending document cannot place a round on somebody
 * else's record. That is the one line that makes the whole flow safe, and it is
 * why the round is rebuilt here rather than copied wholesale.
 */
export async function approve(pending) {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new InputMessage('Sign in to approve a card.');
    if (!pending?.id) throw new InputMessage('No card is selected. Choose a card, then try again.');
    if (pending.playerUid !== uid) throw new InputMessage('That card belongs to another player. Choose a card addressed to you.');

    const {
        id, playerUid, playerName, markerUid, markerName, status, proposedAt,
        ...roundFields
    } = pending;

    await setDoc(doc(db, 'whs_rounds', `${roundFields.roundId || id}_${uid}`), {
        ...roundFields,
        uid,                                   // ALWAYS the approver
        attestedBy: markerUid || null,         // provenance: who marked it
        attestedByName: markerName || null,
        approvedAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'pending_rounds', id), { status: APPROVED });
    return true;
}

/** Reject a card. It stays visible to the marker, who can see it was declined. */
export async function decline(pendingId) {
    if (!pendingId) return false;
    await updateDoc(doc(db, 'pending_rounds', pendingId), { status: DECLINED });
    return true;
}

/** Clear a settled proposal away. */
export async function dismiss(pendingId) {
    if (!pendingId) return false;
    await deleteDoc(doc(db, 'pending_rounds', pendingId));
    return true;
}

/**
 * Render the "cards waiting for you to sign" panel.
 *
 * Deliberately on the Handicap tab: that is where a person goes to look at
 * their record, so it is where an unsigned card belongs. A card nobody ever
 * sees is the same as a card that was never sent — which is the failure mode
 * the whole flow exists to avoid, and the one the sweep found in its first
 * form (a partner's round silently refused while the screen said it saved).
 *
 * @returns {Promise<number>} how many cards are waiting.
 */
export async function renderPendingCards() {
    const panel = document.getElementById('pending-cards');
    const list = document.getElementById('pending-cards-list');
    if (!panel || !list) return 0;

    let cards = [];
    try {
        cards = await listPendingForMe();
    } catch (e) {
        console.warn('[Pending] could not load cards:', e);
        return 0;
    }

    if (!cards.length) {
        panel.classList.add('hidden');
        list.innerHTML = '';
        return 0;
    }

    list.innerHTML = '';
    for (const c of cards) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid #dbeafe;';
        const who = c.markerName ? `${c.markerName} marked` : 'Someone marked';
        const where = c.course ? ` at ${c.course}` : '';
        const gross = Number.isFinite(c.totalGross) ? c.totalGross : c.adjustedGross;
        row.innerHTML = `<div style="flex:1;">
                <strong>${escapeHtml(who)} your card${escapeHtml(where)}</strong>
                <div style="color:#475569; font-size:0.9rem;">${escapeHtml(String(gross ?? '—'))} strokes${c.holesPlayed ? ` over ${escapeHtml(String(c.holesPlayed))} holes` : ''}</div>
            </div>`;

        const yes = document.createElement('button');
        yes.className = 'btn btn-primary btn-sm';
        yes.textContent = 'Approve';
        const no = document.createElement('button');
        no.className = 'btn btn-secondary btn-sm';
        no.textContent = 'Decline';

        yes.addEventListener('click', async () => {
            yes.disabled = no.disabled = true;
            yes.textContent = 'Saving...';
            try {
                await approve(c);
                await renderPendingCards();
            } catch (err) {
                console.error('[Pending] approve failed:', err);
                yes.disabled = no.disabled = false;
                yes.textContent = 'Approve';
                alert(userErrorMessage(err, 'Could not finish approving that card. Check your scoring record before trying Approve again.'));
            }
        });
        no.addEventListener('click', async () => {
            yes.disabled = no.disabled = true;
            try {
                await decline(c.id);
                await renderPendingCards();
            } catch (err) {
                console.error('[Pending] decline failed:', err);
                yes.disabled = no.disabled = false;
            }
        });

        row.appendChild(yes);
        row.appendChild(no);
        list.appendChild(row);
    }
    panel.classList.remove('hidden');
    return cards.length;
}
