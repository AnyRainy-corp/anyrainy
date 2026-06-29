// AnyRainy — локальный сервер с прокси для Kodik /ftor (без зависимостей)
const http  = require('http');
const https = require('https');
const zlib  = require('zlib');
const dns   = require('dns');
// Node по умолчанию пробует IPv6 первым — на этой сети IPv6 не работает,
// из-за чего все внешние запросы висят до таймаута
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');
const { resolveEmbed } = require('./embed-resolve');

// ── Balancer кеш (в памяти, TTL 30мин) ──────────────────────────────────────
const _balancerCache = new Map(); // `${provider}:${kp}` → { url, exp }
const _BALANCER_TTL  = 1800000;  // 30 min

// ── Shikimori кеш (в памяти, TTL 24ч) ───────────────────────────────────────
const _shikiCache     = new Map(); // id → { body, exp }
const _shikiFrCache   = new Map(); // id → { body, exp }
const _SHIKI_TTL      = 86400000;  // 24h

// ── Jikan API прокси: серверный кеш + очередь 340мс (rate-limit Jikan 3 req/s) ─
const _jikanCache  = new Map(); // path → { body, exp }
const _jikanFlight = new Map(); // path → Promise<string>
let   _jikanChain  = Promise.resolve(); // последовательная очередь к Jikan

function jikanProxied(reqPath) {
    const hit = _jikanCache.get(reqPath);
    if (hit && hit.exp > Date.now()) return Promise.resolve(hit.body);
    if (_jikanFlight.has(reqPath)) return _jikanFlight.get(reqPath);

    let resolve_, reject_;
    const p = new Promise((res, rej) => { resolve_ = res; reject_ = rej; });
    _jikanFlight.set(reqPath, p);

    _jikanChain = _jikanChain
        .then(() => new Promise(r => setTimeout(r, 340)))
        .then(() => new Promise(done => {
            const r = https.get({
                hostname: 'api.jikan.moe',
                path: '/v4' + reqPath,
                headers: { 'User-Agent': 'AnyRainy/1.0', 'Accept': 'application/json' },
            }, sRes => {
                let body = '';
                sRes.setEncoding('utf8');
                sRes.on('data', c => body += c);
                sRes.on('end', () => {
                    _jikanFlight.delete(reqPath);
                    if (sRes.statusCode === 200) {
                        const ttl = /\/(top|seasons)\/|[?&]q=/.test(reqPath)
                            ? 6 * 3600000 : 2 * 3600000;
                        _jikanCache.set(reqPath, { body, exp: Date.now() + ttl });
                        resolve_(body);
                    } else {
                        reject_(new Error('Jikan HTTP ' + sRes.statusCode));
                    }
                    done();
                });
            });
            r.on('error', e => { _jikanFlight.delete(reqPath); reject_(e); done(); });
            r.setTimeout(15000, () => { r.destroy(); });
        }))
        .catch(() => {});

    return p;
}

// ── Gzip-кеш для статических файлов (сжимается один раз при первом запросе) ──
const _gzCache = new Map();

const PORT = 3456;

// ── Настройки чата с локальной нейросетью (Ollama) ──────────────────────────
const OLLAMA_HOST  = '127.0.0.1';
const OLLAMA_PORT  = 11434;
const OLLAMA_MODEL = 'llama3.1:8b';
// ВАЖНО: смени пароль на свой. Без него любой, кто узнает ссылку, сможет писать боту.
const CHAT_PASSWORD = 'changeme2026';
// Системный промпт берём из персонального профиля (persona_bot), чтобы чат
// отвечал в стиле пользователя. Если профиль не найден — обычный ассистент.
const PERSONA_PROMPT_PATH = path.join(__dirname, 'persona_bot', 'persona', 'system_prompt.txt');
let CHAT_SYSTEM = 'Ты — полезный ассистент. Отвечай по-русски, кратко и по делу.';
try {
    CHAT_SYSTEM = fs.readFileSync(PERSONA_PROMPT_PATH, 'utf8').trim();
    console.log('🧬 Персона загружена из ' + PERSONA_PROMPT_PATH);
} catch (_) {
    console.log('⚠️  Персона не найдена, использую обычного ассистента');
}

// ── Память персоны: реальные люди и сообщения из жизни (для ответов на факты) ──
const KNOWLEDGE_PATH = path.join(__dirname, 'persona_bot', 'persona', 'knowledge.json');
let KNOWLEDGE = { people: [], msgs: [] };
let MEM_HAY = []; // предпосчитанные строки для поиска (lowercase), по индексу msgs
try {
    KNOWLEDGE = JSON.parse(fs.readFileSync(KNOWLEDGE_PATH, 'utf8'));
    MEM_HAY = KNOWLEDGE.msgs.map(m => (m[0] + ' ' + m[2]).toLowerCase());
    console.log(`🧠 Память загружена: ${KNOWLEDGE.people.length} людей, ${KNOWLEDGE.msgs.length} сообщений`);
} catch (_) {
    console.log('⚠️  База знаний не найдена (persona_bot/persona/knowledge.json) — бот без памяти');
}

const MEM_STOP = new Set('это что как так вот там тут где когда если или для это была было были есть быть мне меня тебя себя который чтобы потому очень эти этот твоя твой наш ваш все всё всех кто чем кого кому теперь тебе знаешь твоя'.split(/\s+/));
const stem = w => (w.length > 5 ? w.slice(0, 5) : w);

// По тексту вопроса достаём из памяти релевантные факты и реальные сообщения
function buildMemory(query) {
    if (!KNOWLEDGE.msgs.length || !query) return '';
    const words = (query.toLowerCase().match(/[а-яёa-z]+/g) || [])
        .filter(w => w.length >= 4 && !MEM_STOP.has(w));
    if (!words.length) return '';
    const stems = [...new Set(words.map(stem))];

    // люди, упомянутые в вопросе (по основе слова — учёт падежей)
    const peopleHit = KNOWLEDGE.people.filter(([n]) => {
        const nl = n.toLowerCase();
        return stems.some(s => nl.includes(s));
    });

    // топ сообщений по числу совпавших основ (по предпосчитанному индексу MEM_HAY)
    const msgs = KNOWLEDGE.msgs;
    const scored = [];
    for (let i = 0; i < msgs.length; i++) {
        const hay = MEM_HAY[i];
        let s = 0;
        for (const st of stems) if (hay.includes(st)) s++;
        if (s > 0) scored.push([s, i]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    const top = scored.slice(0, 10);

    if (!peopleHit.length && !top.length) return '';
    let block = '\n\n# Твоя память (РЕАЛЬНЫЕ факты из твоей жизни — это правда о тебе, опирайся на это):';
    if (peopleHit.length) {
        block += '\nИз вопроса — люди, которых ты реально знаешь лично: '
            + peopleHit.slice(0, 6).map(([n]) => n).join(', ') + '.';
    }
    if (top.length) {
        block += '\nТвои настоящие сообщения по теме вопроса (кто сказал → текст):';
        for (const [, i] of top) {
            const [p, side, t] = msgs[i];
            block += `\n— [чат с «${p}»] ${side === 'я' ? 'ты' : 'он(а)'}: ${t}`;
        }
    }
    block += '\nОтвечай, опираясь на эту память. Если конкретного факта в ней нет — не выдумывай детали, но оставайся собой и не говори, что ты программа.';
    return block;
}

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

    // ── Прокси для Kodik /ftor и /kor ───────────────────────────────────────────
    if (parsed.pathname === '/kodik-proxy' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            const q = url.parse(req.url, true).query || {};
            const kodikPaths = { ftor: '/ftor', kor: '/kor' };
            const kodikPath = kodikPaths[q.endpoint] || '/ftor';
            const opts = {
                hostname: 'kodikplayer.com',
                port: 443,
                path: kodikPath,
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

    // ── Прокси картинок (постеры) для обхода DPI-блокировки CDN в РФ ───────────
    if (parsed.pathname === '/img' && req.method === 'GET') {
        const target = (url.parse(req.url, true).query || {}).url;
        if (!target) { res.writeHead(400); res.end('Missing url'); return; }

        // Разрешённые хосты постеров
        const ALLOWED_IMG_HOSTS = [
            'cdn.myanimelist.net', 'myanimelist.net',
            'shikimori.one', 'shikimori.io', 'nyaa.shikimori.one',
            'anilibria.top', 'anilibria.tv', 'static.anilibria.top',
            'i.kodikres.com', 'i.kodik.biz', 'kodikres.com',
            'images.unsplash.com',
        ];

        let imgResponded = false;
        const imgReply = (status, headers, body) => {
            if (imgResponded || res.writableEnded) return;
            imgResponded = true;
            res.writeHead(status, headers);
            res.end(body);
        };

        const fetchImage = (imgUrl, redirectsLeft) => {
            let u;
            try { u = new URL(imgUrl); } catch (_) { imgReply(400, {}, 'Bad url'); return; }
            const host = u.hostname.toLowerCase();
            const allowed = ALLOWED_IMG_HOSTS.some(h => host === h || host.endsWith('.' + h));
            if (!allowed) { imgReply(403, {}, 'Host not allowed'); return; }

            const lib = u.protocol === 'http:' ? http : https;
            const imgReq = lib.get({
                hostname: u.hostname,
                path: u.pathname + u.search,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
                    'Accept': 'image/avif,image/webp,image/*,*/*;q=0.8',
                    'Referer': `${u.protocol}//${u.hostname}/`,
                },
            }, imgRes => {
                // Поддержка редиректов (например, kodikres отдаёт 302)
                if ([301, 302, 303, 307, 308].includes(imgRes.statusCode) && imgRes.headers.location && redirectsLeft > 0) {
                    imgRes.resume();
                    const next = new URL(imgRes.headers.location, u).toString();
                    fetchImage(next, redirectsLeft - 1);
                    return;
                }
                if (imgResponded || res.writableEnded) { imgRes.resume(); return; }
                if (imgRes.statusCode !== 200) {
                    imgReply(imgRes.statusCode, {}, null);
                    imgRes.resume();
                    return;
                }
                imgResponded = true;
                res.writeHead(200, {
                    'Content-Type': imgRes.headers['content-type'] || 'image/jpeg',
                    'Cache-Control': 'public, max-age=86400',
                    'Access-Control-Allow-Origin': '*',
                });
                imgRes.pipe(res);
            });
            imgReq.on('error', e => imgReply(502, { 'Content-Type': 'text/plain' }, e.message));
            imgReq.setTimeout(15000, () => { imgReq.destroy(); imgReply(504, {}, 'Timeout'); });
        };

        fetchImage(target, 4);
        return;
    }

    // ── Embed Aniboom / Sibnet (через AnimeGO API) ─────────────────────────────
    if (parsed.pathname === '/embed-resolve' && req.method === 'GET') {
        const q = url.parse(req.url, true).query || {};
        const provider = String(q.provider || '').toLowerCase();
        const malId = q.malId;
        const ep = q.ep || 1;
        const title = q.title || '';

        if (!['aniboom', 'sibnet', 'cvh', 'alloha', 'aksor', 'kodik'].includes(provider)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'unknown provider' }));
            return;
        }

        resolveEmbed(provider, malId, ep, title)
            .then(embedUrl => {
                res.writeHead(200, {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'public, max-age=1800',
                });
                res.end(JSON.stringify(embedUrl ? { url: embedUrl } : { url: null }));
            })
            .catch(e => {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message, url: null }));
            });
        return;
    }

    // ── Резолвер балансеров по Kinopoisk id (Alloha / Collaps / Turbo) ─────────
    if (parsed.pathname === '/balancer-resolve' && req.method === 'GET') {
        const q = url.parse(req.url, true).query || {};
        const provider = String(q.provider || '').toLowerCase();
        const kp = String(q.kp || '').replace(/[^0-9]/g, '');
        if (!kp) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ url: null, error: 'no kp' })); return; }

        const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

        // GET → текст, с таймаутом
        const getText = (target, timeoutMs = 12000) => new Promise((resolve, reject) => {
            let u; try { u = new URL(target); } catch (e) { reject(e); return; }
            const lib = u.protocol === 'http:' ? http : https;
            const r = lib.get({ hostname: u.hostname, path: u.pathname + u.search,
                headers: { 'User-Agent': UA, 'Accept': 'application/json,*/*', 'Referer': `${u.protocol}//${u.hostname}/` } },
                resp => {
                    if ([301,302,307,308].includes(resp.statusCode) && resp.headers.location) {
                        resp.resume(); resolve(getText(new URL(resp.headers.location, u).toString(), timeoutMs)); return;
                    }
                    let d = ''; resp.on('data', c => d += c);
                    resp.on('end', () => resp.statusCode >= 400 ? reject(new Error('HTTP ' + resp.statusCode)) : resolve(d));
                });
            r.on('error', reject);
            r.setTimeout(timeoutMs, () => { r.destroy(); reject(new Error('timeout')); });
        });

        // Рекурсивно ищем iframe-ссылку у объекта, чей source/type совпадает с провайдером
        const findIframe = (node, wantNames) => {
            if (!node || typeof node !== 'object') return null;
            const arr = Array.isArray(node) ? node : [node];
            for (const item of arr) {
                if (item && typeof item === 'object' && !Array.isArray(item)) {
                    const name = String(item.source || item.type || item.name || item.balancer || '').toLowerCase();
                    const iframe = item.iframeUrl || item.iframe || item.url || item.src || item.link;
                    if (name && wantNames.some(w => name.includes(w)) && typeof iframe === 'string' && /^https?:|^\/\//.test(iframe)) {
                        return iframe.startsWith('//') ? 'https:' + iframe : iframe;
                    }
                }
                for (const v of Object.values(item || {})) {
                    if (v && typeof v === 'object') { const hit = findIframe(v, wantNames); if (hit) return hit; }
                }
            }
            return null;
        };

        const NAMES = { alloha: ['alloha'], collaps: ['collaps', 'lumex'], turbo: ['turbo'] };
        const wantNames = NAMES[provider] || [provider];

        const cacheKey = `${provider}:${kp}`;
        const cached = _balancerCache.get(cacheKey);
        if (cached && cached.exp > Date.now()) {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=1800' });
            res.end(JSON.stringify({ url: cached.url })); return;
        }

        const reply = (u) => {
            if (u) _balancerCache.set(cacheKey, { url: u, exp: Date.now() + _BALANCER_TTL });
            if (!res.writableEnded) { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=1800' }); res.end(JSON.stringify({ url: u || null })); }
        };

        (async () => {
            // Агрегатор fbphdplay.top — отдаёт Alloha/Collaps/Turbo одним запросом
            for (const base of ['https://fbphdplay.top/api/players', 'https://kinobox.tv/api/players/main']) {
                try {
                    const j = JSON.parse(await getText(`${base}?kinopoisk=${kp}`, 9000));
                    const arr = Array.isArray(j) ? j : (j.data || j);
                    const hit = findIframe(arr, wantNames);
                    if (hit) return reply(hit);
                } catch (_) {}
            }
            reply(null);
        })().catch(() => reply(null));
        return;
    }

    // ── Shikimori: все аниме студии по id студии ──────────────────────────────
    // ── Shikimori: список всех студий ────────────────────────────────────────
    if (parsed.pathname === '/shiki-studios' && req.method === 'GET') {
        if (!global._shikiStudiosListCache) global._shikiStudiosListCache = { body: null, exp: 0 };
        if (global._shikiStudiosListCache.body && global._shikiStudiosListCache.exp > Date.now()) {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=86400' });
            res.end(global._shikiStudiosListCache.body); return;
        }
        const sOpts = { hostname: 'shikimori.io', path: '/api/studios', headers: { 'User-Agent': 'AnyRainy/1.0', 'Accept': 'application/json' } };
        const sReq = https.get(sOpts, sRes => {
            let data = '';
            sRes.setEncoding('utf8');
            sRes.on('data', c => { data += c; });
            sRes.on('end', () => {
                const body = sRes.statusCode === 200 ? data : '[]';
                global._shikiStudiosListCache = { body, exp: Date.now() + 86400000 };
                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=86400' });
                res.end(body);
            });
        });
        sReq.on('error', () => { if (!res.writableEnded) { res.writeHead(502); res.end('[]'); } });
        sReq.setTimeout(8000, () => { sReq.destroy(); if (!res.writableEnded) { res.writeHead(504); res.end('[]'); } });
        return;
    }

    if (parsed.pathname === '/shiki-studio' && req.method === 'GET') {
        const q = url.parse(req.url, true).query || {};
        const id = String(q.id || '').replace(/[^0-9]/g, '');
        const page = Math.max(1, parseInt(q.page) || 1);
        if (!id) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end('[]'); return; }
        const cacheKey = `studio_${id}_p${page}`;
        if (!global._shikiStudioCache) global._shikiStudioCache = new Map();
        const hit = global._shikiStudioCache.get(cacheKey);
        if (hit && hit.exp > Date.now()) {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' });
            res.end(hit.body); return;
        }
        const sPath = `/api/animes?studio[]=${id}&limit=50&page=${page}&order=ranked`;
        const sOpts = { hostname: 'shikimori.io', path: sPath, headers: { 'User-Agent': 'AnyRainy/1.0', 'Accept': 'application/json' } };
        const sReq = https.get(sOpts, sRes => {
            let data = '';
            sRes.setEncoding('utf8');
            sRes.on('data', c => { data += c; });
            sRes.on('end', () => {
                const body = sRes.statusCode === 200 ? data : '[]';
                global._shikiStudioCache.set(cacheKey, { body, exp: Date.now() + 3600000 });
                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' });
                res.end(body);
            });
        });
        sReq.on('error', () => { if (!res.writableEnded) { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end('[]'); } });
        sReq.setTimeout(10000, () => { sReq.destroy(); if (!res.writableEnded) { res.writeHead(504, { 'Content-Type': 'application/json' }); res.end('[]'); } });
        return;
    }

    // ── Shikimori: все части франшизы по MAL id ────────────────────────────────
    if (parsed.pathname === '/shiki-franchise' && req.method === 'GET') {
        const id = String((url.parse(req.url, true).query || {}).id || '').replace(/[^0-9]/g, '');
        if (!id) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end('[]'); return; }
        const cachedFr = _shikiFrCache.get(id);
        if (cachedFr && cachedFr.exp > Date.now()) {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=86400' });
            res.end(cachedFr.body); return;
        }
        const shikiGet = path => new Promise((resolve, reject) => {
            const r = https.get({ hostname: 'shikimori.io', path, headers: { 'User-Agent': 'AnyRainy', 'Accept': 'application/json' } }, sRes => {
                let data = '';
                sRes.setEncoding('utf8');
                sRes.on('data', c => { data += c; });
                sRes.on('end', () => resolve({ status: sRes.statusCode, body: data }));
            });
            r.on('error', reject);
            r.setTimeout(10000, () => { r.destroy(); reject(new Error('timeout')); });
        });
        (async () => {
            try {
                const detail = await shikiGet(`/api/animes/${id}`);
                const anime = JSON.parse(detail.body);
                const franchise = anime?.franchise;
                if (!franchise) {
                    _shikiFrCache.set(id, { body: '[]', exp: Date.now() + _SHIKI_TTL });
                    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' });
                    res.end('[]'); return;
                }
                const members = await shikiGet(`/api/animes?franchise=${encodeURIComponent(franchise)}&limit=100&order=aired_on`);
                const body = members.status === 200 ? members.body : '[]';
                _shikiFrCache.set(id, { body, exp: Date.now() + _SHIKI_TTL });
                res.writeHead(200, {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'public, max-age=86400',
                });
                res.end(body);
            } catch (_) {
                if (!res.writableEnded) { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end('[]'); }
            }
        })();
        return;
    }

    // ── Shikimori: универсальный каталог ─────────────────────────────────────
    if (parsed.pathname === '/shiki-catalog' && req.method === 'GET') {
        const q = url.parse(req.url, true).query || {};
        const page  = Math.max(1, parseInt(q.page) || 1);
        const order  = ['ranked','popularity','aired_on','name'].includes(q.order) ? q.order : 'ranked';
        const status = (q.status || '').replace(/[^a-z,]/g,'');
        const kind   = (q.kind   || '').replace(/[^a-z,_]/g,'');
        const search = (q.search || '').slice(0, 200);
        const limit  = Math.min(50, Math.max(1, parseInt(q.limit) || 50));
        const cacheKey = `cat_${order}_${page}_${status}_${kind}_${encodeURIComponent(search)}`;
        if (!global._shikiCatCache) global._shikiCatCache = new Map();
        const hit = global._shikiCatCache.get(cacheKey);
        if (hit && hit.exp > Date.now()) {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' });
            res.end(hit.body); return;
        }
        let sPath = `/api/animes?order=${order}&limit=${limit}&page=${page}&score=1`;
        if (status) sPath += `&status=${status}`;
        if (kind)   sPath += `&kind=${kind}`;
        if (search) sPath += `&search=${encodeURIComponent(search)}`;
        const sOpts = { hostname: 'shikimori.io', path: sPath, headers: { 'User-Agent': 'AnyRainy/1.0', 'Accept': 'application/json' } };
        const sReq = https.get(sOpts, sRes => {
            let data = '';
            sRes.setEncoding('utf8');
            sRes.on('data', c => { data += c; });
            sRes.on('end', () => {
                const body = sRes.statusCode === 200 ? data : '[]';
                const ttl = search ? 300000 : 3600000;
                global._shikiCatCache.set(cacheKey, { body, exp: Date.now() + ttl });
                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' });
                res.end(body);
            });
        });
        sReq.on('error', () => { if (!res.writableEnded) { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end('[]'); } });
        sReq.setTimeout(10000, () => { sReq.destroy(); if (!res.writableEnded) { res.writeHead(504, { 'Content-Type': 'application/json' }); res.end('[]'); } });
        return;
    }

    // ── Shikimori: текущий сезон ──────────────────────────────────────────────
    if (parsed.pathname === '/shiki-season' && req.method === 'GET') {
        if (!global._shikiSeasonCache) global._shikiSeasonCache = { body: null, exp: 0 };
        if (global._shikiSeasonCache.body && global._shikiSeasonCache.exp > Date.now()) {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' });
            res.end(global._shikiSeasonCache.body); return;
        }
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const season = month <= 3 ? 'winter' : month <= 6 ? 'spring' : month <= 9 ? 'summer' : 'fall';
        const sPath = `/api/animes?season=${season}&year=${year}&kind=tv&limit=25&order=ranked&status=ongoing,released`;
        const sOpts = { hostname: 'shikimori.io', path: sPath, headers: { 'User-Agent': 'AnyRainy/1.0', 'Accept': 'application/json' } };
        const sReq = https.get(sOpts, sRes => {
            let data = '';
            sRes.setEncoding('utf8');
            sRes.on('data', c => { data += c; });
            sRes.on('end', () => {
                const body = sRes.statusCode === 200 ? data : '[]';
                global._shikiSeasonCache = { body, exp: Date.now() + 3600000 };
                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' });
                res.end(body);
            });
        });
        sReq.on('error', () => { if (!res.writableEnded) { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end('[]'); } });
        sReq.setTimeout(8000, () => { sReq.destroy(); if (!res.writableEnded) { res.writeHead(504, { 'Content-Type': 'application/json' }); res.end('[]'); } });
        return;
    }

    // ── Shikimori: русское название + описание по MAL id ───────────────────────
    if (parsed.pathname === '/shiki' && req.method === 'GET') {
        const id = String((url.parse(req.url, true).query || {}).id || '').replace(/[^0-9]/g, '');
        if (!id) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end('{}'); return; }
        const cached = _shikiCache.get(id);
        if (cached && cached.exp > Date.now()) {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=86400' });
            res.end(cached.body); return;
        }
        const opts = {
            hostname: 'shikimori.io',
            path: `/api/animes/${id}`,
            headers: { 'User-Agent': 'AnyRainy', 'Accept': 'application/json' },
        };
        const sReq = https.get(opts, sRes => {
            let data = '';
            sRes.setEncoding('utf8');
            sRes.on('data', c => { data += c; });
            sRes.on('end', () => {
                if (sRes.statusCode === 200) _shikiCache.set(id, { body: data, exp: Date.now() + _SHIKI_TTL });
                res.writeHead(sRes.statusCode === 200 ? 200 : 502, {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'public, max-age=86400',
                });
                res.end(sRes.statusCode === 200 ? data : '{}');
            });
        });
        sReq.on('error', () => { if (!res.writableEnded) { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end('{}'); } });
        sReq.setTimeout(10000, () => { sReq.destroy(); if (!res.writableEnded) { res.writeHead(504, { 'Content-Type': 'application/json' }); res.end('{}'); } });
        return;
    }

    // ── Shikimori search (для русских запросов) ─────────────────────────────────
    if (parsed.pathname === '/shiki-search' && req.method === 'GET') {
        const q = String((url.parse(req.url, true).query || {}).q || '').trim().slice(0, 200);
        if (!q) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end('[]'); return; }
        const sPath = `/api/animes?search=${encodeURIComponent(q)}&limit=20&order=ranked`;
        const sOpts = { hostname: 'shikimori.io', path: sPath, headers: { 'User-Agent': 'AnyRainy/1.0', 'Accept': 'application/json' } };
        const sReq2 = https.get(sOpts, sRes2 => {
            let data = '';
            sRes2.setEncoding('utf8');
            sRes2.on('data', c => { data += c; });
            sRes2.on('end', () => {
                res.writeHead(sRes2.statusCode === 200 ? 200 : 502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=300' });
                res.end(sRes2.statusCode === 200 ? data : '[]');
            });
        });
        sReq2.on('error', () => { if (!res.writableEnded) { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end('[]'); } });
        sReq2.setTimeout(8000, () => { sReq2.destroy(); if (!res.writableEnded) { res.writeHead(504, { 'Content-Type': 'application/json' }); res.end('[]'); } });
        return;
    }

    // ── Shikimori full (аниме + related + roles) ───────────────────────────────
    if (parsed.pathname === '/shiki-full' && req.method === 'GET') {
        const id = String((url.parse(req.url, true).query || {}).id || '').replace(/[^0-9]/g, '');
        if (!id) { res.writeHead(400); res.end('{}'); return; }
        if (!global._shikiFullCache) global._shikiFullCache = new Map();
        const hit = global._shikiFullCache.get(id);
        if (hit && hit.exp > Date.now()) {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' });
            res.end(hit.body); return;
        }
        let pending = 3, results = {}, sent = false;
        function tryDone() {
            if (--pending > 0) return;
            if (sent || res.writableEnded) return;
            sent = true;
            const combined = JSON.stringify({ ...(results.main || {}), related: results.related || [], roles: results.roles || [] });
            global._shikiFullCache.set(id, { body: combined, exp: Date.now() + 3600000 });
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' });
            res.end(combined);
        }
        function shFetch(shPath, key) {
            const r = https.get({ hostname: 'shikimori.io', path: shPath, headers: { 'User-Agent': 'AnyRainy', 'Accept': 'application/json' } }, rs => {
                let d = '';
                rs.on('data', c => d += c);
                rs.on('end', () => { try { results[key] = JSON.parse(d); } catch(_) { results[key] = key === 'main' ? {} : []; } tryDone(); });
            });
            r.on('error', () => { results[key] = key === 'main' ? {} : []; tryDone(); });
            r.setTimeout(12000, () => { r.destroy(); results[key] = key === 'main' ? {} : []; tryDone(); });
        }
        shFetch(`/api/animes/${id}`, 'main');
        shFetch(`/api/animes/${id}/related`, 'related');
        shFetch(`/api/animes/${id}/roles`, 'roles');
        return;
    }

    // ── HLS-прокси для AniLibria (обход DPI-блокировки) ────────────────────────
    if (parsed.pathname === '/hls-proxy' && req.method === 'GET') {
        const target = (url.parse(req.url, true).query || {}).url;
        if (!target) { res.writeHead(400); res.end('Missing url'); return; }

        let u;
        try { u = new URL(target); } catch (_) { res.writeHead(400); res.end('Bad url'); return; }

        const ALLOWED_HLS = /(anilibria\.(top|tv|online|me)|libria\.fun)/i;
        if (!ALLOWED_HLS.test(u.hostname)) { res.writeHead(403); res.end('Host not allowed'); return; }

        const lib = u.protocol === 'http:' ? http : https;
        const hlsReq = lib.get({
            hostname: u.hostname,
            path: u.pathname + u.search,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://anilibria.top/',
                'Origin': 'https://anilibria.top',
                'Accept': '*/*',
            },
        }, hlsRes => {
            if (hlsRes.statusCode !== 200) {
                res.writeHead(hlsRes.statusCode || 502);
                hlsRes.resume();
                res.end();
                return;
            }

            const ct = hlsRes.headers['content-type'] || '';
            const isM3u8 = target.includes('.m3u8') || ct.includes('mpegurl') || ct.includes('x-mpegurl');
            const isJson = ct.includes('json') || target.includes('/api/');
            console.log('[hls-proxy]', hlsRes.statusCode, isJson?'json':isM3u8?'m3u8':'binary', u.hostname + u.pathname.slice(0,60));

            if (isJson) {
                let body = '';
                hlsRes.setEncoding('utf8');
                hlsRes.on('data', c => { body += c; });
                hlsRes.on('end', () => {
                    res.writeHead(200, {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'no-cache',
                    });
                    res.end(body);
                });
            } else if (isM3u8) {
                let body = '';
                hlsRes.setEncoding('utf8');
                hlsRes.on('data', c => { body += c; });
                hlsRes.on('end', () => {
                    const base = target.substring(0, target.lastIndexOf('/') + 1);
                    const rewritten = body.split('\n').map(line => {
                        const trimmed = line.trim();
                        if (!trimmed || trimmed.startsWith('#')) return line;
                        let abs;
                        if (trimmed.startsWith('http')) abs = trimmed;
                        else if (trimmed.startsWith('/')) abs = `${u.protocol}//${u.hostname}${trimmed}`;
                        else abs = base + trimmed;
                        return `/hls-proxy?url=${encodeURIComponent(abs)}`;
                    }).join('\n');
                    res.writeHead(200, {
                        'Content-Type': 'application/vnd.apple.mpegurl',
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'no-cache',
                    });
                    res.end(rewritten);
                });
            } else {
                res.writeHead(200, {
                    'Content-Type': ct || 'video/MP2T',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'public, max-age=3600',
                });
                hlsRes.pipe(res);
            }
        });
        hlsReq.on('error', e => {
            console.error('[hls-proxy] ERROR', u.hostname, u.pathname.slice(0,60), e.message);
            if (!res.writableEnded) { res.writeHead(502); res.end(e.message); }
        });
        hlsReq.setTimeout(30000, () => {
            console.error('[hls-proxy] TIMEOUT', u.hostname, u.pathname.slice(0,60));
            hlsReq.destroy();
            if (!res.writableEnded) { res.writeHead(504); res.end('Timeout'); }
        });
        return;
    }

    // ── Чат с локальной нейросетью (Ollama) ────────────────────────────────────
    if (parsed.pathname === '/ask' && req.method === 'POST') {
        let body = '';
        req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
        req.on('end', () => {
            let payload;
            try { payload = JSON.parse(body); } catch (_) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'bad json' })); return;
            }
            if (payload.password !== CHAT_PASSWORD) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Неверный пароль' })); return;
            }
            const history = (Array.isArray(payload.messages) ? payload.messages : [])
                .filter(m => m && m.role && typeof m.content === 'string');
            // Последний вопрос пользователя → достаём релевантную память
            const lastUser = [...history].reverse().find(m => m.role === 'user');
            const sysContent = CHAT_SYSTEM + buildMemory(lastUser ? lastUser.content : '');
            // система всегда первая, историю подрезаем (не раздуваем контекст)
            const messages = [{ role: 'system', content: sysContent }, ...history.slice(-19)];

            const ollamaBody = JSON.stringify({ model: OLLAMA_MODEL, messages, stream: true, options: { temperature: 0.7 } });
            const oReq = http.request({
                hostname: OLLAMA_HOST, port: OLLAMA_PORT, path: '/api/chat', method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(ollamaBody) },
            }, oRes => {
                // Стримим ответ модели «как есть» (NDJSON) прямо в браузер
                res.writeHead(200, {
                    'Content-Type': 'application/x-ndjson; charset=utf-8',
                    'Cache-Control': 'no-cache',
                    'Access-Control-Allow-Origin': '*',
                });
                oRes.pipe(res);
            });
            oReq.on('error', e => {
                if (!res.writableEnded) {
                    res.writeHead(502, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Оллама недоступна: ' + e.message }));
                }
            });
            oReq.write(ollamaBody);
            oReq.end();
        });
        return;
    }

    // ── Jikan API прокси ────────────────────────────────────────────────────────
    if (parsed.pathname === '/jikan' && req.method === 'GET') {
        const q = url.parse(req.url, true).query || {};
        const reqPath = decodeURIComponent(q.path || '');
        if (!reqPath || !/^\/(?:anime|top|seasons)/.test(reqPath) || reqPath.includes('..')) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'invalid path' }));
            return;
        }
        jikanProxied(reqPath)
            .then(body => {
                if (!res.writableEnded) {
                    res.writeHead(200, {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'public, max-age=120',
                    });
                    res.end(body);
                }
            })
            .catch(e => {
                if (!res.writableEnded) {
                    res.writeHead(502, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
        return;
    }

    // ── Admin: Featured API ─────────────────────────────────────────────────────
    const FEATURED_FILE = path.join(__dirname, 'featured.json');
    const UPLOADS_DIR   = path.join(__dirname, 'uploads');
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

    if (parsed.pathname === '/admin') {
        const adminPath = path.join(__dirname, 'featured-admin.html');
        fs.readFile(adminPath, (err, data) => {
            if (err) { res.writeHead(404); res.end('featured-admin.html not found'); return; }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(data);
        });
        return;
    }

    if (parsed.pathname === '/api/featured' && req.method === 'GET') {
        try {
            const data = fs.existsSync(FEATURED_FILE) ? fs.readFileSync(FEATURED_FILE, 'utf8') : '[]';
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' });
            res.end(data);
        } catch(e) { res.writeHead(500); res.end('[]'); }
        return;
    }

    if (parsed.pathname === '/api/featured' && req.method === 'POST') {
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => {
            try {
                JSON.parse(body);
                fs.writeFileSync(FEATURED_FILE, body, 'utf8');
                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end('{"ok":true}');
            } catch(e) { res.writeHead(400); res.end(JSON.stringify({ error: e.message })); }
        });
        return;
    }

    if (parsed.pathname === '/api/upload-video' && req.method === 'POST') {
        const ct = req.headers['content-type'] || '';
        const bm = ct.match(/boundary=(.+)/);
        if (!bm) { res.writeHead(400); res.end('no boundary'); return; }
        const boundary = bm[1].trim();
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => {
            try {
                const buf = Buffer.concat(chunks);
                const bBuf = Buffer.from('\r\n--' + boundary);
                // find filename
                const hdrEnd = buf.indexOf('\r\n\r\n');
                const header  = buf.slice(0, hdrEnd).toString();
                const fnMatch = header.match(/filename="([^"]+)"/);
                if (!fnMatch) { res.writeHead(400); res.end('no file'); return; }
                const ext      = path.extname(fnMatch[1]) || '.mp4';
                const filename = `vid_${Date.now()}${ext}`;
                const fileStart = hdrEnd + 4;
                const fileEnd   = buf.indexOf(bBuf, fileStart);
                const fileData  = buf.slice(fileStart, fileEnd > 0 ? fileEnd : undefined);
                fs.writeFileSync(path.join(UPLOADS_DIR, filename), fileData);
                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ url: `/uploads/${filename}` }));
            } catch(e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
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
        const ct = MIME[ext] || 'text/plain';
        const canGzip = ['.js', '.html', '.css', '.json'].includes(ext)
            && (req.headers['accept-encoding'] || '').includes('gzip');

        if (canGzip) {
            if (_gzCache.has(filePath)) {
                res.writeHead(200, { 'Content-Type': ct, 'Content-Encoding': 'gzip', 'Vary': 'Accept-Encoding' });
                res.end(_gzCache.get(filePath));
                return;
            }
            zlib.gzip(content, (e, buf) => {
                if (e) { res.writeHead(200, { 'Content-Type': ct }); res.end(content); return; }
                _gzCache.set(filePath, buf);
                res.writeHead(200, { 'Content-Type': ct, 'Content-Encoding': 'gzip', 'Vary': 'Accept-Encoding' });
                res.end(buf);
            });
        } else {
            res.writeHead(200, { 'Content-Type': ct });
            res.end(content);
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ AnyRainy запущен: http://localhost:${PORT}`);
    console.log(`🎬 Прокси Kodik:    http://localhost:${PORT}/kodik-proxy`);
    console.log(`🖼  Прокси картинок: http://localhost:${PORT}/img?url=...`);
    console.log(`📺 Embed resolve:   http://localhost:${PORT}/embed-resolve?provider=aniboom&malId=...&ep=1`);
});
