// ===== LOGGING UTILITY =====

function logClient(level, message) {
    console.log(`[${level.toUpperCase()}] ${message}`);
    if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.log_client(level, message).catch(err => {
            console.error('Failed to send log to server:', err);
        });
    }
}

const DEV_FOOTER_LIMIT = 1;

function formatDevTimestamp(date = new Date()) {
    const pad = value => String(value).padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function inferDevSeverity(message) {
    const text = String(message || '').toLowerCase();
    if (text.includes('fehler') || text.includes('failed') || text.includes('error') || text.includes('fehlgeschlagen') || text.includes('unavailable') || text.includes('nicht verfügbar')) {
        return 'Error';
    }
    if (text.includes('warn') || text.includes('achtung') || text.includes('warning')) {
        return 'Warning';
    }
    return 'Info';
}

function appendDevFooterMessage(message, severity = 'Info') {
    const container = document.getElementById('dev-footer-log');
    const level = String(severity || 'Info').toLowerCase();
    const text = `${formatDevTimestamp()}: [${severity}]: ${message}`;

    if (!container) {
        console.log(text);
        return;
    }

    let entry = container.firstElementChild;
    if (!entry) {
        entry = document.createElement('div');
        container.appendChild(entry);
    }
    entry.className = `dev-footer-entry ${level}`;
    entry.textContent = text;

    while (container.children.length > DEV_FOOTER_LIMIT) {
        container.removeChild(container.firstChild);
    }
}

function notifyUser(message, severity = null) {
    const resolved = severity || inferDevSeverity(message);
    appendDevFooterMessage(message, resolved);
}

function systemAlert(message) {
    notifyUser(message);
}

if (typeof window !== 'undefined') {
    window.notifyUser = notifyUser;
    if (!window.__devAlertHooked) {
        window.__devAlertHooked = true;
        window.alert = systemAlert;
    }
}

// ===== APP STATE =====

let appState = {
    currentView: 1,
    currentTab: 'details',
    selectedFacilityId: null,
    selectedUpgradeTargetId: null,
    session: {
        name: '[No Session]',
        turn: 0,
        wallet: { gold: 0, silver: 0, copper: 0 },
        facilities: [],
        npcs: [],
        players: [],
    },
    buildQueue: [],
    facilityCatalog: [],
    facilityById: {},
    facilityStates: [],
    currencyModel: null,
    npcProgression: null,
    checkProfiles: null,
    formulaRegistry: {},
    moveNpcContext: null,
    formulaInputContext: null,
    npcManagementSort: { key: null, dir: 'desc' },
    npcTabSort: { key: null, dir: 'desc' },
    inventoryFilter: { sort: 'name_asc', query: '' },
    hireFacilityPref: null,
    hireFacilityUserTouched: false,
    playerClassOptions: [],
    playerEditingIndex: null,
};

const BUILDABLE_TIER = 1;

// ===== VIEW NAVIGATION =====

function switchView(viewNum) {
    appState.currentView = viewNum;
    
    // Hide all views
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    
    // Show selected view
    const viewId = `view-${viewNum}`;
    const view = document.getElementById(viewId);
    if (view) {
        view.classList.add('active');
    }

    if (viewNum === 2 && typeof updateQueueDisplay === 'function') {
        updateQueueDisplay();
    }
    if (viewNum === 1 && typeof renderPlayersList === 'function') {
        renderPlayersList();
    }
    if (viewNum === 5) {
        if (typeof loadPlayerClassOptions === 'function') {
            loadPlayerClassOptions().then(() => {
                if (typeof populateAllPlayerClassSelects === 'function') {
                    populateAllPlayerClassSelects();
                }
                if (typeof renderPlayersList === 'function') {
                    renderPlayersList();
                }
            });
        } else if (typeof renderPlayersList === 'function') {
            renderPlayersList();
        }
    }
    if (viewNum === 3 && typeof renderAuditLog === 'function') {
        renderAuditLog();
    }
}

function switchTab(tabName, triggerEl = null) {
    appState.currentTab = tabName;
    
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    // Show selected tab
    const tabId = `tab-${tabName}`;
    const tab = document.getElementById(tabId);
    if (tab) {
        tab.classList.add('active');
    }
    
    // Mark button as active
    const trigger = triggerEl || document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    if (trigger) {
        trigger.classList.add('active');
    }

    const facilityId = appState.selectedFacilityId;
    if (!facilityId) {
        return;
    }

    if (tabName === 'npcs' && typeof renderNpcTab === 'function') {
        renderNpcTab(facilityId);
    }
    if (tabName === 'orders' && typeof renderOrdersPanel === 'function') {
        renderOrdersPanel(facilityId);
    }
    if (tabName === 'details') {
        if (typeof updateUpgradeSection === 'function') {
            updateUpgradeSection(facilityId);
        }
        if (typeof renderSlotBubbles === 'function' && typeof getFacilityEntry === 'function') {
            renderSlotBubbles(appState.facilityById[facilityId], getFacilityEntry(facilityId));
        }
    }
    if (typeof updateFacilityTabIndicators === 'function') {
        updateFacilityTabIndicators(facilityId);
    }
    if (typeof renderOrderProgressIndicators === 'function') {
        renderOrderProgressIndicators(facilityId);
    }
}

function switchModalTab(tabName, triggerEl = null) {
    document.querySelectorAll('.modal-tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.modal-tab-btn').forEach(b => b.classList.remove('active'));
    
    const tabId = `modal-tab-${tabName}`;
    const tab = document.getElementById(tabId);
    if (tab) {
        tab.classList.add('active');
    }
    const trigger = triggerEl || document.querySelector(`.modal-tab-btn[data-modal-tab="${tabName}"]`);
    if (trigger) {
        trigger.classList.add('active');
    }
    if (typeof renderNpcModal === 'function') {
        renderNpcModal();
    }
}

// ===== MODALS =====

function openNPCModal() {
    switchView(4);
    if (typeof refreshSessionState === 'function') {
        refreshSessionState().then(() => {
            if (typeof renderNpcModal === 'function') {
                renderNpcModal();
            }
        });
    } else if (typeof renderNpcModal === 'function') {
        renderNpcModal();
    }
}

function openHireModal(preferredFacilityId = null) {
    const modal = document.getElementById('npc-modal');
    if (modal) {
        modal.classList.remove('hidden');
    }
    appState.hireFacilityPref = preferredFacilityId || null;
    appState.hireFacilityUserTouched = false;
    if (typeof refreshSessionState === 'function') {
        refreshSessionState().then(() => {
            if (typeof renderNpcModal === 'function') {
                renderNpcModal();
            }
        });
    } else if (typeof renderNpcModal === 'function') {
        renderNpcModal();
    }
}

function getEventHistoryList() {
    const session = appState && appState.session ? appState.session : {};
    if (Array.isArray(session.event_history)) {
        return session.event_history;
    }
    if (Array.isArray(session.EventHistory)) {
        return session.EventHistory;
    }
    if (Array.isArray(session.Eventhsitory)) {
        return session.Eventhsitory;
    }
    return [];
}

function renderEventHistoryModal() {
    const body = document.getElementById('event-history-body');
    const empty = document.getElementById('event-history-empty');
    const table = document.getElementById('event-history-table');
    if (!body) {
        return;
    }
    body.innerHTML = '';

    const entries = getEventHistoryList();
    if (!entries.length) {
        if (table) {
            table.classList.add('hidden');
        }
        if (empty) {
            empty.classList.remove('hidden');
        }
        return;
    }

    if (table) {
        table.classList.remove('hidden');
    }
    if (empty) {
        empty.classList.add('hidden');
    }

    entries.forEach(entry => {
        if (!entry || typeof entry !== 'object') {
            return;
        }
        const row = document.createElement('tr');
        const turnCell = document.createElement('td');
        const idCell = document.createElement('td');
        const textCell = document.createElement('td');

        const turnValue = entry.turn !== undefined && entry.turn !== null ? entry.turn : '?';
        const eventId = entry.event_id || entry.id || '-';
        const textValue = entry.text || '';

        turnCell.textContent = turnValue;
        idCell.textContent = eventId;
        textCell.textContent = textValue;

        row.appendChild(turnCell);
        row.appendChild(idCell);
        row.appendChild(textCell);
        body.appendChild(row);
    });
}

function openEventHistoryModal() {
    const modal = document.getElementById('event-history-modal');
    if (modal) {
        modal.classList.remove('hidden');
    }
    if (typeof refreshSessionState === 'function') {
        refreshSessionState().then(() => {
            renderEventHistoryModal();
        });
    } else {
        renderEventHistoryModal();
    }
}

function closeModal(modalId) {
    if (modalId === 'confirm-modal') {
        cancelConfirmModal();
        return;
    }
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
    }
}

// Close modal when clicking outside
window.addEventListener('click', function(event) {
    const modals = document.querySelectorAll('.modal:not(.hidden)');
    modals.forEach(modal => {
        if (event.target === modal) {
            if (modal.id === 'confirm-modal') {
                cancelConfirmModal();
                return;
            }
            modal.classList.add('hidden');
        }
    });
});

let pendingConfirmResolve = null;

function showConfirmModal(message, options = {}) {
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-title');
    const messageEl = document.getElementById('confirm-message');
    const okBtn = document.getElementById('confirm-ok');
    const cancelBtn = document.getElementById('confirm-cancel');
    if (!modal || !messageEl || !okBtn || !cancelBtn) {
        return Promise.resolve(false);
    }

    if (pendingConfirmResolve) {
        pendingConfirmResolve(false);
        pendingConfirmResolve = null;
    }

    if (titleEl) {
        titleEl.textContent = options.title || t('common.confirm_title');
    }
    messageEl.textContent = message || '';

    okBtn.textContent = options.okText || t('common.confirm_yes');
    cancelBtn.textContent = options.cancelText || t('common.confirm_no');

    if (!okBtn.dataset.bound) {
        okBtn.addEventListener('click', () => resolveConfirmModal(true));
        okBtn.dataset.bound = 'true';
    }
    if (!cancelBtn.dataset.bound) {
        cancelBtn.addEventListener('click', () => resolveConfirmModal(false));
        cancelBtn.dataset.bound = 'true';
    }

    modal.classList.remove('hidden');
    return new Promise(resolve => {
        pendingConfirmResolve = resolve;
    });
}

function resolveConfirmModal(result) {
    const modal = document.getElementById('confirm-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
    if (pendingConfirmResolve) {
        pendingConfirmResolve(result);
        pendingConfirmResolve = null;
    }
}

function cancelConfirmModal() {
    resolveConfirmModal(false);
}

function getCurrentFacilityName() {
    const nameEl = document.getElementById('detail-name');
    if (nameEl && nameEl.textContent && !nameEl.textContent.includes('[Facility')) {
        return nameEl.textContent.trim();
    }
    if (appState.selectedFacilityId !== null && appState.selectedFacilityId !== undefined) {
        return `[Facility ${appState.selectedFacilityId}]`;
    }
    return '*';
}

function getCurrentOrderName() {
    const orderEl = document.querySelector('#tab-orders .order-current strong');
    if (orderEl && orderEl.textContent) {
        return orderEl.textContent.trim();
    }
    return '';
}

function buildRollSourceId() {
    const facilityName = getCurrentFacilityName();
    const orderName = getCurrentOrderName();
    return orderName ? `${facilityName}: ${orderName}` : facilityName;
}

function formatAuditFallback(entry) {
    const parts = [];
    if (entry.event_type) parts.push(entry.event_type);
    if (entry.source_type) parts.push(entry.source_type);
    if (entry.source_id) parts.push(entry.source_id);
    if (entry.action) parts.push(entry.action);
    if (entry.roll && entry.roll !== '-') parts.push(`roll ${entry.roll}`);
    if (entry.changes) parts.push(entry.changes);
    return parts.join(' | ');
}

function renderAuditLog() {
    const logContent = document.getElementById('log-content');
    if (!logContent) return;

    const entries = appState.session.audit_log || [];
    logContent.innerHTML = '';

    if (entries.length === 0) {
        const placeholder = document.createElement('p');
        placeholder.className = 'log-entry event';
        placeholder.textContent = t('logs.empty');
        logContent.appendChild(placeholder);
        return;
    }

    const turns = [];
    entries.forEach(entry => {
        if (entry && Number.isInteger(entry.turn)) {
            turns.push(entry.turn);
        }
    });
    const uniqueTurns = Array.from(new Set(turns)).sort((a, b) => a - b);
    const lastTurns = uniqueTurns.slice(-3);
    let recent = lastTurns.length
        ? entries.filter(entry => entry && lastTurns.includes(entry.turn))
        : entries.slice(-20);
    if (recent.length > 100) {
        recent = recent.slice(-100);
    }

    recent.forEach(entry => {
        const result = (entry.result || '').toString().toLowerCase();
        let cssType = 'event';
        let extraClass = '';
        if (result.includes('success')) {
            cssType = 'success';
        } else if (result.includes('fail') || result.includes('error')) {
            cssType = 'fail';
        }
        if (entry.event_type === 'event' || result === 'event') {
            cssType = 'event';
            extraClass = 'event-highlight';
        }

        const line = document.createElement('p');
        line.className = `log-entry ${cssType} ${extraClass}`.trim();
        const icon = cssType === 'success' ? '✓' : (cssType === 'fail' ? '✗' : '⚠');
        const text = entry.log_text || formatAuditFallback(entry);
        const turn = entry.turn ?? appState.session.current_turn ?? appState.session.turn ?? 0;
        const turnLabel = `${turn}:`;
        const parts = [turnLabel, icon, text].filter(Boolean);
        line.textContent = parts.join(' ').trim();
        logContent.appendChild(line);
    });

    logContent.scrollTop = logContent.scrollHeight;
}

function updateTurnCounter() {
    const turn = (appState.session && (appState.session.current_turn ?? appState.session.turn)) || 0;
    const counter = document.querySelector('.turn-counter');
    if (counter) {
        counter.textContent = t('header.turn', { turn });
    }
    const badgeNumber = document.querySelector('.turn-number');
    if (badgeNumber) {
        badgeNumber.textContent = String(turn);
    }
    const badgeLabel = document.querySelector('.turn-label');
    if (badgeLabel) {
        badgeLabel.textContent = t('header.turn_label');
    }
}

function getSessionDisplayName(session) {
    if (!session || typeof session !== 'object') {
        return t('header.no_session');
    }
    const bastionName = session.bastion && session.bastion.name ? session.bastion.name : '';
    const sessionName = session.session_name || session.name || '';
    if (sessionName && bastionName) {
        return `${sessionName} (${bastionName})`;
    }
    return sessionName || bastionName || session.session_id || t('header.no_session');
}

function setHeaderSessionName(name) {
    const display = name || t('header.no_session');
    const nameEl = document.querySelector('.session-name');
    if (nameEl) {
        nameEl.textContent = display;
    }
    const titleEl = document.getElementById('session-title');
    if (titleEl) {
        titleEl.textContent = display;
    }
}

function updateSessionNamePlaceholder() {
    const session = appState && appState.session ? appState.session : null;
    const hasSession = !!(session && (session.session_id || (session.bastion && session.bastion.name)));
    if (!hasSession) {
        setHeaderSessionName(t('header.no_session'));
    }
}

function formatTurnsLong(turns) {
    if (!Number.isInteger(turns)) {
        return t('common.turn_unknown');
    }
    const key = turns === 1 ? 'common.turn_singular' : 'common.turn_plural';
    return t(key, { count: turns });
}

function formatTurnsShort(turns) {
    if (!Number.isInteger(turns)) {
        return t('common.turn_unknown');
    }
    const key = turns === 1 ? 'common.turn_short_singular' : 'common.turn_short_plural';
    return t(key, { count: turns });
}

function translateFacilityState(state) {
    const raw = state || 'unknown';
    const key = `status.${raw}`;
    const label = t(key);
    return label === key ? raw : label;
}

function getCurrencyOrder() {
    if (appState.currencyModel && Array.isArray(appState.currencyModel.types) && appState.currencyModel.types.length) {
        const factor = appState.currencyModel.factor_to_base || {};
        return [...appState.currencyModel.types].sort((a, b) => {
            const fa = typeof factor[a] === 'number' ? factor[a] : 0;
            const fb = typeof factor[b] === 'number' ? factor[b] : 0;
            return fb - fa;
        });
    }
    const wallet = appState.session && appState.session.bastion && appState.session.bastion.treasury;
    if (wallet && typeof wallet === 'object') {
        return Object.keys(wallet);
    }
    return [];
}

function formatCost(cost, currencyOrder = []) {
    if (!cost || typeof cost !== 'object') {
        return '?';
    }

    const order = currencyOrder.length ? currencyOrder : Object.keys(cost);
    const parts = [];
    const seen = new Set();

    order.forEach(currency => {
        seen.add(currency);
        const amount = cost[currency];
        if (typeof amount === 'number' && amount !== 0) {
            parts.push(`${amount} ${currency}`);
        }
    });

    Object.keys(cost).forEach(currency => {
        if (seen.has(currency)) {
            return;
        }
        const amount = cost[currency];
        if (typeof amount === 'number' && amount !== 0) {
            parts.push(`${amount} ${currency}`);
        }
    });

    if (parts.length === 0) {
        const anyKey = order.find(key => key in cost);
        if (anyKey) {
            return `0 ${anyKey}`.trim();
        }
        return '-';
    }

    return parts.join(', ');
}

function formatDuration(turns) {
    return formatTurnsLong(turns);
}

function getCurrencyModel() {
    return appState.currencyModel;
}

function formatBaseValue(baseValue) {
    const model = getCurrencyModel();
    if (typeof baseValue !== 'number') {
        return '?';
    }
    if (model && model.factor_to_base && Array.isArray(model.types)) {
        const normalized = normalizeBaseToWallet(baseValue, model);
        if (normalized) {
            return formatCost(normalized, getCurrencyOrder());
        }
    }
    const baseCurrency = model && model.base_currency ? model.base_currency : '';
    return `${baseValue} ${baseCurrency}`.trim();
}

function computeBaseValue(amounts, factorToBase) {
    if (!amounts || !factorToBase) {
        return null;
    }
    let total = 0;
    for (const [currency, amount] of Object.entries(amounts)) {
        if (typeof amount !== 'number') {
            continue;
        }
        const factor = factorToBase[currency];
        if (!factor) {
            return null;
        }
        total += amount * factor;
    }
    return total;
}

function normalizeBaseToWallet(baseValue, model) {
    if (!model || !model.factor_to_base || !Array.isArray(model.types)) {
        return null;
    }
    const factorToBase = model.factor_to_base;
    const baseCurrency = model.base_currency;
    const wallet = {};

    model.types.forEach(currency => {
        wallet[currency] = 0;
    });

    if (typeof baseValue !== 'number') {
        return wallet;
    }

    if (baseValue < 0) {
        const ordered = [...model.types].sort((a, b) => {
            const fa = factorToBase[a] || 0;
            const fb = factorToBase[b] || 0;
            return fb - fa;
        });
        let remaining = Math.abs(baseValue);
        ordered.forEach(currency => {
            const factor = factorToBase[currency] || 0;
            if (factor <= 0) {
                wallet[currency] = 0;
                return;
            }
            const amount = Math.floor(remaining / factor);
            remaining = remaining % factor;
            wallet[currency] = -amount;
        });
        return wallet;
    }

    const ordered = [...model.types].sort((a, b) => {
        const fa = factorToBase[a] || 0;
        const fb = factorToBase[b] || 0;
        return fb - fa;
    });

    let remaining = baseValue;
    ordered.forEach(currency => {
        const factor = factorToBase[currency] || 0;
        if (factor <= 0) {
            wallet[currency] = 0;
            return;
        }
        const amount = Math.floor(remaining / factor);
        remaining = remaining % factor;
        wallet[currency] = amount;
    });

    return wallet;
}

function formatFacilityUiName(facility, fallbackId = null) {
    if (facility && (facility.name || facility.id)) {
        return facility.name || facility.id;
    }
    return fallbackId || '[Facility]';
}

function getFacilityDisplayName(facilityId) {
    const def = appState.facilityById[facilityId];
    if (def && def.name) {
        return def.name;
    }
    return facilityId || '[Facility]';
}

function getFacilityBuildInfo(facility) {
    if (!facility || typeof facility !== 'object') {
        return { cost: null, duration: null };
    }
    const build = facility.build && typeof facility.build === 'object' ? facility.build : {};
    const cost = build.cost && typeof build.cost === 'object' ? build.cost : null;
    const duration = Number.isInteger(build.duration_turns) ? build.duration_turns : null;
    return { cost, duration };
}
