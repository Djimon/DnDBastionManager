import webview
import json
import os
from pathlib import Path
from core_engine import SessionManager, InitialStateGenerator

class Api:
    """API für die Kommunikation zwischen Frontend und Backend"""
    
    def __init__(self):
        self.data_dir = str(Path(__file__).parent / "core")
        self.sessions_dir = str(Path(__file__).parent / "sessions")
        
        # Slice 1: Session Management
        self.session_manager = SessionManager(self.sessions_dir)
        self.initial_state_gen = InitialStateGenerator()
        
        # Current loaded session (in-memory)
        self.current_session = None
    
    # ===== SLICE 1: SESSION LIFECYCLE =====
    
    def create_session(self, session_name: str, bastion_name: str, bastion_location: str, 
                      bastion_description: str, dm_name: str, players: list) -> dict:
        """
        Erstelle eine neue Session (Wizard Step 1).
        
        Returns:
            {success: bool, message: str, session_state: dict or None}
        """
        try:
            # Generiere Initial State
            state = self.initial_state_gen.generate_session_state(
                session_name=session_name,
                bastion_name=bastion_name,
                bastion_location=bastion_location,
                bastion_description=bastion_description,
                dm_name=dm_name,
                players=players
            )
            
            # Validiere State
            is_valid, errors = self.initial_state_gen.validate_initial_state(state)
            if not is_valid:
                return {
                    "success": False,
                    "message": f"Invalid state: {', '.join(errors)}",
                    "session_state": None
                }
            
            # Speichere Session
            success, message = self.session_manager.create_session(state)
            
            # Lade Session in Memory
            if success:
                self.current_session = state
            
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
            
            success, message = self.session_manager.create_session(state_to_save)
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
            success, session_state, message = self.session_manager.load_session(filename)
            
            if success:
                self.current_session = session_state
            
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
            success, sessions, message = self.session_manager.list_sessions()
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
    
    def get_current_session(self) -> dict:
        """
        Gebe die aktuell geladene Session zurück.
        """
        return self.current_session or {}
    
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
