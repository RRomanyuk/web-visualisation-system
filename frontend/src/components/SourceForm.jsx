import { useState } from "react";
import { api } from "../api.js";

const EMPTY = {
  source_url: "",
  format: "",
  records_path: "",
  delimiter: ",",
  encoding: "utf-8",
};

export default function SourceForm({ onCreated }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = { source_url: form.source_url.trim() };
      if (form.format) payload.format = form.format;
      if (form.records_path.trim()) payload.records_path = form.records_path.trim();
      if (form.format === "csv") {
        payload.csv_options = { delimiter: form.delimiter, encoding: form.encoding };
      }
      const ds = await api.datasets.create(payload);
      setForm(EMPTY);
      onCreated(ds);
    } catch (err) {
      setError(`${err.code || "error"}: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Джерело даних</h2>
      <label>
        URL відкритого API
        <input
          type="url"
          required
          placeholder="https://example.org/api/records"
          value={form.source_url}
          onChange={set("source_url")}
        />
      </label>

      <div className="row">
        <label>
          Формат
          <select value={form.format} onChange={set("format")}>
            <option value="">авто</option>
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
          </select>
        </label>
        <label>
          records_path (для JSON-обгортки)
          <input
            type="text"
            placeholder="result.records"
            value={form.records_path}
            onChange={set("records_path")}
          />
        </label>
      </div>

      {form.format === "csv" && (
        <div className="row">
          <label>
            Роздільник
            <input type="text" value={form.delimiter} onChange={set("delimiter")} />
          </label>
          <label>
            Кодування
            <input type="text" value={form.encoding} onChange={set("encoding")} />
          </label>
        </div>
      )}

      <button type="submit" disabled={busy || !form.source_url.trim()}>
        {busy ? "Завантаження…" : "Отримати дані"}
      </button>
      {error && <p className="error-text">{error}</p>}
    </form>
  );
}
