// Globals
let currentFacility = null;

// Initialisierung
document.addEventListener('DOMContentLoaded', () => {
    loadFacilities();
});

/**
 * Lade die Liste aller Einrichtungen
 */
async function loadFacilities() {
    try {
        const facilities = await pywebview.api.get_facilities();
        const listEl = document.getElementById('facilities-list');
        
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
            '<p class="error">Fehler beim Laden der Einrichtungen</p>';
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
