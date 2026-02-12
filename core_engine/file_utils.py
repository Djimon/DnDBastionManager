import re
import unicodedata
from typing import Dict

_GERMAN_TRANSLITERATION: Dict[str, str] = {
    "ä": "ae",
    "ö": "oe",
    "ü": "ue",
    "ß": "ss",
    "Ä": "Ae",
    "Ö": "Oe",
    "Ü": "Ue",
}


def sanitize_filename(raw: str, fallback: str = "session") -> str:
    if not isinstance(raw, str):
        return fallback
    raw = raw.strip()
    if not raw:
        return fallback

    replaced = "".join(_GERMAN_TRANSLITERATION.get(ch, ch) for ch in raw)
    normalized = unicodedata.normalize("NFKD", replaced)
    normalized = "".join(ch for ch in normalized if not unicodedata.combining(ch))

    allowed = []
    for ch in normalized:
        if ch.isalnum():
            allowed.append(ch.lower())
        elif ch in {" ", "_", "-"}:
            allowed.append(ch)

    slug = "".join(allowed).replace(" ", "_")
    slug = re.sub(r"_+", "_", slug).strip("_-")
    return slug or fallback
