# Архітектура та структура коду

Довідник до розділів «Архітектурне проектування» і «Детальне проектування».
Актуально станом на поточний код.

---

## 1. Загальна архітектура

Двошарова клієнт-серверна система; шари спілкуються **лише через HTTP REST/JSON**.

```
┌───────────────────────────── Браузер ─────────────────────────────┐
│  Клієнтська частина (React + Vite)                                 │
│  App → сторінки → компоненти → api.js ── fetch ──┐                 │
└─────────────────────────────────────────────────┼─────────────────┘
                                                  │ /api/*
┌─────────────────────────────────────────────────┼─────────────────┐
│  Серверна частина (FastAPI)                      ▼                 │
│  ┌── Транспорт ──────────────────────────────────────────────┐    │
│  │  routers/ : health, datasets, recipes, jobs               │    │
│  └──────────────┬───────────────────────────────────────────┘    │
│  ┌── Логіка (services/) ───────────────────────▼──────────────┐   │
│  │  fetch · parse · schema · unify · clean · normalize ·      │   │
│  │  metrics · pipeline · recipe_store · job_runner            │   │
│  └──────────────┬───────────────────────────────────────────┘    │
│  ┌── Дані ──────▼───────────────────────────────────────────┐    │
│  │  models/ (ORM) → SQLAlchemy → SQLite (data/app.db)        │    │
│  └─────────────────────────────────────────────────────────┘    │
│  Наскрізне: config (.env) · errors (єдина схема помилок)         │
└─────────────────────────────────────────────────────────────────┘
        │ вихідні HTTP-запити (fetch.py)
        ▼
   Зовнішні відкриті REST API (JSON / CSV)
```

**Принципи розподілу:**
- `routers/` — тонкі: розбір запиту, виклик одного-двох сервісів, формування відповіді. Без бізнес-логіки.
- `services/` — уся логіка. Модулі обробки (`schema`, `unify`, `clean`, `normalize`, `metrics`) не залежать від FastAPI і від БД — це чисті функції над списками словників. Їх можна викликати й тестувати ізольовано.
- `models/` — визначення таблиць; єдине місце, що знає структуру сховища.
- `schemas.py` — контракти API (Pydantic): що приймається і що повертається; валідація вхідних даних відбувається тут автоматично.

---

## 2. Серверна частина: файл за файлом

### 2.1 Наскрізні модулі

| Файл | Відповідальність | Від чого залежить |
|---|---|---|
| `app/config.py` | Клас `Settings` — читає `.env` (адреса БД, CORS, allowlist джерел, таймаути, ліміти). `get_settings()` кешується (`lru_cache`). | — |
| `app/database.py` | `engine` (підключення до SQLite), `SessionLocal` (фабрика сесій), `Base` (батько всіх моделей), залежність `get_db()` (сесія на час запиту), `init_db()` (`create_all` — створює відсутні таблиці при старті). | `config` |
| `app/errors.py` | `AppError(code, message, status_code, details)` — виняток, який кидають сервіси. Два обробники перетворюють будь-яку помилку на єдину структуру `{"error": {code, message, details}}`. | — |
| `app/main.py` | Точка збірки: створює `FastAPI`, підключає CORS, реєструє обробники помилок, монтує 4 роутери під `/api`, у `lifespan` викликає `init_db()`. | усі роутери, `config`, `database`, `errors` |

### 2.2 Дані

**`app/models.py`** — 4 таблиці (SQLAlchemy ORM). Великі масиви зберігаються в стовпцях типу `JSON` (у SQLite — текст).

| Таблиця | Ключ | Призначення | Ключові поля |
|---|---|---|---|
| `Dataset` | `id` | Сирий набір із зовнішнього API. Після створення `raw_data` не оновлюється. | `source_url`, `format`, `columns`, `raw_data`, `row_count` |
| `Recipe` | `(recipe_id, version)` | Рецепт обробки. Кожне редагування — **новий рядок** із наступною версією (append-only, історія зберігається). | `name`, `definition` (JSON = `RecipeDefinition`) |
| `Job` | `id` | Задача обробки. `definition` — **знімок** застосованих правил (щоб результат відтворювався, навіть якщо рецепт потім змінять). | `dataset_id`, `status`, `stage`, `error`, `timings`, `recipe_used` |
| `Result` | `job_id` | Результат успішної задачі. | `processed_data`, `metrics`, `unify_report`, `clean_report`, `normalize_report` |

**Зв'язки** (логічні; жорстких FK немає — прототип):
```
Dataset 1 ──< N Job 1 ──(0..1) Result
Recipe  — окремо; Job.recipe_used і Job.definition — копії, не посилання
```

**`app/schemas.py`** — Pydantic-моделі (DTO). Центральна — `RecipeDefinition`:
```
RecipeDefinition = { target_schema?, field_mapping, key_fields?, cleaning, normalization }
   ├── ProcessRequest      = RecipeDefinition + { recipe_id?, recipe_version? }   (для /preview)
   └── ProcessJobRequest   = RecipeDefinition + { dataset_id, recipe_id?, recipe_version? }  (для /process)
```
Решта — `DatasetCreate/Summary/Detail`, `CleaningOptions`, `NormalizationOptions`,
`Unify/Clean/Process Result`, `Job Summary/Detail`, `ResultOut`, `Recipe Create/Update/Summary/Out`,
`RowsPage` (сторінка) і `RowsBundle` (усі рядки).

### 2.3 Транспорт (`app/routers/`)

| Роутер | Ендпоінти | Що викликає |
|---|---|---|
| `health.py` | `GET /api/health` | — |
| `datasets.py` | `POST /api/datasets` (отримати+зберегти), `GET /api/datasets`, `GET /api/datasets/{id}` (пагінація), `GET /api/datasets/{id}/rows` (усі рядки), `GET /api/datasets/{id}/schema` (виведена схема), `POST /api/datasets/{id}/unify`, `POST /api/datasets/{id}/clean`, `POST /api/datasets/{id}/preview` (синхронний повний конвеєр без збереження), `DELETE /api/datasets/{id}` | `fetch`, `parse`, `schema`, `unify`, `clean`, `pipeline`, `recipe_store` |
| `recipes.py` | `POST /api/recipes`, `GET /api/recipes` (останні версії), `GET /api/recipes/{id}?version=`, `GET /api/recipes/{id}/versions`, `PUT /api/recipes/{id}` (нова версія), `DELETE /api/recipes/{id}` (усі версії) | `recipe_store` |
| `jobs.py` | `POST /api/process` → `{job_id}` (створює `Job`, ставить фонову задачу), `GET /api/jobs?dataset_id=`, `GET /api/jobs/{id}` (статус), `GET /api/result/{job_id}` (пагінація), `GET /api/result/{job_id}/rows` (усі рядки) | `recipe_store`, `job_runner` |

### 2.4 Логіка (`app/services/`)

| Модуль | Головна функція / клас | Що робить | Залежить від |
|---|---|---|---|
| `fetch.py` | `fetch_raw(...)` | HTTP GET до зовнішнього API: перевірка схеми URL, allowlist хостів (SSRF), таймаут, потокове обмеження розміру. Повертає `(bytes, content_type)`. | `errors` |
| `parse.py` | `parse_dataset(...)` | `bytes` → `list[dict]`. JSON: масив, або обгортка за `records_path`, або автопошук масиву. CSV: `pandas.read_csv` (значення дослівно). Збирає перелік колонок. | `errors`, `schemas` (CsvOptions), `pandas` |
| `schema.py` | `infer_schema`, `classify_value`, `matches_type` | Класифікація значень за типами (`integer/number/boolean/date/date-time/string/object/array`), зведення мішаних колонок, побудова JSON-Schema-подібного опису. | — |
| `unify.py` | `unify(records, columns, target_schema, field_mapping)` → `(unified, report, effective_schema)` | Перейменування полів (і в даних, і в назвах схеми), закріплення типів, звіт про розбіжності структури. **Значення не чіпає.** | `schema` |
| `clean.py` | `clean(records, schema, CleaningConfig)` → `(output, report)` | Виявлення дефектів (пропуски, дублікати, невірні типи, аномалії IQR), реєстр дефектів, дії на рівні рядків (видалити дублікати / неповні). **Значення не чіпає.** | `schema`, `pandas` |
| `normalize.py` | `normalize(records, schema, NormalizationConfig)` → `(output, report)` | **Єдиний етап, що змінює значення:** дати → ISO 8601, числа → канонічні, категорії → за словником. Незводимі значення → дефекти. | stdlib |
| `metrics.py` | `completeness()`, `retention()` | Формули метрик повноти й частки збережених записів. | — |
| `pipeline.py` | `run_pipeline(raw_data, columns, definition, on_stage)` → `PipelineOutput` | **Оркестратор:** `unify → clean → normalize`, вимірює час кожного етапу, обчислює метрики «до/після» (повторний прогін детектора `clean` на кінцевому наборі). | `schemas`, `schema`, `unify`, `clean`, `normalize`, `metrics` |
| `recipe_store.py` | `latest`, `get_version`, `all_versions`, `list_latest`, `resolve()` | Запити рецептів до БД. `resolve(recipe_id, version, inline)` → `(RecipeDefinition, recipe_used|None)`: якщо задано `recipe_id` — беруться правила рецепту, інакше — inline. | `models`, `errors`, `schemas` |
| `job_runner.py` | `run_job(job_id)` | Фонове виконання: **власна сесія БД**, ставить `status=processing`, оновлює `stage` через колбек, кличе `run_pipeline`, зберігає `Result` і `status=done` (або `error` з текстом). | `database`, `models`, `schemas`, `pipeline` |

### 2.5 Граф залежностей серверної частини (без циклів)

```
main
 ├─ routers/health
 ├─ routers/datasets ─┬─ services/fetch ── errors
 │                    ├─ services/parse ── errors, schemas
 │                    ├─ services/schema
 │                    ├─ services/unify ── services/schema
 │                    ├─ services/clean ── services/schema
 │                    ├─ services/pipeline ─┬─ services/{schema,unify,clean,normalize,metrics}
 │                    │                     └─ schemas
 │                    └─ services/recipe_store ── models, errors, schemas
 ├─ routers/recipes ── services/recipe_store
 └─ routers/jobs ─────┬─ services/recipe_store
                      └─ services/job_runner ─┬─ database, models, schemas
                                              └─ services/pipeline

models ── database ── config          errors, config — листя (ні від чого не залежать)
```

---

## 3. Клієнтська частина: файл за файлом

### 3.1 Каркас

| Файл | Відповідальність |
|---|---|
| `src/main.jsx` | Монтує React у `#root`. |
| `src/App.jsx` | Hash-роутинг (2 маршрути), перевірка бекенда, вкладки. `VizPage` вантажиться **лениво** (`React.lazy`) — Plotly не тягнеться, доки не відкрито вкладку «Візуалізація». |
| `src/api.js` | Єдина обгортка над `fetch`: додає базовий шлях `/api`, розбирає схему помилки в `Error` з полем `.code`. Усі ендпоінти згруповані: `api.datasets.*`, `api.process`, `api.jobs.*`, `api.results.*`, `api.recipes.*`. |
| `src/styles.css` | Уся стилізація (без CSS-фреймворків). |

### 3.2 Допоміжні модулі (`src/lib/`)

| Файл | Що надає |
|---|---|
| `useHash.js` | Хук `useHash()` (поточний маршрут) + `navigate(path)`. Мінімальний роутер без бібліотеки. |
| `recipe.js` | `toDefinition(form)` / `fromDefinition(def)` — перетворення між станом форми `ProcessPanel` і структурою `RecipeDefinition`. |
| `structure.js` | Чиста логіка таблиці полів: `readStructure`, `buildRows`, `setName` / `setType` / `setRequired` / `setKey` / `setEnabled`. Редагує лише те, що знає (ім'я, тип, required, ключове), решта JSON (enum, minimum, чужі записи маппінгу) проходить без змін. При перейменуванні переносить назву в схему, `required` і ключові поля, щоб не лишалось «осиротілих» полів. |
| `aggregate.js` | `toNum`, `applyFilter(rows, f)`, `buildTraces(rows, opt)` (групування/агрегація/сортування під Plotly), `axisTitle(opt)`. |
| `defects.js` | `DEFECT_LABELS`, `label(type)` — людські назви типів дефектів. |

### 3.3 Сторінки (`src/pages/`)

| Сторінка | Стан, який тримає | Дочірні компоненти |
|---|---|---|
| `DataPage.jsx` | список наборів, `selectedId`. Трьохколонкове розташування. | `SourceForm`, `DatasetList`, `DatasetPreview`, `ProcessPanel` |
| `VizPage.jsx` | вибраний набір, версія (`raw`/`job_id`), завантажені сирі й оброблені рядки, тип графіка, поля осей, агрегація, фільтр, режим порівняння. | `Chart` |

### 3.4 Компоненти (`src/components/`)

| Компонент | Роль | Запити / залежності |
|---|---|---|
| `SourceForm` | Форма «додати джерело». | `api.datasets.create` |
| `DatasetList` | Список наборів, вибір, видалення. | — (дані з `DataPage`) |
| `DatasetPreview` | Метадані + таблиця сирих даних із пагінацією. | `api.datasets.get` |
| `DataTable` | Універсальний рендер таблиці (колонки + рядки). | — |
| `ProcessPanel` | **Центральний компонент обробки.** Панель рецептів + 3 секції налаштувань + кнопки «Перегляд»/«Запустити й зберегти» + історія задач + вивід результату. | `api.datasets.preview`, `api.process`, `api.jobs.list`, `api.recipes.*`, `lib/recipe`, `StructureInputs`, `ReportsBlock`, `JobResult` |
| `StructureInputs` | Блок «структура» рецепту: перемикач **Таблиця / JSON** над одними й тими самими даними (маппінг, цільова схема, ключові поля) + «скинути до виведеної з даних». У вкладці JSON — сирі текстові поля й кнопка «підставити виведену схему». | `api.datasets.schema`, `SchemaTable` |
| `SchemaTable` | **Візуальний редактор схеми:** рядок на колонку набору — «увімкнено», назва в схемі (→ `field_mapping`), тип (→ `properties`), «обов'язкове» (→ `required`), «ключове» (→ `key_fields`). Заповнюється виведеною схемою; до першої правки схема не матеріалізується (її виводить бекенд). Некоректний JSON блокує таблицю з поясненням. Бекенд не змінено. | `api.datasets.schema`, `lib/structure` |
| `ReportsBlock` | Спільний вивід результату (прев'ю і задача): метрики + 3 звіти + таблиця. | `MetricsView`, `UnifyReport`, `CleanReport`, `NormalizeReport`, `DataTable` |
| `MetricsView` | Таблиця метрик «до / після» з підсвіткою. | `lib/defects` |
| `UnifyReport` | Звіт етапу уніфікації. | — |
| `CleanReport` | Звіт очищення + межі аномалій + реєстр дефектів. | `DefectTable`, `lib/defects` |
| `NormalizeReport` | Звіт нормалізації (перетворено / не вдалося). | `DefectTable`, `lib/defects` |
| `DefectTable` | Таблиця реєстру дефектів (рядок / поле / тип / деталі). | `lib/defects` |
| `JobResult` | Опитує `GET /jobs/{id}` кожні 0.6 с, показує стадію, після `done` вантажить `GET /result/{id}` з пагінацією. | `api.jobs.get`, `api.results.get`, `ReportsBlock` |
| `Chart` | Обгортка Plotly.js: `Plotly.react(...)` в `useEffect`, `Plotly.purge` при демонтуванні. | `plotly.js-basic-dist-min` |

### 3.5 Потік залежностей клієнта

```
App ─┬─ DataPage ─┬─ SourceForm ────────────── api
     │            ├─ DatasetList
     │            ├─ DatasetPreview ─────────── api
     │            └─ ProcessPanel ─┬─ StructureInputs ─ SchemaTable ── lib/structure, api
     │                             ├─ ReportsBlock ─┬─ MetricsView ── lib/defects
     │                             │                ├─ UnifyReport
     │                             │                ├─ CleanReport ─── DefectTable ── lib/defects
     │                             │                ├─ NormalizeReport ─ DefectTable
     │                             │                └─ DataTable
     │                             ├─ JobResult ──── api, ReportsBlock
     │                             └─ lib/recipe
     └─ VizPage ──┬─ Chart ──────── plotly.js-basic
                  └─ lib/aggregate
```

---

## 4. Ключові сценарії (потоки даних)

### 4.1 Отримання набору даних

```
SourceForm ──POST /api/datasets──▶ routers/datasets.create_dataset
   1. services/fetch.fetch_raw()      завантажує URL, перевіряє, обмежує розмір
   2. services/parse.parse_dataset()  bytes → list[dict], визначає колонки
   3. Dataset(...) → db.add → commit   зберігає сирі дані незмінно
   ◀── DatasetSummary (id, columns, row_count)
```

### 4.2 Попередній перегляд обробки (синхронно, без збереження)

```
ProcessPanel ──POST /api/datasets/{id}/preview──▶ routers/datasets.preview_dataset
   1. recipe_store.resolve()          inline-правила або правила рецепту
   2. services/pipeline.run_pipeline():
        unify()      →  перейменування, типи, звіт структури
        clean()      →  реєстр дефектів, видалення рядків
        normalize()  →  перетворення значень
        + метрики «до/після», час етапів
   ◀── ProcessResult (звіти + метрики + sample[25])   ← у БД нічого не пишеться
```

### 4.3 Запуск обробки із збереженням (асинхронно)

```
ProcessPanel ──POST /api/process──▶ routers/jobs.start_processing
   1. recipe_store.resolve() → definition (знімок правил)
   2. Job(status="pending", definition=...) → commit
   3. background_tasks.add_task(run_job, job_id)
   ◀── {job_id, status: "pending"}          (відповідь одразу, 202)

   [фон] services/job_runner.run_job(job_id):        власна сесія БД
      status=processing
      run_pipeline(on_stage=lambda s: job.stage=s; commit)   ← стадія видима клієнту
      Result(processed_data, metrics, звіти) → commit
      status=done, timings=...

   JobResult ──GET /api/jobs/{id}── (кожні 0.6 с) ──▶ status/stage
   JobResult ──GET /api/result/{id}── (коли done) ──▶ метрики + звіти + rows(пагінація)
```

### 4.4 Візуалізація

```
VizPage:
   вибір набору  ──GET /api/jobs?dataset_id=──▶ список готових обробок
   вибір версії:
      "Сирі дані"  ──GET /api/datasets/{id}/rows──▶ {columns, rows}
      обробка      ──GET /api/result/{job_id}/rows──▶ {columns, rows}
   налаштування (тип, поля, агрегація, фільтр)
      lib/aggregate.applyFilter() → buildTraces()   у браузері
      Chart → Plotly.react()
   режим "порівняти" → два Chart (сирі vs оброблені) на однакових налаштуваннях
```

---

## 5. Наскрізні рішення

| Аспект | Рішення | Де |
|---|---|---|
| Обробка помилок | Сервіси кидають `AppError`; глобальний обробник → `{"error": {code, message, details}}` + HTTP-код. Клієнт (`api.js`) розбирає в `Error.code`. | `errors.py`, `api.js` |
| Конфігурація | `.env` → `Settings` (типізовано, з дефолтами). | `config.py`, `.env.example` |
| Відтворюваність | Сирі дані незмінні; рецепт версіонований; `Job.definition` — знімок; конвеєр детермінований (фіксований порядок, стабільне сортування, жодних випадкових операцій). | `models.py`, `pipeline.py` |
| Розмежування етапів | Уніфікація — тільки структура; очищення — тільки виявлення + рядки; нормалізація — тільки значення. Витримано в сигнатурах і коментарях функцій. | `unify.py`, `clean.py`, `normalize.py` |
| Метрики «до/після» | Той самий детектор (`clean`) прогоняється двічі: на уніфікованому сирому наборі й на кінцевому — тому числа зіставні. | `pipeline.py` |
| Асинхронність | `BackgroundTasks` FastAPI; фонова функція має власну сесію БД; прогрес — через оновлення `Job.stage`. | `jobs.py`, `job_runner.py` |
| Пагінація великих даних | `RowsPage` (сторінка) для перегляду; `RowsBundle` (усе) — окремі ендпоінти `/rows` для візуалізації. | `schemas.py`, роутери |
```
