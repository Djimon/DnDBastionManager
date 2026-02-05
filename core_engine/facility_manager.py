import json
import random
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .logger import setup_logger
from .ledger import Ledger

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

    def add_build_facility(self, session_state: Dict[str, Any], facility_id: str, allow_negative: bool = False) -> Dict[str, Any]:
        if not session_state:
            return {"success": False, "message": "No session loaded"}

        facility_def = self.catalog.get(facility_id)
        if not facility_def:
            return {"success": False, "message": f"Unknown facility_id: {facility_id}"}

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

        bastion = session_state.setdefault("bastion", {})
        facilities = bastion.setdefault("facilities", [])
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

    def advance_turn(self, session_state: Dict[str, Any]) -> Dict[str, Any]:
        if not session_state:
            return {"success": False, "message": "No session loaded"}

        session_state["current_turn"] = int(session_state.get("current_turn", 0)) + 1
        current_turn = session_state["current_turn"]

        bastion = session_state.setdefault("bastion", {})
        facilities = bastion.setdefault("facilities", [])
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

        npc_level = order_entry.get("npc_level")
        result_bucket = self._determine_outcome(check_profile, npc_level, roll)
        effects = self._get_effects_for_bucket(outcome, result_bucket)

        context = {
            "event_type": "order_resolve",
            "source_type": "facility",
            "source_id": facility_id,
            "action": order_id,
            "roll": "-" if roll is None else str(roll),
            "result": result_bucket.replace("on_", ""),
        }
        ledger_result = self.ledger.apply_effects(session_state, effects, context)

        current_orders = self._normalize_orders(facility_entry)
        if order_entry in current_orders:
            current_orders.remove(order_entry)

        return {
            "success": ledger_result.get("success", False),
            "message": "Order evaluated",
            "bucket": result_bucket,
            "entries": ledger_result.get("entries", []),
        }

    def evaluate_ready_orders(self, session_state: Dict[str, Any]) -> Dict[str, Any]:
        if not session_state:
            return {"success": False, "message": "No session loaded"}

        bastion = session_state.setdefault("bastion", {})
        facilities = bastion.setdefault("facilities", [])
        evaluated = []
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
                else:
                    skipped.append({"facility_id": facility_id, "order_id": order.get("order_id"), "reason": result.get("message")})

        return {"success": True, "evaluated": evaluated, "skipped": skipped}

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

    def _dice_sides_from_profile(self, check_profile: str) -> int:
        if not isinstance(check_profile, str) or not check_profile.startswith("d"):
            return 20
        digits = ""
        for ch in check_profile[1:]:
            if ch.isdigit():
                digits += ch
            else:
                break
        try:
            return int(digits) if digits else 20
        except ValueError:
            return 20

    def _resolve_check_profile(self, check_profile: str, npc_level: Any) -> Optional[Dict[str, Any]]:
        profiles = self.config.get("check_profiles", {})
        profile = profiles.get(check_profile)
        if not isinstance(profile, dict):
            return None
        level_names = self.config.get("npc_progression", {}).get("level_names", {})
        level_key = None
        if isinstance(npc_level, int):
            level_key = level_names.get(str(npc_level)) or level_names.get(npc_level)
        if not level_key:
            fallback = {1: "apprentice", 2: "experienced", 3: "master"}
            level_key = fallback.get(npc_level, "apprentice")
        return profile.get(level_key)

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
