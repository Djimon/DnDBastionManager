import json
from pathlib import Path
from typing import Any, Dict, List, Tuple

from .logger import setup_logger

logger = setup_logger("stats_registry")


class StatsRegistryLoader:
    def __init__(self, root_dir: Path):
        self.packs_dir = root_dir / "core" / "facilities"

    def load_registry(self) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, int], List[str]]:
        registry: Dict[str, Dict[str, Any]] = {}
        stats: Dict[str, int] = {}
        pack_ids: List[str] = []

        if not self.packs_dir.exists():
            logger.warning(f"Packs dir not found: {self.packs_dir}")
            return registry, stats, pack_ids

        for pack_file in sorted(self.packs_dir.glob("*.json")):
            try:
                data = json.loads(pack_file.read_text(encoding="utf-8"))
            except Exception as e:
                logger.warning(f"Failed to read pack: {pack_file} ({e})")
                continue

            pack_id = data.get("pack_id")
            if isinstance(pack_id, str) and pack_id not in pack_ids:
                pack_ids.append(pack_id)

            mechanics = data.get("custom_mechanics", []) or []
            if not isinstance(mechanics, list):
                continue

            for mech in mechanics:
                if not isinstance(mech, dict):
                    continue
                if mech.get("type") != "stat_counter":
                    continue

                config = mech.get("config", {}) if isinstance(mech.get("config"), dict) else {}
                stat_key = config.get("custom_stat_name") or mech.get("id") or mech.get("name")
                if not isinstance(stat_key, str) or not stat_key:
                    logger.warning(f"Stat counter missing id/name in {pack_file.name}")
                    continue

                if stat_key in registry:
                    logger.warning(f"Duplicate stat key '{stat_key}' in {pack_file.name}")
                    continue

                display_name = config.get("name") or mech.get("name") or stat_key
                min_val = config.get("min_value", config.get("min"))
                max_val = config.get("max_value", config.get("max"))
                start_val = config.get("start", 0)
                if not isinstance(start_val, int):
                    logger.warning(f"Stat '{stat_key}' start is not int; defaulting to 0")
                    start_val = 0

                registry[stat_key] = {
                    "name": display_name,
                    "min": min_val,
                    "max": max_val,
                    "source_pack": pack_id,
                }
                stats[stat_key] = start_val

        return registry, stats, pack_ids

    def apply_to_session(self, session_state: Dict[str, Any]) -> None:
        registry, stats, pack_ids = self.load_registry()

        bastion = session_state.setdefault("bastion", {})
        bastion_stats = bastion.setdefault("stats", {})
        stats_registry = bastion.setdefault("stats_registry", {})

        for key, meta in registry.items():
            if key not in stats_registry:
                stats_registry[key] = meta
        for key, value in stats.items():
            if key not in bastion_stats:
                bastion_stats[key] = value

        if pack_ids:
            loaded = session_state.setdefault("loaded_packs", [])
            for pid in pack_ids:
                if pid not in loaded:
                    loaded.append(pid)
