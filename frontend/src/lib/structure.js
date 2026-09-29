// Модель таблиці полів: перетворення між трьома структурами рецепту
// (field_mapping, target_schema, key_fields) і рядками візуального редактора.
//
// Істина — самі ці структури (вони ж видно у вкладці «JSON»); таблиця лише читає
// їх і повертає змінені копії. Усе, чого таблиця не вміє (enum, minimum, x-…,
// записи маппінгу для колонок, яких немає в наборі), проходить крізь редагування
// без змін.

export const TYPES = [
  { key: "string", label: "текст" },
  { key: "integer", label: "ціле" },
  { key: "number", label: "дробове" },
  { key: "boolean", label: "логічне" },
  { key: "date", label: "дата" },
  { key: "datetime", label: "дата-час" },
];
const KNOWN = new Set(TYPES.map((t) => t.key));

const has = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const uniq = (list) => [...new Set(list)];

/** Ключ типу для випадного списку за описом поля зі схеми. */
export function typeKey(spec) {
  const t = spec?.type ?? "string";
  if (t === "string") {
    if (spec?.format === "date") return "date";
    if (spec?.format === "date-time") return "datetime";
    return "string";
  }
  if (["integer", "number", "boolean", "object", "array"].includes(t)) return t;
  return "other"; // напр. type: ["string","null"] — бекенд такого не знає, лише показуємо
}

/** Варіанти списку: шість основних + поточний нестандартний (об'єкт, масив…), щоб його не втратити. */
export function typeOptions(spec) {
  const key = typeKey(spec);
  if (KNOWN.has(key)) return TYPES;
  const label =
    key === "object" ? "об'єкт" : key === "array" ? "масив" : `інше: ${JSON.stringify(spec?.type)}`;
  return [...TYPES, { key, label }];
}

/** Копія опису поля з новим типом; format/x-nested скидаються, решта (enum тощо) лишається. */
export function withType(spec, key) {
  // eslint-disable-next-line no-unused-vars
  const { type: _t, format: _f, "x-nested": _x, ...rest } = spec || {};
  if (key === "date") return { type: "string", format: "date", ...rest };
  if (key === "datetime") return { type: "string", format: "date-time", ...rest };
  return { type: key, ...rest };
}

// ── читання текстових полів ────────────────────────────────────────────────

function parseObject(text, what) {
  if (!text.trim()) return { value: null };
  let value;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return { error: `${what}: некоректний JSON (${e.message})` };
  }
  if (!isObject(value)) return { error: `${what} має бути JSON-об'єктом` };
  return { value };
}

/** {mapping, schema|null, keys} із трьох станів форми або {error}. */
export function readStructure(mappingText, schemaText, keyFields) {
  const m = parseObject(mappingText, "Маппінг полів");
  if (m.error) return { error: m.error };
  const s = parseObject(schemaText, "Цільова схема");
  if (s.error) return { error: s.error };
  return { mapping: m.value ?? {}, schema: s.value, keys: keyFields };
}

export const formatMapping = (mapping) =>
  Object.keys(mapping).length ? JSON.stringify(mapping, null, 2) : "";
export const formatSchema = (schema) => (schema ? JSON.stringify(schema, null, 2) : "");

// ── допоміжне ──────────────────────────────────────────────────────────────

/** Канонічна назва за маппінгом (як робить бекенд: mapping.get(raw, raw)). */
export const makeCanon = (mapping) => (name) => (has(mapping, name) ? mapping[name] : name);

const propsOf = (schema) => (isObject(schema.properties) ? schema.properties : {});
const requiredOf = (schema) => (Array.isArray(schema.required) ? schema.required : []);

/** Схема, яку бекенд вивів би сам (`inferred`), але з канонічними назвами полів. */
export function materialize(inferred, canon) {
  return {
    $schema: inferred.$schema ?? "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: Object.fromEntries(
      Object.entries(propsOf(inferred)).map(([k, v]) => [canon(k), v])
    ),
    required: uniq(requiredOf(inferred).map(canon)),
  };
}

const withProps = (schema, props) => ({ ...schema, properties: props });

function withRequired(schema, list) {
  if (!list.length && !has(schema, "required")) return schema;
  return { ...schema, required: list };
}

/** Ключ властивості схеми, що відповідає канонічній назві (ключ може бути й «старою» назвою). */
function propKey(props, name, canon) {
  return Object.keys(props).find((p) => canon(p) === name);
}

// ── рядки таблиці ──────────────────────────────────────────────────────────

/**
 * Рядки таблиці: по одному на колонку набору + рядки для полів, які додає лише
 * схема (у джерелі їх немає) + вимкнені раніше такі поля зі `stash`.
 * `stash` — Map id → {spec, required} для вимкнених полів (щоб повернути налаштування).
 */
export function buildRows(inferred, st, stash = new Map()) {
  const canon = makeCanon(st.mapping);
  const schema = st.schema ?? materialize(inferred, canon);
  const props = propsOf(schema);
  const required = new Set(requiredOf(schema).map(canon));
  const keySet = new Set(st.keys.map(canon));
  const sources = Object.keys(propsOf(inferred));

  const rows = sources.map((source) => {
    const name = canon(source);
    const pk = propKey(props, name, canon);
    const enabled = pk !== undefined;
    const back = stash.get(source);
    return {
      id: source,
      source,
      name,
      enabled,
      spec: enabled ? props[pk] : (back?.spec ?? propsOf(inferred)[source] ?? { type: "string" }),
      required: enabled && required.has(name),
      key: keySet.has(name),
    };
  });

  const known = new Set(rows.map((r) => r.name));
  const extra = new Set();
  for (const p of Object.keys(props)) {
    const name = canon(p);
    if (known.has(name) || extra.has(name)) continue;
    extra.add(name);
    rows.push({
      id: `+${name}`,
      source: null,
      name,
      enabled: true,
      spec: props[p],
      required: required.has(name),
      key: keySet.has(name),
    });
  }
  for (const [id, back] of stash) {
    if (!id.startsWith("+")) continue;
    const name = id.slice(1);
    if (known.has(name) || extra.has(name)) continue;
    rows.push({
      id,
      source: null,
      name,
      enabled: false,
      spec: back.spec,
      required: false,
      key: keySet.has(name),
    });
  }
  return rows;
}

/** За якими полями реально рахуватиметься повнота (явні ключові або «required»). */
export function effectiveKeys(inferred, st) {
  if (st.keys.length) return st.keys.map(makeCanon(st.mapping));
  const canon = makeCanon(st.mapping);
  const schema = st.schema ?? materialize(inferred, canon);
  return uniq(requiredOf(schema).map(canon));
}

/** Назви, під якими збігаються кілька рядків (колізії) — для попередження. */
export function duplicateNames(rows) {
  const count = {};
  for (const r of rows) count[r.name] = (count[r.name] || 0) + 1;
  return Object.keys(count).filter((n) => count[n] > 1);
}

// ── редагування: кожна функція повертає нову структуру {mapping, schema, keys} ─

function ensureSchema(inferred, st) {
  return st.schema ?? materialize(inferred, makeCanon(st.mapping));
}

/** Перейменування поля: пише маппінг і переносить назву в схему, required та ключові. */
export function setName(inferred, st, row, newName) {
  if (row.source === null || newName === row.name) return st;
  const canonOld = makeCanon(st.mapping);
  const old = row.name;

  const mapping = { ...st.mapping };
  if (newName === row.source) delete mapping[row.source];
  else mapping[row.source] = newName;

  // Якщо стару назву ще використовує інша колонка (колізія), стара властивість лишається,
  // а нова створюється як її копія; інакше властивість просто переїжджає.
  const shared = Object.keys(propsOf(inferred)).some(
    (c) => c !== row.source && canonOld(c) === old
  );
  const move = (list) => {
    const out = [];
    for (const e of list) {
      if (canonOld(e) !== old) out.push(e);
      else {
        if (shared) out.push(e);
        out.push(newName);
      }
    }
    return uniq(out);
  };

  let schema = st.schema;
  if (schema) {
    const props = propsOf(schema);
    const next = [];
    for (const [k, v] of Object.entries(props)) {
      if (canonOld(k) !== old) next.push([k, v]);
      else {
        if (shared) next.push([k, v]);
        if (!has(props, newName) && !next.some(([nk]) => nk === newName)) next.push([newName, v]);
      }
    }
    schema = withRequired(withProps(schema, Object.fromEntries(next)), move(requiredOf(schema)));
  }
  return { mapping, schema, keys: move(st.keys) };
}

export function setType(inferred, st, row, key) {
  const schema = ensureSchema(inferred, st);
  const canon = makeCanon(st.mapping);
  const props = propsOf(schema);
  const pk = propKey(props, row.name, canon);
  if (pk === undefined) return st;
  return { ...st, schema: withProps(schema, { ...props, [pk]: withType(props[pk], key) }) };
}

export function setRequired(inferred, st, row, on) {
  const schema = ensureSchema(inferred, st);
  const canon = makeCanon(st.mapping);
  const rest = requiredOf(schema).filter((e) => canon(e) !== row.name);
  return { ...st, schema: withRequired(schema, on ? [...rest, row.name] : rest) };
}

/** Ключові поля: явний список; порожній означає «взяти required зі схеми». */
export function setKey(st, row, on) {
  const canon = makeCanon(st.mapping);
  const rest = st.keys.filter((e) => canon(e) !== row.name);
  return { ...st, keys: on ? [...rest, row.name] : rest };
}

/** Увімкнути/вимкнути поле в схемі. `back` — раніше збережені {spec, required} для відновлення. */
export function setEnabled(inferred, st, row, on, back) {
  const schema = ensureSchema(inferred, st);
  const canon = makeCanon(st.mapping);
  const props = propsOf(schema);
  const rest = requiredOf(schema).filter((e) => canon(e) !== row.name);
  if (!on) {
    const next = Object.fromEntries(
      Object.entries(props).filter(([p]) => canon(p) !== row.name)
    );
    return { ...st, schema: withRequired(withProps(schema, next), rest) };
  }
  if (propKey(props, row.name, canon) !== undefined) return st;
  const spec = back?.spec ?? row.spec ?? { type: "string" };
  return {
    ...st,
    schema: withRequired(
      withProps(schema, { ...props, [row.name]: spec }),
      back?.required ? [...rest, row.name] : rest
    ),
  };
}
