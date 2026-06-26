// Резолвер embed-ссылок Aniboom / Sibnet через API AnimeGO (по shikimori/MAL id)
const https = require('https');
let ddgBrowser = null;
try { ddgBrowser = require('./ddg-browser'); } catch (_) { /* puppeteer не установлен */ }

const KODIK_TOKEN = '56a768d08f43091901c44b54fe970049';
const ANIMEGO_HOSTS = ['animego.org', 'animego.me'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map();

function cacheKey(provider, malId, ep) {
    return `${provider}:${malId}:${ep}`;
}

function getCached(provider, malId, ep) {
    const hit = cache.get(cacheKey(provider, malId, ep));
    if (!hit || Date.now() > hit.exp) return null;
    return hit.url;
}

function setCached(provider, malId, ep, url) {
    cache.set(cacheKey(provider, malId, ep), { url, exp: Date.now() + CACHE_TTL_MS });
}

function decodeEntities(s) {
    return String(s || '')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

function isAnimegoHost(hostname) {
    return ANIMEGO_HOSTS.some(h => hostname === h || hostname.endsWith('.' + h));
}

async function fetchText(targetUrl, timeoutMs = 18000) {
    let u;
    try { u = new URL(targetUrl); } catch (e) { throw e; }

    // AnimeGO: сначала быстрый прямой запрос; если упал (DDoS-Guard/403) —
    // откатываемся на headless-браузер, который проходит JS-челлендж.
    if (isAnimegoHost(u.hostname)) {
        try {
            return await fetchTextPlain(u, targetUrl, Math.min(timeoutMs, 3000));
        } catch (e) {
            if (ddgBrowser && ddgBrowser.isAvailable()) {
                const xhr = u.pathname.includes('/player');
                return ddgBrowser.fetchViaBrowser(targetUrl, { timeout: timeoutMs, xhr });
            }
            throw e;
        }
    }

    return fetchTextPlain(u, targetUrl, timeoutMs);
}

function fetchTextPlain(u, targetUrl, timeoutMs) {
    return new Promise((resolve, reject) => {
        const lib = u.protocol === 'http:' ? require('http') : https;
        const isAnimego = isAnimegoHost(u.hostname);
        const headers = {
            'User-Agent': UA,
            'Accept': 'text/html,application/json,*/*',
            'Accept-Language': 'ru-RU,ru;q=0.9',
            'Referer': `${u.protocol}//${u.hostname}/`,
        };
        if (isAnimego) {
            headers['X-Requested-With'] = 'XMLHttpRequest';
        }
        const req = lib.get({
            hostname: u.hostname,
            path: u.pathname + u.search,
            headers,
        }, res => {
            if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
                res.resume();
                resolve(fetchText(new URL(res.headers.location, u).toString(), timeoutMs));
                return;
            }
            let data = '';
            res.on('data', c => { data += c; });
            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 400) {
                    reject(new Error(`HTTP ${res.statusCode}`));
                    return;
                }
                resolve(data);
            });
        });
        req.on('error', reject);
        req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

async function fetchKodikMeta(malId) {
    const apiUrl = `https://kodik-api.com/search?token=${KODIK_TOKEN}&shikimori_id=${malId}&limit=1`;
    const raw = await fetchText(apiUrl, 12000);
    const data = JSON.parse(raw);
    const r = data?.results?.[0] || {};
    const titleRu = (r.title || '').replace(/\s*\[.*$/, '').trim();
    const titleEn = (r.title_orig || '').trim();
    return { titleRu, titleEn };
}

function parseSearchResults(html) {
    const items = [];
    const re = /ani-grid__item[\s\S]{0,3500}?href="\/anime\/([a-z0-9][a-z0-9-]*-(\d+))"[\s\S]{0,1200}?alt="([^"]+)"/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        items.push({ id: m[2], alt: m[3].toLowerCase() });
    }
    return items;
}

function pickSearchId(html, queries) {
    const items = parseSearchResults(html);
    if (!items.length) return null;
    const norms = queries.map(q => q.toLowerCase().trim()).filter(Boolean);
    for (const q of norms) {
        const exact = items.find(i => i.alt === q || i.alt.includes(q));
        if (exact) return exact.id;
    }
    for (const q of norms) {
        const words = q.split(/\s+/).filter(w => w.length > 2);
        if (!words.length) continue;
        const scored = items.map(i => {
            let score = 0;
            for (const w of words) if (i.alt.includes(w)) score++;
            return { id: i.id, score };
        }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
        if (scored[0]?.score >= Math.min(2, words.length)) return scored[0].id;
    }
    return items[0]?.id || null;
}

function buildSearchQueries(titleHint, kodikMeta) {
    const out = [];
    const add = (s) => {
        const q = String(s || '').replace(/\s*\[.*$/, '').trim();
        if (q && !out.includes(q)) out.push(q);
    };
    add(titleHint);
    if (kodikMeta) {
        add(kodikMeta.titleEn);
        add(kodikMeta.titleRu);
        if (kodikMeta.titleRu && kodikMeta.titleEn) {
            add(`${kodikMeta.titleRu} ${kodikMeta.titleEn}`);
        }
    }
    return out;
}

function parseEpisodeId(html, epNum) {
    const re = /data-episode-number="(\d+)"[^>]*data-episode="(\d+)"/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        if (+m[1] === epNum) return m[2];
    }
    const re2 = /data-episode="(\d+)"[^>]*data-episode-number="(\d+)"/g;
    while ((m = re2.exec(html)) !== null) {
        if (+m[2] === epNum) return m[1];
    }
    return null;
}

function normalizePlayerUrl(raw) {
    if (!raw) return null;
    let u = decodeEntities(raw.trim());
    if (u.startsWith('//')) u = 'https:' + u;
    if (u.startsWith('/')) u = 'https://video.sibnet.ru' + u;
    if (!/^https?:\/\//i.test(u)) return null;
    return u;
}

const PROVIDER_HOST_HINTS = {
    sibnet: ['sibnet.ru', 'video.sibnet'],
    aniboom: ['aniboom', 'aniboom.one', 'animego.org/aniboom', 'plapi.cn'],
    kodik: ['kodikplayer.com', 'kodik.info', 'kodik.biz'],
    cvh: ['cvh.', 'cdnvideohub', 'vibix'],
    alloha: ['alloha', 'aloha', 'yani.tv'],
    aksor: ['aksor', 'ashdi'],
};

function urlMatchesProvider(playerUrl, provider) {
    const low = playerUrl.toLowerCase();
    const hints = PROVIDER_HOST_HINTS[provider] || [provider];
    return hints.some(h => low.includes(h));
}

function parsePlayersFromVideosHtml(html, provider) {
    const urls = [];
    const re = /data-player="([^"]+)"/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const playerUrl = normalizePlayerUrl(m[1]);
        if (playerUrl) urls.push(playerUrl);
    }
    const want = provider.toLowerCase();
    const direct = urls.find(u => urlMatchesProvider(u, want));
    if (direct) return direct;

    if (want === 'aniboom') {
        return urls.find(u => {
            const low = u.toLowerCase();
            return !urlMatchesProvider(u, 'kodik')
                && !urlMatchesProvider(u, 'sibnet')
                && !low.includes('cvh.');
        }) || null;
    }
    return null;
}

async function tryHost(host, provider, malId, ep, queries) {
    let animegoId = null;
    for (const searchQuery of queries) {
        const q = encodeURIComponent(searchQuery);
        const searchHtml = await fetchText(`https://${host}/search/anime?q=${q}`);
        animegoId = pickSearchId(searchHtml, queries);
        if (animegoId) break;
    }
    if (!animegoId) return null;

    const playerRaw = await fetchText(`https://${host}/player/${animegoId}`);
    const playerJson = JSON.parse(playerRaw);
    const playerHtml = decodeEntities(playerJson?.data?.content || '');
    const episodeId = parseEpisodeId(playerHtml, ep);
    if (!episodeId) return null;

    const videosRaw = await fetchText(`https://${host}/player/videos/${episodeId}`);
    const videosJson = JSON.parse(videosRaw);
    const videosHtml = decodeEntities(videosJson?.data?.content || '');
    return parsePlayersFromVideosHtml(videosHtml, provider);
}

async function resolveEmbed(provider, malId, ep, titleHint = '') {
    const mal = String(malId || '').trim();
    const episode = Math.max(1, parseInt(ep, 10) || 1);
    if (!mal) return null;

    const cached = getCached(provider, mal, episode);
    if (cached) return cached;

    let kodikMeta = null;
    try { kodikMeta = await fetchKodikMeta(mal); } catch (_) {}
    const queries = buildSearchQueries(titleHint, kodikMeta);
    if (!queries.length) return null;

    for (const query of queries) {
        for (const host of ANIMEGO_HOSTS) {
            try {
                const url = await tryHost(host, provider, mal, episode, queries);
                if (url) {
                    setCached(provider, mal, episode, url);
                    return url;
                }
            } catch (_) {}
        }
    }
    return null;
}

module.exports = { resolveEmbed };
