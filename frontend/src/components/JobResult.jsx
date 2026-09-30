import { useEffect, useState } from "react";
import { api } from "../api.js";
import ReportsBlock from "./ReportsBlock.jsx";
import DataTable from "./DataTable.jsx";
import Pager from "./Pager.jsx";

const STAGE_LABELS = {
  unification: "уніфікація",
  cleaning: "очищення",
  normalization: "нормалізація",
};
const PAGE_SIZE = 25;

export default function JobResult({ jobId }) {
  const [job, setJob] = useState(null);
  const [result, setResult] = useState(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");

  useEffect(() => {
    setJob(null);
    setResult(null);
    setPage(1);
    setError("");
    if (!jobId) return;

    let stopped = false;
    let timer = null;

    async function poll() {
      try {
        const j = await api.jobs.get(jobId);
        if (stopped) return;
        setJob(j);
        if (j.status === "done") {
          setResult(await api.results.get(jobId, 1, PAGE_SIZE));
        } else if (j.status === "error") {
          setError(j.error || "помилка обробки");
        } else {
          timer = setTimeout(poll, 600);
        }
      } catch (e) {
        if (!stopped) setError(e.message);
      }
    }
    poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId]);

  async function goTo(p) {
    try {
      setResult(await api.results.get(jobId, p, PAGE_SIZE));
      setPage(p);
    } catch (e) {
      setError(e.message);
    }
  }

  if (!jobId) return null;

  if (error) {
    return <p className="error-text">Задача {jobId}: {error}</p>;
  }

  if (!result) {
    const stage = job?.stage ? ` — ${STAGE_LABELS[job.stage] || job.stage}` : "";
    const status =
      job?.status === "processing" ? `обробка${stage}` : job?.status === "pending" ? "очікує" : "…";
    return (
      <p className="muted">
        Задача <code>{jobId}</code>: {status}
      </p>
    );
  }

  const totalPages = Math.max(1, Math.ceil(result.row_count / PAGE_SIZE));

  return (
    <>
      <p className="muted">
        Задача <code>{jobId}</code> · готово · рядків: {result.row_count}
        {result.recipe_used &&
          ` · конфігурація ${result.recipe_used.name} v${result.recipe_used.version}`}
      </p>
      <ReportsBlock
        metrics={result.metrics}
        unifyReport={result.unify_report}
        cleanReport={result.clean_report}
        normalizeReport={result.normalize_report}
        dataTitle={`Оброблені дані (стор. ${page}/${totalPages})`}
        dataView={
          <>
            <DataTable
              columns={result.unify_report.unified_columns}
              rows={result.rows.rows}
              offset={(page - 1) * PAGE_SIZE}
            />
            <Pager page={page} totalPages={totalPages} onChange={goTo} />
          </>
        }
      />
    </>
  );
}
