function renderFacilityStates() {
    const list = document.getElementById('facilities-left-panel');
    if (!list) {
        return;
    }
    list.innerHTML = '';

    if (!appState.facilityStates || appState.facilityStates.length === 0) {
        const placeholder = document.createElement('div');
        placeholder.className = 'facility-list-item';
        placeholder.textContent = 'Keine Facilities gebaut.';
        list.appendChild(placeholder);
        return;
    }

    appState.facilityStates.forEach(state => {
        const item = document.createElement('div');
        item.className = 'facility-list-item';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'facility-name';
        nameSpan.textContent = getFacilityDisplayName(state.facility_id);

        const statusSpan = document.createElement('span');
        statusSpan.className = 'facility-status';
        const statusLabel = state.state || 'unknown';
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
        nameEl.textContent = facility ? (facility.name || facilityId) : facilityId;
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
            slotsEl.textContent = '?';
        }
    }
    if (statusEl) {
        statusEl.textContent = state && state.state ? state.state : 'unknown';
    }

    updateUpgradeSection(facilityId);
}

function updateUpgradeSection(facilityId) {
    const infoEl = document.getElementById('upgrade-info');
    const buttonEl = document.getElementById('upgrade-button');
    if (!infoEl || !buttonEl) {
        return;
    }

    const target = appState.facilityCatalog.find(facility => facility && facility.parent === facilityId);
    appState.selectedUpgradeTargetId = target ? target.id : null;

    if (!target) {
        infoEl.textContent = 'No upgrade available';
        buttonEl.textContent = 'Upgrade';
        buttonEl.disabled = true;
        return;
    }

    const buildInfo = getFacilityBuildInfo(target);
    const costText = formatCost(buildInfo.cost, getCurrencyOrder());
    const durationText = formatDuration(buildInfo.duration);
    infoEl.textContent = `Cost: ${costText} | Duration: ${durationText}`;
    buttonEl.textContent = `Upgrade to ${target.name || target.id}`;
    buttonEl.disabled = false;
}

async function startUpgrade() {
    const facilityId = appState.selectedFacilityId;
    if (!facilityId) {
        alert('Select a facility first.');
        return;
    }
    if (!(window.pywebview && window.pywebview.api)) {
        alert('PyWebView not available');
        return;
    }

    let response = await window.pywebview.api.add_upgrade_facility(facilityId, false);
    if (response && response.requires_confirmation) {
        const facilityName = getFacilityDisplayName(facilityId);
        let detail = '';
        if (typeof response.projected_treasury_base === 'number') {
            const projectedText = formatBaseValue(response.projected_treasury_base);
            const shortfallText = formatBaseValue(Math.abs(response.projected_treasury_base));
            detail = `Ergebnis nach Upgrade: ${projectedText}\nÜberschreitung: ${shortfallText}\n`;
        }
        const proceed = confirm(`Nicht genug Budget für ${facilityName}.\n${detail}Trotzdem upgraden?`);
        if (!proceed) {
            return;
        }
        response = await window.pywebview.api.add_upgrade_facility(facilityId, true);
    }

    if (!response || !response.success) {
        const message = response && response.message ? response.message : 'unknown error';
        alert(`Upgrade failed: ${message}`);
        return;
    }

    await refreshSessionState();
    await refreshFacilityStates();
    selectFacility(facilityId);
}

function resolveOrder() {
    const manualRoll = document.getElementById('manual-roll').value;
    if (!manualRoll) {
        alert('Enter or roll a value');
        return;
    }
    
    const sourceId = buildRollSourceId();
    logAuditEvent({
        event_type: "roll",
        source_type: "facility",
        source_id: sourceId,
        action: "resolve_order",
        roll: String(manualRoll),
        result: "resolved",
        log_text: `${sourceId} rolled ${manualRoll}`
    });
    alert(`Resolved order with roll: ${manualRoll}`);
    addLogEntry('Order resolved', 'success');
}

function autoRoll() {
    const roll = Math.floor(Math.random() * 20) + 1;
    document.getElementById('manual-roll').value = roll;
    const sourceId = buildRollSourceId();
    logAuditEvent({
        event_type: "roll",
        source_type: "facility",
        source_id: sourceId,
        action: "auto_roll",
        roll: String(roll),
        result: "rolled",
        log_text: `${sourceId} rolled ${roll}`
    });
}

async function advanceTurn() {
    if (window.pywebview && window.pywebview.api && window.pywebview.api.advance_turn) {
        const response = await window.pywebview.api.advance_turn();
        if (!response || !response.success) {
            alert(`Advance turn failed: ${response && response.message ? response.message : 'unknown error'}`);
            return;
        }
        appState.session.current_turn = response.current_turn;
        updateTurnCounter();
        await refreshSessionState();
        await refreshFacilityStates();

        const completed = response.completed || [];
        if (completed.length) {
            const names = completed.map(entry => getFacilityDisplayName(entry.facility_id)).join(', ');
            addLogEntry(`Turn ${response.current_turn} advanced (completed: ${names})`, 'event');
        } else {
            addLogEntry(`Turn ${response.current_turn} advanced`, 'event');
        }
    } else {
        appState.session.turn++;
        updateTurnCounter();
        addLogEntry(`Turn ${appState.session.turn} advanced`, 'event');
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
        alert('Session saved (see console)');
    }
}

function loadSession() {
    logClient('info', 'Opening load session dialog');
    
    if (window.pywebview && window.pywebview.api) {
        // Lade Liste der verfügbaren Sessions
        window.pywebview.api.list_sessions().then(response => {
            if (!response.success || response.sessions.length === 0) {
                alert('No sessions available');
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
                        <button class="btn btn-primary btn-small" onclick="loadSessionFile('${filename}')">Load</button>
                    </div>
                `;
                sessionsList.appendChild(div);
            });
            
            const modal = document.getElementById('load-session-modal');
            modal.classList.remove('hidden');
        }).catch(err => {
            logClient('error', `Failed to load session list: ${err}`);
            alert('Error loading sessions');
        });
    } else {
        alert('PyWebView not available');
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
                alert(`Session loaded: ${filename}`);
                closeModal('load-session-modal');
                switchView(3);  // Gehe zu Turn Console
            } else {
                logClient('error', `Failed to load session: ${response.message}`);
                alert('Error: ' + response.message);
            }
        }).catch(err => {
            logClient('error', `Failed to load session file: ${err}`);
            alert('Error: ' + err);
        });
    } else {
        alert('PyWebView not available');
    }
}

// ===== NPC MANAGEMENT =====

function fireNPC() {
    alert('Fire NPC - placeholder');
}

function hireNPC() {
    const name = document.getElementById('hire-name').value;
    const profession = document.getElementById('hire-profession').value;
    const level = document.getElementById('hire-level').value;
    const upkeep = document.getElementById('hire-upkeep').value;
    const facility = document.getElementById('hire-facility').value;
    
    if (!name || !upkeep) {
        alert('Fill in Name and Upkeep');
        return;
    }
    
    appState.session.npcs.push({ name, profession, level, upkeep, facility });
    alert(`Hired ${name}!`);
    closeModal('npc-modal');
}

console.log('App scripts loaded - all functions ready');
