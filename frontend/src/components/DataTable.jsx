export default function DataTable({ columns, rows }) {
  const cell = (v) => {
    if (v === null || v === undefined) return <span className="muted">null</span>;
    if (v === "") return <span className="muted">∅</span>;
    if (typeof v === "object") return <code>{JSON.stringify(v)}</code>;
    return String(v);
  };

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th className="idx">#</th>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="idx">{i + 1}</td>
              {columns.map((c) => (
                <td key={c}>{cell(r[c])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
