// Fixed journey coverage, independent of whichever files a failed run leaves behind.
export const PROJECTS = ['phone', 'iphone-se'];
const tabs = ['comp', 'feed', 'insights', 'oncourse', 'practice', 'settings', 'whs'];
export const SCREENS = [
    'auth-login', 'auth-register',
    ...['player-a', 'player-b', 'pending-c', 'coach-d', 'admin-e'].map(p => `${p}-home`),
    ...['player-a', 'player-b', 'coach-d', 'admin-e'].flatMap(p => tabs.map(t => `${p}-tab-${t}`)),
    'coach-d-tab-coach', 'admin-e-tab-admin', 'player-a-handicap',
    'player-a-history-actions', 'player-a-log-past-round', 'admin-pending-before-approval',
    'pending-c-approved-but-still-pending', 'pending-c-approved',
    ...['nine-setup', 'hole-one-scored', 'round-more', 'finish-summary', 'round-saved',
        'index-after-one-nine', 'excluded-round-reason'].map(s => `new-player-${s}`),
].sort();
export const SCREENSHOTS = PROJECTS.flatMap(p => SCREENS.map(s => `${p}/${s}.png`)).sort();
