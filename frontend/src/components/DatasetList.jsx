export default function DatasetList({ items, selectedId, onSelect, onDelete }) {
  if (!items.length) {
    return (
      <div className="card">
        <h2>Набори даних</h2>
        <p className="muted">Ще немає жодного набору.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Набори даних ({items.length})</h2>
      <ul className="dataset-list">
        {items.map((d) => (
          <li
            key={d.id}
            className={d.id === selectedId ? "active" : ""}
            onClick={() => onSelect(d.id)}
          >
            <div className="dataset-line">
              <code>{d.id}</code>
              <span className="badge">{d.format}</span>
              <span className="muted">{d.row_count} рядків</span>
            </div>
            <div className="dataset-url muted">{d.source_url}</div>
            <button
              className="link-btn"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(d.id);
              }}
            >
              видалити
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
