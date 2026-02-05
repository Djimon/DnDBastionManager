// ===== LOGGING UTILITY =====

function logClient(level, message) {
    console.log(`[${level.toUpperCase()}] ${message}`);
    if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.log_client(level, message).catch(err => {
            console.error('Failed to send log to server:', err);
        });
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
}

function switchTab(tabName) {
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
    event.target.classList.add('active');

}

function switchModalTab(tabName) {
    document.querySelectorAll('.modal-tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.modal-tab-btn').forEach(b => b.classList.remove('active'));
    
    const tabId = `modal-tab-${tabName}`;
    const tab = document.getElementById(tabId);
    if (tab) {
        tab.classList.add('active');
    }
    const trigger = (typeof event !== 'undefined' && event && event.target)
        ? event.target
        : document.querySelector(`.modal-tab-btn[data-modal-tab="${tabName}"]`);
    if (trigger) {
        trigger.classList.add('active');
    }
    if (typeof renderNpcModal === 'function') {
        renderNpcModal();
    }
}

// ===== MODALS =====

function openNPCModal() {
    const modal = document.getElementById('npc-modal');
    if (modal) {
        modal.classList.remove('hidden');
    }
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

function openHireModal() {
    const modal = document.getElementById('npc-modal');
    if (modal) {
        modal.classList.remove('hidden');
        switchModalTab('hire');
    }
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

function closeModal(modalId) {
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
            modal.classList.add('hidden');
        }
    });
});

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

function logAuditEvent(event) {
    const entry = event || {};
    if (entry.turn === undefined || entry.turn === null) {
        entry.turn = appState.session.current_turn || appState.session.turn || 0;
    }

    const log = appState.session.audit_log || [];
    log.push(entry);
    appState.session.audit_log = log;
    renderAuditLog();

    if (window.pywebview && window.pywebview.api && window.pywebview.api.add_audit_entry) {
        window.pywebview.api.add_audit_entry(entry).catch(err => {
            console.error('Failed to add audit entry:', err);
        });
    }
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

    const recent = entries.slice(-50);
    recent.forEach(entry => {
        const result = (entry.result || '').toString().toLowerCase();
        let cssType = 'event';
        if (result.includes('success')) {
            cssType = 'success';
        } else if (result.includes('fail') || result.includes('error')) {
            cssType = 'fail';
        }

        const line = document.createElement('p');
        line.className = `log-entry ${cssType}`;
        const turnText = entry.turn !== undefined ? t('logs.turn_label', { turn: entry.turn }) : t('logs.turn_unknown');
        const text = entry.log_text || formatAuditFallback(entry);
        line.textContent = `${turnText} ${text}`.trim();
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
}

function updateSessionNamePlaceholder() {
    const nameEl = document.querySelector('.session-name');
    if (!nameEl) {
        return;
    }
    const session = appState && appState.session ? appState.session : null;
    const hasSession = !!(session && (session.session_id || (session.bastion && session.bastion.name)));
    if (!hasSession) {
        nameEl.textContent = t('header.no_session');
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
        return appState.currencyModel.types;
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
