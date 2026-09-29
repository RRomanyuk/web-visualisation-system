// Підготовка даних для Plotly: профіль колонок, автоматичний підбір групування осі X
// (категорії / інтервали / періоди дат) та агрегація значень.

// Ті самі маркери «немає даних», що й на бекенді (services/schema.py::NA_TOKENS).
const NA_MARKERS = new Set([
  "nan", "+nan", "-nan", "na", "n/a", "#n/a", "#na", "<na>", "null", "none", "nil",
]);
const NUM_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})([T ]\d{2}:\d{2}.*)?$/;
const BLANK = "(порожньо)";
const OTHERS = "Інші";
const AGG_LABEL = { count: "кількість", sum: "сума", avg: "середнє" };

/** Строге читання числа: «1 234,5» → 1234.5; «12abc», «2025-11-24», «nan» → null. */
export function toNum(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\s/g, "").replace(",", ".");
  return NUM_RE.test(t) ? Number(t) : null;
}

const isDateStr = (v) => typeof v === "string" && DATE_RE.test(v.trim());

function isBlank(v) {
  if (v == null) return true;
  if (typeof v === "number") return Number.isNaN(v);
  if (typeof v !== "string") return false;
  const t = v.trim();
  return t === "" || NA_MARKERS.has(t.toLowerCase());
}

// ── фільтр ────────────────────────────────────────────────────────────────

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

// ── профіль колонок ───────────────────────────────────────────────────────

const SAMPLE = 5000; // скільки непорожніх значень достатньо, щоб визначити вид колонки
const DISTINCT_CAP = 5000;

/** {колонка: {kind: "number"|"date"|"text", filled, distinct}} — за значеннями, а не за схемою. */
export function profileColumns(rows, columns) {
  const out = {};
  for (const c of columns) {
    let filled = 0;
    let num = 0;
    let date = 0;
    const seen = new Set();
    for (const r of rows) {
      const v = r[c];
      if (isBlank(v)) continue;
      if (seen.size < DISTINCT_CAP) seen.add(typeof v === "string" ? v : String(v));
      filled += 1;
      if (toNum(v) != null) num += 1;
      else if (isDateStr(v)) date += 1;
      if (filled >= SAMPLE) break;
    }
    const kind =
      filled && num / filled >= 0.9 ? "number" : filled && date / filled >= 0.9 ? "date" : "text";
    out[c] = { kind, filled, distinct: seen.size };
  }
  return out;
}

/** Розумні поля за замовчуванням: X — категорія з малою кількістю значень, Y — перша числова. */
export function pickDefaults(columns, profiles) {
  const kind = (c) => profiles[c]?.kind;
  const few = (c) => profiles[c].distinct >= 2 && profiles[c].distinct <= 30;
  const x =
    columns.find((c) => kind(c) === "text" && few(c)) ||
    columns.find((c) => kind(c) === "date") ||
    columns.find((c) => kind(c) === "number" && few(c)) ||
    columns[0] ||
    "";
  const y =
    columns.find((c) => kind(c) === "number" && c !== x && profiles[c].distinct > 1) ||
    columns.find((c) => kind(c) === "number") ||
    "";
  return { x, y };
}

// ── план осі X ────────────────────────────────────────────────────────────

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function quantile(sorted, p) {
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// «Гарний» крок 1 / 2 / 2.5 / 5 × 10ⁿ, найближчий до бажаного.
function niceStep(raw) {
  const e = Math.floor(Math.log10(raw));
  const f = raw / 10 ** e;
  const base = [1, 2, 2.5, 5, 10].reduce((a, b) =>
    Math.abs(Math.log(b / f)) < Math.abs(Math.log(a / f)) ? b : a
  );
  return { step: +(base * 10 ** e).toPrecision(12), dec: Math.max(0, -e + (base === 2.5 ? 1 : 0)) };
}

/** Межі інтервалів: діапазон — від найменшого до найбільшого значення в межах «зовнішніх
 *  огорож» Тьюкі (Q1−3·IQR … Q3+3·IQR). Поодинокі викиди не розтягують шкалу — вони
 *  потрапляють у крайні відкриті інтервали («< a», «≥ b»). */
function binEdges(nums, maxBins) {
  const sorted = [...nums].sort((a, b) => a - b);
  const n = sorted.length;
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  let lo = sorted[0];
  let hi = sorted[n - 1];
  if (iqr > 0) {
    const fenceLo = q1 - 3 * iqr;
    const fenceHi = q3 + 3 * iqr;
    lo = sorted.find((v) => v >= fenceLo);
    for (let i = n - 1; i >= 0; i -= 1) {
      if (sorted[i] <= fenceHi) {
        hi = sorted[i];
        break;
      }
    }
  }
  const k = clamp(Math.ceil(Math.log2(n)) + 1, 6, maxBins);
  const { step, dec } = niceStep((hi - lo) / k || 1);
  const start = Math.floor(lo / step) * step;
  const end = (Math.floor(hi / step) + 1) * step; // строго більше за hi
  const edges = [];
  for (let i = 0; start + i * step <= end + step / 2; i += 1) {
    edges.push(+(start + i * step).toFixed(dec));
  }
  return { edges, dec };
}

/**
 * Як групувати вісь X. `valueLists` — масиви значень X (у порівнянні до/після — обидві сторони,
 * щоб інтервали й періоди збігалися). Повертає {mode, ...}:
 *  category — текст: найчастіші N + «Інші»; number-cat — кілька різних чисел; number — лінія
 *  по числах; bins — інтервали; date — періоди (день / місяць / рік).
 */
export function planAxis(valueLists, kind, chartType) {
  const line = chartType === "line";
  if (kind === "number") {
    const nums = [];
    for (const list of valueLists) for (const v of list) {
      const n = toNum(v);
      if (n != null) nums.push(n);
    }
    const distinct = new Set(nums).size;
    if (distinct <= (line ? 200 : 25)) return { mode: line ? "number" : "number-cat" };
    return { mode: "bins", ...binEdges(nums, line ? 40 : 20) };
  }
  if (kind === "date") {
    const days = new Set();
    const months = new Set();
    for (const list of valueLists) for (const v of list) {
      if (!isDateStr(v)) continue;
      const s = v.trim();
      days.add(s.slice(0, 10));
      months.add(s.slice(0, 7));
    }
    const dayLimit = line ? 500 : 31;
    const monthLimit = line ? 500 : 36;
    const unit = days.size <= dayLimit ? "day" : months.size <= monthLimit ? "month" : "year";
    return { mode: "date", unit };
  }
  return { mode: "category", top: chartType === "pie" ? 8 : 20 };
}

// ── групування ────────────────────────────────────────────────────────────

const fmt = (x, dec) => String(+x.toFixed(dec));

function binIndex(edges, n) {
  if (n < edges[0]) return -1;
  if (n >= edges[edges.length - 1]) return edges.length - 1;
  let lo = 0;
  let hi = edges.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (edges[mid] <= n) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

// → {key, label} або null (значення пропускається)
function bucket(raw, plan, line) {
  switch (plan.mode) {
    case "number": {
      const n = toNum(raw);
      return n == null ? null : { key: n, label: String(n) };
    }
    case "number-cat": {
      const n = toNum(raw);
      return n == null ? { key: Infinity, label: BLANK } : { key: n, label: String(n) };
    }
    case "bins": {
      const n = toNum(raw);
      if (n == null) return line ? null : { key: Infinity, label: BLANK };
      const { edges, dec } = plan;
      const i = binIndex(edges, n);
      if (i === -1) return { key: -1, label: `< ${fmt(edges[0], dec)}` };
      if (i === edges.length - 1) return { key: i, label: `≥ ${fmt(edges[i], dec)}` };
      return { key: i, label: `${fmt(edges[i], dec)} – ${fmt(edges[i + 1], dec)}` };
    }
    case "date": {
      if (!isDateStr(raw)) return line ? null : { key: "￿", label: BLANK };
      const s = raw.trim();
      const key = s.slice(0, plan.unit === "day" ? 10 : plan.unit === "month" ? 7 : 4);
      return { key, label: key };
    }
    default: {
      const blank = raw == null || String(raw).trim() === "";
      if (blank && line) return null;
      const label = blank ? BLANK : String(raw);
      return { key: label, label };
    }
  }
}

function measure(g, agg) {
  if (agg === "count") return g.n;
  if (agg === "avg") return g.ny ? +(g.sum / g.ny).toFixed(4) : null;
  return +g.sum.toFixed(4);
}

/** Групує рядки за планом і агрегує. Повертає упорядковані `points` [{label,key,value}] та метадані. */
export function aggregate(rows, opt, plan) {
  const { x, y, agg, type } = opt;
  const line = type === "line";
  const groups = new Map();
  let numericY = 0;
  for (const r of rows) {
    const b = bucket(r[x], plan, line);
    if (!b) continue;
    let g = groups.get(b.key);
    if (!g) groups.set(b.key, (g = { key: b.key, label: b.label, n: 0, ny: 0, sum: 0 }));
    g.n += 1;
    if (agg !== "count") {
      const v = toNum(r[y]);
      if (v != null) {
        g.ny += 1;
        g.sum += v;
        numericY += 1;
      }
    }
  }

  if (plan.mode === "bins") {
    const { edges, dec } = plan;
    const regular = [...groups.keys()].filter((k) => k >= 0 && k < edges.length - 1);
    if (regular.length) {
      for (let i = Math.min(...regular); i <= Math.max(...regular); i += 1) {
        if (!groups.has(i)) {
          const label = `${fmt(edges[i], dec)} – ${fmt(edges[i + 1], dec)}`;
          groups.set(i, { key: i, label, n: 0, ny: 0, sum: 0 });
        }
      }
    }
  }

  let list = [...groups.values()];
  let others = 0;
  const total = list.length;

  if (plan.mode === "category" && !line) {
    list.sort((a, b) => b.n - a.n);
    if (list.length > plan.top) {
      const rest = list.slice(plan.top);
      others = rest.length;
      const merged = { key: OTHERS, label: `${OTHERS} (${rest.length})`, n: 0, ny: 0, sum: 0 };
      for (const g of rest) {
        merged.n += g.n;
        merged.ny += g.ny;
        merged.sum += g.sum;
      }
      list = [...list.slice(0, plan.top), merged];
    }
    const tail = others ? [list.pop()] : [];
    list.forEach((g) => (g.value = measure(g, agg)));
    list.sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
    tail.forEach((g) => (g.value = measure(g, agg)));
    list = [...list, ...tail];
  } else {
    list.forEach((g) => (g.value = measure(g, agg)));
    if (plan.mode === "category") list.sort((a, b) => String(a.key).localeCompare(String(b.key)));
    else list.sort((a, b) => (a.key > b.key ? 1 : a.key < b.key ? -1 : 0));
  }
  return { points: list, others, total, numericY };
}

// ── графік ────────────────────────────────────────────────────────────────

export function axisTitle(opt, plan) {
  const suffix = plan?.mode === "bins" ? " (інтервали)" : plan?.mode === "date" && plan.unit !== "day"
    ? ` (за ${plan.unit === "month" ? "місяцями" : "роками"})` : "";
  const xt = `${opt.x}${suffix}`;
  if (opt.agg === "count") return { x: xt, y: "кількість записів" };
  return { x: xt, y: `${AGG_LABEL[opt.agg]}(${opt.y})` };
}

/**
 * Готовий графік: {traces, layout, notes, empty, extent}. `empty` — причина, чому малювати
 * нічого (замість порожнього полотна), `notes` — що автоматично зроблено з масштабом.
 */
export function buildChart(rows, opt, plan, name) {
  const { type, x, y, agg } = opt;
  const titles = axisTitle(opt, plan);
  const notes = [];
  const res = aggregate(rows, opt, plan);
  const hasData = res.points.some((p) => p.value != null);
  // у стовпчиковій порожній інтервал лишається на осі; для лінії й кола порожні точки не потрібні
  const pts = type === "bar" ? res.points : res.points.filter((p) => p.value != null);

  let empty = null;
  if (!rows.length) empty = "Немає рядків для побудови — перевірте фільтр.";
  else if (agg !== "count" && res.numericY === 0)
    empty = `У полі «${y}» немає числових значень — оберіть числове поле для осі Y.`;
  else if (!hasData) empty = "Немає даних для побудови: значення осі X порожні або нерозпізнані.";

  if (plan.mode === "bins")
    notes.push(`Числове поле «${x}» згруповано в інтервали (${plan.edges.length - 1}); крайні — для викидів.`);
  if (plan.mode === "date" && plan.unit !== "day")
    notes.push(`Дати згруповано за ${plan.unit === "month" ? "місяцями" : "роками"}.`);
  if (res.others)
    notes.push(`Показано ${pts.length - 1} найчастіших категорій із ${res.total}; решта — «${OTHERS}».`);

  const values = pts.map((p) => p.value);
  const finite = values.filter(Number.isFinite);
  const extent = finite.length ? { min: Math.min(...finite), max: Math.max(...finite) } : null;

  if (type === "pie") {
    const pos = pts.filter((p) => p.value > 0);
    if (pos.length < pts.length) notes.push("Кругова діаграма не показує від'ємні й нульові значення.");
    return {
      traces: [{ type: "pie", labels: pos.map((p) => p.label), values: pos.map((p) => p.value),
        name: name || "", hole: 0.35, sort: false, textposition: "inside" }],
      layout: { showlegend: true },
      notes, empty, extent,
    };
  }

  const labels = pts.map((p) => p.label);
  if (type === "line") {
    const axisType = plan.mode === "date" ? "date" : plan.mode === "number" ? "linear" : "category";
    const xs = plan.mode === "date" || plan.mode === "number" ? pts.map((p) => p.key) : labels;
    return {
      traces: [{
        type: "scatter",
        mode: pts.length <= 80 ? "lines+markers" : "lines",
        name: name || y,
        x: xs, y: values, connectgaps: false,
      }],
      layout: {
        xaxis: { type: axisType, title: { text: titles.x }, automargin: true },
        yaxis: { title: { text: titles.y }, automargin: true },
      },
      notes, empty, extent,
    };
  }

  return {
    traces: [{
      type: "bar",
      x: labels, y: values,
      name: name || (agg === "count" ? AGG_LABEL.count : `${AGG_LABEL[agg]}(${y})`),
    }],
    layout: {
      xaxis: { type: "category", categoryorder: "array", categoryarray: labels,
        title: { text: titles.x }, automargin: true },
      yaxis: { title: { text: titles.y }, rangemode: "tozero", automargin: true },
    },
    notes, empty, extent,
  };
}

/** Спільна шкала Y для двох графіків (до / після), щоб їх можна було чесно порівняти. */
export function syncYRange(a, b, type) {
  if (!a?.extent || !b?.extent || a.empty || b.empty || type === "pie") return [a, b];
  let lo = Math.min(a.extent.min, b.extent.min);
  let hi = Math.max(a.extent.max, b.extent.max);
  if (type === "bar") {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
  }
  const pad = (hi - lo) * 0.05 || 1;
  const range = [type === "bar" && lo === 0 ? 0 : lo - pad, hi + pad];
  const put = (c) => ({ ...c, layout: { ...c.layout, yaxis: { ...c.layout.yaxis, range } } });
  return [put(a), put(b)];
}

// Порівняння до/після: поля обрано за іменами ОБРОБЛЕНИХ даних, а в сирих вони могли
// називатися інакше (маппінг полів). `sources` = {ім'я в результаті: ім'я в сирих | null}.
// Повертає налаштування графіка й фільтр для сирої сторони + `missing` — використані
// поля, яких у сирих даних немає (їх додала схема), тож порівнювати нема з чим.
export function toRawView(opt, filter, sources) {
  const has = (f) => sources != null && f in sources;
  const name = (f) => (has(f) ? sources[f] : f);
  const used = [opt.x];
  if (opt.agg !== "count") used.push(opt.y);
  if (filter?.field) used.push(filter.field);
  return {
    missing: [...new Set(used.filter((f) => has(f) && sources[f] == null))],
    opt: { ...opt, x: name(opt.x), y: name(opt.y) },
    filter: filter?.field ? { ...filter, field: name(filter.field) } : filter,
  };
}
