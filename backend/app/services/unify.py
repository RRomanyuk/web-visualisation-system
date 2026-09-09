"""Уніфікація структури (вимога 2.2, етап 1 з трьох).

Що робить етап:
  • приводить назви полів до канонічних (за маппінгом рецепту);
  • закріплює за кожним полем оголошений тип із цільової схеми;
  • фіксує невідповідності структури: перейменування, відсутні/зайві поля,
    колізії маппінгу, вкладені значення, значення, що не відповідають типу.

Що етап НЕ робить: не перетворює значення (це нормалізація) і не викидає
рядки (це очищення).
"""

from typing import Any

from app.services.schema import matches_type


def unify(
    records: list[dict],
    columns: list[str],
    target_schema: dict,
    field_mapping: dict[str, str],
) -> tuple[list[dict], dict, dict]:
    """Повертає (уніфіковані записи, звіт, ефективна схема з канонічними назвами)."""
    mapping = dict(field_mapping or {})

    def canon(raw: str) -> str:
        return mapping.get(raw, raw)

    # Маппінг застосовується і до назв полів у схемі: якщо схему вивели з
    # сирих даних (або задали з вхідними назвами), а рецепт перейменовує поле,
    # схема має описувати вже канонічну назву — інакше поле «роздвоювалося б».
    raw_props: dict[str, dict] = target_schema.get("properties", {})
    props: dict[str, dict] = {canon(name): spec for name, spec in raw_props.items()}
    target_fields = list(props.keys())

    # Колізії: кілька вхідних колонок зводяться до однієї канонічної назви.
    grouped: dict[str, list[str]] = {}
    for raw in columns:
        grouped.setdefault(canon(raw), []).append(raw)
    collisions = [
        {"canonical": c, "sources": s} for c, s in grouped.items() if len(s) > 1
    ]

    mapped_columns: list[str] = []
    mapped_seen: set[str] = set()
    for raw in columns:
        c = canon(raw)
        if c not in mapped_seen:
            mapped_seen.add(c)
            mapped_columns.append(c)

    renamed = [{"from": r, "to": canon(r)} for r in columns if canon(r) != r]
    missing_fields = [f for f in target_fields if f not in mapped_seen]
    # «Зайві» має сенс лише коли є схема для порівняння.
    extra_fields = [c for c in mapped_columns if c not in props] if target_fields else []

    if target_fields:
        unified_columns = target_fields + [c for c in mapped_columns if c not in props]
    else:
        unified_columns = mapped_columns

    # Побудова уніфікованих записів + підрахунок вкладених значень.
    nested_values: dict[str, int] = {}
    unified: list[dict] = []
    for record in records:
        renamed_record: dict[str, Any] = {}
        for raw, value in record.items():
            c = canon(raw)
            renamed_record[c] = value
            if isinstance(value, (dict, list)):
                nested_values[c] = nested_values.get(c, 0) + 1
        unified.append({col: renamed_record.get(col) for col in unified_columns})

    # Значення, що не відповідають оголошеному типу.
    type_mismatches: dict[str, dict] = {}
    for field, spec in props.items():
        bad = 0
        examples: list[Any] = []
        for row in unified:
            value = row.get(field)
            if value is None or value == "":
                continue
            if not matches_type(value, spec):
                bad += 1
                if len(examples) < 5:
                    examples.append(value)
        if bad:
            type_mismatches[field] = {
                "expected": spec.get("format") or spec.get("type"),
                "mismatched": bad,
                "examples": examples,
            }

    report = {
        "schema_field_count": len(target_fields),
        "source_field_count": len(columns),
        "renamed": renamed,
        "collisions": collisions,
        "missing_fields": missing_fields,
        "extra_fields": extra_fields,
        "nested_values": nested_values,
        "type_mismatches": type_mismatches,
        "unified_columns": unified_columns,
    }

    effective_schema = {
        "$schema": target_schema.get(
            "$schema", "https://json-schema.org/draft/2020-12/schema"
        ),
        "type": "object",
        "properties": props,
        "required": [canon(r) for r in target_schema.get("required", [])],
    }
    return unified, report, effective_schema
