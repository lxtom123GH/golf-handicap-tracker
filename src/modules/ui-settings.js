// Sydney Protocol: src/modules/ui-settings.js
// Locale: en-AU (Australian Standard)
// Status: [HARDENED] - Extracted from global scope

import { AppState } from '../state.js';

/**
 * Refreshes the settings UI with current user information.
 * Fixes Architecture Issue: Removed from window.refreshSettingsUI
 */
export const refreshSettingsUI = () => {
    const info = document.getElementById('settings-account-info');
    if (!info || !AppState.currentUser) return;

    // Default to Standard Player if roles aren't defined
    const role = window.currentUserIsAdmin ? 'Master Admin' : 
                (window.currentUserIsCoach ? 'Coach' : 'Standard Player');

    info.innerHTML = `
        <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0;">
            <p><strong>Name:</strong> ${AppState.currentUser.displayName || 'Guest User'}</p>
            <p><strong>Email:</strong> ${AppState.currentUser.email}</p>
            <p><strong>Role:</strong> ${role}</p>
            <p style="margin-top:10px; font-size: 0.75rem; color: #64748b; border-top: 1px solid #cbd5e1; padding-top: 8px;">
                User ID: ${AppState.currentUser.uid}
            </p>
        </div>
    `;
};