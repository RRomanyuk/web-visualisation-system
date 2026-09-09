"""Моделі БД.

Таблиці: Dataset, Recipe, Job, Result.
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Dataset(Base):
    """Сирий (необроблений) набір даних, отриманий із зовнішнього відкритого API.

    Після створення `raw_data` не змінюється (вимога 2.1). Незмінність
    перевіряється звіркою `raw_hash` — ендпоінт `GET /datasets/{id}/verify`.
    """

    __tablename__ = "datasets"

    id: Mapped[str] = mapped_column(String(24), primary_key=True)
    source_url: Mapped[str] = mapped_column(Text)
    request_method: Mapped[str] = mapped_column(String(8), default="GET")
    request_params: Mapped[dict] = mapped_column(JSON, default=dict)
    request_headers: Mapped[dict] = mapped_column(JSON, default=dict)
    format: Mapped[str] = mapped_column(String(8))
    records_path: Mapped[str | None] = mapped_column(String(200), nullable=True)
    content_type: Mapped[str] = mapped_column(String(200), default="")
    fetched_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    row_count: Mapped[int] = mapped_column(Integer)
    columns: Mapped[list] = mapped_column(JSON, default=list)
    raw_data: Mapped[list] = mapped_column(JSON)
    raw_hash: Mapped[str] = mapped_column(String(64))


class Recipe(Base):
    """Рецепт обробки (вимога 2.3). Кожне редагування — новий рядок-версія.

    `recipe_id` стабільний і саме на нього посилаються під час повторного
    застосування; `version` дає змогу зафіксувати конкретну редакцію.
    """

    __tablename__ = "recipes"

    recipe_id: Mapped[str] = mapped_column(String(24), primary_key=True)
    version: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    definition: Mapped[dict] = mapped_column(JSON)


class Job(Base):
    """Задача обробки набору. Виконується у фоні; клієнт опитує статус."""

    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(24), primary_key=True)
    dataset_id: Mapped[str] = mapped_column(String(24), index=True)
    definition: Mapped[dict] = mapped_column(JSON)  # знімок правил, що застосовані
    recipe_used: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="pending")  # pending|processing|done|error
    stage: Mapped[str | None] = mapped_column(String(16), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    timings: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Result(Base):
    """Результат успішної задачі: оброблені дані, звіти та метрики."""

    __tablename__ = "results"

    job_id: Mapped[str] = mapped_column(String(24), primary_key=True)
    dataset_id: Mapped[str] = mapped_column(String(24), index=True)
    processed_data: Mapped[list] = mapped_column(JSON)
    row_count: Mapped[int] = mapped_column(Integer)
    metrics: Mapped[dict] = mapped_column(JSON)
    unify_report: Mapped[dict] = mapped_column(JSON)
    clean_report: Mapped[dict] = mapped_column(JSON)
    normalize_report: Mapped[dict] = mapped_column(JSON)
    recipe_used: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
