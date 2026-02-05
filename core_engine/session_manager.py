"""
Session Manager - Persistence & Loading
Handles save/load of session JSON files with versioning
"""
import json
from pathlib import Path
from typing import Dict, Any, Optional, Tuple
from datetime import datetime
import shutil
from .logger import setup_logger

logger = setup_logger("session_manager")

class SessionManager:
    """Verwaltet Session-Dateien (Speichern, Laden, Migrationen)"""
    
    def __init__(self, sessions_dir: str = "sessions"):
        """
        Initialisiere Session Manager mit Sessions-Verzeichnis.
        
        Args:
            sessions_dir: Pfad zum Verzeichnis, in dem Session-Dateien gespeichert werden
        """
        # Verwende Path intern, speichere aber sessions_dir als str um pywebview Serialisierungsfehler zu vermeiden
        sessions_path = Path(sessions_dir)
        sessions_path.mkdir(parents=True, exist_ok=True)
        self.sessions_dir = str(sessions_path)
        self._sessions_path = sessions_path  # Interne Path-Referenz für Operationen
        logger.info(f"SessionManager initialized with sessions_dir: {self.sessions_dir}")
    
    def create_session(self, session_state: Dict[str, Any]) -> Tuple[bool, str]:
        """
        Speichere eine Session (neu oder Update).
        Dateiname bleibt stabil, wenn bereits bekannt.
        
        Args:
            session_state: Der komplette Session-State von InitialStateGenerator
        
        Returns:
            (success: bool, message: str)
        """
        try:
            filename = session_state.get("_session_filename")

            if not filename:
                session_id = session_state.get("session_id")
                if isinstance(session_id, str) and session_id.strip():
                    filename = f"{session_id}.json"
                else:
                    # Erstelle Dateinamen mit Timestamp (Fallback)
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    # FIXED: Nutze 'bastion.name' nicht 'metadata.session_name'
                    session_name = session_state.get('bastion', {}).get('name', 'unnamed')
                    logger.debug(f"Creating session file with bastion name: {session_name}")

                    # Sanitize filename
                    safe_name = "".join(c for c in session_name if c.isalnum() or c in (' ', '_', '-')).rstrip()
                    filename = f"session_{safe_name}_{timestamp}.json"

            # Merke Dateiname im State, damit Saves stabil bleiben
            session_state["_session_filename"] = filename
            filepath = self._sessions_path / filename
            logger.debug(f"Session file path: {filepath}")
            
            # Speichere JSON
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(session_state, f, indent=2, ensure_ascii=False)
            
            logger.info(f"Session successfully saved to: {filename}")
            return (True, f"Session saved: {filename}")
        
        except Exception as e:
            logger.error(f"Error saving session: {str(e)}", exc_info=True)
            return (False, f"Error saving session: {str(e)}")
    
    def load_session(self, filename: str) -> Tuple[bool, Optional[Dict[str, Any]], str]:
        """
        Lade eine Session aus Datei.
        
        Args:
            filename: Dateiname oder vollständiger Pfad
        
        Returns:
            (success: bool, session_state: Dict or None, message: str)
        """
        try:
            # Versuche Datei zu finden
            filepath = self._sessions_path / filename
            
            if not filepath.exists():
                # Fallback: suche nach Filename ohne Directory
                matching_files = list(self._sessions_path.glob(f"*{filename}*"))
                if matching_files:
                    filepath = matching_files[0]
                else:
                    return (False, None, f"Session file not found: {filename}")
            
            # Lade JSON
            with open(filepath, 'r', encoding='utf-8') as f:
                session_state = json.load(f)
            
            # Validiere Version und migrate wenn nötig
            success, migrated_state = self._migrate_if_needed(session_state)
            if not success:
                return (False, None, f"Migration failed: {migrated_state}")
            
            # Merke Dateiname im State, damit Save denselben Namen nutzt
            if isinstance(migrated_state, dict):
                migrated_state["_session_filename"] = filepath.name
            
            return (True, migrated_state, f"Session loaded: {filename}")
        
        except json.JSONDecodeError as e:
            return (False, None, f"JSON decode error: {str(e)}")
        except Exception as e:
            return (False, None, f"Error loading session: {str(e)}")
    
    def list_sessions(self) -> Tuple[bool, list, str]:
        """
        Liste alle verfügbaren Sessions auf.
        
        Returns:
            (success: bool, list_of_filenames: list, message: str)
        """
        try:
            sessions = sorted([f.name for f in self._sessions_path.glob("session_*.json")], reverse=True)
            return (True, sessions, f"Found {len(sessions)} sessions")
        except Exception as e:
            return (False, [], f"Error listing sessions: {str(e)}")

    def get_latest_session_filename(self) -> Optional[str]:
        """
        Returns filename of most recently modified session file, or None.
        """
        try:
            files = list(self._sessions_path.glob("session_*.json"))
            if not files:
                return None
            latest = max(files, key=lambda f: f.stat().st_mtime)
            return latest.name
        except Exception as e:
            logger.error(f"Error getting latest session: {str(e)}")
            return None

    def load_latest_session(self) -> Tuple[bool, Optional[Dict[str, Any]], str]:
        """
        Load most recently modified session file.
        """
        filename = self.get_latest_session_filename()
        if not filename:
            return (False, None, "No sessions available")
        return self.load_session(filename)
    
    def delete_session(self, filename: str) -> Tuple[bool, str]:
        """
        Lösche eine Session.
        
        Args:
            filename: Dateiname der zu löschenden Session
        
        Returns:
            (success: bool, message: str)
        """
        try:
            filepath = self._sessions_path / filename
            if not filepath.exists():
                return (False, f"Session not found: {filename}")
            
            filepath.unlink()  # Lösche Datei
            return (True, f"Session deleted: {filename}")
        except Exception as e:
            return (False, f"Error deleting session: {str(e)}")
    
    def backup_session(self, filename: str) -> Tuple[bool, str]:
        """
        Erstelle ein Backup einer Session.
        
        Args:
            filename: Dateiname der zu sichernden Session
        
        Returns:
            (success: bool, message: str)
        """
        try:
            filepath = self._sessions_path / filename
            if not filepath.exists():
                return (False, f"Session not found: {filename}")
            
            # Erstelle Backup mit Timestamp
            backup_name = f"{filename[:-5]}_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            backup_path = self._sessions_path / backup_name
            
            shutil.copy2(filepath, backup_path)
            return (True, f"Backup created: {backup_name}")
        except Exception as e:
            return (False, f"Error creating backup: {str(e)}")
    
    def _migrate_if_needed(self, session_state: Dict[str, Any]) -> Tuple[bool, Any]:
        """
        Migriere Session-State wenn Versionen nicht matchen.
        
        Returns:
            (success: bool, migrated_state: Dict or error_message: str)
        """
        current_version = 1
        state_version = session_state.get('metadata', {}).get('version', 0)
        
        if state_version == current_version:
            return (True, session_state)
        
        if state_version < current_version:
            # TODO: Implementiere Migrations wenn neue Versionen hinzugefügt werden
            return (True, session_state)
        
        return (False, f"Unsupported session version: {state_version}")
    
    def get_session_info(self, filename: str) -> Tuple[bool, Optional[Dict[str, Any]], str]:
        """
        Hole Metadaten einer Session ohne komplette Daten zu laden.
        
        Returns:
            (success: bool, metadata: Dict or None, message: str)
        """
        success, session_state, message = self.load_session(filename)
        if not success:
            return (False, None, message)
        
        metadata = session_state.get('metadata', {})
        bastion = session_state.get('bastion', {})
        
        info = {
            **metadata,
            'bastion_name': bastion.get('name'),
            'num_players': len(session_state.get('players', [])),
            'num_facilities': len(session_state.get('facilities', [])),
            'current_turn': session_state.get('turn', 0),
        }
        
        return (True, info, "Metadata loaded")
