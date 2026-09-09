// Підготовка рядів для Plotly: агрегація за категорією (bar/pie) або сортування (line).

export function toNum(v) {
  if (typeof v === "number") return v;
  if (v == null) return null;
  const n = parseFloat(String(v).replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : null;
}

const AGG_LABEL = { count: "кількість", sum: "сума", avg: "середнє" };

export function applyFilter(rows, f) {
  if (!f || !f.field || f.value === "") return rows;
  const val = f.value;
  return rows.filter((r) => {
    const cell = r[f.field];
    const s = cell == null ? "" : String(cell);
    switch (f.op) {
      case "eq":
        return s === val;
      case "ne":
        return s !== val;
      case "contains":
        return s.toLowerCase().includes(val.toLowerCase());
      case "gt": {
        const a = toNum(cell);
        const b = toNum(val);
        return a != null && b != null && a > b;
      }
      case "lt": {
        const a = toNum(cell);
        const b = toNum(val);
        return a != null && b != null && a < b;
      }
      default:
        return true;
    }
  });
}

export function buildTraces(rows, opt, name) {
  const { type, x, y, agg } = opt;

  if (type === "line") {
    const pts = rows
      .map((r) => ({ x: r[x], y: toNum(r[y]) }))
      .filter((p) => p.x != null && p.x !== "" && p.y != null)
      .sort((a, b) => (a.x > b.x ? 1 : a.x < b.x ? -1 : 0));
    return [
      {
        type: "scatter",
        mode: "lines+markers",
        name: name || y,
        x: pts.map((p) => p.x),
        y: pts.map((p) => p.y),
      },
    ];
  }

  // bar / pie — групування за x
  const groups = new Map();
  for (const r of rows) {
    const raw = r[x];
    const key = raw == null || raw === "" ? "(порожньо)" : String(raw);
    const g = groups.get(key) || { n: 0, sum: 0 };
    g.n += 1;
    if (agg !== "count") {
      const v = toNum(r[y]);
      if (v != null) g.sum += v;
    }
    groups.set(key, g);
  }
  const entries = [...groups.entries()].sort((a, b) => b[1].n - a[1].n);
  const labels = entries.map((e) => e[0]);
  const values = entries.map(([, g]) => {
    if (agg === "count") return g.n;
    if (agg === "avg") return g.n ? +(g.sum / g.n).toFixed(4) : 0;
    return +g.sum.toFixed(4);
  });

  if (type === "pie") {
    return [{ type: "pie", labels, values, name: name || "", hole: 0.35 }];
  }
  return [
    {
      type: "bar",
      x: labels,
      y: values,
      name: name || (agg === "count" ? AGG_LABEL.count : `${AGG_LABEL[agg]}(${y})`),
    },
  ];
}

export function axisTitle(opt) {
  if (opt.type === "line") return { x: opt.x, y: opt.y };
  if (opt.agg === "count") return { x: opt.x, y: "кількість записів" };
  return { x: opt.x, y: `${AGG_LABEL[opt.agg]}(${opt.y})` };
}
