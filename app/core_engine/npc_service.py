import uuid
from typing import Any, Dict, List, Optional, Tuple


class NpcService:
    def __init__(
        self,
        ledger: Any,
        catalog: Dict[str, Any],
        config: Dict[str, Any],
        audit_log: Any,
        normalize_upkeep: Any,
        normalize_orders: Any,
        is_order_active: Any,
        find_facility_entry: Any,
    ) -> None:
        self._ledger = ledger
        self._catalog = catalog
        self._config = config
        self._audit_log = audit_log
        self._normalize_upkeep = normalize_upkeep
        self._normalize_orders = normalize_orders
        self._is_order_active = is_order_active
        self._find_facility_entry = find_facility_entry

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
            facility_def = self._catalog.get(facility_id)
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

    def apply_npc_upkeep(self, session_state: Dict[str, Any], current_turn: int) -> None:
        for npc, facility_id in self._collect_npcs_with_location(session_state):
            upkeep = npc.get("upkeep")
            if not isinstance(upkeep, dict) or not upkeep:
                continue
            effect: Dict[str, int] = {}
            for currency, amount in upkeep.items():
                if not isinstance(amount, int) or amount <= 0:
                    continue
                if currency not in self._ledger.currency_types:
                    continue
                effect[currency] = -amount
            if not effect:
                continue
            npc_name = npc.get("name") or npc.get("npc_id") or "NPC"
            facility_label = facility_id or "Arbeitslos"
            if facility_id:
                facility_def = self._catalog.get(facility_id)
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
            self._ledger.apply_effects(session_state, [effect], context)

    def xp_gain_for_order(
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
        base = self._config.get("npc_progression", {}).get("xp_per_success")
        if not isinstance(base, int) or base <= 0:
            base = 1
        return duration * base, duration

    def award_npc_xp(
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
        new_level = self.apply_npc_level_up(old_level, new_xp)
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

    def apply_npc_level_up(self, level: int, xp: int) -> int:
        thresholds = self._config.get("npc_progression", {}).get("level_thresholds", {})
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
        facility_def = self._catalog.get(facility_id)
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

    def _format_upkeep_log(self, npc_name: str, effect: Dict[str, int], facility_label: str) -> str:
        parts = []
        for currency, amount in effect.items():
            parts.append(f"{abs(amount)} {currency}")
        cost = ", ".join(parts) if parts else "-"
        return f"NPC upkeep: {npc_name} ({facility_label}) -{cost}"
