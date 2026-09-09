// Перетворення між станом форми ProcessPanel і визначенням рецепту (RecipeDefinition).

const splitList = (s) =>
  s.split(",").map((x) => x.trim()).filter(Boolean);

export function toDefinition({ mappingText, schemaText, keyFieldsText, clean, norm }) {
  const dedupBy = splitList(clean.dedup_by);
  const keyFields = splitList(keyFieldsText || "");
  return {
    target_schema: schemaText.trim() ? JSON.parse(schemaText) : null,
    field_mapping: mappingText.trim() ? JSON.parse(mappingText) : {},
    key_fields: keyFields.length ? keyFields : null,
    cleaning: {
      missing_values: clean.missing_values,
      dedup: clean.dedup,
      dedup_by: dedupBy.length ? dedupBy : null,
      detect_anomalies: clean.detect_anomalies,
      anomaly_k: Number(clean.anomaly_k) || 1.5,
    },
    normalization: {
      date_input_formats: splitList(norm.date_input_formats),
      decimal_separator: norm.decimal_separator || ".",
      thousands_separator: norm.thousands_separator || null,
      category_mappings: norm.category_mappings.trim()
        ? JSON.parse(norm.category_mappings)
        : {},
      unaccent: norm.unaccent,
    },
  };
}

export function fromDefinition(def) {
  const c = def.cleaning || {};
  const n = def.normalization || {};
  return {
    mappingText: Object.keys(def.field_mapping || {}).length
      ? JSON.stringify(def.field_mapping, null, 2)
      : "",
    schemaText: def.target_schema ? JSON.stringify(def.target_schema, null, 2) : "",
    keyFieldsText: (def.key_fields || []).join(", "),
    clean: {
      missing_values: c.missing_values ?? "mark",
      dedup: c.dedup ?? true,
      dedup_by: (c.dedup_by || []).join(", "),
      detect_anomalies: c.detect_anomalies ?? true,
      anomaly_k: c.anomaly_k ?? 1.5,
    },
    norm: {
      date_input_formats: (n.date_input_formats || []).join(", "),
      decimal_separator: n.decimal_separator ?? ".",
      thousands_separator: n.thousands_separator ?? "",
      unaccent: n.unaccent ?? false,
      category_mappings: Object.keys(n.category_mappings || {}).length
        ? JSON.stringify(n.category_mappings, null, 2)
        : "",
    },
  };
}
