from typing import Any, Dict, List, Optional

from .logger import setup_logger

logger = setup_logger("audit_log")


class AuditLog:
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
        logger.info(f"AuditLog: T{turn} {event_type} {source_type}:{source_id} {action} {result}")
