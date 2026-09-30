import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import Chart from "../components/Chart.jsx";
import {
  applyFilter,
  buildChart,
  pickDefaults,
  planAxis,
  profileColumns,
  syncYRange,
  toRawView,
} from "../lib/aggregate.js";

const CHART_TYPES = [
  { id: "bar", label: "Стовпчикова" },
  { id: "pie", label: "Кругова" },
  { id: "line", label: "Лінійна" },
];
const OPS = [
  { id: "eq", label: "=" },
  { id: "ne", label: "≠" },
  { id: "contains", label: "містить" },
  { id: "gt", label: ">" },
  { id: "lt", label: "<" },
];
const KIND_LABEL = { number: "число", date: "дата", text: "текст" };
const EMPTY_FILTER = { field: "", op: "eq", value: "" };

// Графік або пояснення, чому його нема (замість порожнього полотна) + що автоматично підібрано.
function ChartBlock({ chart, height }) {
  if (!chart) return null;
  if (chart.empty) return <p className="muted chart-empty">{chart.empty}</p>;
  return (
    <>
      <Chart traces={chart.traces} layout={chart.layout} height={height} />
      {chart.notes.length > 0 && <p className="muted small">{chart.notes.join(" ")}</p>}
    </>
  );
}

export default function VizPage() {
  const [datasets, setDatasets] = useState([]);
  const [datasetId, setDatasetId] = useState("");
  const [jobs, setJobs] = useState([]);
  const [version, setVersion] = useState("raw");

  const [rawData, setRawData] = useState(null);
  const [procData, setProcData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [chartType, setChartType] = useState("bar");
  const [xField, setXField] = useState("");
  const [yField, setYField] = useState("");
  const [agg, setAgg] = useState("count");
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const [compare, setCompare] = useState(false);

  useEffect(() => {
    api.datasets.list().then(setDatasets).catch(() => {});
  }, []);

  useEffect(() => {
    if (!datasetId) return;
    setVersion("raw");
    setProcData(null);
    setError("");
    api.jobs
      .list(datasetId)
      .then((js) => setJobs(js.filter((j) => j.status === "done")))
      .catch(() => setJobs([]));
    setLoading(true);
    api.datasets
      .rows(datasetId)
      .then((d) => setRawData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [datasetId]);

  useEffect(() => {
    if (version === "raw" || !version) {
      setProcData(null);
      return;
    }
    setLoading(true);
    setError("");
    api.results
      .rows(version)
      .then((d) => setProcData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [version]);

  const activeData = version === "raw" ? rawData : procData;
  const columns = useMemo(() => activeData?.columns || [], [activeData]);
  const profiles = useMemo(
    () => (activeData ? profileColumns(activeData.rows, columns) : {}),
    [activeData, columns]
  );
  const numericCols = useMemo(
    () => columns.filter((c) => profiles[c]?.kind === "number"),
    [columns, profiles]
  );

  // Поля за замовчуванням — за виглядом значень: X — категорія з малою кількістю значень,
  // Y — числове поле (інакше суми/лінія не мали б чого рахувати).
  useEffect(() => {
    if (!columns.length) return;
    const d = pickDefaults(columns, profiles);
    if (!columns.includes(xField)) setXField(d.x);
    if (!numericCols.includes(yField)) setYField(d.y);
    if (!numericCols.length && agg !== "count") setAgg("count");
    if (filter.field && !columns.includes(filter.field)) setFilter(EMPTY_FILTER);
  }, [columns, profiles]); // eslint-disable-line react-hooks/exhaustive-deps

  function pickType(t) {
    setChartType(t);
    // Лінія по текстових категоріях не має порядку — беремо дату чи число, якщо вони є.
    if (t === "line" && profiles[xField]?.kind === "text") {
      const alt =
        columns.find((c) => profiles[c].kind === "date") ||
        columns.find((c) => profiles[c].kind === "number" && c !== yField);
      if (alt) setXField(alt);
    }
  }

  const opt = { type: chartType, x: xField, y: yField, agg };
  const comparing = compare && version !== "raw";

  const filteredRows = useMemo(
    () => (activeData ? applyFilter(activeData.rows, filter) : []),
    [activeData, filter]
  );

  // Сира сторона порівняння: імена полів перекладаються з оброблених у сирі
  // (після маппінгу поле могло називатися інакше).
  const rawView = useMemo(
    () => (comparing && xField ? toRawView(opt, filter, procData?.column_sources) : null),
    [comparing, procData, filter, chartType, xField, yField, agg] // eslint-disable-line
  );
  const rawRows = useMemo(
    () =>
      rawView && rawData && !rawView.missing.length
        ? applyFilter(rawData.rows, rawView.filter)
        : null,
    [rawView, rawData]
  );

  // Спільний план осі X: інтервали / періоди рахуються за обома сторонами, щоб графіки збігались.
  const plan = useMemo(() => {
    if (!xField) return null;
    const lists = [filteredRows.map((r) => r[xField])];
    if (rawRows) lists.push(rawRows.map((r) => r[rawView.opt.x]));
    return planAxis(lists, profiles[xField]?.kind || "text", chartType);
  }, [filteredRows, rawRows, rawView, profiles, xField, chartType]);

  const [mainChart, rawChart] = useMemo(() => {
    if (!activeData || !xField || !plan) return [null, null];
    const main = buildChart(filteredRows, opt, plan);
    const raw = rawRows ? buildChart(rawRows, rawView.opt, plan) : null;
    return raw ? syncYRange(main, raw, chartType) : [main, null];
  }, [activeData, filteredRows, rawRows, rawView, plan, chartType, xField, yField, agg]); // eslint-disable-line

  const needsY = agg !== "count";
  const kindOf = (c) => KIND_LABEL[profiles[c]?.kind] || "";

  return (
    <div className="viz">
      <div className="card">
        <h2>Джерело</h2>
        <div className="row">
          <label>
            Набір даних
            <select value={datasetId} onChange={(e) => setDatasetId(e.target.value)}>
              <option value="">— оберіть —</option>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.id} · {d.row_count} рядків · {d.source_url.slice(0, 40)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Версія
            <select
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              disabled={!datasetId}
            >
              <option value="raw">Необроблені дані</option>
              {jobs.map((j) => (
                <option key={j.job_id} value={j.job_id}>
                  Обробка {j.job_id.replace("job_", "")} ({new Date(j.created_at).toLocaleDateString()})
                </option>
              ))}
            </select>
          </label>
        </div>
        {version !== "raw" && (
          <label className="check">
            <input
              type="checkbox"
              checked={compare}
              onChange={(e) => setCompare(e.target.checked)}
            />
            Порівняти до / після обробки
          </label>
        )}
        {loading && <p className="muted">Завантаження…</p>}
        {error && <p className="error-text">{error}</p>}
      </div>

      {activeData && (
        <div className="card">
          <h2>Графік</h2>
          <div className="chart-type">
            {CHART_TYPES.map((t) => (
              <button
                key={t.id}
                className={chartType === t.id ? "active" : ""}
                onClick={() => pickType(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="options">
            <div className="row">
              <label>
                {chartType === "line" ? "Вісь X" : "Категорія (X)"}
                <select value={xField} onChange={(e) => setXField(e.target.value)}>
                  {columns.map((c) => (
                    <option key={c} value={c}>
                      {c} · {kindOf(c)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Агрегація
                <select value={agg} onChange={(e) => setAgg(e.target.value)}>
                  <option value="count">кількість записів</option>
                  <option value="sum" disabled={!numericCols.length}>сума поля</option>
                  <option value="avg" disabled={!numericCols.length}>середнє поля</option>
                </select>
              </label>
              {needsY && (
                <label>
                  Числове поле
                  <select value={yField} onChange={(e) => setYField(e.target.value)}>
                    {numericCols.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {!numericCols.length && (
              <p className="muted small">
                У цьому наборі немає числових полів — доступна лише кількість записів.
              </p>
            )}

            <div className="row filter-row">
              <label>
                Фільтр — поле
                <select
                  value={filter.field}
                  onChange={(e) => setFilter({ ...filter, field: e.target.value })}
                >
                  <option value="">— без фільтра —</option>
                  {columns.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Умова
                <select
                  value={filter.op}
                  disabled={!filter.field}
                  onChange={(e) => setFilter({ ...filter, op: e.target.value })}
                >
                  {OPS.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Значення
                <input
                  type="text"
                  value={filter.value}
                  disabled={!filter.field}
                  onChange={(e) => setFilter({ ...filter, value: e.target.value })}
                />
              </label>
            </div>
          </div>

          <p className="muted">
            Рядків після фільтра: {filteredRows.length} з {activeData.row_count}
          </p>

          {comparing && rawData && rawView ? (
            <div className="compare">
              <div>
                <h3 className="section">До обробки ({rawData.row_count})</h3>
                {rawView.missing.length ? (
                  <p className="muted">
                    У сирих даних немає поля: {rawView.missing.join(", ")} (його додала
                    цільова схема) — порівняти нема з чим.
                  </p>
                ) : (
                  <ChartBlock chart={rawChart} height={340} />
                )}
              </div>
              <div>
                <h3 className="section">Після обробки ({activeData.row_count})</h3>
                <ChartBlock chart={mainChart} height={340} />
              </div>
            </div>
          ) : (
            <ChartBlock chart={mainChart} height={380} />
          )}
        </div>
      )}
    </div>
  );
}
