import MetricsView from "./MetricsView.jsx";
import UnifyReport from "./UnifyReport.jsx";
import CleanReport from "./CleanReport.jsx";
import NormalizeReport from "./NormalizeReport.jsx";

// Спільний вивід результату обробки — для прев'ю та для збереженого результату задачі.
// `dataView` — готова таблиця оброблених даних (з пагінацією; її будує викликач).
export default function ReportsBlock({
  metrics,
  unifyReport,
  cleanReport,
  normalizeReport,
  dataTitle,
  dataView,
}) {
  return (
    <div className="unify-result">
      <h3 className="section">Метрики якості (до / після)</h3>
      <MetricsView metrics={metrics} />

      <h3 className="section">Уніфікація</h3>
      <UnifyReport report={unifyReport} />

      <h3 className="section">Очищення</h3>
      <CleanReport report={cleanReport} />

      <h3 className="section">Нормалізація</h3>
      <NormalizeReport report={normalizeReport} />

      <h3 className="section">{dataTitle}</h3>
      {dataView}
    </div>
  );
}
