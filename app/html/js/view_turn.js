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
        return;
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
    renderOrdersPanel(facilityId);
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

    if (!npcSelect.dataset.bound) {
        npcSelect.addEventListener('change', populateOrdersForNpc);
        npcSelect.dataset.bound = 'true';
    }
    populateOrdersForNpc();

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
    addLogEntry(t('logs.order_resolved'), 'success');
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
    }
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
                alert(t('alerts.session_loaded', { filename }));
                closeModal('load-session-modal');
                switchView(3);  // Gehe zu Turn Console
            } else {
                logClient('error', `Failed to load session: ${response.message}`);
                alert(t('alerts.error_prefix', { message: response.message }));
            }
        }).catch(err => {
            logClient('error', `Failed to load session file: ${err}`);
            alert(t('alerts.error_prefix', { message: err }));
        });
    } else {
        alert(t('alerts.pywebview_unavailable'));
    }
}

// ===== NPC MANAGEMENT =====

function fireNPC() {
    alert(t('alerts.fire_npc_placeholder'));
}

function hireNPC() {
    const name = document.getElementById('hire-name').value;
    const profession = document.getElementById('hire-profession').value;
    const level = document.getElementById('hire-level').value;
    const upkeep = document.getElementById('hire-upkeep').value;
    const facility = document.getElementById('hire-facility').value;
    
    if (!name || !upkeep) {
        alert(t('alerts.fill_name_upkeep'));
        return;
    }
    
    appState.session.npcs.push({ name, profession, level, upkeep, facility });
    alert(t('alerts.hired_npc', { name }));
    closeModal('npc-modal');
}

console.log('App scripts loaded - all functions ready');
