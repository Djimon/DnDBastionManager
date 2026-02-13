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

