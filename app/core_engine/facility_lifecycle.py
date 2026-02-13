from typing import Any, Dict, List, Optional


class FacilityLifecycle:
    def __init__(
        self,
        ledger: Any,
        catalog: Dict[str, Any],
        config: Dict[str, Any],
        get_internal_float_setting: Any,
        npc_service: Any,
        normalize_orders: Any,
        infer_order_status: Any,
        is_order_active: Any,
        min_remaining_turns: Any,
    ) -> None:
        self._ledger = ledger
        self._catalog = catalog
        self._config = config
        self._get_internal_float_setting = get_internal_float_setting
        self._npc_service = npc_service
        self._normalize_orders = normalize_orders
        self._infer_order_status = infer_order_status
        self._is_order_active = is_order_active
        self._min_remaining_turns = min_remaining_turns

    def add_build_facility(self, session_state: Dict[str, Any], facility_id: str, allow_negative: bool = False) -> Dict[str, Any]:
        if not session_state:
            return {"success": False, "message": "No session loaded"}

        facility_def = self._catalog.get(facility_id)
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
            defaults = self._config.get("default_build_costs", {}).get("new_facility", {})
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
        self._ledger.apply_effects(session_state, effects, context)

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

        current_def = self._catalog.get(facility_id)
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
        self._ledger.apply_effects(session_state, effects, context)

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
        refund_ratio = self._get_internal_float_setting("facility_refund_ratio", 0.3)
        for currency, amount in total_cost.items():
            if isinstance(amount, int) and amount > 0:
                refund_amount = int(amount * refund_ratio)
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
        self._ledger.apply_effects(session_state, effects, context)

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

        self._npc_service.apply_npc_upkeep(session_state, current_turn)

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
            facility_def = self._catalog.get(facility_id) if isinstance(facility_id, str) else None
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

    def _projected_treasury_base(self, session_state: Dict[str, Any], cost: Dict[str, Any]) -> Optional[float]:
        base = self._ledger.get_treasury_base(session_state)
        if base is None:
            return None
        delta = 0
        for currency, amount in cost.items():
            if currency == "duration_turns":
                continue
            if not isinstance(amount, int):
                return None
            factor = self._ledger.factor_to_base.get(currency)
            if not factor:
                return None
            delta -= amount * factor
        return base + delta

    def _find_upgrade_target(self, facility_id: str) -> Optional[Dict[str, Any]]:
        for facility in self._catalog.values():
            if not isinstance(facility, dict):
                continue
            if facility.get("parent") == facility_id:
                return facility
        return None

    def _get_upgrade_defaults(self, current_tier: Any) -> Optional[Dict[str, Any]]:
        if not isinstance(current_tier, int):
            return None
        defaults = self._config.get("default_build_costs", {})
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
            target_def = self._catalog.get(extra_target)
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
            facility = self._catalog.get(current_id)
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

        defaults = self._config.get("default_build_costs", {})
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
