import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .logger import setup_logger
from .ledger import Ledger
from .audit_log import AuditLog
from .facility_helpers import value_set
from .formula_engine import FormulaEngine
from .event_service import EventService
from .npc_service import NpcService
from .order_engine import OrderEngine
from .facility_lifecycle import FacilityLifecycle

logger = setup_logger("facility_manager")


class FacilityManager:
    def __init__(self, root_dir: Path, ledger: Ledger, config_manager: Optional[Any] = None):
        self.root_dir = root_dir
        self.ledger = ledger
        self._config_manager = config_manager
        self.facilities_dir = root_dir / "data" / "facilities"
        self.custom_packs_dir = root_dir / "custom_packs"
        self.config_path = root_dir / "data" / "config" / "bastion_config.json"
        self.config = self._load_config()
        self.catalog = self._load_facility_catalog()
        self.event_index, self.event_groups = self._load_event_tables()
        self.formula_index = self._load_formula_engines()
        self._audit_log = AuditLog(self._config_manager)
        self._formula_engine = FormulaEngine(
            self.ledger,
            self._get_internal_int_setting,
            self._get_check_profile_sides,
        )
        self._event_service = EventService(
            self.event_index,
            self.event_groups,
            self._audit_log,
            logger,
        )
        self._npc_service = NpcService(
            self.ledger,
            self.catalog,
            self.config,
            self._audit_log,
            self._normalize_upkeep,
            self._normalize_orders,
            self._is_order_active,
            self._find_facility_entry,
        )
        self._order_engine = OrderEngine(
            self.ledger,
            self.catalog,
            self._formula_engine,
            self._event_service,
            self._npc_service,
            self.formula_index,
            self._normalize_orders,
            self._find_facility_entry,
            self._find_order_entry,
            self._find_order_def,
            self._infer_order_status,
            self._is_order_active,
            self._resolve_check_profile,
            self._dice_sides_from_profile,
            self._determine_outcome,
            self._get_effects_for_bucket,
        )
        self._facility_lifecycle = FacilityLifecycle(
            self.ledger,
            self.catalog,
            self.config,
            self._get_internal_float_setting,
            self._npc_service,
            self._normalize_orders,
            self._infer_order_status,
            self._is_order_active,
            self._min_remaining_turns,
        )

    def _load_config(self) -> Dict[str, Any]:
        try:
            if self._config_manager:
                return self._config_manager.get_config()
            return json.loads(self.config_path.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning(f"Failed to load bastion_config.json: {e}")
            return {}

    def reload_config(self) -> None:
        self.config = self._load_config()
        if hasattr(self, "_npc_service"):
            self._npc_service._config = self.config
        if hasattr(self, "_facility_lifecycle"):
            self._facility_lifecycle._config = self.config

    def _get_internal_int_setting(self, key: str, default: int) -> int:
        if not isinstance(self.config, dict):
            return default
        internal = self.config.get("internal_settings")
        if not isinstance(internal, dict):
            return default
        value = internal.get(key)
        if isinstance(value, int) and value > 0:
            return value
        return default

    def _get_internal_float_setting(self, key: str, default: float) -> float:
        if not isinstance(self.config, dict):
            return default
        internal = self.config.get("internal_settings")
        if not isinstance(internal, dict):
            return default
        value = internal.get(key)
        if isinstance(value, (int, float)) and not isinstance(value, bool) and value >= 0:
            return float(value)
        return default

    def _get_facility_owner_limit(self) -> int:
        if not isinstance(self.config, dict):
            return 3
        value = self.config.get("facility_owner_limit")
        if isinstance(value, int) and value > 0:
            return value
        return 3

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
        return self._facility_lifecycle.add_build_facility(session_state, facility_id, allow_negative)

    def add_upgrade_facility(self, session_state: Dict[str, Any], facility_id: str, allow_negative: bool = False) -> Dict[str, Any]:
        return self._facility_lifecycle.add_upgrade_facility(session_state, facility_id, allow_negative)

    def demolish_facility(self, session_state: Dict[str, Any], facility_id: str) -> Dict[str, Any]:
        return self._facility_lifecycle.demolish_facility(session_state, facility_id)

    def set_facility_owner(self, session_state: Dict[str, Any], facility_id: str, player_id: str) -> Dict[str, Any]:
        if not session_state:
            return {"success": False, "message": "No session loaded"}
        if not facility_id:
            return {"success": False, "message": "Missing facility_id"}
        if not isinstance(player_id, str) or not player_id.strip():
            return {"success": False, "message": "Missing player_id"}

        facility_entry = self._find_facility_entry(session_state, facility_id)
        if not facility_entry:
            return {"success": False, "message": f"Facility not found in bastion: {facility_id}"}

        players = session_state.get("players")
        if not isinstance(players, list):
            return {"success": False, "message": "No players available"}
        owner = next((p for p in players if isinstance(p, dict) and p.get("player_id") == player_id), None)
        if not owner:
            return {"success": False, "message": "Player not found"}

        limit = self._get_facility_owner_limit()
        current_owner = facility_entry.get("owner_player_id")
        if current_owner != player_id:
            facilities = session_state.get("bastion", {}).get("facilities", [])
            count = len([f for f in facilities if isinstance(f, dict) and f.get("owner_player_id") == player_id])
            if count >= limit:
                return {"success": False, "message": f"Owner limit reached ({limit})"}

        facility_entry["owner_player_id"] = player_id
        return {"success": True, "message": "Owner updated", "facility": facility_entry}

    def advance_turn(self, session_state: Dict[str, Any]) -> Dict[str, Any]:
        return self._facility_lifecycle.advance_turn(session_state)

    def resolve_facility_states(self, session_state: Dict[str, Any]) -> List[Dict[str, Any]]:
        return self._facility_lifecycle.resolve_facility_states(session_state)

    def hire_npc(
        self,
        session_state: Dict[str, Any],
        name: str,
        profession: str,
        level: Any,
        upkeep: Dict[str, Any],
        facility_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        return self._npc_service.hire_npc(
            session_state,
            name,
            profession,
            level,
            upkeep,
            facility_id,
        )

    def move_npc(
        self,
        session_state: Dict[str, Any],
        npc_id: str,
        target_facility_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        return self._npc_service.move_npc(session_state, npc_id, target_facility_id)

    def fire_npc(self, session_state: Dict[str, Any], npc_id: str) -> Dict[str, Any]:
        return self._npc_service.fire_npc(session_state, npc_id)

    def start_order(self, session_state: Dict[str, Any], facility_id: str, npc_id: str, order_id: str) -> Dict[str, Any]:
        return self._order_engine.start_order(session_state, facility_id, npc_id, order_id)

    def lock_order_roll(self, session_state: Dict[str, Any], facility_id: str, order_id: str, roll_value: Optional[int] = None, auto: bool = False) -> Dict[str, Any]:
        return self._order_engine.lock_order_roll(session_state, facility_id, order_id, roll_value, auto)

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
        return self._order_engine.evaluate_order(session_state, facility_id, order_id)

    def _resolve_event_effects(
        self,
        session_state: Dict[str, Any],
        effects: List[Dict[str, Any]],
        facility_id: Optional[str],
        order_id: Optional[str],
        roll: Optional[int],
    ) -> List[Dict[str, Any]]:
        return self._event_service.resolve_event_effects(
            session_state,
            effects,
            facility_id,
            order_id,
            roll,
        )

    def _expand_formula_triggers(
        self,
        session_state: Dict[str, Any],
        effects: List[Dict[str, Any]],
        facility_id: Optional[str],
        order_id: Optional[str],
        order_entry: Optional[Dict[str, Any]] = None,
    ) -> Tuple[List[Dict[str, Any]], List[str]]:
        return self._formula_engine._expand_formula_triggers(
            self.formula_index,
            session_state,
            effects,
            facility_id,
            order_id,
            order_entry,
        )

    def _normalize_formula_source(self, source: Any) -> Optional[str]:
        return self._formula_engine._normalize_formula_source(source)

    def _is_formula_user_input_source(self, source: Any) -> bool:
        return self._formula_engine._is_formula_user_input_source(source)

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

    def evaluate_ready_orders(self, session_state: Dict[str, Any]) -> Dict[str, Any]:
        return self._order_engine.evaluate_ready_orders(session_state)

    def roll_and_evaluate_ready_orders(self, session_state: Dict[str, Any]) -> Dict[str, Any]:
        """
        Auto-roll (if needed) and evaluate all ready orders.
        """
        return self._order_engine.roll_and_evaluate_ready_orders(session_state)

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

    def _apply_npc_upkeep(self, session_state: Dict[str, Any], current_turn: int) -> None:
        self._npc_service.apply_npc_upkeep(session_state, current_turn)

    def _xp_gain_for_order(
        self,
        order_entry: Dict[str, Any],
        order_def: Optional[Dict[str, Any]] = None
    ) -> Tuple[int, int]:
        return self._npc_service.xp_gain_for_order(order_entry, order_def)

    def _award_npc_xp(
        self,
        session_state: Dict[str, Any],
        facility_id: str,
        npc_id: Any,
        xp_gain: int,
        duration_turns: Optional[int] = None
    ) -> None:
        self._npc_service.award_npc_xp(
            session_state,
            facility_id,
            npc_id,
            xp_gain,
            duration_turns,
        )

    def _apply_npc_level_up(self, level: int, xp: int) -> int:
        return self._npc_service.apply_npc_level_up(level, xp)

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

    def _determine_outcome(self, check_profile: Any, npc_level: Any, roll: Any) -> str:
        if not check_profile:
            return "on_success"
        profile = self._resolve_check_profile(check_profile, npc_level)
        if not profile or not isinstance(roll, int):
            return "on_failure"

        crit_success = value_set(profile.get("crit_success"))
        crit_fail = value_set(profile.get("crit_fail"))
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
