"""
Session State Structure & Initial State Generator
Basiert auf Leitplanke: docs/examples/Session_save.json
"""
import json
from typing import Dict, List, Any
from datetime import datetime
from .logger import setup_logger
from .file_utils import sanitize_filename

logger = setup_logger("initial_state")

class InitialStateGenerator:
    """Generiert den initialen State für eine neue Session"""
    
    @staticmethod
    def generate_session_state(
        session_name: str,
        bastion_name: str,
        bastion_location: str = "",
        bastion_description: str = "",
        dm_name: str = "DM",
        players: List[Dict[str, Any]] = None,
        initial_gold: int = 0,
        initial_silver: int = 0,
        initial_copper: int = 0,
    ) -> Dict[str, Any]:
        """
        Erstelle einen neuen Session-State mit all den leeren/initialen Werten.
        Struktur basiert auf docs/examples/Session_save.json als Leitplanke.
        
        Args:
            session_name: Name der Session
            bastion_name: Name der Bastion
            bastion_location: Ort/Region der Bastion
            bastion_description: Narrative Beschreibung
            dm_name: Name des DMs
            players: Liste der Spieler
            initial_gold/silver/copper: Startwerte Wallet
        
        Returns:
            Kompletter Session-State als Dict
        """
        logger.info(f"Generating initial state for session '{session_name}' with bastion '{bastion_name}'")
        today = datetime.now().strftime("%Y-%m-%d")
        session_slug = sanitize_filename(session_name, fallback="session")
        
        state = {
            # ===== METADATA =====
            "session_id": f"session_{session_slug}_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            "session_name": session_name,
            "dm_name": dm_name,
            "created": today,
            "last_modified": today,
            "current_turn": 0,
            
            # ===== BASTION =====
            "bastion": {
                "name": bastion_name,
                "location": bastion_location,
                "description": bastion_description,
                
                "treasury": {
                    "gold": initial_gold,
                    "silver": initial_silver,
                    "copper": initial_copper,
                },
                
                "inventory": [],  # [{ item, qty }, ...]

                "stats": {},  # { stat_name: value }
                
                "facilities": [],  # [{ facility_id, built_turn, build_status, current_orders, current_order, custom_stats, assigned_npcs }, ...]
                
                "npcs_unassigned": [],  # [{ npc_id, name, level, xp, profession, upkeep }, ...]
            },
            
            # ===== PLAYERS =====
            "players": players or [],
            
            # ===== LOADED PACKS =====
            "loaded_packs": [],  # [pack_id, ...]
            
            # ===== LOGS (für Slice 6) =====
            "turn_log": [],  # [{ turn, facility_id, message, type }, ...]
            "audit_log": [],  # [{ turn, event_type, source_type, source_id, action, roll, result, changes, log_text }, ...]
            "event_history": [],  # [{ turn, event_id, text }, ...]
        }
        
        logger.debug(f"Generated state with {len(players or [])} players and initial treasury")
        return state
    
    @staticmethod
    def validate_initial_state(state: Dict[str, Any]) -> tuple[bool, List[str]]:
        """
        Validiere, ob ein Initial State korrekt strukturiert ist.
        
        Returns:
            (is_valid, list_of_errors)
        """
        errors = []
        
        required_top_level = ['session_id', 'dm_name', 'created', 'current_turn', 
                             'bastion', 'players', 'loaded_packs']
        
        for field in required_top_level:
            if field not in state:
                errors.append(f"Missing required field: {field}")
        
        if 'bastion' in state:
            required_bastion = ['name', 'treasury', 'inventory', 'facilities', 'npcs_unassigned']
            for field in required_bastion:
                if field not in state['bastion']:
                    errors.append(f"Missing bastion field: {field}")
        
        if 'treasury' in state.get('bastion', {}):
            required_currency = ['gold', 'silver', 'copper']
            for curr in required_currency:
                if curr not in state['bastion']['treasury']:
                    errors.append(f"Missing currency: {curr}")
        
        return (len(errors) == 0, errors)
