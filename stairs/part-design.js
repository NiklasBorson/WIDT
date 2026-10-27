import { validateProfile, constructionOutline } from "./plywood-outline.js";

const compareText = new Intl.Collator("en", { numeric: true }).compare;

function normalized(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new RangeError("Part specifications require finite numbers.");
    return Math.round(value * 1e8) / 1e8 || 0;
  }
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, normalized(value[key])]));
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  throw new TypeError("Part specifications contain a missing or unsupported value.");
}

const keyOf = value => JSON.stringify(normalized(value));
const unordered = values => values.map(normalized).sort((a, b) => compareText(JSON.stringify(a), JSON.stringify(b)));

function requiredText(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} is missing.`);
  return value;
}

function positive(value) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError("Stock and blank dimensions must be positive.");
  return value;
}

function stockSpecification(description) {
  if (description.kind === "hardware") {
    return {
      kind: "hardware", productKey: requiredText(description.productKey, "Hardware product key"),
      variant: description.variant ?? null,
    };
  }
  if (!["lumber", "plywood"].includes(description.kind)) throw new TypeError("Unsupported physical part kind.");
  const stock = description.stock;
  if (!stock || stock.kind !== description.kind) throw new TypeError("Part stock kind is missing or inconsistent.");
  return {
    kind: stock.kind, materialKey: requiredText(stock.materialKey, "Stock material key"),
    nominalSize: stock.nominalSize ?? null, thickness: positive(stock.thickness),
    width: stock.kind === "lumber" ? positive(stock.width) : null,
    grade: stock.grade ?? null, finish: stock.finish ?? null, grain: stock.grain ?? null,
  };
}

export function manufacturingSpecification(description) {
  if (!description) throw new TypeError("A physical part requires a structured description.");
  const stock = stockSpecification(description);
  if (stock.kind === "hardware") return normalized({ stock });
  if (description.units?.length !== "inches") throw new TypeError("Part specifications require inch dimensions.");
  const { blank } = description;
  if (description.outline) validateProfile(description);
  if (description.construction) constructionOutline(description.construction);
  return normalized({
    stock,
    blank: {
      length: positive(blank.length), thickness: positive(blank.thickness), width: positive(blank.width),
      profiles: Object.fromEntries(["negativeY", "positiveY"].map(face => [face, unordered(blank.profiles[face])])),
      faces: unordered(blank.faces.map(face => ({
        axis: face.axis, plane: face.plane, points: unordered(face.indices.map(index => blank.vertices[index])),
      }))),
    },
    edgeCuts: unordered(description.edgeCuts.map(cut => ({
      axis: cut.axis, plane: cut.plane, points: unordered(cut.points),
    }))),
    notches: unordered(description.notches.map(notch => ({
      corner: notch.corner, length: notch.length, lengths: notch.lengths ?? null, depth: notch.depth,
    }))),
    dados: unordered(description.dados.map(dado => ({
      face: dado.face, start: dado.start, width: dado.width, depth: dado.depth, acrossWidth: dado.acrossWidth,
    }))),
    edgeNotches: unordered(description.edgeNotches ?? []),
    ...(description.outline ? { outline: description.outline } : {}),
    ...(description.holes?.length ? { holes: unordered(description.holes) } : {}),
    ...(description.construction ? { construction: { ...description.construction,
      notches: unordered(description.construction.notches.map(({ name, ...cut }) => cut)),
      ...(description.construction.openings ? {
        openings: unordered(description.construction.openings.map(({ name, ...cut }) => cut)),
      } : {}) } } : {}),
    ...(description.bend ? { bend: {
      innerRadius: positive(description.bend.innerRadius),
      neutralRadius: positive(description.bend.neutralRadius),
      sweepRadians: positive(description.bend.sweepRadians),
    } } : {}),
  });
}

export function freezeRecord(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeRecord);
    Object.freeze(value);
  }
  return value;
}

export function transformGeometry(geometry, matrix) {
  const transform = (values, translate) => {
    const result = new Float32Array(values.length);
    for (let i = 0; i < values.length; i += 3) for (let axis = 0; axis < 3; axis++) {
      result[i + axis] = (translate ? matrix[12 + axis] : 0) +
        matrix[axis] * values[i] + matrix[4 + axis] * values[i + 1] + matrix[8 + axis] * values[i + 2];
    }
    return result;
  };
  return { ...geometry, positions: transform(geometry.positions, true), normals: transform(geometry.normals, false) };
}

export function placementMatrix(axes, origin) {
  return Object.freeze([...axes.flatMap(axis => [...axis, 0]), ...origin, 1]);
}

export function composeTransforms(parent, child) {
  return Object.freeze(Array.from({ length: 16 }, (_, i) => {
    const row = i % 4, column = Math.floor(i / 4);
    return [0, 1, 2, 3].reduce((sum, k) => sum + parent[k * 4 + row] * child[column * 4 + k], 0);
  }));
}

export function inverseTransform(matrix) {
  const axes = [0, 1, 2].map(row => [0, 1, 2].map(column => matrix[column * 4 + row]));
  const origin = [0, 1, 2].map(row =>
    -[0, 1, 2].reduce((sum, column) => sum + matrix[row * 4 + column] * matrix[12 + column], 0));
  return placementMatrix(axes, origin);
}

export class Part {
  constructor({ key, stockKey, kind, description, specification, issue, flatGeometry, geometry, installedGeometry, material, volume }) {
    this.key = key;
    this.stockKey = stockKey;
    this.kind = kind;
    this.description = freezeRecord(structuredClone(description));
    this.specification = freezeRecord(specification);
    this.issue = issue;
    this.flatGeometry = flatGeometry ? Object.freeze(flatGeometry) : null;
    this.geometry = geometry ? Object.freeze(geometry) : this.flatGeometry;
    this.installedGeometry = installedGeometry ? Object.freeze(installedGeometry) : null;
    this.material = material ? freezeRecord(structuredClone(material)) : null;
    if (volume === undefined && material && this.geometry) {
      const { positions: p, indices } = this.geometry;
      let signedVolume = 0;
      for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
        signedVolume += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) +
          p[a + 1] * (p[b + 2] * p[c] - p[b] * p[c + 2]) +
          p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
      }
      volume = Math.abs(signedVolume / 6);
    }
    this.volume = volume;
    Object.freeze(this);
  }

  get stock() { return this.description?.stock; }
  get length() { return this.description?.blank?.length; }
  get thickness() { return this.description?.blank?.thickness; }
  get width() { return this.description?.blank?.width; }
  get outline() { return this.description?.outline; }
  get holes() { return this.description?.holes; }
  get bend() { return this.description?.bend; }

  createStockGeometry() {
    if (!this.flatGeometry) throw new Error(this.issue ?? "This Part has no flat cutting geometry.");
    return this.flatGeometry;
  }

  createGeometry() {
    if (!this.geometry) throw new Error(this.issue ?? "This Part has no finished geometry.");
    return this.geometry;
  }

  createInstalledGeometry() {
    return this.installedGeometry ?? this.createGeometry();
  }
}

export class PartCatalog {
  #parts = new Map();

  define(description, { kind = description?.kind, unresolvedId, createDesign = null } = {}) {
    let specification, key, stockKey, issue = null;
    try {
      specification = manufacturingSpecification(description);
      if (description.kind !== kind) throw new TypeError("Part kind and specification disagree.");
      if (kind === "hardware") {
        requiredText(description.productName, "Hardware product name");
        requiredText(description.summary, "Hardware summary");
      } else {
        requiredText(description.stock.material, "Stock material name");
        positive(description.cutLength);
        positive(description.finishedWidth);
        if (kind === "plywood") {
          positive(description.boundingRectangle.length);
          positive(description.boundingRectangle.width);
        }
      }
      key = keyOf(specification);
      stockKey = keyOf(kind === "hardware"
        ? { kind: "hardware", category: requiredText(description.category, "Hardware category") }
        : specification.stock);
    } catch (cause) {
      if (!unresolvedId) throw cause;
      issue = cause.message;
      description = null;
      specification = null;
      key = `unresolved:${unresolvedId}`;
      stockKey = "unresolved";
    }
    if (!this.#parts.has(key)) {
      const design = !issue && createDesign ? createDesign() : {};
      this.#parts.set(key, new Part({ key, stockKey, kind, description, specification, issue, ...design }));
    }
    return this.#parts.get(key);
  }

  get parts() { return Object.freeze([...this.#parts.values()]); }
}
