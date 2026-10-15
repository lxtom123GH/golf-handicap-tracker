// Deterministic fictional rounds for UX coverage, not handicap conformance data.
export const UX_PERSONAS = [
    { key: 'player-a', name: 'Test Player A', rounds: 26 },
    { key: 'player-b', name: 'Test Player B', rounds: 0 },
    { key: 'pending-c', name: 'Test Pending C', approved: false },
    { key: 'coach-d', name: 'Test Coach D', coach: true },
    { key: 'admin-e', name: 'Test Admin E', admin: true },
];

export function syntheticRounds(uid) {
    if (typeof uid !== 'string' || !uid) throw new Error('A synthetic fixture uid is required');
    return Array.from({ length: 26 }, (_, i) => {
        const nine = i % 3 === 0;
        const date = new Date(Date.UTC(2026, 3, 1) + i * 6 * 86_400_000);
        return { uid, course: nine ? 'Synthetic Nine CC' : 'Synthetic Links GC',
            rating: nine ? 35.2 : 70.4, slope: nine ? 124 : 128,
            adjustedGross: nine ? 42 + (i * 5) % 7 : 82 + (i * 5) % 14,
            holesPlayed: nine ? 9 : 18, date, createdAt: date,
            notCounting: false, visibility: 'private' };
    });
}
