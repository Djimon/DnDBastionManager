import json
from fractions import Fraction
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .logger import setup_logger
from .audit_log import AuditLog

logger = setup_logger("ledger")


class Ledger:
    def __init__(self, root_dir: Path, config_manager: Optional[Any] = None):
        self.config_path = root_dir / "core" / "config" / "bastion_config.json"
        self._config_manager = config_manager
        self.config = self._load_config()
        self.currency_types, self.base_currency, self.factor_to_base = self._build_currency_model()
        self._audit_log = AuditLog()

    def _load_config(self) -> Dict[str, Any]:
        try:
            if self._config_manager:
                return self._config_manager.get_config()
            with open(self.config_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Failed to load bastion_config.json: {e}")
            return {}

    def reload_config(self) -> None:
        self.config = self._load_config()
        self.currency_types, self.base_currency, self.factor_to_base = self._build_currency_model()

    def _build_currency_model(self) -> Tuple[List[str], str, Dict[str, float]]:
        currency = self.config.get("currency", {})
        types = currency.get("types")
        if not isinstance(types, list) or not types:
            logger.warning("Currency types missing; falling back to copper only")
            return self._fallback_currency()
        types = [t for t in types if isinstance(t, str) and t]
        if "copper" not in types:
            logger.warning("Base currency 'copper' missing; injecting into currency types")
            types.append("copper")

        conversion = currency.get("conversion", [])
        to_set = set()
        adjacency = {t: [] for t in types}

        if isinstance(conversion, list):
            for rule in conversion:
                if not isinstance(rule, dict):
                    continue
                src = rule.get("from")
                dst = rule.get("to")
                rate = rule.get("rate")
                if not isinstance(src, str) or not isinstance(dst, str) or not isinstance(rate, int) or rate <= 0:
                    continue
                if src not in adjacency or dst not in adjacency:
                    logger.warning(f"Currency conversion references unknown type: {src} -> {dst}")
                    continue
                to_set.add(dst)
                adjacency[src].append((dst, Fraction(rate, 1)))
                adjacency[dst].append((src, Fraction(1, rate)))

        base = "copper"
        if base not in adjacency:
            logger.warning("Base currency 'copper' missing from adjacency; falling back to copper only")
            return self._fallback_currency()

        factors: Dict[str, Fraction] = {base: Fraction(1, 1)}
        stack = [base]
        while stack:
            cur = stack.pop()
            for nxt, mult in adjacency.get(cur, []):
                if nxt in factors:
                    continue
                factors[nxt] = factors[cur] * mult
                stack.append(nxt)

        invalid_types: List[str] = []
        factor_to_base: Dict[str, float] = {}
        for t in types:
            if t not in factors:
                invalid_types.append(t)
                continue
            factor_to_base[t] = float(factors[t])

        if invalid_types:
            logger.warning(
                f"Currency model incomplete; dropping: {', '.join(invalid_types)}"
            )
            types = [t for t in types if t in factor_to_base]
            if not types:
                return self._fallback_currency()

        return types, base, factor_to_base

    def _fallback_currency(self) -> Tuple[List[str], str, Dict[str, float]]:
        return ["copper"], "copper", {"copper": 1.0}

    def apply_effects(self, session_state: Dict[str, Any], effects: List[Dict[str, Any]], context: Dict[str, Any] = None) -> Dict[str, Any]:
        if not session_state:
            return {"success": False, "errors": ["No session state provided"], "entries": []}

        bastion = session_state.setdefault("bastion", {})
        inventory = bastion.setdefault("inventory", [])
        stats = bastion.setdefault("stats", {})

        entries = []
        errors = []

        treasury_base = self._ensure_treasury_base(bastion, errors)

        for effect in effects:
            if not isinstance(effect, dict):
                errors.append("Effect is not an object")
                continue

            # Currency shorthand {currency, amount}
            currency_key = effect.get("currency")
            amount_value = effect.get("amount")
            if (
                isinstance(currency_key, str)
                and currency_key in self.currency_types
                and isinstance(amount_value, int)
                and currency_key not in effect
            ):
                factor = self.factor_to_base.get(currency_key)
                if factor is None:
                    errors.append(f"Currency '{currency_key}' has no base factor")
                else:
                    treasury_base += amount_value * factor
                    entries.append({"type": "currency", "currency": currency_key, "delta": amount_value})

            # Currency deltas (configured types)
            for currency in self.currency_types:
                if currency in effect:
                    delta = effect.get(currency, 0)
                    if not isinstance(delta, int):
                        errors.append(f"Currency '{currency}' delta must be int")
                        continue
                    factor = self.factor_to_base.get(currency)
                    if factor is None:
                        errors.append(f"Currency '{currency}' has no base factor")
                        continue
                    treasury_base += delta * factor
                    entries.append({"type": "currency", "currency": currency, "delta": delta})

            # Item delta
            if "item" in effect:
                item = effect.get("item")
                qty = effect.get("qty", 0)
                if not isinstance(item, str):
                    errors.append("Item effect missing string 'item'")
                elif not isinstance(qty, int):
                    errors.append(f"Item '{item}' qty must be int")
                else:
                    self._apply_item_delta(inventory, item, qty)
                    entries.append({"type": "item", "item": item, "qty": qty})

            # Stat delta
            if "stat" in effect:
                stat = effect.get("stat")
                delta = effect.get("delta", 0)
                if not isinstance(stat, str):
                    errors.append("Stat effect missing string 'stat'")
                elif not isinstance(delta, int):
                    errors.append(f"Stat '{stat}' delta must be int")
                else:
                    stats[stat] = int(stats.get(stat, 0)) + delta
                    entries.append({"type": "stat", "stat": stat, "delta": delta})

            # Log message
            if "log" in effect:
                msg = effect.get("log")
                if isinstance(msg, str):
                    entries.append({"type": "log", "message": msg})

        bastion["treasury_base"] = treasury_base

        turn = int(session_state.get("current_turn", 0))
        ctx = context or {}
        event_type = ctx.get("event_type", "ledger_apply")
        source_type = ctx.get("source_type", "system")
        source_id = ctx.get("source_id", "*")
        action = ctx.get("action", "apply_effects")
        roll = ctx.get("roll", "-")
        result = ctx.get("result", "applied" if not errors else "error")
        changes = ctx.get("changes") or self._format_changes(entries)
        log_text = ctx.get("log_text") or self._format_log_text(entries)
        self._audit_log.add_entry(
            session_state,
            turn,
            event_type,
            source_type,
            source_id,
            action,
            roll,
            result,
            changes,
            log_text,
        )

        return {
            "success": len(errors) == 0,
            "errors": errors,
            "entries": entries,
            "session_state": session_state,
        }

    def get_treasury_base(self, session_state: Dict[str, Any]) -> Optional[float]:
        if not session_state:
            return None
        bastion = session_state.setdefault("bastion", {})
        errors: List[str] = []
        return self._ensure_treasury_base(bastion, errors)

    def _ensure_treasury_base(self, bastion: Dict[str, Any], errors: List[str]) -> float:
        base_value = bastion.get("treasury_base")
        if isinstance(base_value, (int, float)) and not isinstance(base_value, bool):
            return float(base_value)
        bastion["treasury_base"] = 0
        return 0.0

    def _format_changes(self, entries: List[Dict[str, Any]]) -> str:
        parts = []
        for entry in entries:
            if entry.get("type") == "currency":
                parts.append(f"currency:{entry.get('currency')}:{entry.get('delta')}")
            elif entry.get("type") == "item":
                parts.append(f"item:{entry.get('item')}:{entry.get('qty')}")
            elif entry.get("type") == "stat":
                parts.append(f"stat:{entry.get('stat')}:{entry.get('delta')}")
        return "|".join(parts)

    def _format_log_text(self, entries: List[Dict[str, Any]]) -> str:
        logs = [e.get("message") for e in entries if e.get("type") == "log" and e.get("message")]
        return " | ".join(logs)

    def _apply_item_delta(self, inventory: List[Dict[str, Any]], item: str, qty: int) -> None:
        for entry in inventory:
            if entry.get("item") == item:
                entry["qty"] = int(entry.get("qty", 0)) + qty
                if entry["qty"] <= 0:
                    inventory.remove(entry)
                return
        if qty > 0:
            inventory.append({"item": item, "qty": qty})
