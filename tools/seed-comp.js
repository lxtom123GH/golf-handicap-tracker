// tools/seed-comps.js
const admin = require('firebase-admin');

// Bind directly to the local emulator environment
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
admin.initializeApp({ projectId: 'golf-handicap-tracker-b677c' });
const db = admin.firestore();

async function seed() {
  // ⚠️ IMPORTANT: Replace this with the UID you are logged in with on the emulator
  const myUid = 'YOUR_EMULATOR_UID_HERE'; 

  const compRef = db.collection('competitions').doc('mock-comp-01');
  await compRef.set({
    name: 'Keperra 27-Hole Beta Test',
    visibility: 'public',
    ownerId: myUid,
    invitedUIDs: [],
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  const roundRef = db.collection('comp_rounds').doc('mock-round-01');
  await roundRef.set({
    compId: 'mock-comp-01',
    uid: myUid,
    playerName: 'Local Tester',
    score: 72,
    points: 36,
    date: new Date().toISOString().split('T')[0],
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log('⛳ Mock Competition Data Seeded to Emulator!');
}

seed().catch(console.error);