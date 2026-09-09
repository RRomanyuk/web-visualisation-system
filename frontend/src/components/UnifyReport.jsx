function Line({ label, children, tone }) {
  return (
    <div className={`report-line ${tone || ""}`}>
      <span className="report-label">{label}</span>
      <span className="report-value">{children}</span>
    </div>
  );
}

export default function UnifyReport({ report }) {
  const {
    schema_field_count,
    source_field_count,
    renamed,
    collisions,
    missing_fields,
    extra_fields,
    nested_values,
    type_mismatches,
  } = report;

  const nestedEntries = Object.entries(nested_values || {});
  const mismatchEntries = Object.entries(type_mismatches || {});
  const clean =
    !renamed.length &&
    !collisions.length &&
    !missing_fields.length &&
    !extra_fields.length &&
    !nestedEntries.length &&
    !mismatchEntries.length;

  return (
    <div className="report">
      <Line label="Полів у схемі">{schema_field_count}</Line>
      <Line label="Полів у джерелі">{source_field_count}</Line>

      {clean && <Line label="Структура" tone="ok">відповідає схемі — розбіжностей немає</Line>}

      {renamed.length > 0 && (
        <Line label="Перейменовано">
          {renamed.map((r) => `${r.from} → ${r.to}`).join(", ")}
        </Line>
      )}

      {collisions.length > 0 && (
        <Line label="Колізії маппінгу" tone="warn">
          {collisions.map((c) => `${c.sources.join(" + ")} → ${c.canonical}`).join("; ")}
        </Line>
      )}

      {missing_fields.length > 0 && (
        <Line label="Відсутні поля" tone="warn">{missing_fields.join(", ")}</Line>
      )}

      {extra_fields.length > 0 && (
        <Line label="Зайві поля" tone="warn">{extra_fields.join(", ")}</Line>
      )}

      {nestedEntries.length > 0 && (
        <Line label="Вкладені значення" tone="warn">
          {nestedEntries.map(([f, n]) => `${f}: ${n}`).join(", ")}
        </Line>
      )}

      {mismatchEntries.length > 0 && (
        <div className="report-line warn">
          <span className="report-label">Невідповідність типу</span>
          <span className="report-value">
            {mismatchEntries.map(([f, m]) => (
              <div key={f}>
                <b>{f}</b> — очікується {m.expected}, не відповідає {m.mismatched};
                напр.: {m.examples.map((e) => JSON.stringify(e)).join(", ")}
              </div>
            ))}
          </span>
        </div>
      )}
    </div>
  );
}
