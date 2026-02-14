import json
import os
import sys
from pathlib import Path
import webview

APP_DIR = Path(__file__).parent / "app"
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))

from core_engine.session_manager import SessionManager
from core_engine.initial_state import InitialStateGenerator
from core_engine.ledger import Ledger
from core_engine.facility_manager import FacilityManager
from core_engine.stats_registry import StatsRegistryLoader
from core_engine.audit_log import AuditLog
from core_engine.logger import setup_logger
from core_engine.pack_validator import PackValidator
from core_engine.config_manager import ConfigManager

# Initialisiere Logger
logger = setup_logger("app")

class Api:
    """API für die Kommunikation zwischen Frontend und Backend"""
    
    def __init__(self):
        logger.info("Initializing Api...")
        self.data_dir = str(Path(__file__).parent / "data" / "facilities")
        self.custom_dir = str(Path(__file__).parent / "custom_packs")
        self.sessions_dir = str(Path(__file__).parent / "data" / "sessions")
        
        # Slice 1: Session Management
        # WICHTIG: Nicht als self.xxx speichern - pywebview kann Path-Objekte nicht serialisieren!
        self._session_manager = SessionManager(self.sessions_dir)
        self._initial_state_gen = InitialStateGenerator()
        self._config_manager = ConfigManager(Path(__file__).parent)
        self._ledger = Ledger(Path(__file__).parent, self._config_manager)
        self._stats_registry = StatsRegistryLoader(Path(__file__).parent)
        self._facility_manager = FacilityManager(Path(__file__).parent, self._ledger, self._config_manager)
        self._pack_validator = PackValidator(Path(__file__).parent, self._config_manager)
        self._audit_log = AuditLog(self._config_manager)
        self._ui_prefs_path = Path(__file__).parent / "data" / "config" / "ui_prefs.json"
        self._ui_prefs = self._load_ui_prefs()
        
        # Current loaded session (in-memory)
        self.current_session = None
        logger.info("Api initialized successfully")

    def _load_ui_prefs(self) -> dict:
        try:
            if self._ui_prefs_path.exists():
                data = json.loads(self._ui_prefs_path.read_text(encoding="utf-8"))
                if isinstance(data, dict):
                    return data
        except Exception as e:
            logger.warning(f"Failed to load ui_prefs.json: {e}")
        return {}

    def _save_ui_prefs(self, prefs: dict) -> None:
        try:
            self._ui_prefs_path.parent.mkdir(parents=True, exist_ok=True)
            self._ui_prefs_path.write_text(json.dumps(prefs, indent=2, ensure_ascii=False), encoding="utf-8")
        except Exception as e:
            logger.warning(f"Failed to save ui_prefs.json: {e}")

    def _ensure_treasury_keys(self, session_state: dict) -> None:
        if not isinstance(session_state, dict):
            return
        bastion = session_state.setdefault("bastion", {})
        wallet = bastion.setdefault("treasury", {})
        currency = self._config_manager.get_config().get("currency", {})
        types = currency.get("types") if isinstance(currency, dict) else []
        if not isinstance(types, list):
            return
        for entry in types:
            if isinstance(entry, str) and entry not in wallet:
                wallet[entry] = 0

    def _ensure_treasury_base(self, session_state: dict) -> None:
        if not isinstance(session_state, dict):
            return
        try:
            self._ledger.get_treasury_base(session_state)
        except Exception as e:
            logger.warning(f"Failed to ensure treasury_base: {e}")
    
    # ===== SLICE 1: SESSION LIFECYCLE =====
    
    def create_session(
        self,
        session_name: str,
        bastion_name: str,
        bastion_location: str,
        bastion_description: str,
        dm_name: str,
        players: list,
        initial_treasury: dict = None,
        initial_inventory: list = None,
    ) -> dict:
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
                players=players,
                initial_treasury=initial_treasury,
                initial_inventory=initial_inventory,
            )
            self._stats_registry.apply_to_session(state)
            self._ensure_treasury_keys(state)
            self._ensure_treasury_base(state)
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
            self._ensure_treasury_base(state_to_save)
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

    def load_latest_session(self) -> dict:
        """
        Load most recently modified session file.
        """
        try:
            success, session_state, message = self._session_manager.load_latest_session()

            if success:
                self.current_session = session_state
                self._stats_registry.apply_to_session(self.current_session)
                self._ensure_treasury_keys(self.current_session)
                self._ensure_treasury_keys(self.current_session)

            filename = None
            if isinstance(session_state, dict):
                filename = session_state.get("_session_filename")

            return {
                "success": success,
                "message": message,
                "session_state": session_state,
                "filename": filename,
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"Error loading latest session: {str(e)}",
                "session_state": None,
                "filename": None,
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

    def demolish_facility(self, facility_id: str) -> dict:
        """Demolish a facility and refund a portion of build costs."""
        try:
            if not self.current_session:
                return {"success": False, "message": "No session loaded"}
            return self._facility_manager.demolish_facility(self.current_session, facility_id)
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

    def roll_and_evaluate_ready_orders(self) -> dict:
        """Auto-roll and evaluate all ready orders."""
        try:
            if not self.current_session:
                return {"success": False, "message": "No session loaded"}
            return self._facility_manager.roll_and_evaluate_ready_orders(self.current_session)
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

    def get_ui_prefs(self) -> dict:
        """
        Return persisted UI preferences.
        """
        return self._ui_prefs or {}

    def save_ui_prefs(self, prefs: dict) -> dict:
        """
        Persist UI preferences (merge with existing).
        """
        try:
            if not isinstance(prefs, dict):
                return {"success": False, "message": "prefs must be an object"}
            self._ui_prefs.update(prefs)
            self._save_ui_prefs(self._ui_prefs)
            return {"success": True, "prefs": self._ui_prefs}
        except Exception as e:
            return {"success": False, "message": str(e)}

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

    def get_check_profiles(self) -> dict:
        """
        Return check profile config for rolls.
        """
        try:
            return self._facility_manager.config.get("check_profiles", {})
        except Exception as e:
            return {"error": str(e)}

    def get_player_classes(self) -> dict:
        """
        Return configured player class options for the session wizard.
        """
        try:
            classes = self._facility_manager.config.get("player_classes", [])
            if not isinstance(classes, list):
                classes = []
            base_classes = []
            try:
                base_path = Path(__file__).parent / "data" / "config" / "bastion_config.json"
                base_data = json.loads(base_path.read_text(encoding="utf-8"))
                if isinstance(base_data, dict):
                    base_classes = base_data.get("player_classes", [])
            except Exception:
                base_classes = []
            base_set = {c for c in base_classes if isinstance(c, str)}
            payload = []
            for entry in classes:
                if not isinstance(entry, str):
                    continue
                value = entry.strip()
                if not value:
                    continue
                payload.append({
                    "value": value,
                    "custom": value not in base_set,
                })
            return {"classes": payload}
        except Exception as e:
            return {"classes": [], "error": str(e)}

    def get_bastion_config(self) -> dict:
        """
        Return merged bastion config (base + packs + settings).
        """
        try:
            return self._config_manager.get_config()
        except Exception as e:
            return {"error": str(e)}

    def get_bastion_base_config(self) -> dict:
        """
        Return merged bastion config without settings (base + packs).
        """
        try:
            return self._config_manager.get_base_config()
        except Exception as e:
            return {"error": str(e)}

    def get_bastion_core_config(self) -> dict:
        """
        Return core bastion config without packs/settings.
        """
        try:
            return self._config_manager.get_core_config()
        except Exception as e:
            return {"error": str(e)}

    def get_settings(self) -> dict:
        """
        Return persisted settings.json (may be empty).
        """
        try:
            return self._config_manager.get_settings()
        except Exception as e:
            return {"error": str(e)}

    def save_settings(self, settings: dict) -> dict:
        """
        Validate and persist settings.json.
        """
        try:
            result = self._config_manager.save_settings(settings or {})
            if result.get("success"):
                self._ledger.reload_config()
                self._facility_manager.reload_config()
                if self.current_session:
                    self._ensure_treasury_keys(self.current_session)
            return result
        except Exception as e:
            return {"success": False, "errors": [str(e)], "warnings": []}

    def save_formula_inputs(self, facility_id: str, order_id: str, trigger_id: str, inputs: dict) -> dict:
        """
        Save formula inputs for a ready order.
        """
        try:
            if not self.current_session:
                return {"success": False, "message": "No session loaded"}
            return self._facility_manager.save_formula_inputs(
                self.current_session, facility_id, order_id, trigger_id, inputs
            )
        except Exception as e:
            return {"success": False, "message": str(e)}

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
        width=1920,
        height=1080,
        resizable=True,
        fullscreen=False,
    )
    
    # Starten
    webview.start(debug=True)

if __name__ == '__main__':
    main()
