import { label } from "../lib/defects.js";
import DefectTable from "./DefectTable.jsx";

export default function CleanReport({ report }) {
  const rep = report;
  return (
    <div>
      <div className="report">
        <div className="report-line">
          <span className="report-label">Рядків</span>
          <span className="report-value">
            {rep.rows_in} → <b>{rep.rows_out}</b> (дублікатів: {rep.rows_dropped.duplicate},
            неповних: {rep.rows_dropped.incomplete})
          </span>
        </div>
        <div className="report-line">
          <span className="report-label">Дефектів усього</span>
          <span className="report-value">{rep.defects_total}</span>
        </div>
        {Object.keys(rep.by_type).length > 0 && (
          <div className="report-line">
            <span className="report-label">За типом</span>
            <span className="report-value">
              {Object.entries(rep.by_type).map(([t, n]) => (
                <span key={t} className="badge" style={{ marginRight: 6 }}>
                  {label(t)}: {n}
                </span>
              ))}
            </span>
          </div>
        )}
        {rep.flagged_rows.length > 0 && (
          <div className="report-line warn">
            <span className="report-label">Неповні рядки (марковані)</span>
            <span className="report-value">{rep.flagged_rows.map((r) => r + 1).join(", ")}</span>
          </div>
        )}
        {rep.duplicate_rows.length > 0 && (
          <div className="report-line warn">
            <span className="report-label">Дублікати (марковані, не видалені)</span>
            <span className="report-value">{rep.duplicate_rows.map((r) => r + 1).join(", ")}</span>
          </div>
        )}
        {Object.keys(rep.anomaly_bounds).length > 0 && (
          <div className="report-line">
            <span className="report-label">Межі аномалій (IQR)</span>
            <span className="report-value">
              {Object.entries(rep.anomaly_bounds).map(([f, [lo, hi]]) => (
                <div key={f}>
                  {f}: [{lo.toFixed(2)}; {hi.toFixed(2)}]
                </div>
              ))}
            </span>
          </div>
        )}
      </div>

      <DefectTable
        defects={rep.defects}
        truncated={rep.defects_truncated}
        details={(d) => (
          <>
            {d.type === "duplicate" && `копія рядка ${d.duplicate_of + 1}`}
            {d.type === "type_mismatch" &&
              `очікується ${d.expected}, значення ${JSON.stringify(d.value)}`}
            {d.type === "anomaly" &&
              `${JSON.stringify(d.value)} поза [${d.bounds[0].toFixed(2)}; ${d.bounds[1].toFixed(2)}]`}
          </>
        )}
      />
    </div>
  );
}
