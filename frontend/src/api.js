const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = body?.error || { code: "unknown", message: res.statusText };
    const e = new Error(err.message || err.code);
    e.code = err.code;
    e.details = err.details;
    throw e;
  }
  return body;
}

export const api = {
  health: () => request("/health"),

  datasets: {
    list: () => request("/datasets"),
    get: (id, page = 1, size = 50) =>
      request(`/datasets/${id}?page=${page}&size=${size}`),
    create: (payload) =>
      request("/datasets", { method: "POST", body: JSON.stringify(payload) }),
    remove: (id) => request(`/datasets/${id}`, { method: "DELETE" }),
    verify: (id) => request(`/datasets/${id}/verify`),
    rows: (id) => request(`/datasets/${id}/rows`),
    schema: (id) => request(`/datasets/${id}/schema`),
    unify: (id, payload) =>
      request(`/datasets/${id}/unify`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    clean: (id, payload) =>
      request(`/datasets/${id}/clean`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    preview: (id, payload) =>
      request(`/datasets/${id}/preview`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  },

  process: (payload) =>
    request("/process", { method: "POST", body: JSON.stringify(payload) }),

  jobs: {
    list: (datasetId) =>
      request(`/jobs${datasetId ? `?dataset_id=${datasetId}` : ""}`),
    get: (id) => request(`/jobs/${id}`),
  },

  results: {
    get: (jobId, page = 1, size = 25) =>
      request(`/result/${jobId}?page=${page}&size=${size}`),
    rows: (jobId) => request(`/result/${jobId}/rows`),
  },

  recipes: {
    list: () => request("/recipes"),
    get: (id, version) =>
      request(`/recipes/${id}${version ? `?version=${version}` : ""}`),
    versions: (id) => request(`/recipes/${id}/versions`),
    create: (name, definition) =>
      request("/recipes", {
        method: "POST",
        body: JSON.stringify({ name, definition }),
      }),
    update: (id, name, definition) =>
      request(`/recipes/${id}`, {
        method: "PUT",
        body: JSON.stringify({ name, definition }),
      }),
    remove: (id) => request(`/recipes/${id}`, { method: "DELETE" }),
  },
};
