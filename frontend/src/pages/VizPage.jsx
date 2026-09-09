import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import Chart from "../components/Chart.jsx";
import { applyFilter, axisTitle, buildTraces } from "../lib/aggregate.js";

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
const EMPTY_FILTER = { field: "", op: "eq", value: "" };

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
  const columns = activeData?.columns || [];

  // дефолтні поля при зміні набору колонок
  useEffect(() => {
    if (!columns.length) return;
    if (!columns.includes(xField)) setXField(columns[0]);
    if (!columns.includes(yField)) setYField(columns[1] || columns[0]);
  }, [columns]); // eslint-disable-line react-hooks/exhaustive-deps

  const opt = { type: chartType, x: xField, y: yField, agg };
  const needsY = chartType === "line" || agg !== "count";

  const mainTraces = useMemo(() => {
    if (!activeData || !xField) return [];
    return buildTraces(applyFilter(activeData.rows, filter), opt);
  }, [activeData, filter, chartType, xField, yField, agg]); // eslint-disable-line

  const rawTraces = useMemo(() => {
    if (!compare || !rawData || !xField) return [];
    return buildTraces(applyFilter(rawData.rows, filter), opt);
  }, [compare, rawData, filter, chartType, xField, yField, agg]); // eslint-disable-line

  const titles = axisTitle(opt);
  const layout =
    chartType === "pie"
      ? { showlegend: true }
      : { xaxis: { title: titles.x, automargin: true }, yaxis: { title: titles.y } };

  const filteredCount = activeData ? applyFilter(activeData.rows, filter).length : 0;

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
              <option value="raw">Сирі дані</option>
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
                onClick={() => setChartType(t.id)}
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
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
              {chartType !== "line" && (
                <label>
                  Агрегація
                  <select value={agg} onChange={(e) => setAgg(e.target.value)}>
                    <option value="count">кількість записів</option>
                    <option value="sum">сума поля</option>
                    <option value="avg">середнє поля</option>
                  </select>
                </label>
              )}
              {needsY && (
                <label>
                  {chartType === "line" ? "Вісь Y (число)" : "Числове поле"}
                  <select value={yField} onChange={(e) => setYField(e.target.value)}>
                    {columns.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>

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
            Рядків після фільтра: {filteredCount} з {activeData.row_count}
          </p>

          {compare && rawData ? (
            <div className="compare">
              <div>
                <h3 className="section">До обробки ({rawData.row_count})</h3>
                <Chart traces={rawTraces} layout={layout} height={340} />
              </div>
              <div>
                <h3 className="section">Після обробки ({activeData.row_count})</h3>
                <Chart traces={mainTraces} layout={layout} height={340} />
              </div>
            </div>
          ) : (
            <Chart traces={mainTraces} layout={layout} />
          )}
        </div>
      )}
    </div>
  );
}
