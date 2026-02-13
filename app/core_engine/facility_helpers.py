import math
from typing import Any, Dict


def currency_to_base(value: Any, factor_to_base: Dict[str, Any]) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    if not isinstance(value, dict):
        return 0.0
    total = 0.0
    for currency, amount in value.items():
        if not isinstance(currency, str):
            continue
        if not isinstance(amount, (int, float)):
            continue
        factor = factor_to_base.get(currency) if isinstance(factor_to_base, dict) else None
        if not factor:
            continue
        total += float(amount) * float(factor)
    return total


def coerce_number(value: Any) -> float:
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return 0.0
    return 0.0


def is_number(value: Any) -> bool:
    if isinstance(value, (int, float)):
        return True
    if isinstance(value, str):
        try:
            float(value)
            return True
        except ValueError:
            return False
    return False


def round_commercial(value: float) -> float:
    if value >= 0:
        return math.floor(value + 0.5)
    return math.ceil(value - 0.5)


def value_set(value: Any) -> set:
    if isinstance(value, list):
        return set(v for v in value if isinstance(v, int))
    if isinstance(value, int):
        return {value}
    return set()
