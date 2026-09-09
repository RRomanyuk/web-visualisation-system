import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { fromDefinition, toDefinition } from "../lib/recipe.js";
import StructureInputs from "./StructureInputs.jsx";
import ReportsBlock from "./ReportsBlock.jsx";
import JobResult from "./JobResult.jsx";

const CLEAN_DEFAULTS = {
  missing_values: "mark",
  dedup: true,
  dedup_by: "",
  detect_anomalies: true,
  anomaly_k: 1.5,
};

const NORM_DEFAULTS = {
  date_input_formats: "",
  decimal_separator: ".",
  thousands_separator: "",
  unaccent: false,
  category_mappings: "",
};

export default function ProcessPanel({ datasetId }) {
  const [mappingText, setMappingText] = useState("");
  const [schemaText, setSchemaText] = useState("");
  const [keyFieldsText, setKeyFieldsText] = useState("");
  const [clean, setClean] = useState(CLEAN_DEFAULTS);
  const [norm, setNorm] = useState(NORM_DEFAULTS);

  const [recipes, setRecipes] = useState([]);
  const [recipeId, setRecipeId] = useState("");

  const [preview, setPreview] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [activeJobId, setActiveJobId] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const refreshRecipes = useCallback(async () => {
    try {
      setRecipes(await api.recipes.list());
    } catch {
      /* не критично */
    }
  }, []);

  const refreshJobs = useCallback(async () => {
    try {
      setJobs(await api.jobs.list(datasetId));
    } catch {
      /* не критично */
    }
  }, [datasetId]);

  useEffect(() => {
    setMappingText("");
    setSchemaText("");
    setKeyFieldsText("");
    setClean(CLEAN_DEFAULTS);
    setNorm(NORM_DEFAULTS);
    setRecipeId("");
    setPreview(null);
    setActiveJobId(null);
    setError("");
    refreshRecipes();
    refreshJobs();
  }, [datasetId, refreshRecipes, refreshJobs]);

  function applyForm(form) {
    setMappingText(form.mappingText);
    setSchemaText(form.schemaText);
    setKeyFieldsText(form.keyFieldsText);
    setClean(form.clean);
    setNorm(form.norm);
  }

  function currentDefinition() {
    return toDefinition({ mappingText, schemaText, keyFieldsText, clean, norm });
  }

  async function selectRecipe(id) {
    setRecipeId(id);
    setError("");
    if (!id) return;
    try {
      const rec = await api.recipes.get(id);
      applyForm(fromDefinition(rec.definition));
    } catch (e) {
      setError(e.message);
    }
  }

  async function saveAsNew() {
    const name = window.prompt("Назва нового рецепту:");
    if (!name) return;
    try {
      const rec = await api.recipes.create(name.trim(), currentDefinition());
      await refreshRecipes();
      setRecipeId(rec.recipe_id);
    } catch (e) {
      setError(e instanceof SyntaxError ? `Некоректний JSON: ${e.message}` : e.message);
    }
  }

  async function saveVersion() {
    const rec = recipes.find((r) => r.recipe_id === recipeId);
    if (!rec) return;
    try {
      const updated = await api.recipes.update(recipeId, rec.name, currentDefinition());
      await refreshRecipes();
      setError("");
      window.alert(`Збережено версію ${updated.version}`);
    } catch (e) {
      setError(e instanceof SyntaxError ? `Некоректний JSON: ${e.message}` : e.message);
    }
  }

  async function runPreview() {
    setBusy("preview");
    setError("");
    setPreview(null);
    setActiveJobId(null);
    try {
      setPreview(await api.datasets.preview(datasetId, currentDefinition()));
    } catch (e) {
      setError(e instanceof SyntaxError ? `Некоректний JSON: ${e.message}` : e.message);
    } finally {
      setBusy("");
    }
  }

  async function runJob() {
    setBusy("job");
    setError("");
    setPreview(null);
    try {
      const { job_id } = await api.process({
        dataset_id: datasetId,
        ...currentDefinition(),
      });
      setActiveJobId(job_id);
      // дати задачі трохи часу й оновити список
      setTimeout(refreshJobs, 800);
    } catch (e) {
      setError(e instanceof SyntaxError ? `Некоректний JSON: ${e.message}` : e.message);
    } finally {
      setBusy("");
    }
  }

  const setC = (k) => (e) =>
    setClean({ ...clean, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const setN = (k) => (e) =>
    setNorm({ ...norm, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const selected = recipes.find((r) => r.recipe_id === recipeId);

  return (
    <div className="card">
      <h2>Обробка (уніфікація → очищення → нормалізація)</h2>

      <div className="recipe-bar">
        <label>
          Рецепт
          <select value={recipeId} onChange={(e) => selectRecipe(e.target.value)}>
            <option value="">— без рецепту —</option>
            {recipes.map((r) => (
              <option key={r.recipe_id} value={r.recipe_id}>
                {r.name} · v{r.version}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="link-btn" onClick={saveAsNew}>
          зберегти як новий
        </button>
        {selected && (
          <button type="button" className="link-btn" onClick={saveVersion}>
            зберегти нову версію «{selected.name}»
          </button>
        )}
      </div>

      <h3 className="section">1. Структура</h3>
      <StructureInputs
        datasetId={datasetId}
        mappingText={mappingText}
        setMappingText={setMappingText}
        schemaText={schemaText}
        setSchemaText={setSchemaText}
      />
      <label style={{ marginTop: 10 }}>
        Ключові поля для метрики повноти (через кому; порожньо — «required» зі схеми)
        <input
          type="text"
          value={keyFieldsText}
          placeholder="city, amount"
          onChange={(e) => setKeyFieldsText(e.target.value)}
        />
      </label>

      <h3 className="section">2. Очищення</h3>
      <div className="options">
        <label>
          Пропущені значення в обов'язкових полях
          <select value={clean.missing_values} onChange={setC("missing_values")}>
            <option value="mark">маркувати рядок</option>
            <option value="drop">видаляти рядок</option>
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={clean.dedup} onChange={setC("dedup")} />
          Видаляти дублікати (виявляються завжди)
        </label>
        <label>
          Дублікати за полями (через кому; порожньо — весь рядок)
          <input
            type="text"
            value={clean.dedup_by}
            placeholder="state, day"
            onChange={setC("dedup_by")}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={clean.detect_anomalies}
            onChange={setC("detect_anomalies")}
          />
          Виявляти аномалії (IQR)
        </label>
        <label>
          Множник IQR
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={clean.anomaly_k}
            disabled={!clean.detect_anomalies}
            onChange={setC("anomaly_k")}
          />
        </label>
      </div>

      <h3 className="section">3. Нормалізація</h3>
      <div className="options">
        <label>
          Формати вхідних дат (через кому, strptime)
          <input
            type="text"
            value={norm.date_input_formats}
            placeholder="%d.%m.%Y, %d/%m/%Y"
            onChange={setN("date_input_formats")}
          />
        </label>
        <div className="row">
          <label>
            Десятковий роздільник у джерелі
            <input
              type="text"
              value={norm.decimal_separator}
              maxLength={1}
              onChange={setN("decimal_separator")}
            />
          </label>
          <label>
            Розрядний роздільник (прибрати)
            <input
              type="text"
              value={norm.thousands_separator}
              placeholder="напр. пробіл"
              onChange={setN("thousands_separator")}
            />
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={norm.unaccent} onChange={setN("unaccent")} />
          Знімати діакритику при зіставленні категорій
        </label>
        <label>
          Словник категорій (JSON)
          <textarea
            rows={4}
            value={norm.category_mappings}
            placeholder='{ "city": { "kyiv": "Київ", "м. київ": "Київ" } }'
            onChange={setN("category_mappings")}
          />
        </label>
      </div>

      <div className="run-bar">
        <button type="button" onClick={runPreview} disabled={!!busy}>
          {busy === "preview" ? "…" : "Попередній перегляд"}
        </button>
        <button type="button" className="primary" onClick={runJob} disabled={!!busy}>
          {busy === "job" ? "…" : "Запустити й зберегти"}
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}

      {jobs.length > 0 && (
        <div className="jobs-history">
          <span className="muted">Збережені обробки:</span>{" "}
          {jobs.map((j) => (
            <button
              key={j.job_id}
              className={`chip ${j.job_id === activeJobId ? "active" : ""}`}
              onClick={() => {
                setPreview(null);
                setActiveJobId(j.job_id);
              }}
              title={new Date(j.created_at).toLocaleString()}
            >
              {j.job_id.replace("job_", "")} · {j.status}
            </button>
          ))}
        </div>
      )}

      {activeJobId && <JobResult jobId={activeJobId} />}

      {preview && (
        <>
          <p className="muted">
            Прев'ю (не збережено) · схема:{" "}
            {preview.schema_source === "inferred" ? "виведена з даних" : "задана вручну"} · рядків:{" "}
            {preview.rows_in} → {preview.rows_out}
            {preview.recipe_used &&
              ` · рецепт ${preview.recipe_used.name} v${preview.recipe_used.version}`}
          </p>
          <ReportsBlock
            metrics={preview.metrics}
            unifyReport={preview.unify_report}
            cleanReport={preview.clean_report}
            normalizeReport={preview.normalize_report}
            columns={preview.unify_report.unified_columns}
            rows={preview.sample}
            dataTitle={`Оброблені дані (перші ${preview.sample.length})`}
          />
        </>
      )}
    </div>
  );
}
