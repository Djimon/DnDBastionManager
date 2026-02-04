import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

from .logger import setup_logger

logger = setup_logger("pack_validator")


@dataclass
class ValidationResult:
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    def add_error(self, message: str) -> None:
        self.errors.append(message)

    def add_warning(self, message: str) -> None:
        self.warnings.append(message)

    def extend(self, other: "ValidationResult", prefix: str = "") -> None:
        for err in other.errors:
            self.errors.append(f"{prefix}{err}")
        for warn in other.warnings:
            self.warnings.append(f"{prefix}{warn}")


class PackValidator:
    def __init__(self, root_dir: Path):
        self.root_dir = root_dir
        self.facilities_dir = root_dir / "core" / "facilities"
        self.config_path = root_dir / "core" / "config" / "bastion_config.json"

    def validate_all(self) -> Dict[str, Any]:
        logger.info("Pack validation started")
        report = {
            "success": True,
            "errors": [],
            "warnings": [],
            "config": {"errors": [], "warnings": []},
            "packs": [],
        }

        config, config_result = self._load_and_validate_config()
        report["config"]["errors"] = config_result.errors
        report["config"]["warnings"] = config_result.warnings
        if config_result.errors:
            for err in config_result.errors:
                logger.error(f"Config: {err}")
        if config_result.warnings:
            for warn in config_result.warnings:
                logger.warning(f"Config: {warn}")


        all_pack_ids: Set[str] = set()
        all_facility_ids: Set[str] = set()

        for pack_file in sorted(self.facilities_dir.glob("*.json")):
            pack_result, pack_id, facility_ids = self._validate_pack_file(pack_file, config)
            logger.info(f"Pack file: {pack_file}")
            if pack_result.errors:
                for err in pack_result.errors:
                    logger.error(err)
            if pack_result.warnings:
                for warn in pack_result.warnings:
                    logger.warning(warn)
            if not pack_result.errors and not pack_result.warnings:
                logger.info(f"Pack OK: {pack_file}")
            report["packs"].append(
                {
                    "file": str(pack_file),
                    "pack_id": pack_id,
                    "errors": pack_result.errors,
                    "warnings": pack_result.warnings,
                    "facility_count": len(facility_ids),
                }
            )
            if pack_id:
                all_pack_ids.add(pack_id)
            all_facility_ids.update(facility_ids)
            report["errors"].extend(pack_result.errors)
            report["warnings"].extend(pack_result.warnings)

        report["success"] = len(report["errors"]) == 0 and len(report["config"]["errors"]) == 0
        report["errors"].extend(report["config"]["errors"])
        report["warnings"].extend(report["config"]["warnings"])

        total_errors = len(report.get("errors", []))
        total_warnings = len(report.get("warnings", []))
        logger.info(f"Pack validation completed: {total_errors} errors, {total_warnings} warnings")
        return report

    def _load_json(self, path: Path) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f), None
        except FileNotFoundError:
            return None, f"File not found: {path}"
        except json.JSONDecodeError as e:
            return None, f"Invalid JSON in {path}: {e}"
        except Exception as e:
            return None, f"Error reading {path}: {e}"

    def _load_and_validate_config(self) -> Tuple[Dict[str, Any], ValidationResult]:
        result = ValidationResult()
        data, error = self._load_json(self.config_path)
        if error:
            result.add_error(error)
            return {}, result

        if not isinstance(data, dict):
            result.add_error("bastion_config.json must be a JSON object.")
            return {}, result

        if "check_profiles" not in data or not isinstance(data["check_profiles"], dict):
            result.add_error("bastion_config.json missing 'check_profiles' object.")
        else:
            for profile_name, profile in data["check_profiles"].items():
                if not isinstance(profile, dict):
                    result.add_error(f"check_profile '{profile_name}' must be an object.")
                    continue
                for level_key in ["apprentice", "experienced", "master"]:
                    if level_key not in profile:
                        result.add_warning(f"check_profile '{profile_name}' missing '{level_key}'.")
                        continue
                    entry = profile[level_key]
                    if not isinstance(entry, dict):
                        result.add_error(f"check_profile '{profile_name}.{level_key}' must be an object.")
                        continue
                    if "dc" not in entry:
                        result.add_error(f"check_profile '{profile_name}.{level_key}' missing 'dc'.")
                    if "npc_level" not in entry:
                        result.add_warning(f"check_profile '{profile_name}.{level_key}' missing 'npc_level'.")

        return data, result

    def _validate_pack_file(
        self, pack_file: Path, config: Dict[str, Any]
    ) -> Tuple[ValidationResult, Optional[str], Set[str]]:
        result = ValidationResult()
        data, error = self._load_json(pack_file)
        if error:
            result.add_error(error)
            return result, None, set()

        if not isinstance(data, dict):
            result.add_error(f"{pack_file} must be a JSON object.")
            return result, None, set()

        pack_id = data.get("pack_id")
        if not pack_id or not isinstance(pack_id, str):
            result.add_error(f"{pack_file}: missing or invalid 'pack_id'.")
        elif " " in pack_id:
            result.add_warning(f"{pack_file}: pack_id contains spaces ('{pack_id}').")

        if "name" not in data or not isinstance(data["name"], str):
            result.add_error(f"{pack_file}: missing or invalid 'name'.")

        if "version" not in data:
            result.add_warning(f"{pack_file}: missing 'version'.")

        facilities = data.get("facilities")
        if not isinstance(facilities, list):
            result.add_error(f"{pack_file}: 'facilities' must be a list.")
            return result, pack_id, set()
        if len(facilities) == 0:
            result.add_warning(f"{pack_file}: facilities list is empty.")

        custom_mechanics = data.get("custom_mechanics", [])
        mechanics_result, mechanics_index = self._validate_custom_mechanics(custom_mechanics, pack_file)
        result.extend(mechanics_result)

        facility_ids: Set[str] = set()
        facility_id_to_tier: Dict[str, int] = {}

        for idx, facility in enumerate(facilities):
            f_result, f_id, f_tier = self._validate_facility(
                facility,
                pack_file=pack_file,
                index=idx,
                config=config,
                mechanics_index=mechanics_index,
            )
            result.extend(f_result)
            if f_id:
                if f_id in facility_ids:
                    result.add_error(f"{pack_file}: duplicate facility id '{f_id}'.")
                facility_ids.add(f_id)
                if f_tier is not None:
                    facility_id_to_tier[f_id] = f_tier

        for facility in facilities:
            if not isinstance(facility, dict):
                continue
            f_id = facility.get("id")
            parent_id = facility.get("parent")
            tier = facility.get("tier")
            if tier == 1:
                if parent_id is not None:
                    result.add_error(
                        f"{pack_file}: facility '{f_id}' tier 1 must have parent = null."
                    )
            if isinstance(parent_id, str):
                if parent_id not in facility_ids:
                    result.add_error(
                        f"{pack_file}: facility '{f_id}' parent '{parent_id}' not found in pack."
                    )
                elif f_id in facility_id_to_tier and parent_id in facility_id_to_tier:
                    if facility_id_to_tier[parent_id] >= facility_id_to_tier[f_id]:
                        result.add_warning(
                            f"{pack_file}: facility '{f_id}' tier {facility_id_to_tier[f_id]} "
                            f"has parent with tier {facility_id_to_tier[parent_id]}."
                        )

        return result, pack_id, facility_ids

    def _validate_custom_mechanics(
        self, mechanics: Any, pack_file: Path
    ) -> Tuple[ValidationResult, Dict[str, Set[str]]]:
        result = ValidationResult()
        index = {"event_groups": set(), "event_ids": set(), "formula_ids": set(), "stat_counters": set()}

        if mechanics is None:
            return result, index
        if not isinstance(mechanics, list):
            result.add_error(f"{pack_file}: custom_mechanics must be a list.")
            return result, index

        for mech in mechanics:
            if not isinstance(mech, dict):
                result.add_error(f"{pack_file}: custom_mechanics entries must be objects.")
                continue
            mech_id = mech.get("id") or mech.get("name")
            mech_type = mech.get("type")
            if not mech_type:
                result.add_error(f"{pack_file}: custom_mechanics entry missing 'type'.")
                continue
            if mech_type == "event_table":
                self._index_event_table(mech, pack_file, result, index)
            elif mech_type == "formula_engine":
                if mech_id:
                    index["formula_ids"].add(mech_id)
            elif mech_type == "stat_counter":
                if mech_id:
                    index["stat_counters"].add(mech_id)
            elif mech_type == "market_tracker":
                continue
            else:
                result.add_warning(f"{pack_file}: unknown custom_mechanics type '{mech_type}'.")

        return result, index

    def _index_event_table(
        self,
        mech: Dict[str, Any],
        pack_file: Path,
        result: ValidationResult,
        index: Dict[str, Set[str]],
    ) -> None:
        config = mech.get("config", {})
        groups = config.get("groups")
        if not isinstance(groups, list):
            result.add_error(f"{pack_file}: event_table config.groups must be a list.")
            return
        for group in groups:
            if not isinstance(group, dict):
                continue
            group_id = group.get("id")
            if group_id:
                index["event_groups"].add(group_id)
            entries = group.get("entries", [])
            if isinstance(entries, list):
                for entry in entries:
                    if isinstance(entry, dict) and entry.get("id"):
                        index["event_ids"].add(entry["id"])

    def _validate_facility(
        self,
        facility: Any,
        pack_file: Path,
        index: int,
        config: Dict[str, Any],
        mechanics_index: Dict[str, Set[str]],
    ) -> Tuple[ValidationResult, Optional[str], Optional[int]]:
        result = ValidationResult()
        if not isinstance(facility, dict):
            result.add_error(f"{pack_file}: facility[{index}] must be an object.")
            return result, None, None

        facility_id = facility.get("id")
        if not facility_id or not isinstance(facility_id, str):
            result.add_error(f"{pack_file}: facility[{index}] missing or invalid 'id'.")
        elif " " in facility_id:
            result.add_warning(f"{pack_file}: facility id contains spaces ('{facility_id}').")

        name = facility.get("name")
        if not name or not isinstance(name, str):
            result.add_error(f"{pack_file}: facility[{index}] missing or invalid 'name'.")

        tier = facility.get("tier")
        if not isinstance(tier, int):
            result.add_error(f"{pack_file}: facility[{index}] missing or invalid 'tier'.")

        parent = facility.get("parent")
        if tier != 1 and parent is None:
            result.add_error(f"{pack_file}: facility '{facility_id}' tier {tier} missing 'parent'.")

        build = facility.get("build")
        if not isinstance(build, dict):
            result.add_error(f"{pack_file}: facility '{facility_id}' missing or invalid 'build'.")
        else:
            cost = build.get("cost")
            if not isinstance(cost, dict):
                result.add_error(f"{pack_file}: facility '{facility_id}' build.cost must be object.")
            duration = build.get("duration_turns")
            if not isinstance(duration, int) or duration <= 0:
                result.add_error(
                    f"{pack_file}: facility '{facility_id}' build.duration_turns must be positive int."
                )

        npc_slots = facility.get("npc_slots")
        if not isinstance(npc_slots, int) or npc_slots < 0:
            result.add_error(f"{pack_file}: facility '{facility_id}' npc_slots must be >= 0 int.")

        npc_allowed = facility.get("npc_allowed_professions")
        if npc_allowed is not None and not isinstance(npc_allowed, list):
            result.add_error(f"{pack_file}: facility '{facility_id}' npc_allowed_professions must be list.")

        orders = facility.get("orders")
        if not isinstance(orders, list):
            result.add_error(f"{pack_file}: facility '{facility_id}' orders must be list.")
            return result, facility_id, tier if isinstance(tier, int) else None

        order_ids: Set[str] = set()
        for o_idx, order in enumerate(orders):
            o_result, o_id = self._validate_order(
                order, pack_file, facility_id, o_idx, config, mechanics_index
            )
            result.extend(o_result)
            if o_id:
                if o_id in order_ids:
                    result.add_error(
                        f"{pack_file}: facility '{facility_id}' duplicate order id '{o_id}'."
                    )
                order_ids.add(o_id)

        return result, facility_id, tier if isinstance(tier, int) else None

    def _validate_order(
        self,
        order: Any,
        pack_file: Path,
        facility_id: Optional[str],
        index: int,
        config: Dict[str, Any],
        mechanics_index: Dict[str, Set[str]],
    ) -> Tuple[ValidationResult, Optional[str]]:
        result = ValidationResult()
        if not isinstance(order, dict):
            result.add_error(f"{pack_file}: order[{index}] in facility '{facility_id}' must be object.")
            return result, None

        order_id = order.get("id")
        if not order_id or not isinstance(order_id, str):
            result.add_error(f"{pack_file}: facility '{facility_id}' order[{index}] missing 'id'.")
        elif " " in order_id:
            result.add_warning(
                f"{pack_file}: facility '{facility_id}' order id contains spaces ('{order_id}')."
            )

        if "name" not in order or not isinstance(order["name"], str):
            result.add_error(f"{pack_file}: facility '{facility_id}' order '{order_id}' missing name.")

        duration = order.get("duration_turns")
        if not isinstance(duration, int) or duration <= 0:
            result.add_error(
                f"{pack_file}: facility '{facility_id}' order '{order_id}' duration_turns must be positive int."
            )

        outcome = order.get("outcome")
        if not isinstance(outcome, dict):
            result.add_error(f"{pack_file}: facility '{facility_id}' order '{order_id}' missing outcome.")
            return result, order_id

        check_profile = outcome.get("check_profile")
        if check_profile is not None:
            profiles = config.get("check_profiles", {})
            if check_profile not in profiles:
                result.add_error(
                    f"{pack_file}: facility '{facility_id}' order '{order_id}' "
                    f"unknown check_profile '{check_profile}'."
                )

        for block_key in [
            "on_success",
            "on_failure",
            "on_critical_success",
            "on_critical_failure",
        ]:
            block = outcome.get(block_key)
            if block is None:
                continue
            if not isinstance(block, dict):
                result.add_error(
                    f"{pack_file}: facility '{facility_id}' order '{order_id}' {block_key} must be object."
                )
                continue
            effects = block.get("effects")
            if not isinstance(effects, list):
                result.add_error(
                    f"{pack_file}: facility '{facility_id}' order '{order_id}' {block_key}.effects must be list."
                )
                continue
            for e_idx, effect in enumerate(effects):
                e_result = self._validate_effect(
                    effect, pack_file, facility_id, order_id, block_key, e_idx, mechanics_index
                )
                result.extend(e_result)

        return result, order_id

    def _validate_effect(
        self,
        effect: Any,
        pack_file: Path,
        facility_id: Optional[str],
        order_id: Optional[str],
        block_key: str,
        index: int,
        mechanics_index: Dict[str, Set[str]],
    ) -> ValidationResult:
        result = ValidationResult()
        if not isinstance(effect, dict):
            result.add_error(
                f"{pack_file}: facility '{facility_id}' order '{order_id}' {block_key}.effects[{index}] must be object."
            )
            return result

        keys = set(effect.keys())
        if "currency" in keys or "amount" in keys:
            result.add_warning(
                f"{pack_file}: facility '{facility_id}' order '{order_id}' "
                f"{block_key}.effects[{index}] uses currency/amount; prefer gold/silver/copper."
            )

        known_keys = {"gold", "silver", "copper", "item", "qty", "stat", "delta", "log", "event", "random_event", "trigger"}
        if not keys & known_keys:
            result.add_warning(
                f"{pack_file}: facility '{facility_id}' order '{order_id}' {block_key}.effects[{index}] "
                f"unknown effect keys: {', '.join(sorted(keys))}."
            )

        if "event" in effect:
            event_id = effect.get("event")
            if isinstance(event_id, str):
                if event_id not in mechanics_index["event_ids"]:
                    result.add_error(
                        f"{pack_file}: facility '{facility_id}' order '{order_id}' "
                        f"event '{event_id}' not found in event_table."
                    )
        if "random_event" in effect:
            ref = effect.get("random_event")
            if isinstance(ref, str):
                if ref.startswith("group:"):
                    group_id = ref[len("group:") :]
                    if group_id not in mechanics_index["event_groups"]:
                        result.add_error(
                            f"{pack_file}: facility '{facility_id}' order '{order_id}' "
                            f"random_event group '{group_id}' not found."
                        )
                else:
                    result.add_warning(
                        f"{pack_file}: facility '{facility_id}' order '{order_id}' "
                        f"random_event '{ref}' should be 'group:<id>'."
                    )
        if "trigger" in effect:
            trigger_id = effect.get("trigger")
            if isinstance(trigger_id, str):
                if trigger_id not in mechanics_index["formula_ids"]:
                    result.add_warning(
                        f"{pack_file}: facility '{facility_id}' order '{order_id}' "
                        f"trigger '{trigger_id}' not found in formula_engine mechanics."
                    )

        return result
