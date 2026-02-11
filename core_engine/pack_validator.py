import json
from fractions import Fraction
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
    def _path(self, pack_file: Path, suffix: str) -> str:
        return f"{pack_file.name}:{suffix}"

    def __init__(self, root_dir: Path, config_manager: Optional[Any] = None):
        self.root_dir = root_dir
        self.facilities_dir = root_dir / "core" / "facilities"
        self.custom_packs_dir = root_dir / "custom_packs"
        self.config_path = root_dir / "core" / "config" / "bastion_config.json"
        self._config_manager = config_manager

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
        if self._config_manager:
            extra_warnings = self._config_manager.get_warnings()
            if extra_warnings:
                report["config"]["warnings"].extend(extra_warnings)
                for warn in extra_warnings:
                    logger.warning(f"Config: {warn}")


        all_pack_ids: Set[str] = set()
        all_facility_ids: Set[str] = set()

        pack_dirs = [
            ("core", self.facilities_dir),
            ("custom", self.custom_packs_dir),
        ]

        for source, pack_dir in pack_dirs:
            if not pack_dir.exists():
                if source == "core":
                    logger.warning(f"Facilities dir not found: {pack_dir}")
                continue

            for pack_file in sorted(pack_dir.glob("*.json")):
                pack_result, pack_id, facility_ids, skip_counts = self._sanitize_pack_file(pack_file, config)
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
                        "source": source,
                        "pack_id": pack_id,
                        "errors": pack_result.errors,
                        "warnings": pack_result.warnings,
                        "facility_count": len(facility_ids),
                        "skipped_facilities": skip_counts.get("facilities", 0),
                        "skipped_orders": skip_counts.get("orders", 0),
                        "skipped_effects": skip_counts.get("effects", 0),
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
        data = None
        error = None
        if self._config_manager:
            data = self._config_manager.get_config()
            if not isinstance(data, dict):
                error = "Merged config must be a JSON object."
        else:
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
            def is_int_list(value: Any) -> bool:
                return isinstance(value, list) and all(isinstance(v, int) for v in value)

            def is_int_or_int_list(value: Any) -> bool:
                return isinstance(value, int) or is_int_list(value)

            for profile_name, profile in data["check_profiles"].items():
                if not isinstance(profile, dict):
                    result.add_error(f"check_profile '{profile_name}' must be an object.")
                    continue
                sides = profile.get("sides")
                if not isinstance(sides, int) or sides < 2:
                    result.add_error(f"check_profile '{profile_name}' missing or invalid 'sides'.")
                default = profile.get("default")
                if not isinstance(default, dict):
                    result.add_error(f"check_profile '{profile_name}' missing 'default' object.")
                    continue
                if "npc_level" in default:
                    result.add_error(f"check_profile '{profile_name}.default' must not include 'npc_level'.")
                if "dc" not in default:
                    result.add_error(f"check_profile '{profile_name}.default' missing 'dc'.")
                elif not isinstance(default.get("dc"), int):
                    result.add_error(f"check_profile '{profile_name}.default.dc' must be int.")
                if "crit_success" not in default:
                    result.add_error(f"check_profile '{profile_name}.default' missing 'crit_success'.")
                elif not is_int_or_int_list(default.get("crit_success")):
                    result.add_error(f"check_profile '{profile_name}.default.crit_success' must be int or list of int.")
                if "crit_fail" not in default:
                    result.add_error(f"check_profile '{profile_name}.default' missing 'crit_fail'.")
                elif not is_int_or_int_list(default.get("crit_fail")):
                    result.add_error(f"check_profile '{profile_name}.default.crit_fail' must be int or list of int.")

                for level_key in ["apprentice", "experienced", "master"]:
                    if level_key not in profile:
                        continue
                    entry = profile.get(level_key)
                    if not isinstance(entry, dict):
                        result.add_error(f"check_profile '{profile_name}.{level_key}' must be an object.")
                        continue
                    if "npc_level" in entry:
                        result.add_error(f"check_profile '{profile_name}.{level_key}' must not include 'npc_level'.")
                    for key, value in entry.items():
                        if key not in {"dc", "crit_success", "crit_fail"}:
                            result.add_error(f"check_profile '{profile_name}.{level_key}' has unknown key '{key}'.")
                            continue
                        if key == "dc" and not isinstance(value, int):
                            result.add_error(f"check_profile '{profile_name}.{level_key}.dc' must be int.")
                        if key in {"crit_success", "crit_fail"} and not is_int_or_int_list(value):
                            result.add_error(f"check_profile '{profile_name}.{level_key}.{key}' must be int or list of int.")


        # npc_progression checks
        npc_prog = data.get("npc_progression")
        if npc_prog is None:
            result.add_warning("bastion_config.json missing npc_progression.")
        elif not isinstance(npc_prog, dict):
            result.add_error("bastion_config.json npc_progression must be an object.")
        else:
            if "xp_per_success" not in npc_prog or not isinstance(npc_prog.get("xp_per_success"), int):
                result.add_warning("npc_progression.xp_per_success missing or not int.")
            level_thresholds = npc_prog.get("level_thresholds")
            if not isinstance(level_thresholds, dict):
                result.add_warning("npc_progression.level_thresholds missing or not object.")
            level_names = npc_prog.get("level_names")
            if not isinstance(level_names, dict):
                result.add_warning("npc_progression.level_names missing or not object.")

        # currency checks
        currency = data.get("currency")
        if currency is None:
            result.add_warning("bastion_config.json missing currency.")
        elif not isinstance(currency, dict):
            result.add_error("bastion_config.json currency must be an object.")
        else:
            types = currency.get("types")
            if not isinstance(types, list) or not types:
                result.add_warning("currency.types missing or not list.")
            conversion = currency.get("conversion")
            if not isinstance(conversion, list):
                result.add_warning("currency.conversion missing or not list.")
            else:
                known_types = set(types) if isinstance(types, list) else set()
                to_set = set()
                adjacency = {t: [] for t in known_types}

                for idx, entry in enumerate(conversion):
                    if not isinstance(entry, dict):
                        result.add_warning(f"currency.conversion[{idx}] must be object.")
                        continue
                    if "from" not in entry or "to" not in entry or "rate" not in entry:
                        result.add_warning(f"currency.conversion[{idx}] missing from/to/rate.")
                        continue
                    src = entry.get("from")
                    dst = entry.get("to")
                    rate = entry.get("rate")
                    if not isinstance(rate, int) or rate <= 0:
                        result.add_warning(f"currency.conversion[{idx}].rate must be positive int.")
                        continue
                    if src not in known_types or dst not in known_types:
                        result.add_warning(f"currency.conversion[{idx}] references unknown type.")
                        continue

                    to_set.add(dst)
                    adjacency[src].append((dst, Fraction(rate, 1)))
                    adjacency[dst].append((src, Fraction(1, rate)))

                if known_types:
                    base_candidates = [t for t in types if t not in to_set]
                    if len(base_candidates) == 0:
                        result.add_error("currency has no base (every type appears as 'to').")
                        base = types[0]
                    elif len(base_candidates) > 1:
                        result.add_warning(
                            f"currency has multiple base candidates: {', '.join(base_candidates)}."
                        )
                        base = base_candidates[0]
                    else:
                        base = base_candidates[0]

                    factors = {base: Fraction(1, 1)}
                    stack = [base]
                    while stack:
                        cur = stack.pop()
                        for nxt, mult in adjacency.get(cur, []):
                            if nxt in factors:
                                if factors[nxt] != factors[cur] * mult:
                                    result.add_error(
                                        f"currency conversion inconsistent for '{nxt}'."
                                    )
                                continue
                            factors[nxt] = factors[cur] * mult
                            stack.append(nxt)

                    for t in types:
                        if t not in factors:
                            result.add_error(f"currency '{t}' not connected to base '{base}'.")
                        elif factors[t].denominator != 1:
                            result.add_error(
                                f"currency '{t}' has non-integer factor to base ({factors[t]})."
                            )

        return data, result

    @staticmethod
    def _currency_types(config: Dict[str, Any]) -> List[str]:
        currency = config.get("currency", {})
        if isinstance(currency, dict):
            types = currency.get("types")
            if isinstance(types, list):
                return [t for t in types if isinstance(t, str)]
        return []

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
                path=f"facilities[{idx}]"
            )
            result.extend(f_result)
            if f_id:
                if f_id in facility_ids:
                    result.add_error(f"{pack_file.name}: facilities[{idx}].id duplicate '{f_id}'.")
                facility_ids.add(f_id)
                if f_tier is not None:
                    facility_id_to_tier[f_id] = f_tier

        for idx, facility in enumerate(facilities):
            if not isinstance(facility, dict):
                continue
            f_id = facility.get("id")
            parent_id = facility.get("parent")
            tier = facility.get("tier")
            if tier == 1:
                if parent_id is not None:
                    result.add_error(
                        f"{pack_file.name}: facilities[{idx}].parent must be null for tier 1."
                    )
            if isinstance(parent_id, str):
                if parent_id not in facility_ids:
                    result.add_error(
                        f"{pack_file.name}: facilities[{idx}].parent '{parent_id}' not found in pack."
                    )
                elif f_id in facility_id_to_tier and parent_id in facility_id_to_tier:
                    if facility_id_to_tier[parent_id] >= facility_id_to_tier[f_id]:
                        result.add_warning(
                            f"{pack_file.name}: facilities[{idx}].parent tier >= child tier."
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


    def _sanitize_pack_file(
        self, pack_file: Path, config: Dict[str, Any]
    ) -> Tuple[ValidationResult, Optional[str], Set[str], Dict[str, int]]:
        result = ValidationResult()
        skip_counts = {"facilities": 0, "orders": 0, "effects": 0}

        data, error = self._load_json(pack_file)
        if error:
            result.add_error(error)
            return result, None, set(), skip_counts

        if not isinstance(data, dict):
            result.add_error(f"{pack_file} must be a JSON object.")
            return result, None, set(), skip_counts

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
            return result, pack_id, set(), skip_counts
        if len(facilities) == 0:
            result.add_warning(f"{pack_file}: facilities list is empty.")

        custom_mechanics = data.get("custom_mechanics", [])
        mechanics_result, mechanics_index = self._validate_custom_mechanics(custom_mechanics, pack_file)
        result.extend(mechanics_result)

        facility_ids: Set[str] = set()
        sanitized_facilities = []

        for idx, facility in enumerate(facilities):
            fac_res, fac_data, fac_id, fac_tier = self._sanitize_facility(
                facility,
                pack_file=pack_file,
                index=idx,
                config=config,
                mechanics_index=mechanics_index,
                path=f"facilities[{idx}]",
                skip_counts=skip_counts,
            )
            result.extend(fac_res)
            if fac_data is None or not fac_id:
                skip_counts["facilities"] += 1
                continue
            if fac_id in facility_ids:
                result.add_error(f"{pack_file.name}: facilities[{idx}].id duplicate '{fac_id}'.")
                skip_counts["facilities"] += 1
                continue
            facility_ids.add(fac_id)
            sanitized_facilities.append(fac_data)

        # Parent validation (skip invalid facilities)
        removed = True
        while removed:
            removed = False
            valid_ids = {f.get("id") for f in sanitized_facilities if isinstance(f, dict)}
            new_list = []
            for fac in sanitized_facilities:
                path = fac.pop("__path", "facilities[?]") if isinstance(fac, dict) else "facilities[?]"
                fac["__path"] = path
                tier = fac.get("tier") if isinstance(fac, dict) else None
                parent = fac.get("parent") if isinstance(fac, dict) else None
                if tier == 1 and parent is not None:
                    result.add_error(f"{pack_file.name}: {path}.parent must be null for tier 1.")
                    skip_counts["facilities"] += 1
                    removed = True
                    continue
                if isinstance(parent, str) and parent not in valid_ids:
                    result.add_error(f"{pack_file.name}: {path}.parent '{parent}' not found in pack.")
                    skip_counts["facilities"] += 1
                    removed = True
                    continue
                new_list.append(fac)
            sanitized_facilities = new_list

        # Remove internal path marker
        for fac in sanitized_facilities:
            if isinstance(fac, dict) and "__path" in fac:
                fac.pop("__path", None)

        return result, pack_id, facility_ids, skip_counts

    def _sanitize_facility(
        self,
        facility: Any,
        pack_file: Path,
        index: int,
        config: Dict[str, Any],
        mechanics_index: Dict[str, Set[str]],
        path: str,
        skip_counts: Dict[str, int],
    ) -> Tuple[ValidationResult, Optional[Dict[str, Any]], Optional[str], Optional[int]]:
        result = ValidationResult()
        facility_errors = False

        if not isinstance(facility, dict):
            result.add_error(f"{pack_file.name}: {path} must be an object.")
            return result, None, None, None

        facility_id = facility.get("id")
        if not facility_id or not isinstance(facility_id, str):
            result.add_error(f"{pack_file.name}: {path}.id missing or invalid.")
            facility_errors = True
        elif " " in facility_id:
            result.add_warning(f"{pack_file.name}: {path}.id contains spaces ('{facility_id}').")

        name = facility.get("name")
        if not name or not isinstance(name, str):
            result.add_error(f"{pack_file.name}: {path}.name missing or invalid.")
            facility_errors = True

        tier = facility.get("tier")
        if not isinstance(tier, int):
            result.add_error(f"{pack_file.name}: {path}.tier missing or invalid.")
            facility_errors = True

        parent = facility.get("parent")
        if isinstance(tier, int) and tier != 1 and parent is None:
            result.add_error(f"{pack_file.name}: {path}.parent missing for tier {tier}.")
            facility_errors = True

        build = facility.get("build")
        if not isinstance(build, dict):
            result.add_error(f"{pack_file.name}: {path}.build missing or invalid.")
            facility_errors = True
        else:
            cost = build.get("cost")
            if not isinstance(cost, dict):
                result.add_error(f"{pack_file.name}: {path}.build.cost must be object.")
                facility_errors = True
            duration = build.get("duration_turns")
            if not isinstance(duration, int) or duration <= 0:
                result.add_error(
                    f"{pack_file.name}: {path}.build.duration_turns must be positive int."
                )
                facility_errors = True

        npc_slots = facility.get("npc_slots")
        if not isinstance(npc_slots, int) or npc_slots < 0:
            result.add_error(f"{pack_file.name}: {path}.npc_slots must be >= 0 int.")
            facility_errors = True

        npc_allowed = facility.get("npc_allowed_professions")
        if npc_allowed is not None and not isinstance(npc_allowed, list):
            result.add_error(f"{pack_file.name}: {path}.npc_allowed_professions must be list.")
            facility_errors = True

        orders = facility.get("orders")
        if not isinstance(orders, list):
            result.add_error(f"{pack_file.name}: {path}.orders must be list.")
            facility_errors = True

        if facility_errors:
            return result, None, facility_id, tier if isinstance(tier, int) else None

        sanitized_orders = []
        order_ids: Set[str] = set()
        for o_idx, order in enumerate(orders):
            o_result, o_data, o_id = self._sanitize_order(
                order,
                pack_file=pack_file,
                config=config,
                mechanics_index=mechanics_index,
                path=f"{path}.orders[{o_idx}]",
                skip_counts=skip_counts,
            )
            result.extend(o_result)
            if o_data is None or not o_id:
                skip_counts["orders"] += 1
                continue
            if o_id in order_ids:
                result.add_error(f"{pack_file.name}: {path}.orders duplicate id '{o_id}'.")
                skip_counts["orders"] += 1
                continue
            order_ids.add(o_id)
            sanitized_orders.append(o_data)

        sanitized_facility = dict(facility)
        sanitized_facility["orders"] = sanitized_orders
        sanitized_facility["__path"] = path

        return result, sanitized_facility, facility_id, tier if isinstance(tier, int) else None

    def _sanitize_order(
        self,
        order: Any,
        pack_file: Path,
        config: Dict[str, Any],
        mechanics_index: Dict[str, Set[str]],
        path: str,
        skip_counts: Dict[str, int],
    ) -> Tuple[ValidationResult, Optional[Dict[str, Any]], Optional[str]]:
        result = ValidationResult()
        order_errors = False

        if not isinstance(order, dict):
            result.add_error(f"{pack_file.name}: {path} must be object.")
            return result, None, None

        order_id = order.get("id")
        if not order_id or not isinstance(order_id, str):
            result.add_error(f"{pack_file.name}: {path}.id missing.")
            order_errors = True
        elif " " in order_id:
            result.add_warning(f"{pack_file.name}: {path}.id contains spaces ('{order_id}').")

        if "name" not in order or not isinstance(order["name"], str):
            result.add_error(f"{pack_file.name}: {path}.name missing.")
            order_errors = True

        duration = order.get("duration_turns")
        if not isinstance(duration, int) or duration <= 0:
            result.add_error(f"{pack_file.name}: {path}.duration_turns must be positive int.")
            order_errors = True

        outcome = order.get("outcome")
        if not isinstance(outcome, dict):
            result.add_error(f"{pack_file.name}: {path}.outcome missing or invalid.")
            order_errors = True

        if order_errors:
            return result, None, order_id

        check_profile = outcome.get("check_profile")
        if check_profile is not None:
            profiles = config.get("check_profiles", {})
            if check_profile not in profiles:
                result.add_error(
                    f"{pack_file.name}: {path}.outcome.check_profile unknown '{check_profile}'."
                )
                return result, None, order_id

        sanitized_outcome = dict(outcome)
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
                result.add_error(f"{pack_file.name}: {path}.outcome.{block_key} must be object.")
                return result, None, order_id
            effects = block.get("effects")
            if not isinstance(effects, list):
                result.add_error(f"{pack_file.name}: {path}.outcome.{block_key}.effects must be list.")
                return result, None, order_id

            sanitized_effects = []
            for e_idx, effect in enumerate(effects):
                e_result, e_data = self._sanitize_effect(
                    effect,
                    pack_file=pack_file,
                    config=config,
                    mechanics_index=mechanics_index,
                    path=f"{path}.outcome.{block_key}.effects[{e_idx}]",
                )
                result.extend(e_result)
                if e_data is None:
                    skip_counts["effects"] += 1
                    continue
                sanitized_effects.append(e_data)

            new_block = dict(block)
            new_block["effects"] = sanitized_effects
            sanitized_outcome[block_key] = new_block

        sanitized_order = dict(order)
        sanitized_order["outcome"] = sanitized_outcome

        return result, sanitized_order, order_id

    def _sanitize_effect(
        self,
        effect: Any,
        pack_file: Path,
        config: Dict[str, Any],
        mechanics_index: Dict[str, Set[str]],
        path: str,
    ) -> Tuple[ValidationResult, Optional[Dict[str, Any]]]:
        result = ValidationResult()
        if not isinstance(effect, dict):
            result.add_error(f"{pack_file.name}: {path} must be object.")
            return result, None

        keys = set(effect.keys())
        if "currency" in keys or "amount" in keys:
            result.add_warning(
                f"{pack_file.name}: {path} uses currency/amount; prefer configured currency keys."
            )

        currency_types = self._currency_types(config)
        known_keys = set(currency_types)
        known_keys.update({"item", "qty", "stat", "delta", "log", "event", "random_event", "trigger"})
        if not keys & known_keys:
            result.add_warning(
                f"{pack_file.name}: {path} unknown effect keys: {', '.join(sorted(keys))}."
            )

        if "event" in effect:
            event_id = effect.get("event")
            if isinstance(event_id, str):
                if event_id not in mechanics_index["event_ids"]:
                    result.add_error(
                        f"{pack_file.name}: {path}.event '{event_id}' not found in event_table."
                    )
                    return result, None
        if "random_event" in effect:
            ref = effect.get("random_event")
            if isinstance(ref, str):
                if ref.startswith("group:"):
                    group_id = ref[len("group:"):]
                    if group_id not in mechanics_index["event_groups"]:
                        result.add_error(
                            f"{pack_file.name}: {path}.random_event group '{group_id}' not found."
                        )
                        return result, None
                else:
                    result.add_warning(
                        f"{pack_file.name}: {path}.random_event '{ref}' should be 'group:<id>'."
                    )
        if "trigger" in effect:
            trigger_id = effect.get("trigger")
            if isinstance(trigger_id, str):
                if trigger_id not in mechanics_index["formula_ids"]:
                    result.add_warning(
                        f"{pack_file.name}: {path}.trigger '{trigger_id}' not found in formula_engine mechanics."
                    )

        return result, effect

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
        path: str,
    ) -> Tuple[ValidationResult, Optional[str], Optional[int]]:
        result = ValidationResult()
        if not isinstance(facility, dict):
            result.add_error(f"{pack_file.name}: {path} must be an object.")
            return result, None, None

        facility_id = facility.get("id")
        if not facility_id or not isinstance(facility_id, str):
            result.add_error(f"{pack_file.name}: {path}.id missing or invalid.")
        elif " " in facility_id:
            result.add_warning(f"{pack_file.name}: {path}.id contains spaces ('{facility_id}').")

        name = facility.get("name")
        if not name or not isinstance(name, str):
            result.add_error(f"{pack_file.name}: {path}.name missing or invalid.")

        tier = facility.get("tier")
        if not isinstance(tier, int):
            result.add_error(f"{pack_file.name}: {path}.tier missing or invalid.")

        parent = facility.get("parent")
        if tier != 1 and parent is None:
            result.add_error(f"{pack_file.name}: {path}.parent missing for tier {tier}.")

        build = facility.get("build")
        if not isinstance(build, dict):
            result.add_error(f"{pack_file.name}: {path}.build missing or invalid.")
        else:
            cost = build.get("cost")
            if not isinstance(cost, dict):
                result.add_error(f"{pack_file.name}: {path}.build.cost must be object.")
            duration = build.get("duration_turns")
            if not isinstance(duration, int) or duration <= 0:
                result.add_error(
                    f"{pack_file.name}: {path}.build.duration_turns must be positive int."
                )

        npc_slots = facility.get("npc_slots")
        if not isinstance(npc_slots, int) or npc_slots < 0:
            result.add_error(f"{pack_file.name}: {path}.npc_slots must be >= 0 int.")

        npc_allowed = facility.get("npc_allowed_professions")
        if npc_allowed is not None and not isinstance(npc_allowed, list):
            result.add_error(f"{pack_file.name}: {path}.npc_allowed_professions must be list.")

        orders = facility.get("orders")
        if not isinstance(orders, list):
            result.add_error(f"{pack_file.name}: {path}.orders must be list.")
            return result, facility_id, tier if isinstance(tier, int) else None

        order_ids: Set[str] = set()
        for o_idx, order in enumerate(orders):
            o_result, o_id = self._validate_order(
                order, pack_file, facility_id, o_idx, config, mechanics_index, f"{path}.orders[{o_idx}]"
            )
            result.extend(o_result)
            if o_id:
                if o_id in order_ids:
                    result.add_error(
                        f"{pack_file.name}: {path}.orders duplicate id '{o_id}'."
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
        path: str,
    ) -> Tuple[ValidationResult, Optional[str]]:
        result = ValidationResult()
        if not isinstance(order, dict):
            result.add_error(f"{pack_file.name}: {path} must be object.")
            return result, None

        order_id = order.get("id")
        if not order_id or not isinstance(order_id, str):
            result.add_error(f"{pack_file.name}: {path}.id missing.")
        elif " " in order_id:
            result.add_warning(
                f"{pack_file.name}: {path}.id contains spaces ('{order_id}')."
            )

        if "name" not in order or not isinstance(order["name"], str):
            result.add_error(f"{pack_file.name}: {path}.name missing.")

        duration = order.get("duration_turns")
        if not isinstance(duration, int) or duration <= 0:
            result.add_error(
                f"{pack_file.name}: {path}.duration_turns must be positive int."
            )

        outcome = order.get("outcome")
        if not isinstance(outcome, dict):
            result.add_error(f"{pack_file.name}: {path}.outcome missing or invalid.")
            return result, order_id

        check_profile = outcome.get("check_profile")
        if check_profile is not None:
            profiles = config.get("check_profiles", {})
            if check_profile not in profiles:
                result.add_error(
                    f"{pack_file.name}: {path}.outcome.check_profile unknown '{check_profile}'."
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
                    f"{pack_file.name}: {path}.outcome.{block_key} must be object."
                )
                continue
            effects = block.get("effects")
            if not isinstance(effects, list):
                result.add_error(
                    f"{pack_file.name}: {path}.outcome.{block_key}.effects must be list."
                )
                continue
            for e_idx, effect in enumerate(effects):
                e_result = self._validate_effect(
                    effect,
                    pack_file,
                    facility_id,
                    order_id,
                    block_key,
                    e_idx,
                    mechanics_index,
                    f"{path}.outcome.{block_key}.effects[{e_idx}]",
                    config,
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
        path: str,
        config: Dict[str, Any],
    ) -> ValidationResult:
        result = ValidationResult()
        if not isinstance(effect, dict):
            result.add_error(
                f"{pack_file.name}: {path} must be object."
            )
            return result

        keys = set(effect.keys())
        if "currency" in keys or "amount" in keys:
            result.add_warning(
                f"{pack_file.name}: {path} uses currency/amount; prefer configured currency keys."
            )

        currency_types = self._currency_types(config)
        known_keys = set(currency_types)
        known_keys.update({"item", "qty", "stat", "delta", "log", "event", "random_event", "trigger"})
        if not keys & known_keys:
            result.add_warning(
                f"{pack_file.name}: {path} unknown effect keys: {', '.join(sorted(keys))}."
            )

        if "event" in effect:
            event_id = effect.get("event")
            if isinstance(event_id, str):
                if event_id not in mechanics_index["event_ids"]:
                    result.add_error(
                        f"{pack_file.name}: {path}.event '{event_id}' not found in event_table."
                    )
        if "random_event" in effect:
            ref = effect.get("random_event")
            if isinstance(ref, str):
                if ref.startswith("group:"):
                    group_id = ref[len("group:") :]
                    if group_id not in mechanics_index["event_groups"]:
                        result.add_error(
                            f"{pack_file.name}: {path}.random_event group '{group_id}' not found."
                        )
                else:
                    result.add_warning(
                        f"{pack_file.name}: {path}.random_event '{ref}' should be 'group:<id>'."
                    )
        if "trigger" in effect:
            trigger_id = effect.get("trigger")
            if isinstance(trigger_id, str):
                if trigger_id not in mechanics_index["formula_ids"]:
                    result.add_warning(
                        f"{pack_file.name}: {path}.trigger '{trigger_id}' not found in formula_engine mechanics."
                    )

        return result
