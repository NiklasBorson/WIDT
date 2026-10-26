export const PARAMETER_FIELDS = Object.freeze([
  { key: "width", id: "stair-width", label: "Stair width", default: 20, min: 20, max: 36, step: 0.25 },
  { key: "steps", id: "stair-count", label: "Steps", default: 9, min: 7, max: 9, step: 1 },
  { key: "modules", id: "module-count", label: "Modules", default: 3, min: 2, max: 3, step: 1 },
  { key: "shoulderAscent", id: "spindle-shoulder-ascent", label: "Railing bottom ascent", default: 32,
    min: 25, max: 37, step: 1 },
]);

export function readParameters(search) {
  const query = new URLSearchParams(search), values = {}, warnings = [];
  for (const field of PARAMETER_FIELDS) {
    const entries = query.getAll(field.key), value = entries.length ? Number(entries[0]) : field.default;
    const valid = entries.length <= 1 && (!entries.length || entries[0].trim() !== "") &&
      Number.isFinite(value) && value >= field.min && value <= field.max &&
      Math.abs((value - field.min) / field.step - Math.round((value - field.min) / field.step)) < 1e-8;
    values[field.key] = valid ? value : field.default;
    if (!valid) warnings.push(`${field.label} was invalid; using ${field.default}.`);
  }
  return { values, warnings };
}

export function parameterURL(href, values) {
  const url = new URL(href);
  for (const { key } of PARAMETER_FIELDS) url.searchParams.set(key, String(values[key]));
  return url;
}
