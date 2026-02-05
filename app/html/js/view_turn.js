function renderFacilityStates() {
    const list = document.getElementById('facilities-left-panel');
    if (!list) {
        return;
    }
    list.innerHTML = '';

    if (!appState.facilityStates || appState.facilityStates.length === 0) {
        const placeholder = document.createElement('div');
        placeholder.className = 'facility-list-item';
        placeholder.textContent = t('facility.none_built');
        list.appendChild(placeholder);
        appState.selectedFacilityId = null;
        setFacilityPanelState(false);
        return;
    }

    if (appState.selectedFacilityId) {
        const hasSelection = appState.facilityStates.some(entry => entry.facility_id === appState.selectedFacilityId);
        if (!hasSelection) {
            appState.selectedFacilityId = null;
            setFacilityPanelState(false);
        }
    } else {
        setFacilityPanelState(false);
    }

    appState.facilityStates.forEach(state => {
        const item = document.createElement('div');
        item.className = 'facility-list-item';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'facility-name';
        const facilityDef = appState.facilityById[state.facility_id];
        nameSpan.textContent = formatFacilityUiName(facilityDef, state.facility_id);

        const statusSpan = document.createElement('span');
        statusSpan.className = 'facility-status';
        let statusLabel = translateFacilityState(state.state);
        if (Number.isInteger(state.remaining_turns) && ['building', 'upgrading', 'busy'].includes(state.state)) {
            statusLabel = `${statusLabel} ${formatTurnsShort(state.remaining_turns)}`;
        }
        statusSpan.textContent = `[${statusLabel}]`;

        item.appendChild(nameSpan);
        item.appendChild(statusSpan);
        item.addEventListener('click', () => selectFacility(state.facility_id, item));
        list.appendChild(item);
    });
}

// ===== VIEW 3: TURN CONSOLE =====

function selectFacility(facilityId, element = null) {
    appState.selectedFacilityId = facilityId;
    setFacilityPanelState(true);

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
        nameEl.textContent = formatFacilityUiName(facility, facilityId);
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
            slotsEl.textContent = t('common.unknown');
        }
    }
    if (statusEl) {
        const rawStatus = state && state.state ? state.state : 'unknown';
        let statusText = translateFacilityState(rawStatus);
        if (state && Number.isInteger(state.remaining_turns) && ['building', 'upgrading', 'busy'].includes(rawStatus)) {
            statusText = `${statusText} (${formatTurnsLong(state.remaining_turns)})`;
        }
        statusEl.textContent = statusText;
    }

    updateUpgradeSection(facilityId);
    renderSlotBubbles(facility, entry);
    renderNpcTab(facilityId);
    renderOrdersPanel(facilityId);
    renderInventoryPanel();
}

function setFacilityPanelState(hasSelection) {
    const empty = document.getElementById('facility-empty');
    const main = document.getElementById('facility-main');
    const inventory = document.getElementById('inventory-panel');
    if (empty) {
        empty.classList.toggle('hidden', hasSelection);
    }
    if (main) {
        main.classList.toggle('hidden', !hasSelection);
    }
    if (inventory) {
        inventory.classList.remove('hidden');
    }
}

function getFacilityEntry(facilityId) {
    const facilities = (appState.session && appState.session.bastion && appState.session.bastion.facilities) || [];
    return facilities.find(item => item && item.facility_id === facilityId) || null;
}

function getFacilityOrders(entry) {
    if (!entry) {
        return [];
    }
    if (Array.isArray(entry.current_orders)) {
        return entry.current_orders;
    }
    if (entry.current_order && typeof entry.current_order === 'object') {
        return [entry.current_order];
    }
    return [];
}

function isOrderActive(order) {
    if (!order || typeof order !== 'object') {
        return false;
    }
    const status = order.status || 'in_progress';
    return status === 'in_progress' || status === 'ready';
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

function toggleTreasuryPanel() {
    const panel = document.getElementById('treasury-panel');
    if (!panel) {
        return;
    }
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
        renderTreasuryControls();
    }
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
        alert(t('treasury.invalid'));
        return;
    }

    const wallet = appState.session && appState.session.bastion && appState.session.bastion.treasury
        ? appState.session.bastion.treasury
        : {};
    const currentValue = Number.isInteger(wallet[currency]) ? wallet[currency] : 0;
    let delta = amount;
    if (mode === 'remove') {
        delta = -amount;
    } else if (mode !== 'add') {
        alert(t('treasury.invalid'));
        return;
    }
    if (delta === 0) {
        showToast(t('treasury.no_change'), 'warn');
        return;
    }

    if (!(window.pywebview && window.pywebview.api && window.pywebview.api.apply_effects)) {
        alert(t('alerts.pywebview_unavailable'));
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
        alert(t('treasury.failed'));
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
    close.textContent = '×';
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

function getNpcProgression() {
    return appState.npcProgression || {
        xp_per_success: 1,
        level_thresholds: {
            apprentice_to_experienced: 5,
            experienced_to_master: 10
        }
    };
}

function getCurrencyDisplayOrder() {
    const model = appState.currencyModel;
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

function facilityAllowsProfession(facilityDef, profession) {
    const allowed = facilityDef && Array.isArray(facilityDef.npc_allowed_professions)
        ? facilityDef.npc_allowed_professions
        : null;
    if (!allowed || allowed.length === 0) {
        return true;
    }
    return allowed.includes(profession);
}

function getFacilityFreeSlots(entry, def) {
    const slots = def && Number.isInteger(def.npc_slots) ? def.npc_slots : 0;
    const assigned = entry && Array.isArray(entry.assigned_npcs) ? entry.assigned_npcs.length : 0;
    return slots - assigned;
}

function getFacilityOptionsForProfession(profession, excludeFacilityId = null) {
    const facilities = (appState.session && appState.session.bastion && appState.session.bastion.facilities) || [];
    const options = [];
    facilities.forEach(entry => {
        if (!entry || !entry.facility_id) {
            return;
        }
        if (excludeFacilityId && entry.facility_id === excludeFacilityId) {
            return;
        }
        const def = appState.facilityById[entry.facility_id];
        if (!def) {
            return;
        }
        if (!facilityAllowsProfession(def, profession)) {
            return;
        }
        const free = getFacilityFreeSlots(entry, def);
        if (free <= 0) {
            return;
        }
        const name = formatFacilityUiName(def, entry.facility_id);
        const slotsText = Number.isInteger(def.npc_slots) ? `${def.npc_slots - free}/${def.npc_slots}` : '';
        const label = slotsText ? `${name} (${slotsText})` : name;
        options.push({ id: entry.facility_id, label });
    });
    return options;
}

function npcHasActiveOrder(facilityEntry, npcId) {
    if (!facilityEntry || !npcId) {
        return false;
    }
    return getFacilityOrders(facilityEntry).some(order => order && order.npc_id === npcId && isOrderActive(order));
}

function getDiceSides(checkProfile) {
    if (!checkProfile || typeof checkProfile !== 'string') {
        return null;
    }
    if (!checkProfile.startsWith('d')) {
        return null;
    }
    let digits = '';
    for (let i = 1; i < checkProfile.length; i += 1) {
        const ch = checkProfile[i];
        if (ch >= '0' && ch <= '9') {
            digits += ch;
        } else {
            break;
        }
    }
    const sides = parseInt(digits, 10);
    return Number.isInteger(sides) ? sides : null;
}

function renderSlotBubbles(facility, entry) {
    const bubbles = document.getElementById('detail-slot-bubbles');
    if (!bubbles) {
        return;
    }
    bubbles.innerHTML = '';
    const total = facility && Number.isInteger(facility.npc_slots) ? facility.npc_slots : 0;
    if (!total) {
        return;
    }
    const activeOrders = getFacilityOrders(entry).filter(isOrderActive);
    const used = activeOrders.length;
    for (let i = 0; i < total; i += 1) {
        const bubble = document.createElement('span');
        bubble.className = i < used ? 'slot-bubble filled' : 'slot-bubble';
        bubbles.appendChild(bubble);
    }
}

function updateUpgradeSection(facilityId) {
    const infoEl = document.getElementById('upgrade-info');
    const buttonEl = document.getElementById('upgrade-button');
    if (!infoEl || !buttonEl) {
        return;
    }

    const target = appState.facilityCatalog.find(facility => facility && facility.parent === facilityId);
    appState.selectedUpgradeTargetId = target ? target.id : null;
    const stateEntry = (appState.facilityStates || []).find(entry => entry.facility_id === facilityId);
    const currentStateRaw = stateEntry && stateEntry.state ? stateEntry.state : 'unknown';
    const currentStateLabel = translateFacilityState(currentStateRaw);
    const isFree = currentStateRaw === 'free';

    if (!target) {
        infoEl.textContent = t('upgrade.no_available');
        buttonEl.textContent = t('upgrade.button');
        buttonEl.disabled = true;
        return;
    }

    const buildInfo = getFacilityBuildInfo(target);
    const costText = formatCost(buildInfo.cost, getCurrencyOrder());
    const durationText = formatDuration(buildInfo.duration);
    infoEl.textContent = t('upgrade.cost_duration_status', {
        cost: costText,
        duration: durationText,
        status: currentStateLabel
    });
    buttonEl.textContent = t('upgrade.to', { name: formatFacilityUiName(target, target && target.id) });
    buttonEl.disabled = !isFree;
}

function renderOrdersPanel(facilityId) {
    const npcSelect = document.getElementById('order-npc-select');
    const orderSelect = document.getElementById('order-select');
    const hint = document.getElementById('order-new-hint');
    const list = document.getElementById('orders-list');
    const evalAllBtn = document.getElementById('orders-evaluate-all');
    if (!npcSelect || !orderSelect || !list) {
        return;
    }

    const facility = appState.facilityById[facilityId];
    const entry = getFacilityEntry(facilityId);
    const assignedNpcs = entry && Array.isArray(entry.assigned_npcs) ? entry.assigned_npcs : [];
    const orders = facility && Array.isArray(facility.orders) ? facility.orders : [];
    const existingOrders = getFacilityOrders(entry);

    npcSelect.innerHTML = '';
    if (assignedNpcs.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = t('orders.no_npc_assigned');
        npcSelect.appendChild(opt);
        npcSelect.disabled = true;
    } else {
        npcSelect.disabled = false;
        assignedNpcs.forEach(npc => {
            const opt = document.createElement('option');
            opt.value = npc.npc_id;
            opt.textContent = npc.name || npc.npc_id;
            npcSelect.appendChild(opt);
        });
    }

    function populateOrdersForNpc() {
        orderSelect.innerHTML = '';
        const selectedNpc = assignedNpcs.find(npc => npc.npc_id === npcSelect.value);
        const npcLevel = selectedNpc && Number.isInteger(selectedNpc.level) ? selectedNpc.level : 1;
        const filtered = orders.filter(order => {
            if (!order || typeof order !== 'object') {
                return false;
            }
            const minLevel = Number.isInteger(order.min_npc_level) ? order.min_npc_level : 1;
            return npcLevel >= minLevel;
        });
        if (filtered.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = t('orders.no_orders_available');
            orderSelect.appendChild(opt);
            orderSelect.disabled = true;
        } else {
            orderSelect.disabled = false;
            filtered.forEach(order => {
                const opt = document.createElement('option');
                opt.value = order.id;
                opt.textContent = order.name || order.id;
                orderSelect.appendChild(opt);
            });
        }
    }

    function updateOrderPreview() {
        const previewBody = document.getElementById('order-preview-body');
        if (!previewBody) {
            return;
        }
        previewBody.innerHTML = '';
        const selectedOrderId = orderSelect.value;
        const orderDef = orders.find(order => order && order.id === selectedOrderId);
        if (!orderDef || !orderDef.outcome) {
            const placeholder = document.createElement('p');
            placeholder.className = 'placeholder';
            placeholder.textContent = t('orders.outcome_placeholder');
            previewBody.appendChild(placeholder);
            return;
        }
        const outcome = orderDef.outcome || {};
        const buckets = ['on_success', 'on_critical_success', 'on_failure', 'on_critical_failure'];
        let hasLines = false;
        buckets.forEach(bucket => {
            const block = outcome[bucket];
            if (!block || typeof block !== 'object') {
                return;
            }
            const effects = block.effects;
            if (!Array.isArray(effects)) {
                return;
            }
            const line = document.createElement('p');
            line.className = 'order-preview-line';
            line.textContent = `${formatOutcomeBucket(bucket)}: ${formatRawEffectEntries(effects)}`;
            previewBody.appendChild(line);
            hasLines = true;
        });
        if (!hasLines) {
            const placeholder = document.createElement('p');
            placeholder.className = 'placeholder';
            placeholder.textContent = t('orders.outcome_placeholder');
            previewBody.appendChild(placeholder);
        }
    }

    npcSelect.onchange = () => {
        populateOrdersForNpc();
        updateOrderPreview();
    };
    orderSelect.onchange = updateOrderPreview;
    populateOrdersForNpc();
    updateOrderPreview();

    if (hint) {
        hint.textContent = '';
    }

    if (evalAllBtn) {
        evalAllBtn.disabled = true;
    }

    list.innerHTML = '';
    if (!existingOrders.length) {
        const empty = document.createElement('div');
        empty.className = 'order-item';
        empty.textContent = t('orders.none_active');
        list.appendChild(empty);
        return;
    }

    let hasEvaluatable = false;

    existingOrders.forEach(order => {
        if (!order || typeof order !== 'object') {
            return;
        }
        const orderDef = orders.find(o => o && o.id === order.order_id);
        const outcome = orderDef && typeof orderDef.outcome === 'object' ? orderDef.outcome : null;
        const checkProfile = outcome && outcome.check_profile ? outcome.check_profile : null;
        const diceSides = checkProfile ? getDiceSides(checkProfile) : null;
        const npc = assignedNpcs.find(n => n && n.npc_id === order.npc_id);
        const orderName = orderDef ? (orderDef.name || orderDef.id) : order.order_id;
        const npcName = npc ? (npc.name || npc.npc_id) : (order.npc_name || order.npc_id);
        const status = order.status || (order.progress >= order.duration_turns ? 'ready' : 'in_progress');
        const statusLabel = status === 'ready' ? t('orders.ready_label') : t('orders.in_progress_label');

        const duration = Number.isInteger(order.duration_turns) ? order.duration_turns : 0;
        const progress = Number.isInteger(order.progress) ? order.progress : 0;
        const remaining = Math.max(duration - progress, 0);

        const item = document.createElement('div');
        item.className = 'order-item';

        const header = document.createElement('div');
        header.className = 'order-item-header';

        const title = document.createElement('strong');
        title.textContent = orderName || '[Order]';

        const meta = document.createElement('span');
        meta.className = 'order-meta';
        meta.textContent = `${npcName || '-'} - ${statusLabel}`;

        header.appendChild(title);
        header.appendChild(meta);

        const detail = document.createElement('div');
        detail.className = 'order-meta';
        detail.textContent = t('orders.remaining', { turns: formatTurnsLong(remaining) });

        item.appendChild(header);
        item.appendChild(detail);

        if (status === 'ready') {
            const actions = document.createElement('div');
            actions.className = 'order-actions';

            const evalBtn = document.createElement('button');
            evalBtn.className = 'btn btn-primary btn-small';
            evalBtn.textContent = t('orders.resolve');
            evalBtn.disabled = !!checkProfile && !order.roll_locked;
            evalBtn.addEventListener('click', () => evaluateOrder(order.order_id));

            const rollInfo = document.createElement('span');
            rollInfo.className = 'order-meta';
            rollInfo.textContent = order.roll_locked ? t('orders.roll_locked') : '';

            if (checkProfile) {
                const rollInput = document.createElement('input');
                rollInput.type = 'number';
                rollInput.min = '1';
                rollInput.max = diceSides ? String(diceSides) : '20';
                rollInput.placeholder = diceSides ? String(Math.ceil(diceSides / 2)) : '15';
                rollInput.value = order.roll_locked && Number.isInteger(order.roll) ? order.roll : '';
                rollInput.disabled = !!order.roll_locked;

                const lockBtn = document.createElement('button');
                lockBtn.className = 'btn btn-secondary btn-small';
                lockBtn.textContent = t('orders.lock_roll');
                lockBtn.disabled = !!order.roll_locked;
                lockBtn.addEventListener('click', () => lockOrderRoll(order.order_id, rollInput.value));

                const autoBtn = document.createElement('button');
                autoBtn.className = 'btn btn-secondary btn-small';
                autoBtn.textContent = t('orders.auto_roll');
                autoBtn.disabled = !!order.roll_locked;
                autoBtn.addEventListener('click', () => lockOrderRoll(order.order_id, null, true));

                actions.appendChild(rollInput);
                actions.appendChild(lockBtn);
                actions.appendChild(autoBtn);
            }
            actions.appendChild(evalBtn);
            actions.appendChild(rollInfo);

            item.appendChild(actions);

            if (!checkProfile || order.roll_locked) {
                hasEvaluatable = true;
            }
        }

        list.appendChild(item);
    });

    if (evalAllBtn) {
        evalAllBtn.disabled = !hasEvaluatable;
    }
}

function renderNpcTab(facilityId) {
    const tbody = document.getElementById('npc-assigned-body');
    const empty = document.getElementById('npc-assigned-empty');
    if (!tbody) {
        return;
    }
    tbody.innerHTML = '';
    const entry = getFacilityEntry(facilityId);
    const assigned = entry && Array.isArray(entry.assigned_npcs) ? entry.assigned_npcs : [];

    if (empty) {
        empty.classList.toggle('hidden', assigned.length > 0);
    }

    assigned.forEach(npc => {
        if (!npc || typeof npc !== 'object') {
            return;
        }
        const tr = document.createElement('tr');

        const nameTd = document.createElement('td');
        nameTd.textContent = npc.name || npc.npc_id || '-';
        tr.appendChild(nameTd);

        const professionTd = document.createElement('td');
        professionTd.textContent = npc.profession || '-';
        tr.appendChild(professionTd);

        const levelTd = document.createElement('td');
        levelTd.textContent = formatNpcLevel(npc.level);
        tr.appendChild(levelTd);

        const xpTd = document.createElement('td');
        xpTd.textContent = formatNpcXp(npc);
        tr.appendChild(xpTd);

        const upkeepTd = document.createElement('td');
        upkeepTd.textContent = formatNpcUpkeep(npc.upkeep);
        tr.appendChild(upkeepTd);

        const actionTd = document.createElement('td');
        const actions = document.createElement('div');
        actions.className = 'npc-actions';

        const moveSelect = document.createElement('select');
        const reserveOption = document.createElement('option');
        reserveOption.value = '';
        reserveOption.textContent = t('npcs.reserve');
        moveSelect.appendChild(reserveOption);

        const options = getFacilityOptionsForProfession(npc.profession, facilityId);
        options.forEach(opt => {
            const optionEl = document.createElement('option');
            optionEl.value = opt.id;
            optionEl.textContent = opt.label;
            moveSelect.appendChild(optionEl);
        });

        const moveBtn = document.createElement('button');
        moveBtn.className = 'btn btn-secondary btn-small';
        moveBtn.textContent = t('npcs.move');
        moveBtn.addEventListener('click', () => {
            moveNpc(npc.npc_id, moveSelect.value || null);
        });

        const fireBtn = document.createElement('button');
        fireBtn.className = 'btn btn-danger btn-small';
        fireBtn.textContent = t('npcs.fire');
        fireBtn.addEventListener('click', () => {
            fireNpc(npc.npc_id);
        });

        const hasActive = npcHasActiveOrder(entry, npc.npc_id);
        if (hasActive) {
            moveSelect.disabled = true;
            moveBtn.disabled = true;
            fireBtn.disabled = true;
            moveSelect.title = t('npcs.blocked_active_order');
            moveBtn.title = t('npcs.blocked_active_order');
            fireBtn.title = t('npcs.blocked_active_order');
        }

        actions.appendChild(moveSelect);
        actions.appendChild(moveBtn);
        actions.appendChild(fireBtn);
        actionTd.appendChild(actions);
        tr.appendChild(actionTd);

        tbody.appendChild(tr);
    });
}

function renderNpcModal() {
    renderNpcModalHired();
    renderNpcModalReserve();
    renderHireNpcForm();
}

function renderInventoryPanel() {
    const panel = document.getElementById('inventory-panel');
    const walletEl = document.getElementById('inventory-wallet');
    const groupsEl = document.getElementById('inventory-groups');
    const empty = document.getElementById('inventory-empty');
    if (!panel || !groupsEl) {
        return;
    }
    groupsEl.innerHTML = '';
    const inventory = appState.session && appState.session.bastion && Array.isArray(appState.session.bastion.inventory)
        ? appState.session.bastion.inventory
        : [];

    const wallet = appState.session && appState.session.bastion && appState.session.bastion.treasury
        ? appState.session.bastion.treasury
        : {};
    if (walletEl) {
        let displayWallet = wallet;
        let baseValue = appState.session && appState.session.bastion
            ? appState.session.bastion.treasury_base
            : null;
        if (!Number.isInteger(baseValue) && appState.currencyModel) {
            baseValue = computeBaseValue(wallet, appState.currencyModel.factor_to_base);
        }
        if (Number.isInteger(baseValue) && appState.currencyModel) {
            const normalized = normalizeBaseToWallet(baseValue, appState.currencyModel);
            if (normalized) {
                displayWallet = normalized;
            }
        }
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
                const value = Number.isInteger(displayWallet[currency]) ? displayWallet[currency] : 0;
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

    if (empty) {
        empty.classList.toggle('hidden', inventory.length > 0);
    }

    const groups = {};
    inventory.forEach(entry => {
        if (!entry || typeof entry !== 'object') {
            return;
        }
        const itemName = entry.item || '';
        const base = itemName.includes('_') ? itemName.split('_')[0] : t('inventory.group_misc');
        if (!groups[base]) {
            groups[base] = [];
        }
        groups[base].push(entry);
    });

    const groupNames = Object.keys(groups).sort((a, b) => a.localeCompare(b));
    groupNames.forEach(groupName => {
        const details = document.createElement('details');
        details.className = 'inventory-group';
        details.open = true;

        const summary = document.createElement('summary');
        summary.textContent = `${groupName} (${groups[groupName].length})`;
        details.appendChild(summary);

        groups[groupName]
            .sort((a, b) => (a.item || '').localeCompare(b.item || ''))
            .forEach(entry => {
                const row = document.createElement('div');
                row.className = 'inventory-item';
                const name = document.createElement('span');
                name.textContent = entry.item || '-';
                const qty = document.createElement('span');
                qty.textContent = Number.isInteger(entry.qty) ? entry.qty : '-';
                row.appendChild(name);
                row.appendChild(qty);
                details.appendChild(row);
            });

        groupsEl.appendChild(details);
    });
}

function renderNpcModalHired() {
    const body = document.getElementById('modal-npcs-body');
    const totalEl = document.getElementById('modal-total-upkeep');
    if (!body) {
        return;
    }
    body.innerHTML = '';

    const bastion = appState.session && appState.session.bastion ? appState.session.bastion : {};
    const facilities = Array.isArray(bastion.facilities) ? bastion.facilities : [];
    const unassigned = Array.isArray(bastion.npcs_unassigned) ? bastion.npcs_unassigned : [];
    const rows = [];

    facilities.forEach(entry => {
        if (!entry || !entry.facility_id) {
            return;
        }
        const assigned = Array.isArray(entry.assigned_npcs) ? entry.assigned_npcs : [];
        assigned.forEach(npc => {
            rows.push({ npc, facility_id: entry.facility_id });
        });
    });
    unassigned.forEach(npc => {
        rows.push({ npc, facility_id: null });
    });

    const totalUpkeep = {};
    rows.forEach(row => {
        const npc = row.npc;
        if (!npc || typeof npc !== 'object') {
            return;
        }
        if (npc.upkeep && typeof npc.upkeep === 'object') {
            Object.keys(npc.upkeep).forEach(currency => {
                const amount = npc.upkeep[currency];
                if (!Number.isInteger(amount)) {
                    return;
                }
                totalUpkeep[currency] = (totalUpkeep[currency] || 0) + amount;
            });
        }

        const tr = document.createElement('tr');
        const nameTd = document.createElement('td');
        nameTd.textContent = npc.name || npc.npc_id || '-';
        tr.appendChild(nameTd);

        const facilityTd = document.createElement('td');
        if (row.facility_id) {
            facilityTd.textContent = getFacilityDisplayName(row.facility_id);
        } else {
            facilityTd.textContent = t('npcs.reserve');
        }
        tr.appendChild(facilityTd);

        const professionTd = document.createElement('td');
        professionTd.textContent = npc.profession || '-';
        tr.appendChild(professionTd);

        const levelTd = document.createElement('td');
        levelTd.textContent = formatNpcLevel(npc.level);
        tr.appendChild(levelTd);

        const xpTd = document.createElement('td');
        xpTd.textContent = formatNpcXp(npc);
        tr.appendChild(xpTd);

        const upkeepTd = document.createElement('td');
        upkeepTd.textContent = formatNpcUpkeep(npc.upkeep);
        tr.appendChild(upkeepTd);

        const actionTd = document.createElement('td');
        const actions = document.createElement('div');
        actions.className = 'npc-actions';

        const moveSelect = document.createElement('select');
        const reserveOption = document.createElement('option');
        reserveOption.value = '';
        reserveOption.textContent = t('npcs.reserve');
        moveSelect.appendChild(reserveOption);

        const options = getFacilityOptionsForProfession(npc.profession, row.facility_id);
        options.forEach(opt => {
            const optionEl = document.createElement('option');
            optionEl.value = opt.id;
            optionEl.textContent = opt.label;
            moveSelect.appendChild(optionEl);
        });
        if (!row.facility_id && options.length) {
            moveSelect.value = options[0].id;
        }

        const moveBtn = document.createElement('button');
        moveBtn.className = 'btn btn-secondary btn-small';
        moveBtn.textContent = t('npcs.move');
        moveBtn.addEventListener('click', () => {
            moveNpc(npc.npc_id, moveSelect.value || null);
        });

        const fireBtn = document.createElement('button');
        fireBtn.className = 'btn btn-danger btn-small';
        fireBtn.textContent = t('npcs.fire');
        fireBtn.addEventListener('click', () => {
            fireNpc(npc.npc_id);
        });

        const facilityEntry = row.facility_id ? getFacilityEntry(row.facility_id) : null;
        const hasActive = facilityEntry ? npcHasActiveOrder(facilityEntry, npc.npc_id) : false;
        const moveBlocked = !row.facility_id && options.length === 0;
        if (moveBlocked) {
            moveSelect.disabled = true;
            moveBtn.disabled = true;
        }
        if (hasActive) {
            moveSelect.disabled = true;
            moveBtn.disabled = true;
            fireBtn.disabled = true;
            moveSelect.title = t('npcs.blocked_active_order');
            moveBtn.title = t('npcs.blocked_active_order');
            fireBtn.title = t('npcs.blocked_active_order');
        }

        actions.appendChild(moveSelect);
        actions.appendChild(moveBtn);
        actions.appendChild(fireBtn);
        actionTd.appendChild(actions);
        tr.appendChild(actionTd);

        body.appendChild(tr);
    });

    if (totalEl) {
        if (Object.keys(totalUpkeep).length === 0) {
            const order = getCurrencyOrder();
            if (order.length) {
                totalUpkeep[order[0]] = 0;
            }
        }
        totalEl.textContent = t('modal.total_upkeep', { amount: formatCost(totalUpkeep, getCurrencyOrder()) });
    }
}

function renderNpcModalReserve() {
    const body = document.getElementById('modal-reserve-body');
    const empty = document.getElementById('modal-reserve-empty');
    if (!body) {
        return;
    }
    body.innerHTML = '';

    const bastion = appState.session && appState.session.bastion ? appState.session.bastion : {};
    const unassigned = Array.isArray(bastion.npcs_unassigned) ? bastion.npcs_unassigned : [];

    if (empty) {
        empty.classList.toggle('hidden', unassigned.length > 0);
    }

    unassigned.forEach(npc => {
        if (!npc || typeof npc !== 'object') {
            return;
        }
        const tr = document.createElement('tr');
        const nameTd = document.createElement('td');
        nameTd.textContent = npc.name || npc.npc_id || '-';
        tr.appendChild(nameTd);

        const professionTd = document.createElement('td');
        professionTd.textContent = npc.profession || '-';
        tr.appendChild(professionTd);

        const levelTd = document.createElement('td');
        levelTd.textContent = formatNpcLevel(npc.level);
        tr.appendChild(levelTd);

        const xpTd = document.createElement('td');
        xpTd.textContent = formatNpcXp(npc);
        tr.appendChild(xpTd);

        const upkeepTd = document.createElement('td');
        upkeepTd.textContent = formatNpcUpkeep(npc.upkeep);
        tr.appendChild(upkeepTd);

        const actionTd = document.createElement('td');
        const actions = document.createElement('div');
        actions.className = 'npc-actions';

        const moveSelect = document.createElement('select');
        const options = getFacilityOptionsForProfession(npc.profession, null);
        options.forEach(opt => {
            const optionEl = document.createElement('option');
            optionEl.value = opt.id;
            optionEl.textContent = opt.label;
            moveSelect.appendChild(optionEl);
        });
        if (options.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = t('npcs.no_facility_available');
            moveSelect.appendChild(opt);
            moveSelect.disabled = true;
        }

        const moveBtn = document.createElement('button');
        moveBtn.className = 'btn btn-secondary btn-small';
        moveBtn.textContent = t('npcs.move');
        moveBtn.disabled = options.length === 0;
        moveBtn.addEventListener('click', () => {
            moveNpc(npc.npc_id, moveSelect.value || null);
        });

        const fireBtn = document.createElement('button');
        fireBtn.className = 'btn btn-danger btn-small';
        fireBtn.textContent = t('npcs.fire');
        fireBtn.addEventListener('click', () => {
            fireNpc(npc.npc_id);
        });

        actions.appendChild(moveSelect);
        actions.appendChild(moveBtn);
        actions.appendChild(fireBtn);
        actionTd.appendChild(actions);
        tr.appendChild(actionTd);

        body.appendChild(tr);
    });
}

function renderHireNpcForm() {
    const professionSelect = document.getElementById('hire-profession');
    const professionCustomWrap = document.getElementById('hire-profession-custom-wrap');
    const professionCustomInput = document.getElementById('hire-profession-custom');
    const upkeepCurrency = document.getElementById('hire-upkeep-currency');
    const assignSelect = document.getElementById('hire-assign-facility');

    if (!professionSelect || !upkeepCurrency || !assignSelect) {
        return;
    }

    const professions = new Set();
    (appState.facilityCatalog || []).forEach(facility => {
        if (facility && Array.isArray(facility.npc_allowed_professions)) {
            facility.npc_allowed_professions.forEach(p => {
                if (p) professions.add(p);
            });
        }
    });
    const sorted = Array.from(professions).sort();
    professionSelect.innerHTML = '';
    sorted.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p;
        professionSelect.appendChild(opt);
    });
    const customOpt = document.createElement('option');
    customOpt.value = 'custom';
    customOpt.textContent = t('modal.profession_custom');
    professionSelect.appendChild(customOpt);

    let currencyOrder = getCurrencyOrder();
    if (!currencyOrder || currencyOrder.length === 0) {
        currencyOrder = ['[Curr]'];
    }
    upkeepCurrency.innerHTML = '';
    currencyOrder.forEach(curr => {
        const opt = document.createElement('option');
        opt.value = curr;
        opt.textContent = curr;
        upkeepCurrency.appendChild(opt);
    });

    function updateProfessionCustom() {
        const isCustom = professionSelect.value === 'custom';
        if (professionCustomWrap) {
            professionCustomWrap.classList.toggle('hidden', !isCustom);
        }
        if (!isCustom && professionCustomInput) {
            professionCustomInput.value = '';
        }
        updateAssignOptions();
    }

    function updateAssignOptions() {
        const profession = professionSelect.value === 'custom'
            ? (professionCustomInput && professionCustomInput.value ? professionCustomInput.value.trim() : '')
            : professionSelect.value;
        assignSelect.innerHTML = '';

        const reserveOpt = document.createElement('option');
        reserveOpt.value = '';
        reserveOpt.textContent = t('npcs.reserve');
        assignSelect.appendChild(reserveOpt);

        if (profession) {
            const options = getFacilityOptionsForProfession(profession, null);
            options.forEach(opt => {
                const optionEl = document.createElement('option');
                optionEl.value = opt.id;
                optionEl.textContent = opt.label;
                assignSelect.appendChild(optionEl);
            });
        }
        updateUpkeepHint(assignSelect.value);
    }

    function updateUpkeepHint(facilityId) {
        const hint = document.getElementById('hire-upkeep-hint');
        if (!hint) {
            return;
        }
        if (!facilityId) {
            hint.textContent = '';
            return;
        }
        const def = appState.facilityById[facilityId];
        if (def && def.npc_base_upkeep && typeof def.npc_base_upkeep === 'object') {
            hint.textContent = t('modal.upkeep_hint', { amount: formatCost(def.npc_base_upkeep, getCurrencyOrder()) });
        } else {
            hint.textContent = '';
        }
    }

    if (!professionSelect.dataset.bound) {
        professionSelect.addEventListener('change', updateProfessionCustom);
        if (professionCustomInput) {
            professionCustomInput.addEventListener('input', updateAssignOptions);
        }
        assignSelect.addEventListener('change', () => updateUpkeepHint(assignSelect.value));
        professionSelect.dataset.bound = 'true';
    }

    updateProfessionCustom();
    updateAssignOptions();
}

async function startOrder() {
    const facilityId = appState.selectedFacilityId;
    const npcSelect = document.getElementById('order-npc-select');
    const orderSelect = document.getElementById('order-select');
    if (!facilityId || !npcSelect || !orderSelect) {
        return;
    }
    const npcId = npcSelect.value;
    const orderId = orderSelect.value;
    if (!npcId || npcSelect.disabled) {
        alert(t('alerts.order_start_failed', { message: t('orders.no_npc_assigned') }));
        return;
    }
    if (!orderId || orderSelect.disabled) {
        alert(t('alerts.order_start_failed', { message: t('orders.no_orders_available') }));
        return;
    }
    if (!(window.pywebview && window.pywebview.api && window.pywebview.api.start_order)) {
        alert(t('alerts.pywebview_unavailable'));
        return;
    }
    const response = await window.pywebview.api.start_order(facilityId, npcId, orderId);
    if (!response || !response.success) {
        alert(t('alerts.order_start_failed', { message: response && response.message ? response.message : 'unknown error' }));
        return;
    }
    await refreshSessionState();
    await refreshFacilityStates();
    renderOrdersPanel(facilityId);
    renderSlotBubbles(appState.facilityById[facilityId], getFacilityEntry(facilityId));
    addLogEntry(t('alerts.order_start_success'), 'event');
}

async function lockOrderRoll(orderId, rollValue, auto = false) {
    const facilityId = appState.selectedFacilityId;
    if (!(window.pywebview && window.pywebview.api && window.pywebview.api.lock_order_roll)) {
        alert(t('alerts.pywebview_unavailable'));
        return;
    }
    const rollNumber = rollValue !== null && rollValue !== undefined && rollValue !== '' ? parseInt(rollValue, 10) : null;
    const response = await window.pywebview.api.lock_order_roll(facilityId, orderId, rollNumber, auto);
    if (!response || !response.success) {
        alert(t('alerts.roll_lock_failed', { message: response && response.message ? response.message : 'unknown error' }));
        return;
    }
    await refreshSessionState();
    renderOrdersPanel(facilityId);
    addLogEntry(t('alerts.roll_locked'), 'event');
}

async function evaluateOrder(orderId) {
    const facilityId = appState.selectedFacilityId;
    if (!(window.pywebview && window.pywebview.api && window.pywebview.api.evaluate_order)) {
        alert(t('alerts.pywebview_unavailable'));
        return;
    }
    const response = await window.pywebview.api.evaluate_order(facilityId, orderId);
    if (!response || !response.success) {
        alert(t('alerts.evaluate_failed', { message: response && response.message ? response.message : 'unknown error' }));
        return;
    }
    await refreshSessionState();
    await refreshFacilityStates();
    renderOrdersPanel(facilityId);
    renderSlotBubbles(appState.facilityById[facilityId], getFacilityEntry(facilityId));
    renderNpcTab(facilityId);
    renderInventoryPanel();
    const summary = buildOrderResultSummary(facilityId, orderId, response);
    addLogEntry(summary, 'event');
    showToast(summary, 'success');
    handleEventNotifications(response.events);
    await autoSaveSession('evaluate_order');
}

async function evaluateAllReady() {
    if (!(window.pywebview && window.pywebview.api && window.pywebview.api.evaluate_ready_orders)) {
        alert(t('alerts.pywebview_unavailable'));
        return;
    }
    const response = await window.pywebview.api.evaluate_ready_orders();
    if (!response || !response.success) {
        alert(t('alerts.evaluate_failed', { message: response && response.message ? response.message : 'unknown error' }));
        return;
    }
    const evaluated = response.evaluated || [];
    const skipped = response.skipped || [];
    if (evaluated.length === 0 && skipped.length === 0) {
        alert(t('alerts.no_ready_orders'));
        return;
    }
    const results = response.results || [];
    if (skipped.length) {
        alert(t('alerts.evaluate_all_skipped'));
    } else {
        alert(t('alerts.evaluate_all_done'));
    }
    await refreshSessionState();
    await refreshFacilityStates();
    if (appState.selectedFacilityId) {
        renderOrdersPanel(appState.selectedFacilityId);
        renderSlotBubbles(appState.facilityById[appState.selectedFacilityId], getFacilityEntry(appState.selectedFacilityId));
        renderNpcTab(appState.selectedFacilityId);
    }
    if (results.length) {
        results.forEach(result => {
            if (!result) {
                return;
            }
            const summary = buildOrderResultSummary(result.facility_id, result.order_id, result);
            addLogEntry(summary, 'event');
            showToast(summary, 'success', 6000);
            handleEventNotifications(result.events);
        });
    }
    await autoSaveSession('evaluate_all_ready');
}

async function rollAndEvaluateAllReady() {
    if (!(window.pywebview && window.pywebview.api && window.pywebview.api.roll_and_evaluate_ready_orders)) {
        alert(t('alerts.pywebview_unavailable'));
        return;
    }
    const response = await window.pywebview.api.roll_and_evaluate_ready_orders();
    if (!response || !response.success) {
        alert(t('alerts.evaluate_failed', { message: response && response.message ? response.message : 'unknown error' }));
        return;
    }
    const evaluated = response.evaluated || [];
    const skipped = response.skipped || [];
    if (evaluated.length === 0 && skipped.length === 0) {
        showToast(t('alerts.no_ready_orders'), 'warn');
        return;
    }

    const results = response.results || [];
    await refreshSessionState();
    await refreshFacilityStates();
    if (appState.selectedFacilityId) {
        renderOrdersPanel(appState.selectedFacilityId);
        renderSlotBubbles(appState.facilityById[appState.selectedFacilityId], getFacilityEntry(appState.selectedFacilityId));
        renderNpcTab(appState.selectedFacilityId);
    }

    if (results.length) {
        results.forEach(result => {
            if (!result) {
                return;
            }
            const summary = buildOrderResultSummary(result.facility_id, result.order_id, result);
            addLogEntry(summary, 'event');
            showToast(summary, 'success', 6000);
            handleEventNotifications(result.events);
        });
    }
    if (skipped.length) {
        showToast(t('alerts.evaluate_all_skipped'), 'warn');
    }
    await autoSaveSession('roll_and_evaluate_all');
}

async function startUpgrade() {
    const facilityId = appState.selectedFacilityId;
    if (!facilityId) {
        alert(t('alerts.upgrade_select_first'));
        return;
    }
    const stateEntry = (appState.facilityStates || []).find(entry => entry.facility_id === facilityId);
    const currentStateRaw = stateEntry && stateEntry.state ? stateEntry.state : 'unknown';
    const currentStateLabel = translateFacilityState(currentStateRaw);
    if (currentStateRaw !== 'free') {
        alert(t('alerts.upgrade_not_free', { state: currentStateLabel }));
        return;
    }
    if (!(window.pywebview && window.pywebview.api)) {
        alert(t('alerts.pywebview_unavailable'));
        return;
    }

    let response = await window.pywebview.api.add_upgrade_facility(facilityId, false);
    if (response && response.requires_confirmation) {
        const facilityName = getFacilityDisplayName(facilityId);
        let detail = '';
        if (typeof response.projected_treasury_base === 'number') {
            const projectedText = formatBaseValue(response.projected_treasury_base);
            const shortfallText = formatBaseValue(Math.abs(response.projected_treasury_base));
            detail = t('upgrade.confirm_detail', { projected: projectedText, shortfall: shortfallText });
        }
        const proceed = confirm(t('upgrade.overbudget_confirm', { facility: facilityName, detail }));
        if (!proceed) {
            return;
        }
        response = await window.pywebview.api.add_upgrade_facility(facilityId, true);
    }

    if (!response || !response.success) {
        const message = response && response.message ? response.message : 'unknown error';
        alert(t('alerts.upgrade_failed', { message }));
        return;
    }

    await refreshSessionState();
    await refreshFacilityStates();
    selectFacility(facilityId);
    await autoSaveSession('start_upgrade');
}

async function advanceTurn() {
    if (window.pywebview && window.pywebview.api && window.pywebview.api.advance_turn) {
        const response = await window.pywebview.api.advance_turn();
        if (!response || !response.success) {
            alert(t('alerts.advance_failed', { message: response && response.message ? response.message : 'unknown error' }));
            return;
        }
        appState.session.current_turn = response.current_turn;
        updateTurnCounter();
        await refreshSessionState();
        await refreshFacilityStates();
        if (appState.selectedFacilityId) {
            renderOrdersPanel(appState.selectedFacilityId);
            renderSlotBubbles(appState.facilityById[appState.selectedFacilityId], getFacilityEntry(appState.selectedFacilityId));
        }

        const completed = response.completed || [];
        if (completed.length) {
            const names = completed.map(entry => getFacilityDisplayName(entry.facility_id)).join(', ');
            addLogEntry(t('logs.turn_advanced_completed', { turn: response.current_turn, names }), 'event');
        } else {
            addLogEntry(t('logs.turn_advanced', { turn: response.current_turn }), 'event');
        }
        await autoSaveSession('advance_turn');
    } else {
        appState.session.turn++;
        updateTurnCounter();
        addLogEntry(t('logs.turn_advanced', { turn: appState.session.turn }), 'event');
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
        alert(t('alerts.session_saved_console'));
    }
}

function loadSession() {
    logClient('info', 'Opening load session dialog');
    
    if (window.pywebview && window.pywebview.api) {
        // Lade Liste der verfügbaren Sessions
        window.pywebview.api.list_sessions().then(response => {
            if (!response.success || response.sessions.length === 0) {
                alert(t('alerts.no_sessions_available'));
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
                        <button class="btn btn-primary btn-small" onclick="loadSessionFile('${filename}')">${t('load_session.load_button')}</button>
                    </div>
                `;
                sessionsList.appendChild(div);
            });
            
            const modal = document.getElementById('load-session-modal');
            modal.classList.remove('hidden');
        }).catch(err => {
            logClient('error', `Failed to load session list: ${err}`);
            alert(t('alerts.load_session_error'));
        });
    } else {
        alert(t('alerts.pywebview_unavailable'));
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
    if (appState.selectedFacilityId) {
        renderInventoryPanel();
    }

    const nameEl = document.querySelector('.session-name');
    if (nameEl) {
        const display = filename ? filename.replace('session_', '').replace('.json', '') : (sessionState && sessionState.bastion && sessionState.bastion.name) || t('header.no_session');
        nameEl.textContent = display;
    }

    if (showAlert) {
        alert(t('alerts.session_loaded', { filename: filename || '' }));
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
                alert(t('alerts.error_prefix', { message: response.message }));
            }
        } catch (err) {
            logClient('error', `Failed to load session file: ${err}`);
            alert(t('alerts.error_prefix', { message: err }));
        }
    } else {
        alert(t('alerts.pywebview_unavailable'));
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

async function hireNPC() {
    const name = document.getElementById('hire-name') ? document.getElementById('hire-name').value.trim() : '';
    const professionSelect = document.getElementById('hire-profession');
    const professionCustom = document.getElementById('hire-profession-custom');
    const levelValue = document.getElementById('hire-level') ? document.getElementById('hire-level').value : '1';
    const upkeepAmount = document.getElementById('hire-upkeep-amount')
        ? document.getElementById('hire-upkeep-amount').value
        : '';
    const upkeepCurrency = document.getElementById('hire-upkeep-currency')
        ? document.getElementById('hire-upkeep-currency').value
        : '';
    const assignFacility = document.getElementById('hire-assign-facility')
        ? document.getElementById('hire-assign-facility').value
        : '';

    const professionRaw = professionSelect ? professionSelect.value : '';
    const profession = professionRaw === 'custom'
        ? (professionCustom ? professionCustom.value.trim() : '')
        : professionRaw;

    const level = parseInt(levelValue, 10);
    const upkeepValue = parseInt(upkeepAmount, 10);

    if (!name || !profession || !Number.isInteger(level)) {
        alert(t('alerts.npc_fill_required'));
        return;
    }
    if (!Number.isInteger(upkeepValue) || upkeepValue <= 0 || !upkeepCurrency) {
        alert(t('alerts.fill_name_upkeep'));
        return;
    }

    if (!(window.pywebview && window.pywebview.api && window.pywebview.api.hire_npc)) {
        alert(t('alerts.pywebview_unavailable'));
        return;
    }

    const upkeep = { [upkeepCurrency]: upkeepValue };
    const facilityId = assignFacility || null;
    const response = await window.pywebview.api.hire_npc(name, profession, level, upkeep, facilityId);
    if (!response || !response.success) {
        alert(t('alerts.npc_hire_failed', { message: response && response.message ? response.message : 'unknown error' }));
        return;
    }

    await refreshSessionState();
    await refreshFacilityStates();
    if (appState.selectedFacilityId) {
        renderNpcTab(appState.selectedFacilityId);
        renderOrdersPanel(appState.selectedFacilityId);
        renderSlotBubbles(appState.facilityById[appState.selectedFacilityId], getFacilityEntry(appState.selectedFacilityId));
    }
    renderNpcModal();
    addLogEntry(t('alerts.hired_npc', { name }), 'event');
    const nameEl = document.getElementById('hire-name');
    if (nameEl) nameEl.value = '';
    const customEl = document.getElementById('hire-profession-custom');
    if (customEl) customEl.value = '';
    const upkeepEl = document.getElementById('hire-upkeep-amount');
    if (upkeepEl) upkeepEl.value = '';
}

async function moveNpc(npcId, targetFacilityId) {
    if (!(window.pywebview && window.pywebview.api && window.pywebview.api.move_npc)) {
        alert(t('alerts.pywebview_unavailable'));
        return;
    }
    const response = await window.pywebview.api.move_npc(npcId, targetFacilityId);
    if (!response || !response.success) {
        alert(t('alerts.npc_move_failed', { message: response && response.message ? response.message : 'unknown error' }));
        return;
    }
    await refreshSessionState();
    await refreshFacilityStates();
    if (appState.selectedFacilityId) {
        renderNpcTab(appState.selectedFacilityId);
        renderOrdersPanel(appState.selectedFacilityId);
        renderSlotBubbles(appState.facilityById[appState.selectedFacilityId], getFacilityEntry(appState.selectedFacilityId));
    }
    renderNpcModal();
    addLogEntry(t('alerts.npc_moved'), 'event');
}

async function fireNpc(npcId) {
    if (!(window.pywebview && window.pywebview.api && window.pywebview.api.fire_npc)) {
        alert(t('alerts.pywebview_unavailable'));
        return;
    }
    const response = await window.pywebview.api.fire_npc(npcId);
    if (!response || !response.success) {
        alert(t('alerts.npc_fire_failed', { message: response && response.message ? response.message : 'unknown error' }));
        return;
    }
    await refreshSessionState();
    await refreshFacilityStates();
    if (appState.selectedFacilityId) {
        renderNpcTab(appState.selectedFacilityId);
        renderOrdersPanel(appState.selectedFacilityId);
        renderSlotBubbles(appState.facilityById[appState.selectedFacilityId], getFacilityEntry(appState.selectedFacilityId));
    }
    renderNpcModal();
    addLogEntry(t('alerts.npc_fired'), 'event');
}

console.log('App scripts loaded - all functions ready');
