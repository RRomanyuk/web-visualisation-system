import { useEffect, useState } from "react";
import { api } from "../api.js";
import DataTable from "./DataTable.jsx";

const PAGE_SIZE = 25;

export default function DatasetPreview({ datasetId }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [verify, setVerify] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setPage(1);
  }, [datasetId]);

  useEffect(() => {
    if (!datasetId) return;
    let alive = true;
    setError("");
    api.datasets
      .get(datasetId, page, PAGE_SIZE)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [datasetId, page]);

  if (!datasetId) return null;
  if (error) return <div className="card error-text">{error}</div>;
  if (!data) return <div className="card muted">Завантаження…</div>;

  const totalPages = Math.max(1, Math.ceil(data.rows.total / PAGE_SIZE));

  return (
    <div className="card">
      <h2>Сирі дані · {data.id}</h2>
      <dl className="meta">
        <div><dt>Джерело</dt><dd>{data.source_url}</dd></div>
        <div><dt>Формат</dt><dd>{data.format} ({data.content_type || "—"})</dd></div>
        <div><dt>Отримано</dt><dd>{new Date(data.fetched_at).toLocaleString()}</dd></div>
        <div><dt>Рядків</dt><dd>{data.rows.total}</dd></div>
        <div><dt>Колонок</dt><dd>{data.columns.length}</dd></div>
        <div>
          <dt>Хеш (незмінність)</dt>
          <dd>
            <code className="hash">{data.raw_hash.slice(0, 16)}…</code>{" "}
            <button
              className="link-btn"
              onClick={() =>
                api.datasets.verify(data.id).then(setVerify).catch((e) => setError(e.message))
              }
            >
              перевірити
            </button>
            {verify && (
              <span className={verify.immutable ? "ok-text" : "error-text"}>
                {verify.immutable ? " ✓ незмінні" : " ✗ змінені"}
              </span>
            )}
          </dd>
        </div>
      </dl>

      <DataTable columns={data.columns} rows={data.rows.rows} />

      <div className="pager">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>←</button>
        <span>{page} / {totalPages}</span>
        <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>→</button>
      </div>
    </div>
  );
}
