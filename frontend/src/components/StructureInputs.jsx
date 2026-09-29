import { useEffect, useState } from "react";
import { api } from "../api.js";
import SchemaTable from "./SchemaTable.jsx";

const splitList = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// Текстове поле для списку через кому. Тримає власний чернетковий текст, щоб
// кома в кінці не зникала під час набору; узгоджується зі станом, якщо той змінили ззовні.
function ListInput({ list, setList, placeholder }) {
  const [draft, setDraft] = useState(list.join(", "));
  useEffect(() => {
    setDraft((d) => (sameList(splitList(d), list) ? d : list.join(", ")));
  }, [list]);

  return (
    <input
      type="text"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => {
        setDraft(e.target.value);
        setList(splitList(e.target.value));
      }}
    />
  );
}

// Спільна структура рецепту — «маппінг + цільова схема + ключові поля» — для панелі обробки.
// Два вигляди одних і тих самих даних: таблиця полів (за замовчуванням) і сирий JSON.
export default function StructureInputs({
  datasetId,
  mappingText,
  setMappingText,
  schemaText,
  setSchemaText,
  keyFields,
  setKeyFields,
}) {
  const [mode, setMode] = useState("table");
  const [error, setError] = useState("");

  async function loadInferred() {
    setError("");
    try {
      const schema = await api.datasets.schema(datasetId);
      setSchemaText(JSON.stringify(schema, null, 2));
    } catch (e) {
      setError(e.message);
    }
  }

  function reset() {
    setMappingText("");
    setSchemaText("");
    setKeyFields([]);
  }

  return (
    <>
      <div className="structure-bar">
        <button
          type="button"
          className={`chip ${mode === "table" ? "active" : ""}`}
          onClick={() => setMode("table")}
        >
          Таблиця
        </button>
        <button
          type="button"
          className={`chip ${mode === "json" ? "active" : ""}`}
          onClick={() => setMode("json")}
        >
          JSON
        </button>
        <button
          className="link-btn"
          type="button"
          onClick={reset}
          title="Очистити маппінг, схему й ключові поля — схему виведе система з даних"
        >
          скинути до виведеної з даних
        </button>
      </div>

      {mode === "table" ? (
        <SchemaTable
          datasetId={datasetId}
          mappingText={mappingText}
          setMappingText={setMappingText}
          schemaText={schemaText}
          setSchemaText={setSchemaText}
          keyFields={keyFields}
          setKeyFields={setKeyFields}
        />
      ) : (
        <>
          <label>
            Маппінг полів (JSON, необов'язково)
            <textarea
              rows={3}
              value={mappingText}
              onChange={(e) => setMappingText(e.target.value)}
              placeholder='{ "State": "state", "seen_on": "date" }'
            />
          </label>

          <label style={{ marginTop: 10 }}>
            Цільова схема (JSON Schema, необов'язково)
            <textarea
              rows={7}
              value={schemaText}
              onChange={(e) => setSchemaText(e.target.value)}
              placeholder='{ "type": "object", "properties": { ... } }'
            />
          </label>
          <button className="link-btn" type="button" onClick={loadInferred}>
            підставити схему, виведену з даних
          </button>
          {error && <p className="error-text">{error}</p>}

          <label style={{ marginTop: 10 }}>
            Ключові поля для метрики повноти (через кому; порожньо — «required» зі схеми)
            <ListInput list={keyFields} setList={setKeyFields} placeholder="city, amount" />
          </label>
        </>
      )}
    </>
  );
}
