"""Розбір відповіді зовнішнього API у список плоских записів (вимога 2.1).

Підтримуються JSON (масив об'єктів або об'єкт-обгортка з масивом) та CSV.
Вкладені структури не розгортаються — це фіксується на етапі уніфікації.
"""

import io
import json

import pandas as pd

from app.errors import AppError
from app.schemas import CsvOptions

_WRAPPER_KEYS = ("data", "results", "items", "records", "rows", "features", "value")


def parse_dataset(
    body: bytes,
    content_type: str,
    fmt: str | None,
    records_path: str | None,
    csv_options: CsvOptions,
) -> tuple[str, list[dict], list[str]]:
    """Повертає (формат, записи, порядок колонок)."""
    fmt = fmt or _guess_format(content_type, body)

    if fmt == "json":
        records = _parse_json(body, records_path)
    elif fmt == "csv":
        records = _parse_csv(body, csv_options)
    else:
        raise AppError("unsupported_format", f"Непідтримуваний формат: '{fmt}'", 415)

    if not records:
        raise AppError("empty_dataset", "Джерело не містить жодного запису", 422)

    non_dict = next((r for r in records if not isinstance(r, dict)), None)
    if non_dict is not None:
        raise AppError(
            "parse_failed",
            "Записи мають бути об'єктами (очікується плоска таблична структура)",
            422,
        )

    return fmt, records, _collect_columns(records)


def _guess_format(content_type: str, body: bytes) -> str:
    ct = content_type.lower()
    if "json" in ct:
        return "json"
    if "csv" in ct or "text/plain" in ct:
        return "csv"
    head = body.lstrip()[:1]
    return "json" if head in (b"{", b"[") else "csv"


def _parse_json(body: bytes, records_path: str | None) -> list:
    try:
        data = json.loads(body)
    except json.JSONDecodeError as exc:
        raise AppError("parse_failed", f"Некоректний JSON: {exc}", 422)

    if records_path:
        for part in records_path.split("."):
            if isinstance(data, dict) and part in data:
                data = data[part]
            else:
                raise AppError(
                    "parse_failed", f"Шлях '{records_path}' не знайдено у відповіді", 422
                )

    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return _autodetect_list(data)
    raise AppError("parse_failed", "Очікувався масив записів або об'єкт-обгортка", 422)


def _autodetect_list(data: dict) -> list:
    for key in _WRAPPER_KEYS:
        if isinstance(data.get(key), list):
            return data[key]
    list_values = [v for v in data.values() if isinstance(v, list)]
    if len(list_values) == 1:
        return list_values[0]
    if all(not isinstance(v, (dict, list)) for v in data.values()):
        return [data]  # відповідь — єдиний запис
    raise AppError(
        "parse_failed",
        "Не вдалося визначити масив записів; вкажіть 'records_path'",
        422,
    )


def _parse_csv(body: bytes, opts: CsvOptions) -> list[dict]:
    text = None
    for enc in (opts.encoding, "utf-8-sig", "cp1251"):
        try:
            text = body.decode(enc)
            break
        except (UnicodeDecodeError, LookupError):
            continue
    if text is None:
        raise AppError("parse_failed", "Не вдалося розпізнати кодування CSV", 422)

    try:
        # dtype=str + keep_default_na=False: сирі значення зберігаються дослівно,
        # порожні клітинки лишаються "" (виявлення пропусків — на етапі очищення).
        frame = pd.read_csv(
            io.StringIO(text), sep=opts.delimiter, dtype=str, keep_default_na=False
        )
    except Exception as exc:  # noqa: BLE001 — pandas кидає різнотипні винятки
        raise AppError("parse_failed", f"Помилка розбору CSV: {exc}", 422)

    return frame.to_dict(orient="records")


def _collect_columns(records: list[dict]) -> list[str]:
    columns: list[str] = []
    seen: set[str] = set()
    for record in records:
        for key in record:
            if key not in seen:
                seen.add(key)
                columns.append(key)
    return columns
