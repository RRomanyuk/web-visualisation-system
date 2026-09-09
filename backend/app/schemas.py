from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class CsvOptions(BaseModel):
    delimiter: str = ","
    encoding: str = "utf-8"


class DatasetCreate(BaseModel):
    source_url: str
    method: Literal["GET"] = "GET"
    headers: dict[str, str] = Field(default_factory=dict)
    query_params: dict[str, str | int | float | bool] = Field(default_factory=dict)
    format: Literal["json", "csv"] | None = None
    records_path: str | None = Field(
        default=None,
        description="Крапковий шлях до масиву записів у JSON-відповіді (напр. 'result.records').",
    )
    csv_options: CsvOptions = Field(default_factory=CsvOptions)


class DatasetSummary(BaseModel):
    id: str
    source_url: str
    format: str
    fetched_at: datetime
    row_count: int
    columns: list[str]


class RowsPage(BaseModel):
    page: int
    size: int
    total: int
    rows: list[dict[str, Any]]


class RowsBundle(BaseModel):
    columns: list[str]
    row_count: int
    rows: list[dict[str, Any]]


class DatasetDetail(DatasetSummary):
    content_type: str
    records_path: str | None
    raw_hash: str
    rows: RowsPage


class VerifyResult(BaseModel):
    dataset_id: str
    stored_hash: str
    current_hash: str
    immutable: bool


class UnifyRequest(BaseModel):
    target_schema: dict[str, Any] | None = Field(
        default=None,
        description="Цільова JSON Schema. Якщо не задано — виводиться з даних.",
    )
    field_mapping: dict[str, str] = Field(
        default_factory=dict,
        description="Перейменування полів: {'вхідна назва': 'канонічна назва'}.",
    )


class UnifyResult(BaseModel):
    dataset_id: str
    schema_source: Literal["inline", "inferred"]
    target_schema: dict[str, Any]
    row_count: int
    report: dict[str, Any]
    sample: list[dict[str, Any]]


class CleaningOptions(BaseModel):
    missing_values: Literal["mark", "drop"] = "mark"
    dedup: bool = True
    dedup_by: list[str] | None = Field(
        default=None, description="Поля для порівняння дублікатів; порожньо — весь рядок."
    )
    detect_anomalies: bool = True
    anomaly_k: float = Field(1.5, gt=0, description="Множник IQR для меж аномалій.")


class CleanRequest(BaseModel):
    target_schema: dict[str, Any] | None = None
    field_mapping: dict[str, str] = Field(default_factory=dict)
    cleaning: CleaningOptions = Field(default_factory=CleaningOptions)


class CleanResult(BaseModel):
    dataset_id: str
    schema_source: Literal["inline", "inferred"]
    unify_report: dict[str, Any]
    clean_report: dict[str, Any]
    rows_in: int
    rows_out: int
    sample: list[dict[str, Any]]


class NormalizationOptions(BaseModel):
    date_input_formats: list[str] = Field(
        default_factory=list, description="Формати strptime, напр. ['%d.%m.%Y']."
    )
    decimal_separator: str = "."
    thousands_separator: str | None = None
    category_mappings: dict[str, dict[str, str]] = Field(
        default_factory=dict,
        description="{'поле': {'варіант написання': 'канонічне значення'}}.",
    )
    unaccent: bool = False


class RecipeDefinition(BaseModel):
    """Повне визначення рецепту — правила всіх трьох етапів обробки."""

    target_schema: dict[str, Any] | None = None
    field_mapping: dict[str, str] = Field(default_factory=dict)
    key_fields: list[str] | None = Field(
        default=None,
        description="Поля для метрики повноти. Порожньо — 'required' зі схеми.",
    )
    cleaning: CleaningOptions = Field(default_factory=CleaningOptions)
    normalization: NormalizationOptions = Field(default_factory=NormalizationOptions)


class ProcessRequest(RecipeDefinition):
    recipe_id: str | None = Field(
        default=None,
        description="Якщо задано — беруться правила рецепту, а не поля запиту.",
    )
    recipe_version: int | None = None


class ProcessResult(BaseModel):
    dataset_id: str
    schema_source: Literal["inline", "inferred"]
    recipe_used: dict[str, Any] | None = None
    unify_report: dict[str, Any]
    clean_report: dict[str, Any]
    normalize_report: dict[str, Any]
    metrics: dict[str, Any]
    rows_in: int
    rows_out: int
    sample: list[dict[str, Any]]


class ProcessJobRequest(RecipeDefinition):
    dataset_id: str
    recipe_id: str | None = None
    recipe_version: int | None = None


class JobCreated(BaseModel):
    job_id: str
    status: str


class JobSummary(BaseModel):
    job_id: str
    dataset_id: str
    status: str
    stage: str | None
    created_at: datetime
    finished_at: datetime | None


class JobDetail(JobSummary):
    recipe_used: dict[str, Any] | None
    error: str | None
    timings: dict[str, Any] | None
    started_at: datetime | None


class ResultOut(BaseModel):
    job_id: str
    dataset_id: str
    recipe_used: dict[str, Any] | None
    metrics: dict[str, Any]
    unify_report: dict[str, Any]
    clean_report: dict[str, Any]
    normalize_report: dict[str, Any]
    row_count: int
    rows: RowsPage


class RecipeCreate(BaseModel):
    name: str
    definition: RecipeDefinition


class RecipeUpdate(BaseModel):
    name: str | None = None
    definition: RecipeDefinition


class RecipeSummary(BaseModel):
    recipe_id: str
    version: int
    name: str
    created_at: datetime


class RecipeOut(RecipeSummary):
    definition: RecipeDefinition
