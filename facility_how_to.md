# Schnellstart – kleinste funktionierende Facility

Wenn du nur schnell starten willst, kopiere dieses Beispiel.
Das ist die **kleinste gültige Facility**, die im System funktioniert.

Speichere sie als eigene Datei, z. B.:

my_first_pack.json


## Minimalbeispiel

```json
{
  "pack_id": "my.first.pack",
  "name": "My First Pack",
  "version": 1,
  "author": "Your Name",

  "facilities": [
    {
      "id": "my.garden:t1",
      "name": "Small Garden",
      "description": "Produces a few herbs each turn.",

      "tier": 1,
      "parent": null,

      "build": {
        "cost": { "gold": 250 },
        "duration_turns": 1
      },

      "npc_slots": 1,
      "npc_allowed_professions": ["gardener"],

      "orders": []
    }
  ]
}
```

## Was passiert hier?

Diese Datei definiert: 
- ein Pack
- eine Facility
- baubar für 250 Gold
- 1 Turn Bauzeit
- Platz für 1 NPC
- noch keine Orders

Das reicht bereits, damit die Facility im Tool auftaucht und gebaut werden kann.

---

# Aufbau einer Pack-Datei (Top Level)

Eine Facility-Datei ist einfach eine normale JSON-Datei.

Sie enthält:

- allgemeine Pack-Informationen
- eine Liste von Facilities
- optional zusätzliche Systeme (Custom Mechanics)



## Grundstruktur

```json
{
  "pack_id": "my.pack.id",
  "name": "Pack Name",
  "version": 1,
  "author": "Your Name",

  "facilities": [
    { }
  ],

  "custom_mechanics": [
  ]
}
```

### Felder erklärt

**pack_id**: Eindeutige ID des Packs. sollte einzigartig sein. keine Leerzeichen. am besten punkt- oder namespace-basiert.
Beispiele:
```text
core.garden
my.homebrew.alchemy
djih.blackmarket
```

**name**: Anzeigename im Tool. Freier Text.
Beispiele:
```text
"Herbalism & Gardens"
```

**version**: Nur für dich zur Verwaltung. Erhöhe die Zahl, wenn du größere Änderungen machst.
Beispiel:
```text
"version": 2
```

**author**: Optional. Nur Anzeigezweck.


### facilities (Pflicht)
Liste aller Facilities in diesem Pack.

Hier definierst du:
- Gebäude
- Upgrades
- NPC-Slots
- Orders
- Effekte

Ohne dieses Feld passiert nichts.

### custom_mechanics (Optional)
Nur für fortgeschrittene Features.

Beispiele:
- stat_counter
- formula_engine

Für normale Facilities nicht nötig.

Wenn du unsicher bist: einfach weglassen.

## Minimalstruktur
```json
{
  "pack_id": "my.pack",
  "name": "My Pack",
  "version": 1,
  "facilities": []
}
```

Alles andere ist optional.

---

# Facility-Grundstruktur

Eine Facility ist ein einzelnes Gebäude oder eine Ausbaustufe davon.

Jeder Eintrag im Feld `facilities[]` beschreibt genau **eine** baubare Stufe (Tier).

Du definierst hier:
- Name
- Baukosten
- NPC-Slots
- erlaubte Berufe
- Orders (Aktionen pro Runde)

## Komplette Beispielstruktur
```json
{
  "id": "core.garden:garden:t1",
  "name": "Garden",
  "description": "Produces herbs and simple ingredients.",

  "tier": 1,
  "parent": null,

  "build": {
    "cost": { "gold": 250 },
    "duration_turns": 1
  },

  "npc_slots": 1,
  "npc_allowed_professions": ["gardener"],
  "npc_base_upkeep": { "silver": 5 },

  "orders": []
}
```

## Felder erklärt (von oben nach unten)

**id (Pflicht)**: Eindeutige ID dieser Facility-Stufe.

Regeln:
- muss einzigartig sein
- keine Leerzeichen
- bleibt dauerhaft stabil (nicht später umbenennen)

Empfehlung: *pack.facility:tier*

Beispiele:
```text
core.garden:garden:t1
my.alchemy:lab:t2
```

**name (Pflicht)**: Anzeigename im Tool. Freier Text.


**description (Optional, empfohlen)**: Kurze Beschreibung für den DM. Nur Flavour/Erklärung, keine Regeln.

**tier (Pflicht)**: Stufe der Facility. Nur Zahl.
Typisch:
1 = Basis
2 = Upgrade
3 = großes Upgrade

**parent (Pflicht)**: Verweist auf die vorherige Stufe. So weiß das System: Diese Facility ist ein Upgrade einer anderen.
Tier 1 (core.garden:garden:**t1**):
```json
 parent: null
 ```
Tier 2 (core.garden:garden:**t2**):
```json
 "parent": "core.garden:garden:t1"
 ```


**build (Pflicht)**: Definiert Bau- oder Upgrade-Kosten. Gleiche Struktur für Neubau UND Upgrade.
Beispiel:
```json
{
  "cost": { "gold": 250 },
  "duration_turns": 1
}
```
- cost → Ressourcen die bezahlt werden
- duration_turns → wie viele Runden der Bau dauert


**npc_slots (Pflicht)**: Wie viele NPCs hier gleichzeitig arbeiten können.
Beispiel:
```text
0 = keine NPCs nötig
1 = ein Arbeiter
3 = kleines Team
```

**npc_allowed_professions (Optional)**: Welche Berufe hier arbeiten dürfen. Nur Filter. Der DM kann frei NPCs erstellen, aber nur diese dürfen hier eingesetzt werden.

Beispiel:
```json
"npc_allowed_professions": ["gardener", "herbalist", "alchemist"]
```

**npc_base_upkeep (Optional)**: Richtwert für Unterhalt pro Runde. Nur eine Hilfe für den DM. Der tatsächliche Wert wird später beim Anheuern gewürfel/gespeichert.

Beispiel:
```json
"npc_base_upkeep": { "silver": 5 }
```

**orders (Pflicht, darf leer sein)**: Liste aller Aktionen, die diese Facility ausführen kann.
```json
"orders": []
```
Wenn leer: Die Facility existiert nur als Gebäude ohne Aktionen.

*Orders werden im einen der nächsten Kapitel erklärt.*



## Tiers & Upgrades

Viele Facilities haben mehrere Ausbaustufen:
- Tier 1 = Basis
- Tier 2 = Upgrade
- Tier 3 = großes Upgrade

Wichtig:
Jede Stufe ist eine **eigene Facility-Definition**.

Es gibt kein spezielles "Upgrade-System".
Ein Upgrade ist einfach nur eine neue Facility, die auf eine andere verweist.

---

### Grundidee

- Tier 1 steht alleine.
- Tier 2 verweist auf Tier 1 mit `parent`.
- Tier 3 verweist auf Tier 2.

So entsteht eine Kette.

Beispiel: Tier 1 → Tier 2
```json
[
  {
    "id": "core.garden:garden:t1",
    "name": "Small Garden",
    "tier": 1,
    "parent": null,

    "build": {
      "cost": { "gold": 250 },
      "duration_turns": 1
    },

    "npc_slots": 1,
    "orders": []
  },

  {
    "id": "core.garden:garden:t2",
    "name": "Expanded Garden",
    "tier": 2,
    "parent": "core.garden:garden:t1",

    "build": {
      "cost": { "gold": 500 },
      "duration_turns": 2
    },

    "npc_slots": 2,
    "orders": []
  }
]
```


### Wie Upgrades funktionieren

Wenn der Spieler Tier 2 baut:

- Tier 1 wird ersetzt
- Tier 2 übernimmt den Platz
- neue Werte gelten sofort (mehr Slots, neue Orders, etc.)

Das System erkennt das automatisch über: **parent**


### Regeln

**Tier 1** : parent = null

**Tier 2 oder höher**
- parent muss gesetzt sein
- parent zeigt auf die vorherige Stufe

**Reihenfolge egal**: Die Einträge müssen nicht sortiert sein. Die Verknüpfung passiert nur über IDs.


### Was darf sich zwischen Tiers ändern?
Alles. Du kannst pro Stufe frei anpassen:

- Baukosten
- Bauzeit
- NPC-Slots
- erlaubte Berufe
- Orders
- Effekte

Typische Upgrades:
- mehr NPC-Slots
- bessere/zusätzliche Orders
- kürzere Dauer
- höhere Erträge

### Optional

Upgrades sind komplett freiwillig.

Du kannst auch nur Tier 1 definieren.

Das reicht völlig aus.

--- 

# Orders erstellen

Orders sind die Aktionen, die eine Facility pro Runde ausführen kann.
Beispiele:
- Kräuter sammeln
- Waren handeln
- Forschung betreiben
- NPCs trainieren
- Informationen beschaffen

Ohne Orders ist eine Facility nur ein Gebäude ohne Gameplay.

## Wo werden Orders definiert?

Direkt in der Facility:
```json
"orders": [
  { ... },
  { ... }
]
```

Jeder Eintrag ```{...}``` ist genau **eine Aktion**.

## Minimalbeispiel einer Order
```json
{
  "id": "gather_herbs",
  "name": "Gather Herbs",
  "description": "Collect simple herbs from the garden.",

  "min_npc_level": 1,
  "duration_turns": 1,

  "outcome": {}
}
```

Das reicht bereits für eine gültige Order.

## Komplette Beispielstruktur
```json
{
  "id": "gather_herbs",
  "name": "Gather Herbs",
  "description": "Collect herbs and sell them.",

  "min_npc_level": 1,
  "duration_turns": 1,

  "outcome": {
    "check_profile": "d20",

    "on_success": {
      "effects": [
        { "gold": 15 },
        { "log": "Good harvest." }
      ]
    },

    "on_failure": {
      "effects": [
        { "log": "Nothing found this week." }
      ]
    }
  }
}
```


## Felder erklärt

**id (Pflicht)**: Eindeutige ID der Order.
Regeln:
- einzigartig innerhalb der Facility
- keine Leerzeichen
- nicht später ändern

Beispiele:
```text
gather_herbs
brew_potions
run_trade
```

**name (Pflicht)**: Anzeigename im Tool.Freier Text.

**description (Optional, empfohlen)**: Kurze Erklärung für den DM. Nur Text, keine Regeln.

**min_npc_level (Optional)**: Minimales Erfahrungslevel des NPCs.
Typisch:
- 1 = Anfänger
- 2 = Erfahren
- 3 = Meister

Wenn nicht gesetzt: :jede Stufe darf die Order ausführen.

**duration_turns (Pflicht)**: Wie viele Runden die Order dauert. Währenddessen ist die Facility blockiert.
Beispiele:
- 1 = nächste Runde fertig
- 3 = dauert 3 Runden

**outcome (Pflicht)**: Definiert, was nach Abschluss passiert.
Hier kommen:
- Würfelchecks
- Erfolg/Misserfolg
- Effekte

*Details dazu im nächsten Kapitel.*

## Wichtige Reglen und Empfehlungen

- Pro Facility kann immer nur eine Order gleichzeitig laufen
- Bauen/Upgraden blockiert die Facility
- Ergebnis wird erst am Ende ausgewertet
- Mehrere kleine Orders sind besser als eine riesige komplexe

---

# Outcomes

Im Outcome wird festgelegt, **was nach Abschluss einer Order passiert**.
Hier definierst du:
- ob gewürfelt wird
- Erfolg oder Misserfolg
- welche Belohnungen oder Kosten entstehen

Das Outcome ist der wichtigste Teil einer Order.

## Grundstruktur
```json
"outcome": {
  "check_profile": "d20",

  "on_success": {
    "effects": []
  },

  "on_failure": {
    "effects": []
  }
}
```
Alles andere ist optional.

## Check (Würfelwurf) 

Das Profil bestimmt:
- Würfeltyp (z.B. d20)
- Schwierigkeit (DC)
- Kritische Erfolge / Patzer
- Die genauen Werte kommen automatisch aus der globalen Konfiguration.

Beispiel:
```json
"check_profile": "d20"
```
Typische Profile:
- d20
- d20_easy
- d20_hard
- d6
- d10

Wenn du KEINEN Check willst:
→ check_profile einfach weglassen
Dann passiert das Outcome immer automatisch.

## Ergebnis-Typen

Du kannst folgende Blöcke verwenden:
```json
"on_success" : {...}
"on_failure" : {...}  
"on_critical_success": {...}  
"on_critical_failure": {...}  
```
Alle sind optional. Du kannst einzelne weglassen.
Nicht definierte Fälle machen einfach nichts.


## Beispiel
```json
"outcome": {
  "check_profile": "d20",

  "on_success": {
    "effects": [
      { "gold": 20 },
      { "item": "herbs", "qty": 2 },
      { "stat": "reputation", "delta": 1 },
      { "log": "Great harvest!" }
    ]
  },

  "on_failure": {
    "effects": [
      { "log": "Nothing found this week." }
    ]
  }
}
```

# Effects

Effects sind einfache Aktionen, die automatisch ausgeführt werden.
Du kannst mehrere kombinieren.
```json
"effects": [
  { ... },
  { ... },
  { ... }
]
```
Sie werden der Reihe nach abgearbeitet.

## Unterstützte Effect-Typen (komplette Liste)

**Währungen**: Ändert das globale Budget.
```json
{ "gold": 10 }
{ "silver": -5 }
{ "copper": 25 }
```
Positive Werte = Gewinn  
Negative Werte = Kosten/Verlust

**Items**: Fügt Items hinzu oder entfernt sie.
```json
{ "item": "beer", "qty": 3 }
{ "item": "herbs", "qty": -2 }
```
Positive ```qty``` = zum Basiton-Invenatr hinzufügen  
Negative ```qty``` = aus Basiton-Inventar entfernen

**Stats**: Ändert einen benutzerdefinierten Wert (z.B. Ruf oder Heat).
```json
{ "stat": "reputation", "delta": 1 }
{ "stat": "heat", "delta": -2 }
```

**Log**: Zeigt nur eine Nachricht an. Gut für Feedback oder Story.
```json
{ "log": "The workers found something interesting." }
```

**Event (optional)**: Löst ein benutzerdefiniertes Event aus. Eine höher gewichtigeres Log für den DM.
```json
{ "event": "spawn_bandits" }
```
Nur nötig für spezielle Mechaniken oder Erweiterungen.


## Tipps

- lieber viele kleine Effects statt eine große komplizierte Berechnung
- einfache Zahlen sind besser lesbar als Formeln
- Logs helfen dem DM zu verstehen, was passiert ist
- Effects dürfen gemischt werden

Beispiel:
Gold verdienen + Item verlieren + Ruf steigen + Log anzeigen

--- 

# Komplettes Beispiel – Eine fertige Facility

Dieses Beispiel zeigt eine typische, realistische Facility mit:
- Tier 1 und Tier 2 (Upgrade)
- NPC-Slots
- mehreren Orders
- Würfelchecks
- Belohnungen und Kosten

Nutze es als Vorlage oder kopiere Teile davon.


## Beispiel: Herbalist Garden
```json
{
  "pack_id": "example.herbalism",
  "name": "Herbalism & Gardens",
  "version": 1,
  "author": "Example",

  "facilities": [

    {
      "id": "example.garden:t1",
      "name": "Small Herbal Garden",
      "description": "A small patch for growing basic herbs.",

      "tier": 1,
      "parent": null,

      "build": {
        "cost": { "gold": 250 },
        "duration_turns": 1
      },

      "npc_slots": 1,
      "npc_allowed_professions": ["gardener", "herbalist"],
      "npc_base_upkeep": { "silver": 5 },

      "orders": [

        {
          "id": "gather_herbs",
          "name": "Gather Herbs",
          "description": "Collect common herbs and sell them.",

          "min_npc_level": 1,
          "duration_turns": 1,

          "outcome": {
            "check_profile": "d20",

            "on_success": {
              "effects": [
                { "gold": 15 },
                { "item": "herbs", "qty": 2 },
                { "log": "A decent harvest." }
              ]
            },

            "on_failure": {
              "effects": [
                { "log": "Bad weather ruined the crop." }
              ]
            }
          }
        },

        {
          "id": "cultivate_rare",
          "name": "Cultivate Rare Herbs",
          "description": "Attempt to grow rare ingredients.",

          "min_npc_level": 2,
          "duration_turns": 2,

          "outcome": {
            "check_profile": "d20_hard",

            "on_success": {
              "effects": [
                { "item": "rare_herb", "qty": 1 },
                { "stat": "reputation", "delta": 1 },
                { "log": "A rare plant survived!" }
              ]
            },

            "on_failure": {
              "effects": [
                { "gold": -5 },
                { "log": "Seeds wasted." }
              ]
            }
          }
        }

      ]
    },

    {
      "id": "example.garden:t2",
      "name": "Expanded Herbal Garden",
      "description": "Larger fields and better tools increase production.",

      "tier": 2,
      "parent": "example.garden:t1",

      "build": {
        "cost": { "gold": 500 },
        "duration_turns": 2
      },

      "npc_slots": 2,
      "npc_allowed_professions": ["gardener", "herbalist"],
      "npc_base_upkeep": { "silver": 8 },

      "orders": [
        {
          "id": "bulk_harvest",
          "name": "Bulk Harvest",
          "description": "Gather large amounts of common herbs.",

          "min_npc_level": 1,
          "duration_turns": 1,

          "outcome": {
            "check_profile": "d20_easy",

            "on_success": {
              "effects": [
                { "gold": 30 },
                { "item": "herbs", "qty": 5 },
                { "log": "Huge harvest!" }
              ]
            },

            "on_failure": {
              "effects": [
                { "gold": 5 },
                { "log": "Still gathered something." }
              ]
            }
          }
        }

      ]
    }

  ]
}
```

## Was dieses Beispiel zeigt
Tier 1 "Small Herbal Garden":
- 1 NPC Slot
- einfache Orders
- kleine Erträge

Tier 2 "Expanded Herbal Garden":
- mehr NPC Slots
- bessere Orders
- höhere Gewinne

Upgrade erfolgt automatisch über: **parent**

## Tipp
Kopiere dieses Beispiel und passe nur an:
- Namen
- Kosten
- NPC-Slots
- Orders
- Effekte

Mehr brauchst du für 90% aller Facilities nicht.

---

# Custom Mechanics (optional / fortgeschritten)

**Wichtig vorweg**: Du brauchst Custom Mechanics NICHT für normale Facilities.

90% aller Gebäude funktionieren nur mit:
- Build
- NPCs
- Orders
- Effects

Custom Mechanics sind nur nötig, wenn du:
- Berechnungen brauchst
- Märkte simulieren willst
- komplexe Formeln nutzen willst
- eigene Systeme bauen willst (Shop, Pub, Forschung, etc.)

Wenn du nur Ressourcen, Items oder Gold vergeben willst → überspring dieses Kapitel.


## Wo werden Mechanics definiert?

idealerweise Ganz oben im Pack. Dann ist es überschaubar wenn du in deinen Facilities/Orders auf diese Mechanic zurückgreifst.
```json
{
  "pack_id": "...",
  "name": "...",

  "custom_mechanics": [
    { ... },
    { ... }
  ],

  "facilities": []
}
```
Mechanics gehören auf Pack-Ebene, nicht in eine Facility.
*Denn*: Mehrere Facilities können dieselbe Mechanik verwenden.


## Grundidee

Eine Mechanik ist ein kleines Zusatzsystem.
Beispiele:
- Marktpreise berechnen
- Verbrauch simulieren
- Einnahmen aus Formeln berechnen
- eigene Zähler verwalten

Orders können diese Mechanics später auslösen/nutzen.

## Typische Mechanik-Typen

Die wichtigsten:
- stat_counter
- event_table
- formula_engine
- market_tracker

### stat_counter

Verwaltet eigene Werte wie:
- Reputation
- Heat
- Fortschritt
- Forschungspunkte
- Manapool

Im Grunde nur ein zusätzlicher Zähler.

Minimalbeispiel
```json
{
  "name": "Public Reputation",
  "type": "stat_counter",
  "config": {
    "custom_stat_name": "reputation",
    "min_value": -10,
    "max_value": 10,
    "start": 0
  }
}
```

Viele einfache Systeme brauchen gar keine extra Mechanik, weil normale "stat" Effects schon reichen.
#### Verwendung in Orders
Diese Stats können einfach im Order-Output angesteuert werden:
```json
"on_success": {
    "effects": [
        { "stat": "reputation", "delta": 1 }
    ]
},

"on_failure": {
    "effects": [
        { "stat": "reputation", "delta": -2 }
    ]
}
```

### event_table

Definiert **Story-Events** als zentral gepflegte Tabellen (inkl. Gewichtung) und erlaubt es, in Orders entweder **ein konkretes Event** auszulösen oder **zufällig aus einer Gruppe** zu ziehen.

Wichtig:
- Events sind **keine Mechanics-Logik** und keine „Berechnungen“.
- Die Engine kann beim Auslösen automatisch den `text` loggen (DM muss keinen extra Log-Effect schreiben).
- Du pflegst Events **einmal zentral** statt überall im Pack „magische Strings“ zu verteilen.


Minimalbeispiel
```json
{
  "id": "my_events",
  "type": "event_table",
  "config": {
    "groups": [
      {
        "id": "mygroup.complications",
        "name": "Complications",
        "entries": [
          { "id": "mygroup.complication_a", "weight": 1,
            "text": "A complication occurs." },
          { "id": "mygroup.complication_b", "weight": 1, 
            "text": "A severe complication occurs." }
        ]
      }
    ]
  }
}
```

#### Aufbau

- `groups[]` enthält mehrere Event-Gruppen (random tables)
- Jede Gruppe hat:
  - `id` (wird beim random_event referenziert)
  - `name` (nur Anzeige / Lesbarkeit)
  - `entries[]` (die auswählbaren Events)
- Jede Entry hat:
  - `id` (konkrete Event-ID, kann auch direkt referenziert werden)
  - `weight` (Gewichtung bei Zufallsauswahl)
  - `text` (Story-Text, kann automatisch geloggt werden)


#### Verwendung in Orders

**Konkretes Event auslösen (fixe ID)**
```json
"on_success": {
  "effects": [
    { "event": "whisperoffice.cipher_broken" }
  ]
}
```
**Zufälliges Event aus einer Gruppe ziehen**
```json
"on_failure": {
  "effects": [
    { "random_event": "group:whisperoffice.ops_disaster" }
  ]
}
```
Dabei gilt:
- `event` löst genau diese Event-ID aus
- `random_event` würfelt aus der angegebenen Gruppe nach `weight` und löst die gezogene Event-ID aus


### formula_engine

Für Berechnungen und Formeln.

Beispiele:
- Einnahmen = Besucher × Preis
- Verbrauch = 1d6 + Reputation
- Profit = Umsatz − Kosten

#### Bestandteile

**inputs**
→ Werte, die die Formel nutzt

**calculations**
→ Berechnungen oder Bedingungen

**effects**
→ Ergebnisse pro Runde - wie bei normalen Orders


#### Beispiel
```json
{
  "id": "pub_income",
  "type": "formula_engine",
  "config": {

    "inputs": [
      { "name": "base_income", "source": "fixed", "default": 5 },
      { "name": "reputation", "source": "stat", "default": "reputation" }
    ],

    "calculations": [
      { "name": "consumption", "formula": "1d6 + reputation" },
      { "name": "income", "formula": "consumption * base_income" }
    ],

    "effects": [
      { "gold": "${income}" }
    ]
  }
}
```
#### Verwendung in Orders
```json
"effects": [
  { "trigger": "pub_income" }
]
```
der Effect ```trigger``` ruft die Mechanik mit dieser ID auf. Und der DM muss entsprechende Imputs eingeben und erhält das Ergebnis.

### market_tracker

Simuliert Marktpreise oder Angebot/Nachfrage.

Gut für:
- Shops
- Handel
- Wirtschaftssysteme

Beispiel:
- Preise schwanken zwischen −20% und +20%
- Kategorien wie Waffen, Rüstung, Tränke

Nur nötig, wenn du echte Marktmechanik willst.
Für einfache „+10 Gold“-Belohnungen unnötig.

```json
{
  "id": "market",
  "type": "market_tracker",
  "config": {
    "categories": [
      { "name": "weapons", "start": 0 },
      { "name": "armor", "start": 0 },
      { "name": "potions", "start": 0 }
    ],
    "price_range": [-0.3, 0.5]
  }
}
```
 #### Verwnendung in Formular-Engine
 market-Werte können als Input genutzt werden:
```json
{
  "name": "weapons_market",
  "source": "market",
  "default": "weapons"
}
```
oder direkt beim calculations:
```json
{ "name": "profit", "formula": "base_volume * weapons_market" }
```

## Wann sollte ich Mechanics benutzen?

Benutze sie nur wenn:

- einfache Effects nicht reichen
- du echte Berechnungen brauchst
- du viele Variablen kombinieren willst
- du ein Minispiel/System bauen möchtest

 KEINE Mechanics nötig, für:
- "Gold +10"
- "Item +1"

## Empfehlung

Starte immer ohne Mechanics.Baue zuerst:
- Facility
- Orders
- einfache Effects

Wenn du später merkst: "Das wird zu kompliziert".
Dann erst Mechanics ergänzen.

---

# Best Practices & Regeln

Dieses Kapitel sammelt einfache Regeln und Empfehlungen,
damit deine Facilities:

- leicht lesbar bleiben
- schnell editierbar sind
- weniger Fehler verursachen
- auch für Nicht-Programmierer verständlich sind

Halte deine JSONs so simpel wie möglich.
Für inspiration schaue dir auch die Core-Json files an, in denen die Standard-Facilities definiert sind.


## Allgemeine Prinzipien

✔ einfache Zahlen statt komplizierter Formeln  
✔ mehrere kleine Orders statt einer riesigen  
✔ kurze, klare Namen  
✔ lieber Klartext als „clevere Tricks“

Wenn etwas schwer zu lesen ist → vereinfachen.

## IDs

- keine Leerzeichen
- keine Umlaute
- keine Sonderzeichen
- stabil halten (nicht später umbenennen)

Gut:
```text
core.garden:garden:t1
brew_potions
bulk_harvest
```
Schlecht:
```text
My Garden Level 1
Potion Order!!!
```

## Facility Design

✔ jede Tier-Stufe als eigene Facility  
✔ Upgrades nur über parent verknüpfen  
✔ kleine, übersichtliche Orders

Vermeide:
- riesige Monolith-Facilities
- 20 Orders in einer Stufe
- überkomplexe Berechnungen

Besser: mehrere kleine, klare Actions.

## Orders

✔ duration_turns klein halten (1–3 meistens ideal)  
✔ klare Beschreibungen schreiben  
✔ lieber mehrere einfache Outcomes statt verschachtelte Logik  

Beispiel gut:
- Gather Herbs
- Sell Goods
- Brew Potion

Beispiel schlecht:
- "Complex Multi-Stage Production Pipeline"

## Effects

Halte Effects einfach und lesbar.
Empfohlen:
```json
{ "gold": 10 }
{ "item": "herb", "qty": 2 }
{ "stat": "reputation", "delta": 1 }
{ "log": "Nice result." }
```
Vermeide:
- unnötig viele Berechnungen
- schwer lesbare Werte

Ein DM sollte sofort verstehen:
„+10 Gold, +2 Items, +1 Reputation“

## Zahlen & Formate

✔ currency immer als Objekt
``` { "gold": 10 }```

✔ qty als Zahl oder einfache Expression
- ```-2```
- ```"-${consumption}"```

✔ keine Strings für Zahlen
  nicht: ```"10"```, sondern: ```10```


## Logs verwenden

Logs als *outcome* helfen extrem beim Verständnis.

Beispiel:
```json
{ "log": "Workers found rare herbs." }
```
Ohne Log weiß der DM oft nicht, **warum** etwas passiert ist.

## Mechanics sparsam einsetzen

Faustregel: Brauche ich wirklich Berechnungen?
- NEIN → normale Effects nutzen  
- JA → formula_engine  

Brauche ich nur einen Zähler?
→ stat_counter

Brauche ich Marktpreise?
→ market_tracker

Sonst: weglassen.

## Komplexität vermeiden

Wenn du beim Schreiben denkst: "Das wird kompliziert..."
→ aufteilen.

Statt: eine riesige Formel

Besser: 2–3 einfache Orders / mehrere Outcomes.

## Test-Tipp

Neue Facility immer testen mit:

- nur 1 NPC
- 1 Order
- kleine Zahlen

Wenn das funktioniert, schrittweise erweitern.
Nicht alles auf einmal bauen.

### Goldene Regel

Wenn ein DM ohne Erklärung deine JSON lesen kann, hast du alles richtig gemacht.

