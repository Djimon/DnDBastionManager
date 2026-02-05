import webview
import json
import os
from pathlib import Path
from core_engine.session_manager import SessionManager
from core_engine.initial_state import InitialStateGenerator
from core_engine.ledger import Ledger
from core_engine.facility_manager import FacilityManager
from core_engine.stats_registry import StatsRegistryLoader
from core_engine.audit_log import AuditLog
from core_engine.logger import setup_logger
from core_engine.pack_validator import PackValidator

# Initialisiere Logger
logger = setup_logger("app")

class Api:
    """API für die Kommunikation zwischen Frontend und Backend"""
    
    def __init__(self):
        logger.info("Initializing Api...")
        self.data_dir = str(Path(__file__).parent / "core" / "facilities")
        self.custom_dir = str(Path(__file__).parent / "custom_packs")
        self.sessions_dir = str(Path(__file__).parent / "sessions")
        
        # Slice 1: Session Management
        # WICHTIG: Nicht als self.xxx speichern - pywebview kann Path-Objekte nicht serialisieren!
        self._session_manager = SessionManager(self.sessions_dir)
        self._initial_state_gen = InitialStateGenerator()
        self._ledger = Ledger(Path(__file__).parent)
        self._stats_registry = StatsRegistryLoader(Path(__file__).parent)
        self._facility_manager = FacilityManager(Path(__file__).parent, self._ledger)
        self._pack_validator = PackValidator(Path(__file__).parent)
        self._audit_log = AuditLog()
        
        # Current loaded session (in-memory)
        self.current_session = None
        logger.info("Api initialized successfully")
    
    # ===== SLICE 1: SESSION LIFECYCLE =====
    
    def create_session(self, session_name: str, bastion_name: str, bastion_location: str, 
                      bastion_description: str, dm_name: str, players: list) -> dict:
        """
        Erstelle eine neue Session (Wizard Step 1).
        
        Returns:
            {success: bool, message: str, session_state: dict or None}
        """
        try:
            logger.info(f"Creating session: {session_name} (Bastion: {bastion_name}, DM: {dm_name}, Players: {len(players)})")
            
            # Generiere Initial State
            # Registriere Custom Stats aus Packs
            state = self._initial_state_gen.generate_session_state(
                session_name=session_name,
                bastion_name=bastion_name,
                bastion_location=bastion_location,
                bastion_description=bastion_description,
                dm_name=dm_name,
                players=players
            )
            self._stats_registry.apply_to_session(state)
            logger.debug(f"Generated state with session_id: {state.get('session_id')}")
            
            # Validiere State
            is_valid, errors = self._initial_state_gen.validate_initial_state(state)
            if not is_valid:
                logger.error(f"State validation failed: {errors}")
                return {
                    "success": False,
                    "message": f"Invalid state: {', '.join(errors)}",
                    "session_state": None
                }
            
            # Speichere Session
            success, message = self._session_manager.create_session(state)
            logger.info(f"Session save result: {success} - {message}")
            
            # Lade Session in Memory
            if success:
                self.current_session = state
                logger.info("Session loaded into memory")
            
            return {
                "success": success,
                "message": message,
                "session_state": state if success else None
            }
        
        except Exception as e:
            return {
                "success": False,
                "message": f"Error creating session: {str(e)}",
                "session_state": None
            }
    
    def save_session(self, session_state: dict = None) -> dict:
        """
        Speichere die aktuelle Session (oder übergebene Session).
        
        Returns:
            {success: bool, message: str}
        """
        try:
            state_to_save = session_state or self.current_session
            
            if not state_to_save:
                return {"success": False, "message": "No session to save"}
            
            success, message = self._session_manager.create_session(state_to_save)
            return {"success": success, "message": message}
        
        except Exception as e:
            return {"success": False, "message": f"Error saving session: {str(e)}"}
    
    def load_session(self, filename: str) -> dict:
        """
        Lade eine Session aus Datei.
        
        Returns:
            {success: bool, message: str, session_state: dict or None}
        """
        try:
            success, session_state, message = self._session_manager.load_session(filename)
            
            if success:
                self.current_session = session_state
                self._stats_registry.apply_to_session(self.current_session)
            
            return {
                "success": success,
                "message": message,
                "session_state": session_state
            }
        
        except Exception as e:
            return {
                "success": False,
                "message": f"Error loading session: {str(e)}",
                "session_state": None
            }
    
    def list_sessions(self) -> dict:
        """
        Liste alle verfügbaren Sessions auf.
        
        Returns:
            {success: bool, sessions: list, message: str}
        """
        try:
            success, sessions, message = self._session_manager.list_sessions()
            return {
                "success": success,
                "sessions": sessions,
                "message": message
            }
        
        except Exception as e:
            return {
                "success": False,
                "sessions": [],
                "message": f"Error listing sessions: {str(e)}"
            }
    
    def apply_effects(self, effects: list, context: dict = None) -> dict:
        """
        Apply ledger effects to current session.

        Returns:
            {success: bool, errors: list, entries: list, session_state: dict}
        """
        try:
            if not self.current_session:
                return {"success": False, "errors": ["No session loaded"], "entries": []}
            result = self._ledger.apply_effects(self.current_session, effects, context)
            return result
        except Exception as e:
            return {"success": False, "errors": [str(e)], "entries": []}

    def add_audit_entry(self, event: dict) -> dict:
        """
        Add a custom audit log entry.

        event fields: turn, event_type, source_type, source_id, action, roll, result, changes, log_text
        """
        try:
            if not self.current_session:
                return {"success": False, "message": "No session loaded"}
            self._audit_log.add_entry_from_event(self.current_session, event or {})
            return {"success": True}
        except Exception as e:
            return {"success": False, "message": str(e)}

    def add_build_facility(self, facility_id: str, allow_negative: bool = False) -> dict:
        """Start building a facility by id."""
        try:
            if not self.current_session:
                return {"success": False, "message": "No session loaded"}
            return self._facility_manager.add_build_facility(self.current_session, facility_id, allow_negative)
        except Exception as e:
            return {"success": False, "message": str(e)}

    def add_upgrade_facility(self, facility_id: str, allow_negative: bool = False) -> dict:
        """Start upgrading a facility by id."""
        try:
            if not self.current_session:
                return {"success": False, "message": "No session loaded"}
            return self._facility_manager.add_upgrade_facility(self.current_session, facility_id, allow_negative)
        except Exception as e:
            return {"success": False, "message": str(e)}

    def get_facility_states(self) -> dict:
        """Return resolved facility states."""
        try:
            if not self.current_session:
                return {"success": False, "message": "No session loaded", "states": []}
            states = self._facility_manager.resolve_facility_states(self.current_session)
            return {"success": True, "states": states}
        except Exception as e:
            return {"success": False, "message": str(e), "states": []}

    def advance_turn(self) -> dict:
        """Advance turn and resolve build/upgrade completion."""
        try:
            if not self.current_session:
                return {"success": False, "message": "No session loaded"}
            return self._facility_manager.advance_turn(self.current_session)
        except Exception as e:
            return {"success": False, "message": str(e)}

    def start_order(self, facility_id: str, npc_id: str, order_id: str) -> dict:
        """Start an order for a specific NPC in a facility."""
        try:
            if not self.current_session:
                return {"success": False, "message": "No session loaded"}
            return self._facility_manager.start_order(self.current_session, facility_id, npc_id, order_id)
        except Exception as e:
            return {"success": False, "message": str(e)}

    def lock_order_roll(self, facility_id: str, order_id: str, roll_value: int = None, auto: bool = False) -> dict:
        """Lock a roll for a ready order."""
        try:
            if not self.current_session:
                return {"success": False, "message": "No session loaded"}
            return self._facility_manager.lock_order_roll(self.current_session, facility_id, order_id, roll_value, auto)
        except Exception as e:
            return {"success": False, "message": str(e)}

    def evaluate_order(self, facility_id: str, order_id: str) -> dict:
        """Evaluate a ready order and apply effects."""
        try:
            if not self.current_session:
                return {"success": False, "message": "No session loaded"}
            return self._facility_manager.evaluate_order(self.current_session, facility_id, order_id)
        except Exception as e:
            return {"success": False, "message": str(e)}

    def evaluate_ready_orders(self) -> dict:
        """Evaluate all ready orders with locked rolls."""
        try:
            if not self.current_session:
                return {"success": False, "message": "No session loaded"}
            return self._facility_manager.evaluate_ready_orders(self.current_session)
        except Exception as e:
            return {"success": False, "message": str(e)}

    def hire_npc(self, name: str, profession: str, level: int, upkeep: dict, facility_id: str = None) -> dict:
        """Hire an NPC and optionally assign to a facility."""
        try:
            if not self.current_session:
                return {"success": False, "message": "No session loaded"}
            return self._facility_manager.hire_npc(self.current_session, name, profession, level, upkeep, facility_id)
        except Exception as e:
            return {"success": False, "message": str(e)}

    def move_npc(self, npc_id: str, target_facility_id: str = None) -> dict:
        """Move NPC to another facility or to reserve."""
        try:
            if not self.current_session:
                return {"success": False, "message": "No session loaded"}
            return self._facility_manager.move_npc(self.current_session, npc_id, target_facility_id)
        except Exception as e:
            return {"success": False, "message": str(e)}

    def fire_npc(self, npc_id: str) -> dict:
        """Fire an NPC."""
        try:
            if not self.current_session:
                return {"success": False, "message": "No session loaded"}
            return self._facility_manager.fire_npc(self.current_session, npc_id)
        except Exception as e:
            return {"success": False, "message": str(e)}

    # ===== DEBUGGING & LOGGING =====
    
    def log_client(self, level: str, message: str) -> dict:
        """
        Schreibe Logs vom Client in die Logdatei.
        
        Args:
            level: 'info', 'warn', 'error', 'debug'
            message: Log-Nachricht vom Client
        """
        try:
            if level == "error":
                logger.error(f"[CLIENT] {message}")
            elif level == "warn":
                logger.warning(f"[CLIENT] {message}")
            elif level == "debug":
                logger.debug(f"[CLIENT] {message}")
            else:
                logger.info(f"[CLIENT] {message}")
            
            return {"success": True}
        except Exception as e:
            logger.error(f"Error logging client message: {str(e)}")
            return {"success": False}
    
    def get_current_session(self) -> dict:
        """
        Gebe die aktuell geladene Session zurueck.
        """
        return self.current_session or {}

    def get_currency_model(self) -> dict:
        """
        Return currency model (types, base currency, factor map).
        """
        try:
            return {
                "types": self._ledger.currency_types,
                "base_currency": self._ledger.base_currency,
                "factor_to_base": self._ledger.factor_to_base,
            }
        except Exception as e:
            return {
                "types": ["[Curr]"],
                "base_currency": "[Curr]",
                "factor_to_base": {"[Curr]": 1},
                "error": str(e),
            }

    def list_languages(self) -> dict:
        """
        List available UI language files from app/html/i18n.
        """
        try:
            i18n_dir = Path(__file__).parent / "app" / "html" / "i18n"
            languages = []
            if i18n_dir.exists():
                languages = sorted([p.stem for p in i18n_dir.glob("*.json")])
            return {"success": True, "languages": languages}
        except Exception as e:
            return {"success": False, "languages": [], "message": str(e)}

    def get_npc_progression(self) -> dict:
        """
        Return NPC progression config (xp per success, thresholds, level names).
        """
        try:
            return self._facility_manager.config.get("npc_progression", {})
        except Exception as e:
            return {"error": str(e)}

    # ===== SLICE 2: PACK VALIDATION =====

    def validate_packs(self) -> dict:
        """
        Validiere alle Pack-Dateien und die bastion_config.json.

        Returns:
            {success: bool, errors: list, warnings: list, config: dict, packs: list}
        """
        try:
            report = self._pack_validator.validate_all()
            return report
        except Exception as e:
            return {
                "success": False,
                "errors": [f"Validator error: {str(e)}"],
                "warnings": [],
                "config": {"errors": [], "warnings": []},
                "packs": [],
            }
    
    # ===== FACILITY LOADING (Legacy) =====
    
    def _split_pack_ref(self, facility_name: str):
        if isinstance(facility_name, str) and ":" in facility_name:
            source, name = facility_name.split(":", 1)
            if source in ("core", "custom"):
                return source, name
        return "core", facility_name

    def load_facility(self, facility_name):
        """Lade JSON-Daten einer Facility"""
        try:
            source, pack_name = self._split_pack_ref(facility_name)
            base_dir = self.data_dir if source == "core" else self.custom_dir
            filepath = Path(base_dir) / f"{pack_name}.json"
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, dict):
                    data["_pack_source"] = source
                return data
        except FileNotFoundError:
            return {"error": f"Facility '{facility_name}' nicht gefunden"}
        except Exception as e:
            return {"error": str(e)}
    
    def get_facilities(self):
        """Gebe Liste aller verfügbaren Facilities"""
        facilities = []
        core_dir = Path(self.data_dir)
        custom_dir = Path(self.custom_dir)
        if core_dir.exists():
            for file in sorted(core_dir.glob("*.json")):
                facilities.append(f"core:{file.stem}")
        if custom_dir.exists():
            for file in sorted(custom_dir.glob("*.json")):
                facilities.append(f"custom:{file.stem}")
        return facilities
    
    def save_facility(self, facility_name, data):
        """Speichere Facility-Daten"""
        try:
            filepath = Path(self.data_dir) / f"{facility_name}.json"
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            return {"success": True, "message": f"'{facility_name}' gespeichert"}
        except Exception as e:
            return {"success": False, "error": str(e)}

def main():
    # API-Instanz
    api = Api()
    
    # HTML-Datei
    html_file = Path(__file__).parent / "app" / "html" / "index.html"
    
    # Webview erstellen
    window = webview.create_window(
        title='D&D Bastion Manager',
        url=str(html_file),
        js_api=api,
        width=1200,
        height=800,
        resizable=True,
        fullscreen=False,
    )
    
    # Starten
    webview.start(debug=True)

if __name__ == '__main__':
    main()
