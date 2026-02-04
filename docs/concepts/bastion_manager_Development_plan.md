# Bastion Manager – Konkreter Entwicklungsplan (ohne Code)

> Ziel: Aus deinen vorhandenen Daten (Packs + `bastion_config.json`) ein Tool bauen, das einen DM durch Session-Setup, Build-Phase und den wöchentlichen Turn-Zyklus führt – inklusive Würfen, Effekten, Ledger, Events und Savegames.

---

## 1. Rahmen & harte Fakten aus der Datenbasis

### 1.1 Turn- und Currency-Regeln (global)
- **Turn Duration:** `1 week`
- **Currency Types:** `copper`, `silver`, `gold`
- **Conversion:** 10 copper = 1 silver, 10 silver = 1 gold
- **Default Build Costs:**
  - `new_facility`: 250g, 1 Turn
  - `upgrade_tier_1`: 500g, 2 Turns
  - `upgrade_tier_2`: 1000g, 3 Turns

> Wichtig: einzelne Facilities können abweichende Build-Kosten/-Dauern in ihren Facility-Defs setzen (z. B. Whisper Office T1: 80g / 2 Turns). Das System muss **Facility.build** immer bevorzugen, sonst auf Defaults fallen.

### 1.2 Check Profiles & Crit Handling (global)
- CheckProfiles sind zentral definiert (z. B. `d20`, `d20_hard`, `d20_easy`, `d10`, `d6`).
- Ein CheckProfile enthält **DCs je NPC-Level** und **kritische Erfolgs-/Fehlschlag-Schwellen**.

### 1.3 NPC-Progression (global)
- `xp_per_success = 1`
- Thresholds:
  - Apprentice → Experienced: 5 XP
  - Experienced → Master: 10 XP

### 1.4 Pack-Struktur (wichtig für Loader/Validator)
- Ein Pack besteht u. a. aus:
  - `pack_id`, `name`, `version`, `author`
  - `facilities: []` (jede Facility mit `orders: []`)
  - optional `custom_mechanics: []` (z. B. `stat_counter`, `event_table`, `formula_engine`)

Beispiele aus deinen Packs:
- Core Facilities (Garden, Workshop, Arcane Study, Shrine) als normale `facilities[]`.
- Whisper Office enthält `custom_mechanics`:
  - `stat_counter` (`heat`)
  - `event_table` (`whisperoffice_events`) mit Gruppen:
    - `whisperoffice.breakthroughs`, `whisperoffice.safehouse`, `whisperoffice.ops_disaster`
- Pub enthält `custom_mechanics`:
  - `formula_engine` (“Pub Management”) mit `inputs`, `calculations`, `effects`

---

## 2. Produkt-Zielbild (Scope, Nicht-Ziele)

### 2.1 Ziel-Loop pro Turn (1 Woche)
Facility auswählen → Order locken → Roll manuell/auto → Outcome auswerten → Effects anwenden → Events loggen → Ledger/Inventory/Stats aktualisieren → Turn advance

### 2.2 Was das Tool bewusst NICHT sein soll
- Kein “automatisches DnD-Adventure”, kein Encounter-Generator
- Kein Balancing-Tool für DnD-Regeln – nur Bastion-Logik aus deinen Daten
- Keine Multi-User-Collab in V1 (kann später kommen)

---

## 3. UI-Konzept als 3-Screen MVP (damit’s lieferbar bleibt)

### Screen S1: **New Session Wizard** (deine Phase 1)
**Eingaben**
- Session Name (UI) + **Timestamp Suffix** (automatisch)
- Bastion: Type/Theme, Bastion-Name, Region, “Wie gefunden” (Freitext)
- Spieler registrieren:
  - Charactername (required)
  - Klasse (required)
  - Level (optional)

**Outputs**
- Initialer Savegame-State:
  - Wallet (startwerte nach global config oder 0)
  - Inventory leer
  - Stats Registry initialisiert (inkl. custom stats aus Packs)
  - Facilities leer
  - NPC Roster leer

---

### Screen S2: **Build Queue / Empty Bastion** (deine Phase 2)
**Ziel:** Bastion ist leer, Facilities müssen erst gebaut werden.

**Funktionen**
- Facility-Katalog (aus geladenen Packs), Filter:
  - Pack / Tag / Tier / Professionen
- “Build Facility” (1–4 auswählbar) → BuildQueue:
  - zeigt verbleibende Turns
  - zieht Gold sofort aus Wallet ab
- Wallet kann **negativ** werden:
  - DM bestätigt Override (narrativ “Kredit”)
- NPCs können **vor** Facility-Fertigstellung eingestellt werden:
  - aber Orders erst nutzbar, wenn Facility **finished/free** ist

---

### Screen S3: **Turn Console** (deine Phase 3)
**Pro Facility**
- Status: `building / upgrading / busy / free`
- NPC Assignment (oder “unassigned”)
- Order Picker (nur Orders, die min_npc_level erfüllen)
- “Lock Order” → erzeugt In-Progress State (duration_turns)
- Roll Panel:
  - Manual: DM gibt Wurf ein
  - Auto: Dice Engine würfelt
  - Ergebnis: crit_success / success / fail / crit_fail
- Outcome Preview:
  - Effekte (Currency/Items/Stats/Events) als Delta
- Resolve / Apply:
  - Ledger buchen
  - NPC XP buchen (bei Erfolg)
  - Events auflösen + loggen
- “Advance Turn”:
  - reduziert remaining_turns für Builds/Upgrades/Orders
  - resolved fertige Dinge
  - schreibt Turn Log

---

## 4. Engine-Architektur als klare Verantwortlichkeiten (ohne Code)

> Du hast die Kernmodule schon sauber benannt. Hier ist die “Vertragssicht”, damit verschiedene Agents daran parallel arbeiten können.

### 4.1 Loader
- lädt Packs + global config + session save
- merged `custom_mechanics` in eine **Runtime Registry** (Stats, EventTables, FormulaEngines)

### 4.2 Validator
- Schema-Check (Pflichtfelder, Typen)
- Referenzen:
  - `parent` facility exists (oder null)
  - `check_profile` exists in global config
  - `event_table` groups exist
  - `stat` keys exist (base + custom stat_counter)
- Output: “Hard Fail” vs “Warnings”

### 4.3 Resolver
- berechnet pro Facility den aktiven State:
  - `building`: facility exists in buildqueue, not finished
  - `upgrading`: upgrade in progress
  - `busy`: order locked, remaining_turns > 0
  - `free`: fertig und kein order lock

### 4.4 Roller
- manual input + dice engine
- crit handling über check_profiles
- optional: seed/determinism (für Debug)

### 4.5 Evaluator
- mapping: roll_result → outcome bucket → effects[]
- “effects[]” sind nur Daten, keine Logik

### 4.6 Ledger
- Wallet (gold/silver/copper) + conversion
- Inventory item quantities (add/remove)
- Stats (add/remove/clamp je stat_counter rules)
- optional: audit trail (buchungsliste)

### 4.7 EventService
- `event_table`: resolve specific event oder random draw aus group
- `random_event: group:<id>` → weighted draw
- autolog: schreibt in Turn Log + Facility Log

### 4.8 Persistence
- Session Save JSON:
  - versioning
  - migrations (V1: minimal, nur bump + safe defaults)

---

## 5. Mehrphasen-Entwicklungsplan als “Slices”

Die Slices sind so geschnitten, dass jede Lieferung **benutzbar** ist und testbar bleibt.

### Slice 1 – Session Lifecycle (Loader + Persistence + Wizard)
**Outcome:** DM kann Sessions erstellen, speichern, laden.

### Slice 2 – Pack Validation (Validator + Reports)
**Outcome:** falsche Packs/Configs werden früh abgefangen.

### Slice 3 – Ledger Core (Wallet/Inventory/Stats)
**Outcome:** Effects können gebucht werden (noch ohne Orders).

### Slice 4 – Facility State Machine (Resolver + Build Queue)
**Outcome:** Bauen/Upgraden/Timer laufen, Facility wird “free”.

### Slice 5 – Orders + Rolls (Roller + Evaluator)
**Outcome:** Order lock → roll → outcome → effects (ohne events).

### Slice 6 – Events (EventService + Auto-Log)
**Outcome:** event_table & random_event werden aufgelöst, Logs sind brauchbar.

### Slice 7 – Formula Engine Lite (Pub)
**Outcome:** begrenzter Parser/Executor für Pub-Formeln aus `formula_engine`.

### Slice 8 – Polishing (UX, Debug, Export)
**Outcome:** DM-Quality-of-Life: Filters, Search, Undo-Guardrails, Export.

---

## 6. Developer User Stories / Tickets (statt “DnD-Story-Items”)

> Format: **US-XXX** – *Als <Rolle> will ich <Ziel>, damit <Nutzen>.*  
> Dazu: **Akzeptanzkriterien** und **Testnotizen**.

### EPIC 1 – Session & Packs

**US-001 – Session erstellen (Wizard)**
- Als DM will ich eine neue Session mit Bastion-Metadaten und Spieler-Liste anlegen, damit ein Spielstand initialisiert wird.
- Akzeptanz:
  - Session bekommt einen Timestamp-Suffix automatisch
  - Spieler: name+klasse required, level optional
  - Save enthält Wallet, Inventory, Stats registry, Facilities=[], NPC=[]
- Test:
  - Neuanlage → Save → Reload → Werte identisch

**US-002 – Packs laden**
- Als Entwickler will ich Packs (JSON) laden können, damit Facilities/Orders/Mechanics verfügbar werden.
- Akzeptanz:
  - Pack Registry zeigt pack_id, name, version
  - Facilities aus allen Packs werden in einen Katalog gemerged (nach id eindeutig)
- Test:
  - Core + Extended Packs laden → Katalog enthält Facilities aus allen

**US-003 – Global Config laden**
- Als Entwickler will ich `bastion_config.json` laden, damit Turn, Currency, CheckProfiles und Defaults aktiv sind.
- Akzeptanz:
  - Turn Duration, Currency Conversion, NPC progression, default_build_costs sind im Runtime State

---

### EPIC 2 – Validation & Diagnostics

**US-010 – Validator: check_profile Referenzen**
- Als Entwickler will ich prüfen, ob jede Order ein gültiges `check_profile` nutzt, damit Rolls nicht ins Leere laufen.
- Akzeptanz:
  - Unknown check_profile → Hard Fail (Pack unusable)
  - Report zeigt Pack + Facility + Order Pfad

**US-011 – Validator: parent chain**
- Als Entwickler will ich `parent` Referenzen prüfen, damit Upgrade-Trees nicht broken sind.
- Akzeptanz:
  - parent id muss existieren oder null sein
  - Zyklus-Erkennung (A->B->A) → Hard Fail

**US-012 – Validator: event_table group ids**
- Als Entwickler will ich prüfen, ob `random_event group:<id>` auf existierende event_table groups zeigt, damit Events resolvbar sind.
- Akzeptanz:
  - Missing group → Warning oder Hard Fail (entscheidbar per config flag)
  - Report listet fehlende group ids

**US-013 – Validator: stats**
- Als Entwickler will ich prüfen, ob effect-stat-keys existieren (base + custom stat_counter), damit Ledger nicht unbekannte stats bucht.
- Akzeptanz:
  - Unknown stat → Warning, auto-create optional (flag)

---

### EPIC 3 – Ledger (Wallet/Inventory/Stats)

**US-020 – Wallet buchen (negativ erlaubt)**
- Als DM will ich Bau/Order-Kosten zahlen können, auch wenn Wallet negativ wird, damit ich “Kredit” narrativ nutzen kann.
- Akzeptanz:
  - Wallet kann < 0 werden
  - UI fordert DM-Confirmation bei “insufficient funds”
  - Buchung wird protokolliert (audit)

**US-021 – Currency Conversion anzeigen**
- Als DM will ich meine Wallet sowohl aggregiert (in Gold) als auch getrennt (g/s/c) sehen, damit ich Kleingeld verstehe.
- Akzeptanz:
  - Anzeige: g/s/c + Gesamtwert (optional)
  - Conversion basiert auf global config

**US-022 – Inventory Items add/remove**
- Als DM will ich Items als Quantities buchen können, damit Orders Materialien erzeugen oder verbrauchen.
- Akzeptanz:
  - Entfernen kann unter 0 gehen oder clampen (config flag)
  - UI zeigt negative Items als Warnung

**US-023 – Stats buchen (stat_counter clamps)**
- Als DM will ich Stats (z. B. Heat/Favor/Reputation) buchen, damit Mechanics funktionieren.
- Akzeptanz:
  - stat_counter kennt min/max/start; ledger clamp’t in range
  - Log zeigt ursprüngliches delta und finalen Wert

---

### EPIC 4 – Facilities (Build/Upgrade/State)

**US-030 – Facility katalogisieren**
- Als DM will ich alle Facilities aus Packs durchsuchen/filtern, damit ich Build-Entscheidungen treffe.
- Akzeptanz:
  - Suche nach Name/ID
  - Filter nach Pack, Tier, Profession

**US-031 – Facility bauen (BuildQueue)**
- Als DM will ich Facilities in Bau geben können, damit ich die Bastion aufbaue.
- Akzeptanz:
  - Beim Start: Kosten sofort aus Wallet
  - remaining_turns = facility.build.duration_turns oder default
  - Beim Turn advance: remaining_turns--, bei 0 → Facility wird “free”

**US-032 – Upgrade Facility**
- Als DM will ich eine Facility upgraden können, damit höhere Tier Orders freigeschaltet werden.
- Akzeptanz:
  - Upgrade nutzt entweder Facility.build oder default_build_costs.upgrade_tier_X
  - Upgrading blockiert Orders (state = upgrading)

**US-033 – Resolver State Sichtbarkeit**
- Als DM will ich klar sehen, ob eine Facility free/busy/building/upgrading ist, damit ich nicht raten muss.
- Akzeptanz:
  - konsistente State-Regeln
  - UI zeigt remaining_turns, wenn nicht free

---

### EPIC 5 – NPC Roster

**US-040 – NPC einstellen/kündigen**
- Als DM will ich NPCs anheuern und entlassen können, damit Orders überhaupt möglich sind.
- Akzeptanz:
  - NPC hat: name, profession, level, xp, upkeep
  - NPC kann auch ohne fertige Facility existieren
  - Kündigen entfernt oder markiert inactive (V1 Entscheidung)

**US-041 – NPC Assignment**
- Als DM will ich NPCs Facilities zuweisen können, damit Orders ihre Anforderungen erfüllen.
- Akzeptanz:
  - Facility prüft npc_allowed_professions
  - npc_slots werden respektiert (V1: 1 slot reicht, falls Daten so sind)

**US-042 – NPC XP & Level Up**
- Als DM will ich, dass NPCs bei Erfolg XP bekommen und bei Thresholds aufsteigen, damit Progression sichtbar wird.
- Akzeptanz:
  - success gibt xp_per_success
  - Level thresholds (5/10) werden angewendet
  - UI zeigt apprentice/experienced/master

---

### EPIC 6 – Orders, Rolls, Outcomes

**US-050 – Order Picker (min_npc_level)**
- Als DM will ich nur Orders sehen, die der zugewiesene NPC machen darf, damit ich keine invaliden Aktionen wähle.
- Akzeptanz:
  - Orders filtern nach min_npc_level

**US-051 – Order locken (duration_turns)**
- Als DM will ich eine Order locken, damit sie über mehrere Turns laufen kann.
- Akzeptanz:
  - Locked Order setzt Facility state busy
  - remaining_turns = order.duration_turns (oder 1 wenn fehlt)
  - Während busy keine zweite Order startbar

**US-052 – Manual Roll**
- Als DM will ich Würfe manuell eingeben, damit ich am Tisch echte Würfel nutzen kann.
- Akzeptanz:
  - Eingabe 1..N (je nach check_profile dice)
  - Ergebnis wird nach check_profile/DC bewertet

**US-053 – Auto Roll**
- Als DM will ich optional automatisch würfeln lassen, damit ich schnell simulieren kann.
- Akzeptanz:
  - dice engine würfelt passend zu check_profile (d20/d10/d6)
  - crit ranges werden beachtet

**US-054 – Outcome Evaluation**
- Als DM will ich nach dem Wurf das richtige Outcome (crit_success/success/fail/crit_fail) erhalten, damit die richtigen Effekte gelten.
- Akzeptanz:
  - Evaluator liefert genau 1 Outcome bucket
  - Effektliste ist deterministisch reproduzierbar (bei gleicher Eingabe)

**US-055 – Effect Application**
- Als DM will ich Effects aus dem Outcome auf Ledger/State anwenden, damit der Turn “real” wird.
- Akzeptanz:
  - currency, items, stats, log, event/random_event, formula trigger werden unterstützt (V1: formula getrennt im Pub-Epic)

---

### EPIC 7 – Events & Logging

**US-060 – Turn Log Feed**
- Als DM will ich ein globales Turn-Log sehen, damit ich später nachschlagen kann, was passiert ist.
- Akzeptanz:
  - Jeder Turn erzeugt einen Log-Eintrag (timestamp + turn index)
  - Entries enthalten Facility/Order/outcome + deltas

**US-061 – Event Table Resolve**
- Als DM will ich event_table events auflösen können, damit “random_event groups” funktionieren.
- Akzeptanz:
  - group draw: weighted random (oder deterministic seed)
  - event result wird geloggt und kann weitere effects triggern (falls im data model so vorgesehen)

**US-062 – Auto-Log aus Effects**
- Als DM will ich, dass Effekte automatisch textuell geloggt werden, damit ich nicht Buchhaltung machen muss.
- Akzeptanz:
  - currency/item/stat deltas werden als human-readable summary geloggt

---

### EPIC 8 – Formula Engine Lite (Pub)

**US-070 – Formula Engine Registry**
- Als Entwickler will ich formula_engine mechanics aus Packs registrieren, damit Pub Management ausführbar wird.
- Akzeptanz:
  - formula_engine “Pub Management” ist im Runtime State sichtbar

**US-071 – Formula Inputs UI**
- Als DM will ich die in der Formel definierten Inputs sehen/ändern, damit ich die Pub-Runde konfigurieren kann.
- Akzeptanz:
  - inputs werden gerendert (number, enum, boolean – V1 subset)

**US-072 – Formula Execute**
- Als DM will ich die Pub-Formel ausführen, damit Income/Rep/Consumption automatisch berechnet wird.
- Akzeptanz:
  - calculations + effects werden angewandt
  - Output ist im Log sichtbar
- Hinweis:
  - V1 darf bewusst eingeschränkt sein (nur benötigte Operators), solange die vorhandene Pub-Formel läuft.

---

### EPIC 9 – Debug & Export

**US-080 – Deterministic seed mode**
- Als Entwickler will ich einen Seed setzen können, damit random_event draws und auto-rolls reproduzierbar sind.
- Akzeptanz:
  - gleicher seed + gleicher state → gleiche results

**US-081 – Export Session Snapshot**
- Als DM will ich einen Session-Snapshot exportieren, damit ich Backups machen und Bugs reporten kann.
- Akzeptanz:
  - Export = aktuelles Save + loaded packs list + config version

---

## 7. Test-Szenarien (E2E “Definition of Done”)

### T1 – Empty Bastion → First Facility → First Order
1) Session anlegen  
2) Garden T1 bauen  
3) NPC einstellen & zuweisen  
4) Turn advance bis Facility free  
5) Order lock → roll → effects → log  
**Pass:** Ledger stimmt, Log ist nachvollziehbar

### T2 – Multi-Turn Order (Arcane Study)
- Order mit `duration_turns=2` locken  
- 1 Turn advance: busy  
- 2 Turn advance: resolved  
**Pass:** genau einmal evaluated, effects nur einmal angewandt

### T3 – Whisper Office: Heat + random_event group
- Order ausführen, die Heat verändert und random_event group nutzt  
**Pass:** Heat clamp korrekt, event aus richtiger Gruppe, Log enthält event result

### T4 – Pub Formula
- formula inputs setzen → execute → effects anwenden  
**Pass:** Ledger + Log entsprechen der Formel

---

## 8. Rollen, Schnittstellen & Parallelisierung

### Workstreams (für “KI + Mensch” parallel)
1) **Data Contracts & Validation** (Agent)
2) **Core Engine Spec** (Agent)
3) **UX / Screenflows / Copy** (Mensch oder Agent)
4) **Content (Logs, Labels, Diagnostics)** (Agent)
5) **QA Szenarien & Regression Suite** (Mensch)

### Abhängigkeiten
- Validator braucht Loader + Config
- Resolver braucht Session State + Facility/Order defs
- Evaluator braucht CheckProfiles
- EventService braucht Mechanics Registry

---

## 9. Offene Entscheidungen (V1-Flags statt Diskussionen)
Diese Punkte als Config-Flags lösen, statt monatelang “richtig” zu designen:
- Unknown stat key: auto-create? (default: warning + auto-create off)
- Inventory negative allowed? (default: warning + allow)
- Missing event_table group: warning vs hard fail
- Randomness: fully random vs seed mode default
- NPC Upkeep: apply per turn in V1 oder erst später (deine Daten haben `npc_base_upkeep` – V1 kann es loggen, aber optional noch nicht abziehen)

---

## 10. Quick-Start für Developer (1 Seite)
1) Loader: config + packs + session  
2) Validator: reports müssen vor UI Actions sichtbar sein  
3) BuildQueue + Resolver: Facility States korrekt  
4) Orders + Rolls: check_profiles + crit handling  
5) Ledger: wallet/items/stats + audit  
6) Events: event_table + random_event + logs  
7) Pub: formula_engine minimal ausführbar

