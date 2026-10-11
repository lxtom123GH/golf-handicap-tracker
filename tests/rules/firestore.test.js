// @vitest-environment node
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

const FieldValueDelete = () => firebase.firestore.FieldValue.delete();

let testEnv;

beforeAll(async () => {
    // CI measured 13.5 s uploading rules. Budget only this initialization,
    // and report slow setup rather than relaxing every hook in the suite.
    const started = Date.now();
    const port = Number(process.env.EMU_FIRESTORE_PORT || 8080);
    testEnv = await initializeTestEnvironment({
        projectId: 'demo-golf-tracker',
        firestore: {
            rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'),
            host: '127.0.0.1',
            port
        },
    });
    const elapsed = Date.now() - started;
    if (elapsed > 10_000) console.warn(`[rules] setup took ${elapsed}ms at 127.0.0.1:${port}`);
}, 20_000);

beforeEach(async () => {
    await testEnv.clearFirestore();
});

afterAll(async () => {
    // A failed beforeAll leaves testEnv undefined; report that one error, not
    // a second "reading 'cleanup'" TypeError on top of it.
    await testEnv?.cleanup();
});

it('keeps goal-derived drill content readable only by the owner or admin', async () => {
    const path = 'users/alice/practice_plans/active';
    await testEnv.withSecurityRulesDisabled(async context => {
        await context.firestore().doc(path).set({
            status: 'active', drill: { steps: ['Dave at Keperra', 'B', 'C'] },
        });
        await context.firestore().doc('users/admin').set({ isAdmin: true });
        await context.firestore().doc('global_drills/generic').set({ steps: ['A', 'B', 'C'] });
    });
    await assertSucceeds(testEnv.authenticatedContext('alice').firestore().doc(path).get());
    await assertSucceeds(testEnv.authenticatedContext('admin').firestore().doc(path).get());
    await assertFails(testEnv.authenticatedContext('bob').firestore().doc(path).get());
    await assertFails(testEnv.unauthenticatedContext().firestore().doc(path).get());
    await assertSucceeds(testEnv.authenticatedContext('bob').firestore().doc('global_drills/generic').get());
});

describe('Firebase Security Rules - WHS Rounds', () => {
    it('Should deny unauthenticated users from reading rounds', async () => {
        const unauthedDb = testEnv.unauthenticatedContext().firestore();
        const q = unauthedDb.collection('whs_rounds');
        await assertFails(q.get());
    });

    it('Should allow approved users to read their rounds and deny creating for others', async () => {
        // Setup approved user
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await db.collection('users').doc('alice').set({ isApproved: true, isAdmin: false });
        });

        const aliceDb = testEnv.authenticatedContext('alice').firestore();

        // The app always scopes reads by uid (whs.js listenToWHSRounds) — an
        // uid-scoped query is provable against the per-doc rule and succeeds;
        // an unfiltered collection scan is NOT provable and must fail.
        await assertSucceeds(aliceDb.collection('whs_rounds').where('uid', '==', 'alice').get());
        await assertFails(aliceDb.collection('whs_rounds').get());

        // Write to self succeeds
        await assertSucceeds(aliceDb.collection('whs_rounds').add({
            uid: 'alice',
            course: 'Pebble Beach',
            adjustedGross: 80,
            rating: 72,
            slope: 113
        }));

        // Write to other user fails
        await assertFails(aliceDb.collection('whs_rounds').add({
            uid: 'bob',
            course: 'Augusta',
            adjustedGross: 80,
            rating: 72,
            slope: 113
        }));
    });

    it('Should deny bad round data creation', async () => {
        // Setup approved user
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await db.collection('users').doc('bob').set({ isApproved: true, isAdmin: false });
        });

        const bobDb = testEnv.authenticatedContext('bob').firestore();

        // Write with bad data (adjusted gross too high) fails
        await assertFails(bobDb.collection('whs_rounds').add({
            uid: 'bob',
            course: 'Pebble Beach',
            adjustedGross: 500, // Invalid, max 200
            rating: 72,
            slope: 113
        }));
    });
    it('Should allow admin to create rounds for other users', async () => {
        // Setup admin user
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await db.collection('users').doc('admin_user').set({ isApproved: true, isAdmin: true });
        });

        const adminDb = testEnv.authenticatedContext('admin_user').firestore();

        // Write to other user succeeds
        await assertSucceeds(adminDb.collection('whs_rounds').add({
            uid: 'someOtherUser',
            course: 'Augusta',
            adjustedGross: 80,
            rating: 72,
            slope: 113
        }));
    });
});

describe('Firebase Security Rules - assigned drills', () => {
    const seed = async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await db.collection('users').doc('student').set({ isApproved: true, coaches: ['coach'] });
            await db.collection('users').doc('coach').set({ isApproved: true });
            await db.collection('users').doc('stranger').set({ isApproved: true });
            await db.collection('users').doc('student').collection('assignedDrills').doc('d1').set({
                drillName: 'Putting ladder', notes: '', assignedBy: 'coach', completed: false
            });
        });
    };

    it('student can read their drills and toggle ONLY completed', async () => {
        await seed();
        const studentDb = testEnv.authenticatedContext('student').firestore();
        const ref = studentDb.collection('users').doc('student').collection('assignedDrills');

        await assertSucceeds(ref.get());
        await assertSucceeds(ref.doc('d1').update({ completed: true }));
        // completedAt travels with the toggle (coach drill-impact view):
        await assertSucceeds(ref.doc('d1').update({ completed: false, completedAt: null }));
        // Editing anything else (or creating/deleting) is coach/admin territory:
        await assertFails(ref.doc('d1').update({ drillName: 'renamed' }));
        await assertFails(ref.doc('d1').update({ completed: true, assignedBy: 'student' }));
        await assertFails(ref.add({ drillName: 'self-assigned', completed: false }));
        await assertFails(ref.doc('d1').delete());
    });

    it('linked coach can create/update/delete; a stranger can do nothing', async () => {
        await seed();
        const coachDb = testEnv.authenticatedContext('coach').firestore();
        const coachRef = coachDb.collection('users').doc('student').collection('assignedDrills');
        await assertSucceeds(coachRef.get());
        await assertSucceeds(coachRef.add({ drillName: 'Bunker reps', assignedBy: 'coach', completed: false }));
        await assertSucceeds(coachRef.doc('d1').update({ notes: 'focus on tempo' }));
        await assertSucceeds(coachRef.doc('d1').delete());

        const strangerDb = testEnv.authenticatedContext('stranger').firestore();
        const strangerRef = strangerDb.collection('users').doc('student').collection('assignedDrills');
        await assertFails(strangerRef.get());
        await assertFails(strangerRef.add({ drillName: 'nope', completed: false }));
        await assertFails(strangerRef.doc('d1').update({ completed: true }));
    });
});

describe('Firebase Security Rules - AI quota counters', () => {
    // quotas/{uid}/daily/{day}: server (Admin SDK) writes only; a user may read
    // their own counter but never write it, and never read anyone else's.
    const dayDoc = (db, uid, day) => db.collection('quotas').doc(uid).collection('daily').doc(day);

    it('lets a user read their OWN daily quota counter', async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await dayDoc(context.firestore(), 'alice', '2026-07-02').set({ count: 3 });
        });
        const aliceDb = testEnv.authenticatedContext('alice').firestore();
        await assertSucceeds(dayDoc(aliceDb, 'alice', '2026-07-02').get());
    });

    it("denies reading another user's quota counter", async () => {
        const aliceDb = testEnv.authenticatedContext('alice').firestore();
        await assertFails(dayDoc(aliceDb, 'bob', '2026-07-02').get());
    });

    it('denies a client writing (inflating/resetting) any quota counter', async () => {
        const aliceDb = testEnv.authenticatedContext('alice').firestore();
        await assertFails(dayDoc(aliceDb, 'alice', '2026-07-02').set({ count: 0 }));
    });

    it('denies an unauthenticated client from touching quota counters', async () => {
        const anonDb = testEnv.unauthenticatedContext().firestore();
        await assertFails(dayDoc(anonDb, 'alice', '2026-07-02').get());
        await assertFails(dayDoc(anonDb, 'alice', '2026-07-02').set({ count: 0 }));
    });
});

describe('Firebase Security Rules - competition visibility', () => {
    const seed = async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await db.collection('competitions').doc('privComp').set({
                name: 'Friday Cup', ownerId: 'owner', visibility: 'private',
                invitedUIDs: ['owner', 'invitee']
            });
            await db.collection('competitions').doc('pubComp').set({
                name: 'Open Comp', ownerId: 'owner', visibility: 'public', invitedUIDs: []
            });
        });
    };

    it('private comp: owner and invited can read, stranger cannot', async () => {
        await seed();
        const ref = (uid) => testEnv.authenticatedContext(uid).firestore().collection('competitions').doc('privComp');
        await assertSucceeds(ref('owner').get());
        await assertSucceeds(ref('invitee').get());
        await assertFails(ref('stranger').get());
    });

    it('public comp readable by any authenticated user; creator must be the owner', async () => {
        await seed();
        const strangerDb = testEnv.authenticatedContext('stranger').firestore();
        await assertSucceeds(strangerDb.collection('competitions').doc('pubComp').get());
        // Cannot forge someone else as owner:
        await assertFails(strangerDb.collection('competitions').add({
            name: 'Forged', ownerId: 'owner', visibility: 'public', invitedUIDs: []
        }));
        await assertSucceeds(strangerDb.collection('competitions').add({
            name: 'Mine', ownerId: 'stranger', visibility: 'private', invitedUIDs: ['stranger']
        }));
    });
});

describe('Firebase Security Rules - competition round deletion', () => {
    it("comp owner may delete OTHER players' rows in their comp; strangers may not", async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await db.collection('users').doc('owner').set({ isApproved: true });
            await db.collection('users').doc('player').set({ isApproved: true });
            await db.collection('users').doc('stranger').set({ isApproved: true });
            await db.collection('competitions').doc('c1').set({ name: 'Cup', ownerId: 'owner', visibility: 'public', invitedUIDs: [] });
            await db.collection('comp_rounds').doc('r1').set({ uid: 'player', compId: 'c1', totalPoints: 30 });
            await db.collection('comp_rounds').doc('r2').set({ uid: 'player', compId: 'c1', totalPoints: 28 });
        });
        const ref = (uid, id) => testEnv.authenticatedContext(uid).firestore().collection('comp_rounds').doc(id);
        await assertFails(ref('stranger', 'r1').delete());
        await assertSucceeds(ref('owner', 'r1').delete());   // comp owner cleanup
        await assertSucceeds(ref('player', 'r2').delete());  // row author still can
    });
});

describe('Firebase Security Rules - competition round reads', () => {
    const seed = async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await db.collection('users').doc('owner').set({ isApproved: true });
            await db.collection('users').doc('invitee').set({ isApproved: true });
            await db.collection('users').doc('player').set({ isApproved: true });
            await db.collection('users').doc('stranger').set({ isApproved: true });
            // Private comp: only owner + invitee (+ its players) should see rounds.
            await db.collection('competitions').doc('priv').set({
                name: 'Friday Cup', ownerId: 'owner', visibility: 'private',
                invitedUIDs: ['owner', 'invitee']
            });
            await db.collection('comp_rounds').doc('pr1').set({ uid: 'player', compId: 'priv', totalPoints: 30 });
            // Public comp: any authed user should see rounds.
            await db.collection('competitions').doc('pub').set({
                name: 'Open', ownerId: 'owner', visibility: 'public', invitedUIDs: []
            });
            await db.collection('comp_rounds').doc('pu1').set({ uid: 'player', compId: 'pub', totalPoints: 25 });
        });
    };

    it('private comp rounds: owner/invitee/author read; uninvited stranger cannot', async () => {
        await seed();
        const ref = (uid, id) => testEnv.authenticatedContext(uid).firestore().collection('comp_rounds').doc(id);
        await assertSucceeds(ref('owner', 'pr1').get());     // comp owner
        await assertSucceeds(ref('invitee', 'pr1').get());   // invited participant
        await assertSucceeds(ref('player', 'pr1').get());    // row author
        await assertFails(ref('stranger', 'pr1').get());     // was globally readable — now denied
    });

    it('public comp rounds: any authenticated user may read', async () => {
        await seed();
        const ref = (uid, id) => testEnv.authenticatedContext(uid).firestore().collection('comp_rounds').doc(id);
        await assertSucceeds(ref('stranger', 'pu1').get());
    });
});

describe('Firebase Security Rules - competition participant entries', () => {
    const seed = async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await db.collection('competitions').doc('c1').set({
                name: 'Cup', ownerId: 'owner', visibility: 'private', invitedUIDs: ['owner', 'player']
            });
        });
    };
    const rounds = (uid) => testEnv.authenticatedContext(uid).firestore().collection('comp_rounds');

    it('comp owner may log a round for another player in their comp', async () => {
        await seed();
        await assertSucceeds(rounds('owner').add({ uid: 'player', compId: 'c1', totalPoints: 30 }));
    });

    it('a player may still log their own row', async () => {
        await seed();
        await assertSucceeds(rounds('player').add({ uid: 'player', compId: 'c1', totalPoints: 28 }));
    });

    it('an OUTSIDER may not forge a row for someone else', async () => {
        await seed();
        // Only competition participants may record a row for another participant.
        await assertFails(rounds('stranger').add({ uid: 'player', compId: 'c1', totalPoints: 99 }));
        // …and a participant forging a row for a NON-participant.
        await assertFails(rounds('player').add({ uid: 'stranger', compId: 'c1', totalPoints: 99 }));
    });
});

describe('Firebase Security Rules - user document reads', () => {
    const seed = async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await db.collection('users').doc('student').set({ email: 's@x.com', isApproved: true, coaches: ['coach'] });
            await db.collection('users').doc('coach').set({ email: 'c@x.com', isApproved: true });
            await db.collection('users').doc('stranger').set({ email: 'z@x.com', isApproved: true });
            await db.collection('users').doc('pending').set({ email: 'p@x.com', isApproved: false });
            await db.collection('users').doc('admin').set({ email: 'a@x.com', isAdmin: true });
            // Directory projection is readable by approved users.
            await db.collection('profiles').doc('student').set({ displayName: 'Stu', isCoach: false, isApproved: true });
        });
    };
    const u = (caller, id) => testEnv.authenticatedContext(caller).firestore().collection('users').doc(id);

    it('owner reads own users doc; stranger cannot read another', async () => {
        await seed();
        await assertSucceeds(u('student', 'student').get());
        await assertFails(u('stranger', 'student').get());   // was globally readable — email now hidden
    });

    it("an assigned coach may read their student's users doc", async () => {
        await seed();
        await assertSucceeds(u('coach', 'student').get());
    });

    it('an admin may read any users doc', async () => {
        await seed();
        await assertSucceeds(u('admin', 'stranger').get());
    });

    it('approved users can read the profile directory while pending users cannot', async () => {
        await seed();
        const approvedDb = testEnv.authenticatedContext('stranger').firestore();
        await assertSucceeds(approvedDb.collection('profiles').doc('student').get());
        await assertSucceeds(approvedDb.collection('profiles').get());

        const pendingDb = testEnv.authenticatedContext('pending').firestore();
        await assertFails(pendingDb.collection('profiles').doc('student').get());
        await assertFails(pendingDb.collection('profiles').get());

        const adminDb = testEnv.authenticatedContext('admin').firestore();
        await assertSucceeds(adminDb.collection('profiles').get());
    });

    // Check list-safe conditions before the document lookup used for individual reads.
    it('a coach may LIST their athletes (where coaches array-contains me)', async () => {
        await seed();
        await assertSucceeds(
            testEnv.authenticatedContext('coach').firestore()
                .collection('users').where('coaches', 'array-contains', 'coach').get()
        );
    });

    it('an admin may LIST approved users; a plain user may not list all users', async () => {
        await seed();
        await assertSucceeds(
            testEnv.authenticatedContext('admin').firestore()
                .collection('users').where('isApproved', '==', true).get()
        );
        // A non-admin, non-coach cannot enumerate the whole users collection.
        await assertFails(
            testEnv.authenticatedContext('stranger').firestore().collection('users').get()
        );
    });
});

describe('Firebase Security Rules - video metadata', () => {
    const seed = async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await db.collection('users').doc('student').set({ isApproved: true, coaches: ['coach'] });
            await db.collection('users').doc('coach').set({ isApproved: true });
            await db.collection('users').doc('stranger').set({ isApproved: true });
            await db.collection('videos').doc('v1').set({
                uid: 'student', path: 'videos/student/v1.mp4', bytes: 1000, angle: 'Face-on'
            });
        });
    };

    it('owner and coach can read; stranger cannot; owner can delete', async () => {
        await seed();
        const ref = (uid) => testEnv.authenticatedContext(uid).firestore().collection('videos').doc('v1');
        await assertSucceeds(ref('student').get());
        await assertSucceeds(ref('coach').get());
        await assertFails(ref('stranger').get());
        await assertFails(ref('stranger').delete());
        await assertSucceeds(ref('student').delete());
    });

    it('create: owner only, bytes must be a plausible number (mirrors the 100MB Storage cap)', async () => {
        await seed();
        const studentDb = testEnv.authenticatedContext('student').firestore();
        await assertSucceeds(studentDb.collection('videos').add({
            uid: 'student', path: 'videos/student/x.mp4', bytes: 50 * 1024 * 1024
        }));
        // Forged owner:
        await assertFails(studentDb.collection('videos').add({
            uid: 'coach', path: 'videos/coach/x.mp4', bytes: 1000
        }));
        // Poisoned byte count (over the per-file cap):
        await assertFails(studentDb.collection('videos').add({
            uid: 'student', path: 'videos/student/y.mp4', bytes: 500 * 1024 * 1024
        }));
    });

    it('owner and coach may update ONLY annotations', async () => {
        await seed();
        const segs = [{ x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.9 }];
        const ref = (uid) => testEnv.authenticatedContext(uid).firestore().collection('videos').doc('v1');
        await assertSucceeds(ref('student').update({ annotations: segs }));
        await assertSucceeds(ref('coach').update({ annotations: [] }));
        await assertFails(ref('stranger').update({ annotations: segs }));
        // Nothing else is mutable, even by the owner:
        await assertFails(ref('student').update({ bytes: 1 }));
        await assertFails(ref('student').update({ annotations: segs, path: 'videos/student/evil.mp4' }));
    });
});

describe('Firebase Security Rules - invite document access', () => {
    const seed = async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await db.collection('preapproved_emails').doc('invitee@example.com').set({ addedAt: '2026-08-01' });
            await db.collection('users').doc('admin').set({ isAdmin: true, isApproved: true });
            await db.collection('users').doc('alice').set({ isApproved: true });
        });
    };

    it('DENIES unauthenticated reads of invite documents', async () => {
        await seed();
        const anonDb = testEnv.unauthenticatedContext().firestore();
        await assertFails(anonDb.collection('preapproved_emails').doc('invitee@example.com').get());
        await assertFails(anonDb.collection('preapproved_emails').get());
    });

    it('signup existence check still works: authed user may GET a single known doc', async () => {
        await seed();
        // Signup may read only the invite document matching its verified auth email.
        const aliceDb = testEnv.authenticatedContext('alice', { email: 'invitee@example.com', email_verified: true }).firestore();
        await assertSucceeds(aliceDb.collection('preapproved_emails').doc('invitee@example.com').get());
        // A miss on one's OWN address is also fine (exists() drives isApproved).
        const bobDb = testEnv.authenticatedContext('bob', { email: 'not-invited@example.com', email_verified: true }).firestore();
        await assertSucceeds(bobDb.collection('preapproved_emails').doc('not-invited@example.com').get());
    });

    it('DENIES a non-admin enumerating the invite list; admin roster still works', async () => {
        await seed();
        const aliceDb = testEnv.authenticatedContext('alice').firestore();
        await assertFails(aliceDb.collection('preapproved_emails').get());
        // Admins may enumerate the invite list.
        const adminDb = testEnv.authenticatedContext('admin').firestore();
        await assertSucceeds(adminDb.collection('preapproved_emails').get());
    });

    it('writes stay admin-only', async () => {
        await seed();
        const aliceDb = testEnv.authenticatedContext('alice').firestore();
        await assertFails(aliceDb.collection('preapproved_emails').doc('friend@example.com').set({ addedAt: 'now' }));
        const adminDb = testEnv.authenticatedContext('admin').firestore();
        await assertSucceeds(adminDb.collection('preapproved_emails').doc('friend@example.com').set({ addedAt: 'now' }));
    });

    it('signup invite lookup compares email addresses case-insensitively', async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            // Invite document IDs are stored in lowercase.
            await db.collection('preapproved_emails').doc('alex@example.com').set({ addedAt: '2026-08-24' });
        });
        // Case-insensitive matching supports the signup email as entered.
        const alexDb = testEnv.authenticatedContext('alex-uid', { email: 'Alex@example.com', email_verified: true }).firestore();
        await assertSucceeds(alexDb.collection('preapproved_emails').doc('Alex@example.com').get());
        // The self-read rule still rejects a different email address.
        await assertFails(alexDb.collection('preapproved_emails').doc('someoneelse@example.com').get());
    });
});

describe('Firebase Security Rules - user role and approval fields', () => {
    const seed = async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await db.collection('users').doc('admin').set({ isAdmin: true, isApproved: true });
            await db.collection('users').doc('mallory').set({
                email: 'm@x.com', displayName: 'Mallory',
                isApproved: true, isAdmin: false, isCoach: false, coaches: []
            });
        });
    };
    const users = (caller) => testEnv.authenticatedContext(caller).firestore().collection('users');

    it('DENIES a non-admin setting isAdmin/isCoach/isApproved on their own doc', async () => {
        await seed();
        await assertFails(users('mallory').doc('mallory').update({ isAdmin: true }));
        await assertFails(users('mallory').doc('mallory').update({ isCoach: true }));
        // Sneaking the flag in alongside an innocent field:
        await assertFails(users('mallory').doc('mallory').update({ displayName: 'Mal', isAdmin: true }));
        // Merge-set is an update too:
        await assertFails(users('mallory').doc('mallory').set({ isAdmin: true }, { merge: true }));
    });

    it('DENIES the delete-then-recreate escalation (create with isAdmin:true)', async () => {
        await seed();
        const mallory = users('mallory');
        await assertSucceeds(mallory.doc('mallory').delete()); // self-delete itself is allowed
        await assertFails(mallory.doc('mallory').set({
            uid: 'mallory', email: 'm@x.com', displayName: 'Mallory',
            isApproved: true, isAdmin: true, isCoach: false, coaches: []
        }));
    });

    it('ALLOWS the signup document shape and legitimate self-updates', async () => {
        await seed();
        // Signup uses the caller's auth email; automatic approval also requires
        // a verified email that appears on the invite list.
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('preapproved_emails').doc('n@x.com')
                .set({ addedAt: '2026-08-01' });
        });
        await assertSucceeds(testEnv.authenticatedContext('newbie', {
            email: 'n@x.com', email_verified: true
        }).firestore()
            .collection('users').doc('newbie').set({
                uid: 'newbie', email: 'n@x.com', displayName: 'Newbie',
                isApproved: true, isAdmin: false, isCoach: false, coaches: []
            }));
        // Legit self-updates never touch the guarded fields:
        await assertSucceeds(users('mallory').doc('mallory').update({ displayName: 'Mal 2' }));
        await assertSucceeds(users('mallory').doc('mallory').update({ coaches: ['some-coach'] })); // coach.js:57
        await assertSucceeds(users('mallory').doc('mallory').update({ strategyPeriods: [] }));     // strategy.js:107
        // Re-writing a guarded field with the SAME value is not a change (diff
        // is empty) — an app-level full setDoc that echoes flags still works:
        await assertSucceeds(users('mallory').doc('mallory').update({ isAdmin: false }));
    });

    it('ALLOWS admin to manage privilege fields on any user (admin.js toggles)', async () => {
        await seed();
        await assertSucceeds(users('admin').doc('mallory').update({ isApproved: false })); // admin.js:170
        await assertSucceeds(users('admin').doc('mallory').update({ isCoach: true }));     // admin.js:180
        await assertSucceeds(users('admin').doc('mallory').update({ isAdmin: true }));     // explicit promotion
    });
});

// ============================================================================
// Authorization regression coverage.

describe('Round feed privacy and follower consent', () => {
    const seed = async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            // Seed a private round and an unaccepted following edge.
            await db.collection('users').doc('author').set({ isApproved: true });
            await db.collection('users').doc('follower').set({ isApproved: true });
            await db.collection('whs_rounds').doc('r1').set({
                uid: 'author', courseName: 'Private CC', adjustedGross: 71,
                visibility: 'private'
            });
            await db.collection('users').doc('follower').collection('following').doc('author').set({
                followedAt: '2026-08-20', followedUid: 'author'
            });
            // Seed a feed entry to verify that its read rule checks consent and visibility.
            await db.collection('feed').doc('f1').set({
                actorUid: 'author', actorDisplayName: 'Author', type: 'round_logged',
                roundId: 'r1', courseName: 'Private CC', adjustedGrossScore: 71,
                handicapDifferential: -0.5, date: '2026-08-20', recipientUid: 'follower'
            });
        });
    };

    it('a private round is not fanned out to followers', async () => {
        await seed();
        const followerDb = testEnv.authenticatedContext('follower').firestore();
        // The follower cannot read the private round or its feed entry.
        await assertFails(followerDb.collection('whs_rounds').doc('r1').get());
        await assertFails(followerDb.collection('feed').doc('f1').get());
    });

    it('following requires the target\'s affirmative consent (followers ledger)', async () => {
        await seed();
        const strangerDb = testEnv.authenticatedContext('stranger').firestore();
        // A following edge requires the target player's prior acceptance.
        await assertFails(strangerDb.collection('users').doc('stranger').collection('following').doc('author').set({
            followedAt: '2026-08-21', followedUid: 'author'
        }));
    });

    it('an accepted follower can follow, but private rounds remain private', async () => {
        await seed();
        await testEnv.withSecurityRulesDisabled(async (context) => {
            // Record the author's acceptance in the consent ledger.
            await context.firestore().collection('users').doc('author')
                .collection('followers').doc('follower').set({ acceptedAt: '2026-08-23' });
        });
        const followerDb = testEnv.authenticatedContext('follower').firestore();
        // Acceptance permits the edge, but does not make a private round readable.
        await followerDb.collection('users').doc('follower').collection('following').doc('author').delete();
        await assertSucceeds(followerDb.collection('users').doc('follower').collection('following').doc('author').set({
            followedAt: '2026-08-21', followedUid: 'author'
        }));
        // ...but the round itself stays private, so its rules still refuse
        // the follower; the fan-out (gate 1) never publishes it.
        await assertFails(followerDb.collection('whs_rounds').doc('r1').get());
    });

    it('only the followed player may accept a follower', async () => {
        await seed();
        const strangerDb = testEnv.authenticatedContext('stranger').firestore();
        // Only the followed player or an admin may write the consent ledger.
        await assertFails(strangerDb.collection('users').doc('author')
            .collection('followers').doc('stranger').set({ acceptedAt: '2026-08-23' }));
    });
});

describe('Profile role and approval fields', () => {
    it('denies profile writes that set role or approval fields', async () => {
        // Public profile fields must not let a user assign their own role or approval.
        const malloryDb = testEnv.authenticatedContext('mallory').firestore();
        await assertFails(malloryDb.collection('profiles').doc('mallory').set({
            displayName: 'Totally A Coach', isCoach: true, isApproved: true
        }));
    });
});

describe('Profile create, update, and delete rules', () => {
    // Clients may seed a handicap index before the server mirrors public profile fields.
    const seedAdmin = async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('users').doc('admin').set({ isAdmin: true });
            await context.firestore().collection('profiles').doc('existing')
                .set({ displayName: 'Existing', isCoach: false, isApproved: true });
        });
    };

    it('ALLOWS a client create with non-privileged fields', async () => {
        await seedAdmin();
        const newbieDb = testEnv.authenticatedContext('newbie').firestore();
        // This exact shape is what src/whs.js writes on first publish.
        await assertSucceeds(newbieDb.collection('profiles').doc('newbie').set({
            handicapIndex: '18.6'
        }, { merge: true }));
    });

    it('DENIES a client create that arrives with isCoach or isApproved set', async () => {
        await seedAdmin();
        const malloryDb = testEnv.authenticatedContext('mallory').firestore();
        // Create-time forgery of the coach roster / approval gate must fail
        // exactly as update-time forgery now does.
        await assertFails(malloryDb.collection('profiles').doc('mallory').set({
            displayName: 'Mallory', isCoach: true, isApproved: true
        }));
        await assertFails(malloryDb.collection('profiles').doc('mallory2').set({
            displayName: 'Mallory 2', isApproved: false
        }));
    });

    it('ALLOWS self-updates of display fields; DENIES flag flips on existing docs', async () => {
        await seedAdmin();
        const ownDb = testEnv.authenticatedContext('existing').firestore();
        await assertSucceeds(ownDb.collection('profiles').doc('existing').update({ displayName: 'Renamed' }));
        await assertFails(ownDb.collection('profiles').doc('existing').update({ isCoach: true }));
        await assertFails(ownDb.collection('profiles').doc('existing').update({ isApproved: false }));
    });

    it('ALLOWS admin updates/deletes on any profile; DENIES stranger writes', async () => {
        await seedAdmin();
        const adminDb = testEnv.authenticatedContext('admin').firestore();
        // Admin manages the directory through UPDATE (the flags live here once
        // the mirror has run) and DELETE — both permitted:
        await assertSucceeds(adminDb.collection('profiles').doc('existing').update({
            isCoach: true
        }));
        await assertSucceeds(adminDb.collection('profiles').doc('existing').delete());
        const malloryDb = testEnv.authenticatedContext('mallory').firestore();
        await assertFails(malloryDb.collection('profiles').doc('existing').update({ displayName: 'Hacked' }));
    });

    it('CREATE stays owner-only, including for admins', async () => {
        // Admin role changes flow through the private user record and its server mirror.
        await seedAdmin();
        const adminDb = testEnv.authenticatedContext('admin').firestore();
        await assertFails(adminDb.collection('profiles').doc('someoneelse').set({
            displayName: 'Seeded', isCoach: true, isApproved: true
        }));
    });
});

describe('Index history is private: users/{uid}/private/handicap', () => {
    const PATH = 'users/student/private/handicap';
    const HISTORY = [{ date: '2026-08-22T09:00:00.000Z', index: '18.6' }];
    const seed = async ({ legacy = false } = {}) => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await db.collection('users').doc('admin').set({ isAdmin: true });
            await db.collection('users').doc('student').set({ isApproved: true, coaches: ['coach'] });
            await db.collection('users').doc('legacycoachstudent').set({ isApproved: true, coachUid: 'coach' });
            await db.collection('users').doc('coach').set({ isApproved: true, isCoach: true });
            await db.collection('users').doc('stranger').set({ isApproved: true });
            await db.collection('users').doc('pending').set({ isApproved: false });
            await db.doc(PATH).set({ indexHistory: HISTORY });
            await db.doc('users/legacycoachstudent/private/handicap').set({ indexHistory: HISTORY });
            await db.collection('profiles').doc('student').set({
                displayName: 'Student', isCoach: false, isApproved: true, handicapIndex: '18.6',
                ...(legacy ? { indexHistory: HISTORY } : {})
            });
        });
    };
    const fs = (uid) => testEnv.authenticatedContext(uid).firestore();

    it('the owner reads and writes their own history', async () => {
        await seed();
        await assertSucceeds(fs('student').doc(PATH).get());
        await assertSucceeds(fs('student').doc(PATH).set({
            indexHistory: [...HISTORY, { date: '2026-09-01T09:00:00.000Z', index: '17.9' }],
            updatedAt: new Date()
        }));
        // First publish: the doc does not exist yet.
        await assertSucceeds(fs('newbie').doc('users/newbie/private/handicap').set({ indexHistory: HISTORY }));
        await assertSucceeds(fs('student').doc(PATH).delete());
    });

    it('a coach (coaches[] or legacy coachUid) and an admin can read, not write', async () => {
        await seed();
        await assertSucceeds(fs('coach').doc(PATH).get());
        await assertSucceeds(fs('coach').doc('users/legacycoachstudent/private/handicap').get());
        await assertSucceeds(fs('admin').doc(PATH).get());
        await assertFails(fs('coach').doc(PATH).set({ indexHistory: [] }));
        await assertFails(fs('coach').doc(PATH).delete());
    });

    it('an unrelated signed-in user, a pending user and a signed-out visitor cannot read or write it', async () => {
        await seed();
        for (const uid of ['stranger', 'pending']) {
            await assertFails(fs(uid).doc(PATH).get());
            await assertFails(fs(uid).doc(PATH).set({ indexHistory: [] }));
            await assertFails(fs(uid).doc(PATH).delete());
        }
        const anon = testEnv.unauthenticatedContext().firestore();
        await assertFails(anon.doc(PATH).get());
    });

    it('the owner write is shape-checked: a list of at most 50, no other fields', async () => {
        await seed();
        const entry = (i) => ({ date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), index: '18.0' });
        await assertSucceeds(fs('student').doc(PATH).set({ indexHistory: Array.from({ length: 50 }, (_, i) => entry(i)) }));
        await assertFails(fs('student').doc(PATH).set({ indexHistory: Array.from({ length: 51 }, (_, i) => entry(i)) }));
        await assertFails(fs('student').doc(PATH).set({ indexHistory: 'nope' }));
        await assertFails(fs('student').doc(PATH).set({ indexHistory: HISTORY, isAdmin: true }));
    });

    it('profiles/{uid} no longer accepts indexHistory writes (create or update), even from admin', async () => {
        await seed();
        await assertFails(fs('newbie').collection('profiles').doc('newbie').set({ handicapIndex: '18.6', indexHistory: HISTORY }));
        await assertFails(fs('student').collection('profiles').doc('student').update({ indexHistory: HISTORY }));
        await assertFails(fs('admin').collection('profiles').doc('student').update({ indexHistory: HISTORY }));
        // The current index stays public and owner-writable.
        await assertSucceeds(fs('student').collection('profiles').doc('student').update({ handicapIndex: '17.9' }));
        await assertSucceeds(fs('stranger').collection('profiles').doc('student').get());
    });

    it('a legacy profiles indexHistory may be left as-is on other edits, or deleted, but not changed', async () => {
        await seed({ legacy: true });
        const own = fs('student').collection('profiles').doc('student');
        await assertSucceeds(own.update({ handicapIndex: '17.9' }));
        await assertSucceeds(own.set({ handicapIndex: '17.8', handicapIndexSource: 'declared' }, { merge: true }));
        await assertFails(own.update({ indexHistory: [...HISTORY, { date: '2026-09-01T09:00:00.000Z', index: '17.9' }] }));
        await assertSucceeds(own.update({ indexHistory: FieldValueDelete() }));
    });
});

describe('Video metadata path ownership', () => {
    const seed = async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await db.collection('users').doc('alice').set({ isApproved: true });
            await db.collection('users').doc('bob').set({ isApproved: true });
        });
    };

    it('denies video metadata pointing to another uid\'s Storage object as its path', async () => {
        await seed();
        const aliceDb = testEnv.authenticatedContext('alice').firestore();
        // Metadata must not point to a Storage object owned by another user.
        await assertFails(aliceDb.collection('videos').add({
            uid: 'alice', path: 'videos/bob/private-swing.mp4',
            bytes: 1000, contentType: 'video/mp4'
        }));
    });
});

describe('Email identity validation', () => {
    it('a self-update cannot plant an unaccounted third-party email', async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('users').doc('mallory')
                .set({ email: 'm@x.com', isApproved: true, isAdmin: false });
        });
        // An email change must match the caller or include approved provenance.
        const malloryDb = testEnv.authenticatedContext('mallory').firestore();
        await assertFails(malloryDb.collection('users').doc('mallory').update({
            email: 'real.person@unlisted-provider.net'
        }));
    });

    it('an admin may still set an email WITH the identity gate satisfied', async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('users').doc('admin1')
                .set({ email: 'a@x.com', isAdmin: true, isApproved: true });
            // The target doc must exist for an update; seed it email-less.
            await context.firestore().collection('users').doc('someone')
                .set({ displayName: 'Someone', isApproved: true, isAdmin: false });
        });
        const adminDb = testEnv.authenticatedContext('admin1').firestore();
        // Reserved-domain addresses are accepted as synthetic identities.
        await assertSucceeds(adminDb.collection('users').doc('someone').update({
            email: 'test.user@example.org'
        }));
    });

    it('signup create with the signer\'s own auth email still succeeds', async () => {
        const newbieDb = testEnv.authenticatedContext('newbie', { email: 'newbie@unlisted-provider.net' }).firestore();
        await assertSucceeds(newbieDb.collection('users').doc('newbie').set({
            uid: 'newbie', email: 'newbie@unlisted-provider.net', displayName: 'New',
            isAdmin: false, isApproved: false
        }));
    });
});

describe('Invite document access', () => {
    const seed = async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await db.collection('preapproved_emails').doc('victim@example.org').set({ addedAt: '2026-08-01' });
            await db.collection('preapproved_emails').doc('probe@own.org').set({ addedAt: '2026-08-01' });
            await db.collection('users').doc('probe').set({ isApproved: true });
        });
    };

    it('probing ANOTHER address is refused outright', async () => {
        await seed();
        const probeDb = testEnv.authenticatedContext('probe', { email: 'probe@own.org', email_verified: true }).firestore();
        // The caller may check only their own verified email.
        await assertFails(probeDb.collection('preapproved_emails').doc('victim@example.org').get());
    });

    it('the signup self-check still works — own address is readable', async () => {
        await seed();
        const probeDb = testEnv.authenticatedContext('probe', { email: 'probe@own.org', email_verified: true }).firestore();
        await assertSucceeds(probeDb.collection('preapproved_emails').doc('probe@own.org').get());
    });

    it('list remains admin-only (no enumeration workaround)', async () => {
        await seed();
        const probeDb = testEnv.authenticatedContext('probe', { email: 'probe@own.org', email_verified: true }).firestore();
        await assertFails(probeDb.collection('preapproved_emails').get());
    });

    it('an unverified caller cannot read their own invite address', async () => {
        await seed();
        const probeDb = testEnv.authenticatedContext('probe', {
            email: 'probe@own.org', email_verified: false
        }).firestore();
        await assertFails(probeDb.collection('preapproved_emails').doc('probe@own.org').get());
    });
});

describe('owner fields are immutable on round and competition result updates', () => {
    const seed = async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await db.collection('users').doc('admin').set({ isAdmin: true });
            await db.collection('whs_rounds').doc('round').set({ uid: 'alice', adjustedGross: 80 });
            await db.collection('shots').doc('shot').set({ uid: 'alice', club: '7 iron' });
            await db.collection('practice_rounds').doc('practice').set({ uid: 'alice', duration: 30 });
            await db.collection('comp_rounds').doc('result').set({
                uid: 'alice', compId: 'competition-a', totalPoints: 30
            });
        });
    };

    it('allows ordinary edits but rejects owner reassignment in every collection', async () => {
        await seed();
        const db = testEnv.authenticatedContext('alice').firestore();

        await assertSucceeds(db.collection('whs_rounds').doc('round').update({ adjustedGross: 81 }));
        await assertSucceeds(db.collection('shots').doc('shot').update({ club: '8 iron' }));
        await assertSucceeds(db.collection('practice_rounds').doc('practice').update({ duration: 35 }));
        await assertSucceeds(db.collection('comp_rounds').doc('result').update({ totalPoints: 31 }));

        await assertFails(db.collection('whs_rounds').doc('round').update({ uid: 'bob' }));
        await assertFails(db.collection('shots').doc('shot').update({ uid: 'bob' }));
        await assertFails(db.collection('practice_rounds').doc('practice').update({ uid: 'bob' }));
        await assertFails(db.collection('comp_rounds').doc('result').update({ uid: 'bob' }));
        await assertFails(db.collection('comp_rounds').doc('result').update({ compId: 'competition-b' }));
        // The create-time score bounds also hold on update.
        await assertFails(db.collection('whs_rounds').doc('round').update({ adjustedGross: 300 }));
        await assertFails(db.collection('whs_rounds').doc('round').update({ adjustedGross: 0 }));
        await assertFails(db.collection('whs_rounds').doc('round').update({ adjustedGross: '81' }));

        // Admins can repair other fields but cannot transfer an existing row.
        const adminDb = testEnv.authenticatedContext('admin').firestore();
        await assertFails(adminDb.collection('whs_rounds').doc('round').update({ uid: 'bob' }));
    });
});

describe('Tempo collection access', () => {
    it('denies client access to the tempo collection', async () => {
        const malloryDb = testEnv.authenticatedContext('mallory').firestore();
        // The tempo collection has no client access rule.
        await assertFails(malloryDb.collection('tempo').doc('junk').set({ payload: 'x' }));
        await assertFails(testEnv.unauthenticatedContext().firestore().collection('tempo').get());
    });
});

// ============================================================================
// Signup and competition authorization cases.

describe('Signup privilege fields', () => {
    const seedInvite = async (email) => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('preapproved_emails').doc(email)
                .set({ addedAt: '2026-09-01' });
        });
    };
    const asUser = (uid, email, email_verified = false) =>
        testEnv.authenticatedContext(uid, { email, email_verified }).firestore().collection('users');

    it('DENIES an uninvited signup self-approving (create with isApproved:true)', async () => {
        // A self-created account cannot approve itself.
        await assertFails(asUser('mallory', 'mallory@example.org').doc('mallory').set({
            uid: 'mallory', email: 'mallory@example.org', displayName: 'Mallory',
            isApproved: true, isAdmin: false, isCoach: false, coaches: []
        }));
    });

    it('DENIES a signup minting itself into the coach directory (create with isCoach:true)', async () => {
        // A self-created account cannot assign itself a coach role.
        await assertFails(asUser('mallory', 'mallory@example.org').doc('mallory').set({
            uid: 'mallory', email: 'mallory@example.org', displayName: 'Mallory',
            isApproved: false, isAdmin: false, isCoach: true, coaches: []
        }));
    });

    it('DENIES the delete-then-recreate variant of the same escalation', async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('users').doc('mallory').set({
                uid: 'mallory', email: 'mallory@example.org', displayName: 'Mallory',
                isApproved: false, isAdmin: false, isCoach: false, coaches: []
            });
        });
        const mallory = asUser('mallory', 'mallory@example.org');
        await assertSucceeds(mallory.doc('mallory').delete()); // rules:142, still allowed
        await assertFails(mallory.doc('mallory').set({
            uid: 'mallory', email: 'mallory@example.org', displayName: 'Mallory',
            isApproved: true, isAdmin: false, isCoach: true, coaches: []
        }));
    });

    it('ALLOWS a genuinely preapproved signup to arrive approved', async () => {
        // Both the verified identity claim and invite list are required.
        await seedInvite('invited@example.org');
        await assertSucceeds(asUser('invitee', 'invited@example.org', true).doc('invitee').set({
            uid: 'invitee', email: 'invited@example.org', displayName: 'Invitee',
            isApproved: true, isAdmin: false, isCoach: false, coaches: []
        }));
    });

    it('ALLOWS a preapproved signup with mixed-case auth email', async () => {
        await seedInvite('invited@example.org');
        await assertSucceeds(asUser('invitee2', 'Invited@Example.ORG', true).doc('invitee2').set({
            uid: 'invitee2', email: 'Invited@Example.ORG', displayName: 'Invitee',
            isApproved: true, isAdmin: false, isCoach: false, coaches: []
        }));
    });

    it('DENIES a self-created users doc with no isApproved field (it is not a legacy approval)', async () => {
        await assertFails(asUser('sneaky', 'sneaky@example.org').doc('sneaky').set({
            uid: 'sneaky', email: 'sneaky@example.org', displayName: 'Sneaky',
            isAdmin: false, isCoach: false, coaches: []
        }));
        await assertFails(asUser('sneaky', 'sneaky@example.org').doc('sneaky').set({ coaches: [] }, { merge: true }));
        await assertFails(asUser('sneaky', 'sneaky@example.org').doc('sneaky').set({
            uid: 'sneaky', email: 'sneaky@example.org', isApproved: 'yes'
        }));
    });

    it('ALLOWS the ordinary uninvited signup (pending approval)', async () => {
        // Registration remains available while the new account is pending approval.
        await assertSucceeds(asUser('newbie', 'newbie@example.org').doc('newbie').set({
            uid: 'newbie', email: 'newbie@example.org', displayName: 'Newbie',
            isApproved: false, isAdmin: false, isCoach: false, coaches: []
        }));
    });
});

describe('verified email required for automatic invite approval', () => {
    const seedInvite = async (email) => {
        await testEnv.withSecurityRulesDisabled(async context => {
            await context.firestore().collection('preapproved_emails').doc(email)
                .set({ addedAt: '2026-10-11' });
        });
    };
    const users = (uid, email, email_verified) =>
        testEnv.authenticatedContext(uid, { email, email_verified }).firestore().collection('users');
    const signup = (uid, email, isApproved) => ({
        uid, email, displayName: 'Synthetic golfer', isApproved,
        isAdmin: false, isCoach: false, coaches: []
    });

    it('DENIES an unverified invited identity creating itself approved', async () => {
        await seedInvite('invitee@example.org');
        await assertFails(users('invitee', 'invitee@example.org', false).doc('invitee')
            .set(signup('invitee', 'invitee@example.org', true)));
    });

    it('ALLOWS a verified invited identity to create itself approved', async () => {
        await seedInvite('invitee@example.org');
        await assertSucceeds(users('invitee', 'invitee@example.org', true).doc('invitee')
            .set(signup('invitee', 'invitee@example.org', true)));
    });

    it('DENIES a verified but uninvited identity creating itself approved', async () => {
        await assertFails(users('outsider', 'outsider@example.org', true).doc('outsider')
            .set(signup('outsider', 'outsider@example.org', true)));
    });

    it('ALLOWS an unverified invited identity to create a pending account', async () => {
        await seedInvite('invitee@example.org');
        await assertSucceeds(users('invitee', 'invitee@example.org', false).doc('invitee')
            .set(signup('invitee', 'invitee@example.org', false)));
    });

    it('allows only a verified invited owner to promote their pending account', async () => {
        await seedInvite('invitee@example.org');
        await testEnv.withSecurityRulesDisabled(async context => {
            await context.firestore().collection('users').doc('invitee')
                .set(signup('invitee', 'invitee@example.org', false));
        });
        await assertFails(users('invitee', 'invitee@example.org', false).doc('invitee')
            .update({ isApproved: true }));
        await assertSucceeds(users('invitee', 'invitee@example.org', true).doc('invitee')
            .update({ isApproved: true }));
    });

    it('DENIES an invited owner combining approval with another profile change', async () => {
        await seedInvite('invitee@example.org');
        await testEnv.withSecurityRulesDisabled(async context => {
            await context.firestore().collection('users').doc('invitee')
                .set(signup('invitee', 'invitee@example.org', false));
        });
        await assertFails(users('invitee', 'invitee@example.org', true).doc('invitee')
            .update({ isApproved: true, displayName: 'Changed with approval' }));
    });

    it('keeps manual admin approval available for an unverified pending account', async () => {
        await testEnv.withSecurityRulesDisabled(async context => {
            const db = context.firestore();
            await db.collection('users').doc('admin').set({ isAdmin: true, isApproved: true });
            await db.collection('users').doc('pending').set({
                uid: 'pending', email: 'pending@example.org', isApproved: false,
                isAdmin: false, isCoach: false
            });
        });
        const adminUsers = users('admin', 'admin@example.org', false);
        await assertSucceeds(adminUsers.doc('pending').update({ isApproved: true }));
    });
});

describe('Competition participant entries', () => {
    const seed = async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await db.collection('users').doc('owner').set({ isApproved: true });
            await db.collection('users').doc('mate').set({ isApproved: true });
            await db.collection('users').doc('stranger').set({ isApproved: true });
            await db.collection('users').doc('admin').set({ isApproved: true, isAdmin: true });
            await db.collection('competitions').doc('privateComp').set({
                name: 'Club Champs', ownerId: 'owner', visibility: 'private',
                invitedUIDs: ['owner', 'mate']
            });
            await db.collection('competitions').doc('publicComp').set({
                name: 'Open Day', ownerId: 'owner', visibility: 'public', invitedUIDs: []
            });
        });
    };
    const row = (compId, uid) => ({ compId, uid, playerName: 'X', totalPoints: 40, score: 72 });
    const rounds = (caller) => testEnv.authenticatedContext(caller).firestore().collection('comp_rounds');

    it('DENIES a stranger injecting a row into a PRIVATE comp they cannot read', async () => {
        await seed();
        // The writer must also be allowed to access the parent competition.
        await assertFails(rounds('stranger').add(row('privateComp', 'stranger')));
    });

    it('DENIES a row whose compId names no competition at all', async () => {
        await seed();
        await assertFails(rounds('stranger').add(row('no-such-comp', 'stranger')));
    });

    it('still ALLOWS joining a PUBLIC comp with your own row (product meaning of public)', async () => {
        await seed();
        await assertSucceeds(rounds('stranger').add(row('publicComp', 'stranger')));
    });

    it('ALLOWS an invited non-owner to log a playing partner\'s row in their private comp', async () => {
        await seed();
        // A participant may record a partner's score in the same competition.
        await assertSucceeds(rounds('mate').add(row('privateComp', 'owner')));
    });

    it('DENIES a third-party row when the TARGET is not in the comp', async () => {
        await seed();
        await assertFails(rounds('mate').add(row('privateComp', 'stranger')));
    });

    it('the comp owner and an admin keep their existing third-party write', async () => {
        await seed();
        await assertSucceeds(rounds('owner').add(row('privateComp', 'mate')));
        await assertSucceeds(rounds('admin').add(row('privateComp', 'stranger')));
    });
});

describe('Video quota administration', () => {
    const seed = async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await db.collection('users').doc('admin').set({ isAdmin: true, isApproved: true });
            await db.collection('users').doc('greedy').set({
                email: 'greedy@example.org', isApproved: true, isAdmin: false,
                videoQuotaBytes: 500 * 1024 * 1024, videoBytesUsed: 0
            });
        });
    };
    const users = (caller, email) =>
        testEnv.authenticatedContext(caller, email ? { email } : undefined).firestore().collection('users');

    it('DENIES a user raising their own video allowance', async () => {
        await seed();
        await assertFails(users('greedy').doc('greedy').update({ videoQuotaBytes: 999999999999 }));
        // …including smuggled in beside a legitimate field:
        await assertFails(users('greedy').doc('greedy').update({
            displayName: 'Greedy', videoQuotaBytes: 999999999999
        }));
    });

    it('DENIES planting a ceiling via delete-then-recreate', async () => {
        await seed();
        const greedy = users('greedy', 'greedy@example.org');
        await assertSucceeds(greedy.doc('greedy').delete());
        await assertFails(greedy.doc('greedy').set({
            uid: 'greedy', email: 'greedy@example.org', displayName: 'Greedy',
            isApproved: false, isAdmin: false, isCoach: false,
            videoQuotaBytes: 999999999999
        }));
    });

    it('ALLOWS the admin to set it, and the user to keep counting their own usage', async () => {
        await seed();
        await assertSucceeds(users('admin').doc('greedy').update({ videoQuotaBytes: 1024 * 1024 * 1024 })); // admin.js:191
        await assertSucceeds(users('greedy').doc('greedy').update({ videoBytesUsed: 12345 }));              // videos.js:44
    });
});

describe('Follower consent ledger', () => {
    const seed = async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await db.collection('users').doc('author').set({ isApproved: true });
            await db.collection('users').doc('fan').set({ isApproved: true });
            await db.collection('users').doc('stranger').set({ isApproved: true });
        });
    };
    const followers = (caller, author) =>
        testEnv.authenticatedContext(caller).firestore()
            .collection('users').doc(author).collection('followers');
    const requests = (caller, author) =>
        testEnv.authenticatedContext(caller).firestore()
            .collection('users').doc(author).collection('followRequests');

    it('a fan may lodge a follow REQUEST on the author\'s doc', async () => {
        await seed();
        await assertSucceeds(requests('fan', 'author').doc('fan').set({
            requestedAt: '2026-09-10T00:00:00.000Z', requesterUid: 'fan'
        }));
        // …but only for themselves.
        await assertFails(requests('stranger', 'author').doc('fan').set({
            requestedAt: '2026-09-10T00:00:00.000Z', requesterUid: 'fan'
        }));
    });

    it('the author may READ and ACCEPT a request, which is what unblocks the whole feature', async () => {
        await seed();
        await assertSucceeds(requests('fan', 'author').doc('fan').set({
            requestedAt: '2026-09-10T00:00:00.000Z', requesterUid: 'fan'
        }));
        await assertSucceeds(requests('author', 'author').get());
        // The followed player can accept a request by creating a consent record.
        await assertSucceeds(followers('author', 'author').doc('fan').set({
            acceptedAt: '2026-09-10T00:00:00.000Z'
        }));
        await assertSucceeds(requests('author', 'author').doc('fan').delete());
    });

    it('a stranger may NOT self-accept into someone else\'s ledger', async () => {
        await seed();
        await assertFails(followers('stranger', 'author').doc('stranger').set({
            acceptedAt: '2026-09-10T00:00:00.000Z'
        }));
    });

    it('both sides may revoke: the author removes a follower, the follower withdraws', async () => {
        await seed();
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await db.collection('users').doc('author').collection('followers').doc('fan').set({ acceptedAt: 'x' });
            await db.collection('users').doc('author').collection('followers').doc('stranger').set({ acceptedAt: 'x' });
        });
        // Either side of the relationship may revoke it.
        await assertSucceeds(followers('fan', 'author').doc('fan').delete());
        await assertSucceeds(followers('author', 'author').doc('stranger').delete());
    });

    it('once accepted, the following edge the fan-out reads can finally be created', async () => {
        await seed();
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('users').doc('author')
                .collection('followers').doc('fan').set({ acceptedAt: 'x' });
        });
        await assertSucceeds(testEnv.authenticatedContext('fan').firestore()
            .collection('users').doc('fan').collection('following').doc('author')
            .set({ followedUid: 'author', followedAt: '2026-09-10T00:00:00.000Z' }));
    });
});

describe('Coach relationship removal', () => {
    const seed = async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await db.collection('users').doc('coach').set({ isApproved: true, isCoach: true });
            await db.collection('users').doc('coach2').set({ isApproved: true, isCoach: true });
            await db.collection('users').doc('stranger').set({ isApproved: true });
            await db.collection('users').doc('student').set({
                email: 'student@example.org', displayName: 'Student',
                isApproved: true, isAdmin: false, isCoach: false,
                coaches: ['coach', 'coach2']
            });
        });
    };
    const users = (caller) => testEnv.authenticatedContext(caller).firestore().collection('users');

    it('ALLOWS the coach\'s arrayRemove(self) — the coach.js:244 Release button', async () => {
        await seed();
        await assertSucceeds(users('coach').doc('student').update({ coaches: ['coach2'] }));
    });

    it('DENIES a coach removing a DIFFERENT coach, or adding themselves elsewhere', async () => {
        await seed();
        await assertFails(users('coach').doc('student').update({ coaches: ['coach'] }));   // dropped coach2
        await assertFails(users('coach').doc('student').update({ coaches: [] }));          // dropped both
        await assertFails(users('stranger').doc('student').update({ coaches: ['coach'] })); // not a coach at all
    });

    it('DENIES a coach touching anything else on the student doc while releasing', async () => {
        await seed();
        await assertFails(users('coach').doc('student').update({
            coaches: ['coach2'], displayName: 'Renamed'
        }));
        await assertFails(users('coach').doc('student').update({
            coaches: ['coach2'], isApproved: false
        }));
    });

    it('the student may still manage their own coaches list (practice.js:576)', async () => {
        await seed();
        await assertSucceeds(users('student').doc('student').update({ coaches: ['coach'] }));
    });
});
