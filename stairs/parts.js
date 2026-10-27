import { Part, PartCatalog, placementMatrix, composeTransforms } from "./part-design.js";

const EPSILON = 1e-8;
export const PART_VIEW_NAMES = Object.freeze(["Up", "Down", "Left", "Right", "Front", "Back"]);
export const partViewLabel = name => ({ Up: "Top", Down: "Bottom" }[name] ?? name);
const degrees = radians => radians * 180 / Math.PI;
const dot = (a, b) => a.reduce((sum, value, axis) => sum + value * b[axis], 0);
const subtract = (a, b) => a.map((value, axis) => value - b[axis]);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export function rectangularBlank(length, thickness, width) {
  return {
    vertices: [
      [0, 0, 0], [length, 0, 0], [length, 0, width], [0, 0, width],
      [0, thickness, 0], [length, thickness, 0],
      [length, thickness, width], [0, thickness, width],
    ],
    faces: [
      { name: "Broad face 1", axis: "thickness", indices: [0, 1, 2, 3] },
      { name: "Broad face 2", axis: "thickness", indices: [4, 7, 6, 5] },
      { name: "Near edge", axis: "width", indices: [0, 4, 5, 1] },
      { name: "End", axis: "length", indices: [1, 5, 6, 2] },
      { name: "Far edge", axis: "width", indices: [2, 6, 7, 3] },
      { name: "Start", axis: "length", indices: [3, 7, 4, 0] },
    ],
  };
}

export function prismaticBlank(footprint, height, lengthEdge = 0, flat = false) {
  const count = footprint.length;
  const start = footprint[lengthEdge], end = footprint[(lengthEdge + 1) % count];
  const length = Math.hypot(...subtract(end, start));
  const x = [(end[0] - start[0]) / length, 0, -(end[1] - start[1]) / length];
  const up = [0, 1, 0];
  const y = flat ? up : cross(up, x);
  const z = flat ? cross(x, up) : up;
  const vertices = [0, height].flatMap(elevation =>
    footprint.map(([east, north]) => {
      const point = [east - start[0], elevation, start[1] - north];
      return [dot(point, x), dot(point, y), dot(point, z)];
    }));
  const faces = [
    { name: "Bottom", axis: flat ? "thickness" : "width",
      indices: [0, ...Array.from({ length: count - 1 }, (_, i) => count - 1 - i)] },
    { name: "Top", axis: flat ? "thickness" : "width",
      indices: Array.from({ length: count }, (_, i) => count + i) },
    ...footprint.map((point, i) => {
      const next = footprint[(i + 1) % count];
      const along = (next[0] - point[0]) * x[0] - (next[1] - point[1]) * x[2];
      const across = (next[0] - point[0]) * x[2] + (next[1] - point[1]) * x[0];
      const longEdge = count === 4 ? (i - lengthEdge + 4) % 2 === 0
        : Math.abs(along) >= Math.abs(across);
      return {
        name: `Edge ${i + 1}`,
        axis: longEdge ? flat ? "width" : "thickness" : "length",
        indices: [i, (i + 1) % count, (i + 1) % count + count, i + count],
      };
    }),
  ];
  return { vertices, faces };
}

function describeBlank(shape) {
  if (shape.vertices.length < 4 || shape.vertices.some(point =>
    point.length !== 3 || point.some(value => !Number.isFinite(value)))) {
    throw new RangeError("A cutting blank requires finite stock-coordinate vertices.");
  }
  const minimum = [0, 1, 2].map(axis => Math.min(...shape.vertices.map(point => point[axis])));
  const vertices = shape.vertices.map(point => subtract(point, minimum));
  const maximum = [0, 1, 2].map(axis => Math.max(...vertices.map(point => point[axis])));
  if (maximum.some(value => value <= EPSILON)) throw new RangeError("A cutting blank must have positive dimensions.");
  const center = [0, 1, 2].map(axis => vertices.reduce((sum, point) => sum + point[axis], 0) / vertices.length);
  const faces = shape.faces.map(face => {
    if (face.indices.length < 3 || face.indices.some(index =>
      !Number.isInteger(index) || !vertices[index])) {
      throw new RangeError("A cutting blank face requires valid vertex indices.");
    }
    const points = face.indices.map(index => vertices[index]);
    let normal = cross(subtract(points[1], points[0]), subtract(points[2], points[0]));
    const magnitude = Math.hypot(...normal);
    if (magnitude <= EPSILON) throw new RangeError("A cutting blank face is degenerate.");
    normal = normal.map(value => value / magnitude);
    const reversed = dot(normal, subtract(points[0], center)) < 0;
    if (reversed) normal = normal.map(value => -value);
    const offset = dot(normal, points[0]);
    if (points.some(point => Math.abs(dot(normal, point) - offset) > EPSILON)) {
      throw new RangeError("A cutting blank face must be planar.");
    }
    return {
      name: face.name, axis: face.axis, indices: reversed ? [...face.indices].reverse() : [...face.indices],
      plane: { normal, offset },
    };
  });
  const profiles = {};
  for (const face of faces.filter(face => face.axis === "thickness")) {
    const points = face.indices.map(index => vertices[index]);
    const negative = points.every(point => Math.abs(point[1]) < EPSILON);
    const positive = points.every(point => Math.abs(point[1] - maximum[1]) < EPSILON);
    if ((!negative && !positive) || profiles[negative ? "negativeY" : "positiveY"]) {
      throw new RangeError("A cutting blank must have two parallel broad faces.");
    }
    profiles[negative ? "negativeY" : "positiveY"] = points.map(([x, , z]) => [x, z]);
  }
  if (!profiles.negativeY || !profiles.positiveY) throw new RangeError("A cutting blank requires both broad-face profiles.");
  return { length: maximum[0], thickness: maximum[1], width: maximum[2], vertices, faces, profiles };
}

export function describeBoard(board) {
  const blank = describeBlank(board.getBlankShape());
  const stock = { ...board.stock, material: board.material.name, materialKey: board.material.key };
  if (Math.abs(stock.thickness - blank.thickness) > EPSILON ||
    (stock.kind === "lumber" && blank.width > stock.width + EPSILON)) {
    throw new RangeError(`${board.name ?? board.constructor.name}: the cutting blank does not fit its source stock ` +
      `(${blank.thickness} x ${blank.width} in; stock ${stock.thickness} x ${stock.width ?? "sheet"} in).`);
  }
  const edgeCuts = blank.faces.filter(face => face.axis !== "thickness").map(face => {
    const normal = face.plane.normal;
    const axis = face.axis === "length" ? 0 : 2, other = axis === 0 ? 2 : 0;
    return {
      name: face.name, axis: face.axis, plane: face.plane,
      points: face.indices.map(index => [...blank.vertices[index]]),
      angleFromSquare: degrees(Math.atan2(Math.hypot(normal[other], normal[1]), Math.abs(normal[axis]))),
      miterDegrees: degrees(Math.atan2(normal[other], Math.abs(normal[axis]))),
      bevelDegrees: degrees(Math.atan2(normal[1], Math.hypot(normal[0], normal[2]))),
    };
  }).filter(cut => stock.kind === "plywood" || cut.axis === "length" || cut.angleFromSquare > EPSILON);
  edgeCuts.push(...(board.faceCuts ?? []).map(cut => ({ ...cut, surfaceCut: true })));
  const notches = [...Object.entries(board.notches ?? {}),
    ...(board.rebates ?? []).map(({ corner, ...cut }) => [corner, cut])].map(([corner, notch]) => {
    const description = {
      corner, length: notch.length, depth: [...notch.depth],
      bevelDegrees: degrees(Math.atan2(notch.depth[1] - notch.depth[0], stock.thickness)),
    };
    if (notch.lengths) {
      const start = corner.startsWith("start");
      const shoulders = ["negativeY", "positiveY"].map((name, face) => {
        const xs = blank.profiles[name].map(point => point[0]);
        return start ? Math.min(...xs) + notch.lengths[face] : Math.max(...xs) - notch.lengths[face];
      });
      description.lengths = [...notch.lengths];
      description.shoulderBevelDegrees = degrees(Math.atan2(shoulders[1] - shoulders[0], stock.thickness));
    }
    return description;
  });
  const dados = (board.dados ?? []).map(dado => {
    const z = blank.profiles[dado.face].map(point => point[1]);
    return { ...dado, acrossWidth: Math.max(...z) - Math.min(...z),
      endNotch: dado.start < EPSILON || dado.start + dado.width > blank.length - EPSILON };
  });
  return {
    kind: stock.kind, units: { length: "inches", angle: "degrees" }, stock,
    cutLength: blank.length, finishedWidth: blank.width, blank,
    widthTrim: stock.kind === "lumber" && stock.width - blank.width > EPSILON
      ? { from: stock.width, to: blank.width, removed: stock.width - blank.width } : null,
    boundingRectangle: stock.kind === "plywood" ? { length: blank.length, width: blank.width } : null,
    edgeCuts, notches, dados,
    edgeNotches: (board.edgeNotches ?? []).map(cut => ({
      profiles: cut.profiles.map(profile => profile.map(point => [...point])),
    })),
  };
}

const PART_NAMES = { riser: "Riser", tread: "Tread", siding: "Side panel - right",
  frontSiding: "Side panel - right front section",
  newel: "Newel post", backPanel: "Rear panel",
  lowerBackGusset: "Rear gusset - lower",
  frontSpindle: "Spindle - front", rearSpindle: "Spindle - rear", spindleShim: "Spindle shim",
  rearSpindleInsert: "Threaded insert" };
const BOARD_NAMES = {
  bottomFrame: {
    leftCaster: "Caster", rightCaster: "Caster",
    leftRearCaster: "Caster", rightRearCaster: "Caster",
    leftUpright: "Upright - front left", leftRearUpright: "Upright - rear left",
    rightUpright: "Upright - front right", rightRearUpright: "Upright - rear right",
  },
  topFrame: {
    southCrossPiece: "Tread support - front", northCrossPiece: "Tread support - rear",
    leftStepSupport: "Tread support - left", rightStepSupport: "Tread support - right",
    leftBackSupportBlock: "Attachment block - rear support left",
    rightBackSupportBlock: "Attachment block - rear support right",
    frontBearingCap: "Bearing cap - front",
    frontSpindleBlock: "Spindle block - front", rearSpindleBlock: "Spindle block - rear",
    frontStepRightSupport: "Tread support - first-step right",
    frontStepLeftSupport: "Tread support - first-step left",
    frontStepRightRearSupport: "Tread support - first-step right rear",
    frontStepFrontBearing: "Beam - first-step front", frontStepRearBearing: "Beam - first-step rear",
  },
};
const PART_CATEGORIES = {
  frontSpindle: "spindles", rearSpindle: "spindles", spindleShim: "spindles", rearSpindleInsert: "spindles",
  siding: "siding", frontSiding: "siding", newel: "newel",
  sidingStiffener: "ribs", frontSidingStiffener: "ribs",
  sidingStiffenerUpper: "ribs", frontSidingStiffenerUpper: "ribs",
  sidingRib: "ribs", intermediateSidingRib: "ribs",
  sidingRib2: "ribs", sidingRib3: "ribs",
  intermediateSidingRib2: "ribs", intermediateSidingRib3: "ribs",
  frontPanelSupportBlock: "ribs", rearPanelSupportBlock: "ribs",
  frontRibSupportBlock: "ribs", rearRibSupportBlock: "ribs",
  frontIntermediateRibSupportBlock: "ribs", rearIntermediateRibSupportBlock: "ribs",
  backRibSupportBlock: "ribs", backIntermediateRibSupportBlock: "ribs",
  leftUpright: "uprights", rightUpright: "uprights",
  leftRearUpright: "uprights", rightRearUpright: "uprights",
};

export class Piece {
  constructor({ id, key, name, part, transform, parentId, stepNumber = null, category = null,
    visibilityKey, stepIndex }) {
    const kind = part?.kind;
    if (![id, key, name, kind].every(value => typeof value === "string" && value.length > 0)) {
      throw new TypeError("A piece requires an ID, role key, name, and Part kind.");
    }
    if (!(part instanceof Part)) throw new TypeError("A piece must reference a Part.");
    if (transform?.length !== 16 || !transform.every(Number.isFinite)) {
      throw new TypeError("A piece requires a finite installation transform.");
    }
    this.id = id;
    this.key = key;
    this.name = name;
    this.kind = kind;
    this.category = category;
    this.part = part;
    this.transform = Object.freeze([...transform]);
    this.parentId = parentId;
    this.stepNumber = stepNumber;
    this.stepIndex = stepIndex;
    this.visibilityKey = visibilityKey;
    this.children = Object.freeze([]);
    Object.freeze(this);
  }

  getDescription() {
    return this.part.description ? { id: this.id, name: this.name, ...this.part.description } : null;
  }
}

export function createPieces(model) {
  const catalog = new PartCatalog();
  const angle = model.steps?.[0]?.angle ?? model.modules[0].steps[0].angle;
  const modulePartOrder = new Map([
    "leftCaster", "rightCaster", "leftRearCaster", "rightRearCaster",
    "leftSupportBeam", "rightSupportBeam", "supportCrossPiece", "rearSupportCrossPiece",
    "leftUpright", "leftRearUpright", "rightUpright", "rightRearUpright",
  ].map((key, index) => [key, index]));
  for (const [moduleIndex, module] of model.modules.entries()) {
    const parentId = `stairway/module-${moduleIndex + 1}`;
    const leaf = (component, key, name, stepNumber, occurrenceKey, visibilityKey) => {
      const id = `${parentId}/${occurrenceKey}`;
      const kind = component.partKind ?? component.stock?.kind;
      const describe = component.getPartDescription ?? component.getManufacturingDescription;
      const part = catalog.define(describe?.call(component), {
        kind, unresolvedId: id, createDesign: () => component.createDesign(),
      });
      const stepIndex = stepNumber === null ? module.startIndex : stepNumber - 1;
      const rotation = (stepIndex - module.startIndex) * angle;
      const c = Math.cos(rotation), s = Math.sin(rotation);
      const frame = placementMatrix([[c, 0, -s], [0, 1, 0], [s, 0, c]],
        [c * model.innerRadius, 0, -s * model.innerRadius]);
      return new Piece({
        id, key, name, part, parentId, stepNumber, stepIndex, visibilityKey,
        transform: composeTransforms(frame, component.getPlacement()),
        category: component.material?.key === "particle-board" ? "particle-board"
          : component.category ?? PART_CATEGORIES[key] ?? (kind === "plywood" ? "plywood" : null),
      });
    };
    const pieces = module.steps.flatMap((step, index) => {
      const stepNumber = module.startIndex + index + 1;
      const stepPart = (component, key, name, visibilityKey) =>
        leaf(component, key, name, stepNumber, `step-${stepNumber}-${key}`, visibilityKey);
      return Object.entries(step.parts).flatMap(([partKey, part]) => {
        if (!part.boards) return [stepPart(part, partKey, part.name ??
          (partKey === "siding" && stepNumber === 1 ? "Side panel - right rear section" : PART_NAMES[partKey]),
          ["sidingStiffener", "sidingStiffenerUpper"].includes(partKey) ? "siding"
            : ["frontSidingStiffener", "frontSidingStiffenerUpper"].includes(partKey) ? "frontSiding" : partKey)];
        return Object.entries({ ...part.boards, ...part.hardware }).map(([boardKey, board]) =>
          stepPart(board, boardKey, board.name ??
            BOARD_NAMES[partKey]?.[boardKey] ?? BOARD_NAMES.bottomFrame[boardKey], partKey));
      });
    });
    pieces.push(...Object.entries(module.boards).map(([key, board]) =>
      leaf(board, key, board.name, null, key,
        ["siding", "sidingStiffener", "sidingStiffenerUpper", "sidingRib", "sidingRib2", "sidingRib3",
          "intermediateSidingRib", "intermediateSidingRib2", "intermediateSidingRib3"].includes(key)
          ? "siding" : "supportBeams")));
    pieces.sort((a, b) =>
      (modulePartOrder.get(a.key) ?? modulePartOrder.size) -
      (modulePartOrder.get(b.key) ?? modulePartOrder.size));
    module.pieces = Object.freeze(pieces);
  }
  return catalog.parts;
}

export class PieceTree {
  #nodes = new Map();

  constructor(model) {
    const rootId = "stairway";
    const modules = model.modules.map((module, moduleIndex) => {
      const key = `module-${moduleIndex + 1}`, id = `${rootId}/${key}`;
      return Object.freeze({
        id, key, name: `Module ${moduleIndex + 1}`, kind: "module",
        module, parentId: rootId,
        children: module.pieces, getDescription: () => null,
      });
    });
    this.parts = model.parts;
    this.root = Object.freeze({
      id: rootId, key: rootId, name: model.label, kind: "stairway", parentId: null,
      children: Object.freeze(modules), getDescription: () => null,
    });
    this.topologyKey = `${model.stepCount}:${model.modules.map(module => module.steps.length).join(",")}`;
    const index = node => {
      if (this.#nodes.has(node.id)) throw new RangeError(`Duplicate part node ID: ${node.id}`);
      this.#nodes.set(node.id, node);
      for (const child of node.children) index(child);
    };
    index(this.root);
    Object.freeze(this);
  }

  hasNode(id) { return this.#nodes.has(id); }

  getNode(id) {
    const node = this.#nodes.get(id);
    if (!node) throw new RangeError(`Unknown part node: ${id}`);
    return node;
  }

  getChildren(id = this.root.id) { return this.getNode(id).children; }

  getAncestors(id) {
    const ancestors = [];
    for (let node = this.getNode(id); node.parentId; node = this.getNode(node.parentId)) {
      ancestors.unshift(this.getNode(node.parentId));
    }
    return ancestors;
  }

  getLeaves(id = this.root.id) {
    const leaves = [];
    const visit = node => {
      if (node.children.length) node.children.forEach(visit);
      else if (node instanceof Piece) leaves.push(node);
    };
    visit(this.getNode(id));
    return leaves;
  }

  getStockViews(id) {
    const node = this.getNode(id);
    if (node.children.length || node.kind === "hardware") {
      throw new RangeError("Stock views require a physical part with stock axes.");
    }
    const ancestors = this.getAncestors(id);
    const module = ancestors.find(node => node.kind === "module").module;
    const step = node.stepNumber === null ? null : module.steps[node.stepNumber - module.startIndex - 1];
    const relative = step ? (node.stepNumber - module.startIndex - 1) * step.angle : 0;
    const angle = relative + (step ? step.angle / 2 : module.steps.length * module.steps[0].angle / 2);
    const cosine = Math.cos(angle), sine = Math.sin(angle);
    const frame = [
      { positive: "Right", negative: "Left", direction: [cosine, 0, -sine] },
      { positive: "Up", negative: "Down", direction: [0, 1, 0] },
      { positive: "Back", negative: "Front", direction: [-sine, 0, -cosine] },
    ];
    const mid = (node.part.bend?.sweepRadians ?? 0) / 2;
    const localAxes = node.part.bend
      ? [[-Math.sin(mid), 0, -Math.cos(mid)], [-Math.cos(mid), 0, Math.sin(mid)], [0, 1, 0]]
      : [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const axes = localAxes.map(axis => [0, 1, 2].map(row =>
      axis.reduce((sum, value, column) => sum + node.transform[column * 4 + row] * value, 0)));
    const permutations = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    let best = permutations[0], bestScore = -Infinity;
    // Match axis pairs together so angled stock never gives two views the same label.
    for (const permutation of permutations) {
      const score = frame.reduce((sum, target, i) =>
        sum + Math.abs(dot(axes[permutation[i]], target.direction)), 0);
      if (score > bestScore + EPSILON) { best = permutation; bestScore = score; }
    }
    const directions = new Map();
    frame.forEach((target, i) => {
      const axis = best[i], sign = dot(axes[axis], target.direction) < 0 ? -1 : 1;
      directions.set(target.positive, [0, 1, 2].map(j => j === axis ? sign : 0));
      directions.set(target.negative, [0, 1, 2].map(j => j === axis ? -sign : 0));
    });
    return PART_VIEW_NAMES.map(name => {
      const direction = directions.get(name);
      const surface = direction[1] !== 0 ? "face"
        : node.kind === "lumber" && direction[0] !== 0 ? "end" : "edge";
      return { name, direction, surface };
    });
  }
}

export class PartBrowser {
  #tree;
  #currentId;
  #selectedId = null;

  constructor(tree) {
    this.#tree = tree;
    this.#currentId = tree.root.id;
  }

  get currentNode() { return this.#tree.getNode(this.#currentId); }
  get selectedNode() { return this.#selectedId === null ? null : this.#tree.getNode(this.#selectedId); }
  get children() {
    const children = this.currentNode.children.length ? this.currentNode.children : [this.currentNode];
    return [...children.filter(node => node.children.length), ...children.filter(node => !node.children.length)];
  }
  get childrenAreParts() { return this.children.every(node => node.children.length === 0); }
  get path() { return [...this.#tree.getAncestors(this.#currentId), this.currentNode]; }
  get description() { return this.selectedNode?.getDescription() ?? null; }

  navigate(id) {
    const node = this.#tree.getNode(id);
    this.#currentId = node.id;
    this.#selectedId = null;
    return node;
  }

  select(id) {
    const node = this.#tree.getNode(id);
    if (node.children.length || !this.children.some(child => child.id === id)) {
      throw new RangeError("Select a part from the current assembly's parts list.");
    }
    this.#selectedId = node.id;
    return node;
  }

  clearSelection() { this.#selectedId = null; }

  up() { return this.navigate(this.currentNode.parentId ?? this.#tree.root.id); }
  reset() { return this.navigate(this.#tree.root.id); }

  setTree(tree) {
    const preserve = tree.topologyKey === this.#tree.topologyKey && tree.hasNode(this.#currentId);
    this.#tree = tree;
    if (!preserve) this.reset();
    else if (this.#selectedId !== null &&
      !this.children.some(node => node.id === this.#selectedId && node.children.length === 0)) {
      this.#selectedId = null;
    }
    return this.currentNode;
  }
}
