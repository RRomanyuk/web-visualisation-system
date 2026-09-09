import { useState } from "react";
import { api } from "../api.js";

// Спільні поля «маппінг + цільова схема» для панелей уніфікації та очищення.
export default function StructureInputs({
  datasetId,
  mappingText,
  setMappingText,
  schemaText,
  setSchemaText,
}) {
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

  return (
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
    </>
  );
}
