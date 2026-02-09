import ast
import json
import math
import random
import re
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .logger import setup_logger
from .ledger import Ledger
from .audit_log import AuditLog

logger = setup_logger("facility_manager")


class FacilityManager:
    def __init__(self, root_dir: Path, ledger: Ledger):
        self.root_dir = root_dir
        self.ledger = ledger
        self.facilities_dir = root_dir / "core" / "facilities"
        self.custom_packs_dir = root_dir / "custom_packs"
        self.config_path = root_dir / "core" / "config" / "bastion_config.json"
        self.config = self._load_config()
        self.catalog = self._load_facility_catalog()
        self.event_index, self.event_groups = self._load_event_tables()
        self.formula_index = self._load_formula_engines()
        self._audit_log = AuditLog()

    def _load_config(self) -> Dict[str, Any]:
        try:
            return json.loads(self.config_path.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning(f"Failed to load bastion_config.json: {e}")
            return {}

    def _load_facility_catalog(self) -> Dict[str, Dict[str, Any]]:
        catalog: Dict[str, Dict[str, Any]] = {}
        pack_dirs = [
            ("core", self.facilities_dir),
            ("custom", self.custom_packs_dir),
        ]

        for source, pack_dir in pack_dirs:
            if not pack_dir.exists():
                if source == "core":
                    logger.warning(f"Facilities dir not found: {pack_dir}")
                continue

            for pack_file in sorted(pack_dir.glob("*.json")):
                try:
                    data = json.loads(pack_file.read_text(encoding="utf-8"))
                except Exception as e:
                    logger.warning(f"Failed to read pack file {pack_file.name}: {e}")
                    continue

                pack_id = data.get("pack_id") or pack_file.stem
                facilities = data.get("facilities", []) or []
                if not isinstance(facilities, list):
                    continue

                for facility in facilities:
                    if not isinstance(facility, dict):
                        continue
                    facility_id = facility.get("id")
                    if not isinstance(facility_id, str):
                        continue
                    if facility_id in catalog:
                        logger.warning(f"Duplicate facility id in catalog: {facility_id}")
                        continue
                    item = dict(facility)
                    item["_pack_id"] = pack_id
                    item["_pack_source"] = source
                    catalog[facility_id] = item

        return catalog

    def _load_event_tables(self) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, List[Dict[str, Any]]]]:
        event_index: Dict[str, Dict[str, Any]] = {}
        event_groups: Dict[str, List[Dict[str, Any]]] = {}
        pack_dirs = [
            ("core", self.facilities_dir),
            ("custom", self.custom_packs_dir),
        ]

        for source, pack_dir in pack_dirs:
            if not pack_dir.exists():
                continue

            for pack_file in sorted(pack_dir.glob("*.json")):
                try:
                    data = json.loads(pack_file.read_text(encoding="utf-8"))
                except Exception as e:
                    logger.warning(f"Failed to read pack file {pack_file.name}: {e}")
                    continue

                pack_id = data.get("pack_id") or pack_file.stem
                mechanics = data.get("custom_mechanics", []) or []
                if not isinstance(mechanics, list):
                    continue

                for mech in mechanics:
                    if not isinstance(mech, dict):
                        continue
                    if mech.get("type") != "event_table":
                        continue

                    config = mech.get("config", {}) if isinstance(mech.get("config"), dict) else {}
                    groups = config.get("groups", [])
                    if not isinstance(groups, list):
                        continue

                    for group in groups:
                        if not isinstance(group, dict):
                            continue
                        group_id = group.get("id")
                        if not isinstance(group_id, str) or not group_id:
                            continue
                        entries = group.get("entries", [])
                        if not isinstance(entries, list):
                            continue

                        group_entries = event_groups.setdefault(group_id, [])
                        for entry in entries:
                            if not isinstance(entry, dict):
                                continue
                            event_id = entry.get("id")
                            text = entry.get("text")
                            if not isinstance(event_id, str) or not event_id:
                                continue
                            if not isinstance(text, str) or not text:
                                continue
                            weight = entry.get("weight")
                            if not isinstance(weight, int) or weight <= 0:
                                weight = 1

                            item = {
                                "id": event_id,
                                "text": text,
                                "weight": weight,
                                "group_id": group_id,
                                "pack_id": pack_id,
                                "pack_source": source,
                            }
                            group_entries.append(item)
                            if event_id not in event_index:
                                event_index[event_id] = item
                            else:
                                logger.warning(f"Duplicate event id '{event_id}' in {pack_file.name}")

        return event_index, event_groups

    def _load_formula_engines(self) -> Dict[str, Dict[str, Any]]:
        formula_index: Dict[str, Dict[str, Any]] = {}
        pack_dirs = [
            ("core", self.facilities_dir),
            ("custom", self.custom_packs_dir),
        ]

        for source, pack_dir in pack_dirs:
            if not pack_dir.exists():
                continue

            for pack_file in sorted(pack_dir.glob("*.json")):
                try:
                    data = json.loads(pack_file.read_text(encoding="utf-8"))
                except Exception as e:
                    logger.warning(f"Failed to read pack file {pack_file.name}: {e}")
                    continue

                pack_id = data.get("pack_id") or pack_file.stem
                mechanics = data.get("custom_mechanics", []) or []
                if not isinstance(mechanics, list):
                    continue

                for mech in mechanics:
                    if not isinstance(mech, dict):
                        continue
                    if mech.get("type") != "formula_engine":
                        continue
                    name = mech.get("name") or mech.get("id")
                    if not isinstance(name, str) or not name:
                        continue
                    item = {
                        "id": mech.get("id") or name,
                        "name": mech.get("name") or name,
                        "config": mech.get("config") if isinstance(mech.get("config"), dict) else {},
                        "pack_id": pack_id,
                        "pack_source": source,
                    }
                    if name in formula_index:
                        logger.warning(f"Duplicate formula engine name '{name}' in {pack_file.name}")
                        continue
                    formula_index[name] = item
                    alt_id = mech.get("id")
                    if isinstance(alt_id, str) and alt_id and alt_id != name and alt_id not in formula_index:
                        formula_index[alt_id] = item

        return formula_index

    def add_build_facility(self, session_state: Dict[str, Any], facility_id: str, allow_negative: bool = False) -> Dict[str, Any]:
        if not session_state:
            return {"success": False, "message": "No session loaded"}

        facility_def = self.catalog.get(facility_id)
        if not facility_def:
            return {"success": False, "message": f"Unknown facility_id: {facility_id}"}

        bastion = session_state.setdefault("bastion", {})
        facilities = bastion.setdefault("facilities", [])
        if any(isinstance(entry, dict) and entry.get("facility_id") == facility_id for entry in facilities):
            return {"success": False, "message": "Facility already exists"}

        build = facility_def.get("build", {}) if isinstance(facility_def.get("build"), dict) else {}
        cost = build.get("cost") if isinstance(build.get("cost"), dict) else None
        duration_turns = build.get("duration_turns")

        if cost is None:
            defaults = self.config.get("default_build_costs", {}).get("new_facility", {})
            if isinstance(defaults, dict):
                cost = {k: v for k, v in defaults.items() if k != "duration_turns"}
                if duration_turns is None:
                    duration_turns = defaults.get("duration_turns")

        if not isinstance(cost, dict):
            return {"success": False, "message": "Missing build cost for facility"}
        if not isinstance(duration_turns, int) or duration_turns <= 0:
            return {"success": False, "message": "Invalid build duration"}

        projected = self._projected_treasury_base(session_state, cost)
        if projected is None:
            return {"success": False, "message": "Failed to compute build cost"}

        if projected < 0 and not allow_negative:
            return {
                "success": False,
                "message": "Insufficient funds",
                "requires_confirmation": True,
                "projected_treasury_base": projected,
                "cost": cost,
                "duration_turns": duration_turns,
            }

        effects = self._cost_to_effects(cost)
        context = {
            "event_type": "build_start",
            "source_type": "facility",
            "source_id": facility_id,
            "action": "build",
            "result": "pending",
        }
        self.ledger.apply_effects(session_state, effects, context)

        facility_entry = {
            "facility_id": facility_id,
            "built_turn": None,
            "build_status": {
                "status": "building",
                "started_turn": int(session_state.get("current_turn", 0)),
                "remaining_turns": duration_turns,
            },
            "current_orders": [],
            "current_order": None,
            "custom_stats": {},
            "assigned_npcs": [],
        }
        facilities.append(facility_entry)

        return {
            "success": True,
            "message": "Build started",
            "facility": facility_entry,
        }

    def add_upgrade_facility(self, session_state: Dict[str, Any], facility_id: str, allow_negative: bool = False) -> Dict[str, Any]:
        if not session_state:
            return {"success": False, "message": "No session loaded"}

        bastion = session_state.setdefault("bastion", {})
        facilities = bastion.setdefault("facilities", [])

        facility_entry = next((f for f in facilities if isinstance(f, dict) and f.get("facility_id") == facility_id), None)
        if not facility_entry:
            return {"success": False, "message": f"Facility not found in bastion: {facility_id}"}

        build_status = facility_entry.get("build_status", {})
        status = build_status.get("status") if isinstance(build_status, dict) else None
        if status in ["building", "upgrading"]:
            return {"success": False, "message": f"Facility is not free (status: {status})"}
        orders = self._normalize_orders(facility_entry)
        if any(self._is_order_active(order) for order in orders):
            return {"success": False, "message": "Facility is busy"}

        current_def = self.catalog.get(facility_id)
        if not current_def:
            return {"success": False, "message": f"Unknown facility_id: {facility_id}"}

        target_def = self._find_upgrade_target(facility_id)
        if not target_def:
            return {"success": False, "message": "No upgrade target found"}

        target_id = target_def.get("id")
        current_tier = current_def.get("tier")

        build = target_def.get("build", {}) if isinstance(target_def.get("build"), dict) else {}
        cost = build.get("cost") if isinstance(build.get("cost"), dict) else None
        duration_turns = build.get("duration_turns")

        if cost is None or duration_turns is None:
            defaults = self._get_upgrade_defaults(current_tier)
            if isinstance(defaults, dict):
                if cost is None:
                    cost = {k: v for k, v in defaults.items() if k != "duration_turns"}
                if duration_turns is None:
                    duration_turns = defaults.get("duration_turns")

        if not isinstance(cost, dict):
            return {"success": False, "message": "Missing upgrade cost for facility"}
        if not isinstance(duration_turns, int) or duration_turns <= 0:
            return {"success": False, "message": "Invalid upgrade duration"}

        projected = self._projected_treasury_base(session_state, cost)
        if projected is None:
            return {"success": False, "message": "Failed to compute upgrade cost"}

        if projected < 0 and not allow_negative:
            return {
                "success": False,
                "message": "Insufficient funds",
                "requires_confirmation": True,
                "projected_treasury_base": projected,
                "cost": cost,
                "duration_turns": duration_turns,
            }

        effects = self._cost_to_effects(cost)
        context = {
            "event_type": "upgrade_start",
            "source_type": "facility",
            "source_id": facility_id,
            "action": f"upgrade_to_{target_id}",
            "result": "pending",
        }
        self.ledger.apply_effects(session_state, effects, context)

        facility_entry["build_status"] = {
            "status": "upgrading",
            "started_turn": int(session_state.get("current_turn", 0)),
            "remaining_turns": duration_turns,
            "target_id": target_id,
        }
        facility_entry["current_order"] = None

        return {
            "success": True,
            "message": "Upgrade started",
            "facility": facility_entry,
        }

    def demolish_facility(self, session_state: Dict[str, Any], facility_id: str) -> Dict[str, Any]:
        if not session_state:
            return {"success": False, "message": "No session loaded"}

        bastion = session_state.setdefault("bastion", {})
        facilities = bastion.setdefault("facilities", [])

        facility_entry = next((f for f in facilities if isinstance(f, dict) and f.get("facility_id") == facility_id), None)
        if not facility_entry:
            return {"success": False, "message": f"Facility not found in bastion: {facility_id}"}

        build_status = facility_entry.get("build_status", {})
        status = build_status.get("status") if isinstance(build_status, dict) else None
        target_id = build_status.get("target_id") if isinstance(build_status, dict) else None
        chain_target = target_id if status == "upgrading" and target_id else None
        total_cost = self._sum_facility_chain_costs(facility_id, chain_target)

        refund: Dict[str, int] = {}
        for currency, amount in total_cost.items():
            if isinstance(amount, int) and amount > 0:
                refund_amount = int(amount * 0.3)
                if refund_amount:
                    refund[currency] = refund_amount

        orders = self._normalize_orders(facility_entry)
        active_orders = [o for o in orders if self._infer_order_status(o) in ("in_progress", "ready")]

        assigned = facility_entry.get("assigned_npcs") if isinstance(facility_entry.get("assigned_npcs"), list) else []
        npcs_unassigned = bastion.setdefault("npcs_unassigned", [])
        if assigned:
            npcs_unassigned.extend(assigned)

        facilities.remove(facility_entry)

        log_text = f"Facility demolished: {facility_id}"
        effects: List[Dict[str, Any]] = []
        if refund:
            effects.append(refund)
        effects.append({"log": log_text})

        context = {
            "event_type": "facility_demolish",
            "source_type": "facility",
            "source_id": facility_id,
            "action": "demolish",
            "result": "success",
            "log_text": log_text,
        }
        self.ledger.apply_effects(session_state, effects, context)

        return {
            "success": True,
            "refund": refund,
            "moved_npcs": len(assigned),
            "active_orders": len(active_orders),
        }

    def advance_turn(self, session_state: Dict[str, Any]) -> Dict[str, Any]:
        if not session_state:
            return {"success": False, "message": "No session loaded"}

        bastion = session_state.setdefault("bastion", {})
        facilities = bastion.setdefault("facilities", [])
        for facility in facilities:
            if not isinstance(facility, dict):
                continue
            orders = self._normalize_orders(facility)
            if any(self._infer_order_status(order) == "ready" for order in orders if isinstance(order, dict)):
                return {"success": False, "message": "Pending orders ready for evaluation"}

        session_state["current_turn"] = int(session_state.get("current_turn", 0)) + 1
        current_turn = session_state["current_turn"]

        self._apply_npc_upkeep(session_state, current_turn)

        completed = []

        for facility in facilities:
            if not isinstance(facility, dict):
                continue
            build_status = facility.get("build_status", {})
            if not isinstance(build_status, dict):
                continue

            status = build_status.get("status")
            remaining = build_status.get("remaining_turns")

            if status in ["building", "upgrading"] and isinstance(remaining, int):
                remaining -= 1
                build_status["remaining_turns"] = remaining
                if remaining <= 0:
                    build_status["status"] = "operational"
                    build_status.pop("remaining_turns", None)
                    target_id = build_status.pop("target_id", None)

                    if status == "building":
                        facility["built_turn"] = current_turn
                        completed.append({"facility_id": facility.get("facility_id"), "status": "built"})
                    elif status == "upgrading":
                        if target_id:
                            facility["facility_id"] = target_id
                        facility["upgraded_turn"] = current_turn
                        completed.append({"facility_id": facility.get("facility_id"), "status": "upgraded"})

            orders = self._normalize_orders(facility)
            for order in orders:
                if not isinstance(order, dict):
                    continue
                order_status = self._infer_order_status(order)
                if order_status != "in_progress":
                    continue
                duration = order.get("duration_turns")
                progress = order.get("progress")
                if not isinstance(duration, int) or duration <= 0:
                    continue
                if not isinstance(progress, int):
                    progress = 0
                progress += 1
                order["progress"] = progress
                if progress >= duration:
                    order["status"] = "ready"
                    order.setdefault("ready_turn", current_turn)

        return {
            "success": True,
            "message": "Turn advanced",
            "current_turn": current_turn,
            "completed": completed,
        }

    def resolve_facility_states(self, session_state: Dict[str, Any]) -> List[Dict[str, Any]]:
        bastion = (session_state or {}).get("bastion", {})
        facilities = bastion.get("facilities", []) or []
        results = []

        for facility in facilities:
            if not isinstance(facility, dict):
                continue
            build_status = facility.get("build_status", {}) if isinstance(facility.get("build_status"), dict) else {}
            status = build_status.get("status")
            remaining_turns = None

            if status == "building":
                state = "building"
                remaining_turns = build_status.get("remaining_turns")
            elif status == "upgrading":
                state = "upgrading"
                remaining_turns = build_status.get("remaining_turns")
            else:
                orders = self._normalize_orders(facility)
                active_orders = [o for o in orders if self._is_order_active(o)]
                busy_orders = [o for o in active_orders if (self._infer_order_status(o) == "in_progress")]
                ready_orders = [o for o in active_orders if (self._infer_order_status(o) == "ready")]

                if ready_orders:
                    state = "ready"
                    remaining_turns = None
                elif busy_orders:
                    state = "busy"
                    remaining_turns = self._min_remaining_turns(busy_orders)
                else:
                    state = "free"

            facility_id = facility.get("facility_id")
            facility_def = self.catalog.get(facility_id) if isinstance(facility_id, str) else None
            slots_total = facility_def.get("npc_slots") if isinstance(facility_def, dict) else None
            if not isinstance(slots_total, int):
                slots_total = None
            slots_used = len([o for o in self._normalize_orders(facility) if self._is_order_active(o)])

            results.append({
                "facility_id": facility_id,
                "state": state,
                "remaining_turns": remaining_turns,
                "slots_total": slots_total,
                "slots_used": slots_used,
                "ready_orders": len([o for o in self._normalize_orders(facility) if self._infer_order_status(o) == "ready"]),
                "busy_orders": len([o for o in self._normalize_orders(facility) if self._infer_order_status(o) == "in_progress"]),
            })

        return results

    def hire_npc(
        self,
        session_state: Dict[str, Any],
        name: str,
        profession: str,
        level: Any,
        upkeep: Dict[str, Any],
        facility_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        if not session_state:
            return {"success": False, "message": "No session loaded"}

        if not isinstance(name, str) or not name.strip():
            return {"success": False, "message": "NPC name required"}
        if not isinstance(profession, str) or not profession.strip():
            return {"success": False, "message": "NPC profession required"}

        try:
            level_int = int(level)
        except (TypeError, ValueError):
            return {"success": False, "message": "NPC level invalid"}
        if level_int not in [1, 2, 3]:
            return {"success": False, "message": "NPC level must be 1-3"}

        upkeep_norm = self._normalize_upkeep(upkeep)
        if upkeep_norm is None:
            return {"success": False, "message": "NPC upkeep invalid"}
        if not upkeep_norm:
            return {"success": False, "message": "NPC upkeep required"}

        npc_entry = {
            "npc_id": self._generate_npc_id(session_state, name),
            "name": name.strip(),
            "profession": profession.strip(),
            "level": level_int,
            "xp": 0,
            "upkeep": upkeep_norm,
            "hired_turn": int(session_state.get("current_turn", 0)),
        }

        if facility_id:
            facility_def = self.catalog.get(facility_id)
            allowed = facility_def.get("npc_allowed_professions") if isinstance(facility_def, dict) else None
            if isinstance(allowed, list) and allowed and profession not in allowed:
                return {"success": False, "message": "NPC profession not allowed for this facility"}
            error = self._assign_npc_to_facility(session_state, npc_entry, facility_id, allow_profession_mismatch=False)
            if error:
                return {"success": False, "message": error}
        else:
            bastion = session_state.setdefault("bastion", {})
            unassigned = bastion.setdefault("npcs_unassigned", [])
            if not isinstance(unassigned, list):
                unassigned = []
                bastion["npcs_unassigned"] = unassigned
            unassigned.append(npc_entry)

        return {"success": True, "message": "NPC hired", "npc": npc_entry}

    def move_npc(
        self,
        session_state: Dict[str, Any],
        npc_id: str,
        target_facility_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        if not session_state:
            return {"success": False, "message": "No session loaded"}
        if not npc_id:
            return {"success": False, "message": "NPC id required"}

        npc_entry, current_facility = self._locate_npc(session_state, npc_id)
        if not npc_entry:
            return {"success": False, "message": "NPC not found"}

        if not target_facility_id:
            if current_facility is None:
                return {"success": False, "message": "NPC already in reserve"}
            canceled = self._remove_npc_orders(current_facility, npc_id)
            self._remove_npc_from_facility(current_facility, npc_id)
            bastion = session_state.setdefault("bastion", {})
            unassigned = bastion.setdefault("npcs_unassigned", [])
            if not isinstance(unassigned, list):
                unassigned = []
                bastion["npcs_unassigned"] = unassigned
            unassigned.append(npc_entry)
            return {"success": True, "message": "NPC moved to reserve", "canceled_orders": canceled}

        if current_facility and current_facility.get("facility_id") == target_facility_id:
            return {"success": False, "message": "NPC already assigned to facility"}

        error = self._assign_npc_to_facility(session_state, npc_entry, target_facility_id)
        if error:
            return {"success": False, "message": error}

        canceled = 0
        if current_facility:
            canceled = self._remove_npc_orders(current_facility, npc_id)
            self._remove_npc_from_facility(current_facility, npc_id)
        else:
            self._remove_npc_from_unassigned(session_state, npc_id)

        return {"success": True, "message": "NPC moved", "canceled_orders": canceled}

    def fire_npc(self, session_state: Dict[str, Any], npc_id: str) -> Dict[str, Any]:
        if not session_state:
            return {"success": False, "message": "No session loaded"}
        if not npc_id:
            return {"success": False, "message": "NPC id required"}

        npc_entry, current_facility = self._locate_npc(session_state, npc_id)
        if not npc_entry:
            return {"success": False, "message": "NPC not found"}

        if current_facility and self._npc_has_active_order(current_facility, npc_id):
            return {"success": False, "message": "NPC has active order"}

        if current_facility:
            self._remove_npc_from_facility(current_facility, npc_id)
        else:
            self._remove_npc_from_unassigned(session_state, npc_id)

        return {"success": True, "message": "NPC fired"}

    def start_order(self, session_state: Dict[str, Any], facility_id: str, npc_id: str, order_id: str) -> Dict[str, Any]:
        if not session_state:
            return {"success": False, "message": "No session loaded"}
        if not facility_id or not npc_id or not order_id:
            return {"success": False, "message": "Missing facility, npc or order id"}

        facility_entry = self._find_facility_entry(session_state, facility_id)
        if not facility_entry:
            return {"success": False, "message": f"Facility not found in bastion: {facility_id}"}

        build_status = facility_entry.get("build_status", {})
        status = build_status.get("status") if isinstance(build_status, dict) else None
        if status in ["building", "upgrading"]:
            return {"success": False, "message": f"Facility is not ready (status: {status})"}

        facility_def = self.catalog.get(facility_id)
        if not facility_def:
            return {"success": False, "message": f"Unknown facility_id: {facility_id}"}

        orders_def = facility_def.get("orders") if isinstance(facility_def.get("orders"), list) else []
        order_def = next((o for o in orders_def if isinstance(o, dict) and o.get("id") == order_id), None)
        if not order_def:
            return {"success": False, "message": f"Unknown order_id: {order_id}"}

        assigned_npcs = facility_entry.get("assigned_npcs", []) if isinstance(facility_entry.get("assigned_npcs"), list) else []
        npc = next((n for n in assigned_npcs if isinstance(n, dict) and n.get("npc_id") == npc_id), None)
        if not npc:
            return {"success": False, "message": f"NPC not assigned to facility: {npc_id}"}

        npc_slots = facility_def.get("npc_slots")
        if not isinstance(npc_slots, int) or npc_slots <= 0:
            return {"success": False, "message": "Facility has no NPC slots"}

        current_orders = self._normalize_orders(facility_entry)
        active_orders = [o for o in current_orders if self._is_order_active(o)]
        if len(active_orders) >= npc_slots:
            return {"success": False, "message": "No free NPC slots available"}

        if any(o.get("npc_id") == npc_id for o in active_orders if isinstance(o, dict)):
            return {"success": False, "message": "NPC already has an active order"}

        min_level = order_def.get("min_npc_level", 1)
        npc_level = npc.get("level", 1)
        if isinstance(min_level, int) and isinstance(npc_level, int) and npc_level < min_level:
            return {"success": False, "message": "NPC level too low for this order"}

        duration_turns = order_def.get("duration_turns")
        if not isinstance(duration_turns, int) or duration_turns <= 0:
            duration_turns = 1

        order_entry = {
            "order_id": order_id,
            "npc_id": npc_id,
            "npc_name": npc.get("name"),
            "npc_level": npc_level,
            "started_turn": int(session_state.get("current_turn", 0)),
            "duration_turns": duration_turns,
            "progress": 0,
            "status": "in_progress",
            "roll": None,
            "roll_locked": False,
            "roll_source": None,
        }
        current_orders.append(order_entry)

        return {"success": True, "message": "Order started", "order": order_entry}

    def lock_order_roll(self, session_state: Dict[str, Any], facility_id: str, order_id: str, roll_value: Optional[int] = None, auto: bool = False) -> Dict[str, Any]:
        if not session_state:
            return {"success": False, "message": "No session loaded"}

        facility_entry = self._find_facility_entry(session_state, facility_id)
        if not facility_entry:
            return {"success": False, "message": f"Facility not found in bastion: {facility_id}"}

        order_entry = self._find_order_entry(facility_entry, order_id)
        if not order_entry:
            return {"success": False, "message": f"Order not found: {order_id}"}

        if self._infer_order_status(order_entry) != "ready":
            return {"success": False, "message": "Order not ready for roll"}

        if order_entry.get("roll_locked"):
            return {"success": False, "message": "Roll already locked"}

        order_def = self._find_order_def(facility_id, order_id)
        outcome = order_def.get("outcome") if isinstance(order_def, dict) else None
        check_profile = outcome.get("check_profile") if isinstance(outcome, dict) else None

        roll = None
        if check_profile:
            sides = self._dice_sides_from_profile(check_profile)
            if sides is None:
                return {"success": False, "message": "Invalid check profile"}
            if auto:
                roll = random.randint(1, sides)
            else:
                if not isinstance(roll_value, int):
                    return {"success": False, "message": "Invalid roll value"}
                if roll_value < 1 or roll_value > sides:
                    return {"success": False, "message": f"Roll must be between 1 and {sides}"}
                roll = roll_value

        order_entry["roll"] = roll
        order_entry["roll_locked"] = True
        order_entry["roll_source"] = "auto" if auto else "manual"
        order_entry["roll_turn"] = int(session_state.get("current_turn", 0))

        return {"success": True, "message": "Roll locked", "roll": roll}

    def save_formula_inputs(
        self,
        session_state: Dict[str, Any],
        facility_id: str,
        order_id: str,
        trigger_id: str,
        inputs: Any,
    ) -> Dict[str, Any]:
        if not session_state:
            return {"success": False, "message": "No session loaded"}
        if not facility_id or not order_id or not trigger_id:
            return {"success": False, "message": "Missing facility, order or trigger id"}

        facility_entry = self._find_facility_entry(session_state, facility_id)
        if not facility_entry:
            return {"success": False, "message": f"Facility not found in bastion: {facility_id}"}

        order_entry = self._find_order_entry(facility_entry, order_id)
        if not order_entry:
            return {"success": False, "message": f"Order not found: {order_id}"}

        formula_def = self.formula_index.get(trigger_id)
        if not formula_def:
            return {"success": False, "message": f"Formula not found: {trigger_id}"}

        config = formula_def.get("config", {}) if isinstance(formula_def, dict) else {}
        input_defs = config.get("inputs", []) if isinstance(config.get("inputs"), list) else []
        user_inputs = [
            i
            for i in input_defs
            if isinstance(i, dict) and self._is_formula_user_input_source(i.get("source"))
        ]

        if not isinstance(inputs, dict):
            return {"success": False, "message": "Invalid formula inputs"}

        parsed_inputs: Dict[str, float] = {}
        for input_def in user_inputs:
            name = input_def.get("name")
            if not isinstance(name, str) or not name:
                continue
            if input_def.get("default") is not None and name not in inputs:
                continue
            if name not in inputs:
                return {"success": False, "message": "Formula inputs missing"}
            raw_val = inputs.get(name)
            try:
                parsed_value = float(raw_val)
            except (TypeError, ValueError):
                return {"success": False, "message": "Formula inputs invalid"}
            source = self._normalize_formula_source(input_def.get("source"))
            if source == "check":
                sides = self._get_check_profile_sides(input_def.get("check_profile"))
                if sides is None:
                    return {"success": False, "message": "Formula inputs invalid"}
                if not parsed_value.is_integer():
                    return {"success": False, "message": "Formula inputs invalid"}
                parsed_int = int(parsed_value)
                if parsed_int < 1 or parsed_int > sides:
                    return {"success": False, "message": "Formula inputs invalid"}
                parsed_inputs[name] = parsed_int
            else:
                parsed_inputs[name] = parsed_value

        order_entry.setdefault("formula_inputs", {})
        order_entry["formula_inputs"][trigger_id] = parsed_inputs

        return {"success": True, "message": "Formula inputs saved"}

    def evaluate_order(self, session_state: Dict[str, Any], facility_id: str, order_id: str) -> Dict[str, Any]:
        if not session_state:
            return {"success": False, "message": "No session loaded"}

        facility_entry = self._find_facility_entry(session_state, facility_id)
        if not facility_entry:
            return {"success": False, "message": f"Facility not found in bastion: {facility_id}"}

        order_entry = self._find_order_entry(facility_entry, order_id)
        if not order_entry:
            return {"success": False, "message": f"Order not found: {order_id}"}

        if self._infer_order_status(order_entry) != "ready":
            return {"success": False, "message": "Order not ready for evaluation"}

        order_def = self._find_order_def(facility_id, order_id)
        if not order_def:
            return {"success": False, "message": "Order definition not found"}

        outcome = order_def.get("outcome") if isinstance(order_def.get("outcome"), dict) else {}
        check_profile = outcome.get("check_profile")

        roll = order_entry.get("roll")
        if check_profile and not order_entry.get("roll_locked"):
            return {"success": False, "message": "Roll not locked"}
        if check_profile:
            if not self._resolve_check_profile(check_profile, order_entry.get("npc_level")):
                return {"success": False, "message": "Invalid check profile"}

        npc_level = order_entry.get("npc_level")
        result_bucket = self._determine_outcome(check_profile, npc_level, roll)
        effects = self._get_effects_for_bucket(outcome, result_bucket)
        effects, formula_errors = self._expand_formula_triggers(
            session_state,
            effects,
            facility_id,
            order_id,
            order_entry,
        )
        if formula_errors:
            return {"success": False, "message": "; ".join(formula_errors)}

        context = {
            "event_type": "order_resolve",
            "source_type": "facility",
            "source_id": facility_id,
            "action": order_id,
            "roll": "-" if roll is None else str(roll),
            "result": result_bucket.replace("on_", ""),
        }
        events = self._resolve_event_effects(session_state, effects, facility_id, order_id, roll)
        ledger_result = self.ledger.apply_effects(session_state, effects, context)

        xp_gain, duration_turns = self._xp_gain_for_order(order_entry, order_def)
        if xp_gain > 0:
            self._award_npc_xp(session_state, facility_id, order_entry.get("npc_id"), xp_gain, duration_turns)

        current_orders = self._normalize_orders(facility_entry)
        if order_entry in current_orders:
            current_orders.remove(order_entry)

        return {
            "success": ledger_result.get("success", False),
            "message": "Order evaluated",
            "bucket": result_bucket,
            "roll": roll,
            "entries": ledger_result.get("entries", []),
            "events": events,
        }

    def _resolve_event_effects(
        self,
        session_state: Dict[str, Any],
        effects: List[Dict[str, Any]],
        facility_id: Optional[str],
        order_id: Optional[str],
        roll: Optional[int],
    ) -> List[Dict[str, Any]]:
        if not session_state or not isinstance(effects, list):
            return []

        turn = int(session_state.get("current_turn", 0))
        events: List[Dict[str, Any]] = []

        for effect in effects:
            if not isinstance(effect, dict):
                continue

            event_id = effect.get("event")
            if isinstance(event_id, str) and event_id:
                entry = self.event_index.get(event_id)
                if entry:
                    events.append({"turn": turn, "event_id": event_id, "text": entry.get("text", "")})
                else:
                    logger.warning(f"Event id not found: {event_id}")

            random_ref = effect.get("random_event")
            if isinstance(random_ref, str) and random_ref:
                if random_ref.startswith("group:"):
                    group_id = random_ref[len("group:"):]
                    picked = self._pick_random_event(group_id)
                    if picked:
                        events.append({"turn": turn, "event_id": picked.get("id", ""), "text": picked.get("text", "")})
                    else:
                        logger.warning(f"Random event group empty or missing: {group_id}")
                else:
                    entry = self.event_index.get(random_ref)
                    if entry:
                        events.append({"turn": turn, "event_id": random_ref, "text": entry.get("text", "")})
                    else:
                        logger.warning(f"Random event ref not found: {random_ref}")

        if events:
            history = self._get_event_history_list(session_state)
            history.extend(events)
            roll_text = "-" if roll is None else str(roll)
            for event in events:
                event_id = event.get("event_id") or "unknown"
                text = event.get("text") or ""
                log_text = f"Event: {text}".strip()
                self._audit_log.add_entry(
                    session_state,
                    turn,
                    "event",
                    "facility",
                    facility_id or "*",
                    order_id or "-",
                    roll_text,
                    "event",
                    event_id,
                    log_text,
                )

        return events

    def _expand_formula_triggers(
        self,
        session_state: Dict[str, Any],
        effects: List[Dict[str, Any]],
        facility_id: Optional[str],
        order_id: Optional[str],
        order_entry: Optional[Dict[str, Any]] = None,
    ) -> Tuple[List[Dict[str, Any]], List[str]]:
        if not session_state or not isinstance(effects, list):
            return effects, []

        resolved: List[Dict[str, Any]] = []
        errors: List[str] = []
        stored_inputs_all = {}
        if isinstance(order_entry, dict) and isinstance(order_entry.get("formula_inputs"), dict):
            stored_inputs_all = order_entry.get("formula_inputs", {})

        for effect in effects:
            if not isinstance(effect, dict):
                continue
            trigger_id = effect.get("trigger")
            if isinstance(trigger_id, str) and trigger_id:
                formula_def = self.formula_index.get(trigger_id)
                if not formula_def:
                    errors.append(f"Formula not found: {trigger_id}")
                else:
                    stored_inputs = stored_inputs_all.get(trigger_id, {}) if isinstance(stored_inputs_all, dict) else {}
                    missing = self._missing_formula_inputs(formula_def, stored_inputs)
                    if missing:
                        errors.append("Formula inputs missing")
                    else:
                        formula_effects, formula_errors = self._execute_formula_engine(
                            session_state,
                            formula_def,
                            stored_inputs,
                        )
                        if formula_errors:
                            errors.extend(formula_errors)
                        else:
                            resolved.extend(formula_effects)
            trimmed = {k: v for k, v in effect.items() if k != "trigger"}
            if trimmed:
                resolved.append(trimmed)

        return resolved, errors

    def _normalize_formula_source(self, source: Any) -> Optional[str]:
        if not isinstance(source, str):
            return None
        source = source.strip().lower()
        return source or None

    def _is_formula_user_input_source(self, source: Any) -> bool:
        return self._normalize_formula_source(source) in {"number", "check"}

    def _get_check_profile(self, check_profile: Any) -> Optional[Dict[str, Any]]:
        if not isinstance(check_profile, str) or not check_profile:
            return None
        profiles = self.config.get("check_profiles", {})
        if not isinstance(profiles, dict):
            return None
        profile = profiles.get(check_profile)
        if not isinstance(profile, dict):
            return None
        return profile

    def _get_check_profile_sides(self, check_profile: Any) -> Optional[int]:
        profile = self._get_check_profile(check_profile)
        if not profile:
            return None
        sides = profile.get("sides")
        if not isinstance(sides, int):
            return None
        if sides < 2:
            return None
        return sides

    def _missing_formula_inputs(self, formula_def: Dict[str, Any], stored_inputs: Any) -> List[str]:
        config = formula_def.get("config", {}) if isinstance(formula_def, dict) else {}
        inputs = config.get("inputs", []) if isinstance(config.get("inputs"), list) else []
        missing = []
        for input_def in inputs:
            if not isinstance(input_def, dict):
                continue
            source = self._normalize_formula_source(input_def.get("source"))
            if source not in {"number", "check"}:
                continue
            name = input_def.get("name")
            if not isinstance(name, str) or not name:
                continue
            if input_def.get("default") is not None:
                continue
            value = stored_inputs.get(name) if isinstance(stored_inputs, dict) else None
            if value is None or (isinstance(value, str) and not value.strip()):
                missing.append(name)
                continue
            try:
                numeric = float(value)
            except (TypeError, ValueError):
                missing.append(name)
                continue
            if source == "check":
                sides = self._get_check_profile_sides(input_def.get("check_profile"))
                if sides is None or not numeric.is_integer():
                    missing.append(name)
                    continue
                if int(numeric) < 1 or int(numeric) > sides:
                    missing.append(name)
        return missing

    def _execute_formula_engine(
        self,
        session_state: Dict[str, Any],
        formula_def: Dict[str, Any],
        stored_inputs: Any,
    ) -> Tuple[List[Dict[str, Any]], List[str]]:
        config = formula_def.get("config", {}) if isinstance(formula_def, dict) else {}
        inputs = config.get("inputs", []) if isinstance(config.get("inputs"), list) else []
        calculations = config.get("calculations", []) if isinstance(config.get("calculations"), list) else []
        effects = config.get("effects", []) if isinstance(config.get("effects"), list) else []

        variables, errors = self._build_formula_inputs(inputs, session_state, stored_inputs)
        if errors:
            return [], errors

        for calc in calculations:
            if not isinstance(calc, dict):
                continue
            name = calc.get("name")
            if not isinstance(name, str) or not name:
                continue
            value = 0
            if "formula" in calc and isinstance(calc.get("formula"), str):
                value = self._eval_formula_expression(calc.get("formula"), variables)
            elif "conditions" in calc and isinstance(calc.get("conditions"), list):
                value = self._eval_formula_conditions(calc.get("conditions"), variables)
            variables[name] = value

        resolved_effects: List[Dict[str, Any]] = []
        for effect in effects:
            if not isinstance(effect, dict):
                continue
            resolved: Dict[str, Any] = {}
            for key, raw_value in effect.items():
                resolved_value = self._resolve_formula_value(raw_value, variables)
                resolved_value = self._normalize_formula_effect_value(key, resolved_value)
                if resolved_value is None:
                    continue
                resolved[key] = resolved_value
            if resolved:
                resolved_effects.append(resolved)

        return resolved_effects, []

    def _build_formula_inputs(
        self,
        inputs: List[Dict[str, Any]],
        session_state: Dict[str, Any],
        stored_inputs: Any,
    ) -> Tuple[Dict[str, float], List[str]]:
        variables: Dict[str, float] = {}
        errors: List[str] = []
        bastion = session_state.get("bastion", {}) if isinstance(session_state, dict) else {}
        stats = bastion.get("stats", {}) if isinstance(bastion.get("stats"), dict) else {}
        inventory = bastion.get("inventory", []) if isinstance(bastion.get("inventory"), list) else []

        for input_def in inputs:
            if not isinstance(input_def, dict):
                continue
            name = input_def.get("name")
            if not isinstance(name, str) or not name:
                continue
            source = self._normalize_formula_source(input_def.get("source"))
            default = input_def.get("default")
            value: Any = 0

            if source in {"number", "check"}:
                if isinstance(stored_inputs, dict) and name in stored_inputs:
                    raw_value = stored_inputs.get(name)
                elif default is not None:
                    raw_value = default
                else:
                    errors.append(f"Missing formula input: {name}")
                    continue
                try:
                    numeric = float(raw_value)
                except (TypeError, ValueError):
                    errors.append(f"Invalid formula input: {name}")
                    continue
                if source == "check":
                    sides = self._get_check_profile_sides(input_def.get("check_profile"))
                    if sides is None:
                        errors.append(f"Invalid check_profile for input: {name}")
                        continue
                    if not numeric.is_integer():
                        errors.append(f"Invalid formula input: {name}")
                        continue
                    numeric = int(numeric)
                    if numeric < 1 or numeric > sides:
                        errors.append(f"Invalid formula input: {name}")
                        continue
                value = numeric
            elif source == "stat":
                stat_key = default if isinstance(default, str) else name
                value = stats.get(stat_key, 0)
            elif source == "item":
                item_key = default if isinstance(default, str) else name
                value = self._get_inventory_qty(inventory, item_key)
            elif source == "currency":
                value = self._currency_to_base(default)
            else:
                errors.append(f"Invalid formula input source: {name}")
                continue

            variables[name] = self._coerce_number(value)

        return variables, errors

    def _get_inventory_qty(self, inventory: List[Dict[str, Any]], item_key: Any) -> int:
        if not isinstance(item_key, str) or not item_key:
            return 0
        for entry in inventory:
            if not isinstance(entry, dict):
                continue
            if entry.get("item") == item_key and isinstance(entry.get("qty"), int):
                return entry.get("qty")
        return 0

    def _currency_to_base(self, value: Any) -> float:
        if isinstance(value, (int, float)):
            return float(value)
        if not isinstance(value, dict):
            return 0.0
        total = 0.0
        for currency, amount in value.items():
            if not isinstance(currency, str):
                continue
            if not isinstance(amount, (int, float)):
                continue
            factor = self.ledger.factor_to_base.get(currency)
            if not factor:
                continue
            total += float(amount) * float(factor)
        return total

    def _coerce_number(self, value: Any) -> float:
        if isinstance(value, bool):
            return 1.0 if value else 0.0
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            try:
                return float(value)
            except ValueError:
                return 0.0
        return 0.0

    def _eval_formula_expression(self, expr: str, variables: Dict[str, float]) -> float:
        if not isinstance(expr, str) or not expr:
            return 0.0
        rolled = self._roll_dice(expr)
        try:
            tree = ast.parse(rolled, mode="eval")
            return float(self._eval_ast(tree.body, variables))
        except Exception:
            return 0.0

    def _eval_formula_conditions(self, conditions: List[Dict[str, Any]], variables: Dict[str, float]) -> float:
        for cond in conditions:
            if not isinstance(cond, dict):
                continue
            if "if" in cond and isinstance(cond.get("if"), str):
                result = self._eval_formula_expression(cond.get("if"), variables)
                if result:
                    if "then_formula" in cond and isinstance(cond.get("then_formula"), str):
                        return self._eval_formula_expression(cond.get("then_formula"), variables)
                    if "then" in cond:
                        return self._coerce_number(cond.get("then"))
            if "else" in cond:
                return self._coerce_number(cond.get("else"))
        return 0.0

    def _eval_ast(self, node: ast.AST, variables: Dict[str, float]) -> float:
        if isinstance(node, ast.Num):
            return float(node.n)
        if isinstance(node, ast.Constant):
            if isinstance(node.value, (int, float)):
                return float(node.value)
            if isinstance(node.value, bool):
                return 1.0 if node.value else 0.0
            return 0.0
        if isinstance(node, ast.Name):
            return float(variables.get(node.id, 0.0))
        if isinstance(node, ast.UnaryOp):
            operand = self._eval_ast(node.operand, variables)
            if isinstance(node.op, ast.UAdd):
                return +operand
            if isinstance(node.op, ast.USub):
                return -operand
            return 0.0
        if isinstance(node, ast.BinOp):
            left = self._eval_ast(node.left, variables)
            right = self._eval_ast(node.right, variables)
            if isinstance(node.op, ast.Add):
                return left + right
            if isinstance(node.op, ast.Sub):
                return left - right
            if isinstance(node.op, ast.Mult):
                return left * right
            if isinstance(node.op, ast.Div):
                return left / right if right != 0 else 0.0
            if isinstance(node.op, ast.FloorDiv):
                return math.floor(left / right) if right != 0 else 0.0
            return 0.0
        if isinstance(node, ast.Compare):
            left = self._eval_ast(node.left, variables)
            for op, comparator in zip(node.ops, node.comparators):
                right = self._eval_ast(comparator, variables)
                if isinstance(op, ast.Gt) and not (left > right):
                    return 0.0
                if isinstance(op, ast.GtE) and not (left >= right):
                    return 0.0
                if isinstance(op, ast.Lt) and not (left < right):
                    return 0.0
                if isinstance(op, ast.LtE) and not (left <= right):
                    return 0.0
                if isinstance(op, ast.Eq) and not (left == right):
                    return 0.0
                if isinstance(op, ast.NotEq) and not (left != right):
                    return 0.0
                left = right
            return 1.0
        if isinstance(node, ast.BoolOp):
            if isinstance(node.op, ast.And):
                return 1.0 if all(self._eval_ast(v, variables) for v in node.values) else 0.0
            if isinstance(node.op, ast.Or):
                return 1.0 if any(self._eval_ast(v, variables) for v in node.values) else 0.0
        return 0.0

    def _roll_dice(self, expr: str) -> str:
        pattern = re.compile(r'(?<![\w.])(\d*)d(\d+)', re.IGNORECASE)

        def repl(match: re.Match) -> str:
            count_raw = match.group(1)
            count = int(count_raw) if count_raw else 1
            sides = int(match.group(2))
            if count <= 0 or sides <= 0:
                return "0"
            total = 0
            for _ in range(count):
                total += random.randint(1, sides)
            return str(total)

        return pattern.sub(repl, expr)

    def _resolve_formula_value(self, raw_value: Any, variables: Dict[str, float]) -> Any:
        if isinstance(raw_value, str):
            def repl(match: re.Match) -> str:
                key = match.group(1)
                return str(variables.get(key, ""))

            replaced = re.sub(r"\$\{([^}]+)\}", repl, raw_value)
            if self._is_number(replaced):
                try:
                    return float(replaced)
                except ValueError:
                    return replaced
            return replaced
        return raw_value

    def _normalize_formula_effect_value(self, key: str, value: Any) -> Any:
        if key in ("stat", "item"):
            if value is None:
                return ""
            return str(value)
        if key == "log":
            return str(value) if value is not None else ""
        if isinstance(value, (int, float)):
            return int(self._round_commercial(float(value)))
        if isinstance(value, str) and self._is_number(value):
            try:
                return int(self._round_commercial(float(value)))
            except ValueError:
                return value
        return value

    def _round_commercial(self, value: float) -> float:
        if value >= 0:
            return math.floor(value + 0.5)
        return math.ceil(value - 0.5)

    def _is_number(self, value: Any) -> bool:
        if isinstance(value, (int, float)):
            return True
        if isinstance(value, str):
            try:
                float(value)
                return True
            except ValueError:
                return False
        return False

    def _pick_random_event(self, group_id: str) -> Optional[Dict[str, Any]]:
        if not isinstance(group_id, str) or not group_id:
            return None
        entries = self.event_groups.get(group_id, [])
        if not entries:
            return None
        total_weight = 0
        weights: List[int] = []
        for entry in entries:
            weight = entry.get("weight") if isinstance(entry, dict) else None
            if not isinstance(weight, int) or weight <= 0:
                weight = 1
            weights.append(weight)
            total_weight += weight
        if total_weight <= 0:
            return entries[0]
        roll = random.randint(1, total_weight)
        for entry, weight in zip(entries, weights):
            roll -= weight
            if roll <= 0:
                return entry
        return entries[-1]

    def _get_event_history_list(self, session_state: Dict[str, Any]) -> List[Dict[str, Any]]:
        history = session_state.get("event_history")
        if isinstance(history, list):
            return history
        for alt_key in ("EventHistory", "Eventhsitory"):
            alt = session_state.get(alt_key)
            if isinstance(alt, list):
                session_state["event_history"] = alt
                try:
                    del session_state[alt_key]
                except KeyError:
                    pass
                return alt
        session_state["event_history"] = []
        return session_state["event_history"]

    def evaluate_ready_orders(self, session_state: Dict[str, Any]) -> Dict[str, Any]:
        if not session_state:
            return {"success": False, "message": "No session loaded"}

        bastion = session_state.setdefault("bastion", {})
        facilities = bastion.setdefault("facilities", [])
        evaluated = []
        results = []
        skipped = []

        for facility in facilities:
            if not isinstance(facility, dict):
                continue
            facility_id = facility.get("facility_id")
            orders = list(self._normalize_orders(facility))
            for order in orders:
                if not isinstance(order, dict):
                    continue
                if self._infer_order_status(order) != "ready":
                    continue
                order_def = self._find_order_def(facility_id, order.get("order_id"))
                outcome = order_def.get("outcome") if isinstance(order_def, dict) else {}
                check_profile = outcome.get("check_profile") if isinstance(outcome, dict) else None
                if check_profile and not order.get("roll_locked"):
                    skipped.append({"facility_id": facility_id, "order_id": order.get("order_id"), "reason": "roll_not_locked"})
                    continue
                result = self.evaluate_order(session_state, facility_id, order.get("order_id"))
                if result.get("success"):
                    evaluated.append({"facility_id": facility_id, "order_id": order.get("order_id")})
                    results.append({
                        "facility_id": facility_id,
                        "order_id": order.get("order_id"),
                        "bucket": result.get("bucket"),
                        "roll": result.get("roll"),
                        "entries": result.get("entries", []),
                        "events": result.get("events", []),
                    })
                else:
                    skipped.append({"facility_id": facility_id, "order_id": order.get("order_id"), "reason": result.get("message")})

        return {"success": True, "evaluated": evaluated, "skipped": skipped, "results": results}

    def roll_and_evaluate_ready_orders(self, session_state: Dict[str, Any]) -> Dict[str, Any]:
        """
        Auto-roll (if needed) and evaluate all ready orders.
        """
        if not session_state:
            return {"success": False, "message": "No session loaded"}

        bastion = session_state.setdefault("bastion", {})
        facilities = bastion.setdefault("facilities", [])
        evaluated = []
        results = []
        skipped = []

        for facility in facilities:
            if not isinstance(facility, dict):
                continue
            facility_id = facility.get("facility_id")
            orders = list(self._normalize_orders(facility))
            for order in orders:
                if not isinstance(order, dict):
                    continue
                if self._infer_order_status(order) != "ready":
                    continue
                order_id = order.get("order_id")
                order_def = self._find_order_def(facility_id, order_id)
                outcome = order_def.get("outcome") if isinstance(order_def, dict) else {}
                check_profile = outcome.get("check_profile") if isinstance(outcome, dict) else None

                if check_profile and not order.get("roll_locked"):
                    roll_result = self.lock_order_roll(session_state, facility_id, order_id, None, True)
                    if not roll_result.get("success"):
                        skipped.append({"facility_id": facility_id, "order_id": order_id, "reason": roll_result.get("message")})
                        continue

                result = self.evaluate_order(session_state, facility_id, order_id)
                if result.get("success"):
                    evaluated.append({"facility_id": facility_id, "order_id": order_id})
                    results.append({
                        "facility_id": facility_id,
                        "order_id": order_id,
                        "bucket": result.get("bucket"),
                        "roll": result.get("roll"),
                        "entries": result.get("entries", []),
                        "events": result.get("events", []),
                    })
                else:
                    skipped.append({"facility_id": facility_id, "order_id": order_id, "reason": result.get("message")})

        return {"success": True, "evaluated": evaluated, "skipped": skipped, "results": results}

    def _projected_treasury_base(self, session_state: Dict[str, Any], cost: Dict[str, Any]) -> Optional[int]:
        base = self.ledger.get_treasury_base(session_state)
        if base is None:
            return None
        delta = 0
        for currency, amount in cost.items():
            if currency == "duration_turns":
                continue
            if not isinstance(amount, int):
                return None
            factor = self.ledger.factor_to_base.get(currency)
            if not factor:
                return None
            delta -= amount * factor
        return base + delta

    def _normalize_orders(self, facility_entry: Dict[str, Any]) -> List[Dict[str, Any]]:
        orders = facility_entry.get("current_orders")
        if isinstance(orders, list):
            return orders
        normalized: List[Dict[str, Any]] = []
        current_order = facility_entry.get("current_order")
        if isinstance(current_order, dict):
            normalized.append(current_order)
        facility_entry["current_orders"] = normalized
        return normalized

    def _normalize_upkeep(self, upkeep: Any) -> Optional[Dict[str, int]]:
        if not isinstance(upkeep, dict):
            return None
        normalized: Dict[str, int] = {}
        for currency, amount in upkeep.items():
            if not isinstance(currency, str):
                continue
            if currency not in self.ledger.currency_types:
                return None
            if not isinstance(amount, int):
                return None
            if amount < 0:
                return None
            if amount == 0:
                continue
            normalized[currency] = amount
        return normalized

    def _collect_npc_ids(self, session_state: Dict[str, Any]) -> set:
        ids = set()
        bastion = session_state.get("bastion", {}) if isinstance(session_state, dict) else {}
        facilities = bastion.get("facilities", []) or []
        for facility in facilities:
            if not isinstance(facility, dict):
                continue
            assigned = facility.get("assigned_npcs", [])
            if not isinstance(assigned, list):
                continue
            for npc in assigned:
                if isinstance(npc, dict) and isinstance(npc.get("npc_id"), str):
                    ids.add(npc["npc_id"])
        unassigned = bastion.get("npcs_unassigned", []) or []
        if isinstance(unassigned, list):
            for npc in unassigned:
                if isinstance(npc, dict) and isinstance(npc.get("npc_id"), str):
                    ids.add(npc["npc_id"])
        return ids

    def _generate_npc_id(self, session_state: Dict[str, Any], name: str) -> str:
        base = "".join(ch for ch in (name or "npc") if ch.isalnum() or ch in ["_", "-"]).lower()
        if not base:
            base = "npc"
        existing = self._collect_npc_ids(session_state)
        for _ in range(5):
            candidate = f"{base}_{uuid.uuid4().hex[:8]}"
            if candidate not in existing:
                return candidate
        return f"{base}_{uuid.uuid4().hex}"

    def _assign_npc_to_facility(
        self,
        session_state: Dict[str, Any],
        npc_entry: Dict[str, Any],
        facility_id: str,
        allow_profession_mismatch: bool = True,
    ) -> Optional[str]:
        if not isinstance(facility_id, str) or not facility_id:
            return "Facility id required"
        facility_entry = self._find_facility_entry(session_state, facility_id)
        if not facility_entry:
            return f"Facility not found in bastion: {facility_id}"
        facility_def = self.catalog.get(facility_id)
        if not facility_def:
            return f"Unknown facility_id: {facility_id}"

        npc_slots = facility_def.get("npc_slots")
        if not isinstance(npc_slots, int) or npc_slots <= 0:
            return "Facility has no NPC slots"

        assigned = facility_entry.get("assigned_npcs", [])
        if not isinstance(assigned, list):
            assigned = []
            facility_entry["assigned_npcs"] = assigned
        if len(assigned) >= npc_slots:
            return "No free NPC slots available"

        allowed = facility_def.get("npc_allowed_professions")
        profession = npc_entry.get("profession")
        if (
            not allow_profession_mismatch
            and isinstance(allowed, list)
            and allowed
            and profession not in allowed
        ):
            return "NPC profession not allowed for this facility"

        if any(isinstance(npc, dict) and npc.get("npc_id") == npc_entry.get("npc_id") for npc in assigned):
            return "NPC already assigned to facility"

        assigned.append(npc_entry)
        return None

    def _locate_npc(self, session_state: Dict[str, Any], npc_id: str) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
        bastion = session_state.get("bastion", {}) if isinstance(session_state, dict) else {}
        facilities = bastion.get("facilities", []) or []
        for facility in facilities:
            if not isinstance(facility, dict):
                continue
            assigned = facility.get("assigned_npcs", [])
            if not isinstance(assigned, list):
                continue
            for npc in assigned:
                if isinstance(npc, dict) and npc.get("npc_id") == npc_id:
                    return npc, facility
        unassigned = bastion.get("npcs_unassigned", []) or []
        if isinstance(unassigned, list):
            for npc in unassigned:
                if isinstance(npc, dict) and npc.get("npc_id") == npc_id:
                    return npc, None
        return None, None

    def _remove_npc_from_facility(self, facility_entry: Dict[str, Any], npc_id: str) -> None:
        if not facility_entry or not npc_id:
            return
        assigned = facility_entry.get("assigned_npcs", [])
        if not isinstance(assigned, list):
            return
        for npc in list(assigned):
            if isinstance(npc, dict) and npc.get("npc_id") == npc_id:
                assigned.remove(npc)
                return

    def _remove_npc_from_unassigned(self, session_state: Dict[str, Any], npc_id: str) -> None:
        bastion = session_state.setdefault("bastion", {})
        unassigned = bastion.get("npcs_unassigned", [])
        if not isinstance(unassigned, list):
            return
        for npc in list(unassigned):
            if isinstance(npc, dict) and npc.get("npc_id") == npc_id:
                unassigned.remove(npc)
                return

    def _npc_has_active_order(self, facility_entry: Dict[str, Any], npc_id: str) -> bool:
        if not facility_entry or not npc_id:
            return False
        for order in self._normalize_orders(facility_entry):
            if not isinstance(order, dict):
                continue
            if order.get("npc_id") != npc_id:
                continue
            if self._is_order_active(order):
                return True
        return False

    def _remove_npc_orders(self, facility_entry: Dict[str, Any], npc_id: str) -> int:
        if not facility_entry or not npc_id:
            return 0
        removed = 0
        orders = self._normalize_orders(facility_entry)
        for order in list(orders):
            if not isinstance(order, dict):
                continue
            if order.get("npc_id") != npc_id:
                continue
            if self._is_order_active(order):
                orders.remove(order)
                removed += 1
        current_order = facility_entry.get("current_order")
        if isinstance(current_order, dict) and current_order.get("npc_id") == npc_id and self._is_order_active(current_order):
            facility_entry["current_order"] = None
        return removed

    def _collect_npcs_with_location(self, session_state: Dict[str, Any]) -> List[Tuple[Dict[str, Any], Optional[str]]]:
        results: List[Tuple[Dict[str, Any], Optional[str]]] = []
        bastion = session_state.get("bastion", {}) if isinstance(session_state, dict) else {}
        facilities = bastion.get("facilities", []) or []
        for facility in facilities:
            if not isinstance(facility, dict):
                continue
            facility_id = facility.get("facility_id")
            assigned = facility.get("assigned_npcs", [])
            if isinstance(assigned, list):
                for npc in assigned:
                    if isinstance(npc, dict):
                        results.append((npc, facility_id))
        unassigned = bastion.get("npcs_unassigned", []) or []
        if isinstance(unassigned, list):
            for npc in unassigned:
                if isinstance(npc, dict):
                    results.append((npc, None))
        return results

    def _apply_npc_upkeep(self, session_state: Dict[str, Any], current_turn: int) -> None:
        for npc, facility_id in self._collect_npcs_with_location(session_state):
            upkeep = npc.get("upkeep")
            if not isinstance(upkeep, dict) or not upkeep:
                continue
            effect: Dict[str, int] = {}
            for currency, amount in upkeep.items():
                if not isinstance(amount, int) or amount <= 0:
                    continue
                if currency not in self.ledger.currency_types:
                    continue
                effect[currency] = -amount
            if not effect:
                continue
            npc_name = npc.get("name") or npc.get("npc_id") or "NPC"
            facility_label = facility_id or "Arbeitslos"
            if facility_id:
                facility_def = self.catalog.get(facility_id)
                if isinstance(facility_def, dict) and facility_def.get("name"):
                    facility_label = facility_def.get("name")
            log_text = self._format_upkeep_log(npc_name, effect, facility_label)
            context = {
                "event_type": "npc_upkeep",
                "source_type": "npc",
                "source_id": npc.get("npc_id") or npc_name,
                "action": "upkeep",
                "roll": "-",
                "result": "applied",
                "log_text": log_text,
            }
            self.ledger.apply_effects(session_state, [effect], context)

    def _format_upkeep_log(self, npc_name: str, effect: Dict[str, int], facility_label: str) -> str:
        parts = []
        for currency, amount in effect.items():
            parts.append(f"{abs(amount)} {currency}")
        cost = ", ".join(parts) if parts else "-"
        return f"NPC upkeep: {npc_name} ({facility_label}) -{cost}"

    def _xp_gain_for_order(
        self,
        order_entry: Dict[str, Any],
        order_def: Optional[Dict[str, Any]] = None
    ) -> Tuple[int, int]:
        """
        XP is always awarded, tied to order duration (turns).
        """
        duration = order_entry.get("duration_turns") if isinstance(order_entry, dict) else None
        if not isinstance(duration, int) and isinstance(order_def, dict):
            duration = order_def.get("duration_turns")
        if not isinstance(duration, int) or duration <= 0:
            duration = 1
        base = self.config.get("npc_progression", {}).get("xp_per_success")
        if not isinstance(base, int) or base <= 0:
            base = 1
        return duration * base, duration

    def _award_npc_xp(
        self,
        session_state: Dict[str, Any],
        facility_id: str,
        npc_id: Any,
        xp_gain: int,
        duration_turns: Optional[int] = None
    ) -> None:
        if not npc_id or xp_gain <= 0:
            return
        facility_entry = self._find_facility_entry(session_state, facility_id)
        if not facility_entry:
            return
        assigned = facility_entry.get("assigned_npcs", [])
        if not isinstance(assigned, list):
            return
        npc = next((n for n in assigned if isinstance(n, dict) and n.get("npc_id") == npc_id), None)
        if not npc:
            return
        old_level = npc.get("level", 1)
        try:
            old_level = int(old_level)
        except (TypeError, ValueError):
            old_level = 1
        old_xp = npc.get("xp", 0)
        if not isinstance(old_xp, int):
            old_xp = 0
        new_xp = old_xp + xp_gain
        npc["xp"] = new_xp
        new_level = self._apply_npc_level_up(old_level, new_xp)
        npc["level"] = new_level

        npc_name = npc.get("name") or npc.get("npc_id") or "NPC"
        level_note = f" (Level {old_level}->{new_level})" if new_level != old_level else ""
        duration_note = ""
        if isinstance(duration_turns, int) and duration_turns > 0:
            duration_note = f" ({duration_turns} Turn{'s' if duration_turns != 1 else ''})"
        log_text = f"NPC XP: {npc_name} +{xp_gain}{duration_note}{level_note}"
        self._audit_log.add_entry(
            session_state,
            int(session_state.get("current_turn", 0)),
            "npc_xp",
            "npc",
            npc.get("npc_id") or npc_name,
            "xp_gain",
            "-",
            "success",
            f"xp:+{xp_gain}",
            log_text,
        )

    def _apply_npc_level_up(self, level: int, xp: int) -> int:
        thresholds = self.config.get("npc_progression", {}).get("level_thresholds", {})
        t1 = thresholds.get("apprentice_to_experienced", 5)
        t2 = thresholds.get("experienced_to_master", 10)
        if not isinstance(t1, int):
            t1 = 5
        if not isinstance(t2, int):
            t2 = 10

        new_level = level
        if new_level < 2 and xp >= t1:
            new_level = 2
        if new_level < 3 and xp >= t2:
            new_level = 3
        return new_level

    def _infer_order_status(self, order: Dict[str, Any]) -> str:
        status = order.get("status")
        if isinstance(status, str) and status:
            return status
        progress = order.get("progress")
        duration = order.get("duration_turns")
        if isinstance(progress, int) and isinstance(duration, int) and progress >= duration:
            return "ready"
        return "in_progress"

    def _is_order_active(self, order: Any) -> bool:
        if not isinstance(order, dict):
            return False
        status = self._infer_order_status(order)
        return status in ["in_progress", "ready"]

    def _find_facility_entry(self, session_state: Dict[str, Any], facility_id: str) -> Optional[Dict[str, Any]]:
        bastion = session_state.setdefault("bastion", {})
        facilities = bastion.setdefault("facilities", [])
        return next((f for f in facilities if isinstance(f, dict) and f.get("facility_id") == facility_id), None)

    def _find_order_entry(self, facility_entry: Dict[str, Any], order_id: str) -> Optional[Dict[str, Any]]:
        orders = self._normalize_orders(facility_entry)
        return next((o for o in orders if isinstance(o, dict) and o.get("order_id") == order_id), None)

    def _find_order_def(self, facility_id: str, order_id: str) -> Optional[Dict[str, Any]]:
        facility_def = self.catalog.get(facility_id)
        if not isinstance(facility_def, dict):
            return None
        orders = facility_def.get("orders")
        if not isinstance(orders, list):
            return None
        return next((o for o in orders if isinstance(o, dict) and o.get("id") == order_id), None)

    def _min_remaining_turns(self, orders: List[Dict[str, Any]]) -> Optional[int]:
        remaining = None
        for order in orders:
            duration = order.get("duration_turns")
            progress = order.get("progress", 0)
            if not isinstance(duration, int) or duration <= 0:
                continue
            if not isinstance(progress, int):
                progress = 0
            rem = max(duration - progress, 0)
            remaining = rem if remaining is None else min(remaining, rem)
        return remaining

    def _dice_sides_from_profile(self, check_profile: str) -> Optional[int]:
        return self._get_check_profile_sides(check_profile)

    def _resolve_check_profile(self, check_profile: str, npc_level: Any) -> Optional[Dict[str, Any]]:
        profile = self._get_check_profile(check_profile)
        if not profile:
            return None
        default = profile.get("default")
        if not isinstance(default, dict):
            return None
        level_names = self.config.get("npc_progression", {}).get("level_names", {})
        level_key = None
        if isinstance(npc_level, int):
            level_key = level_names.get(str(npc_level)) or level_names.get(npc_level)
        if not level_key:
            fallback = {1: "apprentice", 2: "experienced", 3: "master"}
            level_key = fallback.get(npc_level, "apprentice")
        override = profile.get(level_key)
        if not isinstance(override, dict):
            override = {}
        merged = {**default, **override}
        return merged

    def _value_set(self, value: Any) -> set:
        if isinstance(value, list):
            return set(v for v in value if isinstance(v, int))
        if isinstance(value, int):
            return {value}
        return set()

    def _determine_outcome(self, check_profile: Any, npc_level: Any, roll: Any) -> str:
        if not check_profile:
            return "on_success"
        profile = self._resolve_check_profile(check_profile, npc_level)
        if not profile or not isinstance(roll, int):
            return "on_failure"

        crit_success = self._value_set(profile.get("crit_success"))
        crit_fail = self._value_set(profile.get("crit_fail"))
        if roll in crit_success:
            return "on_critical_success"
        if roll in crit_fail:
            return "on_critical_failure"

        dc = profile.get("dc")
        if isinstance(dc, int) and roll >= dc:
            return "on_success"
        return "on_failure"

    def _get_effects_for_bucket(self, outcome: Dict[str, Any], bucket: str) -> List[Dict[str, Any]]:
        if not isinstance(outcome, dict):
            return []
        block = outcome.get(bucket)
        if not isinstance(block, dict):
            if bucket == "on_critical_success":
                block = outcome.get("on_success")
            elif bucket == "on_critical_failure":
                block = outcome.get("on_failure")
        if not isinstance(block, dict):
            return []
        effects = block.get("effects")
        return effects if isinstance(effects, list) else []

    def _find_upgrade_target(self, facility_id: str) -> Optional[Dict[str, Any]]:
        for facility in self.catalog.values():
            if not isinstance(facility, dict):
                continue
            if facility.get("parent") == facility_id:
                return facility
        return None

    def _get_upgrade_defaults(self, current_tier: Any) -> Optional[Dict[str, Any]]:
        if not isinstance(current_tier, int):
            return None
        defaults = self.config.get("default_build_costs", {})
        return defaults.get(f"upgrade_tier_{current_tier}")

    def _cost_to_effects(self, cost: Dict[str, Any]) -> List[Dict[str, Any]]:
        effect: Dict[str, Any] = {}
        for currency, amount in cost.items():
            if currency == "duration_turns":
                continue
            if isinstance(amount, int):
                effect[currency] = -amount
        return [effect]

    def _sum_facility_chain_costs(self, facility_id: str, extra_target: Optional[str] = None) -> Dict[str, int]:
        chain = self._collect_facility_chain(facility_id)
        if extra_target:
            target_def = self.catalog.get(extra_target)
            if isinstance(target_def, dict):
                chain.append(target_def)
        total: Dict[str, int] = {}
        prev_tier: Optional[int] = None
        for idx, facility in enumerate(chain):
            if not isinstance(facility, dict):
                continue
            cost = self._get_facility_cost_for_chain(facility, idx == 0, prev_tier)
            for currency, amount in cost.items():
                if not isinstance(amount, int):
                    continue
                total[currency] = total.get(currency, 0) + amount
            prev_tier = facility.get("tier") if isinstance(facility.get("tier"), int) else prev_tier
        return total

    def _collect_facility_chain(self, facility_id: str) -> List[Dict[str, Any]]:
        chain: List[Dict[str, Any]] = []
        seen = set()
        current_id = facility_id
        while current_id and current_id not in seen:
            seen.add(current_id)
            facility = self.catalog.get(current_id)
            if not isinstance(facility, dict):
                break
            chain.append(facility)
            current_id = facility.get("parent")
        chain.reverse()
        return chain

    def _get_facility_cost_for_chain(self, facility: Dict[str, Any], is_base: bool, prev_tier: Optional[int]) -> Dict[str, int]:
        build = facility.get("build", {}) if isinstance(facility.get("build"), dict) else {}
        cost = build.get("cost") if isinstance(build.get("cost"), dict) else None
        if isinstance(cost, dict):
            return {k: v for k, v in cost.items() if isinstance(v, int)}

        defaults = self.config.get("default_build_costs", {})
        if is_base:
            base_defaults = defaults.get("new_facility", {})
            if isinstance(base_defaults, dict):
                return {k: v for k, v in base_defaults.items() if k != "duration_turns" and isinstance(v, int)}
            return {}
        if isinstance(prev_tier, int):
            upgrade_defaults = defaults.get(f"upgrade_tier_{prev_tier}", {})
            if isinstance(upgrade_defaults, dict):
                return {k: v for k, v in upgrade_defaults.items() if k != "duration_turns" and isinstance(v, int)}
        return {}
