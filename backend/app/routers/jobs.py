import secrets

from fastapi import APIRouter, BackgroundTasks, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.errors import AppError
from app.models import Dataset, Job, Result
from app.schemas import (
    JobCreated,
    JobDetail,
    JobSummary,
    ProcessJobRequest,
    RecipeDefinition,
    ResultOut,
    RowsBundle,
    RowsPage,
)
from app.services import recipe_store
from app.services.job_runner import run_job

router = APIRouter(tags=["process"])


def _new_id() -> str:
    return "job_" + secrets.token_hex(6)


def _summary(job: Job) -> JobSummary:
    return JobSummary(
        job_id=job.id,
        dataset_id=job.dataset_id,
        status=job.status,
        stage=job.stage,
        created_at=job.created_at,
        finished_at=job.finished_at,
    )


def _detail(job: Job) -> JobDetail:
    return JobDetail(
        **_summary(job).model_dump(),
        recipe_used=job.recipe_used,
        error=job.error,
        timings=job.timings,
        started_at=job.started_at,
    )


@router.post("/process", response_model=JobCreated, status_code=status.HTTP_202_ACCEPTED)
def start_processing(
    payload: ProcessJobRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> JobCreated:
    ds = db.get(Dataset, payload.dataset_id)
    if ds is None:
        raise AppError("dataset_not_found", f"Набір '{payload.dataset_id}' не знайдено", 404)

    inline = RecipeDefinition(
        **payload.model_dump(exclude={"dataset_id", "recipe_id", "recipe_version"})
    )
    definition, recipe_used = recipe_store.resolve(
        db, payload.recipe_id, payload.recipe_version, inline
    )

    job = Job(
        id=_new_id(),
        dataset_id=ds.id,
        definition=definition.model_dump(),
        recipe_used=recipe_used,
        status="pending",
    )
    db.add(job)
    db.commit()

    background_tasks.add_task(run_job, job.id)
    return JobCreated(job_id=job.id, status=job.status)


@router.get("/jobs", response_model=list[JobSummary])
def list_jobs(
    dataset_id: str | None = Query(None),
    db: Session = Depends(get_db),
) -> list[JobSummary]:
    stmt = select(Job).order_by(Job.created_at.desc())
    if dataset_id:
        stmt = stmt.where(Job.dataset_id == dataset_id)
    return [_summary(j) for j in db.scalars(stmt).all()]


@router.get("/jobs/{job_id}", response_model=JobDetail)
def get_job(job_id: str, db: Session = Depends(get_db)) -> JobDetail:
    job = db.get(Job, job_id)
    if job is None:
        raise AppError("job_not_found", f"Задачу '{job_id}' не знайдено", 404)
    return _detail(job)


@router.get("/result/{job_id}", response_model=ResultOut)
def get_result(
    job_id: str,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=1000),
    db: Session = Depends(get_db),
) -> ResultOut:
    job = db.get(Job, job_id)
    if job is None:
        raise AppError("job_not_found", f"Задачу '{job_id}' не знайдено", 404)
    if job.status != "done":
        raise AppError(
            "job_not_ready",
            f"Задача у статусі '{job.status}'",
            409,
            {"status": job.status, "stage": job.stage, "error": job.error},
        )

    res = db.get(Result, job_id)
    start = (page - 1) * size
    return ResultOut(
        job_id=res.job_id,
        dataset_id=res.dataset_id,
        recipe_used=res.recipe_used,
        metrics=res.metrics,
        unify_report=res.unify_report,
        clean_report=res.clean_report,
        normalize_report=res.normalize_report,
        row_count=res.row_count,
        rows=RowsPage(
            page=page,
            size=size,
            total=res.row_count,
            rows=res.processed_data[start : start + size],
        ),
    )


@router.get("/result/{job_id}/rows", response_model=RowsBundle)
def result_rows(job_id: str, db: Session = Depends(get_db)) -> RowsBundle:
    """Усі оброблені рядки — для візуалізації."""
    job = db.get(Job, job_id)
    if job is None:
        raise AppError("job_not_found", f"Задачу '{job_id}' не знайдено", 404)
    if job.status != "done":
        raise AppError("job_not_ready", f"Задача у статусі '{job.status}'", 409)
    res = db.get(Result, job_id)
    columns = res.unify_report.get("unified_columns", [])
    return RowsBundle(columns=columns, row_count=res.row_count, rows=res.processed_data)
