"""Метрики якості даних до / після обробки (вимога 2.4).

  • кількість виявлених дефектів;
  • рівень повноти даних по ключових полях;
  • частка збережених записів;
  • час обробки на кожному етапі.

Метрики «до» рахуються на уніфікованому сирому наборі, «після» — на
кінцевому (очищеному й нормалізованому) — тим самим детектором, що робить
порівняння коректним.
"""

from app.services.schema import is_missing


def completeness(
    records: list[dict], key_fields: list[str], props: dict[str, dict] | None = None
) -> float:
    """Частка непорожніх клітинок у ключових полях (0..1).

    `props` — описи полів зі схеми: за ними маркери nan / NA у типізованих
    полях рахуються пропусками (те саме визначення, що й в очищенні).
    """
    if not records or not key_fields:
        return 1.0
    props = props or {}
    total = len(records) * len(key_fields)
    filled = sum(
        1
        for row in records
        for field in key_fields
        if not is_missing(row.get(field), props.get(field))
    )
    return round(filled / total, 4)


def retention(rows_in: int, rows_out: int) -> float:
    """Частка записів, що не були відкинуті."""
    return round(rows_out / rows_in, 4) if rows_in else 1.0
