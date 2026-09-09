import { label } from "../lib/defects.js";

const pct = (x) => `${(x * 100).toFixed(1)}%`;

function byType(map) {
  const entries = Object.entries(map || {});
  if (!entries.length) return null;
  return (
    <span className="muted">
      {" "}
      ({entries.map(([t, n]) => `${label(t)}: ${n}`).join(", ")})
    </span>
  );
}

export default function MetricsView({ metrics }) {
  const m = metrics;
  const t = m.timings;
  // тон клітинки «після»: краще -> зелений, гірше -> жовтий
  const tone = (before, after, higherIsBetter) => {
    if (after === before) return "";
    const improved = higherIsBetter ? after > before : after < before;
    return improved ? "ok" : "warn";
  };

  return (
    <div>
      <div className="table-scroll">
        <table className="metrics-table">
          <thead>
            <tr>
              <th>Метрика</th>
              <th>До</th>
              <th>Після</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Виявлено дефектів</td>
              <td>
                {m.defects.before}
                {byType(m.defects.before_by_type)}
              </td>
              <td className={tone(m.defects.before, m.defects.after, false)}>
                {m.defects.after}
                {byType(m.defects.after_by_type)}
              </td>
            </tr>
            <tr>
              <td>
                Повнота ключових полів
                {m.key_fields.length ? (
                  <span className="muted"> ({m.key_fields.join(", ")})</span>
                ) : null}
              </td>
              <td>{pct(m.completeness.before)}</td>
              <td className={tone(m.completeness.before, m.completeness.after, true)}>
                {pct(m.completeness.after)}
              </td>
            </tr>
            <tr>
              <td>Збережено записів</td>
              <td className="muted">100%</td>
              <td>{pct(m.retention)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="muted" style={{ marginTop: 8 }}>
        Час: уніфікація {t.unification}с · очищення {t.cleaning}с · нормалізація{" "}
        {t.normalization}с · разом <b>{t.total}с</b>
      </p>
    </div>
  );
}
