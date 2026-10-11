// ==========================================
// admin.js
// Admin Dashboard & User Management Logic
// ==========================================

import { db } from './firebase-config.js';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { escapeHtml } from './escape.js';

window.refreshAdminDashboard = async () => {
    if (!window.currentUserIsAdmin) return;

    const usersList = document.getElementById('admin-users-list');
    if (usersList) usersList.innerHTML = '<tr><td colspan="6">Loading users from Firestore...</td></tr>';

    try {
        const snap = await getDocs(collection(db, "users"));
        if (usersList) usersList.innerHTML = '';
        snap.forEach(d => {
            const data = d.data();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${escapeHtml(data.displayName || 'N/A')}</td>
                <td>${escapeHtml(data.email)}</td>
                <td>${data.isAdmin ? 'Admin' : (data.isCoach ? 'Coach' : 'Player')}</td>
                <td>
                    <label class="toggle-switch">
                        <input type="checkbox" ${data.isApproved ? 'checked' : ''} onchange="toggleUserApproval('${escapeHtml(d.id)}', this.checked)">
                        <span class="toggle-slider"></span>
                    </label>
                </td>
                <td>
                    <label class="toggle-switch">
                        <input type="checkbox" ${data.isCoach ? 'checked' : ''} onchange="toggleCoachRole('${escapeHtml(d.id)}', this.checked)">
                        <span class="toggle-slider"></span>
                    </label>
                </td>
                <td>
                    <input type="number" min="0" step="100" aria-label="Video quota in MB"
                        value="${Number(data.videoQuotaBytes) > 0 ? Math.round(data.videoQuotaBytes / (1024 * 1024)) : 500}"
                        style="width:80px;"
                        onchange="setVideoQuota('${escapeHtml(d.id)}', this.value)">
                    <div style="font-size:0.7rem; color:#94a3b8;">${Math.round((Number(data.videoBytesUsed) || 0) / (1024 * 1024))} MB used</div>
                </td>
            `;
            if (usersList) usersList.appendChild(tr);
        });
    } catch (e) {
        console.error("Admin dashboard fetch error:", e);
        if (usersList) usersList.innerHTML = '<tr><td colspan="6" style="color:#ef4444;">Error: Failed to fetch users.</td></tr>';
    }

    loadPreapprovedEmails();
};

export function bindAdminTools() {
    // Admin markup is static in index.html. Keep this binder focused on the
    // handlers so a stale template cannot overwrite the maintained DOM.
    const tabBtnAdmin = document.getElementById('tab-btn-admin');
    if (tabBtnAdmin) {
        tabBtnAdmin.addEventListener('click', window.refreshAdminDashboard);
    }

    const preapproveForm = document.getElementById('admin-preapprove-form');
    if (preapproveForm) {
        preapproveForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!window.currentUserIsAdmin) return;
            const emInput = document.getElementById('admin-new-email');
            const em = emInput ? emInput.value.toLowerCase().trim() : '';
            if (!em) return;
            await setDoc(doc(db, "preapproved_emails", em), { addedAt: new Date().toISOString() });
            if (emInput) emInput.value = '';
            loadPreapprovedEmails();
        });
    }
}

async function loadPreapprovedEmails() {
    const emailsList = document.getElementById('admin-emails-list');
    if (!emailsList) return;
    emailsList.innerHTML = 'Loading...';
    try {
        const snap = await getDocs(collection(db, "preapproved_emails"));
        if (emailsList) emailsList.innerHTML = '';
        snap.forEach(d => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding: 10px;">${escapeHtml(d.id)}</td>
                <td style="padding: 10px; text-align: right;">
                    <button class="btn btn-danger btn-sm" onclick="removePreapprovedEmail('${escapeHtml(d.id)}')">Remove</button>
                </td>
            `;
            emailsList.appendChild(tr);
        });
    } catch (e) { }
}

window.toggleUserApproval = async function (uid, isApproved) {
    if (!window.currentUserIsAdmin) return;
    try {
        await updateDoc(doc(db, "users", uid), { isApproved });
    } catch (e) {
        alert("Failed to update approval status.");
        console.error(e);
    }
};

window.toggleCoachRole = async function (uid, isCoach) {
    if (!window.currentUserIsAdmin) return;
    try {
        await updateDoc(doc(db, "users", uid), { isCoach });
    } catch (e) {
        alert("Failed to update coach role.");
        console.error(e);
    }
};

window.setVideoQuota = async function (uid, mb) {
    if (!window.currentUserIsAdmin) return;
    const bytes = Math.max(0, Math.round(parseFloat(mb) || 0)) * 1024 * 1024;
    try {
        await updateDoc(doc(db, "users", uid), { videoQuotaBytes: bytes });
    } catch (e) {
        alert("Failed to update video quota.");
        console.error(e);
    }
};

window.removePreapprovedEmail = async function (email) {
    if (!window.currentUserIsAdmin) return;
    try {
        await deleteDoc(doc(db, "preapproved_emails", email));
        loadPreapprovedEmails();
    } catch (e) { }
};

export function bindAdminInvite() {
    if (!window.currentUserIsAdmin) return;

    const btnTemplate = document.getElementById('btn-download-csv-template');
    if (btnTemplate) {
        const csvContent = 'date,course,holes,adjustedGross,courseRating,slopeRating,isCounting\n2024-01-15,Royal Melbourne,18,82,72.3,135,true\n2024-01-22,Kingston Heath,18,79,73.1,138,true';
        const blob = new Blob([csvContent], { type: 'text/csv' });
        btnTemplate.href = URL.createObjectURL(blob);
    }

    const importSelect = document.getElementById('import-player-select');
    if (importSelect) {
        getDocs(collection(db, 'users')).then(snap => {
            importSelect.innerHTML = '';
            snap.forEach(d => {
                const data = d.data();
                if (data.isApproved) {
                    const opt = document.createElement('option');
                    opt.value = d.id;
                    opt.textContent = data.displayName || data.email;
                    importSelect.appendChild(opt);
                }
            });
        }).catch(e => console.error("Error populating import select:", e));
    }

    const btnImport = document.getElementById('btn-import-csv');
    const importMsgEl = document.getElementById('import-msg');
    if (btnImport) {
        btnImport.addEventListener('click', async () => {
            const fileInput = document.getElementById('csv-file-input');
            const targetUid = importSelect ? importSelect.value : null;
            if (!fileInput.files.length || !targetUid) {
                importMsgEl.textContent = '❌ Please select a user and a CSV file.';
                importMsgEl.style.color = '#ef4444';
                return;
            }

            const file = fileInput.files[0];
            const lines = (await file.text()).trim().split('\n');
            const headers = lines[0].split(',').map(h => h.trim());
            let imported = 0, errors = 0;
            importMsgEl.textContent = 'Importing...';
            importMsgEl.style.color = '#64748b';

            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim());
                if (values.length < headers.length) continue;
                const row = {};
                headers.forEach((h, idx) => { row[h] = values[idx]; });
                let gross = parseFloat(row.adjustedGross);
                const cr = parseFloat(row.courseRating);
                const sr = parseFloat(row.slopeRating);
                const holes = parseInt(row.holes) || 18;

                if (isNaN(gross) && row.stablefordPoints && row.dailyHandicap) {
                    const stbf = parseInt(row.stablefordPoints);
                    const dh = parseInt(row.dailyHandicap);
                    const par = parseInt(row.par) || 72;
                    if (!isNaN(stbf) && !isNaN(dh)) gross = par + dh + 36 - stbf;
                }
                if (!row.date || !row.course || isNaN(gross) || isNaN(cr) || isNaN(sr)) {
                    errors++;
                    continue;
                }

                try {
                    await addDoc(collection(db, 'whs_rounds'), {
                        uid: targetUid, course: row.course, rating: cr, slope: sr,
                        adjustedGross: gross, holes, notCounting: row.isCounting === 'false',
                        date: new Date(row.date), importedAt: serverTimestamp()
                    });
                    imported++;
                } catch (_) { errors++; }
            }

            importMsgEl.textContent = `✅ Import complete: ${imported} rounds added${errors > 0 ? `, ${errors} rows skipped (invalid data)` : ''}.`;
            importMsgEl.style.color = errors > 0 ? '#f59e0b' : '#10b981';
        });
    }
}
