// Initialize Lucide icons
lucide.createIcons();

// ─── Cookie helpers ───────────────────────────────────────────────────────────

function setCookie(name, value, days = 365) {
    const d = new Date();
    d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${encodeURIComponent(String(value))}; expires=${d.toUTCString()}; path=/; SameSite=Lax`;
}

function getCookie(name) {
    const match = document.cookie.split('; ').find(row => row.startsWith(name + '='));
    return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null;
}

function deleteCookie(name) {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
}

// ─── State ────────────────────────────────────────────────────────────────────

let currentSection = 'home';
let animeData = [];
let recommendedAnime = [];
let isSearching = false;
let searchTimeout = null;
let currentSearchController = null;
let latestSearchToken = 0;
let latestRecommendationToken = 0;
let currentCatalogPage = 1;
let currentCatalogQuery = '';
let currentCatalogMode = 'top';
let hasMoreAnime = true;
let isLoadingMore = false;
let currentSortMode = 'default';
let catalogLoadObserver = null;
let authMode = 'login';
let currentUser = null;
let selectedGenres = new Set();
let genreFilterOpen = false;
let sortPanelOpen = false;
let genreSearchQ = '';
let genreFilterMode = 'all'; // 'all' | 'any'
let commentReplyTo = null;
let currentProfileUsername = null;
let currentCatalogQueryTranslated = '';
let ongoingAnime = [];
let ongoingLoading = false;
let ongoingPagesLoaded = 1;
let ongoingLoadFailed = false;
let ongoingDataSource = '';

// Player quality state
let kodikQualityMap    = {};   // { '1080p': url, '720p': url, ... }
let kodikCurrentQuality = '';
let libriaQualityMap   = {};   // { '1080p': url, '720p': url, '480p': url, '4K ✦': url }
let libriaQualityEp    = 0;
let libriaCurrentQuality = '';
let libriaUpscale4K    = false;
let kodikUpscaleHD     = false;  // '1080p ✦' — WebGL-апскейл 720p в Kodik
// Auto-hide timers
let kodikControlsTimer  = null;
let libriaControlsTimer = null;

// Player fit mode: 'contain' | 'cover' | 'stretch'
let playerFitMode = 'contain'; // AR-коррекция шейдера; масштаб/выравнивание — playerZoom/playerStretch

// Плеер: «начать просмотр» до первого запуска; состояние перемотки
const playerPlaybackStarted = { kodik: false, libria: false };
const _seekDragging = { kodik: false, libria: false };
const _wasPlayingBeforeSeek = { kodik: false, libria: false };
const _pendingSeekPct = { kodik: null, libria: null };
const playerBufferState = {
    kodik:  { buffering: false, loadingFrag: false, speedBps: 0 },
    libria: { buffering: false, loadingFrag: false, speedBps: 0 },
};

// Home carousels (rows) — каждая категория тянет данные из Jikan
let topRowAnime = [];
let popularRowAnime = [];
const rowLoadState = { ongoing: false, top: false, popular: false };
const rowFailed = { ongoing: false, top: false, popular: false };
const ROW_LIMIT = 16;
// Текущая открытая категория в секции «Смотреть все»
let listCategory = 'top';

const PAGE_SIZE = 24;
const ONGOING_PAGE_SIZE = 16;
const AUTH_STORAGE_KEY = 'anistream_users';
const WATCH_HISTORY_KEY = 'anyrainy_watch_history';
const MAX_WATCH_HISTORY = 12;

// ─── Бэкенд: localhost локально, VPS на GitHub Pages ───────────────────────────
const BACKEND = needsKodikProxy() ? '' : 'https://v879022.hosted-by-vdsina.com';

function jikanFetch(path, signal) {
    if (BACKEND) {
        return fetch(BACKEND + '/jikan?path=' + encodeURIComponent(path), signal ? { signal } : undefined);
    }
    return fetch('/jikan?path=' + encodeURIComponent(path), signal ? { signal } : undefined);
}

// ─── localStorage-кеш деталей аниме (TTL 24ч) ─────────────────────────────────
const _LS_DETAIL_TTL = 86400000;
function _lsDetailGet(malId) {
    try {
        const raw = localStorage.getItem('ar_d_' + malId);
        if (!raw) return undefined;
        const { d, t } = JSON.parse(raw);
        if (Date.now() - t > _LS_DETAIL_TTL) { localStorage.removeItem('ar_d_' + malId); return undefined; }
        return d;
    } catch (_) { return undefined; }
}
function _lsDetailSet(malId, detail) {
    try { localStorage.setItem('ar_d_' + malId, JSON.stringify({ d: detail, t: Date.now() })); } catch (_) {}
}

// Language: stored in cookie, default RU
let currentLang = getCookie('anyrainy_lang') || 'ru';
let TRANSLATE_TO = currentLang === 'en' ? null : currentLang;

const synopsisCache = {};

// ─── Прокси картинок (обход DPI-блокировки CDN постеров в РФ) ─────────────────
// Постеры с MAL/Shikimori/AniLibria часто не грузятся в браузере без VPN,
// но локальный Node-сервер их скачивает. Проксируем через /img.
const IMG_PROXY_HOSTS = /(myanimelist\.net|shikimori\.(one|io)|anilibria\.(top|tv)|kodikres\.com|kodik\.biz|images\.unsplash\.com)/i;

function proxyImg(rawUrl) {
    if (!rawUrl) return '';
    let url = String(rawUrl);
    if (url.startsWith('//')) url = 'https:' + url;
    if (url.startsWith('data:') || url.includes('/img?url=')) return url;
    if (IMG_PROXY_HOSTS.test(url)) {
        if (needsKodikProxy()) return `/img?url=${encodeURIComponent(url)}`;
        if (BACKEND) return `${BACKEND}/img?url=${encodeURIComponent(url)}`;
        return `https://wsrv.nl/?url=${encodeURIComponent(url)}`;
    }
    return url;
}

function imgFallback(img) {
    img.onerror = null;
    img.style.visibility = 'hidden';
}

// ─── Escape HTML ──────────────────────────────────────────────────────────────

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ─── Toasts ───────────────────────────────────────────────────────────────────

let toastTimer = null;

function showToast(message, type = 'default') {
    const root = document.getElementById('toast-root');
    if (!root || !message) return;
    clearTimeout(toastTimer);
    root.innerHTML = `
        <div class="toast toast--${type}" role="status">
            <span class="toast-icon">${type === 'success' ? '✓' : type === 'error' ? '!' : '☁'}</span>
            <span class="toast-msg">${escapeHtml(message)}</span>
        </div>`;
    root.classList.add('toast-root--visible');
    toastTimer = setTimeout(() => {
        root.classList.remove('toast-root--visible');
        setTimeout(() => { if (root) root.innerHTML = ''; }, 320);
    }, 2800);
}

// ─── Watch history ────────────────────────────────────────────────────────────

function getWatchHistory() {
    try { return JSON.parse(localStorage.getItem(WATCH_HISTORY_KEY) || '[]'); }
    catch (_) { return []; }
}

function saveWatchProgress(anime, episodeOverride) {
    if (!anime?.id) return;
    const server = getActiveServers()[currentServerIndex];
    const tr = currentKodikTranslations[currentKodikTranslationIdx];
    let position = 0;
    const playerType = server?.type;
    if (playerType === 'kodik') {
        position = document.getElementById('kodik-video')?.currentTime || 0;
    } else if (playerType === 'libria') {
        position = document.getElementById('libria-video')?.currentTime || 0;
    }

    const entry = {
        id: anime.id,
        malId: anime.malId,
        title: anime.title,
        titleRu: anime.titleRu,
        titleEn: anime.titleEn,
        displayTitle: anime.displayTitle,
        image: anime.image,
        rating: anime.rating,
        year: anime.year || null,
        episodes: anime.episodes,
        episode: episodeOverride ?? currentEpisodeNum,
        serverIndex: currentServerIndex,
        serverType: server?.key || server?.type || 'kodik',
        serverName: server?.name || '',
        kodikTranslationIdx: currentKodikTranslationIdx,
        kodikTranslationTitle: tr?.title || '',
        libriaQuality: libriaCurrentQuality || '',
        kodikQuality: kodikCurrentQuality || '',
        position: Math.max(0, Math.floor(position)),
        watchedAt: Date.now(),
    };
    const list = getWatchHistory().filter(h => h.id !== anime.id);
    list.unshift(entry);
    localStorage.setItem(WATCH_HISTORY_KEY, JSON.stringify(list.slice(0, MAX_WATCH_HISTORY)));
}

let watchProgressSaveTimer = null;
function scheduleWatchProgressSave() {
    clearTimeout(watchProgressSaveTimer);
    watchProgressSaveTimer = setTimeout(() => {
        if (currentAnime && currentSection === 'watch') saveWatchProgress(currentAnime);
    }, 4000);
}

function clampResumeServerIndex(idx, serverType) {
    const servers = getActiveServers();
    if (typeof idx === 'number' && idx >= 0 && idx < servers.length) {
        if (!serverType || servers[idx]?.type === serverType || servers[idx]?.key === serverType) return idx;
    }
    if (serverType) {
        const found = servers.findIndex(s => s.type === serverType || s.key === serverType);
        if (found >= 0) return found;
    }
    return typeof idx === 'number' && idx >= 0 && idx < servers.length ? idx : 0;
}

function applySavedKodikVoice(resume) {
    if (!resume || !currentKodikTranslations.length) return;
    let idx = -1;
    if (resume.kodikTranslationTitle) {
        idx = currentKodikTranslations.findIndex(t => t.title === resume.kodikTranslationTitle);
    }
    if (idx < 0 && resume.kodikTranslationIdx != null) {
        idx = resume.kodikTranslationIdx;
    }
    if (idx >= 0 && idx < currentKodikTranslations.length) {
        currentKodikTranslationIdx = idx;
    }
    ensureKodikTranslationForPlayer();
}

function applyResumePosition(prefix) {
    const pos = window._resumePosition;
    if (!pos || pos <= 0) return;
    window._resumePosition = null;
    const videoEl = getPlayerVideo(prefix);
    if (!videoEl) return;
    const apply = () => seekVideoTo(prefix, videoEl, pos);
    if (videoEl.readyState >= 1 && videoEl.duration) apply();
    else videoEl.addEventListener('loadedmetadata', apply, { once: true });
}

function clearWatchHistory() {
    localStorage.removeItem(WATCH_HISTORY_KEY);
    renderContinueWatching();
    showToast(t('toast_history_cleared'));
}

function getContinueDisplayTitle(entry) {
    if (currentLang === 'en') return entry.titleEn || entry.title || entry.displayTitle;
    const cached = entry.malId ? getCachedRuTitle(entry.malId) : null;
    return cached || entry.titleRu || entry.displayTitle || entry.title;
}

function renderContinueCards(items) {
    return items.map(entry => {
        const title = getContinueDisplayTitle(entry);
        const total = entry.episodes || entry.episode || 1;
        const pct = Math.min(100, Math.round((entry.episode / total) * 100));
        const epLabel = t('continue_ep', entry.episode);
        return `
        <article class="ongoing-card anim-item cursor-pointer group" onclick="resumeWatch(${entry.id})">
            <div class="relative aspect-[3/4] overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800 mb-2.5">
                <img src="${proxyImg(entry.image)}" alt="${escapeHtml(title)}"
                     class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                     loading="lazy" onerror="imgFallback(this)">
                <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none"></div>
                <div class="absolute top-2 left-2 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-white text-[10px] font-bold tracking-wide shadow-lg" style="background:rgba(255,90,95,0.92);backdrop-filter:blur(6px)">
                    <span class="w-1.5 h-1.5 rounded-full bg-white" style="animation:pulse 1.8s infinite"></span>
                    ${escapeHtml(t('franchise_current'))}
                </div>
                <div class="absolute bottom-3 left-2 right-2 flex items-center justify-between">
                    <span class="px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-white text-[11px] font-semibold">${escapeHtml(epLabel)}</span>
                    ${entry.year ? `<span class="px-2 py-0.5 rounded-md bg-black/50 backdrop-blur-sm text-white/80 text-[11px] font-medium">${entry.year}</span>` : ''}
                </div>
                <div class="absolute bottom-0 inset-x-0 h-1 bg-black/40">
                    <div class="h-full bg-airbnb transition-all duration-500" style="width:${pct}%"></div>
                </div>
            </div>
            <h3 data-title-id="${entry.id}" class="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2 leading-snug min-h-[2.5rem]">${escapeHtml(title)}</h3>
        </article>`;
    }).join('');
}

function renderContinueWatching() {
    const section = document.getElementById('continue-section');
    const track = document.getElementById('continue-track');
    if (!section || !track) return;
    const items = getWatchHistory();
    if (!items.length) {
        section.classList.add('hidden');
        track.innerHTML = '';
        return;
    }
    section.classList.remove('hidden');
    track.innerHTML = renderContinueCards(items);
    lucide.createIcons();
    staggerAnimItems(track);
    if (currentLang === 'ru') enrichWithRussianTitles(items);
}

async function resumeWatch(id) {
    const entry = getWatchHistory().find(h => h.id === id);
    if (!entry) return;
    if (!findAnimeById(id)) {
        animeData.push({
            id: entry.id,
            malId: entry.malId,
            title: entry.title,
            titleRu: entry.titleRu,
            titleEn: entry.titleEn,
            displayTitle: entry.displayTitle,
            image: entry.image,
            rating: entry.rating,
            episodes: entry.episodes,
            tags: [],
        });
    }
    await watchAnime(id, { resume: entry });
}

function copyAnimeLink() {
    if (!currentAnime?.malId) return;
    const url = `${location.origin}${location.pathname}#${String(currentAnime.malId).padStart(9, '0')}`;
    const done = () => showToast(t('toast_link_copied'), 'success');
    const fail = () => showToast(t('toast_copy_failed'), 'error');
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(url).then(done).catch(fail);
    } else {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy') ? done() : fail(); } catch (_) { fail(); }
        ta.remove();
    }
}

function isTypingTarget() {
    const el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

function focusSearchInput() {
    const navInput = document.getElementById('nav-search-input');
    const bigInput = document.getElementById('big-search-input');
    if (currentSection === 'home' && bigInput) {
        bigInput.focus();
        bigInput.select();
    } else if (navInput) {
        navInput.focus();
        navInput.select();
    } else {
        openMobileSearch();
        setTimeout(() => document.getElementById('mobile-search-input')?.focus(), 80);
    }
}

function selectAdjacentEpisode(delta) {
    if (!currentAnime) return;
    const epNums = currentKodikEpisodeNums.length
        ? currentKodikEpisodeNums
        : Array.from({ length: currentAnime.episodes || 1 }, (_, i) => i + 1);
    const idx = epNums.indexOf(currentEpisodeNum);
    const next = idx >= 0 ? epNums[idx + delta] : null;
    if (next) selectEpisode(next);
}

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (document.getElementById('franchise-modal')?.classList.contains('is-open')) closeFranchiseModal();
            else if (document.getElementById('youtube-modal')?.classList.contains('is-open')) closeYoutubeModal();
            else if (!document.getElementById('auth-modal')?.classList.contains('hidden')) closeAuthModal();
            else if (!document.getElementById('favorites-modal')?.classList.contains('hidden')) closeFavorites();
            else if (!document.getElementById('admin-panel-modal')?.classList.contains('hidden')) closeAdminModal();
            else if (!document.getElementById('mobile-search-overlay')?.classList.contains('hidden')) closeMobileSearch();
            return;
        }
        if (e.key === '/' && !isTypingTarget()) {
            e.preventDefault();
            focusSearchInput();
            return;
        }
        if (handleWatchPlayerKeys(e)) return;
        if (currentSection !== 'watch' || !currentAnime || isTypingTarget()) return;
        if (e.key === '[') { e.preventDefault(); selectAdjacentEpisode(-1); }
        if (e.key === ']') { e.preventDefault(); selectAdjacentEpisode(1); }
    });
}

function getActivePlayerPrefix() {
    const type = getActiveServers()[currentServerIndex]?.type;
    if (type === 'kodik') return 'kodik';
    if (type === 'libria') return 'libria';
    return null;
}

function handleWatchPlayerKeys(e) {
    if (currentSection !== 'watch' || isTypingTarget()) return false;
    const prefix = getActivePlayerPrefix();
    if (!prefix) return false;
    const videoEl = getPlayerVideo(prefix);
    if (!videoEl) return false;
    if (prefix === 'kodik') {
        const el = document.getElementById('kodik-video');
        if (!el || el.classList.contains('hidden')) return false;
    }
    const playerRoot = document.getElementById(prefix === 'kodik' ? 'kodik-direct-player' : 'libria-player');
    if (e.ctrlKey || e.altKey || e.metaKey) return false;
    const code = e.code;

    // Перемотка: ← / J  и  → / L
    if (code === 'ArrowLeft' || code === 'KeyJ') {
        e.preventDefault();
        seekVideoByDelta(prefix, videoEl, -10);
        showSeekOverlay(playerRoot, 'left', -10);
        return true;
    }
    if (code === 'ArrowRight' || code === 'KeyL') {
        e.preventDefault();
        seekVideoByDelta(prefix, videoEl, 10);
        showSeekOverlay(playerRoot, 'right', 10);
        return true;
    }
    // Пауза/воспроизведение: пробел / K
    if (code === 'Space' || code === 'KeyK') {
        e.preventDefault();
        if (prefix === 'kodik') toggleKodikPlay(); else toggleLibriaPlay();
        return true;
    }
    // Громкость: ↑ / ↓
    if (code === 'ArrowUp' || code === 'ArrowDown') {
        e.preventDefault();
        const nv = playerAdjustVolume(prefix, videoEl, code === 'ArrowUp' ? 0.1 : -0.1);
        flashPlayerHint(playerRoot, `<i data-lucide="${nv === 0 ? 'volume-x' : 'volume-2'}" style="width:20px;height:20px"></i><b>${Math.round(nv * 100)}%</b>`);
        return true;
    }
    // Без звука: M
    if (code === 'KeyM') {
        e.preventDefault();
        if (prefix === 'kodik') toggleKodikMute(); else toggleLibriaMute();
        flashPlayerHint(playerRoot, `<i data-lucide="${videoEl.muted ? 'volume-x' : 'volume-2'}" style="width:22px;height:22px"></i>`);
        return true;
    }
    // Полноэкранный режим: F
    if (code === 'KeyF') {
        e.preventDefault();
        if (prefix === 'kodik') toggleKodikFullscreen(); else toggleLibriaFullscreen();
        return true;
    }
    // Цифры 0–9 → переход к проценту длительности
    if (/^Digit[0-9]$/.test(code) && isFinite(videoEl.duration) && videoEl.duration > 0) {
        e.preventDefault();
        const pct = parseInt(code.slice(5), 10) / 10;
        seekVideoTo(prefix, videoEl, videoEl.duration * pct);
        if (!playerPlaybackStarted[prefix]) showStartWatchOverlay(prefix);
        return true;
    }
    return false;
}

// Изменить громкость активного плеера на delta, вернуть новое значение
function playerAdjustVolume(prefix, videoEl, delta) {
    const nv = Math.min(1, Math.max(0, (videoEl.volume || 0) + delta));
    if (prefix === 'kodik') setKodikVolume(nv); else setLibriaVolume(nv);
    const slider = document.getElementById(`${prefix}-vol-slider`);
    if (slider) slider.value = nv;
    return nv;
}

// Короткая всплывающая подсказка по центру плеера (громкость, mute и т.п.)
function flashPlayerHint(parent, html) {
    if (!parent) return;
    let el = parent.querySelector('.player-key-hint');
    if (!el) {
        el = document.createElement('div');
        el.className = 'player-key-hint';
        parent.appendChild(el);
    }
    el.innerHTML = html;
    lucide.createIcons();
    el.style.opacity = '1';
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => { el.style.opacity = '0'; }, 650);
}

// ─── Translations ─────────────────────────────────────────────────────────────

const STRINGS = {
    ru: {
        catalog: 'Каталог', home_nav: 'Главная', favorites_nav: 'Избранное', login_btn: 'Войти',
        hero_title: 'Откройте для себя<br><span class="text-airbnb">мир аниме</span>',
        hero_subtitle: 'Смотрите лучшие аниме-сериалы. Без лишнего шума, только контент.',
        search_label: 'Поиск', search_placeholder: 'Название аниме...',
        nav_search_placeholder: 'Найти аниме...', mobile_search_placeholder: 'Найти аниме...',
        mobile_search_hint: 'Введи название и нажми', mobile_search_hint_btn: 'Поиск',
        genres_btn: 'Жанры',
        sort_label: 'Сортировка', sort_default: 'По умолчанию', sort_rating: 'По рейтингу', sort_title: 'По названию',
        popular_now: 'Популярное сейчас', catalog_desc: 'Подборка аниме из базы MyAnimeList',
        ongoing_title: 'Онгоинги', ongoing_sub_libria: 'Сейчас выходит · AniLibria',
        ongoing_sub_mal: 'Сейчас выходит · MyAnimeList',
        ongoing_see_all: 'Смотреть все', ongoing_loading: 'Загрузка...',
        ongoing_error: 'Не удалось загрузить онгоинги', ongoing_empty: 'Нет онгоингов',
        ongoing_retry: 'Повторить', ongoing_no_match: 'Не нашли это аниме для просмотра',
        hero_badge: 'Уютный кинозал AnyRainy',
        hero_slogan: 'Завари чай, накройся пледом и смотри любимое аниме под шум дождя — тепло, уютно и без лишнего шума.',
        hero_open_catalog: 'Открыть каталог', hero_random: 'Случайное аниме',
        cat_top_title: 'Лучшее за всё время', cat_top_sub: 'Топ по оценкам · MyAnimeList',
        cat_popular_title: 'Популярное у зрителей', cat_popular_sub: 'Что сейчас смотрят чаще всего',
        view_all: 'Смотреть все', back_home: 'На главную',
        ad_placeholder: 'Место для рекламы · 728×90 / 320×50',
        catalog_full_title: 'Весь каталог', catalog_full_desc: 'Все аниме из базы MyAnimeList',
        catalog_cta_sub: 'Это ещё не всё — в базе тысячи тайтлов', catalog_cta_btn: 'Посмотреть весь каталог',
        kind_tv: 'ТВ Сериал', kind_movie: 'Фильм', kind_ova: 'OVA', kind_ona: 'ONA',
        kind_special: 'Спешл', kind_music: 'Клип',
        recommendations_title: 'Можно ещё посмотреть', recommendations_desc: 'Несколько рекомендаций, если нужный тайтл не подошёл',
        episodes_count: n => `${n} эпизодов`, nothing_found: 'Ничего не найдено...', no_recommendations: 'Пока нет рекомендаций.',
        load_more_loading: 'Загружаем ещё аниме...', load_more_scroll: 'Листай ниже, новые аниме загрузятся автоматически',
        source_search: 'Результаты из базы MyAnimeList', source_top: 'Каталог из базы MyAnimeList', no_more: 'Больше результатов нет.',
        popular_now_label: 'Популярное сейчас', by_rating_label: 'По рейтингу', by_title_label: 'По названию А-Я',
        search_results_label: q => `Результаты поиска: ${q}`, searching_label: q => `Ищем: ${q}`,
        search_found_label: q => `Найдено по запросу: ${q}`, search_results_sub: 'Результаты поиска, ниже — рекомендации',
        search_min_chars: 'Введите хотя бы 2 символа', search_error: 'Не удалось выполнить поиск',
        back_to_catalog: 'Назад к каталогу', watching: 'Просмотр',         episode_select: n => `Серия ${n}`,
        episode_label: 'Серия',
        episodes_inside_player: 'Выбор серий — внутри плеера',
        related_title: 'Другие части и связанное',
        related_sub: 'Сезоны, спин-оффы и фильмы франшизы',
        watching_now: 'Вы смотрите',
        music_video_badge: 'Клип',
        franchise_btn: 'Подробнее о франшизе', franchise_btn_short: 'Франшиза',
        franchise_title: 'О франшизе', franchise_loading: 'Собираем франшизу…',
        franchise_count: n => `${n} тайтлов · в хронологическом порядке`,
        franchise_watch: 'Смотреть', franchise_current: 'сейчас смотрите',
        franchise_fullpage_btn: 'Посмотреть подробнее',
        franchise_count_short: n => `${n} частей`, franchise_since: 'с',
        franchise_chronology: 'Хронология франшизы', franchise_similar: 'Похожие франшизы',
        franchise_comments: 'Обсуждение франшизы',
        franchise_extras: 'Дополнительные материалы',
        franchises_nav: 'Франшизы', franchises_title: 'Франшизы',
        franchises_sub: 'Большие вселенные аниме — по порядку и с описанием',
        favorites_view_all: 'Посмотреть все', favorites_count: n => `${n} в избранном`,
        admin_picks_title: 'Советы от админки',
        admin_picks_sub: 'п-привет… я нечасто с кем-то делюсь, но это мои самые-самые любимые… т-только не смейся, ладно?..',
        season_n: n => `Сезон ${n}`,
        ep_meta_title: t => `Название: ${t}`,
        show_more_episodes: 'Показать все серии',
        show_less_episodes: 'Свернуть',
        watch_page_title: t => `Смотреть аниме «${t}» онлайн`,
        episodes_panel: 'Серии', voice_panel: 'Озвучка', server_panel: 'Плеер',
        watch_layout_label: 'Расположение',
        watch_layout_horizontal: 'Горизонтально',
        watch_layout_vertical: 'Вертикально',
        voice_anilibria: 'AniLibria', voice_sub: 'Субтитры', voice_dub: 'Озвучка',
        quality_panel: 'Качество', picker_menu_title: 'Настройки', picker_current_ep: n => `Серия ${n}`,
        player_source_label: 'Источник', voice_search_placeholder: 'Поиск студии...',
        ep_badge_label: n => `Эпизод ${n}`, quality_auto: 'Авто',
        open_in_browser: 'В браузере', rating_badge: r => `Рейтинг ${r}`, ep_badge: n => `${n} эп.`,
        info_rating: 'Рейтинг', info_episodes: 'Серий', info_year: 'Год', info_status: 'Статус',
        info_type: 'Тип', info_genres: 'Жанры',
        info_read_more: 'Читать далее', info_collapse: 'Свернуть',
        status_airing: 'Онгоинг', status_finished: 'Завершено', status_upcoming: 'Анонс',
        in_favorites: 'В избранном', to_favorites: 'В избранное', anime_loading: 'Загрузка аниме...',
        kodik_unavailable: 'Kodik недоступен', kodik_unavailable_sub: 'Русская озвучка не найдена для этого аниме.<br>Попробуй Megaplay.',
        player_error_title: 'Плеер не загрузился', player_error_sub: 'Попробуй другой сервер или открой напрямую',
        next_server: 'Следующий сервер', reload_player_btn: 'Перезагрузить',
        newtab_notice: 'Этот плеер нельзя встроить в страницу', newtab_open_btn: 'Открыть JutSu',
        studios_nav: 'Студии', studios_title: 'Аниме-студии', studios_sub: 'Работы по производящей студии',
        studios_search: 'Поиск студии...', studios_anime_count: n => `${n} аниме`,
        studios_no_data: 'Студии не найдены — сначала загрузи каталог или главную страницу',
        studio_back: 'Все студии',
        comments_title: 'Комментарии', comments_subtitle: 'Отзывы зрителей об этом аниме',
        no_comments: 'Пока нет комментариев. Будь первым.',
        comment_placeholder: 'Поделись впечатлением об этом аниме...',
        comment_writing_as: u => `Пишешь как ${u}`, comment_submit: 'Отправить комментарий',
        comment_delete: 'Удалить', comment_login_title: 'Хочешь оставить комментарий?',
        comment_login_sub: 'Войди или создай локальный аккаунт.', comment_login_btn: 'Войти / Регистрация',
        comment_too_short: 'Комментарий слишком короткий.',
        account_title: 'Аккаунт', account_subtitle: 'Локальная регистрация для комментариев',
        auth_tab_login: 'Вход', auth_tab_register: 'Регистрация',
        username_label: 'Имя пользователя', username_placeholder: 'Например, Sora',
        password_label: 'Пароль', password_placeholder: 'Минимум 4 символа',
        auth_status_default: 'Войди или создай аккаунт, чтобы писать комментарии.',
        auth_status_login: 'Войди, чтобы писать комментарии под аниме.',
        auth_status_register: 'Создай аккаунт, чтобы писать комментарии под аниме.',
        auth_submit: 'Продолжить', username_short: 'Имя пользователя должно быть не короче 3 символов.',
        password_short: 'Пароль должен быть не короче 4 символов.', user_exists: 'Такой пользователь уже существует.',
        wrong_credentials: 'Неверное имя пользователя или пароль.',
        profile_bio_label: 'О себе', profile_bio_placeholder: 'Расскажи немного о себе...',
        save_profile: 'Сохранить профиль', profile_saved: 'Сохранено!', in_system: 'В системе', logout: 'Выйти',
        favorites_title: 'Избранное', favorites_sub: 'Сохранённые аниме',
        favorites_guest_msg: 'Войди в аккаунт, чтобы сохранять избранное', favorites_login_btn: 'Войти',
        no_favorites: 'Нет избранных аниме.<br>Нажми <span class="text-airbnb font-semibold">♡</span> на карточке, чтобы добавить.',
        admin_panel_title: 'Панель управления', admin_panel_sub: 'Только для администратора',
        admin_tab_stats: 'Статистика', admin_tab_data: 'Данные',
        admin_secret_label: 'Панель администратора', admin_password_placeholder: 'Пароль администратора',
        admin_login_btn: 'Войти в панель', admin_wrong_password: 'Неверный пароль',
        mob_home: 'Главная', mob_catalog: 'Каталог', mob_search: 'Поиск', mob_profile: 'Профиль',
        add_to_fav: 'В избранное', remove_from_fav: 'Убрать из избранного',
        email_label: 'Email', email_placeholder: 'example@mail.com',
        verify_btn: 'Подтвердить', verify_code_btn: 'Проверить',
        email_verified_text: 'Email подтверждён',
        forgot_password_link: 'Забыли пароль?',
        back_to_login_btn: 'Назад ко входу',
        forgot_title: 'Восстановление пароля',
        reset_email_label: 'Email от аккаунта',
        reset_send_btn: 'Отправить код',
        reset_code_label: 'Код из письма',
        reset_new_pass_label: 'Новый пароль',
        reset_save_btn: 'Сохранить пароль',
        reset_status_default: 'Введи email, на который зарегистрирован аккаунт.',
        login_username_label: 'Логин или email',
        login_username_placeholder: 'Логин или email',
        genre_filter_all: 'Все выбранные',
        genre_filter_any: 'Хотя бы один',
        comment_reply: 'Ответить',
        comment_reply_to: u => `Ответ для @${u}`,
        profile_settings_title: 'Настройки профиля',
        profile_hide_favorites: 'Скрыть избранное от других',
        profile_save_settings: 'Сохранить',
        profile_change_password: 'Смена пароля',
        profile_current_password: 'Текущий пароль',
        profile_new_password: 'Новый пароль',
        profile_confirm_password: 'Подтвердить пароль',
        profile_password_changed: 'Пароль изменён!',
        profile_wrong_password: 'Неверный текущий пароль.',
        profile_passwords_mismatch: 'Пароли не совпадают.',
        profile_password_short: 'Минимум 4 символа.',
        profile_favorites_hidden: 'Пользователь скрыл избранное',
        profile_no_comments: 'Нет комментариев',
        profile_comments_title: 'История комментариев',
        profile_not_found: 'Профиль не найден',
        profile_loading: 'Загрузка профиля...',
        open_profile: 'Перейти в профиль',
        speed_label: 'Скорость',
        player_loading: 'Загрузка контента...',
        buffer_loading: 'Загрузка',
        buffer_low: 'Мало буфера',
        buffer_ahead: s => `+${s}с буфер`,
        buffer_full: 'Полностью загружено',
        libria_not_found: 'AniLibria: аниме не найдено',
        libria_try_other: 'Попробуй другой сервер',
        email_valid_error: 'Введи корректный email.',
        email_already_taken: 'Этот email уже зарегистрирован.',
        code_expired: 'Код истёк. Запроси новый.',
        code_wrong: 'Неверный код. Попробуй ещё раз.',
        confirm_email_first: 'Подтверди email перед регистрацией.',
        login_enter_required: 'Введи логин или email.',
        reset_not_found: 'Аккаунт с этим email не найден.',
        reset_code_sent: 'Код отправлен! Проверь почту.',
        reset_code_correct: 'Код верный! Введи новый пароль.',
        reset_code_invalid: 'Неверный код.',
        reset_done: 'Пароль успешно изменён! Входи.',
        user_not_found_err: 'Пользователь не найден.',
        error_prefix: msg => `Ошибка: ${msg}`,
        genre_search_placeholder: 'Найти другие метки',
        genre_show_more: n => `Показать ещё ${n}...`,
        genre_loading: 'Загрузка жанров...',
        admin_stats_title: 'Статистика сайта',
        admin_comments_count: 'Комментариев',
        admin_reviewed_anime: 'Аниме с отзывами',
        admin_users_count: 'Пользователей',
        admin_cached_anime: 'Аниме в кэше',
        admin_cached_sub: 'Загружено из MyAnimeList',
        admin_clear_confirm: 'Удалить все комментарии? Действие необратимо.',
        admin_cleared: 'Все комментарии удалены.',
        admin_imported: 'Данные успешно импортированы.',
        admin_import_err: 'Ошибка: неверный формат файла.',
        admin_manage_title: 'Управление данными',
        admin_manage_sub: 'Все данные хранятся локально в браузере',
        admin_tab_clear: 'Удалить комментарии',
        admin_tab_export: 'Экспорт (JSON)',
        admin_tab_import: 'Импорт (JSON)',
        admin_lang_title: 'Язык синопсисов',
        admin_lang_auto: 'Определяется автоматически',
        adult_badge: '18+',
        adult_badge_title: 'Контент для взрослых',
        comment_like: 'Нравится',
        profile_logout: 'Выйти из аккаунта',
        start_watch: 'Начать просмотр',
        start_watch_hint: 'Перемотай и нажми, когда будешь готов',
        continue_title: 'Продолжить просмотр',
        continue_sub: 'С того места, где остановился',
        continue_ep: n => `Серия ${n}`,
        continue_clear: 'Очистить',
        share_link: 'Ссылка',
        toast_fav_added: 'Добавлено в избранное ♡',
        toast_fav_removed: 'Убрано из избранного',
        toast_comment_sent: 'Комментарий опубликован',
        toast_link_copied: 'Ссылка скопирована',
        toast_copy_failed: 'Не удалось скопировать',
        toast_history_cleared: 'История просмотра очищена',
        hentai_player_note: '18+ · Плеер HentaiPlay (MegaPlay)',
    },
    en: {
        catalog: 'Catalog', home_nav: 'Home', favorites_nav: 'Favorites', login_btn: 'Sign in',
        hero_title: 'Discover the<br><span class="text-airbnb">world of anime</span>',
        hero_subtitle: 'Watch the best anime series. No noise, just content.',
        search_label: 'Search', search_placeholder: 'Anime title...',
        nav_search_placeholder: 'Find anime...', mobile_search_placeholder: 'Find anime...',
        mobile_search_hint: 'Type a title and press', mobile_search_hint_btn: 'Search',
        genres_btn: 'Genres',
        sort_label: 'Sort', sort_default: 'Default', sort_rating: 'By rating', sort_title: 'By title',
        popular_now: 'Popular now', catalog_desc: 'Anime collection from MyAnimeList',
        ongoing_title: 'Ongoing', ongoing_sub_libria: 'Currently airing · AniLibria',
        ongoing_sub_mal: 'Currently airing · MyAnimeList',
        ongoing_see_all: 'See all', ongoing_loading: 'Loading...',
        ongoing_error: 'Failed to load ongoing anime', ongoing_empty: 'No ongoing titles',
        ongoing_retry: 'Retry', ongoing_no_match: 'Could not find this anime to watch',
        hero_badge: 'AnyRainy — your cozy theater',
        hero_slogan: 'Brew some tea, grab a blanket and enjoy your favorite anime to the sound of rain — warm, cozy and clutter-free.',
        hero_open_catalog: 'Open catalog', hero_random: 'Random anime',
        cat_top_title: 'Best of all time', cat_top_sub: 'Top rated · MyAnimeList',
        cat_popular_title: 'Most popular', cat_popular_sub: 'What everyone is watching now',
        view_all: 'See all', back_home: 'Back home',
        ad_placeholder: 'Ad space · 728×90 / 320×50',
        catalog_full_title: 'Full catalog', catalog_full_desc: 'All anime from MyAnimeList database',
        catalog_cta_sub: 'There\'s more — thousands of titles in the database', catalog_cta_btn: 'Browse full catalog',
        kind_tv: 'TV Series', kind_movie: 'Movie', kind_ova: 'OVA', kind_ona: 'ONA',
        kind_special: 'Special', kind_music: 'Music',
        recommendations_title: 'You might also like', recommendations_desc: 'A few recommendations if the title wasn\'t right',
        episodes_count: n => `${n} episodes`, nothing_found: 'Nothing found...', no_recommendations: 'No recommendations yet.',
        load_more_loading: 'Loading more anime...', load_more_scroll: 'Scroll down to auto-load more',
        source_search: 'Results from MyAnimeList', source_top: 'Catalog from MyAnimeList', no_more: 'No more results.',
        popular_now_label: 'Popular now', by_rating_label: 'By rating', by_title_label: 'By title A-Z',
        search_results_label: q => `Search results: ${q}`, searching_label: q => `Searching: ${q}`,
        search_found_label: q => `Found for: ${q}`, search_results_sub: 'Search results, recommendations below',
        search_min_chars: 'Enter at least 2 characters', search_error: 'Search failed',
        back_to_catalog: 'Back to catalog', watching: 'Watching',         episode_select: n => `Episode ${n}`,
        episode_label: 'Episode',
        episodes_inside_player: 'Episode selection is inside the player',
        related_title: 'Other parts & related',
        related_sub: 'Seasons, spin-offs and franchise movies',
        watching_now: 'Watching now',
        music_video_badge: 'Music video',
        franchise_btn: 'About the franchise', franchise_btn_short: 'Franchise',
        franchise_title: 'About the franchise', franchise_loading: 'Building franchise…',
        franchise_count: n => `${n} titles · in chronological order`,
        franchise_watch: 'Watch', franchise_current: 'now watching',
        franchise_fullpage_btn: 'View details',
        franchise_count_short: n => `${n} parts`, franchise_since: 'since',
        franchise_chronology: 'Franchise timeline', franchise_similar: 'Similar franchises',
        franchise_comments: 'Franchise discussion',
        franchise_extras: 'Bonus materials',
        franchises_nav: 'Franchises', franchises_title: 'Franchises',
        franchises_sub: 'Big anime universes — in order with descriptions',
        favorites_view_all: 'View all', favorites_count: n => `${n} in favorites`,
        admin_picks_title: "Admin's picks",
        admin_picks_sub: "h-hi… i don't really share this with anyone, but these are my very favorites… p-please don't laugh, okay?..",
        season_n: n => `Season ${n}`,
        ep_meta_title: t => `Title: ${t}`,
        show_more_episodes: 'Show all episodes',
        show_less_episodes: 'Collapse',
        watch_page_title: t => `Watch «${t}» online`,
        episodes_panel: 'Episodes', voice_panel: 'Voice track', server_panel: 'Player',
        watch_layout_label: 'Layout',
        watch_layout_horizontal: 'Horizontal',
        watch_layout_vertical: 'Vertical',
        voice_anilibria: 'AniLibria', voice_sub: 'Subtitles', voice_dub: 'Dub',
        quality_panel: 'Quality', picker_menu_title: 'Settings', picker_current_ep: n => `Ep. ${n}`,
        player_source_label: 'Source', voice_search_placeholder: 'Search studio...',
        ep_badge_label: n => `Episode ${n}`, quality_auto: 'Auto',
        open_in_browser: 'In browser', rating_badge: r => `Rating ${r}`, ep_badge: n => `${n} ep.`,
        info_rating: 'Rating', info_episodes: 'Episodes', info_year: 'Year', info_status: 'Status',
        info_type: 'Type', info_genres: 'Genres',
        info_read_more: 'Read more', info_collapse: 'Collapse',
        status_airing: 'Airing', status_finished: 'Finished', status_upcoming: 'Upcoming',
        in_favorites: 'In favorites', to_favorites: 'Add to favorites', anime_loading: 'Loading anime...',
        kodik_unavailable: 'Kodik unavailable', kodik_unavailable_sub: 'Russian dub not found for this anime.<br>Try Megaplay.',
        player_error_title: 'Player failed to load', player_error_sub: 'Try another server or open directly',
        next_server: 'Next server', reload_player_btn: 'Reload',
        newtab_notice: 'This player cannot be embedded', newtab_open_btn: 'Open JutSu',
        studios_nav: 'Studios', studios_title: 'Anime studios', studios_sub: 'Works by production studio',
        studios_search: 'Search studio...', studios_anime_count: n => `${n} anime`,
        studios_no_data: 'No studios found — load the catalog or home page first',
        studio_back: 'All studios',
        comments_title: 'Comments', comments_subtitle: 'Viewer reviews for this anime',
        no_comments: 'No comments yet. Be the first.',
        comment_placeholder: 'Share your thoughts about this anime...',
        comment_writing_as: u => `Commenting as ${u}`, comment_submit: 'Post comment',
        comment_delete: 'Delete', comment_login_title: 'Want to leave a comment?',
        comment_login_sub: 'Sign in or create a local account.', comment_login_btn: 'Sign in / Register',
        comment_too_short: 'Comment is too short.',
        account_title: 'Account', account_subtitle: 'Local registration for comments',
        auth_tab_login: 'Login', auth_tab_register: 'Register',
        username_label: 'Username', username_placeholder: 'E.g. Sora',
        password_label: 'Password', password_placeholder: 'At least 4 characters',
        auth_status_default: 'Sign in or create an account to post comments.',
        auth_status_login: 'Sign in to post comments on anime.',
        auth_status_register: 'Create an account to post comments on anime.',
        auth_submit: 'Continue', username_short: 'Username must be at least 3 characters.',
        password_short: 'Password must be at least 4 characters.', user_exists: 'This user already exists.',
        wrong_credentials: 'Incorrect username or password.',
        profile_bio_label: 'About me', profile_bio_placeholder: 'Tell a little about yourself...',
        save_profile: 'Save profile', profile_saved: 'Saved!', in_system: 'Signed in', logout: 'Sign out',
        favorites_title: 'Favorites', favorites_sub: 'Saved anime',
        favorites_guest_msg: 'Sign in to save favorites', favorites_login_btn: 'Sign in',
        no_favorites: 'No favorite anime yet.<br>Click <span class="text-airbnb font-semibold">♡</span> on a card to add.',
        admin_panel_title: 'Control Panel', admin_panel_sub: 'Admin only',
        admin_tab_stats: 'Statistics', admin_tab_data: 'Data',
        admin_secret_label: 'Admin panel', admin_password_placeholder: 'Admin password',
        admin_login_btn: 'Enter panel', admin_wrong_password: 'Wrong password',
        mob_home: 'Home', mob_catalog: 'Catalog', mob_search: 'Search', mob_profile: 'Profile',
        add_to_fav: 'Add to favorites', remove_from_fav: 'Remove from favorites',
        email_label: 'Email', email_placeholder: 'example@mail.com',
        verify_btn: 'Verify', verify_code_btn: 'Check',
        email_verified_text: 'Email verified',
        forgot_password_link: 'Forgot password?',
        back_to_login_btn: 'Back to login',
        forgot_title: 'Password recovery',
        reset_email_label: 'Email from account',
        reset_send_btn: 'Send code',
        reset_code_label: 'Code from email',
        reset_new_pass_label: 'New password',
        reset_save_btn: 'Save password',
        reset_status_default: 'Enter the email linked to your account.',
        login_username_label: 'Login or email',
        login_username_placeholder: 'Login or email',
        genre_filter_all: 'All selected',
        genre_filter_any: 'Any selected',
        comment_reply: 'Reply',
        comment_reply_to: u => `Reply to @${u}`,
        profile_settings_title: 'Profile settings',
        profile_hide_favorites: 'Hide favorites from others',
        profile_save_settings: 'Save',
        profile_change_password: 'Change password',
        profile_current_password: 'Current password',
        profile_new_password: 'New password',
        profile_confirm_password: 'Confirm password',
        profile_password_changed: 'Password changed!',
        profile_wrong_password: 'Wrong current password.',
        profile_passwords_mismatch: 'Passwords do not match.',
        profile_password_short: 'At least 4 characters.',
        profile_favorites_hidden: 'User hid their favorites',
        profile_no_comments: 'No comments yet',
        profile_comments_title: 'Comment history',
        profile_not_found: 'Profile not found',
        profile_loading: 'Loading profile...',
        open_profile: 'View profile',
        speed_label: 'Speed',
        player_loading: 'Loading...',
        buffer_loading: 'Loading',
        buffer_low: 'Low buffer',
        buffer_ahead: s => `+${s}s buffered`,
        buffer_full: 'Fully buffered',
        libria_not_found: 'AniLibria: anime not found',
        libria_try_other: 'Try another server',
        email_valid_error: 'Enter a valid email.',
        email_already_taken: 'This email is already registered.',
        code_expired: 'Code expired. Request a new one.',
        code_wrong: 'Invalid code. Try again.',
        confirm_email_first: 'Confirm your email before registering.',
        login_enter_required: 'Enter your login or email.',
        reset_not_found: 'No account found with this email.',
        reset_code_sent: 'Code sent! Check your email.',
        reset_code_correct: 'Code correct! Enter new password.',
        reset_code_invalid: 'Invalid code.',
        reset_done: 'Password changed! Sign in.',
        user_not_found_err: 'User not found.',
        error_prefix: msg => `Error: ${msg}`,
        genre_search_placeholder: 'Search genres',
        genre_show_more: n => `Show ${n} more...`,
        genre_loading: 'Loading genres...',
        admin_stats_title: 'Site stats',
        admin_comments_count: 'Comments',
        admin_reviewed_anime: 'Reviewed anime',
        admin_users_count: 'Users',
        admin_cached_anime: 'Cached anime',
        admin_cached_sub: 'Loaded from MyAnimeList',
        admin_clear_confirm: 'Delete all comments? This cannot be undone.',
        admin_cleared: 'All comments deleted.',
        admin_imported: 'Data imported successfully.',
        admin_import_err: 'Error: invalid file format.',
        admin_manage_title: 'Data management',
        admin_manage_sub: 'All data is stored locally in the browser',
        admin_tab_clear: 'Delete comments',
        admin_tab_export: 'Export (JSON)',
        admin_tab_import: 'Import (JSON)',
        admin_lang_title: 'Synopsis language',
        admin_lang_auto: 'Determined automatically',
        adult_badge: '18+',
        adult_badge_title: 'Adult content',
        comment_like: 'Like',
        profile_logout: 'Sign out',
        start_watch: 'Start watching',
        start_watch_hint: 'Scrub to your spot, then press play',
        continue_title: 'Continue watching',
        continue_sub: 'Pick up where you left off',
        continue_ep: n => `Episode ${n}`,
        continue_clear: 'Clear',
        share_link: 'Link',
        toast_fav_added: 'Added to favorites ♡',
        toast_fav_removed: 'Removed from favorites',
        toast_comment_sent: 'Comment posted',
        toast_link_copied: 'Link copied',
        toast_copy_failed: 'Could not copy link',
        toast_history_cleared: 'Watch history cleared',
        hentai_player_note: '18+ · HentaiPlay player (MegaPlay)',
    }
};

function t(key, ...args) {
    const str = STRINGS[currentLang]?.[key] ?? STRINGS.ru[key] ?? key;
    return typeof str === 'function' ? str(...args) : str;
}

function renderTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    renderSortPanel();
}

// ─── Language ─────────────────────────────────────────────────────────────────

function applyLangToAllAnime() {
    const updateTitle = (anime) => {
        anime.displayTitle = currentLang === 'en'
            ? (anime.titleEn || anime.title || anime.displayTitle)
            : (anime.titleRu || anime.displayTitle);
    };
    animeData.forEach(updateTitle);
    recommendedAnime.forEach(updateTitle);
    ongoingAnime.forEach(updateTitle);
    topRowAnime.forEach(updateTitle);
    popularRowAnime.forEach(updateTitle);
    if (currentAnime) updateTitle(currentAnime);
}

function toggleLang() {
    currentLang = currentLang === 'ru' ? 'en' : 'ru';
    TRANSLATE_TO = currentLang === 'en' ? null : currentLang;
    setCookie('anyrainy_lang', currentLang, 365);
    // Не очищаем кеш переводов при смене языка — он нужен при возврате в RU
    applyLangToAllAnime();
    updateLangToggle();
    renderTranslations();
    if (currentSection === 'home') {
        renderContinueWatching();
        ['ongoing', 'top', 'popular'].forEach(renderCarousel);
        if (currentLang === 'ru') {
            ['ongoing', 'top', 'popular'].forEach(c => {
                if (getRow(c).length) enrichWithRussianTitles(getRow(c)).then(() => renderCarousel(c)).catch(() => {});
            });
        }
    } else if (currentSection === 'list') {
        renderCatalog();
    } else if (currentSection === 'watch' && currentAnime) {
        renderPlayerUI(currentAnime);
        if (currentLang === 'ru') enrichWithRussianTitles([currentAnime]).then(() => {
            if (currentAnime?.displayTitle) document.title = `${currentAnime.displayTitle} — AnyRainy`;
        });
        // Если переключились на RU и перевода ещё нет — запустить перевод
        if (TRANSLATE_TO && !synopsisCache[currentAnime.id]) {
            const id = currentAnime.id;
            const src = currentAnime.synopsisEn || currentAnime.synopsis;
            const el = document.getElementById('anime-synopsis');
            if (el) el.classList.add('synopsis-loading');
            translateSynopsis(src, id).then(translated => {
                if (currentAnime?.id === id && translated !== src) {
                    synopsisCache[id] = translated;
                    const el2 = document.getElementById('anime-synopsis');
                    if (el2) { el2.textContent = translated; el2.classList.remove('synopsis-loading'); }
                }
            });
        }
    }
}

function updateLangToggle() {
    const label = currentLang.toUpperCase();
    const btn = document.getElementById('lang-toggle');
    if (btn) btn.textContent = label;
    const btnMob = document.getElementById('lang-toggle-mobile');
    if (btnMob) btnMob.textContent = label;
}

// ─── Synopsis translation ─────────────────────────────────────────────────────

let _myMemoryBlockedUntil = 0;

function isMyMemoryRateLimited(res, data) {
    return res?.status === 429 || data?.responseStatus === 429
        || String(data?.responseDetails || '').toLowerCase().includes('quota');
}

async function translateSynopsis(text, animeId) {
    if (!TRANSLATE_TO || !text || text === 'Описание пока недоступно.') return text;
    if (synopsisCache[animeId]) return synopsisCache[animeId];
    if (TRANSLATE_TO === 'ru' && /[Ѐ-ӿ]{10,}/.test(text)) return text;
    if (Date.now() < _myMemoryBlockedUntil) return text;
    try {
        const snippet = text.slice(0, 480);
        const res = await fetch(
            `https://api.mymemory.translated.net/get?q=${encodeURIComponent(snippet)}&langpair=en|${TRANSLATE_TO}`,
            { signal: AbortSignal.timeout(8000) }
        );
        const data = await res.json();
        if (isMyMemoryRateLimited(res, data)) {
            _myMemoryBlockedUntil = Date.now() + 120000;
            return text;
        }
        if (data.responseStatus === 200 && data.responseData?.translatedText) {
            const translated = data.responseData.translatedText;
            synopsisCache[animeId] = translated;
            return translated;
        }
    } catch (_) {}
    return text;
}

// ─── Auth / Session ───────────────────────────────────────────────────────────

function getStoredUsers() {
    return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || '{}');
}

function saveStoredUsers(users) {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(users));
}

function saveSession(user) {
    currentUser = user;
    if (user) {
        setCookie('anyrainy_session', JSON.stringify(user), 30);
        localStorage.setItem('anistream_current_user', JSON.stringify(user));
    } else {
        deleteCookie('anyrainy_session');
        localStorage.removeItem('anistream_current_user');
    }
}

function loadSession() {
    const cookie = getCookie('anyrainy_session');
    if (cookie) {
        try { currentUser = JSON.parse(cookie); } catch (_) { currentUser = null; }
    } else {
        currentUser = JSON.parse(localStorage.getItem('anistream_current_user') || 'null');
    }
}

// ─── Profile ──────────────────────────────────────────────────────────────────

function getProfileKey() {
    return currentUser ? `anyrainy_profile_${currentUser.username}` : null;
}

function getProfile() {
    const key = getProfileKey();
    if (!key) return {};
    return JSON.parse(localStorage.getItem(key) || '{}');
}

function saveProfileData(data) {
    const key = getProfileKey();
    if (!key) return;
    localStorage.setItem(key, JSON.stringify({ ...getProfile(), ...data }));
}

function uploadAvatar(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    if (file.size > 5 * 1024 * 1024) {
        alert('Файл слишком большой. Максимальный размер — 5 МБ.');
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const SIZE = 256;
            const canvas = document.createElement('canvas');
            canvas.width = SIZE; canvas.height = SIZE;
            const ctx = canvas.getContext('2d');
            // Обрезаем по центру (crop square)
            const min = Math.min(img.width, img.height);
            const sx = (img.width - min) / 2;
            const sy = (img.height - min) / 2;
            ctx.drawImage(img, sx, sy, min, min, 0, 0, SIZE, SIZE);
            saveProfileData({ avatar: canvas.toDataURL('image/jpeg', 0.85) });
            updateAuthUI();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function saveBio() {
    const input = document.getElementById('profile-bio-input');
    if (!input) return;
    saveProfileData({ bio: input.value.trim() });
    const bioPage = document.getElementById('profile-bio-page');
    if (bioPage) bioPage.value = input.value.trim();
    const btn = document.getElementById('save-bio-btn');
    if (btn) {
        btn.textContent = t('profile_saved');
        setTimeout(() => { btn.textContent = t('save_profile'); }, 2000);
    }
}

// ─── Favorites ────────────────────────────────────────────────────────────────

function getFavoritesKey() {
    return currentUser ? `anyrainy_favorites_${currentUser.username}` : null;
}

function getFavorites() {
    const key = getFavoritesKey();
    if (!key) return [];
    return JSON.parse(localStorage.getItem(key) || '[]');
}

function isFavorite(animeId) {
    return getFavorites().some(a => a.id === animeId);
}

function toggleFavorite(animeId) {
    if (!currentUser) {
        openAuthModal('login');
        return;
    }
    const key = getFavoritesKey();
    const favorites = getFavorites();
    const idx = favorites.findIndex(a => a.id === animeId);
    if (idx >= 0) {
        favorites.splice(idx, 1);
    } else {
        const anime = findAnimeById(animeId);
        if (anime) {
            favorites.push({
                id: anime.id, malId: anime.malId, title: anime.title,
                titleRu: anime.titleRu, titleEn: anime.titleEn,
                displayTitle: anime.displayTitle, image: anime.image,
                rating: anime.rating, episodes: anime.episodes,
                tags: anime.tags, synopsis: anime.synopsis,
                year: anime.year, status: anime.status, isAdult: anime.isAdult || false,
                season: anime.season, episodesList: anime.episodesList || []
            });
        }
    }
    localStorage.setItem(key, JSON.stringify(favorites));
    updateHeartButtons(animeId);
    showToast(idx >= 0 ? t('toast_fav_removed') : t('toast_fav_added'), 'success');
    // Update count in profile panel
    const countEl = document.getElementById('profile-fav-count');
    if (countEl) countEl.textContent = getFavorites().length;
    // Если открыта страница избранного — обновим её
    if (currentSection === 'favorites-page') renderFavoritesPage();
}

function updateHeartButtons(changedId) {
    // Update only the changed heart to avoid full re-render
    document.querySelectorAll(`[data-fav-id="${changedId}"]`).forEach(btn => {
        const fav = isFavorite(changedId);
        btn.innerHTML = `<i data-lucide="heart" class="w-4 h-4 transition-colors ${fav ? 'fill-current text-airbnb' : 'text-gray-500 dark:text-gray-400'}"></i>`;
        btn.setAttribute('title', fav ? 'Убрать из избранного' : 'В избранное');
    });
    lucide.createIcons();
}

function openFavorites() {
    const modal = document.getElementById('favorites-modal');
    if (!modal) return;
    // Повторный клик (окошко уже открыто) → полная страница избранного
    if (!modal.classList.contains('hidden') && currentUser) { openFavoritesPage(); return; }
    if (!currentUser) {
        document.getElementById('favorites-guest')?.classList.remove('hidden');
        document.getElementById('favorites-content')?.classList.add('hidden');
        openModalOverlay(modal);
        lucide.createIcons();
        return;
    }
    document.getElementById('favorites-guest')?.classList.add('hidden');
    renderFavoritesModal();
    openModalOverlay(modal);
}

function closeFavorites() {
    closeModalOverlay(document.getElementById('favorites-modal'));
}

// Полная страница избранного (отдельная вкладка)
function openFavoritesPage() {
    closeFavorites();
    if (!currentUser) { openAuthModal('login'); return; }
    showSection('favorites-page');
    renderFavoritesPage();
}

function renderFavoritesPage() {
    const content = document.getElementById('favorites-page-content');
    const countEl = document.getElementById('favorites-page-count');
    if (!content) return;
    const favorites = getFavorites();
    if (countEl) countEl.textContent = t('favorites_count', favorites.length);
    if (!favorites.length) {
        content.innerHTML = `
            <div class="text-center py-20 space-y-3">
                <div class="w-16 h-16 bg-gray-100 dark:bg-[#2a2a2a] rounded-full flex items-center justify-center mx-auto">
                    <i data-lucide="heart" class="w-8 h-8 text-gray-300 dark:text-gray-600"></i>
                </div>
                <p class="text-gray-500 dark:text-gray-400">${t('no_favorites')}</p>
            </div>`;
        lucide.createIcons();
        return;
    }
    content.innerHTML = `<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">${renderAnimeCards(favorites)}</div>`;
    lucide.createIcons();
    staggerAnimItems(content);
    if (currentLang === 'ru') enrichWithRussianTitles(favorites);
}

function renderFavoritesModal() {
    const content = document.getElementById('favorites-content');
    if (!content) return;
    const favorites = getFavorites();
    if (!favorites.length) {
        content.innerHTML = `
            <div class="text-center py-12 space-y-3">
                <div class="w-16 h-16 bg-gray-100 dark:bg-[#2a2a2a] rounded-full flex items-center justify-center mx-auto">
                    <i data-lucide="heart" class="w-8 h-8 text-gray-300 dark:text-gray-600"></i>
                </div>
                <p class="text-gray-500 dark:text-gray-400">${t('no_favorites')}</p>
            </div>`;
        lucide.createIcons();
        return;
    }
    content.innerHTML = `<div class="grid grid-cols-2 sm:grid-cols-3 gap-4">${renderAnimeCards(favorites)}</div>`;
    lucide.createIcons();
    staggerAnimItems(content);
    if (currentLang === 'ru') enrichWithRussianTitles(favorites);
}

// ─── Auth UI ──────────────────────────────────────────────────────────────────

function updateAuthUI() {
    const label = document.getElementById('account-button-label');
    const currentUserEl = document.getElementById('auth-current-user');
    const status = document.getElementById('auth-status');
    const form = document.getElementById('auth-form');
    const panel = document.getElementById('auth-logged-in-panel');

    if (label) label.textContent = currentUser ? currentUser.username : t('login_btn');

    const mobNavLabel = document.getElementById('mob-nav-account-label');
    if (mobNavLabel) {
        const name = currentUser?.username || '';
        mobNavLabel.textContent = name ? name.slice(0, 9) : 'Профиль';
    }

    if (currentUserEl) currentUserEl.textContent = currentUser ? currentUser.username : '';

    if (status && !currentUser) {
        status.textContent = authMode === 'login' ? t('auth_status_login') : t('auth_status_register');
    }

    const tabs = document.getElementById('auth-tabs');
    if (tabs) tabs.classList.toggle('hidden', Boolean(currentUser));
    if (form) form.classList.toggle('hidden', Boolean(currentUser));
    if (panel) panel.classList.toggle('hidden', !currentUser);

    // Profile avatar in modal
    if (currentUser) {
        const profile = getProfile();
        const avatarModal = document.getElementById('profile-avatar-modal');
        if (avatarModal) {
            if (profile.avatar) {
                avatarModal.innerHTML = `<img src="${profile.avatar}" class="w-full h-full object-cover">`;
            } else {
                avatarModal.innerHTML = `<span class="text-2xl font-bold text-gray-500 dark:text-gray-400">${escapeHtml(currentUser.username.charAt(0).toUpperCase())}</span>`;
            }
        }
        const bioInput = document.getElementById('profile-bio-input');
        if (bioInput) bioInput.value = profile.bio || '';

        const countEl = document.getElementById('profile-fav-count');
        if (countEl) countEl.textContent = getFavorites().length;

        // Avatar in nav button
        const avatarBtn = document.getElementById('account-avatar-btn');
        if (avatarBtn) {
            if (profile.avatar) {
                avatarBtn.innerHTML = `<img src="${profile.avatar}" class="w-full h-full object-cover">`;
            } else {
                avatarBtn.innerHTML = `<span class="text-xs font-bold">${escapeHtml(currentUser.username.charAt(0).toUpperCase())}</span>`;
                avatarBtn.className = 'w-7 h-7 bg-airbnb rounded-full text-white flex items-center justify-center overflow-hidden shrink-0';
            }
        }
    } else {
        const avatarBtn = document.getElementById('account-avatar-btn');
        if (avatarBtn) {
            avatarBtn.innerHTML = `<i data-lucide="user" class="w-4 h-4"></i>`;
            avatarBtn.className = 'w-7 h-7 bg-gray-500 rounded-full text-white flex items-center justify-center overflow-hidden shrink-0';
        }
    }

    lucide.createIcons();
}

function switchAuthMode(mode) {
    authMode = mode;
    const isLogin = mode === 'login';

    const loginTab = document.getElementById('auth-tab-login');
    const registerTab = document.getElementById('auth-tab-register');
    const status = document.getElementById('auth-status');
    const emailRow = document.getElementById('email-row');
    const forgotRow = document.getElementById('forgot-link-row');
    const usernameLabel = document.getElementById('username-field-label');
    const usernameInput = document.getElementById('auth-username');

    if (loginTab) loginTab.className = `px-4 py-3 rounded-xl text-sm font-semibold ${isLogin ? 'bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-300'}`;
    if (registerTab) registerTab.className = `px-4 py-3 rounded-xl text-sm font-semibold ${!isLogin ? 'bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-300'}`;

    if (emailRow) emailRow.classList.toggle('hidden', isLogin);
    if (forgotRow) forgotRow.classList.toggle('hidden', !isLogin);
    if (usernameLabel) usernameLabel.textContent = isLogin ? t('login_username_label') : t('username_label');
    if (usernameInput) usernameInput.placeholder = isLogin ? t('login_username_placeholder') : t('username_placeholder');

    if (status && !currentUser) {
        status.textContent = isLogin ? t('auth_status_login') : t('auth_status_register');
    }

    // Сбрасываем email verification при переключении на register
    if (!isLogin) {
        emailVerified = false; emailVerifyCode = null; emailVerifyTarget = null;
        document.getElementById('email-verified-msg')?.classList.add('hidden');
        document.getElementById('email-verify-error')?.classList.add('hidden');
        document.getElementById('email-code-row')?.classList.add('hidden');
        const emailInput = document.getElementById('auth-email');
        if (emailInput) emailInput.value = '';
        const codeInput = document.getElementById('auth-email-code');
        if (codeInput) codeInput.value = '';
        const btn = document.getElementById('verify-email-btn');
        if (btn) { btn.textContent = 'Подтвердить'; btn.disabled = false; }
    }
}

function openAuthModal(mode = authMode) {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;
    openModalOverlay(modal, { lockScroll: false });
    switchAuthMode(mode);
    updateAuthUI();
    lucide.createIcons();
}

function closeAuthModal() {
    closeModalOverlay(document.getElementById('auth-modal'), { unlockScroll: false });
    document.getElementById('admin-secret-panel')?.classList.add('hidden');
    document.getElementById('forgot-password-panel')?.classList.add('hidden');
    const passInput = document.getElementById('admin-password-input');
    if (passInput) passInput.value = '';
}

function handleAccountButtonClick() {
    if (currentUser) {
        showProfilePage(null);
    } else {
        openAuthModal(authMode);
    }
}

// ─── Email verification state ─────────────────────────────────────────────────

let emailVerifyCode = null;
let emailVerifyTarget = null;
let emailVerifyExpiry = 0;
let emailVerified = false;
let resetVerifyCode = null;
let resetEmailTarget = null;
let resetExpiry = 0;

function generateCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendAnyRainyEmail(to, subject, title, description, code) {
    if (typeof emailjs === 'undefined') throw new Error('EmailJS не загружен');
    await emailjs.send(
        'service_z7hspf3',
        'template_k0vlm5d',
        { to_email: to, subject, title, description, code },
        { publicKey: '6zjgiPPhvsm1jOGZC' }
    );
}


async function requestEmailVerification() {
    const emailInput = document.getElementById('auth-email');
    const btn = document.getElementById('verify-email-btn');
    const errorEl = document.getElementById('email-verify-error');
    const email = emailInput?.value.trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        if (errorEl) { errorEl.textContent = t('email_valid_error'); errorEl.classList.remove('hidden'); }
        return;
    }
    const users = getStoredUsers();
    if (Object.values(users).some(u => u.email?.toLowerCase() === email)) {
        if (errorEl) { errorEl.textContent = t('email_already_taken'); errorEl.classList.remove('hidden'); }
        return;
    }
    if (errorEl) errorEl.classList.add('hidden');
    if (btn) { btn.disabled = true; btn.textContent = '...'; }

    const code = generateCode();
    emailVerifyCode = code;
    emailVerifyTarget = email;
    emailVerifyExpiry = Date.now() + 10 * 60 * 1000;
    emailVerified = false;

    try {
        await sendAnyRainyEmail(
            email,
            'AnyRainy — подтверждение почты',
            'Подтверди свою почту',
            'Для завершения регистрации на AnyRainy введи этот код на сайте:',
            code
        );
        document.getElementById('email-code-row')?.classList.remove('hidden');
        document.getElementById('auth-email-code')?.focus();
        if (btn) { btn.textContent = t('verify_btn'); btn.disabled = false; }
    } catch (err) {
        const msg = err?.message || String(err);
        if (errorEl) { errorEl.textContent = t('error_prefix', msg); errorEl.classList.remove('hidden'); }
        if (btn) { btn.textContent = t('verify_btn'); btn.disabled = false; }
        console.error('Verify email error:', msg);
    }
}

function verifyEmailCode() {
    const codeInput = document.getElementById('auth-email-code');
    const errorEl = document.getElementById('email-verify-error');
    const code = codeInput?.value.trim();

    if (Date.now() > emailVerifyExpiry) {
        if (errorEl) { errorEl.textContent = t('code_expired'); errorEl.classList.remove('hidden'); }
        return;
    }
    if (!code || code !== emailVerifyCode) {
        if (errorEl) { errorEl.textContent = t('code_wrong'); errorEl.classList.remove('hidden'); }
        return;
    }
    emailVerified = true;
    if (errorEl) errorEl.classList.add('hidden');
    document.getElementById('email-code-row')?.classList.add('hidden');
    const msg = document.getElementById('email-verified-msg');
    if (msg) { msg.classList.remove('hidden'); lucide.createIcons(); }
    if (codeInput) codeInput.value = '';
}

function showForgotPassword() {
    document.getElementById('auth-form')?.classList.add('hidden');
    document.getElementById('auth-tabs')?.classList.add('hidden');
    const panel = document.getElementById('forgot-password-panel');
    if (panel) panel.classList.remove('hidden');
    // Сброс состояния
    const status = document.getElementById('reset-status');
    if (status) { status.textContent = t('reset_status_default'); status.className = 'text-sm text-gray-500 dark:text-gray-400'; }
    document.getElementById('reset-code-row')?.classList.add('hidden');
    document.getElementById('reset-newpass-row')?.classList.add('hidden');
    const sendBtn = document.getElementById('reset-send-btn');
    if (sendBtn) { sendBtn.textContent = 'Отправить код'; sendBtn.disabled = false; }
    resetVerifyCode = null;
    resetEmailTarget = null;
}

function backToLogin() {
    document.getElementById('forgot-password-panel')?.classList.add('hidden');
    document.getElementById('auth-form')?.classList.remove('hidden');
    document.getElementById('auth-tabs')?.classList.remove('hidden');
    switchAuthMode('login');
}

async function sendResetCode() {
    const emailInput = document.getElementById('reset-email-input');
    const status = document.getElementById('reset-status');
    const btn = document.getElementById('reset-send-btn');
    const email = emailInput?.value.trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        if (status) { status.textContent = t('email_valid_error'); status.className = 'text-sm text-red-500'; }
        return;
    }
    const users = getStoredUsers();
    const found = Object.values(users).find(u => u.email?.toLowerCase() === email);
    if (!found) {
        if (status) { status.textContent = t('reset_not_found'); status.className = 'text-sm text-red-500'; }
        return;
    }
    if (btn) { btn.disabled = true; btn.textContent = '...'; }

    const code = generateCode();
    resetVerifyCode = code;
    resetEmailTarget = email;
    resetExpiry = Date.now() + 10 * 60 * 1000;

    try {
        await sendAnyRainyEmail(
            email,
            'AnyRainy — восстановление пароля',
            'Восстановление пароля',
            'Ты запросил сброс пароля. Введи этот код для подтверждения:',
            code
        );
        document.getElementById('reset-code-row')?.classList.remove('hidden');
        document.getElementById('reset-code-input')?.focus();
        if (status) { status.textContent = t('reset_code_sent'); status.className = 'text-sm text-green-500'; }
        if (btn) { btn.textContent = t('reset_send_btn'); btn.disabled = false; }
    } catch (err) {
        const msg = err?.message || String(err);
        if (status) { status.textContent = t('error_prefix', msg); status.className = 'text-sm text-red-500'; }
        if (btn) { btn.textContent = t('reset_send_btn'); btn.disabled = false; }
        console.error('Reset email error:', msg);
    }
}

function submitResetCode() {
    const codeInput = document.getElementById('reset-code-input');
    const status = document.getElementById('reset-status');
    const code = codeInput?.value.trim();

    if (Date.now() > resetExpiry) {
        if (status) { status.textContent = t('code_expired'); status.className = 'text-sm text-red-500'; }
        return;
    }
    if (!code || code !== resetVerifyCode) {
        if (status) { status.textContent = t('reset_code_invalid'); status.className = 'text-sm text-red-500'; }
        return;
    }
    document.getElementById('reset-code-row')?.classList.add('hidden');
    document.getElementById('reset-newpass-row')?.classList.remove('hidden');
    document.getElementById('reset-new-password')?.focus();
    if (status) { status.textContent = t('reset_code_correct'); status.className = 'text-sm text-green-500'; }
}

function submitPasswordReset() {
    const newPassInput = document.getElementById('reset-new-password');
    const status = document.getElementById('reset-status');
    const newPass = newPassInput?.value || '';

    if (newPass.length < 4) {
        if (status) { status.textContent = 'Пароль должен быть не короче 4 символов.'; status.className = 'text-sm text-red-500'; }
        return;
    }
    const users = getStoredUsers();
    const entry = Object.entries(users).find(([, u]) => u.email?.toLowerCase() === resetEmailTarget);
    if (!entry) {
        if (status) { status.textContent = t('user_not_found_err'); status.className = 'text-sm text-red-500'; }
        return;
    }
    users[entry[0]].password = newPass;
    saveStoredUsers(users);
    if (status) { status.textContent = t('reset_done'); status.className = 'text-sm text-green-500'; }
    resetVerifyCode = null;
    resetEmailTarget = null;
    setTimeout(backToLogin, 2000);
}

// ─── Submit auth form (login by username or email, register with email) ────────

function submitAuthForm(event) {
    event.preventDefault();
    const usernameInput = document.getElementById('auth-username');
    const passwordInput = document.getElementById('auth-password');
    const status = document.getElementById('auth-status');
    const loginStr = usernameInput?.value.trim() || '';
    const password = passwordInput?.value || '';
    const normalizedLogin = loginStr.toLowerCase();

    if (authMode === 'register') {
        if (loginStr.length < 3) { if (status) status.textContent = t('username_short'); return; }
        if (!emailVerified || !emailVerifyTarget) { if (status) status.textContent = t('confirm_email_first'); return; }
        if (password.length < 4) { if (status) status.textContent = t('password_short'); return; }
        const users = getStoredUsers();
        if (users[normalizedLogin]) { if (status) status.textContent = t('user_exists'); return; }
        if (Object.values(users).some(u => u.email?.toLowerCase() === emailVerifyTarget)) {
            if (status) status.textContent = t('email_already_taken'); return;
        }
        users[normalizedLogin] = { username: loginStr, email: emailVerifyTarget, password };
        saveStoredUsers(users);
        saveSession({ username: loginStr });
    } else {
        if (!loginStr) { if (status) status.textContent = t('login_enter_required'); return; }
        if (password.length < 4) { if (status) status.textContent = t('password_short'); return; }
        const users = getStoredUsers();
        // Ищем по логину, затем по email
        let userEntry = users[normalizedLogin];
        let actualUsername = loginStr;
        if (!userEntry) {
            const byEmail = Object.values(users).find(u => u.email?.toLowerCase() === normalizedLogin);
            if (byEmail) { userEntry = byEmail; actualUsername = byEmail.username; }
        }
        if (!userEntry || userEntry.password !== password) {
            if (status) status.textContent = t('wrong_credentials'); return;
        }
        saveSession({ username: actualUsername });
    }

    if (usernameInput) usernameInput.value = '';
    if (passwordInput) passwordInput.value = '';
    emailVerified = false;
    emailVerifyCode = null;
    emailVerifyTarget = null;
    updateAuthUI();
    closeAuthModal();
    refreshCommentsOnly();
}

function logout() {
    saveSession(null);
    updateAuthUI();
    refreshCommentsOnly();
}

// ─── Comments ─────────────────────────────────────────────────────────────────

function getCommentsStorageKey(animeId) {
    return `anime_comments_${animeId}`;
}

function getAnimeComments(animeId) {
    return JSON.parse(localStorage.getItem(getCommentsStorageKey(animeId)) || '[]');
}

function saveAnimeComments(animeId, comments) {
    localStorage.setItem(getCommentsStorageKey(animeId), JSON.stringify(comments));
}

function getUserAvatar(username) {
    try {
        const p = JSON.parse(localStorage.getItem(`anyrainy_profile_${username}`) || '{}');
        return p.avatar || null;
    } catch (_) { return null; }
}

function renderCommentAvatar(username) {
    const avatar = getUserAvatar(username);
    const initials = escapeHtml(username.charAt(0).toUpperCase());
    return avatar
        ? `<img src="${avatar}" class="w-full h-full object-cover">`
        : `<span class="text-xs font-bold text-white">${initials}</span>`;
}

function renderCommentsSection(anime) {
    const comments = getAnimeComments(anime.id);
    const commentsHtml = comments.length
        ? comments.map(comment => `
            <div class="anim-item rounded-2xl border border-subtle p-4 bg-white dark:bg-[#1e1e1e]">
                <div class="flex items-start gap-3">
                    <button onclick="openUserProfile('${escapeHtml(comment.username)}')"
                        class="w-9 h-9 rounded-full bg-airbnb flex-shrink-0 flex items-center justify-center overflow-hidden hover:ring-2 hover:ring-airbnb transition-all">
                        ${renderCommentAvatar(comment.username)}
                    </button>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <button onclick="openUserProfile('${escapeHtml(comment.username)}')"
                                class="font-semibold text-gray-900 dark:text-white hover:text-airbnb transition-colors text-sm">
                                ${escapeHtml(comment.username)}
                            </button>
                            <span class="text-xs text-gray-500 dark:text-gray-400">${escapeHtml(comment.createdAt)}</span>
                        </div>
                        ${comment.replyTo ? `<p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">↩ @${escapeHtml(comment.replyTo)}</p>` : ''}
                        <p class="text-sm text-gray-700 dark:text-gray-300 mt-1.5 leading-6">${escapeHtml(comment.text)}</p>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        <button onclick="event.stopPropagation(); toggleCommentLike('${anime.id}', '${comment.id}')"
                            data-like-btn="${anime.id}_${comment.id}"
                            title="${t('comment_like')}"
                            class="flex items-center gap-1 group/like rounded-full px-1.5 py-0.5 hover:bg-gray-100 dark:hover:bg-[#2a2a2a] transition-colors">
                            <i data-lucide="heart" class="w-3.5 h-3.5 transition-colors ${hasUserLiked(anime.id, comment.id) ? 'fill-current text-airbnb' : 'text-gray-400 group-hover/like:text-airbnb'}"></i>
                            ${getCommentLikes(anime.id, comment.id).length > 0 ? `<span class="text-xs text-gray-500 dark:text-gray-400">${getCommentLikes(anime.id, comment.id).length}</span>` : ''}
                        </button>
                        ${currentUser ? `<button onclick="replyToComment('${escapeHtml(comment.username)}')" class="text-xs text-gray-500 hover:text-airbnb transition-colors">${t('comment_reply')}</button>` : ''}
                        ${currentUser && currentUser.username === comment.username ? `<button onclick="deleteComment('${anime.id}', '${comment.id}')" class="text-xs text-airbnb hover:text-airbnbDark transition-colors">${t('comment_delete')}</button>` : ''}
                    </div>
                </div>
            </div>
        `).join('')
        : `<div class="rounded-2xl border border-subtle p-6 text-sm text-gray-500 dark:text-gray-400 bg-white dark:bg-[#1e1e1e]">${t('no_comments')}</div>`;

    const formHtml = currentUser ? `
        <form class="space-y-3" onsubmit="submitComment(event)">
            <p id="reply-indicator" class="hidden text-xs text-airbnb font-medium"></p>
            <textarea id="comment-input" rows="4" placeholder="${t('comment_placeholder')}" class="w-full px-4 py-3 rounded-2xl border border-subtle outline-none bg-white dark:bg-[#2a2a2a] dark:text-white resize-none"></textarea>
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <p class="text-sm text-gray-500 dark:text-gray-400">${t('comment_writing_as', escapeHtml(currentUser.username))}</p>
                <button type="submit" class="w-full sm:w-auto bg-airbnb hover:bg-airbnbDark text-white px-5 py-3 rounded-xl font-semibold transition-colors">${t('comment_submit')}</button>
            </div>
        </form>
    ` : `
        <div class="rounded-2xl border border-subtle p-6 bg-white dark:bg-[#1e1e1e] flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
                <p class="font-semibold text-gray-900 dark:text-white">${t('comment_login_title')}</p>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">${t('comment_login_sub')}</p>
            </div>
            <button onclick="openAuthModal('register')" class="bg-airbnb hover:bg-airbnbDark text-white px-5 py-3 rounded-xl font-semibold transition-colors">${t('comment_login_btn')}</button>
        </div>
    `;

    return `
        <div class="space-y-6">
            <div class="flex items-center justify-between gap-4">
                <div>
                    <h3 class="text-2xl font-bold text-gray-900 dark:text-white">${t('comments_title')}</h3>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">${t('comments_subtitle')}</p>
                </div>
                <span class="px-3 py-1 rounded-full bg-gray-100 dark:bg-[#2a2a2a] text-sm font-semibold text-gray-700 dark:text-gray-200">${comments.length}</span>
            </div>
            ${formHtml}
            <div class="space-y-4">${commentsHtml}</div>
        </div>
    `;
}

function replyToComment(username) {
    commentReplyTo = username;
    const input = document.getElementById('comment-input');
    const indicator = document.getElementById('reply-indicator');
    if (input) {
        input.focus();
        if (!input.value.startsWith(`@${username} `)) input.value = `@${username} `;
    }
    if (indicator) {
        indicator.textContent = t('comment_reply_to', username);
        indicator.classList.remove('hidden');
    }
}

function refreshCommentsOnly() {
    const wrapper = document.getElementById('player-comments-wrapper');
    if (wrapper && currentAnime) {
        wrapper.innerHTML = renderCommentsSection(currentAnime);
        lucide.createIcons();
        staggerAnimItems(wrapper);
    }
}

function submitComment(event) {
    event.preventDefault();
    if (!currentUser || !currentAnime) { openAuthModal('login'); return; }
    const input = document.getElementById('comment-input');
    const text = input?.value.trim() || '';
    if (text.length < 2) { showToast(t('comment_too_short'), 'error'); return; }
    const comments = getAnimeComments(currentAnime.id);
    comments.unshift({
        id: `${Date.now()}`,
        username: currentUser.username,
        text,
        createdAt: new Date().toLocaleString('ru-RU'),
        replyTo: commentReplyTo || null
    });
    saveAnimeComments(currentAnime.id, comments);
    if (input) input.value = '';
    commentReplyTo = null;
    const indicator = document.getElementById('reply-indicator');
    if (indicator) indicator.classList.add('hidden');
    refreshCommentsOnly();
    showToast(t('toast_comment_sent'), 'success');
}

function deleteComment(animeId, commentId) {
    const comments = getAnimeComments(animeId).filter(c => c.id !== commentId);
    saveAnimeComments(animeId, comments);
    if (currentAnime && currentAnime.id === animeId) refreshCommentsOnly();
}

// ─── Comment likes ────────────────────────────────────────────────────────────

const LIKES_KEY = 'anyrainy_comment_likes';

function getAllLikes() {
    try { return JSON.parse(localStorage.getItem(LIKES_KEY) || '{}'); } catch (_) { return {}; }
}
function saveAllLikes(data) { localStorage.setItem(LIKES_KEY, JSON.stringify(data)); }

function getCommentLikes(animeId, commentId) {
    return getAllLikes()[`${animeId}_${commentId}`] || [];
}

function hasUserLiked(animeId, commentId) {
    if (!currentUser) return false;
    return getCommentLikes(animeId, commentId).includes(currentUser.username);
}

function toggleCommentLike(animeId, commentId) {
    if (!currentUser) { openAuthModal('login'); return; }
    const all = getAllLikes();
    const key = `${animeId}_${commentId}`;
    const users = all[key] || [];
    const idx = users.indexOf(currentUser.username);
    if (idx >= 0) users.splice(idx, 1); else users.push(currentUser.username);
    if (users.length === 0) delete all[key]; else all[key] = users;
    saveAllLikes(all);
    _updateLikeBtn(animeId, commentId);
}

function _updateLikeBtn(animeId, commentId) {
    const btn = document.querySelector(`[data-like-btn="${animeId}_${commentId}"]`);
    if (!btn) return;
    const count = getCommentLikes(animeId, commentId).length;
    const liked = hasUserLiked(animeId, commentId);
    btn.innerHTML = `<i data-lucide="heart" class="w-3.5 h-3.5 transition-colors ${liked ? 'fill-current text-airbnb' : 'text-gray-400 group-hover/like:text-airbnb'}"></i>${count > 0 ? `<span class="text-xs">${count}</span>` : ''}`;
    lucide.createIcons();
}

// ─── Profile page ─────────────────────────────────────────────────────────────

function getUserAllComments(username) {
    const result = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith('anime_comments_')) continue;
        const animeId = parseInt(key.replace('anime_comments_', ''));
        try {
            const comments = JSON.parse(localStorage.getItem(key) || '[]');
            comments.filter(c => c.username === username).forEach(c => {
                const anime = findAnimeById(animeId);
                result.push({ ...c, animeId, animeName: anime?.displayTitle || '', likeCount: getCommentLikes(animeId, c.id).length });
            });
        } catch (_) {}
    }
    return result.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
}

function renderProfilePage(username) {
    const isOwn = !username || (currentUser && currentUser.username.toLowerCase() === (username || '').toLowerCase());

    if (!username && !currentUser) {
        openAuthModal('login');
        showSection('home');
        return;
    }

    const displayUsername = username || currentUser?.username;
    if (!displayUsername) return;

    const profileData = JSON.parse(localStorage.getItem(`anyrainy_profile_${displayUsername}`) || '{}');
    const avatar = profileData.avatar;
    const bio = profileData.bio || '';
    const hideFavorites = profileData.hideFavorites || false;

    const favKey = `anyrainy_favorites_${displayUsername}`;
    const rawFavs = JSON.parse(localStorage.getItem(favKey) || '[]');
    const favorites = (isOwn || !hideFavorites) ? rawFavs.map(f => ({
        ...f,
        displayTitle: currentLang === 'en' ? (f.titleEn || f.title || f.displayTitle) : (f.titleRu || f.displayTitle)
    })) : null;

    const userComments = getUserAllComments(displayUsername);

    const initials = escapeHtml(displayUsername.charAt(0).toUpperCase());
    const avatarHtml = avatar
        ? `<img src="${avatar}" class="w-full h-full object-cover">`
        : `<span class="text-3xl font-bold text-white">${initials}</span>`;

    const container = document.getElementById('profile-container');
    if (!container) return;

    container.innerHTML = `
        <!-- Header -->
        <div class="anim-block flex flex-col sm:flex-row items-center sm:items-start gap-6">
            <div class="relative shrink-0">
                <div class="w-24 h-24 rounded-full bg-airbnb flex items-center justify-center overflow-hidden ring-4 ring-white dark:ring-[#1e1e1e]">
                    ${avatarHtml}
                </div>
                ${isOwn ? `
                <label class="absolute -bottom-1 -right-1 w-8 h-8 bg-airbnb rounded-full flex items-center justify-center cursor-pointer hover:bg-airbnbDark transition-colors">
                    <i data-lucide="camera" class="w-4 h-4 text-white"></i>
                    <input type="file" accept="image/*" onchange="uploadAvatarProfile(event)" class="hidden">
                </label>` : ''}
            </div>
            <div class="flex-1 text-center sm:text-left">
                <h2 class="text-2xl font-bold text-gray-900 dark:text-white">${escapeHtml(displayUsername)}</h2>
                ${bio ? `<p class="text-gray-600 dark:text-gray-400 mt-1 text-sm">${escapeHtml(bio)}</p>` : ''}
            </div>
        </div>

        ${isOwn ? `
        <!-- Settings -->
        <div class="anim-block bg-white dark:bg-[#1e1e1e] rounded-2xl border border-subtle p-5 space-y-4">
            <h3 class="font-bold text-gray-900 dark:text-white text-base">${t('profile_settings_title')}</h3>
            <div class="space-y-2">
                <label class="text-sm font-medium text-gray-700 dark:text-gray-300" data-i18n="profile_bio_label">О себе</label>
                <textarea id="profile-bio-page" rows="2" placeholder="${t('profile_bio_placeholder')}"
                    class="w-full px-4 py-3 rounded-xl border border-subtle bg-gray-50 dark:bg-[#2a2a2a] dark:text-white outline-none resize-none text-sm">${escapeHtml(bio)}</textarea>
            </div>
            <label class="flex items-center gap-3 cursor-pointer select-none">
                <div class="relative">
                    <input type="checkbox" id="hide-favorites-toggle" ${hideFavorites ? 'checked' : ''} class="sr-only peer">
                    <div class="w-10 h-6 bg-gray-200 dark:bg-[#444] peer-checked:bg-airbnb rounded-full transition-colors"></div>
                    <div class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-4 shadow"></div>
                </div>
                <span class="text-sm text-gray-700 dark:text-gray-300">${t('profile_hide_favorites')}</span>
            </label>
            <button onclick="saveProfilePageSettings()" class="px-5 py-2.5 bg-airbnb hover:bg-airbnbDark text-white rounded-xl font-semibold text-sm transition-colors">${t('profile_save_settings')}</button>
        </div>

        <!-- Смена пароля -->
        <div class="anim-block bg-white dark:bg-[#1e1e1e] rounded-2xl border border-subtle p-5 space-y-4">
            <h3 class="font-bold text-gray-900 dark:text-white text-base">${t('profile_change_password')}</h3>
            <div class="space-y-3">
                <input type="password" id="profile-cur-pass" autocomplete="current-password"
                    placeholder="${t('profile_current_password')}"
                    class="w-full px-4 py-3 rounded-xl border border-subtle bg-gray-50 dark:bg-[#2a2a2a] dark:text-white outline-none text-sm">
                <input type="password" id="profile-new-pass" autocomplete="new-password"
                    placeholder="${t('profile_new_password')}"
                    class="w-full px-4 py-3 rounded-xl border border-subtle bg-gray-50 dark:bg-[#2a2a2a] dark:text-white outline-none text-sm">
                <input type="password" id="profile-confirm-pass" autocomplete="new-password"
                    placeholder="${t('profile_confirm_password')}"
                    class="w-full px-4 py-3 rounded-xl border border-subtle bg-gray-50 dark:bg-[#2a2a2a] dark:text-white outline-none text-sm">
            </div>
            <p id="profile-pass-status" class="hidden text-sm"></p>
            <button onclick="changeProfilePassword()" class="px-5 py-2.5 bg-gray-900 dark:bg-white dark:text-black text-white rounded-xl font-semibold text-sm hover:opacity-80 transition-opacity">${t('profile_change_password')}</button>
        </div>

        <!-- Выход -->
        <button onclick="logout(); showSection('home')" class="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-subtle text-gray-500 dark:text-gray-400 hover:text-red-500 hover:border-red-400 dark:hover:text-red-400 transition-colors text-sm font-semibold">
            <i data-lucide="log-out" class="w-4 h-4"></i>
            ${t('profile_logout')}
        </button>` : ''}

        ${favorites !== null ? `
        <div class="anim-block space-y-4">
            <h3 class="text-xl font-bold text-gray-900 dark:text-white">${t('favorites_title')} <span class="text-sm font-normal text-gray-500">${favorites.length}</span></h3>
            ${favorites.length
                ? `<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">${renderAnimeCards(favorites)}</div>`
                : `<p class="text-sm text-gray-500 dark:text-gray-400">${t('no_favorites')}</p>`}
        </div>` : `
        <div class="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500 py-2">
            <i data-lucide="lock" class="w-4 h-4"></i>${t('profile_favorites_hidden')}
        </div>`}

        <div class="anim-block space-y-4">
            <h3 class="text-xl font-bold text-gray-900 dark:text-white">${t('profile_comments_title')} <span class="text-sm font-normal text-gray-500">${userComments.length}</span></h3>
            ${userComments.length ? `<div class="space-y-3">
                ${userComments.map(c => `
                <div class="anim-item rounded-2xl border border-subtle p-4 bg-white dark:bg-[#1e1e1e]">
                    <div class="flex items-center justify-between gap-2 mb-2 flex-wrap">
                        ${c.animeName ? `<button onclick="watchAnime(${c.animeId})" class="text-xs font-semibold text-airbnb hover:underline truncate max-w-xs">${escapeHtml(c.animeName)}</button>` : `<span class="text-xs text-gray-400">#${c.animeId}</span>`}
                        <span class="text-xs text-gray-400 shrink-0">${escapeHtml(c.createdAt)}</span>
                    </div>
                    ${c.replyTo ? `<p class="text-xs text-gray-400 mb-1">↩ @${escapeHtml(c.replyTo)}</p>` : ''}
                    <p class="text-sm text-gray-700 dark:text-gray-300 leading-6">${escapeHtml(c.text)}</p>
                    ${c.likeCount > 0 ? `<p class="flex items-center gap-1 mt-1.5 text-xs text-gray-400"><i data-lucide="heart" class="w-3 h-3 fill-current text-airbnb/60"></i>${c.likeCount}</p>` : ''}
                </div>`).join('')}
            </div>` : `<p class="text-sm text-gray-500 dark:text-gray-400">${t('profile_no_comments')}</p>`}
        </div>
    `;
    lucide.createIcons();
    staggerAnimBlocks(container);
    staggerAnimItems(container);
    if (currentLang === 'ru' && favorites && favorites.length) enrichWithRussianTitles(favorites);
}

function showProfilePage(username) {
    if (currentSection === 'watch') stopActivePlayer();
    document.querySelectorAll('main > section').forEach(s => s.classList.add('hidden'));
    document.getElementById('profile-section')?.classList.remove('hidden');
    const profileSection = document.getElementById('profile-section');
    animateSection(profileSection);
    currentSection = 'profile';
    currentProfileUsername = username || null;
    const urlHash = username ? `#profile/${encodeURIComponent(username)}` : '#profile';
    history.pushState({ profileUser: username }, '', urlHash);
    document.title = 'AnyRainy — Профиль';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.querySelector('nav.fixed')?.classList.remove('nav--scrolled');
    updateMobileNavActive('profile');
    if (typeof showNavBack === 'function') showNavBack('Назад', goBackFromProfile);
    renderProfilePage(username || null);
}

function goBackFromProfile() {
    if (currentAnime) {
        showSection('watch');
        updateAnimeUrl(currentAnime.malId);
    } else {
        showSection('home');
    }
}

function openUserProfile(username) {
    if (!username) return;
    const isOwn = currentUser && currentUser.username.toLowerCase() === username.toLowerCase();
    showProfilePage(isOwn ? null : username);
}

function saveProfilePageSettings() {
    const bioInput = document.getElementById('profile-bio-page');
    const hideToggle = document.getElementById('hide-favorites-toggle');
    const bio = bioInput?.value.trim() || '';
    const hideFavorites = hideToggle?.checked || false;
    saveProfileData({ bio, hideFavorites });
    // Sync bio in auth modal if open
    const modalBio = document.getElementById('profile-bio-input');
    if (modalBio) modalBio.value = bio;
    // Show saved feedback without full re-render
    const btn = document.querySelector('[onclick="saveProfilePageSettings()"]');
    if (btn) {
        const orig = btn.textContent;
        btn.textContent = t('profile_saved');
        setTimeout(() => { if (btn.isConnected) btn.textContent = orig; }, 2000);
    }
}

function changeProfilePassword() {
    if (!currentUser) return;
    const curPass = document.getElementById('profile-cur-pass')?.value || '';
    const newPass = document.getElementById('profile-new-pass')?.value || '';
    const confirmPass = document.getElementById('profile-confirm-pass')?.value || '';
    const status = document.getElementById('profile-pass-status');

    const showStatus = (msg, ok) => {
        if (!status) return;
        status.textContent = msg;
        status.className = `text-sm ${ok ? 'text-green-500' : 'text-red-500'}`;
        status.classList.remove('hidden');
        if (ok) setTimeout(() => status.classList.add('hidden'), 3000);
    };

    const users = getStoredUsers();
    const key = currentUser.username.toLowerCase();
    const user = users[key];
    if (!user || user.password !== curPass) { showStatus(t('profile_wrong_password'), false); return; }
    if (newPass.length < 4) { showStatus(t('profile_password_short'), false); return; }
    if (newPass !== confirmPass) { showStatus(t('profile_passwords_mismatch'), false); return; }

    users[key].password = newPass;
    saveStoredUsers(users);
    document.getElementById('profile-cur-pass').value = '';
    document.getElementById('profile-new-pass').value = '';
    document.getElementById('profile-confirm-pass').value = '';
    showStatus(t('profile_password_changed'), true);
}

function uploadAvatarProfile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    if (file.size > 5 * 1024 * 1024) { alert('Файл слишком большой. Максимальный размер — 5 МБ.'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const SIZE = 256;
            const canvas = document.createElement('canvas');
            canvas.width = SIZE; canvas.height = SIZE;
            const ctx = canvas.getContext('2d');
            const min = Math.min(img.width, img.height);
            ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, SIZE, SIZE);
            saveProfileData({ avatar: canvas.toDataURL('image/jpeg', 0.85) });
            updateAuthUI();
            if (currentSection === 'profile') renderProfilePage(currentProfileUsername);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// ─── Player ───────────────────────────────────────────────────────────────────

let currentAnime = null;
let currentEpisodeNum = 1;
let currentServerIndex = 0;
let _playerAvailability = {}; // key → true | false  (undefined = not checked yet)
let currentPlayerVoiceIdx = 0;
let watchToken = 0;

// Direct player state
let kodikHls = null;
let kodikPlayerToken = 0;
let iframePlayerToken = 0;
const kodikEpCache = {}; // `${malId}_${translationId}_${ep}` → link | 'ERROR'

let libriaHls = null;
let libriaGlContext = null;
let libriaRafId = null;
let libriaPlayerToken = 0;
const anilibriaCache = {}; // malId → title object | null

// Kodik (русская озвучка)
const KODIK_TOKEN = '56a768d08f43091901c44b54fe970049';
let currentKodikTranslations = [];  // [{id, title, link}]
let currentKodikTranslationIdx = 0;
let currentKodikEpisodeNums = [];   // реально существующие серии [1, 2, 3, ...]
let currentKodikSeasons = null;     // [{ id, label, episodes }] из Kodik
let currentKinopoiskId = null;      // мост к балансерам Alloha / Collaps / Turbo
let currentPlayerSeasonIdx = 0;
let currentEpisodeSeasonId = null;
let playerEpisodesExpanded = false;
let watchSidebarTab = 'player';
const WATCH_LAYOUT_STORAGE_KEY = 'anyrainy_watch_player_layout';
const EP_GRID_COLLAPSE_THRESHOLD = 24;

function loadWatchPlayerLayout() {
    try {
        const v = localStorage.getItem(WATCH_LAYOUT_STORAGE_KEY);
        if (v === 'horizontal' || v === 'vertical') return v;
    } catch (_) {}
    return 'horizontal';
}

let watchPlayerLayout = loadWatchPlayerLayout();
let watchSidebarCollapsed = localStorage.getItem('anyrainy_watch_sidebar_collapsed') === '1';

function getWatchLayoutClassList() {
    return `watch-player-layout watch-player-layout--with-sidebar watch-player-layout--${watchPlayerLayout}`
        + (watchSidebarCollapsed ? ' watch-player-layout--collapsed' : '');
}

function toggleWatchSidebar() {
    watchSidebarCollapsed = !watchSidebarCollapsed;
    try { localStorage.setItem('anyrainy_watch_sidebar_collapsed', watchSidebarCollapsed ? '1' : '0'); } catch (_) {}
    document.querySelector('.watch-player-layout')?.classList.toggle('watch-player-layout--collapsed', watchSidebarCollapsed);
    document.querySelectorAll('.watch-sidebar-hide-btn').forEach(btn => {
        btn.classList.toggle('watch-layout-btn--active', watchSidebarCollapsed);
    });
}

function applyWatchPlayerLayout() {
    const layout = document.querySelector('.watch-player-layout');
    if (!layout) return;
    layout.classList.remove('watch-player-layout--horizontal', 'watch-player-layout--vertical');
    layout.classList.add(`watch-player-layout--${watchPlayerLayout}`);
}

function setWatchPlayerLayout(mode) {
    if (mode !== 'horizontal' && mode !== 'vertical') return;
    watchPlayerLayout = mode;
    try { localStorage.setItem(WATCH_LAYOUT_STORAGE_KEY, mode); } catch (_) {}
    applyWatchPlayerLayout();
    document.querySelectorAll('.watch-layout-btn').forEach(btn => {
        btn.classList.toggle('watch-layout-btn--active', btn.dataset.watchLayout === mode);
    });
    lucide.createIcons();
}
const kodikCache = {};

function extractKodikEpisodes(results) {
    const epSet = new Set();
    results.forEach(r => {
        const seasons = r.seasons || {};
        Object.values(seasons).forEach(s => {
            Object.keys(s.episodes || {}).forEach(ep => epSet.add(+ep));
        });
        // Fallback: если episodes_count есть, но seasons нет
        if (!epSet.size && r.episodes_count) {
            for (let i = 1; i <= r.episodes_count; i++) epSet.add(i);
        }
    });
    return [...epSet].sort((a, b) => a - b);
}

async function fetchKodikData(malId) {
    if (kodikCache[malId] !== undefined) return kodikCache[malId];
    try {
        // No with_episodes=true — avoids huge responses that silently fail to parse
        const res = await fetch(
            `https://kodik-api.com/search?token=${KODIK_TOKEN}&shikimori_id=${malId}&translation_type=voice&limit=20`
        );
        const data = await res.json();
        if (!data.results?.length) { kodikCache[malId] = { translations: [], episodes: [], kinopoiskId: null }; return kodikCache[malId]; }
        const seen = new Set();
        const translations = data.results
            .filter(r => r.translation?.id && !seen.has(r.translation.id) && seen.add(r.translation.id))
            .map(r => ({
                id: r.translation.id,
                title: r.translation.title,
                link: r.link.startsWith('//') ? 'https:' + r.link : r.link,
            }));
        // Берём максимальный episodes_count по всем результатам (у разных озвучек он может отличаться)
        const epCount = Math.max(0, ...data.results.map(r => r.episodes_count || 0));
        const episodes = epCount > 0 ? Array.from({ length: epCount }, (_, i) => i + 1) : [];
        // Kinopoisk id — мост к балансерам Alloha / Collaps / Turbo
        const kinopoiskId = data.results[0]?.kinopoisk_id
            || data.results[0]?.material_data?.kinopoisk_id || null;
        kodikCache[malId] = { translations, episodes, kinopoiskId };
        return kodikCache[malId];
    } catch (_) { kodikCache[malId] = { translations: [], episodes: [], kinopoiskId: null }; return kodikCache[malId]; }
}

function parseKodikSeasons(result) {
    const seasons = result?.seasons || {};
    const keys = Object.keys(seasons).sort((a, b) => {
        const na = +a, nb = +b;
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return String(a).localeCompare(String(b), undefined, { numeric: true });
    });
    if (!keys.length) return null;
    const out = keys.map(key => {
        const s = seasons[key];
        const eps = Object.keys(s.episodes || {})
            .map(n => +n)
            .filter(n => !isNaN(n) && n > 0)
            .sort((a, b) => a - b);
        if (!eps.length) return null;
        const label = (s.title || s.season_title || '').trim() || t('season_n', key);
        return { id: String(key), label, episodes: eps };
    }).filter(Boolean);
    return out.length ? out : null;
}

async function loadKodikSeasonsMetadata() {
    if (!currentAnime?.malId || !currentKodikTranslations.length) return;
    const tr = currentKodikTranslations[currentKodikTranslationIdx];
    if (!tr) return;
    try {
        const res = await fetch(
            `https://kodik-api.com/search?token=${KODIK_TOKEN}&shikimori_id=${currentAnime.malId}&translation_id=${tr.id}&translation_type=voice&with_episodes=true&limit=1`,
            { signal: AbortSignal.timeout(12000) }
        );
        if (!res.ok) return;
        const data = await res.json();
        const r0 = data.results?.[0];
        const parsed = parseKodikSeasons(r0);
        if (parsed?.length) {
            currentKodikSeasons = parsed;
            currentKodikEpisodeNums = [...new Set(parsed.flatMap(s => s.episodes))].sort((a, b) => a - b);
        } else if (r0?.episodes_count > 1) {
            // У тайтла нет структуры сезонов, но есть счётчик серий — строим список из него
            currentKodikSeasons = null;
            currentKodikEpisodeNums = Array.from({ length: r0.episodes_count }, (_, i) => i + 1);
        } else {
            return;
        }
        syncPlayerSeasonForEpisode(currentEpisodeNum);
        refreshPlayerChrome(true);
    } catch (_) {}
}

function syncPlayerSeasonForEpisode(ep) {
    const seasons = getPlayerSeasons();
    if (!seasons.length) return;
    const hit = seasons.findIndex(s => s.episodes.includes(ep));
    if (hit >= 0) {
        currentPlayerSeasonIdx = hit;
        currentEpisodeSeasonId = seasons[hit].id;
        return;
    }
    currentPlayerSeasonIdx = 0;
    currentEpisodeSeasonId = seasons[0]?.id ?? null;
}

// Получить ссылку конкретного эпизода из Kodik (с кешированием)
async function fetchKodikEpisodeLink(malId, translationId, ep, seasonId = null) {
    const key = `${malId}_${translationId}_${seasonId || '_'}_${ep}`;
    if (kodikEpCache[key]) return kodikEpCache[key] === 'ERROR' ? null : kodikEpCache[key];
    // Всегда берём seria-ссылку из API (тип seria нужен для /ftor)
    try {
        const res = await fetch(
            `https://kodik-api.com/search?token=${KODIK_TOKEN}&shikimori_id=${malId}&translation_id=${translationId}&translation_type=voice&with_episodes=true&limit=1`
        );
        if (!res.ok) { kodikEpCache[key] = 'ERROR'; return null; }
        const data = await res.json();
        const r = data.results?.[0];
        if (!r) { kodikEpCache[key] = 'ERROR'; return null; }

        // Ищем эпизод в seasons (приоритет — выбранный сезон)
        const allSeasons = r.seasons || {};
        const seasonEntries = seasonId && allSeasons[seasonId]
            ? [[seasonId, allSeasons[seasonId]]]
            : Object.entries(allSeasons);
        for (const [, season] of seasonEntries) {
            const epData = season.episodes?.[ep] ?? season.episodes?.[String(ep)];
            const rawLink = typeof epData === 'string' ? epData : epData?.link;
            if (rawLink) {
                const link = rawLink.startsWith('//') ? 'https:' + rawLink : rawLink;
                kodikEpCache[key] = link;
                return link;
            }
        }

        // Fallback: основная ссылка (соответствует ep 1)
        if (r.link) {
            const link = r.link.startsWith('//') ? 'https:' + r.link : r.link;
            kodikEpCache[key] = link;
            return link;
        }
    } catch (_) {}

    kodikEpCache[key] = 'ERROR';
    return null;
}

// AniList ID для VidPlus
const anilistIdCache = {};

async function fetchAnilistId(malId) {
    if (anilistIdCache[malId]) return anilistIdCache[malId];
    try {
        const res = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: 'query ($id: Int) { Media(idMal: $id, type: ANIME) { id } }',
                variables: { id: malId }
            }),
            signal: AbortSignal.timeout(8000),
        });
        const data = await res.json();
        const id = data?.data?.Media?.id;
        if (id) anilistIdCache[malId] = id;
        return id || null;
    } catch (_) { return null; }
}

function kodikFindPlayerUrl(malId, ep) {
    return `https://kodik.info/find-player?token=${KODIK_TOKEN}&shikimori_id=${malId}&with_episodes=true&episode=${ep}`;
}

async function resolveAnimegoEmbedUrl(provider, malId, ep) {
    if (!malId || (!needsKodikProxy() && !BACKEND)) return null;
    const params = new URLSearchParams({
        provider,
        malId: String(malId),
        ep: String(ep || 1),
    });
    if (currentAnime?.displayTitle) params.set('title', currentAnime.displayTitle);
    try {
        const res = await fetch(`${BACKEND}/embed-resolve?${params}`, { signal: AbortSignal.timeout(22000) });
        if (!res.ok) return null;
        const data = await res.json();
        return data.url || null;
    } catch (_) {
        return null;
    }
}

async function resolveAniboomEmbedUrl(malId, ep) {
    return resolveAnimegoEmbedUrl('aniboom', malId, ep);
}

async function resolveSibnetEmbedUrl(malId, ep) {
    return resolveAnimegoEmbedUrl('sibnet', malId, ep);
}

// Балансеры из плейлиста AnimeGO (CVH, Alloha, Aksor)
async function resolveCvhEmbedUrl(malId, ep) {
    return resolveAnimegoEmbedUrl('cvh', malId, ep);
}

async function resolveAksorEmbedUrl(malId, ep) {
    return resolveAnimegoEmbedUrl('aksor', malId, ep);
}

// ── Балансеры по Kinopoisk id (Alloha / Collaps / Turbo) через сервер ──────────
async function ensureKinopoiskId(malId) {
    if (currentKinopoiskId) return currentKinopoiskId;
    try {
        const d = await fetchKodikData(malId);
        currentKinopoiskId = d.kinopoiskId || null;
    } catch (_) {}
    return currentKinopoiskId;
}

async function resolveBalancerUrl(provider, malId) {
    if (!needsKodikProxy() && !BACKEND) return null;
    const kp = await ensureKinopoiskId(malId);
    if (!kp) return null;
    try {
        const res = await fetch(`${BACKEND}/balancer-resolve?provider=${provider}&kp=${kp}`, { signal: AbortSignal.timeout(16000) });
        if (!res.ok) return null;
        const data = await res.json();
        return data.url || null;
    } catch (_) { return null; }
}

async function resolveAllohaPlayerUrl(malId)  { return resolveBalancerUrl('alloha', malId); }
async function resolveCollapsUrl(malId)        { return resolveBalancerUrl('collaps', malId); }
async function resolveTurboUrl(malId)          { return resolveBalancerUrl('turbo', malId); }

// ── JutSu (jut.su) — отдельный сайт, ссылка по slug названия ───────────────────
function jutsuSlug(title) {
    return String(title || '')
        .toLowerCase()
        .replace(/['’`.,:!?()]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

async function resolveJutsuUrl(malId, ep) {
    const slug = jutsuSlug(currentAnime?.title || currentAnime?.displayTitle);
    if (!slug) return null;
    // У jut.su нет id-API; формируем прямую ссылку на эпизод (может не встроиться из-за защиты от фрейма)
    return `https://jut.su/${slug}/episode-${ep || 1}.html`;
}

async function resolveVidPlusUrl(malId, ep) {
    const anilistId = await fetchAnilistId(malId);
    if (!anilistId) return null;
    // Без темизации AnyRainy — родной вид плеера. autoNext не оформление, оставляем.
    return `https://player.vidplus.to/embed/anilist/${anilistId}/${ep}?autoNext=true`;
}

// Плееры на странице просмотра
const WATCH_EMBED_PLAYERS = [
    { name: 'Aloha', key: 'alloha', type: 'iframe', builtinSelection: false,
      resolveUrl: resolveAllohaPlayerUrl },
    { name: 'Collaps', key: 'collaps', type: 'iframe', builtinSelection: false,
      resolveUrl: resolveCollapsUrl },
    { name: 'Kodik RU', key: 'kodik', type: 'kodik', builtinSelection: false },
    { name: 'AniLibria 4K', key: 'libria', type: 'libria', builtinSelection: false },
    { name: 'AniBoom', key: 'aniboom', type: 'iframe', builtinSelection: false,
      resolveUrl: resolveAniboomEmbedUrl },
    { name: 'CVH', key: 'cvh', type: 'iframe', builtinSelection: false,
      resolveUrl: resolveCvhEmbedUrl },
    { name: 'Turbo', key: 'turbo', type: 'iframe', builtinSelection: false,
      resolveUrl: resolveTurboUrl },
    { name: 'Aksor', key: 'aksor', type: 'iframe', builtinSelection: false,
      resolveUrl: resolveAksorEmbedUrl },
    { name: 'Sibnet', key: 'sibnet', type: 'iframe', builtinSelection: false,
      resolveUrl: resolveSibnetEmbedUrl },
    { name: 'JutSu', key: 'jutsu', type: 'newtab', builtinSelection: false,
      resolveUrl: resolveJutsuUrl },
    { name: 'MegaPlay (Jap+Sub)', key: 'megaplay', type: 'iframe', builtinSelection: false,
      url: (malId, ep) => `https://animeplay.cfd/stream/mal/${malId}/${ep}/sub` },
    { name: 'MegaPlay (Dub)', key: 'megaplay-dub', type: 'iframe', builtinSelection: false,
      url: (malId, ep) => `https://animeplay.cfd/stream/mal/${malId}/${ep}/dub` },
    { name: 'VidPlus (Sub/Dub)', key: 'vidplus', type: 'iframe', builtinSelection: false,
      resolveUrl: resolveVidPlusUrl },
    { name: 'Kodik Embed', key: 'kodik-embed', type: 'iframe', builtinSelection: false,
      url: (malId, ep) => {
          const tr = currentKodikTranslations[currentKodikTranslationIdx];
          return buildKodikFindPlayerUrl(malId, ep, tr?.id);
      } },
];

const HENTAI_SERVERS = [
    { name: 'HentaiPlay', key: 'hentaiplay', type: 'iframe', builtinSelection: false,
      url: (malId, ep) => `https://animeplay.cfd/stream/mal/${malId}/${ep}/sub` },
    { name: 'HentaiPlay DUB', key: 'hentaiplay-dub', type: 'iframe', builtinSelection: false,
      url: (malId, ep) => `https://animeplay.cfd/stream/mal/${malId}/${ep}/dub` },
    { name: 'Kodik 18+', key: 'kodik-embed', type: 'iframe', builtinSelection: false,
      url: (malId, ep) => buildKodikFindPlayerUrl(malId, ep) },
];

function isHentaiAnime(anime) {
    return !!(anime?.tags || []).includes('Hentai');
}

function getActiveServers() {
    return currentAnime && isHentaiAnime(currentAnime) ? HENTAI_SERVERS : WATCH_EMBED_PLAYERS;
}

function getWatchPlayerByKey(key) {
    return getActiveServers().find(s => s.key === key);
}

function getWatchPlayerIndex(key) {
    return getActiveServers().findIndex(s => s.key === key);
}

function isKodikWatchPlayer() {
    const key = getActiveServers()[currentServerIndex]?.key;
    return key === 'kodik' || key === 'kodik-embed';
}

function isNativeKodikPlayer() {
    return getActiveServers()[currentServerIndex]?.key === 'kodik';
}

// ─── Genre translations ───────────────────────────────────────────────────────

const genreTranslations = {
    // Explicit genres
    Action: 'Экшен', Adventure: 'Приключения', 'Avant Garde': 'Авангард',
    'Award Winning': 'Отмечено наградами', 'Boys Love': 'Сёнэн-ай',
    Comedy: 'Комедия', Drama: 'Драма', Ecchi: 'Этти', Erotica: 'Эротика', Hentai: 'Хентай',
    Fantasy: 'Фэнтези', 'Girls Love': 'Сёдзё-ай', Gourmet: 'Гурман',
    Harem: 'Гарем', Horror: 'Ужасы', Mystery: 'Мистика', Romance: 'Романтика',
    'Sci-Fi': 'Научная фантастика', 'Slice of Life': 'Повседневность',
    Sports: 'Спорт', Supernatural: 'Сверхъестественное', Suspense: 'Саспенс',
    Psychological: 'Психология', Thriller: 'Триллер', Mecha: 'Меха',
    Music: 'Музыка', School: 'Школа', Seinen: 'Сэйнэн', Shoujo: 'Сёдзё',
    Shounen: 'Сёнэн', Josei: 'Дзёсэй', Kids: 'Для детей',
    // Themes
    Military: 'Военное', Parody: 'Пародия', Samurai: 'Самурай',
    'Martial Arts': 'Боевые искусства', Historical: 'Исторический',
    Space: 'Космос', Racing: 'Гонки', 'Super Power': 'Суперспособности',
    Vampire: 'Вампиры', Demons: 'Демоны', Magic: 'Магия',
    Police: 'Полиция', Prison: 'Тюрьма', Mythology: 'Мифология',
    Survival: 'Выживание', 'Time Travel': 'Путешествия во времени',
    Isekai: 'Исэкай', 'Reverse Harem': 'Обратный гарем',
    'Video Game': 'Видеоигры', Workplace: 'Работа', CGDCT: 'Милые девушки',
    Childcare: 'Уход за детьми', Delinquents: 'Хулиганы',
    Detective: 'Детектив', Educational: 'Образовательное',
    'Gag Humor': 'Абсурдный юмор', Gore: 'Жестокость',
    'High Stakes Game': 'Смертельные игры', Idols: 'Айдолы',
    Iyashikei: 'Успокаивающее', 'Love Polygon': 'Любовный многоугольник',
    'Magical Sex Shift': 'Смена пола', 'Medical': 'Медицина',
    'Meta': 'Мета', 'Music': 'Музыка', 'Mythology': 'Мифология',
    'Organized Crime': 'Организованная преступность',
    'Otaku Culture': 'Отаку-культура', Performing: 'Выступления',
    Pets: 'Питомцы', Reincarnation: 'Реинкарнация', Romantic: 'Романтическое',
    'Showbiz': 'Шоу-бизнес', Strategy: 'Стратегия', 'Team Sports': 'Командный спорт',
    'Urban Fantasy': 'Городское фэнтези', 'Visual Arts': 'Визуальные искусства',
};

function translateGenre(name) {
    return genreTranslations[name] || name;
}

// ─── Data normalization ───────────────────────────────────────────────────────

function normalizeAnimeItem(item) {
    const titleRu = getRussianTitle(item);
    const titleEn = item.title_english || item.title || titleRu;
    const rawSynopsis = item.synopsis || '';
    const contentRating = item.rating || '';
    const adultGenres = ['Hentai', 'Erotica', 'Ecchi'];
    const genres = (item.genres || []).map(g => g.name);
    const isAdult = /^(Rx|R\+)/i.test(contentRating) || genres.some(g => adultGenres.includes(g));
    return {
        id: item.mal_id,
        title: item.title,
        titleRu,
        titleEn,
        displayTitle: currentLang === 'en' ? titleEn : titleRu,
        tags: genres,
        studios: (item.studios || []).map(s => ({ id: s.mal_id, name: s.name })),
        rating: item.score || 0,
        episodes: item.episodes || 12,
        image: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || '',
        synopsis: rawSynopsis,
        synopsisEn: rawSynopsis,
        year: item.year || '',
        season: item.season || '',
        status: item.status || '',
        kind: (item.type || '').toLowerCase(),
        malId: item.mal_id,
        isAdult,
        episodesList: []
    };
}

function normalizeShikimoriItem(item) {
    const id = Number(item.id);
    const titleRu = item.russian || item.name || '';
    const titleEn = item.name || '';
    const year = item.aired_on ? parseInt(item.aired_on.substring(0, 4)) : (item.released_on ? parseInt(item.released_on.substring(0, 4)) : '');
    const imgBase = 'https://shikimori.io';
    const imageUrl = item.image?.original ? imgBase + item.image.original
                   : item.image?.preview  ? imgBase + item.image.preview : '';
    const genres  = (item.genres  || []).map(g => g.russian || g.name).filter(Boolean);
    const studios = (item.studios || []).map(s => ({ id: s.id, name: s.name }));
    const isAdult = (item.rating || '') === 'rx';
    return {
        id, malId: id,
        title: titleEn, titleRu, titleEn,
        displayTitle: currentLang === 'en' ? titleEn : (titleRu || titleEn),
        tags: genres, studios,
        rating: parseFloat(item.score) || 0,
        episodes: item.episodes || null,
        image: imageUrl,
        synopsis: '', synopsisEn: '',
        year, season: item.season || '',
        status: item.status || '',
        kind: item.kind || '',
        isAdult, episodesList: []
    };
}

function mergeAnimeResults(existingItems, nextItems) {
    const existingIds = new Set(existingItems.map(item => item.id));
    const merged = [...existingItems];
    nextItems.forEach(item => {
        if (!existingIds.has(item.id)) { merged.push(item); existingIds.add(item.id); }
    });
    return merged;
}

function findAnimeById(id) {
    return animeData.find(item => item.id === id)
        || recommendedAnime.find(item => item.id === id)
        || ongoingAnime.find(item => item.id === id)
        || topRowAnime.find(item => item.id === id)
        || popularRowAnime.find(item => item.id === id)
        || null;
}

function getRussianTitle(item) {
    const titles = item.titles || [];
    const russianTitle = titles.find(t => t.type === 'Russian' && t.title);
    if (russianTitle) return russianTitle.title;

    const cyrillicTitle = [
        item.title, item.title_english, item.title_japanese,
        ...(item.title_synonyms || []),
        ...titles.map(t => t.title)
    ].find(title => title && /[Ѐ-ӿ]/.test(title));

    return cyrillicTitle || item.title_english || item.title || 'Без названия';
}

// ─── Ongoings (AniLibria — российский хостинг, работает без VPN) ──────────────

const ANILIBRIA_BASE = 'https://anilibria.top';
const ANIME_KIND_KEYS = {
    tv: 'kind_tv', movie: 'kind_movie', ova: 'kind_ova', ona: 'kind_ona',
    special: 'kind_special', music: 'kind_music',
};

function updateOngoingMeta() {
    const el = document.getElementById('ongoing-sub');
    if (!el) return;
    el.textContent = ongoingDataSource === 'anilibria' ? t('ongoing_sub_libria') : t('ongoing_sub_mal');
}

function formatAnimeKind(kind) {
    const k = (kind || 'tv').toLowerCase();
    const key = ANIME_KIND_KEYS[k];
    return key ? t(key) : k.toUpperCase();
}

function formatAnimeStatus(status) {
    const s = (status || '').toLowerCase();
    if (s.includes('airing') && s.includes('not yet')) return t('status_upcoming');
    if (s.includes('currently') || s === 'ongoing') return t('status_airing');
    if (s.includes('finished') || s === 'finished_airing') return t('status_finished');
    return status || '';
}

function toggleSynopsis() {
    const el = document.getElementById('anime-synopsis');
    const btn = document.getElementById('synopsis-toggle-btn');
    if (!el || !btn) return;
    const expanded = el.classList.toggle('synopsis-expanded');
    btn.textContent = expanded ? t('info_collapse') : t('info_read_more');
}

function anilibriaPosterUrl(item) {
    const p = item.poster || {};
    const rel = p.optimized?.src || p.src || p.preview || p.thumbnail || '';
    if (!rel) return '';
    return rel.startsWith('http') ? rel : `${ANILIBRIA_BASE}${rel}`;
}

function normalizeAnilibriaOngoing(item) {
    const titleRu = item.name?.main || '';
    const titleEn = item.name?.english || item.name?.alternative || titleRu;
    const isAdult = !!item.age_rating?.is_adult;
    const kind = (item.type?.value || 'tv').toLowerCase();
    return {
        id: 90000000 + (item.id || 0),      // отдельное пространство id, чтобы не конфликтовать с MAL
        alId: item.id,
        malId: null,
        source: 'anilibria',
        searchName: titleEn || titleRu,
        title: titleRu || titleEn,
        titleRu,
        titleEn,
        displayTitle: currentLang === 'en' ? titleEn : titleRu,
        tags: (item.genres || []).map(g => g.name).slice(0, 3),
        rating: '',                          // в каталоге AniLibria рейтинга нет
        episodes: item.episodes_total || 0,
        episodesAired: item.latest_episode?.ordinal || 0,
        image: anilibriaPosterUrl(item),
        synopsis: item.description || '',
        synopsisEn: '',
        year: item.year || '',
        kind,
        status: 'ongoing',
        isAdult,
        episodesList: [],
    };
}

function getOngoingDisplayTitle(anime) {
    if (currentLang === 'en') return anime.titleEn || anime.title || anime.displayTitle;
    if (anime.titleRu && /[Ѐ-ӿ]/.test(anime.titleRu)) return anime.titleRu;
    const cached = getCachedRuTitle(anime.malId || anime.id);
    if (cached) return cached;
    return anime.displayTitle || anime.title;
}

function renderOngoingCards(items) {
    if (!items.length) return '';
    return items.map(anime => {
        if (anime.isAdult) return '';
        const title = getOngoingDisplayTitle(anime);
        const meta = [anime.year, formatAnimeKind(anime.kind)].filter(Boolean).join(' • ');
        const epTotal = anime.episodes || '?';
        const epBadge = anime.episodesAired > 0
            ? `${anime.episodesAired}${epTotal !== '?' ? ' / ' + epTotal : ''}`
            : epTotal;
        const ratingChip = anime.rating
            ? `<i data-lucide="star" class="w-3 h-3 fill-yellow-400 text-yellow-400"></i><span>${anime.rating}</span><span class="text-white/50 font-normal">·</span>`
            : `<i data-lucide="play" class="w-3 h-3 text-airbnb fill-airbnb"></i>`;
        const onclick = anime.source === 'anilibria'
            ? `openOngoing(${anime.id})`
            : `watchAnime(${anime.id})`;
        return `
        <article class="ongoing-card anim-item cursor-pointer group" onclick="${onclick}">
            <div class="relative aspect-[3/4] overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800 mb-2.5">
                <img src="${proxyImg(anime.image)}" alt="${escapeHtml(title)}"
                     class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                     loading="lazy" onerror="imgFallback(this)">
                <div class="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-black/55 backdrop-blur-md text-white text-[11px] font-semibold">
                    ${ratingChip}
                    <span class="text-white/90 font-medium">${epBadge}</span>
                </div>
            </div>
            <h3 class="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2 leading-snug min-h-[2.5rem]" data-title-id="${anime.id}">${escapeHtml(title)}</h3>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">${escapeHtml(meta || t('episodes_count', anime.episodes || '?'))}</p>
        </article>`;
    }).join('');
}

// Клик по онгоингу AniLibria: у тайтла нет MAL id, поэтому резолвим его
// через поиск Jikan по названию и открываем штатный плеер.
async function openOngoing(id) {
    const anime = ongoingAnime.find(a => a.id === id);
    if (!anime) return;

    showSection('watch');
    showAnimeLoadingScreen(anime.searchName || anime.displayTitle || '');

    try {
        setLoadingProgress('anime', 20);
        const res = await jikanFetch(
            `/anime?q=${encodeURIComponent(anime.searchName)}&limit=1`,
            AbortSignal.timeout(12000)
        );
        const data = await res.json();
        const malId = data.data?.[0]?.mal_id;
        if (malId) { setLoadingProgress('anime', 45); await fetchAndWatchByMalId(malId); return; }
    } catch (_) {}

    stopLoadingProgress('anime');
    const container = document.getElementById('player-container');
    if (container) container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-64 gap-4 text-center px-6">
            <i data-lucide="alert-circle" class="w-10 h-10 text-gray-400"></i>
            <p class="text-sm text-gray-500 dark:text-gray-400">${escapeHtml(t('ongoing_no_match'))}</p>
            <button onclick="showSection('home')" class="px-4 py-2 rounded-xl bg-airbnb text-white text-sm font-semibold hover:bg-airbnbDark transition-colors">${t('back_to_catalog')}</button>
        </div>`;
    lucide.createIcons();
}

// ─── Home carousels (rows) ────────────────────────────────────────────────────
// Параметры для /shiki-catalog по категории
function categoryShikiParams(cat, page, limit) {
    const L = limit || PAGE_SIZE;
    if (cat === 'ongoing') return `order=ranked&status=ongoing&kind=tv,ona&page=${page}&limit=${L}`;
    if (cat === 'popular') return `order=popularity&kind=tv,movie,ona&page=${page}&limit=${L}`;
    return `order=ranked&kind=tv,movie,ona&page=${page}&limit=${L}`;
}

// Shikimori API напрямую из браузера (поддерживает CORS)
// Параметры уже в формате Shikimori: order, kind, status, search, page, limit
function shikiCatalogFetch(params, signal) {
    const url = `https://shikimori.io/api/animes?${params}`;
    return signal ? fetch(url, { signal }) : fetch(url);
}

function getRow(cat) {
    if (cat === 'ongoing') return ongoingAnime;
    if (cat === 'popular') return popularRowAnime;
    return topRowAnime;
}
function setRow(cat, items) {
    if (cat === 'ongoing') ongoingAnime = items;
    else if (cat === 'popular') popularRowAnime = items;
    else topRowAnime = items;
}

function mapJikanItem(it) {
    const a = normalizeAnimeItem(it);
    a.kind = (it.type || '').toLowerCase() || 'tv';
    return a;
}

function renderCarousel(cat) {
    const track = document.getElementById(`${cat}-track`);
    if (!track) return;
    const items = getRow(cat);

    if (rowLoadState[cat] && !items.length) {
        track.innerHTML = `
            <div class="ongoing-card flex items-center justify-center aspect-[3/4] rounded-xl bg-gray-100 dark:bg-[#1e1e1e] animate-pulse">
                <span class="text-xs text-gray-400">${t('ongoing_loading')}</span>
            </div>`.repeat(5);
        return;
    }
    if (!items.length) {
        if (rowFailed[cat]) {
            track.innerHTML = `
                <div class="flex flex-col items-center justify-center min-w-full py-10 gap-3 text-center">
                    <p class="text-sm text-gray-500 dark:text-gray-400">${t('ongoing_error')}</p>
                    <button type="button" onclick="fetchCarousel('${cat}')"
                        class="px-4 py-2 rounded-xl bg-airbnb text-white text-sm font-semibold hover:bg-airbnbDark transition-colors">${t('ongoing_retry')}</button>
                </div>`;
        } else {
            track.innerHTML = `<div class="text-sm text-gray-500 dark:text-gray-400 py-8 w-full text-center">${t('ongoing_empty')}</div>`;
        }
        return;
    }
    track.innerHTML = renderOngoingCards(items);
    if (cat === 'ongoing') updateOngoingMeta();
    lucide.createIcons();
    staggerAnimItems(track);
}

// Совместимость со старым кодом / разметкой
function renderOngoings() { renderCarousel('ongoing'); }
const _scrollTargets = {};
function scrollRow(cat, direction) {
    const track = document.getElementById(`${cat}-track`);
    if (!track) return;
    const step = track.clientWidth * 0.85;
    const max = track.scrollWidth - track.clientWidth;
    const current = _scrollTargets[cat] ?? track.scrollLeft;
    const target = Math.max(0, Math.min(max, current + step * (direction < 0 ? -1 : 1)));
    _scrollTargets[cat] = target;
    track.scrollTo({ left: target, behavior: 'smooth' });
    // сбрасываем target после завершения анимации
    clearTimeout(_scrollTargets[`${cat}_t`]);
    _scrollTargets[`${cat}_t`] = setTimeout(() => { delete _scrollTargets[cat]; }, 600);
}
function scrollOngoingRow(direction) { scrollRow('ongoing', direction); }
function viewAllOngoings() { openCategory('ongoing'); }

// AniLibria — запасной источник для онгоингов (работает без VPN)
async function fetchOngoingFallback() {
    try {
        const url = `${ANILIBRIA_BASE}/api/v1/anime/catalog/releases`
            + `?filter[is_ongoing]=true&limit=${ROW_LIMIT}&page=1&sorting=FRESH_AT_DESC`;
        const res = await anilibriaFetch(url, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) throw new Error(`AniLibria HTTP ${res.status}`);
        const json = await res.json();
        const items = json.data || json || [];
        return (Array.isArray(items) ? items : [])
            .map(normalizeAnilibriaOngoing)
            .filter(a => a && !a.isAdult);
    } catch (err) {
        return [];
    }
}

async function fetchCarousel(cat) {
    if (rowLoadState[cat]) return;
    rowLoadState[cat] = true;
    rowFailed[cat] = false;
    renderCarousel(cat);

    try {
        const res = await shikiCatalogFetch(categoryShikiParams(cat, 1, ROW_LIMIT), AbortSignal.timeout(15000));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const items = (Array.isArray(data) ? data : []).map(normalizeShikimoriItem).filter(a => !a.isAdult && a.rating > 0);
        if (!items.length) throw new Error('empty');
        setRow(cat, items);
        if (cat === 'ongoing') ongoingDataSource = 'shikimori';
    } catch (err) {
        if (cat === 'ongoing') {
            const fb = await fetchOngoingFallback();
            if (fb.length) { setRow('ongoing', fb); ongoingDataSource = 'anilibria'; }
            else rowFailed.ongoing = true;
        } else {
            rowFailed[cat] = true;
        }
    } finally {
        rowLoadState[cat] = false;
        renderCarousel(cat);
    }
}

// Грузим карусели последовательно, чтобы не упереться в лимит Jikan (3 req/sec)
async function loadHomeRows() {
    renderContinueWatching();
    renderAdminPicks();
    ['ongoing', 'top', 'popular'].forEach(renderCarousel);
    for (const cat of ['ongoing', 'top', 'popular']) {
        if (!getRow(cat).length && !rowLoadState[cat]) await fetchCarousel(cat);
    }
}

// ─── Личные советы от админки (рукописные розовые подписи) ─────────────────────
// Поставь true, когда начнёшь хостить, — раздел появится внизу главной.
const ADMIN_PICKS_ENABLED = false;
// Редактируй этот список: malId аниме + личная подпись, почему именно оно.
const ADMIN_PICKS = [
    { malId: 30,    note: 'потому что мне кажется, что аска — это буквально я.' },
    { malId: 52991, note: 'смотрел под дождь и плакал, фрирен — это про то, как мы не ценим время.' },
    { malId: 9253,  note: 'эль псай конгру. если любишь, когда мозг кипит — это твоё.' },
    { malId: 1,     note: 'самый стильный космос. джаз, одиночество и спайк. see you, space cowboy.' },
    { malId: 37521, note: 'тут больно по-настоящему. торфинн прошёл путь, который я бы не вывез.' },
    { malId: 34599, note: 'милая картинка обманывает — бездна сожрёт твою душу. обожаю.' },
];
const _adminPickCache = {};
let _adminPicksRendered = false;

async function renderAdminPicks() {
    const section = document.getElementById('admin-picks-section');
    if (!section) return;
    if (!ADMIN_PICKS_ENABLED) { section.classList.add('hidden'); return; }
    if (_adminPicksRendered) return;
    _adminPicksRendered = true;

    const cards = ADMIN_PICKS.map(p => `
        <article class="ongoing-card admin-pick-card cursor-pointer group" onclick="fetchAndWatchByMalId(${p.malId})">
            <div class="relative aspect-[3/4] overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800 mb-2.5">
                <img data-admin-poster="${p.malId}" alt=""
                     class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy">
            </div>
            <h3 class="admin-pick-title text-sm font-semibold text-gray-900 dark:text-white line-clamp-1" data-admin-title="${p.malId}">…</h3>
            <p class="admin-pick-note">${escapeHtml(p.note)}</p>
        </article>`).join('');

    section.innerHTML = `
        <div class="admin-picks-head">
            <span class="admin-picks-emoji">💗</span>
            <div>
                <h2 class="admin-picks-title">${t('admin_picks_title')}</h2>
                <p class="admin-picks-sub">${t('admin_picks_sub')}</p>
            </div>
        </div>
        <div class="admin-picks-scroll ongoing-scroll flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">${cards}</div>`;
    lucide.createIcons();
    loadAdminPickPosters();
}

async function loadAdminPickPosters() {
    await Promise.all(ADMIN_PICKS.map(async p => {
        const detail = await fetchAnimeDetail(p.malId).catch(() => null);
        if (!detail) return;
        _adminPickCache[p.malId] = { img: detail.image, title: detail.title };
        const img = document.querySelector(`img[data-admin-poster="${p.malId}"]`);
        if (img && detail.image) img.src = proxyImg(detail.image);
        const titleEl = document.querySelector(`[data-admin-title="${p.malId}"]`);
        if (titleEl && detail.title) titleEl.textContent = detail.title;
    }));
}

// Обратная совместимость: старое имя
function fetchOngoings() { return fetchCarousel('ongoing'); }

// ─── Category list / «Смотреть все» ───────────────────────────────────────────

async function fetchCategory({ cat = 'top', page = 1, append = false } = {}) {
    if (currentSearchController) { currentSearchController.abort(); currentSearchController = null; }
    const requestToken = ++latestSearchToken;
    currentSearchController = new AbortController();
    if (!append) setCatalogLoadingState(true);

    try {
        const res = await shikiCatalogFetch(categoryShikiParams(cat, page, PAGE_SIZE), currentSearchController.signal);
        const data = await res.json();
        if (requestToken !== latestSearchToken) return;

        const items = (Array.isArray(data) ? data : []).map(normalizeShikimoriItem).filter(a => !a.isAdult);
        currentCatalogMode = cat;
        listCategory = cat;
        currentCatalogQuery = '';
        currentCatalogPage = page;
        hasMoreAnime = items.length >= PAGE_SIZE;
        recommendedAnime = [];
        animeData = append ? mergeAnimeResults(animeData, items) : items;
    } catch (error) {
        if (error.name === 'AbortError') return;
    } finally {
        if (requestToken === latestSearchToken) {
            currentSearchController = null;
            isLoadingMore = false;
            setCatalogLoadingState(false);
            if (currentSection === 'list') renderCatalog(append);
        }
    }
}

async function renderCategoryView(cat) {
    listCategory = cat;
    currentCatalogMode = cat;
    currentCatalogQuery = '';
    currentCatalogPage = 1;
    hasMoreAnime = true;
    animeData = [];
    isSearching = false;
    selectedGenres.clear();
    showSection('list');
    updateCatalogMeta();
    renderSortPanel();
    renderCatalog();
    await fetchCategory({ cat, page: 1, append: false });
}

function openCategory(cat) {
    renderCategoryView(cat);
    history.pushState({ category: cat, fromHome: true }, '', '#cat/' + cat);
    document.title = 'AnyRainy';
}

// Полный каталог — открывается из кнопки «Каталог» в навигации и CTA-кнопки внизу главной.
async function openCatalog({ fromHistory = false } = {}) {
    if (currentSearchController) {
        currentSearchController.abort();
        currentSearchController = null;
    }
    latestSearchToken++;
    currentCatalogMode = 'full';
    listCategory = 'top';
    currentCatalogQuery = '';
    currentCatalogPage = 1;
    hasMoreAnime = true;
    animeData = [];
    isSearching = false;
    selectedGenres.clear();
    genreFilterOpen = false;
    sortPanelOpen = false;
    syncSearchInputs('');
    showSection('list');
    if (!fromHistory) history.pushState({ catalog: true }, '', '#catalog');
    document.title = 'AnyRainy';
    updateCatalogMeta();
    renderSortPanel();
    renderCatalog();
    await fetchTopAnime({ page: 1, append: false, mode: 'full' });
    _catalogInitialized = true;
}

// Кэшированный переход в каталог: если уже загружен — просто показываем (для плавной анимации)
let _catalogInitialized = false;
function goCatalog() {
    if (_catalogInitialized && currentCatalogMode === 'full' && !isSearching && animeData.length) {
        showSection('list');
        if (location.hash !== '#catalog') history.pushState({ catalog: true }, '', '#catalog');
        return;
    }
    openCatalog();
}

function goHome() {
    if (currentSearchController) {
        currentSearchController.abort();
        currentSearchController = null;
    }
    latestSearchToken++;
    isSearching = false;
    sortPanelOpen = false;
    genreFilterOpen = false;
    syncSearchInputs('');
    if (location.hash) history.replaceState({}, '', location.pathname);
    showSection('home');
}

function closeCategory() {
    if (location.hash.startsWith('#cat/') && history.length > 1) {
        history.back();
    } else {
        goHome();
    }
}

function playRandomAnime() {
    const pool = [...topRowAnime, ...popularRowAnime, ...ongoingAnime].filter(a => a.malId);
    if (pool.length) {
        const pick = pool[Math.floor(Math.random() * pool.length)];
        watchAnime(pick.id);
        return;
    }
    const page = Math.floor(Math.random() * 20) + 1;
    shikiCatalogFetch(`order=ranked&kind=tv,movie&limit=25&page=${page}`)
        .then(r => r.json())
        .then(d => {
            const list = (Array.isArray(d) ? d : []).map(normalizeShikimoriItem).filter(a => !a.isAdult);
            if (!list.length) return;
            const pick = list[Math.floor(Math.random() * list.length)];
            if (!animeData.find(a => a.id === pick.id)) animeData.push(pick);
            watchAnime(pick.id);
        })
        .catch(() => {});
}

function goBackFromWatch() {
    if (location.hash && history.length > 1) history.back();
    else showSection('home');
}

function getCachedRuTitle(malId) {
    return localStorage.getItem(`anyrainy_title_ru_${malId}`) || null;
}
function setCachedRuTitle(malId, title) {
    localStorage.setItem(`anyrainy_title_ru_${malId}`, title);
}

// ─── Russian titles (Kodik → MyMemory, без Shikimori) ────────────────────────

function applyRussianTitle(anime, ruTitle) {
    if (!ruTitle || !/[Ѐ-ӿ]/.test(ruTitle)) return;
    const malId = anime.malId || anime.id;
    setCachedRuTitle(malId, ruTitle);
    anime.titleRu = ruTitle;
    anime.displayTitle = ruTitle;
    document.querySelectorAll(`[data-title-id="${anime.id}"]`).forEach(el => { el.textContent = ruTitle; });
}

async function runPool(items, concurrency, worker) {
    const queue = [...items];
    const runners = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
        while (queue.length) await worker(queue.shift());
    });
    await Promise.all(runners);
}

async function enrichWithRussianTitles(items) {
    if (currentLang !== 'ru') return;

    const toEnrich = items.filter(a => {
        if (a.titleRu && /[Ѐ-ӿ]/.test(a.titleRu)) return false;
        if (getCachedRuTitle(a.malId || a.id)) return false;
        return true;
    });
    if (!toEnrich.length) return;

    toEnrich.forEach(anime => {
        const cached = getCachedRuTitle(anime.malId || anime.id);
        if (cached) applyRussianTitle(anime, cached);
    });

    const stillMissing = toEnrich.filter(a => !(a.titleRu && /[Ѐ-ӿ]/.test(a.titleRu)));
    if (!stillMissing.length) return;

    const afterKodik = [];
    await runPool(stillMissing, 4, async (anime) => {
        const malId = anime.malId || anime.id;
        if (!malId) { afterKodik.push(anime); return; }
        try {
            const res = await fetch(
                `https://kodik-api.com/search?token=${KODIK_TOKEN}&shikimori_id=${malId}&with_material_data=true&limit=1`,
                { signal: AbortSignal.timeout(8000) }
            );
            if (!res.ok) { afterKodik.push(anime); return; }
            const data = await res.json();
            const item = data.results?.[0];
            const md = item?.material_data || {};
            const ruTitle = (md.anime_title || md.title || item?.title || '').replace(/\s*\[ТВ[^\]]*\]\s*/gi, '').trim();
            if (ruTitle && /[Ѐ-ӿ]/.test(ruTitle)) applyRussianTitle(anime, ruTitle);
            else afterKodik.push(anime);
        } catch (_) {
            afterKodik.push(anime);
        }
    });

    if (afterKodik.length && Date.now() >= _myMemoryBlockedUntil) {
        await Promise.allSettled(afterKodik.map(async anime => {
            const src = anime.titleEn || anime.title || '';
            if (!src || /[Ѐ-ӿ]/.test(src)) return;
            if (Date.now() < _myMemoryBlockedUntil) return;
            try {
                const res = await fetch(
                    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(src)}&langpair=en|ru`,
                    { signal: AbortSignal.timeout(8000) }
                );
                const data = await res.json();
                if (isMyMemoryRateLimited(res, data)) {
                    _myMemoryBlockedUntil = Date.now() + 120000;
                    return;
                }
                if (!res.ok) return;
                const tr = data.responseData?.translatedText;
                if (tr && data.responseStatus === 200 && /[Ѐ-ӿ]/.test(tr)) applyRussianTitle(anime, tr);
            } catch (_) {}
        }));
    }
}

// ─── Sort ─────────────────────────────────────────────────────────────────────

function sortAnimeList(items) {
    const sorted = [...items];
    if (currentSortMode === 'rating') {
        return sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }
    if (currentSortMode === 'title') {
        return sorted.sort((a, b) => a.displayTitle.localeCompare(b.displayTitle, 'ru'));
    }
    return sorted;
}

function setSortMode(mode) {
    currentSortMode = mode;
    sortPanelOpen = false;
    updateSortPanelUI();
    animeData = [];
    hasMoreAnime = true;
    currentCatalogPage = 1;
    renderCatalog();
    updateCatalogMeta();
    if (currentCatalogMode === 'search') {
        handleSearch({ scrollToResults: false });
    } else if (currentCatalogMode === 'full') {
        fetchTopAnime({ page: 1, append: false, mode: 'full' });
    } else if (['ongoing', 'top', 'popular'].includes(currentCatalogMode)) {
        fetchCategory({ cat: currentCatalogMode, page: 1, append: false });
    } else {
        fetchTopAnime({ page: 1, append: false, mode: 'full' });
    }
}

function renderSortPanel() {
    const labels = { default: t('sort_default'), rating: t('sort_rating'), title: t('sort_title') };
    document.querySelectorAll('.sort-option').forEach(btn => {
        const mode = btn.dataset.sort;
        if (mode && labels[mode]) btn.textContent = labels[mode];
    });
    const sortBtn = document.getElementById('sort-toggle-btn');
    if (sortBtn) sortBtn.title = t('sort_label');
    updateSortPanelUI();
}

function updateSortPanelUI() {
    document.querySelectorAll('.sort-option').forEach(btn => {
        btn.classList.toggle('sort-option--active', btn.dataset.sort === currentSortMode);
    });
    const sortBtn = document.getElementById('sort-toggle-btn');
    const panel = document.getElementById('sort-panel');
    sortBtn?.classList.toggle('is-open', sortPanelOpen);
    panel?.classList.toggle('hidden', !sortPanelOpen);
}

function toggleSortPanel() {
    sortPanelOpen = !sortPanelOpen;
    if (sortPanelOpen) {
        genreFilterOpen = false;
        document.getElementById('genre-filter-panel')?.classList.add('hidden');
        document.getElementById('genre-toggle-btn')?.classList.remove('bg-airbnb', 'text-white', 'border-airbnb');
        renderSortPanel();
    }
    updateSortPanelUI();
    lucide.createIcons();
}

function selectSortMode(mode) {
    if (mode === currentSortMode) {
        sortPanelOpen = false;
        updateSortPanelUI();
        return;
    }
    setSortMode(mode);
}

function closeSortPanel() {
    sortPanelOpen = false;
    updateSortPanelUI();
}

// ─── Genre filter ─────────────────────────────────────────────────────────────

function getGenreCounts() {
    const counts = {};
    animeData.forEach(a => (a.tags || []).forEach(g => { counts[g] = (counts[g] || 0) + 1; }));
    return counts;
}

function filterByGenres(items) {
    if (!selectedGenres.size) return items;
    if (genreFilterMode === 'any') {
        return items.filter(a => [...selectedGenres].some(g => (a.tags || []).includes(g)));
    }
    return items.filter(a => [...selectedGenres].every(g => (a.tags || []).includes(g)));
}

function setGenreMode(mode) {
    genreFilterMode = mode;
    renderGenreFilterList();
    const grid = document.getElementById('anime-grid');
    if (grid) {
        grid.innerHTML = renderAnimeCards(filterByGenres(sortAnimeList(animeData)));
        refreshAnimeGrid(grid);
    }
}

function filterByGenre(genre) {
    selectedGenres.clear();
    selectedGenres.add(genre);
    openCatalog().then(() => { renderGenreFilterList(); });
}

function toggleGenre(genre) {
    if (selectedGenres.has(genre)) selectedGenres.delete(genre);
    else selectedGenres.add(genre);
    renderGenreFilterList();
    const grid = document.getElementById('anime-grid');
    if (grid) {
        grid.innerHTML = renderAnimeCards(filterByGenres(sortAnimeList(animeData)));
        refreshAnimeGrid(grid);
    }
}

function clearGenres() {
    selectedGenres.clear();
    genreSearchQ = '';
    const inp = document.getElementById('genre-search-input');
    if (inp) inp.value = '';
    renderGenreFilterList();
    const grid = document.getElementById('anime-grid');
    if (grid) {
        grid.innerHTML = renderAnimeCards(sortAnimeList(animeData));
        refreshAnimeGrid(grid);
    }
}

function filterGenreSearch(q) {
    genreSearchQ = q.toLowerCase();
    renderGenreFilterList(); // только список, input не трогаем
}

function toggleGenrePanel() {
    genreFilterOpen = !genreFilterOpen;
    if (genreFilterOpen) closeSortPanel();
    const panel = document.getElementById('genre-filter-panel');
    const btn = document.getElementById('genre-toggle-btn');
    if (!panel) return;
    panel.classList.toggle('hidden', !genreFilterOpen);
    if (btn) {
        btn.classList.toggle('bg-airbnb', genreFilterOpen);
        btn.classList.toggle('text-white', genreFilterOpen);
        btn.classList.toggle('border-airbnb', genreFilterOpen);
    }
    if (genreFilterOpen) renderGenreFilter();
}

function buildGenreRow([genre]) {
    const checked = selectedGenres.has(genre);
    const label = escapeHtml(currentLang === 'ru' ? (translateGenre(genre) || genre) : genre);
    const safeGenre = genre.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `<label class="flex items-center gap-2 py-1 cursor-pointer select-none group">
        <input type="checkbox" class="w-4 h-4 rounded cursor-pointer flex-shrink-0"
               style="accent-color:#FF5A5F"
               onchange="toggleGenre('${safeGenre}')" ${checked ? 'checked' : ''}>
        <span class="text-sm text-gray-800 dark:text-gray-200 group-hover:text-airbnb transition-colors leading-snug">${label}</span>
    </label>`;
}

function getFilteredSorted() {
    const counts = getGenreCounts();
    let sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (genreSearchQ) {
        sorted = sorted.filter(([g]) =>
            (translateGenre(g) || g).toLowerCase().includes(genreSearchQ) ||
            g.toLowerCase().includes(genreSearchQ)
        );
    }
    return sorted;
}

// Обновляет только список чекбоксов — не трогает input (курсор не сбрасывается)
function renderGenreFilterList() {
    const listEl = document.getElementById('genre-filter-list');
    const headerEl = document.getElementById('genre-filter-header');
    if (!listEl) return;

    const sorted = getFilteredSorted();
    const top = sorted.slice(0, 12);
    const rest = sorted.slice(12);

    if (headerEl) {
        const modeBtnCls = (m) => `text-xs px-2 py-0.5 rounded-full transition-colors ${genreFilterMode === m ? 'bg-airbnb text-white' : 'bg-gray-100 dark:bg-[#2a2a2a] text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-[#333]'}`;
        headerEl.innerHTML = `
            <div class="flex items-center gap-2">
                <span class="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">${t('genres_btn')}</span>
                ${selectedGenres.size ? `<button onclick="clearGenres()" class="text-xs text-airbnb hover:underline">Сбросить (${selectedGenres.size})</button>` : ''}
            </div>
            <div class="flex items-center gap-1">
                <button onclick="setGenreMode('all')" class="${modeBtnCls('all')}">${t('genre_filter_all')}</button>
                <button onclick="setGenreMode('any')" class="${modeBtnCls('any')}">${t('genre_filter_any')}</button>
            </div>`;
    }

    listEl.innerHTML = `
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-6">
            ${top.map(buildGenreRow).join('')}
        </div>
        ${rest.length ? `<details class="mt-2">
            <summary class="text-xs text-airbnb cursor-pointer select-none py-1 list-none hover:underline">${t('genre_show_more', rest.length)}</summary>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-6 mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                ${rest.map(buildGenreRow).join('')}
            </div>
        </details>` : ''}`;
}

// Полный рендер панели (первый показ или toggleGenrePanel)
function renderGenreFilter() {
    const container = document.getElementById('genre-filter-panel');
    if (!container || container.classList.contains('hidden')) return;

    const sorted = getFilteredSorted();
    if (!sorted.length && !genreSearchQ) {
        container.innerHTML = `<p class="text-sm text-gray-400 py-1 px-1">${t('genre_loading')}</p>`;
        return;
    }

    // Строим скелет один раз — input живёт постоянно
    if (!document.getElementById('genre-filter-list')) {
        container.innerHTML = `
            <div id="genre-filter-header" class="flex items-center justify-between mb-3"></div>
            <div id="genre-filter-list"></div>
            <div class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                <input type="text" id="genre-search-input" placeholder="${t('genre_search_placeholder')}"
                       oninput="filterGenreSearch(this.value)"
                       class="w-full max-w-xs px-3 py-1.5 text-sm bg-gray-100 dark:bg-[#2a2a2a] rounded-xl outline-none placeholder-gray-400 text-gray-700 dark:text-gray-200"
                       style="border:1px solid #d1d5db;">
            </div>`;
    }
    renderGenreFilterList();
}

// ─── Render anime cards ───────────────────────────────────────────────────────

function renderAnimeCards(items, emptyMessage = '') {
    if (!items.length) {
        return `<div class="col-span-full text-center py-20 text-gray-500 dark:text-gray-400">${emptyMessage || t('nothing_found')}</div>`;
    }

    return items.map(anime => {
        const fav = isFavorite(anime.id);
        const cachedRu = currentLang === 'ru' ? getCachedRuTitle(anime.malId || anime.id) : null;
        const title = currentLang === 'en'
            ? (anime.titleEn || anime.title || anime.displayTitle)
            : (cachedRu || (anime.titleRu && /[Ѐ-ӿ]/.test(anime.titleRu) ? anime.titleRu : null) || anime.displayTitle || anime.title);
        return `
        <div class="cursor-pointer group anim-item" onclick="watchAnime(${anime.id})">
            <div class="relative aspect-[3/4] overflow-hidden rounded-xl mb-3 bg-gray-100 dark:bg-gray-800">
                <img src="${proxyImg(anime.image)}"
                     alt="${escapeHtml(title)}"
                     class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                     loading="lazy" onerror="imgFallback(this)">
                <div class="absolute top-3 left-3 flex flex-wrap gap-2">
                    ${anime.tags.slice(0, 1).map(tag => `<span class="px-2 py-1 bg-white/90 dark:bg-black/70 backdrop-blur-sm text-[11px] font-semibold rounded-md">${escapeHtml(currentLang === 'ru' ? translateGenre(tag) : tag)}</span>`).join('')}
                    ${anime.isAdult ? `<span class="px-2 py-1 bg-red-600/90 backdrop-blur-sm text-white text-[11px] font-bold rounded-md" title="${t('adult_badge_title')}">${t('adult_badge')}</span>` : ''}
                </div>
                <button onclick="event.stopPropagation(); toggleFavorite(${anime.id})"
                        data-fav-id="${anime.id}"
                        title="${fav ? t('remove_from_fav') : t('add_to_fav')}"
                        class="heart-btn absolute top-3 right-3 p-1.5 rounded-full bg-white/90 dark:bg-black/70 backdrop-blur-sm">
                    <i data-lucide="heart" class="w-4 h-4 ${fav ? 'fill-current text-airbnb' : 'text-gray-500 dark:text-gray-400'}"></i>
                </button>
            </div>
            <div class="flex justify-between items-start gap-2">
                <div class="min-w-0 flex-1">
                    <h3 class="font-medium text-gray-900 dark:text-white line-clamp-1" data-title-id="${anime.id}">${escapeHtml(title)}</h3>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">${t('episodes_count', anime.episodes || '?')}</p>
                    ${anime.studios?.length ? `<button class="studio-badge mt-1" data-studio-id="${anime.studios[0].id}" data-studio-name="${escapeHtml(anime.studios[0].name)}" onclick="event.stopPropagation();openStudioAnime(+this.dataset.studioId,this.dataset.studioName)">${escapeHtml(anime.studios[0].name)}</button>` : ''}
                </div>
                <div class="flex items-center gap-1 text-sm font-medium shrink-0">
                    <i data-lucide="star" class="w-4 h-4 fill-current text-yellow-400"></i>
                    <span>${anime.rating || '—'}</span>
                </div>
            </div>
        </div>`;
    }).join('');
}

// ─── Catalog meta ─────────────────────────────────────────────────────────────

function updateCatalogMeta() {
    const subtitle = document.getElementById('catalog-subtitle');
    const description = document.getElementById('catalog-description');
    if (!subtitle || !description) return;

    if (currentCatalogMode === 'search' && currentCatalogQuery) {
        subtitle.innerText = t('search_found_label', currentCatalogQuery);
        description.innerText = t('search_results_sub');
        return;
    }

    const catTitles = { ongoing: t('ongoing_title'), top: t('cat_top_title'), popular: t('cat_popular_title') };
    const catDescs = { ongoing: t('ongoing_sub_mal'), top: t('cat_top_sub'), popular: t('cat_popular_sub') };
    if (currentCatalogMode === 'full') {
        subtitle.innerText = t('catalog_full_title');
        description.innerText = t('catalog_full_desc');
        return;
    }
    if (catTitles[currentCatalogMode]) {
        subtitle.innerText = catTitles[currentCatalogMode];
        description.innerText = catDescs[currentCatalogMode];
        return;
    }

    const sortLabels = { default: t('popular_now_label'), rating: t('by_rating_label'), title: t('by_title_label') };
    subtitle.innerText = sortLabels[currentSortMode] || t('popular_now_label');
    description.innerText = t('catalog_desc');
}

// ─── Search inputs ────────────────────────────────────────────────────────────

function getSearchInputs() {
    return {
        big: document.getElementById('big-search-input'),
        nav: document.getElementById('nav-search-input')
    };
}

function syncSearchInputs(value, source = '') {
    const inputs = getSearchInputs();
    if (source !== 'big' && inputs.big) inputs.big.value = value;
    if (source !== 'nav' && inputs.nav) inputs.nav.value = value;
}

function getSearchQuery(preferredSource = '') {
    const inputs = getSearchInputs();
    const preferredInput = preferredSource && inputs[preferredSource] ? inputs[preferredSource] : document.activeElement;
    if (preferredInput && typeof preferredInput.value === 'string') return preferredInput.value.trim();
    return inputs.nav?.value.trim() || inputs.big?.value.trim() || '';
}

// ─── Recommendations ──────────────────────────────────────────────────────────

function renderRecommendations() {
    const section = document.getElementById('recommendations-section');
    const grid = document.getElementById('recommendations-grid');
    if (!section || !grid) return;

    if (currentCatalogMode !== 'search') {
        section.classList.add('hidden');
        grid.innerHTML = '';
        return;
    }

    section.classList.remove('hidden');
    grid.innerHTML = renderAnimeCards(sortAnimeList(recommendedAnime), t('no_recommendations'));
    staggerAnimItems(grid);
}

async function fetchRecommendations(excludedAnime = []) {
    const excludedIds = new Set(excludedAnime.map(item => item.id));
    const recommendationToken = ++latestRecommendationToken;

    try {
        let recommendations = [];
        const firstPage = await fetchAnimePage({ page: 1 });
        if (recommendationToken !== latestRecommendationToken) return;

        recommendations = firstPage.items.filter(item => !excludedIds.has(item.id));

        if (recommendations.length < 8 && firstPage.hasNextPage) {
            const secondPage = await fetchAnimePage({ page: 2 });
            if (recommendationToken !== latestRecommendationToken) return;
            recommendations = mergeAnimeResults(
                recommendations,
                secondPage.items.filter(item => !excludedIds.has(item.id))
            );
        }

        recommendedAnime = recommendations.slice(0, 8);
    } catch (error) {
        recommendedAnime = [];
    } finally {
        if (recommendationToken === latestRecommendationToken) {
            renderRecommendations();
            lucide.createIcons();
        }
    }
}

// ─── Russian search translation ───────────────────────────────────────────────

async function translateQueryForSearch(query) {
    if (!query || !/[Ѐ-ӿ]/.test(query)) return null;
    if (Date.now() < _myMemoryBlockedUntil) return null;
    try {
        const res = await fetch(
            `https://api.mymemory.translated.net/get?q=${encodeURIComponent(query)}&langpair=ru|en`,
            { signal: AbortSignal.timeout(3000) }
        );
        const data = await res.json();
        if (isMyMemoryRateLimited(res, data)) {
            _myMemoryBlockedUntil = Date.now() + 120000;
            return null;
        }
        if (!res.ok) return null;
        const translated = data.responseData?.translatedText;
        if (translated && data.responseStatus === 200 && translated.toLowerCase() !== query.toLowerCase()) return translated;
    } catch (_) {}
    return null;
}

// ─── Catalog loading ──────────────────────────────────────────────────────────

function setCatalogLoadingState(loading) {
    const grid = document.getElementById('anime-grid');
    if (!grid) return;
    grid.classList.toggle('opacity-60', loading);
    grid.classList.toggle('pointer-events-none', loading);
    grid.classList.toggle('transition-opacity', true);
}

function renderCatalogActions() {
    const actions = document.getElementById('catalog-actions');
    if (!actions) return;

    if (animeData.length === 0) {
        actions.innerHTML = '';
        observeCatalogSentinel();
        return;
    }

    const catSource = { ongoing: t('ongoing_title'), top: t('cat_top_title'), popular: t('cat_popular_title'), full: t('catalog_full_title') };
    const sourceLabel = currentCatalogMode === 'search'
        ? t('source_search')
        : (catSource[currentCatalogMode] || t('source_top'));

    if (!hasMoreAnime) {
        actions.innerHTML = `<div class="text-center text-sm text-gray-500 dark:text-gray-400">${sourceLabel}. ${t('no_more')}</div>`;
        observeCatalogSentinel();
        return;
    }

    actions.innerHTML = `
        <div id="catalog-load-sentinel" class="flex flex-col items-center gap-3 min-h-[56px]">
            <div class="text-sm font-medium text-gray-500 dark:text-gray-400">
                ${isLoadingMore ? t('load_more_loading') : t('load_more_scroll')}
            </div>
            <div class="w-8 h-8 rounded-full border-2 border-airbnb/30 border-t-airbnb ${isLoadingMore ? 'animate-spin' : ''}"></div>
            <div class="text-sm text-gray-500 dark:text-gray-400">${sourceLabel}</div>
        </div>
    `;
    observeCatalogSentinel();
}

function observeCatalogSentinel() {
    if (!catalogLoadObserver) return;
    catalogLoadObserver.disconnect();
    const sentinel = document.getElementById('catalog-load-sentinel');
    if (sentinel) catalogLoadObserver.observe(sentinel);
}

function setupInfiniteCatalogLoading() {
    if (catalogLoadObserver || !('IntersectionObserver' in window)) return;
    catalogLoadObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            if (currentSection !== 'list') return;
            if (isSearching || isLoadingMore || !hasMoreAnime) return;
            loadMoreAnime();
        });
    }, { root: null, rootMargin: '0px 0px 320px 0px', threshold: 0.1 });
}

function scrollToCatalogIfNeeded() {
    const catalogContainer = document.getElementById('catalog-container');
    if (!catalogContainer) return;
    const rect = catalogContainer.getBoundingClientRect();
    const isVisible = rect.top >= 100 && rect.top < window.innerHeight * 0.65;
    if (isVisible) return;
    window.scrollTo({ top: rect.top + window.scrollY - 100, behavior: 'smooth' });
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchAnimePage({ query = '', page = 1, signal, orderBy = '' } = {}) {
    let params = `page=${page}&limit=${PAGE_SIZE}`;
    if (query)   params += `&search=${encodeURIComponent(query)}`;
    const order = orderBy === 'title' ? 'name' : orderBy === 'score' ? 'ranked' : 'ranked';
    params += `&order=${order}`;
    if (!query)  params += `&kind=tv,movie,ona`;

    const response = await shikiCatalogFetch(params, signal);
    const data = await response.json();
    const items = (Array.isArray(data) ? data : []).map(normalizeShikimoriItem).filter(a => !a.isAdult);
    return { items, hasNextPage: items.length >= PAGE_SIZE };
}

async function fetchTopAnime({ page = 1, append = false, mode = 'full' } = {}) {
    if (currentSearchController) {
        currentSearchController.abort();
        currentSearchController = null;
    }

    const requestToken = ++latestSearchToken;
    currentSearchController = new AbortController();

    if (!append) setCatalogLoadingState(true);

    const orderBy = currentSortMode === 'title' ? 'title' : currentSortMode === 'rating' ? 'score' : '';

    try {
        const result = await fetchAnimePage({
            page,
            signal: currentSearchController.signal,
            orderBy
        });

        if (requestToken !== latestSearchToken) return;

        if (!append) currentCatalogMode = mode;
        currentCatalogQuery = '';
        currentCatalogPage = page;
        hasMoreAnime = result.hasNextPage;
        recommendedAnime = [];
        animeData = append ? mergeAnimeResults(animeData, result.items) : result.items;
    } catch (error) {
        if (error.name === 'AbortError') return;
    } finally {
        if (requestToken === latestSearchToken) {
            currentSearchController = null;
            isLoadingMore = false;
            setCatalogLoadingState(false);
            if (currentSection === 'list') renderCatalog(append);
        }
    }
}

async function handleSearch({ scrollToResults = false, source = '' } = {}) {
    const query = getSearchQuery(source);
    const subtitle = document.getElementById('catalog-subtitle');

    syncSearchInputs(query, source);

    if (currentSearchController) {
        currentSearchController.abort();
        currentSearchController = null;
    }

    if (!query) {
        latestSearchToken++;
        latestRecommendationToken++;
        currentCatalogMode = 'top';
        listCategory = 'top';
        currentCatalogQuery = '';
        currentCatalogPage = 1;
        hasMoreAnime = true;
        recommendedAnime = [];
        isSearching = false;
        setCatalogLoadingState(false);
        // Пустой запрос: если мы в списке — показываем «Лучшее за всё время»
        if (currentSection === 'list') fetchCategory({ cat: 'top', page: 1, append: false });
        return;
    }

    if (query.length < 2) {
        latestSearchToken++;
        latestRecommendationToken++;
        recommendedAnime = [];
        if (subtitle) subtitle.innerText = t('search_min_chars');
        isSearching = false;
        setCatalogLoadingState(false);
        renderRecommendations();
        return;
    }

    // Поиск показываем в секции списка
    if (currentSection !== 'list') {
        showSection('list', { preserveScroll: true });
        // строка поиска в герое скрылась — переносим фокус в нав-поиск
        const navInput = document.getElementById('nav-search-input');
        if (navInput) {
            navInput.focus();
            const v = navInput.value;
            try { navInput.setSelectionRange(v.length, v.length); } catch (_) {}
        }
    }

    isSearching = true;
    if (subtitle) subtitle.innerText = t('searching_label', query);
    setCatalogLoadingState(true);

    if (scrollToResults) scrollToCatalogIfNeeded();

    const searchToken = ++latestSearchToken;
    currentSearchController = new AbortController();

    try {
        const isRussian = /[Ѐ-ӿ]/.test(query);
        const orderBy = currentSortMode === 'title' ? 'title' : currentSortMode === 'rating' ? 'score' : '';
        let searchQuery = query;

        // Shikimori умеет искать и по-русски, и по-английски
        const result = await fetchAnimePage({ query, page: 1, signal: currentSearchController.signal, orderBy });
        if (searchToken !== latestSearchToken) return;
        animeData = result.items;
        hasMoreAnime = result.hasNextPage;
        currentCatalogQueryTranslated = '';
        currentCatalogMode = 'search';
        currentCatalogQuery = query;
        currentCatalogPage = 1;
        if (subtitle) subtitle.innerText = t('search_results_label', query);
        fetchRecommendations(animeData);
    } catch (error) {
        if (error.name === 'AbortError') return;
        if (subtitle) subtitle.innerText = t('search_error');
    } finally {
        if (searchToken === latestSearchToken) {
            isSearching = false;
            currentSearchController = null;
            setCatalogLoadingState(false);
            renderCatalog();
        }
    }
}

async function loadMoreAnime() {
    if (isLoadingMore || !hasMoreAnime) return;
    isLoadingMore = true;
    renderCatalogActions();

    const nextPage = currentCatalogPage + 1;

    if (currentCatalogMode === 'search' && currentCatalogQuery) {
        if (currentSearchController) { currentSearchController.abort(); currentSearchController = null; }
        const requestToken = ++latestSearchToken;
        currentSearchController = new AbortController();
        try {
            const orderBy = currentSortMode === 'title' ? 'title' : currentSortMode === 'rating' ? 'score' : '';
            const searchQ = currentCatalogQueryTranslated || currentCatalogQuery;
            const result = await fetchAnimePage({
                query: searchQ, page: nextPage,
                signal: currentSearchController.signal, orderBy
            });
            if (requestToken !== latestSearchToken) return;
            animeData = mergeAnimeResults(animeData, result.items);
            currentCatalogPage = nextPage;
            hasMoreAnime = result.hasNextPage;
        } catch (error) {
            } finally {
            if (requestToken === latestSearchToken) {
                currentSearchController = null;
                isLoadingMore = false;
                renderCatalog();
            }
        }
        return;
    }

    if (currentCatalogMode === 'full') {
        fetchTopAnime({ page: nextPage, append: true, mode: 'full' });
        return;
    }

    fetchCategory({ cat: listCategory, page: nextPage, append: true });
}

function triggerSearch(source = '') {
    clearTimeout(searchTimeout);
    handleSearch({ scrollToResults: false, source });
}

// Sync inputs as user types (без поиска)
const bigSearchInput = document.getElementById('big-search-input');
if (bigSearchInput) {
    bigSearchInput.addEventListener('input', () => { syncSearchInputs(bigSearchInput.value, 'big'); });
}

const navSearchInput = document.getElementById('nav-search-input');
if (navSearchInput) {
    navSearchInput.addEventListener('input', () => { syncSearchInputs(navSearchInput.value, 'nav'); });
}

// Поиск ТОЛЬКО по Enter
document.addEventListener('keydown', (e) => {
    const id = document.activeElement?.id;
    if (e.key === 'Enter' && (id === 'big-search-input' || id === 'nav-search-input' || id === 'mobile-search-input')) {
        clearTimeout(searchTimeout);
        e.preventDefault();
        handleSearch({ scrollToResults: true, source: id === 'nav-search-input' ? 'nav' : id === 'mobile-search-input' ? 'mobile' : 'big' });
    }
});

// Scroll — show/hide nav search
window.addEventListener('scroll', () => {
    const navSearch = document.getElementById('nav-search');
    if (!navSearch) return;
    if (currentSection === 'home') {
        if (window.scrollY > 300) {
            navSearch.classList.remove('opacity-0', 'scale-95', 'pointer-events-none');
            navSearch.classList.add('opacity-100', 'scale-100');
        } else {
            navSearch.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
            navSearch.classList.remove('opacity-100', 'scale-100');
        }
    } else {
        navSearch.classList.remove('opacity-0', 'scale-95', 'pointer-events-none');
        navSearch.classList.add('opacity-100', 'scale-100');
    }
});

// ─── Episodes ─────────────────────────────────────────────────────────────────

async function fetchEpisodes(anime) {
    if (!anime.malId || (anime.episodesList && anime.episodesList.length > 0)) return;
    try {
        const response = await jikanFetch(`/anime/${anime.malId}/episodes`);
        const data = await response.json();
        if (data.data) {
            anime.episodesList = data.data.map(ep => ep.title || t('episode_select', ep.mal_id));
        }
        if (currentAnime?.id === anime.id) refreshPlayerChrome();
    } catch (error) {
        anime.episodesList = Array.from({ length: anime.episodes }, (_, i) => t('episode_select', i + 1));
        if (currentAnime?.id === anime.id) refreshPlayerChrome();
    }
}

// ─── Navigation ───────────────────────────────────────────────────────────────

const MODAL_ANIM_MS = 300;

function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function openModalOverlay(el, { lockScroll = true } = {}) {
    if (!el) return;
    el.classList.remove('hidden');
    if (lockScroll) document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-open')));
}

function closeModalOverlay(el, { unlockScroll = true } = {}) {
    if (!el || el.classList.contains('hidden')) return;
    el.classList.remove('is-open');
    setTimeout(() => {
        if (!el.classList.contains('is-open')) {
            el.classList.add('hidden');
            if (unlockScroll) document.body.style.overflow = '';
        }
    }, MODAL_ANIM_MS);
}

function animateSection(sectionEl) {
    if (!sectionEl || reducedMotion()) return;
    sectionEl.classList.remove('section-swipe');
    void sectionEl.offsetWidth;
    sectionEl.classList.add('section-swipe');
}

// Подсветка активного пункта меню
function updateNavActive(sectionId) {
    // секция watch/profile → подсветим ближайшее верхнеуровневое меню (или ничего)
    const map = { home: 'home', list: 'list', franchises: 'franchises', 'favorites-page': 'favorites-page', studios: 'studios' };
    const active = map[sectionId] || null;
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('nav-link--active', link.dataset.nav === active);
    });
}

function staggerAnimItems(root, selector = '.anim-item') {
    if (!root || reducedMotion()) return;
    root.querySelectorAll(selector).forEach((el, i) => {
        el.style.setProperty('--i', String(Math.min(i, 24)));
        el.classList.remove('anim-item-play');
        void el.offsetWidth;
        el.classList.add('anim-item-play');
    });
}

function staggerAnimBlocks(root, selector = '.anim-block') {
    if (!root || reducedMotion()) return;
    root.querySelectorAll(selector).forEach((el, i) => {
        el.style.setProperty('--i', String(i));
        el.classList.remove('anim-block-play');
        void el.offsetWidth;
        el.classList.add('anim-block-play');
    });
}

function refreshAnimeGrid(grid) {
    if (!grid) return;
    lucide.createIcons();
    staggerAnimItems(grid);
}

function stopActivePlayer() {
    if (currentAnime && currentSection === 'watch') saveWatchProgress(currentAnime);
    stopLibriaGL();
    if (libriaHls) { libriaHls.destroy(); libriaHls = null; }
    if (kodikHls)  { kodikHls.destroy();  kodikHls  = null; }
}

function showSection(sectionId, { preserveScroll = false } = {}) {
    if (sectionId === 'admin') { openAdminModal(); return; }
    if (sectionId === 'profile') { showProfilePage(null); return; }
    if (sectionId === 'catalog') { openCatalog(); return; }
    if (currentSection === 'watch' && sectionId !== 'watch') stopActivePlayer();
    if (sectionId !== 'watch' && sectionId !== 'list') clearAnimeUrl();

    document.querySelectorAll('main > section').forEach(s => s.classList.add('hidden'));

    const sectionEl = document.getElementById(`${sectionId}-section`);
    if (sectionEl) {
        sectionEl.classList.remove('hidden');
        animateSection(sectionEl);
    }

    currentSection = sectionId;
    updateMobileNavActive(sectionId);
    updateNavActive(sectionId);

    // Кнопка «Назад» в навбаре на мобилке
    const backSections = { watch: ['Назад', goBackFromWatch], 'franchise-page': ['Назад', () => showSection('home')], favorites: ['Назад', () => showSection('home')], 'favorites-page': ['Назад', () => showSection('home')] };
    if (typeof showNavBack === 'function' && typeof hideNavBack === 'function') {
        if (backSections[sectionId]) showNavBack(...backSections[sectionId]);
        else hideNavBack();
    }

    if (!preserveScroll) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        document.querySelector('nav.fixed')?.classList.remove('nav--scrolled');
        document.getElementById('mobile-bottom-nav')?.classList.remove('bottom-nav--compact');
    }

    if (sectionId === 'home') loadHomeRows();
    requestAnimationFrame(() => {
        if (sectionEl) {
            staggerAnimBlocks(sectionEl);
            staggerAnimItems(sectionEl);
        }
    });
    window.dispatchEvent(new Event('scroll'));
}

function renderCatalog(append = false) {
    const grid = document.getElementById('anime-grid');
    if (!grid) return;
    renderGenreFilter();

    const list = filterByGenres(sortAnimeList(animeData));
    // Догрузка без перерисовки всего грида: дописываем только новые карточки.
    // Возможно только при дефолтной сортировке и без фильтра по жанрам (иначе порядок/набор меняется).
    const canAppend = append
        && currentSortMode === 'default' && selectedGenres.size === 0
        && grid.children.length > 0 && grid.children.length < list.length;

    if (canAppend) {
        const startIdx = grid.children.length;
        grid.insertAdjacentHTML('beforeend', renderAnimeCards(list.slice(startIdx)));
        lucide.createIcons();
        animateNewCards(Array.from(grid.children).slice(startIdx));
    } else {
        grid.innerHTML = renderAnimeCards(list);
        refreshAnimeGrid(grid);
    }

    updateCatalogMeta();
    renderRecommendations();
    setCatalogLoadingState(isSearching);
    renderCatalogActions();
    // Асинхронно обогащаем русскими названиями (Kodik API)
    if (currentLang === 'ru') enrichWithRussianTitles(animeData);
}

// Анимируем только что добавленные карточки (без трогания уже отрисованных → нет мигания)
function animateNewCards(cards) {
    if (reducedMotion()) return;
    cards.forEach((el, i) => {
        if (!el.classList?.contains('anim-item')) return;
        el.style.setProperty('--i', String(Math.min(i, 12)));
        el.classList.add('anim-item-play');
    });
}

// ─── Watch ────────────────────────────────────────────────────────────────────

const LOADING_HINTS = {
    ru: [
        'Ищем лучшую озвучку для вас...',
        'Подогреваем рамен — скоро начнётся...',
        'Синхронизируем субтитры с вселенной...',
        'Уговариваем CDN не лагать...',
        'Настраиваем OP на максимальную громкость...',
        'Это не баг, это аниме...',
        'Загружаем plot twist...',
        'Котики на сервере уже смотрят...',
        'Почти готово — не перематывай!',
        'Спрашиваем у MyAnimeList рейтинг...',
        'Достаём попкорн — контент уже едет...',
        'Делаем magic — осталось чуть-чуть...',
    ],
    en: [
        'Finding the best dub for you...',
        'Heating up the ramen...',
        'Syncing subtitles with the universe...',
        'Asking the CDN nicely not to lag...',
        'Cranking the OP volume to max...',
        "It's not a bug, it's anime...",
        'Loading plot twist...',
        'Cats on the server are already watching...',
        "Almost ready — don't skip yet!",
        'Asking MyAnimeList for the score...',
        'Grabbing popcorn... I mean, content...',
        'Working some magic — almost there...',
    ],
};

let _loadProgress = {};
let _loadTimers = {};
let _loadHintTimers = {};

function pickLoadingHint() {
    const hints = LOADING_HINTS[currentLang === 'ru' ? 'ru' : 'en'];
    return hints[Math.floor(Math.random() * hints.length)];
}

function buildLoadingOverlayContent(prefix, dark = false) {
    const trackClass = dark ? 'bg-white/10' : 'bg-gray-200 dark:bg-[#2a2a2a]';
    const pctClass = dark ? 'text-white/40' : 'text-gray-400 dark:text-gray-500';
    const hintClass = dark ? 'text-white/75' : 'text-gray-600 dark:text-gray-300';
    return `
        <div class="flex flex-col items-center gap-3 w-full max-w-xs px-2">
            <div class="w-full h-2 ${trackClass} rounded-full overflow-hidden">
                <div id="${prefix}-loading-bar" class="loading-progress-bar h-full rounded-full" style="width:0%"></div>
            </div>
            <div class="flex justify-between w-full text-[10px] ${pctClass} tabular-nums uppercase tracking-wider">
                <span id="${prefix}-loading-pct">0%</span>
                <span>AnyRainy</span>
            </div>
            <p id="${prefix}-loading-hint" class="loading-hint text-sm font-medium text-center min-h-[2.5rem] leading-snug ${hintClass}">${escapeHtml(pickLoadingHint())}</p>
        </div>`;
}

function setLoadingProgressUI(prefix, value) {
    const v = Math.min(100, Math.max(0, value));
    _loadProgress[prefix] = v;
    const bar = document.getElementById(`${prefix}-loading-bar`);
    const pct = document.getElementById(`${prefix}-loading-pct`);
    if (bar) bar.style.width = v + '%';
    if (pct) pct.textContent = Math.round(v) + '%';
}

function setLoadingProgress(prefix, value) {
    const cur = _loadProgress[prefix] || 0;
    setLoadingProgressUI(prefix, Math.max(cur, value));
}

function startLoadingProgress(prefix, cap = 92) {
    stopLoadingProgress(prefix, false);
    _loadProgress[prefix] = 0;
    setLoadingProgressUI(prefix, 0);
    _loadTimers[prefix] = setInterval(() => {
        const cur = _loadProgress[prefix] || 0;
        if (cur >= cap) return;
        setLoadingProgressUI(prefix, cur + Math.random() * 4 + 1);
    }, 380);
    _loadHintTimers[prefix] = setInterval(() => {
        const el = document.getElementById(`${prefix}-loading-hint`);
        if (!el) return;
        el.textContent = pickLoadingHint();
        el.classList.remove('loading-hint--pop');
        void el.offsetWidth;
        el.classList.add('loading-hint--pop');
    }, 2600);
}

function finishLoadingProgress(prefix) {
    setLoadingProgressUI(prefix, 100);
}

function stopLoadingProgress(prefix, resetProgress = true) {
    clearInterval(_loadTimers[prefix]);
    clearInterval(_loadHintTimers[prefix]);
    delete _loadTimers[prefix];
    delete _loadHintTimers[prefix];
    if (resetProgress) delete _loadProgress[prefix];
}

function showAnimeLoadingScreen(title) {
    stopLoadingProgress('anime');
    const container = document.getElementById('player-container');
    if (!container) return;
    container.innerHTML = `
        <div id="anime-loading-screen" class="anime-loading-screen flex flex-col items-center justify-center min-h-[420px] gap-5 px-6 py-12">
            ${title ? `<p class="text-base font-bold text-gray-900 dark:text-white truncate max-w-md text-center">${escapeHtml(title)}</p>` : ''}
            ${buildLoadingOverlayContent('anime', false)}
        </div>`;
    startLoadingProgress('anime');
}

async function watchAnime(id, { episode = 1, resume = null } = {}) {
    const token = ++watchToken;
    currentAnime = findAnimeById(id);
    if (!currentAnime) return;
    _playerAvailability = {}; // сброс при открытии нового аниме

    window._resumePosition = resume?.position > 0 ? resume.position : null;

    if (resume) {
        window._allohaAutoFallback = false; // продолжение просмотра — плеер уже выбран пользователем
        currentEpisodeNum = Math.max(1, resume.episode || episode);
        currentServerIndex = clampResumeServerIndex(resume.serverIndex, resume.serverType);
        currentKodikTranslationIdx = resume.kodikTranslationIdx ?? 0;
        currentPlayerVoiceIdx = 0;
        if (resume.libriaQuality) {
            libriaCurrentQuality = resume.libriaQuality;
            libriaUpscale4K = resume.libriaQuality === '4K ✦';
            window._pendingLibriaQuality = resume.libriaQuality;
        } else {
            window._pendingLibriaQuality = null;
        }
        if (resume.kodikQuality) {
            kodikCurrentQuality = resume.kodikQuality;
            window._pendingKodikQuality = resume.kodikQuality;
        } else {
            window._pendingKodikQuality = null;
        }
    } else {
        currentEpisodeNum = Math.max(1, episode);
        // Приоритетный плеер по умолчанию — Aloha; фолбэк на AniLibria, затем первый доступный
        const allohaIdx = getWatchPlayerIndex('alloha');
        currentServerIndex = allohaIdx >= 0 ? allohaIdx : Math.max(0, getWatchPlayerIndex('libria'));
        // Если Aloha не сможет резолвиться (нет Kinopoisk id) — один раз авто-переключимся
        window._allohaAutoFallback = allohaIdx >= 0;
        watchSidebarTab = 'player';
        currentPlayerVoiceIdx = 0;
        currentKodikTranslationIdx = 0;
        window._pendingLibriaQuality = null;
        window._pendingKodikQuality = null;
        window._resumePosition = null;
    }

    currentKodikTranslations = [];
    currentKodikEpisodeNums = [];
    currentKodikSeasons = null;
    currentKinopoiskId = null;
    currentPlayerSeasonIdx = 0;
    currentEpisodeSeasonId = null;
    playerEpisodesExpanded = false;
    libriaQualityMap = {};
    libriaQualityEp = 0;
    clearTimeout(window._playerErrorTimer);
    showSection('watch');
    updateAnimeUrl(currentAnime.malId);
    showAnimeLoadingScreen(currentAnime.displayTitle);
    setLoadingProgress('anime', 10);

    const hentai = isHentaiAnime(currentAnime);
    const libriaPromise = hentai ? Promise.resolve({}) : getAnilibriaEpisodeUrls(currentAnime, currentEpisodeNum);
    const kodikPromise = hentai
        ? Promise.resolve({ translations: [], episodes: [] })
        : fetchKodikData(currentAnime.malId).catch(() => ({ translations: [], episodes: [] }));

    if (resume && !hentai) {
        try {
            const d = await kodikPromise;
            if (token !== watchToken) return;
            currentKodikTranslations = d.translations || [];
            currentKodikEpisodeNums = d.episodes || [];
            currentKinopoiskId = d.kinopoiskId || null;
            syncPlayerSeasonForEpisode(currentEpisodeNum);
            if (isKodikWatchPlayer()) {
                applySavedKodikVoice(resume);
            }
            // Всегда уточняем серии через with_episodes — episodes_count в поиске бывает пустым
            if (currentKodikTranslations.length) loadKodikSeasonsMetadata();
            // Предзагрузка прямого URL пока идёт лоадинг libria
            const resumeTr = currentKodikTranslations[currentKodikTranslationIdx];
            if (resumeTr) {
                fetchKodikEpisodeLink(currentAnime.malId, resumeTr.id, currentEpisodeNum, currentEpisodeSeasonId)
                    .then(link => { if (link) getKodikDirectUrl(link).catch(() => {}); })
                    .catch(() => {});
            }
        } catch (_) {}
    } else if (!resume && !hentai) {
        kodikPromise.then(d => {
            if (token !== watchToken) return;
            currentKodikTranslations = d.translations;
            currentKodikEpisodeNums = d.episodes;
            currentKinopoiskId = d.kinopoiskId || null;
            syncPlayerSeasonForEpisode(currentEpisodeNum);
            refreshPlayerPickerInPlace();
            // Всегда уточняем серии через with_episodes — episodes_count в поиске бывает пустым
            if (currentKodikTranslations.length) loadKodikSeasonsMetadata();
            // Предзагрузка: запускаем резолв эпизода и прямого URL пока показывается экран загрузки,
            // чтобы к моменту вызова initKodikPlayer всё уже было в кеше → плеер стартует мгновенно
            const preTr = currentKodikTranslations[currentKodikTranslationIdx] || currentKodikTranslations[0];
            if (preTr) {
                fetchKodikEpisodeLink(currentAnime.malId, preTr.id, currentEpisodeNum, null)
                    .then(link => { if (link) getKodikDirectUrl(link).catch(() => {}); })
                    .catch(() => {});
            }
        }).catch(() => {});
    }

    fetchEpisodes(currentAnime).catch(() => {});

    if (!hentai) fetchAnilistId(currentAnime.malId).catch(() => {});

    if (hentai) {
        setLoadingProgress('anime', 88);
    } else {
        const map = await libriaPromise;
        setLoadingProgress('anime', 72);

        if (token !== watchToken) return;
        if (Object.keys(map).length) {
            libriaQualityMap = map;
            libriaQualityEp = currentEpisodeNum;
        }
    }

    if (token !== watchToken) return;
    finishLoadingProgress('anime');
    stopLoadingProgress('anime');
    renderPlayerUI(currentAnime);
    saveWatchProgress(currentAnime, currentEpisodeNum);

    // Обогащаем русским названием если нужно
    if (currentLang === 'ru') {
        enrichWithRussianTitles([currentAnime]).then(() => {
            if (token !== watchToken) return;
            // Обновляем вкладку браузера
            if (currentAnime.displayTitle) document.title = `${currentAnime.displayTitle} — AnyRainy`;
        });
    }

    if (TRANSLATE_TO && !synopsisCache[currentAnime.id]) {
        const synopsisEl = document.getElementById('anime-synopsis');
        if (synopsisEl) synopsisEl.classList.add('synopsis-loading');
        const src = currentAnime.synopsisEn || currentAnime.synopsis;
        const translated = await translateSynopsis(src, currentAnime.id);
        if (token !== watchToken) return;
        if (translated !== src) {
            // Кешируем, НЕ перезаписываем synopsisEn/synopsis
            synopsisCache[currentAnime.id] = translated;
            const el = document.getElementById('anime-synopsis');
            if (el) { el.textContent = translated; el.classList.remove('synopsis-loading'); }
        }
    }
}

function renderPlayerUI(anime) {
    const container = document.getElementById('player-container');
    if (!container) return;

    const fav = isFavorite(anime.id);

    container.innerHTML = `
        <div class="space-y-4">
        <div class="watch-page-stack">
            <div id="shiki-header-block" class="anim-block">
                <div class="shiki-wrap">
                    <img class="shiki-bg" src="${proxyImg(anime.image)}" alt="">
                    <div class="shiki-bg-shade"></div>
                    <div class="shiki-inner">
                        <div class="shiki-title">${escapeHtml(anime.displayTitle)}</div>
                        <div class="shiki-grid">
                            <div class="shiki-poster-col">
                                <img class="shiki-poster-img" src="${proxyImg(anime.image)}" alt="${escapeHtml(anime.displayTitle)}" onerror="imgFallback(this)">
                            </div>
                            <div class="shiki-body">
                                <div class="shiki-info" style="color:rgba(255,255,255,.3);font-size:.8rem;padding-top:4px">Загрузка…</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            ${isHentaiAnime(anime) ? `<p class="text-xs font-semibold text-red-600 dark:text-red-400 px-1">${t('hentai_player_note')}</p>` : ''}

            <div class="watch-player-wrap anim-block">
                <div class="watch-page-head">
                    <h3 class="watch-page-title">${escapeHtml(t('watch_page_title', anime.displayTitle))}</h3>
                    ${buildWatchLayoutSettingHtml()}
                </div>
                <div class="watch-player-block">
                    <div class="${getWatchLayoutClassList()}">
                        <div class="watch-player-main">
                            <div class="watch-player-frame">
                                <div id="player-viewport" class="absolute inset-0 w-full h-full">
                                    ${renderCurrentPlayer()}
                                </div>
                            </div>
                        </div>
                        <aside id="player-sidebar" class="watch-player-sidebar">
                            ${buildWatchSidebarInner()}
                        </aside>
                    </div>
                    <div id="player-toolbar" class="watch-player-toolbar">
                        ${buildPlayerToolbarInner()}
                    </div>
                </div>
            </div>
        </div>

            <div id="related-anime-section" class="anim-block hidden"></div>

            <div id="player-comments-wrapper" class="anim-block border-subtle p-6 md:p-8 rounded-[2rem] bg-[#fafafa] dark:bg-[#171717]">
                ${renderCommentsSection(anime)}
            </div>
        </div>
    `;
    lucide.createIcons();
    staggerAnimBlocks(container);
    staggerAnimItems(container);
    bindPlayerPickerEvents();
    refreshPlayerChrome();
    setupVideoListeners();
    initCurrentPlayerType();
    loadRelatedAnime(anime.malId);
    loadShikiHeader(anime);
}

// ─── Связанные аниме / другие части франшизы (Jikan relations) ────────────────
const _relatedCache = {};
let _relatedToken = 0;
const RELATION_LABELS_RU = {
    Sequel: 'Продолжение', Prequel: 'Приквел', 'Side story': 'Побочная история',
    'Alternative version': 'Альт. версия', 'Alternative setting': 'Альт. сеттинг',
    'Parent story': 'Основная история', 'Full story': 'Полная версия',
    Summary: 'Сводка', 'Spin-off': 'Спин-офф', Other: 'Прочее', Character: 'Персонаж',
};
// Порядок важности: сначала продолжения/приквелы
const RELATION_ORDER = ['Prequel', 'Sequel', 'Parent story', 'Full story', 'Side story',
    'Spin-off', 'Alternative version', 'Alternative setting', 'Summary', 'Other', 'Character'];

function relationLabel(rel) {
    if (currentLang === 'ru') return RELATION_LABELS_RU[rel] || rel;
    return rel;
}

async function loadRelatedAnime(malId) {
    const section = document.getElementById('related-anime-section');
    if (!section || !malId) return;
    const token = ++_relatedToken;  // если пользователь ушёл — прекращаем
    try {
        let entries = _relatedCache[malId];
        if (!entries) {
            const res = await jikanFetch(`/anime/${malId}/relations`, AbortSignal.timeout(12000));
            const data = await res.json();
            const seen = new Set();
            entries = [];
            (data.data || []).forEach(rel => {
                (rel.entry || []).forEach(e => {
                    if (e.type !== 'anime' || e.mal_id === malId || seen.has(e.mal_id)) return;
                    seen.add(e.mal_id);
                    entries.push({ malId: e.mal_id, name: e.name, relation: rel.relation });
                });
            });
            entries.sort((a, b) => {
                const ia = RELATION_ORDER.indexOf(a.relation);
                const ib = RELATION_ORDER.indexOf(b.relation);
                return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
            });
            _relatedCache[malId] = entries;
        }
        if (token !== _relatedToken) return;
        if (!entries.length) { section.classList.add('hidden'); return; }
        section.innerHTML = buildRelatedSection(entries);
        section.classList.remove('hidden');
        lucide.createIcons();
        loadRelatedPosters(entries, token);
    } catch (_) {
        section.classList.add('hidden');
    }
}

function buildRelatedSection(entries) {
    // Текущее аниме — показываем первым со специальной меткой
    const cur = currentAnime;
    const currentCard = cur ? `
        <article class="ongoing-card related-card related-card--current group" data-year="${cur.year || 9999}">
            <div class="relative aspect-[3/4] overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800 mb-2.5">
                ${cur.image ? `<img src="${proxyImg(cur.image)}" alt="${escapeHtml(cur.displayTitle || cur.title || '')}" class="w-full h-full object-cover" onerror="imgFallback(this)">` : ''}
                <span class="related-relation-badge absolute top-2 left-2 px-2 py-1 rounded-lg text-[11px] font-bold" style="background:rgba(255,90,95,0.9)">▶ ${t('watching_now')}</span>
            </div>
            <h3 class="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2 leading-snug">${escapeHtml(cur.displayTitle || cur.title || '')}</h3>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">${cur.year || ''}</p>
        </article>` : '';

    const cards = entries.map(e => `
        <article class="ongoing-card related-card cursor-pointer group" data-related-id="${e.malId}" data-year="9999" onclick="fetchAndWatchByMalId(${e.malId})">
            <div class="relative aspect-[3/4] overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800 mb-2.5">
                <img data-related-poster="${e.malId}" alt="${escapeHtml(e.name)}"
                     class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy">
                <span class="related-relation-badge absolute top-2 left-2 px-2 py-1 rounded-lg bg-black/60 backdrop-blur-md text-white text-[11px] font-bold">${escapeHtml(relationLabel(e.relation))}</span>
            </div>
            <h3 class="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2 leading-snug">${escapeHtml(e.name)}</h3>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5" data-year-label="${e.malId}"></p>
        </article>`).join('');

    return `
        <div class="flex items-center justify-between gap-3 mb-4">
            <div class="flex items-center gap-2.5 min-w-0">
                <span class="flex items-center justify-center w-9 h-9 rounded-xl bg-airbnb/10 text-airbnb shrink-0">
                    <i data-lucide="layers" class="w-5 h-5"></i>
                </span>
                <div class="min-w-0">
                    <h2 class="text-xl md:text-2xl font-bold text-gray-900 dark:text-white truncate">${t('related_title')}</h2>
                    <p class="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">${t('related_sub')}</p>
                </div>
            </div>
            ${currentAnime?.malId ? `<button onclick="openFranchiseModal(${currentAnime.malId})"
                class="franchise-open-btn shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap">
                <i data-lucide="git-branch" class="w-4 h-4"></i>
                <span class="hidden sm:inline">${t('franchise_btn')}</span>
                <span class="sm:hidden">${t('franchise_btn_short')}</span>
            </button>` : ''}
        </div>
        <div class="related-scroll ongoing-scroll flex gap-3 md:gap-4 overflow-x-auto pb-1 -mx-1 px-1">${currentCard}${cards}</div>`;
}

// Параллельная загрузка постеров: сервер сам ставит в очередь к Jikan
async function loadRelatedPosters(entries, token) {
    await Promise.all(entries.map(async e => {
        const detail = await fetchAnimeDetail(e.malId).catch(() => null);
        if (token !== _relatedToken) return;
        if (!detail || detail.type === 'Music') {
            document.querySelector(`.related-card[data-related-id="${e.malId}"]`)?.remove();
            return;
        }
        const img = document.querySelector(`img[data-related-poster="${e.malId}"]`);
        if (img && detail.image) img.src = proxyImg(detail.image);
        if (detail.year) {
            const card = document.querySelector(`.related-card[data-related-id="${e.malId}"]`);
            if (card) card.dataset.year = detail.year;
            const lbl = document.querySelector(`[data-year-label="${e.malId}"]`);
            if (lbl) lbl.textContent = detail.year;
        }
    }));
    if (token !== _relatedToken) return;
    // Сортируем карточки хронологически (от старых к новым)
    const relScroll = document.querySelector('#related-section .related-scroll');
    if (relScroll) {
        if (relScroll.children.length === 0) {
            document.getElementById('related-section')?.classList.add('hidden');
        } else {
            Array.from(relScroll.children)
                .sort((a, b) => parseInt(a.dataset.year || '9999') - parseInt(b.dataset.year || '9999'))
                .forEach(c => relScroll.appendChild(c));
        }
    }
}

// Превращаем карточку связанного в «музыкальный клип»: метка + иконка YouTube + клик в модалку
function markRelatedAsMusic(card, youtubeId, name) {
    card.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation(); openYoutubeModal(youtubeId, name); };
    const badge = card.querySelector('.related-relation-badge');
    if (badge) { badge.textContent = t('music_video_badge'); badge.classList.add('related-badge-music'); }
    const wrap = card.querySelector('div.relative');
    if (wrap && !wrap.querySelector('.related-yt-play')) {
        const play = document.createElement('div');
        play.className = 'related-yt-play';
        play.innerHTML = '<i data-lucide="youtube" class="w-7 h-7"></i>';
        wrap.appendChild(play);
        lucide.createIcons();
    }
}

// ─── Модалка YouTube (для музыкальных клипов / PV) ─────────────────────────────
function openYoutubeModal(youtubeId, title, searchQuery) {
    let modal = document.getElementById('youtube-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'youtube-modal';
        modal.className = 'yt-modal';
        document.body.appendChild(modal);
    }
    const frame = youtubeId
        ? `<div class="yt-modal-frame">
               <iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeId)}?autoplay=1&rel=0"
                   allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe>
           </div>`
        : `<div class="yt-modal-notfound">
               <i data-lucide="youtube" class="w-10 h-10 text-red-500"></i>
               <p>Видео не найдено автоматически</p>
               <a href="https://www.youtube.com/results?search_query=${searchQuery || encodeURIComponent(title)}"
                  target="_blank" rel="noopener noreferrer" class="yt-search-btn">
                   Найти на YouTube
               </a>
           </div>`;
    modal.innerHTML = `
        <div class="yt-modal-backdrop" onclick="closeYoutubeModal()"></div>
        <div class="yt-modal-inner">
            <div class="yt-modal-head">
                <span class="yt-modal-badge"><i data-lucide="youtube" class="w-4 h-4"></i> ${t('music_video_badge')}</span>
                <span class="yt-modal-title">${escapeHtml(title || '')}</span>
                <button onclick="closeYoutubeModal()" class="yt-modal-close" aria-label="Закрыть"><i data-lucide="x" class="w-5 h-5"></i></button>
            </div>
            ${frame}
        </div>`;
    requestAnimationFrame(() => modal.classList.add('is-open'));
    document.body.style.overflow = 'hidden';
    lucide.createIcons();
}

function closeYoutubeModal() {
    const modal = document.getElementById('youtube-modal');
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.innerHTML = '';  // останавливаем видео
    document.body.style.overflow = '';
}

// ─── Страница франшизы (хронология частей с датами и описанием) ────────────────
const _animeDetailCache = {};
let _franchiseToken = 0;

async function fetchAnimeDetail(malId) {
    if (_animeDetailCache[malId] !== undefined) return _animeDetailCache[malId];
    // Сначала проверяем localStorage (24ч TTL)
    const ls = _lsDetailGet(malId);
    if (ls !== undefined) { _animeDetailCache[malId] = ls; return ls; }
    try {
        const res = await jikanFetch(`/anime/${malId}`, AbortSignal.timeout(10000));
        const d = (await res.json()).data;
        _animeDetailCache[malId] = d ? {
            malId,
            title: d.title_english || d.title || '',
            titleRu: d.title,
            image: d.images?.jpg?.large_image_url || d.images?.jpg?.image_url || null,
            type: d.type || '',
            year: d.year || d.aired?.prop?.from?.year || null,
            airedFrom: d.aired?.from ? new Date(d.aired.from).getTime() : null,
            airedStr: d.aired?.string || '',
            synopsis: d.synopsis || '',
            score: d.score || null,
            episodes: d.episodes || null,
            youtubeId: d.trailer?.youtube_id || null,
        } : null;
        if (_animeDetailCache[malId]) _lsDetailSet(malId, _animeDetailCache[malId]);
    } catch (_) { _animeDetailCache[malId] = null; }
    return _animeDetailCache[malId];
}

// Русские название + описание из Shikimori (через серверный прокси)
const _shikiCache = {};
function stripShikiBBCode(s) {
    return String(s || '')
        .replace(/\[source\][\s\S]*?\[\/source\]/gi, '')
        .replace(/\[\[[^\]|]*\|([^\]]+)\]\]/g, '$1')
        .replace(/\[\[([^\]]+)\]\]/g, '$1')
        .replace(/\[\/?[a-z][^\]]*\]/gi, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
// ── Shikimori full data (аниме + related + roles) ─────────────────────────────
const _shikiFullCache = {};
async function fetchShikiFull(malId) {
    if (_shikiFullCache[malId]) return _shikiFullCache[malId];
    try {
        const base = (typeof BACKEND !== 'undefined' && BACKEND) ? BACKEND : '';
        const r = await fetch(`${base}/shiki-full?id=${malId}`, { signal: AbortSignal.timeout(15000) });
        if (!r.ok) throw new Error(r.status);
        const d = await r.json();
        _shikiFullCache[malId] = d;
        return d;
    } catch(_) { return null; }
}

const _SHIKI_SOURCE = { manga:'Манга', web_manga:'Веб-манга', original:'Оригинал', visual_novel:'Визуальная новелла', light_novel:'Ранобэ', novel:'Новелла', game:'Игра', book:'Книга', music:'Музыка', other:'Другое' };
const _SHIKI_KIND   = { tv:'TV', movie:'Фильм', ova:'OVA', ona:'ONA', special:'Спешл', music:'Клип', tv_13:'TV', tv_24:'TV', tv_48:'TV' };
const _SHIKI_STATUS = { anons:'Анонс', ongoing:'Онгоинг', released:'Вышел' };
const _SHIKI_LIST   = { planned:'Запланировано', completed:'Просмотрено', watching:'Смотрю', rewatching:'Пересматриваю', dropped:'Брошено', on_hold:'Отложено' };
const _KEY_ROLES    = new Set(['Director','Series Composition','Music','Character Design','Original Creator','Script','Storyboard','Animation Director']);

function buildShikiHeaderHtml(anime, sd) {
    const ruTitle     = sd.russian || anime.displayTitle || anime.title || '';
    const romajiTitle = sd.name || anime.title || '';
    const jpTitle     = (sd.japanese || [])[0] || '';
    const kind        = _SHIKI_KIND[sd.kind]   || sd.kind   || '';
    const statusKey   = sd.status || '';
    const statusRu    = _SHIKI_STATUS[statusKey] || statusKey;
    const source      = _SHIKI_SOURCE[sd.source] || '';
    const genres      = (sd.genres || []).filter(g => g.kind === 'genre');
    const themes      = (sd.genres || []).filter(g => g.kind === 'theme');
    const studios     = sd.studios || [];
    const desc        = stripShikiBBCode(sd.description || '');
    const imgBase     = (typeof BACKEND !== 'undefined' && BACKEND) ? BACKEND : '';

    const fav = isFavorite(anime.id);
    const posterBtns = `
        <button onclick="toggleFavorite(${anime.id})" data-fav-id="${anime.id}" class="heart-btn watch-action-btn ${fav?'watch-action-btn--active':''}" style="font-size:.75rem;padding:5px 10px">
            <i data-lucide="heart" class="w-3 h-3 ${fav?'fill-current':''}"></i> ${fav ? 'В избранном' : 'В избранное'}
        </button>
        <button onclick="copyAnimeLink()" class="watch-action-btn" style="font-size:.75rem;padding:5px 10px">
            <i data-lucide="link-2" class="w-3 h-3"></i>
        </button>`;

    const dot = '<span style="color:rgba(255,255,255,.2);margin:0 2px">·</span>';
    const subtitleParts = [
        kind ? `<span>${escapeHtml(kind)}</span>` : '',
        statusKey ? `<span class="shiki-status shiki-status--${statusKey}">${escapeHtml(statusRu)}</span>` : '',
        anime.year ? `<span>${anime.year}</span>` : '',
    ].filter(Boolean).join(dot);

    const infoRows = [
        genres.length ? `<div class="shiki-row"><span class="shiki-lbl">Жанр</span><span class="shiki-val">${genres.map(g=>`<span class="shiki-genre-tag" onclick="filterByGenre('${escapeHtml(g.name)}')">${escapeHtml(g.russian||g.name)}</span>`).join('')}</span></div>` : '',
        themes.length ? `<div class="shiki-row"><span class="shiki-lbl">Темы</span><span class="shiki-val">${themes.map(g=>`<span class="shiki-genre-tag" onclick="filterByGenre('${escapeHtml(g.name)}')">${escapeHtml(g.russian||g.name)}</span>`).join('')}</span></div>` : '',
        source    ? `<div class="shiki-row"><span class="shiki-lbl">Источник</span><span class="shiki-val">${escapeHtml(source)}</span></div>` : '',
        jpTitle   ? `<div class="shiki-row"><span class="shiki-lbl">Японское</span><span class="shiki-val" style="font-size:.72rem;opacity:.55">${escapeHtml(jpTitle)}</span></div>` : '',
        anime.episodes ? `<div class="shiki-row"><span class="shiki-lbl">Эпизоды</span><span class="shiki-val">${anime.episodes}</span></div>` : '',
    ].filter(Boolean).join('');

    const studioHtml = studios.length ? studios.slice(0,3).map(s => {
        const logoUrl = s.image ? `${imgBase}/img?url=${encodeURIComponent('https://shikimori.io' + s.image)}` : '';
        return `<div class="shiki-studio-item" onclick="openStudioAnime(${s.id},'${escapeHtml(s.name)}')" title="${escapeHtml(s.name)}">
            ${logoUrl
                ? `<img class="shiki-studio-logo" src="${logoUrl}" alt="${escapeHtml(s.name)}" onerror="this.style.display='none';this.nextSibling.style.display='block'"><span class="shiki-studio-name" style="display:none">${escapeHtml(s.name)}</span>`
                : `<span class="shiki-studio-name">${escapeHtml(s.name)}</span>`}
        </div>`;
    }).join('') : '';

    const relatedHtml = (sd.related||[]).slice(0,6).map(rel => {
        const entry = rel.anime || rel.manga;
        if (!entry) return '';
        const isAnime = !!rel.anime;
        const img = proxyImg(entry.image?.preview ? 'https://shikimori.io' + entry.image.preview : '');
        const title = entry.russian || entry.name || '';
        const rel_ru = rel.relation_russian || rel.relation || '';
        return `<div class="shiki-related-item" ${isAnime ? `onclick="fetchAndWatchByMalId(${entry.id})"` : ''}>
            <img class="shiki-related-img" src="${img}" onerror="imgFallback(this)" alt="">
            <div class="shiki-related-meta">
                <div class="shiki-related-title">${escapeHtml(title)}</div>
                <span class="shiki-rel-badge">${escapeHtml(rel_ru)}</span>
            </div>
        </div>`;
    }).filter(Boolean).join('');

    const bgSrc = proxyImg(anime.image);

    return `<div class="shiki-wrap anim-block">
        <img class="shiki-bg" src="${bgSrc}" alt="">
        <div class="shiki-bg-shade"></div>
        <div class="shiki-inner">
            <div>
                <div class="shiki-title">${escapeHtml(ruTitle)}${romajiTitle && romajiTitle !== ruTitle ? `<span class="shiki-title-sep">/</span><span class="shiki-title-romaji">${escapeHtml(romajiTitle)}</span>` : ''}</div>
                ${subtitleParts ? `<div class="shiki-subtitle">${subtitleParts}</div>` : ''}
            </div>
            <div class="shiki-grid">
                <div class="shiki-poster-col">
                    <img class="shiki-poster-img" src="${bgSrc}" alt="${escapeHtml(ruTitle)}" onerror="imgFallback(this)">
                    <div class="shiki-poster-btns">${posterBtns}</div>
                </div>
                <div class="shiki-body">
                    <div class="shiki-info">
                        ${infoRows}
                        ${desc ? `<div class="shiki-desc-wrap">
                            <p class="shiki-desc">${escapeHtml(desc)}</p>
                            <button class="shiki-desc-toggle" onclick="var p=this.previousElementSibling;p.classList.toggle('expanded');this.textContent=p.classList.contains('expanded')?'Свернуть':'Читать полностью'">Читать полностью</button>
                        </div>` : ''}
                    </div>
                    <div class="shiki-studio-col">
                        ${anime.rating ? `<div class="shiki-rating-block">
                            <div class="shiki-rating-score">★ ${anime.rating}</div>
                            <div class="shiki-rating-lbl">Рейтинг</div>
                        </div>` : ''}
                        ${studioHtml ? `<div class="shiki-studio-lbl" style="${anime.rating ? 'margin-top:12px' : ''}">Студия</div>${studioHtml}` : ''}
                    </div>
                </div>
            </div>
            ${relatedHtml ? `<div class="shiki-bottom-single">
                <div class="shiki-section-title">Связанное</div>
                <div class="shiki-related-grid">${relatedHtml}</div>
            </div>` : ''}
        </div>
    </div>`;
}

async function loadShikiHeader(anime) {
    const el = document.getElementById('shiki-header-block');
    if (!el) return;
    const basicSd = { russian: anime.displayTitle, name: anime.title, kind: anime.kind?.toLowerCase(), status: anime.status?.toLowerCase() === 'currently airing' ? 'ongoing' : anime.status?.toLowerCase() === 'finished airing' ? 'released' : 'anons' };
    el.innerHTML = buildShikiHeaderHtml(anime, basicSd);
    lucide.createIcons(el);
    const sd = await fetchShikiFull(anime.malId);
    if (sd && el.isConnected) {
        el.innerHTML = buildShikiHeaderHtml(anime, sd);
        lucide.createIcons(el);
        staggerAnimBlocks(el);
        const jpTitle = (sd.japanese || [])[0] || '';
        _injectVideoBackground(anime.malId, anime.title || anime.displayTitle, jpTitle, sd.russian || '');
    }
}

async function _injectVideoBackground(malId, titleEn, titleJp, titleRu) {
    const wrap = document.querySelector('#shiki-header-block .shiki-wrap');
    if (!wrap) return;

    let youtubeId = null;

    // 1. Официальный трейлер из Jikan — самый точный источник
    try {
        const detail = await fetchAnimeDetail(malId);
        if (detail?.youtubeId) youtubeId = detail.youtubeId;
    } catch (_) {}

    // 2. Если нет трейлера и есть VPS — умный поиск опенинга через yt-dlp
    if (!youtubeId && BACKEND) {
        // Запросы по убыванию точности:
        // - японское название даёт лучший результат на YT
        // - английское с "OP 1" — стандартный формат тайтла опенинга
        // - английское с "opening" — широкий поиск
        const queries = [
            titleJp  ? `${titleJp} OP 1`            : null,
            titleEn  ? `${titleEn} OP 1 full`       : null,
            titleEn  ? `${titleEn} opening 1`        : null,
            titleRu  ? `${titleRu} опенинг`          : null,
        ].filter(Boolean);

        for (const q of queries) {
            if (youtubeId) break;
            try {
                const r = await fetch(`${BACKEND}/yt-search?q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(10000) });
                const d = r.ok ? await r.json() : null;
                if (d?.id) youtubeId = d.id;
            } catch (_) {}
        }
    }

    if (!youtubeId) return;
    if (!document.querySelector('#shiki-header-block .shiki-wrap')) return;

    let el;
    if (BACKEND) {
        el = document.createElement('video');
        el.className = 'shiki-video-bg';
        el.src = `${BACKEND}/yt-stream?id=${youtubeId}`;
        el.autoplay = true;
        el.muted = true;
        el.loop = true;
        el.playsInline = true;
        el.addEventListener('canplay', () => { el.style.opacity = '1'; }, { once: true });
        el.addEventListener('error', () => { el.remove(); }, { once: true });
    } else {
        el = document.createElement('iframe');
        el.className = 'shiki-video-bg';
        el.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeId)}?autoplay=1&mute=1&loop=1&playlist=${encodeURIComponent(youtubeId)}&controls=0&disablekb=1&rel=0`;
        el.allow = 'autoplay';
        el.setAttribute('allowfullscreen', '');
        el.addEventListener('load', () => { setTimeout(() => { el.style.opacity = '1'; }, 300); }, { once: true });
    }

    wrap.insertBefore(el, wrap.firstChild);
}

async function _injectFranchiseSlot(malId) {
    let details;
    try { details = await getFranchiseDetails(malId); } catch (_) { return; }
    const slot = document.getElementById('shiki-franchise-slot');
    if (!slot || !details?.length) return;
    const items = details.filter(d => d.type !== 'Music');
    if (items.length < 2) return;
    const html = items.map(d => {
        const isCur = d.malId === Number(malId);
        const kind = d.type ? formatAnimeKind(d.type) : '';
        return `<div class="shiki-fr-item${isCur ? ' shiki-fr-item--current' : ''}" ${isCur ? '' : `onclick="fetchAndWatchByMalId(${d.malId})"`} title="${escapeHtml(d.titleRu || d.title)}">
            <img class="shiki-fr-img" src="${proxyImg(d.image)}" onerror="imgFallback(this)" alt="">
            <div class="shiki-fr-title">${escapeHtml(d.titleRu || d.title)}</div>
            <div class="shiki-fr-meta">${[d.year, kind].filter(Boolean).join(' · ')}</div>
        </div>`;
    }).join('');
    slot.innerHTML = `
        <div class="shiki-section-title">Франшиза <span style="opacity:.4;font-weight:400;font-size:.9em">${items.length}</span></div>
        <div class="shiki-fr-scroll">${html}</div>`;
}

async function fetchShiki(malId) {
    if (_shikiCache[malId] !== undefined) return _shikiCache[malId];
    try {
        const res = await fetch(`/shiki?id=${malId}`, { signal: AbortSignal.timeout(10000) });
        const d = await res.json();
        _shikiCache[malId] = { titleRu: d.russian || '', descriptionRu: stripShikiBBCode(d.description || '') };
    } catch (_) { _shikiCache[malId] = { titleRu: '', descriptionRu: '' }; }
    return _shikiCache[malId];
}

// Описание части с учётом языка (RU — из Shikimori, иначе англ. синопсис)
function synOf(d) {
    return (currentLang === 'ru' && d.synopsisRu) ? d.synopsisRu : d.synopsis;
}

function ensureFranchiseModal() {
    let modal = document.getElementById('franchise-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'franchise-modal';
        modal.className = 'franchise-modal';
        document.body.appendChild(modal);
    }
    return modal;
}

async function openFranchiseModal(malId) {
    const token = ++_franchiseToken;
    const modal = ensureFranchiseModal();
    document.body.style.overflow = 'hidden';

    // Каркас со спиннером
    modal.innerHTML = `
        <div class="franchise-backdrop" onclick="closeFranchiseModal()"></div>
        <div class="franchise-panel">
            <div class="franchise-head">
                <button onclick="closeFranchiseModal()" class="franchise-back" aria-label="Назад">
                    <i data-lucide="arrow-left" class="w-5 h-5"></i>
                </button>
                <div class="min-w-0 flex-1">
                    <h2 class="franchise-title">${t('franchise_title')}</h2>
                    <p class="franchise-sub" id="franchise-sub">${t('franchise_loading')}</p>
                </div>
                <button onclick="closeFranchiseModal(); openFranchisePage(${Number(malId)})" class="franchise-fullpage-btn">
                    <span class="hidden sm:inline">${t('franchise_fullpage_btn')}</span>
                    <i data-lucide="arrow-right" class="w-4 h-4"></i>
                </button>
            </div>
            <div class="franchise-body" id="franchise-body">
                <div class="franchise-spinner"><span class="player-play-spinner"></span><span>${t('franchise_loading')}</span></div>
            </div>
        </div>`;
    requestAnimationFrame(() => modal.classList.add('is-open'));
    lucide.createIcons();

    // Быстрая загрузка через Shikimori (один запрос, без throttle)
    let details;
    try { details = await getFranchiseDetails(Number(malId)); }
    catch (_) { details = []; }
    if (token !== _franchiseToken) return;
    renderFranchiseContent(details, malId);
    if (currentLang === 'ru') loadFranchiseDescriptions(details, () => token === _franchiseToken);
}

function renderFranchiseContent(details, currentMalId) {
    const body = document.getElementById('franchise-body');
    const sub = document.getElementById('franchise-sub');
    if (!body) return;

    if (!details.length) {
        body.innerHTML = `<p class="franchise-empty">${t('nothing_found')}</p>`;
        if (sub) sub.textContent = '';
        return;
    }
    const main = details.filter(d => d.type !== 'Music');
    if (sub) sub.textContent = t('franchise_count', main.length);

    const timeline = main.map(d => {
        const isCurrent = d.malId === Number(currentMalId);
        const meta = [d.year || '', d.type ? formatAnimeKind(d.type) : '', d.episodes ? t('episodes_count', d.episodes) : '']
            .filter(Boolean).join(' · ');
        return `
        <div class="franchise-item${isCurrent ? ' franchise-item--current' : ''}">
            <div class="franchise-dot"></div>
            <div class="franchise-poster">
                ${d.image ? `<img src="${proxyImg(d.image)}" alt="" loading="lazy" onerror="imgFallback(this)">` : ''}
            </div>
            <div class="franchise-item-body">
                <div class="franchise-item-meta">${escapeHtml(meta)}${isCurrent ? ` <span class="franchise-current-tag">${t('franchise_current')}</span>` : ''}</div>
                <h3 class="franchise-item-title" data-title-id="${d.malId}">${escapeHtml(d.titleRu || d.title)}</h3>
                ${d.airedStr ? `<p class="franchise-item-date"><i data-lucide="calendar" class="w-3.5 h-3.5"></i> ${escapeHtml(d.airedStr)}</p>` : ''}
                <p class="franchise-item-synopsis" data-synopsis-id="${d.malId}" style="${synOf(d) ? '' : 'display:none'}">${escapeHtml(synOf(d))}</p>
                <button onclick="watchFromFranchise(${d.malId})" class="franchise-watch"><i data-lucide="play" class="w-4 h-4 fill-current"></i> ${t('franchise_watch')}</button>
            </div>
        </div>`;
    }).join('');

    body.innerHTML = timeline;
    lucide.createIcons();
}

function closeFranchiseModal() {
    _franchiseToken++;  // отменяем незавершённую загрузку
    const modal = document.getElementById('franchise-modal');
    if (!modal) return;
    modal.classList.remove('is-open');
    setTimeout(() => { if (modal) modal.innerHTML = ''; }, 250);
    document.body.style.overflow = '';
}

function watchFromFranchise(malId) {
    closeFranchiseModal();
    fetchAndWatchByMalId(malId);
}

function openFranchiseYoutube(malId) {
    const d = _animeDetailCache[malId];
    if (d?.youtubeId) openYoutubeModal(d.youtubeId, d.titleRu || d.title);
}

// ─── Полноценная страница франшизы ────────────────────────────────────────────
let _franchisePageToken = 0;
let currentFranchiseRoot = null;

// Подтянуть связанные (relations) без побочных эффектов DOM
async function ensureRelations(malId) {
    if (_relatedCache[malId]) return _relatedCache[malId];
    try {
        const res = await jikanFetch(`/anime/${malId}/relations`, AbortSignal.timeout(12000));
        const data = await res.json();
        const seen = new Set();
        const entries = [];
        (data.data || []).forEach(rel => {
            (rel.entry || []).forEach(e => {
                if (e.type !== 'anime' || e.mal_id === malId || seen.has(e.mal_id)) return;
                seen.add(e.mal_id);
                entries.push({ malId: e.mal_id, name: e.name, relation: rel.relation });
            });
        });
        _relatedCache[malId] = entries;
        return entries;
    } catch (_) { return []; }
}

// Shikimori kind → тип как в Jikan
function shikiKindToType(kind) {
    return { tv:'TV', tv_13:'TV', tv_24:'TV', tv_48:'TV', movie:'Movie', ova:'OVA', ona:'ONA', special:'Special', tv_special:'Special', music:'Music' }[kind] || kind || '';
}

// Shikimori member → наш внутренний объект (без описания — догружается отдельно)
function normalizeShikiMember(m) {
    let airedStr = '';
    try {
        const fmt = d => new Date(d).toLocaleDateString(currentLang === 'ru' ? 'ru-RU' : 'en-US', { year:'numeric', month:'short', day:'numeric' });
        airedStr = m.aired_on ? (m.released_on && m.released_on !== m.aired_on ? `${fmt(m.aired_on)} – ${fmt(m.released_on)}` : fmt(m.aired_on)) : '';
    } catch (_) { airedStr = (m.aired_on || '').slice(0, 10); }
    return {
        malId:    Number(m.id),
        title:    m.name || '',
        titleRu:  m.russian || '',
        type:     shikiKindToType(m.kind),
        image:    `https://shikimori.one/system/animes/original/${m.id}.jpg`,
        synopsis: '', synopsisRu: '',
        year:     m.aired_on ? Number(m.aired_on.slice(0, 4)) : null,
        airedStr,
        airedFrom: m.aired_on ? Date.parse(m.aired_on) : null,
        score:    parseFloat(m.score) || null,
        episodes: m.episodes || null,
        youtubeId: null,
    };
}

// Кэш готовых данных франшизы
const _franchiseDetailsCache = {};

// Загрузить полный список франшизы — один запрос, мгновенный рендер
async function getFranchiseDetails(rootMalId) {
    rootMalId = Number(rootMalId);
    if (_franchiseDetailsCache[rootMalId]) return _franchiseDetailsCache[rootMalId];
    const res = await fetch(`/shiki-franchise?id=${rootMalId}`, { signal: AbortSignal.timeout(15000) });
    const members = await res.json();
    if (!Array.isArray(members) || !members.length) throw new Error('empty');
    const details = members
        .filter(m => m.kind !== 'music' && m.kind !== 'cm')
        .sort((a, b) => (a.aired_on || '9999') < (b.aired_on || '9999') ? -1 : 1)
        .map(normalizeShikiMember);
    _franchiseDetailsCache[rootMalId] = details;
    return details;
}

// Параллельная подгрузка описаний — обновляет DOM по мере прихода
async function loadFranchiseDescriptions(details, getToken) {
    const BATCH = 6;
    for (let i = 0; i < details.length; i += BATCH) {
        if (!getToken()) return;
        await Promise.all(details.slice(i, i + BATCH).map(async d => {
            if (d.synopsisRu) { _updateFranchiseDOM(d); return; }
            try {
                const s = await fetchShiki(d.malId);
                if (!getToken()) return;
                if (s?.descriptionRu) { d.synopsisRu = s.descriptionRu; _updateFranchiseDOM(d); }
                if (s?.titleRu && !d.titleRu) { d.titleRu = s.titleRu; _updateFranchiseTitleDOM(d); }
            } catch (_) {}
        }));
    }
}
function _updateFranchiseDOM(d) {
    document.querySelectorAll(`[data-synopsis-id="${d.malId}"]`).forEach(el => {
        if (!el.textContent.trim()) { el.textContent = d.synopsisRu; el.style.display = ''; }
    });
}
function _updateFranchiseTitleDOM(d) {
    document.querySelectorAll(`[data-title-id="${d.malId}"]`).forEach(el => {
        if (el.textContent === d.title) el.textContent = d.titleRu;
    });
}

async function openFranchisePage(rootMalId) {
    rootMalId = Number(rootMalId);
    const token = ++_franchisePageToken;
    currentFranchiseRoot = rootMalId;
    showSection('franchise-page');
    const container = document.getElementById('franchise-page-container');
    if (!container) return;
    container.innerHTML = `<div class="franchise-spinner"><span class="player-play-spinner"></span><span>${t('franchise_loading')}</span></div>`;

    let details;
    try { details = await getFranchiseDetails(rootMalId); }
    catch (_) { details = []; }
    if (token !== _franchisePageToken) return;
    renderFranchisePage(details, rootMalId);
    loadSimilarFranchises(rootMalId, token);
    if (currentLang === 'ru') loadFranchiseDescriptions(details, () => token === _franchisePageToken);
}

function renderFranchisePage(details, rootMalId) {
    const container = document.getElementById('franchise-page-container');
    if (!container) return;
    const franchiseId = `franchise_${rootMalId}`;
    const main = details.filter(d => d.type !== 'Music');
    const origin = main[0] || details[0] || {};
    const totalEps = main.reduce((s, d) => s + (d.episodes || 0), 0);

    const heroMeta = [
        t('franchise_count_short', main.length),
        totalEps ? t('episodes_count', totalEps) : '',
        origin.year ? `${t('franchise_since')} ${origin.year}` : '',
    ].filter(Boolean).join(' · ');

    const chronology = main.map((d, idx) => {
        const isCurrent = d.malId === Number(rootMalId);
        const meta = [d.year || '', d.type ? formatAnimeKind(d.type) : '', d.episodes ? t('episodes_count', d.episodes) : '']
            .filter(Boolean).join(' · ');
        const action = `<button onclick="watchFromFranchise(${d.malId})" class="franchise-watch"><i data-lucide="play" class="w-4 h-4 fill-current"></i> ${t('franchise_watch')}</button>`;
        return `
        <div class="franchise-item franchise-item--page${isCurrent ? ' franchise-item--current' : ''}">
            <div class="franchise-num">${idx + 1}</div>
            <div class="franchise-dot"></div>
            <div class="franchise-poster franchise-poster--lg">
                ${d.image ? `<img src="${proxyImg(d.image)}" alt="" loading="lazy" onerror="imgFallback(this)">` : ''}
            </div>
            <div class="franchise-item-body">
                <div class="franchise-item-meta">${escapeHtml(meta)}</div>
                <h3 class="franchise-item-title" data-title-id="${d.malId}">${escapeHtml(d.titleRu || d.title)}</h3>
                ${d.airedStr ? `<p class="franchise-item-date"><i data-lucide="calendar" class="w-3.5 h-3.5"></i> ${escapeHtml(d.airedStr)}${d.score ? ` · ★ ${d.score}` : ''}</p>` : ''}
                <p class="franchise-page-synopsis" data-synopsis-id="${d.malId}" style="${synOf(d) ? '' : 'display:none'}">${escapeHtml(synOf(d))}</p>
                ${action}
            </div>
        </div>`;
    }).join('');

    container.innerHTML = `
        <div class="franchise-hero">
            ${origin.image ? `<img src="${proxyImg(origin.image)}" alt="" class="franchise-hero-bg" aria-hidden="true">` : ''}
            <div class="franchise-hero-shade"></div>
            <div class="franchise-hero-inner">
                ${origin.image ? `<img src="${proxyImg(origin.image)}" alt="" class="franchise-hero-poster" onerror="imgFallback(this)">` : ''}
                <div class="franchise-hero-text">
                    <p class="franchise-hero-kicker">${t('franchise_title')}</p>
                    <h1 class="franchise-hero-name" data-title-id="${origin.malId}">${escapeHtml(origin.titleRu || origin.title || '')}</h1>
                    <p class="franchise-hero-meta">${escapeHtml(heroMeta)}</p>
                    <p class="franchise-hero-desc" data-synopsis-id="${origin.malId}" style="${synOf(origin) ? '' : 'display:none'}">${escapeHtml(synOf(origin))}</p>
                </div>
            </div>
        </div>

        <div>
            <h2 class="franchise-block-title"><i data-lucide="list-ordered" class="w-5 h-5 text-airbnb"></i> ${t('franchise_chronology')}</h2>
            <div class="franchise-timeline">${chronology}</div>
        </div>

        <div id="franchise-similar-section">
            <h2 class="franchise-block-title"><i data-lucide="sparkles" class="w-5 h-5 text-airbnb"></i> ${t('franchise_similar')}</h2>
            <div id="franchise-similar-grid" class="ongoing-scroll flex gap-3 md:gap-4 overflow-x-auto pb-1 -mx-1 px-1">
                <div class="franchise-spinner" style="padding:24px"><span class="player-play-spinner"></span></div>
            </div>
        </div>

        <div>
            <h2 class="franchise-block-title"><i data-lucide="message-circle" class="w-5 h-5 text-airbnb"></i> ${t('franchise_comments')}</h2>
            <div id="franchise-comments">${renderFranchiseCommentsBlock(franchiseId)}</div>
        </div>`;
    lucide.createIcons();
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

async function loadSimilarFranchises(rootMalId, token) {
    const grid = document.getElementById('franchise-similar-grid');
    if (!grid) return;
    try {
        const res = await jikanFetch(`/anime/${rootMalId}/recommendations`, AbortSignal.timeout(10000));
        const data = await res.json();
        if (token !== _franchisePageToken) return;
        const recs = (data.data || []).slice(0, 10).map(r => r.entry).filter(Boolean);
        if (!recs.length) { document.getElementById('franchise-similar-section')?.classList.add('hidden'); return; }
        grid.innerHTML = recs.map(e => `
            <article class="ongoing-card cursor-pointer group" onclick="openFranchisePage(${e.mal_id})">
                <div class="relative aspect-[3/4] overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800 mb-2.5">
                    <img src="${proxyImg(e.images?.jpg?.large_image_url || e.images?.jpg?.image_url || '')}" alt=""
                         class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" onerror="imgFallback(this)">
                </div>
                <h3 class="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2 leading-snug">${escapeHtml(e.title)}</h3>
            </article>`).join('');
        lucide.createIcons();
    } catch (_) { document.getElementById('franchise-similar-section')?.classList.add('hidden'); }
}

// ─── Комментарии франшизы (self-contained, ключ franchise_<rootMalId>) ─────────
function renderFranchiseCommentsBlock(franchiseId) {
    const comments = getAnimeComments(franchiseId);
    const list = comments.length
        ? comments.map(c => `
            <div class="rounded-2xl border border-subtle p-4 bg-white dark:bg-[#1e1e1e]">
                <div class="flex items-start gap-3">
                    <div class="w-9 h-9 rounded-full bg-airbnb flex-shrink-0 flex items-center justify-center overflow-hidden">${renderCommentAvatar(c.username)}</div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="font-semibold text-gray-900 dark:text-white text-sm">${escapeHtml(c.username)}</span>
                            <span class="text-xs text-gray-500 dark:text-gray-400">${escapeHtml(c.createdAt)}</span>
                        </div>
                        <p class="text-sm text-gray-700 dark:text-gray-300 mt-1.5 leading-6">${escapeHtml(c.text)}</p>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        <button onclick="toggleFranchiseCommentLike('${franchiseId}','${c.id}')" class="flex items-center gap-1 rounded-full px-1.5 py-0.5 hover:bg-gray-100 dark:hover:bg-[#2a2a2a] transition-colors">
                            <i data-lucide="heart" class="w-3.5 h-3.5 ${hasUserLiked(franchiseId, c.id) ? 'fill-current text-airbnb' : 'text-gray-400'}"></i>
                            ${getCommentLikes(franchiseId, c.id).length ? `<span class="text-xs text-gray-500">${getCommentLikes(franchiseId, c.id).length}</span>` : ''}
                        </button>
                        ${currentUser && currentUser.username === c.username ? `<button onclick="deleteFranchiseComment('${franchiseId}','${c.id}')" class="text-xs text-airbnb hover:text-airbnbDark transition-colors">${t('comment_delete')}</button>` : ''}
                    </div>
                </div>
            </div>`).join('')
        : `<div class="rounded-2xl border border-subtle p-6 text-sm text-gray-500 dark:text-gray-400 bg-white dark:bg-[#1e1e1e]">${t('no_comments')}</div>`;

    const form = currentUser
        ? `<form class="space-y-3" onsubmit="submitFranchiseComment(event,'${franchiseId}')">
                <textarea id="franchise-comment-input" rows="3" placeholder="${t('comment_placeholder')}" class="w-full px-4 py-3 rounded-2xl border border-subtle outline-none bg-white dark:bg-[#2a2a2a] dark:text-white resize-none"></textarea>
                <button type="submit" class="bg-airbnb hover:bg-airbnbDark text-white px-5 py-3 rounded-xl font-semibold transition-colors">${t('comment_submit')}</button>
           </form>`
        : `<div class="rounded-2xl border border-subtle p-6 bg-white dark:bg-[#1e1e1e] flex items-center justify-between gap-4">
                <p class="text-sm text-gray-500 dark:text-gray-400">${t('comment_login_sub')}</p>
                <button onclick="openAuthModal('register')" class="bg-airbnb hover:bg-airbnbDark text-white px-5 py-3 rounded-xl font-semibold transition-colors whitespace-nowrap">${t('comment_login_btn')}</button>
           </div>`;

    return `<div class="space-y-4">${form}<div class="space-y-3">${list}</div></div>`;
}

function refreshFranchiseComments() {
    const wrap = document.getElementById('franchise-comments');
    if (wrap && currentFranchiseRoot != null) {
        wrap.innerHTML = renderFranchiseCommentsBlock(`franchise_${currentFranchiseRoot}`);
        lucide.createIcons();
    }
}

function submitFranchiseComment(event, franchiseId) {
    event.preventDefault();
    if (!currentUser) { openAuthModal('login'); return; }
    const input = document.getElementById('franchise-comment-input');
    const text = input?.value.trim() || '';
    if (text.length < 2) { showToast(t('comment_too_short'), 'error'); return; }
    const comments = getAnimeComments(franchiseId);
    comments.unshift({ id: `${Date.now()}`, username: currentUser.username, text, createdAt: new Date().toLocaleString('ru-RU') });
    saveAnimeComments(franchiseId, comments);
    refreshFranchiseComments();
    showToast(t('toast_comment_sent'), 'success');
}

function deleteFranchiseComment(franchiseId, commentId) {
    saveAnimeComments(franchiseId, getAnimeComments(franchiseId).filter(c => c.id !== commentId));
    refreshFranchiseComments();
}

function toggleFranchiseCommentLike(franchiseId, commentId) {
    if (!currentUser) { openAuthModal('login'); return; }
    const all = getAllLikes();
    const key = `${franchiseId}_${commentId}`;
    const arr = all[key] || [];
    const i = arr.indexOf(currentUser.username);
    if (i >= 0) arr.splice(i, 1); else arr.push(currentUser.username);
    all[key] = arr;
    saveAllLikes(all);
    refreshFranchiseComments();
}


// ─── Каталог франшиз (отдельное меню) ──────────────────────────────────────────
// kw — английское ключевое слово для поиска всех тайтлов франшизы по названию.
const FRANCHISE_PICKS = [
    { malId: 16498, name: 'Атака титанов',            kw: 'Shingeki no Kyojin' },
    { malId: 38000, name: 'Клинок, рассекающий демонов', kw: 'Kimetsu no Yaiba' },
    { malId: 40748, name: 'Магическая битва',         kw: 'Jujutsu Kaisen' },
    { malId: 31964, name: 'Моя геройская академия',   kw: 'Hero Academia' },
    { malId: 20,    name: 'Наруто',                   kw: 'Naruto' },
    { malId: 21,    name: 'One Piece',                kw: 'One Piece' },
    { malId: 269,   name: 'Блич',                     kw: 'Bleach' },
    { malId: 11061, name: 'Хантер х Хантер',          kw: 'Hunter x Hunter' },
    { malId: 31240, name: 'Re:Zero',                  kw: 'Re:Zero' },
    { malId: 30831, name: 'KonoSuba',                 kw: 'Kono Subarashii' },
    { malId: 37430, name: 'О моём перерождении в слизь', kw: 'Tensei shitara Slime' },
    { malId: 11757, name: 'Sword Art Online',         kw: 'Sword Art Online' },
    { malId: 9253,  name: 'Steins;Gate',              kw: 'Steins;Gate' },
    { malId: 5081,  name: 'Истории (Monogatari)',     kw: 'monogatari' },
    { malId: 356,   name: 'Fate',                     kw: 'Fate' },
    { malId: 1575,  name: 'Code Geass',               kw: 'Code Geass' },
    { malId: 14719, name: 'ДжоДжо',                   kw: 'JoJo' },
    { malId: 30,    name: 'Евангелион',               kw: 'Evangelion' },
    { malId: 1535,  name: 'Тетрадь смерти',           kw: 'Death Note' },
    { malId: 30276, name: 'Ванпанчмен',               kw: 'One Punch Man' },
    { malId: 32182, name: 'Моб Психо 100',            kw: 'Mob Psycho' },
    { malId: 29803, name: 'Overlord',                 kw: 'Overlord' },
    { malId: 5114,  name: 'Стальной алхимик',         kw: 'Fullmetal Alchemist' },
    { malId: 918,   name: 'Гинтама',                  kw: 'Gintama' },
    { malId: 22319, name: 'Токийский гуль',           kw: 'Tokyo Ghoul' },
    { malId: 34572, name: 'Чёрный клевер',            kw: 'Black Clover' },
    { malId: 38691, name: 'Доктор Стоун',             kw: 'Dr. Stone' },
    { malId: 37521, name: 'Сага о Винланде',          kw: 'Vinland Saga' },
    { malId: 34599, name: 'Созданный в Бездне',       kw: 'Made in Abyss' },
    { malId: 50265, name: 'Семья шпиона',             kw: 'Spy x Family' },
    { malId: 44511, name: 'Человек-бензопила',        kw: 'Chainsaw Man' },
    { malId: 39535, name: 'Реинкарнация безработного', kw: 'Mushoku Tensei' },
    { malId: 35790, name: 'Восхождение героя щита',   kw: 'Tate no Yuusha' },
    { malId: 20583, name: 'Волейбол!! (Haikyuu)',     kw: 'Haikyuu' },
    { malId: 37999, name: 'Госпожа Кагуя',            kw: 'Kaguya-sama' },
    { malId: 2001,  name: 'Гуррен-Лаганн',            kw: 'Gurren Lagann' },
    { malId: 1,     name: 'Ковбой Бибоп',             kw: 'Cowboy Bebop' },
    { malId: 235,   name: 'Детектив Конан',           kw: 'Detective Conan' },
    { malId: 223,   name: 'Драконий жемчуг',          kw: 'Dragon Ball' },
    { malId: 38671, name: 'Пламенная бригада',        kw: 'Enen no Shouboutai' },
];
const _shikiPoster = id => `https://shikimori.one/system/animes/original/${id}.jpg`;
let _franchisesCatalogRendered = false;

function openFranchisesCatalog() {
    showSection('franchises');
    const grid = document.getElementById('franchises-grid');
    if (!grid || _franchisesCatalogRendered) return;
    _franchisesCatalogRendered = true;
    // Постеры берём прямой ссылкой из Shikimori по id (мгновенно, без API-троттлинга);
    // при ошибке тихо подменяем на Jikan-постер.
    grid.innerHTML = FRANCHISE_PICKS.map((f, i) => `
        <article class="ongoing-card anim-item cursor-pointer group" style="--i:${Math.min(i, 24)}" onclick="openFranchisePage(${f.malId})">
            <div class="relative aspect-[3/4] overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800 mb-2.5">
                <img src="${proxyImg(_shikiPoster(f.malId))}" alt="${escapeHtml(f.name)}"
                     onerror="fixFranchisePoster(this, ${f.malId})"
                     class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy">
                <span class="absolute top-2 left-2 px-2 py-1 rounded-lg bg-black/55 backdrop-blur-md text-white text-[10px] font-bold flex items-center gap-1">
                    <i data-lucide="git-branch" class="w-3 h-3"></i> ${t('franchises_nav')}
                </span>
            </div>
            <h3 class="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2 leading-snug">${escapeHtml(f.name)}</h3>
        </article>`).join('');
    lucide.createIcons();
    staggerAnimItems(grid);
}

// Фолбэк постера: если Shikimori-картинка не загрузилась — берём из Jikan
async function fixFranchisePoster(img, malId) {
    img.onerror = null;
    const d = await fetchAnimeDetail(malId);
    if (d?.image) img.src = proxyImg(d.image);
}

// ─── Studio browser ───────────────────────────────────────────────────────────

function _collectAllAnime() {
    const seen = new Set();
    const out = [];
    for (const a of [...animeData, ...ongoingAnime, ...topRowAnime, ...popularRowAnime, ...recommendedAnime]) {
        if (!seen.has(a.id)) { seen.add(a.id); out.push(a); }
    }
    return out;
}

function _buildStudioMap() {
    const map = new Map(); // studioId → { id, name, anime: [] }
    for (const anime of _collectAllAnime()) {
        for (const s of (anime.studios || [])) {
            if (!s?.id || !s?.name) continue;
            if (!map.has(s.id)) map.set(s.id, { id: s.id, name: s.name, anime: [] });
            map.get(s.id).anime.push(anime);
        }
    }
    return [...map.values()].sort((a, b) => b.anime.length - a.anime.length);
}

let _currentStudioFilter = '';
let _currentStudioId = null;

function openStudiosPage(studioId, studioName) {
    showSection('studios');
    renderStudiosSection();
    if (studioId) {
        _selectStudioInternal(studioId, studioName);
    }
}

function openStudioAnime(studioId, studioName) {
    openStudiosPage(studioId, studioName);
}

let _allShikiStudios = [];

async function renderStudiosSection() {
    const container = document.getElementById('studios-chips');
    if (!container) return;
    _currentStudioFilter = '';

    if (!_allShikiStudios.length) {
        container.innerHTML = `<div class="col-span-full flex justify-center py-8"><span class="player-play-spinner"></span></div>`;
        try {
            const r = await fetch('/shiki-studios', { signal: AbortSignal.timeout(10000) });
            const raw = r.ok ? await r.json() : [];
            // Только реальные студии с названием
            _allShikiStudios = raw.filter(s => s.real && s.name).sort((a, b) => a.name.localeCompare(b.name));
        } catch (_) {}
    }

    _renderStudioChips(container);
}

function _renderStudioChips(container) {
    const query = _currentStudioFilter.toLowerCase();
    const filtered = query
        ? _allShikiStudios.filter(s => s.name.toLowerCase().includes(query) || (s.filtered_name || '').toLowerCase().includes(query))
        : _allShikiStudios;

    if (!filtered.length) {
        container.innerHTML = `<p class="text-gray-500 dark:text-gray-400 text-sm col-span-full py-6 text-center">${t('studios_no_data')}</p>`;
        return;
    }
    container.innerHTML = filtered.map(s => `
        <button class="studio-chip ${_currentStudioId === s.id ? 'studio-chip--active' : ''}"
                data-studio-id="${s.id}" data-studio-name="${escapeHtml(s.name)}">
            <span class="studio-chip-name">${escapeHtml(s.name)}</span>
        </button>`).join('');

    container.querySelectorAll('.studio-chip').forEach(btn => {
        btn.addEventListener('click', () => selectStudio(+btn.dataset.studioId, btn.dataset.studioName));
    });
}

function selectStudio(studioId, studioName) {
    _selectStudioInternal(studioId, studioName);
}

const _shikiStudioCache = {};

async function _selectStudioInternal(studioId, studioName) {
    _currentStudioId = studioId;
    document.querySelectorAll('.studio-chip').forEach(el => {
        el.classList.toggle('studio-chip--active', +el.dataset.studioId === studioId);
    });
    const panel = document.getElementById('studio-anime-panel');
    const titleEl = document.getElementById('studio-anime-title');
    const grid = document.getElementById('studio-anime-grid');
    const loadMoreBtn = document.getElementById('studio-load-more');
    if (!panel || !grid) return;
    if (titleEl) titleEl.textContent = studioName;
    panel.classList.remove('hidden');
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    grid.innerHTML = `<div class="col-span-full flex justify-center py-10"><span class="player-play-spinner"></span></div>`;
    if (loadMoreBtn) loadMoreBtn.remove();

    const page = 1;
    let items = _shikiStudioCache[studioId];
    if (!items) {
        try {
            const r = await fetch(`/shiki-studio?id=${studioId}&page=${page}`, { signal: AbortSignal.timeout(12000) });
            const raw = r.ok ? await r.json() : [];
            items = raw.filter(m => m.kind !== 'music' && m.kind !== 'cm').map(normalizeShikiMember);
            _shikiStudioCache[studioId] = items;
        } catch (_) { items = []; }
    }

    if (_currentStudioId !== studioId) return;

    if (!items.length) {
        grid.innerHTML = `<p class="col-span-full text-center text-gray-400 py-8">Ничего не найдено</p>`;
        return;
    }

    grid.innerHTML = renderAnimeCards(items);
    lucide.createIcons();
    staggerAnimItems(grid);

    if (items.length >= 50) {
        const btn = document.createElement('button');
        btn.id = 'studio-load-more';
        btn.className = 'watch-action-btn mx-auto mt-4 block';
        btn.textContent = 'Загрузить ещё';
        btn.onclick = () => _loadMoreStudioAnime(studioId, studioName, 2);
        panel.appendChild(btn);
    }
}

async function _loadMoreStudioAnime(studioId, studioName, page) {
    const btn = document.getElementById('studio-load-more');
    const grid = document.getElementById('studio-anime-grid');
    if (btn) { btn.disabled = true; btn.textContent = 'Загрузка…'; }
    try {
        const r = await fetch(`/shiki-studio?id=${studioId}&page=${page}`, { signal: AbortSignal.timeout(12000) });
        const raw = r.ok ? await r.json() : [];
        const items = raw.filter(m => m.kind !== 'music' && m.kind !== 'cm').map(normalizeShikiMember);
        if (_currentStudioId !== studioId) return;
        if (items.length) {
            grid.insertAdjacentHTML('beforeend', renderAnimeCards(items));
            lucide.createIcons();
            staggerAnimItems(grid);
        }
        if (btn) {
            if (items.length >= 50) { btn.disabled = false; btn.textContent = 'Загрузить ещё'; btn.onclick = () => _loadMoreStudioAnime(studioId, studioName, page + 1); }
            else btn.remove();
        }
    } catch (_) { if (btn) { btn.disabled = false; btn.textContent = 'Загрузить ещё'; } }
}

function filterStudios(query) {
    _currentStudioFilter = query;
    const container = document.getElementById('studios-chips');
    if (container) _renderStudioChips(container);
}

function closeStudioPanel() {
    _currentStudioId = null;
    const panel = document.getElementById('studio-anime-panel');
    if (panel) panel.classList.add('hidden');
    document.querySelectorAll('.studio-chip').forEach(el => el.classList.remove('studio-chip--active'));
}

// ─── Player helpers ───────────────────────────────────────────────────────────

function renderCurrentPlayer() {
    const player = getActiveServers()[currentServerIndex] || getActiveServers()[0];
    if (player.type === 'kodik') return buildKodikDirectPlayerShell();
    if (player.type === 'libria') return buildLibriaPlayerShell();
    if (player.type === 'newtab') return buildNewtabPlayerShell('');
    if (player.type === 'iframe') {
        if (player.resolveUrl) return buildIframeLoadingShell();
        if (player.url) return buildIframePlayerShell(player.url(currentAnime.malId, currentEpisodeNum));
    }
    return buildIframePlayerShell('');
}

async function resolveIframeSrc(player, malId, ep) {
    if (!player) return '';
    if (player.resolveUrl) return player.resolveUrl(malId, ep);
    if (player.url) return player.url(malId, ep);
    return '';
}

function showKodikError(noTranslation = false) {
    stopLoadingProgress('kodik');
    const loadingEl = document.getElementById('kodik-loading');
    const fallbackEl = document.getElementById('kodik-fallback-msg');
    if (loadingEl) loadingEl.classList.add('hidden');
    if (fallbackEl) {
        if (noTranslation) {
            const title = fallbackEl.querySelector('.kodik-err-title');
            const sub = fallbackEl.querySelector('.kodik-err-sub');
            if (title) title.textContent = t('kodik_unavailable');
            if (sub) sub.innerHTML = t('kodik_unavailable_sub');
        }
        fallbackEl.classList.remove('hidden');
        lucide.createIcons();
    }
}

// ─── Kodik direct player (480p, без рекламы) ─────────────────────────────────

function buildSeekTrackHtml(prefix) {
    return `
            <div id="${prefix}-seek-track" class="group/seek py-2 cursor-pointer">
                <div class="player-seek-rail w-full h-1 group-hover/seek:h-[5px] bg-white/15 rounded-full relative overflow-visible transition-all duration-150">
                    <div id="${prefix}-buf-bar" class="player-seek-buf absolute left-0 top-0 h-full rounded-full"></div>
                    <div id="${prefix}-load-bar" class="player-seek-load absolute top-0 h-full rounded-full"></div>
                    <div id="${prefix}-prog-bar" class="player-seek-prog absolute left-0 top-0 h-full bg-airbnb rounded-full"></div>
                    <div id="${prefix}-seek-thumb" class="player-seek-thumb absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-lg opacity-0 group-hover/seek:opacity-100 transition-opacity pointer-events-none" style="left:0%"></div>
                </div>
            </div>`;
}

function buildKodikDirectPlayerShell() {
    return `
    <div id="kodik-direct-player" class="w-full h-full bg-black relative overflow-hidden"
         tabindex="0" onmousemove="showPlayerControls('kodik')" onmouseleave="scheduleHideControls('kodik')">

        ${buildPlayerPickerHtml()}

        <!-- Загрузка -->
        <div id="kodik-loading" class="absolute inset-0 flex items-center justify-center bg-black z-20 pointer-events-none">
            ${buildLoadingOverlayContent('kodik', true)}
        </div>

        <!-- Видео -->
        <video id="kodik-video" class="w-full h-full hidden cursor-pointer" playsinline preload="metadata"></video>
        <canvas id="kodik-canvas" class="hidden absolute inset-0 w-full h-full cursor-pointer"></canvas>

        <!-- Начать просмотр -->
        <div id="kodik-start-overlay" class="player-start-overlay hidden">
            <button type="button" onclick="startPlayerPlayback('kodik')" class="player-start-btn">
                <i data-lucide="play" class="w-8 h-8 fill-current"></i>
            </button>
            <p class="player-start-label">${t('start_watch')}</p>
            <p id="kodik-start-time" class="player-start-time">0:00</p>
        </div>

        <!-- Панель качества -->
        <div id="kodik-quality-panel" class="hidden absolute z-50" style="bottom:58px;right:12px;">
            <div class="player-quality-popup player-quality-scroll bg-[#111]/95 backdrop-blur-md border border-white/10 shadow-2xl">
                <div class="player-quality-popup-head">
                    <i data-lucide="sliders-horizontal" class="w-3.5 h-3.5 text-airbnb"></i>
                    ${escapeHtml(t('quality_panel'))}
                </div>
                <div id="kodik-quality-list" class="py-1"></div>
            </div>
        </div>
        ${buildFitPanel('kodik')}

        <!-- Контролы -->
        <div id="kodik-controls" class="hidden absolute bottom-0 left-0 right-0 z-30 transition-opacity duration-300"
             style="background:linear-gradient(to top,rgba(0,0,0,0.92) 0%,rgba(0,0,0,0.5) 55%,transparent 100%);padding:0 14px 14px;">
            <!-- Seek track -->
            ${buildSeekTrackHtml('kodik')}
            <!-- Кнопки -->
            <div class="flex items-center gap-2 flex-wrap">
                <button id="kodik-play-btn" onclick="toggleKodikPlay()" class="player-play-btn text-white hover:text-airbnb transition-colors p-1">
                    <i data-lucide="play" class="w-5 h-5"></i>
                </button>
                <span id="kodik-time" class="text-white/70 text-xs font-mono tabular-nums select-none">0:00 / 0:00</span>
                <div class="flex items-center gap-1.5 ml-auto">
                    <button id="kodik-vol-btn" onclick="toggleKodikMute()" class="text-white/80 hover:text-white transition-colors p-1">
                        <i data-lucide="volume-2" class="w-4 h-4"></i>
                    </button>
                    <input type="range" id="kodik-vol-slider" min="0" max="1" step="0.02" value="1"
                        oninput="setKodikVolume(this.value)"
                        class="player-range w-14 cursor-pointer">
                    <select onchange="setKodikSpeed(this.value)" class="player-select bg-transparent text-white/70 text-xs outline-none cursor-pointer hover:text-white transition-colors appearance-none px-1">
                        <option value="0.5"  class="bg-[#111]">0.5×</option>
                        <option value="0.75" class="bg-[#111]">0.75×</option>
                        <option value="1"    class="bg-[#111]" selected>1×</option>
                        <option value="1.25" class="bg-[#111]">1.25×</option>
                        <option value="1.5"  class="bg-[#111]">1.5×</option>
                        <option value="2"    class="bg-[#111]">2×</option>
                    </select>
                    <!-- Quality button -->
                    <button onclick="toggleQualityPanel('kodik')" id="kodik-quality-btn"
                        class="text-white/80 hover:text-white text-[11px] font-bold px-2 py-0.5 rounded-lg border border-white/20 hover:border-airbnb hover:text-airbnb transition-colors whitespace-nowrap">
                        <span id="kodik-quality-label">HD</span>
                    </button>
                    ${buildFitBtn('kodik')}
                    <button onclick="toggleKodikFullscreen()" class="text-white/80 hover:text-white transition-colors p-1">
                        <i data-lucide="maximize" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>
        </div>

        <!-- Ошибка / fallback -->
        <div id="kodik-fallback-msg" class="hidden absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#0a0a0a] text-white text-center px-6 z-30">
            <i data-lucide="wifi-off" class="w-10 h-10 text-gray-500"></i>
            <p class="font-semibold kodik-err-title">${t('player_error_title')}</p>
            <p class="text-sm text-gray-400 kodik-err-sub">${t('player_error_sub')}</p>
            <div class="flex gap-3 flex-wrap justify-center mt-2">
                <button onclick="nextServer()" class="px-4 py-2 bg-airbnb text-white rounded-xl text-sm font-semibold hover:bg-airbnbDark transition-colors">${t('next_server')}</button>
            </div>
        </div>
    </div>`;
}

// ─── AniLibria 4K WebGL player ────────────────────────────────────────────────

function buildLibriaPlayerShell() {
    return `
    <div id="libria-player" class="w-full h-full bg-black relative overflow-hidden"
         tabindex="0" onmousemove="showPlayerControls('libria')" onmouseleave="scheduleHideControls('libria')">

        ${buildPlayerPickerHtml()}

        <div id="libria-loading" class="absolute inset-0 flex items-center justify-center bg-black z-20 pointer-events-none">
            ${buildLoadingOverlayContent('libria', true)}
        </div>

        <video id="libria-video" playsinline crossorigin="anonymous"
            style="position:absolute;width:1px;height:1px;top:0;left:0;opacity:0;pointer-events:none;"></video>
        <canvas id="libria-canvas" class="w-full h-full hidden cursor-pointer"></canvas>

        <!-- Начать просмотр -->
        <div id="libria-start-overlay" class="player-start-overlay hidden">
            <button type="button" onclick="startPlayerPlayback('libria')" class="player-start-btn">
                <i data-lucide="play" class="w-8 h-8 fill-current"></i>
            </button>
            <p class="player-start-label">${t('start_watch')}</p>
            <p id="libria-start-time" class="player-start-time">0:00</p>
        </div>

        <!-- Панель качества (4K) -->
        <div id="libria-quality-panel" class="hidden absolute z-50" style="bottom:58px;right:12px;">
            <div class="player-quality-popup player-quality-scroll bg-[#111]/95 backdrop-blur-md border border-white/10 shadow-2xl">
                <div class="player-quality-popup-head">
                    <i data-lucide="sliders-horizontal" class="w-3.5 h-3.5 text-airbnb"></i>
                    ${escapeHtml(t('quality_panel'))}
                </div>
                <div id="libria-quality-list" class="py-1"></div>
            </div>
        </div>
        ${buildFitPanel('libria')}

        <!-- Контролы -->
        <div id="libria-controls" class="hidden absolute bottom-0 left-0 right-0 z-30 transition-opacity duration-300"
             style="background:linear-gradient(to top,rgba(0,0,0,0.92) 0%,rgba(0,0,0,0.5) 55%,transparent 100%);padding:0 14px 14px;">
            ${buildSeekTrackHtml('libria')}
            <!-- Кнопки -->
            <div class="flex items-center gap-2 flex-wrap">
                <button id="libria-play-btn" onclick="toggleLibriaPlay()" class="player-play-btn text-white hover:text-airbnb transition-colors p-1">
                    <i data-lucide="play" class="w-5 h-5"></i>
                </button>
                <span id="libria-time" class="text-white/70 text-xs font-mono tabular-nums select-none">0:00 / 0:00</span>
                <div class="flex items-center gap-1.5 ml-auto">
                    <button id="libria-vol-btn" onclick="toggleLibriaMute()" class="text-white/80 hover:text-white transition-colors p-1">
                        <i data-lucide="volume-2" class="w-4 h-4"></i>
                    </button>
                    <input type="range" id="libria-vol-slider" min="0" max="1" step="0.02" value="1"
                        oninput="setLibriaVolume(this.value)"
                        class="player-range w-14 cursor-pointer">
                    <select onchange="setLibriaSpeed(this.value)" class="player-select bg-transparent text-white/70 text-xs outline-none cursor-pointer hover:text-white transition-colors appearance-none px-1">
                        <option value="0.5"  class="bg-[#111]">0.5×</option>
                        <option value="0.75" class="bg-[#111]">0.75×</option>
                        <option value="1"    class="bg-[#111]" selected>1×</option>
                        <option value="1.25" class="bg-[#111]">1.25×</option>
                        <option value="1.5"  class="bg-[#111]">1.5×</option>
                        <option value="2"    class="bg-[#111]">2×</option>
                    </select>
                    <!-- Quality button -->
                    <button onclick="toggleQualityPanel('libria')" id="libria-quality-btn"
                        class="text-white/80 hover:text-white text-[11px] font-bold px-2 py-0.5 rounded-lg border border-white/20 hover:border-airbnb hover:text-airbnb transition-colors whitespace-nowrap">
                        <span id="libria-quality-label">1080p</span>
                    </button>
                    ${buildFitBtn('libria')}
                    <button onclick="toggleLibriaFullscreen()" class="text-white/80 hover:text-white transition-colors p-1">
                        <i data-lucide="maximize" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>
        </div>

        <div id="libria-error" class="hidden absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#0a0a0a] text-white text-center px-6 z-40">
            <i data-lucide="frown" class="w-10 h-10 text-gray-500"></i>
            <p class="font-semibold">${t('libria_not_found')}</p>
            <p class="text-sm text-gray-400">${t('libria_try_other')}</p>
            <button onclick="nextServer()" class="px-4 py-2 bg-airbnb text-white rounded-xl text-sm font-semibold hover:bg-airbnbDark transition-colors">${t('next_server')}</button>
        </div>
    </div>`;
}

// ─── Kodik direct video extraction (ad-free) ──────────────────────────────────

function parseKodikLink(link) {
    const url = link.startsWith('//') ? 'https:' + link : link;
    const m = url.match(/kodik(?:player)?\.(?:info|com)\/(seria|serial|video|anime-serial|anime)\/(\d+)\/([a-zA-Z0-9]+)/i);
    return m ? { type: m[1], id: m[2], hash: m[3] } : null;
}

function decodeKodikUrl(encoded) {
    if (!encoded || encoded.includes('//')) return encoded || null; // уже готовая ссылка

    // Официальный алгоритм из JS плеера Kodik: ROT+18 по буквам → atob()
    try {
        const shifted = encoded.replace(/[a-zA-Z]/g, c =>
            String.fromCharCode((c <= 'Z' ? 90 : 122) >= (c = c.charCodeAt(0) + 18) ? c : c - 26)
        );
        const v = atob(shifted);
        if (/\/\/.+\.(m3u8|mp4)/.test(v)) return v.startsWith('//') ? 'https:' + v : v;
    } catch (_) {}

    // Запасной метод (старые версии): просто atob + reverse
    try {
        const v = atob(encoded).split('').reverse().join('');
        if (/\/\/.+\.(m3u8|mp4)/.test(v)) return v.startsWith('//') ? 'https:' + v : v;
    } catch (_) {}

    return null;
}

// Кеш embed HTML по URL
const kodikEmbedHtmlCache = {};
const kodikEmbedParamsCache = {};

// Кеш прямых URL видео по ссылке эпизода (1ч TTL — Kodik URL живут долго)
const _kodikDirectCache = {}; // epLink → { url, qMap, exp }

// Извлечь все доступные качества из ответа Kodik
function _extractAllKodikUrls(data) {
    const map = {};
    for (const q of ['1080p','1080','720p','720','480p','480','360p','360']) {
        const src = data.links?.[q]?.[0]?.src;
        if (src) {
            const u = decodeKodikUrl(src);
            if (u) {
                const label = q.replace(/(\d+)p?$/, '$1p'); // нормализуем к "1080p"
                if (!map[label]) map[label] = u;
            }
        }
    }
    // Kodik физически не отдаёт выше 720p — добавляем WebGL-апскейл как '1080p ✦'
    if (map['720p'] && !map['1080p']) map['1080p ✦'] = map['720p'];
    return map;
}

// Извлечь лучший URL (обратная совместимость) + сохранить карту качеств
function _extractKodikUrl(data) {
    const map = _extractAllKodikUrls(data);
    if (Object.keys(map).length) kodikQualityMap = map;
    for (const q of ['1080p','720p','480p','360p']) {
        if (map[q]) return map[q];
    }
    if (data.src) { const u = decodeKodikUrl(data.src); if (u) return u; }
    return null;
}

// HLS — баланс скорости и стабильности
const HLS_FAST_OPTS = {
    maxBufferLength: 30, maxMaxBufferLength: 60, startLevel: -1, enableWorker: true,
    startFragPrefetch: true,   // тянем первый сегмент заранее → быстрее первый кадр
    testBandwidth: false,      // не тратим время на тест скорости перед стартом
};

// Попытаться запустить воспроизведение сразу; если браузер заблокировал автоплей —
// показать кнопку «Начать просмотр». Это убирает лишнее ожидание + ручной клик.
function autoplayOrPrompt(prefix) {
    const videoEl = getPlayerVideo(prefix);
    if (!videoEl) return;
    const p = videoEl.play();
    if (p && typeof p.then === 'function') {
        p.then(() => {
            playerPlaybackStarted[prefix] = true;
            hideStartWatchOverlay(prefix);
            showPlayerControls(prefix);
            syncPlayerPlayBtn(prefix);
        }).catch(() => {
            videoEl.pause();
            showStartWatchOverlay(prefix);
            syncPlayerPlayBtn(prefix);
        });
    } else {
        showStartWatchOverlay(prefix);
    }
}

function _prefetchKodikNextEpisode() {
    if (!currentAnime?.malId || !currentKodikTranslations.length) return;
    const tr = currentKodikTranslations[currentKodikTranslationIdx];
    if (!tr) return;
    const eps = getPlayerEpisodeNums();
    const nextEp = currentEpisodeNum + 1;
    if (!eps.includes(nextEp)) return;
    fetchKodikEpisodeLink(currentAnime.malId, tr.id, nextEp, currentEpisodeSeasonId)
        .then(link => { if (link) getKodikDirectUrl(link).catch(() => {}); })
        .catch(() => {});
}

async function resolveKodikEpLink(malId, translation, ep) {
    return fetchKodikEpisodeLink(malId, translation.id, ep, currentEpisodeSeasonId);
}

function needsKodikProxy() {
    const h = location.hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || location.protocol === 'file:';
}

async function _tryKodikProxy(body, endpoint = 'ftor') {
    try {
        const res = await fetch(`${BACKEND}/kodik-proxy?endpoint=${encodeURIComponent(endpoint)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
            signal: AbortSignal.timeout(6000),
        });
        if (res.ok) {
            const t = await res.text();
            if (t.startsWith('{')) return _extractKodikUrl(JSON.parse(t));
        }
    } catch (_) {}
    return null;
}

async function _firstKodikPost(endpoints, body, referer) {
    const urls = await Promise.all(endpoints.map(ep => _postKodik(ep, body, referer)));
    return urls.find(Boolean) || null;
}

// Загрузить HTML embed-страницы (параллельно — берём первый успешный)
async function fetchKodikEmbedHtml(embedUrl) {
    if (kodikEmbedHtmlCache[embedUrl]) return kodikEmbedHtmlCache[embedUrl];
    const attempts = [
        async () => {
            const r = await fetch(embedUrl, { signal: AbortSignal.timeout(5000) });
            return r.ok ? r.text() : null;
        },
        async () => {
            const r = await fetch('https://api.allorigins.win/get?url=' + encodeURIComponent(embedUrl), { signal: AbortSignal.timeout(7000) });
            if (!r.ok) return null;
            const j = await r.json(); return j.contents || null;
        },
        async () => {
            const r = await fetch('https://corsproxy.io/?url=' + encodeURIComponent(embedUrl), { signal: AbortSignal.timeout(7000) });
            return r.ok ? r.text() : null;
        },
        async () => {
            const r = await fetch('https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(embedUrl), { signal: AbortSignal.timeout(7000) });
            return r.ok ? r.text() : null;
        },
    ];
    try {
        const html = await Promise.any(attempts.map(fn => fn().then(h => {
            if (h && h.length > 200) return h;
            throw new Error('empty');
        })));
        kodikEmbedHtmlCache[embedUrl] = html;
        return html;
    } catch (_) {
        return null;
    }
}

// Метод А (новый, kodikwrapper): извлечь POST endpoint из atob() в JS плеера
function extractKodikPostEndpoint(html) {
    // Kodik хранит endpoint как: type:"POST",url:atob("base64here")
    const m = html.match(/type\s*:\s*["']POST["'][^}]*?url\s*:\s*atob\(\s*["']([A-Za-z0-9+/=]+)["']\s*\)/i)
           || html.match(/url\s*:\s*atob\(\s*["']([A-Za-z0-9+/=]{20,})["']\s*\)/i);
    if (m) {
        try {
            const decoded = atob(m[1]);
            if (decoded.startsWith('http') || decoded.startsWith('//')) return decoded;
        } catch (_) {}
    }
    return null;
}

// Метод Б (старый): извлечь urlParams с подписанными параметрами
function extractKodikUrlParams(html) {
    const re = html.match(/(?:var|let|const)\s+urlParams\s*=\s*['"]((?:[^'"\\]|\\.)*)['"]/)
            || html.match(/urlParams\s*=\s*['"]((?:[^'"\\]|\\.)*)['"]/);
    if (!re) return null;
    try { return JSON.parse(re[1].replace(/\\'/g, "'")); } catch (_) { return null; }
}

// Вспомогательная функция для POST к Kodik endpoint
async function _postKodik(endpoint, body, referer) {
    if (needsKodikProxy() || BACKEND) {
        const ep = String(endpoint).includes('/kor') ? 'kor' : 'ftor';
        return _tryKodikProxy(body, ep);
    }
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': referer || endpoint,
                'Origin': 'https://kodikplayer.com',
            },
            body,
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return null;
        const text = await res.text();
        if (text.startsWith('{')) return _extractKodikUrl(JSON.parse(text));
    } catch (_) {}
    return null;
}

async function getKodikDirectUrl(link) {
    const ep = parseKodikLink(link);
    if (!ep) return null;

    // Кеш прямого URL (1ч) — переключение серии становится мгновенным
    const cached = _kodikDirectCache[link];
    if (cached && cached.exp > Date.now()) {
        kodikQualityMap = { ...cached.qMap };
        return cached.url;
    }

    kodikQualityMap = {}; // сбрасываем перед новым запросом
    const embedUrl = link.startsWith('//') ? 'https:' + link : link;

    // ── Метод 1: Слепой POST к известным endpoint'ам без HTML ──────────────────
    // Работает на продакшн-домене (CORS разрешён) или через server.js прокси
    const simpleBody = new URLSearchParams({
        hash: ep.hash, id: ep.id, type: ep.type,
        bad_user: 'true', cdn_is_working: 'true',
    });

    // localhost: только через server.js (прямые запросы блокирует CORS)
    let resultUrl = null;

    if (needsKodikProxy()) {
        const [ftorUrl, korUrl] = await Promise.all([
            _tryKodikProxy(simpleBody, 'ftor'),
            _tryKodikProxy(simpleBody, 'kor'),
        ]);
        resultUrl = ftorUrl || korUrl || null;
    } else {
        const directUrl = await _firstKodikPost(
            ['https://kodikplayer.com/ftor', 'https://kodikplayer.com/kor', 'https://kodik.info/ftor'],
            simpleBody, embedUrl
        );
        if (directUrl) { resultUrl = directUrl; }
    }

    if (!resultUrl) {
        // ── Методы 3+4: HTML embed-страницы ─────────────────
        const html = await fetchKodikEmbedHtml(embedUrl);
        if (html) {
            const dynEndpoint = extractKodikPostEndpoint(html);
            if (dynEndpoint) {
                resultUrl = await _postKodik(
                    dynEndpoint.startsWith('//') ? 'https:' + dynEndpoint : dynEndpoint,
                    simpleBody, embedUrl
                ) || null;
            }
            if (!resultUrl) {
                const urlParams = extractKodikUrlParams(html);
                if (urlParams) {
                    const signedBody = new URLSearchParams({
                        ...urlParams, type: ep.type, hash: ep.hash, id: ep.id,
                        bad_user: 'false', cdn_is_working: 'true',
                    });
                    for (const endpoint of [
                        dynEndpoint ? (dynEndpoint.startsWith('//') ? 'https:' + dynEndpoint : dynEndpoint) : null,
                        'https://kodikplayer.com/ftor',
                    ].filter(Boolean)) {
                        const u = await _postKodik(endpoint, signedBody, embedUrl);
                        if (u) { resultUrl = u; break; }
                    }
                    if (!resultUrl && needsKodikProxy()) {
                        resultUrl = await _tryKodikProxy(signedBody, 'ftor') || null;
                    }
                }
            }
        }
    }

    if (resultUrl) {
        _kodikDirectCache[link] = { url: resultUrl, qMap: { ...kodikQualityMap }, exp: Date.now() + 3600000 };
    }
    return resultUrl;
}

function buildKodikFindPlayerUrl(malId, ep, translationId) {
    let url = kodikFindPlayerUrl(malId, ep);
    if (translationId) url += `&translation_id=${translationId}`;
    return url;
}

// Заменить качество в ссылке Kodik на 480p (по исследованию: на 480p реклама не показывается)
function toKodik480p(link) {
    return link.replace(/\/(1080p|720p|480p|360p)(\/|$)/, '/480p$2');
}

async function initKodikPlayer() {
    const token = ++kodikPlayerToken;
    const player = getActiveServers()[currentServerIndex];
    if (!player || player.type !== 'kodik') return;

    // Без прокси и без VPS бэкенда — показываем Kodik iframe напрямую
    if (!needsKodikProxy() && !BACKEND) {
        const viewport = document.getElementById('player-viewport');
        if (viewport && currentAnime?.malId) {
            viewport.innerHTML = buildIframePlayerShell(
                kodikFindPlayerUrl(currentAnime.malId, currentEpisodeNum)
            );
            lucide.createIcons();
        }
        return;
    }

    startLoadingProgress('kodik');

    ensureKodikTranslationForPlayer();

    if (!currentKodikTranslations.length) {
        stopLoadingProgress('kodik');
        showKodikError(true);
        return;
    }

    const translation = currentKodikTranslations[currentKodikTranslationIdx];

    const epLink = await resolveKodikEpLink(currentAnime.malId, translation, currentEpisodeNum);

    if (token !== kodikPlayerToken) return;
    if (!document.getElementById('kodik-loading')) return;

    if (!epLink) {
        stopLoadingProgress('kodik');
        showKodikError();
        return;
    }

    const directUrl = await getKodikDirectUrl(epLink);

    if (token !== kodikPlayerToken) return;
    if (!document.getElementById('kodik-loading')) return;

    if (directUrl) {
        loadKodikVideo(directUrl);
    } else {
        // Прямой URL недоступен — показываем ошибку, кастомный плеер остаётся
        stopLoadingProgress('kodik');
        showKodikError();
    }
}

function showKodikIframe(url) {
    stopLoadingProgress('kodik');
    const viewport = document.getElementById('player-viewport');
    if (!viewport) return;
    if (document.getElementById('kodik-loading')) {
        viewport.innerHTML = buildIframePlayerShell(url);
        lucide.createIcons();
        bindPlayerPickerEvents();
        initIframePlayer();
    } else {
        const iframe = document.getElementById('anime-iframe');
        if (iframe) { iframe.src = url; return; }
        viewport.innerHTML = buildIframePlayerShell(url);
        lucide.createIcons();
        bindPlayerPickerEvents();
        initIframePlayer();
    }
    lucide.createIcons();
}

function loadKodikVideo(url) {
    const loadingEl = document.getElementById('kodik-loading');
    const videoEl   = document.getElementById('kodik-video');
    const ctrlEl    = document.getElementById('kodik-controls');
    if (!videoEl) return;

    playerPlaybackStarted.kodik = false;
    _pendingSeekPct.kodik = null;
    playerBufferState.kodik = { buffering: false, loadingFrag: false, speedBps: 0 };

    finishLoadingProgress('kodik');
    stopLoadingProgress('kodik');
    if (loadingEl) loadingEl.classList.add('hidden');
    videoEl.classList.remove('hidden');
    videoEl.style.width = '100%';
    videoEl.style.height = '100%';
    applyPlayerFitMode();
    if (ctrlEl) { ctrlEl.classList.remove('hidden'); ctrlEl.style.opacity = '1'; }

    if (kodikHls) { kodikHls.destroy(); kodikHls = null; }

    const isM3u8 = !url.match(/\.(mp4|webm|ogg)(\?|$)/i);

    const onFatal = () => {
        kodikHls?.destroy(); kodikHls = null;
        showKodikError();
    };

    const onReady = () => {
        updateKodikTime();
        updateSeekVisual('kodik', videoEl);
        applyResumePosition('kodik');
        autoplayOrPrompt('kodik');
        // Предзагрузка следующей серии в фоне — переключение станет мгновенным
        _prefetchKodikNextEpisode();
    };

    if (isM3u8 && Hls.isSupported()) {
        kodikHls = new Hls({ ...HLS_FAST_OPTS, abrBandWidthFactor: 0.95, abrBandWidthUpFactor: 0.9 });
        kodikHls.loadSource(url);
        kodikHls.attachMedia(videoEl);
        kodikHls.once(Hls.Events.MANIFEST_PARSED, onReady);
        kodikHls.on(Hls.Events.ERROR, (e, d) => { if (d.fatal) onFatal(); });
        bindHlsBufferEvents(kodikHls, 'kodik', videoEl);
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl') && isM3u8) {
        videoEl.src = url;
        videoEl.load();
        videoEl.addEventListener('loadedmetadata', onReady, { once: true });
    } else {
        videoEl.src = url;
        videoEl.load();
        videoEl.addEventListener('loadedmetadata', onReady, { once: true });
    }

    videoEl.addEventListener('timeupdate', updateKodikTime);
    videoEl.addEventListener('play',  () => { updateKodikPlayBtn(false); showPlayerControls('kodik'); });
    videoEl.addEventListener('pause', () => { updateKodikPlayBtn(true);  showPlayerControls('kodik'); });
    videoEl.addEventListener('loadedmetadata', () => {
        if (_pendingSeekPct.kodik != null) {
            seekVideoTo('kodik', videoEl, _pendingSeekPct.kodik * videoEl.duration);
            _pendingSeekPct.kodik = null;
        }
        updateKodikTime();
    });
    videoEl.addEventListener('seeked', () => updateKodikTime());

    bindVideoBufferEvents(videoEl, 'kodik');
    initSeekDrag('kodik-seek-track', videoEl, 'kodik');

    // Инициализируем панель качества
    renderQualityPanel('kodik');
    refreshPlayerPickerInPlace();
    const pendingQ = window._pendingKodikQuality;
    window._pendingKodikQuality = null;
    if (pendingQ && kodikQualityMap[pendingQ]) {
        kodikCurrentQuality = pendingQ;
        updateQualityLabel('kodik', pendingQ);
        setKodikQuality(pendingQ);
    } else {
        const bestQ = sortQualityKeys(Object.keys(kodikQualityMap)).find(q => q !== '1080p ✦') || '';
        if (bestQ) { kodikCurrentQuality = bestQ; updateQualityLabel('kodik', bestQ); }
        else { document.getElementById('kodik-quality-btn')?.classList.add('hidden'); }
    }
    kodikUpscaleHD = (kodikCurrentQuality === '1080p ✦');
    applyKodikUpscale();

    // Запускаем таймер автоскрытия
    showPlayerControls('kodik');

    // Клик мышью → play/pause или старт
    videoEl.addEventListener('click', (e) => {
        if (e.pointerType === 'touch') return;
        if (_seekDragging.kodik) return;
        if (!playerPlaybackStarted.kodik) { showStartWatchOverlay('kodik'); return; }
        toggleKodikPlay();
    });

    // Двойное касание мобайл: лево −10с, право +10с
    let _tCount = 0, _tSide = '', _tTimer = null;
    const playerEl = document.getElementById('kodik-direct-player');
    videoEl.addEventListener('touchend', (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        if (!touch) return;
        const rect = videoEl.getBoundingClientRect();
        const side = touch.clientX < rect.left + rect.width / 2 ? 'left' : 'right';
        _tCount++;
        if (_tCount === 1) {
            _tSide = side;
            _tTimer = setTimeout(() => {
                _tCount = 0;
                if (!playerPlaybackStarted.kodik) showStartWatchOverlay('kodik');
                else toggleKodikPlay();
            }, 280);
        } else if (_tCount >= 2 && _tSide === side) {
            clearTimeout(_tTimer); _tCount = 0;
            const delta = side === 'right' ? 10 : -10;
            seekVideoByDelta('kodik', videoEl, delta);
            showSeekOverlay(playerEl, side, delta);
        } else {
            clearTimeout(_tTimer); _tCount = 1; _tSide = side;
            _tTimer = setTimeout(() => {
                _tCount = 0;
                if (!playerPlaybackStarted.kodik) showStartWatchOverlay('kodik');
                else toggleKodikPlay();
            }, 280);
        }
    }, { passive: false });

    lucide.createIcons();
}

function buildIframeInner(src) {
    const safeSrc = escapeHtml(src || 'about:blank');
    return `
        <div id="player-error" class="absolute inset-0 z-10 hidden flex-col items-center justify-center gap-4 bg-[#0e0e0e] text-white text-center px-6">
            <i data-lucide="wifi-off" class="w-10 h-10 text-gray-500"></i>
            <p class="font-semibold">${t('player_error_title')}</p>
            <p class="text-sm text-gray-400">${t('player_error_sub')}</p>
            <div class="flex gap-3 flex-wrap justify-center mt-2">
                <button onclick="reloadCurrentPlayer()" class="px-4 py-2 bg-white/10 text-white rounded-xl text-sm font-semibold hover:bg-white/20 transition-colors">
                    ${t('reload_player_btn')}
                </button>
                <button onclick="nextServer()" class="px-4 py-2 bg-airbnb text-white rounded-xl text-sm font-semibold hover:bg-airbnbDark transition-colors">
                    ${t('next_server')}
                </button>
            </div>
        </div>
        <iframe id="anime-iframe"
            src="${safeSrc}"
            class="w-full h-full border-0"
            allowfullscreen
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            onload="onIframeLoad(this)"
            onerror="showPlayerError()">
        </iframe>`;
}

function buildNewtabPlayerShell(url = '') {
    const href = url ? ` href="${url}"` : '';
    return `
    <div id="iframe-player" class="w-full h-full bg-black flex flex-col items-center justify-center gap-4 text-white/70">
        <i data-lucide="external-link" style="width:48px;height:48px;opacity:0.4"></i>
        <p class="text-sm text-center px-4">${t('newtab_notice')}</p>
        ${url ? `<a${href} target="_blank" rel="noopener" class="px-5 py-2.5 bg-airbnb text-white rounded-xl text-sm font-semibold hover:bg-airbnbDark transition-colors">${t('newtab_open_btn')}</a>` : ''}
        <button onclick="nextServer()" class="px-4 py-2 bg-white/10 text-white rounded-xl text-sm font-semibold hover:bg-white/20 transition-colors">${t('next_server')}</button>
    </div>`;
}

function buildIframeLoadingShell() {
    // У iframe-плееров свой интерфейс — обвязку/шапку AnyRainy не накладываем
    return `
    <div id="iframe-player" class="w-full h-full bg-black relative overflow-hidden flex items-center justify-center">
        ${buildLoadingOverlayContent('iframe', true)}
    </div>`;
}

function buildIframePlayerShell(src) {
    return `
    <div id="iframe-player" class="w-full h-full bg-black relative overflow-hidden">
        <div class="w-full h-full relative">${buildIframeInner(src)}</div>
    </div>`;
}

function buildIframe(src) {
    return `<div class="w-full h-full bg-black relative">${buildIframeInner(src)}</div>`;
}

function onIframeLoad(iframe) {
    clearTimeout(window._playerErrorTimer);
}

function showPlayerError() {
    clearTimeout(window._playerErrorTimer);
    const el = document.getElementById('player-error');
    if (el) { el.classList.remove('hidden'); el.classList.add('flex'); lucide.createIcons(); }
}

// Перезагрузить текущий плеер
function reloadCurrentPlayer() {
    const el = document.getElementById('player-error');
    if (el) { el.classList.add('hidden'); el.classList.remove('flex'); }
    setServer(currentServerIndex);
}

// Переключиться на следующий плеер
function nextServer() {
    setServer((currentServerIndex + 1) % getActiveServers().length);
}

function setServer(idx) {
    clearTimeout(window._playerErrorTimer);
    window._allohaAutoFallback = false; // ручной выбор плеера отключает авто-фолбэк
    stopLibriaGL();
    if (libriaHls) { libriaHls.destroy(); libriaHls = null; }
    if (kodikHls)  { kodikHls.destroy();  kodikHls  = null; }
    playerPlaybackStarted.kodik = false;
    playerPlaybackStarted.libria = false;
    _seekDragging.kodik = false;
    _seekDragging.libria = false;
    currentServerIndex = idx;
    currentPlayerVoiceIdx = 0;
    if (isKodikWatchPlayer()) ensureKodikTranslationForPlayer();
    const viewport = document.getElementById('player-viewport');
    if (viewport) {
        viewport.innerHTML = renderCurrentPlayer();
        lucide.createIcons();
        initCurrentPlayerType();
    }
    refreshPlayerChrome();
    if (currentAnime) saveWatchProgress(currentAnime);
}

function updateServerButtons() {
    getActiveServers().forEach((s, i) => {
        const btn = document.getElementById(`srv-btn-${i}`);
        if (!btn) return;
        btn.className = `watch-source-pill${i === currentServerIndex ? ' watch-source-pill--active' : ''}`;
    });
    const openBtn = document.getElementById('open-in-browser');
    const player = getActiveServers()[currentServerIndex] || getActiveServers()[0];
    if (openBtn && currentAnime && player) {
        if (player.type === 'kodik' && currentKodikTranslations.length) {
            openBtn.href = currentKodikTranslations[currentKodikTranslationIdx].link;
        } else if (player.type === 'libria') {
            openBtn.href = 'https://www.anilibria.tv/';
        } else if (player.type === 'iframe' && player.url) {
            openBtn.href = player.url(currentAnime.malId, currentEpisodeNum);
        }
    }
}

function selectEpisode(num, seasonId = null) {
    clearTimeout(window._playerErrorTimer);
    stopLibriaGL();
    if (libriaHls) { libriaHls.destroy(); libriaHls = null; }
    if (kodikHls)  { kodikHls.destroy();  kodikHls  = null; }
    if (seasonId != null) currentEpisodeSeasonId = seasonId;
    else syncPlayerSeasonForEpisode(num);
    currentEpisodeNum = num;
    saveWatchProgress(currentAnime, num);
    const viewport = document.getElementById('player-viewport');
    if (viewport) {
        viewport.innerHTML = renderCurrentPlayer();
        lucide.createIcons();
        initCurrentPlayerType();
    }
    refreshPlayerChrome();
}

function initIframePlayer() {
    clearTimeout(window._playerErrorTimer);
    const player = getActiveServers()[currentServerIndex];
    if (!player || player.type !== 'iframe' || !currentAnime) return;

    const token = ++iframePlayerToken;

    (async () => {
        const src = await resolveIframeSrc(player, currentAnime.malId, currentEpisodeNum);
        if (token !== iframePlayerToken) return;

        const viewport = document.getElementById('player-viewport');
        if (!src) {
            _markPlayerUnavailable(player.key);
            // Приоритетная Aloha не резолвится (нет Kinopoisk id) — один раз падаем на AniLibria
            if (window._allohaAutoFallback && player.key === 'alloha') {
                window._allohaAutoFallback = false;
                const fbIdx = Math.max(0, getWatchPlayerIndex('libria'));
                if (fbIdx !== currentServerIndex) { setServer(fbIdx); return; }
            }
            if (viewport) {
                viewport.innerHTML = buildIframePlayerShell('');
                lucide.createIcons();
            }
            showPlayerError();
            return;
        }
        // Плеер нашёл контент — он доступен
        _playerAvailability[player.key] = true;
        // Aloha успешно открылась — фолбэк больше не нужен
        if (player.key === 'alloha') window._allohaAutoFallback = false;

        const iframe = document.getElementById('anime-iframe');
        if (iframe) {
            if (iframe.src !== src) iframe.src = src;
        } else if (viewport) {
            viewport.innerHTML = buildIframePlayerShell(src);
            lucide.createIcons();
            bindPlayerPickerEvents();
        }

        clearTimeout(window._playerErrorTimer);
        window._playerErrorTimer = setTimeout(() => {
            if (token !== iframePlayerToken) return;
            if (getActiveServers()[currentServerIndex]?.type !== 'iframe') return;
            if (!document.getElementById('anime-iframe')) return;
            showPlayerError();
        }, 18000);
    })();
}

function selectVoice(idx) {
    clearTimeout(window._playerErrorTimer);
    if (kodikHls) { kodikHls.destroy(); kodikHls = null; }
    currentKodikTranslationIdx = idx;
    currentKodikSeasons = null;
    loadKodikSeasonsMetadata();
    const viewport = document.getElementById('player-viewport');
    if (viewport && isKodikWatchPlayer()) {
        viewport.innerHTML = renderCurrentPlayer();
        lucide.createIcons();
        initCurrentPlayerType();
    }
    refreshPlayerChrome();
    if (currentAnime) saveWatchProgress(currentAnime);
}

function selectPlayerVoice(idx) {
    clearTimeout(window._playerErrorTimer);
    currentPlayerVoiceIdx = idx;
    const viewport = document.getElementById('player-viewport');
    if (viewport) {
        viewport.innerHTML = renderCurrentPlayer();
        lucide.createIcons();
        initCurrentPlayerType();
    }
    refreshPlayerChrome();
}

// Фиксируем взаимодействие пользователя с iframe-областью
document.addEventListener('click', (e) => {
    if (e.target.closest('#player-viewport')) window._playerInteracted = true;
});

function setupVideoListeners() {}

// ─── Kodik player controls ───────────────────────────────────────────────────

function toggleKodikPlay() {
    const v = document.getElementById('kodik-video');
    if (!v) return;
    if (!playerPlaybackStarted.kodik) { startPlayerPlayback('kodik'); return; }
    if (v.paused) v.play().catch(() => {});
    else v.pause();
}

function updatePlayerPlayBtn(prefix, mode) {
    const btn = document.getElementById(`${prefix}-play-btn`);
    if (!btn) return;
    btn.classList.toggle('is-buffering', mode === 'buffering');
    if (mode === 'buffering') {
        btn.innerHTML = '<span class="player-play-spinner" aria-hidden="true"></span>';
    } else if (mode === 'paused') {
        btn.innerHTML = '<i data-lucide="play" class="w-5 h-5"></i>';
    } else {
        btn.innerHTML = '<i data-lucide="pause" class="w-5 h-5"></i>';
    }
    lucide.createIcons();
}

function syncPlayerPlayBtn(prefix) {
    const videoEl = getPlayerVideo(prefix);
    if (!videoEl) return;
    const st = playerBufferState[prefix];
    const buffering = !!(st?.buffering && !videoEl.paused && playerPlaybackStarted[prefix]);
    if (buffering) updatePlayerPlayBtn(prefix, 'buffering');
    else if (videoEl.paused) updatePlayerPlayBtn(prefix, 'paused');
    else updatePlayerPlayBtn(prefix, 'playing');
}

function updateKodikPlayBtn(isPaused) {
    updatePlayerPlayBtn('kodik', isPaused ? 'paused' : 'playing');
}

function updateKodikTime() {
    const v = document.getElementById('kodik-video');
    const timeEl = document.getElementById('kodik-time');
    if (!v || !timeEl) return;
    const fmt = s => isFinite(s) ? `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}` : '0:00';
    timeEl.textContent = `${fmt(v.currentTime)} / ${fmt(v.duration)}`;
    updateStartWatchTime('kodik', v);
    if (!_seekDragging.kodik) updateSeekVisual('kodik', v);
    if (!v.paused && playerPlaybackStarted.kodik) scheduleWatchProgressSave();
}

function toggleKodikMute() {
    const v = document.getElementById('kodik-video');
    const btn = document.getElementById('kodik-vol-btn');
    const slider = document.getElementById('kodik-vol-slider');
    if (!v) return;
    v.muted = !v.muted;
    if (slider) slider.value = v.muted ? 0 : v.volume;
    if (btn) {
        btn.innerHTML = v.muted
            ? '<i data-lucide="volume-x" class="w-4 h-4"></i>'
            : '<i data-lucide="volume-2" class="w-4 h-4"></i>';
        lucide.createIcons();
    }
}

function setKodikVolume(val) {
    const v = document.getElementById('kodik-video');
    const btn = document.getElementById('kodik-vol-btn');
    if (!v) return;
    const vol = parseFloat(val);
    v.volume = vol;
    v.muted = vol === 0;
    if (btn) {
        btn.innerHTML = vol === 0
            ? '<i data-lucide="volume-x" class="w-4 h-4"></i>'
            : '<i data-lucide="volume-2" class="w-4 h-4"></i>';
        lucide.createIcons();
    }
}

function setKodikSpeed(val) {
    const v = document.getElementById('kodik-video');
    if (v) v.playbackRate = parseFloat(val);
}

function toggleKodikFullscreen() {
    const container = document.getElementById('kodik-direct-player');
    if (!container) return;
    const isCSSFS = container.classList.contains('kodik-fs');

    if (document.fullscreenElement) { document.exitFullscreen?.(); return; }
    if (isCSSFS) { _exitKodikCSSFS(container); return; }

    const req = container.requestFullscreen?.() || container.webkitRequestFullscreen?.();
    if (req && typeof req.then === 'function') {
        req.catch(() => _enterKodikCSSFS(container));
    } else if (!req) {
        _enterKodikCSSFS(container);
    }
}

function _enterKodikCSSFS(c) {
    c.classList.add('kodik-fs');
    document.body.style.overflow = 'hidden';
    _updateKodikFSBtn(true);
}
function _exitKodikCSSFS(c) {
    if (!c) return;
    c.classList.remove('kodik-fs');
    document.body.style.overflow = '';
    _updateKodikFSBtn(false);
}
function _updateKodikFSBtn(isFS) {
    const btn = document.querySelector('#kodik-controls button[onclick="toggleKodikFullscreen()"]');
    if (!btn) return;
    btn.innerHTML = isFS ? '<i data-lucide="minimize" class="w-4 h-4"></i>' : '<i data-lucide="maximize" class="w-4 h-4"></i>';
    lucide.createIcons();
}

// ─── Player fit: масштаб + выравнивание (как в Kodik) ────────────────────────

let playerZoom    = parseFloat(localStorage.getItem('anyrainy_player_zoom')) || 1;
let playerStretch = localStorage.getItem('anyrainy_player_stretch') || 'none';

const ZOOM_STEPS = [1, 1.1, 1.25, 1.5];
const STRETCH_OPTS = [['none', 'Нет'], ['y', 'По вертикали'], ['x', 'По горизонтали']];

function applyPlayerFitMode() {
    const sx = playerZoom * (playerStretch === 'x' ? 1.18 : 1);
    const sy = playerZoom * (playerStretch === 'y' ? 1.18 : 1);
    const tf = (sx !== 1 || sy !== 1) ? `scale(${sx}, ${sy})` : '';
    ['kodik-video', 'kodik-canvas', 'libria-canvas'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.transform = tf;
    });
    window._libriaFitNeedsUpdate = true;
}

function setPlayerZoom(z) {
    playerZoom = z;
    localStorage.setItem('anyrainy_player_zoom', String(z));
    applyPlayerFitMode();
    _rerenderFitPanels();
}

function setPlayerStretch(s) {
    playerStretch = s;
    localStorage.setItem('anyrainy_player_stretch', s);
    applyPlayerFitMode();
    _rerenderFitPanels();
}

function _fitOptBtn(onclick, label, active) {
    return `<button type="button" onclick="${onclick}"
        class="px-2 py-1 rounded-lg text-[11px] whitespace-nowrap transition-colors ${active
            ? 'bg-airbnb text-white font-semibold'
            : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'}">${label}</button>`;
}

function _fitPanelInner() {
    const zoomBtns = ZOOM_STEPS.map(z =>
        _fitOptBtn(`setPlayerZoom(${z})`, `${Math.round(z * 100)}%`, playerZoom === z)).join('');
    const stBtns = STRETCH_OPTS.map(([k, l]) =>
        _fitOptBtn(`setPlayerStretch('${k}')`, l, playerStretch === k)).join('');
    return `
        <p class="text-white/50 text-[10px] font-bold uppercase tracking-wider px-1 mb-1.5">Масштаб</p>
        <div class="flex gap-1 mb-2.5">${zoomBtns}</div>
        <p class="text-white/50 text-[10px] font-bold uppercase tracking-wider px-1 mb-1.5">Выравнивание</p>
        <div class="flex flex-col gap-1 items-stretch">${stBtns}</div>`;
}

function buildFitPanel(prefix) {
    return `
        <div id="${prefix}-fit-panel" class="hidden absolute z-50" style="bottom:58px;right:44px;">
            <div class="fit-panel-inner bg-[#111]/95 backdrop-blur-md border border-white/10 shadow-2xl rounded-xl p-2.5 min-w-[170px]">
                ${_fitPanelInner()}
            </div>
        </div>`;
}

function _rerenderFitPanels() {
    document.querySelectorAll('.fit-panel-inner').forEach(el => { el.innerHTML = _fitPanelInner(); });
}

function toggleFitPanel(prefix) {
    closeQualityPanel('kodik');
    closeQualityPanel('libria');
    const other = prefix === 'kodik' ? 'libria' : 'kodik';
    document.getElementById(`${other}-fit-panel`)?.classList.add('hidden');
    const panel = document.getElementById(`${prefix}-fit-panel`);
    if (!panel) return;
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) _rerenderFitPanels();
}

function buildFitBtn(prefix) {
    return `<button onclick="toggleFitPanel('${prefix}')" id="${prefix}-fit-btn"
        class="text-white/80 hover:text-white hover:text-airbnb transition-colors p-1" title="Масштаб и выравнивание">
        <i data-lucide="settings-2" class="w-4 h-4"></i>
    </button>`;
}

function proxifyAnilibria(url) {
    if (!url) return url;
    if (/anilibria\.|libria\.fun/i.test(url) && (needsKodikProxy() || BACKEND)) {
        return `${BACKEND}/hls-proxy?url=${encodeURIComponent(url)}`;
    }
    return url;
}

// Все запросы к AniLibria API идут через наш прокси (обход DPI)
async function anilibriaFetch(apiUrl, options = {}) {
    if (needsKodikProxy() || BACKEND) {
        return fetch(`${BACKEND}/hls-proxy?url=${encodeURIComponent(apiUrl)}`, options);
    }
    return fetch(apiUrl, options);
}

// ─── AniLibria API ────────────────────────────────────────────────────────────

async function fetchAnilibriaTitle(anime) {
    const key = anime.malId;
    if (anilibriaCache[key] !== undefined) return anilibriaCache[key];

    const queries = [anime.titleRu, anime.titleEn, anime.title]
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i);

    const searchOne = async (q) => {
        const res = await anilibriaFetch(
            `https://anilibria.top/api/v1/app/search/releases?query=${encodeURIComponent(q)}&limit=3`,
            { signal: AbortSignal.timeout(8000) }
        );
        if (!res.ok) return null;
        const data = await res.json();
        if (!Array.isArray(data) || !data.length) return null;
        const hit = data[0];
        if (hit.episodes?.length) return hit;
        const full = await anilibriaFetch(
            `https://anilibria.top/api/v1/anime/releases/${hit.id}`,
            { signal: AbortSignal.timeout(8000) }
        );
        if (!full.ok) return null;
        return full.json();
    };

    const results = await Promise.allSettled(queries.map(searchOne));
    for (const r of results) {
        if (r.status === 'fulfilled' && r.value?.episodes?.length) {
            anilibriaCache[key] = r.value;
            return r.value;
        }
    }
    // Не кэшируем null — при следующей попытке попробуем снова
    return null;
}

async function getAnilibriaEpisodeUrl(anime, ep) {
    const title = await fetchAnilibriaTitle(anime);
    if (!title?.episodes?.length) return null;
    const epData = title.episodes.find(e => e.ordinal === ep || e.ordinal === String(ep));
    if (!epData) return null;
    return epData.hls_1080 || epData.hls_720 || epData.hls_480 || null;
}

async function getAnilibriaEpisodeUrls(anime, ep) {
    const title = await fetchAnilibriaTitle(anime);
    if (!title?.episodes?.length) return {};
    const epData = title.episodes.find(e => e.ordinal === ep || e.ordinal === String(ep));
    if (!epData) return {};
    const map = {};
    if (epData.hls_480)  map['480p']  = epData.hls_480;
    if (epData.hls_720)  map['720p']  = epData.hls_720;
    if (epData.hls_1080) map['1080p'] = epData.hls_1080;
    if (epData.hls_1080) map['4K ✦'] = epData.hls_1080; // WebGL upscale 2×
    return map;
}

async function initLibriaPlayer() {
    const token = ++libriaPlayerToken;
    if (getActiveServers()[currentServerIndex]?.type !== 'libria') return;

    startLoadingProgress('libria');

    let map;
    if (Object.keys(libriaQualityMap).length && libriaQualityEp === currentEpisodeNum) {
        map = libriaQualityMap;
    } else {
        map = await getAnilibriaEpisodeUrls(currentAnime, currentEpisodeNum);
        libriaQualityMap = map;
        libriaQualityEp = currentEpisodeNum;
    }

    if (token !== libriaPlayerToken) return;
    if (!document.getElementById('libria-loading')) return;

    const url = map['1080p'] || map['720p'] || map['480p'];
    if (!url) {
        stopLoadingProgress('libria');
        const loadingEl = document.getElementById('libria-loading');
        const errEl = document.getElementById('libria-error');
        if (loadingEl) loadingEl.classList.add('hidden');
        if (errEl) { errEl.classList.remove('hidden'); lucide.createIcons(); }
        return;
    }

    libriaQualityMap = map;
    refreshPlayerPickerInPlace();
    // Respect a quality pre-selected by cross-engine switch
    const pendingQ = window._pendingLibriaQuality;
    window._pendingLibriaQuality = null;
    if (pendingQ && map[pendingQ]) {
        libriaCurrentQuality = pendingQ;
        libriaUpscale4K = (pendingQ === '4K ✦');
        loadLibriaVideo(map[pendingQ]);
    } else if (libriaCurrentQuality && map[libriaCurrentQuality]) {
        libriaUpscale4K = (libriaCurrentQuality === '4K ✦');
        loadLibriaVideo(map[libriaCurrentQuality]);
    } else {
        libriaCurrentQuality = map['1080p'] ? '1080p' : map['720p'] ? '720p' : '480p';
        libriaUpscale4K = false;
        loadLibriaVideo(url);
    }
}

function loadLibriaVideo(url) {
    url = proxifyAnilibria(url);
    const loadingEl = document.getElementById('libria-loading');
    const videoEl   = document.getElementById('libria-video');
    const canvasEl  = document.getElementById('libria-canvas');
    const ctrlEl    = document.getElementById('libria-controls');
    if (!videoEl || !canvasEl) return;

    playerPlaybackStarted.libria = false;
    _pendingSeekPct.libria = null;
    playerBufferState.libria = { buffering: false, loadingFrag: false, speedBps: 0 };

    finishLoadingProgress('libria');
    stopLoadingProgress('libria');
    if (loadingEl) loadingEl.classList.add('hidden');
    canvasEl.classList.remove('hidden');
    if (ctrlEl) { ctrlEl.classList.remove('hidden'); ctrlEl.style.opacity = '1'; }

    stopLibriaGL();
    if (libriaHls) { libriaHls.destroy(); libriaHls = null; }

    const onReady = () => {
        updateLibriaTime();
        updateSeekVisual('libria', videoEl);
        applyResumePosition('libria');
        autoplayOrPrompt('libria');
        _prefetchKodikNextEpisode(); // прогреть кеш следующей серии
    };

    if (Hls.isSupported()) {
        libriaHls = new Hls({ ...HLS_FAST_OPTS, abrBandWidthFactor: 0.95, abrBandWidthUpFactor: 0.9 });
        libriaHls.loadSource(url);
        libriaHls.attachMedia(videoEl);
        libriaHls.once(Hls.Events.MANIFEST_PARSED, onReady);
        libriaHls.on(Hls.Events.ERROR, (e, data) => {
            if (data.fatal) {
                const errEl = document.getElementById('libria-error');
                if (canvasEl) canvasEl.classList.add('hidden');
                if (errEl) { errEl.classList.remove('hidden'); lucide.createIcons(); }
            }
        });
        bindHlsBufferEvents(libriaHls, 'libria', videoEl);
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        videoEl.src = url;
        videoEl.load();
        videoEl.addEventListener('loadedmetadata', onReady, { once: true });
    }

    _initLibriaGL(canvasEl, videoEl);
    applyPlayerFitMode();

    videoEl.addEventListener('timeupdate', updateLibriaTime);
    videoEl.addEventListener('play',  () => { updateLibriaPlayBtn(false); showPlayerControls('libria'); });
    videoEl.addEventListener('pause', () => { updateLibriaPlayBtn(true);  showPlayerControls('libria'); });
    videoEl.addEventListener('loadedmetadata', () => {
        if (_pendingSeekPct.libria != null) {
            seekVideoTo('libria', videoEl, _pendingSeekPct.libria * videoEl.duration);
            _pendingSeekPct.libria = null;
        }
        updateLibriaTime();
    });
    videoEl.addEventListener('seeked', () => updateLibriaTime());

    bindVideoBufferEvents(videoEl, 'libria');
    initSeekDrag('libria-seek-track', videoEl, 'libria');

    // Инициализируем панель качества
    renderQualityPanel('libria');
    updateQualityLabel('libria', libriaCurrentQuality || '1080p');
    showPlayerControls('libria');

    // Клик мышью → play/pause
    canvasEl.addEventListener('click', (e) => {
        if (e.pointerType === 'touch') return;
        if (_seekDragging.libria) return;
        if (!playerPlaybackStarted.libria) { showStartWatchOverlay('libria'); return; }
        toggleLibriaPlay();
    });

    // Двойное касание мобайл: лево −10с, право +10с
    let _tapCount = 0, _tapSide = '', _tapTimer = null;
    canvasEl.addEventListener('touchend', (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        if (!touch) return;
        const rect = canvasEl.getBoundingClientRect();
        const side = touch.clientX < rect.left + rect.width / 2 ? 'left' : 'right';

        _tapCount++;
        if (_tapCount === 1) {
            _tapSide = side;
            _tapTimer = setTimeout(() => {
                _tapCount = 0;
                if (!playerPlaybackStarted.libria) showStartWatchOverlay('libria');
                else toggleLibriaPlay();
            }, 280);
        } else if (_tapCount >= 2 && _tapSide === side) {
            clearTimeout(_tapTimer); _tapCount = 0;
            const delta = side === 'right' ? 10 : -10;
            seekVideoByDelta('libria', videoEl, delta);
            showSeekOverlay(canvasEl.parentElement, side, delta);
        } else {
            clearTimeout(_tapTimer); _tapCount = 1; _tapSide = side;
            _tapTimer = setTimeout(() => {
                _tapCount = 0;
                if (!playerPlaybackStarted.libria) showStartWatchOverlay('libria');
                else toggleLibriaPlay();
            }, 280);
        }
    }, { passive: false });
}

function stopLibriaGL() {
    if (libriaRafId) { cancelAnimationFrame(libriaRafId); libriaRafId = null; }
    libriaGlContext = null;
}

// Оверлей +10 / -10 секунд
function showSeekOverlay(parent, side, delta) {
    if (!parent) return;
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;${side==='right'?'right:12%':'left:12%'};top:50%;transform:translateY(-50%);` +
        `background:rgba(0,0,0,0.55);border-radius:50%;width:60px;height:60px;` +
        `display:flex;flex-direction:column;align-items:center;justify-content:center;` +
        `pointer-events:none;z-index:50;color:white;opacity:1;transition:opacity 0.4s ease;`;
    el.innerHTML = `<span style="font-size:1.1rem;line-height:1">${delta>0?'▶▶':'◀◀'}</span>` +
        `<span style="font-size:10px;font-weight:bold;margin-top:3px">${delta>0?'+':''}${delta}s</span>`;
    parent.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; }, 350);
    setTimeout(() => el.remove(), 750);
}

// ─── WebGL 4K Upscaler ────────────────────────────────────────────────────────

function createGLProgram(gl, vsSource, fsSource) {
    const compile = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        return gl.getShaderParameter(s, gl.COMPILE_STATUS)
            ? s : (console.warn('Shader error:', gl.getShaderInfoLog(s)), null);
    };
    const vs = compile(gl.VERTEX_SHADER, vsSource);
    const fs = compile(gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return null;
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs);
    gl.linkProgram(p);
    return gl.getProgramParameter(p, gl.LINK_STATUS) ? p
        : (console.warn('Program error:', gl.getProgramInfoLog(p)), null);
}

function _initLibriaGL(canvas, video) {
    const dpr = libriaUpscale4K ? 2 : 1;
    const container = canvas.parentElement;
    canvas.width  = (container?.clientWidth  || 1280) * dpr;
    canvas.height = (container?.clientHeight || 720)  * dpr;
    initWebGLUpscaler(canvas, video);
}

function initWebGLUpscaler(canvas, video) {
    stopLibriaGL();

    const container = canvas.parentElement;
    if (!canvas.width || canvas.width < 4) {
        canvas.width  = container?.clientWidth  || 1280;
        canvas.height = container?.clientHeight || 720;
    }

    const gl = canvas.getContext('webgl', { antialias: false, preserveDrawingBuffer: false });
    if (!gl) {
        // CSS-фоллбек
        video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;filter:contrast(1.05) saturate(1.1);';
        canvas.classList.add('hidden');
        return;
    }
    libriaGlContext = gl;

    const vsSource = `
        attribute vec2 a_pos;
        attribute vec2 a_uv;
        varying vec2 v_uv;
        void main(){ gl_Position=vec4(a_pos,0.0,1.0); v_uv=a_uv; }
    `;
    const fsSource = `
        precision highp float;
        uniform sampler2D u_tex;
        uniform vec2 u_res;
        varying vec2 v_uv;
        void main(){
            vec4 c = texture2D(u_tex, v_uv);
            float px=1.0/u_res.x, py=1.0/u_res.y;
            // Gaussian blur (для unsharp mask)
            vec4 b =
                texture2D(u_tex,v_uv+vec2(-px,-py))*0.0625 +
                texture2D(u_tex,v_uv+vec2(  0,-py))*0.125  +
                texture2D(u_tex,v_uv+vec2( px,-py))*0.0625 +
                texture2D(u_tex,v_uv+vec2(-px,  0))*0.125  +
                c                                  *0.25   +
                texture2D(u_tex,v_uv+vec2( px,  0))*0.125  +
                texture2D(u_tex,v_uv+vec2(-px, py))*0.0625 +
                texture2D(u_tex,v_uv+vec2(  0, py))*0.125  +
                texture2D(u_tex,v_uv+vec2( px, py))*0.0625;
            // Unsharp mask (резкость)
            vec4 sharp = clamp(c + 0.65*(c - b), 0.0, 1.0);
            // Лёгкий контраст
            sharp = clamp(sharp*1.04 - vec4(0.02,0.02,0.02,0.0), 0.0, 1.0);
            // Насыщенность
            float lum = dot(sharp.rgb, vec3(0.299,0.587,0.114));
            sharp.rgb = mix(vec3(lum), sharp.rgb, 1.15);
            gl_FragColor = clamp(sharp, 0.0, 1.0);
        }
    `;

    const prog = createGLProgram(gl, vsSource, fsSource);
    if (!prog) {
        stopLibriaGL();
        video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;filter:contrast(1.05) saturate(1.1);';
        canvas.classList.add('hidden');
        return;
    }
    gl.useProgram(prog);

    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.DYNAMIC_DRAW);

    const uvBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,1, 1,1, 0,0, 1,0]), gl.DYNAMIC_DRAW);

    const aPos = gl.getAttribLocation(prog, 'a_pos');
    const aUv  = gl.getAttribLocation(prog, 'a_uv');
    const uTex = gl.getUniformLocation(prog, 'u_tex');
    const uRes = gl.getUniformLocation(prog, 'u_res');

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.uniform1i(uTex, 0);

    const captureGl = gl;

    let _lastFit = '';
    function frame() {
        if (libriaGlContext !== captureGl) return;

        const w = Math.max(1, canvas.clientWidth);
        const h = Math.max(1, canvas.clientHeight);
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }

        if (video.readyState >= 2) {
            gl.bindTexture(gl.TEXTURE_2D, tex);
            try {
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
            } catch (_) { /* cross-origin fallback */ }
        }

        // Fit mode: update buffers when mode or size changes
        const fm = playerFitMode;
        if (fm !== _lastFit || window._libriaFitNeedsUpdate) {
            _lastFit = fm;
            window._libriaFitNeedsUpdate = false;
            const vAR = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16/9;
            const cAR = canvas.width && canvas.height ? canvas.width / canvas.height : 16/9;
            let pos = [-1,-1, 1,-1, -1,1, 1,1];
            let uv  = [0,1, 1,1, 0,0, 1,0];
            if (fm === 'cover') {
                if (vAR > cAR) { const s = cAR/vAR, off=(1-s)/2; uv=[off,1, 1-off,1, off,0, 1-off,0]; }
                else            { const s = vAR/cAR, off=(1-s)/2; uv=[0,1-off, 1,1-off, 0,off, 1,off]; }
            } else if (fm === 'contain') {
                if (vAR > cAR) { const ys=cAR/vAR; pos=[-1,-ys,1,-ys,-1,ys,1,ys]; }
                else            { const xs=vAR/cAR; pos=[-xs,-1,xs,-1,-xs,1,xs,1]; }
            }
            gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.DYNAMIC_DRAW);
            gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uv), gl.DYNAMIC_DRAW);
        }

        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(uRes, canvas.width, canvas.height);

        gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
        gl.enableVertexAttribArray(aUv);
        gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        libriaRafId = requestAnimationFrame(frame);
    }
    libriaRafId = requestAnimationFrame(frame);
}

let playerVoiceSearchQ = '';

// ─── Watch player chrome (AnimeOn-style layout) ───────────────────────────────

function buildPlayerTitleOverlay() {
    if (!currentAnime) return '';
    return `
        <div class="watch-video-overlay-top">
            <p class="watch-video-title">${escapeHtml(currentAnime.displayTitle)}</p>
            <div class="watch-video-badges">
                <span class="watch-ep-badge">${escapeHtml(t('ep_badge_label', currentEpisodeNum))}</span>
                <span class="watch-brand-badge">AnyRainy</span>
            </div>
        </div>`;
}

function getSidebarVoiceEntries() {
    if (isHentaiAnime(currentAnime)) return [];

    const entries = [];
    const activeKey = getActiveServers()[currentServerIndex]?.key;

    // Международные дорожки — в самом верху, переключают на соответствующий плеер
    if (getWatchPlayerIndex('megaplay-dub') >= 0) {
        entries.push({
            label: 'Английский даб + субтитры', badge: 'EN',
            active: activeKey === 'megaplay-dub', playerKey: 'megaplay-dub',
            searchText: 'english dub английский даб субтитры',
        });
    }
    if (getWatchPlayerIndex('megaplay') >= 0) {
        entries.push({
            label: 'Японский + субтитры', badge: 'JP',
            active: activeKey === 'megaplay', playerKey: 'megaplay',
            searchText: 'japanese sub японский оригинал субтитры',
        });
    }

    // Русские озвучки (Kodik)
    currentKodikTranslations.forEach((tr, i) => {
        const label = tr.title;
        entries.push({
            label,
            badge: /4k/i.test(label) ? '4K' : null,
            active: isKodikWatchPlayer() && currentKodikTranslationIdx === i,
            voiceIdx: i,
            searchText: label.toLowerCase(),
        });
    });
    return entries;
}

// Атрибут кнопки озвучки: спец-запись ведёт на плеер, обычная — на индекс Kodik
function voiceBtnAttr(e) {
    return e.playerKey ? `data-voice-player="${escapeHtml(e.playerKey)}"` : `data-voice-idx="${e.voiceIdx}"`;
}

function shouldShowVoiceSidebar() {
    return getSidebarVoiceEntries().length > 0;
}

function buildWatchLayoutSettingHtml() {
    const h = watchPlayerLayout === 'horizontal';
    return `
        <div class="watch-layout-setting" role="group" aria-label="${escapeHtml(t('watch_layout_label'))}">
            <span class="watch-layout-label">${t('watch_layout_label')}</span>
            <div class="watch-layout-btns">
                <button type="button" data-watch-layout="horizontal"
                    class="watch-layout-btn${h ? ' watch-layout-btn--active' : ''}"
                    title="${escapeHtml(t('watch_layout_horizontal'))}">
                    <i data-lucide="columns-2" class="w-4 h-4"></i>
                </button>
                <button type="button" data-watch-layout="vertical"
                    class="watch-layout-btn${!h ? ' watch-layout-btn--active' : ''}"
                    title="${escapeHtml(t('watch_layout_vertical'))}">
                    <i data-lucide="rows-2" class="w-4 h-4"></i>
                </button>
                <button type="button" onclick="toggleWatchSidebar()"
                    class="watch-layout-btn watch-sidebar-hide-btn${watchSidebarCollapsed ? ' watch-layout-btn--active' : ''}"
                    title="Скрыть панель озвучки и плеера">
                    <i data-lucide="panel-right-close" class="w-4 h-4"></i>
                </button>
            </div>
        </div>`;
}

function buildWatchPlayerTabInner() {
    const activeKey = getActiveServers()[currentServerIndex]?.key;
    const visible = getActiveServers();
    if (!visible.length) return `<p class="watch-sidebar-empty">${escapeHtml(t('kodik_unavailable'))}</p>`;
    return `<div class="watch-sidebar-list watch-sidebar-list--anim" role="list">
        ${visible.map((s, i) => `
            <button type="button" role="listitem" data-watch-player="${s.key}" style="--i:${i}"
                class="watch-sidebar-player-item${s.key === activeKey ? ' watch-sidebar-player-item--active' : ''}">
                ${escapeHtml(s.name)}
            </button>`).join('')}
    </div>`;
}

function buildWatchVoiceTabInner() {
    const entries = getSidebarVoiceEntries();
    if (!entries.length) {
        return `<p class="watch-sidebar-empty">${escapeHtml(t('kodik_unavailable'))}</p>`;
    }
    return `<div class="watch-sidebar-list watch-sidebar-list--anim" id="voice-sidebar-list">
        ${entries.map((e, i) => `
            <button type="button" ${voiceBtnAttr(e)} style="--i:${i}"
                class="watch-sidebar-voice-item${e.active ? ' watch-sidebar-voice-item--active' : ''}">
                <span class="watch-sidebar-voice-label">${escapeHtml(e.label)}</span>
                ${e.badge ? `<span class="voice-sidebar-badge">${e.badge}</span>` : ''}
            </button>`).join('')}
    </div>`;
}

function buildWatchSidebarInner() {
    const voiceActive = watchSidebarTab === 'voice';
    const playerActive = watchSidebarTab === 'player';
    return `
        <div class="watch-sidebar-tabs" role="tablist">
            <button type="button" role="tab" data-sidebar-tab="voice"
                aria-selected="${voiceActive}"
                class="watch-sidebar-tab${voiceActive ? ' watch-sidebar-tab--active' : ''}">
                ${t('voice_panel')}
            </button>
            <button type="button" role="tab" data-sidebar-tab="player"
                aria-selected="${playerActive}"
                class="watch-sidebar-tab${playerActive ? ' watch-sidebar-tab--active' : ''}">
                ${t('server_panel')}
            </button>
        </div>
        <div class="watch-sidebar-progress"><div class="watch-sidebar-progress-fill"></div></div>
        <div class="watch-sidebar-panel" role="tabpanel" onscroll="updateSidebarScrollProgress(this)">
            ${voiceActive ? buildWatchVoiceTabInner() : buildWatchPlayerTabInner()}
        </div>`;
}

// Вертикальный индикатор прокрутки справа: тумб отражает позицию и долю прокрутки
function updateSidebarScrollProgress(panel) {
    const sidebar = panel.parentElement;
    const track = sidebar?.querySelector('.watch-sidebar-progress');
    const thumb = sidebar?.querySelector('.watch-sidebar-progress-fill');
    if (!track || !thumb) return;
    // Накладываем трек ровно на область панели
    track.style.top = panel.offsetTop + 'px';
    track.style.height = panel.clientHeight + 'px';
    const scrollable = panel.scrollHeight - panel.clientHeight;
    if (scrollable <= 4) { track.style.opacity = '0'; return; }
    track.style.opacity = '1';
    const thumbPct = Math.max(14, (panel.clientHeight / panel.scrollHeight) * 100);
    const topPct = (panel.scrollTop / panel.scrollHeight) * 100;
    thumb.style.height = thumbPct + '%';
    thumb.style.top = topPct + '%';
}

function buildPlayerToolbarInner() {
    return buildPlayerEpisodesBlock();
}

function setWatchSidebarTab(tab) {
    if (tab !== 'voice' && tab !== 'player') return;
    watchSidebarTab = tab;
    const sidebar = document.getElementById('player-sidebar');
    if (sidebar) sidebar.innerHTML = buildWatchSidebarInner();
    lucide.createIcons();
    requestAnimationFrame(() => {
        const p = document.querySelector('.watch-sidebar-panel');
        if (p) updateSidebarScrollProgress(p);
    });
}

function selectWatchPlayer(key) {
    const idx = getWatchPlayerIndex(key);
    if (idx < 0) return;
    watchSidebarTab = 'player';
    if (idx !== currentServerIndex) setServer(idx);
    else refreshPlayerChrome();
}

function buildPlayerVoiceSidebarInner() {
    const all = getSidebarVoiceEntries();
    const q = playerVoiceSearchQ.trim().toLowerCase();
    const filtered = q
        ? all.filter(e => e.label.toLowerCase().includes(q) || (e.searchText || '').includes(q))
        : all;

    const items = filtered.length
        ? filtered.map(e => `
            <button type="button" ${voiceBtnAttr(e)}
                class="voice-sidebar-item${e.active ? ' voice-sidebar-item--active' : ''}">
                <span class="voice-sidebar-item-label">${escapeHtml(e.label)}</span>
                ${e.badge ? `<span class="voice-sidebar-badge">${e.badge}</span>` : ''}
            </button>`).join('')
        : `<p class="voice-sidebar-empty">${escapeHtml(t('nothing_found'))}</p>`;

    return `
        <div class="voice-sidebar-head">
            <span class="voice-sidebar-title">${t('voice_panel')}</span>
            <span class="voice-sidebar-count">${all.length}</span>
        </div>
        <input type="text" id="voice-sidebar-search" class="voice-sidebar-search"
            placeholder="${escapeHtml(t('voice_search_placeholder'))}"
            value="${escapeHtml(playerVoiceSearchQ)}"
            oninput="filterPlayerVoiceSearch(this.value)">
        <div class="voice-sidebar-list" id="voice-sidebar-list">${items}</div>`;
}

function getPlayerSeasons() {
    if (currentKodikSeasons?.length > 1) return currentKodikSeasons;
    return [];
}

function getActiveSeasonEpisodes() {
    const seasons = getPlayerSeasons();
    if (!seasons.length) return getPlayerEpisodeNums();
    const idx = Math.min(currentPlayerSeasonIdx, seasons.length - 1);
    return seasons[idx].episodes;
}

function shouldShowEpisodesMoreBtn() {
    return getActiveSeasonEpisodes().length > EP_GRID_COLLAPSE_THRESHOLD && !playerEpisodesExpanded;
}

function getCurrentEpisodeMeta() {
    const list = currentAnime?.episodesList || [];
    if (!list.length || currentEpisodeNum < 1) return null;
    const title = list[currentEpisodeNum - 1];
    if (!title) return null;
    return { title };
}

// Балансеры по Kinopoisk id (Alloha/Collaps/Turbo) не используют наш номер серии —
// у них свой выбор серий/сезонов внутри iframe. Наши кнопки серий тут бесполезны.
const NON_EPISODE_PLAYER_KEYS = new Set(['alloha', 'collaps', 'turbo']);
function currentPlayerUsesEpisodes() {
    const key = getActiveServers()[currentServerIndex]?.key;
    return !NON_EPISODE_PLAYER_KEYS.has(key);
}

function buildPlayerEpisodesBlock() {
    if (!currentPlayerUsesEpisodes()) {
        return `
        <div class="watch-episodes-block">
            <div class="watch-ep-internal-hint">
                <i data-lucide="list-video" class="w-4 h-4"></i>
                <span>${t('episodes_inside_player')}</span>
            </div>
        </div>`;
    }
    const allInSeason = getActiveSeasonEpisodes();
    if (allInSeason.length <= 1) return '';

    const seasons = getPlayerSeasons();
    const activeSeason = seasons[currentPlayerSeasonIdx];
    const seasonId = activeSeason?.id ?? null;
    const showMore = shouldShowEpisodesMoreBtn();
    const showLess = playerEpisodesExpanded && allInSeason.length > EP_GRID_COLLAPSE_THRESHOLD;
    const gridClass = showMore && !playerEpisodesExpanded
        ? 'watch-ep-grid watch-ep-grid--collapsed'
        : 'watch-ep-grid';

    const seasonTabs = seasons.length > 1
        ? `<div class="watch-ep-seasons" role="tablist">
            ${seasons.map((s, i) => `
                <button type="button" role="tab" data-season-idx="${i}"
                    aria-selected="${i === currentPlayerSeasonIdx}"
                    class="watch-ep-season-tab${i === currentPlayerSeasonIdx ? ' watch-ep-season-tab--active' : ''}">
                    ${escapeHtml(s.label)}
                </button>`).join('')}
           </div>`
        : '';

    const epChips = allInSeason.map(n => `
        <button type="button" data-ep-num="${n}"${seasonId ? ` data-ep-season="${escapeHtml(seasonId)}"` : ''}
            class="watch-ep-chip${n === currentEpisodeNum ? ' watch-ep-chip--active' : ''}">${n}</button>`).join('');

    const meta = getCurrentEpisodeMeta();
    const metaHtml = meta?.title
        ? `<p class="watch-ep-meta-line">${escapeHtml(t('ep_meta_title', meta.title))}</p>`
        : '';

    return `
        <div class="watch-episodes-block">
            ${seasonTabs}
            <div class="watch-episodes-head">
                <span class="watch-episodes-label">${t('episode_label')}</span>
                <span class="watch-episodes-current">${escapeHtml(t('picker_current_ep', currentEpisodeNum))}</span>
            </div>
            <div class="${gridClass}">${epChips}</div>
            ${metaHtml ? `<div class="watch-ep-meta">${metaHtml}</div>` : ''}
            ${showMore || showLess ? `
                <button type="button" class="watch-ep-more" data-ep-expand="1">
                    ${showMore ? t('show_more_episodes') : t('show_less_episodes')}
                </button>` : ''}
        </div>`;
}

function scrollActiveEpisodeIntoView() {
    requestAnimationFrame(() => {
        document.querySelector('.watch-ep-grid .watch-ep-chip--active')
            ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
}

function togglePlayerEpisodesExpanded() {
    playerEpisodesExpanded = !playerEpisodesExpanded;
    refreshPlayerChrome(true);
}

function selectPlayerSeason(idx) {
    const seasons = getPlayerSeasons();
    if (idx < 0 || idx >= seasons.length) return;
    currentPlayerSeasonIdx = idx;
    currentEpisodeSeasonId = seasons[idx].id;
    const eps = seasons[idx].episodes;
    if (!eps.includes(currentEpisodeNum)) {
        selectEpisode(eps[0] ?? 1, seasons[idx].id);
    } else {
        refreshPlayerChrome(true);
    }
}

function buildWatchPageControlsInner() {
    const sourcePills = getActiveServers().map((s, i) => {
        const active = i === currentServerIndex;
        return `<button type="button" id="srv-btn-${i}" data-server-idx="${i}"
            class="watch-source-pill${active ? ' watch-source-pill--active' : ''}">
            ${escapeHtml(s.name)}
        </button>`;
    }).join('');

    return `
        ${buildPlayerEpisodesBlock()}
        <div class="watch-toolbar-source">
            <span class="watch-toolbar-label">${t('player_source_label')}</span>
            <div class="watch-source-pills">${sourcePills}</div>
        </div>`;
}

function buildPlayerModalInner() {
    return `
        <div class="watch-player-block">
            <div class="watch-player-layout${shouldShowVoiceSidebar() ? '' : ' watch-player-layout--no-sidebar'}">
                <div class="watch-player-main">
                    <div class="watch-player-frame watch-player-frame--modal">
                        <div id="player-viewport" class="absolute inset-0 w-full h-full">
                            ${renderCurrentPlayer()}
                        </div>
                    </div>
                </div>
                <aside id="player-sidebar" class="watch-player-sidebar${shouldShowVoiceSidebar() ? '' : ' hidden'}">
                    ${buildPlayerVoiceSidebarInner()}
                </aside>
            </div>
        </div>`;
}

function updateWatchOpenBtnLabel() {
    const label = document.getElementById('watch-open-player-label');
    if (label) label.textContent = t('watch_play_btn', currentEpisodeNum);
}

function initCurrentPlayerType() {
    const player = getActiveServers()[currentServerIndex];
    if (player?.type === 'kodik') initKodikPlayer();
    else if (player?.type === 'libria') initLibriaPlayer();
    else if (player?.type === 'iframe') initIframePlayer();
    else if (player?.type === 'newtab') initNewtabPlayer();
}

function _markPlayerUnavailable(key) {
    if (_playerAvailability[key] === false) return;
    _playerAvailability[key] = false;
    refreshPlayerChrome();
}

function initNewtabPlayer() {
    const player = getActiveServers()[currentServerIndex];
    if (!player || player.type !== 'newtab' || !currentAnime) return;
    const token = ++iframePlayerToken;
    (async () => {
        const src = await resolveIframeSrc(player, currentAnime.malId, currentEpisodeNum);
        if (token !== iframePlayerToken) return;
        const viewport = document.getElementById('player-viewport');
        if (!src) {
            _markPlayerUnavailable(player.key);
            if (viewport) { viewport.innerHTML = buildNewtabPlayerShell(''); lucide.createIcons(); }
            return;
        }
        _playerAvailability[player.key] = true;
        if (viewport) { viewport.innerHTML = buildNewtabPlayerShell(src); lucide.createIcons(); }
        window.open(src, '_blank', 'noopener');
    })();
}

function pauseActivePlayers() {
    document.getElementById('kodik-video')?.pause();
    document.getElementById('libria-video')?.pause();
}

function openPlayerModal() {
    const modal = document.getElementById('player-modal');
    const body = document.getElementById('player-modal-body');
    const titleEl = document.getElementById('player-modal-title');
    if (!modal || !body) return;

    if (titleEl && currentAnime) titleEl.textContent = currentAnime.displayTitle;
    body.innerHTML = buildPlayerModalInner();
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('player-modal-open');
    playerModalOpen = true;

    bindPlayerModalEvents();
    refreshPlayerModalChrome(true);
    lucide.createIcons();
    initCurrentPlayerType();
}

function closePlayerModal() {
    const modal = document.getElementById('player-modal');
    if (!modal) return;
    pauseActivePlayers();
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('player-modal-open');
    playerModalOpen = false;
    const body = document.getElementById('player-modal-body');
    if (body) body.innerHTML = '';
}

function filterPlayerVoiceSearch(q) {
    playerVoiceSearchQ = q;
    watchSidebarTab = 'voice';
    const list = document.getElementById('voice-sidebar-list');
    const sidebar = document.getElementById('player-sidebar');
    if (sidebar) sidebar.innerHTML = buildWatchSidebarInner();
    else if (list) {
        const all = getSidebarVoiceEntries();
        const ql = q.trim().toLowerCase();
        const filtered = ql
            ? all.filter(e => e.label.toLowerCase().includes(ql) || (e.searchText || '').includes(ql))
            : all;
        list.innerHTML = filtered.length
            ? filtered.map(e => `
                <button type="button" ${voiceBtnAttr(e)}
                    class="voice-sidebar-item${e.active ? ' voice-sidebar-item--active' : ''}">
                    <span class="voice-sidebar-item-label">${escapeHtml(e.label)}</span>
                    ${e.badge ? `<span class="voice-sidebar-badge">${e.badge}</span>` : ''}
                </button>`).join('')
            : `<p class="voice-sidebar-empty">${escapeHtml(t('nothing_found'))}</p>`;
    }
}

// Спец-запись озвучки (Английский/Японский) — переключает на нужный плеер, остаётся на вкладке «Озвучка»
function selectVoicePlayer(key) {
    const idx = getWatchPlayerIndex(key);
    if (idx < 0) return;
    watchSidebarTab = 'voice';
    window._allohaAutoFallback = false;
    if (idx !== currentServerIndex) setServer(idx);
    else refreshPlayerChrome(true);
}

function selectSidebarKodikVoice(i) {
    let kodikIdx = getWatchPlayerIndex('kodik');
    if (kodikIdx < 0) kodikIdx = getWatchPlayerIndex('kodik-embed');
    if (kodikIdx < 0) return;
    watchSidebarTab = 'voice';
    if (!isKodikWatchPlayer()) {
        currentKodikTranslationIdx = i;
        setServer(kodikIdx);
    } else if (currentKodikTranslationIdx !== i) {
        selectVoice(i);
    } else {
        refreshPlayerChrome(true);
    }
}

function updateVoiceSidebarVisibility() {
    const sidebar = document.getElementById('player-sidebar');
    const layout = document.querySelector('.watch-player-layout');
    const show = shouldShowVoiceSidebar();
    if (sidebar) sidebar.classList.toggle('hidden', !show);
    if (layout) layout.classList.toggle('watch-player-layout--no-sidebar', !show);
}

function refreshPlayerModalChrome(scrollActiveVoice = false) {
    updateVoiceSidebarVisibility();
    const sidebar = document.getElementById('player-sidebar');
    if (sidebar && shouldShowVoiceSidebar()) sidebar.innerHTML = buildPlayerVoiceSidebarInner();
    if (scrollActiveVoice) {
        requestAnimationFrame(() => {
            document.querySelector('.voice-sidebar-item--active')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
    }
}

function refreshPlayerChrome(scrollActiveVoice = false) {
    const toolbar = document.getElementById('player-toolbar');
    if (toolbar) toolbar.innerHTML = buildPlayerToolbarInner();
    const sidebar = document.getElementById('player-sidebar');
    if (sidebar) sidebar.innerHTML = buildWatchSidebarInner();
    lucide.createIcons();
    scrollActiveEpisodeIntoView();
    requestAnimationFrame(() => {
        const p = document.querySelector('.watch-sidebar-panel');
        if (p) updateSidebarScrollProgress(p);
    });
    if (scrollActiveVoice) {
        requestAnimationFrame(() => {
            document.querySelector('.watch-sidebar-voice-item--active')
                ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
    }
}

function getPlayerEpisodeNums() {
    if (currentKodikEpisodeNums.length) return currentKodikEpisodeNums;
    const total = currentAnime?.episodes || 1;
    return Array.from({ length: Math.max(1, total) }, (_, i) => i + 1);
}

function shouldShowPlayerPicker() {
    return !!currentAnime && getActiveServers().length > 0;
}

function getPlayerPickerBtnLabel() {
    const srv = getActiveServers()[currentServerIndex]?.name || '';
    const ep = t('picker_current_ep', currentEpisodeNum);
    return srv ? `${srv} · ${ep}` : ep;
}

function pickerItemClass(active, disabled = false) {
    if (disabled) return 'player-picker-item player-picker-item--disabled';
    return active ? 'player-picker-item player-picker-item--active' : 'player-picker-item';
}

function formatPickerQualityLabel(q) {
    return q === '4K ✦' ? '4K' : q;
}

const PICKER_QUALITY_ORDER = ['4K ✦', '1080p ✦', '1080p', '720p', '480p'];


function sortQualityKeys(keys) {
    const set = new Set(keys);
    return PICKER_QUALITY_ORDER.filter(q => set.has(q));
}

function getPickerActiveQuality() {
    const playerType = getActiveServers()[currentServerIndex]?.type;
    if (playerType === 'libria') return libriaCurrentQuality;
    if (playerType === 'kodik') return kodikCurrentQuality;
    if (Object.keys(libriaQualityMap).length) return libriaCurrentQuality;
    return '';
}

function isPicker4KLocked() {
    return getPickerActiveQuality() === '4K ✦';
}

function isAnilibriaTranslation(tr) {
    const title = (tr?.title || '').toLowerCase();
    return title.includes('anilibria') || title.includes('анилибрия');
}

function getKodikVoicesForCurrentPlayer() {
    if (!isKodikWatchPlayer()) return [];
    return currentKodikTranslations.map((tr, i) => ({ tr, i }));
}

function ensureKodikTranslationForPlayer() {
    const allowed = getKodikVoicesForCurrentPlayer();
    if (!allowed.length) return;
    if (!allowed.some(v => v.i === currentKodikTranslationIdx)) {
        currentKodikTranslationIdx = allowed[0].i;
    }
}

function sortPickerActiveFirst(items, isDisabled, isActive) {
    return [...items].sort((a, b) => {
        const ad = isDisabled(a) ? 1 : 0;
        const bd = isDisabled(b) ? 1 : 0;
        if (ad !== bd) return ad - bd;
        const aa = isActive(a) ? 0 : 1;
        const ba = isActive(b) ? 0 : 1;
        return aa - ba;
    });
}

function getPickerVoiceEntries() {
    if (isHentaiAnime(currentAnime)) return [];

    const playerType = getActiveServers()[currentServerIndex]?.type;
    const entries = [];

    entries.push({
        label: t('voice_anilibria'),
        kind: 'libria',
        active: playerType === 'libria',
        disabled: playerType !== 'libria',
    });

    currentKodikTranslations.forEach((tr, i) => {
        entries.push({
            label: tr.title,
            kind: 'kodik',
            idx: i,
            active: playerType === 'kodik' && i === currentKodikTranslationIdx,
            disabled: playerType !== 'kodik',
        });
    });

    const subIdx = getActiveServers().findIndex(s => s.type === 'iframe' && String(s.url?.('', 1) || '').includes('/sub'));
    const dubIdx = getActiveServers().findIndex(s => s.type === 'iframe' && String(s.url?.('', 1) || '').includes('/dub'));

    if (subIdx >= 0) {
        entries.push({
            label: t('voice_sub'),
            kind: 'iframe',
            serverIdx: subIdx,
            active: currentServerIndex === subIdx,
            disabled: currentServerIndex !== subIdx,
        });
    }
    if (dubIdx >= 0) {
        entries.push({
            label: t('voice_dub'),
            kind: 'iframe',
            serverIdx: dubIdx,
            active: currentServerIndex === dubIdx,
            disabled: currentServerIndex !== dubIdx,
        });
    }

    return sortPickerActiveFirst(entries, v => v.disabled, v => v.active);
}

function buildPickerVoiceItem(v) {
    if (v.disabled) {
        const cls = v.active
            ? 'player-picker-item player-picker-item--active player-picker-item--fixed'
            : pickerItemClass(false, true);
        return `<button type="button" disabled class="${cls}">${escapeHtml(v.label)}</button>`;
    }
    if (v.kind === 'kodik') {
        return `<button type="button" onclick="selectVoiceInPlayer(${v.idx})"
            class="${pickerItemClass(v.active)}">${escapeHtml(v.label)}</button>`;
    }
    return `<button type="button" disabled
        class="player-picker-item player-picker-item--active player-picker-item--fixed">${escapeHtml(v.label)}</button>`;
}

function getPickerQualityEntries() {
    const playerType = getActiveServers()[currentServerIndex]?.type;
    const hasLibria = Object.keys(libriaQualityMap).length > 0;
    const hasKodik = Object.keys(kodikQualityMap).length > 0;
    const order = PICKER_QUALITY_ORDER;

    if (!hasLibria && !hasKodik) {
        if (playerType === 'iframe') {
            return order.map(q => ({ q, disabled: true, active: false, engine: null }));
        }
        return [];
    }

    const libriaHas = (q) => !!libriaQualityMap[q] || (q === '4K ✦' && hasLibria);
    const kodikHas = (q) => !!kodikQualityMap[q];

    return order.map(q => {
        const lHas = libriaHas(q);
        const kHas = kodikHas(q);
        let disabled = false;
        let active = false;
        let engine = null;

        if (playerType === 'libria') {
            disabled = !lHas;
            active = libriaCurrentQuality === q;
            engine = lHas ? 'libria' : null;
        } else if (playerType === 'kodik') {
            disabled = !kHas;
            active = kodikCurrentQuality === q;
            engine = kHas ? 'kodik' : null;
        } else {
            disabled = !(lHas || kHas);
            active = (libriaCurrentQuality === q && lHas) || (kodikCurrentQuality === q && kHas);
            engine = lHas ? 'libria' : (kHas ? 'kodik' : null);
        }

        return { q, disabled, active, engine };
    });
}

function buildPickerQualityItem(e) {
    const label = escapeHtml(formatPickerQualityLabel(e.q));
    const qAttr = escapeHtml(e.q);
    if (e.disabled) {
        return `<button type="button" disabled
            class="${pickerItemClass(e.active, true)}">${label}</button>`;
    }
    return `<button type="button" data-quality="${qAttr}"
        onclick="selectPickerQualityByKey(this.dataset.quality)"
        class="${pickerItemClass(e.active)}">${label}</button>`;
}

function buildPickerQualityItems() {
    const entries = getPickerQualityEntries();
    return entries.map(buildPickerQualityItem).join('');
}

function selectPickerQualityByKey(q) {
    const entry = getPickerQualityEntries().find(e => e.q === q);
    if (!entry || entry.disabled || !entry.engine) return;

    if (entry.engine === 'libria') {
        if (getActiveServers()[currentServerIndex]?.type === 'libria') setLibriaQuality(q);
        else switchToLibriaQuality(q);
    } else if (entry.engine === 'kodik') {
        const kodikIdx = getActiveServers().findIndex(s => s.type === 'kodik');
        if (getActiveServers()[currentServerIndex]?.type !== 'kodik' && kodikIdx >= 0) {
            window._pendingKodikQuality = q;
            setServer(kodikIdx);
        } else {
            setKodikQuality(q);
        }
    }
    refreshPlayerPickerInPlace(true);
}

function buildPlayerPickerHtml() {
    if (!shouldShowPlayerPicker()) return '';

    const epNums = getPlayerEpisodeNums();
    const showEpisodes = epNums.length > 1;
    const voiceEntries = getPickerVoiceEntries();
    const qualityEntries = getPickerQualityEntries();
    const showQuality = qualityEntries.length > 0;

    const locked4K = isPicker4KLocked();

    const activeKey = getActiveServers()[currentServerIndex]?.key;
    const serverItems = getActiveServers()
        .map((s, i) => ({ s, i }))
        .map(({ s, i }) => {
            const disabled = locked4K && s.type !== 'libria';
            const active = i === currentServerIndex;
            return `
        <button type="button"${disabled ? ' disabled' : ` onclick="selectServerInPlayer(${i})"`}
            class="${pickerItemClass(active, disabled)}">
            ${escapeHtml(s.name)}
        </button>`;
        }).join('');

    const voiceItems = voiceEntries.map(buildPickerVoiceItem).join('');

    const epItems = showEpisodes ? epNums.map(n => `
        <button type="button" onclick="selectEpisodeInPlayer(${n})"
            class="${pickerItemClass(n === currentEpisodeNum)}">
            ${t('episode_select', n)}
        </button>`).join('') : '';

    const sections = [];
    const pushPickerSection = (title, listHtml, extraListClass = '', listId = '', blockClass = '') => {
        if (!listHtml) return;
        sections.push(`
        <div class="player-picker-block${blockClass}">
            <p class="player-picker-section-title px-1 mb-1 shrink-0">${title}</p>
            <div class="player-picker-list${extraListClass}"${listId ? ` id="${listId}"` : ''}>${listHtml}</div>
        </div>`);
    };

    // 1. Серии → 2. Качество → 3. Плеер
    if (showEpisodes) {
        pushPickerSection(t('episodes_panel'), epItems, ' player-picker-ep-list', 'ep-list');
    }
    if (showQuality) {
        pushPickerSection(t('quality_panel'), qualityEntries.map(buildPickerQualityItem).join(''));
    }
    pushPickerSection(t('server_panel'), serverItems);

    // Озвучка — только для текущего плеера
    if (voiceEntries.length) {
        pushPickerSection(t('voice_panel'), voiceItems, '', '', ' player-picker-block--voice');
    }

    return `
    <div id="player-picker-root">
        <button type="button" id="player-picker-btn" title="${t('picker_menu_title')}">
            <i data-lucide="sliders-horizontal" class="w-3 h-3 shrink-0 text-airbnb"></i>
            <span id="player-picker-label" class="truncate">${escapeHtml(getPlayerPickerBtnLabel())}</span>
            <i data-lucide="chevron-down" class="w-2.5 h-2.5 shrink-0 text-white/45"></i>
        </button>
        <div id="ep-panel" class="ep-panel--closed player-picker-popover"
             onwheel="event.stopPropagation()">
            <div class="player-picker-shell">
                <div class="player-picker-header flex items-center justify-between px-2.5 py-1.5 shrink-0">
                    <span class="text-white text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                        <span class="w-1.5 h-1.5 rounded-full bg-airbnb shrink-0"></span>
                        ${t('picker_menu_title')}
                    </span>
                    <button type="button" id="player-picker-close" class="text-white/40 hover:text-airbnb p-0.5 transition-colors rounded-md hover:bg-white/5">
                        <i data-lucide="x" class="w-3 h-3"></i>
                    </button>
                </div>
                <div class="player-picker-scroll px-2 py-1.5">
                    ${sections.join('')}
                </div>
            </div>
        </div>
    </div>`;
}

function onWatchControlsClick(e) {
    // In-player пикер (серии / качество / плеер / озвучка)
    if (e.target.closest('#player-picker-close')) { closeEpPanel(); return; }
    if (e.target.closest('#player-picker-btn')) { toggleEpPanel(); return; }

    const layoutBtn = e.target.closest('[data-watch-layout]');
    if (layoutBtn) {
        setWatchPlayerLayout(layoutBtn.dataset.watchLayout);
        return;
    }
    const watchPlayerBtn = e.target.closest('[data-watch-player]');
    if (watchPlayerBtn) {
        selectWatchPlayer(watchPlayerBtn.dataset.watchPlayer);
        return;
    }
    const sidebarTabBtn = e.target.closest('[data-sidebar-tab]');
    if (sidebarTabBtn) {
        setWatchSidebarTab(sidebarTabBtn.dataset.sidebarTab);
        return;
    }
    const srcBtn = e.target.closest('[data-server-idx]');
    if (srcBtn && !srcBtn.disabled) {
        selectServerInPlayer(Number(srcBtn.dataset.serverIdx));
        return;
    }
    const voicePlayerBtn = e.target.closest('[data-voice-player]');
    if (voicePlayerBtn) {
        selectVoicePlayer(voicePlayerBtn.dataset.voicePlayer);
        return;
    }
    const voiceBtn = e.target.closest('[data-voice-idx]');
    if (voiceBtn) {
        selectSidebarKodikVoice(Number(voiceBtn.dataset.voiceIdx));
        return;
    }
    const seasonBtn = e.target.closest('[data-season-idx]');
    if (seasonBtn) {
        selectPlayerSeason(Number(seasonBtn.dataset.seasonIdx));
        return;
    }
    const expandBtn = e.target.closest('[data-ep-expand]');
    if (expandBtn) {
        togglePlayerEpisodesExpanded();
        return;
    }
    const epBtn = e.target.closest('[data-ep-num]');
    if (epBtn) {
        const seasonId = epBtn.dataset.epSeason || null;
        selectEpisodeInPlayer(Number(epBtn.dataset.epNum), seasonId);
    }
}

function bindPlayerPickerEvents() {
    const watch = document.getElementById('watch-section');
    if (watch && watch.dataset.pickerBound !== '1') {
        watch.dataset.pickerBound = '1';
        watch.addEventListener('click', onWatchControlsClick);
    }
}

function bindPlayerModalEvents() {
    const modal = document.getElementById('player-modal');
    if (!modal || modal.dataset.modalBound === '1') return;
    modal.dataset.modalBound = '1';
    modal.addEventListener('click', onWatchControlsClick);
    modal.querySelector('.watch-player-main')?.addEventListener('click', () => {
        const active = document.activeElement;
        if (active?.id === 'voice-sidebar-search') active.blur();
    });
}

function refreshPlayerPickerInPlace(scrollActive = false) {
    refreshPlayerChrome(scrollActive);
    // Перерисовываем in-player пикер (серии/озвучки/качество подгружаются асинхронно)
    const root = document.getElementById('player-picker-root');
    if (!root) return;
    const wasOpen = document.getElementById('ep-panel')?.classList.contains('ep-panel--open');
    const html = buildPlayerPickerHtml();
    if (!html) { root.remove(); return; }
    root.outerHTML = html;
    lucide.createIcons();
    if (wasOpen) {
        const panel = document.getElementById('ep-panel');
        panel?.classList.remove('ep-panel--closed');
        panel?.classList.add('ep-panel--open');
        document.getElementById('player-picker-btn')?.classList.add('is-open');
    }
}

function closeEpPanel() {
    const panel = document.getElementById('ep-panel');
    const btn = document.getElementById('player-picker-btn');
    panel?.classList.add('ep-panel--closed');
    panel?.classList.remove('ep-panel--open');
    btn?.classList.remove('is-open');
}

function toggleEpPanel() {
    const panel = document.getElementById('ep-panel');
    const btn = document.getElementById('player-picker-btn');
    if (!panel) return;
    const opening = panel.classList.contains('ep-panel--closed');
    document.getElementById('kodik-quality-panel')?.classList.add('hidden');
    document.getElementById('libria-quality-panel')?.classList.add('hidden');
    if (opening) {
        panel.classList.remove('ep-panel--closed');
        panel.classList.add('ep-panel--open');
        btn?.classList.add('is-open');
    } else {
        panel.classList.add('ep-panel--closed');
        panel.classList.remove('ep-panel--open');
        btn?.classList.remove('is-open');
    }
    if (opening) {
        lucide.createIcons();
        requestAnimationFrame(() => {
            document.querySelector('#ep-list .player-picker-item--active')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            document.querySelector('.player-picker-block--voice .player-picker-item--active')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
    }
}

function selectEpisodeInPlayer(num, seasonId = null) {
    selectEpisode(num, seasonId);
}

function selectVoiceInPlayer(idx) {
    selectSidebarKodikVoice(idx);
}

function selectLibriaQualityInPlayer(idx) {
    const keys = Object.keys(libriaQualityMap);
    const q = keys[idx];
    if (!q) return;
    if (getActiveServers()[currentServerIndex]?.type === 'libria') setLibriaQuality(q);
    else switchToLibriaQuality(q);
    refreshPlayerPickerInPlace(true);
}

function selectKodikQualityInPlayer(idx) {
    const keys = Object.keys(kodikQualityMap);
    const q = keys[idx];
    if (!q) return;
    closeEpPanel();
    const kodikIdx = getActiveServers().findIndex(s => s.type === 'kodik');
    if (getActiveServers()[currentServerIndex]?.type !== 'kodik' && kodikIdx >= 0) {
        window._pendingKodikQuality = q;
        setServer(kodikIdx);
        return;
    }
    setKodikQuality(q);
}

function selectServerInPlayer(idx) {
    if (idx === currentServerIndex) return;
    setServer(idx);
    refreshPlayerPickerInPlace(true);
}

// ─── Shared player utilities ─────────────────────────────────────────────────

function fmtPlayerTime(s) {
    if (!isFinite(s) || s < 0) return '0:00';
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function getPlayerVideo(prefix) {
    return document.getElementById(prefix === 'kodik' ? 'kodik-video' : 'libria-video');
}

function clampSeekTime(videoEl, time) {
    if (!videoEl || !isFinite(time)) return 0;
    let t = Math.max(0, time);
    if (videoEl.duration && isFinite(videoEl.duration)) {
        t = Math.min(t, Math.max(0, videoEl.duration - 0.05));
    }
    if (videoEl.seekable && videoEl.seekable.length > 0) {
        try {
            const end = videoEl.seekable.end(videoEl.seekable.length - 1);
            const start = videoEl.seekable.start(0);
            t = Math.max(start, Math.min(end - 0.05, t));
        } catch (_) {}
    }
    return t;
}

function setSeekVisualPct(prefix, pct) {
    const p = Math.max(0, Math.min(100, pct));
    const prog = document.getElementById(`${prefix}-prog-bar`);
    const thumb = document.getElementById(`${prefix}-seek-thumb`);
    if (prog) prog.style.width = p + '%';
    if (thumb) {
        thumb.style.left = p + '%';
        thumb.style.opacity = '1';
    }
    const videoEl = getPlayerVideo(prefix);
    if (videoEl?.duration) updateSeekVisual(prefix, videoEl);
}

function seekVideoTo(prefix, videoEl, time) {
    if (!videoEl) return;
    videoEl.pause();
    if (!videoEl.duration || !isFinite(videoEl.duration)) return;

    const t = clampSeekTime(videoEl, time);
    if (Math.abs((videoEl.currentTime || 0) - t) > 0.02) {
        videoEl.currentTime = t;
    }
    setSeekVisualPct(prefix, (t / videoEl.duration) * 100);
    updateStartWatchTime(prefix, videoEl);
    if (prefix === 'kodik') {
        const timeEl = document.getElementById('kodik-time');
        if (timeEl) timeEl.textContent = `${fmtPlayerTime(t)} / ${fmtPlayerTime(videoEl.duration)}`;
    } else {
        const timeEl = document.getElementById('libria-time');
        if (timeEl) timeEl.textContent = `${fmtPlayerTime(t)} / ${fmtPlayerTime(videoEl.duration)}`;
    }
}

function seekVideoByDelta(prefix, videoEl, delta) {
    if (!videoEl) return;
    const base = videoEl.currentTime || 0;
    seekVideoTo(prefix, videoEl, base + delta);
    if (!playerPlaybackStarted[prefix]) showStartWatchOverlay(prefix);
    else if (_wasPlayingBeforeSeek[prefix] === undefined) {
        _wasPlayingBeforeSeek[prefix] = !videoEl.paused;
    }
}

function updateStartWatchTime(prefix, videoEl) {
    const el = document.getElementById(`${prefix}-start-time`);
    if (!el || !videoEl) return;
    const cur = fmtPlayerTime(videoEl.currentTime);
    const dur = videoEl.duration && isFinite(videoEl.duration) ? fmtPlayerTime(videoEl.duration) : '';
    el.textContent = dur ? `${cur} / ${dur}` : cur;
}

function showStartWatchOverlay(prefix) {
    const overlay = document.getElementById(`${prefix}-start-overlay`);
    const videoEl = getPlayerVideo(prefix);
    if (overlay) overlay.classList.remove('hidden');
    if (videoEl) {
        videoEl.pause();
        updateStartWatchTime(prefix, videoEl);
    }
    lucide.createIcons();
}

function hideStartWatchOverlay(prefix) {
    document.getElementById(`${prefix}-start-overlay`)?.classList.add('hidden');
}

function startPlayerPlayback(prefix) {
    const videoEl = getPlayerVideo(prefix);
    if (!videoEl) return;
    playerPlaybackStarted[prefix] = true;
    hideStartWatchOverlay(prefix);
    videoEl.play().catch(() => {
        playerPlaybackStarted[prefix] = false;
        showStartWatchOverlay(prefix);
    });
    showPlayerControls(prefix);
    lucide.createIcons();
}

// Drag-seek: мгновенный переход к кадру, до старта — пауза + оверлей «Начать просмотр»
function initSeekDrag(trackId, videoEl, prefix) {
    const track = document.getElementById(trackId);
    if (!track || track.dataset.seekInit) return;
    track.dataset.seekInit = '1';

    const getPos = (e) => {
        const rect = track.getBoundingClientRect();
        if (!rect.width) return 0;
        const x = (e.touches?.[0]?.clientX ?? e.clientX) - rect.left;
        return Math.max(0, Math.min(1, x / rect.width));
    };

    let dragging = false;

    const onDown = (e) => {
        e.preventDefault();
        dragging = true;
        _seekDragging[prefix] = true;
        _wasPlayingBeforeSeek[prefix] = !videoEl.paused;
        videoEl.pause();

        const pct = getPos(e);
        setSeekVisualPct(prefix, pct * 100);

        if (videoEl.duration && isFinite(videoEl.duration)) {
            seekVideoTo(prefix, videoEl, pct * videoEl.duration);
        } else {
            _pendingSeekPct[prefix] = pct;
        }
    };

    const onMove = (e) => {
        if (!dragging) return;
        e.preventDefault();
        const pct = getPos(e);
        setSeekVisualPct(prefix, pct * 100);
        if (videoEl.duration && isFinite(videoEl.duration)) {
            seekVideoTo(prefix, videoEl, pct * videoEl.duration);
        } else {
            _pendingSeekPct[prefix] = pct;
        }
    };

    const onUp = () => {
        if (!dragging) return;
        dragging = false;
        _seekDragging[prefix] = false;

        if (!playerPlaybackStarted[prefix]) {
            showStartWatchOverlay(prefix);
        } else if (_wasPlayingBeforeSeek[prefix]) {
            videoEl.play().catch(() => {});
        }
    };

    track.addEventListener('mousedown', onDown);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    track.addEventListener('touchstart', onDown, { passive: false });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
}

// Обновить визуал seek (прогресс + буфер + загрузка)
function getVideoBufferEnd(videoEl) {
    let end = 0;
    if (!videoEl?.buffered) return 0;
    for (let i = 0; i < videoEl.buffered.length; i++) {
        try { end = Math.max(end, videoEl.buffered.end(i)); } catch (_) {}
    }
    return end;
}

function formatBufferSpeed(bps) {
    if (!bps || !isFinite(bps)) return '';
    if (bps >= 1e6) return `${(bps / 1e6).toFixed(1)} MB/s`;
    if (bps >= 1e3) return `${Math.round(bps / 1e3)} KB/s`;
    return `${Math.round(bps)} B/s`;
}

function recordBufferSpeed(prefix, bytesLoaded, loadDurationMs) {
    const st = playerBufferState[prefix];
    if (!st || !bytesLoaded || !loadDurationMs) return;
    const instant = (bytesLoaded * 1000) / Math.max(loadDurationMs, 1);
    st.speedBps = st.speedBps ? st.speedBps * 0.65 + instant * 0.35 : instant;
}

function setPlayerBuffering(prefix, on) {
    const st = playerBufferState[prefix];
    if (!st) return;
    st.buffering = on;
    const videoEl = getPlayerVideo(prefix);
    syncPlayerPlayBtn(prefix);
    if (videoEl) updateSeekVisual(prefix, videoEl);
}

function bindVideoBufferEvents(videoEl, prefix) {
    if (!videoEl || videoEl.dataset.bufferBound) return;
    videoEl.dataset.bufferBound = '1';

    const refresh = () => updateSeekVisual(prefix, videoEl);
    videoEl.addEventListener('progress', refresh);
    videoEl.addEventListener('loadedmetadata', refresh);
    videoEl.addEventListener('durationchange', refresh);
    videoEl.addEventListener('seeked', refresh);
    videoEl.addEventListener('waiting', () => setPlayerBuffering(prefix, true));
    videoEl.addEventListener('playing', () => setPlayerBuffering(prefix, false));
    videoEl.addEventListener('canplay', refresh);
    videoEl.addEventListener('canplaythrough', () => setPlayerBuffering(prefix, false));
    videoEl.addEventListener('stalled', () => setPlayerBuffering(prefix, true));
    videoEl.addEventListener('pause', () => syncPlayerPlayBtn(prefix));
}

function bindHlsBufferEvents(hls, prefix, videoEl) {
    if (!hls) return;
    hls.on(Hls.Events.FRAG_LOADED, (_, data) => {
        const stats = data?.frag?.stats;
        if (stats?.loaded && stats.loading?.end && stats.loading?.start) {
            recordBufferSpeed(prefix, stats.loaded, stats.loading.end - stats.loading.start);
        }
        updateSeekVisual(prefix, videoEl);
    });
    hls.on(Hls.Events.BUFFER_APPENDED, () => updateSeekVisual(prefix, videoEl));
    hls.on(Hls.Events.LEVEL_LOADED, () => updateSeekVisual(prefix, videoEl));
    hls.on(Hls.Events.ERROR, (_, data) => {
        if (data?.details === 'bufferStalledError' || data?.details === 'bufferAppendError') {
            setPlayerBuffering(prefix, true);
        }
    });
}

function updateBufferStatusLabel(prefix, videoEl, { isBuffering }) {
    syncPlayerPlayBtn(prefix);
}

function updateSeekVisual(prefix, videoEl) {
    const prog  = document.getElementById(`${prefix}-prog-bar`);
    const buf   = document.getElementById(`${prefix}-buf-bar`);
    const load  = document.getElementById(`${prefix}-load-bar`);
    const thumb = document.getElementById(`${prefix}-seek-thumb`);
    if (!videoEl || !prog) return;

    const dur = videoEl.duration;
    if (!dur || !isFinite(dur)) return;

    const cur = videoEl.currentTime || 0;
    const playPct = (cur / dur) * 100;
    const bufEnd = getVideoBufferEnd(videoEl);
    const bufPct = (bufEnd / dur) * 100;
    const aheadSec = Math.max(0, bufEnd - cur);
    const aheadPct = (aheadSec / dur) * 100;

    if (!_seekDragging[prefix]) {
        prog.style.width = playPct + '%';
        if (thumb) thumb.style.left = playPct + '%';
    }
    if (buf) buf.style.width = bufPct + '%';

    const st = playerBufferState[prefix];
    const isBuffering = !!(st?.buffering && !videoEl.paused && playerPlaybackStarted[prefix]);

    if (load) {
        const showLoad = isBuffering || aheadSec < 10;
        if (showLoad && (aheadPct > 0.3 || isBuffering)) {
            load.classList.add('is-active');
            load.style.left = playPct + '%';
            load.style.width = Math.max(isBuffering ? 4 : 0.5, aheadPct) + '%';
            load.classList.toggle('is-slow', (st?.speedBps || 0) > 0 && st.speedBps < 350000);
            load.classList.toggle('is-fast', (st?.speedBps || 0) >= 1500000);
        } else {
            load.classList.remove('is-active', 'is-slow', 'is-fast');
            load.style.width = '0%';
        }
    }

    updateBufferStatusLabel(prefix, videoEl, { playPct, bufPct, aheadSec, isBuffering });
}

// Auto-hide controls
function showPlayerControls(player) {
    const id = player === 'kodik' ? 'kodik-controls' : 'libria-controls';
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('hidden');
    el.style.opacity = '1';
    const videoId = player === 'kodik' ? 'kodik-video' : 'libria-video';
    const video = document.getElementById(videoId);
    if (player === 'kodik') { clearTimeout(kodikControlsTimer); }
    else { clearTimeout(libriaControlsTimer); }
    if (video && !video.paused) {
        const timer = setTimeout(() => {
            if (playerBufferState[player]?.buffering) return;
            el.style.opacity = '0';
            setTimeout(() => { if (el.style.opacity === '0') el.classList.add('hidden'); }, 320);
        }, 3000);
        if (player === 'kodik') kodikControlsTimer = timer;
        else libriaControlsTimer = timer;
    }
}

function scheduleHideControls(player) {
    const videoId = player === 'kodik' ? 'kodik-video' : 'libria-video';
    const video = document.getElementById(videoId);
    if (!video || video.paused || playerBufferState[player]?.buffering) return;
    const timer = setTimeout(() => {
        const id = player === 'kodik' ? 'kodik-controls' : 'libria-controls';
        const el = document.getElementById(id);
        if (el) { el.style.opacity = '0'; setTimeout(() => el.classList.add('hidden'), 320); }
    }, 800);
    if (player === 'kodik') { clearTimeout(kodikControlsTimer); kodikControlsTimer = timer; }
    else { clearTimeout(libriaControlsTimer); libriaControlsTimer = timer; }
}

// ─── Quality panel ────────────────────────────────────────────────────────────

function _qualityBtn(label, onclick, active, badge) {
    return `<button onclick="${onclick}"
        class="w-full flex items-center gap-2 px-3 py-2 text-sm font-semibold transition-colors text-left
        ${active ? 'text-airbnb bg-airbnb/10' : 'text-white hover:bg-white/10'}">
        ${active ? '<span class="w-1.5 h-1.5 rounded-full bg-airbnb shrink-0"></span>' : '<span class="w-1.5 h-1.5 shrink-0"></span>'}
        <span class="min-w-0 break-words leading-snug">${escapeHtml(label)}</span>
        ${badge ? `<span class="ml-auto shrink-0 text-[9px] font-bold px-1 rounded ${badge === '4K' ? 'text-airbnb bg-airbnb/20' : badge === 'GL' ? 'text-purple-300 bg-purple-500/20' : 'text-white/50 bg-white/10'}">${badge}</span>` : ''}
    </button>`;
}

function _qualitySectionHeader(label) {
    return `<div class="px-3 pt-2 pb-0.5 text-[10px] font-bold uppercase tracking-widest text-white/40">${escapeHtml(label)}</div>`;
}

function renderQualityPanel(player) {
    const listEl = document.getElementById(`${player}-quality-list`);
    if (!listEl) return;

    let html = '';

    if (player === 'kodik') {
        const kodikKeys = sortQualityKeys(Object.keys(kodikQualityMap));
        if (kodikKeys.length) {
            html += _qualitySectionHeader('Kodik · Качество');
            html += kodikKeys.map(q =>
                _qualityBtn(q, `setKodikQuality('${q.replace(/'/g, "\\'")}')`, q === kodikCurrentQuality, q === '1080p ✦' ? 'GL' : null)
            ).join('');
        }

        const libriaKeys = sortQualityKeys(Object.keys(libriaQualityMap));
        if (libriaKeys.length) {
            html += `<div class="border-t border-white/10 mt-1"></div>`;
            html += _qualitySectionHeader('AniLibria · 4K');
            html += libriaKeys.map(q => {
                const is4k = q === '4K ✦';
                return _qualityBtn(q, `switchToLibriaQuality('${q}')`, false, is4k ? 'GL' : '4K');
            }).join('');
        }

    } else {
        const libriaKeys = sortQualityKeys(Object.keys(libriaQualityMap));
        if (libriaKeys.length) {
            html += libriaKeys.map(q => {
                const is4k = q === '4K ✦';
                return _qualityBtn(q, `setLibriaQuality('${q}')`, q === libriaCurrentQuality, is4k ? 'GL' : null);
            }).join('');
        }
    }

    if (!html) {
        document.getElementById(`${player}-quality-btn`)?.classList.add('hidden');
        return;
    }
    listEl.innerHTML = html;
}

function toggleQualityPanel(player) {
    const other = player === 'kodik' ? 'libria' : 'kodik';
    document.getElementById(`${other}-quality-panel`)?.classList.add('hidden');
    const panel = document.getElementById(`${player}-quality-panel`);
    if (!panel) return;
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
        renderQualityPanel(player);
        requestAnimationFrame(() => {
            const listEl = document.getElementById(`${player}-quality-list`);
            listEl?.querySelector('button.text-airbnb')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
    }
}

function closeQualityPanel(player) {
    document.getElementById(`${player}-quality-panel`)?.classList.add('hidden');
}

function updateQualityLabel(player, q) {
    const el = document.getElementById(`${player}-quality-label`);
    if (el) el.textContent = q;
}

// Клик вне панели закрывает её
document.addEventListener('click', (e) => {
    ['kodik', 'libria'].forEach(p => {
        const panel = document.getElementById(`${p}-quality-panel`);
        const btn   = document.getElementById(`${p}-quality-btn`);
        if (panel && !panel.contains(e.target) && e.target !== btn && !btn?.contains(e.target)) {
            panel.classList.add('hidden');
        }
        const fitPanel = document.getElementById(`${p}-fit-panel`);
        const fitBtn   = document.getElementById(`${p}-fit-btn`);
        if (fitPanel && !fitPanel.contains(e.target) && e.target !== fitBtn && !fitBtn?.contains(e.target)) {
            fitPanel.classList.add('hidden');
        }
    });
    if (window._pickerToggleLock) return;
    const epPanel = document.getElementById('ep-panel');
    const pickerRoot = document.getElementById('player-picker-root');
    if (epPanel && !epPanel.classList.contains('ep-panel--closed')
        && pickerRoot && !pickerRoot.contains(e.target)) {
        closeEpPanel();
    }
});

// ─── Cross-engine quality switching ──────────────────────────────────────────

async function switchToLibriaQuality(q) {
    closeQualityPanel('kodik');
    closeQualityPanel('libria');
    const libraIdx = getActiveServers().findIndex(s => s.type === 'libria');
    if (libraIdx < 0) return;

    if (getActiveServers()[currentServerIndex]?.type === 'libria') {
        // Already on AniLibria — just switch quality
        setLibriaQuality(q);
        return;
    }

    // Switching from Kodik → AniLibria
    stopLibriaGL();
    if (kodikHls) { kodikHls.destroy(); kodikHls = null; }
    currentServerIndex = libraIdx;

    if (Object.keys(libriaQualityMap).length) {
        // Map already prefetched — no need to re-fetch
        libriaCurrentQuality = q;
        libriaUpscale4K = (q === '4K ✦');
        const viewport = document.getElementById('player-viewport');
        if (viewport) {
            viewport.innerHTML = renderCurrentPlayer();
            lucide.createIcons();
            bindPlayerPickerEvents();
        }
        const url = libriaQualityMap[q];
        if (url) loadLibriaVideo(url);
    } else {
        // Need full init
        window._pendingLibriaQuality = q;
        const viewport = document.getElementById('player-viewport');
        if (viewport) {
            viewport.innerHTML = renderCurrentPlayer();
            lucide.createIcons();
            bindPlayerPickerEvents();
        }
        initLibriaPlayer();
    }
    refreshPlayerPickerInPlace();
}

function switchToKodikVoice(idx) {
    closeQualityPanel('kodik');
    closeQualityPanel('libria');
    const kodikIdx = getActiveServers().findIndex(s => s.type === 'kodik');
    if (kodikIdx < 0) return;

    if (getActiveServers()[currentServerIndex]?.type === 'kodik') {
        selectVoice(idx);
        return;
    }

    // Switching from AniLibria → Kodik
    stopLibriaGL();
    if (libriaHls) { libriaHls.destroy(); libriaHls = null; }
    currentServerIndex = kodikIdx;
    currentKodikTranslationIdx = idx;
    const viewport = document.getElementById('player-viewport');
    if (viewport) {
        viewport.innerHTML = renderCurrentPlayer();
        lucide.createIcons();
        bindPlayerPickerEvents();
    }
    initKodikPlayer();
    refreshPlayerPickerInPlace();
}

// ─── Kodik quality switch ─────────────────────────────────────────────────────

// Включить/выключить WebGL-апскейл в Kodik (тот же шейдер, что в AniLibria 4K)
function applyKodikUpscale() {
    const videoEl  = document.getElementById('kodik-video');
    const canvasEl = document.getElementById('kodik-canvas');
    if (!videoEl || !canvasEl) return;
    if (kodikUpscaleHD) {
        canvasEl.classList.remove('hidden');
        videoEl.style.opacity = '0';
        videoEl.style.pointerEvents = 'none';
        canvasEl.onclick = (e) => {
            if (e.pointerType === 'touch') return;
            if (_seekDragging.kodik) return;
            if (!playerPlaybackStarted.kodik) { showStartWatchOverlay('kodik'); return; }
            toggleKodikPlay();
        };
        initWebGLUpscaler(canvasEl, videoEl);
    } else {
        stopLibriaGL();
        canvasEl.classList.add('hidden');
        videoEl.style.opacity = '';
        videoEl.style.pointerEvents = '';
    }
}

function setKodikQuality(q) {
    const url = kodikQualityMap[q];
    if (!url) { closeQualityPanel('kodik'); return; }
    const videoEl = document.getElementById('kodik-video');
    if (!videoEl) return;

    const wantUpscale = (q === '1080p ✦');
    const prevUrl = kodikQualityMap[kodikCurrentQuality];
    kodikCurrentQuality = q;
    updateQualityLabel('kodik', q);
    closeQualityPanel('kodik');
    renderQualityPanel('kodik');

    // Тот же поток (720p ↔ 1080p ✦) — просто переключаем апскейл без перезагрузки
    if (url === prevUrl) {
        kodikUpscaleHD = wantUpscale;
        applyKodikUpscale();
        refreshPlayerPickerInPlace();
        if (currentAnime) saveWatchProgress(currentAnime);
        return;
    }

    const savedTime = videoEl.currentTime;
    const wasPaused = videoEl.paused;
    kodikUpscaleHD = wantUpscale;
    applyKodikUpscale();

    if (kodikHls) { kodikHls.destroy(); kodikHls = null; }
    const isM3u8 = !url.match(/\.(mp4|webm|ogg)(\?|$)/i);
    if (isM3u8 && Hls.isSupported()) {
        kodikHls = new Hls(HLS_FAST_OPTS);
        kodikHls.loadSource(url);
        kodikHls.attachMedia(videoEl);
        kodikHls.once(Hls.Events.MANIFEST_PARSED, () => {
            videoEl.currentTime = savedTime;
            updateSeekVisual('kodik', videoEl);
            if (!wasPaused) videoEl.play().catch(() => {});
        });
        kodikHls.on(Hls.Events.ERROR, (e, d) => { if (d.fatal) { kodikHls?.destroy(); kodikHls = null; } });
        bindHlsBufferEvents(kodikHls, 'kodik', videoEl);
    } else {
        videoEl.src = url; videoEl.load();
        videoEl.addEventListener('loadedmetadata', () => {
            videoEl.currentTime = savedTime;
            if (!wasPaused) videoEl.play().catch(() => {});
        }, { once: true });
    }
    refreshPlayerPickerInPlace();
    if (currentAnime) saveWatchProgress(currentAnime);
}

// ─── AniLibria quality switch (с 4K режимом) ─────────────────────────────────

function setLibriaQuality(q) {
    const url = libriaQualityMap[q];
    if (!url || q === libriaCurrentQuality) { closeQualityPanel('libria'); return; }
    const videoEl  = document.getElementById('libria-video');
    const canvasEl = document.getElementById('libria-canvas');
    if (!videoEl) return;
    const savedTime = videoEl.currentTime;
    const wasPaused = videoEl.paused;
    libriaCurrentQuality = q;
    libriaUpscale4K = (q === '4K ✦');
    updateQualityLabel('libria', q);
    closeQualityPanel('libria');
    renderQualityPanel('libria');

    if (libriaHls) { libriaHls.destroy(); libriaHls = null; }
    stopLibriaGL();

    const isM3u8 = !url.match(/\.(mp4|webm|ogg)(\?|$)/i);
    if (isM3u8 && Hls.isSupported()) {
        libriaHls = new Hls(HLS_FAST_OPTS);
        libriaHls.loadSource(url);
        libriaHls.attachMedia(videoEl);
        libriaHls.once(Hls.Events.MANIFEST_PARSED, () => {
            videoEl.currentTime = savedTime;
            updateSeekVisual('libria', videoEl);
            if (!wasPaused) videoEl.play().catch(() => {});
        });
        bindHlsBufferEvents(libriaHls, 'libria', videoEl);
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        videoEl.src = url; videoEl.load();
        videoEl.addEventListener('loadedmetadata', () => {
            videoEl.currentTime = savedTime;
            if (!wasPaused) videoEl.play().catch(() => {});
        }, { once: true });
    }

    if (canvasEl) _initLibriaGL(canvasEl, videoEl);
    refreshPlayerPickerInPlace();
    if (currentAnime) saveWatchProgress(currentAnime);
}

// ─── Libria player controls ───────────────────────────────────────────────────

function toggleLibriaPlay() {
    const v = document.getElementById('libria-video');
    if (!v) return;
    if (!playerPlaybackStarted.libria) { startPlayerPlayback('libria'); return; }
    if (v.paused) v.play().catch(() => {});
    else v.pause();
}

function toggleLibriaMute() {
    const v = document.getElementById('libria-video');
    const btn = document.getElementById('libria-vol-btn');
    const slider = document.getElementById('libria-vol-slider');
    if (!v) return;
    v.muted = !v.muted;
    if (slider) slider.value = v.muted ? 0 : v.volume;
    if (btn) {
        btn.innerHTML = v.muted
            ? '<i data-lucide="volume-x" class="w-4 h-4"></i>'
            : '<i data-lucide="volume-2" class="w-4 h-4"></i>';
        lucide.createIcons();
    }
}

function updateLibriaPlayBtn(isPaused) {
    updatePlayerPlayBtn('libria', isPaused ? 'paused' : 'playing');
}

function updateLibriaTime() {
    const v = document.getElementById('libria-video');
    const timeEl = document.getElementById('libria-time');
    if (!v || !timeEl) return;
    const fmt = s => isFinite(s) ? `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}` : '0:00';
    timeEl.textContent = `${fmt(v.currentTime)} / ${fmt(v.duration)}`;
    updateStartWatchTime('libria', v);
    if (!_seekDragging.libria) updateSeekVisual('libria', v);
    if (!v.paused && playerPlaybackStarted.libria) scheduleWatchProgressSave();
}

function setLibriaVolume(val) {
    const v = document.getElementById('libria-video');
    const btn = document.getElementById('libria-vol-btn');
    if (!v) return;
    const vol = parseFloat(val);
    v.volume = vol;
    v.muted = vol === 0;
    if (btn) {
        btn.innerHTML = vol === 0
            ? '<i data-lucide="volume-x" class="w-4 h-4"></i>'
            : '<i data-lucide="volume-2" class="w-4 h-4"></i>';
        lucide.createIcons();
    }
}

function setLibriaSpeed(val) {
    const v = document.getElementById('libria-video');
    if (v) v.playbackRate = parseFloat(val);
}

function toggleLibriaFullscreen() {
    const container = document.getElementById('libria-player');
    if (!container) return;
    const isCSSFS = container.classList.contains('libria-fs');

    if (document.fullscreenElement) {
        document.exitFullscreen?.();
        return;
    }
    if (isCSSFS) { _exitLibriaCSSFS(container); return; }

    // Пробуем нативный fullscreen
    const req = container.requestFullscreen?.() ||
                container.webkitRequestFullscreen?.() ||
                container.mozRequestFullScreen?.();
    if (req && typeof req.then === 'function') {
        req.catch(() => _enterLibriaCSSFS(container));
    } else if (!req) {
        _enterLibriaCSSFS(container); // iOS Safari — CSS fallback
    }
}

function _enterLibriaCSSFS(c) {
    c.classList.add('libria-fs');
    document.body.style.overflow = 'hidden';
    _updateLibriaFSBtn(true);
}
function _exitLibriaCSSFS(c) {
    c.classList.remove('libria-fs');
    document.body.style.overflow = '';
    _updateLibriaFSBtn(false);
}
function _updateLibriaFSBtn(isFullscreen) {
    const btn = document.querySelector('#libria-controls button[onclick="toggleLibriaFullscreen()"]');
    if (!btn) return;
    btn.innerHTML = isFullscreen
        ? '<i data-lucide="minimize" class="w-4 h-4"></i>'
        : '<i data-lucide="maximize" class="w-4 h-4"></i>';
    lucide.createIcons();
}

// Обработка выхода из нативного fullscreen (ESC)
document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
        const lc = document.getElementById('libria-player');
        if (lc) _exitLibriaCSSFS(lc);
        const kc = document.getElementById('kodik-direct-player');
        if (kc) _exitKodikCSSFS(kc);
    }
});


// ─── Dark mode ────────────────────────────────────────────────────────────────

function toggleDarkMode() {
    document.documentElement.classList.toggle('dark');
    const isDark = document.documentElement.classList.contains('dark');
    setCookie('anyrainy_theme', isDark ? 'dark' : 'light', 365);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

// Initialize theme from cookie or localStorage
(function initTheme() {
    const theme = getCookie('anyrainy_theme') || localStorage.getItem('theme');
    if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
})();

// ─── Mobile UI ────────────────────────────────────────────────────────────────

function openMobileSearch() {
    if (currentSection !== 'home') showSection('home', { preserveScroll: true });
    const overlay = document.getElementById('mobile-search-overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    overlay.classList.add('mobile-search-enter');
    const input = document.getElementById('mobile-search-input');
    if (input) setTimeout(() => input.focus(), 150);
}

function closeMobileSearch() {
    document.getElementById('mobile-search-overlay')?.classList.add('hidden');
}

function clearMobileSearch() {
    const input = document.getElementById('mobile-search-input');
    const btn = document.getElementById('mobile-search-clear');
    if (input) { input.value = ''; input.focus(); }
    if (btn) btn.classList.add('hidden');
}

function triggerMobileSearch() {
    const input = document.getElementById('mobile-search-input');
    const val = input?.value.trim() || '';
    if (!val) return;
    closeMobileSearch();
    syncSearchInputs(val);
    handleSearch({ source: 'big', scrollToResults: true });
}

function updateMobileNavActive(section) {
    document.querySelectorAll('.mobile-nav-btn').forEach(btn => btn.classList.remove('active'));
    const navIds = { home: 'mob-nav-home', profile: 'mob-nav-account', studios: 'mob-nav-studios' };
    const id = navIds[section];
    if (id) document.getElementById(id)?.classList.add('active');
}

const mobileSearchInput = document.getElementById('mobile-search-input');
if (mobileSearchInput) {
    mobileSearchInput.addEventListener('input', () => {
        const btn = document.getElementById('mobile-search-clear');
        if (btn) btn.classList.toggle('hidden', !mobileSearchInput.value);
    });
    mobileSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') triggerMobileSearch();
        if (e.key === 'Escape') closeMobileSearch();
    });
}

// ─── Admin Panel ──────────────────────────────────────────────────────────────

let adminTapCount = 0;
let adminTapTimer = null;
let isAdminAuthenticated = false;
const ADMIN_PASSWORD = 'dota5989';

function handleAdminTap() {
    adminTapCount++;
    clearTimeout(adminTapTimer);
    adminTapTimer = setTimeout(() => { adminTapCount = 0; }, 1500);
    if (adminTapCount >= 4) {
        adminTapCount = 0;
        clearTimeout(adminTapTimer);
        const panel = document.getElementById('admin-secret-panel');
        if (panel) {
            panel.classList.remove('hidden');
            setTimeout(() => document.getElementById('admin-password-input')?.focus(), 100);
        }
    }
}

function checkAdminPassword() {
    const input = document.getElementById('admin-password-input');
    const err = document.getElementById('admin-password-error');
    if (input?.value === ADMIN_PASSWORD) {
        input.value = '';
        document.getElementById('admin-secret-panel')?.classList.add('hidden');
        isAdminAuthenticated = true;
        closeAuthModal();
        openAdminModal();
    } else {
        if (err) { err.classList.remove('hidden'); setTimeout(() => err.classList.add('hidden'), 2000); }
        if (input) { input.value = ''; input.focus(); }
    }
}

function openAdminModal() {
    if (!isAdminAuthenticated) return;
    const modal = document.getElementById('admin-panel-modal');
    if (!modal) return;
    openModalOverlay(modal);
    switchAdminTab('stats');
    renderAdminStats();
    const langInfo = document.getElementById('admin-lang-info');
    if (langInfo) {
        langInfo.textContent = TRANSLATE_TO
            ? `${t('admin_lang_auto')}: "${TRANSLATE_TO}"`
            : 'EN';
    }
    lucide.createIcons();
}

function closeAdminModal() {
    closeModalOverlay(document.getElementById('admin-panel-modal'));
}

function switchAdminTab(tab) {
    ['stats', 'data'].forEach(t => {
        document.getElementById(`admin-panel-${t}`)?.classList.toggle('hidden', t !== tab);
        document.getElementById(`admin-tab-${t}`)?.classList.toggle('active-tab', t === tab);
    });
    if (tab === 'stats') renderAdminStats();
    lucide.createIcons();
}

function initAdmin() {}

function renderAdminStats() {
    const panel = document.getElementById('admin-panel-stats');
    if (!panel) return;
    let totalComments = 0, commentedAnime = 0;
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('anime_comments_')) {
            const c = JSON.parse(localStorage.getItem(key) || '[]');
            if (c.length) { commentedAnime++; totalComments += c.length; }
        }
    }
    const users = Object.keys(getStoredUsers()).length;
    panel.innerHTML = `
        <h4 class="font-bold text-gray-900 dark:text-white mb-4">${t('admin_stats_title')}</h4>
        <div class="grid grid-cols-2 gap-3 mb-3">
            <div class="bg-gray-50 dark:bg-[#2a2a2a] rounded-2xl p-4 text-center">
                <p class="text-3xl font-bold text-airbnb">${totalComments}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">${t('admin_comments_count')}</p>
            </div>
            <div class="bg-gray-50 dark:bg-[#2a2a2a] rounded-2xl p-4 text-center">
                <p class="text-3xl font-bold text-airbnb">${commentedAnime}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">${t('admin_reviewed_anime')}</p>
            </div>
            <div class="bg-gray-50 dark:bg-[#2a2a2a] rounded-2xl p-4 text-center">
                <p class="text-3xl font-bold text-airbnb">${users}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">${t('admin_users_count')}</p>
            </div>
        </div>
        <div class="bg-gray-50 dark:bg-[#2a2a2a] rounded-2xl p-4 flex items-center justify-between">
            <div>
                <p class="text-sm font-semibold text-gray-700 dark:text-gray-300">${t('admin_cached_anime')}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">${t('admin_cached_sub')}</p>
            </div>
            <p class="text-2xl font-bold text-airbnb">${animeData.length}</p>
        </div>
    `;
}

function adminClearComments() {
    if (!confirm(t('admin_clear_confirm'))) return;
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith('anime_comments_')) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
    showAdminDataStatus(t('admin_cleared'));
}


function adminExportData() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith('anime_comments_') || k?.startsWith('anistream_') || k?.startsWith('anyrainy_')) {
            out[k] = localStorage.getItem(k);
        }
    }
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `anyrainy-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
}

function adminImportData(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            Object.entries(data).forEach(([k, v]) => localStorage.setItem(k, v));
            showAdminDataStatus(t('admin_imported'));
        } catch (_) {
            showAdminDataStatus(t('admin_import_err'));
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function showAdminDataStatus(msg) {
    const el = document.getElementById('admin-data-status');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 3500);
}

// ─── URL Routing ─────────────────────────────────────────────────────────────

const USE_HASH = true; // static server — always hash-based so refresh works

function updateAnimeUrl(malId) {
    const padded = String(malId).padStart(9, '0');
    history.pushState({ animeId: malId }, '', '#' + padded);
    document.title = currentAnime ? `${currentAnime.displayTitle} — AnyRainy` : 'AnyRainy';
}

function clearAnimeUrl() {
    if (location.hash) history.pushState({}, '', location.pathname);
    document.title = 'AnyRainy';
}

function getRouteInfo() {
    const hash = location.hash.replace('#', '');
    if (/^\d+$/.test(hash)) return { type: 'anime', malId: parseInt(hash, 10) };
    if (hash === 'profile') return { type: 'profile', username: null };
    const profileMatch = hash.match(/^profile\/(.+)$/);
    if (profileMatch) return { type: 'profile', username: decodeURIComponent(profileMatch[1]) };
    const catMatch = hash.match(/^cat\/(ongoing|top|popular)$/);
    if (catMatch) return { type: 'category', category: catMatch[1] };
    if (hash === 'catalog') return { type: 'catalog' };
    return { type: 'home' };
}

async function fetchAndWatchByMalId(malId) {
    const existing = findAnimeById(malId);
    if (existing) { await watchAnime(malId); return; }

    showSection('watch');
    showAnimeLoadingScreen('');
    setLoadingProgress('anime', 8);

    try {
        setLoadingProgress('anime', 25);
        const res = await jikanFetch(`/anime/${malId}`);
        const data = await res.json();
        if (!data.data) { stopLoadingProgress('anime'); showSection('home'); clearAnimeUrl(); return; }
        setLoadingProgress('anime', 40);
        const anime = normalizeAnimeItem(data.data);
        if (!animeData.find(a => a.id === anime.id)) animeData.push(anime);
        await watchAnime(malId);
    } catch (_) {
        stopLoadingProgress('anime');
        showSection('home');
        clearAnimeUrl();
    }
}

// Кнопки назад/вперёд в браузере
window.addEventListener('popstate', () => {
    const info = getRouteInfo();
    if (info.type === 'anime') {
        fetchAndWatchByMalId(info.malId);
    } else if (info.type === 'profile') {
        showProfilePage(info.username);
    } else if (info.type === 'category') {
        currentAnime = null;
        renderCategoryView(info.category);
    } else if (info.type === 'catalog') {
        currentAnime = null;
        openCatalog({ fromHistory: true });
    } else {
        currentAnime = null;
        goHome();
    }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

loadSession();
updateAuthUI();
switchAuthMode('login');
updateLangToggle();
renderTranslations();
setupInfiniteCatalogLoading();
setupKeyboardShortcuts();

document.addEventListener('click', (e) => {
    if (!sortPanelOpen) return;
    const panel = document.getElementById('sort-panel');
    const btn = document.getElementById('sort-toggle-btn');
    if (panel && !panel.contains(e.target) && e.target !== btn && !btn?.contains(e.target)) {
        closeSortPanel();
    }
});

// Проверяем URL при загрузке страницы
(async () => {
    const info = getRouteInfo();
    if (info.type === 'anime') {
        showSection('home');
        await new Promise(r => setTimeout(r, 100));
        await fetchAndWatchByMalId(info.malId);
    } else if (info.type === 'profile') {
        showSection('home');
        await new Promise(r => setTimeout(r, 50));
        showProfilePage(info.username);
    } else if (info.type === 'category') {
        renderCategoryView(info.category);
    } else if (info.type === 'catalog') {
        await openCatalog({ fromHistory: true });
    } else {
        showSection('home');
    }
})();
