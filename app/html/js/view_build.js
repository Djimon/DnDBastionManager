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

    packFilter.innerHTML = `<option value="">${t('build.filter_all_packs')}</option>`;
    Array.from(packs).sort().forEach(pack => {
        const option = document.createElement('option');
        option.value = pack;
        option.textContent = pack;
        packFilter.appendChild(option);
    });

    tierFilter.innerHTML = `<option value="">${t('build.filter_all_tiers')}</option>`;
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
        tierFilter.title = t('build.tier1_only');
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
        const haystack = `${facility.name || ''} ${facility.id || ''} ${facility._pack_id || ''} ${facility._pack_source || ''}`.toLowerCase();
        return haystack.includes(term);
    });

    renderFacilityCatalog(filtered);
}

function isFacilityAlreadyPresent(facilityId) {
    if (!facilityId) {
        return false;
    }
    if (Array.isArray(appState.buildQueue)) {
        if (appState.buildQueue.some(entry => entry && entry.id === facilityId)) {
            return true;
        }
    }
    const bastion = appState.session && appState.session.bastion ? appState.session.bastion : {};
    const facilities = Array.isArray(bastion.facilities) ? bastion.facilities : [];
    return facilities.some(entry => entry && entry.facility_id === facilityId);
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
        placeholder.textContent = t('build.no_facilities');
        list.appendChild(placeholder);
        return;
    }

    const currencyOrder = getCurrencyOrder();
    facilities.forEach(facility => {
        const item = document.createElement('div');
        item.className = 'placeholder-item';

        const title = document.createElement('strong');
        title.textContent = formatFacilityUiName(facility, facility && facility.id);

        const info = document.createElement('p');
        const buildInfo = getFacilityBuildInfo(facility);
        const costText = formatCost(buildInfo.cost, currencyOrder);
        const durationText = formatDuration(buildInfo.duration);
        const slotsText = Number.isInteger(facility.npc_slots)
            ? t('build.slots', { count: facility.npc_slots })
            : t('build.slots_unknown');
        info.textContent = `${costText} | ${durationText} | ${slotsText}`;

        const descText = facility && facility.description ? facility.description.trim() : '';
        let descEl = null;
        if (descText) {
            descEl = document.createElement('div');
            descEl.className = 'facility-desc';
            descEl.title = descText;
            descEl.textContent = descText;
        }

        const meta = document.createElement('div');
        meta.className = 'facility-meta';

        const ordersCount = Array.isArray(facility.orders) ? facility.orders.length : 0;
        const ordersEl = document.createElement('div');
        ordersEl.className = 'facility-orders';
        ordersEl.textContent = t('build.orders_count', { count: ordersCount });
        meta.appendChild(ordersEl);

        const professionsWrap = document.createElement('div');
        professionsWrap.className = 'facility-professions';
        const professionsLabel = document.createElement('span');
        professionsLabel.className = 'facility-meta-label';
        professionsLabel.textContent = t('build.allowed_professions');
        professionsWrap.appendChild(professionsLabel);

        const professionsList = document.createElement('span');
        professionsList.className = 'tag-list';
        if (!facility || !Array.isArray(facility.npc_allowed_professions)) {
            const tag = document.createElement('span');
            tag.className = 'tag tag-muted';
            tag.textContent = t('common.unknown');
            professionsList.appendChild(tag);
        } else if (facility.npc_allowed_professions.length === 0) {
            const tag = document.createElement('span');
            tag.className = 'tag tag-muted';
            tag.textContent = t('build.allowed_professions_any');
            professionsList.appendChild(tag);
        } else {
            facility.npc_allowed_professions
                .filter(Boolean)
                .forEach(prof => {
                    const tag = document.createElement('span');
                    tag.className = 'tag';
                    tag.textContent = prof;
                    professionsList.appendChild(tag);
                });
        }
        professionsWrap.appendChild(professionsList);
        meta.appendChild(professionsWrap);

        const loreText = getFacilityLoreText(facility);
        if (loreText) {
            const loreEl = document.createElement('div');
            loreEl.className = 'facility-lore';
            loreEl.title = loreText;
            loreEl.textContent = `${t('build.lore_label')} ${loreText}`;
            meta.appendChild(loreEl);
        }

        const button = document.createElement('button');
        button.className = 'btn btn-small';
        button.textContent = t('build.add_to_queue');
        const alreadyPresent = isFacilityAlreadyPresent(facility.id);
        if (alreadyPresent) {
            item.classList.add('facility-disabled');
        }
        if (alreadyPresent) {
            button.disabled = true;
        } else {
            button.addEventListener('click', () => addToQueue(facility.id));
        }

        item.appendChild(title);
        item.appendChild(info);
        if (descEl) {
            item.appendChild(descEl);
        }
        item.appendChild(meta);
        item.appendChild(button);
        if (alreadyPresent) {
            const note = document.createElement('div');
            note.className = 'facility-note';
            note.textContent = t('build.already_built');
            item.appendChild(note);
        }
        const badge = buildPackBadgeElement(facility && facility._pack_source ? facility._pack_source : 'core');
        if (badge) {
            item.appendChild(badge);
        }
        list.appendChild(item);
    });
}

function getEntryOrders(entry) {
    if (!entry || typeof entry !== 'object') {
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

function isEntryOrderActive(order) {
    if (!order || typeof order !== 'object') {
        return false;
    }
    const status = order.status || 'in_progress';
    return status === 'in_progress' || status === 'ready';
}

function countActiveOrders(entry) {
    return getEntryOrders(entry).filter(order => isEntryOrderActive(order)).length;
}

function buildProfessionTags(container, facility) {
    container.innerHTML = '';
    if (!facility || !Array.isArray(facility.npc_allowed_professions)) {
        const fallback = document.createElement('span');
        fallback.className = 'tag tag-muted';
        fallback.textContent = t('common.unknown');
        container.appendChild(fallback);
        return;
    }
    if (facility.npc_allowed_professions.length === 0) {
        const anyTag = document.createElement('span');
        anyTag.className = 'tag tag-muted';
        anyTag.textContent = t('details.allowed_professions_any');
        container.appendChild(anyTag);
        return;
    }
    facility.npc_allowed_professions
        .filter(Boolean)
        .forEach(prof => {
            const tag = document.createElement('span');
            tag.className = 'tag';
            tag.textContent = prof;
            container.appendChild(tag);
        });
}

function renderOwnedFacilitiesList() {
    const list = document.getElementById('owned-list');
    if (!list) {
        return;
    }
    list.innerHTML = '';
    const facilities = (appState.session && appState.session.bastion && appState.session.bastion.facilities) || [];
    if (!facilities.length) {
        const placeholder = document.createElement('div');
        placeholder.className = 'placeholder-item';
        placeholder.textContent = t('build.stock_empty');
        list.appendChild(placeholder);
        return;
    }

    const sorted = [...facilities].sort((a, b) => {
        const defA = appState.facilityById[a.facility_id];
        const defB = appState.facilityById[b.facility_id];
        const nameA = formatFacilityUiName(defA, a.facility_id).toLowerCase();
        const nameB = formatFacilityUiName(defB, b.facility_id).toLowerCase();
        return nameA.localeCompare(nameB);
    });

    sorted.forEach(entry => {
        const facility = appState.facilityById[entry.facility_id];
        const item = document.createElement('div');
        item.className = 'placeholder-item owned-item';

        const professionsWrap = document.createElement('div');
        professionsWrap.className = 'facility-professions';
        const professionsLabel = document.createElement('span');
        professionsLabel.className = 'facility-meta-label';
        professionsLabel.textContent = t('build.allowed_professions');
        professionsWrap.appendChild(professionsLabel);

        const professionsList = document.createElement('span');
        professionsList.className = 'tag-list';
        buildProfessionTags(professionsList, facility);
        professionsWrap.appendChild(professionsList);

        const metrics = document.createElement('div');
        metrics.className = 'stock-metrics';

        const slotsTotal = facility && Number.isInteger(facility.npc_slots) ? facility.npc_slots : null;
        const assigned = Array.isArray(entry.assigned_npcs) ? entry.assigned_npcs.length : 0;
        const slotsMetric = document.createElement('span');
        slotsMetric.className = 'stock-metric';
        slotsMetric.textContent = t('build.stock_slots', { used: assigned, total: slotsTotal !== null ? slotsTotal : '?' });

        const activeOrders = countActiveOrders(entry);
        const ordersMetric = document.createElement('span');
        ordersMetric.className = 'stock-metric';
        ordersMetric.textContent = t('build.stock_orders', { count: activeOrders });

        metrics.appendChild(slotsMetric);
        metrics.appendChild(ordersMetric);

        const upgradeTarget = getUpgradeTarget(entry.facility_id);
        const upgradeQueued = isUpgradeQueued(entry.facility_id);
        const buildStatus = entry.build_status && typeof entry.build_status === 'object' ? entry.build_status : {};
        const isUpgrading = buildStatus.status === 'upgrading';
        let statusText = '';
        if (upgradeQueued) {
            statusText = t('build.stock_upgrade_planned');
        } else if (isUpgrading) {
            const targetId = buildStatus.target_id;
            const targetDef = targetId ? appState.facilityById[targetId] : upgradeTarget;
            const targetName = targetDef ? formatFacilityUiName(targetDef, targetId || targetDef.id) : t('common.unknown');
            const remaining = Number.isInteger(buildStatus.remaining_turns) ? buildStatus.remaining_turns : null;
            if (Number.isInteger(remaining)) {
                statusText = t('build.stock_upgrade_running', { name: targetName, turns: formatTurnsLong(remaining) });
            } else {
                statusText = t('build.stock_upgrade_running_simple', { name: targetName });
            }
        }

        const title = document.createElement('strong');
        title.textContent = formatFacilityUiName(facility, entry.facility_id);
        const header = document.createElement('div');
        header.className = 'owned-item-header';
        header.appendChild(title);
        if (statusText) {
            const status = document.createElement('span');
            status.className = 'stock-status';
            status.textContent = statusText;
            header.appendChild(status);
        }

        const actions = document.createElement('div');
        actions.className = 'stock-actions';
        if (upgradeTarget && !upgradeQueued && !isUpgrading) {
            const upgradeInfo = getFacilityBuildInfo(upgradeTarget);
            const upgradeCost = formatCost(upgradeInfo.cost, getCurrencyOrder());
            const upgradeBtn = document.createElement('button');
            upgradeBtn.className = 'btn btn-secondary btn-small';
            upgradeBtn.textContent = `${t('upgrade.button')} (${upgradeCost})`;
            upgradeBtn.addEventListener('click', () => queueUpgrade(entry.facility_id));
            actions.appendChild(upgradeBtn);
        }
        const demolishBtn = document.createElement('button');
        demolishBtn.className = 'btn btn-danger btn-small';
        demolishBtn.textContent = t('build.demolish_button');
        demolishBtn.addEventListener('click', () => demolishFacility(entry.facility_id));
        actions.appendChild(demolishBtn);

        item.appendChild(header);
        item.appendChild(professionsWrap);
        item.appendChild(metrics);
        item.appendChild(actions);
        list.appendChild(item);
    });
}

function getUpgradeTarget(facilityId) {
    return appState.facilityCatalog.find(candidate => candidate && candidate.parent === facilityId) || null;
}

function isUpgradeQueued(facilityId) {
    if (!facilityId) {
        return false;
    }
    return appState.buildQueue.some(entry => {
        if (!entry || typeof entry !== 'object') {
            return false;
        }
        const type = entry.type || 'build';
        return type === 'upgrade' && entry.id === facilityId;
    });
}

function queueUpgrade(facilityId) {
    if (!facilityId) {
        return;
    }
    const target = getUpgradeTarget(facilityId);
    if (!target) {
        return;
    }
    if (isUpgradeQueued(facilityId)) {
        return;
    }
    appState.buildQueue.push({
        type: 'upgrade',
        id: facilityId,
        target_id: target.id,
    });
    updateQueueDisplay();
}

function getFacilityLoreText(facility) {
    if (!facility || typeof facility !== 'object') {
        return '';
    }
    const candidates = [
        facility.lore,
        facility.lore_description,
        facility.lore_text,
        facility.flavor,
        facility.flavor_text,
        facility.story,
        facility.history
    ];
    for (const value of candidates) {
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    return '';
}

function buildPackBadgeElement(source) {
    const badge = document.createElement('span');
    const packSource = source === 'custom' ? 'custom' : 'core';
    badge.className = `pack-badge pack-${packSource}`;
    badge.title = packSource === 'custom' ? t('build.pack_custom') : t('build.pack_core');
    badge.innerHTML = packSource === 'custom'
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.24-1.12.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 7.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.82 14.52a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.39 1.05.7 1.63.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54c.58-.24 1.12-.55 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z"/></svg>';
    return badge;
}

// ===== VIEW 1: SESSION WIZARD =====

function addPlayer() {
    const name = document.getElementById('player-name').value;
    const className = document.getElementById('player-class').value;
    const level = document.getElementById('player-level').value || '1';
    
    if (!name || !className) {
        notifyUser(t('alerts.fill_name_class'));
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
        notifyUser(t('alerts.fill_required_fields'));
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
                if (typeof setHeaderSessionName === 'function') {
                    setHeaderSessionName(getSessionDisplayName(response.session_state));
                }
                notifyUser(t('alerts.session_created'));
                switchView(2);
            } else {
                logClient('error', `Session creation failed: ${response.message}`);
                notifyUser(t('alerts.error_prefix', { message: response.message }));
            }
        }).catch(err => {
            logClient('error', `API call error: ${err}`);
            notifyUser(t('alerts.error_prefix', { message: err }));
        });
    } else {
        // Fallback: lokales Frontend-Only Testing
        appState.session.name = `${sessionName} (${bastionName})`;
        appState.session.session_name = sessionName;
        appState.session.dm_name = dmName;
        appState.session.bastion = { 
            name: bastionName, 
            location: bastionLocation, 
            description: bastionDescription 
        };
        appState.session.players = players;
        
        if (typeof setHeaderSessionName === 'function') {
            setHeaderSessionName(getSessionDisplayName(appState.session));
        }
        renderAuditLog();
        updateTurnCounter();
        updateQueueDisplay();
        loadCurrencyModel();
        notifyUser(t('alerts.session_created_local'));
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
    if (isFacilityAlreadyPresent(facilityId)) {
        notifyUser(t('build.already_built'));
        return;
    }
    if (Number.isInteger(BUILDABLE_TIER) && facility.tier !== BUILDABLE_TIER) {
        notifyUser(t('build.tier1_only'));
        return;
    }
    appState.buildQueue.push({
        type: 'build',
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
        const buildInfo = getQueueEntryBuildInfo(entry);
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
        const buildInfo = getQueueEntryBuildInfo(entry);
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
        empty.textContent = t('build.queue_empty');
        queueList.appendChild(empty);
    }

    const currencyOrder = getCurrencyOrder();
    appState.buildQueue.forEach((entry, index) => {
        const name = getQueueEntryLabel(entry);
        const buildInfo = getQueueEntryBuildInfo(entry);
        const costText = formatCost(buildInfo.cost, currencyOrder);
        const durationText = formatDuration(buildInfo.duration);
        const item = document.createElement('div');
        item.className = 'queue-item';
        item.innerHTML = `
            <div class="queue-item-info">
                <strong>${name}</strong>
                <p>${costText} | ${durationText}</p>
            </div>
            <button class="btn btn-danger" onclick="removeFromQueue(${index})">${t('build.remove')}</button>
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
                const suffix = remainingBase < 0 ? t('build.override_suffix') : '';
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

    renderOwnedFacilitiesList();
    applyCatalogFilters();
}

function getQueueEntryBuildInfo(entry) {
    if (!entry || typeof entry !== 'object') {
        return { cost: null, duration: null };
    }
    const type = entry.type || 'build';
    if (type === 'upgrade') {
        const target = entry.target_id ? appState.facilityById[entry.target_id] : getUpgradeTarget(entry.id);
        return getFacilityBuildInfo(target);
    }
    const facility = appState.facilityById[entry.id];
    return getFacilityBuildInfo(facility);
}

function getQueueEntryLabel(entry) {
    if (!entry || typeof entry !== 'object') {
        return '[Facility]';
    }
    const type = entry.type || 'build';
    if (type === 'upgrade') {
        const baseDef = appState.facilityById[entry.id];
        const targetDef = entry.target_id ? appState.facilityById[entry.target_id] : getUpgradeTarget(entry.id);
        const fromName = formatFacilityUiName(baseDef, entry.id);
        const toName = targetDef ? formatFacilityUiName(targetDef, targetDef.id) : t('common.unknown');
        return t('build.queue_upgrade_label', { from: fromName, to: toName });
    }
    const facility = appState.facilityById[entry.id];
    return formatFacilityUiName(facility, entry.id);
}

async function demolishFacility(facilityId) {
    const entry = (appState.session && appState.session.bastion && appState.session.bastion.facilities || [])
        .find(item => item && item.facility_id === facilityId);
    if (!entry) {
        notifyUser(t('build.demolish_not_found'));
        return;
    }

    const def = appState.facilityById[facilityId];
    const facilityName = formatFacilityUiName(def, facilityId);
    const activeOrders = countActiveOrders(entry);

    const lines = [t('build.demolish_confirm', { facility: facilityName })];
    if (activeOrders > 0) {
        lines.push(t('build.demolish_warning_orders', { count: activeOrders }));
    }
    lines.push(t('build.demolish_notice_npcs'));
    const confirmText = lines.join('\n');

    const proceed = await showConfirmModal(confirmText, {
        title: t('build.demolish_title'),
        okText: t('build.demolish_ok'),
        cancelText: t('common.confirm_no'),
    });
    if (!proceed) {
        return;
    }

    if (!(window.pywebview && window.pywebview.api && window.pywebview.api.demolish_facility)) {
        notifyUser(t('alerts.pywebview_unavailable'));
        return;
    }

    const response = await window.pywebview.api.demolish_facility(facilityId);
    if (!response || !response.success) {
        const message = response && response.message ? response.message : 'unknown error';
        notifyUser(t('build.demolish_failed', { message }));
        return;
    }

    await refreshSessionState();
    await refreshFacilityStates();
    updateQueueDisplay();
    renderFacilityStates();

    const refund = response.refund || {};
    const refundText = formatCost(refund, getCurrencyOrder());
    addLogEntry(t('logs.facility_demolished', { facility: facilityName, refund: refundText }), 'event');
    notifyUser(t('build.demolish_success', { facility: facilityName, refund: refundText }));
}

async function startBuilding() {
    if (appState.buildQueue.length === 0) {
        notifyUser(t('alerts.build_add_first'));
        return;
    }

    if (!(window.pywebview && window.pywebview.api)) {
        notifyUser(t('alerts.pywebview_unavailable'));
        return;
    }

    let allowOverride = false;
    const model = getCurrencyModel();
    if (model && model.factor_to_base) {
        const totalBase = sumQueueCostsBase(model.factor_to_base);
        const wallet = appState.session && appState.session.bastion && appState.session.bastion.treasury;
        const treasuryBase = (appState.session && appState.session.bastion && typeof appState.session.bastion.treasury_base === 'number')
            ? appState.session.bastion.treasury_base
            : computeBaseValue(wallet, model.factor_to_base);

        if (typeof totalBase === 'number' && typeof treasuryBase === 'number' && totalBase > treasuryBase) {
            const projectedBase = treasuryBase - totalBase;
            const projectedText = formatBaseValue(projectedBase);
            const shortfallText = formatBaseValue(totalBase - treasuryBase);
            const detail = t('build.confirm_detail', { projected: projectedText, shortfall: shortfallText });
            const confirmText = t('build.overbudget_confirm', { facility: t('build.queue_title'), detail });
            const proceed = await showConfirmModal(confirmText);
            if (!proceed) {
                return;
            }
            allowOverride = true;
        }
    }

    const remainingQueue = [];
    const errors = [];
    let builtCount = 0;

    for (const entry of appState.buildQueue) {
        const facilityId = entry.id;
        const entryType = entry.type || 'build';
        const label = getQueueEntryLabel(entry);
        let response = entryType === 'upgrade'
            ? await window.pywebview.api.add_upgrade_facility(facilityId, allowOverride)
            : await window.pywebview.api.add_build_facility(facilityId, allowOverride);

        if (response && response.requires_confirmation) {
            if (!allowOverride) {
                let detail = '';
                if (typeof response.projected_treasury_base === 'number') {
                    const projectedText = formatBaseValue(response.projected_treasury_base);
                    const shortfallText = formatBaseValue(Math.abs(response.projected_treasury_base));
                    detail = t('build.confirm_detail', { projected: projectedText, shortfall: shortfallText });
                }
                const confirmText = t('build.overbudget_confirm', { facility: t('build.queue_title'), detail });
                const proceed = await showConfirmModal(confirmText);
                if (!proceed) {
                    remainingQueue.push(entry);
                    continue;
                }
                allowOverride = true;
            }
            response = entryType === 'upgrade'
                ? await window.pywebview.api.add_upgrade_facility(facilityId, true)
                : await window.pywebview.api.add_build_facility(facilityId, true);
        }

        if (!response || !response.success) {
            const message = response && response.message ? response.message : 'unknown error';
            errors.push(`${label}: ${message}`);
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
        notifyUser(t('alerts.build_errors', { errors: errors.join('\n') }));
    }
    if (builtCount > 0) {
        await autoSaveSession('start_build');
        switchView(3); // Go to Turn Console
    }
}
