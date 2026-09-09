import { lazy, Suspense, useEffect, useState } from "react";
import { api } from "./api.js";
import { navigate, useHash } from "./lib/useHash.js";
import DataPage from "./pages/DataPage.jsx";

// Plotly важкий — вантажимо сторінку візуалізації лише за потреби.
const VizPage = lazy(() => import("./pages/VizPage.jsx"));

const TABS = [
  { path: "/", label: "Дані та обробка" },
  { path: "/viz", label: "Візуалізація" },
];

export default function App() {
  const route = useHash();
  const [backendOk, setBackendOk] = useState(null);

  useEffect(() => {
    api.health().then(() => setBackendOk(true)).catch(() => setBackendOk(false));
  }, []);

  return (
    <div className="app">
      <header>
        <h1>Система візуалізації даних з відкритих джерел</h1>
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.path}
              className={route === t.path ? "active" : ""}
              onClick={() => navigate(t.path)}
            >
              {t.label}
            </button>
          ))}
          {backendOk === false && (
            <span className="error-text">бекенд недоступний</span>
          )}
        </nav>
      </header>

      {route === "/viz" ? (
        <Suspense fallback={<p className="muted">Завантаження візуалізації…</p>}>
          <VizPage />
        </Suspense>
      ) : (
        <DataPage />
      )}
    </div>
  );
}
