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
let genreFilterMode = 'all'; // 'all' | 'any'
let commentReplyTo = null;
let currentProfileUsername = null;
let currentCatalogQueryTranslated = '';

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
        if (currentLang === 'ru') enrichWithShikimoriTitles([currentAnime]).then(() => {
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
    if (currentLang === 'ru') enrichWithShikimoriTitles(favorites);
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

    // Секретный обход для тестирования
    if (email === 'dota5989') {
        if (errorEl) errorEl.classList.add('hidden');
        emailVerifyCode = '123123';
        emailVerifyTarget = 'dota5989';
        emailVerifyExpiry = Date.now() + 60 * 60 * 1000;
        emailVerified = false;
        document.getElementById('email-code-row')?.classList.remove('hidden');
        document.getElementById('auth-email-code')?.focus();
        if (btn) { btn.textContent = t('verify_btn'); btn.disabled = false; }
        return;
    }

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
            <div class="rounded-2xl border border-subtle p-4 bg-white dark:bg-[#1e1e1e]">
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
    if (wrapper && currentAnime) { wrapper.innerHTML = renderCommentsSection(currentAnime); lucide.createIcons(); }
}

function submitComment(event) {
    event.preventDefault();
    if (!currentUser || !currentAnime) { openAuthModal('login'); return; }
    const input = document.getElementById('comment-input');
    const text = input?.value.trim() || '';
    if (text.length < 2) { alert(t('comment_too_short')); return; }
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
        <div class="flex flex-col sm:flex-row items-center sm:items-start gap-6">
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
        <div class="bg-white dark:bg-[#1e1e1e] rounded-2xl border border-subtle p-5 space-y-4">
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
        <div class="bg-white dark:bg-[#1e1e1e] rounded-2xl border border-subtle p-5 space-y-4">
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
        <div class="space-y-4">
            <h3 class="text-xl font-bold text-gray-900 dark:text-white">${t('favorites_title')} <span class="text-sm font-normal text-gray-500">${favorites.length}</span></h3>
            ${favorites.length
                ? `<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">${renderAnimeCards(favorites)}</div>`
                : `<p class="text-sm text-gray-500 dark:text-gray-400">${t('no_favorites')}</p>`}
        </div>` : `
        <div class="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500 py-2">
            <i data-lucide="lock" class="w-4 h-4"></i>${t('profile_favorites_hidden')}
        </div>`}

        <div class="space-y-4">
            <h3 class="text-xl font-bold text-gray-900 dark:text-white">${t('profile_comments_title')} <span class="text-sm font-normal text-gray-500">${userComments.length}</span></h3>
            ${userComments.length ? `<div class="space-y-3">
                ${userComments.map(c => `
                <div class="rounded-2xl border border-subtle p-4 bg-white dark:bg-[#1e1e1e]">
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
    if (currentLang === 'ru' && favorites && favorites.length) enrichWithShikimoriTitles(favorites);
}

function showProfilePage(username) {
    if (currentSection === 'watch') stopActivePlayer();
    document.querySelectorAll('main > section').forEach(s => s.classList.add('hidden'));
    document.getElementById('profile-section')?.classList.remove('hidden');
    currentSection = 'profile';
    currentProfileUsername = username || null;
    const urlHash = username ? `#profile/${encodeURIComponent(username)}` : '#profile';
    history.pushState({ profileUser: username }, '', urlHash);
    document.title = 'AnyRainy — Профиль';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    updateMobileNavActive('profile');
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
let currentPlayerVoiceIdx = 0;
let watchToken = 0;

// Direct player state
let kodikHls = null;
let kodikKeyListener = null;
let kodikPlayerToken = 0;
const kodikEpCache = {}; // `${malId}_${translationId}_${ep}` → link | 'ERROR'

let libriaHls = null;
let libriaGlContext = null;
let libriaRafId = null;
let libriaKeyListener = null;
let libriaPlayerToken = 0;
const anilibriaCache = {}; // malId → title object | null

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

// Получить ссылку конкретного эпизода из Kodik (с кешированием)
async function fetchKodikEpisodeLink(malId, translationId, ep) {
    const key = `${malId}_${translationId}_${ep}`;
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

        // Ищем эпизод в seasons
        // epData может быть строкой (прямая ссылка) или объектом {link: ...}
        for (const season of Object.values(r.seasons || {})) {
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
    { name: '4K',          type: 'libria', builtinSelection: false },
    { name: 'Kodik RU',    type: 'kodik',  builtinSelection: false },
    { name: 'Megaplay',    type: 'auto',   builtinSelection: false,
      url: (malId, ep) => `https://megaplay.buzz/stream/mal/${malId}/${ep}/sub` },
    { name: 'Megaplay DUB', type: 'auto', builtinSelection: false,
      url: (malId, ep) => `https://megaplay.buzz/stream/mal/${malId}/${ep}/dub` },
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
        rating: item.score || 0,
        episodes: item.episodes || 12,
        image: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || '',
        synopsis: rawSynopsis,
        synopsisEn: rawSynopsis,
        year: item.year || '',
        season: item.season || '',
        status: item.status || 'Статус неизвестен',
        malId: item.mal_id,
        isAdult,
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

// ─── Russian titles via Shikimori (батч, 1 запрос на страницу) ───────────────

const SHIKIMORI_BASE = 'https://shikimori.one';

function getCachedRuTitle(malId) {
    return localStorage.getItem(`anyrainy_title_ru_${malId}`) || null;
}
function setCachedRuTitle(malId, title) {
    localStorage.setItem(`anyrainy_title_ru_${malId}`, title);
}

// Обогащает список аниме русскими названиями через один батч-запрос к Shikimori.
// Для тех, кого нет в Shikimori — fallback через mymemory (как синопсисы).
async function enrichWithShikimoriTitles(items) {
    if (currentLang !== 'ru') return;

    const toEnrich = items.filter(a => {
        if (a.titleRu && /[Ѐ-ӿ]/.test(a.titleRu)) return false;
        if (getCachedRuTitle(a.malId || a.id)) return false;
        return true;
    });
    if (!toEnrich.length) return;

    const ids = [...new Set(toEnrich.map(a => a.malId || a.id).filter(Boolean))];

    // Шаг 1: Один запрос к Shikimori для всех аниме на странице
    const shikiMap = {};
    try {
        const res = await fetch(`${SHIKIMORI_BASE}/api/animes?ids=${ids.join(',')}&limit=50`);
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) {
                data.forEach(item => {
                    if (item.id && item.russian && /[Ѐ-ӿ]/.test(item.russian)) {
                        shikiMap[item.id] = item.russian;
                        setCachedRuTitle(item.id, item.russian);
                    }
                });
            }
        }
    } catch (_) {}

    const stillMissing = [];
    toEnrich.forEach(anime => {
        const malId = anime.malId || anime.id;
        const ruTitle = shikiMap[malId];
        if (ruTitle) {
            anime.titleRu = ruTitle;
            anime.displayTitle = ruTitle;
            document.querySelectorAll(`[data-title-id="${anime.id}"]`).forEach(el => { el.textContent = ruTitle; });
        } else {
            stillMissing.push(anime);
        }
    });

    // Шаг 2: Fallback через mymemory для тех, кого нет в Shikimori (редко)
    if (stillMissing.length) {
        await Promise.allSettled(stillMissing.map(async anime => {
            const malId = anime.malId || anime.id;
            const src = anime.titleEn || anime.title || '';
            if (!src || /[Ѐ-ӿ]/.test(src)) return;
            try {
                const res = await fetch(
                    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(src)}&langpair=en|ru`
                );
                if (!res.ok) return;
                const data = await res.json();
                const tr = data.responseData?.translatedText;
                if (tr && data.responseStatus === 200 && /[Ѐ-ӿ]/.test(tr)) {
                    setCachedRuTitle(malId, tr);
                    anime.titleRu = tr;
                    anime.displayTitle = tr;
                    document.querySelectorAll(`[data-title-id="${anime.id}"]`).forEach(el => { el.textContent = tr; });
                }
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
    if (genreFilterMode === 'any') {
        return items.filter(a => [...selectedGenres].some(g => (a.tags || []).includes(g)));
    }
    return items.filter(a => [...selectedGenres].every(g => (a.tags || []).includes(g)));
}

function setGenreMode(mode) {
    genreFilterMode = mode;
    renderGenreFilterList();
    const grid = document.getElementById('anime-grid');
    if (grid) { grid.innerHTML = renderAnimeCards(filterByGenres(sortAnimeList(animeData))); lucide.createIcons(); }
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
        <div class="cursor-pointer group" onclick="watchAnime(${anime.id})">
            <div class="relative aspect-[3/4] overflow-hidden rounded-xl mb-3 bg-gray-100 dark:bg-gray-800">
                <img src="${anime.image}"
                     alt="${escapeHtml(title)}"
                     class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                     loading="lazy">
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
                <div>
                    <h3 class="font-medium text-gray-900 dark:text-white line-clamp-1" data-title-id="${anime.id}">${escapeHtml(title)}</h3>
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

// ─── Russian search translation ───────────────────────────────────────────────

async function translateQueryForSearch(query) {
    if (!query || !/[Ѐ-ӿ]/.test(query)) return null;
    try {
        const res = await fetch(
            `https://api.mymemory.translated.net/get?q=${encodeURIComponent(query)}&langpair=ru|en`,
            { signal: AbortSignal.timeout(3000) }
        );
        if (!res.ok) return null;
        const data = await res.json();
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
        // Translate Russian query to English for Jikan API
        let searchQuery = query;
        if (/[Ѐ-ӿ]/.test(query)) {
            const translated = await translateQueryForSearch(query);
            if (searchToken !== latestSearchToken) return;
            if (translated) { searchQuery = translated; }
        }

        const orderBy = currentSortMode === 'title' ? 'title' : currentSortMode === 'rating' ? 'score' : '';
        const result = await fetchAnimePage({
            query: searchQuery,
            page: 1,
            signal: currentSearchController.signal,
            orderBy
        });
        if (searchToken !== latestSearchToken) return;

        animeData = result.items;
        currentCatalogMode = 'search';
        currentCatalogQuery = query;
        currentCatalogQueryTranslated = searchQuery !== query ? searchQuery : '';
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
            anime.episodesList = data.data.map(ep => ep.title || t('episode_select', ep.mal_id));
        }
    } catch (error) {
        anime.episodesList = Array.from({ length: anime.episodes }, (_, i) => t('episode_select', i + 1));
    }
}

// ─── Navigation ───────────────────────────────────────────────────────────────

function stopActivePlayer() {
    stopLibriaGL();
    if (libriaHls) { libriaHls.destroy(); libriaHls = null; }
    if (kodikHls)  { kodikHls.destroy();  kodikHls  = null; }
    if (kodikKeyListener) { document.removeEventListener('keydown', kodikKeyListener); kodikKeyListener = null; }
    const viewport = document.getElementById('player-viewport');
    if (viewport) viewport.innerHTML = '';
}

function showSection(sectionId, { preserveScroll = false } = {}) {
    if (sectionId === 'admin') { openAdminModal(); return; }
    if (sectionId === 'profile') { showProfilePage(null); return; }
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
    // Асинхронно обогащаем русскими названиями (1 запрос к Shikimori)
    if (currentLang === 'ru') enrichWithShikimoriTitles(animeData);
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
        fetchKodikData(currentAnime.malId).then(d => {
            if (token !== watchToken) return;
            currentKodikTranslations = d.translations;
            currentKodikEpisodeNums = d.episodes;
        })
    ]);

    if (token !== watchToken) return;
    renderPlayerUI(currentAnime);

    // Обогащаем русским названием если нужно
    if (currentLang === 'ru') {
        enrichWithShikimoriTitles([currentAnime]).then(() => {
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
            <!-- Hero — full-bleed, без рамки -->
            <div class="relative overflow-hidden -mx-4 md:-mx-6" style="min-height:300px">
                <img src="${anime.image}" alt="${escapeHtml(anime.displayTitle)}"
                    class="absolute inset-0 w-full h-full object-cover object-center"
                    style="filter:brightness(0.8)">
                <!-- Горизонтальный градиент: слева читабельно, справа открыто -->
                <div class="absolute inset-0" style="background:linear-gradient(to right,rgba(0,0,0,0.88) 0%,rgba(0,0,0,0.55) 50%,rgba(0,0,0,0.15) 100%)"></div>
                <!-- Нижний фейд в фон страницы (CSS-переменная под тему) -->
                <div class="absolute inset-x-0 bottom-0 h-40 page-bg-fade"></div>
                <!-- Контент -->
                <div class="relative z-10 px-4 md:px-8 pt-10 pb-28 md:pb-36 flex items-end" style="min-height:300px">
                    <div class="max-w-3xl space-y-4">
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
                            <h2 class="text-3xl md:text-5xl font-bold tracking-tight text-white leading-tight" data-title-id="${anime.id}">${escapeHtml(anime.displayTitle)}</h2>
                            <p id="anime-synopsis" class="text-white/80 text-sm md:text-base mt-2 md:mt-3 max-w-2xl line-clamp-3 md:line-clamp-4 leading-relaxed">${currentLang === 'ru' && synopsisCache[anime.id] ? synopsisCache[anime.id] : (anime.synopsisEn || anime.synopsis)}</p>
                        </div>
                        <div class="flex flex-wrap gap-2">
                            ${anime.tags.slice(0, 5).map(tag => `<span class="px-3 py-1 rounded-full bg-airbnb/80 backdrop-blur-sm text-white text-xs font-bold tracking-wide">${escapeHtml(currentLang === 'ru' ? translateGenre(tag) : tag)}</span>`).join('')}
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
                    // Голос теперь внутри плеера; над плеером оставляем только если Kodik выбран
                    const voiceHtml = '';
                    return `
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <h2 class="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">${t('watching')}</h2>
                    <div id="player-dropdowns" class="flex flex-wrap gap-2 items-center${showDropdowns ? '' : ' hidden'}">
                        <div id="kodik-voice-wrapper"${!isKodik ? ' class="hidden"' : ''}>
                            ${voiceHtml}
                        </div>
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
    const _initType = AUTO_SERVERS[currentServerIndex]?.type;
    if (_initType === 'kodik')  initKodikPlayer();
    if (_initType === 'libria') initLibriaPlayer();
}

// ─── Player helpers ───────────────────────────────────────────────────────────

function renderCurrentPlayer() {
    const player = AUTO_SERVERS[currentServerIndex] || AUTO_SERVERS[0];
    if (player.type === 'kodik') {
        return buildKodikDirectPlayerShell();
    }
    if (player.type === 'libria') {
        return buildLibriaPlayerShell();
    }
    return buildIframe(player.url(currentAnime.malId, currentEpisodeNum));
}

function showKodikError(noTranslation = false) {
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

function buildKodikDirectPlayerShell() {
    return `
    <div id="kodik-direct-player" class="w-full h-full bg-black relative overflow-hidden" tabindex="0">
        <!-- Загрузка -->
        <div id="kodik-loading" class="absolute inset-0 flex items-center justify-center bg-black z-20">
            <div class="flex flex-col items-center gap-3">
                <div class="w-10 h-10 border-4 border-airbnb border-t-transparent rounded-full animate-spin"></div>
                <p class="text-white/70 text-sm font-medium">${t('player_loading')}</p>
            </div>
        </div>
        <!-- Видео (без нативных контролов) -->
        <video id="kodik-video" class="w-full h-full hidden cursor-pointer" playsinline autoplay></video>
        <!-- Кастомные контролы -->
        <div id="kodik-controls" class="hidden absolute bottom-0 left-0 right-0 z-30"
            style="background:linear-gradient(to top,rgba(0,0,0,0.85) 0%,transparent 100%);padding:10px 12px 8px;">
            <input type="range" id="kodik-seek" min="0" max="100" step="0.1" value="0"
                class="w-full mb-2 cursor-pointer outline-none"
                style="height:4px;accent-color:#FF5A5F;border-radius:2px;">
            <div class="flex items-center gap-3">
                <button id="kodik-play-btn" onclick="toggleKodikPlay()" class="text-white hover:text-airbnb transition-colors">
                    <i data-lucide="pause" class="w-5 h-5"></i>
                </button>
                <span id="kodik-time" class="text-white/80 text-xs font-mono tabular-nums">0:00 / 0:00</span>
                ${currentKodikTranslations.length > 1 ? `
                <select id="kodik-voice-inplayer" onchange="selectVoice(+this.value)"
                    class="bg-black/60 text-white text-xs rounded-md px-1.5 py-0.5 outline-none cursor-pointer border border-white/20 max-w-[130px] truncate">
                    ${currentKodikTranslations.map((tr, i) =>
                        `<option value="${i}" ${i === currentKodikTranslationIdx ? 'selected' : ''} class="bg-black text-white">${escapeHtml(tr.title)}</option>`
                    ).join('')}
                </select>` : currentKodikTranslations.length === 1 ? `
                <span class="text-white/60 text-xs truncate max-w-[100px]">${escapeHtml(currentKodikTranslations[0].title)}</span>` : ''}
                <div class="flex items-center gap-2 ml-auto">
                    <button id="kodik-vol-btn" onclick="toggleKodikMute()" class="text-white hover:text-airbnb transition-colors">
                        <i data-lucide="volume-2" class="w-4 h-4"></i>
                    </button>
                    <input type="range" id="kodik-vol-slider" min="0" max="1" step="0.02" value="1"
                        oninput="setKodikVolume(this.value)"
                        class="w-14 cursor-pointer outline-none"
                        style="height:3px;accent-color:#FF5A5F;border-radius:2px;">
                    <select onchange="setKodikSpeed(this.value)"
                        class="bg-transparent text-white/80 text-xs outline-none cursor-pointer hover:text-white transition-colors appearance-none">
                        <option value="0.5" class="bg-black text-white">0.5×</option>
                        <option value="0.75" class="bg-black text-white">0.75×</option>
                        <option value="1" selected class="bg-black text-white">1×</option>
                        <option value="1.25" class="bg-black text-white">1.25×</option>
                        <option value="1.5" class="bg-black text-white">1.5×</option>
                        <option value="2" class="bg-black text-white">2×</option>
                    </select>
                    <button onclick="toggleKodikFullscreen()" class="text-white hover:text-airbnb transition-colors">
                        <i data-lucide="maximize" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>
        </div>
        <!-- Ошибка / fallback -->
        <div id="kodik-fallback-msg" class="hidden absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#0e0e0e] text-white text-center px-6 z-30">
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
    <div id="libria-player" class="w-full h-full bg-black relative overflow-hidden" tabindex="0">
        <div id="libria-loading" class="absolute inset-0 flex items-center justify-center bg-black z-20">
            <div class="flex flex-col items-center gap-3">
                <div class="w-10 h-10 border-4 border-airbnb border-t-transparent rounded-full animate-spin"></div>
                <p class="text-white/70 text-sm font-medium">${t('player_loading')}</p>
            </div>
        </div>
        <video id="libria-video" playsinline crossorigin="anonymous"
            style="position:absolute;width:1px;height:1px;top:0;left:0;opacity:0;pointer-events:none;"></video>
        <canvas id="libria-canvas" class="w-full h-full hidden cursor-pointer"></canvas>
        <div id="libria-controls" class="hidden absolute bottom-0 left-0 right-0 z-30"
            style="background:linear-gradient(to top,rgba(0,0,0,0.85) 0%,transparent 100%);padding:10px 12px 8px;">
            <input type="range" id="libria-seek" min="0" max="100" step="0.1" value="0"
                class="w-full mb-2 cursor-pointer outline-none" style="height:4px;accent-color:#FF5A5F;border-radius:2px;">
            <div class="flex items-center gap-3">
                <button id="libria-play-btn" onclick="toggleLibriaPlay()" class="text-white hover:text-airbnb transition-colors">
                    <i data-lucide="pause" class="w-5 h-5"></i>
                </button>
                <span id="libria-time" class="text-white/80 text-xs font-mono tabular-nums">0:00 / 0:00</span>
                <div class="flex items-center gap-2 ml-auto">
                    <button id="libria-vol-btn" onclick="toggleLibriaMute()" class="text-white hover:text-airbnb transition-colors">
                        <i data-lucide="volume-2" class="w-4 h-4"></i>
                    </button>
                    <input type="range" id="libria-vol-slider" min="0" max="1" step="0.02" value="1"
                        oninput="setLibriaVolume(this.value)"
                        class="w-14 cursor-pointer outline-none"
                        style="height:3px;accent-color:#FF5A5F;border-radius:2px;">
                    <select onchange="setLibriaSpeed(this.value)"
                        class="bg-transparent text-white/80 text-xs outline-none cursor-pointer hover:text-white transition-colors appearance-none">
                        <option value="0.5" class="bg-black text-white">0.5×</option>
                        <option value="0.75" class="bg-black text-white">0.75×</option>
                        <option value="1" selected class="bg-black text-white">1×</option>
                        <option value="1.25" class="bg-black text-white">1.25×</option>
                        <option value="1.5" class="bg-black text-white">1.5×</option>
                        <option value="2" class="bg-black text-white">2×</option>
                    </select>
                    <button onclick="toggleLibriaFullscreen()" class="text-white hover:text-airbnb transition-colors">
                        <i data-lucide="maximize" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>
        </div>
        <div id="libria-error" class="hidden absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#0e0e0e] text-white text-center px-6 z-40">
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

// Извлечь видео URL из ответа ftor/kor/gvi
function _extractKodikUrl(data) {
    for (const q of ['480','480p','360','360p','720','720p','1080','1080p']) {
        const src = data.links?.[q]?.[0]?.src;
        if (src) { const u = decodeKodikUrl(src); if (u) return u; }
    }
    if (data.src) { const u = decodeKodikUrl(data.src); if (u) return u; }
    return null;
}

// Загрузить HTML embed-страницы (прямой фетч или через прокси)
async function fetchKodikEmbedHtml(embedUrl) {
    if (kodikEmbedHtmlCache[embedUrl]) return kodikEmbedHtmlCache[embedUrl];
    const attempts = [
        async () => {
            const r = await fetch(embedUrl, { signal: AbortSignal.timeout(5000) });
            return r.ok ? r.text() : null;
        },
        async () => {
            const r = await fetch('https://api.allorigins.win/get?url=' + encodeURIComponent(embedUrl), { signal: AbortSignal.timeout(9000) });
            if (!r.ok) return null;
            const j = await r.json(); return j.contents || null;
        },
        async () => {
            const r = await fetch('https://corsproxy.io/?url=' + encodeURIComponent(embedUrl), { signal: AbortSignal.timeout(9000) });
            return r.ok ? r.text() : null;
        },
        async () => {
            const r = await fetch('https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(embedUrl), { signal: AbortSignal.timeout(9000) });
            return r.ok ? r.text() : null;
        },
    ];
    for (const fn of attempts) {
        try {
            const html = await fn();
            if (html && html.length > 200) {
                kodikEmbedHtmlCache[embedUrl] = html;
                return html;
            }
        } catch (_) {}
    }
    return null;
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
    const embedUrl = link.startsWith('//') ? 'https:' + link : link;

    // ── Метод 1: Слепой POST к известным endpoint'ам без HTML ──────────────────
    // Работает на продакшн-домене (CORS разрешён) или через server.js прокси
    const simpleBody = new URLSearchParams({
        hash: ep.hash, id: ep.id, type: ep.type,
        bad_user: 'true', cdn_is_working: 'true',
    });
    for (const endpoint of ['https://kodikplayer.com/ftor', 'https://kodikplayer.com/kor', 'https://kodik.info/ftor']) {
        const u = await _postKodik(endpoint, simpleBody, embedUrl);
        if (u) return u;
    }

    // ── Метод 2: Через локальный прокси server.js ──────────────────────────────
    try {
        const res = await fetch('/kodik-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: simpleBody,
            signal: AbortSignal.timeout(6000),
        });
        if (res.ok) { const t = await res.text(); if (t.startsWith('{')) { const u = _extractKodikUrl(JSON.parse(t)); if (u) return u; } }
    } catch (_) {}

    // ── Методы 3+4: Получаем HTML embed-страницы через прокси ─────────────────
    const html = await fetchKodikEmbedHtml(embedUrl);
    if (!html) return null;

    // Метод 3 (kodikwrapper): динамический endpoint из atob()
    const dynEndpoint = extractKodikPostEndpoint(html);
    if (dynEndpoint) {
        const u = await _postKodik(
            dynEndpoint.startsWith('//') ? 'https:' + dynEndpoint : dynEndpoint,
            simpleBody, embedUrl
        );
        if (u) return u;
    }

    // Метод 4 (старый): urlParams с подписанными параметрами
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
            if (u) return u;
        }
        // Через локальный прокси с подписанными параметрами
        try {
            const res = await fetch('/kodik-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: signedBody,
                signal: AbortSignal.timeout(6000),
            });
            if (res.ok) { const t = await res.text(); if (t.startsWith('{')) { const u = _extractKodikUrl(JSON.parse(t)); if (u) return u; } }
        } catch (_) {}
    }

    return null;
}

function buildKodikFindPlayerUrl(malId, ep, translationId) {
    let url = `https://kodik.info/find-player?token=${KODIK_TOKEN}&shikimori_id=${malId}&with_episodes=true&episode=${ep}`;
    if (translationId) url += `&translation_id=${translationId}`;
    return url;
}

// Заменить качество в ссылке Kodik на 480p (по исследованию: на 480p реклама не показывается)
function toKodik480p(link) {
    return link.replace(/\/(1080p|720p|480p|360p)(\/|$)/, '/480p$2');
}

async function initKodikPlayer() {
    const token = ++kodikPlayerToken;
    const player = AUTO_SERVERS[currentServerIndex];
    if (!player || player.type !== 'kodik') return;

    if (!currentKodikTranslations.length) {
        showKodikError(true);
        return;
    }

    const translation = currentKodikTranslations[currentKodikTranslationIdx];

    const epLink = await fetchKodikEpisodeLink(currentAnime.malId, translation.id, currentEpisodeNum);

    if (token !== kodikPlayerToken) return;
    if (!document.getElementById('kodik-loading')) return;

    if (!epLink) {
        showKodikError();
        return;
    }

    const directUrl = await getKodikDirectUrl(epLink);

    if (token !== kodikPlayerToken) return;
    if (!document.getElementById('kodik-loading')) return;

    if (directUrl) {
        loadKodikVideo(directUrl);
    } else {
        // Прямой URL недоступен → iframe 480p (без рекламы на 480p)
        showKodikIframe(toKodik480p(epLink));
    }
}

function showKodikIframe(url) {
    const viewport = document.getElementById('player-viewport');
    if (!viewport) return;
    if (document.getElementById('kodik-loading')) {
        viewport.innerHTML = buildIframe(url);
    } else {
        const iframe = document.getElementById('anime-iframe');
        if (iframe) { iframe.src = url; return; }
        viewport.innerHTML = buildIframe(url);
    }
    lucide.createIcons();
}

function loadKodikVideo(url) {
    const loadingEl = document.getElementById('kodik-loading');
    const videoEl   = document.getElementById('kodik-video');
    const ctrlEl    = document.getElementById('kodik-controls');
    const playerEl  = document.getElementById('kodik-direct-player');
    if (!videoEl) return;

    if (loadingEl) loadingEl.classList.add('hidden');
    videoEl.classList.remove('hidden');
    if (ctrlEl) ctrlEl.classList.remove('hidden');

    if (kodikHls) { kodikHls.destroy(); kodikHls = null; }

    const isM3u8 = !url.match(/\.(mp4|webm|ogg)(\?|$)/i);

    const onFatal = () => {
        kodikHls?.destroy(); kodikHls = null;
        const tr = currentKodikTranslations[currentKodikTranslationIdx];
        const fb = tr?.link ? toKodik480p(tr.link) : null;
        if (fb) showKodikIframe(fb); else showKodikError();
    };

    if (isM3u8 && Hls.isSupported()) {
        kodikHls = new Hls({ maxBufferLength: 30, startLevel: 0 });
        kodikHls.loadSource(url);
        kodikHls.attachMedia(videoEl);
        kodikHls.once(Hls.Events.MANIFEST_PARSED, () => videoEl.play().catch(() => {}));
        kodikHls.on(Hls.Events.ERROR, (e, d) => { if (d.fatal) onFatal(); });
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl') && isM3u8) {
        videoEl.src = url; videoEl.load(); videoEl.play().catch(() => {});
    } else {
        videoEl.src = url; videoEl.load(); videoEl.play().catch(() => {});
    }

    // Кастомные контролы
    videoEl.addEventListener('timeupdate', updateKodikTime);
    videoEl.addEventListener('play',  () => updateKodikPlayBtn(false));
    videoEl.addEventListener('pause', () => updateKodikPlayBtn(true));

    const seekEl = document.getElementById('kodik-seek');
    if (seekEl) {
        seekEl.addEventListener('input', () => {
            if (videoEl.duration) videoEl.currentTime = (seekEl.value / 100) * videoEl.duration;
        });
    }

    // Клик мышью → play/pause
    videoEl.addEventListener('click', (e) => {
        if (e.pointerType === 'touch') return;
        toggleKodikPlay();
    });

    // Двойное касание мобайл: лево −10с, право +10с
    let _tCount = 0, _tSide = '', _tTimer = null;
    videoEl.addEventListener('touchend', (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        if (!touch) return;
        const rect = videoEl.getBoundingClientRect();
        const side = touch.clientX < rect.left + rect.width / 2 ? 'left' : 'right';
        _tCount++;
        if (_tCount === 1) {
            _tSide = side;
            _tTimer = setTimeout(() => { _tCount = 0; toggleKodikPlay(); }, 280);
        } else if (_tCount >= 2 && _tSide === side) {
            clearTimeout(_tTimer); _tCount = 0;
            const delta = side === 'right' ? 10 : -10;
            videoEl.currentTime = Math.max(0, (videoEl.currentTime || 0) + delta);
            showSeekOverlay(playerEl, side, delta);
        } else {
            clearTimeout(_tTimer); _tCount = 1; _tSide = side;
            _tTimer = setTimeout(() => { _tCount = 0; toggleKodikPlay(); }, 280);
        }
    }, { passive: false });

    // Клавиатура: ← −10с, → +10с, пробел play/pause
    if (kodikKeyListener) { document.removeEventListener('keydown', kodikKeyListener); }
    kodikKeyListener = (e) => {
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
        if (currentSection !== 'watch') return;
        if (AUTO_SERVERS[currentServerIndex]?.type !== 'kodik') return;
        const v = document.getElementById('kodik-video');
        if (!v || v.classList.contains('hidden')) return;
        if (e.key === 'ArrowRight') {
            v.currentTime += 10;
            showSeekOverlay(document.getElementById('kodik-direct-player'), 'right', 10);
            e.preventDefault();
        } else if (e.key === 'ArrowLeft') {
            v.currentTime = Math.max(0, v.currentTime - 10);
            showSeekOverlay(document.getElementById('kodik-direct-player'), 'left', -10);
            e.preventDefault();
        } else if (e.key === ' ') {
            toggleKodikPlay(); e.preventDefault();
        }
    };
    document.addEventListener('keydown', kodikKeyListener);
    lucide.createIcons();
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
    stopLibriaGL();
    if (libriaHls) { libriaHls.destroy(); libriaHls = null; }
    if (kodikHls)  { kodikHls.destroy();  kodikHls  = null; }
    if (kodikKeyListener) { document.removeEventListener('keydown', kodikKeyListener); kodikKeyListener = null; }
    currentServerIndex = idx;
    currentPlayerVoiceIdx = 0;
    const viewport = document.getElementById('player-viewport');
    if (viewport) viewport.innerHTML = renderCurrentPlayer();
    updateServerButtons();
    lucide.createIcons();
    const type = AUTO_SERVERS[idx]?.type;
    if (type === 'kodik')  initKodikPlayer();
    if (type === 'libria') initLibriaPlayer();
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
    const voiceWrapper = document.getElementById('kodik-voice-wrapper');
    if (voiceWrapper) voiceWrapper.classList.toggle('hidden', player.type !== 'kodik');
    // Обновляем "В браузере"
    const openBtn = document.getElementById('open-in-browser');
    if (openBtn && currentAnime) {
        if (player.type === 'kodik' && currentKodikTranslations.length) {
            openBtn.href = currentKodikTranslations[currentKodikTranslationIdx].link;
        } else if (player.type === 'libria') {
            openBtn.href = 'https://www.anilibria.tv/';
        } else if (player.url) {
            openBtn.href = player.url(currentAnime.malId, currentEpisodeNum);
        }
    }
}

function selectEpisode(num) {
    clearTimeout(window._playerErrorTimer);
    stopLibriaGL();
    if (libriaHls) { libriaHls.destroy(); libriaHls = null; }
    if (kodikHls)  { kodikHls.destroy();  kodikHls  = null; }
    if (kodikKeyListener) { document.removeEventListener('keydown', kodikKeyListener); kodikKeyListener = null; }
    currentEpisodeNum = num;
    const viewport = document.getElementById('player-viewport');
    if (viewport) viewport.innerHTML = renderCurrentPlayer();
    updateServerButtons();
    lucide.createIcons();
    const type = AUTO_SERVERS[currentServerIndex]?.type;
    if (type === 'kodik')  initKodikPlayer();
    if (type === 'libria') initLibriaPlayer();
}

function selectVoice(idx) {
    clearTimeout(window._playerErrorTimer);
    if (kodikHls) { kodikHls.destroy(); kodikHls = null; }
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

// ─── Kodik player controls ───────────────────────────────────────────────────

function toggleKodikPlay() {
    const v = document.getElementById('kodik-video');
    if (!v) return;
    v.paused ? v.play().catch(() => {}) : v.pause();
}

function updateKodikPlayBtn(isPaused) {
    const btn = document.getElementById('kodik-play-btn');
    if (!btn) return;
    btn.innerHTML = isPaused
        ? '<i data-lucide="play" class="w-5 h-5"></i>'
        : '<i data-lucide="pause" class="w-5 h-5"></i>';
    lucide.createIcons();
}

function updateKodikTime() {
    const v = document.getElementById('kodik-video');
    const timeEl = document.getElementById('kodik-time');
    const seekEl = document.getElementById('kodik-seek');
    if (!v || !timeEl) return;
    const fmt = s => isFinite(s) ? `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}` : '0:00';
    timeEl.textContent = `${fmt(v.currentTime)} / ${fmt(v.duration)}`;
    if (seekEl && v.duration) seekEl.value = (v.currentTime / v.duration) * 100;
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

// ─── AniLibria API ────────────────────────────────────────────────────────────

async function fetchAnilibriaTitle(anime) {
    const key = anime.malId;
    if (anilibriaCache[key] !== undefined) return anilibriaCache[key];

    const queries = [anime.title, anime.titleEn, anime.titleRu]
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i);

    for (const q of queries) {
        try {
            const res = await fetch(
                `https://anilibria.top/api/v1/app/search/releases?query=${encodeURIComponent(q)}&limit=3`,
                { signal: AbortSignal.timeout(5000) }
            );
            if (!res.ok) continue;
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                // Получаем полные данные с эпизодами
                const full = await fetch(
                    `https://anilibria.top/api/v1/anime/releases/${data[0].id}`,
                    { signal: AbortSignal.timeout(5000) }
                );
                if (full.ok) {
                    const release = await full.json();
                    anilibriaCache[key] = release;
                    return release;
                }
            }
        } catch (_) {}
    }
    anilibriaCache[key] = null;
    return null;
}

async function getAnilibriaEpisodeUrl(anime, ep) {
    const title = await fetchAnilibriaTitle(anime);
    if (!title?.episodes?.length) return null;
    const epData = title.episodes.find(e => e.ordinal === ep || e.ordinal === String(ep));
    if (!epData) return null;
    return epData.hls_1080 || epData.hls_720 || epData.hls_480 || null;
}

async function initLibriaPlayer() {
    const token = ++libriaPlayerToken;
    if (AUTO_SERVERS[currentServerIndex]?.type !== 'libria') return;

    const url = await getAnilibriaEpisodeUrl(currentAnime, currentEpisodeNum);

    if (token !== libriaPlayerToken) return;
    if (!document.getElementById('libria-loading')) return;

    if (!url) {
        const loadingEl = document.getElementById('libria-loading');
        const errEl = document.getElementById('libria-error');
        if (loadingEl) loadingEl.classList.add('hidden');
        if (errEl) { errEl.classList.remove('hidden'); lucide.createIcons(); }
        return;
    }
    loadLibriaVideo(url);
}

function loadLibriaVideo(url) {
    const loadingEl = document.getElementById('libria-loading');
    const videoEl   = document.getElementById('libria-video');
    const canvasEl  = document.getElementById('libria-canvas');
    const ctrlEl    = document.getElementById('libria-controls');
    if (!videoEl || !canvasEl) return;

    if (loadingEl) loadingEl.classList.add('hidden');
    canvasEl.classList.remove('hidden');
    if (ctrlEl) ctrlEl.classList.remove('hidden');

    stopLibriaGL();
    if (libriaHls) { libriaHls.destroy(); libriaHls = null; }

    if (Hls.isSupported()) {
        libriaHls = new Hls({ maxBufferLength: 30 });
        libriaHls.loadSource(url);
        libriaHls.attachMedia(videoEl);
        libriaHls.once(Hls.Events.MANIFEST_PARSED, () => {
            videoEl.play().catch(() => {});
        });
        libriaHls.on(Hls.Events.ERROR, (e, data) => {
            if (data.fatal) {
                const errEl = document.getElementById('libria-error');
                if (canvasEl) canvasEl.classList.add('hidden');
                if (errEl) { errEl.classList.remove('hidden'); lucide.createIcons(); }
            }
        });
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        videoEl.src = url; videoEl.load(); videoEl.play().catch(() => {});
    }

    initWebGLUpscaler(canvasEl, videoEl);

    videoEl.addEventListener('timeupdate', updateLibriaTime);
    videoEl.addEventListener('play',  () => updateLibriaPlayBtn(false));
    videoEl.addEventListener('pause', () => updateLibriaPlayBtn(true));

    const seekEl = document.getElementById('libria-seek');
    if (seekEl) {
        seekEl.addEventListener('input', () => {
            if (videoEl.duration) videoEl.currentTime = (seekEl.value / 100) * videoEl.duration;
        });
    }

    // Клик мышью → play/pause
    canvasEl.addEventListener('click', (e) => {
        if (e.pointerType === 'touch') return; // обрабатывается touchend
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
            _tapTimer = setTimeout(() => { _tapCount = 0; toggleLibriaPlay(); }, 280);
        } else if (_tapCount >= 2 && _tapSide === side) {
            clearTimeout(_tapTimer); _tapCount = 0;
            const delta = side === 'right' ? 10 : -10;
            videoEl.currentTime = Math.max(0, (videoEl.currentTime || 0) + delta);
            showSeekOverlay(canvasEl.parentElement, side, delta);
        } else {
            clearTimeout(_tapTimer); _tapCount = 1; _tapSide = side;
            _tapTimer = setTimeout(() => { _tapCount = 0; toggleLibriaPlay(); }, 280);
        }
    }, { passive: false });

    // Клавиатура: ← −10с, → +10с, пробел play/pause
    libriaKeyListener = (e) => {
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
        if (currentSection !== 'watch') return;
        if (AUTO_SERVERS[currentServerIndex]?.type !== 'libria') return;
        const v = document.getElementById('libria-video');
        if (!v) return;
        const player = document.getElementById('libria-player');
        if (e.key === 'ArrowRight') {
            v.currentTime += 10;
            showSeekOverlay(player, 'right', 10);
            e.preventDefault();
        } else if (e.key === 'ArrowLeft') {
            v.currentTime = Math.max(0, v.currentTime - 10);
            showSeekOverlay(player, 'left', -10);
            e.preventDefault();
        } else if (e.key === ' ') {
            toggleLibriaPlay();
            e.preventDefault();
        }
    };
    document.addEventListener('keydown', libriaKeyListener);
}

function stopLibriaGL() {
    if (libriaRafId) { cancelAnimationFrame(libriaRafId); libriaRafId = null; }
    libriaGlContext = null;
    if (libriaKeyListener) { document.removeEventListener('keydown', libriaKeyListener); libriaKeyListener = null; }
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

function initWebGLUpscaler(canvas, video) {
    stopLibriaGL();

    const container = canvas.parentElement;
    canvas.width  = container?.clientWidth  || 1280;
    canvas.height = container?.clientHeight || 720;

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
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

    const uvBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,1, 1,1, 0,0, 1,0]), gl.STATIC_DRAW);

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

        gl.viewport(0, 0, canvas.width, canvas.height);
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

// ─── Libria player controls ───────────────────────────────────────────────────

function toggleLibriaPlay() {
    const v = document.getElementById('libria-video');
    if (!v) return;
    v.paused ? v.play().catch(() => {}) : v.pause();
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
    const btn = document.getElementById('libria-play-btn');
    if (!btn) return;
    btn.innerHTML = isPaused
        ? '<i data-lucide="play" class="w-5 h-5"></i>'
        : '<i data-lucide="pause" class="w-5 h-5"></i>';
    lucide.createIcons();
}

function updateLibriaTime() {
    const v = document.getElementById('libria-video');
    const timeEl = document.getElementById('libria-time');
    const seekEl = document.getElementById('libria-seek');
    if (!v || !timeEl) return;
    const fmt = s => isFinite(s) ? `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}` : '0:00';
    timeEl.textContent = `${fmt(v.currentTime)} / ${fmt(v.duration)}`;
    if (seekEl && v.duration) seekEl.value = (v.currentTime / v.duration) * 100;
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
    const navIds = { home: 'mob-nav-home', profile: 'mob-nav-account' };
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
            ? `${t('admin_lang_auto')}: "${TRANSLATE_TO}"`
            : 'EN';
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
    return { type: 'home' };
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
    const info = getRouteInfo();
    if (info.type === 'anime') {
        fetchAndWatchByMalId(info.malId);
    } else if (info.type === 'profile') {
        showProfilePage(info.username);
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
    const info = getRouteInfo();
    if (info.type === 'anime') {
        showSection('home');
        await new Promise(r => setTimeout(r, 100));
        await fetchAndWatchByMalId(info.malId);
    } else if (info.type === 'profile') {
        showSection('home');
        await new Promise(r => setTimeout(r, 50));
        showProfilePage(info.username);
    } else {
        showSection('home');
    }
})();
