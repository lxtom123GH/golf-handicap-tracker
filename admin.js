// ==========================================
// admin.js
// Admin Dashboard & User Management Logic
// ==========================================

import { db, auth } from './firebase-config.js';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, addDoc, serverTimestamp, query, where } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { UI } from './ui.js';

export function bindAdminTools() {
    const tabAdmin = document.getElementById('tab-admin');
    if (tabAdmin) {
        tabAdmin.innerHTML = `
            <header class="header" style="background: linear-gradient(135deg, #d35400 0%, #e67e22 100%);">
                <div class="header-content">
                    <div class="branding">
                        <h1>Admin Dashboard</h1>
                        <p>Manage Users & Pre-Approved Emails</p>
                    </div>
                </div>
            </header>
            <div class="dashboard-grid">
                <section class="card two-span">
                    <h2>Registered Users</h2>
                    <p class="section-desc">Toggle approval status to grant or revoke app access.</p>
                    <div style="overflow-x: auto;">
                        <table class="leaderboard-table" style="width: 100%;">
                            <thead>
                                <tr>
                                    <th>Display Name</th>
                                    <th>Email</th>
                                    <th>Role</th>
                                    <th>Approved?</th>
                                    <th>Coach?</th>
                                </tr>
                            </thead>
                            <tbody id="admin-users-list"></tbody>
                        </table>
                    </div>
                </section>
                <section class="card two-span">
                    <h2>Pre-Approved Emails</h2>
                    <p class="section-desc">Add emails here to automatically grant users access on registration.</p>
                    <form id="admin-preapprove-form" class="round-form" style="display: flex; gap: 10px; align-items: flex-end; margin-bottom: 20px;">
                        <div class="form-group" style="flex: 1; margin: 0;">
                            <label for="admin-new-email">Email Address</label>
                            <input type="email" id="admin-new-email" required>
                        </div>
                        <button type="submit" class="btn btn-primary" style="height: 42px;">Add Email</button>
                    </form>
                    <div style="overflow-x: auto;">
                        <table class="leaderboard-table" style="width: 100%;">
                            <thead>
                                <tr><th>Email Address</th><th>Configuration</th></tr>
                            </thead>
                            <tbody id="admin-emails-list"></tbody>
                        </table>
                    </div>
                </section>
                <section class="card">
                    <h2>📂 Import (CSV)</h2>
                    <a id="btn-download-csv-template" href="#" class="btn btn-secondary btn-sm" style="width:auto;margin-bottom:15px;" download="round-template.csv">⬇️ Template</a>
                    <div class="form-row">
                        <div class="form-group flex-2">
                             <label>User</label><select id="import-player-select"></select>
                        </div>
                        <div class="form-group flex-2">
                             <label>CSV</label><input type="file" id="csv-file-input" accept=".csv">
                        </div>
                    </div>
                    <button id="btn-import-csv" class="btn btn-primary" style="width:auto;">Import</button>
                    <div id="import-msg" style="margin-top:10px;font-size:0.8rem;"></div>
                </section>
                <section class="card" style="border: 2px solid #10b981;">
                    <h2>📈 Bulk Excel Import</h2>
                    <input type="file" id="excel-file-input" accept=".xlsx,.xls">
                    <button id="btn-import-excel" class="btn btn-primary" style="margin-top:10px;background:#10b981;border-color:#10b981;">🚀 Start Auto Import</button>
                    <div id="excel-import-msg" style="margin-top:10px;font-size:0.8rem;white-space:pre-wrap;"></div>
                </section>
            </div>
        `;
    }

    const tabBtnAdmin = document.getElementById('tab-btn-admin');
    if (!tabBtnAdmin) return;

    tabBtnAdmin.addEventListener('click', async () => {
        if (!window.currentUserIsAdmin) return;

        UI.adminUsersList.innerHTML = 'Loading...';
        try {
            const snap = await getDocs(collection(db, "users"));
            UI.adminUsersList.innerHTML = '';
            snap.forEach(d => {
                const data = d.data();
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${data.displayName || 'N/A'}</td>
                    <td>${data.email}</td>
                    <td>${data.isAdmin ? 'Admin' : (data.isCoach ? 'Coach' : 'Player')}</td>
                    <td>
                        <label class="toggle-switch">
                            <input type="checkbox" ${data.isApproved ? 'checked' : ''} onchange="toggleUserApproval('${d.id}', this.checked)">
                            <span class="toggle-slider"></span>
                        </label>
                    </td>
                    <td>
                        <label class="toggle-switch">
                            <input type="checkbox" ${data.isCoach ? 'checked' : ''} onchange="toggleCoachRole('${d.id}', this.checked)">
                            <span class="toggle-slider"></span>
                        </label>
                    </td>
                `;
                UI.adminUsersList.appendChild(tr);
            });
        } catch (e) { console.error("Admin error:", e); }

        loadPreapprovedEmails();
    });

    if (UI.adminPreapproveForm) {
        UI.adminPreapproveForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!window.currentUserIsAdmin) return;
            const em = UI.adminNewEmail.value.toLowerCase().trim();
            if (!em) return;
            await setDoc(doc(db, "preapproved_emails", em), { addedAt: new Date().toISOString() });
            UI.adminNewEmail.value = '';
            loadPreapprovedEmails();
        });
    }
}

async function loadPreapprovedEmails() {
    if (!UI.adminEmailsList) return;
    UI.adminEmailsList.innerHTML = 'Loading...';
    try {
        const snap = await getDocs(collection(db, "preapproved_emails"));
        UI.adminEmailsList.innerHTML = '';
        snap.forEach(d => {
            const li = document.createElement('li');
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.style.padding = '8px';
            li.style.borderBottom = '1px solid #e2e8f0';
            li.innerHTML = `
                <span>${d.id}</span>
                <button class="btn btn-danger btn-sm" onclick="removePreapprovedEmail('${d.id}')">Remove</button>
            `;
            UI.adminEmailsList.appendChild(li);
        });
    } catch (e) { }
}

window.toggleUserApproval = async function (uid, isApproved) {
    if (!window.currentUserIsAdmin) return;
    try {
        await updateDoc(doc(db, "users", uid), { isApproved: isApproved });
    } catch (e) {
        alert("Failed to update approval status.");
        console.error(e);
    }
};

window.toggleCoachRole = async function (uid, isCoach) {
    if (!window.currentUserIsAdmin) return;
    try {
        await updateDoc(doc(db, "users", uid), { isCoach: isCoach });
    } catch (e) {
        alert("Failed to update coach role.");
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

    // --- CSV Template Download ---
    const btnTemplate = document.getElementById('btn-download-csv-template');
    if (btnTemplate) {
        const csvContent = 'date,course,holes,adjustedGross,courseRating,slopeRating,isCounting\n2024-01-15,Royal Melbourne,18,82,72.3,135,true\n2024-01-22,Kingston Heath,18,79,73.1,138,true';
        const blob = new Blob([csvContent], { type: 'text/csv' });
        btnTemplate.href = URL.createObjectURL(blob);
    }

    // --- Populate Import Player Dropdown ---
    const importSelect = document.getElementById('import-player-select');
    if (importSelect) {
        getDocs(collection(db, 'users')).then(snap => {
            importSelect.innerHTML = ''; // Clear first
            snap.forEach(d => {
                const data = d.data();
                if (data.isApproved) {
                    const opt = document.createElement('option');
                    opt.value = d.id;
                    opt.textContent = data.displayName || data.email;
                    importSelect.appendChild(opt);
                }
            });
        });
    }

    // --- Invite Form ---
    const inviteForm = document.getElementById('admin-invite-form');
    const inviteMsg = document.getElementById('invite-msg');
    if (inviteForm && inviteMsg) {
        inviteForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!window.currentUserIsAdmin) return;
            const email = document.getElementById('invite-email').value.trim().toLowerCase();
            const name = document.getElementById('invite-name').value.trim();
            const role = document.getElementById('invite-role').value;

            const btn = inviteForm.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.textContent = 'Sending...';

            try {
                await setDoc(doc(db, 'preapproved_emails', email), {
                    addedAt: new Date().toISOString(),
                    displayName: name,
                    role: role
                });
                await sendPasswordResetEmail(auth, email);
                inviteMsg.textContent = `✅ Invitation sent to ${email}. They'll receive a link to set their password.`;
                inviteMsg.style.color = '#10b981';
                inviteForm.reset();
            } catch (err) {
                if (err.code === 'auth/user-not-found') {
                    inviteMsg.textContent = `✅ ${email} pre-approved. They can now register and will be auto-approved on first login.`;
                    inviteMsg.style.color = '#10b981';
                    inviteForm.reset();
                } else {
                    inviteMsg.textContent = `❌ Error: ${err.message}`;
                    inviteMsg.style.color = '#ef4444';
                }
            }
            inviteMsg.classList.remove('hidden');
            btn.disabled = false;
            btn.textContent = 'Send Invitation';
        });
    }

    // --- CSV Import ---
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
            const text = await file.text();
            const lines = text.trim().split('\n');
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
                    if (!isNaN(stbf) && !isNaN(dh)) {
                        gross = par + dh + 36 - stbf;
                    }
                }

                if (!row.date || !row.course || isNaN(gross) || isNaN(cr) || isNaN(sr)) {
                    errors++;
                    continue;
                }

                try {
                    await addDoc(collection(db, 'whs_rounds'), {
                        uid: targetUid,
                        course: row.course,
                        rating: cr,
                        slope: sr,
                        adjustedGross: gross,
                        holes: holes,
                        notCounting: row.isCounting === 'false',
                        date: new Date(row.date),
                        importedAt: serverTimestamp()
                    });
                    imported++;
                } catch (_) { errors++; }
            }

            importMsgEl.textContent = `✅ Import complete: ${imported} rounds added${errors > 0 ? `, ${errors} rows skipped (invalid data)` : ''}.`;
            importMsgEl.style.color = errors > 0 ? '#f59e0b' : '#10b981';
        });
    }

    // --- Automated Excel Bulk Import ---
    const btnExcelImport = document.getElementById('btn-import-excel');
    const excelMsgEl = document.getElementById('excel-import-msg');

    if (btnExcelImport) {
        btnExcelImport.addEventListener('click', async () => {
            const fileInput = document.getElementById('excel-file-input');
            if (!fileInput.files.length) {
                excelMsgEl.textContent = '❌ Please select the myscores.xlsx file.';
                excelMsgEl.style.color = '#ef4444';
                return;
            }

            try {
                const file = fileInput.files[0];
                const data = await file.arrayBuffer();
                const workbook = window.XLSX.read(data, { type: 'array', cellDates: true });

                let totalImported = 0;
                let logMsg = "Import log:\n";
                excelMsgEl.textContent = 'Processing workbook... Please wait...';
                excelMsgEl.style.color = '#64748b';

                for (const sheetName of workbook.SheetNames) {
                    if (sheetName.toLowerCase() === 'legend') continue;

                    const emailToMatch = sheetName.toLowerCase().trim();
                    const q = query(collection(db, 'users'), where('email', '==', emailToMatch));
                    const snap = await getDocs(q);

                    if (snap.empty) {
                        logMsg += `⚠️ Skipped tab '${sheetName}': No registered user found with this email.\n`;
                        continue;
                    }
                    const targetUid = snap.docs[0].id;
                    logMsg += `✅ Found user for tab '${sheetName}' (UID: ${targetUid}).\n`;

                    const worksheet = workbook.Sheets[sheetName];
                    const rows = window.XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                    let tabImported = 0;
                    let tabErrors = 0;

                    for (let i = 0; i < rows.length; i++) {
                        const r = rows[i];
                        if (!r || r.length < 8) continue;

                        const dateVal = r[0];
                        const course = r[1];
                        const scratch = parseFloat(r[3]);
                        const slope = parseFloat(r[4]);
                        const grossDiff = parseFloat(r[7]);

                        if (!course || isNaN(scratch) || isNaN(slope) || isNaN(grossDiff)) continue;

                        let parsedDate = (dateVal instanceof Date) ? dateVal : (isNaN(parseInt(dateVal)) ? new Date(dateVal) : new Date((parseInt(dateVal) - 25569) * 86400 * 1000));
                        if (!parsedDate || isNaN(parsedDate.getTime())) continue;

                        const adjustedGross = Math.round((grossDiff * slope / 113) + scratch);

                        try {
                            await addDoc(collection(db, 'whs_rounds'), {
                                uid: targetUid,
                                course: course,
                                rating: scratch,
                                slope: slope,
                                adjustedGross: adjustedGross,
                                holes: 18,
                                notCounting: false,
                                date: parsedDate,
                                importedAt: serverTimestamp(),
                                isAutoImported: true,
                                originalGrossDiff: grossDiff
                            });
                            tabImported++;
                            totalImported++;
                        } catch (e) { tabErrors++; }
                    }
                    logMsg += `   -> Imported ${tabImported} rounds (${tabErrors} errors).\n`;
                }
                logMsg += `\n🎉 Finished! Total rounds imported: ${totalImported}`;
                excelMsgEl.textContent = logMsg;
                excelMsgEl.style.color = '#10b981';
            } catch (err) {
                excelMsgEl.textContent = '❌ Failed to process workbook. Ensure SheetJS loaded correctly.';
                excelMsgEl.style.color = '#ef4444';
            }
        });
    }
}
