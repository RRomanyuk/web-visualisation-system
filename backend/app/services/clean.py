"""Очищення (вимога 2.2, етап 2 з трьох).

Етап ВИЯВЛЯЄ і ФІКСУЄ дефекти та робить дії на рівні рядків:
  • пропущені значення — маркування рядка або його видалення;
  • дублікати записів — виявлення й видалення;
  • некоректні типи/формати — фіксуються як дефекти, значення НЕ змінюється;
  • аномалії в числових полях — метод IQR, рядок не видаляється.

Перетворення значень (дати, числа, категорії) — це нормалізація, не тут.
"""

import json
from dataclasses import dataclass
from typing import Any

import pandas as pd

from app.services.schema import matches_type

_NUMERIC_TYPES = {"integer", "number"}
_DEFECT_CAP = 500


@dataclass
class CleaningConfig:
    missing_values: str = "mark"  # "mark" | "drop"
    dedup: bool = True
    dedup_by: list[str] | None = None
    detect_anomalies: bool = True
    anomaly_k: float = 1.5


def _is_missing(value: Any) -> bool:
    return value is None or (isinstance(value, str) and value.strip() == "")


def _to_number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).strip())
    except (ValueError, TypeError):
        return None


def clean(
    records: list[dict],
    schema: dict,
    config: CleaningConfig,
) -> tuple[list[dict], dict]:
    props: dict[str, dict] = schema.get("properties", {})
    required = set(schema.get("required", []))
    total = len(records)
    all_fields = list(props) or (list(records[0].keys()) if records else [])

    defects: list[dict] = []

    # 1. Пропущені значення.
    incomplete_rows: set[int] = set()
    for i, row in enumerate(records):
        for field in all_fields:
            if _is_missing(row.get(field)):
                defects.append({"row": i, "field": field, "type": "missing"})
                if field in required:
                    incomplete_rows.add(i)

    # 2. Дублікати — виявляються ЗАВЖДИ; прапорець `dedup` керує лише видаленням.
    duplicate_rows: set[int] = set()
    key_fields = config.dedup_by or all_fields
    first_seen: dict[str, int] = {}
    for i, row in enumerate(records):
        key = json.dumps([row.get(f) for f in key_fields], sort_keys=True, default=str)
        if key in first_seen:
            duplicate_rows.add(i)
            defects.append({"row": i, "type": "duplicate", "duplicate_of": first_seen[key]})
        else:
            first_seen[key] = i

    # 3. Некоректні типи/формати (значення не змінюється).
    for i, row in enumerate(records):
        for field, spec in props.items():
            value = row.get(field)
            if _is_missing(value):
                continue
            if not matches_type(value, spec):
                defects.append(
                    {
                        "row": i,
                        "field": field,
                        "type": "type_mismatch",
                        "expected": spec.get("format") or spec.get("type"),
                        "value": value,
                    }
                )

    # 4. Аномалії (IQR) у числових полях.
    anomaly_bounds: dict[str, list[float]] = {}
    if config.detect_anomalies:
        for field, spec in props.items():
            if spec.get("type") not in _NUMERIC_TYPES:
                continue
            pairs = [(i, _to_number(records[i].get(field))) for i in range(total)]
            nums = [(i, x) for i, x in pairs if x is not None]
            if len(nums) < 4:
                continue
            series = pd.Series([x for _, x in nums])
            q1, q3 = float(series.quantile(0.25)), float(series.quantile(0.75))
            iqr = q3 - q1
            if iqr == 0:
                continue
            low = q1 - config.anomaly_k * iqr
            high = q3 + config.anomaly_k * iqr
            anomaly_bounds[field] = [low, high]
            for i, x in nums:
                if x < low or x > high:
                    defects.append(
                        {
                            "row": i,
                            "field": field,
                            "type": "anomaly",
                            "value": records[i].get(field),
                            "bounds": [low, high],
                        }
                    )

    # Дії на рівні рядків.
    drop: set[int] = set()
    if config.dedup:
        drop |= duplicate_rows
    if config.missing_values == "drop":
        drop |= incomplete_rows
    output = [row for i, row in enumerate(records) if i not in drop]

    by_type: dict[str, int] = {}
    for defect in defects:
        by_type[defect["type"]] = by_type.get(defect["type"], 0) + 1

    report = {
        "rows_in": total,
        "rows_out": len(output),
        "rows_dropped": {
            "duplicate": len(duplicate_rows) if config.dedup else 0,
            "incomplete": len(incomplete_rows) if config.missing_values == "drop" else 0,
        },
        "flagged_rows": (
            sorted(incomplete_rows) if config.missing_values == "mark" else []
        ),
        # дублікати, які лишилися в наборі (dedup вимкнено) — позначені, не видалені
        "duplicate_rows": sorted(duplicate_rows) if not config.dedup else [],
        "defects_total": len(defects),
        "by_type": by_type,
        "anomaly_bounds": anomaly_bounds,
        "defects": defects[:_DEFECT_CAP],
        "defects_truncated": len(defects) > _DEFECT_CAP,
    }
    return output, report
