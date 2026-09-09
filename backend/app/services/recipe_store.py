"""Доступ до збережених рецептів (вимога 2.3)."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import AppError
from app.models import Recipe
from app.schemas import RecipeDefinition


def latest(db: Session, recipe_id: str) -> Recipe | None:
    return db.scalars(
        select(Recipe)
        .where(Recipe.recipe_id == recipe_id)
        .order_by(Recipe.version.desc())
    ).first()


def get_version(db: Session, recipe_id: str, version: int) -> Recipe | None:
    return db.get(Recipe, (recipe_id, version))


def all_versions(db: Session, recipe_id: str) -> list[Recipe]:
    return list(
        db.scalars(
            select(Recipe)
            .where(Recipe.recipe_id == recipe_id)
            .order_by(Recipe.version.desc())
        )
    )


def list_latest(db: Session) -> list[Recipe]:
    rows = db.scalars(
        select(Recipe).order_by(Recipe.recipe_id, Recipe.version.desc())
    ).all()
    seen: dict[str, Recipe] = {}
    for row in rows:
        seen.setdefault(row.recipe_id, row)
    return sorted(seen.values(), key=lambda r: r.created_at, reverse=True)


def resolve(
    db: Session,
    recipe_id: str | None,
    version: int | None,
    inline: RecipeDefinition,
) -> tuple[RecipeDefinition, dict | None]:
    """Повертає (визначення, опис використаного рецепту|None).

    Якщо задано `recipe_id` — беруться правила рецепту, `inline` ігнорується.
    """
    if not recipe_id:
        return inline, None
    rec = get_version(db, recipe_id, version) if version is not None else latest(db, recipe_id)
    if rec is None:
        raise AppError("recipe_not_found", f"Рецепт '{recipe_id}' не знайдено", 404)
    return (
        RecipeDefinition(**rec.definition),
        {"recipe_id": rec.recipe_id, "version": rec.version, "name": rec.name},
    )
