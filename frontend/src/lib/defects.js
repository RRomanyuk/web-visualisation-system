export const DEFECT_LABELS = {
  missing: "пропуск",
  duplicate: "дублікат",
  type_mismatch: "невірний тип",
  anomaly: "аномалія",
  date_unrecognized: "дата не розпізнана",
  number_unrecognized: "число не розпізнане",
  unmapped_category: "категорія без відповідності",
};

export const label = (t) => DEFECT_LABELS[t] || t;
