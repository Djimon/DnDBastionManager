import random
from typing import Any, Dict, List, Optional


class OrderEngine:
    def __init__(
        self,
        ledger: Any,
        catalog: Dict[str, Any],
        formula_engine: Any,
        event_service: Any,
        npc_service: Any,
        formula_index: Dict[str, Any],
        normalize_orders: Any,
        find_facility_entry: Any,
        find_order_entry: Any,
        find_order_def: Any,
        infer_order_status: Any,
        is_order_active: Any,
        resolve_check_profile: Any,
        dice_sides_from_profile: Any,
        determine_outcome: Any,
        get_effects_for_bucket: Any,
    ) -> None:
        self._ledger = ledger
        self._catalog = catalog
        self._formula_engine = formula_engine
        self._event_service = event_service
        self._npc_service = npc_service
        self._formula_index = formula_index
        self._normalize_orders = normalize_orders
        self._find_facility_entry = find_facility_entry
        self._find_order_entry = find_order_entry
        self._find_order_def = find_order_def
        self._infer_order_status = infer_order_status
        self._is_order_active = is_order_active
        self._resolve_check_profile = resolve_check_profile
        self._dice_sides_from_profile = dice_sides_from_profile
        self._determine_outcome = determine_outcome
        self._get_effects_for_bucket = get_effects_for_bucket

    def start_order(self, session_state: Dict[str, Any], facility_id: str, npc_id: str, order_id: str) -> Dict[str, Any]:
        if not session_state:
            return {"success": False, "message": "No session loaded"}
        if not facility_id or not npc_id or not order_id:
            return {"success": False, "message": "Missing facility, npc or order id"}

        facility_entry = self._find_facility_entry(session_state, facility_id)
        if not facility_entry:
            return {"success": False, "message": f"Facility not found in bastion: {facility_id}"}

        owner_id = facility_entry.get("owner_player_id")
        if not isinstance(owner_id, str) or not owner_id.strip():
            return {"success": False, "message": "Facility has no owner"}
        players = session_state.get("players", [])
        if not isinstance(players, list) or not any(isinstance(p, dict) and p.get("player_id") == owner_id for p in players):
            return {"success": False, "message": "Facility owner not found"}

        build_status = facility_entry.get("build_status", {})
        status = build_status.get("status") if isinstance(build_status, dict) else None
        if status in ["building", "upgrading"]:
            return {"success": False, "message": f"Facility is not ready (status: {status})"}

        facility_def = self._catalog.get(facility_id)
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

    def lock_order_roll(
        self,
        session_state: Dict[str, Any],
        facility_id: str,
        order_id: str,
        roll_value: Optional[int] = None,
        auto: bool = False,
    ) -> Dict[str, Any]:
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
        effects, formula_errors = self._formula_engine._expand_formula_triggers(
            self._formula_index,
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
        events = self._event_service.resolve_event_effects(session_state, effects, facility_id, order_id, roll)
        ledger_result = self._ledger.apply_effects(session_state, effects, context)

        xp_gain, duration_turns = self._npc_service.xp_gain_for_order(order_entry, order_def)
        if xp_gain > 0:
            self._npc_service.award_npc_xp(session_state, facility_id, order_entry.get("npc_id"), xp_gain, duration_turns)

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
