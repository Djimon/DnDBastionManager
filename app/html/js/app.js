// Globals
let currentFacility = null;

// Initialisierung - Versuche mehrere Events
function initApp() {
    console.log('App initialisiert, starte loadFacilities...');
    loadFacilities();
}

// Warte auf pywebview
if (window.pywebview && window.pywebview.api) {
    console.log('PyWebView sofort verfügbar');
    initApp();
} else {
    console.log('Warte auf PyWebView...');
    window.addEventListener('_pywebviewready', initApp);
    // Fallback nach 2 Sekunden
    setTimeout(() => {
        if (window.pywebview && window.pywebview.api) {
            console.log('PyWebView verfügbar nach Timeout');
            initApp();
        }
    }, 2000);
}

/**
 * Lade die Liste aller Einrichtungen
 */
async function loadFacilities() {
    try {
        console.log('Lade Facilities...');
        const facilities = await pywebview.api.get_facilities();
        console.log('Facilities gefunden:', facilities);
        
        const listEl = document.getElementById('facilities-list');
        
        if (!facilities || facilities.length === 0) {
            listEl.innerHTML = '<p class="error">Keine Einrichtungen gefunden</p>';
            return;
        }
        
        listEl.innerHTML = '';
        
        facilities.forEach(facility => {
            const item = document.createElement('div');
            item.className = 'facility-item';
            item.textContent = facility.replace('core_', '').replace(/_/g, ' ');
            item.addEventListener('click', () => selectFacility(facility));
            listEl.appendChild(item);
        });
    } catch (error) {
        console.error('Fehler beim Laden der Einrichtungen:', error);
        document.getElementById('facilities-list').innerHTML = 
            '<p class="error">Fehler: ' + error.message + '</p>';
    }
}

/**
 * Wähle eine Einrichtung und zeige ihre Daten
 */
async function selectFacility(facilityName) {
    try {
        currentFacility = facilityName;
        
        // Alle Items demarkieren
        document.querySelectorAll('.facility-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Aktuelle Item markieren
        event.target.classList.add('active');
        
        // Daten laden
        const data = await pywebview.api.load_facility(facilityName);
        
        if (data.error) {
            showError(data.error);
            return;
        }
        
        displayFacility(facilityName, data);
    } catch (error) {
        console.error('Fehler beim Laden der Einrichtung:', error);
        showError('Fehler beim Laden der Einrichtung');
    }
}

/**
 * Zeige die Details einer Einrichtung
 */
function displayFacility(name, data) {
    const contentEl = document.getElementById('content-area');
    const displayName = name.replace('core_', '').replace(/_/g, ' ').toUpperCase();
    
    let html = `
        <div class="facility-details">
            <div class="facility-header">
                <h2>${displayName}</h2>
                <button class="btn" onclick="refreshFacility()">Aktualisieren</button>
            </div>
            
            <div class="section">
                <h3>Daten</h3>
                <div class="json-viewer">${JSON.stringify(data, null, 2)}</div>
            </div>
            
            <div class="section">
                <h3>Aktionen</h3>
                <p>Hier können später Bearbeitungsfunktionen hinzugefügt werden.</p>
            </div>
        </div>
    `;
    
    contentEl.innerHTML = html;
}

/**
 * Aktualisiere die aktuelle Einrichtung
 */
async function refreshFacility() {
    if (currentFacility) {
        await selectFacility(currentFacility);
    }
}

/**
 * Zeige eine Fehlermeldung
 */
function showError(message) {
    const contentEl = document.getElementById('content-area');
    contentEl.innerHTML = `<div class="error"><strong>Fehler:</strong> ${message}</div>`;
}
