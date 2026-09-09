"""Визначення типів полів і побудова схеми з сирих даних (етап уніфікації).

Якщо рецепт не задає цільову схему, вона виводиться автоматично з наявних
записів (вимога 2.2). Значення тут НЕ перетворюються — лише класифікуються.
"""

import re
from typing import Any

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
        return "number"
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
