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

function getUpgradeDurationTurns(facilityId, entry) {
    const status = entry && entry.build_status && entry.build_status.status;
    if (status !== 'upgrading') {
        return null;
    }
    const targetId = entry.build_status.target_id;
    if (targetId) {
        const targetDef = appState.facilityById[targetId];
        const build = targetDef && typeof targetDef.build === 'object' ? targetDef.build : null;
        if (build && Number.isInteger(build.duration_turns) && build.duration_turns > 0) {
            return build.duration_turns;
        }
    }
    const currentDef = appState.facilityById[facilityId];
    const tier = currentDef && Number.isInteger(currentDef.tier) ? currentDef.tier : null;
    if (tier !== null && appState.config && appState.config.default_build_costs) {
        const key = `upgrade_tier_${tier}`;
        const defaults = appState.config.default_build_costs[key];
        if (defaults && Number.isInteger(defaults.duration_turns) && defaults.duration_turns > 0) {
            return defaults.duration_turns;
        }
    }
    return null;
}

function renderUpgradeProgressIndicator(facilityId) {
    const wrap = document.getElementById('detail-upgrade-progress-wrap');
    const container = document.getElementById('detail-upgrade-progress');
    if (!wrap || !container) {
        return;
    }
    container.innerHTML = '';

    const entry = getFacilityEntry(facilityId);
    const stateEntry = (appState.facilityStates || []).find(item => item && item.facility_id === facilityId);
    if (!entry || !stateEntry || stateEntry.state !== 'upgrading') {
        wrap.classList.add('hidden');
        return;
    }
    const remaining = Number.isInteger(stateEntry.remaining_turns) ? stateEntry.remaining_turns : null;
    const duration = getUpgradeDurationTurns(facilityId, entry);
    if (!Number.isInteger(remaining) || !Number.isInteger(duration) || duration <= 0) {
        wrap.classList.add('hidden');
        return;
    }

    wrap.classList.remove('hidden');
    const progress = Math.min(Math.max(duration - remaining, 0), duration);
    const badge = document.createElement('div');
    badge.className = 'order-progress-circle upgrade-progress-circle';
    badge.style.setProperty('--segments', Math.max(duration, 1));
    badge.style.setProperty('--progress', Math.max(progress, 0));
    badge.innerHTML = `<span>${remaining}</span>`;
    container.appendChild(badge);
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
    renderUpgradeProgressIndicator(facilityId);
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
        renderUpgradeProgressIndicator(facilityId);
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
    renderUpgradeProgressIndicator(facilityId);
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

