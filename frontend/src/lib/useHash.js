import { useEffect, useState } from "react";

// Мінімальна hash-навігація без бібліотеки: "#/", "#/viz".
export function useHash() {
  const [hash, setHash] = useState(() => window.location.hash || "#/");
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash.replace(/^#/, "") || "/";
}

export function navigate(path) {
  window.location.hash = path;
}
