"""Визначення типів полів і побудова схеми з сирих даних (етап уніфікації).

Якщо рецепт не задає цільову схему, вона виводиться автоматично з наявних
записів (вимога 2.2). Значення тут НЕ перетворюються — лише класифікуються.
"""

import math
import re
from typing import Any

# Маркери «немає даних» у двох рівнях певності.
# ANY — артефакти експорту без змістовного текстового прочитання (NaN у різних написаннях,
#       Excel/pandas «#N/A», «<NA>»): пропуск у БУДЬ-ЯКОМУ полі, в тому числі текстовому.
# TYPED — звичайні слова, які можуть бути й справжнім значенням тексту («NA» — Намібія чи
#       Північна Америка, «None» — категорія): пропуск лише в типізованих полях
#       (число, логічне, дата); у текстових лишаються звичайним текстом.
NA_TOKENS_ANY = frozenset({"nan", "+nan", "-nan", "n/a", "#n/a", "#na", "<na>"})
NA_TOKENS_TYPED = frozenset({"na", "null", "none", "nil"})
NA_TOKENS = NA_TOKENS_ANY | NA_TOKENS_TYPED

_INT_RE = re.compile(r"^[+-]?\d+$")
_FLOAT_RE = re.compile(r"^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_DATETIME_RE = re.compile(r"^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}")
_BOOL_STR = {"true", "false"}

# Класи значень, від «вужчого» до «ширшого» — для зведення мішаних колонок.
_SCALAR_CLASSES = ("boolean", "integer", "number", "date", "date-time", "string")


def classify_value(value: Any) -> str | None:
    """Повертає клас одного значення або None для порожнього."""
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return None if math.isnan(value) else "number"  # NaN — це пропуск, не число
    if isinstance(value, dict):
        return "object"
    if isinstance(value, list):
        return "array"
    if value is None:
        return None

    text = str(value).strip()
    if text == "":
        return None
    if text.lower() in _BOOL_STR:
        return "boolean"
    if _INT_RE.match(text):
        return "integer"
    if _FLOAT_RE.match(text):
        return "number"
    if _DATETIME_RE.match(text):
        return "date-time"
    if _DATE_RE.match(text):
        return "date"
    return "string"


def is_na_token(value: Any) -> bool:
    """Рядок-маркер «немає даних» (nan, NA, N/A, null…) — без урахування регістру."""
    return isinstance(value, str) and value.strip().lower() in NA_TOKENS


def is_typed_field(spec: dict | None) -> bool:
    """Поле має не-текстовий тип (число, логічне, дата) — лише для таких NA-маркер = пропуск."""
    if not spec:
        return False
    return spec.get("type") in ("integer", "number", "boolean") or spec.get("format") in (
        "date",
        "date-time",
    )


def is_missing(value: Any, spec: dict | None = None) -> bool:
    """Чи є значення пропуском — єдине визначення для всіх етапів і метрик.

    Завжди: None, порожній/пробільний рядок, float NaN та маркери NA_TOKENS_ANY (nan, N/A…).
    Для типізованих полів (`spec` — опис поля зі схеми) — ще й слова NA_TOKENS_TYPED (NA, null…).
    """
    if value is None:
        return True
    if isinstance(value, float):
        return math.isnan(value)
    if isinstance(value, str):
        text = value.strip()
        if text == "":
            return True
        low = text.lower()
        return low in NA_TOKENS_ANY or (low in NA_TOKENS_TYPED and is_typed_field(spec))
    return False


_NUMERIC_CLASSES = {"integer", "number"}


def matches_type(value: Any, spec: dict) -> bool:
    """Чи відповідає значення оголошеному в схемі типу (без перетворення)."""
    expected = spec.get("type", "string")
    fmt = spec.get("format")
    actual = classify_value(value)
    if actual is None:
        return True  # порожнє — не помилка типу (це справа очищення)
    if expected == "integer":
        return actual == "integer"
    if expected == "number":
        return actual in _NUMERIC_CLASSES
    if expected == "boolean":
        return actual == "boolean"
    if expected in ("object", "array"):
        return actual == expected
    if fmt == "date":
        return actual == "date"
    if fmt == "date-time":
        return actual in ("date", "date-time")
    return actual not in ("object", "array")


def _reduce_classes(classes: set[str]) -> tuple[str, str | None]:
    """Зводить набір класів колонки до (json-тип, формат|None)."""
    if not classes:
        return "string", None
    if "object" in classes:
        return "object", None
    if "array" in classes:
        return "array", None
    if classes <= {"integer"}:
        return "integer", None
    if classes <= {"integer", "number"}:
        return "number", None
    if classes <= {"boolean"}:
        return "boolean", None
    if classes <= {"date"}:
        return "string", "date"
    if classes <= {"date", "date-time"}:
        return "string", "date-time"
    return "string", None  # мішана колонка


def infer_schema(records: list[dict]) -> dict:
    """Будує JSON-Schema-подібний опис за записами."""
    columns: list[str] = []
    seen: set[str] = set()
    class_map: dict[str, set[str]] = {}
    present_count: dict[str, int] = {}

    for record in records:
        for key, value in record.items():
            if key not in seen:
                seen.add(key)
                columns.append(key)
                class_map[key] = set()
                present_count[key] = 0
            present_count[key] += 1
            if is_na_token(value):  # маркер «немає даних» не впливає на тип колонки
                continue
            cls = classify_value(value)
            if cls is not None:
                class_map[key].add(cls)

    total = len(records)
    properties: dict[str, dict] = {}
    for col in columns:
        json_type, fmt = _reduce_classes(class_map[col])
        spec: dict[str, Any] = {"type": json_type}
        if fmt:
            spec["format"] = fmt
        if json_type in ("object", "array"):
            spec["x-nested"] = True
        properties[col] = spec

    required = [c for c in columns if present_count[c] == total]

    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": properties,
        "required": required,
    }
