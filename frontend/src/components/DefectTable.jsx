import { label } from "../lib/defects.js";

export default function DefectTable({ defects, truncated, details }) {
  if (!defects || !defects.length) return null;
  return (
    <>
      <h3>Реєстр дефектів{truncated ? ` (перші ${defects.length})` : ""}</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>рядок</th>
              <th>поле</th>
              <th>тип</th>
              <th>деталі</th>
            </tr>
          </thead>
          <tbody>
            {defects.map((d, i) => (
              <tr key={i}>
                <td>{d.row + 1}</td>
                <td>{d.field || "—"}</td>
                <td>{label(d.type)}</td>
                <td>{details(d)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
