// Обход DDoS-Guard через headless-Chrome (puppeteer-core + установленный Chrome).
// Держим один браузер и одну вкладку: cookie DDoS-Guard сохраняется между запросами,
// поэтому челлендж проходится один раз, дальше навигация быстрая.
const fs = require('fs');

let puppeteer = null;
try { puppeteer = require('puppeteer-core'); } catch (_) { /* не установлен */ }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const CHROME_CANDIDATES = [
    `${process.env['ProgramFiles']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['LOCALAPPDATA']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['ProgramFiles']}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
];

function findChrome() {
    for (const p of CHROME_CANDIDATES) {
        try { if (p && fs.existsSync(p)) return p; } catch (_) {}
    }
    return null;
}

let browserPromise = null;

async function getBrowser() {
    if (!puppeteer) throw new Error('puppeteer-core не установлен');
    if (browserPromise) {
        const b = await browserPromise;
        if (b && b.connected !== false) return b;
        browserPromise = null;
    }
    const exe = findChrome();
    if (!exe) throw new Error('Chrome/Edge не найден');
    browserPromise = puppeteer.launch({
        executablePath: exe,
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--no-first-run',
            '--no-default-browser-check',
            `--user-agent=${UA}`,
        ],
    });
    const browser = await browserPromise;
    browser.on('disconnected', () => { browserPromise = null; });
    return browser;
}

// Домены, для которых уже получена clearance DDoS-Guard в этом браузере
const clearedOrigins = new Set();

async function passChallenge(page, origin, timeout) {
    if (clearedOrigins.has(origin)) return;
    try {
        await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: Math.min(timeout, 15000) });
    } catch (_) { /* мог не догрузиться — проверим тело ниже */ }

    const body = await page.evaluate(() => (document.body ? document.body.innerText : ''));

    // Геоблокировка по IP (например, включён зарубежный VPN) — обойти нельзя, падаем сразу
    if (/restricted access from your current network|is not available|geoblock/i.test(body)
        || page.url().includes('geoblock')) {
        throw new Error('GEOBLOCKED: IP заблокирован сайтом (отключите VPN/WARP)');
    }

    // JS-челлендж DDoS-Guard — ждём авто-редирект на нормальную страницу
    if (/ddos-guard|checking your browser|проверка браузера/i.test(body)) {
        try {
            await page.waitForFunction(
                () => !/ddos-guard|checking your browser|проверка браузера/i.test(document.body ? document.body.innerText : ''),
                { timeout: Math.min(timeout, 15000), polling: 500 }
            );
        } catch (_) {}
    }
    clearedOrigins.add(origin);
}

// Пройти DDoS-Guard и забрать сырой ответ ресурса (HTML или JSON) изнутри страницы.
async function fetchViaBrowser(url, { timeout = 30000, xhr = false } = {}) {
    const browser = await getBrowser();
    const origin = new URL(url).origin;
    const page = await browser.newPage();
    try {
        await page.setUserAgent(UA);
        await page.setExtraHTTPHeaders({ 'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8' });

        await passChallenge(page, origin, timeout);

        // Сырой ответ через fetch внутри страницы (куки DDoS-Guard уже стоят)
        const raw = await page.evaluate(async (u, useXhr) => {
            const headers = { 'Accept': 'text/html,application/json,*/*', 'Accept-Language': 'ru-RU,ru;q=0.9' };
            if (useXhr) headers['X-Requested-With'] = 'XMLHttpRequest';
            const r = await fetch(u, { headers, credentials: 'include' });
            return await r.text();
        }, url, xhr);

        return raw;
    } finally {
        try { await page.close(); } catch (_) {}
    }
}

function isAvailable() { return !!puppeteer && !!findChrome(); }

module.exports = { fetchViaBrowser, isAvailable };
