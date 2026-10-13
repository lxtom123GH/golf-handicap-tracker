import base from './playwright.config.js';
export default {
    ...base,
    testDir: './tests/visual',
    globalSetup: './tests/e2e/helpers/install-webkit.js',
    projects: base.projects.filter(project => ['phone', 'iphone-se'].includes(project.name)).map(project => ({ ...project, use: { ...project.use, launchOptions: { ...project.use.launchOptions, ...(process.env.GOLDEN_CHROME_EXECUTABLE ? { executablePath: process.env.GOLDEN_CHROME_EXECUTABLE } : {}) }, geolocation: { latitude: 0, longitude: 0, accuracy: 5 } } })),
    snapshotPathTemplate: '{testDir}/baselines/{projectName}/{arg}{ext}',
    expect: { ...base.expect, toHaveScreenshot: { animations: 'disabled', maxDiffPixelRatio: 0.005 } },
    webServer: base.webServer.map((server, index) => index === 1 ? {
        ...server,
        command: server.command.replace('npm run build', 'npx vite build --config tests/visual/vite.config.js'),
    } : server),
};
