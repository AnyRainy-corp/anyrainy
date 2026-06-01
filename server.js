// AnyRainy — локальный сервер с прокси для Kodik /ftor (без зависимостей)
const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

const PORT = 3456;

const MIME = {
    '.html':'text/html; charset=utf-8',
    '.js':'application/javascript; charset=utf-8',
    '.css':'text/css; charset=utf-8',
    '.json':'application/json',
    '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg',
    '.gif':'image/gif', '.svg':'image/svg+xml', '.ico':'image/x-icon',
    '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf',
    '.mp4':'video/mp4', '.webm':'video/webm',
};

const server = http.createServer((req, res) => {
    const parsed = url.parse(req.url);

    // ── CORS preflight ──────────────────────────────────────────────────────────
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    // ── Прокси для Kodik /ftor ──────────────────────────────────────────────────
    if (parsed.pathname === '/kodik-proxy' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            const opts = {
                hostname: 'kodikplayer.com',
                port: 443,
                path: '/ftor',
                method: 'POST',
                headers: {
                    'Content-Type':   'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(body),
                    'Referer':        'https://kodikplayer.com/',
                    'Origin':         'https://kodikplayer.com',
                    'User-Agent':     'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
                    'Accept':         'application/json, text/plain, */*',
                }
            };
            const proxyReq = https.request(opts, proxyRes => {
                let data = '';
                proxyRes.on('data', c => { data += c; });
                proxyRes.on('end', () => {
                    res.writeHead(proxyRes.statusCode, {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                    });
                    res.end(data);
                });
            });
            proxyReq.on('error', e => {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            });
            proxyReq.write(body);
            proxyReq.end();
        });
        return;
    }

    // ── Статические файлы ───────────────────────────────────────────────────────
    let filePath = path.join(__dirname, parsed.pathname === '/' ? 'index.html' : parsed.pathname);

    // Защита от path traversal
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403); res.end('Forbidden'); return;
    }

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404); res.end('Not found');
            } else {
                res.writeHead(500); res.end('Server error');
            }
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
        res.end(content);
    });
});

server.listen(PORT, () => {
    console.log(`✅ AnyRainy запущен: http://localhost:${PORT}`);
    console.log(`🎬 Прокси Kodik:    http://localhost:${PORT}/kodik-proxy`);
});
