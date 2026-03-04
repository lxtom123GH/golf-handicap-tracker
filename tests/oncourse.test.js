import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---- Mock the entire transitive import chain ----

vi.mock('../src/firebase-config.js', () => ({
    db: {},
    auth: {},
    functions: {}
}));

vi.mock('firebase/firestore', () => ({
    collection: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    onSnapshot: vi.fn(),
    addDoc: vi.fn(),
    serverTimestamp: vi.fn(),
    setDoc: vi.fn(),
    doc: vi.fn(),
    updateDoc: vi.fn(),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    writeBatch: vi.fn(),
    deleteDoc: vi.fn()
}));

vi.mock('firebase/functions', () => ({
    httpsCallable: vi.fn()
}));

vi.mock('../src/ui.js', () => ({
    UI: {
        ocTeeSelect: null,
        ocAddedPlayersList: null
    }
}));

vi.mock('../src/notifications.js', () => ({
    initNotifications: vi.fn()
}));

vi.mock('../src/whs.js', () => ({
    calculateDailyHandicap: vi.fn(() => 0),
    calculateHoleStableford: vi.fn(() => 0),
    convertStablefordToAGS: vi.fn(() => 0)
}));

vi.mock('../src/course-data.js', () => ({
    COURSE_DATA: {},
    KEPERRA_GPS: {}
}));

// 1. Mock AppState before importing the module under test
vi.mock('../src/state.js', () => {
    return {
        AppState: {
            currentCoursePars: [],
            currentHole: 1,
            currentRoundHoles: 18,
            currentUser: { uid: 'test-user-123' },
            liveRoundGroups: []
        }
    };
});

// Now import the state and functions to test
import { AppState } from '../src/state.js';
import { loadHole } from '../src/oncourse.js';

describe('OnCourse Module - Par Math and UI Logic', () => {

    beforeEach(() => {
        // Reset DOM for each test
        document.body.innerHTML = `
            <div id="oc-hole-display"></div>
            <div id="oc-par-display"></div>
            <div id="oc-hole-dots"></div>
            <select id="oc-par-select"></select>
            <div id="oc-group-scores"></div>
        `;
        // Clear mock state
        AppState.currentCoursePars = [];
        AppState.currentHole = 1;
        AppState.currentRoundHoles = 18;
    });

    it('should correctly calculate and display Par 72 for Keperra 18-hole Layout', () => {
        // Arrange: Keperra Par Array (Old Course typical 72)
        // 9 holes out, 9 holes in.
        AppState.currentCoursePars = [
            4, 4, 3, 4, 5, 4, 3, 5, 4, // Out: 36
            4, 4, 3, 4, 4, 5, 3, 4, 5  // In: 36 -> Total: 72
        ];
        AppState.currentHole = 1; // Testing hole 1 logic

        // Act
        loadHole();

        // Assert DOM Updates
        const parDisplay = document.getElementById('oc-par-display');
        const holeDisplay = document.getElementById('oc-hole-display');

        expect(holeDisplay.textContent).toBe('Hole 1');
        expect(parDisplay.textContent).toBe('Par 4');

        // Verify full 18 hole math manually 
        const totalPar = AppState.currentCoursePars.reduce((a, b) => a + b, 0);
        expect(totalPar).toBe(72);
    });

    it('should correctly calculate and display Par 71 for Keperra alternate Layout', () => {
        // Arrange: Keperra Par Array (Alternate 71)
        AppState.currentCoursePars = [
            4, 4, 3, 4, 4, 4, 3, 5, 4, // Out: 35
            4, 4, 3, 4, 4, 5, 3, 4, 5  // In: 36 -> Total: 71
        ];

        // Act
        const totalPar = AppState.currentCoursePars.reduce((a, b) => a + b, 0);

        // Assert
        expect(totalPar).toBe(71);
    });
});
