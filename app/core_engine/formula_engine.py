import ast
import math
import random
import re
from typing import Any, Dict, List, Optional, Tuple

from .facility_helpers import coerce_number, currency_to_base, is_number, round_commercial


class FormulaEngine:
    def __init__(
        self,
        ledger: Any,
        get_internal_int_setting: Any,
        get_check_profile_sides: Any,
    ) -> None:
        self._ledger = ledger
        self._get_internal_int_setting = get_internal_int_setting
        self._get_check_profile_sides = get_check_profile_sides

    def _expand_formula_triggers(
        self,
        formula_index: Dict[str, Any],
        session_state: Dict[str, Any],
        effects: List[Dict[str, Any]],
        facility_id: Optional[str],
        order_id: Optional[str],
        order_entry: Optional[Dict[str, Any]] = None,
    ) -> Tuple[List[Dict[str, Any]], List[str]]:
        if not session_state or not isinstance(effects, list):
            return effects, []

        resolved: List[Dict[str, Any]] = []
        errors: List[str] = []
        stored_inputs_all = {}
        if isinstance(order_entry, dict) and isinstance(order_entry.get("formula_inputs"), dict):
            stored_inputs_all = order_entry.get("formula_inputs", {})

        for effect in effects:
            if not isinstance(effect, dict):
                continue
            trigger_id = effect.get("trigger")
            if isinstance(trigger_id, str) and trigger_id:
                formula_def = formula_index.get(trigger_id) if isinstance(formula_index, dict) else None
                if not formula_def:
                    errors.append(f"Formula not found: {trigger_id}")
                else:
                    stored_inputs = stored_inputs_all.get(trigger_id, {}) if isinstance(stored_inputs_all, dict) else {}
                    missing = self._missing_formula_inputs(formula_def, stored_inputs)
                    if missing:
                        errors.append("Formula inputs missing")
                    else:
                        formula_effects, formula_errors = self._execute_formula_engine(
                            session_state,
                            formula_def,
                            stored_inputs,
                        )
                        if formula_errors:
                            errors.extend(formula_errors)
                        else:
                            resolved.extend(formula_effects)
            trimmed = {k: v for k, v in effect.items() if k != "trigger"}
            if trimmed:
                resolved.append(trimmed)

        return resolved, errors

    def _normalize_formula_source(self, source: Any) -> Optional[str]:
        if not isinstance(source, str):
            return None
        source = source.strip().lower()
        return source or None

    def _is_formula_user_input_source(self, source: Any) -> bool:
        return self._normalize_formula_source(source) in {"number", "check"}

    def _missing_formula_inputs(self, formula_def: Dict[str, Any], stored_inputs: Any) -> List[str]:
        config = formula_def.get("config", {}) if isinstance(formula_def, dict) else {}
        inputs = config.get("inputs", []) if isinstance(config.get("inputs"), list) else []
        missing = []
        for input_def in inputs:
            if not isinstance(input_def, dict):
                continue
            source = self._normalize_formula_source(input_def.get("source"))
            if source not in {"number", "check"}:
                continue
            name = input_def.get("name")
            if not isinstance(name, str) or not name:
                continue
            if input_def.get("default") is not None:
                continue
            value = stored_inputs.get(name) if isinstance(stored_inputs, dict) else None
            if value is None or (isinstance(value, str) and not value.strip()):
                missing.append(name)
                continue
            try:
                numeric = float(value)
            except (TypeError, ValueError):
                missing.append(name)
                continue
            if source == "check":
                sides = self._get_check_profile_sides(input_def.get("check_profile"))
                if sides is None or not numeric.is_integer():
                    missing.append(name)
                    continue
                if int(numeric) < 1 or int(numeric) > sides:
                    missing.append(name)
        return missing

    def _execute_formula_engine(
        self,
        session_state: Dict[str, Any],
        formula_def: Dict[str, Any],
        stored_inputs: Any,
    ) -> Tuple[List[Dict[str, Any]], List[str]]:
        config = formula_def.get("config", {}) if isinstance(formula_def, dict) else {}
        inputs = config.get("inputs", []) if isinstance(config.get("inputs"), list) else []
        calculations = config.get("calculations", []) if isinstance(config.get("calculations"), list) else []
        effects = config.get("effects", []) if isinstance(config.get("effects"), list) else []

        variables, errors = self._build_formula_inputs(inputs, session_state, stored_inputs)
        if errors:
            return [], errors

        for calc in calculations:
            if not isinstance(calc, dict):
                continue
            name = calc.get("name")
            if not isinstance(name, str) or not name:
                continue
            value = 0
            if "formula" in calc and isinstance(calc.get("formula"), str):
                value = self._eval_formula_expression(calc.get("formula"), variables, errors)
            elif "conditions" in calc and isinstance(calc.get("conditions"), list):
                value = self._eval_formula_conditions(calc.get("conditions"), variables, errors)
            variables[name] = value
            if errors:
                return [], errors

        resolved_effects: List[Dict[str, Any]] = []
        for effect in effects:
            if not isinstance(effect, dict):
                continue
            resolved: Dict[str, Any] = {}
            for key, raw_value in effect.items():
                resolved_value = self._resolve_formula_value(raw_value, variables)
                resolved_value = self._normalize_formula_effect_value(key, resolved_value)
                if resolved_value is None:
                    continue
                resolved[key] = resolved_value
            if resolved:
                resolved_effects.append(resolved)

        return resolved_effects, []

    def _build_formula_inputs(
        self,
        inputs: List[Dict[str, Any]],
        session_state: Dict[str, Any],
        stored_inputs: Any,
    ) -> Tuple[Dict[str, float], List[str]]:
        variables: Dict[str, float] = {}
        errors: List[str] = []
        bastion = session_state.get("bastion", {}) if isinstance(session_state, dict) else {}
        stats = bastion.get("stats", {}) if isinstance(bastion.get("stats"), dict) else {}
        inventory = bastion.get("inventory", []) if isinstance(bastion.get("inventory"), list) else []

        for input_def in inputs:
            if not isinstance(input_def, dict):
                continue
            name = input_def.get("name")
            if not isinstance(name, str) or not name:
                continue
            source = self._normalize_formula_source(input_def.get("source"))
            default = input_def.get("default")
            value: Any = 0

            if source in {"number", "check"}:
                if isinstance(stored_inputs, dict) and name in stored_inputs:
                    raw_value = stored_inputs.get(name)
                elif default is not None:
                    raw_value = default
                else:
                    errors.append(f"Missing formula input: {name}")
                    continue
                try:
                    numeric = float(raw_value)
                except (TypeError, ValueError):
                    errors.append(f"Invalid formula input: {name}")
                    continue
                if source == "check":
                    sides = self._get_check_profile_sides(input_def.get("check_profile"))
                    if sides is None:
                        errors.append(f"Invalid check_profile for input: {name}")
                        continue
                    if not numeric.is_integer():
                        errors.append(f"Invalid formula input: {name}")
                        continue
                    numeric = int(numeric)
                    if numeric < 1 or numeric > sides:
                        errors.append(f"Invalid formula input: {name}")
                        continue
                value = numeric
            elif source == "stat":
                stat_key = default if isinstance(default, str) else name
                value = stats.get(stat_key, 0)
            elif source == "item":
                item_key = default if isinstance(default, str) else name
                value = self._get_inventory_qty(inventory, item_key)
            elif source == "currency":
                value = currency_to_base(default, self._ledger.factor_to_base)
            else:
                errors.append(f"Invalid formula input source: {name}")
                continue

            variables[name] = coerce_number(value)

        return variables, errors

    def _get_inventory_qty(self, inventory: List[Dict[str, Any]], item_key: Any) -> int:
        if not isinstance(item_key, str) or not item_key:
            return 0
        for entry in inventory:
            if not isinstance(entry, dict):
                continue
            if entry.get("item") == item_key and isinstance(entry.get("qty"), int):
                return entry.get("qty")
        return 0

    def _eval_formula_expression(
        self,
        expr: str,
        variables: Dict[str, float],
        errors: Optional[List[str]] = None,
    ) -> float:
        if not isinstance(expr, str) or not expr:
            return 0.0
        max_len = self._get_internal_int_setting("formula_max_len", 256)
        if max_len and len(expr) > max_len:
            if isinstance(errors, list):
                errors.append(f"Formula too long (max {max_len} chars).")
            return 0.0
        rolled = self._roll_dice(expr, errors)
        if rolled is None:
            return 0.0
        try:
            tree = ast.parse(rolled, mode="eval")
            return float(self._eval_ast(tree.body, variables))
        except Exception:
            return 0.0

    def _eval_formula_conditions(
        self,
        conditions: List[Dict[str, Any]],
        variables: Dict[str, float],
        errors: Optional[List[str]] = None,
    ) -> float:
        for cond in conditions:
            if not isinstance(cond, dict):
                continue
            if "if" in cond and isinstance(cond.get("if"), str):
                result = self._eval_formula_expression(cond.get("if"), variables, errors)
                if result:
                    if "then_formula" in cond and isinstance(cond.get("then_formula"), str):
                        return self._eval_formula_expression(cond.get("then_formula"), variables, errors)
                    if "then" in cond:
                        return coerce_number(cond.get("then"))
            if "else" in cond:
                return coerce_number(cond.get("else"))
        return 0.0

    def _eval_ast(self, node: ast.AST, variables: Dict[str, float]) -> float:
        if isinstance(node, ast.Num):
            return float(node.n)
        if isinstance(node, ast.Constant):
            if isinstance(node.value, (int, float)):
                return float(node.value)
            if isinstance(node.value, bool):
                return 1.0 if node.value else 0.0
            return 0.0
        if isinstance(node, ast.Name):
            return float(variables.get(node.id, 0.0))
        if isinstance(node, ast.UnaryOp):
            operand = self._eval_ast(node.operand, variables)
            if isinstance(node.op, ast.UAdd):
                return +operand
            if isinstance(node.op, ast.USub):
                return -operand
            return 0.0
        if isinstance(node, ast.BinOp):
            left = self._eval_ast(node.left, variables)
            right = self._eval_ast(node.right, variables)
            if isinstance(node.op, ast.Add):
                return left + right
            if isinstance(node.op, ast.Sub):
                return left - right
            if isinstance(node.op, ast.Mult):
                return left * right
            if isinstance(node.op, ast.Div):
                return left / right if right != 0 else 0.0
            if isinstance(node.op, ast.FloorDiv):
                return math.floor(left / right) if right != 0 else 0.0
            return 0.0
        if isinstance(node, ast.Compare):
            left = self._eval_ast(node.left, variables)
            for op, comparator in zip(node.ops, node.comparators):
                right = self._eval_ast(comparator, variables)
                if isinstance(op, ast.Gt) and not (left > right):
                    return 0.0
                if isinstance(op, ast.GtE) and not (left >= right):
                    return 0.0
                if isinstance(op, ast.Lt) and not (left < right):
                    return 0.0
                if isinstance(op, ast.LtE) and not (left <= right):
                    return 0.0
                if isinstance(op, ast.Eq) and not (left == right):
                    return 0.0
                if isinstance(op, ast.NotEq) and not (left != right):
                    return 0.0
                left = right
            return 1.0
        if isinstance(node, ast.BoolOp):
            if isinstance(node.op, ast.And):
                return 1.0 if all(self._eval_ast(v, variables) for v in node.values) else 0.0
            if isinstance(node.op, ast.Or):
                return 1.0 if any(self._eval_ast(v, variables) for v in node.values) else 0.0
        return 0.0

    def _roll_dice(self, expr: str, errors: Optional[List[str]] = None) -> Optional[str]:
        max_count = self._get_internal_int_setting("dice_max_count", 100)
        max_sides = self._get_internal_int_setting("dice_max_sides", 1000)
        pattern = re.compile(r'(?<![\w.])(\d*)d(\d+)', re.IGNORECASE)

        def repl(match: re.Match) -> str:
            count_raw = match.group(1)
            count = int(count_raw) if count_raw else 1
            sides = int(match.group(2))
            if count <= 0 or sides <= 0:
                return "0"
            if count > max_count or sides > max_sides:
                raise ValueError(f"Dice limit exceeded: {count}d{sides}")
            total = 0
            for _ in range(count):
                total += random.randint(1, sides)
            return str(total)

        try:
            return pattern.sub(repl, expr)
        except ValueError as exc:
            if isinstance(errors, list):
                errors.append(str(exc))
            return None

    def _resolve_formula_value(self, raw_value: Any, variables: Dict[str, float]) -> Any:
        if isinstance(raw_value, str):
            def repl(match: re.Match) -> str:
                key = match.group(1)
                return str(variables.get(key, ""))

            replaced = re.sub(r"\$\{([^}]+)\}", repl, raw_value)
            if is_number(replaced):
                try:
                    return float(replaced)
                except ValueError:
                    return replaced
            return replaced
        return raw_value

    def _normalize_formula_effect_value(self, key: str, value: Any) -> Any:
        if key in ("stat", "item"):
            if value is None:
                return ""
            return str(value)
        if key == "log":
            return str(value) if value is not None else ""
        if isinstance(value, (int, float)):
            return int(round_commercial(float(value)))
        if isinstance(value, str) and is_number(value):
            try:
                return int(round_commercial(float(value)))
            except ValueError:
                return value
        return value
