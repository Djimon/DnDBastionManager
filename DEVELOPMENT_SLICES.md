# Development Slices – GitHub Issues Template

Lege diese manuell unter "Issues" auf GitHub an, oder nutze sie als Referenz.

---

## Slice 1: Session Lifecycle (Loader + Persistence + Wizard)
**Label:** `slice`, `phase-1`, `core`

**Outcome:** DM kann Sessions erstellen, speichern, laden.

**Tasks:**
- [ ] New Session Wizard (UI Screen S1): Session Name, Bastion Type/Theme/Name/Region, Spieler registrieren
- [ ] Session JSON Persistence mit Versionierung
- [ ] Initial State Generator: Wallet, Inventory, Stats Registry, Facilities/NPCs leer
- [ ] Session Load/Save in UI integrieren
- [ ] Test: Create → Save → Load → Check State Integrity

---

## Slice 2: Pack Validation (Validator + Reports)
**Label:** `slice`, `core`, `data-integrity`

**Outcome:** Falsche Packs/Configs werden früh abgefangen.

**Tasks:**
- [ ] Schema Validator: bastion_config.json (check_profiles, NPC rules, etc.)
- [ ] Pack Loader: Facilities + custom_mechanics validieren
- [ ] Referenz-Checker: parent facility exists, check_profiles exist, event_tables exist
- [ ] Validation Report (Hard Fail vs Warnings)
- [ ] Error Messages für DM lesbar

---

## Slice 3: Ledger Core (Wallet/Inventory/Stats)
**Label:** `slice`, `core`, `engine`

**Outcome:** Effects können gebucht werden (noch ohne Orders).

**Tasks:**
- [ ] Wallet: Gold/Silver/Copper + Conversion Logic
- [ ] Inventory: Item Quantities (add/remove)
- [ ] Stats: Base + Custom Stats Registry (aus Packs, z.B. Heat, Reputation)
- [ ] Ledger Apply Effect: Currency/Item/Stat Delta
- [ ] Audit Trail (optional): Buchungsliste für Debug

---

## Slice 4: Facility State Machine (Resolver + Build Queue)
**Label:** `slice`, `phase-2`, `facilities`

**Outcome:** Bauen/Upgraden/Timer laufen, Facility wird "free".

**Tasks:**
- [ ] Facility States: building / upgrading / busy / free
- [ ] Build Queue: Facilities hinzufügen, Gold abziehen (negativ erlaubt mit Bestätigung)
- [ ] Resolver: aktiven State pro Facility berechnen
- [ ] Upgrade Logic: Tier-Progression, Cost/Duration per Facility
- [ ] Turn Advance: remaining_turns dekrementieren, fertige Dinge resolven
- [ ] UI: Screen S2 (Build Queue / Empty Bastion)

---

## Slice 5: Orders + Rolls (Roller + Evaluator)
**Label:** `slice`, `phase-3`, `core`

**Outcome:** Order lock → roll → outcome → effects (ohne events).

**Tasks:**
- [ ] Roller: Manual Input + Dice Engine (d20, d10, d6)
- [ ] Check Profile Resolution: Roll vs DC je NPC-Level
- [ ] Crit Handling: crit_success / success / fail / crit_fail buckets
- [ ] Evaluator: roll_result → outcome bucket → effects[] mapping
- [ ] Order Lock: keine Änderung mehr möglich nach Lock
- [ ] Turn Advance: remaining_turns dekrementieren, Order resolved
- [ ] UI: Screen S3 (Turn Console) - Order Picker + Roll Panel + Outcome Preview

---

## Slice 6: Events (EventService + Auto-Log)
**Label:** `slice`, `phase-3`, `logic`

**Outcome:** event_table & random_event werden aufgelöst, Logs sind brauchbar.

**Tasks:**
- [ ] EventService: Resolve Specific Event oder Random Draw aus Group
- [ ] Event Table Loader aus Packs (z.B. whisperoffice_events)
- [ ] Weighted Random Selection
- [ ] Auto-Log: Events in Turn Log + Facility Log schreiben
- [ ] Log Renderer: "✓ Garden +20 gold" / "✗ Office agent killed"
- [ ] UI: Turn Controls (Log Fenster mit letzten 20 Messages)

---

## Slice 7: Formula Engine Lite (Pub)
**Label:** `slice`, `phase-3`, `advanced`

**Outcome:** Begrenzter Parser/Executor für Pub-Formeln aus `formula_engine`.

**Tasks:**
- [ ] Formula Parser: inputs → calculations → effects
- [ ] Runtime Executor: mit aktuellen Stats/Currency context
- [ ] Pub Order Integration: Formulas in Order Outcomes
- [ ] Error Handling: malformed formulas graceful

---

## Slice 8: Polishing (UX, Debug, Export)
**Label:** `slice`, `phase-final`, `ux`

**Outcome:** DM-Quality-of-Life: Filters, Search, Undo-Guardrails, Export.

**Tasks:**
- [ ] Facility List Filters: Pack / Tag / Tier / Profession
- [ ] Search: Name, Beschreibung
- [ ] NPC Management: Hire / Fire UI
- [ ] Undo/Redo für kritische Actions (Rolls, Effects)
- [ ] Export: Session as JSON/CSV für Records
- [ ] Dark Mode (optional)
- [ ] Keyboard Shortcuts (optional)

---

## Dependencies
- Slice 1 → Slice 3, 4, 5, 6 (alles braucht Session)
- Slice 2 → Alle (Validation first)
- Slice 3 → Slice 5, 6 (Effects brauchen Ledger)
- Slice 4, 5, 6 → (unabhängig, können parallel)
- Slice 7 → optional nach Slice 5
- Slice 8 → am Ende

**Suggested Order:**
1. Slice 2 (Validator – Foundation)
2. Slice 1 (Session + Persistence)
3. Slice 3 (Ledger Core)
4. Slice 4 (Facility State)
5. Slice 5 (Orders + Rolls)
6. Slice 6 (Events)
7. Slice 7 (Formula Engine)
8. Slice 8 (Polishing)
