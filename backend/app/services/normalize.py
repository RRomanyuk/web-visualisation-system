"""Нормалізація (вимога 2.2, етап 3 з трьох).

Єдиний етап, що ПЕРЕТВОРЮЄ значення:
  • дати       -> ISO 8601;
  • числа      -> канонічний вигляд (роздільник ".", без розрядних роздільників);
  • категорії  -> за явним словником відповідностей (детерміновано).

Значення, які не вдалося перетворити, фіксуються як дефекти; вихідне
значення при цьому лишається без змін. Жодних нечітких (fuzzy) зіставлень —
результат повністю відтворюваний (вимога 2.3).
"""

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

_DEFECT_CAP = 500

_DATE_FORMATS = [
    "%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y", "%Y/%m/%d", "%d-%m-%Y",
    "%Y.%m.%d", "%d %b %Y", "%d %B %Y", "%B %d, %Y", "%b %d, %Y",
]
_DATETIME_FORMATS = [
    "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M",
    "%d.%m.%Y %H:%M:%S", "%d.%m.%Y %H:%M",
]

_WS_RE = re.compile(r"[\s  ]+")


@dataclass
class NormalizationConfig:
    date_input_formats: list[str] = field(default_factory=list)
    decimal_separator: str = "."
    thousands_separator: str | None = None
    category_mappings: dict[str, dict[str, str]] = field(default_factory=dict)
    unaccent: bool = False


def _strip_accents(text: str) -> str:
    return "".join(
        ch for ch in unicodedata.normalize("NFKD", text) if not unicodedata.combining(ch)
    )


def _preprocess_category(value: Any, unaccent: bool) -> str:
    text = _WS_RE.sub(" ", str(value).strip()).lower()
    return _strip_accents(text) if unaccent else text


def _normalize_date(value: Any, extra_formats: list[str], want_datetime: bool) -> str | None:
    text = str(value).strip()
    if not text:
        return None
    try:
        dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
        return dt.isoformat() if want_datetime else dt.date().isoformat()
    except ValueError:
        pass
    formats = list(extra_formats) + (_DATETIME_FORMATS if want_datetime else _DATE_FORMATS)
    for fmt in formats:
        try:
            dt = datetime.strptime(text, fmt)
            return dt.isoformat() if want_datetime else dt.date().isoformat()
        except ValueError:
            continue
    return None


def _normalize_number(
    value: Any, decimal_sep: str, thousands_sep: str | None, want_int: bool
) -> int | float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        num = float(value)
    else:
        text = str(value).strip()
        if not text:
            return None
        if thousands_sep:
            text = text.replace(thousands_sep, "")
        text = _WS_RE.sub("", text)  # пробіли як розрядні роздільники
        if decimal_sep and decimal_sep != ".":
            text = text.replace(decimal_sep, ".")
        try:
            num = float(text)
        except ValueError:
            return None
    if want_int and num.is_integer():
        return int(num)
    return num


def normalize(
    records: list[dict], schema: dict, config: NormalizationConfig
) -> tuple[list[dict], dict]:
    props: dict[str, dict] = schema.get("properties", {})
    columns = list(props) or (list(records[0].keys()) if records else [])

    date_fields = {
        f: (s.get("format") == "date-time")
        for f, s in props.items()
        if s.get("format") in ("date", "date-time")
    }
    number_fields = {
        f: (s.get("type") == "integer")
        for f, s in props.items()
        if s.get("type") in ("integer", "number")
    }
    category_maps = {
        f: {_preprocess_category(k, config.unaccent): v for k, v in mapping.items()}
        for f, mapping in config.category_mappings.items()
    }

    defects: list[dict] = []
    converted: dict[str, int] = {}
    output: list[dict] = []

    def bump(field_name: str) -> None:
        converted[field_name] = converted.get(field_name, 0) + 1

    for i, row in enumerate(records):
        new = dict(row)

        for f, want_dt in date_fields.items():
            v = row.get(f)
            if v is None or v == "":
                continue
            res = _normalize_date(v, config.date_input_formats, want_dt)
            if res is None:
                defects.append({"row": i, "field": f, "type": "date_unrecognized", "value": v})
            elif res != v:
                new[f] = res
                bump(f)

        for f, want_int in number_fields.items():
            v = row.get(f)
            if v is None or v == "":
                continue
            res = _normalize_number(
                v, config.decimal_separator, config.thousands_separator, want_int
            )
            if res is None:
                defects.append({"row": i, "field": f, "type": "number_unrecognized", "value": v})
            elif res != v:
                new[f] = res
                bump(f)

        for f, cmap in category_maps.items():
            v = row.get(f)
            if v is None or v == "":
                continue
            key = _preprocess_category(v, config.unaccent)
            if key in cmap:
                if cmap[key] != v:
                    new[f] = cmap[key]
                    bump(f)
            else:
                defects.append({"row": i, "field": f, "type": "unmapped_category", "value": v})

        output.append(new)

    by_type: dict[str, int] = {}
    for defect in defects:
        by_type[defect["type"]] = by_type.get(defect["type"], 0) + 1

    report = {
        "columns": columns,
        "converted": converted,
        "defects_total": len(defects),
        "by_type": by_type,
        "defects": defects[:_DEFECT_CAP],
        "defects_truncated": len(defects) > _DEFECT_CAP,
    }
    return output, report
