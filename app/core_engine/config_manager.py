import copy
import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .logger import setup_logger

logger = setup_logger("config_manager")


ALLOWED_PACK_CONFIG_KEYS = {"currency", "check_profiles", "player_classes"}
ALLOWED_SETTINGS_KEYS = {"currency", "default_build_costs", "npc_progression", "check_profiles"}
ALLOWED_SETTINGS_CURRENCY_KEYS = {"conversion", "hidden"}
ALLOWED_CHECK_PROFILE_LEVELS = {"default", "apprentice", "experienced", "master"}


class ConfigManager:
    def __init__(self, root_dir: Path):
        self.root_dir = root_dir
        self.base_config_path = root_dir / "data" / "config" / "bastion_config.json"
        self.settings_path = root_dir / "data" / "config" / "settings.json"
        self.facilities_dir = root_dir / "data" / "facilities"
        self.custom_packs_dir = root_dir / "custom_packs"
        self._config: Dict[str, Any] = {}
        self._base_config: Dict[str, Any] = {}
        self._core_config: Dict[str, Any] = {}
        self._settings: Dict[str, Any] = {}
        self._warnings: List[str] = []
        self.reload()

    def get_config(self) -> Dict[str, Any]:
        return copy.deepcopy(self._config)

    def get_settings(self) -> Dict[str, Any]:
        return copy.deepcopy(self._settings)

    def get_base_config(self) -> Dict[str, Any]:
        return copy.deepcopy(self._base_config)

    def get_core_config(self) -> Dict[str, Any]:
        return copy.deepcopy(self._core_config)

    def get_warnings(self) -> List[str]:
        return list(self._warnings)

    def reload(self) -> Dict[str, Any]:
        base_config, base_error = self._load_json(self.base_config_path)
        if base_error:
            logger.warning(base_error)
            base_config = {}
        core_config = self._normalize_currency_config(copy.deepcopy(base_config))
        self._core_config = core_config
        merged_base, pack_warnings = self._build_base_with_packs(base_config)
        merged_base = self._normalize_currency_config(merged_base)

        settings, settings_errors, settings_warnings = self._load_settings(merged_base)
        if settings_errors:
            logger.warning("Settings ignored due to errors:")
            for err in settings_errors:
                logger.warning(err)
            settings = {}

        merged = self._apply_settings(merged_base, settings)
        merged = self._normalize_currency_config(merged)

        self._base_config = merged_base
        self._config = merged
        self._settings = settings
        self._warnings = pack_warnings + settings_errors + settings_warnings
        return self._config

    def save_settings(self, settings: Dict[str, Any]) -> Dict[str, Any]:
        base_config, base_error = self._load_json(self.base_config_path)
        if base_error:
            return {"success": False, "errors": [base_error], "warnings": []}

        core_config = self._normalize_currency_config(copy.deepcopy(base_config))
        self._core_config = core_config
        merged_base, pack_warnings = self._build_base_with_packs(base_config)
        merged_base = self._normalize_currency_config(merged_base)
        errors, warnings = self.validate_settings(settings, merged_base)
        if errors:
            return {"success": False, "errors": errors, "warnings": warnings}

        try:
            self.settings_path.parent.mkdir(parents=True, exist_ok=True)
            self.settings_path.write_text(
                json.dumps(settings, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )
        except Exception as exc:
            return {"success": False, "errors": [f"Failed to save settings.json: {exc}"], "warnings": warnings}

        merged = self._apply_settings(merged_base, settings)
        merged = self._normalize_currency_config(merged)
        self._config = merged
        self._base_config = merged_base
        self._settings = settings
        self._warnings = pack_warnings + warnings

        return {
            "success": True,
            "warnings": warnings,
            "config": copy.deepcopy(merged),
            "settings": copy.deepcopy(settings),
        }

    def validate_settings(self, settings: Any, base_config: Dict[str, Any]) -> Tuple[List[str], List[str]]:
        errors: List[str] = []
        warnings: List[str] = []

        if not isinstance(settings, dict):
            return ["settings must be a JSON object"], warnings

        for key in settings.keys():
            if key not in ALLOWED_SETTINGS_KEYS:
                errors.append(f"settings.{key} is not allowed")

        if "currency" in settings:
            self._validate_currency_settings(settings.get("currency"), base_config, errors, warnings)
        if "default_build_costs" in settings:
            self._validate_default_build_costs(settings.get("default_build_costs"), base_config, errors)
        if "npc_progression" in settings:
            self._validate_npc_progression(settings.get("npc_progression"), base_config, errors)
        if "check_profiles" in settings:
            self._validate_check_profiles(settings.get("check_profiles"), base_config, errors)

        return errors, warnings

    def _load_settings(self, base_config: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str], List[str]]:
        if not self.settings_path.exists():
            return {}, [], []
        data, error = self._load_json(self.settings_path)
        if error:
            return {}, [error], []
        errors, warnings = self.validate_settings(data, base_config)
        if errors:
            return {}, errors, warnings
        return data, [], warnings

    def _load_json(self, path: Path) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        try:
            return json.loads(path.read_text(encoding="utf-8")), None
        except FileNotFoundError:
            return None, f"File not found: {path}"
        except json.JSONDecodeError as exc:
            return None, f"Invalid JSON in {path}: {exc}"
        except Exception as exc:
            return None, f"Error reading {path}: {exc}"

    def _build_base_with_packs(self, base_config: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
        merged = copy.deepcopy(base_config) if isinstance(base_config, dict) else {}
        warnings: List[str] = []

        for pack in self._load_pack_configs():
            pack_config = pack.get("config")
            pack_id = pack.get("pack_id") or pack.get("file")
            if isinstance(pack_config, dict):
                self._apply_pack_config(merged, pack_config, str(pack_id), warnings)
            else:
                warnings.append(f"Pack {pack_id}: config must be an object")

        return merged, warnings

    def _load_pack_configs(self) -> List[Dict[str, Any]]:
        configs: List[Dict[str, Any]] = []
        pack_dirs = [
            ("core", self.facilities_dir),
            ("custom", self.custom_packs_dir),
        ]
        for source, pack_dir in pack_dirs:
            if not pack_dir.exists():
                continue
            for pack_file in sorted(pack_dir.glob("*.json")):
                data, error = self._load_json(pack_file)
                if error:
                    logger.warning(error)
                    continue
                if not isinstance(data, dict):
                    logger.warning(f"Pack {pack_file} must be a JSON object.")
                    continue
                config = data.get("config")
                if config is None:
                    continue
                configs.append({
                    "pack_id": data.get("pack_id") or pack_file.stem,
                    "source": source,
                    "file": str(pack_file),
                    "config": config,
                })
        return configs

    def _apply_pack_config(
        self,
        merged: Dict[str, Any],
        pack_config: Dict[str, Any],
        pack_id: str,
        warnings: List[str],
    ) -> None:
        for key, value in pack_config.items():
            if key not in ALLOWED_PACK_CONFIG_KEYS:
                warnings.append(f"Pack {pack_id}: config.{key} not allowed (ignored)")
                continue

            if key == "currency":
                if not isinstance(value, dict):
                    warnings.append(f"Pack {pack_id}: config.currency must be object")
                    continue
                currency = merged.setdefault("currency", {})
                if not isinstance(currency, dict):
                    currency = {}
                    merged["currency"] = currency

                types = currency.get("types")
                if not isinstance(types, list):
                    types = []
                    currency["types"] = types

                new_types = value.get("types")
                if isinstance(new_types, list):
                    for entry in new_types:
                        if not isinstance(entry, str) or not entry:
                            warnings.append(f"Pack {pack_id}: currency.types entry invalid")
                            continue
                        if entry in types:
                            warnings.append(f"Pack {pack_id}: currency type '{entry}' already exists (ignored)")
                            continue
                        types.append(entry)

                conversions = currency.get("conversion")
                if not isinstance(conversions, list):
                    conversions = []
                    currency["conversion"] = conversions

                new_conversions = value.get("conversion")
                if isinstance(new_conversions, list):
                    conversions.extend(new_conversions)
                elif new_conversions is not None:
                    warnings.append(f"Pack {pack_id}: currency.conversion must be list")
                continue

            if key == "check_profiles":
                if not isinstance(value, dict):
                    warnings.append(f"Pack {pack_id}: config.check_profiles must be object")
                    continue
                profiles = merged.setdefault("check_profiles", {})
                if not isinstance(profiles, dict):
                    profiles = {}
                    merged["check_profiles"] = profiles
                for profile_key, profile_value in value.items():
                    if profile_key in profiles:
                        warnings.append(f"Pack {pack_id}: check_profile '{profile_key}' already exists (ignored)")
                        continue
                    profiles[profile_key] = profile_value
                continue

            if key == "player_classes":
                if not isinstance(value, list):
                    warnings.append(f"Pack {pack_id}: config.player_classes must be list")
                    continue
                classes = merged.setdefault("player_classes", [])
                if not isinstance(classes, list):
                    classes = []
                    merged["player_classes"] = classes
                for entry in value:
                    if not isinstance(entry, str) or not entry:
                        warnings.append(f"Pack {pack_id}: player_classes entry invalid")
                        continue
                    if entry in classes:
                        warnings.append(f"Pack {pack_id}: player_class '{entry}' already exists (ignored)")
                        continue
                    classes.append(entry)

    def _apply_settings(self, merged: Dict[str, Any], settings: Dict[str, Any]) -> Dict[str, Any]:
        updated = copy.deepcopy(merged)

        currency_settings = settings.get("currency") if isinstance(settings, dict) else None
        if isinstance(currency_settings, dict):
            currency = updated.setdefault("currency", {})
            conversion = currency_settings.get("conversion")
            if isinstance(conversion, list):
                if isinstance(currency, dict):
                    currency["conversion"] = copy.deepcopy(conversion)
            hidden = currency_settings.get("hidden")
            if isinstance(hidden, list):
                self._apply_hidden_currency(currency, hidden)

        default_build_costs = settings.get("default_build_costs")
        if isinstance(default_build_costs, dict):
            target = updated.setdefault("default_build_costs", {})
            if isinstance(target, dict):
                for key, value in default_build_costs.items():
                    if not isinstance(value, dict):
                        continue
                    entry = target.setdefault(key, {})
                    if not isinstance(entry, dict):
                        entry = {}
                        target[key] = entry
                    for field, amount in value.items():
                        entry[field] = amount

        npc_progression = settings.get("npc_progression")
        if isinstance(npc_progression, dict):
            target = updated.setdefault("npc_progression", {})
            if isinstance(target, dict):
                for key, value in npc_progression.items():
                    if isinstance(value, dict) and isinstance(target.get(key), dict):
                        for sub_key, sub_value in value.items():
                            target[key][sub_key] = sub_value
                    else:
                        target[key] = value

        check_profiles = settings.get("check_profiles")
        if isinstance(check_profiles, dict):
            target = updated.setdefault("check_profiles", {})
            if isinstance(target, dict):
                for profile_key, profile_value in check_profiles.items():
                    if not isinstance(profile_value, dict):
                        continue
                    profile = target.setdefault(profile_key, {})
                    if not isinstance(profile, dict):
                        profile = {}
                        target[profile_key] = profile
                    for key, value in profile_value.items():
                        if value is None:
                            if key != "default":
                                profile.pop(key, None)
                            continue
                        if isinstance(value, dict) and isinstance(profile.get(key), dict):
                            for sub_key, sub_value in value.items():
                                profile[key][sub_key] = sub_value
                        else:
                            profile[key] = value

        return updated

    def _apply_hidden_currency(self, currency: Dict[str, Any], hidden: List[Any]) -> None:
        if not isinstance(currency, dict):
            return
        protected = self._core_currency_types()
        hidden_set = {h for h in hidden if isinstance(h, str) and h and h not in protected}
        if not hidden_set:
            return
        types = currency.get("types")
        if isinstance(types, list):
            currency["types"] = [t for t in types if isinstance(t, str) and t not in hidden_set]
        conversions = currency.get("conversion")
        if isinstance(conversions, list):
            filtered = []
            for entry in conversions:
                if not isinstance(entry, dict):
                    continue
                src = entry.get("from")
                dst = entry.get("to")
                if src in hidden_set or dst in hidden_set:
                    continue
                filtered.append(entry)
            currency["conversion"] = filtered

    def _normalize_currency_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(config, dict):
            return config
        currency = config.get("currency")
        if not isinstance(currency, dict):
            return config

        types = currency.get("types")
        if isinstance(types, list):
            seen = set()
            normalized = []
            for entry in types:
                if isinstance(entry, str) and entry and entry not in seen:
                    seen.add(entry)
                    normalized.append(entry)
            currency["types"] = normalized

        conversions = currency.get("conversion")
        if isinstance(conversions, list):
            seen_pairs: Dict[Tuple[str, str], Dict[str, Any]] = {}
            order: List[Tuple[str, str]] = []
            for entry in conversions:
                if not isinstance(entry, dict):
                    continue
                src = entry.get("from")
                dst = entry.get("to")
                if not isinstance(src, str) or not isinstance(dst, str):
                    continue
                key = (src, dst)
                if key in seen_pairs:
                    order = [item for item in order if item != key]
                order.append(key)
                seen_pairs[key] = entry
            currency["conversion"] = [seen_pairs[key] for key in order]

        return config

    def _core_currency_types(self) -> set:
        core = self._core_config if isinstance(self._core_config, dict) else {}
        currency = core.get("currency", {}) if isinstance(core, dict) else {}
        types = currency.get("types") if isinstance(currency, dict) else None
        if isinstance(types, list):
            return {t for t in types if isinstance(t, str) and t}
        return set()

    def _validate_currency_settings(
        self,
        currency_settings: Any,
        base_config: Dict[str, Any],
        errors: List[str],
        warnings: List[str],
    ) -> None:
        if not isinstance(currency_settings, dict):
            errors.append("settings.currency must be an object")
            return
        for key in currency_settings.keys():
            if key not in ALLOWED_SETTINGS_CURRENCY_KEYS:
                errors.append(f"settings.currency.{key} is not allowed")
        conversions = currency_settings.get("conversion")
        if conversions is None:
            conversions = []
        if not isinstance(conversions, list):
            errors.append("settings.currency.conversion must be a list")
            conversions = []
        hidden = currency_settings.get("hidden")
        if hidden is not None and not isinstance(hidden, list):
            errors.append("settings.currency.hidden must be a list")
            hidden = []
        types = self._currency_types_from(base_config)
        protected = self._core_currency_types()
        if isinstance(hidden, list):
            hidden_set = set()
            for idx, entry in enumerate(hidden):
                if not isinstance(entry, str) or not entry:
                    errors.append(f"settings.currency.hidden[{idx}] must be a string")
                    continue
                if entry in protected:
                    warnings.append(f"settings.currency.hidden cannot include core currency '{entry}'")
                    continue
                if entry not in types:
                    errors.append(f"settings.currency.hidden[{idx}] '{entry}' not in currency types")
                    continue
                hidden_set.add(entry)
            if types and len(hidden_set) >= len(types):
                errors.append("settings.currency.hidden would remove all currencies")
        seen: set = set()
        for idx, entry in enumerate(conversions):
            if not isinstance(entry, dict):
                errors.append(f"settings.currency.conversion[{idx}] must be an object")
                continue
            extra_keys = set(entry.keys()) - {"from", "to", "rate"}
            if extra_keys:
                errors.append(f"settings.currency.conversion[{idx}] has unknown keys: {', '.join(sorted(extra_keys))}")
            src = entry.get("from")
            dst = entry.get("to")
            rate = entry.get("rate")
            if not isinstance(src, str) or not src:
                errors.append(f"settings.currency.conversion[{idx}].from must be a string")
            if not isinstance(dst, str) or not dst:
                errors.append(f"settings.currency.conversion[{idx}].to must be a string")
            if not isinstance(rate, int) or rate <= 0:
                errors.append(f"settings.currency.conversion[{idx}].rate must be positive int")
            if isinstance(src, str) and src and src not in types:
                errors.append(f"settings.currency.conversion[{idx}].from '{src}' not in currency types")
            if isinstance(dst, str) and dst and dst not in types:
                errors.append(f"settings.currency.conversion[{idx}].to '{dst}' not in currency types")
            if isinstance(src, str) and isinstance(dst, str):
                key = (src, dst)
                if key in seen:
                    warnings.append(f"settings.currency.conversion duplicate pair {src}->{dst} (last wins)")
                seen.add(key)

    def _validate_default_build_costs(
        self,
        settings_costs: Any,
        base_config: Dict[str, Any],
        errors: List[str],
    ) -> None:
        if not isinstance(settings_costs, dict):
            errors.append("settings.default_build_costs must be an object")
            return
        base_costs = base_config.get("default_build_costs")
        if not isinstance(base_costs, dict):
            errors.append("default_build_costs missing in base config")
            return
        types = self._currency_types_from(base_config)
        for key, entry in settings_costs.items():
            if key not in base_costs:
                errors.append(f"settings.default_build_costs.{key} is not allowed")
                continue
            if not isinstance(entry, dict):
                errors.append(f"settings.default_build_costs.{key} must be an object")
                continue
            base_entry = base_costs.get(key, {})
            if not isinstance(base_entry, dict):
                errors.append(f"default_build_costs.{key} invalid in base config")
                continue
            for field, value in entry.items():
                if field not in base_entry:
                    errors.append(f"settings.default_build_costs.{key}.{field} is not allowed")
                    continue
                if field == "duration_turns":
                    if not isinstance(value, int) or value <= 0:
                        errors.append(f"settings.default_build_costs.{key}.duration_turns must be positive int")
                else:
                    if field not in types:
                        errors.append(f"settings.default_build_costs.{key}.{field} unknown currency")
                        continue
                    if not isinstance(value, int) or value < 0:
                        errors.append(f"settings.default_build_costs.{key}.{field} must be int >= 0")

    def _validate_npc_progression(
        self,
        settings_npc: Any,
        base_config: Dict[str, Any],
        errors: List[str],
    ) -> None:
        if not isinstance(settings_npc, dict):
            errors.append("settings.npc_progression must be an object")
            return
        base_npc = base_config.get("npc_progression")
        if not isinstance(base_npc, dict):
            errors.append("npc_progression missing in base config")
            return
        for key, value in settings_npc.items():
            if key not in base_npc:
                errors.append(f"settings.npc_progression.{key} is not allowed")
                continue
            if key == "xp_per_success":
                if not isinstance(value, int) or value <= 0:
                    errors.append("settings.npc_progression.xp_per_success must be positive int")
            elif key in {"level_thresholds", "level_names"}:
                if not isinstance(value, dict):
                    errors.append(f"settings.npc_progression.{key} must be an object")
                    continue
                base_block = base_npc.get(key, {})
                if not isinstance(base_block, dict):
                    errors.append(f"npc_progression.{key} invalid in base config")
                    continue
                for sub_key, sub_value in value.items():
                    if sub_key not in base_block:
                        errors.append(f"settings.npc_progression.{key}.{sub_key} is not allowed")
                        continue
                    if key == "level_thresholds":
                        if not isinstance(sub_value, int):
                            errors.append(f"settings.npc_progression.{key}.{sub_key} must be int")
                    if key == "level_names":
                        if not isinstance(sub_value, str):
                            errors.append(f"settings.npc_progression.{key}.{sub_key} must be string")

    def _validate_check_profiles(
        self,
        settings_profiles: Any,
        base_config: Dict[str, Any],
        errors: List[str],
    ) -> None:
        if not isinstance(settings_profiles, dict):
            errors.append("settings.check_profiles must be an object")
            return
        base_profiles = base_config.get("check_profiles")
        if not isinstance(base_profiles, dict):
            errors.append("check_profiles missing in base config")
            return
        for profile_key, profile_value in settings_profiles.items():
            if profile_key not in base_profiles:
                errors.append(f"settings.check_profiles.{profile_key} is not allowed")
                continue
            if not isinstance(profile_value, dict):
                errors.append(f"settings.check_profiles.{profile_key} must be an object")
                continue
            base_profile = base_profiles.get(profile_key, {})
            if not isinstance(base_profile, dict):
                errors.append(f"check_profiles.{profile_key} invalid in base config")
                continue
            template_block = self._profile_level_template(base_profile)
            for key, value in profile_value.items():
                if key == "sides":
                    errors.append(f"settings.check_profiles.{profile_key}.sides is fixed")
                    continue
                if value is None:
                    if key == "default":
                        errors.append(f"settings.check_profiles.{profile_key}.default cannot be removed")
                    continue
                if key not in base_profile and key not in ALLOWED_CHECK_PROFILE_LEVELS:
                    errors.append(f"settings.check_profiles.{profile_key}.{key} is not allowed")
                    continue
                if not isinstance(value, dict):
                    errors.append(f"settings.check_profiles.{profile_key}.{key} must be an object")
                    continue
                base_block = base_profile.get(key, {})
                if not isinstance(base_block, dict):
                    base_block = template_block
                if not isinstance(base_block, dict):
                    errors.append(f"check_profiles.{profile_key}.{key} has no template for validation")
                    continue
                for sub_key, sub_value in value.items():
                    if sub_key not in base_block:
                        errors.append(f"settings.check_profiles.{profile_key}.{key}.{sub_key} is not allowed")
                        continue
                    if sub_key == "dc":
                        if not isinstance(sub_value, int):
                            errors.append(
                                f"settings.check_profiles.{profile_key}.{key}.dc must be int"
                            )
                    elif sub_key in {"crit_success", "crit_fail"}:
                        if not self._is_int_or_int_list(sub_value):
                            errors.append(
                                f"settings.check_profiles.{profile_key}.{key}.{sub_key} must be int or list of int"
                            )

    @staticmethod
    def _is_int_or_int_list(value: Any) -> bool:
        if isinstance(value, int):
            return True
        if isinstance(value, list):
            return all(isinstance(v, int) for v in value)
        return False

    @staticmethod
    def _profile_level_template(base_profile: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        for key, value in base_profile.items():
            if key == "sides":
                continue
            if isinstance(value, dict):
                return value
        return None

    @staticmethod
    def _currency_types_from(config: Dict[str, Any]) -> List[str]:
        currency = config.get("currency", {})
        if isinstance(currency, dict):
            types = currency.get("types")
            if isinstance(types, list):
                return [t for t in types if isinstance(t, str)]
        return []
