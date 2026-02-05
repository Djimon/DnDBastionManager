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
        loadNpcProgression();
        loadFacilityCatalog();
        if (typeof autoLoadLatestSession === 'function') {
            autoLoadLatestSession();
        }
    });
}

function validatePacks(showAlert = true) {
    if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.validate_packs().then(report => {
            const errors = (report && report.errors) ? report.errors : [];
            const warnings = (report && report.warnings) ? report.warnings : [];
            const configErrors = report && report.config && report.config.errors ? report.config.errors : [];
            const configWarnings = report && report.config && report.config.warnings ? report.config.warnings : [];
            let configSuffix = '';
            if (configErrors.length) {
                configSuffix += t('pack_validation.config_errors', { count: configErrors.length });
            }
            if (configWarnings.length) {
                configSuffix += t('pack_validation.config_warnings', { count: configWarnings.length });
            }
            const summary = t('pack_validation.summary', {
                errors: errors.length,
                warnings: warnings.length,
                config: configSuffix
            });

            logClient(errors.length ? "error" : (warnings.length ? "warn" : "info"), summary);

            if (showAlert) {
                if (errors.length === 0 && warnings.length === 0) {
                    alert(t('pack_validation.ok'));
                } else {
                    alert(`${summary}\n${t('pack_validation.details_in_log')}`);
                }
            }
        }).catch(err => {
            logClient("error", `Pack validation failed: ${err}`);
            if (showAlert) {
                alert(t('pack_validation.failed'));
            }
        });
    } else if (showAlert) {
        alert(t('alerts.pywebview_unavailable'));
    }
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

async function loadCurrencyModel() {
    if (!(window.pywebview && window.pywebview.api && window.pywebview.api.get_currency_model)) {
        return;
    }
    try {
        const model = await window.pywebview.api.get_currency_model();
        if (model && model.types) {
            appState.currencyModel = model;
            updateQueueDisplay();
            if (typeof renderTreasuryControls === 'function') {
                renderTreasuryControls();
            }
        }
    } catch (err) {
        logClient('error', `Failed to load currency model: ${err}`);
    }
}

async function autoSaveSession(reason = '') {
    if (!(window.pywebview && window.pywebview.api && window.pywebview.api.save_session)) {
        return;
    }
    try {
        const response = await window.pywebview.api.save_session(appState.session);
        if (!response || !response.success) {
            const message = response && response.message ? response.message : 'unknown error';
            logClient('warn', `Autosave failed${reason ? ` (${reason})` : ''}: ${message}`);
        } else {
            logClient('debug', `Autosave ok${reason ? ` (${reason})` : ''}`);
        }
    } catch (err) {
        logClient('warn', `Autosave failed${reason ? ` (${reason})` : ''}: ${err}`);
    }
}

let autosaveClickTimer = null;

function scheduleAutosaveFromClick(reason = 'button_click') {
    if (!(window.pywebview && window.pywebview.api && window.pywebview.api.save_session)) {
        return;
    }
    if (autosaveClickTimer) {
        clearTimeout(autosaveClickTimer);
    }
    autosaveClickTimer = setTimeout(() => {
        autosaveClickTimer = null;
        autoSaveSession(reason);
    }, 800);
}

document.addEventListener('click', event => {
    const button = event.target && event.target.closest ? event.target.closest('button') : null;
    if (!button) {
        return;
    }
    if (button.disabled) {
        return;
    }
    scheduleAutosaveFromClick('button_click');
});

async function loadFacilityCatalog() {
    if (!(window.pywebview && window.pywebview.api)) {
        return;
    }
    try {
        const facilityFiles = await window.pywebview.api.get_facilities();
        const catalog = [];
        const seenIds = new Set();

        if (Array.isArray(facilityFiles)) {
            for (const fileId of facilityFiles) {
                const rawId = String(fileId || '');
                let sourceHint = null;
                let packStem = rawId;
                const sepIndex = rawId.indexOf(':');
                if (sepIndex > 0) {
                    const candidate = rawId.slice(0, sepIndex);
                    if (candidate === 'core' || candidate === 'custom') {
                        sourceHint = candidate;
                        packStem = rawId.slice(sepIndex + 1);
                    }
                }
                const data = await window.pywebview.api.load_facility(fileId);
                if (!data || data.error) {
                    logClient('warn', `Failed to load facility pack ${fileId}: ${data && data.error ? data.error : 'unknown'}`);
                    continue;
                }
                const packId = data.pack_id || packStem || fileId;
                const packSource = data._pack_source || sourceHint || 'core';
                const facilities = Array.isArray(data.facilities) ? data.facilities : [];
                facilities.forEach(facility => {
                    if (!facility || typeof facility !== 'object') {
                        return;
                    }
                    if (!facility.id || typeof facility.id !== 'string') {
                        return;
                    }
                    if (seenIds.has(facility.id)) {
                        logClient('warn', `Duplicate facility id skipped: ${facility.id} (${packId})`);
                        return;
                    }
                    seenIds.add(facility.id);
                    const item = { ...facility, _pack_id: packId, _pack_source: packSource };
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
            if (typeof renderTreasuryControls === 'function') {
                renderTreasuryControls();
            }
            if (appState.selectedFacilityId && typeof renderInventoryPanel === 'function') {
                renderInventoryPanel();
            }
        }
    }
}

async function loadNpcProgression() {
    if (!(window.pywebview && window.pywebview.api && window.pywebview.api.get_npc_progression)) {
        return;
    }
    try {
        const progression = await window.pywebview.api.get_npc_progression();
        if (progression && typeof progression === 'object') {
            appState.npcProgression = progression;
        }
    } catch (err) {
        logClient('error', `Failed to load npc progression: ${err}`);
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
