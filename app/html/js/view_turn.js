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
        item.dataset.facilityId = String(state.facility_id);

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

function updateFacilityTabIndicators(facilityId) {
    const npcTab = document.getElementById('tab-btn-npcs');
    const ordersTab = document.getElementById('tab-btn-orders');
    if (!npcTab || !ordersTab) {
        return;
    }
    const facilityDef = appState.facilityById[facilityId];
    const entry = getFacilityEntry(facilityId);
    const assigned = entry && Array.isArray(entry.assigned_npcs) ? entry.assigned_npcs : [];
    const available = assigned.filter(npc => {
        if (!npc || !npc.npc_id) {
            return false;
        }
        if (npcHasActiveOrder(entry, npc.npc_id)) {
            return false;
        }
        return isProfessionAllowed(facilityDef, npc.profession);
    }).length;
    const totalAssigned = assigned.length;
    npcTab.textContent = `${t('tabs.npcs')} (${available}/${totalAssigned})`;

    const orders = facilityDef && Array.isArray(facilityDef.orders) ? facilityDef.orders : [];
    const activeOrders = getFacilityOrders(entry).filter(order => isOrderActive(order)).length;
    ordersTab.textContent = `${t('tabs.orders')} (${activeOrders}/${orders.length})`;
}

function resetFacilityTabIndicators() {
    const npcTab = document.getElementById('tab-btn-npcs');
    const ordersTab = document.getElementById('tab-btn-orders');
    if (npcTab) {
        npcTab.textContent = t('tabs.npcs');
    }
    if (ordersTab) {
        ordersTab.textContent = t('tabs.orders');
    }
}

function renderOrderProgressIndicators(facilityId) {
    const wrap = document.getElementById('detail-order-progress-wrap');
    const container = document.getElementById('detail-order-progress');
    if (!container) {
        return;
    }
    container.innerHTML = '';
    const entry = getFacilityEntry(facilityId);
    const orders = getFacilityOrders(entry);
    const active = orders.filter(order => isOrderActive(order));
    if (!active.length) {
        if (wrap) {
            wrap.classList.add('hidden');
        }
        return;
    }
    if (wrap) {
        wrap.classList.remove('hidden');
    }
    active.forEach(order => {
        if (!order || typeof order !== 'object') {
            return;
        }
        const duration = Number.isInteger(order.duration_turns) ? order.duration_turns : 1;
        const status = getOrderStatus(order);
        const isReady = status === 'ready';
        const progressRaw = Number.isInteger(order.progress) ? order.progress : 0;
        const progress = isReady ? duration : Math.min(Math.max(progressRaw, 0), duration);
        const remaining = Math.max(duration - progress, 0);

        const badge = document.createElement('div');
        badge.className = 'order-progress-circle';
        badge.style.setProperty('--segments', Math.max(duration, 1));
        badge.style.setProperty('--progress', Math.max(progress, 0));
        badge.innerHTML = `<span>${remaining}</span>`;
        container.appendChild(badge);
    });
}

// ===== VIEW 3: TURN CONSOLE =====

function selectFacility(facilityId, element = null) {
    if (inventoryManageOpen) {
        inventoryManageOpen = false;
    }
    appState.selectedFacilityId = facilityId;
    setFacilityPanelState(true);

    document.querySelectorAll('.facility-list-item').forEach(item => item.classList.remove('active'));
    const selectorId = facilityId !== null && facilityId !== undefined ? String(facilityId) : null;
    const targetEl = element || (selectorId ? document.querySelector(`.facility-list-item[data-facility-id="${selectorId}"]`) : null);
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
    const professionsEl = document.getElementById('detail-professions');
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
    if (professionsEl) {
        professionsEl.innerHTML = '';
        if (!facility || !Array.isArray(facility.npc_allowed_professions)) {
            const fallback = document.createElement('span');
            fallback.className = 'tag tag-muted';
            fallback.textContent = t('common.unknown');
            professionsEl.appendChild(fallback);
        } else if (facility.npc_allowed_professions.length === 0) {
            const anyTag = document.createElement('span');
            anyTag.className = 'tag tag-muted';
            anyTag.textContent = t('details.allowed_professions_any');
            professionsEl.appendChild(anyTag);
        } else {
            facility.npc_allowed_professions
                .filter(Boolean)
                .forEach(prof => {
                    const tag = document.createElement('span');
                    tag.className = 'tag';
                    tag.textContent = prof;
                    professionsEl.appendChild(tag);
                });
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
    updateFacilityTabIndicators(facilityId);
    renderOrderProgressIndicators(facilityId);
    renderInventoryPanel();
}

function setFacilityPanelState(hasSelection) {
    const empty = document.getElementById('facility-empty');
    const main = document.getElementById('facility-main');
    const manage = document.getElementById('inventory-manage-view');
    const inventory = document.getElementById('inventory-panel');
    if (empty) {
        empty.classList.toggle('hidden', hasSelection);
    }
    if (main) {
        main.classList.toggle('hidden', !hasSelection);
    }
    if (manage) {
        manage.classList.toggle('hidden', !inventoryManageOpen);
    }
    if (inventory) {
        inventory.classList.remove('hidden');
    }

    if (!hasSelection) {
        resetFacilityTabIndicators();
        const progressWrap = document.getElementById('detail-order-progress-wrap');
        const progress = document.getElementById('detail-order-progress');
        if (progressWrap) {
            progressWrap.classList.add('hidden');
        }
        if (progress) {
            progress.innerHTML = '';
        }
    }

    if (inventoryManageOpen) {
        if (empty) {
            empty.classList.add('hidden');
        }
        if (main) {
            main.classList.add('hidden');
        }
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

function facilityAllowsProfession(facilityDef, profession) {
    const allowed = getAllowedProfessions(facilityDef);
    if (!allowed || allowed.length === 0) {
        return true;
    }
    const needle = normalizeProfession(profession);
    if (!needle) {
        return true;
    }
    return allowed.some(entry => normalizeProfession(entry) === needle);
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
    const profiles = appState.checkProfiles || {};
    const profile = profiles[checkProfile];
    if (!profile || typeof profile !== 'object') {
        return null;
    }
    const sides = profile.sides;
    return Number.isInteger(sides) && sides >= 2 ? sides : null;
}

function getOrderStatus(order) {
    if (!order || typeof order !== 'object') {
        return 'unknown';
    }
    if (order.status) {
        return order.status;
    }
    const duration = Number.isInteger(order.duration_turns) ? order.duration_turns : 0;
    const progress = Number.isInteger(order.progress) ? order.progress : 0;
    if (duration > 0 && progress >= duration) {
        return 'ready';
    }
    return 'in_progress';
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

function resolveNpcLevelKey(level) {
    const levelNames = appState.npcProgression && appState.npcProgression.level_names
        ? appState.npcProgression.level_names
        : {};
    return levelNames[level] || levelNames[String(level)] || (level === 3 ? 'master' : level === 2 ? 'experienced' : 'apprentice');
}

function determineOutcomeBucket(checkProfileId, npcLevel, roll) {
    const profiles = appState.checkProfiles || {};
    const profile = profiles[checkProfileId];
    if (!profile || !Number.isInteger(roll)) {
        return 'on_failure';
    }
    const levelKey = resolveNpcLevelKey(npcLevel);
    const baseProfile = profile.default;
    if (!baseProfile || typeof baseProfile !== 'object') {
        return 'on_failure';
    }
    const override = profile[levelKey] && typeof profile[levelKey] === 'object' ? profile[levelKey] : {};
    const levelProfile = { ...baseProfile, ...override };
    const critSuccess = toNumberSet(levelProfile.crit_success);
    const critFail = toNumberSet(levelProfile.crit_fail);
    if (critSuccess.has(roll)) {
        return 'on_critical_success';
    }
    if (critFail.has(roll)) {
        return 'on_critical_failure';
    }
    const dc = levelProfile.dc;
    if (Number.isInteger(dc) && roll >= dc) {
        return 'on_success';
    }
    return 'on_failure';
}

function getOrderOutcomeBucket(orderDef, orderEntry) {
    if (!orderDef || !orderDef.outcome) {
        return null;
    }
    const outcome = orderDef.outcome;
    const checkProfile = outcome.check_profile || null;
    if (!checkProfile) {
        return 'on_success';
    }
    if (!orderEntry || !orderEntry.roll_locked) {
        return null;
    }
    return determineOutcomeBucket(checkProfile, orderEntry.npc_level, orderEntry.roll);
}

function collectTriggerIds(effects) {
    const ids = [];
    if (!Array.isArray(effects)) {
        return ids;
    }
    effects.forEach(effect => {
        if (!effect || typeof effect !== 'object') {
            return;
        }
        if (effect.trigger && typeof effect.trigger === 'string') {
            ids.push(effect.trigger);
        }
    });
    return Array.from(new Set(ids));
}

function getTriggerIdsForOutcome(orderDef, bucket) {
    if (!orderDef || !orderDef.outcome || !bucket) {
        return [];
    }
    const block = orderDef.outcome[bucket];
    if (!block || typeof block !== 'object') {
        return [];
    }
    return collectTriggerIds(block.effects);
}

function getTriggerIdsAnyOutcome(orderDef) {
    if (!orderDef || !orderDef.outcome) {
        return [];
    }
    const buckets = ['on_success', 'on_critical_success', 'on_failure', 'on_critical_failure'];
    const all = [];
    buckets.forEach(bucket => {
        all.push(...getTriggerIdsForOutcome(orderDef, bucket));
    });
    return Array.from(new Set(all));
}

function getFormulaDefinition(triggerId) {
    if (!triggerId || !appState.formulaRegistry) {
        return null;
    }
    return appState.formulaRegistry[triggerId] || null;
}

function getFormulaInputSource(input) {
    if (!input || !input.source) {
        return null;
    }
    return String(input.source).toLowerCase();
}

function isFormulaUserInputSource(source) {
    return source === 'number' || source === 'check';
}

function getFormulaPromptInputs(formulaDef) {
    const config = formulaDef && formulaDef.config ? formulaDef.config : {};
    const inputs = Array.isArray(config.inputs) ? config.inputs : [];
    return inputs.filter(input => input && isFormulaUserInputSource(getFormulaInputSource(input)) && input.name);
}

function getSavedFormulaInputs(orderEntry, triggerId) {
    if (!orderEntry || !orderEntry.formula_inputs || typeof orderEntry.formula_inputs !== 'object') {
        return {};
    }
    const saved = orderEntry.formula_inputs[triggerId];
    return saved && typeof saved === 'object' ? saved : {};
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

function isCheckValueValid(input, value) {
    if (!isIntegerValue(value)) {
        return false;
    }
    const profile = input && input.check_profile ? input.check_profile : null;
    const sides = profile ? getDiceSides(profile) : null;
    if (!sides) {
        return false;
    }
    const numeric = Number(value);
    return numeric >= 1 && numeric <= sides;
}

function areFormulaInputsSaved(orderEntry, triggerId, promptInputs) {
    if (!promptInputs || promptInputs.length === 0) {
        return true;
    }
    const saved = getSavedFormulaInputs(orderEntry, triggerId);
    return promptInputs.every(input => {
        const source = getFormulaInputSource(input);
        if (source === 'check') {
            return isCheckValueValid(input, saved[input.name]);
        }
        return isNumericValue(saved[input.name]);
    });
}

function getFormulaInfoForOrder(orderDef, orderEntry) {
    if (!orderDef || !orderDef.outcome) {
        return { state: 'none' };
    }
    const checkProfile = orderDef.outcome.check_profile || null;
    if (checkProfile && (!orderEntry || !orderEntry.roll_locked)) {
        const possible = getTriggerIdsAnyOutcome(orderDef);
        if (possible.length) {
            return { state: 'wait_roll' };
        }
        return { state: 'none' };
    }
    const bucket = getOrderOutcomeBucket(orderDef, orderEntry);
    if (!bucket) {
        return { state: 'none' };
    }
    const triggerIds = getTriggerIdsForOutcome(orderDef, bucket);
    if (!triggerIds.length) {
        return { state: 'none' };
    }
    const items = triggerIds.map(triggerId => {
        const formulaDef = getFormulaDefinition(triggerId);
        const promptInputs = formulaDef ? getFormulaPromptInputs(formulaDef) : [];
        const saved = formulaDef ? areFormulaInputsSaved(orderEntry, triggerId, promptInputs) : false;
        return { triggerId, formulaDef, promptInputs, saved };
    });
    const hasMissing = items.some(item => !item.formulaDef || (item.promptInputs.length > 0 && !item.saved));
    return { state: 'active', items, hasMissing };
}

function collectReadyOrders() {
    const results = [];
    const facilities = appState.session && appState.session.bastion && Array.isArray(appState.session.bastion.facilities)
        ? appState.session.bastion.facilities
        : [];
    facilities.forEach(entry => {
        if (!entry || !entry.facility_id) {
            return;
        }
        const facilityId = entry.facility_id;
        const orders = getFacilityOrders(entry);
        orders.forEach(order => {
            if (getOrderStatus(order) !== 'ready') {
                return;
            }
            const orderDef = getOrderDefinition(facilityId, order.order_id);
            const outcome = orderDef && orderDef.outcome ? orderDef.outcome : null;
            const checkProfile = outcome && outcome.check_profile ? outcome.check_profile : null;
            const needsRoll = !!checkProfile && !order.roll_locked;
            const formulaInfo = getFormulaInfoForOrder(orderDef, order);
            const missingFormula = formulaInfo.state === 'active' && formulaInfo.hasMissing;
            const evaluatable = !needsRoll && !missingFormula;
            results.push({ facilityId, orderId: order.order_id, needsRoll, missingFormula, evaluatable });
        });
    });
    return results;
}

function hasBlockingReadyOrders() {
    return collectReadyOrders().length > 0;
}

function updateGlobalActionLocks() {
    const readyOrders = collectReadyOrders();
    const hasReady = readyOrders.length > 0;
    const hasEvaluatable = readyOrders.some(order => order.evaluatable);
    const hasBlocking = readyOrders.some(order => !order.evaluatable);
    const hasMissingFormula = readyOrders.some(order => order.missingFormula);

    const evalAllBtn = document.getElementById('orders-evaluate-all');
    if (evalAllBtn) {
        evalAllBtn.disabled = !hasEvaluatable || hasBlocking;
    }

    const rollAllBtn = document.getElementById('orders-roll-eval-all');
    if (rollAllBtn) {
        rollAllBtn.disabled = !hasReady || hasMissingFormula;
    }

    const advanceBtn = document.getElementById('turn-advance-btn');
    if (advanceBtn) {
        advanceBtn.disabled = hasReady;
    }
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

function getOrderDefinition(facilityId, orderId) {
    const facilityDef = appState.facilityById[facilityId];
    if (!facilityDef || !Array.isArray(facilityDef.orders)) {
        return null;
    }
    return facilityDef.orders.find(order => order && order.id === orderId) || null;
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
    const assigned = entry && Array.isArray(entry.assigned_npcs) ? entry.assigned_npcs.length : 0;
    const used = Math.min(total, assigned);
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
            const key = orders.length ? 'orders.no_orders_for_level' : 'orders.no_orders_configured';
            opt.textContent = t(key);
            orderSelect.appendChild(opt);
            orderSelect.disabled = true;
        } else {
            orderSelect.disabled = false;
            filtered.forEach(order => {
                const opt = document.createElement('option');
                opt.value = order.id;
                const duration = Number.isInteger(order.duration_turns) ? order.duration_turns : null;
                const durationLabel = duration ? ` (${formatTurnsLong(duration)})` : '';
                opt.textContent = `${order.name || order.id}${durationLabel}`;
                orderSelect.appendChild(opt);
            });
        }
        const preview = document.getElementById('order-preview');
        if (preview && orderSelect.disabled) {
            preview.classList.add('hidden');
        }
    }

    function updateOrderPreview() {
        const preview = document.getElementById('order-preview');
        const previewBody = document.getElementById('order-preview-body');
        if (!previewBody || !preview) {
            return;
        }
        previewBody.innerHTML = '';
        const selectedOrderId = orderSelect.value;
        const orderDef = orders.find(order => order && order.id === selectedOrderId);
        if (!orderDef || !orderDef.outcome) {
            preview.classList.add('hidden');
            return;
        }
        const outcome = orderDef.outcome || {};
        const buckets = ['on_success', 'on_failure'];
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
            const label = document.createElement('strong');
            label.textContent = `${formatOutcomeBucket(bucket)}:`;
            line.append(label, ` ${formatRawEffectEntries(effects)}`);
            previewBody.appendChild(line);
            hasLines = true;
        });
        if (!hasLines) {
            preview.classList.add('hidden');
            return;
        }
        preview.classList.remove('hidden');
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
        updateGlobalActionLocks();
        updateFacilityTabIndicators(facilityId);
        renderOrderProgressIndicators(facilityId);
        return;
    }

    let hasEvaluatable = false;

    existingOrders.forEach(order => {
        if (!order || typeof order !== 'object') {
            return;
        }
        const orderDef = getOrderDefinition(facilityId, order.order_id);
        const outcome = orderDef && typeof orderDef.outcome === 'object' ? orderDef.outcome : null;
        const checkProfile = outcome && outcome.check_profile ? outcome.check_profile : null;
        const diceSides = checkProfile ? getDiceSides(checkProfile) : null;
        const npc = assignedNpcs.find(n => n && n.npc_id === order.npc_id);
        const orderName = orderDef ? (orderDef.name || orderDef.id) : order.order_id;
        const npcName = npc ? (npc.name || npc.npc_id) : (order.npc_name || order.npc_id);
        const status = getOrderStatus(order);
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
            const formulaInfo = getFormulaInfoForOrder(orderDef, order);
            const needsRoll = !!checkProfile && !order.roll_locked;
            const missingFormula = formulaInfo.state === 'active' && formulaInfo.hasMissing;
            const actions = document.createElement('div');
            actions.className = 'order-actions';

            const evalBtn = document.createElement('button');
            evalBtn.className = 'btn btn-primary btn-small';
            evalBtn.textContent = t('orders.resolve');
            evalBtn.disabled = needsRoll || missingFormula;
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

            if (formulaInfo.state === 'wait_roll') {
                const custom = document.createElement('div');
                custom.className = 'order-custom order-custom-wait';
                custom.textContent = t('orders.formula_wait_roll');
                item.appendChild(custom);
            } else if (formulaInfo.state === 'active') {
                const custom = document.createElement('div');
                custom.className = 'order-custom';

                const customTitle = document.createElement('div');
                customTitle.className = 'order-custom-title';
                customTitle.textContent = t('orders.formula_custom');
                custom.appendChild(customTitle);

                formulaInfo.items.forEach(info => {
                    const row = document.createElement('div');
                    row.className = 'order-custom-row';

                    const name = document.createElement('span');
                    name.className = 'order-custom-name';
                    name.textContent = info.formulaDef ? (info.formulaDef.name || info.triggerId) : info.triggerId;

                    const statusTag = document.createElement('span');
                    statusTag.className = 'order-custom-status';
                    if (!info.formulaDef) {
                        statusTag.classList.add('status-warn');
                        statusTag.textContent = t('orders.formula_missing_def');
                    } else if (info.promptInputs.length === 0) {
                        statusTag.classList.add('status-muted');
                        statusTag.textContent = t('orders.formula_no_inputs');
                    } else if (info.saved) {
                        statusTag.classList.add('status-ok');
                        statusTag.textContent = t('orders.formula_inputs_saved');
                    } else {
                        statusTag.classList.add('status-warn');
                        statusTag.textContent = t('orders.formula_inputs_needed');
                    }

                    row.appendChild(name);
                    row.appendChild(statusTag);

                    if (info.formulaDef && info.promptInputs.length > 0) {
                        const btn = document.createElement('button');
                        btn.className = 'btn btn-secondary btn-small';
                        btn.textContent = t('orders.formula_input_button');
                        btn.addEventListener('click', () => {
                            openFormulaInputModal(facilityId, order.order_id, info.triggerId, info.formulaDef, getSavedFormulaInputs(order, info.triggerId));
                        });
                        row.appendChild(btn);
                    }
                    custom.appendChild(row);
                });

                item.appendChild(custom);
            }

            if (!needsRoll && !missingFormula) {
                hasEvaluatable = true;
            }
        }

        list.appendChild(item);
    });

    if (evalAllBtn) {
        evalAllBtn.disabled = !hasEvaluatable;
    }
    updateGlobalActionLocks();
    updateFacilityTabIndicators(facilityId);
    renderOrderProgressIndicators(facilityId);
}

function openFormulaInputModal(facilityId, orderId, triggerId, formulaDef, savedInputs = {}) {
    const modal = document.getElementById('formula-input-modal');
    const titleEl = document.getElementById('formula-input-title');
    const metaEl = document.getElementById('formula-input-meta');
    const fieldsEl = document.getElementById('formula-input-fields');
    const emptyEl = document.getElementById('formula-input-empty');
    const saveBtn = document.getElementById('formula-input-save');
    if (!modal || !fieldsEl || !saveBtn) {
        return;
    }

    const promptInputs = formulaDef ? getFormulaPromptInputs(formulaDef) : [];
    appState.formulaInputContext = { facilityId, orderId, triggerId, formulaDef, promptInputs };

    if (titleEl) {
        titleEl.textContent = t('orders.formula_modal_title');
    }
    if (metaEl) {
        const mechName = formulaDef ? (formulaDef.name || triggerId) : triggerId;
        metaEl.textContent = t('orders.formula_modal_meta', { name: mechName });
    }

    fieldsEl.innerHTML = '';
    if (promptInputs.length === 0) {
        if (emptyEl) {
            emptyEl.classList.remove('hidden');
        }
        saveBtn.disabled = true;
    } else {
        if (emptyEl) {
            emptyEl.classList.add('hidden');
        }
        saveBtn.disabled = false;
        promptInputs.forEach(input => {
            const row = document.createElement('div');
            row.className = 'formula-input-row';

            const label = document.createElement('label');
            label.textContent = input.label || input.name;
            label.setAttribute('for', `formula-input-${input.name}`);

            const field = document.createElement('input');
            field.type = 'number';
            const source = getFormulaInputSource(input);
            if (source === 'check') {
                field.step = '1';
                field.min = '1';
                const sides = input.check_profile ? getDiceSides(input.check_profile) : null;
                if (sides) {
                    field.max = String(sides);
                    field.placeholder = String(Math.ceil(sides / 2));
                }
            } else {
                field.step = 'any';
            }
            field.id = `formula-input-${input.name}`;
            const existing = savedInputs && savedInputs[input.name] !== undefined ? savedInputs[input.name] : input.default;
            field.value = existing !== undefined && existing !== null ? existing : '';

            row.appendChild(label);
            row.appendChild(field);
            fieldsEl.appendChild(row);
        });
    }

    saveBtn.onclick = saveFormulaInputs;
    modal.classList.remove('hidden');
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

function renderNpcTab(facilityId) {
    const tbody = document.getElementById('npc-assigned-body');
    const empty = document.getElementById('npc-assigned-empty');
    const note = document.getElementById('npc-profession-note');
    const hireBtn = document.getElementById('npc-hire-from-tab');
    if (!tbody) {
        return;
    }
    tbody.innerHTML = '';
    const entry = getFacilityEntry(facilityId);
    const assigned = entry && Array.isArray(entry.assigned_npcs) ? entry.assigned_npcs : [];
    const facilityDef = appState.facilityById[facilityId];
    const sortState = appState.npcTabSort || { key: null, dir: 'desc' };
    const sortedAssigned = sortState.key
        ? [...assigned].sort((a, b) => compareNpcSort({ npc: a, facility_id: null }, { npc: b, facility_id: null }, sortState.key, sortState.dir))
        : assigned;
    let hasMismatch = false;

    if (empty) {
        empty.classList.toggle('hidden', assigned.length > 0);
    }
    if (hireBtn) {
        const freeSlots = facilityDef ? getFacilityFreeSlots(entry, facilityDef) : 0;
        hireBtn.classList.toggle('hidden', freeSlots <= 0);
    }

    sortedAssigned.forEach(npc => {
        if (!npc || typeof npc !== 'object') {
            return;
        }
        const tr = document.createElement('tr');

        const iconTd = document.createElement('td');
        iconTd.className = 'npcs-icon-cell';
        const mismatch = facilityDef && npc.profession && !isProfessionAllowed(facilityDef, npc.profession);
        if (mismatch) {
            iconTd.appendChild(createWarningIcon(t('npcs.profession_mismatch_title')));
            hasMismatch = true;
        }
        tr.appendChild(iconTd);

        const nameTd = document.createElement('td');
        nameTd.textContent = npc.name || npc.npc_id || '-';
        tr.appendChild(nameTd);

        const professionTd = document.createElement('td');
        const professionTag = document.createElement('span');
        professionTag.className = npc.profession ? 'tag' : 'tag tag-muted';
        professionTag.textContent = npc.profession || t('common.unknown');
        professionTd.appendChild(professionTag);
        tr.appendChild(professionTd);

        const levelTd = document.createElement('td');
        const levelWrap = document.createElement('div');
        levelWrap.className = 'npc-level';
        const levelLabel = document.createElement('span');
        levelLabel.className = 'npc-level-label';
        levelLabel.textContent = formatNpcLevel(npc.level);
        const levelValue = parseInt(npc.level, 10);
        const stars = Number.isInteger(levelValue) && levelValue > 0 ? '★'.repeat(levelValue) : '';
        const levelStars = document.createElement('span');
        levelStars.className = 'npc-level-stars';
        levelStars.textContent = stars;
        levelWrap.appendChild(levelLabel);
        if (stars) {
            levelWrap.appendChild(levelStars);
        }
        levelTd.appendChild(levelWrap);
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

        const moveBtn = document.createElement('button');
        moveBtn.type = 'button';
        moveBtn.className = 'btn btn-secondary btn-small';
        moveBtn.textContent = t('npcs.move');
        moveBtn.addEventListener('click', (event) => {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
            openMoveNpcModal(npc, facilityId);
        });

        const fireBtn = document.createElement('button');
        fireBtn.type = 'button';
        fireBtn.className = 'btn btn-danger btn-small';
        fireBtn.textContent = t('npcs.fire');
        fireBtn.addEventListener('click', (event) => {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
            fireNpc(npc.npc_id, npc.name || npc.npc_id || '');
        });

        const hasActive = npcHasActiveOrder(entry, npc.npc_id);
        if (hasActive) {
            fireBtn.disabled = true;
            fireBtn.title = t('npcs.blocked_active_order');
        }

        actions.appendChild(moveBtn);
        actions.appendChild(fireBtn);
        actionTd.appendChild(actions);
        tr.appendChild(actionTd);

        tbody.appendChild(tr);
    });

    if (note) {
        note.classList.toggle('hidden', !hasMismatch);
    }

    updateFacilityTabIndicators(facilityId);
    initNpcTabSorting();
    updateNpcTabSortHeaders();
}

function openHireModalFromTab() {
    const facilityId = appState.selectedFacilityId;
    openHireModal(facilityId || null);
}

function renderNpcModal() {
    renderNpcManagement();
    renderHireNpcForm();
}

const WARNING_ICON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2L1 21h22L12 2zm0 5l7.53 13H4.47L12 7zm-1 4h2v5h-2v-5zm0 6h2v2h-2v-2z"></path></svg>';

function createWarningIcon(titleText) {
    const span = document.createElement('span');
    span.className = 'profession-warning-icon';
    span.innerHTML = WARNING_ICON_SVG;
    if (titleText) {
        span.title = titleText;
    }
    return span;
}

function getAllowedProfessions(facilityDef) {
    if (!facilityDef || typeof facilityDef !== 'object') {
        return null;
    }
    const candidates = [
        facilityDef.npc_allowed_professions,
        facilityDef.allowed_professions,
        facilityDef.allowed_profession,
        facilityDef.npc_professions
    ];
    for (const value of candidates) {
        if (Array.isArray(value)) {
            return value;
        }
    }
    return null;
}

function normalizeProfession(value) {
    if (value === null || value === undefined) {
        return '';
    }
    return value.toString().trim().toLowerCase();
}

function isProfessionAllowed(facilityDef, profession) {
    const allowed = getAllowedProfessions(facilityDef);
    if (!allowed) {
        return true;
    }
    if (allowed.length === 0) {
        return true;
    }
    const needle = normalizeProfession(profession);
    if (!needle) {
        return true;
    }
    return allowed.some(entry => normalizeProfession(entry) === needle);
}

function initNpcTabSorting() {
    const table = document.querySelector('#tab-npcs .npcs-table');
    if (!table) {
        return;
    }
    const headers = table.querySelectorAll('th[data-sort-key]');
    headers.forEach(th => {
        if (th.dataset.npcTabBound === 'true') {
            return;
        }
        th.classList.add('sortable');
        th.addEventListener('click', () => {
            const key = th.dataset.sortKey;
            if (!key) {
                return;
            }
            const state = appState.npcTabSort || { key: null, dir: 'desc' };
            if (state.key === key) {
                state.dir = state.dir === 'desc' ? 'asc' : 'desc';
            } else {
                state.key = key;
                state.dir = 'desc';
            }
            appState.npcTabSort = state;
            if (appState.selectedFacilityId) {
                renderNpcTab(appState.selectedFacilityId);
            } else {
                updateNpcTabSortHeaders(headers);
            }
        });
        th.dataset.npcTabBound = 'true';
    });
    updateNpcTabSortHeaders(headers);
}

function updateNpcTabSortHeaders(headers) {
    const state = appState.npcTabSort || { key: null, dir: 'desc' };
    const list = headers || document.querySelectorAll('#tab-npcs .npcs-table th[data-sort-key]');
    list.forEach(th => {
        th.classList.remove('sorted-asc', 'sorted-desc');
        if (state.key && th.dataset.sortKey === state.key) {
            th.classList.add(state.dir === 'asc' ? 'sorted-asc' : 'sorted-desc');
        }
    });
}

function initNpcManagementSorting() {
    const table = document.querySelector('#view-4 .npcs-table');
    if (!table) {
        return;
    }
    const headers = table.querySelectorAll('th[data-sort-key]');
    headers.forEach(th => {
        if (th.dataset.bound === 'true') {
            return;
        }
        th.classList.add('sortable');
        th.addEventListener('click', () => {
            const key = th.dataset.sortKey;
            if (!key) {
                return;
            }
            const state = appState.npcManagementSort || { key: null, dir: 'desc' };
            if (state.key === key) {
                state.dir = state.dir === 'desc' ? 'asc' : 'desc';
            } else {
                state.key = key;
                state.dir = 'desc';
            }
            appState.npcManagementSort = state;
            renderNpcManagement();
        });
        th.dataset.bound = 'true';
    });
    updateNpcSortHeaders(headers);
}

function updateNpcSortHeaders(headers) {
    const state = appState.npcManagementSort || { key: null, dir: 'desc' };
    const list = headers || document.querySelectorAll('#view-4 .npcs-table th[data-sort-key]');
    list.forEach(th => {
        th.classList.remove('sorted-asc', 'sorted-desc');
        if (state.key && th.dataset.sortKey === state.key) {
            th.classList.add(state.dir === 'asc' ? 'sorted-asc' : 'sorted-desc');
        }
    });
}

function compareNpcSort(a, b, key, dir) {
    const aVal = getNpcSortValue(a, key);
    const bVal = getNpcSortValue(b, key);
    let result = 0;
    if (typeof aVal === 'number' && typeof bVal === 'number') {
        result = aVal - bVal;
    } else {
        const aText = (aVal || '').toString();
        const bText = (bVal || '').toString();
        result = aText.localeCompare(bText, undefined, { sensitivity: 'base' });
    }
    return dir === 'asc' ? result : -result;
}

function getNpcSortValue(row, key) {
    const npc = row.npc || {};
    switch (key) {
        case 'name':
            return (npc.name || npc.npc_id || '').toLowerCase();
        case 'facility':
            return row.facility_id
                ? getFacilityDisplayName(row.facility_id).toLowerCase()
                : t('npcs.reserve').toLowerCase();
        case 'profession':
            return (npc.profession || '').toLowerCase();
        case 'level':
            return Number.isInteger(npc.level) ? npc.level : parseInt(npc.level, 10) || 0;
        case 'xp':
            return Number.isInteger(npc.xp) ? npc.xp : parseInt(npc.xp, 10) || 0;
        case 'upkeep':
            return getNpcUpkeepBase(npc.upkeep);
        default:
            return '';
    }
}

function getNpcUpkeepBase(upkeep) {
    if (!upkeep || typeof upkeep !== 'object') {
        return 0;
    }
    const model = getCurrencyModel();
    if (model && model.factor_to_base) {
        const baseValue = computeBaseValue(upkeep, model.factor_to_base);
        if (typeof baseValue === 'number') {
            return baseValue;
        }
    }
    let sum = 0;
    Object.values(upkeep).forEach(amount => {
        if (Number.isInteger(amount)) {
            sum += amount;
        }
    });
    return sum;
}

function openMoveNpcModal(npc, facilityId) {
    if (!npc || !npc.npc_id) {
        return;
    }
    const modal = document.getElementById('npc-move-modal');
    if (!modal) {
        return;
    }

    appState.moveNpcContext = {
        npcId: npc.npc_id,
        name: npc.name || npc.npc_id || '',
        level: npc.level,
        profession: npc.profession || '',
        currentFacilityId: facilityId || null
    };

    const nameEl = document.getElementById('npc-move-name');
    const levelEl = document.getElementById('npc-move-level');
    const jobEl = document.getElementById('npc-move-job');
    const statusEl = document.getElementById('npc-move-status');
    const warningEl = document.getElementById('npc-move-warning');

    if (nameEl) {
        nameEl.textContent = appState.moveNpcContext.name || '-';
    }
    if (levelEl) {
        levelEl.textContent = formatNpcLevel(appState.moveNpcContext.level);
    }
    if (jobEl) {
        jobEl.textContent = facilityId ? getFacilityDisplayName(facilityId) : t('npcs.reserve');
    }

    const facilityEntry = facilityId ? getFacilityEntry(facilityId) : null;
    const isWorking = facilityEntry ? npcHasActiveOrder(facilityEntry, npc.npc_id) : false;
    let statusKey = 'resting';
    let statusText = t('npcs.move_status_resting');
    if (facilityId) {
        statusKey = isWorking ? 'working' : 'idle';
        statusText = isWorking ? t('npcs.move_status_working') : t('npcs.move_status_idle');
    }
    if (statusEl) {
        statusEl.textContent = statusText;
        statusEl.className = `npc-move-status ${statusKey}`;
    }
    if (warningEl) {
        warningEl.classList.toggle('hidden', !isWorking);
    }

    renderMoveNpcTargets();
    modal.classList.remove('hidden');
}

function renderMoveNpcTargets() {
    const context = appState.moveNpcContext;
    const select = document.getElementById('npc-move-target');
    const hint = document.getElementById('npc-move-target-hint');
    const empty = document.getElementById('npc-move-target-empty');
    const submit = document.getElementById('npc-move-submit');
    if (!context || !select || !submit) {
        return;
    }

    select.innerHTML = '';
    if (hint) {
        hint.textContent = '';
        hint.classList.remove('ok', 'warn');
    }

    let hasTargets = false;
    let firstFacilityIndex = null;

    if (context.currentFacilityId) {
        const reserveOpt = document.createElement('option');
        reserveOpt.value = '';
        reserveOpt.textContent = t('npcs.reserve');
        select.appendChild(reserveOpt);
        hasTargets = true;
    }

    const bastion = appState.session && appState.session.bastion ? appState.session.bastion : {};
    const facilities = Array.isArray(bastion.facilities) ? bastion.facilities : [];
    facilities.forEach(entry => {
        if (!entry || !entry.facility_id) {
            return;
        }
        if (context.currentFacilityId && entry.facility_id === context.currentFacilityId) {
            return;
        }
        const def = appState.facilityById[entry.facility_id];
        if (!def) {
            return;
        }
        const freeSlots = getFacilityFreeSlots(entry, def);
        if (freeSlots <= 0) {
            return;
        }
        const name = formatFacilityUiName(def, entry.facility_id);
        const slotText = Number.isInteger(def.npc_slots)
            ? `${def.npc_slots - freeSlots}/${def.npc_slots}`
            : '';
        const compatible = facilityAllowsProfession(def, context.profession);
        const compatLabel = compatible ? t('npcs.move_target_ok') : t('npcs.move_target_warn');
        const label = slotText ? `${name} (${slotText}) - ${compatLabel}` : `${name} - ${compatLabel}`;

        const opt = document.createElement('option');
        opt.value = entry.facility_id;
        opt.textContent = label;
        opt.dataset.compat = compatible ? 'ok' : 'warn';
        opt.style.color = compatible ? 'var(--success)' : 'var(--accent)';
        select.appendChild(opt);
        if (firstFacilityIndex === null) {
            firstFacilityIndex = select.options.length - 1;
        }
        hasTargets = true;
    });

    if (empty) {
        empty.classList.toggle('hidden', hasTargets);
    }
    select.disabled = !hasTargets;
    submit.disabled = !hasTargets;

    if (firstFacilityIndex !== null) {
        select.selectedIndex = firstFacilityIndex;
    }

    if (!select.dataset.bound) {
        select.addEventListener('change', updateMoveNpcHint);
        select.dataset.bound = 'true';
    }
    if (!submit.dataset.bound) {
        submit.addEventListener('click', submitMoveNpc);
        submit.dataset.bound = 'true';
    }

    updateMoveNpcHint();
}

function updateMoveNpcHint() {
    const select = document.getElementById('npc-move-target');
    const hint = document.getElementById('npc-move-target-hint');
    if (!select || !hint) {
        return;
    }
    hint.classList.remove('ok', 'warn');
    const selected = select.options[select.selectedIndex];
    if (!selected || !selected.dataset || !selected.dataset.compat) {
        hint.textContent = '';
        return;
    }
    if (selected.dataset.compat === 'warn') {
        hint.textContent = t('npcs.move_target_hint_warn');
        hint.classList.add('warn');
        return;
    }
    hint.textContent = t('npcs.move_target_hint_ok');
    hint.classList.add('ok');
}

async function submitMoveNpc() {
    const context = appState.moveNpcContext;
    const select = document.getElementById('npc-move-target');
    if (!context || !select) {
        return;
    }
    if (!(window.pywebview && window.pywebview.api && window.pywebview.api.move_npc)) {
        notifyUser(t('alerts.pywebview_unavailable'));
        return;
    }
    const targetValue = select.value;
    const targetFacilityId = targetValue === '' ? null : targetValue;
    const response = await window.pywebview.api.move_npc(context.npcId, targetFacilityId);
    if (!response || !response.success) {
        notifyUser(t('alerts.npc_move_failed', { message: response && response.message ? response.message : 'unknown error' }));
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
    closeModal('npc-move-modal');
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

function renderNpcManagement() {
    const body = document.getElementById('npc-management-body');
    const totalEl = document.getElementById('npc-management-total-upkeep');
    const emptyEl = document.getElementById('npc-management-empty');
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

    const sortState = appState.npcManagementSort || { key: null, dir: 'desc' };
    if (sortState.key) {
        rows.sort((a, b) => compareNpcSort(a, b, sortState.key, sortState.dir));
    }

    const totalUpkeep = {};
    if (emptyEl) {
        emptyEl.classList.toggle('hidden', rows.length > 0);
    }

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
            facilityTd.classList.add('facility-unassigned');
        }
        tr.appendChild(facilityTd);

        const professionTd = document.createElement('td');
        const professionTag = document.createElement('span');
        professionTag.className = npc.profession ? 'tag' : 'tag tag-muted';
        professionTag.textContent = npc.profession || t('common.unknown');
        professionTd.appendChild(professionTag);
        tr.appendChild(professionTd);

        const facilityEntry = row.facility_id ? getFacilityEntry(row.facility_id) : null;
        const hasActive = facilityEntry ? npcHasActiveOrder(facilityEntry, npc.npc_id) : false;

        const levelTd = document.createElement('td');
        const levelWrap = document.createElement('div');
        levelWrap.className = 'npc-level';
        const levelLabel = document.createElement('span');
        levelLabel.className = 'npc-level-label';
        levelLabel.textContent = formatNpcLevel(npc.level);
        const levelValue = parseInt(npc.level, 10);
        const stars = Number.isInteger(levelValue) && levelValue > 0 ? '★'.repeat(levelValue) : '';
        const levelStars = document.createElement('span');
        levelStars.className = 'npc-level-stars';
        levelStars.textContent = stars;
        levelWrap.appendChild(levelLabel);
        if (stars) {
            levelWrap.appendChild(levelStars);
        }
        levelTd.appendChild(levelWrap);
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

        const moveBtn = document.createElement('button');
        moveBtn.type = 'button';
        moveBtn.className = 'btn btn-secondary btn-small';
        moveBtn.textContent = t('npcs.move');
        moveBtn.addEventListener('click', (event) => {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
            openMoveNpcModal(npc, row.facility_id);
        });

        const fireBtn = document.createElement('button');
        fireBtn.type = 'button';
        fireBtn.className = 'btn btn-danger btn-small';
        fireBtn.textContent = t('npcs.fire');
        fireBtn.addEventListener('click', (event) => {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
            fireNpc(npc.npc_id, npc.name || npc.npc_id || '');
        });

        if (hasActive) {
            fireBtn.disabled = true;
            fireBtn.title = t('npcs.blocked_active_order');
        }

        actions.appendChild(moveBtn);
        actions.appendChild(fireBtn);
        actionTd.appendChild(actions);
        tr.appendChild(actionTd);

        const statusTd = document.createElement('td');
        if (!row.facility_id) {
            statusTd.textContent = t('npcs.status_unassigned');
        } else if (hasActive) {
            statusTd.textContent = t('npcs.status_working');
        } else {
            statusTd.textContent = t('npcs.status_resting');
        }
        tr.appendChild(statusTd);

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

    initNpcManagementSorting();
}

function renderHireNpcForm() {
    const professionSelect = document.getElementById('hire-profession');
    const professionCustomWrap = document.getElementById('hire-profession-custom-wrap');
    const professionCustomInput = document.getElementById('hire-profession-custom');
    const upkeepCurrency = document.getElementById('hire-upkeep-currency');
    const assignSelect = document.getElementById('hire-assign-facility');
    const customSelect = document.getElementById('hire-profession-select');
    const customTrigger = document.getElementById('hire-profession-trigger');
    const customMenu = document.getElementById('hire-profession-menu');

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
    const neededInfo = (() => {
        const needed = new Set();
        let anyNeeded = false;
        const facilities = (appState.session && appState.session.bastion && appState.session.bastion.facilities) || [];
        facilities.forEach(entry => {
            if (!entry || !entry.facility_id) {
                return;
            }
            const def = appState.facilityById[entry.facility_id];
            if (!def) {
                return;
            }
            const free = getFacilityFreeSlots(entry, def);
            if (free <= 0) {
                return;
            }
            const allowed = getAllowedProfessions(def);
            if (!allowed) {
                return;
            }
            if (allowed.length === 0) {
                anyNeeded = true;
                return;
            }
            allowed.forEach(value => {
                const normalized = normalizeProfession(value);
                if (normalized) {
                    needed.add(normalized);
                }
            });
        });
        return { needed, anyNeeded };
    })();
    const options = sorted.map(p => {
        const normalized = normalizeProfession(p);
        const isNeeded = neededInfo.anyNeeded || (normalized && neededInfo.needed.has(normalized));
        return { value: p, label: p, needed: isNeeded };
    });
    options.push({ value: 'custom', label: t('modal.profession_custom'), needed: false, custom: true });

    const currentValue = professionSelect.value;
    professionSelect.innerHTML = '';
    options.forEach(opt => {
        const optionEl = document.createElement('option');
        optionEl.value = opt.value;
        optionEl.textContent = opt.label;
        if (opt.needed) {
            optionEl.dataset.needed = 'true';
        }
        professionSelect.appendChild(optionEl);
    });
    if (currentValue && options.some(opt => opt.value === currentValue)) {
        professionSelect.value = currentValue;
    } else if (options.length) {
        professionSelect.value = options[0].value;
    }

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

        const options = getFacilityOptionsForProfession(profession, null);
        options.forEach(opt => {
            const optionEl = document.createElement('option');
            optionEl.value = opt.id;
            optionEl.textContent = opt.label;
            assignSelect.appendChild(optionEl);
        });
        if (!appState.hireFacilityUserTouched && appState.hireFacilityPref) {
            const prefId = String(appState.hireFacilityPref);
            const hasOption = Array.from(assignSelect.options).some(opt => String(opt.value) === prefId);
            if (hasOption) {
                assignSelect.value = prefId;
            }
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

    function updateCustomTrigger() {
        if (!customTrigger) {
            return;
        }
        const current = options.find(opt => opt.value === professionSelect.value) || options[0];
        if (!current) {
            customTrigger.textContent = '';
            return;
        }
        customTrigger.innerHTML = '';
        const label = document.createElement('span');
        label.className = 'custom-select-label';
        label.textContent = current.label;
        customTrigger.appendChild(label);
        if (current.needed) {
            const tag = document.createElement('span');
            tag.className = 'option-tag';
            tag.textContent = t('modal.profession_needed');
            customTrigger.appendChild(tag);
        }
    }

    function closeCustomMenu() {
        if (customSelect) {
            customSelect.classList.remove('open');
        }
    }

    function openCustomMenu() {
        if (customSelect) {
            customSelect.classList.add('open');
        }
    }

    function buildCustomMenu() {
        if (!customMenu) {
            return;
        }
        customMenu.innerHTML = '';
        options.forEach(opt => {
            const optionBtn = document.createElement('button');
            optionBtn.type = 'button';
            optionBtn.className = 'custom-select-option';
            optionBtn.dataset.value = opt.value;
            optionBtn.innerHTML = '';

            const label = document.createElement('span');
            label.className = 'custom-select-label';
            label.textContent = opt.label;
            optionBtn.appendChild(label);

            if (opt.needed) {
                const tag = document.createElement('span');
                tag.className = 'option-tag';
                tag.textContent = t('modal.profession_needed');
                optionBtn.appendChild(tag);
            }

            optionBtn.addEventListener('click', () => {
                professionSelect.value = opt.value;
                updateProfessionCustom();
                updateCustomTrigger();
                closeCustomMenu();
            });
            customMenu.appendChild(optionBtn);
        });
    }

    if (!professionSelect.dataset.bound) {
        professionSelect.addEventListener('change', updateProfessionCustom);
        if (professionCustomInput) {
            professionCustomInput.addEventListener('input', updateAssignOptions);
        }
        assignSelect.addEventListener('change', () => {
            appState.hireFacilityUserTouched = true;
            updateUpkeepHint(assignSelect.value);
        });
        if (customTrigger) {
            customTrigger.addEventListener('click', () => {
                if (customSelect && customSelect.classList.contains('open')) {
                    closeCustomMenu();
                } else {
                    openCustomMenu();
                }
            });
        }
        if (!document.body.dataset.hireProfessionMenuBound) {
            document.addEventListener('click', (event) => {
                if (!customSelect) {
                    return;
                }
                if (!customSelect.contains(event.target)) {
                    closeCustomMenu();
                }
            });
            document.body.dataset.hireProfessionMenuBound = 'true';
        }
        professionSelect.dataset.bound = 'true';
    }

    updateProfessionCustom();
    updateAssignOptions();
    buildCustomMenu();
    updateCustomTrigger();
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
        notifyUser(t('alerts.order_start_failed', { message: t('orders.no_npc_assigned') }));
        return;
    }
    if (!orderId || orderSelect.disabled) {
        notifyUser(t('alerts.order_start_failed', { message: t('orders.no_orders_available') }));
        return;
    }
    if (!(window.pywebview && window.pywebview.api && window.pywebview.api.start_order)) {
        notifyUser(t('alerts.pywebview_unavailable'));
        return;
    }
    const response = await window.pywebview.api.start_order(facilityId, npcId, orderId);
    if (!response || !response.success) {
        notifyUser(t('alerts.order_start_failed', { message: response && response.message ? response.message : 'unknown error' }));
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
        notifyUser(t('alerts.pywebview_unavailable'));
        return;
    }
    const rollNumber = rollValue !== null && rollValue !== undefined && rollValue !== '' ? parseInt(rollValue, 10) : null;
    const response = await window.pywebview.api.lock_order_roll(facilityId, orderId, rollNumber, auto);
    if (!response || !response.success) {
        notifyUser(t('alerts.roll_lock_failed', { message: response && response.message ? response.message : 'unknown error' }));
        return;
    }
    await refreshSessionState();
    renderOrdersPanel(facilityId);
    addLogEntry(t('alerts.roll_locked'), 'event');
}

async function evaluateOrder(orderId) {
    const facilityId = appState.selectedFacilityId;
    if (!(window.pywebview && window.pywebview.api && window.pywebview.api.evaluate_order)) {
        notifyUser(t('alerts.pywebview_unavailable'));
        return;
    }
    const response = await window.pywebview.api.evaluate_order(facilityId, orderId);
    if (!response || !response.success) {
        const rawMessage = response && response.message ? response.message : 'unknown error';
        const message = formatFormulaErrorMessage(rawMessage);
        notifyUser(t('alerts.evaluate_failed', { message }));
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
        notifyUser(t('alerts.pywebview_unavailable'));
        return;
    }
    const response = await window.pywebview.api.evaluate_ready_orders();
    if (!response || !response.success) {
        notifyUser(t('alerts.evaluate_failed', { message: response && response.message ? response.message : 'unknown error' }));
        return;
    }
    const evaluated = response.evaluated || [];
    const skipped = response.skipped || [];
    if (evaluated.length === 0 && skipped.length === 0) {
        notifyUser(t('alerts.no_ready_orders'));
        return;
    }
    const results = response.results || [];
    if (skipped.length) {
        notifyUser(t('alerts.evaluate_all_skipped'));
    } else {
        notifyUser(t('alerts.evaluate_all_done'));
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
        notifyUser(t('alerts.pywebview_unavailable'));
        return;
    }
    const response = await window.pywebview.api.roll_and_evaluate_ready_orders();
    if (!response || !response.success) {
        notifyUser(t('alerts.evaluate_failed', { message: response && response.message ? response.message : 'unknown error' }));
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
        notifyUser(t('alerts.upgrade_select_first'));
        return;
    }
    const stateEntry = (appState.facilityStates || []).find(entry => entry.facility_id === facilityId);
    const currentStateRaw = stateEntry && stateEntry.state ? stateEntry.state : 'unknown';
    const currentStateLabel = translateFacilityState(currentStateRaw);
    if (currentStateRaw !== 'free') {
        notifyUser(t('alerts.upgrade_not_free', { state: currentStateLabel }));
        return;
    }
    if (!(window.pywebview && window.pywebview.api)) {
        notifyUser(t('alerts.pywebview_unavailable'));
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
        const proceed = await showConfirmModal(t('upgrade.overbudget_confirm', { facility: facilityName, detail }));
        if (!proceed) {
            return;
        }
        response = await window.pywebview.api.add_upgrade_facility(facilityId, true);
    }

    if (!response || !response.success) {
        const message = response && response.message ? response.message : 'unknown error';
        notifyUser(t('alerts.upgrade_failed', { message }));
        return;
    }

    await refreshSessionState();
    await refreshFacilityStates();
    selectFacility(facilityId);
    await autoSaveSession('start_upgrade');
}

async function advanceTurn() {
    if (hasBlockingReadyOrders()) {
        notifyUser(t('alerts.advance_blocked_ready_orders'));
        return;
    }
    if (window.pywebview && window.pywebview.api && window.pywebview.api.advance_turn) {
        const response = await window.pywebview.api.advance_turn();
        if (!response || !response.success) {
            const rawMessage = response && response.message ? response.message : 'unknown error';
            const message = rawMessage.includes('Pending orders ready')
                ? t('alerts.advance_blocked_ready_orders')
                : rawMessage;
            notifyUser(t('alerts.advance_failed', { message }));
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
    const prefix = type === 'success' ? '✓' : (type === 'fail' ? '✗' : '⚠');
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
        // Lade Liste der verfügbaren Sessions
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
            notifyUser(t('alerts.load_session_error'));
        });
    } else {
        notifyUser(t('alerts.pywebview_unavailable'));
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
        notifyUser(t('alerts.npc_fill_required'));
        return;
    }
    if (!Number.isInteger(upkeepValue) || upkeepValue <= 0 || !upkeepCurrency) {
        notifyUser(t('alerts.fill_name_upkeep'));
        return;
    }

    if (!(window.pywebview && window.pywebview.api && window.pywebview.api.hire_npc)) {
        notifyUser(t('alerts.pywebview_unavailable'));
        return;
    }

    const upkeep = { [upkeepCurrency]: upkeepValue };
    const facilityId = assignFacility || null;
    const response = await window.pywebview.api.hire_npc(name, profession, level, upkeep, facilityId);
    if (!response || !response.success) {
        notifyUser(t('alerts.npc_hire_failed', { message: response && response.message ? response.message : 'unknown error' }));
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

async function fireNpc(npcId, npcName = '') {
    const displayName = npcName || npcId || t('common.unknown');
    const confirmed = await showConfirmModal(t('npcs.fire_confirm', { name: displayName }));
    if (!confirmed) {
        return;
    }
    if (!(window.pywebview && window.pywebview.api && window.pywebview.api.fire_npc)) {
        notifyUser(t('alerts.pywebview_unavailable'));
        return;
    }
    const response = await window.pywebview.api.fire_npc(npcId);
    if (!response || !response.success) {
        notifyUser(t('alerts.npc_fire_failed', { message: response && response.message ? response.message : 'unknown error' }));
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

// ===== SETTINGS =====

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
    const coreSet = new Set(coreTypes);
    const hiddenList = settings && settings.currency && Array.isArray(settings.currency.hidden)
        ? settings.currency.hidden
        : [];
    const hiddenSet = new Set(hiddenList.filter(entry => typeof entry === 'string'));

    types.forEach(type => {
        const row = document.createElement('div');
        row.className = 'settings-row settings-row-inline';
        row.dataset.currency = type;

        const label = document.createElement('label');
        label.textContent = coreSet.has(type) ? type : `${type} (Custom)`;

        const wrap = document.createElement('div');
        wrap.className = 'settings-inline';

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
