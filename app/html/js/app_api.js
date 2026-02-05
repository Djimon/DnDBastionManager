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
        }
    } catch (err) {
        logClient('error', `Failed to load currency model: ${err}`);
    }
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
