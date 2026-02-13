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

    const buildableTier = getBuildableTier();
    if (Number.isInteger(buildableTier)) {
        const desired = String(buildableTier);
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
    const buildableTier = getBuildableTier();

    const filtered = appState.facilityCatalog.filter(facility => {
        if (!facility || typeof facility !== 'object') {
            return false;
        }
        if (Number.isInteger(buildableTier) && facility.tier !== buildableTier) {
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

function getFacilityUpgradeChain(facilityId) {
    const chain = [];
    let currentId = facilityId;
    const seen = new Set();
    while (currentId && !seen.has(currentId)) {
        seen.add(currentId);
        const def = appState.facilityById[currentId];
        if (!def) {
            break;
        }
        chain.push(def);
        currentId = def.parent;
    }
    return chain;
}

function sumFacilityChainCosts(chain) {
    const total = {};
    chain.forEach(def => {
        const info = getFacilityBuildInfo(def);
        const cost = info && info.cost && typeof info.cost === 'object' ? info.cost : null;
        if (!cost) {
            return;
        }
        Object.entries(cost).forEach(([currency, amount]) => {
            if (typeof amount !== 'number') {
                return;
            }
            total[currency] = (total[currency] || 0) + amount;
        });
    });
    return total;
}

function estimateDemolishRefund(facilityId) {
    const chain = getFacilityUpgradeChain(facilityId);
    const totalCost = sumFacilityChainCosts(chain);
    const model = getCurrencyModel();
    if (model && model.factor_to_base) {
        const base = computeBaseValue(totalCost, model.factor_to_base);
        if (typeof base === 'number') {
            const ratio = getFacilityRefundRatio();
            const refundBase = Math.floor(base * ratio);
            const wallet = normalizeBaseToWallet(refundBase, model);
            return wallet;
        }
    }
    const ratio = getFacilityRefundRatio();
    const refund = {};
    Object.entries(totalCost).forEach(([currency, amount]) => {
        if (typeof amount !== 'number') {
            return;
        }
        refund[currency] = Math.floor(amount * ratio);
    });
    return refund;
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

function normalizePlayerClassOptions(rawList) {
    if (!Array.isArray(rawList)) {
        return [];
    }
    return rawList.map(entry => {
        if (typeof entry === 'string') {
            const value = entry.trim();
            return value ? { value, custom: false } : null;
        }
        if (entry && typeof entry === 'object') {
            const value = (entry.id || entry.value || entry.label || entry.name || '').trim();
            if (!value) {
                return null;
            }
            const custom = entry.custom === true || entry.source === 'custom';
            return { value, custom };
        }
        return null;
    }).filter(Boolean);
}

function ensurePlayerState() {
    if (!appState.session || typeof appState.session !== 'object') {
        appState.session = { players: [] };
    }
    if (!Array.isArray(appState.session.players)) {
        appState.session.players = [];
    }
}

function populatePlayerClassSelect(selectEl, selectedValues = []) {
    if (!selectEl) {
        return;
    }
    selectEl.innerHTML = '';
    const options = Array.isArray(appState.playerClassOptions) ? appState.playerClassOptions : [];
    const selectedList = Array.isArray(selectedValues) ? selectedValues.filter(Boolean) : [];
    const primarySelected = selectedList.length ? selectedList[0] : null;
    options.forEach(option => {
        const opt = document.createElement('option');
        opt.value = option.value;
        opt.textContent = getPlayerClassLabel(option.value);
        if (primarySelected && primarySelected === option.value) {
            opt.selected = true;
        }
        selectEl.appendChild(opt);
    });
}

function getSelectedPlayerClasses(selectEl) {
    if (!selectEl) {
        return [];
    }
    return Array.from(selectEl.selectedOptions)
        .map(opt => opt.value)
        .filter(Boolean);
}

function resolvePlayerClassValue(rawValue) {
    const value = String(rawValue || '').trim();
    if (!value) {
        return null;
    }
    const options = Array.isArray(appState.playerClassOptions) ? appState.playerClassOptions : [];
    const match = options.find(option => {
        if (!option || !option.value) {
            return false;
        }
        const optionValue = option.value.toLowerCase();
        const optionLabel = getPlayerClassBaseLabel(option.value).toLowerCase();
        const rawLower = value.toLowerCase();
        return optionValue === rawLower || optionLabel === rawLower;
    });
    return match ? match.value : value;
}

function formatPlayerClassLabel(value) {
    return getPlayerClassLabel(value);
}

function getPlayerClassLabel(value) {
    const label = getPlayerClassBaseLabel(value);
    return isCustomPlayerClass(value) ? `${label} (Custom)` : label;
}

function getPlayerClassBaseLabel(value) {
    const key = `wizard.player_class_${value}`;
    const label = typeof t === 'function' ? t(key) : value;
    return label === key ? value : label;
}

function isCustomPlayerClass(value) {
    const options = Array.isArray(appState.playerClassOptions) ? appState.playerClassOptions : [];
    const entry = options.find(option => option && option.value === value);
    return !!(entry && entry.custom);
}
function normalizePlayerClasses(player) {
    if (player && Array.isArray(player.classes) && player.classes.length) {
        return player.classes.map(resolvePlayerClassValue).filter(Boolean);
    }
    if (player && typeof player.class === 'string' && player.class.trim()) {
        const parts = player.class
            .split(/[\\/|,]+/)
            .map(value => resolvePlayerClassValue(value))
            .filter(Boolean);
        return parts.length ? parts : [resolvePlayerClassValue(player.class.trim())].filter(Boolean);
    }
    return [];
}

function setPlayerClasses(player, classes) {
    const filtered = Array.isArray(classes) ? classes.filter(Boolean) : [];
    player.classes = filtered;
    player.class = filtered.map(formatPlayerClassLabel).join(' / ');
}

function sanitizePlayerLevel(raw) {
    const parsed = parseInt(raw, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
        return parsed;
    }
    return 1;
}

function beginEditPlayer(index) {
    if (!Number.isInteger(index)) {
        return;
    }
    appState.playerEditingIndex = index;
    renderPlayersList();
}

function cancelEditPlayer() {
    appState.playerEditingIndex = null;
    renderPlayersList();
}

function getPlayerLists() {
    const lists = Array.from(document.querySelectorAll('[data-player-list]'));
    if (lists.length) {
        return lists;
    }
    const fallback = document.getElementById('players-list');
    return fallback ? [fallback] : [];
}

function populateAllPlayerClassSelects() {
    const ids = ['player-class', 'player-manage-class'];
    ids.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            populatePlayerClassSelect(select, []);
        }
    });
}

function renderPlayersListInto(list) {
    list.innerHTML = '';

    if (appState.session.players.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'text-muted players-empty';
        empty.textContent = t('wizard.players_empty');
        list.appendChild(empty);
        return;
    }

    appState.session.players.forEach((player, index) => {
        const row = document.createElement('div');
        row.className = 'player-item';
        const classes = normalizePlayerClasses(player);
        setPlayerClasses(player, classes);
        const levelValue = sanitizePlayerLevel(player.level);

        const summary = document.createElement('div');
        summary.className = 'player-summary';

        const summaryRow = document.createElement('div');
        summaryRow.className = 'player-summary-row';

        const nameBlock = document.createElement('div');
        nameBlock.className = 'player-summary-block';
        const nameLabel = document.createElement('span');
        nameLabel.className = 'player-summary-label';
        nameLabel.textContent = t('wizard.player_name');
        const nameValue = document.createElement('span');
        nameValue.className = 'player-summary-value';
        nameValue.textContent = player.name || t('common.unknown');
        nameBlock.appendChild(nameLabel);
        nameBlock.appendChild(nameValue);

        const classBlock = document.createElement('div');
        classBlock.className = 'player-summary-block';
        const classLabel = document.createElement('span');
        classLabel.className = 'player-summary-label';
        classLabel.textContent = t('wizard.player_class');
        const classTags = document.createElement('div');
        classTags.className = 'player-tags';
        if (!classes.length) {
            const tag = document.createElement('span');
            tag.className = 'tag tag-muted';
            tag.textContent = t('wizard.player_class_empty');
            classTags.appendChild(tag);
        } else {
            classes.forEach(cls => {
                const tag = document.createElement('span');
                tag.className = 'tag';
                tag.textContent = getPlayerClassLabel(cls);
                classTags.appendChild(tag);
            });
        }
        classBlock.appendChild(classLabel);
        classBlock.appendChild(classTags);

        const levelBlock = document.createElement('div');
        levelBlock.className = 'player-summary-block';
        const levelLabel = document.createElement('span');
        levelLabel.className = 'player-summary-label';
        levelLabel.textContent = t('wizard.player_level');
        const levelValueEl = document.createElement('span');
        levelValueEl.className = 'player-summary-value';
        levelValueEl.textContent = String(levelValue);
        levelBlock.appendChild(levelLabel);
        levelBlock.appendChild(levelValueEl);

        summaryRow.appendChild(nameBlock);
        summaryRow.appendChild(classBlock);
        summaryRow.appendChild(levelBlock);

        const actions = document.createElement('div');
        actions.className = 'player-actions';

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'btn btn-secondary btn-small';
        editBtn.textContent = t('wizard.edit_player');
        editBtn.addEventListener('click', () => beginEditPlayer(index));

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn btn-danger btn-small';
        removeBtn.textContent = t('wizard.remove_player');
        removeBtn.addEventListener('click', () => removePlayer(index));

        actions.appendChild(editBtn);
        actions.appendChild(removeBtn);

        summary.appendChild(summaryRow);
        summary.appendChild(actions);

        row.appendChild(summary);

        if (appState.playerEditingIndex === index) {
            const edit = document.createElement('div');
            edit.className = 'player-edit';

            const nameField = document.createElement('div');
            nameField.className = 'player-field';
            const nameLabelEdit = document.createElement('label');
            nameLabelEdit.textContent = t('wizard.player_name');
            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.value = player.name || '';
            nameField.appendChild(nameLabelEdit);
            nameField.appendChild(nameInput);

            const classField = document.createElement('div');
            classField.className = 'player-field';
            const classLabelEdit = document.createElement('label');
            classLabelEdit.textContent = t('wizard.player_class');
            const classSelect = document.createElement('select');
            classSelect.className = 'player-class-select';
            populatePlayerClassSelect(classSelect, classes);
            classField.appendChild(classLabelEdit);
            classField.appendChild(classSelect);

            const levelField = document.createElement('div');
            levelField.className = 'player-field';
            const levelLabelEdit = document.createElement('label');
            levelLabelEdit.textContent = t('wizard.player_level');
            const levelInput = document.createElement('input');
            levelInput.type = 'number';
            levelInput.min = '1';
            levelInput.max = '20';
            levelInput.value = levelValue;
            levelField.appendChild(levelLabelEdit);
            levelField.appendChild(levelInput);

            const editActions = document.createElement('div');
            editActions.className = 'player-edit-actions';

            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'btn btn-secondary btn-small';
            cancelBtn.textContent = t('wizard.cancel_edit');
            cancelBtn.addEventListener('click', () => cancelEditPlayer());

            const saveBtn = document.createElement('button');
            saveBtn.type = 'button';
            saveBtn.className = 'btn btn-primary btn-small';
            saveBtn.textContent = t('wizard.save_edit');
            saveBtn.addEventListener('click', () => {
                const nextName = nameInput.value.trim();
                const nextClasses = getSelectedPlayerClasses(classSelect);
                const nextLevel = sanitizePlayerLevel(levelInput.value);
                if (!nextName || nextClasses.length === 0) {
                    notifyUser(t('alerts.fill_name_class'));
                    return;
                }
                player.name = nextName;
                player.level = nextLevel;
                setPlayerClasses(player, nextClasses);
                appState.playerEditingIndex = null;
                renderPlayersList();
            });

            editActions.appendChild(cancelBtn);
            editActions.appendChild(saveBtn);

            edit.appendChild(nameField);
            edit.appendChild(classField);
            edit.appendChild(levelField);
            edit.appendChild(editActions);
            row.appendChild(edit);
        }

        list.appendChild(row);
    });
}

function renderPlayersList() {
    ensurePlayerState();
    const lists = getPlayerLists();
    if (!lists.length) {
        return;
    }
    lists.forEach(renderPlayersListInto);
}

function initPlayerWizard() {
    ensurePlayerState();
    loadPlayerClassOptions().then(() => {
        populateAllPlayerClassSelects();
        renderPlayersList();
    });
}

async function loadPlayerClassOptions() {
    let classes = [];
    if (window.pywebview && window.pywebview.api && window.pywebview.api.get_player_classes) {
        try {
            const response = await window.pywebview.api.get_player_classes();
            if (response && Array.isArray(response.classes)) {
                classes = response.classes;
            } else if (Array.isArray(response)) {
                classes = response;
            }
        } catch (err) {
            logClient('warn', `Failed to load player classes: ${err}`);
        }
    }
    appState.playerClassOptions = normalizePlayerClassOptions(classes);
}

function addPlayer() {
    const nameInput = document.getElementById('player-name');
    const classSelect = document.getElementById('player-class');
    const levelInput = document.getElementById('player-level');
    addPlayerFromInputs(nameInput, classSelect, levelInput);
}

function addPlayerFromManagement() {
    const nameInput = document.getElementById('player-manage-name');
    const classSelect = document.getElementById('player-manage-class');
    const levelInput = document.getElementById('player-manage-level');
    addPlayerFromInputs(nameInput, classSelect, levelInput);
}

function addPlayerFromInputs(nameInput, classSelect, levelInput) {
    ensurePlayerState();
    const name = nameInput ? nameInput.value.trim() : '';
    const classes = getSelectedPlayerClasses(classSelect);
    const level = sanitizePlayerLevel(levelInput ? levelInput.value : null);

    if (!name || classes.length === 0) {
        notifyUser(t('alerts.fill_name_class'));
        return;
    }

    const player = { name, level };
    setPlayerClasses(player, classes);
    appState.session.players.push(player);
    renderPlayersList();

    if (nameInput) {
        nameInput.value = '';
    }
    if (levelInput) {
        levelInput.value = '';
    }
    if (classSelect) {
        Array.from(classSelect.options).forEach(opt => {
            opt.selected = false;
        });
    }
}

function removePlayer(index) {
    ensurePlayerState();
    if (!Number.isInteger(index)) {
        return;
    }
    appState.session.players.splice(index, 1);
    if (Number.isInteger(appState.playerEditingIndex)) {
        if (appState.playerEditingIndex === index) {
            appState.playerEditingIndex = null;
        } else if (appState.playerEditingIndex > index) {
            appState.playerEditingIndex -= 1;
        }
    }
    renderPlayersList();
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

    ensurePlayerState();
    const players = appState.session.players.map(player => {
        const classes = normalizePlayerClasses(player);
        return {
            name: player.name ? String(player.name).trim() : '',
            level: sanitizePlayerLevel(player.level),
            class: classes.join(' / '),
            classes
        };
    });

    if (players.length > 0 && players.some(player => !player.name || player.classes.length === 0)) {
        notifyUser(t('alerts.fill_name_class'));
        return;
    }
    
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
    const buildableTier = getBuildableTier();
    if (Number.isInteger(buildableTier) && facility.tier !== buildableTier) {
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
    const model = getCurrencyModel();
    if (!model || !model.factor_to_base) {
        return {};
    }
    const baseValue = appState.session && appState.session.bastion
        ? appState.session.bastion.treasury_base
        : 0;
    const normalized = normalizeBaseToWallet(
        typeof baseValue === 'number' ? baseValue : 0,
        model
    );
    if (!normalized) {
        return {};
    }
    const remaining = {};
    Object.keys(normalized).forEach(currency => {
        const amount = normalized[currency];
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
        const treasuryBase = (appState.session && appState.session.bastion && typeof appState.session.bastion.treasury_base === 'number')
            ? appState.session.bastion.treasury_base
            : 0;

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
    const refundEstimate = estimateDemolishRefund(facilityId);
    const refundTextEstimate = formatCost(refundEstimate, getCurrencyOrder());

    const lines = [t('build.demolish_confirm', { facility: facilityName })];
    if (activeOrders > 0) {
        lines.push(t('build.demolish_warning_orders', { count: activeOrders }));
    }
    lines.push(t('build.demolish_refund_line', { refund: refundTextEstimate }));
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
        const treasuryBase = (appState.session && appState.session.bastion && typeof appState.session.bastion.treasury_base === 'number')
            ? appState.session.bastion.treasury_base
            : 0;

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
