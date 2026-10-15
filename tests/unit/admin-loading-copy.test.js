import { it, expect, vi } from 'vitest';
const getDocs=vi.hoisted(() => vi.fn());
vi.mock('../../src/firebase-config.js', () => ({db:{}}));
vi.mock('firebase/firestore', () => ({getDocs,collection:vi.fn(),doc:vi.fn(),setDoc:vi.fn(),updateDoc:vi.fn(),deleteDoc:vi.fn(),addDoc:vi.fn(),serverTimestamp:vi.fn()}));
import '../../src/admin.js';
it('replaces failed admin lists with recovery copy, without exposing diagnostics', async () => {
    window.currentUserIsAdmin=true;
    document.body.innerHTML='<table><tbody id="admin-users-list"></tbody></table><table><tbody id="admin-emails-list"></tbody></table>';
    getDocs.mockRejectedValue(new Error('SENSITIVE_DIAGNOSTIC'));
    await window.refreshAdminDashboard();
    await vi.waitFor(() => expect(document.getElementById('admin-emails-list').textContent).toContain('Could not load'));
    expect(document.body.textContent).not.toMatch(/Loading|SENSITIVE_DIAGNOSTIC/);
    expect(document.body.textContent).toMatch(/reopen Admin/);
    window.currentUserIsAdmin=false;
});
