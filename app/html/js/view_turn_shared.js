let inventoryManageOpen = false;

function openInventoryManage() {
    inventoryManageOpen = true;
    setFacilityPanelState(!!appState.selectedFacilityId);
    renderTreasuryControls();
}

function closeInventoryManage() {
    inventoryManageOpen = false;
    setFacilityPanelState(!!appState.selectedFacilityId);
}

function formatSigned(value) {
    if (!Number.isInteger(value)) {
        return value;
    }
    return value >= 0 ? `+${value}` : `${value}`;
}

function formatEffectEntries(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
        return t('orders.no_effects');
    }
    const effects = [];
    const logs = [];
    entries.forEach(entry => {
        if (!entry || typeof entry !== 'object') {
            return;
        }
        if (entry.type === 'currency') {
            effects.push(`${entry.currency} ${formatSigned(entry.delta)}`);
        } else if (entry.type === 'item') {
            effects.push(`${entry.item} ${formatSigned(entry.qty)}`);
        } else if (entry.type === 'stat') {
            effects.push(`${entry.stat} ${formatSigned(entry.delta)}`);
        } else if (entry.type === 'log' && entry.message) {
            logs.push(entry.message);
        }
    });
    let text = effects.length ? effects.join(', ') : t('orders.no_effects');
    if (logs.length) {
        text = `${text} | ${t('orders.log_prefix')} ${logs.join(' | ')}`;
    }
    return text;
}

function formatRawEffectEntries(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
        return t('orders.no_effects');
    }
    const effects = [];
    const logs = [];
    const currencyOrder = getCurrencyDisplayOrder();
    let eventChance = false;
    entries.forEach(entry => {
        if (!entry || typeof entry !== 'object') {
            return;
        }
        if (entry.event || entry.random_event) {
            eventChance = true;
        }
        if (entry.currency && Number.isInteger(entry.amount)) {
            effects.push(`${entry.currency} ${formatSigned(entry.amount)}`);
        }
        if (entry.item && Number.isInteger(entry.qty)) {
            effects.push(`${entry.item} ${formatSigned(entry.qty)}`);
        }
        if (entry.stat && Number.isInteger(entry.delta)) {
            effects.push(`${entry.stat} ${formatSigned(entry.delta)}`);
        }
        if (typeof entry.log === 'string') {
            logs.push(entry.log);
        }
        currencyOrder.forEach(currency => {
            if (Number.isInteger(entry[currency])) {
                effects.push(`${currency} ${formatSigned(entry[currency])}`);
            }
        });
    });
    if (eventChance) {
        effects.push(t('orders.event_chance'));
    }
    let text = effects.length ? effects.join(', ') : t('orders.no_effects');
    if (logs.length) {
        text = `${text} | ${t('orders.log_prefix')} ${logs.join(' | ')}`;
    }
    return text;
}

function formatOutcomeBucket(bucket) {
    switch (bucket) {
        case 'on_success':
            return t('orders.bucket_success');
        case 'on_failure':
            return t('orders.bucket_failure');
        case 'on_critical_success':
            return t('orders.bucket_critical_success');
        case 'on_critical_failure':
            return t('orders.bucket_critical_failure');
        default:
            return t('orders.bucket_unknown');
    }
}

function buildOrderResultSummary(facilityId, orderId, response) {
    const facilityDef = appState.facilityById[facilityId];
    const orderDef = facilityDef && Array.isArray(facilityDef.orders)
        ? facilityDef.orders.find(order => order && order.id === orderId)
        : null;
    const facilityName = formatFacilityUiName(facilityDef, facilityId);
    const orderName = orderDef ? (orderDef.name || orderDef.id) : orderId;
    const resultLabel = formatOutcomeBucket(response && response.bucket);
    const rollValue = response && response.roll !== undefined && response.roll !== null ? response.roll : null;
    const rollText = rollValue !== null ? t('orders.roll_label', { roll: rollValue }) : '';
    const resultText = rollText ? `${resultLabel} (${rollText})` : resultLabel;
    const effectsText = formatEffectEntries(response && response.entries);
    return t('orders.result_summary', {
        facility: facilityName,
        order: orderName,
        result: resultText,
        effects: effectsText
    });
}

function showToast(message, type = 'info', duration = 4500) {
    const container = document.getElementById('toast-container');
    if (!container) {
        return;
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'success' ? 'toast-success' : ''} ${type === 'warn' ? 'toast-warn' : ''} ${type === 'event' ? 'toast-event' : ''}`;

    const text = document.createElement('span');
    text.textContent = message;

    const close = document.createElement('button');
    close.className = 'toast-close';
    close.type = 'button';
    close.textContent = 'Ã—';
    close.addEventListener('click', () => toast.remove());

    toast.appendChild(text);
    toast.appendChild(close);
    container.appendChild(toast);

    if (duration > 0) {
        setTimeout(() => {
            toast.remove();
        }, duration);
    }
}

function handleEventNotifications(events) {
    if (!Array.isArray(events) || events.length === 0) {
        return;
    }
    events.forEach(event => {
        if (!event || typeof event !== 'object') {
            return;
        }
        const eventId = event.event_id || event.id || t('events.unknown_id');
        const text = event.text || '';
        const summary = t('events.toast', { id: eventId, text });
        showToast(summary, 'event', 8000);
    });
}

function getCurrencyDisplayOrder() {
    const model = getCurrencyModel();
    if (model && Array.isArray(model.types) && model.factor_to_base) {
        return [...model.types].sort((a, b) => {
            const fa = model.factor_to_base[a] || 0;
            const fb = model.factor_to_base[b] || 0;
            return fb - fa;
        });
    }
    return getCurrencyOrder();
}

function formatNpcLevel(level) {
    const value = parseInt(level, 10);
    if (value === 1) return t('modal.level_apprentice');
    if (value === 2) return t('modal.level_experienced');
    if (value === 3) return t('modal.level_master');
    return t('common.unknown');
}

function formatNpcXp(npc) {
    const xp = Number.isInteger(npc && npc.xp) ? npc.xp : 0;
    const level = parseInt(npc && npc.level, 10) || 1;
    if (level >= 3) {
        return `${xp}`;
    }
    const thresholds = getNpcProgression().level_thresholds || {};
    const target = level === 1 ? thresholds.apprentice_to_experienced : thresholds.experienced_to_master;
    return Number.isInteger(target) ? `${xp}/${target}` : `${xp}`;
}

function formatNpcUpkeep(upkeep) {
    if (!upkeep || typeof upkeep !== 'object') {
        return '-';
    }
    return formatCost(upkeep, getCurrencyOrder());
}

function toNumberSet(value) {
    const set = new Set();
    if (Array.isArray(value)) {
        value.forEach(item => {
            if (Number.isInteger(item)) {
                set.add(item);
            }
        });
    } else if (Number.isInteger(value)) {
        set.add(value);
    }
    return set;
}

function isNumericValue(value) {
    if (value === null || value === undefined) {
        return false;
    }
    if (typeof value === 'number') {
        return !Number.isNaN(value);
    }
    if (typeof value === 'string') {
        if (!value.trim()) {
            return false;
        }
        return !Number.isNaN(Number(value));
    }
    return false;
}

function isIntegerValue(value) {
    if (value === null || value === undefined) {
        return false;
    }
    if (typeof value === 'number') {
        return Number.isInteger(value);
    }
    if (typeof value === 'string') {
        if (!value.trim()) {
            return false;
        }
        const numeric = Number(value);
        return Number.isInteger(numeric);
    }
    return false;
}

function formatFormulaErrorMessage(message) {
    if (!message) {
        return 'unknown error';
    }
    if (message.includes('Formula inputs missing')) {
        return t('alerts.formula_inputs_missing');
    }
    if (message.includes('Formula not found')) {
        return t('alerts.formula_not_found');
    }
    return message;
}

function addLogEntry(message, type = 'success') {
    if (typeof logAuditEvent === 'function') {
        const entry = {
            event_type: type === 'event' ? 'event' : 'ui',
            source_type: 'ui',
            source_id: '*',
            action: '-',
            roll: '-',
            result: type,
            changes: '',
            log_text: message,
        };
        logAuditEvent(entry);
        return;
    }

    const logContent = document.getElementById('log-content');
    if (!logContent) {
        return;
    }
    const entryEl = document.createElement('p');
    entryEl.className = `log-entry ${type}`;
    const prefix = type === 'success' ? 'âœ“' : (type === 'fail' ? 'âœ—' : 'âš ');
    const turn = appState.session.current_turn ?? appState.session.turn ?? 0;
    entryEl.textContent = `${turn}: ${prefix} ${message}`;
    logContent.appendChild(entryEl);
    logContent.scrollTop = logContent.scrollHeight;
}

function saveSession() {
    if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.save_session(appState.session).then(response => {
            notifyUser(response.message);
        });
    } else {
        const sessionJson = JSON.stringify(appState.session, null, 2);
        console.log('Session saved:', sessionJson);
        notifyUser(t('alerts.session_saved_console'));
    }
}

function loadSession() {
    logClient('info', 'Opening load session dialog');
    
    if (window.pywebview && window.pywebview.api) {
        // Lade Liste der verfÃ¼gbaren Sessions
        window.pywebview.api.list_sessions().then(response => {
            if (!response.success || response.sessions.length === 0) {
                notifyUser(t('alerts.no_sessions_available'));
                return;
            }
            
            // Zeige Modal mit Session-Liste
            const sessionsList = document.getElementById('sessions-list');
            sessionsList.innerHTML = '';
            
            response.sessions.forEach(filename => {
                const div = document.createElement('div');
                div.className = 'session-item';
                div.style.cssText = 'padding: 10px; border: 1px solid #ccc; margin: 5px 0; cursor: pointer; border-radius: 4px;';

                const row = document.createElement('div');
                row.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';

                const nameEl = document.createElement('strong');
                nameEl.textContent = filename;

                const btn = document.createElement('button');
                btn.className = 'btn btn-primary btn-small';
                btn.type = 'button';
                btn.textContent = t('load_session.load_button');
                btn.addEventListener('click', () => loadSessionFile(filename));

                row.appendChild(nameEl);
                row.appendChild(btn);
                div.appendChild(row);
                sessionsList.appendChild(div);
            });
            
            const modal = document.getElementById('load-session-modal');
            modal.classList.remove('hidden');
        }).catch(err => {
            logClient('error', `Failed to load session list: ${err}`);
            notifyUser(t('alerts.load_session_error'));
        });
    } else {
        notifyUser(t('alerts.pywebview_unavailable'));
    }
}
