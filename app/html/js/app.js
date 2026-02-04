// ===== LOGGING UTILITY =====

function logClient(level, message) {
    console.log(`[${level.toUpperCase()}] ${message}`);
    if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.log_client(level, message).catch(err => {
            console.error('Failed to send log to server:', err);
        });
    }
}

// ===== APP STATE =====

let appState = {
    currentView: 1,
    currentTab: 'details',
    selectedFacilityId: null,
    session: {
        name: '[No Session]',
        turn: 0,
        wallet: { gold: 0, silver: 0, copper: 0 },
        facilities: [],
        npcs: [],
        players: [],
    },
    buildQueue: [],
};

// ===== INITIALIZATION =====

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOMContentLoaded fired - App initializing...');
    console.log('window.pywebview available:', !!window.pywebview);
    logClient('info', 'App initialized');
    switchView(1); // Start with View 1 (Wizard)
});

// Zusätzlich: Warte auf pywebview wenn noch nicht ready
if (window.addEventListener && typeof window.pywebviewready === 'undefined') {
    window.addEventListener('pywebviewready', function() {
        console.log('PyWebView ready event fired');
        logClient('info', 'PyWebView connection established');
        validatePacks(false);
    });
}

// ===== VIEW NAVIGATION =====

function switchView(viewNum) {
    appState.currentView = viewNum;
    
    // Hide all views
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    
    // Show selected view
    const viewId = `view-${viewNum}`;
    const view = document.getElementById(viewId);
    if (view) {
        view.classList.add('active');
    }
}

function switchTab(tabName) {
    appState.currentTab = tabName;
    
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    // Show selected tab
    const tabId = `tab-${tabName}`;
    const tab = document.getElementById(tabId);
    if (tab) {
        tab.classList.add('active');
    }
    
    // Mark button as active
    event.target.classList.add('active');
}

function switchModalTab(tabName) {
    document.querySelectorAll('.modal-tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.modal-tab-btn').forEach(b => b.classList.remove('active'));
    
    const tabId = `modal-tab-${tabName}`;
    const tab = document.getElementById(tabId);
    if (tab) {
        tab.classList.add('active');
    }
    
    event.target.classList.add('active');
}

// ===== MODALS =====

function openNPCModal() {
    const modal = document.getElementById('npc-modal');
    if (modal) {
        modal.classList.remove('hidden');
    }
}

function openHireModal() {
    const modal = document.getElementById('npc-modal');
    if (modal) {
        modal.classList.remove('hidden');
        switchModalTab('hire');
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
    }
}

// Close modal when clicking outside
window.addEventListener('click', function(event) {
    const modals = document.querySelectorAll('.modal:not(.hidden)');
    modals.forEach(modal => {
        if (event.target === modal) {
            modal.classList.add('hidden');
        }
    });
});

function validatePacks(showAlert = true) {
    if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.validate_packs().then(report => {
            const errors = (report && report.errors) ? report.errors : [];
            const warnings = (report && report.warnings) ? report.warnings : [];
            const configErrors = report && report.config && report.config.errors ? report.config.errors : [];
            const configWarnings = report && report.config && report.config.warnings ? report.config.warnings : [];
            const summary = `Pack Validation: ${errors.length} errors, ${warnings.length} warnings` +
                (configErrors.length ? ` | Config errors: ${configErrors.length}` : ``) +
                (configWarnings.length ? ` | Config warnings: ${configWarnings.length}` : ``);

            logClient(errors.length ? "error" : (warnings.length ? "warn" : "info"), summary);

            if (showAlert) {
                if (errors.length === 0 && warnings.length === 0) {
                    alert("Pack Validation: OK (0 errors, 0 warnings)");
                } else {
                    alert(summary + "\nDetails stehen im Log.");
                }
            }
        }).catch(err => {
            logClient("error", `Pack validation failed: ${err}`);
            if (showAlert) {
                alert("Pack Validation failed. Check logs.");
            }
        });
    } else if (showAlert) {
        alert("PyWebView not available");
    }
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
        alert('Session created (local mode)');
        switchView(2);
    }
}

// ===== VIEW 2: BUILD QUEUE =====

function addToQueue(facilityId) {
    // Placeholder: add facility to queue
    appState.buildQueue.push({
        id: facilityId,
        name: `[Facility ${facilityId}]`,
        cost: 250 * facilityId,
        duration: facilityId
    });
    
    updateQueueDisplay();
}

function removeFromQueue(facilityId) {
    appState.buildQueue = appState.buildQueue.filter(f => f.id !== facilityId);
    updateQueueDisplay();
}

function clearQueue() {
    appState.buildQueue = [];
    updateQueueDisplay();
}

function updateQueueDisplay() {
    const queueList = document.getElementById('queue-list');
    queueList.innerHTML = '';
    
    let totalCost = 0;
    appState.buildQueue.forEach(facility => {
        const item = document.createElement('div');
        item.className = 'queue-item';
        item.innerHTML = `
            <div class="queue-item-info">
                <strong>${facility.name}</strong>
                <p>${facility.cost}g | ${facility.duration} Turn</p>
            </div>
            <button class="btn btn-danger" onclick="removeFromQueue(${facility.id})">Remove</button>
        `;
        queueList.appendChild(item);
        totalCost += facility.cost;
    });
    
    document.getElementById('total-cost').textContent = `${totalCost}g`;
    
    const currentBudget = appState.session.wallet.gold;
    const remaining = currentBudget - totalCost;
    const remainingText = remaining < 0 ? `${remaining}g (Override!)` : `${remaining}g`;
    document.getElementById('remaining-budget').textContent = remainingText;
}

function startBuilding() {
    if (appState.buildQueue.length === 0) {
        alert('Add facilities to queue first');
        return;
    }
    
    // TODO: Apply gold cost
    // TODO: Add facilities to session in "building" state
    alert(`Starting build of ${appState.buildQueue.length} facilities!`);
    clearQueue();
    switchView(3); // Go to Turn Console
}

// ===== VIEW 3: TURN CONSOLE =====

function selectFacility(facilityId) {
    appState.selectedFacilityId = facilityId;
    
    // Update UI
    document.querySelectorAll('.facility-list-item').forEach(item => item.classList.remove('active'));
    event.target.closest('.facility-list-item').classList.add('active');
    
    // Load facility details (placeholder)
    document.getElementById('detail-name').textContent = `[Facility ${facilityId}]`;
    document.getElementById('detail-desc').textContent = `Description for facility ${facilityId}`;
}

function resolveOrder() {
    const manualRoll = document.getElementById('manual-roll').value;
    if (!manualRoll) {
        alert('Enter or roll a value');
        return;
    }
    
    alert(`Resolved order with roll: ${manualRoll}`);
    addLogEntry('Order resolved', 'success');
}

function autoRoll() {
    const roll = Math.floor(Math.random() * 20) + 1;
    document.getElementById('manual-roll').value = roll;
}

function advanceTurn() {
    appState.session.turn++;
    document.querySelector('.turn-counter').textContent = `Turn: ${appState.session.turn}`;
    
    // TODO: Apply facility state changes, order durations, etc.
    addLogEntry(`Turn ${appState.session.turn} advanced`, 'event');
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

console.log('App.js loaded - all functions ready');
