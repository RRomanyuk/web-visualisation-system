"""Фонове виконання задачі обробки (вимога 2.5)."""

from app.database import SessionLocal
from app.models import Dataset, Job, Result
from app.models import utcnow
from app.schemas import RecipeDefinition
from app.services.pipeline import run_pipeline


def run_job(job_id: str) -> None:
    """Виконується у фоновому потоці FastAPI; має власну сесію БД."""
    db = SessionLocal()
    try:
        job = db.get(Job, job_id)
        if job is None:
            return
        job.status = "processing"
        job.started_at = utcnow()
        db.commit()

        dataset = db.get(Dataset, job.dataset_id)
        if dataset is None:
            raise ValueError(f"Набір '{job.dataset_id}' не знайдено")

        definition = RecipeDefinition(**job.definition)

        def on_stage(stage: str) -> None:
            job.stage = stage
            db.commit()

        out = run_pipeline(dataset.raw_data, dataset.columns, definition, on_stage)

        db.add(
            Result(
                job_id=job.id,
                dataset_id=job.dataset_id,
                processed_data=out.normalized,
                row_count=out.rows_out,
                metrics=out.metrics,
                unify_report=out.unify_report,
                clean_report=out.clean_report,
                normalize_report=out.normalize_report,
                recipe_used=job.recipe_used,
            )
        )
        job.status = "done"
        job.stage = None
        job.timings = out.metrics["timings"]
        job.finished_at = utcnow()
        db.commit()
    except Exception as exc:  # noqa: BLE001 — будь-яка помилка має потрапити в статус задачі
        db.rollback()
        job = db.get(Job, job_id)
        if job is not None:
            job.status = "error"
            job.stage = None
            job.error = f"{type(exc).__name__}: {exc}"
            job.finished_at = utcnow()
            db.commit()
    finally:
        db.close()
