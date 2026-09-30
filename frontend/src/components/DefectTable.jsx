import { useEffect, useState } from "react";
import { label } from "../lib/defects.js";
import { PAGE_SIZE } from "./PagedTable.jsx";
import Pager from "./Pager.jsx";

export default function DefectTable({ defects, truncated, details }) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [defects]);

  if (!defects || !defects.length) return null;

  const totalPages = Math.max(1, Math.ceil(defects.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const start = (current - 1) * PAGE_SIZE;

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
            {defects.slice(start, start + PAGE_SIZE).map((d, i) => (
              <tr key={start + i}>
                <td>{d.row + 1}</td>
                <td>{d.field || "—"}</td>
                <td>{label(d.type)}</td>
                <td>{details(d)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && <Pager page={current} totalPages={totalPages} onChange={setPage} />}
    </>
  );
}
