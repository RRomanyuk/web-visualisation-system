import { useEffect, useState } from "react";
import DataTable from "./DataTable.jsx";
import Pager from "./Pager.jsx";

export const PAGE_SIZE = 25;

// Таблиця з пагінацією на клієнті: по 25 рядків на сторінці над масивом, що вже є в пам'яті
// (прев'ю обробки). Для великих збережених результатів пагінація серверна — див. JobResult.
export default function PagedTable({ columns, rows, pageSize = PAGE_SIZE }) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [rows]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, totalPages);
  const start = (current - 1) * pageSize;

  return (
    <>
      <DataTable columns={columns} rows={rows.slice(start, start + pageSize)} offset={start} />
      {totalPages > 1 && <Pager page={current} totalPages={totalPages} onChange={setPage} />}
    </>
  );
}
