"""Повний конвеєр обробки: уніфікація → очищення → нормалізація + метрики.

Використовується і синхронним прев'ю (`/datasets/{id}/preview`), і фоновою
задачею (`/process`).
"""

from collections.abc import Callable
from dataclasses import dataclass
from time import perf_counter
from typing import Any

from app.schemas import RecipeDefinition
from app.services.clean import CleaningConfig, clean
from app.services.metrics import completeness, retention
from app.services.normalize import NormalizationConfig, normalize
from app.services.schema import infer_schema
from app.services.unify import unify

_STAGES = ("unification", "cleaning", "normalization")


@dataclass
class PipelineOutput:
    schema_source: str
    normalized: list[dict]
    unify_report: dict
    clean_report: dict
    normalize_report: dict
    metrics: dict
    rows_in: int
    rows_out: int


def run_pipeline(
    raw_data: list[dict],
    columns: list[str],
    definition: RecipeDefinition,
    on_stage: Callable[[str], None] = lambda _s: None,
) -> PipelineOutput:
    if definition.target_schema is not None:
        schema = definition.target_schema
        schema_source = "inline"
    else:
        schema = infer_schema(raw_data)
        schema_source = "inferred"

    cleaning_config = CleaningConfig(**definition.cleaning.model_dump())

    on_stage("unification")
    t0 = perf_counter()
    unified, unify_report, effective_schema = unify(
        raw_data, columns, schema, definition.field_mapping
    )
    t1 = perf_counter()

    on_stage("cleaning")
    cleaned, clean_report = clean(unified, effective_schema, cleaning_config)
    t2 = perf_counter()

    on_stage("normalization")
    normalized, normalize_report = normalize(
        cleaned, effective_schema, NormalizationConfig(**definition.normalization.model_dump())
    )
    t3 = perf_counter()

    if definition.key_fields:
        canon = definition.field_mapping
        key_fields = [canon.get(f, f) for f in definition.key_fields]
    else:
        key_fields = list(effective_schema.get("required", []))

    # «після»: повторне виявлення дефектів тим самим детектором на кінцевому наборі
    _, after_report = clean(normalized, effective_schema, cleaning_config)

    metrics: dict[str, Any] = {
        "defects": {
            "before": clean_report["defects_total"],
            "after": after_report["defects_total"],
            "before_by_type": clean_report["by_type"],
            "after_by_type": after_report["by_type"],
        },
        "completeness": {
            "before": completeness(unified, key_fields),
            "after": completeness(normalized, key_fields),
        },
        "retention": retention(len(raw_data), len(normalized)),
        "key_fields": key_fields,
        "timings": {
            "unification": round(t1 - t0, 4),
            "cleaning": round(t2 - t1, 4),
            "normalization": round(t3 - t2, 4),
            "total": round(t3 - t0, 4),
        },
    }

    return PipelineOutput(
        schema_source=schema_source,
        normalized=normalized,
        unify_report=unify_report,
        clean_report=clean_report,
        normalize_report=normalize_report,
        metrics=metrics,
        rows_in=len(raw_data),
        rows_out=len(normalized),
    )
