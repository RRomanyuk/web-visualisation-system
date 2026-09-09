import hashlib
import json
import secrets

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.errors import AppError
from app.models import Dataset
from app.schemas import (
    CleanRequest,
    CleanResult,
    DatasetCreate,
    DatasetDetail,
    DatasetSummary,
    ProcessRequest,
    ProcessResult,
    RecipeDefinition,
    RowsBundle,
    RowsPage,
    UnifyRequest,
    UnifyResult,
    VerifyResult,
)
from app.services import recipe_store
from app.services.clean import CleaningConfig, clean
from app.services.fetch import fetch_raw
from app.services.parse import parse_dataset
from app.services.pipeline import run_pipeline
from app.services.schema import infer_schema
from app.services.unify import unify

router = APIRouter(prefix="/datasets", tags=["datasets"])
settings = get_settings()


def _new_id() -> str:
    return "ds_" + secrets.token_hex(6)


def _hash_records(records: list) -> str:
    payload = json.dumps(records, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _summary(ds: Dataset) -> DatasetSummary:
    return DatasetSummary(
        id=ds.id,
        source_url=ds.source_url,
        format=ds.format,
        fetched_at=ds.fetched_at,
        row_count=ds.row_count,
        columns=ds.columns,
    )


def _get_or_404(db: Session, dataset_id: str) -> Dataset:
    ds = db.get(Dataset, dataset_id)
    if ds is None:
        raise AppError("dataset_not_found", f"Набір '{dataset_id}' не знайдено", 404)
    return ds


@router.post("", response_model=DatasetSummary, status_code=status.HTTP_201_CREATED)
def create_dataset(payload: DatasetCreate, db: Session = Depends(get_db)) -> DatasetSummary:
    body, content_type = fetch_raw(
        url=payload.source_url,
        method=payload.method,
        headers=payload.headers,
        params=payload.query_params,
        timeout=settings.source_fetch_timeout,
        max_bytes=settings.source_max_response_mb * 1024 * 1024,
        allowed_hosts=settings.allowed_source_hosts_list,
    )
    fmt, records, columns = parse_dataset(
        body, content_type, payload.format, payload.records_path, payload.csv_options
    )
    if len(records) > settings.source_max_rows:
        raise AppError(
            "too_many_rows",
            f"Набір містить {len(records)} рядків; ліміт — {settings.source_max_rows}",
            413,
        )

    ds = Dataset(
        id=_new_id(),
        source_url=payload.source_url,
        request_method=payload.method,
        request_params=dict(payload.query_params),
        request_headers=dict(payload.headers),
        format=fmt,
        records_path=payload.records_path,
        content_type=content_type,
        row_count=len(records),
        columns=columns,
        raw_data=records,
        raw_hash=_hash_records(records),
    )
    db.add(ds)
    db.commit()
    db.refresh(ds)
    return _summary(ds)


@router.get("", response_model=list[DatasetSummary])
def list_datasets(db: Session = Depends(get_db)) -> list[DatasetSummary]:
    rows = db.scalars(select(Dataset).order_by(Dataset.fetched_at.desc())).all()
    return [_summary(d) for d in rows]


@router.get("/{dataset_id}", response_model=DatasetDetail)
def get_dataset(
    dataset_id: str,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=1000),
    db: Session = Depends(get_db),
) -> DatasetDetail:
    ds = _get_or_404(db, dataset_id)
    start = (page - 1) * size
    page_rows = ds.raw_data[start : start + size]
    return DatasetDetail(
        **_summary(ds).model_dump(),
        content_type=ds.content_type,
        records_path=ds.records_path,
        raw_hash=ds.raw_hash,
        rows=RowsPage(page=page, size=size, total=ds.row_count, rows=page_rows),
    )


@router.get("/{dataset_id}/rows", response_model=RowsBundle)
def dataset_rows(dataset_id: str, db: Session = Depends(get_db)) -> RowsBundle:
    """Усі сирі рядки набору — для візуалізації."""
    ds = _get_or_404(db, dataset_id)
    return RowsBundle(columns=ds.columns, row_count=ds.row_count, rows=ds.raw_data)


@router.get("/{dataset_id}/verify", response_model=VerifyResult)
def verify_dataset(dataset_id: str, db: Session = Depends(get_db)) -> VerifyResult:
    ds = _get_or_404(db, dataset_id)
    current = _hash_records(ds.raw_data)
    return VerifyResult(
        dataset_id=ds.id,
        stored_hash=ds.raw_hash,
        current_hash=current,
        immutable=current == ds.raw_hash,
    )


@router.get("/{dataset_id}/schema")
def dataset_inferred_schema(dataset_id: str, db: Session = Depends(get_db)) -> dict:
    ds = _get_or_404(db, dataset_id)
    return infer_schema(ds.raw_data)


@router.post("/{dataset_id}/unify", response_model=UnifyResult)
def unify_dataset(
    dataset_id: str,
    payload: UnifyRequest,
    sample_size: int = Query(25, ge=1, le=200),
    db: Session = Depends(get_db),
) -> UnifyResult:
    ds = _get_or_404(db, dataset_id)
    if payload.target_schema is not None:
        schema = payload.target_schema
        schema_source = "inline"
    else:
        schema = infer_schema(ds.raw_data)
        schema_source = "inferred"

    unified, report, effective_schema = unify(
        ds.raw_data, ds.columns, schema, payload.field_mapping
    )
    return UnifyResult(
        dataset_id=ds.id,
        schema_source=schema_source,
        target_schema=effective_schema,
        row_count=len(unified),
        report=report,
        sample=unified[:sample_size],
    )


@router.post("/{dataset_id}/clean", response_model=CleanResult)
def clean_dataset(
    dataset_id: str,
    payload: CleanRequest,
    sample_size: int = Query(25, ge=1, le=200),
    db: Session = Depends(get_db),
) -> CleanResult:
    ds = _get_or_404(db, dataset_id)
    if payload.target_schema is not None:
        schema = payload.target_schema
        schema_source = "inline"
    else:
        schema = infer_schema(ds.raw_data)
        schema_source = "inferred"

    unified, unify_report, effective_schema = unify(
        ds.raw_data, ds.columns, schema, payload.field_mapping
    )
    config = CleaningConfig(**payload.cleaning.model_dump())
    output, clean_report = clean(unified, effective_schema, config)

    return CleanResult(
        dataset_id=ds.id,
        schema_source=schema_source,
        unify_report=unify_report,
        clean_report=clean_report,
        rows_in=len(unified),
        rows_out=len(output),
        sample=output[:sample_size],
    )


@router.post("/{dataset_id}/preview", response_model=ProcessResult)
def preview_dataset(
    dataset_id: str,
    payload: ProcessRequest,
    sample_size: int = Query(25, ge=1, le=200),
    db: Session = Depends(get_db),
) -> ProcessResult:
    """Синхронний прогін конвеєра БЕЗ збереження — для налаштування рецепту.

    Персистентний запуск — `POST /api/process` (створює задачу й результат).
    """
    ds = _get_or_404(db, dataset_id)
    inline = RecipeDefinition(**payload.model_dump(exclude={"recipe_id", "recipe_version"}))
    definition, recipe_used = recipe_store.resolve(
        db, payload.recipe_id, payload.recipe_version, inline
    )

    out = run_pipeline(ds.raw_data, ds.columns, definition)

    return ProcessResult(
        dataset_id=ds.id,
        schema_source=out.schema_source,
        recipe_used=recipe_used,
        unify_report=out.unify_report,
        clean_report=out.clean_report,
        normalize_report=out.normalize_report,
        metrics=out.metrics,
        rows_in=out.rows_in,
        rows_out=out.rows_out,
        sample=out.normalized[:sample_size],
    )


@router.delete("/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dataset(dataset_id: str, db: Session = Depends(get_db)) -> None:
    ds = _get_or_404(db, dataset_id)
    db.delete(ds)
    db.commit()
