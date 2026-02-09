const I18N = {
    supported: ['de-DE', 'en-US'],
    defaultLang: 'de-DE',
    current: 'de-DE',
    strings: {},
};

function resolveI18nKey(obj, key) {
    if (!obj || !key) {
        return undefined;
    }
    return key.split('.').reduce((acc, part) => {
        if (acc && Object.prototype.hasOwnProperty.call(acc, part)) {
            return acc[part];
        }
        return undefined;
    }, obj);
}

function t(key, params = {}) {
    const raw = resolveI18nKey(I18N.strings, key);
    let text = typeof raw === 'string' ? raw : key;
    Object.keys(params).forEach(paramKey => {
        const value = params[paramKey];
        text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), value);
    });
    return text;
}

async function refreshLanguageList() {
    if (window.pywebview && window.pywebview.api && window.pywebview.api.list_languages) {
        try {
            const response = await window.pywebview.api.list_languages();
            if (response && response.success && Array.isArray(response.languages) && response.languages.length) {
                I18N.supported = response.languages;
            }
        } catch (err) {
            console.warn('Failed to refresh language list:', err);
        }
    }
}

function getLanguageLabel(code) {
    const short = String(code || '').toLowerCase().split('-')[0];
    const key = `languages.${short}`;
    const label = t(key);
    return label === key ? code : label;
}

async function loadLanguage(lang) {
    const target = I18N.supported.includes(lang) ? lang : I18N.defaultLang;
    try {
        const response = await fetch(`/i18n/${target}.json`);
        if (!response.ok) {
            throw new Error(`Failed to load language ${target}`);
        }
        I18N.strings = await response.json();
        I18N.current = target;
        document.documentElement.lang = target;
        return true;
    } catch (err) {
        console.warn('Language load failed:', err);
        if (target !== I18N.defaultLang) {
            return loadLanguage(I18N.defaultLang);
        }
        return false;
    }
}

function applyTranslations(root = document) {
    const nodes = root.querySelectorAll('[data-i18n]');
    nodes.forEach(node => {
        const key = node.getAttribute('data-i18n');
        if (key) {
            node.textContent = t(key);
        }
    });

    const placeholders = root.querySelectorAll('[data-i18n-placeholder]');
    placeholders.forEach(node => {
        const key = node.getAttribute('data-i18n-placeholder');
        if (key) {
            node.setAttribute('placeholder', t(key));
        }
    });

    const titles = root.querySelectorAll('[data-i18n-title]');
    titles.forEach(node => {
        const key = node.getAttribute('data-i18n-title');
        if (key) {
            node.setAttribute('title', t(key));
        }
    });
}

function renderLanguageOptions(selectEl) {
    if (!selectEl) {
        return;
    }
    const current = I18N.current;
    const options = I18N.supported.length ? I18N.supported : [I18N.defaultLang];
    selectEl.innerHTML = '';
    options.forEach(code => {
        const option = document.createElement('option');
        option.value = code;
        option.textContent = getLanguageLabel(code);
        if (code === current) {
            option.selected = true;
        }
        selectEl.appendChild(option);
    });
}

async function setLanguage(lang) {
    await refreshLanguageList();
    const loaded = await loadLanguage(lang);
    if (!loaded) {
        return;
    }
    localStorage.setItem('bastion_lang', I18N.current);
    applyTranslations();
    document.title = t('app.title');

    const languageSelect = document.getElementById('language-select');
    renderLanguageOptions(languageSelect);
    if (typeof updateThemeToggleLabel === 'function') {
        updateThemeToggleLabel();
    }

    if (typeof updateSessionNamePlaceholder === 'function') {
        updateSessionNamePlaceholder();
    }
    if (typeof updateTurnCounter === 'function') {
        updateTurnCounter();
    }
    if (typeof updateQueueDisplay === 'function') {
        updateQueueDisplay();
    }
    if (typeof populateCatalogFilters === 'function') {
        populateCatalogFilters();
    }
    if (typeof applyCatalogFilters === 'function') {
        applyCatalogFilters();
    }
    if (typeof renderFacilityStates === 'function') {
        renderFacilityStates();
    }
    if (typeof selectFacility === 'function' && window.appState && appState.selectedFacilityId) {
        selectFacility(appState.selectedFacilityId);
    }
}

async function initI18n() {
    await refreshLanguageList();
    const stored = localStorage.getItem('bastion_lang');
    const fallback = stored && I18N.supported.includes(stored) ? stored : I18N.defaultLang;
    await loadLanguage(fallback);
    applyTranslations();
    document.title = t('app.title');
    const languageSelect = document.getElementById('language-select');
    renderLanguageOptions(languageSelect);
    if (typeof updateThemeToggleLabel === 'function') {
        updateThemeToggleLabel();
    }
    if (languageSelect) {
        languageSelect.addEventListener('change', event => {
            setLanguage(event.target.value);
        });
    }
    if (typeof updateTurnCounter === 'function') {
        updateTurnCounter();
    }
    if (typeof updateSessionNamePlaceholder === 'function') {
        updateSessionNamePlaceholder();
    }
    if (typeof updateQueueDisplay === 'function') {
        updateQueueDisplay();
    }
    if (typeof populateCatalogFilters === 'function') {
        populateCatalogFilters();
    }
    if (typeof applyCatalogFilters === 'function') {
        applyCatalogFilters();
    }
    if (typeof renderFacilityStates === 'function') {
        renderFacilityStates();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initI18n();
});

if (window.addEventListener) {
    window.addEventListener('pywebviewready', () => {
        refreshLanguageList().then(() => {
            const languageSelect = document.getElementById('language-select');
            renderLanguageOptions(languageSelect);
            const stored = localStorage.getItem('bastion_lang');
            if (stored && stored !== I18N.current && I18N.supported.includes(stored)) {
                setLanguage(stored);
            }
        });
    });
}
