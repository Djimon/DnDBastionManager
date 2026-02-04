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
};

const BUILDABLE_TIER = 1;

// ===== INITIALIZATION =====

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOMContentLoaded fired - App initializing...');
    console.log('window.pywebview available:', !!window.pywebview);
    logClient('info', 'App initialized');
    switchView(1); // Start with View 1 (Wizard)
    renderAuditLog();
    updateQueueDisplay();
    initCatalogFilters();
});

// Zusätzlich: Warte auf pywebview wenn noch nicht ready
if (window.addEventListener && typeof window.pywebviewready === 'undefined') {
    window.addEventListener('pywebviewready', function() {
        console.log('PyWebView ready event fired');
        logClient('info', 'PyWebView connection established');
        validatePacks(false);
        loadCurrencyModel();
        loadFacilityCatalog();
    });
}

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
    
    event.target.classList.add('active');
}

// ===== MODALS =====

function openNPCModal() {
    const modal = document.getElementById('npc-modal');
    if (modal) {
        modal.classList.remove('hidden');
    }
}

function openHireModal() {
    const modal = document.getElementById('npc-modal');
    if (modal) {
        modal.classList.remove('hidden');
        switchModalTab('hire');
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

function validatePacks(showAlert = true) {
    if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.validate_packs().then(report => {
            const errors = (report && report.errors) ? report.errors : [];
            const warnings = (report && report.warnings) ? report.warnings : [];
            const configErrors = report && report.config && report.config.errors ? report.config.errors : [];
            const configWarnings = report && report.config && report.config.warnings ? report.config.warnings : [];
            const summary = `Pack Validation: ${errors.length} errors, ${warnings.length} warnings` +
                (configErrors.length ? ` | Config errors: ${configErrors.length}` : ``) +
                (configWarnings.length ? ` | Config warnings: ${configWarnings.length}` : ``);

            logClient(errors.length ? "error" : (warnings.length ? "warn" : "info"), summary);

            if (showAlert) {
                if (errors.length === 0 && warnings.length === 0) {
                    alert("Pack Validation: OK (0 errors, 0 warnings)");
                } else {
                    alert(summary + "\nDetails stehen im Log.");
                }
            }
        }).catch(err => {
            logClient("error", `Pack validation failed: ${err}`);
            if (showAlert) {
                alert("Pack Validation failed. Check logs.");
            }
        });
    } else if (showAlert) {
        alert("PyWebView not available");
    }
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
        placeholder.textContent = 'No log entries yet.';
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
        const turnText = entry.turn !== undefined ? `Turn ${entry.turn}` : 'Turn ?';
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
        counter.textContent = `Turn: ${turn}`;
    }
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
    if (!Number.isInteger(turns)) {
        return '? Turns';
    }
    return turns === 1 ? '1 Turn' : `${turns} Turns`;
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
        if (baseCurrency && baseCurrency in wallet) {
            wallet[baseCurrency] = baseValue;
        }
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

function getFacilityDisplayName(facilityId) {
    const def = appState.facilityById[facilityId];
    if (def && def.name) {
        return def.name;
    }
    return facilityId || '[Facility]';
}

async function loadCurrencyModel() {
    if (!(window.pywebview && window.pywebview.api && window.pywebview.api.get_currency_model)) {
        return;
    }
    try {
        const model = await window.pywebview.api.get_currency_model();
        if (model && model.types) {
            appState.currencyModel = model;
            updateQueueDisplay();
        }
    } catch (err) {
        logClient('error', `Failed to load currency model: ${err}`);
    }
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

function initCatalogFilters() {
    const search = document.getElementById('facility-search');
    const packFilter = document.getElementById('filter-pack');
    const tierFilter = document.getElementById('filter-tier');
    if (search) {
        search.addEventListener('input', applyCatalogFilters);
    }
    if (packFilter) {
        packFilter.addEventListener('change', applyCatalogFilters);
    }
    if (tierFilter) {
        tierFilter.addEventListener('change', applyCatalogFilters);
    }
}

function populateCatalogFilters() {
    const packFilter = document.getElementById('filter-pack');
    const tierFilter = document.getElementById('filter-tier');
    if (!packFilter || !tierFilter) {
        return;
    }

    const packs = new Set();
    const tiers = new Set();
    appState.facilityCatalog.forEach(facility => {
        if (facility && facility._pack_id) {
            packs.add(facility._pack_id);
        }
        if (facility && Number.isInteger(facility.tier)) {
            tiers.add(facility.tier);
        }
    });

    packFilter.innerHTML = '<option value="">Alle Packs</option>';
    Array.from(packs).sort().forEach(pack => {
        const option = document.createElement('option');
        option.value = pack;
        option.textContent = pack;
        packFilter.appendChild(option);
    });

    tierFilter.innerHTML = '<option value="">Alle Tiers</option>';
    Array.from(tiers).sort((a, b) => a - b).forEach(tier => {
        const option = document.createElement('option');
        option.value = tier;
        option.textContent = `Tier ${tier}`;
        tierFilter.appendChild(option);
    });

    if (Number.isInteger(BUILDABLE_TIER)) {
        const desired = String(BUILDABLE_TIER);
        if (Array.from(tierFilter.options).some(opt => opt.value === desired)) {
            tierFilter.value = desired;
        }
        tierFilter.disabled = true;
        tierFilter.title = 'Nur Tier 1 kann direkt gebaut werden. Höhere Tiers nur per Upgrade.';
    }
}

function applyCatalogFilters() {
    const search = document.getElementById('facility-search');
    const packFilter = document.getElementById('filter-pack');
    const tierFilter = document.getElementById('filter-tier');
    const term = search ? search.value.trim().toLowerCase() : '';
    const packValue = packFilter ? packFilter.value : '';
    const tierValue = tierFilter ? tierFilter.value : '';

    const filtered = appState.facilityCatalog.filter(facility => {
        if (!facility || typeof facility !== 'object') {
            return false;
        }
        if (Number.isInteger(BUILDABLE_TIER) && facility.tier !== BUILDABLE_TIER) {
            return false;
        }
        if (packValue && facility._pack_id !== packValue) {
            return false;
        }
        if (tierValue && String(facility.tier) !== tierValue) {
            return false;
        }
        if (!term) {
            return true;
        }
        const haystack = `${facility.name || ''} ${facility.id || ''} ${facility._pack_id || ''}`.toLowerCase();
        return haystack.includes(term);
    });

    renderFacilityCatalog(filtered);
}

function renderFacilityCatalog(items = null) {
    const list = document.getElementById('facility-list');
    if (!list) {
        return;
    }
    list.innerHTML = '';

    const facilities = items || appState.facilityCatalog;
    if (!facilities || facilities.length === 0) {
        const placeholder = document.createElement('div');
        placeholder.className = 'placeholder-item';
        placeholder.textContent = 'Keine Facilities gefunden.';
        list.appendChild(placeholder);
        return;
    }

    const currencyOrder = getCurrencyOrder();
    facilities.forEach(facility => {
        const item = document.createElement('div');
        item.className = 'placeholder-item';

        const title = document.createElement('strong');
        title.textContent = facility.name || facility.id || '[Facility]';

        const info = document.createElement('p');
        const buildInfo = getFacilityBuildInfo(facility);
        const costText = formatCost(buildInfo.cost, currencyOrder);
        const durationText = formatDuration(buildInfo.duration);
        const slotsText = Number.isInteger(facility.npc_slots) ? `Slots: ${facility.npc_slots}` : 'Slots: ?';
        info.textContent = `${costText} | ${durationText} | ${slotsText}`;

        const button = document.createElement('button');
        button.className = 'btn btn-small';
        button.textContent = '+ Add to Queue';
        button.addEventListener('click', () => addToQueue(facility.id));

        item.appendChild(title);
        item.appendChild(info);
        item.appendChild(button);
        list.appendChild(item);
    });
}

async function loadFacilityCatalog() {
    if (!(window.pywebview && window.pywebview.api)) {
        return;
    }
    try {
        const facilityFiles = await window.pywebview.api.get_facilities();
        const catalog = [];

        if (Array.isArray(facilityFiles)) {
            for (const fileId of facilityFiles) {
                const data = await window.pywebview.api.load_facility(fileId);
                if (!data || data.error) {
                    logClient('warn', `Failed to load facility pack ${fileId}: ${data && data.error ? data.error : 'unknown'}`);
                    continue;
                }
                const packId = data.pack_id || fileId;
                const facilities = Array.isArray(data.facilities) ? data.facilities : [];
                facilities.forEach(facility => {
                    if (!facility || typeof facility !== 'object') {
                        return;
                    }
                    const item = { ...facility, _pack_id: packId };
                    catalog.push(item);
                });
            }
        }

        appState.facilityCatalog = catalog;
        appState.facilityById = {};
        catalog.forEach(facility => {
            if (facility && facility.id) {
                appState.facilityById[facility.id] = facility;
            }
        });

        populateCatalogFilters();
        applyCatalogFilters();
        refreshFacilityStates();
    } catch (err) {
        logClient('error', `Failed to load facility catalog: ${err}`);
    }
}

async function refreshSessionState() {
    if (window.pywebview && window.pywebview.api && window.pywebview.api.get_current_session) {
        const state = await window.pywebview.api.get_current_session();
        if (state && Object.keys(state).length > 0) {
            appState.session = state;
            updateTurnCounter();
            updateQueueDisplay();
        }
    }
}

async function refreshFacilityStates() {
    if (!(window.pywebview && window.pywebview.api && window.pywebview.api.get_facility_states)) {
        return;
    }
    try {
        const response = await window.pywebview.api.get_facility_states();
        if (response && response.success) {
            appState.facilityStates = response.states || [];
            renderFacilityStates();
        }
    } catch (err) {
        logClient('error', `Failed to refresh facility states: ${err}`);
    }
}

function renderFacilityStates() {
    const list = document.getElementById('facilities-left-panel');
    if (!list) {
        return;
    }
    list.innerHTML = '';

    if (!appState.facilityStates || appState.facilityStates.length === 0) {
        const placeholder = document.createElement('div');
        placeholder.className = 'facility-list-item';
        placeholder.textContent = 'Keine Facilities gebaut.';
        list.appendChild(placeholder);
        return;
    }

    appState.facilityStates.forEach(state => {
        const item = document.createElement('div');
        item.className = 'facility-list-item';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'facility-name';
        nameSpan.textContent = getFacilityDisplayName(state.facility_id);

        const statusSpan = document.createElement('span');
        statusSpan.className = 'facility-status';
        const statusLabel = state.state || 'unknown';
        statusSpan.textContent = `[${statusLabel}]`;

        item.appendChild(nameSpan);
        item.appendChild(statusSpan);
        item.addEventListener('click', () => selectFacility(state.facility_id, item));
        list.appendChild(item);
    });
}

// ===== VIEW 1: SESSION WIZARD =====

function addPlayer() {
    const name = document.getElementById('player-name').value;
    const className = document.getElementById('player-class').value;
    const level = document.getElementById('player-level').value || '1';
    
    if (!name || !className) {
        alert('Please fill in Name and Class');
        return;
    }
    
    const playersList = document.getElementById('players-list');
    const playerDiv = document.createElement('div');
    playerDiv.className = 'player-item';
    playerDiv.innerHTML = `
        <span>${name} (${className}, Level ${level})</span>
        <button class="btn btn-danger btn-small" onclick="removePlayer(this)">Remove</button>
    `;
    playersList.appendChild(playerDiv);
    
    // Add to state
    appState.session.players.push({ name, class: className, level: parseInt(level) });
    
    // Clear inputs
    document.getElementById('player-name').value = '';
    document.getElementById('player-class').value = '';
    document.getElementById('player-level').value = '';
}

function removePlayer(element) {
    element.parentElement.remove();
}

function createSession() {
    const dmName = document.getElementById('dm-name').value;
    const sessionName = document.getElementById('session-name').value;
    const bastionName = document.getElementById('bastion-name').value;
    const bastionLocation = document.getElementById('bastion-location').value;
    const bastionDescription = document.getElementById('bastion-description').value;
    
    logClient('info', `Creating session: ${sessionName} with bastion: ${bastionName}`);
    
    if (!dmName || !sessionName || !bastionName) {
        logClient('warn', 'Form incomplete - missing required fields');
        alert('Please fill in DM Name, Session Name and Bastion Name');
        return;
    }
    
    // Sammle Players
    const playerElements = document.querySelectorAll('.player-item');
    const players = Array.from(playerElements).map(el => {
        const text = el.querySelector('span').textContent;
        const match = text.match(/(.+?)\s*\((.+?),\s*Level\s+(\d+)\)/);
        if (match) {
            return {
                name: match[1],
                class: match[2],
                level: parseInt(match[3])
            };
        }
        return null;
    }).filter(p => p !== null);
    
    logClient('debug', `Calling API with ${players.length} players`);
    
    // Rufe API auf
    if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.create_session(
            sessionName, bastionName, bastionLocation, bastionDescription, dmName, players
        ).then(response => {
            if (response.success) {
                logClient('info', 'Session created successfully');
                appState.session = response.session_state;
                renderAuditLog();
                updateTurnCounter();
                updateQueueDisplay();
                loadCurrencyModel();
                loadFacilityCatalog();
                refreshFacilityStates();
                document.querySelector('.session-name').textContent = 
                    `${sessionName} (${bastionName})`;
                alert('Session created!');
                switchView(2);
            } else {
                logClient('error', `Session creation failed: ${response.message}`);
                alert('Error: ' + response.message);
            }
        }).catch(err => {
            logClient('error', `API call error: ${err}`);
            alert('API Error: ' + err);
        });
    } else {
        // Fallback: lokales Frontend-Only Testing
        appState.session.name = `${sessionName} (${bastionName})`;
        appState.session.dm_name = dmName;
        appState.session.bastion = { 
            name: bastionName, 
            location: bastionLocation, 
            description: bastionDescription 
        };
        appState.session.players = players;
        
        document.querySelector('.session-name').textContent = `${sessionName} (${bastionName})`;
        renderAuditLog();
        updateTurnCounter();
        updateQueueDisplay();
        loadCurrencyModel();
        alert('Session created (local mode)');
        switchView(2);
    }
}

// ===== VIEW 2: BUILD QUEUE =====

function addToQueue(facilityId) {
    const facility = appState.facilityById[facilityId];
    if (!facility) {
        logClient('warn', `Unknown facility id in queue: ${facilityId}`);
        return;
    }
    if (Number.isInteger(BUILDABLE_TIER) && facility.tier !== BUILDABLE_TIER) {
        alert('Nur Tier 1 kann direkt gebaut werden. Höhere Tiers bitte upgraden.');
        return;
    }
    appState.buildQueue.push({
        id: facilityId
    });
    updateQueueDisplay();
}

function removeFromQueue(index) {
    if (!Number.isInteger(index)) {
        return;
    }
    appState.buildQueue.splice(index, 1);
    updateQueueDisplay();
}

function clearQueue() {
    appState.buildQueue = [];
    updateQueueDisplay();
}

function sumQueueCosts() {
    const total = {};
    appState.buildQueue.forEach(entry => {
        const facility = appState.facilityById[entry.id];
        const buildInfo = getFacilityBuildInfo(facility);
        const cost = buildInfo.cost;
        if (!cost || typeof cost !== 'object') {
            return;
        }
        Object.keys(cost).forEach(currency => {
            const amount = cost[currency];
            if (typeof amount !== 'number') {
                return;
            }
            total[currency] = (total[currency] || 0) + amount;
        });
    });
    return total;
}

function sumQueueCostsBase(factorToBase) {
    if (!factorToBase) {
        return null;
    }
    let total = 0;
    for (const entry of appState.buildQueue) {
        const facility = appState.facilityById[entry.id];
        const buildInfo = getFacilityBuildInfo(facility);
        const cost = buildInfo.cost;
        if (!cost || typeof cost !== 'object') {
            continue;
        }
        for (const [currency, amount] of Object.entries(cost)) {
            if (typeof amount !== 'number') {
                continue;
            }
            const factor = factorToBase[currency];
            if (!factor) {
                return null;
            }
            total += amount * factor;
        }
    }
    return total;
}

function computeRemainingBudget(totalCost) {
    const wallet = appState.session && appState.session.bastion && appState.session.bastion.treasury;
    if (!wallet || typeof wallet !== 'object') {
        return {};
    }
    const remaining = {};
    Object.keys(wallet).forEach(currency => {
        const amount = wallet[currency];
        if (typeof amount !== 'number') {
            return;
        }
        remaining[currency] = amount - (totalCost[currency] || 0);
    });
    return remaining;
}

function updateQueueDisplay() {
    const queueList = document.getElementById('queue-list');
    if (!queueList) {
        return;
    }
    queueList.innerHTML = '';

    if (appState.buildQueue.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'queue-item';
        empty.textContent = 'Queue ist leer.';
        queueList.appendChild(empty);
    }

    const currencyOrder = getCurrencyOrder();
    appState.buildQueue.forEach((entry, index) => {
        const facility = appState.facilityById[entry.id];
        const name = facility ? (facility.name || entry.id) : entry.id;
        const buildInfo = getFacilityBuildInfo(facility);
        const costText = formatCost(buildInfo.cost, currencyOrder);
        const durationText = formatDuration(buildInfo.duration);
        const item = document.createElement('div');
        item.className = 'queue-item';
        item.innerHTML = `
            <div class="queue-item-info">
                <strong>${name}</strong>
                <p>${costText} | ${durationText}</p>
            </div>
            <button class="btn btn-danger" onclick="removeFromQueue(${index})">Remove</button>
        `;
        queueList.appendChild(item);
    });

    const totalCost = sumQueueCosts();
    let totalCostText = formatCost(totalCost, currencyOrder);
    let remainingText = formatCost(computeRemainingBudget(totalCost), currencyOrder);

    const model = getCurrencyModel();
    if (model && model.factor_to_base) {
        const totalBase = sumQueueCostsBase(model.factor_to_base);
        const wallet = appState.session && appState.session.bastion && appState.session.bastion.treasury;
        const treasuryBase = (appState.session && appState.session.bastion && typeof appState.session.bastion.treasury_base === 'number')
            ? appState.session.bastion.treasury_base
            : computeBaseValue(wallet, model.factor_to_base);

        if (typeof totalBase === 'number') {
            const normalizedTotal = normalizeBaseToWallet(totalBase, model);
            if (normalizedTotal) {
                totalCostText = formatCost(normalizedTotal, currencyOrder);
            }
        }

        if (typeof totalBase === 'number' && typeof treasuryBase === 'number') {
            const remainingBase = treasuryBase - totalBase;
            const normalizedRemaining = normalizeBaseToWallet(remainingBase, model);
            if (normalizedRemaining) {
                const suffix = remainingBase < 0 ? ' (Override!)' : '';
                remainingText = `${formatCost(normalizedRemaining, currencyOrder)}${suffix}`;
            }
        }
    }

    const totalCostEl = document.getElementById('total-cost');
    const remainingEl = document.getElementById('remaining-budget');
    if (totalCostEl) {
        totalCostEl.textContent = totalCostText;
    }
    if (remainingEl) {
        remainingEl.textContent = remainingText;
    }
}

async function startBuilding() {
    if (appState.buildQueue.length === 0) {
        alert('Add facilities to queue first');
        return;
    }

    if (!(window.pywebview && window.pywebview.api)) {
        alert('PyWebView not available');
        return;
    }

    const remainingQueue = [];
    const errors = [];
    let builtCount = 0;

    for (const entry of appState.buildQueue) {
        const facilityId = entry.id;
        const facilityName = getFacilityDisplayName(facilityId);
        let response = await window.pywebview.api.add_build_facility(facilityId, false);

        if (response && response.requires_confirmation) {
            let detail = '';
            if (typeof response.projected_treasury_base === 'number') {
                const projectedText = formatBaseValue(response.projected_treasury_base);
                const shortfallText = formatBaseValue(Math.abs(response.projected_treasury_base));
                detail = `Ergebnis nach Bau: ${projectedText}\nÜberschreitung: ${shortfallText}\n`;
            }
            const confirmText = `Nicht genug Budget für ${facilityName}.\n${detail}Trotzdem bauen?`;
            const proceed = confirm(confirmText);
            if (!proceed) {
                remainingQueue.push(entry);
                continue;
            }
            response = await window.pywebview.api.add_build_facility(facilityId, true);
        }

        if (!response || !response.success) {
            const message = response && response.message ? response.message : 'unknown error';
            errors.push(`${facilityName}: ${message}`);
            remainingQueue.push(entry);
            continue;
        }

        builtCount += 1;
    }

    appState.buildQueue = remainingQueue;
    await refreshSessionState();
    updateQueueDisplay();
    await refreshFacilityStates();

    if (errors.length) {
        alert(`Build errors:\n${errors.join('\n')}`);
    }
    if (builtCount > 0) {
        switchView(3); // Go to Turn Console
    }
}

// ===== VIEW 3: TURN CONSOLE =====

function selectFacility(facilityId, element = null) {
    appState.selectedFacilityId = facilityId;

    document.querySelectorAll('.facility-list-item').forEach(item => item.classList.remove('active'));
    const targetEl = element || (typeof event !== 'undefined' ? event.target.closest('.facility-list-item') : null);
    if (targetEl) {
        targetEl.classList.add('active');
    }

    const facility = appState.facilityById[facilityId];
    const state = (appState.facilityStates || []).find(entry => entry.facility_id === facilityId);
    const entry = (appState.session && appState.session.bastion && appState.session.bastion.facilities || [])
        .find(item => item && item.facility_id === facilityId);

    const nameEl = document.getElementById('detail-name');
    const descEl = document.getElementById('detail-desc');
    const tierEl = document.getElementById('detail-tier');
    const slotsEl = document.getElementById('detail-slots');
    const statusEl = document.getElementById('detail-status');

    if (nameEl) {
        nameEl.textContent = facility ? (facility.name || facilityId) : facilityId;
    }
    if (descEl) {
        descEl.textContent = facility ? (facility.description || '-') : '-';
    }
    if (tierEl) {
        const tier = facility && Number.isInteger(facility.tier) ? facility.tier : null;
        tierEl.textContent = tier ? '★'.repeat(tier) : '?';
    }
    if (slotsEl) {
        const slots = facility && Number.isInteger(facility.npc_slots) ? facility.npc_slots : null;
        const assigned = entry && Array.isArray(entry.assigned_npcs) ? entry.assigned_npcs.length : null;
        if (slots !== null && assigned !== null) {
            slotsEl.textContent = `${assigned}/${slots}`;
        } else if (slots !== null) {
            slotsEl.textContent = `${slots}`;
        } else {
            slotsEl.textContent = '?';
        }
    }
    if (statusEl) {
        statusEl.textContent = state && state.state ? state.state : 'unknown';
    }

    updateUpgradeSection(facilityId);
}

function updateUpgradeSection(facilityId) {
    const infoEl = document.getElementById('upgrade-info');
    const buttonEl = document.getElementById('upgrade-button');
    if (!infoEl || !buttonEl) {
        return;
    }

    const target = appState.facilityCatalog.find(facility => facility && facility.parent === facilityId);
    appState.selectedUpgradeTargetId = target ? target.id : null;

    if (!target) {
        infoEl.textContent = 'No upgrade available';
        buttonEl.textContent = 'Upgrade';
        buttonEl.disabled = true;
        return;
    }

    const buildInfo = getFacilityBuildInfo(target);
    const costText = formatCost(buildInfo.cost, getCurrencyOrder());
    const durationText = formatDuration(buildInfo.duration);
    infoEl.textContent = `Cost: ${costText} | Duration: ${durationText}`;
    buttonEl.textContent = `Upgrade to ${target.name || target.id}`;
    buttonEl.disabled = false;
}

async function startUpgrade() {
    const facilityId = appState.selectedFacilityId;
    if (!facilityId) {
        alert('Select a facility first.');
        return;
    }
    if (!(window.pywebview && window.pywebview.api)) {
        alert('PyWebView not available');
        return;
    }

    let response = await window.pywebview.api.add_upgrade_facility(facilityId, false);
    if (response && response.requires_confirmation) {
        const facilityName = getFacilityDisplayName(facilityId);
        let detail = '';
        if (typeof response.projected_treasury_base === 'number') {
            const projectedText = formatBaseValue(response.projected_treasury_base);
            const shortfallText = formatBaseValue(Math.abs(response.projected_treasury_base));
            detail = `Ergebnis nach Upgrade: ${projectedText}\nÜberschreitung: ${shortfallText}\n`;
        }
        const proceed = confirm(`Nicht genug Budget für ${facilityName}.\n${detail}Trotzdem upgraden?`);
        if (!proceed) {
            return;
        }
        response = await window.pywebview.api.add_upgrade_facility(facilityId, true);
    }

    if (!response || !response.success) {
        const message = response && response.message ? response.message : 'unknown error';
        alert(`Upgrade failed: ${message}`);
        return;
    }

    await refreshSessionState();
    await refreshFacilityStates();
    selectFacility(facilityId);
}

function resolveOrder() {
    const manualRoll = document.getElementById('manual-roll').value;
    if (!manualRoll) {
        alert('Enter or roll a value');
        return;
    }
    
    const sourceId = buildRollSourceId();
    logAuditEvent({
        event_type: "roll",
        source_type: "facility",
        source_id: sourceId,
        action: "resolve_order",
        roll: String(manualRoll),
        result: "resolved",
        log_text: `${sourceId} rolled ${manualRoll}`
    });
    alert(`Resolved order with roll: ${manualRoll}`);
    addLogEntry('Order resolved', 'success');
}

function autoRoll() {
    const roll = Math.floor(Math.random() * 20) + 1;
    document.getElementById('manual-roll').value = roll;
    const sourceId = buildRollSourceId();
    logAuditEvent({
        event_type: "roll",
        source_type: "facility",
        source_id: sourceId,
        action: "auto_roll",
        roll: String(roll),
        result: "rolled",
        log_text: `${sourceId} rolled ${roll}`
    });
}

async function advanceTurn() {
    if (window.pywebview && window.pywebview.api && window.pywebview.api.advance_turn) {
        const response = await window.pywebview.api.advance_turn();
        if (!response || !response.success) {
            alert(`Advance turn failed: ${response && response.message ? response.message : 'unknown error'}`);
            return;
        }
        appState.session.current_turn = response.current_turn;
        updateTurnCounter();
        await refreshSessionState();
        await refreshFacilityStates();

        const completed = response.completed || [];
        if (completed.length) {
            const names = completed.map(entry => getFacilityDisplayName(entry.facility_id)).join(', ');
            addLogEntry(`Turn ${response.current_turn} advanced (completed: ${names})`, 'event');
        } else {
            addLogEntry(`Turn ${response.current_turn} advanced`, 'event');
        }
    } else {
        appState.session.turn++;
        updateTurnCounter();
        addLogEntry(`Turn ${appState.session.turn} advanced`, 'event');
    }
}

function addLogEntry(message, type = 'success') {
    const logContent = document.getElementById('log-content');
    const entry = document.createElement('p');
    entry.className = `log-entry ${type}`;
    
    const prefix = type === 'success' ? '✓' : (type === 'fail' ? '✗' : '⚠');
    entry.textContent = `${prefix} ${message}`;
    
    logContent.appendChild(entry);
    logContent.scrollTop = logContent.scrollHeight;
}

function saveSession() {
    if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.save_session(appState.session).then(response => {
            alert(response.message);
        });
    } else {
        const sessionJson = JSON.stringify(appState.session, null, 2);
        console.log('Session saved:', sessionJson);
        alert('Session saved (see console)');
    }
}

function loadSession() {
    logClient('info', 'Opening load session dialog');
    
    if (window.pywebview && window.pywebview.api) {
        // Lade Liste der verfügbaren Sessions
        window.pywebview.api.list_sessions().then(response => {
            if (!response.success || response.sessions.length === 0) {
                alert('No sessions available');
                return;
            }
            
            // Zeige Modal mit Session-Liste
            const sessionsList = document.getElementById('sessions-list');
            sessionsList.innerHTML = '';
            
            response.sessions.forEach(filename => {
                const div = document.createElement('div');
                div.className = 'session-item';
                div.style.cssText = 'padding: 10px; border: 1px solid #ccc; margin: 5px 0; cursor: pointer; border-radius: 4px;';
                div.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <strong>${filename}</strong>
                        <button class="btn btn-primary btn-small" onclick="loadSessionFile('${filename}')">Load</button>
                    </div>
                `;
                sessionsList.appendChild(div);
            });
            
            const modal = document.getElementById('load-session-modal');
            modal.classList.remove('hidden');
        }).catch(err => {
            logClient('error', `Failed to load session list: ${err}`);
            alert('Error loading sessions');
        });
    } else {
        alert('PyWebView not available');
    }
}

function loadSessionFile(filename) {
    logClient('info', `Loading session: ${filename}`);
    
    if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.load_session(filename).then(response => {
            if (response.success) {
                logClient('info', `Session loaded successfully: ${filename}`);
                appState.session = response.session_state;
                renderAuditLog();
                updateTurnCounter();
                updateQueueDisplay();
                loadCurrencyModel();
                loadFacilityCatalog();
                refreshFacilityStates();
                document.querySelector('.session-name').textContent = 
                    filename.replace('session_', '').replace('.json', '');
                alert(`Session loaded: ${filename}`);
                closeModal('load-session-modal');
                switchView(3);  // Gehe zu Turn Console
            } else {
                logClient('error', `Failed to load session: ${response.message}`);
                alert('Error: ' + response.message);
            }
        }).catch(err => {
            logClient('error', `Failed to load session file: ${err}`);
            alert('Error: ' + err);
        });
    } else {
        alert('PyWebView not available');
    }
}

// ===== NPC MANAGEMENT =====

function fireNPC() {
    alert('Fire NPC - placeholder');
}

function hireNPC() {
    const name = document.getElementById('hire-name').value;
    const profession = document.getElementById('hire-profession').value;
    const level = document.getElementById('hire-level').value;
    const upkeep = document.getElementById('hire-upkeep').value;
    const facility = document.getElementById('hire-facility').value;
    
    if (!name || !upkeep) {
        alert('Fill in Name and Upkeep');
        return;
    }
    
    appState.session.npcs.push({ name, profession, level, upkeep, facility });
    alert(`Hired ${name}!`);
    closeModal('npc-modal');
}

console.log('App.js loaded - all functions ready');
