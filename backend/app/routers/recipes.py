import secrets

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.errors import AppError
from app.models import Recipe
from app.schemas import RecipeCreate, RecipeOut, RecipeSummary, RecipeUpdate
from app.services import recipe_store

router = APIRouter(prefix="/recipes", tags=["recipes"])


def _new_id() -> str:
    return "rcp_" + secrets.token_hex(6)


def _summary(rec: Recipe) -> RecipeSummary:
    return RecipeSummary(
        recipe_id=rec.recipe_id,
        version=rec.version,
        name=rec.name,
        created_at=rec.created_at,
    )


def _out(rec: Recipe) -> RecipeOut:
    return RecipeOut(**_summary(rec).model_dump(), definition=rec.definition)


@router.post("", response_model=RecipeOut, status_code=status.HTTP_201_CREATED)
def create_recipe(payload: RecipeCreate, db: Session = Depends(get_db)) -> RecipeOut:
    rec = Recipe(
        recipe_id=_new_id(),
        version=1,
        name=payload.name,
        definition=payload.definition.model_dump(),
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return _out(rec)


@router.get("", response_model=list[RecipeSummary])
def list_recipes(db: Session = Depends(get_db)) -> list[RecipeSummary]:
    return [_summary(r) for r in recipe_store.list_latest(db)]


@router.get("/{recipe_id}", response_model=RecipeOut)
def get_recipe(
    recipe_id: str,
    version: int | None = Query(None, ge=1),
    db: Session = Depends(get_db),
) -> RecipeOut:
    rec = (
        recipe_store.latest(db, recipe_id)
        if version is None
        else recipe_store.get_version(db, recipe_id, version)
    )
    if rec is None:
        raise AppError("recipe_not_found", f"Рецепт '{recipe_id}' не знайдено", 404)
    return _out(rec)


@router.get("/{recipe_id}/versions", response_model=list[RecipeSummary])
def recipe_versions(recipe_id: str, db: Session = Depends(get_db)) -> list[RecipeSummary]:
    rows = recipe_store.all_versions(db, recipe_id)
    if not rows:
        raise AppError("recipe_not_found", f"Рецепт '{recipe_id}' не знайдено", 404)
    return [_summary(r) for r in rows]


@router.put("/{recipe_id}", response_model=RecipeOut)
def update_recipe(
    recipe_id: str, payload: RecipeUpdate, db: Session = Depends(get_db)
) -> RecipeOut:
    current = recipe_store.latest(db, recipe_id)
    if current is None:
        raise AppError("recipe_not_found", f"Рецепт '{recipe_id}' не знайдено", 404)
    rec = Recipe(
        recipe_id=recipe_id,
        version=current.version + 1,
        name=payload.name or current.name,
        definition=payload.definition.model_dump(),
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return _out(rec)


@router.delete("/{recipe_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recipe(recipe_id: str, db: Session = Depends(get_db)) -> None:
    rows = recipe_store.all_versions(db, recipe_id)
    if not rows:
        raise AppError("recipe_not_found", f"Рецепт '{recipe_id}' не знайдено", 404)
    for row in rows:
        db.delete(row)
    db.commit()
