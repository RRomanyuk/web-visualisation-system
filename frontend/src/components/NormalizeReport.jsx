import { label } from "../lib/defects.js";
import DefectTable from "./DefectTable.jsx";

export default function NormalizeReport({ report }) {
  const rep = report;
  const converted = Object.entries(rep.converted || {});
  return (
    <div>
      <div className="report">
        <div className="report-line">
          <span className="report-label">Перетворено значень</span>
          <span className="report-value">
            {converted.length
              ? converted.map(([f, n]) => (
                  <span key={f} className="badge" style={{ marginRight: 6 }}>
                    {f}: {n}
                  </span>
                ))
              : "—"}
          </span>
        </div>
        <div className="report-line">
          <span className="report-label">Не вдалося перетворити</span>
          <span className="report-value">
            {rep.defects_total === 0
              ? "0"
              : Object.entries(rep.by_type).map(([t, n]) => (
                  <span key={t} className="badge" style={{ marginRight: 6 }}>
                    {label(t)}: {n}
                  </span>
                ))}
          </span>
        </div>
      </div>

      <DefectTable
        defects={rep.defects}
        truncated={rep.defects_truncated}
        details={(d) => `значення ${JSON.stringify(d.value)}`}
      />
    </div>
  );
}
