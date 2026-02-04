import webview
import json
import os
from pathlib import Path
from core_engine.session_manager import SessionManager
from core_engine.initial_state import InitialStateGenerator
from core_engine.ledger import Ledger
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
        self.sessions_dir = str(Path(__file__).parent / "sessions")
        
        # Slice 1: Session Management
        # WICHTIG: Nicht als self.xxx speichern - pywebview kann Path-Objekte nicht serialisieren!
        self._session_manager = SessionManager(self.sessions_dir)
        self._initial_state_gen = InitialStateGenerator()
        self._ledger = Ledger(Path(__file__).parent)
        self._stats_registry = StatsRegistryLoader(Path(__file__).parent)
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
    
    def load_facility(self, facility_name):
        """Lade JSON-Daten einer Facility"""
        try:
            filepath = Path(self.data_dir) / f"{facility_name}.json"
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
        except FileNotFoundError:
            return {"error": f"Facility '{facility_name}' nicht gefunden"}
        except Exception as e:
            return {"error": str(e)}
    
    def get_facilities(self):
        """Gebe Liste aller verfügbaren Facilities"""
        facilities = []
        for file in Path(self.data_dir).glob("core_*.json"):
            facilities.append(file.stem)
        return sorted(facilities)
    
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
