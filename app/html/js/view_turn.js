function renderTreasuryControls() {
    const currencySelect = document.getElementById('treasury-currency');
    if (!currencySelect) {
        return;
    }
    let order = getCurrencyDisplayOrder();
    if (!order || order.length === 0) {
        order = ['[Curr]'];
    }
    currencySelect.innerHTML = '';
    order.forEach(curr => {
        const opt = document.createElement('option');
        opt.value = curr;
        opt.textContent = curr;
        currencySelect.appendChild(opt);
    });
}

async function adjustTreasury(mode = 'add') {
    const amountEl = document.getElementById('treasury-amount');
    const currencyEl = document.getElementById('treasury-currency');
    if (!amountEl || !currencyEl) {
        return;
    }
    const amount = parseInt(amountEl.value, 10);
    const currency = currencyEl.value;
    if (!Number.isInteger(amount) || amount < 0 || !currency) {
        notifyUser(t('treasury.invalid'));
        return;
    }

    let delta = amount;
    if (mode === 'remove') {
        delta = -amount;
    } else if (mode !== 'add') {
        notifyUser(t('treasury.invalid'));
        return;
    }
    if (delta === 0) {
        showToast(t('treasury.no_change'), 'warn');
        return;
    }

    if (!(window.pywebview && window.pywebview.api && window.pywebview.api.apply_effects)) {
        notifyUser(t('alerts.pywebview_unavailable'));
        return;
    }

    const effect = { [currency]: delta };
    const context = {
        event_type: 'treasury_adjust',
        source_type: 'dm',
        source_id: 'manual',
        action: mode === 'remove' ? 'remove' : 'add',
        result: 'applied',
        log_text: t('treasury.log_text', { amount: formatSigned(delta), currency })
    };

    const response = await window.pywebview.api.apply_effects([effect], context);
    if (!response || !response.success) {
        notifyUser(t('treasury.failed'));
        return;
    }

    await refreshSessionState();
    renderInventoryPanel();
    const effectText = formatEffectEntries(response.entries || []);
    const summary = t('treasury.applied', { effects: effectText });
    addLogEntry(summary, 'event');
    showToast(summary, 'success');
    amountEl.value = '';
}

async function adjustInventoryItem(mode = 'add') {
    const nameEl = document.getElementById('inventory-item-name');
    const qtyEl = document.getElementById('inventory-item-qty');
    if (!nameEl || !qtyEl) {
        return;
    }
    const item = String(nameEl.value || '').trim();
    const qty = parseInt(qtyEl.value, 10);
    if (!item || !Number.isInteger(qty) || qty < 0) {
        notifyUser(t('inventory.invalid'));
        return;
    }
    let delta = qty;
    if (mode === 'remove') {
        delta = -qty;
    } else if (mode !== 'add') {
        notifyUser(t('inventory.invalid'));
        return;
    }
    if (delta === 0) {
        showToast(t('inventory.no_change'), 'warn');
        return;
    }

    if (!(window.pywebview && window.pywebview.api && window.pywebview.api.apply_effects)) {
        notifyUser(t('alerts.pywebview_unavailable'));
        return;
    }

    const effect = { item, qty: delta };
    const context = {
        event_type: 'inventory_adjust',
        source_type: 'dm',
        source_id: 'manual',
        action: mode === 'remove' ? 'remove' : 'add',
        result: 'applied',
        log_text: t('inventory.log_text', { item, qty: formatSigned(delta) })
    };

    const response = await window.pywebview.api.apply_effects([effect], context);
    if (!response || !response.success) {
        notifyUser(t('inventory.failed'));
        return;
    }

    await refreshSessionState();
    renderInventoryPanel();
    const effectText = formatEffectEntries(response.entries || []);
    const summary = t('inventory.applied', { effects: effectText });
    addLogEntry(summary, 'event');
    showToast(summary, 'success');
    qtyEl.value = '';
}

async function saveFormulaInputs() {
    const ctx = appState.formulaInputContext;
    if (!ctx) {
        return;
    }
    const { facilityId, orderId, triggerId, promptInputs } = ctx;
    if (!Array.isArray(promptInputs) || promptInputs.length === 0) {
        closeModal('formula-input-modal');
        return;
    }
    const inputs = {};
    for (const input of promptInputs) {
        const field = document.getElementById(`formula-input-${input.name}`);
        const value = field ? field.value : '';
        const source = getFormulaInputSource(input);
        if (!source) {
            notifyUser(t('alerts.formula_inputs_missing'));
            return;
        }
        if (source === 'check') {
            if (!isCheckValueValid(input, value)) {
                notifyUser(t('alerts.formula_inputs_missing'));
                return;
            }
            inputs[input.name] = Number(value);
        } else {
            if (!isNumericValue(value)) {
                notifyUser(t('alerts.formula_inputs_missing'));
                return;
            }
            inputs[input.name] = Number(value);
        }
    }

    if (!(window.pywebview && window.pywebview.api && window.pywebview.api.save_formula_inputs)) {
        notifyUser(t('alerts.pywebview_unavailable'));
        return;
    }

    const response = await window.pywebview.api.save_formula_inputs(facilityId, orderId, triggerId, inputs);
    if (!response || !response.success) {
        const message = response && response.message ? response.message : 'unknown error';
        notifyUser(t('alerts.formula_inputs_failed', { message }));
        return;
    }

    closeModal('formula-input-modal');
    await refreshSessionState();
    if (appState.selectedFacilityId) {
        renderOrdersPanel(appState.selectedFacilityId);
    }
}

function renderInventoryPanel() {
    const panel = document.getElementById('inventory-panel');
    const walletEl = document.getElementById('inventory-wallet');
    const groupsEl = document.getElementById('inventory-groups');
    const empty = document.getElementById('inventory-empty');
    const filterToggle = document.getElementById('inventory-filter-toggle');
    const filterPanel = document.getElementById('inventory-filter-panel');
    const sortSelect = document.getElementById('inventory-sort');
    const searchInput = document.getElementById('inventory-search');
    const suggestionsEl = document.getElementById('inventory-item-suggestions');
    if (!panel || !groupsEl) {
        return;
    }
    groupsEl.innerHTML = '';
    const inventory = appState.session && appState.session.bastion && Array.isArray(appState.session.bastion.inventory)
        ? appState.session.bastion.inventory
        : [];

    if (walletEl) {
        const model = getCurrencyModel();
        const baseValue = appState.session && appState.session.bastion
            ? appState.session.bastion.treasury_base
            : 0;
        const displayWallet = normalizeBaseToWallet(
            typeof baseValue === 'number' ? baseValue : 0,
            model
        );
        const order = getCurrencyDisplayOrder();
        walletEl.innerHTML = '';
        const label = document.createElement('div');
        label.className = 'inventory-wallet-label';
        label.textContent = t('inventory.wallet_label');
        walletEl.appendChild(label);

        const list = document.createElement('div');
        list.className = 'inventory-wallet-list';
        if (order && order.length) {
            order.forEach(currency => {
                const value = typeof displayWallet[currency] === 'number' ? displayWallet[currency] : 0;
                const line = document.createElement('div');
                line.className = 'inventory-wallet-line';
                line.textContent = `${value} ${currency}`;
                list.appendChild(line);
            });
        } else {
            const fallback = document.createElement('div');
            fallback.className = 'inventory-wallet-line';
            fallback.textContent = t('common.unknown');
            list.appendChild(fallback);
        }
        walletEl.appendChild(list);
    }

    const filterState = appState.inventoryFilter || { sort: 'name_asc', query: '' };
    appState.inventoryFilter = filterState;

    if (filterToggle && !filterToggle.dataset.bound) {
        filterToggle.addEventListener('click', () => {
            if (filterPanel) {
                filterPanel.classList.toggle('hidden');
            }
        });
        filterToggle.dataset.bound = 'true';
    }

    if (sortSelect) {
        if (sortSelect.value !== filterState.sort) {
            sortSelect.value = filterState.sort;
        }
        if (!sortSelect.dataset.bound) {
            sortSelect.addEventListener('change', () => {
                filterState.sort = sortSelect.value;
                renderInventoryPanel();
            });
            sortSelect.dataset.bound = 'true';
        }
    }

    if (searchInput) {
        if (searchInput.value !== filterState.query) {
            searchInput.value = filterState.query;
        }
        if (!searchInput.dataset.bound) {
            searchInput.addEventListener('input', () => {
                filterState.query = searchInput.value;
                renderInventoryPanel();
            });
            searchInput.dataset.bound = 'true';
        }
    }

    const query = (filterState.query || '').trim().toLowerCase();
    const items = inventory
        .filter(entry => entry && typeof entry === 'object')
        .map(entry => ({
            item: entry.item || '-',
            qty: Number.isInteger(entry.qty) ? entry.qty : 0
        }))
        .filter(entry => !query || String(entry.item).toLowerCase().includes(query));

    items.sort((a, b) => {
        switch (filterState.sort) {
            case 'name_desc':
                return b.item.localeCompare(a.item);
            case 'count_asc':
                return a.qty - b.qty || a.item.localeCompare(b.item);
            case 'count_desc':
                return b.qty - a.qty || a.item.localeCompare(b.item);
            case 'name_asc':
            default:
                return a.item.localeCompare(b.item);
        }
    });

    if (empty) {
        empty.classList.toggle('hidden', items.length > 0);
    }

    items.forEach(entry => {
        const row = document.createElement('div');
        row.className = 'inventory-item';
        const name = document.createElement('span');
        name.textContent = entry.item || '-';
        const qty = document.createElement('span');
        qty.textContent = Number.isInteger(entry.qty) ? entry.qty : '-';
        row.appendChild(name);
        row.appendChild(qty);
        groupsEl.appendChild(row);
    });

    if (suggestionsEl) {
        const items = [...new Set(inventory.map(entry => entry && entry.item).filter(Boolean))].sort((a, b) => a.localeCompare(b));
        suggestionsEl.innerHTML = '';
        items.forEach(itemName => {
            const option = document.createElement('option');
            option.value = itemName;
            suggestionsEl.appendChild(option);
        });
    }
}

async function applyLoadedSession(filename, sessionState, options = {}) {
    const showAlert = options.showAlert !== false;
    const closeDialog = options.closeDialog !== false;

    appState.session = sessionState;
    renderAuditLog();
    updateTurnCounter();
    updateQueueDisplay();
    await loadCurrencyModel();
    await loadFacilityCatalog();
    await refreshFacilityStates();
    if (typeof updateGlobalActionLocks === 'function') {
        updateGlobalActionLocks();
    }
    renderInventoryPanel();

    if (typeof setHeaderSessionName === 'function') {
        setHeaderSessionName(getSessionDisplayName(sessionState));
    }

    if (showAlert) {
        notifyUser(t('alerts.session_loaded', { filename: filename || '' }));
    }
    if (closeDialog) {
        closeModal('load-session-modal');
    }
    switchView(3);
}

async function loadSessionFile(filename) {
    logClient('info', `Loading session: ${filename}`);

    if (window.pywebview && window.pywebview.api) {
        try {
            const response = await window.pywebview.api.load_session(filename);
            if (response.success) {
                logClient('info', `Session loaded successfully: ${filename}`);
                await applyLoadedSession(filename, response.session_state, { showAlert: true, closeDialog: true });
            } else {
                logClient('error', `Failed to load session: ${response.message}`);
                notifyUser(t('alerts.error_prefix', { message: response.message }));
            }
        } catch (err) {
            logClient('error', `Failed to load session file: ${err}`);
            notifyUser(t('alerts.error_prefix', { message: err }));
        }
    } else {
        notifyUser(t('alerts.pywebview_unavailable'));
    }
}

async function autoLoadLatestSession() {
    if (!(window.pywebview && window.pywebview.api && window.pywebview.api.load_latest_session)) {
        return;
    }
    try {
        const response = await window.pywebview.api.load_latest_session();
        if (!response || !response.success || !response.session_state) {
            return;
        }
        const filename = response.filename || (response.session_state && response.session_state._session_filename) || '';
        await applyLoadedSession(filename, response.session_state, { showAlert: false, closeDialog: false });
        logClient('info', `Auto-loaded session: ${filename}`);
    } catch (err) {
        logClient('warn', `Auto-load latest session failed: ${err}`);
    }
}

// ===== NPC MANAGEMENT =====

async function openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (!modal) {
        return;
    }
    modal.classList.remove('hidden');
    await loadSettingsModal();
}

async function loadSettingsModal() {
    if (!(window.pywebview && window.pywebview.api && window.pywebview.api.get_bastion_config)) {
        notifyUser(t('alerts.pywebview_unavailable'));
        return;
    }
    try {
        const basePromise = window.pywebview.api.get_bastion_base_config
            ? window.pywebview.api.get_bastion_base_config()
            : Promise.resolve(null);
        const corePromise = window.pywebview.api.get_bastion_core_config
            ? window.pywebview.api.get_bastion_core_config()
            : Promise.resolve(null);
        const [config, baseConfig, coreConfig, settings] = await Promise.all([
            window.pywebview.api.get_bastion_config(),
            basePromise,
            corePromise,
            window.pywebview.api.get_settings(),
        ]);
        if (!config || config.error) {
            notifyUser(t('settings.load_failed'));
            return;
        }
        appState.config = config;
        appState.baseConfig = baseConfig && !baseConfig.error ? baseConfig : config;
        appState.coreConfig = coreConfig && !coreConfig.error ? coreConfig : appState.baseConfig;
        appState.settings = settings && !settings.error ? settings : {};
        renderSettingsModal(config, appState.baseConfig, appState.settings, appState.coreConfig);
    } catch (err) {
        logClient('warn', `Failed to load settings modal: ${err}`);
        notifyUser(t('settings.load_failed'));
    }
}

function renderSettingsModal(config, baseConfig = null, settings = null, coreConfig = null) {
    const fallbackBase = baseConfig || config;
    const activeSettings = settings || appState.settings || {};
    const fallbackCore = coreConfig || appState.coreConfig || fallbackBase;
    renderSettingsCurrency(fallbackBase, config, activeSettings, fallbackCore);
    renderSettingsBuildCosts(config);
    renderSettingsNpcProgression(config);
    renderSettingsCheckProfiles(config);
    const status = document.getElementById('settings-status');
    if (status) {
        status.classList.add('hidden');
        status.textContent = '';
    }
}

function renderSettingsCurrency(baseConfig, mergedConfig, settings, coreConfig) {
    const container = document.getElementById('settings-currency-list');
    const hiddenContainer = document.getElementById('settings-currency-hidden');
    if (!container || !hiddenContainer) {
        return;
    }
    container.innerHTML = '';
    hiddenContainer.innerHTML = '';
    const baseCurrency = baseConfig && baseConfig.currency && typeof baseConfig.currency === 'object'
        ? baseConfig.currency
        : {};
    const conversionSource = settings && settings.currency && Array.isArray(settings.currency.conversion)
        ? settings.currency.conversion
        : (baseCurrency.conversion || (mergedConfig && mergedConfig.currency && mergedConfig.currency.conversion) || []);
    const conversion = Array.isArray(conversionSource) ? conversionSource : [];
    const types = Array.isArray(baseCurrency.types) ? baseCurrency.types.filter(t => typeof t === 'string') : [];
    const coreTypes = coreConfig && coreConfig.currency && Array.isArray(coreConfig.currency.types)
        ? coreConfig.currency.types.filter(t => typeof t === 'string')
        : [];
    const protectedSet = new Set(coreTypes);
    const baseCurrencyId = baseCurrency && typeof baseCurrency.base_currency === 'string'
        ? baseCurrency.base_currency
        : null;
    if (baseCurrencyId) {
        protectedSet.add(baseCurrencyId);
    }
    const coreSet = new Set(coreTypes);
    const hiddenList = settings && settings.currency && Array.isArray(settings.currency.hidden)
        ? settings.currency.hidden
        : [];
    const hiddenSet = new Set(hiddenList.filter(entry => typeof entry === 'string'));
    protectedSet.forEach(entry => hiddenSet.delete(entry));

    types.forEach(type => {
        const row = document.createElement('div');
        row.className = 'settings-row settings-row-inline';
        row.dataset.currency = type;

        const label = document.createElement('label');
        label.textContent = coreSet.has(type) ? type : `${type} (Custom)`;

        const wrap = document.createElement('div');
        wrap.className = 'settings-inline';

        if (!protectedSet.has(type)) {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = hiddenSet.has(type);
            checkbox.dataset.currency = type;

            const hint = document.createElement('span');
            hint.className = 'settings-inline-label';
            hint.textContent = t('settings.currency_hide_label');

            checkbox.addEventListener('change', () => {
                applyCurrencyVisibility(container, getHiddenCurrenciesFromContainer(hiddenContainer));
            });

            wrap.appendChild(checkbox);
            wrap.appendChild(hint);
            row.appendChild(label);
            row.appendChild(wrap);
        } else {
            row.appendChild(label);
        }
        hiddenContainer.appendChild(row);
    });

    conversion.forEach((entry, index) => {
        if (!entry || typeof entry !== 'object') {
            return;
        }
        const row = document.createElement('div');
        row.className = 'settings-row';
        row.dataset.from = entry.from || '';
        row.dataset.to = entry.to || '';
        row.dataset.index = String(index);
        row.dataset.settingsGroup = 'currency';

        const label = document.createElement('label');
        label.textContent = `${entry.from} -> ${entry.to}`;

        const input = document.createElement('input');
        input.type = 'number';
        input.min = '1';
        input.step = '1';
        input.placeholder = t('settings.field_rate');
        input.value = Number.isInteger(entry.rate) ? entry.rate : '';

        row.appendChild(label);
        row.appendChild(input);
        container.appendChild(row);
    });

    applyCurrencyVisibility(container, hiddenSet);
}

function getHiddenCurrenciesFromContainer(container) {
    if (!container) {
        return new Set();
    }
    const hidden = new Set();
    container.querySelectorAll('input[type="checkbox"][data-currency]').forEach(input => {
        if (input.checked) {
            hidden.add(input.dataset.currency);
        }
    });
    return hidden;
}

function applyCurrencyVisibility(container, hiddenSet) {
    if (!container) {
        return;
    }
    const hidden = hiddenSet instanceof Set ? hiddenSet : new Set();
    container.querySelectorAll('.settings-row').forEach(row => {
        const from = row.dataset.from;
        const to = row.dataset.to;
        const shouldHide = (from && hidden.has(from)) || (to && hidden.has(to));
        row.classList.toggle('hidden', shouldHide);
    });
}

function renderSettingsBuildCosts(config) {
    const container = document.getElementById('settings-build-costs');
    if (!container) {
        return;
    }
    container.innerHTML = '';
    const costs = config && config.default_build_costs && typeof config.default_build_costs === 'object'
        ? config.default_build_costs
        : {};
    Object.entries(costs).forEach(([key, entry]) => {
        if (!entry || typeof entry !== 'object') {
            return;
        }
        const block = document.createElement('div');
        block.className = 'settings-list';

        const title = document.createElement('div');
        title.className = 'settings-subtitle';
        title.textContent = key;
        block.appendChild(title);

        Object.entries(entry).forEach(([field, value]) => {
            const row = document.createElement('div');
            row.className = 'settings-row';
            row.dataset.settingsGroup = 'default_build_costs';
            row.dataset.costKey = key;
            row.dataset.field = field;

            const label = document.createElement('label');
            label.textContent = field === 'duration_turns' ? t('settings.field_duration') : field;

            const input = document.createElement('input');
            input.type = 'number';
            input.step = '1';
            input.value = Number.isInteger(value) ? value : '';
            if (field === 'duration_turns') {
                input.min = '1';
            } else {
                input.min = '0';
            }

            row.appendChild(label);
            row.appendChild(input);
            block.appendChild(row);
        });

        container.appendChild(block);
    });
}

function renderSettingsNpcProgression(config) {
    const container = document.getElementById('settings-npc-progression');
    if (!container) {
        return;
    }
    container.innerHTML = '';
    const npc = config && config.npc_progression && typeof config.npc_progression === 'object'
        ? config.npc_progression
        : {};

    if (Number.isInteger(npc.xp_per_success)) {
        const row = document.createElement('div');
        row.className = 'settings-row';
        row.dataset.settingsGroup = 'npc_progression';
        row.dataset.field = 'xp_per_success';

        const label = document.createElement('label');
        label.textContent = t('settings.npc_xp_per_success');

        const input = document.createElement('input');
        input.type = 'number';
        input.min = '1';
        input.step = '1';
        input.value = npc.xp_per_success;

        row.appendChild(label);
        row.appendChild(input);
        container.appendChild(row);
    }

    const thresholds = npc.level_thresholds && typeof npc.level_thresholds === 'object'
        ? npc.level_thresholds
        : {};
    if (Object.keys(thresholds).length) {
        const group = document.createElement('div');
        group.className = 'settings-list';
        const title = document.createElement('div');
        title.className = 'settings-subtitle';
        title.textContent = t('settings.npc_thresholds');
        group.appendChild(title);

        Object.entries(thresholds).forEach(([key, value]) => {
            const row = document.createElement('div');
            row.className = 'settings-row';
            row.dataset.settingsGroup = 'npc_progression';
            row.dataset.section = 'level_thresholds';
            row.dataset.field = key;

            const label = document.createElement('label');
            label.textContent = key;

            const input = document.createElement('input');
            input.type = 'number';
            input.step = '1';
            input.min = '0';
            input.value = Number.isInteger(value) ? value : '';

            row.appendChild(label);
            row.appendChild(input);
            group.appendChild(row);
        });

        container.appendChild(group);
    }

    const levelNames = npc.level_names && typeof npc.level_names === 'object'
        ? npc.level_names
        : {};
    if (Object.keys(levelNames).length) {
        const group = document.createElement('div');
        group.className = 'settings-list';
        const title = document.createElement('div');
        title.className = 'settings-subtitle';
        title.textContent = t('settings.npc_level_names');
        group.appendChild(title);

        Object.entries(levelNames).forEach(([key, value]) => {
            const row = document.createElement('div');
            row.className = 'settings-row';
            row.dataset.settingsGroup = 'npc_progression';
            row.dataset.section = 'level_names';
            row.dataset.field = key;

            const label = document.createElement('label');
            label.textContent = key;

            const input = document.createElement('input');
            input.type = 'text';
            input.value = value || '';

            row.appendChild(label);
            row.appendChild(input);
            group.appendChild(row);
        });

        container.appendChild(group);
    }
}

function renderSettingsCheckProfiles(config) {
    const container = document.getElementById('settings-check-profiles');
    if (!container) {
        return;
    }
    container.innerHTML = '';
    const profiles = config && config.check_profiles && typeof config.check_profiles === 'object'
        ? config.check_profiles
        : {};
    const levelOrder = ['default', 'apprentice', 'experienced', 'master'];
    const settingsProfiles = appState && appState.settings && appState.settings.check_profiles
        ? appState.settings.check_profiles
        : {};

    Object.entries(profiles).forEach(([profileKey, profile]) => {
        if (!profile || typeof profile !== 'object') {
            return;
        }
        const block = document.createElement('div');
        block.className = 'settings-list';
        const title = document.createElement('div');
        title.className = 'settings-subtitle';
        const titleText = document.createElement('span');
        const coreProfiles = appState && appState.coreConfig && appState.coreConfig.check_profiles
            ? appState.coreConfig.check_profiles
            : {};
        const isCustomProfile = !(coreProfiles && typeof coreProfiles === 'object' && coreProfiles[profileKey]);
        titleText.textContent = isCustomProfile ? `${profileKey} (Custom)` : profileKey;
        title.appendChild(titleText);
        if (Number.isInteger(profile.sides)) {
            const dice = document.createElement('span');
            dice.className = 'settings-dice';
            dice.textContent = `(d${profile.sides})`;
            title.appendChild(dice);
        }
        block.appendChild(title);

        const extraLevelKeys = Object.keys(profile).filter(key => !levelOrder.includes(key) && typeof profile[key] === 'object');
        const orderedKeys = [...levelOrder, ...extraLevelKeys];
        const deletedLevels = new Set();
        const settingsProfile = settingsProfiles && settingsProfiles[profileKey] && typeof settingsProfiles[profileKey] === 'object'
            ? settingsProfiles[profileKey]
            : {};
        Object.entries(settingsProfile).forEach(([key, value]) => {
            if (value === null) {
                deletedLevels.add(key);
                markCheckProfileDeleted(block, profileKey, key);
            }
        });

        orderedKeys.forEach(levelKey => {
            const level = profile[levelKey];
            if (!level || typeof level !== 'object' || deletedLevels.has(levelKey)) {
                if (levelKey !== 'experienced' && levelKey !== 'master') {
                    return;
                }
                const placeholder = createCheckProfilePlaceholder(profileKey, levelKey, profile, block);
                block.appendChild(placeholder);
                return;
            }
            const details = buildCheckProfileLevelDetails(profileKey, levelKey, level, block, profile);
            block.appendChild(details);
        });

        container.appendChild(block);
    });
}

function getCheckProfileTemplate(profile) {
    if (!profile || typeof profile !== 'object') {
        return {};
    }
    const preferred = ['default', 'apprentice', 'experienced', 'master'];
    for (const key of preferred) {
        const level = profile[key];
        if (level && typeof level === 'object') {
            return level;
        }
    }
    for (const [key, value] of Object.entries(profile)) {
        if (key !== 'sides' && value && typeof value === 'object') {
            return value;
        }
    }
    return {};
}

function buildCheckProfileLevelDetails(profileKey, levelKey, level, block, profile) {
    const details = document.createElement('details');
    details.className = 'settings-details';
    details.dataset.level = levelKey;

    const summary = document.createElement('summary');
    summary.className = 'settings-subtitle';
    summary.textContent = levelLabel(levelKey);
    details.appendChild(summary);

    if (levelKey === 'experienced' || levelKey === 'master') {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'settings-delete-btn';
        remove.title = t('settings.remove_level_hint');
        remove.textContent = '×';
        remove.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            markCheckProfileDeleted(block, profileKey, levelKey);
            const placeholder = createCheckProfilePlaceholder(profileKey, levelKey, profile, block);
            details.replaceWith(placeholder);
        });
        details.appendChild(remove);
    }

    const group = document.createElement('div');
    group.className = 'settings-list settings-level-group';

    Object.entries(level).forEach(([field, value]) => {
        const row = document.createElement('div');
        row.className = 'settings-row';
        row.dataset.settingsGroup = 'check_profiles';
        row.dataset.profile = profileKey;
        row.dataset.level = levelKey;
        row.dataset.field = field;

        const label = document.createElement('label');
        label.textContent = checkProfileFieldLabel(field);

        const input = document.createElement('input');
        input.type = 'text';
        input.value = formatCheckProfileValue(value);

        row.appendChild(label);
        row.appendChild(input);
        group.appendChild(row);
    });

    details.appendChild(group);
    return details;
}

function createCheckProfilePlaceholder(profileKey, levelKey, profile, block) {
    const placeholder = document.createElement('div');
    placeholder.className = 'settings-details settings-placeholder';
    const placeholderTitle = document.createElement('div');
    placeholderTitle.className = 'settings-subtitle';
    placeholderTitle.textContent = levelLabel(levelKey);
    placeholder.appendChild(placeholderTitle);

    const actions = document.createElement('div');
    actions.className = 'settings-inline settings-placeholder-actions';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-secondary btn-small';
    button.title = t('settings.add_level_hint');
    button.textContent = levelKey === 'experienced'
        ? t('settings.add_experienced')
        : t('settings.add_master');
    button.addEventListener('click', () => {
        clearCheckProfileDeleted(block, profileKey, levelKey);
        const template = getCheckProfileTemplate(profile);
        const details = buildCheckProfileLevelDetails(profileKey, levelKey, template, block, profile);
        details.open = true;
        placeholder.replaceWith(details);
    });
    actions.appendChild(button);
    placeholder.appendChild(actions);
    return placeholder;
}

function markCheckProfileDeleted(block, profileKey, levelKey) {
    if (!block) {
        return;
    }
    const selector = `.settings-delete-marker[data-profile="${profileKey}"][data-level="${levelKey}"]`;
    if (block.querySelector(selector)) {
        return;
    }
    const marker = document.createElement('div');
    marker.className = 'settings-delete-marker hidden';
    marker.dataset.settingsGroup = 'check_profiles';
    marker.dataset.profile = profileKey;
    marker.dataset.level = levelKey;
    block.appendChild(marker);
}

function clearCheckProfileDeleted(block, profileKey, levelKey) {
    if (!block) {
        return;
    }
    const selector = `.settings-delete-marker[data-profile="${profileKey}"][data-level="${levelKey}"]`;
    const marker = block.querySelector(selector);
    if (marker) {
        marker.remove();
    }
}

function levelLabel(levelKey) {
    if (levelKey === 'default') return t('settings.level_default');
    if (levelKey === 'experienced') return t('settings.level_experienced');
    if (levelKey === 'master') return t('settings.level_master');
    if (levelKey === 'apprentice') return t('settings.level_apprentice');
    return levelKey;
}

function checkProfileFieldLabel(field) {
    if (field === 'dc') return t('settings.field_dc');
    if (field === 'crit_success') return t('settings.field_crit_success');
    if (field === 'crit_fail') return t('settings.field_crit_fail');
    return field;
}

function formatCheckProfileValue(value) {
    if (Array.isArray(value)) {
        return value.join(', ');
    }
    if (value === null || value === undefined) {
        return '';
    }
    return String(value);
}

function parseIntListField(raw, fieldLabel, errors) {
    const text = String(raw || '').trim();
    if (!text) {
        errors.push(t('settings.value_invalid', { field: fieldLabel }));
        return null;
    }
    const parts = text.split(',').map(item => item.trim()).filter(Boolean);
    if (parts.length > 1) {
        const values = [];
        for (const part of parts) {
            const num = parseInt(part, 10);
            if (!Number.isInteger(num)) {
                errors.push(t('settings.value_invalid', { field: fieldLabel }));
                return null;
            }
            values.push(num);
        }
        return values;
    }
    const num = parseInt(text, 10);
    if (!Number.isInteger(num)) {
        errors.push(t('settings.value_invalid', { field: fieldLabel }));
        return null;
    }
    return num;
}

function collectSettingsFromForm(config) {
    const errors = [];
    const settings = {};

    const currencyRows = document.querySelectorAll('#settings-currency-list .settings-row');
    const hiddenRows = document.querySelectorAll('#settings-currency-hidden input[type="checkbox"][data-currency]');
    if (currencyRows.length || hiddenRows.length) {
        const conversion = [];
        currencyRows.forEach(row => {
            const input = row.querySelector('input');
            const from = row.dataset.from;
            const to = row.dataset.to;
            const rate = parseInt(input ? input.value : '', 10);
            if (!from || !to || !Number.isInteger(rate) || rate <= 0) {
                errors.push(t('settings.value_invalid', { field: `${from} -> ${to}` }));
                return;
            }
            conversion.push({ from, to, rate });
        });
        const hidden = [];
        hiddenRows.forEach(input => {
            if (input.checked) {
                hidden.push(input.dataset.currency);
            }
        });
        const currencySettings = {};
        if (conversion.length) {
            currencySettings.conversion = conversion;
        }
        if (hidden.length) {
            currencySettings.hidden = hidden;
        }
        if (Object.keys(currencySettings).length) {
            settings.currency = currencySettings;
        }
    }

    const costRows = document.querySelectorAll('#settings-build-costs .settings-row');
    if (costRows.length) {
        const defaultBuildCosts = {};
        costRows.forEach(row => {
            const input = row.querySelector('input');
            const costKey = row.dataset.costKey;
            const field = row.dataset.field;
            if (!costKey || !field) {
                return;
            }
            const raw = input ? input.value : '';
            const value = parseInt(raw, 10);
            if (!Number.isInteger(value) || (field === 'duration_turns' ? value <= 0 : value < 0)) {
                errors.push(t('settings.value_invalid', { field: `${costKey}.${field}` }));
                return;
            }
            if (!defaultBuildCosts[costKey]) {
                defaultBuildCosts[costKey] = {};
            }
            defaultBuildCosts[costKey][field] = value;
        });
        settings.default_build_costs = defaultBuildCosts;
    }

    const npcRows = document.querySelectorAll('#settings-npc-progression .settings-row');
    if (npcRows.length) {
        const npcProgression = {};
        npcRows.forEach(row => {
            const input = row.querySelector('input');
            const field = row.dataset.field;
            const section = row.dataset.section || '';
            if (!field) {
                return;
            }
            if (section === 'level_names') {
                const value = input ? String(input.value || '').trim() : '';
                if (!value) {
                    errors.push(t('settings.value_invalid', { field }));
                    return;
                }
                npcProgression.level_names = npcProgression.level_names || {};
                npcProgression.level_names[field] = value;
                return;
            }
            const raw = input ? input.value : '';
            const value = parseInt(raw, 10);
            const min = field === 'xp_per_success' ? 1 : 0;
            if (!Number.isInteger(value) || value < min) {
                errors.push(t('settings.value_invalid', { field }));
                return;
            }
            if (section === 'level_thresholds') {
                npcProgression.level_thresholds = npcProgression.level_thresholds || {};
                npcProgression.level_thresholds[field] = value;
            } else {
                npcProgression[field] = value;
            }
        });
        settings.npc_progression = npcProgression;
    }

    const profileRows = document.querySelectorAll('#settings-check-profiles .settings-row');
    if (profileRows.length) {
        const profiles = {};
        profileRows.forEach(row => {
            const input = row.querySelector('input');
            const profileKey = row.dataset.profile;
            const levelKey = row.dataset.level || '';
            const field = row.dataset.field;
            if (!profileKey || !field) {
                return;
            }
            if (!profiles[profileKey]) {
                profiles[profileKey] = {};
            }
            if (!levelKey) {
                const value = parseInt(input ? input.value : '', 10);
                if (!Number.isInteger(value) || value < 2) {
                    errors.push(t('settings.value_invalid', { field: `${profileKey}.${field}` }));
                    return;
                }
                profiles[profileKey][field] = value;
                return;
            }
            profiles[profileKey][levelKey] = profiles[profileKey][levelKey] || {};
            if (field === 'dc') {
                const value = parseInt(input ? input.value : '', 10);
                if (!Number.isInteger(value)) {
                    errors.push(t('settings.value_invalid', { field: `${profileKey}.${levelKey}.${field}` }));
                    return;
                }
                profiles[profileKey][levelKey][field] = value;
                return;
            }
            const parsed = parseIntListField(input ? input.value : '', `${profileKey}.${levelKey}.${field}`, errors);
            if (parsed === null) {
                return;
            }
            profiles[profileKey][levelKey][field] = parsed;
        });
        const deleteMarkers = document.querySelectorAll('#settings-check-profiles .settings-delete-marker');
        deleteMarkers.forEach(marker => {
            const profileKey = marker.dataset.profile;
            const levelKey = marker.dataset.level;
            if (!profileKey || !levelKey) {
                return;
            }
            if (!profiles[profileKey]) {
                profiles[profileKey] = {};
            }
            profiles[profileKey][levelKey] = null;
        });
        settings.check_profiles = profiles;
    }

    return { settings, errors };
}

async function saveSettings() {
    if (!(window.pywebview && window.pywebview.api && window.pywebview.api.save_settings)) {
        notifyUser(t('alerts.pywebview_unavailable'));
        return;
    }
    const config = appState.config || {};
    const { settings, errors } = collectSettingsFromForm(config);
    if (errors.length) {
        notifyUser(errors.join('\n'));
        return;
    }
    try {
        const response = await window.pywebview.api.save_settings(settings);
        if (!response || !response.success) {
            const msg = response && response.errors ? response.errors.join('\n') : (response && response.message ? response.message : 'unknown error');
            notifyUser(t('settings.save_failed', { message: msg }));
            return;
        }
        if (response.warnings && response.warnings.length) {
            notifyUser(response.warnings.join('\n'));
        }
        appState.config = response.config || config;
        appState.settings = response.settings || settings;
        renderSettingsModal(
            appState.config,
            appState.baseConfig || appState.config,
            appState.settings,
            appState.coreConfig || appState.baseConfig || appState.config
        );
        notifyUser(t('settings.saved'));
        await loadCurrencyModel();
        await loadNpcProgression();
        await loadCheckProfiles();
        if (typeof loadPlayerClassOptions === 'function') {
            await loadPlayerClassOptions();
        }
        await refreshSessionState();
        updateQueueDisplay();
        if (appState.selectedFacilityId) {
            selectFacility(appState.selectedFacilityId);
        }
    } catch (err) {
        notifyUser(t('settings.save_failed', { message: err }));
    }
}

console.log('App scripts loaded - all functions ready');
