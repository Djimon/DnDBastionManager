# View 1: Session Wizard #

**Purpose:** DM erstellt eine neue Session mit Bastion-Info und Spieler-Registrierung.

**Ablauf:**
1. Session-Name (auto-suffix mit Timestamp)
2. Bastion-Konfiguration:
   - Bastion-Name
   - Bastion-Typ / Theme (z.B. "Taverne", "Geheime Base", "Akademie")
   - Region / Ort in der Welt
   - "Wie gefunden" oder Story-Kontext (Freitext)
3. Spieler registrieren (wiederholbar):
   - Character-Name
   - Klasse
   - Level
   - [ Add Player ]
4. [ Create Session ] → Speichert als JSON, leere Bastion-State

**Outputs:**
- Session JSON mit:
  - Leeres Facilities-Array
  - Leeres NPC-Roster
  - Initialer Wallet (0 oder default config)
  - Initialisierte Stats Registry (mit custom_stats aus geladenen Packs, falls vorhanden)
  - Player Registry

**Packs:** Werden im Hintergrund geladen (keine UI-Interaktion nötig, bis zum Bauen).

---

# View 2: Build Queue / Empty Bastion #

**Purpose:** Bastion ist leer, Facilities müssen gebaut werden. DM kann mehrere parallel bauen.

**Funktionen:**
- **Facility Catalog:** Alle verfügbaren Facilities (aus geladenen Packs)
  - Filter nach: Pack / Tag / Tier / Profession
  - Zeigt: Name, Kosten, Bauzeit, NPC-Slots
- **Build Queue:**
  - Mehrere Facilities gleichzeitig baubar
  - Kosten-Summe berechnen
  - **Negatives Budget erlaubt** (mit Warnung, z.B. "Remaining: -50g") – Ermessen des DM, keine Tool-Logik
  - [ Remove ] pro Facility
  - [ Start Building ]: Speichert Queue, setzt Facilities in "building" State
- **NPC-Anstellung:** NICHT hier. Erst in View 3, wenn Facility fertig ist.

---

# View 3: Turn Console (Hub) #

```pqsql
+------------------------------------------------------+
| Session / Turn / Gold / Stats / Buttons              |
+-------------+----------------------------------------+
| Facilities  |  Facility Detail (Tabs)                |
| (Liste)     |                                        |
|             |  [ Details | NPCs | Orders ]           |
|             |                                        |
|             |  Tab Content                           |
|             |                                        |
+-------------+----------------------------------------+
| Turn Controls / Roll / Resolve                       |
+------------------------------------------------------+
```

## Top Bar (global) ##

Immer sichtbar.
Zweck: Session + Überblick

Typische Inhalte:
- Session Dropdown (laden/neu)
- Turn Counter
- Gold / Silver / Copper
- Custom Stats (Heat, Reputation, …)

Buttons:
- Save
- End Turn / Resolve

## Links: Facility Liste ##

Nur die verfügbaren Facilities der aktuellen Bastion (per Session).
Einfach, schnell klickbar.

Beispiel:
- Whisper Office ★★ (busy)
- Garden ★ (idle)
- Workshop ★★★ (upgrading)
- Shrine ★ (idle)

(Stern-Icon = Upgrade-Stufe, Status = building / upgrading / busy (Order läuft) / idle)

**Funktionen:**
- Klick auf ListItem → lädt rechts die Details
- Button: [ + New Facility ] → öffnet View 2 (Build Queue)
- Button: [ + Manage NPCs ] → öffnet NPC-Management-Modal (s.u.)

## Rechts: Facility Panel mit Tabs ##

3 Reiter: **Details | NPCs | Orders**

### Tab: Details ###

**Nur Info + Upgrade**

Inhalt:
- Name
- Beschreibung
- Tier / Sterne (mit aktueller Stufe)
- NPC Slots (x/y aktuell besetzt)
- Build/Upgrade Kosten + Dauer
- [ Upgrade Button ] (nur wenn freigeschalten / Ressourcen da)
- Aktive Order (nur Anzeige mit Restlaufzeit, Details im Orders-Tab)

Optional:
- Aktuelle Mechaniken (z.B. Heat-Anzeige nur für diese Facility)
- Beschreibung von Upgrades

**Ziel:** 👉 Schneller Überblick, Info lesen + Upgrade starten.

### Tab: NPCs ###

**Verwaltung der NPCs dieser Facility**

Liste:
```
Name      Beruf        Level      XP    Upkeep/Turn
------------------------------------------------------
Rook      Spy          Rookie     3/5   5 Silber
Mara      Informant    Master     12/10 20 Gold
```

**Buttons:**
- [ + Hire NPC ] → Modal: NPC suchen/erstellen, Upkeep aushandeln
- [ Fire ] (pro NPC) → NPC entfernen, Upkeep stoppt nächsten Turn

**Ziel:** 👉 Personal verwalten, Anstellung/Kündigung.

### Tab: Orders ###

**Aktive Order + Order-Picker**

**Wenn Order aktiv:**
- Order-Name
- Beschreibung
- Remaining Turns
- Erwartete Outcomes (Vorschau der möglichen Effekte)
- Roll-Status: Pending / Locked / Resolved
- [ Lock Order ] (wenn noch nicht gerollt)
- Roll Panel (s.u.)

**Wenn keine Order aktiv:**
- Dropdown / Liste: [ Select Order ]
- Auswahl → Vorschau:
  - Beschreibung
  - Duration
  - Min NPC Level
  - Mögliche Outcomes (gut / neutral / schlecht)
- [ Choose ] → sperrt Order (darf nicht mehr wechseln bis Resolve)

**Roll Panel (nach Lock):**
- Roll Input: [ Manual 15 ] oder [ 🎲 Auto Roll ]
- Resultat: Outcome Bucket (crit_success / success / fail / crit_fail)
- Effekte-Preview: Currency/Items/Stats/Events
- [ Apply / Resolve ] → Ledger buchen, XP geben, Events loggen




## Bottom Bar: Turn Controls ##

**Globaler Turn-Flow:**

Buttons:
- [ Build New Facility ] → View 2 (Build Queue)
- [ Manage NPCs ] → NPC-Management-Modal (s.u.)
- [ Advance Turn / Resolve ] → Rechnet alles aus (remaining_turns--, resolves finished Builds/Orders)
- [ Save Session ]

**Log-Fenster** (letzten 20 Log-Nachrichten, neueste unten, scrollbar):
```
Success: Garden +20 gold
Event: Office agent eliminated (Heat +10)
Success: Shrine +1 reputation
Failed: Workshop craft attempt (no outcome)
```

**Ziel:** 👉 Turn-Zyklus steuern, Log sehen, Sessions speichern.

---

## Modal: NPC Management ##

Wird geöffnet durch [ Manage NPCs ] Button (Bottom Bar).

**Zweck:** Zentrale NPC-Verwaltung für alle Facilities.

**Tabs/Sections:**
1. **NPC List (aktuell angestellt)**
   - Tabelle: Name | Facility | Profession | Level | XP | Upkeep/Turn | [ Fire ]
   - Summe: Total Upkeep/Turn (z.B. "47 Gold, 3 Silver")

2. **Hire New NPC**
   - Dropdown/Input: NPC-Name oder "Create Custom"
   - Profession auswählen (aus verfügbaren Slots)
   - Level (optional, default Apprentice)
   - Upkeep verhandeln (Input-Feld, DM gibt ein wieviel)
   - Assign to Facility (Dropdown, nur freie Slots)
   - [ Hire ]

3. **Roster/Pool** (optional)
   - Verfügbare NPCs, die in der Welt existieren aber nicht angestellt sind
   - Kann manuell erweitert werden

**Ziel:** 👉 NPCs flexibel anstellen/kündigen, auch wenn Facility nicht im aktuellen Facility-Panel ist.

---

## Datenstrom & Abhängigkeiten ##

**View 1 → View 2 → View 3 (zyklisch)**

1. **View 1 (New Session):** erzeugt leere Session
2. **View 2 (Build):** DM entscheidet welche Facilities gebaut werden
3. **View 3 (Turn):** Facility-Management, Orders, Würfeln
   - **Während View 3:** DM kann View 2 (Build) aufrufen für Neu-/Upgrades
   - **Während View 3:** DM kann NPC-Modal aufrufen zum Anstellen/Kündigen
4. **Advance Turn:** Reduziert Bauzeit/Order-Dauer, resolved fertige Dinge
5. **Save Session:** Persistiert aktuellen Stand

**Packs:** Im Hintergrund initial geladen, verwendet in View 2 (Facility Catalog) und View 3 (Order Resolver).