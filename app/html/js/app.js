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
    console.log('App initialized');
    switchView(1); // Start with View 1 (Wizard)
});
});

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
    const sessionName = document.getElementById('session-name').value;
    const bastionName = document.getElementById('bastion-name').value;
    const bastionType = document.getElementById('bastion-type').value;
    const bastionRegion = document.getElementById('bastion-region').value;
    const bastionStory = document.getElementById('bastion-story').value;
    
    if (!sessionName || !bastionName) {
        alert('Please fill in Session Name and Bastion Name');
        return;
    }
    
    // Update state
    appState.session.name = `${sessionName} (${bastionName})`;
    appState.session.bastion = {
        name: bastionName,
        type: bastionType,
        region: bastionRegion,
        story: bastionStory
    };
    
    // Update header
    document.querySelector('.session-name').textContent = appState.session.name;
    
    // Switch to View 2 (Build)
    switchView(2);
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
    const sessionJson = JSON.stringify(appState.session, null, 2);
    console.log('Session saved:', sessionJson);
    alert('Session saved (see console)');
}

function loadSession() {
    alert('Load session - implement file picker');
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
