function getNpcProgression() {
    return appState.npcProgression || {
        xp_per_success: 1,
        level_thresholds: {
            apprentice_to_experienced: 5,
            experienced_to_master: 10
        }
    };
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

function renderNpcModal() {
    renderNpcManagement();
    renderHireNpcForm();
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

