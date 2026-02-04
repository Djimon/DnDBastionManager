# 🏰 Custom Bastion System – Aktive Hausregeln

Diese Regeln sind eine **aktive, spielergetriebene Erweiterung** der Bastion-Mechanik (inspiriert von D&D 2024), mit Fokus auf:

* langfristige Motivation
* echte Entscheidungen statt passivem Einkommen
* starke narrative Hooks
* einfache Automatisierbarkeit (z. B. per Python-Tool)

---

## 1️⃣ Grundidee

Eine Bastion ist **kein magischer Pocket-Space**, sondern ein realer Ort in der Spielwelt.

* Spieler **müssen nicht anwesend sein**, damit die Bastion funktioniert
* Bastion-Turns laufen **autonom über NPCs**
* Spieler können **Orders ändern**, auch wenn sie nicht vor Ort sind (Boten, Verträge, Routinen)

Narrativ: Die Bastion ist ein lebendiger Ort, der reagiert, wächst – oder Probleme bekommt.

---

## 2️⃣ Bastion Turn (Zeitstruktur)

* 1 Bastion Turn = 1 Woche (empfohlen)
* Pro Turn:

  1. Jede Facility führt **eine Order** aus
  2. NPC würfelt Ergebnis
  3. Einnahmen / Verluste / Story-Events werden abgehandelt

---

## 3️⃣ Facilities (zugelassen)

Es gibt **nur diese Facilities** – keine vollständige WotC-Liste.

### Standard-Facilities

|Typ | Facility          | Kernfunktion                      | Zusatzmechanik|
|----| ----------------- | --------------------------------- |-------- |
|Core| Arcane Study      | Forschung, Wissen, magische Infos |
|Core| Garden            | Zutaten, Nahrung, Kräuter         |
|Core| Storehouse (Shop) | Handel, Marktspiel, Verkauf       | Marktbeobachtung
|Core| Observatory       | Omen, Prognosen, Story-Hooks      |
|Core| Pub               | Einnahmen, Ruf, Gerüchte          | Marketing/ Lagermanagement
|Core| Workshop          | Crafting aller Art                |
|Themed| Whisper Office  | Spione, Informanten, Gerüchte, politische Macht| Heat (aufbauen und abbauen)
|Themed| Schrein | Segen, Glaube, Rituale, Offerings, Omen| Einfluss/Ansehen in Kirchen
|Themed| Menagerie  | Tierzucht, Tierversuche, magische Kreaturen?| Zucht und Tamagotchi-style
|Themed| Nexus | Dimensionsportale, Expeditionen | Recursions (the Strange)


konkrete Beispiel:
| Facility                          | NPC-Typ    | Order-Beispiele                         | Upgrade-Level 1                   | Upgrade-Level 2                            | Passive Einnahmen                      | Story-Hooks / Event-Ideen                              |
| --------------------------------- | ---------- | --------------------------------------- | --------------------------------- | ------------------------------------------ | -------------------------------------- | ------------------------------------------------------ |
| **Arcane Study**                  | Scholar    | Research Spell / Lore, Craft Magic Item | +10% Erfolgschance bei Crafting   | +25% Erfolgschance, zusätzliche Entdeckung | Magische Rezepte / seltene Materialien | Alte Manuskripte, verlorene Zauber, Prophezeiungen     |
| **Garden**                        | Gardener   | Harvest Herbs, Plant Care               | +1 Yield / Turn                   | Seltene Pflanzen + höhere Crafting-Chance  | Basis-Kräuter, Nahrungsmittel          | Pflanzenraub, Botanik-Quest, magische Samen            |
| **Greenhouse** *(Garden Upgrade)* | Gardener   | Exotic Harvest, Research Plant Magic    | Bessere Qualität + Bonus Crafting | Exotische / magische Pflanzen              | Tränke, magische Zutaten               | Pflanzen-Experimente, Monsterplage, Quest-Hook         |
| **Storehouse / Shop**             | Merchant   | Sell Goods, Inventory Management        | Mehr Kunden, Bonus Gold           | Seltene Waren                              | Marktabhängig (Spielerentscheidung)    | Händlerbesuche, Marktgerüchte, Lieferaufträge          |
| **Observatory**                   | Astrologer | Observe Events, Predict Outcomes        | +1 Info / Turn                    | Seltene Omen / kosmische Visionen          | Hinweise / Informationen               | Vorhersagen, göttliche Botschaften, Plot-Hooks         |
| **Pub**                           | Innkeeper  | Serve, Entertain, Marketing             | Beliebtheit +1                    | Attraktionen, Festivals                    | Stark variabel (Lager + Ruf)           | Feste, Gerüchte, VIP-Gäste, lokale Politik             |
| **Workshop**                      | Craftsman  | Craft Items, Repair, Experiment         | +1 Item / Turn                    | Meisterwerke möglich, +25% Craft Bonus     | Items / Ausrüstung                     | Explosive Experimente, Unfälle, Mini-Dungeons          |


### Upgrades

* Greenhouse, Advanced Workshop etc. sind **Level-Ups**, keine neuen Facilities
* Maximal **2 Upgrades** pro Facility
* Upgrades kosten:

  * Gold
  * Ressourcen
  * Zeit (x Bastion Turns)

### 🧱 Facility-Baukosten & Dauer (Baseline)

| Typ             | Kosten (Gold) | Bauzeit  | Hinweise                 |
| --------------- | ------------- | -------- | ------------------------ |
| Neue Facility   | 250 GP        | 1 Woche  | Keine Orders während Bau |
| Upgrade Stufe 1 | 500 GP        | 2 Wochen | Facility pausiert        |
| Upgrade Stufe 2 | 1000 GP       | 3 Wochen | Facility pausiert        |

* Während Bau / Upgrade: **keine Orders möglich**
* NPC kann gehalten werden (Unterhalt läuft weiter) oder entlassen

---

### 🎲 Kosten-Varianz (optional, empfohlen)

Um Preise leicht unterschiedlich zu halten, ohne Ausreißer:

**Beim Bau oder Upgrade einmal würfeln:**

| Wurf (1d6) | Kosten-Modifikator                    |
| ---------- | ------------------------------------- |
| 1          | −30 % (Glück, lokale Hilfe)           |
| 2          | −20 %                                 |
| 3          | −10 %                                 |
| 4          | ±0 %                                  |
| 5          | +10 %                                 |
| 6          | +20 % (Materialknappheit, Korruption) |

> Design-Ziel: Alle Facilities bleiben **in derselben Größenordnung**, fühlen sich aber nie identisch an.

---

### ⏳ Bau-Komplikationen (optional)

Bei kritischem Patzer während Bau (z. B. durch Event):

| d6 | Effekt                                |
| -- | ------------------------------------- |
| 1  | +1 Woche Bauzeit                      |
| 2  | +10 % Mehrkosten                      |
| 3  | NPC kündigt während Bau               |
| 4  | Materialverlust → Sidequest           |
| 5  | Sabotage / lokaler Konflikt           |
| 6  | Bau zieht Aufmerksamkeit (Story-Hook) |

---

### 📦 Upgrade-Logik (klar & einfach)

* Upgrade 1: funktionale Verbesserung (Output / Info / Qualität)
* Upgrade 2: **qualitativer Sprung** (seltene Effekte, Story-relevant)

---

## 4️⃣ NPCs & Betrieb

* **Jede Facility braucht einen NPC**
* NPCs verlangen **laufenden Unterhalt (Gehalt)**
* **Unterhalt wird individuell verhandelt** und ist **Teil des NPC-Charakters**

### NPC-Unterhalt & Verhandlung

* Jeder NPC nennt **sein eigenes Gehalt** bei Anstellung
* Gehalt kann stark variieren (Silber bis zweistellige Goldbeträge)
* Preise sind **nicht fair oder balanciert**, sondern bewusst narrativ
* Manche NPCs:

  * verlangen Wucherpreise
  * testen bewusst, ob der Spieler verhandelt
  * sind genügsam oder ideologisch motiviert

**Neu verhandeln ist die Ausnahme**, nicht die Regel:

* Einmal akzeptiertes Gehalt gilt als sozialer Vertrag
* Spätere Nachverhandlungen können:

  * Ruf kosten
  * Loyalität senken
  * zu Abwanderung führen

👉 Design-Philosophie: Wenn ein NPC zu teuer ist, wird er **ersetzt**, nicht optimiert.

### Beispiele

* Alter, devoter Bibliothekar (Meister): 5 Silber / Turn
* Geiziger Gnom (Erprobt): 20 Gold / Turn
* Gaukler (Lehrling): fordert 5 Gold, lässt sich leicht auf 2 Silber runterhandeln

Spieler können:

* gezielt verhandeln (Charisma, Rollenspiel)
* NPCs ablehnen
* bessere Alternativen in der Welt suchen

NPCs entwickeln sich über Zeit.

---

## 5️⃣ NPC-Erfahrungsstufen

NPCs haben **nur 3 Erfahrungsstufen**:

| Stufe | Name     | Patzerbereich | Kritischer Erfolg |
| ----- | -------- | ------------- | ----------------- |
| 1     | Lehrling | 1–9           | nur bei 20        |
| 2     | Erprobt  | 1–7           | nur bei 20        |
| 3     | Meister  | 1–5           | bei 19–20         |

### Würfelergebnis (1d20)

| Ergebnis          | Effekt                                              |
| ----------------- | --------------------------------------------------- |
| 1                 | Kritischer Patzer (immer Schaden / Verlust / Event) |
| Patzerbereich     | Order scheitert, kleiner Verlust / Problem          |
| Erfolg            | Order klappt wie geplant                            |
| Kritischer Erfolg | Zusatzbelohnung + Story-Hook                        |

---

## 6️⃣ NPC-Level-Up

* NPCs sammeln **XP**
* 1 XP pro erfolgreicher Order

| Übergang           | Benötigte XP | Zeit (bei Erfolg jede Woche) |
| ------------------ | ------------ | ---------------------------- |
| Lehrling → Erprobt | 5 XP         | ca. 5 Wochen                 |
| Erprobt → Meister  | 10 XP        | ca. 10 Wochen                |

---

## 7️⃣ Passive Einnahmen & Unterhalt (Grundsätzlich)

* Jede Facility hat **fixe Unterhaltskosten** (NPC + Gebäude)
* Einnahmen werden **verrechnet**
* Negative Bilanz → Story-Probleme, Sidequests, Rufverlust

---

## 8️⃣ Pub – Aktives Management

### Kernwerte

* Lager (Bier, Essen, Spezialzutaten)
* Bekanntheit (Ruf-Level)
* Attraktionen / Events

### Mechanik

* Verbrauch pro Turn: `d6 + Bekanntheit`
* Einnahmen: `d6 + Bekanntheit`

#### Lagerprobleme

* Zu wenig Bier/Essen → Ruf −1
* Verdorbenes Essen nach 3 Monaten → Verlust

### Spieleraktionen

* Werbung / Gerüchte streuen
* Events (Feste, Musiker, Turniere)
* Attraktionen in der Umgebung fördern

### Narrative Hooks

* Stammgäste geben Quests
* VIP-Besucher
* Gerüchte & politische Konflikte

---

## 9️⃣ Shop – Markt & Entscheidungen

### Waren-Kategorien (5–6)

Beispiel:

* Waffen
* Rüstung
* Tränke
* Magische Komponenten
* Handelsgüter
* Kuriositäten

### Marktmechanik

* Jede Kategorie schwankt **unabhängig** zwischen **−20 % und +20 %**
* Schwankung ist sinusartig + Zufall
* Spieler kennt **nicht automatisch** alle Werte

### Informationsgewinn

* Händler befragen
* Preise vergleichen
* Gerüchte sammeln

→ Jede Info gibt **+5–10 % Genauigkeit**

### Spielerentscheidungen

* Welche Waren lagern?
* Welche verkaufen?
* Welche bewusst zurückhalten?

### Risiken

* Falsche Einschätzung → Verlust
* Kritischer Patzer → Sabotage, Fehlkauf, Konkurrenz

---

## 🔟 Story-Hooks durch Facilities

| Facility     | Story-Wert                            |
| ------------ | ------------------------------------- |
| Arcane Study | Wissen, Prophezeiungen, neue Quests   |
| Observatory  | Omen, Bedrohungen, Foreshadowing      |
| Pub          | Gerüchte, Kontakte, soziale Konflikte |
| Shop         | Handelskriege, seltene Items          |
| Garden       | Magische Pflanzen, Naturprobleme      |
| Workshop     | neue Rezepte, gefährliche Experimente |

Kritische Erfolge / Patzer **lösen fast immer Events aus**.

---

## 1️⃣1️⃣ Ziel des Systems

* Keine "Idle Game"-Bastion
* Entscheidungen haben Konsequenzen
* Spieler investieren **Zeit, Aufmerksamkeit und Story-Interesse**
* DM bekommt **Werkzeuge**, keine Buchhaltung

Dieses System ist explizit dafür gedacht, **automatisierbar** zu sein (z. B. per Python-UI), während die **spielerischen Entscheidungen erhalten bleiben**.

---

**Status:** spielbereit, modular, erweiterbar
