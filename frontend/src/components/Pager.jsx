import { useEffect, useState } from "react";

// Пагінація: кнопки «перша / попередня / наступна / остання» + прямий ввід номера сторінки
// (Enter або клік поза полем — перейти; значення обмежується діапазоном 1…totalPages).
export default function Pager({ page, totalPages, onChange }) {
  const [draft, setDraft] = useState(String(page));
  useEffect(() => setDraft(String(page)), [page]);

  function commit() {
    const n = Math.round(Number(draft));
    if (draft.trim() === "" || !Number.isFinite(n)) {
      setDraft(String(page));
      return;
    }
    const target = Math.min(totalPages, Math.max(1, n));
    setDraft(String(target));
    if (target !== page) onChange(target);
  }

  return (
    <div className="pager">
      <button disabled={page <= 1} onClick={() => onChange(1)} title="Перша сторінка">
        «
      </button>
      <button disabled={page <= 1} onClick={() => onChange(page - 1)} title="Попередня">
        ←
      </button>
      <span className="pager-jump">
        <input
          type="number"
          min={1}
          max={totalPages}
          value={draft}
          aria-label="Номер сторінки"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        <span>/ {totalPages}</span>
      </span>
      <button disabled={page >= totalPages} onClick={() => onChange(page + 1)} title="Наступна">
        →
      </button>
      <button
        disabled={page >= totalPages}
        onClick={() => onChange(totalPages)}
        title="Остання сторінка"
      >
        »
      </button>
    </div>
  );
}
