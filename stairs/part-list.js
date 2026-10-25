import { validateProfile, constructionOutline } from "./plywood-outline.js";

const compareText = new Intl.Collator("en", { numeric: true }).compare;
const kindOrder = { lumber: 0, plywood: 1, hardware: 2 };
const materialOrder = { pine: 0, oak: 1 };

export const PART_SUBSETS = Object.freeze([
  { key: "", label: "All parts" },
  { key: "framing", label: "Framing" },
  { key: "foundation", label: "Foundation" },
  { key: "step-framing", label: "Step framing" },
  { key: "treads-risers", label: "Treads and risers" },
  { key: "cladding", label: "Cladding" },
  { key: "banister", label: "Banister" },
  { key: "without-cladding", label: "Without cladding" },
].map(Object.freeze));

const foundationRoles = new Set([
  "leftCaster", "rightCaster", "leftRearCaster", "rightRearCaster",
  "innerBaseRail", "outerBaseRail",
  "leftSupportBeam", "rightSupportBeam", "supportCrossPiece", "rearSupportCrossPiece",
  "frontStepSupport", "rearStepSupport", "frontStepRightSupport", "frontStepLeftSupport",
]);
const stepFramingRoles = new Set([
  "leftUpright", "rightUpright", "leftRearUpright", "rightRearUpright",
  "southCrossPiece", "northCrossPiece", "leftStepSupport", "rightStepSupport",
  "leftSupportBlock", "rightSupportBlock", "leftBackSupportBlock", "rightBackSupportBlock",
  "frontStepSupport", "rearStepSupport", "frontStepRightSupport", "frontStepLeftSupport",
  "newelInnerBlock", "newelRearBlock",
]);
const banisterRoles = new Set([
  "newel", "frontSpindle", "rearSpindle", "spindleShim", "newelInnerBlock", "newelRearBlock",
  "rightUpright", "rightRearUpright",
]);
const claddingRoles = new Set(["siding", "frontSiding", "backPanel"]);

function partSubsets(node) {
  const foundation = foundationRoles.has(node.key) || (node.key === "southCrossPiece" && node.stepNumber === 1);
  const stepFraming = stepFramingRoles.has(node.key);
  const cladding = claddingRoles.has(node.key);
  const subsets = [];
  if ((node.kind === "lumber" || node.category === "base-rails") &&
    (foundation || stepFraming)) subsets.push("framing");
  if (foundation) subsets.push("foundation");
  if (stepFraming) subsets.push("step-framing");
  if (node.key === "tread" || node.key === "riser") subsets.push("treads-risers");
  if (cladding) subsets.push("cladding");
  if (banisterRoles.has(node.key) || (node.key === "southCrossPiece" && node.stepNumber === 1)) subsets.push("banister");
  if (!cladding) subsets.push("without-cladding");
  return subsets;
}

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

function freezeRecord(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freezeRecord);
    Object.freeze(value);
  }
  return value;
}

function numberSet(numbers, singular, plural) {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b), ranges = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    while (sorted[i + 1] === sorted[i] + 1) i++;
    ranges.push(start === sorted[i] ? String(start) : `${start}-${sorted[i]}`);
  }
  return `${sorted.length === 1 ? singular : plural} ${ranges.join(", ")}`;
}

function compareStocks(a, b) {
  return (kindOrder[a.kind] ?? 3) - (kindOrder[b.kind] ?? 3) ||
    (materialOrder[a.stock?.materialKey] ?? 2) - (materialOrder[b.stock?.materialKey] ?? 2) ||
    compareText(a.stock?.material ?? a.category ?? "", b.stock?.material ?? b.category ?? "") ||
    compareText(a.stock?.nominalSize ?? "", b.stock?.nominalSize ?? "") ||
    (a.stock?.thickness ?? 0) - (b.stock?.thickness ?? 0) ||
    (a.stock?.width ?? 0) - (b.stock?.width ?? 0) || compareText(a.key, b.key);
}

function partTitle(entry, locations, variants) {
  const names = new Set(locations.map(location => location.name));
  const roles = entry.roles.filter(role => names.has(role.label));
  let labels = roles.map(role => role.label);
  for (const [title, ...aliases] of [
    ["Attachment block - rear support", "Attachment block - rear support left", "Attachment block - rear support right"],
    ["Spindle", "Spindle - front", "Spindle - rear"],
  ]) {
    if (aliases.every(alias => names.has(alias))) {
      labels = [...new Set(labels.map(label => aliases.includes(label) ? title : label))];
    }
  }
  let title = entry.kind === "hardware" && entry.description ? entry.description.productName :
    labels.length > 2 ? `Board (${roles.length} roles)` : labels.join(" / ");
  if (entry.kind !== "hardware" && roles.some(role => variants.get(role.label) > 1)) {
    const steps = locations.map(location => location.stepNumber).filter(number => number !== null);
    const context = steps.length === locations.length
      ? numberSet(steps, "step", "steps")
      : numberSet(locations.map(location => location.moduleNumber).filter(number => number !== null), "module", "modules");
    if (context) title = title.endsWith(")") ? `${title.slice(0, -1)}; ${context})` : `${title} (${context})`;
  }
  return title;
}

export class PartInventory {
  #byKey = new Map();
  #byOccurrence = new Map();
  #roleVariants = new Map();
  #titleSuffixes = new Map();

  constructor(tree) {
    const entries = new Map(), sections = new Map(), stepNumbers = new Map(), moduleNumbers = new Map();
    tree.root.children.forEach((module, index) => {
      moduleNumbers.set(module.id, index + 1);
      module.children.filter(node => node.kind === "assembly").forEach(step =>
        stepNumbers.set(step.id, stepNumbers.size + 1));
    });
    for (const node of tree.getLeaves()) {
      const ancestors = tree.getAncestors(node.id);
      const module = ancestors.find(ancestor => ancestor.kind === "module");
      const step = ancestors.find(ancestor => ancestor.kind === "assembly");
      const location = {
        id: node.id, name: node.name, parentId: node.parentId, category: node.category ?? node.kind,
        subsets: partSubsets(node),
        moduleNumber: moduleNumbers.get(module?.id) ?? null,
        stepNumber: node.stepNumber ?? stepNumbers.get(step?.id) ?? null,
        path: [...ancestors.filter(ancestor => ancestor.kind !== "stairway").map(ancestor => ancestor.name),
          !step && node.stepNumber != null
            ? `${node.name} (step ${node.stepNumber})` : node.name],
      };
      let description, specification, key, stockKey, issue = null;
      try {
        description = node.getDescription();
        specification = manufacturingSpecification(description);
        if (description.kind !== node.kind) throw new TypeError("Part kind and specification disagree.");
        if (node.kind === "hardware") {
          requiredText(description.productName, "Hardware product name");
          requiredText(description.summary, "Hardware summary");
        } else {
          requiredText(description.stock.material, "Stock material name");
          positive(description.cutLength);
          positive(description.finishedWidth);
          if (node.kind === "plywood") {
            positive(description.boundingRectangle.length);
            positive(description.boundingRectangle.width);
          }
        }
        key = keyOf(specification);
        stockKey = keyOf(node.kind === "hardware"
          ? { kind: "hardware", category: requiredText(description.category, "Hardware category") }
          : specification.stock);
      } catch (cause) {
        issue = `Could not group ${location.path.join(" / ")}: ${cause.message}`;
        description = null;
        specification = null;
        key = `unresolved:${node.id}`;
        stockKey = "unresolved";
      }
      if (!entries.has(key) && !sections.has(stockKey)) sections.set(stockKey, {
        key: stockKey, kind: issue ? "unresolved" : node.kind,
        stock: description?.stock ?? null, category: description?.category ?? null, entries: [],
      });
      if (!entries.has(key)) entries.set(key, {
        key, stockKey, kind: node.kind, specification, description, issue,
        representativeId: node.id, occurrenceIds: [], roles: [], locations: [],
      });
      const entry = entries.get(key);
      entry.occurrenceIds.push(node.id);
      entry.locations.push(location);
      const label = node.name;
      let role = entry.roles.find(role => role.label === label);
      if (!role) entry.roles.push(role = { label, occurrenceIds: [] });
      role.occurrenceIds.push(node.id);
    }
    for (const entry of entries.values()) {
      for (const role of entry.roles) {
        this.#roleVariants.set(role.label, (this.#roleVariants.get(role.label) ?? 0) + 1);
      }
    }
    const titles = new Map();
    for (const entry of entries.values()) {
      const title = partTitle(entry, entry.locations, this.#roleVariants);
      entry.title = title;
      entry.quantity = entry.occurrenceIds.length;
      if (!titles.has(title)) titles.set(title, []);
      titles.get(title).push(entry);
    }
    for (const duplicates of titles.values()) {
      if (duplicates.length > 1) duplicates.forEach((entry, index) => {
        const suffix = ` - variant ${index + 1}`;
        this.#titleSuffixes.set(entry.key, suffix);
        entry.title += suffix;
      });
    }
    for (const entry of entries.values()) {
      freezeRecord(entry);
      this.#byKey.set(entry.key, entry);
      for (const id of entry.occurrenceIds) this.#byOccurrence.set(id, entry);
      sections.get(entry.stockKey).entries.push(entry);
    }
    this.sections = [...sections.values()].sort(compareStocks).map(section => {
      section.entries.sort((a, b) => compareText(a.roles[0].label, b.roles[0].label) ||
        (a.description?.cutLength ?? 0) - (b.description?.cutLength ?? 0) ||
        (a.description?.finishedWidth ?? 0) - (b.description?.finishedWidth ?? 0) || compareText(a.key, b.key));
      section.quantity = section.entries.reduce((sum, entry) => sum + entry.quantity, 0);
      return freezeRecord(section);
    });
    this.entries = Object.freeze(this.sections.flatMap(section => section.entries));
    this.quantity = this.entries.reduce((sum, entry) => sum + entry.quantity, 0);
    this.issues = Object.freeze(this.entries.filter(entry => entry.issue).map(entry => entry.issue));
    Object.freeze(this.sections);
    Object.freeze(this);
  }

  getEntry(key) {
    const entry = this.#byKey.get(key);
    if (!entry) throw new RangeError(`Unknown inventory entry: ${key}`);
    return entry;
  }

  findOccurrence(id) { return this.#byOccurrence.get(id) ?? null; }

  filter({ moduleNumber = null, subset = "", stockKey = "" } = {}) {
    if (!PART_SUBSETS.some(option => option.key === subset)) throw new RangeError(`Unknown part subset: ${subset}`);
    const occurrences = this.entries.filter(entry => !stockKey || entry.stockKey === stockKey)
      .flatMap(entry => entry.locations
        .filter(location => (moduleNumber === null || location.moduleNumber === moduleNumber) &&
          (!subset || location.subsets.includes(subset)))
        .map(location => ({ entry, location })));
    occurrences.sort((a, b) => compareText(a.location.name, b.location.name) ||
      a.location.moduleNumber - b.location.moduleNumber ||
      (a.location.stepNumber ?? 0) - (b.location.stepNumber ?? 0) ||
      compareText(a.location.id, b.location.id));
    const groups = new Map();
    for (const { entry, location } of occurrences) {
      if (!groups.has(entry.key)) groups.set(entry.key, { entry, locations: [] });
      groups.get(entry.key).locations.push(location);
    }
    for (const group of groups.values()) {
      group.title = partTitle(group.entry, group.locations, this.#roleVariants) +
        (this.#titleSuffixes.get(group.entry.key) ?? "");
    }
    return { occurrences, groups: [...groups.values()], uniqueCount: groups.size };
  }
}
