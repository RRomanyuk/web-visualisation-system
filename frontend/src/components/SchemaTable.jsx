import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import {
  buildRows,
  duplicateNames,
  effectiveKeys,
  formatMapping,
  formatSchema,
  readStructure,
  setEnabled,
  setKey,
  setName,
  setRequired,
  setType,
  typeKey,
  typeOptions,
} from "../lib/structure.js";

// Поле вводу назви: не «стрибає» до старого значення, поки користувач стирає й друкує нове.
function NameInput({ value, disabled, onCommit }) {
  const [text, setText] = useState(value);
  const dirty = useRef(false);
  useEffect(() => setText(value), [value]);

  return (
    <input
      type="text"
      value={text}
      disabled={disabled}
      onChange={(e) => {
        dirty.current = true;
        setText(e.target.value);
        if (e.target.value.trim()) onCommit(e.target.value);
      }}
      onBlur={() => {
        const trimmed = text.trim();
        if (!trimmed) setText(value);
        else if (dirty.current && trimmed !== text) onCommit(trimmed);
        dirty.current = false;
      }}
    />
  );
}

// Візуальний редактор структури: рядок на колонку набору. Читає й пише ті самі
// маппінг / цільову схему / ключові поля, що й вкладка «JSON».
export default function SchemaTable({
  datasetId,
  mappingText,
  setMappingText,
  schemaText,
  setSchemaText,
  keyFields,
  setKeyFields,
}) {
  const [inferred, setInferred] = useState(null);
  const [loadError, setLoadError] = useState("");
  const stash = useRef(new Map()); // налаштування вимкнених полів — щоб повернути при вмиканні

  useEffect(() => {
    let alive = true;
    setInferred(null);
    setLoadError("");
    stash.current = new Map();
    api.datasets
      .schema(datasetId)
      .then((s) => alive && setInferred(s))
      .catch((e) => alive && setLoadError(e.message));
    return () => {
      alive = false;
    };
  }, [datasetId]);

  const st = useMemo(
    () => readStructure(mappingText, schemaText, keyFields),
    [mappingText, schemaText, keyFields]
  );
  const rows = useMemo(
    () => (inferred && !st.error ? buildRows(inferred, st, stash.current) : []),
    [inferred, st]
  );

  if (loadError) return <p className="error-text">{loadError}</p>;
  if (st.error) {
    return (
      <p className="error-text">
        {st.error}. Виправте у вкладці «JSON» — тоді таблиця знову стане доступною.
      </p>
    );
  }
  if (!inferred) return <p className="muted">Завантаження полів…</p>;

  function commit(next) {
    setMappingText(formatMapping(next.mapping));
    setSchemaText(formatSchema(next.schema));
    setKeyFields(next.keys);
  }

  function toggleEnabled(row, on) {
    if (!on) stash.current.set(row.id, { spec: row.spec, required: row.required });
    commit(setEnabled(inferred, st, row, on, stash.current.get(row.id)));
  }

  const clashes = duplicateNames(rows.filter((r) => r.enabled || r.source !== null));
  const keys = effectiveKeys(inferred, st);

  return (
    <>
      <div className="table-scroll schema-scroll">
        <table className="schema-table">
          <thead>
            <tr>
              <th title="Вимкнене поле не входить до схеми: воно не перевіряється на пропуски, типи й аномалії та не враховується при пошуку дублікатів. У результаті лишається як «зайве».">
                Увімкнено
              </th>
              <th>Колонка джерела</th>
              <th>Назва в схемі</th>
              <th>Тип</th>
              <th title="Порожнє значення в обов'язковому полі — дефект «пропуск» (і підстава видалити рядок)">
                Обов'язкове
              </th>
              <th title="Ключові поля використовуються для метрики повноти">Ключове</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={row.enabled ? "" : "off"}>
                <td className="center">
                  <input
                    type="checkbox"
                    aria-label={`Увімкнути поле ${row.name}`}
                    checked={row.enabled}
                    onChange={(e) => toggleEnabled(row, e.target.checked)}
                  />
                </td>
                <td className="src">
                  {row.source ?? <em title="Це поле додає лише схема">немає в джерелі</em>}
                </td>
                <td>
                  {row.source === null ? (
                    row.name
                  ) : (
                    <NameInput
                      value={row.name}
                      onCommit={(v) => commit(setName(inferred, st, row, v))}
                    />
                  )}
                </td>
                <td>
                  <select
                    value={typeKey(row.spec)}
                    disabled={!row.enabled}
                    onChange={(e) => commit(setType(inferred, st, row, e.target.value))}
                  >
                    {typeOptions(row.spec).map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="center">
                  <input
                    type="checkbox"
                    aria-label={`Обов'язкове: ${row.name}`}
                    checked={row.required}
                    disabled={!row.enabled}
                    onChange={(e) => commit(setRequired(inferred, st, row, e.target.checked))}
                  />
                </td>
                <td className="center">
                  <input
                    type="checkbox"
                    aria-label={`Ключове: ${row.name}`}
                    checked={row.key}
                    onChange={(e) => commit(setKey(st, row, e.target.checked))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {clashes.length > 0 && (
        <p className="warn-text">
          Однакова назва в кількох рядках: {clashes.join(", ")} — ці колонки буде злито в одну
          (див. «колізії» у звіті уніфікації).
        </p>
      )}
      <p className="muted small">
        {keys.length
          ? `Повнота рахується за: ${keys.join(", ")} (${st.keys.length ? "ключові" : "обов'язкові зі схеми"}).`
          : "Ключових і обов'язкових полів немає — повнота завжди 100 %."}{" "}
        Вимкнені поля не входять до схеми: вони не перевіряються й не беруть участі в пошуку
        дублікатів.
      </p>
    </>
  );
}
