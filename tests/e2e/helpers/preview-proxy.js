import { createServer, request } from 'node:http';

// A private app origin that can genuinely disappear while its SW/cache survives.
export async function previewProxy(baseURL) {
    const target = new URL(baseURL);
    let server, port = 0;
    async function start() {
        server = createServer((incoming, response) => {
            const upstream = request(new URL(incoming.url, target), {
                method: incoming.method, headers: { ...incoming.headers, host: target.host },
            }, received => {
                response.writeHead(received.statusCode, received.headers);
                received.pipe(response);
            });
            upstream.on('error', () => response.destroy());
            incoming.pipe(upstream);
        });
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(port, '127.0.0.1', resolve);
        });
        port = server.address().port;
    }
    async function stop() {
        if (!server?.listening) return;
        server.closeAllConnections();
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
    await start();
    return { url: `http://127.0.0.1:${port}`, start, stop };
}
