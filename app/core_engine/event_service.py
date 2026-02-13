import random
from typing import Any, Dict, List, Optional


class EventService:
    def __init__(
        self,
        event_index: Dict[str, Dict[str, Any]],
        event_groups: Dict[str, List[Dict[str, Any]]],
        audit_log: Any,
        logger: Any,
    ) -> None:
        self._event_index = event_index
        self._event_groups = event_groups
        self._audit_log = audit_log
        self._logger = logger

    def resolve_event_effects(
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
                entry = self._event_index.get(event_id)
                if entry:
                    events.append({"turn": turn, "event_id": event_id, "text": entry.get("text", "")})
                else:
                    self._logger.warning(f"Event id not found: {event_id}")

            random_ref = effect.get("random_event")
            if isinstance(random_ref, str) and random_ref:
                if random_ref.startswith("group:"):
                    group_id = random_ref[len("group:"):]
                    picked = self._pick_random_event(group_id)
                    if picked:
                        events.append({"turn": turn, "event_id": picked.get("id", ""), "text": picked.get("text", "")})
                    else:
                        self._logger.warning(f"Random event group empty or missing: {group_id}")
                else:
                    entry = self._event_index.get(random_ref)
                    if entry:
                        events.append({"turn": turn, "event_id": random_ref, "text": entry.get("text", "")})
                    else:
                        self._logger.warning(f"Random event ref not found: {random_ref}")

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

    def _pick_random_event(self, group_id: str) -> Optional[Dict[str, Any]]:
        if not isinstance(group_id, str) or not group_id:
            return None
        entries = self._event_groups.get(group_id, [])
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
