import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ users: [], updateDoc: vi.fn() }));
vi.mock('../../src/firebase-config.js', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
    collection: (_db, name) => name,
    doc: (_db, collection, id) => ({ collection, id }),
    getDocs: async collection => ({ forEach: fn => {
        if (collection === 'users') mocks.users.forEach(u => fn({ id: u.id, data: () => u.data }));
    } }),
    updateDoc: (...args) => mocks.updateDoc(...args),
    setDoc: vi.fn(), deleteDoc: vi.fn(), addDoc: vi.fn(), serverTimestamp: vi.fn(),
}));
await import('../../src/admin.js');

beforeEach(() => {
    document.body.innerHTML = '<table><tbody id="admin-users-list"></tbody></table>';
    window.currentUserIsAdmin = true;
    mocks.updateDoc.mockReset();
    mocks.users = [{ id: 'test-pending', data: {
        displayName: 'Test Pending C', email: 'test-pending@example.invalid',
        isApproved: false, isCoach: true, videoQuotaBytes: 700 * 1024 * 1024,
    } }];
});

describe('admin user control labels and existing handlers', () => {
    it('names every input for its user and keeps visible approval/coach labels', async () => {
        await window.refreshAdminDashboard();
        const inputs = [...document.querySelectorAll('#admin-users-list input')];
        expect(inputs).toHaveLength(3);
        expect(inputs.map(el => el.getAttribute('aria-label'))).toEqual([
            'Approve Test Pending C (test-pending@example.invalid)',
            'Coach Test Pending C (test-pending@example.invalid)',
            'Video quota in MB for Test Pending C (test-pending@example.invalid)',
        ]);
        expect(inputs[0].closest('label').textContent).toContain('Approved');
        expect(inputs[1].closest('label').textContent).toContain('Coach');
        expect(inputs[0].checked).toBe(false);
        expect(inputs[1].checked).toBe(true);
        expect(inputs[2].value).toBe('700');
        expect(inputs.map(el => el.getAttribute('onchange'))).toEqual([
            "toggleUserApproval('test-pending', this.checked)",
            "toggleCoachRole('test-pending', this.checked)",
            "setVideoQuota('test-pending', this.value)",
        ]);
    });

    it('escapes names in text and attribute contexts', async () => {
        const name = '<img src=x onerror="bad()"> & "Tester"';
        mocks.users[0].data.displayName = name;
        await window.refreshAdminDashboard();
        expect(document.querySelector('img')).toBeNull();
        expect(document.querySelector('.admin-user-name').textContent).toBe(name);
        expect(document.querySelector('input').getAttribute('aria-label'))
            .toBe(`Approve ${name} (test-pending@example.invalid)`);
    });

    it('preserves the admin-only write guard and exact approval update', async () => {
        window.currentUserIsAdmin = false;
        await window.toggleUserApproval('test-pending', true);
        expect(mocks.updateDoc).not.toHaveBeenCalled();
        window.currentUserIsAdmin = true;
        await window.toggleUserApproval('test-pending', true);
        expect(mocks.updateDoc).toHaveBeenCalledWith(
            { collection: 'users', id: 'test-pending' }, { isApproved: true });
    });
});
