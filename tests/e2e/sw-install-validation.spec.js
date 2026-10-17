// Execute the built worker with real browser fetch/Cache APIs and HTTP fallbacks.
import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

for (const extension of ['js', 'css']) {
    test(`worker update preserves the previous shell on a 200 HTML ${extension} fallback`, async ({ page }) => {
        const source = readFileSync('dist/sw.js', 'utf8');
        let updating = false;
        const asset = `/assets/required-test.${extension}`;
        const server = createServer((req, res) => {
            res.setHeader('Cache-Control', 'no-store');
            let type = 'text/html', body = updating ? '<p>new shell</p>' : '<p>previous shell</p>';
            if (req.url === '/sw.js') {
                type = 'text/javascript';
                body = `${source}\n// deployment ${updating ? 2 : 1}`;
            } else if (req.url === '/offline-shell.json') {
                type = 'application/json';
                body = JSON.stringify([asset]);
            } else if (req.url === asset && !updating) {
                type = extension === 'js' ? 'text/javascript' : 'text/css';
                body = extension === 'js' ? 'export const valid = true;' : 'body { color: green; }';
            }
            // Missing assets deliberately return the SPA rewrite: 200 text/html.
            res.writeHead(200, { 'Content-Type': type });
            res.end(body);
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        try {
            await page.goto(`http://127.0.0.1:${server.address().port}/`);
            await page.evaluate(() => navigator.serviceWorker.register('/sw.js'));
            await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
            const before = await page.evaluate(async () => (await caches.match('/')).text());
            expect(before).toContain('previous shell');
            updating = true;
            const state = await page.evaluate(async () => {
                const registration = await navigator.serviceWorker.getRegistration();
                const installed = new Promise(resolve => registration.addEventListener('updatefound', () => {
                    const candidate = registration.installing;
                    candidate.addEventListener('statechange', () => {
                        if (['activated', 'redundant'].includes(candidate.state)) resolve(candidate.state);
                    });
                }, { once: true }));
                await registration.update();
                return installed;
            });
            expect(state).toBe('redundant');
            expect(await page.evaluate(async () => (await caches.match('/')).text())).toBe(before);
            expect(await page.evaluate(async path => (await caches.match(path)).headers.get('content-type'), asset))
                .toBe(extension === 'js' ? 'text/javascript' : 'text/css');
        } finally {
            server.closeAllConnections();
            await new Promise(resolve => server.close(resolve));
        }
    });
}
