import base from './playwright.config.js';
export default {
    ...base,
    testDir: './tests/copy',
    projects: base.projects.filter(p => ['phone', 'iphone-se'].includes(p.name)).map(p => ({
        ...p, use: { ...p.use, geolocation: { latitude: 0, longitude: 0, accuracy: 5 } },
    })),
    webServer: base.webServer.map((server, i) => i === 1 ? {
        ...server, command: server.command.replace('npm run build', 'npx vite build --config tests/visual/vite.config.js'),
    } : server),
};
