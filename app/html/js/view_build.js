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

    packFilter.innerHTML = '<option value="">Alle Packs</option>';
    Array.from(packs).sort().forEach(pack => {
        const option = document.createElement('option');
        option.value = pack;
        option.textContent = pack;
        packFilter.appendChild(option);
    });

    tierFilter.innerHTML = '<option value="">Alle Tiers</option>';
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
        tierFilter.title = 'Nur Tier 1 kann direkt gebaut werden. Höhere Tiers nur per Upgrade.';
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
        placeholder.textContent = 'Keine Facilities gefunden.';
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
        const slotsText = Number.isInteger(facility.npc_slots) ? `Slots: ${facility.npc_slots}` : 'Slots: ?';
        info.textContent = `${costText} | ${durationText} | ${slotsText}`;

        const button = document.createElement('button');
        button.className = 'btn btn-small';
        button.textContent = '+ Add to Queue';
        button.addEventListener('click', () => addToQueue(facility.id));

        item.appendChild(title);
        item.appendChild(info);
        item.appendChild(button);
        const badge = buildPackBadgeElement(facility && facility._pack_source ? facility._pack_source : 'core');
        if (badge) {
            item.appendChild(badge);
        }
        list.appendChild(item);
    });
}

function buildPackBadgeElement(source) {
    const badge = document.createElement('span');
    const packSource = source === 'custom' ? 'custom' : 'core';
    badge.className = `pack-badge pack-${packSource}`;
    badge.title = packSource === 'custom' ? 'Custom pack (auf eigene Gefahr)' : 'Core pack';
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
        alert('Please fill in Name and Class');
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
        alert('Please fill in DM Name, Session Name and Bastion Name');
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
                document.querySelector('.session-name').textContent = 
                    `${sessionName} (${bastionName})`;
                alert('Session created!');
                switchView(2);
            } else {
                logClient('error', `Session creation failed: ${response.message}`);
                alert('Error: ' + response.message);
            }
        }).catch(err => {
            logClient('error', `API call error: ${err}`);
            alert('API Error: ' + err);
        });
    } else {
        // Fallback: lokales Frontend-Only Testing
        appState.session.name = `${sessionName} (${bastionName})`;
        appState.session.dm_name = dmName;
        appState.session.bastion = { 
            name: bastionName, 
            location: bastionLocation, 
            description: bastionDescription 
        };
        appState.session.players = players;
        
        document.querySelector('.session-name').textContent = `${sessionName} (${bastionName})`;
        renderAuditLog();
        updateTurnCounter();
        updateQueueDisplay();
        loadCurrencyModel();
        alert('Session created (local mode)');
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
    if (Number.isInteger(BUILDABLE_TIER) && facility.tier !== BUILDABLE_TIER) {
        alert('Nur Tier 1 kann direkt gebaut werden. Höhere Tiers bitte upgraden.');
        return;
    }
    appState.buildQueue.push({
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
        const facility = appState.facilityById[entry.id];
        const buildInfo = getFacilityBuildInfo(facility);
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
        const facility = appState.facilityById[entry.id];
        const buildInfo = getFacilityBuildInfo(facility);
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
        empty.textContent = 'Queue ist leer.';
        queueList.appendChild(empty);
    }

    const currencyOrder = getCurrencyOrder();
    appState.buildQueue.forEach((entry, index) => {
        const facility = appState.facilityById[entry.id];
        const name = formatFacilityUiName(facility, entry.id);
        const buildInfo = getFacilityBuildInfo(facility);
        const costText = formatCost(buildInfo.cost, currencyOrder);
        const durationText = formatDuration(buildInfo.duration);
        const item = document.createElement('div');
        item.className = 'queue-item';
        item.innerHTML = `
            <div class="queue-item-info">
                <strong>${name}</strong>
                <p>${costText} | ${durationText}</p>
            </div>
            <button class="btn btn-danger" onclick="removeFromQueue(${index})">Remove</button>
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
                const suffix = remainingBase < 0 ? ' (Override!)' : '';
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
}

async function startBuilding() {
    if (appState.buildQueue.length === 0) {
        alert('Add facilities to queue first');
        return;
    }

    if (!(window.pywebview && window.pywebview.api)) {
        alert('PyWebView not available');
        return;
    }

    const remainingQueue = [];
    const errors = [];
    let builtCount = 0;

    for (const entry of appState.buildQueue) {
        const facilityId = entry.id;
        const facilityName = getFacilityDisplayName(facilityId);
        let response = await window.pywebview.api.add_build_facility(facilityId, false);

        if (response && response.requires_confirmation) {
            let detail = '';
            if (typeof response.projected_treasury_base === 'number') {
                const projectedText = formatBaseValue(response.projected_treasury_base);
                const shortfallText = formatBaseValue(Math.abs(response.projected_treasury_base));
                detail = `Ergebnis nach Bau: ${projectedText}\nÜberschreitung: ${shortfallText}\n`;
            }
            const confirmText = `Nicht genug Budget für ${facilityName}.\n${detail}Trotzdem bauen?`;
            const proceed = confirm(confirmText);
            if (!proceed) {
                remainingQueue.push(entry);
                continue;
            }
            response = await window.pywebview.api.add_build_facility(facilityId, true);
        }

        if (!response || !response.success) {
            const message = response && response.message ? response.message : 'unknown error';
            errors.push(`${facilityName}: ${message}`);
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
        alert(`Build errors:\n${errors.join('\n')}`);
    }
    if (builtCount > 0) {
        switchView(3); // Go to Turn Console
    }
}
