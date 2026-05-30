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
let genreSearchQ = '';

const PAGE_SIZE = 24;
const AUTH_STORAGE_KEY = 'anistream_users';

// Language: stored in cookie, default RU
let currentLang = getCookie('anyrainy_lang') || 'ru';
let TRANSLATE_TO = currentLang === 'en' ? null : currentLang;

const synopsisCache = {};

// ─── Escape HTML ──────────────────────────────────────────────────────────────

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ─── Translations ─────────────────────────────────────────────────────────────

const STRINGS = {
    ru: {
        catalog: 'Каталог', favorites_nav: 'Избранное', login_btn: 'Войти',
        hero_title: 'Откройте для себя<br><span class="text-airbnb">мир аниме</span>',
        hero_subtitle: 'Смотрите лучшие аниме-сериалы. Без лишнего шума, только контент.',
        search_label: 'Поиск', search_placeholder: 'Название аниме...',
        nav_search_placeholder: 'Найти аниме...', mobile_search_placeholder: 'Найти аниме...',
        mobile_search_hint: 'Введи название и нажми', mobile_search_hint_btn: 'Поиск',
        genres_btn: 'Жанры',
        sort_label: 'Сортировка', sort_default: 'По умолчанию', sort_rating: 'По рейтингу', sort_title: 'По названию',
        popular_now: 'Популярное сейчас', catalog_desc: 'Подборка аниме из базы MyAnimeList',
        recommendations_title: 'Можно ещё посмотреть', recommendations_desc: 'Несколько рекомендаций, если нужный тайтл не подошёл',
        episodes_count: n => `${n} эпизодов`, nothing_found: 'Ничего не найдено...', no_recommendations: 'Пока нет рекомендаций.',
        load_more_loading: 'Загружаем ещё аниме...', load_more_scroll: 'Листай ниже, новые аниме загрузятся автоматически',
        source_search: 'Результаты из базы MyAnimeList', source_top: 'Каталог из базы MyAnimeList', no_more: 'Больше результатов нет.',
        popular_now_label: 'Популярное сейчас', by_rating_label: 'По рейтингу', by_title_label: 'По названию А-Я',
        search_results_label: q => `Результаты поиска: ${q}`, searching_label: q => `Ищем: ${q}`,
        search_found_label: q => `Найдено по запросу: ${q}`, search_results_sub: 'Результаты поиска, ниже — рекомендации',
        search_min_chars: 'Введите хотя бы 2 символа', search_error: 'Не удалось выполнить поиск',
        back_to_catalog: 'Назад к каталогу', watching: 'Просмотр', episode_select: n => `Серия ${n}`,
        open_in_browser: 'В браузере', rating_badge: r => `Рейтинг ${r}`, ep_badge: n => `${n} эп.`,
        in_favorites: 'В избранном', to_favorites: 'В избранное', anime_loading: 'Загрузка аниме...',
        kodik_unavailable: 'Kodik недоступен', kodik_unavailable_sub: 'Русская озвучка не найдена для этого аниме.<br>Попробуй Megaplay.',
        player_error_title: 'Плеер не загрузился', player_error_sub: 'Попробуй другой сервер или открой напрямую',
        next_server: 'Следующий сервер', open_browser_btn: 'Открыть в браузере',
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
    },
    en: {
        catalog: 'Catalog', favorites_nav: 'Favorites', login_btn: 'Sign in',
        hero_title: 'Discover the<br><span class="text-airbnb">world of anime</span>',
        hero_subtitle: 'Watch the best anime series. No noise, just content.',
        search_label: 'Search', search_placeholder: 'Anime title...',
        nav_search_placeholder: 'Find anime...', mobile_search_placeholder: 'Find anime...',
        mobile_search_hint: 'Type a title and press', mobile_search_hint_btn: 'Search',
        genres_btn: 'Genres',
        sort_label: 'Sort', sort_default: 'Default', sort_rating: 'By rating', sort_title: 'By title',
        popular_now: 'Popular now', catalog_desc: 'Anime collection from MyAnimeList',
        recommendations_title: 'You might also like', recommendations_desc: 'A few recommendations if the title wasn\'t right',
        episodes_count: n => `${n} episodes`, nothing_found: 'Nothing found...', no_recommendations: 'No recommendations yet.',
        load_more_loading: 'Loading more anime...', load_more_scroll: 'Scroll down to auto-load more',
        source_search: 'Results from MyAnimeList', source_top: 'Catalog from MyAnimeList', no_more: 'No more results.',
        popular_now_label: 'Popular now', by_rating_label: 'By rating', by_title_label: 'By title A-Z',
        search_results_label: q => `Search results: ${q}`, searching_label: q => `Searching: ${q}`,
        search_found_label: q => `Found for: ${q}`, search_results_sub: 'Search results, recommendations below',
        search_min_chars: 'Enter at least 2 characters', search_error: 'Search failed',
        back_to_catalog: 'Back to catalog', watching: 'Watching', episode_select: n => `Episode ${n}`,
        open_in_browser: 'In browser', rating_badge: r => `Rating ${r}`, ep_badge: n => `${n} ep.`,
        in_favorites: 'In favorites', to_favorites: 'Add to favorites', anime_loading: 'Loading anime...',
        kodik_unavailable: 'Kodik unavailable', kodik_unavailable_sub: 'Russian dub not found for this anime.<br>Try Megaplay.',
        player_error_title: 'Player failed to load', player_error_sub: 'Try another server or open directly',
        next_server: 'Next server', open_browser_btn: 'Open in browser',
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
    const sel = document.getElementById('sort-select');
    if (sel && sel.options.length >= 3) {
        sel.options[0].text = t('sort_default');
        sel.options[1].text = t('sort_rating');
        sel.options[2].text = t('sort_title');
    }
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
        renderCatalog();
    } else if (currentSection === 'watch' && currentAnime) {
        renderPlayerUI(currentAnime);
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

async function translateSynopsis(text, animeId) {
    if (!TRANSLATE_TO || !text || text === 'Описание пока недоступно.') return text;
    if (synopsisCache[animeId]) return synopsisCache[animeId];
    if (TRANSLATE_TO === 'ru' && /[Ѐ-ӿ]{10,}/.test(text)) return text;
    try {
        const snippet = text.slice(0, 480);
        const res = await fetch(
            `https://api.mymemory.translated.net/get?q=${encodeURIComponent(snippet)}&langpair=en|${TRANSLATE_TO}`
        );
        const data = await res.json();
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
        if (currentLang === 'ru') {
            alert('Файл слишком большой. Максимальный размер — 5 МБ.');
        } else {
            alert('File is too large. Maximum size — 5 MB.');
        }
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
                displayTitle: anime.displayTitle, image: anime.image,
                rating: anime.rating, episodes: anime.episodes,
                tags: anime.tags, synopsis: anime.synopsis,
                year: anime.year, status: anime.status,
                season: anime.season, episodesList: anime.episodesList || []
            });
        }
    }
    localStorage.setItem(key, JSON.stringify(favorites));
    updateHeartButtons(animeId);
    // Update count in profile panel
    const countEl = document.getElementById('profile-fav-count');
    if (countEl) countEl.textContent = getFavorites().length;
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
    if (!currentUser) {
        document.getElementById('favorites-guest')?.classList.remove('hidden');
        document.getElementById('favorites-content')?.classList.add('hidden');
        modal.classList.remove('hidden');
        lucide.createIcons();
        return;
    }
    document.getElementById('favorites-guest')?.classList.add('hidden');
    renderFavoritesModal();
    modal.classList.remove('hidden');
}

function closeFavorites() {
    document.getElementById('favorites-modal')?.classList.add('hidden');
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
    if (usernameLabel) usernameLabel.textContent = isLogin ? 'Логин или email' : 'Имя пользователя';
    if (usernameInput) usernameInput.placeholder = isLogin ? 'Логин или email' : 'Например, Sora';

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
    modal.classList.remove('hidden');
    switchAuthMode(mode);
    updateAuthUI();
    lucide.createIcons();
}

function closeAuthModal() {
    document.getElementById('auth-modal')?.classList.add('hidden');
    document.getElementById('admin-secret-panel')?.classList.add('hidden');
    document.getElementById('forgot-password-panel')?.classList.add('hidden');
    const passInput = document.getElementById('admin-password-input');
    if (passInput) passInput.value = '';
}

function handleAccountButtonClick() {
    openAuthModal(currentUser ? 'login' : authMode);
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
        if (errorEl) { errorEl.textContent = 'Введи корректный email.'; errorEl.classList.remove('hidden'); }
        return;
    }
    const users = getStoredUsers();
    if (Object.values(users).some(u => u.email?.toLowerCase() === email)) {
        if (errorEl) { errorEl.textContent = 'Этот email уже зарегистрирован.'; errorEl.classList.remove('hidden'); }
        return;
    }
    if (errorEl) errorEl.classList.add('hidden');
    if (btn) { btn.disabled = true; btn.textContent = 'Отправка...'; }

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
        if (btn) { btn.textContent = 'Отправить снова'; btn.disabled = false; }
    } catch (err) {
        const msg = err?.message || String(err);
        if (errorEl) { errorEl.textContent = 'Ошибка: ' + msg; errorEl.classList.remove('hidden'); }
        if (btn) { btn.textContent = 'Подтвердить'; btn.disabled = false; }
        console.error('Verify email error:', msg);
    }
}

function verifyEmailCode() {
    const codeInput = document.getElementById('auth-email-code');
    const errorEl = document.getElementById('email-verify-error');
    const code = codeInput?.value.trim();

    if (Date.now() > emailVerifyExpiry) {
        if (errorEl) { errorEl.textContent = 'Код истёк. Запроси новый.'; errorEl.classList.remove('hidden'); }
        return;
    }
    if (!code || code !== emailVerifyCode) {
        if (errorEl) { errorEl.textContent = 'Неверный код. Попробуй ещё раз.'; errorEl.classList.remove('hidden'); }
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
    if (status) { status.textContent = 'Введи email, на который зарегистрирован аккаунт.'; status.className = 'text-sm text-gray-500 dark:text-gray-400'; }
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
        if (status) { status.textContent = 'Введи корректный email.'; status.className = 'text-sm text-red-500'; }
        return;
    }
    const users = getStoredUsers();
    const found = Object.values(users).find(u => u.email?.toLowerCase() === email);
    if (!found) {
        if (status) { status.textContent = 'Аккаунт с этим email не найден.'; status.className = 'text-sm text-red-500'; }
        return;
    }
    if (btn) { btn.disabled = true; btn.textContent = 'Отправка...'; }

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
        if (status) { status.textContent = 'Код отправлен! Проверь почту.'; status.className = 'text-sm text-green-500'; }
        if (btn) { btn.textContent = 'Отправить снова'; btn.disabled = false; }
    } catch (err) {
        const msg = err?.message || String(err);
        if (status) { status.textContent = 'Ошибка: ' + msg; status.className = 'text-sm text-red-500'; }
        if (btn) { btn.textContent = 'Отправить код'; btn.disabled = false; }
        console.error('Reset email error:', msg);
    }
}

function submitResetCode() {
    const codeInput = document.getElementById('reset-code-input');
    const status = document.getElementById('reset-status');
    const code = codeInput?.value.trim();

    if (Date.now() > resetExpiry) {
        if (status) { status.textContent = 'Код истёк. Запроси новый.'; status.className = 'text-sm text-red-500'; }
        return;
    }
    if (!code || code !== resetVerifyCode) {
        if (status) { status.textContent = 'Неверный код.'; status.className = 'text-sm text-red-500'; }
        return;
    }
    document.getElementById('reset-code-row')?.classList.add('hidden');
    document.getElementById('reset-newpass-row')?.classList.remove('hidden');
    document.getElementById('reset-new-password')?.focus();
    if (status) { status.textContent = 'Код верный! Введи новый пароль.'; status.className = 'text-sm text-green-500'; }
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
        if (status) { status.textContent = 'Пользователь не найден.'; status.className = 'text-sm text-red-500'; }
        return;
    }
    users[entry[0]].password = newPass;
    saveStoredUsers(users);
    if (status) { status.textContent = 'Пароль успешно изменён! Входи.'; status.className = 'text-sm text-green-500'; }
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
        if (!emailVerified || !emailVerifyTarget) { if (status) status.textContent = 'Подтверди email перед регистрацией.'; return; }
        if (password.length < 4) { if (status) status.textContent = t('password_short'); return; }
        const users = getStoredUsers();
        if (users[normalizedLogin]) { if (status) status.textContent = t('user_exists'); return; }
        if (Object.values(users).some(u => u.email?.toLowerCase() === emailVerifyTarget)) {
            if (status) status.textContent = 'Этот email уже зарегистрирован.'; return;
        }
        users[normalizedLogin] = { username: loginStr, email: emailVerifyTarget, password };
        saveStoredUsers(users);
        saveSession({ username: loginStr });
    } else {
        if (!loginStr) { if (status) status.textContent = 'Введи логин или email.'; return; }
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

function renderCommentsSection(anime) {
    const comments = getAnimeComments(anime.id);
    const commentsHtml = comments.length
        ? comments.map(comment => `
            <div class="rounded-2xl border border-subtle p-4 bg-white dark:bg-[#1e1e1e]">
                <div class="flex items-start justify-between gap-4">
                    <div>
                        <p class="font-semibold text-gray-900 dark:text-white">${escapeHtml(comment.username)}</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">${escapeHtml(comment.createdAt)}</p>
                    </div>
                    ${currentUser && currentUser.username === comment.username ? `
                        <button onclick="deleteComment('${anime.id}', '${comment.id}')" class="text-xs text-airbnb hover:text-airbnbDark transition-colors">${t('comment_delete')}</button>
                    ` : ''}
                </div>
                <p class="text-sm text-gray-700 dark:text-gray-300 mt-3 leading-6">${escapeHtml(comment.text)}</p>
            </div>
        `).join('')
        : `<div class="rounded-2xl border border-subtle p-6 text-sm text-gray-500 dark:text-gray-400 bg-white dark:bg-[#1e1e1e]">${t('no_comments')}</div>`;

    const formHtml = currentUser ? `
        <form class="space-y-3" onsubmit="submitComment(event)">
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

function refreshCommentsOnly() {
    const wrapper = document.getElementById('player-comments-wrapper');
    if (wrapper && currentAnime) { wrapper.innerHTML = renderCommentsSection(currentAnime); lucide.createIcons(); }
}

function submitComment(event) {
    event.preventDefault();
    if (!currentUser || !currentAnime) { openAuthModal('login'); return; }
    const input = document.getElementById('comment-input');
    const text = input?.value.trim() || '';
    if (text.length < 2) { alert(t('comment_too_short')); return; }
    const comments = getAnimeComments(currentAnime.id);
    comments.unshift({ id: `${Date.now()}`, username: currentUser.username, text, createdAt: new Date().toLocaleString('ru-RU') });
    saveAnimeComments(currentAnime.id, comments);
    if (input) input.value = '';
    refreshCommentsOnly();
}

function deleteComment(animeId, commentId) {
    const comments = getAnimeComments(animeId).filter(c => c.id !== commentId);
    saveAnimeComments(animeId, comments);
    if (currentAnime && currentAnime.id === animeId) refreshCommentsOnly();
}

// ─── Player ───────────────────────────────────────────────────────────────────

let currentAnime = null;
let currentEpisodeNum = 1;
let currentServerIndex = 0;
let currentPlayerVoiceIdx = 0;
let watchToken = 0;

// Kodik (русская озвучка)
const KODIK_TOKEN = '56a768d08f43091901c44b54fe970049';
let currentKodikTranslations = [];  // [{id, title, link}]
let currentKodikTranslationIdx = 0;
let currentKodikEpisodeNums = [];   // реально существующие серии [1, 2, 3, ...]
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
        if (!data.results?.length) { kodikCache[malId] = { translations: [], episodes: [] }; return kodikCache[malId]; }
        const seen = new Set();
        const translations = data.results
            .filter(r => r.translation?.id && !seen.has(r.translation.id) && seen.add(r.translation.id))
            .map(r => ({
                id: r.translation.id,
                title: r.translation.title,
                link: r.link.startsWith('//') ? 'https:' + r.link : r.link,
            }));
        // Use episodes_count from first result for the episode dropdown
        const epCount = data.results[0]?.episodes_count || 0;
        const episodes = epCount > 0 ? Array.from({ length: epCount }, (_, i) => i + 1) : [];
        kodikCache[malId] = { translations, episodes };
        return kodikCache[malId];
    } catch (_) { kodikCache[malId] = { translations: [], episodes: [] }; return kodikCache[malId]; }
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
            })
        });
        const data = await res.json();
        const id = data?.data?.Media?.id;
        if (id) anilistIdCache[malId] = id;
        return id || null;
    } catch (_) { return null; }
}

// Плееры. builtinSelection: true — плеер сам управляет сериями/озвучкой внутри
const AUTO_SERVERS = [
    { name: 'Kodik RU', type: 'kodik', builtinSelection: true },
    { name: 'Megaplay', type: 'auto', builtinSelection: false,
      url: (malId, ep) => `https://megaplay.buzz/stream/mal/${malId}/${ep}/sub` },
    { name: 'Megaplay DUB', type: 'auto', builtinSelection: false,
      url: (malId, ep) => `https://megaplay.buzz/stream/mal/${malId}/${ep}/dub` },
    { name: 'VidPlus', type: 'auto', builtinSelection: true,
      url: (malId, ep) => `https://player.vidplus.to/embed/anime/${currentAnime?.anilistId || malId}/${ep}?dub=false&autoplay=true` },
];

// ─── Genre translations ───────────────────────────────────────────────────────

const genreTranslations = {
    // Explicit genres
    Action: 'Экшен', Adventure: 'Приключения', 'Avant Garde': 'Авангард',
    'Award Winning': 'Отмечено наградами', 'Boys Love': 'Сёнэн-ай',
    Comedy: 'Комедия', Drama: 'Драма', Ecchi: 'Этти', Erotica: 'Эротика',
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
    return {
        id: item.mal_id,
        title: item.title,
        titleRu,
        titleEn,
        displayTitle: currentLang === 'en' ? titleEn : titleRu,
        tags: (item.genres || []).map(g => g.name), // raw English — translate at display time
        rating: item.score || 0,
        episodes: item.episodes || 12,
        image: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || '',
        synopsis: rawSynopsis,
        synopsisEn: rawSynopsis, // original English, never overwritten
        year: item.year || '',
        season: item.season || '',
        status: item.status || 'Статус неизвестен',
        malId: item.mal_id,
        episodesList: []
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
    if (currentCatalogMode !== 'search') {
        // Re-fetch with new sort from page 1
        animeData = [];
        hasMoreAnime = true;
        currentCatalogPage = 1;
        renderCatalog();
        fetchTopAnime({ page: 1, append: false });
    } else {
        renderCatalog();
    }
}

// ─── Genre filter ─────────────────────────────────────────────────────────────

function getGenreCounts() {
    const counts = {};
    animeData.forEach(a => (a.tags || []).forEach(g => { counts[g] = (counts[g] || 0) + 1; }));
    return counts;
}

function filterByGenres(items) {
    if (!selectedGenres.size) return items;
    return items.filter(a => [...selectedGenres].every(g => (a.tags || []).includes(g)));
}

function toggleGenre(genre) {
    if (selectedGenres.has(genre)) selectedGenres.delete(genre);
    else selectedGenres.add(genre);
    renderGenreFilterList();
    const grid = document.getElementById('anime-grid');
    if (grid) { grid.innerHTML = renderAnimeCards(filterByGenres(sortAnimeList(animeData))); lucide.createIcons(); }
}

function clearGenres() {
    selectedGenres.clear();
    genreSearchQ = '';
    const inp = document.getElementById('genre-search-input');
    if (inp) inp.value = '';
    renderGenreFilterList();
    const grid = document.getElementById('anime-grid');
    if (grid) { grid.innerHTML = renderAnimeCards(sortAnimeList(animeData)); lucide.createIcons(); }
}

function filterGenreSearch(q) {
    genreSearchQ = q.toLowerCase();
    renderGenreFilterList(); // только список, input не трогаем
}

function toggleGenrePanel() {
    genreFilterOpen = !genreFilterOpen;
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
        headerEl.innerHTML = `<span class="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Метки</span>
            ${selectedGenres.size ? `<button onclick="clearGenres()" class="text-xs text-airbnb hover:underline">Сбросить (${selectedGenres.size})</button>` : ''}`;
    }

    listEl.innerHTML = `
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-6">
            ${top.map(buildGenreRow).join('')}
        </div>
        ${rest.length ? `<details class="mt-2">
            <summary class="text-xs text-airbnb cursor-pointer select-none py-1 list-none hover:underline">Показать ещё ${rest.length}...</summary>
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
        container.innerHTML = `<p class="text-sm text-gray-400 py-1 px-1">Загрузка жанров...</p>`;
        return;
    }

    // Строим скелет один раз — input живёт постоянно
    if (!document.getElementById('genre-filter-list')) {
        container.innerHTML = `
            <div id="genre-filter-header" class="flex items-center justify-between mb-3"></div>
            <div id="genre-filter-list"></div>
            <div class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                <input type="text" id="genre-search-input" placeholder="Найти другие метки"
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
        return `
        <div class="cursor-pointer group" onclick="watchAnime(${anime.id})">
            <div class="relative aspect-[3/4] overflow-hidden rounded-xl mb-3 bg-gray-100 dark:bg-gray-800">
                <img src="${anime.image}"
                     alt="${escapeHtml(anime.displayTitle)}"
                     class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                     loading="lazy">
                <div class="absolute top-3 left-3 flex flex-wrap gap-2">
                    ${anime.tags.slice(0, 1).map(tag => `<span class="px-2 py-1 bg-white/90 dark:bg-black/70 backdrop-blur-sm text-[11px] font-semibold rounded-md">${escapeHtml(currentLang === 'ru' ? translateGenre(tag) : tag)}</span>`).join('')}
                </div>
                <button onclick="event.stopPropagation(); toggleFavorite(${anime.id})"
                        data-fav-id="${anime.id}"
                        title="${fav ? t('remove_from_fav') : t('add_to_fav')}"
                        class="heart-btn absolute top-3 right-3 p-1.5 rounded-full bg-white/90 dark:bg-black/70 backdrop-blur-sm">
                    <i data-lucide="heart" class="w-4 h-4 ${fav ? 'fill-current text-airbnb' : 'text-gray-500 dark:text-gray-400'}"></i>
                </button>
            </div>
            <div class="flex justify-between items-start gap-2">
                <div>
                    <h3 class="font-medium text-gray-900 dark:text-white line-clamp-1">${escapeHtml(anime.displayTitle)}</h3>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">${t('episodes_count', anime.episodes || '?')}</p>
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
        console.error('Recommendation error:', error);
        recommendedAnime = [];
    } finally {
        if (recommendationToken === latestRecommendationToken) {
            renderRecommendations();
            lucide.createIcons();
        }
    }
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

    const sourceLabel = currentCatalogMode === 'search' ? t('source_search') : t('source_top');

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
            if (currentSection !== 'home') return;
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
    let endpoint;
    if (query) {
        endpoint = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&page=${page}&limit=${PAGE_SIZE}`;
        if (orderBy) endpoint += `&order_by=${orderBy}&sort=asc`;
    } else if (orderBy && orderBy !== 'score') {
        endpoint = `https://api.jikan.moe/v4/anime?page=${page}&limit=${PAGE_SIZE}&order_by=${orderBy}&sort=asc`;
    } else {
        endpoint = `https://api.jikan.moe/v4/top/anime?page=${page}&limit=${PAGE_SIZE}`;
    }

    const response = await fetch(endpoint, signal ? { signal } : undefined);
    const data = await response.json();
    return {
        items: (data.data || []).map(normalizeAnimeItem),
        hasNextPage: Boolean(data.pagination?.has_next_page)
    };
}

async function fetchTopAnime({ page = 1, append = false } = {}) {
    if (currentSearchController) {
        currentSearchController.abort();
        currentSearchController = null;
    }

    const requestToken = ++latestSearchToken;
    currentSearchController = new AbortController();

    if (!append) setCatalogLoadingState(true);

    const orderBy = currentSortMode === 'title' ? 'title' : '';

    try {
        const result = await fetchAnimePage({
            page,
            signal: currentSearchController.signal,
            orderBy
        });

        if (requestToken !== latestSearchToken) return;

        currentCatalogMode = 'top';
        currentCatalogQuery = '';
        currentCatalogPage = page;
        hasMoreAnime = result.hasNextPage;
        recommendedAnime = [];
        animeData = append ? mergeAnimeResults(animeData, result.items) : result.items;
    } catch (error) {
        if (error.name === 'AbortError') return;
        console.error('Error fetching top anime:', error);
    } finally {
        if (requestToken === latestSearchToken) {
            currentSearchController = null;
            isLoadingMore = false;
            setCatalogLoadingState(false);
            if (currentSection === 'home') renderCatalog();
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
        currentCatalogQuery = '';
        currentCatalogPage = 1;
        hasMoreAnime = true;
        recommendedAnime = [];
        if (subtitle) subtitle.innerText = t('popular_now');
        isSearching = false;
        setCatalogLoadingState(false);
        fetchTopAnime({ page: 1, append: false });
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

    isSearching = true;
    if (subtitle) subtitle.innerText = t('searching_label', query);
    setCatalogLoadingState(true);

    if (scrollToResults) scrollToCatalogIfNeeded();

    const searchToken = ++latestSearchToken;
    currentSearchController = new AbortController();

    try {
        const orderBy = currentSortMode === 'title' ? 'title' : currentSortMode === 'rating' ? 'score' : '';
        const result = await fetchAnimePage({
            query,
            page: 1,
            signal: currentSearchController.signal,
            orderBy
        });
        if (searchToken !== latestSearchToken) return;

        animeData = result.items;
        currentCatalogMode = 'search';
        currentCatalogQuery = query;
        currentCatalogPage = 1;
        hasMoreAnime = result.hasNextPage;
        if (subtitle) subtitle.innerText = query ? t('search_results_label', query) : t('popular_now');
        fetchRecommendations(result.items);
    } catch (error) {
        if (error.name === 'AbortError') return;
        console.error('Search error:', error);
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
            const result = await fetchAnimePage({
                query: currentCatalogQuery, page: nextPage,
                signal: currentSearchController.signal, orderBy
            });
            if (requestToken !== latestSearchToken) return;
            animeData = mergeAnimeResults(animeData, result.items);
            currentCatalogPage = nextPage;
            hasMoreAnime = result.hasNextPage;
        } catch (error) {
            if (error.name !== 'AbortError') console.error('Load more search error:', error);
        } finally {
            if (requestToken === latestSearchToken) {
                currentSearchController = null;
                isLoadingMore = false;
                renderCatalog();
            }
        }
        return;
    }

    fetchTopAnime({ page: nextPage, append: true });
}

function triggerSearch(source = '') {
    clearTimeout(searchTimeout);
    if (currentSection !== 'home') showSection('home', { preserveScroll: true });
    handleSearch({ scrollToResults: true, source });
}

// Live search listeners
const bigSearchInput = document.getElementById('big-search-input');
if (bigSearchInput) {
    bigSearchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        syncSearchInputs(bigSearchInput.value, 'big');
        searchTimeout = setTimeout(() => handleSearch({ source: 'big' }), 350);
    });
}

const navSearchInput = document.getElementById('nav-search-input');
if (navSearchInput) {
    navSearchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        syncSearchInputs(navSearchInput.value, 'nav');
        searchTimeout = setTimeout(() => handleSearch({ source: 'nav' }), 350);
    });
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (document.activeElement.id === 'big-search-input' || document.activeElement.id === 'nav-search-input')) {
        clearTimeout(searchTimeout);
        e.preventDefault();
        handleSearch({
            scrollToResults: true,
            source: document.activeElement.id === 'nav-search-input' ? 'nav' : 'big'
        });
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
        const response = await fetch(`https://api.jikan.moe/v4/anime/${anime.malId}/episodes`);
        const data = await response.json();
        if (data.data) {
            anime.episodesList = data.data.map(ep => ep.title || `Серия ${ep.mal_id}`);
        }
    } catch (error) {
        anime.episodesList = Array.from({ length: anime.episodes }, (_, i) => `Серия ${i + 1}`);
    }
}

// ─── Navigation ───────────────────────────────────────────────────────────────

function stopActivePlayer() {
    const viewport = document.getElementById('player-viewport');
    if (viewport) viewport.innerHTML = '';
}

function showSection(sectionId, { preserveScroll = false } = {}) {
    if (sectionId === 'admin') { openAdminModal(); return; }
    // Stop video/audio when leaving the watch section
    if (currentSection === 'watch' && sectionId !== 'watch') stopActivePlayer();
    if (sectionId !== 'watch') clearAnimeUrl();

    document.querySelectorAll('main > section').forEach(s => s.classList.add('hidden'));

    const targetSection = sectionId === 'catalog' ? 'home' : sectionId;
    const sectionEl = document.getElementById(`${targetSection}-section`);
    if (sectionEl) sectionEl.classList.remove('hidden');

    currentSection = targetSection;
    updateMobileNavActive(sectionId);

    if (sectionId === 'catalog') {
        setTimeout(() => {
            const target = document.getElementById('catalog-subtitle') || document.getElementById('catalog-container');
            if (target) {
                const y = target.getBoundingClientRect().top + window.scrollY - 90;
                window.scrollTo({ top: y, behavior: 'smooth' });
            }
        }, 30);
    } else if (!preserveScroll) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    if (targetSection === 'home') {
        if (animeData.length === 0) fetchTopAnime();
        renderCatalog();
        window.dispatchEvent(new Event('scroll'));
    }
    if (targetSection === 'watch') {
        window.dispatchEvent(new Event('scroll'));
    }
}

function renderCatalog() {
    const grid = document.getElementById('anime-grid');
    if (!grid) return;
    renderGenreFilter();
    grid.innerHTML = renderAnimeCards(filterByGenres(sortAnimeList(animeData)));
    updateCatalogMeta();
    renderRecommendations();
    lucide.createIcons();
    setCatalogLoadingState(isSearching);
    renderCatalogActions();
}

// ─── Watch ────────────────────────────────────────────────────────────────────

async function watchAnime(id) {
    const token = ++watchToken;
    currentAnime = findAnimeById(id);
    if (!currentAnime) return;
    currentEpisodeNum = 1;
    currentServerIndex = 0;
    currentPlayerVoiceIdx = 0;
    currentKodikTranslations = [];
    currentKodikTranslationIdx = 0;
    clearTimeout(window._playerErrorTimer);
    showSection('watch');
    updateAnimeUrl(currentAnime.malId);

    await Promise.all([
        fetchEpisodes(currentAnime),
        fetchAnilistId(currentAnime.malId).then(aid => { if (aid && token === watchToken) currentAnime.anilistId = aid; }),
        fetchKodikData(currentAnime.malId).then(d => {
            if (token !== watchToken) return;
            currentKodikTranslations = d.translations;
            currentKodikEpisodeNums = d.episodes;
        })
    ]);

    if (token !== watchToken) return;
    renderPlayerUI(currentAnime);

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
        <div class="space-y-8">
            <div class="relative overflow-hidden rounded-[2rem] min-h-[200px] md:min-h-[320px] border-subtle card-shadow">
                <img src="${anime.image}" alt="${escapeHtml(anime.displayTitle)}" class="absolute inset-0 w-full h-full object-cover scale-105">
                <div class="absolute inset-0 bg-gradient-to-r from-black via-black/75 to-black/35"></div>
                <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                <div class="relative z-10 h-full p-5 md:p-10 flex flex-col md:flex-row items-start md:items-end justify-between gap-4 md:gap-8 min-h-[200px] md:min-h-[320px]">
                    <div class="max-w-2xl space-y-5">
                        <div class="flex flex-wrap gap-2">
                            <span class="px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-white text-sm font-semibold">${t('rating_badge', anime.rating || 'N/A')}</span>
                            <span class="px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-white text-sm font-semibold">${t('ep_badge', anime.episodes || '?')}</span>
                            <span class="px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-white text-sm font-semibold">${anime.status}</span>
                            ${anime.year ? `<span class="px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-white text-sm font-semibold">${anime.year}</span>` : ''}
                            <button onclick="toggleFavorite(${anime.id})" data-fav-id="${anime.id}"
                                class="heart-btn px-3 py-1 rounded-full backdrop-blur-md text-sm font-semibold flex items-center gap-1.5 transition-colors ${fav ? 'bg-airbnb/90 text-white' : 'bg-white/15 text-white hover:bg-white/25'}">
                                <i data-lucide="heart" class="w-3.5 h-3.5 ${fav ? 'fill-current' : ''}"></i>
                                ${fav ? t('in_favorites') : t('to_favorites')}
                            </button>
                        </div>
                        <div>
                            <h2 class="text-2xl md:text-5xl font-bold tracking-tight text-white">${escapeHtml(anime.displayTitle)}</h2>
                            <p id="anime-synopsis" class="text-white/80 text-sm md:text-base mt-2 md:mt-3 max-w-2xl line-clamp-3 md:line-clamp-none">${currentLang === 'ru' && synopsisCache[anime.id] ? synopsisCache[anime.id] : (anime.synopsisEn || anime.synopsis)}</p>
                        </div>
                        <div class="flex flex-wrap gap-2">
                            ${anime.tags.slice(0, 4).map(tag => `<span class="px-3 py-1 rounded-full bg-airbnb/90 text-white text-xs font-bold tracking-wide">${escapeHtml(currentLang === 'ru' ? translateGenre(tag) : tag)}</span>`).join('')}
                        </div>
                    </div>
                    <div class="hidden md:block w-44 shrink-0">
                        <div class="aspect-[3/4] overflow-hidden rounded-2xl ring-1 ring-white/15 shadow-2xl">
                            <img src="${anime.image}" alt="${escapeHtml(anime.displayTitle)}" class="w-full h-full object-cover">
                        </div>
                    </div>
                </div>
            </div>

            <div class="space-y-4">
                ${(() => {
                    const player = AUTO_SERVERS[currentServerIndex];
                    const isKodik = player.type === 'kodik';
                    const showDropdowns = !player.builtinSelection;
                    const epNums = currentKodikEpisodeNums.length
                        ? currentKodikEpisodeNums
                        : Array.from({ length: anime.episodes || 1 }, (_, i) => i + 1);
                    const selectCls = 'px-3 py-2 rounded-xl border border-subtle bg-white dark:bg-[#1e1e1e] text-sm font-semibold text-gray-900 dark:text-white outline-none focus:border-airbnb cursor-pointer transition-colors';
                    return `
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <h2 class="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">${t('watching')}</h2>
                    <div id="player-dropdowns" class="flex flex-wrap gap-2 items-center${showDropdowns ? '' : ' hidden'}">
                        ${isKodik && currentKodikTranslations.length > 1 ? `
                        <select id="kodik-voice-select" onchange="selectVoice(+this.value)" class="${selectCls}">
                            ${currentKodikTranslations.map((tr, i) =>
                                `<option value="${i}" ${i === currentKodikTranslationIdx ? 'selected' : ''}>${escapeHtml(tr.title)}</option>`
                            ).join('')}
                        </select>` : ''}
                        <select id="episode-select" onchange="selectEpisode(+this.value)" class="${selectCls}">
                            ${epNums.map(n =>
                                `<option value="${n}" ${n === currentEpisodeNum ? 'selected' : ''}>${t('episode_select', n)}</option>`
                            ).join('')}
                        </select>
                    </div>
                </div>`;
                })()}

                <div class="w-full aspect-video bg-black rounded-2xl overflow-hidden card-shadow">
                    <div id="player-viewport" class="w-full h-full">
                        ${renderCurrentPlayer()}
                    </div>
                </div>

                <div class="border-subtle p-3 rounded-2xl bg-white dark:bg-[#1e1e1e] flex flex-wrap gap-2 items-center">
                    ${AUTO_SERVERS.map((s, i) => `
                        <button id="srv-btn-${i}" onclick="setServer(${i})"
                            class="${i === currentServerIndex ? 'px-4 py-2 bg-airbnb text-white' : 'px-4 py-2 bg-gray-100 dark:bg-[#2a2a2a] text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#333]'} rounded-xl font-bold text-xs transition-colors">
                            ${escapeHtml(s.name)}
                        </button>
                    `).join('')}
                    <a id="open-in-browser" href="#" target="_blank" rel="noopener"
                        class="ml-auto px-4 py-2 border border-subtle text-gray-500 dark:text-gray-400 hover:text-airbnb rounded-xl font-bold text-xs transition-colors flex items-center gap-1.5">
                        <i data-lucide="external-link" class="w-3 h-3"></i>
                        ${t('open_in_browser')}
                    </a>
                </div>
            </div>

            <div id="player-comments-wrapper" class="border-subtle p-6 md:p-8 rounded-[2rem] bg-[#fafafa] dark:bg-[#171717]">
                ${renderCommentsSection(anime)}
            </div>
        </div>
    `;
    lucide.createIcons();
    setupVideoListeners();
    if (AUTO_SERVERS[currentServerIndex]?.type === 'kodik') initKodikPlayer();
}

// ─── Player helpers ───────────────────────────────────────────────────────────

function renderCurrentPlayer() {
    const player = AUTO_SERVERS[currentServerIndex] || AUTO_SERVERS[0];
    if (player.type === 'kodik') {
        if (!currentKodikTranslations.length) {
            // Нет озвучки в Kodik — используем find-player как запасной вариант
            return buildIframe(buildKodikFindPlayerUrl(currentAnime.malId, currentEpisodeNum, null));
        }
        // Прямая ссылка на embed Kodik (как в оригинале — работает)
        return buildIframe(currentKodikTranslations[currentKodikTranslationIdx].link);
    }
    return buildIframe(player.url(currentAnime.malId, currentEpisodeNum));
}

// ─── Kodik direct video extraction (ad-free) ──────────────────────────────────

function parseKodikLink(link) {
    const url = link.startsWith('//') ? 'https:' + link : link;
    const m = url.match(/kodikplayer\.com\/(seria|serial|video|anime-serial|anime)\/(\d+)\/([a-zA-Z0-9]+)\//i);
    return m ? { type: m[1], id: m[2], hash: m[3] } : null;
}

function decodeKodikUrl(encoded) {
    // Method 1: atob(encoded) is reversed URL
    try {
        const v = atob(encoded).split('').reverse().join('');
        if (/\/\/.+\.(m3u8|mp4)/.test(v)) return v.startsWith('//') ? 'https:' + v : v;
    } catch (_) {}
    // Method 2: encoded is reversed base64 string
    try {
        const v = atob(encoded.split('').reverse().join(''));
        if (/\/\/.+\.(m3u8|mp4)/.test(v)) return v.startsWith('//') ? 'https:' + v : v;
    } catch (_) {}
    return null;
}

async function getKodikDirectUrl(link) {
    const params = parseKodikLink(link);
    if (!params) return null;
    try {
        const body = new URLSearchParams({
            ...params,
            token: KODIK_TOKEN,
            d: location.hostname || 'localhost',
            pd: location.hostname || 'localhost',
            ref: location.href,
        });
        const res = await fetch('https://kodik.info/gvi', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body
        });
        if (!res.ok) return null;
        const data = await res.json();
        for (const q of ['720p', '480p', '360p', '1080p']) {
            const src = data.links?.[q]?.[0]?.src;
            if (src) return decodeKodikUrl(src);
        }
    } catch (_) {}
    return null;
}

function buildHlsPlayer(src) {
    return `<video id="kodik-video" class="w-full h-full bg-black" controls autoplay playsinline></video>`;
}

function buildKodikFindPlayerUrl(malId, ep, translationId) {
    let url = `https://kodik.info/find-player?token=${KODIK_TOKEN}&shikimori_id=${malId}&with_episodes=true&episode=${ep}`;
    if (translationId) url += `&translation_id=${translationId}`;
    return url;
}

function initKodikPlayer() {
    // Логика переехала в renderCurrentPlayer — прямой iframe без async
}

function buildIframe(src) {
    return `
    <div class="w-full h-full bg-black relative">
        <!-- Сообщение при сбое (показывается через 8 сек если iframe не загрузился) -->
        <div id="player-error" class="absolute inset-0 z-10 hidden flex-col items-center justify-center gap-4 bg-[#0e0e0e] text-white text-center px-6">
            <i data-lucide="wifi-off" class="w-10 h-10 text-gray-500"></i>
            <p class="font-semibold">${t('player_error_title')}</p>
            <p class="text-sm text-gray-400">${t('player_error_sub')}</p>
            <div class="flex gap-3 flex-wrap justify-center mt-2">
                <button onclick="nextServer()" class="px-4 py-2 bg-airbnb text-white rounded-xl text-sm font-semibold hover:bg-airbnbDark transition-colors">
                    ${t('next_server')}
                </button>
                <a href="${src}" target="_blank" rel="noopener" class="px-4 py-2 bg-white/10 text-white rounded-xl text-sm font-semibold hover:bg-white/20 transition-colors">
                    ${t('open_browser_btn')}
                </a>
            </div>
        </div>
        <iframe id="anime-iframe"
            src="${src}"
            class="w-full h-full border-0"
            allowfullscreen
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            onload="onIframeLoad(this)"
            onerror="showPlayerError()">
        </iframe>
    </div>`;
}

function onIframeLoad(iframe) {
    clearTimeout(window._playerErrorTimer);
}

function showPlayerError() {
    clearTimeout(window._playerErrorTimer);
    const el = document.getElementById('player-error');
    if (el) { el.classList.remove('hidden'); el.classList.add('flex'); lucide.createIcons(); }
}

// Переключиться на следующий плеер
function nextServer() {
    setServer((currentServerIndex + 1) % AUTO_SERVERS.length);
}

function setServer(idx) {
    clearTimeout(window._playerErrorTimer);
    currentServerIndex = idx;
    currentPlayerVoiceIdx = 0;
    const viewport = document.getElementById('player-viewport');
    if (viewport) viewport.innerHTML = renderCurrentPlayer();
    updateServerButtons();
    lucide.createIcons();
    if (AUTO_SERVERS[idx]?.type === 'kodik') initKodikPlayer();
}

function updateServerButtons() {
    AUTO_SERVERS.forEach((s, i) => {
        const btn = document.getElementById(`srv-btn-${i}`);
        if (!btn) return;
        btn.className = i === currentServerIndex
            ? 'px-4 py-2 bg-airbnb text-white rounded-xl font-bold text-xs transition-colors'
            : 'px-4 py-2 bg-gray-100 dark:bg-[#2a2a2a] text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#333] rounded-xl font-bold text-xs transition-colors';
    });
    // Показываем/скрываем дропдауны
    const player = AUTO_SERVERS[currentServerIndex] || AUTO_SERVERS[0];
    const dropdowns = document.getElementById('player-dropdowns');
    if (dropdowns) dropdowns.classList.toggle('hidden', !!player.builtinSelection);
    // Обновляем "В браузере"
    const openBtn = document.getElementById('open-in-browser');
    if (openBtn && currentAnime) {
        if (player.type === 'kodik' && currentKodikTranslations.length) {
            openBtn.href = currentKodikTranslations[currentKodikTranslationIdx].link;
        } else if (player.url) {
            openBtn.href = player.url(currentAnime.malId, currentEpisodeNum);
        }
    }
}

function selectEpisode(num) {
    clearTimeout(window._playerErrorTimer);
    currentEpisodeNum = num;
    const viewport = document.getElementById('player-viewport');
    if (viewport) viewport.innerHTML = renderCurrentPlayer();
    updateServerButtons();
    lucide.createIcons();
    if (AUTO_SERVERS[currentServerIndex]?.type === 'kodik') initKodikPlayer();
}

function selectVoice(idx) {
    clearTimeout(window._playerErrorTimer);
    currentKodikTranslationIdx = idx;
    const viewport = document.getElementById('player-viewport');
    if (viewport) viewport.innerHTML = renderCurrentPlayer();
    updateServerButtons();
    initKodikPlayer();
}

function selectPlayerVoice(idx) {
    clearTimeout(window._playerErrorTimer);
    currentPlayerVoiceIdx = idx;
    const viewport = document.getElementById('player-viewport');
    if (viewport) viewport.innerHTML = renderCurrentPlayer();
    updateServerButtons();
}

// Фиксируем взаимодействие пользователя с iframe-областью
document.addEventListener('click', (e) => {
    if (e.target.closest('#player-viewport')) window._playerInteracted = true;
});

function setupVideoListeners() {}


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
    const navIds = { home: 'mob-nav-home', catalog: 'mob-nav-catalog' };
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
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    switchAdminTab('stats');
    renderAdminStats();
    const langInfo = document.getElementById('admin-lang-info');
    if (langInfo) {
        langInfo.textContent = TRANSLATE_TO
            ? `Синопсисы переводятся на "${TRANSLATE_TO}" (выбранный язык)`
            : 'Синопсисы на английском (язык: EN)';
    }
    lucide.createIcons();
}

function closeAdminModal() {
    document.getElementById('admin-panel-modal')?.classList.add('hidden');
    document.body.style.overflow = '';
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
        <h4 class="font-bold text-gray-900 dark:text-white mb-4">Статистика сайта</h4>
        <div class="grid grid-cols-2 gap-3 mb-3">
            <div class="bg-gray-50 dark:bg-[#2a2a2a] rounded-2xl p-4 text-center">
                <p class="text-3xl font-bold text-airbnb">${totalComments}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Комментариев</p>
            </div>
            <div class="bg-gray-50 dark:bg-[#2a2a2a] rounded-2xl p-4 text-center">
                <p class="text-3xl font-bold text-airbnb">${commentedAnime}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Аниме с отзывами</p>
            </div>
            <div class="bg-gray-50 dark:bg-[#2a2a2a] rounded-2xl p-4 text-center">
                <p class="text-3xl font-bold text-airbnb">${users}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Пользователей</p>
            </div>
        </div>
        <div class="bg-gray-50 dark:bg-[#2a2a2a] rounded-2xl p-4 flex items-center justify-between">
            <div>
                <p class="text-sm font-semibold text-gray-700 dark:text-gray-300">Аниме в кэше</p>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Загружено из MyAnimeList</p>
            </div>
            <p class="text-2xl font-bold text-airbnb">${animeData.length}</p>
        </div>
    `;
}

function adminClearComments() {
    if (!confirm('Удалить все комментарии? Действие необратимо.')) return;
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith('anime_comments_')) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
    showAdminDataStatus('Все комментарии удалены.');
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
            showAdminDataStatus('Данные успешно импортированы.');
        } catch (_) {
            showAdminDataStatus('Ошибка: неверный формат файла.');
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
    if (USE_HASH) {
        history.pushState({ animeId: malId }, '', '#' + padded);
    } else {
        history.pushState({ animeId: malId }, '', '/' + padded);
    }
    document.title = currentAnime ? `${currentAnime.displayTitle} — AnyRainy` : 'AnyRainy';
}

function clearAnimeUrl() {
    if (USE_HASH) {
        if (location.hash) history.pushState({}, '', location.pathname);
    } else {
        if (location.pathname !== '/') history.pushState({}, '', '/');
    }
    document.title = 'AnyRainy';
}

function getRouteAnimeId() {
    if (USE_HASH) {
        const hash = location.hash.replace('#', '');
        return /^\d+$/.test(hash) ? parseInt(hash, 10) : null;
    } else {
        const path = location.pathname.replace(/^\//, '');
        return /^\d+$/.test(path) ? parseInt(path, 10) : null;
    }
}

async function fetchAndWatchByMalId(malId) {
    const existing = findAnimeById(malId);
    if (existing) { await watchAnime(malId); return; }

    showSection('watch');
    const container = document.getElementById('player-container');
    if (container) container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-64 gap-4">
            <div class="w-10 h-10 border-4 border-airbnb border-t-transparent rounded-full animate-spin"></div>
            <p class="text-sm text-gray-500 dark:text-gray-400">${t('anime_loading')}</p>
        </div>`;

    try {
        const res = await fetch(`https://api.jikan.moe/v4/anime/${malId}`);
        const data = await res.json();
        if (!data.data) { showSection('home'); clearAnimeUrl(); return; }
        const anime = normalizeAnimeItem(data.data);
        if (!animeData.find(a => a.id === anime.id)) animeData.push(anime);
        await watchAnime(malId);
    } catch (_) {
        showSection('home');
        clearAnimeUrl();
    }
}

// Кнопки назад/вперёд в браузере
window.addEventListener('popstate', () => {
    const malId = getRouteAnimeId();
    if (malId) {
        fetchAndWatchByMalId(malId);
    } else {
        currentAnime = null;
        showSection('home');
    }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

loadSession();
updateAuthUI();
switchAuthMode('login');
updateLangToggle();
renderTranslations();
setupInfiniteCatalogLoading();

// Проверяем URL при загрузке страницы
(async () => {
    const malId = getRouteAnimeId();
    if (malId) {
        // Ждём начальной загрузки данных, потом открываем аниме
        showSection('home');
        await new Promise(r => setTimeout(r, 100));
        await fetchAndWatchByMalId(malId);
    } else {
        showSection('home');
    }
})();
