# Quickstart ? Smallest Working Facility

If you just want to get started quickly, copy this example.
This is the **smallest valid facility** that works in the system.

Save it as its own file, for example:

my_first_pack.json


## Minimal Example

```json
{
  "pack_id": "my.first.pack",
  "name": "My First Pack",
  "version": 1,
  "author": "Your Name",

  "facilities": [
    {
      "id": "my.first.pack:garden:t1",
      "name": "Small Garden",
      "description": "Produces a few herbs each turn.",

      "tier": 1,
      "parent": null,

      "npc_slots": 1,
      "npc_allowed_professions": ["gardener"],

      "orders": []
    }
  ]
}
```

## What happens here?

This file defines:
- a pack
- a facility
- build cost & duration come from the global defaults (bastion_config.json, optionally overridden by settings.json)
- space for 1 NPC
- no orders yet

That is enough for the facility to show up in the tool and be buildable.

**Important:** `build` is optional. If `build` is missing or `build.cost`/`build.duration_turns` are not set,
the system automatically uses the global defaults from `bastion_config.json` (optionally overridden by `settings.json`).

---

# Pack File Structure (Top Level)

A facility file is just a normal JSON file.

It contains:

- general pack information
- a list of facilities
- optional configuration (config)
- optional additional systems (custom mechanics)



## Basic Structure

```json
{
  "pack_id": "my.pack.id",
  "name": "Pack Name",
  "version": 1,
  "author": "Your Name",

  "config": {
  },

  "facilities": [
    { }
  ],

  "custom_mechanics": [
  ]
}
```

### Field Explanations

**pack_id**: Unique ID of the pack. Should be unique. No spaces. Prefer dot- or namespace-based IDs.
Examples:
```text
core.garden
my.homebrew.alchemy
djih.blackmarket
```

**name**: Display name in the tool. Free text.
Examples:
```text
"Herbalism & Gardens"
```

**version**: For your own tracking. Increase the number when you make major changes.
Example:
```text
"version": 2
```

**author**: Optional. Display only.

**config** (Optional): Pack-specific config extensions. Allowed:
- currency (types + conversion)
- check_profiles
- player_classes
This lets you build config-only packs without defining facilities.


### facilities (Optional)
List of all facilities in this pack.

Here you define:
- buildings
- upgrades
- NPC slots
- orders
- effects

If this field is missing, the pack is still valid (e.g., config-only packs).
If it exists but is empty, you will get a warning.

### custom_mechanics (Optional)
Only for advanced features.

Examples:
- stat_counter
- formula_engine

Not needed for normal facilities.

If you are unsure: just leave it out.

## Minimal Structure (Facility Pack)
```json
{
  "pack_id": "my.pack",
  "name": "My Pack",
  "version": 1,
  "facilities": []
}
```

Everything else is optional.

## Minimal Structure (Config-Only Pack)
```json
{
  "pack_id": "my.pack",
  "name": "My Pack",
  "version": 1,
  "config": {
  }
}
```

---

# Facility Base Structure

A facility is a single building or an upgrade stage of one.

Each entry in `facilities[]` describes exactly **one** buildable tier.

You define:
- name
- build cost
- NPC slots
- allowed professions
- orders (actions per turn)

## Complete Example Structure
```json
{
  "id": "core:garden:t1",
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

## Field Explanations (Top to Bottom)

**id (Required)**: Unique ID of this facility tier.

Rules:
- must be unique
- no spaces
- keep stable (do not rename later)

Recommendation: *pack_id:facility:tX*

Examples:
```text
core:garden:t1
core.extended:shop:t2
my.alchemy:lab:t2
```

**name (Required)**: Display name in the tool. Free text.


**description (Optional, recommended)**: Short description for the DM. Flavor/explanation only, no rules.

**tier (Required)**: Facility tier. Number only.
Typical:
1 = base
2 = upgrade
3 = major upgrade

**parent (Required)**: Points to the previous tier. This tells the system that this facility is an upgrade of another.
Tier 1 (core:garden:**t1**):
```json
 parent: null
 ```
Tier 2 (core:garden:**t2**):
```json
 "parent": "core:garden:t1"
 ```


**build (Optional)**: Build or upgrade costs. Same structure for new build AND upgrade.
Example:
```json
{
  "cost": { "gold": 250 },
  "duration_turns": 1
}
```
- cost ? resources that are paid
- duration_turns ? how many turns the build takes
If `build` or individual fields are missing, the global defaults from `bastion_config.json` are used (optionally overridden by `settings.json`).


**npc_slots (Required)**: How many NPCs can work here at the same time.
Example:
```text
0 = no NPCs needed
1 = one worker
3 = small team
```

**npc_allowed_professions (Optional)**: Which professions may work here. Only a filter. The DM can create NPCs freely, but only these can be assigned here.

Example:
```json
"npc_allowed_professions": ["gardener", "herbalist", "alchemist"]
```

**npc_base_upkeep (Optional)**: Reference upkeep per turn. Only a DM aid. The actual value is later rolled/saved when hiring.

Example:
```json
"npc_base_upkeep": { "silver": 5 }
```

**orders (Required, can be empty)**: List of all actions this facility can perform.
```json
"orders": []
```
If empty: the facility exists only as a building without actions.

*Orders are explained in one of the next chapters.*



## Tiers & Upgrades

Many facilities have multiple upgrade stages:
- Tier 1 = base
- Tier 2 = upgrade
- Tier 3 = major upgrade

Important:
Each tier is its **own facility definition**.

There is no special "upgrade system".
An upgrade is just a new facility that points to another one.

---

### Core Idea

- Tier 1 stands alone.
- Tier 2 points to Tier 1 via `parent`.
- Tier 3 points to Tier 2.

That creates a chain.

Example: Tier 1 ? Tier 2
```json
[
  {
    "id": "core:garden:t1",
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
    "id": "core:garden:t2",
    "name": "Expanded Garden",
    "tier": 2,
    "parent": "core:garden:t1",

    "build": {
      "cost": { "gold": 500 },
      "duration_turns": 2
    },

    "npc_slots": 2,
    "orders": []
  }
]
```


### How Upgrades Work

When the player builds Tier 2:

- Tier 1 is replaced
- Tier 2 takes its place
- new values apply immediately (more slots, new orders, etc.)

The system recognizes this automatically via: **parent**


### Rules

**Tier 1** : parent = null

**Tier 2 or higher**
- parent must be set
- parent points to the previous tier

**Order does not matter**: Entries do not have to be sorted. The linkage is only by IDs.


### What can change between tiers?
Everything. You can freely adjust per tier:

- build cost
- build time
- NPC slots
- allowed professions
- orders
- effects

Typical upgrades:
- more NPC slots
- better/additional orders
- shorter duration
- higher yields

### Optional

Upgrades are completely optional.

You can also define only Tier 1.

That is perfectly fine.

--- 

# Creating Orders

Orders are the actions a facility can perform each turn.
Examples:
- gather herbs
- trade goods
- conduct research
- train NPCs
- gather information

Without orders, a facility is just a building with no gameplay.

## Where are Orders defined?

Directly inside the facility:
```json
"orders": [
  { ... },
  { ... }
]
```

Each entry `{...}` is exactly **one action**.

## Minimal Order Example
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

That is already a valid order.

## Complete Example Structure
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


## Field Explanations

**id (Required)**: Unique ID of the order.
Rules:
- unique within the facility
- no spaces
- do not rename later

Examples:
```text
gather_herbs
brew_potions
run_trade
```

**name (Required)**: Display name in the tool. Free text.

**description (Optional, recommended)**: Short explanation for the DM. Text only, no rules.

**min_npc_level (Optional)**: Minimum NPC experience level.
Typical:
- 1 = beginner
- 2 = experienced
- 3 = master

If not set: any level can run the order.

**duration_turns (Required)**: How many turns the order takes. The facility is blocked during that time.
Examples:
- 1 = done next turn
- 3 = takes 3 turns

**outcome (Required)**: Defines what happens when the order finishes.
Here you define:
- checks
- success/failure
- effects

*Details in the next chapter.*

## Important Rules and Recommendations

- A facility can only run one order at a time
- Building/upgrading blocks the facility
- Results are evaluated only at the end
- Several small orders are better than one huge complex one

---

# Outcomes

The outcome defines **what happens after an order completes**.
Here you define:
- whether a roll happens
- success or failure
- rewards or costs

The outcome is the most important part of an order.

## Base Structure
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
Everything else is optional.

## Check (Dice Roll)

The profile defines:
- die type (e.g. d20)
- difficulty (DC)
- critical success/failure
- exact values come from global configuration

Example:
```json
"check_profile": "d20"
```
Typical profiles:
- d20
- d20_easy
- d20_hard
- d6
- d10

If you want NO check:
? simply omit check_profile
Then the outcome always happens automatically.

## Result Types

You can use these blocks:
```json
"on_success" : {...}
"on_failure" : {...}
"on_critical_success": {...}
"on_critical_failure": {...}
```
All are optional. You can leave some out.
Undefined cases do nothing.


## Example
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

Effects are simple actions that are executed automatically.
You can combine multiple.
```json
"effects": [
  { ... },
  { ... },
  { ... }
]
```
They are processed in order.

## Supported Effect Types (Complete List)

**Currencies**: Changes the global budget.
```json
{ "gold": 10 }
{ "silver": -5 }
{ "copper": 25 }
```
Positive values = gain  
Negative values = cost/loss

**Items**: Adds or removes items.
```json
{ "item": "beer", "qty": 3 }
{ "item": "herbs", "qty": -2 }
```
Positive `qty` = add to bastion inventory  
Negative `qty` = remove from bastion inventory

**Stats**: Changes a custom value (e.g., reputation or heat).
```json
{ "stat": "reputation", "delta": 1 }
{ "stat": "heat", "delta": -2 }
```

**Log**: Shows a message only. Good for feedback or story.
```json
{ "log": "The workers found something interesting." }
```

**Event (optional)**: Triggers a custom event. A higher-weighted log for the DM.
```json
{ "event": "spawn_bandits" }
```
Only needed for special mechanics or extensions.


## Tips

- prefer many small effects instead of one big complex calculation
- simple numbers are easier to read than formulas
- logs help the DM understand what happened
- effects can be mixed

Example:
Gain gold + lose item + increase reputation + log message

--- 

# Complete Example ? A Finished Facility

This example shows a typical, realistic facility with:
- Tier 1 and Tier 2 (upgrade)
- NPC slots
- multiple orders
- dice checks
- rewards and costs

Use it as a template or copy parts of it.


## Example: Herbalist Garden
```json
{
  "pack_id": "example.herbalism",
  "name": "Herbalism & Gardens",
  "version": 1,
  "author": "Example",

  "facilities": [

    {
      "id": "example.herbalism:garden:t1",
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
      "id": "example.herbalism:garden:t2",
      "name": "Expanded Herbal Garden",
      "description": "Larger fields and better tools increase production.",

      "tier": 2,
      "parent": "example.herbalism:garden:t1",

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

## What this example shows
Tier 1 "Small Herbal Garden":
- 1 NPC slot
- simple orders
- small yields

Tier 2 "Expanded Herbal Garden":
- more NPC slots
- better orders
- higher profits

Upgrade happens automatically via: **parent**

## Tip
Copy this example and adjust only:
- names
- costs
- NPC slots
- orders
- effects

That is enough for 90% of all facilities.

---

# Custom Mechanics (optional / advanced)

**Important first:** You do NOT need custom mechanics for normal facilities.

90% of buildings work with just:
- build
- NPCs
- orders
- effects

Custom mechanics are only needed if you:
- need calculations
- want to simulate markets
- want complex formulas
- want to build your own systems (shop, pub, research, etc.)

If you just want to grant resources, items, or gold ? skip this chapter.


## Where are mechanics defined?

Ideally at the top of the pack. That keeps it readable when you reference them in facilities/orders.
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
Mechanics belong at pack level, not inside a facility.
*Because*: multiple facilities can use the same mechanic.


## Core Idea

A mechanic is a small add-on system.
Examples:
- calculate market prices
- simulate consumption
- calculate revenue with formulas
- manage custom counters

Orders can later trigger/use these mechanics.

## Typical Mechanic Types

The most common:
- stat_counter
- event_table
- formula_engine
- market_tracker

### stat_counter

Manages custom values like:
- reputation
- heat
- progress
- research points
- mana pool

Basically just an extra counter.

Minimal example
```json
{
  "id": "reputation",
  "name": "Public Reputation",
  "type": "stat_counter",
  "config": {
    "custom_stat_name": "reputation",
    "min_value": -10,
    "max_value": 10,
    "start": 0,
    "name": "Reputation"
  }
}
```

Note:
- The stat key comes from `custom_stat_name`, otherwise from `id`/`name`.
- `min`/`max` are also allowed (alternative to `min_value`/`max_value`).

Many simple systems do not need an extra mechanic, because normal "stat" effects are enough.
#### Usage in Orders
These stats can be targeted directly in the order output:
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

Defines **story events** as centrally maintained tables (with weights) and allows orders to either trigger **a specific event** or **draw one at random from a group**.

Important:
- Events are **not mechanics logic** and not "calculations".
- The engine can automatically log the `text` when the event triggers (DM does not need an extra log effect).
- You define events **once centrally** instead of scattering "magic strings" across the pack.


Minimal example
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

#### Structure

- `groups[]` contains multiple event groups (random tables)
- Each group has:
  - `id` (referenced by random_event)
  - `name` (display/readability only)
  - `entries[]` (selectable events)
- Each entry has:
  - `id` (specific event ID, can also be referenced directly)
  - `weight` (weight for random selection)
  - `text` (story text, can be logged automatically)


#### Usage in Orders

**Trigger a specific event (fixed ID)**
```json
"on_success": {
  "effects": [
    { "event": "whisperoffice.cipher_broken" }
  ]
}
```
**Draw a random event from a group**
```json
"on_failure": {
  "effects": [
    { "random_event": "group:whisperoffice.ops_disaster" }
  ]
}
```
Rules:
- `event` triggers exactly that event ID
- `random_event` rolls from the given group by `weight` and triggers the selected event ID


### formula_engine

For calculations and formulas.

Examples:
- income = visitors * price
- consumption = 1d6 + reputation
- profit = revenue - costs

#### Components

**inputs**
values the formula uses

**calculations**
calculations or conditions

**effects**
results per turn - just like normal orders


#### Inputs (Source)

`source` is required.

Allowed sources:
- `number`: UI input for a number. `default` is optional and suggests a value.
- `check`: UI input for a die roll. Required `check_profile` (e.g., "d20"). Valid: integer, range 1..diceSides, minimum roll `d2`.
- `stat`: value from `bastion.stats`. `default` = stat key (if `name` is not used).
- `item`: quantity from `bastion.inventory`. `default` = item key.
- `currency`: base currency from currency object, `default` e.g. { "gold": 5 }.

Not allowed: `market`.

Example inputs:
```json
[
  { "name": "base_income", "source": "number", "default": 5 },
  { "name": "reputation", "source": "stat", "default": "reputation" },
  { "name": "roll_result", "source": "check", "check_profile": "d20" }
]
```

#### Example
```json
{
  "id": "pub_income",
  "type": "formula_engine",
  "config": {

    "inputs": [
      { "name": "base_income", "source": "number", "default": 5 },
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
#### Usage in Orders
```json
"effects": [
  { "trigger": "pub_income" }
]
```
The effect `trigger` calls the mechanic by this ID or its `name`. UI inputs are `number` and `check`. `stat`, `item`, `currency` come automatically from the session state.

### market_tracker

Simulates market prices or supply/demand.

Good for:
- shops
- trade
- economy systems

Example:
- prices fluctuate between -20% and +20%
- categories like weapons, armor, potions

Only needed if you want real market mechanics.
Not needed for simple "+10 gold" rewards.

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

## When should I use mechanics?

Use them only if:

- simple effects are not enough
- you need real calculations
- you want to combine many variables
- you want a mini-game/system

NO mechanics needed for:
- "Gold +10"
- "Item +1"

## Recommendation

Always start without mechanics. Build first:
- facility
- orders
- simple effects

If you later realize: "This is getting too complex".
Then add mechanics.

---

# Best Practices & Rules

This chapter collects simple rules and recommendations
so your facilities:

- stay easy to read
- are quick to edit
- cause fewer errors
- are understandable even for non-programmers

Keep your JSONs as simple as possible.
For inspiration, look at the core JSON files where the standard facilities are defined.


## General Principles

simple numbers instead of complicated formulas  
several small orders instead of one huge one  
short, clear names  
plain text instead of "clever tricks"

If something is hard to read ? simplify it.

## IDs

- no spaces
- no umlauts
- no special characters
- keep stable (do not rename later)

Good:
```text
core:garden:t1
brew_potions
bulk_harvest
```
Bad:
```text
My Garden Level 1
Potion Order!!!
```

## Facility Design

each tier as its own facility  
upgrades linked only via parent  
small, readable orders

Avoid:
- giant monolith facilities
- 20 orders in one tier
- overly complex calculations

Better: multiple small, clear actions.

## Orders

keep duration_turns small (1-3 usually ideal)  
write clear descriptions  
prefer several simple outcomes instead of nested logic

Good example:
- Gather Herbs
- Sell Goods
- Brew Potion

Bad example:
- "Complex Multi-Stage Production Pipeline"

## Effects

Keep effects simple and readable.
Recommended:
```json
{ "gold": 10 }
{ "item": "herb", "qty": 2 }
{ "stat": "reputation", "delta": 1 }
{ "log": "Nice result." }
```
Avoid:
- unnecessary calculations
- hard-to-read values

A DM should immediately understand:
"+10 Gold, +2 Items, +1 Reputation"

## Numbers & Formats

currency always as object
``` { "gold": 10 }```

qty as a number or simple expression
- ```-2```
- ```"-${consumption}"```

no strings for numbers
  not: ```"10"```, but: ```10```


## Use Logs

Logs as *outcome* help a lot for understanding.

Example:
```json
{ "log": "Workers found rare herbs." }
```
Without a log, the DM often does not know **why** something happened.

## Use Mechanics Sparingly

Rule of thumb: Do I really need calculations?
- NO ? use normal effects  
- YES ? formula_engine

Do I just need a counter?
- stat_counter

Do I need market prices?
- market_tracker

Otherwise: leave it out.

## Avoid Complexity

If you think: "This is getting complicated..."
- split it up.

Instead of one huge formula

Better: 2?3 simple orders / multiple outcomes.

## Test Tip

Always test a new facility with:

- only 1 NPC
- 1 order
- small numbers

If that works, expand step by step.
Do not build everything at once.

### Golden Rule

If a DM can read your JSON without explanation, you did it right.
