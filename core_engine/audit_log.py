from typing import Any, Dict, List, Optional

from .logger import setup_logger

logger = setup_logger("audit_log")


class AuditLog:
    def __init__(self, config_manager: Optional[Any] = None):
        self._config_manager = config_manager

    def add_entry_from_event(self, session_state: Dict[str, Any], event: Dict[str, Any]) -> None:
        if not isinstance(event, dict):
            return
        turn = int(event.get("turn", session_state.get("current_turn", 0)))
        event_type = event.get("event_type", "custom")
        source_type = event.get("source_type", "system")
        source_id = event.get("source_id", "*")
        action = event.get("action", "-")
        roll = event.get("roll", "-")
        result = event.get("result", "-")
        changes = event.get("changes", "")
        log_text = event.get("log_text", "")
        self.add_entry(
            session_state,
            turn,
            event_type,
            source_type,
            source_id,
            action,
            roll,
            result,
            changes,
            log_text,
        )

    def add_entry(
        self,
        session_state: Dict[str, Any],
        turn: int,
        event_type: str,
        source_type: str,
        source_id: str,
        action: str,
        roll: Optional[str],
        result: str,
        changes: str,
        log_text: str,
    ) -> None:
        if not session_state:
            return

        entries = session_state.setdefault("audit_log", [])
        entry = {
            "turn": turn,
            "event_type": event_type,
            "source_type": source_type,
            "source_id": source_id,
            "action": action,
            "roll": roll or "-",
            "result": result,
            "changes": changes,
            "log_text": log_text,
        }
        entries.append(entry)
        self._trim_entries(entries)
        logger.info(f"AuditLog: T{turn} {event_type} {source_type}:{source_id} {action} {result}")

    def _get_keep_turns(self, default: int = 2) -> int:
        if not self._config_manager:
            return default
        try:
            config = self._config_manager.get_config()
        except Exception:
            return default
        if not isinstance(config, dict):
            return default
        internal = config.get("internal_settings")
        if not isinstance(internal, dict):
            return default
        value = internal.get("audit_log_keep_turns")
        if isinstance(value, int) and value >= 0:
            return value
        return default

    def _trim_entries(self, entries: List[Dict[str, Any]]) -> None:
        if not entries:
            return
        turns = [e.get("turn") for e in entries if isinstance(e, dict) and isinstance(e.get("turn"), int)]
        if not turns:
            return
        max_turn = max(turns)
        keep_turns = self._get_keep_turns()
        min_turn = max_turn - keep_turns
        filtered = [e for e in entries if isinstance(e, dict) and isinstance(e.get("turn"), int) and e.get("turn") >= min_turn]
        entries[:] = filtered
