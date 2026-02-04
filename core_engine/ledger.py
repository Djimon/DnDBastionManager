import json
from fractions import Fraction
from pathlib import Path
from typing import Any, Dict, List, Tuple

from .logger import setup_logger

logger = setup_logger("ledger")


class Ledger:
    def __init__(self, root_dir: Path):
        self.config_path = root_dir / "core" / "config" / "bastion_config.json"
        self.config = self._load_config()
        self.currency_types, self.base_currency, self.factor_to_base = self._build_currency_model()

    def _load_config(self) -> Dict[str, Any]:
        try:
            with open(self.config_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Failed to load bastion_config.json: {e}")
            return {}

    def _build_currency_model(self) -> Tuple[List[str], str, Dict[str, int]]:
        currency = self.config.get("currency", {})
        types = currency.get("types")
        if not isinstance(types, list) or not types:
            logger.warning("Currency types missing; falling back to empty list")
            return self._fallback_currency()

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

        base = next((t for t in types if t not in to_set), None)
        if not base:
            logger.warning("Could not determine base currency; falling back to [Curr]")
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
        factor_to_base: Dict[str, int] = {}
        for t in types:
            if t not in factors:
                invalid_types.append(t)
                continue
            factor = factors[t]
            if factor.denominator != 1:
                invalid_types.append(t)
                continue
            factor_to_base[t] = int(factor.numerator)

        if invalid_types:
            logger.warning(
                "Currency model invalid (missing/non-integer factors); falling back to [Curr]"
            )
            return self._fallback_currency()

        return types, base, factor_to_base

    def _fallback_currency(self) -> Tuple[List[str], str, Dict[str, int]]:
        return ["[Curr]"], "[Curr]", {"[Curr]": 1}

    def apply_effects(self, session_state: Dict[str, Any], effects: List[Dict[str, Any]]) -> Dict[str, Any]:
        if not session_state:
            return {"success": False, "errors": ["No session state provided"], "entries": []}

        bastion = session_state.setdefault("bastion", {})
        wallet = bastion.setdefault("treasury", {})
        inventory = bastion.setdefault("inventory", [])
        stats = bastion.setdefault("stats", {})

        entries = []
        errors = []

        treasury_base = self._ensure_treasury_base(bastion, wallet, errors)

        for effect in effects:
            if not isinstance(effect, dict):
                errors.append("Effect is not an object")
                continue

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
        self._update_wallet_from_base(wallet, treasury_base)

        return {
            "success": len(errors) == 0,
            "errors": errors,
            "entries": entries,
            "session_state": session_state,
        }

    def _ensure_treasury_base(self, bastion: Dict[str, Any], wallet: Dict[str, Any], errors: List[str]) -> int:
        if isinstance(bastion.get("treasury_base"), int):
            return bastion["treasury_base"]

        total = 0
        for currency in self.currency_types:
            amount = wallet.get(currency, 0)
            if not isinstance(amount, int):
                errors.append(f"Treasury '{currency}' must be int")
                continue
            factor = self.factor_to_base.get(currency)
            if factor is None:
                errors.append(f"Currency '{currency}' has no base factor")
                continue
            total += amount * factor

        bastion["treasury_base"] = total
        return total

    def _update_wallet_from_base(self, wallet: Dict[str, Any], base_value: int) -> None:
        if not self.currency_types or not self.factor_to_base:
            return
        if self.base_currency not in self.factor_to_base:
            logger.warning("Base currency has no factor; cannot normalize wallet.")
            return

        # Variant A: negative stays in base currency only
        if base_value < 0:
            for currency in self.currency_types:
                wallet[currency] = 0
            wallet[self.base_currency] = base_value
            return

        # Positive: break down from largest to smallest
        ordered = sorted(
            self.currency_types,
            key=lambda c: self.factor_to_base.get(c, 0),
            reverse=True,
        )
        remaining = base_value
        for currency in ordered:
            factor = self.factor_to_base.get(currency)
            if not factor or factor <= 0:
                wallet[currency] = 0
                continue
            amount = remaining // factor
            remaining = remaining % factor
            wallet[currency] = amount

    def _apply_item_delta(self, inventory: List[Dict[str, Any]], item: str, qty: int) -> None:
        for entry in inventory:
            if entry.get("item") == item:
                entry["qty"] = int(entry.get("qty", 0)) + qty
                if entry["qty"] <= 0:
                    inventory.remove(entry)
                return
        if qty > 0:
            inventory.append({"item": item, "qty": qty})
