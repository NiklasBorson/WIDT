import { PieceTree, createPieces, describeBoard, rectangularBlank, prismaticBlank } from "./parts.js";
import { placementMatrix, composeTransforms, inverseTransform, transformGeometry } from "./part-design.js";
import { outlineBounds, outlineArea, validateProfile, tessellateOutline, constructionProfile, bridgeProfile, subtractProfile } from "./plywood-outline.js";

export const TOTAL_HEIGHT = 77;
export const INNER_ARC_LENGTH = 60.5;
export const INNER_RADIUS = INNER_ARC_LENGTH * 2 / Math.PI;
export const FRAME_THICKNESS = 0.75;
export const FRAME_WIDTH = 3.5;
export const RISER_THICKNESS = 1 / 4;
export const TREAD_THICKNESS = 1 / 2;
export const SIDING_THICKNESS = 1 / 8;
export const SIDING_CLEARANCE = 0;
export const BASE_RAIL_THICKNESS = 3 / 4;
export const BASE_RAIL_WIDTH = 6;
export const DEFAULT_SPINDLE_SHOULDER_ASCENT = 32;
export const FLOOR_CLEARANCE = 1;
export const CASTER_HEIGHT = 4.25;
export const SUPPORT_BEAM_BOTTOM_HEIGHT = CASTER_HEIGHT;
export const SUPPORT_NOTCH_DEPTH = 1 / 2;
export const UPRIGHT_THICKNESS = 1.5;
export const SUPPORT_BEAM_THICKNESS = 1.5;
export const BASE_RAIL_BOTTOM_HEIGHT = SUPPORT_BEAM_BOTTOM_HEIGHT + SUPPORT_BEAM_THICKNESS;
export const BASE_RAIL_TOP_HEIGHT = BASE_RAIL_BOTTOM_HEIGHT + BASE_RAIL_THICKNESS;
export const CASTER_DIMENSIONS = Object.freeze({
  height: CASTER_HEIGHT, wheelDiameter: 3, wheelWidth: 1.25, plateLength: 3.62, plateWidth: 2.5,
});

const PINE_DENSITY_LB_PER_FT3 = 30;
const PLYWOOD_DENSITY_LB_PER_FT3 = 40;
export const OAK_DENSITY = 45;
export const PINE = { key: "pine", name: "Pine", density: PINE_DENSITY_LB_PER_FT3, color: [0.80, 0.60, 0.37] };
export const OAK = { key: "oak", name: "Oak", density: OAK_DENSITY, color: [0.58, 0.32, 0.20] };
export const PLYWOOD = { key: "plywood", name: "Plywood", density: PLYWOOD_DENSITY_LB_PER_FT3, color: [0.86, 0.72, 0.50] };
export const PARTICLE_BOARD = { key: "particle-board", name: "Particle board", density: 45,
  color: [0.60, 0.43, 0.25], texture: "particle-board" };
const ONE_BY_FOUR_STOCK = { kind: "lumber", nominalSize: "1x4", thickness: FRAME_THICKNESS, width: FRAME_WIDTH };
const TWO_BY_FOUR_STOCK = { kind: "lumber", nominalSize: "2x4", thickness: UPRIGHT_THICKNESS, width: FRAME_WIDTH };
const TWO_BY_SIX_STOCK = { kind: "lumber", nominalSize: "2x6", thickness: UPRIGHT_THICKNESS, width: 5.5 };
const TWO_BY_TWO_STOCK = { kind: "lumber", nominalSize: "2x2", thickness: 1.5, width: 1.5 };
const FOUR_BY_FOUR_STOCK = { kind: "lumber", nominalSize: "4x4", thickness: 3.5, width: 3.5 };

function validateDimensions(component, dimensions) {
  for (const [name, value] of Object.entries(dimensions)) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`${component} ${name} must be a finite positive number of inches.`);
    }
  }
}

function geometryFromFaces(faces, color, { direction, endFaces, endDirection, plyDirection, plyThickness = 0, solidColor = false,
  texture = "wood", origin = faces[0][0] }) {
  const positions = [], normals = [], colors = [], grain = [], indices = [];
  for (const [face, corners] of faces.entries()) {
    const offset = positions.length / 3;
    const a = corners[1].map((value, axis) => value - corners[0][axis]);
    const b = corners[2].map((value, axis) => value - corners[0][axis]);
    const cross = [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
    const magnitude = Math.hypot(...cross);
    if (!Number.isFinite(magnitude) || magnitude === 0) {
      throw new RangeError("Solid geometry contains a degenerate face.");
    }
    const normal = cross.map(value => value / magnitude);
    const isEnd = endFaces.includes(face);
    let along = isEnd ? endDirection ?? a.map(value => value / Math.hypot(...a)) : direction;
    let across = [
      normal[1] * along[2] - normal[2] * along[1],
      normal[2] * along[0] - normal[0] * along[2],
      normal[0] * along[1] - normal[1] * along[0],
    ];
    if (isEnd && plyDirection) {
      across = plyDirection;
      along = [
        normal[1] * across[2] - normal[2] * across[1],
        normal[2] * across[0] - normal[0] * across[2],
        normal[0] * across[1] - normal[1] * across[0],
      ];
    }
    const acrossLength = Math.hypot(...across);
    for (const corner of corners) {
      positions.push(...corner);
      normals.push(...normal);
      colors.push(...color);
      const relative = corner.map((value, axis) => value - origin[axis]);
      // Across/along inches, cut-face flag, and ply thickness (-1 selects particle board).
      if (solidColor) grain.push(0, 0, 0, 0);
      else grain.push(
        relative.reduce((sum, value, axis) => sum + value * across[axis], 0) / acrossLength,
        relative.reduce((sum, value, axis) => sum + value * along[axis], 0),
        isEnd ? 1 : 0, texture === "particle-board" ? -1 : plyThickness,
      );
    }
    for (let i = 1; i < corners.length - 1; i++) indices.push(offset, offset + i, offset + i + 1);
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    grain: new Float32Array(grain),
    indices: positions.length / 3 > 65536 ? new Uint32Array(indices) : new Uint16Array(indices),
  };
}

function extrudeFootprint(footprint, bottomHeight, height, color, grain, triangulate = false) {
  // +X is East, +Y is Up, and -Z is North.
  const bottom = footprint.map(([east, north]) => [east, bottomHeight, -north]);
  const top = footprint.map(([east, north]) => [east, bottomHeight + height, -north]);
  const triangles = triangulate ? triangulateProfile(footprint) : null;
  const faces = triangles ? [
    ...triangles.map(indices => indices.map(i => top[i])),
    ...triangles.map(indices => indices.map(i => bottom[i]).reverse()),
  ] : [top, [...bottom].reverse()];
  if (triangles) {
    grain = { ...grain, endFaces: grain.endFaces.flatMap(face => face < 2
      ? triangles.map((_, i) => face * triangles.length + i)
      : [face + faces.length - 2]) };
  }
  for (let i = 0; i < footprint.length; i++) {
    const next = (i + 1) % footprint.length;
    faces.push([bottom[i], bottom[next], top[next], top[i]]);
  }
  return geometryFromFaces(faces, color, grain);
}

function footprintGrain(footprint, lengthEdge) {
  const start = footprint[lengthEdge], end = footprint[(lengthEdge + 1) % footprint.length];
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const direction = [(end[0] - start[0]) / length, 0, -(end[1] - start[1]) / length];
  return {
    direction,
    endFaces: footprint.length === 4 ? lengthEdge % 2 === 0 ? [3, 5] : [2, 4]
      : footprint.flatMap((point, i) => {
        const next = footprint[(i + 1) % footprint.length];
        const along = (next[0] - point[0]) * direction[0] - (next[1] - point[1]) * direction[2];
        const across = (next[0] - point[0]) * direction[2] + (next[1] - point[1]) * direction[0];
        return Math.abs(across) > Math.abs(along) ? [i + 2] : [];
      }),
  };
}

function footprintStockAxes(board, flat) {
  const x = footprintGrain(board.footprint, board.lengthEdge ?? 0).direction;
  return flat
    ? [x, [0, 1, 0], [-x[2], 0, x[0]]]
    : [x, [x[2], 0, -x[0]], [0, 1, 0]];
}

function stockAlignedGeometry(board) {
  const geometry = board.createGeometry();
  const axes = board.getStockAxes();
  const start = board.footprint[board.lengthEdge ?? 0];
  const origin = [start[0], board.bottomHeight, -start[1]];
  const blank = board.getBlankShape();
  const minimum = axes.map((_, axis) => Math.min(...blank.vertices.map(point => point[axis])));
  const positions = new Float32Array(geometry.positions.length);
  const normals = new Float32Array(geometry.normals.length);
  for (let i = 0; i < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      positions[i + axis] = axes[axis].reduce((sum, value, j) =>
        sum + value * (geometry.positions[i + j] - origin[j]), 0) - minimum[axis];
      normals[i + axis] = axes[axis].reduce((sum, value, j) =>
        sum + value * geometry.normals[i + j], 0);
    }
  }
  return { ...geometry, positions, normals };
}

function placeStockGeometry(board, geometry) {
  const axes = board.getStockAxes(), start = board.footprint[board.lengthEdge ?? 0];
  const origin = [start[0], board.bottomHeight, -start[1]];
  const minimum = [0, 1, 2].map(axis =>
    Math.min(...board.getBlankShape().vertices.map(point => point[axis])));
  for (let i = 0; i < geometry.positions.length; i += 3) {
    const position = geometry.positions.slice(i, i + 3), normal = geometry.normals.slice(i, i + 3);
    for (let axis = 0; axis < 3; axis++) {
      geometry.positions[i + axis] = origin[axis] + axes.reduce((sum, vector, j) =>
        sum + vector[axis] * (position[j] + minimum[j]), 0);
      geometry.normals[i + axis] = axes.reduce((sum, vector, j) => sum + vector[axis] * normal[j], 0);
    }

  }
  return geometry;
}

function footprintPlacement(board) {
  const axes = board.getStockAxes(), start = board.footprint[board.lengthEdge ?? 0];
  const blank = board.getBlankShape();
  const minimum = axes.map((_, axis) => Math.min(...blank.vertices.map(point => point[axis])));
  const origin = [start[0], board.bottomHeight, -start[1]].map((value, i) =>
    value + axes.reduce((sum, axis, j) => sum + axis[i] * minimum[j], 0));
  return placementMatrix(axes, origin);
}

export function combineGeometries(geometries) {
  const positions = [], normals = [], colors = [], grain = [], indices = [];
  for (const geometry of geometries) {
    const offset = positions.length / 3;
    for (const value of geometry.positions) positions.push(value);
    for (const value of geometry.normals) normals.push(value);
    for (const value of geometry.colors) colors.push(value);
    for (const value of geometry.grain) grain.push(value);
    for (const index of geometry.indices) indices.push(offset + index);
  }
  const IndexArray = positions.length / 3 > 65536 ? Uint32Array : Uint16Array;
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    grain: new Float32Array(grain),
    indices: new IndexArray(indices),
  };
}

let castleGeometry;

function createCastleGeometry() {
  if (!castleGeometry) {
    const footprint = tessellateOutline([{
      type: "arc", center: [0, 0], radius: INNER_RADIUS, startAngle: 0, sweepRadians: Math.PI * 2,
    }]);
    castleGeometry = extrudeFootprint(footprint, 0, TOTAL_HEIGHT, [0.5, 0.5, 0.5],
      { direction: [0, 1, 0], endFaces: [], solidColor: true });
  }
  return castleGeometry;
}

let casterGeometry;

function createCasterGeometry() {
  const { wheelDiameter, wheelWidth, plateLength, plateWidth, height } = CASTER_DIMENSIONS;
  // Unspecified hardware dimensions are illustrative, not clearance measurements.
  const radius = wheelDiameter / 2, tireDepth = 0.25, axleOffset = -0.55;
  const plateThickness = 0.12, swivelHeight = 0.30, forkThickness = 0.12;
  const metal = [0.67, 0.70, 0.74], red = [0.8, 0.12, 0.08];
  const segments = 24;
  const prism = (profile, low, high) => {
    const front = profile.map(([y, z]) => [low, y, z]);
    const back = profile.map(([y, z]) => [high, y, z]);
    return [[...front].reverse(), back, ...front.map((point, i) => {
      const next = (i + 1) % front.length;
      return [point, front[next], back[next], back[i]];
    })];
  };
  const circle = (r, y = 0, z = 0) => Array.from({ length: segments }, (_, i) => {
    const angle = i * Math.PI * 2 / segments;
    return [y + r * Math.cos(angle), z + r * Math.sin(angle)];
  });
  const plateBottom = height - plateThickness, forkTop = plateBottom - swivelHeight;
  const metalFaces = [
    ...prism([[plateBottom, -plateLength / 2], [height, -plateLength / 2],
      [height, plateLength / 2], [plateBottom, plateLength / 2]], -plateWidth / 2, plateWidth / 2),
    ...prism(circle(0.9), forkTop, plateBottom).map(face => face.map(([x, y, z]) => [-y, x, z])),
    ...prism(circle(radius - tireDepth, radius, axleOffset), -wheelWidth * 0.36, wheelWidth * 0.36),
    ...prism(circle(0.18, radius, axleOffset), -0.95, 0.95),
  ];
  const forkProfile = [[radius, axleOffset - 0.45], [forkTop, -1], [forkTop, 0.55],
    [radius, axleOffset + 0.45], ...Array.from({ length: 7 }, (_, i) => {
      const angle = (i + 1) * Math.PI / 8;
      return [radius - 0.45 * Math.sin(angle), axleOffset + 0.45 * Math.cos(angle)];
    })];
  for (const side of [-1, 1]) {
    const center = side * (wheelWidth / 2 + 0.15);
    metalFaces.push(...prism(forkProfile, center - forkThickness / 2, center + forkThickness / 2));
  }
  const tireProfile = [[-wheelWidth / 2, radius], [wheelWidth / 2, radius],
    [wheelWidth / 2, radius - tireDepth], [-wheelWidth / 2, radius - tireDepth]];
  const rings = Array.from({ length: segments }, (_, i) => {
    const angle = i * Math.PI * 2 / segments;
    return tireProfile.map(([x, r]) => [x, radius + r * Math.cos(angle), axleOffset + r * Math.sin(angle)]);
  });
  const tireFaces = rings.flatMap((ring, i) => ring.map((point, j) => {
    const nextRing = rings[(i + 1) % segments], next = (j + 1) % ring.length;
    return [point, nextRing[j], nextRing[next], ring[next]];
  }));
  const solid = { direction: [1, 0, 0], endFaces: [], solidColor: true };
  return combineGeometries([
    geometryFromFaces(metalFaces, metal, solid), geometryFromFaces(tireFaces, red, solid),
  ]);
}

export class Caster {
  constructor(east = 0, north = 0, heading = 0) {
    if (![east, north].every(Number.isFinite)) throw new RangeError("Caster position must be finite inches.");
    if (!Number.isFinite(heading)) throw new RangeError("Caster heading must be finite radians.");
    this.east = east;
    this.north = north;
    this.heading = heading;
    this.partKind = "hardware";
  }

  getPartDescription() {
    const { height, wheelDiameter, wheelWidth, plateLength, plateWidth } = CASTER_DIMENSIONS;
    return {
      kind: "hardware",
      productKey: "cwfutureparts-swivel-3in-b0gm477q4m",
      category: "Casters",
      productName: "CWfutureparts 3-inch swivel caster",
      productUrl: "https://www.amazon.com/dp/B0GM477Q4M",
      summary: "Red flat-tread polyurethane-on-cast-iron, plate-mounted swivel caster; the four-caster set includes two brakes.",
      specifications: [
        `Modeled installed height: ${height} in. Wheel diameter: ${wheelDiameter} in. Tread width: ${wheelWidth} in.`,
        `Mounting plate: ${plateLength} x ${plateWidth} in. Bolt-hole center spacing: 2.75 x 1.75 in. Slots: 0.44 x 0.33 in.`,
        "Advertised capacity: 350 lb per caster; 1,400 lb per four-caster set.",
      ],
      note: `Installed height is rounded to ${height} inches for planning; the reference size guide gives 4.3 inches. Each mounting plate sits directly beneath a flat 2x4 caster beam, with the 3/4-inch plywood base rail on top of the beam. Other dimensions follow the size guide. The 3D model is approximate; bolt holes and brake details are omitted.`,
    };
  }

  createGeometry() {
    const mesh = casterGeometry ??= createCasterGeometry();
    const cosine = Math.cos(this.heading), sine = Math.sin(this.heading);
    const rotate = (values, translate) => values.map((value, i) => {
      const axis = i % 3, start = i - axis;
      return axis === 1 ? value : axis === 0
        ? cosine * value + sine * values[start + 2] + (translate ? this.east : 0)
        : -sine * values[start] + cosine * value - (translate ? this.north : 0);
    });
    return {
      positions: rotate(mesh.positions, true), normals: rotate(mesh.normals, false),
      colors: mesh.colors.slice(), grain: mesh.grain.slice(), indices: mesh.indices.slice(),
    };
  }

  getPlacement() {
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    return placementMatrix([[c, 0, -s], [0, 1, 0], [s, 0, c]], [this.east, 0, -this.north]);
  }

  createDesign() { return { geometry: casterGeometry ??= createCasterGeometry() }; }
}

export class Board {
  constructor({ thickness, width, length, material = PINE, stock }) {
    validateDimensions("Board", { thickness, width, length });
    this.thickness = thickness;
    this.width = width;
    this.length = length;
    this.material = material;
    this.stock = Object.freeze({ ...(stock ?? { kind: "lumber", thickness, width }) });
    if (!["lumber", "plywood"].includes(this.stock.kind)) throw new RangeError("Unknown board stock kind.");
    validateDimensions("Board stock", {
      thickness: this.stock.thickness, ...(this.stock.kind === "lumber" ? { width: this.stock.width } : {}),
    });
    if (this.stock.thickness !== thickness ||
      (this.stock.kind === "lumber" && this.stock.width < width)) {
      throw new RangeError("Board dimensions must fit their source stock.");
    }
  }

  get label() { return "Board"; }
  get color() { return this.material.color; }
  get grain() { return { direction: [1, 0, 0], endFaces: [0, 1], texture: this.material.texture }; }

  getBlankShape() { return rectangularBlank(this.length, this.thickness, this.width); }

  getManufacturingDescription() { return describeBoard(this); }

  getStockAxes() { return [[1, 0, 0], [0, 1, 0], [0, 0, 1]]; }

  getPlacement() {
    return placementMatrix(this.getStockAxes(), [-this.length / 2, -this.thickness / 2, -this.width / 2]);
  }

  createDesign() {
    return { flatGeometry: this.createStockGeometry(), material: this.material,
      volume: this.getMaterialVolume?.() };
  }

  createStockGeometry() {
    const geometry = this.createGeometry();
    const offset = [this.length / 2, this.thickness / 2, this.width / 2];
    return { ...geometry, positions: geometry.positions.map((value, i) => value + offset[i % 3]) };
  }

  createGeometry() {
    const x = this.length / 2, y = this.thickness / 2, z = this.width / 2;
    // X is length, Y is vertical thickness, and Z is width; face winding is outward.
    return geometryFromFaces([
      [[x, -y, -z], [x, y, -z], [x, y, z], [x, -y, z]],
      [[-x, -y, z], [-x, y, z], [-x, y, -z], [-x, -y, -z]],
      [[-x, y, -z], [-x, y, z], [x, y, z], [x, y, -z]],
      [[-x, -y, z], [-x, -y, -z], [x, -y, -z], [x, -y, z]],
      [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]],
      [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]],
    ], this.color, this.grain);
  }
}

export class OneByFour extends Board {
  constructor(length, material = PINE) {
    super({ thickness: FRAME_THICKNESS, width: FRAME_WIDTH, length, material, stock: ONE_BY_FOUR_STOCK });
  }

  get label() { return "1x4"; }
}

function triangulateProfile(points, bridged = false) {
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) -
    (b[1] - a[1]) * (c[0] - a[0]);
  const remaining = points.map((_, i) => i).filter(i => {
    const previous = points[(i + points.length - 1) % points.length];
    return Math.hypot(points[i][0] - previous[0], points[i][1] - previous[1]) > 1e-10;
  }), triangles = [];
  while (remaining.length > 3) {
    const ear = remaining.findIndex((index, i) => {
      const previous = remaining[(i + remaining.length - 1) % remaining.length];
      const next = remaining[(i + 1) % remaining.length];
      const a = points[previous], b = points[index], c = points[next];
      return cross(a, b, c) > 1e-10 && !remaining.some(other =>
        other !== previous && other !== index && other !== next &&
        (!bridged || ![a, b, c].some(point => Math.hypot(point[0] - points[other][0], point[1] - points[other][1]) < 1e-10)) &&
        cross(a, b, points[other]) >= -1e-10 &&
        cross(b, c, points[other]) >= -1e-10 &&
        cross(c, a, points[other]) >= -1e-10);
    });
    if (ear < 0) throw new RangeError("Notched board profile cannot be triangulated.");
    triangles.push([remaining[(ear + remaining.length - 1) % remaining.length],
      remaining[ear], remaining[(ear + 1) % remaining.length]]);
    remaining.splice(ear, 1);
  }
  triangles.push(remaining);
  if (bridged) {
    // Delaunay flips remove thin internal ears without changing any cut boundary.
    const canonical = points.map(point => points.findIndex(other =>
      Math.hypot(point[0] - other[0], point[1] - other[1]) < 1e-10));
    for (;;) {
      const edges = new Map();
      let flipped = false;
      for (const [index, triangle] of triangles.entries()) {
        for (let i = 0; i < 3; i++) {
          const [a, b, c] = [triangle[i], triangle[(i + 1) % 3], triangle[(i + 2) % 3]];
          const key = [canonical[a], canonical[b]].sort((x, y) => x - y).join(",");
          const other = edges.get(key);
          if (!other) { edges.set(key, { index, c }); continue; }
          const d = other.c;
          if (cross(points[c], points[a], points[d]) <= 1e-10 ||
            cross(points[c], points[d], points[b]) <= 1e-10) continue;
          const [u, v, w] = [a, b, c].map(vertex => points[vertex].map((value, axis) => value - points[d][axis]));
          const determinant = (u[0] ** 2 + u[1] ** 2) * (v[0] * w[1] - v[1] * w[0]) -
            (v[0] ** 2 + v[1] ** 2) * (u[0] * w[1] - u[1] * w[0]) +
            (w[0] ** 2 + w[1] ** 2) * (u[0] * v[1] - u[1] * v[0]);
          if (determinant <= 1e-8) continue;
          triangles[index] = [c, a, d];
          triangles[other.index] = [c, d, b];
          flipped = true;
          break;
        }
        if (flipped) break;
      }
      if (!flipped) break;
    }
  }
  return triangles;
}

function notchProfile([start, end, near, far], notches, face) {
  if (notches.startNear?.depth[face] >= far - near - 1e-10) {
    start += notches.startNear.lengths?.[face] ?? notches.startNear.length;
    notches = { ...notches, startNear: undefined };
  }
  if (notches.endNear?.depth[face] >= far - near - 1e-10) {
    end -= notches.endNear.lengths?.[face] ?? notches.endNear.length;
    notches = { ...notches, endNear: undefined };
  }
  if (notches.startFar?.depth[face] >= far - near - 1e-10) {
    start += notches.startFar.lengths?.[face] ?? notches.startFar.length;
    notches = { ...notches, startFar: undefined };
  }
  if (notches.endFar?.depth[face] >= far - near - 1e-10) {
    end -= notches.endFar.lengths?.[face] ?? notches.endFar.length;
    notches = { ...notches, endFar: undefined };
  }
  return ["startNear", "endNear", "endFar", "startFar"].flatMap((name, corner) => {
    const notch = notches[name];
    const [cx, cz] = [[start, near], [end, near], [end, far], [start, far]][corner];
    if (!notch) return [[cx, cz]];
    const length = notch.lengths?.[face] ?? notch.length;
    const dx = corner === 0 || corner === 3 ? length : -length;
    const dz = corner < 2 ? notch.depth[face] : -notch.depth[face];
    return corner % 2 === 0
      ? [[cx, cz + dz], [cx + dx, cz + dz], [cx + dx, cz]]
      : [[cx + dx, cz], [cx + dx, cz + dz], [cx, cz + dz]];
  });
}

function geometryFromProfiles(profiles, facePositions, color, grain, endEdges = null) {
  const faces = [], endFaces = [];
  for (const [face, profile] of profiles.entries()) {
    for (const triangle of triangulateProfile(profile)) {
      const corners = triangle.map(index => [profile[index][0], facePositions[face], profile[index][1]]);
      faces.push(face === 0 ? corners : corners.reverse());
    }
  }
  for (let i = 0; i < profiles[0].length; i++) {
    const next = (i + 1) % profiles[0].length;
    const a = profiles[0][i], b = profiles[0][next];
    const c = profiles[1][i], d = profiles[1][next];
    const corners = [
      [a[0], facePositions[0], a[1]], [c[0], facePositions[1], c[1]],
      [d[0], facePositions[1], d[1]], [b[0], facePositions[0], b[1]],
    ];
    const polygon = corners.filter((point, index) => {
      const previous = corners[(index + corners.length - 1) % corners.length];
      return Math.hypot(...point.map((value, axis) => value - previous[axis])) > 1e-10;
    });
    if (polygon.length < 3) continue;
    if (endEdges ? endEdges.includes(i) : Math.abs(a[0] - b[0]) < 1e-10) endFaces.push(faces.length);
    faces.push(polygon);
  }
  return geometryFromFaces(faces, color, { ...grain, endFaces });
}

export class NotchedBoard extends Board {
  constructor(dimensions, notches = {}, dados = [], rebates = dimensions.rebates ?? []) {
    super(dimensions);
    // Retain the original placement frame when a width rip moves either edge.
    this.widthBounds = dimensions instanceof NotchedBoard
      ? dimensions.widthBounds.map(bounds => [...bounds])
      : [[-this.width / 2, this.width / 2], [-this.width / 2, this.width / 2]];
    const names = ["startNear", "endNear", "endFar", "startFar"];
    if (!notches || typeof notches !== "object" || Array.isArray(notches) ||
      Object.keys(notches).some(name => !names.includes(name))) {
      throw new RangeError("Notched board accepts only startNear, endNear, endFar, and startFar notches.");
    }
    this.notches = {};
    for (const [name, notch] of Object.entries(notches)) {
      const depth = Array.isArray(notch?.depth) ? [...notch.depth] : [notch?.depth, notch?.depth];
      if (!Number.isFinite(notch?.length) || notch.length <= 0 || notch.length >= this.length ||
        depth.length !== 2 || depth.every(value => value === 0) ||
        depth.some((value, face) => !Number.isFinite(value) || value < 0 ||
          (value === 0 && !(dimensions instanceof NotchedBoard)) ||
          value >= this.widthBounds[face][1] - this.widthBounds[face][0])) {
        throw new RangeError("Notch length and both depths must be positive and smaller than the stock dimensions.");
      }
      this.notches[name] = { length: notch.length, depth };
    }
    for (const [a, b] of [["startNear", "endNear"], ["startFar", "endFar"]]) {
      const start = this.notches[a], end = this.notches[b];
      if (!start || !end) continue;
      if (start.length + end.length > this.length + 1e-10 &&
        start.depth.some((value, face) => Math.abs(value - end.depth[face]) > 1e-10)) {
        throw new RangeError("Overlapping notches on the same width edge must share a cut plane.");
      }
      if (Math.abs(start.length + end.length - this.length) < 1e-10 &&
        (start.depth[0] - end.depth[0]) * (start.depth[1] - end.depth[1]) < -1e-10) {
        throw new RangeError("Meeting beveled notches must not cross through the stock thickness.");
      }
    }
    for (const near of ["startNear", "endNear"]) {
      for (const far of ["startFar", "endFar"]) {
        const a = this.notches[near], b = this.notches[far];
        if (a && b && (near.startsWith("start") === far.startsWith("start") ||
          a.length + b.length >= this.length - 1e-10) &&
          a.depth.some((value, face) =>
            value + b.depth[face] >= this.widthBounds[face][1] - this.widthBounds[face][0])) {
          throw new RangeError("Opposing notches must leave a connected strip of wood.");
        }
      }
    }
    for (const edge of ["Near", "Far"]) {
      const start = this.notches[`start${edge}`], end = this.notches[`end${edge}`];
      if (!start || !end || start.length + end.length < this.length - 1e-10) continue;
      const rip = start.depth.map((depth, face) => Math.min(depth, end.depth[face]));
      for (const [face, bounds] of this.widthBounds.entries()) {
        if (edge === "Near") bounds[0] += rip[face];
        else bounds[1] -= rip[face];
      }
      for (const corner of [`start${edge}`, `end${edge}`]) {
        const notch = this.notches[corner];
        notch.depth = notch.depth.map((depth, face) => Math.max(0, depth - rip[face]));
        if (notch.depth.every(depth => depth < 1e-10)) delete this.notches[corner];
      }
    }
    this.width = Math.max(...this.widthBounds.map(bounds => bounds[1])) -
      Math.min(...this.widthBounds.map(bounds => bounds[0]));
    if (!Array.isArray(rebates)) throw new RangeError("Board rebates must be an array.");
    this.rebates = rebates.map(rebate => {
      if (!rebate || !names.includes(rebate.corner) ||
        !Number.isFinite(rebate.length) || rebate.length <= 0 || rebate.length > this.length ||
        !Array.isArray(rebate.depth) || rebate.depth.length !== 2 ||
        rebate.depth.every(depth => depth === 0) ||
        rebate.depth.some((depth, face) => !Number.isFinite(depth) || depth < 0 ||
          depth >= this.widthBounds[face][1] - this.widthBounds[face][0])) {
        throw new RangeError("A rebate requires a stock corner, an in-stock length, and two depths smaller than stock width.");
      }
      return { corner: rebate.corner, length: rebate.length, depth: [...rebate.depth] };
    });
    const edgeCuts = [...Object.entries(this.notches).map(([corner, cut]) => ({ corner, ...cut })), ...this.rebates];
    for (const [i, a] of edgeCuts.entries()) {
      for (const b of edgeCuts.slice(i + 1)) {
        if (a.corner.startsWith("start") !== b.corner.startsWith("start") &&
          a.length + b.length < this.length) continue;
        if (a.corner.endsWith("Near") !== b.corner.endsWith("Near")) {
          if (a.depth.some((depth, face) =>
            depth + b.depth[face] >= this.widthBounds[face][1] - this.widthBounds[face][0])) {
            throw new RangeError("Opposing edge cuts must leave a connected strip of wood.");
          }
        } else if ((a.depth[0] - b.depth[0]) * (a.depth[1] - b.depth[1]) < -1e-10) {
          throw new RangeError("Overlapping edge cuts must not cross through the stock thickness.");
        }
      }
    }
    if (!Array.isArray(dados)) throw new RangeError("Board dados must be an array.");
    this.dados = dados.map(dado => {
      if (!dado || !["negativeY", "positiveY"].includes(dado.face) ||
        !Number.isFinite(dado.start) || dado.start < 0 ||
        !Number.isFinite(dado.width) || dado.width <= 0 || dado.start + dado.width > this.length ||
        !Number.isFinite(dado.depth) || dado.depth <= 0 || dado.depth >= this.thickness) {
        throw new RangeError("A dado requires a broad face, an in-stock length interval, and a depth smaller than stock thickness.");
      }
      return { face: dado.face, start: dado.start, width: dado.width, depth: dado.depth };
    });
    for (const [i, a] of this.dados.entries()) {
      for (const b of this.dados.slice(i + 1)) {
        const overlap = Math.min(a.start + a.width, b.start + b.width) - Math.max(a.start, b.start);
        if (a.face === b.face && overlap > 1e-10) {
          throw new RangeError("Dados on the same broad face must not overlap.");
        }
        if (a.face !== b.face && overlap >= -1e-10 && a.depth + b.depth >= this.thickness) {
          throw new RangeError("Opposing dados must leave a connected thickness of wood.");
        }
      }
    }
  }

  getBlankShape() {
    const blank = rectangularBlank(this.length, this.thickness, this.width);
    const minimum = Math.min(...this.widthBounds.map(bounds => bounds[0]));
    blank.vertices = blank.vertices.map(([x, y, z]) => [
      x, y, this.widthBounds[y ? 1 : 0][z ? 1 : 0] - minimum,
    ]);
    return blank;
  }

  createStockGeometry() {
    const geometry = this.createGeometry();
    const offset = [this.length / 2, this.thickness / 2,
      -Math.min(...this.widthBounds.map(bounds => bounds[0]))];
    return { ...geometry, positions: geometry.positions.map((value, i) => value + offset[i % 3]) };
  }

  getPlacement() {
    return placementMatrix(this.getStockAxes(), [-this.length / 2, -this.thickness / 2,
      Math.min(...this.widthBounds.map(bounds => bounds[0]))]);
  }

  createGeometry() {
    if (this.dados.length > 0 || this.rebates.length > 0) return this.createCutGeometry();
    if (Object.keys(this.notches).length === 0 &&
      this.widthBounds.every(([near, far]) => near === -this.width / 2 && far === this.width / 2)) {
      return super.createGeometry();
    }
    const x = this.length / 2, y = this.thickness / 2;
    const profiles = this.widthBounds.map(([near, far], face) =>
      notchProfile([-x, x, near, far], this.notches, face));
    return geometryFromProfiles(profiles, [-y, y], this.color, {
      ...this.grain, origin: [-x, -y, Math.min(...this.widthBounds.map(bounds => bounds[0]))],
    });
  }

  createCutGeometry() {
    const x = this.length / 2, y = this.thickness / 2;
    const cuts = [...Object.entries(this.notches),
      ...this.rebates.map(({ corner, ...cut }) => [corner, cut])];
    const unique = values => values.sort((a, b) => a - b)
      .filter((value, i, sorted) => i === 0 || value - sorted[i - 1] > 1e-10);
    const xs = unique([-x, x, ...cuts.map(([name, cut]) =>
      name.startsWith("start") ? -x + cut.length : x - cut.length),
    ...this.dados.flatMap(dado => [-x + dado.start, -x + dado.start + dado.width])]);
    const ys = unique([-y, y, ...this.dados.map(dado =>
      dado.face === "negativeY" ? -y + dado.depth : y - dado.depth)]);
    const cells = xs.slice(1).map((right, i) => ys.slice(1).map((top, j) => {
      const middleX = (xs[i] + right) / 2, middleY = (ys[j] + top) / 2;
      if (this.dados.some(dado => middleX > -x + dado.start &&
        middleX < -x + dado.start + dado.width &&
        (dado.face === "negativeY" ? middleY < -y + dado.depth : middleY > y - dado.depth))) {
        return null;
      }
      const active = cuts.filter(([name, cut]) =>
        name.startsWith("start") ? middleX < -x + cut.length : middleX > x - cut.length);
      return [ys[j], top].map(thickness => {
        const depth = cut => cut.depth[0] + (cut.depth[1] - cut.depth[0]) *
          (thickness + y) / this.thickness;
        const bounds = this.widthBounds[0].map((value, edge) =>
          value + (this.widthBounds[1][edge] - value) * (thickness + y) / this.thickness);
        return [
          bounds[0] + Math.max(0, ...active.filter(([name]) => name.endsWith("Near")).map(([, cut]) => depth(cut))),
          bounds[1] - Math.max(0, ...active.filter(([name]) => name.endsWith("Far")).map(([, cut]) => depth(cut))),
        ];
      });
    }));
    const faces = [];
    function cap(east, bottom, top, lower, upper, reverse) {
      const corners = [[east, bottom, lower[0]], [east, bottom, lower[1]],
        [east, top, upper[1]], [east, top, upper[0]]];
      const face = corners.filter((point, i) => {
        const previous = corners[(i + corners.length - 1) % corners.length];
        return Math.hypot(...point.map((value, axis) => value - previous[axis])) > 1e-10;
      });
      if (face.length >= 3) faces.push(reverse ? face.reverse() : face);
    }
    for (const [i, column] of cells.entries()) {
      for (const [j, cell] of column.entries()) {
        if (!cell) continue;
        const [left, right] = [xs[i], xs[i + 1]], [bottom, top] = [ys[j], ys[j + 1]];
        const [lower, upper] = cell;
        faces.push(
          [[left, bottom, lower[0]], [left, top, upper[0]], [right, top, upper[0]], [right, bottom, lower[0]]],
          [[left, bottom, lower[1]], [right, bottom, lower[1]], [right, top, upper[1]], [left, top, upper[1]]],
        );
        if (!column[j - 1]) {
          faces.push([[left, bottom, lower[0]], [right, bottom, lower[0]],
            [right, bottom, lower[1]], [left, bottom, lower[1]]]);
        }
        if (!column[j + 1]) {
          faces.push([[left, top, upper[0]], [left, top, upper[1]],
            [right, top, upper[1]], [right, top, upper[0]]]);
        }
        for (const [neighbor, east, reverse] of [
          [cells[i - 1]?.[j], left, false], [cells[i + 1]?.[j], right, true],
        ]) {
          if (!neighbor) {
            cap(east, bottom, top, lower, upper, reverse);
          } else {
            if (neighbor[0][0] > lower[0] + 1e-10 || neighbor[1][0] > upper[0] + 1e-10) {
              cap(east, bottom, top, [lower[0], neighbor[0][0]], [upper[0], neighbor[1][0]], reverse);
            }
            if (neighbor[0][1] < lower[1] - 1e-10 || neighbor[1][1] < upper[1] - 1e-10) {
              cap(east, bottom, top, [neighbor[0][1], lower[1]], [neighbor[1][1], upper[1]], reverse);
            }
          }
        }
      }
    }
    // Split shared edges before triangulating so adjacent cut faces have no T-junctions.
    const vertices = [...new Map(faces.flat().map(point => [point.join(","), point])).values()];
    const triangles = faces.flatMap(face => {
      const center = [0, 1, 2].map(axis => face.reduce((sum, point) => sum + point[axis], 0) / face.length);
      const boundary = face.flatMap((start, i) => {
        const end = face[(i + 1) % face.length], edge = end.map((value, axis) => value - start[axis]);
        const squaredLength = edge.reduce((sum, value) => sum + value * value, 0);
        return vertices.map(point => {
          const t = point.reduce((sum, value, axis) => sum + (value - start[axis]) * edge[axis], 0) / squaredLength;
          return { point, t };
        }).filter(({ point, t }) => t >= 0 && t < 1 - 1e-10 &&
          Math.hypot(...point.map((value, axis) => value - start[axis] - t * edge[axis])) < 1e-10)
          .sort((a, b) => a.t - b.t).map(({ point }) => point);
      });
      return boundary.map((point, i) => [center, point, boundary[(i + 1) % boundary.length]]);
    });
    const endFaces = triangles.flatMap((face, i) =>
      face.every(point => Math.abs(point[0] - face[0][0]) < 1e-10) ? [i] : []);
    return geometryFromFaces(triangles, this.color, {
      ...this.grain, endFaces, endDirection: [0, 1, 0],
      origin: [-x, -y, Math.min(...this.widthBounds.map(bounds => bounds[0]))],
    });
  }
}

class FrameBoard extends Board {
  constructor(footprint, dimensions, bottomHeight = FLOOR_CLEARANCE, lengthEdge = 0) {
    super({ ...dimensions, stock: dimensions.stock ?? ONE_BY_FOUR_STOCK });
    this.footprint = footprint;
    this.bottomHeight = bottomHeight;
    this.lengthEdge = lengthEdge;
    this.notches = {};
  }

  get grain() { return { ...super.grain, ...footprintGrain(this.footprint, this.lengthEdge) }; }

  getBlankShape() { return prismaticBlank(this.footprint, this.width, this.lengthEdge); }

  getStockAxes() { return footprintStockAxes(this, false); }

  getPlacement() { return footprintPlacement(this); }

  createStockGeometry() { return stockAlignedGeometry(this); }

  notchTop(corner, boundary, height) {
    if (!["startFar", "endFar"].includes(corner) || !Number.isFinite(height)) {
      throw new RangeError("A frame-board top notch requires a start/end corner and a finite cut height.");
    }
    this.notchEdge(corner, boundary, height);
  }

  notchBottom(corner, boundary, height) {
    if (!["startNear", "endNear"].includes(corner) || !Number.isFinite(height)) {
      throw new RangeError("A frame-board bottom notch requires a start/end corner and a finite cut height.");
    }
    this.notchEdge(corner, boundary, height);
  }

  notchEdge(corner, boundary, height) {
    const depth = Math.min(this.width, corner.endsWith("Far")
      ? this.bottomHeight + this.width - height : height - this.bottomHeight);
    if (depth <= 0) return;
    const axes = this.getStockAxes(), origin = this.footprint[this.lengthEdge];
    const { vertices } = this.getBlankShape();
    const minimumY = Math.min(...vertices.map(point => point[1]));
    const normal = [boundary[1][1] - boundary[0][1], boundary[0][0] - boundary[1][0]];
    const offset = boundary[0][0] * normal[0] + boundary[0][1] * normal[1];
    const lengths = [0, 1].map(face => {
      const y = minimumY + face * this.thickness;
      const xs = vertices.filter(point => Math.abs(point[1] - y) < 1e-8).map(point => point[0]);
      const ends = [Math.min(...xs), Math.max(...xs)].map(x => [
        origin[0] + axes[0][0] * x + axes[1][0] * y,
        origin[1] - axes[0][2] * x - axes[1][2] * y,
      ]);
      const shoulder = pointAtOffset(...ends, normal, offset);
      const end = ends[corner.startsWith("start") ? 0 : 1];
      const length = Math.hypot(shoulder[0] - end[0], shoulder[1] - end[1]);
      const parameter = (shoulder[0] - ends[0][0]) * axes[0][0] -
        (shoulder[1] - ends[0][1]) * axes[0][2];
      if (!Number.isFinite(length) || parameter <= 0 || parameter >= Math.max(...xs) - Math.min(...xs)) {
        throw new RangeError("A frame-board notch shoulder must lie inside both broad faces.");
      }
      return length;
    });
    this.notches[corner] = { length: Math.max(...lengths), lengths, depth: [depth, depth] };
  }

  createGeometry() {
    if (Object.keys(this.notches).length) {
      const blank = this.getManufacturingDescription().blank;
      const profiles = ["negativeY", "positiveY"].map((name, face) => {
        const xs = blank.profiles[name].map(point => point[0]);
        return notchProfile([Math.min(...xs), Math.max(...xs), 0, this.width], this.notches, face);
      });
      const geometry = geometryFromProfiles(profiles, [0, this.thickness], this.color, {
        ...this.grain, direction: [1, 0, 0], origin: [0, 0, 0],
        ...(this.stock.kind === "plywood" ? { plyDirection: [0, 1, 0], plyThickness: this.thickness / 3 } : {}),
      }, this.stock.kind === "plywood" ? profiles[0].map((_, i) => i) : null);
      return placeStockGeometry(this, geometry);
    }
    return extrudeFootprint(this.footprint, this.bottomHeight, this.width, this.color, this.grain);
  }
}

function createSupportBeams(steps, firstModule) {
  const angle = steps[0].angle, halfAngle = steps.length * angle / 2;
  const cosine = Math.cos(halfAngle), sine = Math.sin(halfAngle);
  const heading = halfAngle;
  const headingCosine = Math.cos(heading), headingSine = Math.sin(heading);
  const width = FRAME_WIDTH;
  const frontSetback = firstModule ? RISER_THICKNESS + FRAME_THICKNESS : 0;
  const obstacles = steps.flatMap((step, index) => {
    const rotation = index * angle - heading, c = Math.cos(rotation), s = Math.sin(rotation);
    return [["leftBoundary", { footprint: [step.footprint[0], step.footprint[3]] }],
      ["rightBoundary", { footprint: [step.footprint[1], step.footprint[2]] }],
      ...[["leftFrontSupport", step.parts.topFrame.boards.frontStepLeftSupport],
        ["rightFrontSupport", step.parts.topFrame.boards.frontStepRightSupport],
        ["rightUpright", step.parts.uprights.boards.rightUpright],
        ["rightUpright", step.parts.uprights.boards.rightRearUpright]].filter(([, board]) => board)]
      .map(([name, board]) => {
        let footprint = board.footprint;
        if (name === "rightUpright") {
          const [inner, outer] = footprint;
          const length = Math.hypot(outer[0] - inner[0], outer[1] - inner[1]);
          const outward = outer.map((value, axis) => (value - inner[axis]) / length);
          // The bottom-open notch removes the inward half inch throughout the beam's height.
          footprint = clipFootprint(finishedFootprint(board), outward,
            inner[0] * outward[0] + inner[1] * outward[1] + SUPPORT_NOTCH_DEPTH);
        }
        return { name, footprint: footprint.map(([east, north]) =>
          [c * (east + INNER_RADIUS) - s * north, s * (east + INNER_RADIUS) + c * north]) };
      });
  });
  const left = Math.max(INNER_RADIUS, ...obstacles.filter(board => board.name.startsWith("left"))
    .flatMap(board => board.footprint.map(point => point[0])));
  // The outer end corners sit farther from the radii than the inner corners.
  const rightInset = frontSetback + width * sine;
  const right = Math.min(...obstacles.filter(board => board.name.startsWith("right") && board.name !== "rightUpright")
    .flatMap(board => clipFootprint(clipFootprint(board.footprint, [sine, cosine], rightInset),
      [sine, -cosine], width * sine).map(point => point[0])));
  const beam = (name, across) => {
    const end = across * sine / cosine;
    const front = (frontSetback - across * sine) / cosine;
    const length = Math.floor(end - front + 1e-9);
    const trim = Math.max(0, end - front - length);
    const frontTrim = firstModule ? trim / 2 : 0;
    const backTrim = trim - frontTrim;
    const footprint = [
      [across + width, front + frontTrim], [across + width, end - backTrim],
      [across, end - backTrim], [across, front + frontTrim],
    ].map(([x, y]) => [headingCosine * x - headingSine * y - INNER_RADIUS,
      headingSine * x + headingCosine * y]);
    const board = new FlatFrameBoard(footprint, {
      thickness: SUPPORT_BEAM_THICKNESS, width, length, material: PINE,
      stock: { kind: "lumber", nominalSize: "2x4", thickness: SUPPORT_BEAM_THICKNESS, width },
    }, SUPPORT_BEAM_BOTTOM_HEIGHT);
    board.name = name;
    return board;
  };
  const frame = firstModule ? newelPlanFrame(steps[0].parts.newel) : null;
  const innerCorner = firstModule ? pointAtNorth(frame.place([-TWO_BY_FOUR_STOCK.thickness, 0]),
    frame.place([-TWO_BY_FOUR_STOCK.thickness, 1]), RISER_THICKNESS + TWO_BY_FOUR_STOCK.thickness) : null;
  const rightAcross = firstModule
    ? (innerCorner[0] + INNER_RADIUS) * cosine + innerCorner[1] * sine - width
    : right - width - 3 / 4;
  const uprightLimit = Math.min(...obstacles.filter(board => board.name === "rightUpright")
    .flatMap(board => board.footprint.map(point => point[0])));
  const boards = {
    leftSupportBeam: beam("Beam - caster left", left),
    rightSupportBeam: beam("Beam - caster right", Math.min(rightAcross, uprightLimit - width)),
  };
  return boards;
}

function placeVerticalStockGeometry(board, geometry, bottomHeight) {
  const [, thicknessAxis, widthAxis] = board.getStockAxes();
  const across = [thicknessAxis[0], -thicknessAxis[2]];
  const along = [widthAxis[0], -widthAxis[2]];
  for (let i = 0; i < geometry.positions.length; i += 3) {
    const height = geometry.positions[i] + board.length / 2 + bottomHeight;
    const thickness = geometry.positions[i + 1] + board.thickness / 2;
    const width = geometry.positions[i + 2] + board.width / 2;
    geometry.positions.set([
      board.footprint[0][0] + across[0] * thickness + along[0] * width, height,
      -(board.footprint[0][1] + across[1] * thickness + along[1] * width),
    ], i);
    const [lengthNormal, thicknessNormal, widthNormal] = geometry.normals.subarray(i, i + 3);
    geometry.normals.set([
      across[0] * thicknessNormal + along[0] * widthNormal, lengthNormal,
      -(across[1] * thicknessNormal + along[1] * widthNormal),
    ], i);
  }
  return geometry;
}

function offsetCorner(corner, toward, inward) {
  const direction = toward.map((value, axis) => value - corner[axis]);
  const projection = direction[0] * inward[0] + direction[1] * inward[1];
  if (projection <= 0 || !Number.isFinite(projection)) {
    throw new RangeError("Cross-piece requires a convex radial footprint.");
  }
  return corner.map((value, axis) => value + direction[axis] * FRAME_THICKNESS / projection);
}

function pointAtNorth(front, back, north) {
  const fraction = (north - front[1]) / (back[1] - front[1]);
  return [front[0] + (back[0] - front[0]) * fraction, north];
}

function pointAtOffset(start, end, normal, offset) {
  const project = point => point[0] * normal[0] + point[1] * normal[1];
  const fraction = (offset - project(start)) / (project(end) - project(start));
  return start.map((value, axis) => value + (end[axis] - value) * fraction);
}

function clipFootprint(polygon, normal, offset) {
  return polygon.flatMap((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    const inside = point[0] * normal[0] + point[1] * normal[1] >= offset;
    const nextInside = next[0] * normal[0] + next[1] * normal[1] >= offset;
    return [
      ...(inside ? [point] : []),
      ...(inside !== nextInside ? [pointAtOffset(point, next, normal, offset)] : []),
    ];
  });
}

function finishedFootprint(board) {
  return board.frontBevel ? clipFootprint(board.footprint, [0, 1], RISER_THICKNESS) : board.footprint;
}

function footprintsOverlap(first, second) {
  const intersection = second.reduce((polygon, start, index) => {
    const end = second[(index + 1) % second.length];
    const normal = [start[1] - end[1], end[0] - start[0]];
    return clipFootprint(polygon, normal, start[0] * normal[0] + start[1] * normal[1]);
  }, first);
  return Math.abs(intersection.reduce((sum, point, index) => {
    const next = intersection[(index + 1) % intersection.length];
    return sum + point[0] * next[1] - point[1] * next[0];
  }, 0)) > 2e-8;
}

function validateFootprints(component, boardFootprints, footprint) {
  for (const corners of boardFootprints) {
    for (const point of corners) {
      for (let i = 0; i < footprint.length; i++) {
        const start = footprint[i], end = footprint[(i + 1) % footprint.length];
        const cross = (end[0] - start[0]) * (point[1] - start[1]) -
          (end[1] - start[1]) * (point[0] - start[0]);
        if (!Number.isFinite(cross) || cross < -1e-8) {
          throw new RangeError(`${component} boards do not fit within the step footprint.`);
        }
      }
    }
  }
}

export class BottomFrame {
  constructor() {
    this.boards = {};
    this.hardware = {};
  }

  createGeometry() {
    return combineGeometries([...Object.values(this.boards), ...Object.values(this.hardware)]
      .map(part => part.createGeometry()));
  }
}

class FlatFrameBoard extends Board {
  constructor(footprint, dimensions, bottomHeight) {
    super(dimensions);
    this.footprint = footprint;
    this.bottomHeight = bottomHeight;
  }

  get label() { return this.stock.nominalSize; }

  get grain() {
    return { ...super.grain, ...footprintGrain(this.cutFootprint ?? this.footprint, 0) };
  }

  get faceCuts() { return describePlanCuts(this); }

  getBlankShape() { return prismaticBlank(this.footprint, this.thickness, 0, true); }

  getStockAxes() { return footprintStockAxes(this, true); }

  getPlacement() { return footprintPlacement(this); }

  createStockGeometry() { return stockAlignedGeometry(this); }

  createGeometry() {
    return extrudeFootprint(this.cutFootprint ?? this.footprint, this.bottomHeight,
      this.thickness, this.color, this.grain, Boolean(this.cutFootprint));
  }
}

function describeSurfaceCut(name, points) {
  const a = points[1].map((value, axis) => value - points[0][axis]);
  const b = points[2].map((value, axis) => value - points[0][axis]);
  let normal = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const magnitude = Math.hypot(...normal);
  if (!Number.isFinite(magnitude) || magnitude <= 1e-10) {
    throw new RangeError("A stock surface cut requires a nondegenerate face.");
  }
  normal = normal.map(value => value / magnitude);
  const axis = normal.reduce((best, value, j) => Math.abs(value) > Math.abs(normal[best]) ? j : best, 0);
  const other = axis === 0 ? 2 : 0;
  const degrees = radians => radians * 180 / Math.PI;
  const angleFromSquare = degrees(Math.acos(Math.min(1, Math.abs(normal[axis]))));
  return {
    name, axis: ["length", "thickness", "width"][axis], points,
    plane: { normal, offset: normal.reduce((sum, value, j) => sum + value * points[0][j], 0) },
    angleFromSquare,
    miterDegrees: axis === 1 ? 0 : degrees(Math.atan2(normal[other], Math.abs(normal[axis]))),
    bevelDegrees: axis === 1 ? angleFromSquare : degrees(Math.atan2(normal[1], Math.hypot(normal[0], normal[2]))),
  };
}

function describePlanCuts(board) {
  if (!board.planCuts?.length) return [];
  const axes = board.getStockAxes(), start = board.footprint[board.lengthEdge ?? 0];
  const minimum = axes.map((_, axis) => Math.min(...board.getBlankShape().vertices.map(point => point[axis])));
  const stockPoint = ([east, north], height) => {
    const relative = [east - start[0], height, start[1] - north];
    return axes.map((vector, axis) =>
      vector.reduce((sum, value, i) => sum + value * relative[i], 0) - minimum[axis]);
  };
  return board.planCuts.map(([front, back], i) =>
    describeSurfaceCut(`Newel cutout face ${i + 1}`, [
      stockPoint(front, 0), stockPoint(back, 0),
      stockPoint(back, board.thickness), stockPoint(front, board.thickness),
    ]));
}

function newelPlanFrame(newel) {
  const origin = newel.footprint[0];
  const across = newel.footprint[1].map((value, axis) => (value - origin[axis]) / newel.thickness);
  const along = [-across[1], across[0]];
  const project = point => [across, along].map(direction =>
    point.reduce((sum, value, axis) => sum + (value - origin[axis]) * direction[axis], 0));
  const place = point => origin.map((value, axis) => value + across[axis] * point[0] + along[axis] * point[1]);
  return { project, place };
}

function notchAroundNewel(board, newel) {
  const { project, place } = newelPlanFrame(newel);
  const [a, b, c, d] = board.footprint.map(project);
  const innerFront = [0, 0], innerBack = [0, newel.width];
  const front = pointAtNorth(b, c, innerFront[1]);
  const backEdge = pointAtOffset(d, c, [1, 0], innerFront[0]);
  const exitsBack = backEdge[1] <= innerBack[1];
  const innerEnd = exitsBack ? backEdge : innerBack;
  const back = pointAtNorth(b, c, innerBack[1]);
  board.cutFootprint = [a, b, front, innerFront, innerEnd, ...(exitsBack ? [] : [back, c]), d].map(place);
  board.planCuts = [[front, innerFront], [innerFront, innerEnd], ...(exitsBack ? [] : [[innerEnd, back]])]
    .map(edge => edge.map(place));
}

class UprightCrossPiece extends FlatFrameBoard {
  constructor(leftUpright, rightUpright, boundary, bottomHeight, rear = false) {
    const recessedFace = (board, face, inset) => {
      const across = board.footprint[1].map((value, axis) =>
        (value - board.footprint[0][axis]) / board.thickness);
      return face.map(index => board.footprint[index].map((value, axis) => value + across[axis] * inset));
    };
    const left = recessedFace(leftUpright, [1, 2], -SUPPORT_NOTCH_DEPTH);
    const right = recessedFace(rightUpright, [0, 3], SUPPORT_NOTCH_DEPTH);
    const edge = boundary[1].map((value, axis) => value - boundary[0][axis]);
    const edgeLength = Math.hypot(...edge), normal = [-edge[1] / edgeLength, edge[0] / edgeLength];
    const offset = boundary[0][0] * normal[0] + boundary[0][1] * normal[1];
    const front = offset - (rear ? FRAME_WIDTH : 0), back = front + FRAME_WIDTH;
    const footprint = [
      pointAtOffset(...left, normal, front), pointAtOffset(...right, normal, front),
      pointAtOffset(...right, normal, back), pointAtOffset(...left, normal, back),
    ];
    super(footprint, { thickness: TWO_BY_FOUR_STOCK.thickness, width: FRAME_WIDTH,
      length: Math.hypot(footprint[1][0] - footprint[0][0], footprint[1][1] - footprint[0][1]), material: PINE,
      stock: TWO_BY_FOUR_STOCK },
    bottomHeight);
  }
}

class SupportCrossPiece extends UprightCrossPiece {
  constructor(step) {
    const { leftUpright, rightUpright, leftRearUpright } = step.parts.uprights.boards;
    const bottomHeight = BASE_RAIL_TOP_HEIGHT;
    const frontFrame = step.parts.topFrame.boards.southCrossPiece;
    const interferes = bottomHeight < frontFrame.bottomHeight + frontFrame.width - 1e-8 &&
      bottomHeight + TWO_BY_FOUR_STOCK.thickness > frontFrame.bottomHeight + 1e-8;
    const boundary = interferes ? frontFrame.footprint.slice(2).reverse()
      : frontFrame.footprint.slice(0, 2);
    super(leftUpright, rightUpright, boundary, bottomHeight);
    this.name = "Beam - cross";
    this.notches = {};
    if (!leftRearUpright) return;
    const axes = this.getStockAxes(), origin = this.footprint[0];
    const minimum = [0, 1, 2].map(axis =>
      Math.min(...this.getBlankShape().vertices.map(point => point[axis])));
    const points = leftRearUpright.footprint.map(([east, north]) => {
      const relative = [east - origin[0], 0, origin[1] - north];
      return axes.map((axis, i) =>
        axis.reduce((sum, value, j) => sum + value * relative[j], 0) - minimum[i]);
    });
    const length = Math.max(...points.map(point => point[0]));
    const depth = Math.max(...points.map(point => point[2]));
    if (depth <= 1e-8) return;
    if (length <= 0 || length >= this.length || depth >= this.width) {
      throw new RangeError("A support cross-piece must retain wood beside its rear-upright notch.");
    }
    this.notches.startNear = { length, depth: [depth, depth] };
    const [frontLeft, backLeft, backRight, frontRight] =
      this.getManufacturingDescription().blank.profiles.negativeY;
    const shoulder = pointAtOffset(frontLeft, backLeft, [0, 1], depth);
    this.cutProfile = [frontLeft, shoulder, [length, depth], [length, backLeft[1]], backRight, frontRight];
  }

  createGeometry() {
    if (!this.cutProfile) return super.createGeometry();
    return placeStockGeometry(this, geometryFromProfiles([this.cutProfile, this.cutProfile],
      [0, this.thickness], this.color, { direction: [1, 0, 0] }, [0, 2, 4]));
  }
}

function addModuleCasters({ steps, boards: beams, startIndex }) {
  const rearAngle = (steps.length - 1) * steps[0].angle;
  const cosine = Math.cos(rearAngle), sine = Math.sin(rearAngle);
  const clearance = 0.125;
  const { plateLength, plateWidth } = CASTER_DIMENSIONS;
  const plateDiagonal = Math.hypot(plateLength, plateWidth);
  const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
  for (const side of ["left", "right"]) {
    const beam = beams[`${side}SupportBeam`], footprint = beam.footprint;
    if (beam.width < plateWidth + 2 * clearance) {
      throw new RangeError("Caster plates do not fit beneath their support beam.");
    }
    const front = footprint[0].map((value, axis) => (value + footprint[3][axis]) / 2);
    const back = footprint[1].map((value, axis) => (value + footprint[2][axis]) / 2);
    const sideLength = Math.hypot(...footprint[1].map((value, axis) => value - footprint[0][axis]));
    const along = footprint[1].map((value, axis) => (value - footprint[0][axis]) / sideLength);
    const heading = Math.atan2(-along[0], along[1]);
    const available = dot(back.map((value, i) => value - front[i]), along);
    // The projected plate width is W*cos(delta) + L*sin(abs(delta)).
    const maxAngle = Math.asin((beam.width - 2 * clearance) / plateDiagonal) -
      Math.atan2(plateWidth, plateLength);
    const range = tangent => {
      let lower = 0, upper = available;
      const limit = (normal, offset) => {
        const slope = dot(normal, along), distance = offset - dot(normal, front);
        if (Math.abs(slope) < 1e-8) {
          if (distance > 1e-8) throw new RangeError("Caster placement constraints do not meet the beam centerline.");
        } else if (slope > 0) lower = Math.max(lower, distance / slope);
        else upper = Math.min(upper, distance / slope);
      };
      for (const i of [1, 3]) {
        const start = footprint[i], end = footprint[(i + 1) % footprint.length];
        const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
        const normal = [(start[1] - end[1]) / length, (end[0] - start[0]) / length];
        limit(normal, dot(normal, start) + plateDiagonal / 2 + clearance);
      }
      if (tangent) for (const sign of [-1, 1]) {
        const angle = heading + sign * maxAngle;
        const normal = [sign * Math.sin(angle), -sign * Math.cos(angle)];
        limit(normal, -INNER_RADIUS * normal[0]);
      }
      if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower > upper) {
        throw new RangeError(`Caster plates do not fit beneath the ${side} support beam.`);
      }
      return [lower, upper];
    };
    const frontDistance = Math.max(range(startIndex !== 0)[0], range(false)[0] + (beam.casterFrontSetback ?? 0));
    const rearDistance = range(true)[1];
    if (rearDistance - frontDistance < plateDiagonal + clearance) {
      throw new RangeError("Caster plates do not fit between the support beam's end clearances.");
    }
    const [frontEast, frontNorth] = front.map((value, i) => value + along[i] * frontDistance);
    const frontHeading = startIndex === 0 ? heading : Math.atan2(frontNorth, frontEast + INNER_RADIUS);
    steps[0].parts.bottomFrame.hardware[`${side}Caster`] = new Caster(frontEast, frontNorth, frontHeading);
    const [rearEast, rearNorth] = front.map((value, i) => value + along[i] * rearDistance);
    const rearHeading = Math.atan2(rearNorth, rearEast + INNER_RADIUS) + Math.PI;
    steps.at(-1).parts.bottomFrame.hardware[`${side}RearCaster`] = new Caster(
      cosine * (rearEast + INNER_RADIUS) + sine * rearNorth - INNER_RADIUS,
      -sine * (rearEast + INNER_RADIUS) + cosine * rearNorth, rearHeading - rearAngle);
  }
}

function addSupportCrossPiece(step) {
  const crossPiece = new SupportCrossPiece(step);
  validateFootprints(crossPiece.name, [crossPiece.footprint], step.footprint);
  const crossTop = crossPiece.bottomHeight + crossPiece.thickness;
  for (const side of ["left", "right"]) {
    const support = step.parts.topFrame.boards[`${side}StepSupport`];
    if (support && crossTop > support.bottomHeight &&
      crossPiece.bottomHeight < support.bottomHeight + support.width) {
      support.notchBottom("startNear", [crossPiece.footprint[3], crossPiece.footprint[2]], crossTop);
      step.parts.uprights.boards[`${side}Upright`].notchForCrossPiece(support, "endFar", crossTop);
    }
  }
  for (const key of ["leftUpright", "rightUpright"]) {
    const upright = step.parts.uprights.boards[key];
    upright.notchBottom(key.startsWith("left") ? "positiveY" : "negativeY", crossTop);
  }
  step.parts.bottomFrame.boards.supportCrossPiece = crossPiece;
}

function addRearSupportCrossPiece(step) {
  const { leftRearUpright, rightRearUpright, leftUpright } = step.parts.uprights.boards;
  const crossPiece = new UprightCrossPiece(leftRearUpright ?? leftUpright, rightRearUpright,
    [step.footprint[3], step.footprint[2]], BASE_RAIL_TOP_HEIGHT, true);
  crossPiece.name = "Beam - cross rear";
  const front = step.parts.bottomFrame.boards.supportCrossPiece;
  const [start, end] = [front.footprint[3], front.footprint[2]];
  const normal = [start[1] - end[1], end[0] - start[0]];
  const offset = start[0] * normal[0] + start[1] * normal[1];
  const backRight = crossPiece.footprint[2];
  const footprint = clipFootprint(crossPiece.footprint, normal, offset);
  const rearIndex = footprint.indexOf(backRight);
  if (footprint.length < 3 || rearIndex === -1) {
    throw new RangeError("A rear support cross-piece must retain wood behind the front cross-piece.");
  }
  crossPiece.footprint = [...footprint.slice(rearIndex), ...footprint.slice(0, rearIndex)];
  crossPiece.length = Math.hypot(...crossPiece.footprint[1].map((value, axis) =>
    value - crossPiece.footprint[0][axis]));
  validateFootprints(crossPiece.name, [crossPiece.footprint], step.footprint);
  for (const [upright, face] of [[leftRearUpright, "positiveY"], [rightRearUpright, "negativeY"]]) {
    if (!upright) continue; // A combined left upright already has this bottom notch.
    upright.notchBottom(face, crossPiece.bottomHeight + crossPiece.thickness);
  }
  step.parts.bottomFrame.boards.rearSupportCrossPiece = crossPiece;
}

function addSupportBlocks(step, moduleFront = false, previous = null) {
  const crossPiece = step.parts.bottomFrame.boards.supportCrossPiece;
  if (!crossPiece) return;
  const crossTop = crossPiece.bottomHeight + crossPiece.thickness;
  const frontFrame = step.parts.topFrame.boards.southCrossPiece;
  const rearNormal = [Math.sin(step.angle), -Math.cos(step.angle)];
  const rearOffset = step.footprint[3].reduce((sum, value, axis) => sum + value * rearNormal[axis], 0);
  const stock = { kind: "lumber", nominalSize: "2x4", thickness: 1.5, width: FRAME_WIDTH };
  for (const side of ["left", "right"]) {
    const left = side === "left", upright = step.parts.uprights.boards[`${side}Upright`];
    const bottomHeight = crossTop;
    const moduleBack = Boolean(step.parts.bottomFrame.boards.rearSupportCrossPiece);
    const frontLimit = moduleBack || (step.parts.riser.bottomHeight < bottomHeight + FRAME_WIDTH &&
      Math.min(...finishedFootprint(upright).map(point => point[1])) >= RISER_THICKNESS - 1e-8)
      ? RISER_THICKNESS : 0;
    const rear = moduleBack ? step.parts.uprights.boards[`${side}RearUpright`] ?? upright : upright;
    const along = upright.footprint[3].map((value, axis) =>
      (value - upright.footprint[0][axis]) / upright.width);
    // Measure the setback perpendicular to the module's front plane.
    const setback = moduleFront ? (left ? 1 / 8 : 1 / 4) / along[1] : 0;
    const inward = [along[1], -along[0]].map(value => value * (left ? 1 : -1) * stock.thickness);
    const end = point => {
      const inset = point.map((value, axis) => value + inward[axis]);
      return left ? [point, inset] : [inset, point];
    };
    const near = end(upright.footprint[left ? 1 : 0]);
    const far = end(rear.footprint[left ? 2 : 3]);
    for (let face = 0; face < 2; face++) {
      if (moduleBack || near[face][1] < frontLimit) {
        near[face] = pointAtNorth(near[face], far[face], frontLimit);
      }
      if (far[face].reduce((sum, value, axis) => sum + value * rearNormal[axis], 0) < rearOffset) {
        far[face] = pointAtOffset(near[face], far[face], rearNormal, rearOffset);
      }
      near[face] = near[face].map((value, axis) => value + along[axis] * setback);
      far[face] = far[face].map((value, axis) => value + along[axis] * setback);
    }
    const block = new FrameBoard([near[0], near[1], far[1], far[0]], {
      thickness: stock.thickness, width: stock.width, material: PINE, stock,
      length: Math.max(...near.map((point, face) => Math.hypot(...far[face].map((value, axis) => value - point[axis])))),
    }, bottomHeight, 1);
    block.name = `Attachment block - upright ${left ? "left" : "right"}`;
    if (frontFrame.bottomHeight < bottomHeight + block.width &&
      frontFrame.bottomHeight + frontFrame.width > bottomHeight &&
      near.some(point => point[1] < frontFrame.footprint[2][1] - 1e-8)) {
      block.notchTop("startFar", [frontFrame.footprint[3], frontFrame.footprint[2]], frontFrame.bottomHeight);
    } else if (step.parts.riser.bottomHeight < bottomHeight + block.width &&
      step.parts.riser.bottomHeight > bottomHeight &&
      near.some(point => point[1] < RISER_THICKNESS - 1e-8)) {
      block.notchTop("startFar", [step.parts.riser.footprint[3], step.parts.riser.footprint[2]],
        step.parts.riser.bottomHeight);
    }
    const previousFrame = previous?.parts.topFrame.boards.northCrossPiece;
    if (previousFrame && previousFrame.bottomHeight < bottomHeight + block.width &&
      previousFrame.bottomHeight + previousFrame.width > bottomHeight) {
      const c = Math.cos(step.angle), s = Math.sin(step.angle);
      const footprint = previousFrame.footprint.map(([east, north]) => [
        c * (east + INNER_RADIUS) + s * north - INNER_RADIUS,
        -s * (east + INNER_RADIUS) + c * north,
      ]);
      if (footprintsOverlap(block.footprint, footprint)) {
        block.notchTop("startFar", [footprint[3], footprint[2]], previousFrame.bottomHeight);
      }
    }
    validateFootprints(block.name, [block.footprint], step.footprint);
    step.parts.bottomFrame.boards[`${side}SupportBlock`] = block;
  }
}

function addBackSupportBlocks(step, previous) {
  const back = previous.parts.topFrame.boards.northCrossPiece;
  const length = 6, center = back.bottomHeight + back.width / 2;
  const preferredBottom = center - length / 2;
  // The tread's underside is already the upper placement limit.
  const obstacles = Object.values(step.parts).filter(part => part !== step.parts.tread)
    .flatMap(part => Object.values(part.boards ?? { sheet: part }));
  for (const side of ["left", "right"]) {
    const left = side === "left", upright = step.parts.uprights.boards[`${side}Upright`];
    const [front, rear] = (left ? [1, 2] : [0, 3]).map(index => upright.footprint[index]);
    const block = new UprightBoard(front, rear, left ? 1 : -1,
      preferredBottom + length + TREAD_THICKNESS, {
        bottomHeight: preferredBottom,
        frontSetback: RISER_THICKNESS, frontBevel: true,
      });
    block.name = `Attachment block - rear support ${left ? "left" : "right"}`;
    const footprint = finishedFootprint(block);
    const occupied = obstacles.filter(board => footprintsOverlap(footprint, finishedFootprint(board)))
      .map(board => {
        const { positions } = board.createGeometry();
        let bottom = Infinity, top = -Infinity;
        for (let i = 1; i < positions.length; i += 3) {
          bottom = Math.min(bottom, positions[i]);
          top = Math.max(top, positions[i]);
        }
        return [bottom, top];
      });
    const maximum = step.parts.tread.bottomHeight - length;
    const candidates = [preferredBottom, FLOOR_CLEARANCE, maximum,
      ...occupied.flatMap(([bottom, top]) => [bottom - length, top])]
      .filter(bottom => bottom >= FLOOR_CLEARANCE - 1e-8 && bottom <= maximum + 1e-8)
      .sort((a, b) => Math.abs(a - preferredBottom) - Math.abs(b - preferredBottom) || b - a);
    const bottom = candidates.find(value => occupied.every(([low, high]) =>
      value + length <= low + 1e-8 || value >= high - 1e-8));
    if (bottom === undefined) {
      throw new RangeError(`${block.name} has no unobstructed six-inch vertical position.`);
    }
    block.bottomHeight = bottom;
    validateFootprints(block.name, [footprint], step.footprint);
    step.parts.topFrame.boards[`${side}BackSupportBlock`] = block;
  }
}

function addRearStepSupport(first, second) {
  const front = first.parts.topFrame.boards.frontStepSupport;
  if (!front) return;
  const { southCrossPiece } = first.parts.topFrame.boards;
  const left = [first.footprint[0], first.footprint[3]];
  const right = southCrossPiece.footprint.slice(1, 3);
  const frontNorth = Math.max(...first.parts.newel.footprint.slice(2).map(point => point[1]));
  const backNorth = frontNorth + front.width;
  const normal = [Math.sin(first.angle), -Math.cos(first.angle)];
  const project = point => point[0] * normal[0] + point[1] * normal[1];
  let footprint = [
    pointAtNorth(...left, frontNorth),
    pointAtNorth(...right, frontNorth),
    pointAtNorth(...right, backNorth),
    pointAtNorth(...left, backNorth),
  ];
  const length = Math.hypot(footprint[1][0] - footprint[0][0], footprint[1][1] - footprint[0][1]);
  const crossPiece = second.parts.bottomFrame.boards.supportCrossPiece;
  if (front.bottomHeight < crossPiece.bottomHeight + crossPiece.thickness &&
    front.bottomHeight + front.thickness > crossPiece.bottomHeight) {
    footprint = clipFootprint(footprint, normal, project(precedingStepFootprint(second, crossPiece)[0]));
  }
  first.parts.topFrame.boards.rearStepSupport = new FlatFrameBoard(footprint, {
    thickness: front.thickness, width: front.width, length, material: PINE, stock: front.stock,
  }, front.bottomHeight);
}

function precedingStepFootprint(step, board) {
  const c = Math.cos(step.angle), s = Math.sin(step.angle);
  return finishedFootprint(board).map(([east, north]) =>
    [c * (east + INNER_RADIUS) - s * north - INNER_RADIUS,
      s * (east + INNER_RADIUS) + c * north]);
}

function addFrontStepSideSupports(first, second) {
  const top = first.parts.tread.bottomHeight;
  const crossPiece = first.parts.topFrame.boards.southCrossPiece;
  for (const side of ["Right"]) {
    const key = `${side.toLowerCase()}Upright`, upright = first.parts.uprights.boards[key];
    const along = upright.footprint[3].map((value, axis) =>
      (value - upright.footprint[0][axis]) / upright.width);
    const inward = [along[1], -along[0]].map(value => value * (side === "Left" ? 1 : -1));
    const [front, back] = side === "Left" ? [first.footprint[0], first.footprint[3]]
      : [first.footprint[1], first.footprint[2]];
    const outer = pointAtNorth(front, back, RISER_THICKNESS - Math.min(0, inward[1] * FRAME_THICKNESS));
    const inner = outer.map((value, axis) => value + inward[axis] * FRAME_THICKNESS);
    const near = side === "Left" ? [outer, inner] : [inner, outer];
    const offset = outer[0] * inward[0] + outer[1] * inward[1];
    const contact = clipFootprint(clipFootprint(
      precedingStepFootprint(second, second.parts.uprights.boards[key]), inward, offset),
    inward.map(value => -value), -offset - FRAME_THICKNESS);
    const length = Math.min(...contact.map(point =>
      (point[0] - outer[0]) * along[0] + (point[1] - outer[1]) * along[1]));
    const far = near.map(point => point.map((value, axis) => value + along[axis] * length));
    const support = new FrameBoard([near[0], near[1], far[1], far[0]],
      { thickness: FRAME_THICKNESS, width: FRAME_WIDTH, length }, top - FRAME_WIDTH, 1);
    support.notchBottom("startNear", [crossPiece.footprint[3], crossPiece.footprint[2]],
      crossPiece.bottomHeight + crossPiece.width);
    first.parts.topFrame.boards[`frontStep${side}Support`] = support;
  }
  const boards = first.parts.topFrame.boards, frontSupport = boards.frontStepSupport;
  if (frontSupport) {
    frontSupport.footprint = frontSupport.footprint.map((point, index) => {
      const left = index === 0 || index === 3;
      const edge = left ? [first.footprint[0], first.footprint[3]]
        : [first.footprint[1], first.footprint[2]];
      return pointAtNorth(...edge, point[1]);
    });
    frontSupport.length = Math.hypot(...frontSupport.footprint[1].map((value, axis) =>
      value - frontSupport.footprint[0][axis]));
  }
  delete first.parts.uprights.boards.leftUpright;
  delete first.parts.uprights.boards.rightUpright;
}

function finishFrontStepSupports(first, second) {
  addRearStepSupport(first, second);
  const crossPiece = second.parts.bottomFrame.boards.supportCrossPiece;
  const crossFootprint = precedingStepFootprint(second, crossPiece);
  const boundary = precedingStepFootprint(second, second.parts.riser).slice(0, 2);
  for (const key of ["frontStepRightSupport"]) {
    const support = first.parts.topFrame.boards[key];
    const top = support.bottomHeight + support.width;
    const overlaps = footprintsOverlap(support.footprint, crossFootprint) &&
      support.bottomHeight < crossPiece.bottomHeight + crossPiece.thickness &&
      top > crossPiece.bottomHeight;
    support.notchTop("endFar", boundary,
      Math.min(second.parts.riser.bottomHeight, overlaps ? crossPiece.bottomHeight : top));
  }
}

function addNewelFraming(first, second, beams) {
  const newel = first.parts.newel;
  const { project, place } = newelPlanFrame(newel);
  const front = RISER_THICKNESS + TWO_BY_FOUR_STOCK.thickness;
  const boards = first.parts.topFrame.boards;
  delete boards.frontStepRightSupport;
  first.parts.tread.notchForPost(newel);
  if (boards.frontStepSupport) notchAroundNewel(boards.frontStepSupport, newel);

  const inner = -TWO_BY_FOUR_STOCK.thickness;
  const upright = precedingStepFootprint(second, second.parts.uprights.boards.rightUpright).map(project);
  const obstructions = [second.parts.siding, second.parts.frontSpindle].flatMap(board =>
    clipFootprint(clipFootprint(precedingStepFootprint(second, board).map(project), [1, 0], inner),
      [-1, 0], 0));
  const blockBack = Math.min(Math.max(...upright.map(point => point[1])),
    ...obstructions.map(point => point[1]));
  const blockFront = [inner, 0].map(across => pointAtNorth(place([across, 0]), place([across, 1]), front));
  const blockFootprint = [...blockFront, place([0, blockBack]), place([inner, blockBack])];
  const cheek = new FrameBoard(blockFootprint, {
    thickness: TWO_BY_FOUR_STOCK.thickness, width: FRAME_WIDTH,
    length: blockBack - Math.min(...blockFront.map(point => project(point)[1])),
    stock: TWO_BY_FOUR_STOCK,
  }, BASE_RAIL_TOP_HEIGHT - FRAME_WIDTH, 1);
  cheek.name = "Newel block - inner";
  boards.newelInnerBlock = cheek;

  const rearObstruction = clipFootprint(clipFootprint(upright, [1, 0], 0),
    [-1, 0], -TWO_BY_FOUR_STOCK.thickness);
  const rearBack = Math.min(blockBack, ...rearObstruction.map(point => point[1]));
  const backLength = rearBack - newel.width;
  const rearBlock = new FrameBoard([
    [0, newel.width], [TWO_BY_FOUR_STOCK.thickness, newel.width],
    [TWO_BY_FOUR_STOCK.thickness, newel.width + backLength], [0, newel.width + backLength],
  ].map(place), { thickness: TWO_BY_FOUR_STOCK.thickness, width: FRAME_WIDTH, length: backLength,
    stock: TWO_BY_FOUR_STOCK }, cheek.bottomHeight, 1);
  rearBlock.name = "Newel block - rear";
  boards.newelRearBlock = rearBlock;

  for (const beam of Object.values(beams)) {
    beam.footprint = [pointAtNorth(beam.footprint[0], beam.footprint[1], front),
      beam.footprint[1], beam.footprint[2], pointAtNorth(beam.footprint[3], beam.footprint[2], front)];
    beam.length = Math.max(...[[0, 1], [3, 2]].map(([start, end]) =>
      Math.hypot(...beam.footprint[end].map((value, axis) => value - beam.footprint[start][axis]))));
  }
  beams.rightSupportBeam.casterFrontSetback = 1;

  const frontSiding = new Siding(first.footprint, first.height);
  const along = newel.footprint[3].map((value, axis) => (value - newel.footprint[0][axis]) / newel.width);
  for (const [sheet, front] of [[frontSiding, true], [first.parts.siding, false]]) {
    const boundary = newel.footprint[front ? 0 : 3];
    const offset = boundary.reduce((sum, value, axis) => sum + value * along[axis], 0);
    const [a, b, c, d] = sheet.footprint;
    const inner = pointAtOffset(a, d, along, offset), outer = pointAtOffset(b, c, along, offset);
    sheet.footprint = front ? [a, b, outer, inner] : [inner, outer, c, d];
    sheet.length = Math.hypot(...sheet.footprint[2].map((value, axis) => value - sheet.footprint[1][axis]));
  }
  first.parts.frontSiding = frontSiding;
}

export class Uprights {
  constructor(footprint, bottomFrame, height, rearUprights = false, frontSetback = 0,
    frontBevel = rearUprights && frontSetback > 0,
    bottomHeight = BASE_RAIL_TOP_HEIGHT) {
    const [a, b, c, d] = footprint;
    const [leftFront, leftBack] = [a, d];
    const [rightFront, rightBack] = [b, c];
    const leftLength = Math.hypot(d[0] - a[0], d[1] - a[1]);
    const leftInward = [(d[1] - a[1]) / leftLength, (a[0] - d[0]) / leftLength];
    const rear = rearUprights ? {
      leftRearUpright: new UprightBoard(leftFront, leftBack, 1, height,
        { bottomHeight, rearBoundary: [footprint[3], footprint[2]] }),
      rightRearUpright: new UprightBoard(rightFront, rightBack, -1, height,
        { bottomHeight, rearBoundary: [footprint[3], footprint[2]] }),
    } : {};
    const front = new UprightBoard(leftFront, leftBack, 1, height, { bottomHeight, frontSetback, frontBevel });
    const direction = front.footprint[3].map((value, axis) => (value - front.footprint[0][axis]) / front.width);
    let leftUpright = front;
    if (rearUprights) {
      const rearStart = direction.reduce((sum, value, axis) =>
        sum + value * (rear.leftRearUpright.footprint[0][axis] - front.footprint[0][axis]), 0);
      if (rearStart <= front.width + 1e-8) {
        const width = Math.max(front.width, rearStart + rear.leftRearUpright.width);
        const source = [["2x6", 5.5], ["2x8", 7.25], ["2x10", 9.25]]
          .find(([, stockWidth]) => stockWidth >= width);
        if (!source) throw new RangeError("The combined upright does not fit pine 2x6, 2x8, or 2x10 stock.");
        leftUpright = new UprightBoard(leftFront, leftBack, 1, height, {
          width, bottomHeight, frontSetback, frontBevel,
          stock: { ...TWO_BY_FOUR_STOCK, nominalSize: source[0], width: source[1] },
        });
        leftUpright.name = "Upright - full left";
        leftUpright.combinesRearUpright = true;
        delete rear.leftRearUpright;
      }
    }
    const rightUpright = new UprightBoard(rightFront, rightBack, -1, height,
      { bottomHeight, frontSetback, frontBevel });
    if (leftInward.reduce((sum, value, axis) =>
      sum + value * (rightUpright.footprint[0][axis] - leftUpright.footprint[1][axis]), 0) <= 0) {
      throw new RangeError("Uprights overlap.");
    }
    this.boards = { leftUpright, rightUpright, ...rear };
    validateFootprints("Uprights", Object.values(this.boards).map(board => board.frontBevel
      ? clipFootprint(board.footprint, [0, 1], frontSetback) : board.footprint), footprint);
  }

  createGeometry() {
    return combineGeometries(Object.values(this.boards).map(board => board.createGeometry()));
  }
}

class UprightBoard extends Board {
  constructor(front, back, inwardSide, height,
    { width = FRAME_WIDTH, thickness = UPRIGHT_THICKNESS, bottomHeight = FLOOR_CLEARANCE,
      rearBoundary = null, frontSetback = 0, frontBevel = false, stock = TWO_BY_FOUR_STOCK } = {}) {
    super({ length: height - TREAD_THICKNESS - bottomHeight,
      thickness, width, material: PINE, stock });
    this.bottomHeight = bottomHeight;
    const depth = Math.hypot(back[0] - front[0], back[1] - front[1]);
    const direction = back.map((value, axis) => (value - front[axis]) / depth);
    const inward = [direction[1] * inwardSide, -direction[0] * inwardSide];
    this.frontBevel = frontBevel && Math.abs(inward[1]) > 1e-10;
    // Keep the stock rectangular, with an end corner on the front or rear radius.
    let near;
    if (rearBoundary) {
      const [d, c] = rearBoundary, normal = [c[1] - d[1], d[0] - c[0]];
      const inset = inward.reduce((sum, value, axis) => sum + value * normal[axis] * this.thickness, 0);
      const retreat = Math.max(0, -inset) / direction.reduce((sum, value, axis) => sum - value * normal[axis], 0);
      near = back.map((value, axis) => value - direction[axis] * (this.width + retreat));
    } else {
      near = pointAtNorth(front, back, frontSetback - Math.min(0, inward[1] * this.thickness) -
        (frontBevel ? Math.abs(inward[1] * this.thickness) : 0));
    }
    const nearInset = near.map((value, axis) => value + inward[axis] * this.thickness);
    const far = near.map((value, axis) => value + direction[axis] * this.width);
    const farInset = nearInset.map((value, axis) => value + direction[axis] * this.width);
    this.footprint = inwardSide > 0
      ? [near, nearInset, farInset, far]
      : [nearInset, near, far, farInset];
    if (this.frontBevel) {
      const depth = this.notchDepth([[0, frontSetback], [1, frontSetback]]).map(value => Math.max(0, value));
      this.notchedStock = new NotchedBoard(this, {}, [], [{ corner: "endNear", length: this.length, depth }]);
    }
  }

  get label() { return this.stock.nominalSize; }

  get grain() { return { ...super.grain, direction: [0, 1, 0], endFaces: [0, 1] }; }

  get notches() { return this.notchedStock?.notches ?? {}; }

  get dados() { return this.notchedStock?.dados ?? []; }

  get rebates() { return this.notchedStock?.rebates ?? []; }

  getBlankShape() { return this.notchedStock?.getBlankShape() ?? super.getBlankShape(); }

  getManufacturingDescription() {
    return this.notchedStock?.getManufacturingDescription() ?? super.getManufacturingDescription();
  }

  getStockAxes() {
    const direction = (end, length) => [
      (end[0] - this.footprint[0][0]) / length, 0,
      -(end[1] - this.footprint[0][1]) / length,
    ];
    return [[0, 1, 0], direction(this.footprint[1], this.thickness), direction(this.footprint[3], this.width)];
  }

  createStockGeometry() {
    return (this.notchedStock ?? new NotchedBoard(this)).createStockGeometry();
  }

  getPlacement() {
    const axes = this.getStockAxes();
    const near = this.width / 2 + Math.min(...(this.notchedStock?.widthBounds ?? [[-this.width / 2]])
      .map(bounds => bounds[0]));
    return placementMatrix(axes, [this.footprint[0][0], this.bottomHeight, -this.footprint[0][1]]
      .map((value, axis) => value + axes[2][axis] * near));
  }

  notchBottom(face, shoulderHeight) {
    this.notchedStock = new NotchedBoard(this.notchedStock ?? this, this.notches, [
      ...this.dados, { face, start: 0, width: shoulderHeight - this.bottomHeight, depth: SUPPORT_NOTCH_DEPTH },
    ]);
  }

  notchDepth([start, end], far = false) {
    const normal = [start[1] - end[1], end[0] - start[0]];
    const direction = this.footprint[3].map((value, axis) =>
      (value - this.footprint[0][axis]) / this.width);
    const projection = normal[0] * direction[0] + normal[1] * direction[1];
    const points = this.footprint.slice(0, 2);
    return points.map((point, face) => {
      const intersection = -normal.reduce((sum, value, axis) =>
        sum + value * (point[axis] - start[axis]), 0) / projection;
      const original = far ? this.width - intersection : intersection;
      const bounds = this.notchedStock?.widthBounds[face] ?? [-this.width / 2, this.width / 2];
      const removed = far ? this.width / 2 - bounds[1] : bounds[0] + this.width / 2;
      return original - removed;
    });
  }

  notchForCrossPiece(crossPiece, corner, seatBottom = crossPiece.bottomHeight) {
    const far = corner.endsWith("Far");
    const depth = this.notchDepth(far ? crossPiece.footprint.slice(0, 2)
      : [crossPiece.footprint[3], crossPiece.footprint[2]], far);
    this.notchedStock = new NotchedBoard(this.notchedStock ?? this, {
      ...this.notches, [corner]: {
        length: corner.startsWith("start") ?
          crossPiece.bottomHeight + crossPiece.width - this.bottomHeight :
          this.bottomHeight + this.length - seatBottom,
        depth,
      },
    }, this.dados);
  }

  bevelFront(north) {
    const depth = this.notchDepth([[0, north], [1, north]]).map(value => Math.max(0, value));
    this.frontBevel = depth.some(value => value > 1e-10);
    this.notchedStock = new NotchedBoard(this.notchedStock ?? this, this.notches, this.dados,
      this.frontBevel ? [{
        corner: "endNear", length: this.length, depth,
      }] : []);
  }

  createGeometry() {
    if (!this.notchedStock) {
      return extrudeFootprint(this.footprint, this.bottomHeight, this.length, this.color, this.grain);
    }
    return placeVerticalStockGeometry(this, this.notchedStock.createGeometry(), this.bottomHeight);
  }
}

export class TopFrame {
  constructor(footprint, bottomFrame, uprights, height, rightStepSupport = false, frontStepSupportStock = null) {
    const top = height - TREAD_THICKNESS;
    const rearBottom = Math.max(top - FRAME_WIDTH, FLOOR_CLEARANCE + FRAME_WIDTH);
    const rearHeight = top - rearBottom;
    const frontTop = top - (frontStepSupportStock?.thickness ?? 0);
    const frontBottom = Math.max(frontTop - FRAME_WIDTH, FLOOR_CLEARANCE);
    const frontHeight = frontTop - frontBottom;
    validateDimensions("Top frame", { rearHeight, frontHeight });
    const [a, b, c, d] = footprint;
    const leftFront = pointAtNorth(a, d, RISER_THICKNESS);
    const rightFront = pointAtNorth(b, c, RISER_THICKNESS);
    const backWidth = Math.hypot(c[0] - d[0], c[1] - d[1]);
    const backInward = [(c[1] - d[1]) / backWidth, (d[0] - c[0]) / backWidth];
    const extendBack = rightStepSupport && !uprights.boards.rightRearUpright;
    const outerRadius = Math.hypot(b[0] + INNER_RADIUS, b[1]);
    const halfAngle = Math.atan2(c[1], c[0] + INNER_RADIUS) / 2;
    const rightInset = extendBack
      ? (outerRadius - Math.sqrt(outerRadius ** 2 - RISER_THICKNESS ** 2)) * Math.cos(halfAngle) +
        RISER_THICKNESS * Math.sin(halfAngle)
      : 0;
    const rightLength = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const rightInward = [(b[1] - c[1]) / rightLength, (c[0] - b[0]) / rightLength];
    const insetRight = point => point.map((value, axis) => value + rightInward[axis] * rightInset);
    const insetB = insetRight(b), insetC = insetRight(c);
    const backOffset = d[0] * backInward[0] + d[1] * backInward[1] -
      (extendBack ? RISER_THICKNESS : 0);
    const backLeft = pointAtOffset(a, d, backInward, backOffset);
    const backRight = pointAtOffset(insetB, insetC, backInward, backOffset);
    const northLeftFront = offsetCorner(backLeft, a, backInward);
    const northRightFront = offsetCorner(backRight, insetB, backInward);
    this.boards = {
      southCrossPiece: new FrameBoard([leftFront, rightFront,
        pointAtNorth(b, c, RISER_THICKNESS + FRAME_THICKNESS),
        pointAtNorth(a, d, RISER_THICKNESS + FRAME_THICKNESS)],
      { thickness: FRAME_THICKNESS, width: frontHeight, length: rightFront[0] - leftFront[0] },
      frontBottom),
      northCrossPiece: new FrameBoard([northLeftFront, northRightFront, backRight, backLeft],
        { thickness: FRAME_THICKNESS, width: rearHeight,
          length: Math.hypot(c[0] - d[0], c[1] - d[1]) },
        rearBottom),
    };
    uprights.boards.leftUpright.notchForCrossPiece(this.boards.southCrossPiece, "endNear");
    uprights.boards.rightUpright.notchForCrossPiece(this.boards.southCrossPiece, "endNear");
    if (frontStepSupportStock) {
      const left = uprights.boards.leftUpright.footprint;
      const right = uprights.boards.rightUpright.footprint;
      const back = RISER_THICKNESS + frontStepSupportStock.width;
      const supportFootprint = [
        pointAtNorth(left[1], left[2], RISER_THICKNESS),
        pointAtNorth(right[0], right[3], RISER_THICKNESS),
        pointAtNorth(right[0], right[3], back),
        pointAtNorth(left[1], left[2], back),
      ];
      this.boards.frontStepSupport = new FlatFrameBoard(supportFootprint, {
        thickness: frontStepSupportStock.thickness, width: frontStepSupportStock.width,
        length: supportFootprint[1][0] - supportFootprint[0][0],
        material: PINE, stock: frontStepSupportStock,
      }, frontTop);
    }
    const leftRear = uprights.boards.leftRearUpright ??
      (uprights.boards.leftUpright.combinesRearUpright ? uprights.boards.leftUpright : null);
    for (const rear of [leftRear, uprights.boards.rightRearUpright]) {
      rear?.notchForCrossPiece(this.boards.northCrossPiece, "endFar");
    }
    const addSideSupport = side => {
      const left = side === "left";
      const front = uprights.boards[`${side}Upright`], rear = uprights.boards[`${side}RearUpright`];
      const along = front.footprint[3].map((value, axis) => (value - front.footprint[0][axis]) / front.width);
      const face = point => {
        const shift = left ? UPRIGHT_THICKNESS - FRAME_THICKNESS : rightInset;
        point = point.map((value, axis) =>
          value + (axis === 0 ? along[1] : -along[0]) * (left ? 1 : -1) * shift);
        const inner = point.map((value, axis) =>
          value + (axis === 0 ? along[1] : -along[0]) * (left ? 1 : -1) * FRAME_THICKNESS);
        return left ? [point, inner] : [inner, point];
      };
      const start = face(front.footprint[left ? 3 : 2])
        .map(point => point.map((value, axis) => value - along[axis] * 0.75));
      const end = rear
        ? face(rear.footprint[left ? 0 : 1]).map(point =>
          point.map((value, axis) => value + along[axis] * 0.75))
        : start.map(point =>
          pointAtOffset(point, point.map((value, axis) => value + along[axis]), backInward, backOffset));
      const support = new FrameBoard([start[0], start[1], end[1], end[0]], {
        thickness: FRAME_THICKNESS, width: FRAME_WIDTH,
        length: Math.hypot(end[1][0] - start[1][0], end[1][1] - start[1][1]),
      }, top - FRAME_WIDTH, 1);
      front.notchForCrossPiece(support, "endFar");
      if (rear) {
        rear.notchForCrossPiece(support, "endNear");
      } else {
        const lapHeight = top - FRAME_WIDTH / 2;
        const inner = left ? 1 : 0;
        this.boards.northCrossPiece.notchTop(left ? "startFar" : "endFar",
          [start[inner], end[inner]], lapHeight);
        support.notchBottom("endNear", this.boards.northCrossPiece.footprint.slice(0, 2), lapHeight);
      }
      this.boards[`${side}StepSupport`] = support;
    };
    if (rightStepSupport) {
      addSideSupport("right");
      if (extendBack) addSideSupport("left");
    }
    validateFootprints("Top frame", Object.values(this.boards).map(board => board.footprint),
      [a, b, pointAtOffset(b, c, backInward, backOffset), backLeft]);
  }

  createGeometry() {
    return combineGeometries(Object.values(this.boards).map(board => board.createGeometry()));
  }
}

export class Riser extends FrameBoard {
  get grain() {
    return { ...super.grain, endFaces: [0, 1, 3, 5],
      plyDirection: [0, 0, 1], plyThickness: this.thickness / 3 };
  }

  constructor(footprint, height, stepRise,
    bottom = Math.max(FLOOR_CLEARANCE, height - stepRise - TREAD_THICKNESS)) {
    if (!Number.isFinite(bottom) || bottom < FLOOR_CLEARANCE) {
      throw new RangeError("Riser bottom must be finite and at least the floor clearance.");
    }
    const riserHeight = height - TREAD_THICKNESS - bottom;
    validateDimensions("Riser", { height: riserHeight });
    const [a, b, c, d] = footprint;
    super([a, b, pointAtNorth(b, c, RISER_THICKNESS), pointAtNorth(a, d, RISER_THICKNESS)],
      { thickness: RISER_THICKNESS, width: riserHeight, length: b[0] - a[0], material: PLYWOOD,
        stock: { kind: "plywood", thickness: RISER_THICKNESS } }, bottom);
  }
}

export class Siding extends FrameBoard {
  constructor(footprint, height) {
    const [, front, back] = footprint;
    const length = Math.hypot(back[0] - front[0], back[1] - front[1]);
    const outward = [(back[1] - front[1]) / length, (front[0] - back[0]) / length];
    const radius = (front[0] + INNER_RADIUS) * outward[0] + front[1] * outward[1];
    const outside = ([east, north], distance) => {
      const scale = 1 + distance / radius;
      return [(east + INNER_RADIUS) * scale - INNER_RADIUS, north * scale];
    };
    const innerFront = outside(front, SIDING_CLEARANCE), innerBack = outside(back, SIDING_CLEARANCE);
    const outerFront = outside(front, SIDING_CLEARANCE + SIDING_THICKNESS);
    const outerBack = outside(back, SIDING_CLEARANCE + SIDING_THICKNESS);
    super([innerFront, outerFront, outerBack, innerBack], {
      thickness: SIDING_THICKNESS, width: height - FLOOR_CLEARANCE,
      length: Math.hypot(outerBack[0] - outerFront[0], outerBack[1] - outerFront[1]),
      material: PLYWOOD, stock: { kind: "plywood", thickness: SIDING_THICKNESS },
    }, FLOOR_CLEARANCE, 1);
    this.edgeNotches = [];
  }

  get grain() {
    return { ...super.grain, direction: [0, 1, 0], endFaces: [0, 1, 2, 4],
      plyDirection: this.getStockAxes()[1], plyThickness: this.thickness / 3 };
  }

  notchForSpindle(footprint, bottomHeight) {
    const axes = this.getStockAxes(), origin = this.footprint[this.lengthEdge];
    const project = point => axes.slice(0, 2).map(axis =>
      (point[0] - origin[0]) * axis[0] - (point[1] - origin[1]) * axis[2]);
    const polygon = footprint.map(project);
    const outward = footprint[1].map((value, axis) => (value - footprint[0][axis]) / TWO_BY_TWO_STOCK.width);
    const blank = this.getManufacturingDescription().blank;
    const profiles = ["negativeY", "positiveY"].map((name, face) => {
      const xs = blank.profiles[name].map(point => point[0]);
      let start = Math.min(...xs), end = Math.max(...xs);
      const y = face * this.thickness;
      for (const [i, a] of polygon.entries()) {
        const b = polygon[(i + 1) % polygon.length], dx = b[0] - a[0], dy = b[1] - a[1];
        const offset = dx * (y - a[1]) + dy * a[0];
        if (Math.abs(dy) < 1e-10) {
          if (offset < -1e-10) return null;
        } else if (dy > 0) end = Math.min(end, offset / dy);
        else start = Math.max(start, offset / dy);
      }
      if (end - start < 1e-8) return null;
      return [start, end].map(x => {
        const point = [origin[0] + axes[0][0] * x + axes[1][0] * y,
          origin[1] - axes[0][2] * x - axes[1][2] * y];
        const bottom = bottomHeight + point.reduce((sum, value, axis) =>
          sum + (value - footprint[0][axis]) * outward[axis], 0);
        return [x, bottom - this.bottomHeight];
      });
    });
    if (profiles.every(profile => profile === null)) return;
    if (profiles.some(profile => profile === null)) {
      throw new RangeError("A spindle cutout must intersect both siding faces.");
    }
    if (profiles.some(profile => profile.some(([, z]) => z <= 0 || z >= this.width))) {
      throw new RangeError("A spindle cutout must leave wood below the opening.");
    }
    this.edgeNotches.push({ profiles });
  }

  createGeometry() {
    if (!this.edgeNotches.length) return super.createGeometry();
    const blank = this.getManufacturingDescription().blank;
    const profiles = ["negativeY", "positiveY"].map((name, face) => {
      const xs = blank.profiles[name].map(point => point[0]);
      const left = Math.min(...xs), right = Math.max(...xs);
      const cuts = this.edgeNotches.map(cut => cut.profiles[face]).sort((a, b) => b[0][0] - a[0][0]);
      const profile = [[left, 0], [right, 0]];
      let cursor = right;
      for (const [start, end] of cuts) {
        if (end[0] > cursor + 1e-8) throw new RangeError("Siding cutouts must not overlap.");
        if (cursor - end[0] > 1e-8) profile.push([cursor, this.width], [end[0], this.width]);
        profile.push(end, start);
        if (start[0] - left > 1e-8) profile.push([start[0], this.width]);
        cursor = start[0];
      }
      if (cursor - left > 1e-8) profile.push([cursor, this.width], [left, this.width]);
      return profile.filter((point, i) => i === 0 ||
        Math.hypot(...point.map((value, axis) => value - profile[i - 1][axis])) > 1e-8);
    });
    if (profiles[0].length !== profiles[1].length) {
      throw new RangeError("Siding cutouts must have matching broad-face boundaries.");
    }
    const geometry = geometryFromProfiles(profiles, [0, this.thickness], this.color, {
      ...this.grain, direction: [0, 0, 1], origin: [0, 0, 0],
      plyDirection: [0, 1, 0],
    }, profiles[0].map((_, i) => i));
    return placeStockGeometry(this, geometry);
  }
}

const distinctCoordinates = values => values.sort((a, b) => a - b)
  .filter((value, i, all) => i === 0 || value - all[i - 1] > 1e-8);

export class ProfiledPlywood extends Board {
  constructor({ outline, holes = [], construction, thickness, origin = [0, 0], heading = 0, bottomHeight = 0 }) {
    if (construction) {
      if (outline || holes.length) throw new RangeError("Supply a plywood outline or construction, not both.");
      construction = structuredClone(construction);
      ({ outline, holes } = constructionProfile(construction));
    }
    validateProfile({ outline, holes });
    const { min, max } = outlineBounds(outline);
    const blank = construction?.blank ?? { length: max[0], width: max[1] };
    if (min.some(value => construction ? value < -1e-8 : Math.abs(value) > 1e-8) ||
      max[0] > blank.length + 1e-8 || max[1] > blank.width + 1e-8 || !Number.isFinite(heading) ||
      !Number.isFinite(bottomHeight) || !Array.isArray(origin) || origin.length !== 2 || !origin.every(Number.isFinite)) {
      throw new RangeError("Profiled plywood requires an origin-aligned outline and finite placement.");
    }
    super({ ...blank, thickness, material: PLYWOOD, stock: { kind: "plywood", thickness } });
    this.construction = construction;
    this.outline = outline.map(edge => edge.type === "line"
      ? { type: "line", from: [...edge.from], to: [...edge.to] }
      : { ...edge, center: [...edge.center] });
    this.holes = structuredClone(holes);
    this.origin = [...origin];
    this.heading = heading;
    this.bottomHeight = bottomHeight;
  }

  get grain() { return { direction: [1, 0, 0], endFaces: [], plyDirection: [0, 1, 0], plyThickness: this.thickness / 3 }; }

  getManufacturingDescription() {
    return { ...super.getManufacturingDescription(), edgeCuts: [],
      ...(this.construction ? { construction: structuredClone(this.construction) } : {}),
      outline: this.outline.map(edge => edge.type === "line"
        ? { type: "line", from: [...edge.from], to: [...edge.to] } : { ...edge, center: [...edge.center] }),
      ...(this.holes.length ? { holes: structuredClone(this.holes) } : {}) };
  }

  getMaterialVolume() { return [this.outline, ...this.holes].reduce((sum, loop) => sum + outlineArea(loop), 0) * this.thickness; }

  getStockAxes() {
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    return [[c, 0, -s], [0, 1, 0], [s, 0, c]];
  }

  getPlacement() {
    return placementMatrix(this.getStockAxes(), [this.origin[0], this.bottomHeight, -this.origin[1]]);
  }

  createStockGeometry(sag = 0.001) {
    if (this.holes.length) {
      const profile = bridgeProfile(this, sag), faces = [], endFaces = [];
      for (const triangle of triangulateProfile(profile, true)) {
        for (const surface of [0, this.thickness]) {
          const corners = triangle.map(i => [profile[i][0], surface, profile[i][1]]);
          faces.push(surface === 0 ? corners : corners.reverse());
        }
      }
      for (const loop of [this.outline, ...this.holes]) {
        const points = tessellateOutline(loop, sag);
        for (const [i, a] of points.entries()) {
          const b = points[(i + 1) % points.length];
          endFaces.push(faces.length);
          faces.push([[a[0], 0, a[1]], [a[0], this.thickness, a[1]],
            [b[0], this.thickness, b[1]], [b[0], 0, b[1]]]);
        }
      }
      return geometryFromFaces(faces, this.color, { ...this.grain, endFaces });
    }
    const profile = tessellateOutline(this.outline, sag);
    return geometryFromProfiles([profile, profile], [0, this.thickness], this.color,
      this.grain, profile.map((_, i) => i));
  }

  createGeometry() {
    const geometry = this.createStockGeometry(), axes = this.getStockAxes();
    for (let i = 0; i < geometry.positions.length; i += 3) {
      const p = geometry.positions.slice(i, i + 3), n = geometry.normals.slice(i, i + 3);
      geometry.positions.set([this.origin[0], this.bottomHeight, -this.origin[1]]
        .map((value, j) => value + axes.reduce((sum, axis, k) => sum + axis[j] * p[k], 0)), i);
      geometry.normals.set([0, 1, 2].map(j => axes.reduce((sum, axis, k) => sum + axis[j] * n[k], 0)), i);
    }
    return geometry;
  }
}

export class Tread extends ProfiledPlywood {
  constructor({ width, angle, height, extendRightEdge = false }) {
    const half = angle / 2, radius = INNER_RADIUS + width;
    const heading = half + Math.PI / 2;
    const project = ([east, north]) => [
      -Math.sin(half) * (east + INNER_RADIUS) + Math.cos(half) * north,
      Math.cos(half) * (east + INNER_RADIUS) + Math.sin(half) * north,
    ];
    const point = (r, theta) => [r * Math.cos(theta) - INNER_RADIUS, r * Math.sin(theta)];
    const frontInner = project(point(INNER_RADIUS, 0));
    const backInner = project(point(INNER_RADIUS, angle));
    const backOuter = project(point(radius, angle));
    const frontOuter = project([radius / (extendRightEdge ? Math.cos(angle) : 1) - INNER_RADIUS, 0]);
    const outline = [
      extendRightEdge ? { type: "line", from: backOuter, to: frontOuter }
        : { type: "arc", center: [0, 0], radius, startAngle: Math.PI / 2 - half, sweepRadians: angle },
      { type: "line", from: frontOuter, to: frontInner },
      { type: "arc", center: [0, 0], radius: INNER_RADIUS, startAngle: Math.PI / 2 + half, sweepRadians: -angle },
      { type: "line", from: backInner, to: backOuter },
    ];
    const { min } = outlineBounds(outline);
    const translate = point => point.map((value, axis) => value - min[axis]);
    super({
      outline: outline.map(edge => edge.type === "line"
        ? { ...edge, from: translate(edge.from), to: translate(edge.to) }
        : { ...edge, center: translate(edge.center) }),
      thickness: TREAD_THICKNESS, heading, bottomHeight: height - TREAD_THICKNESS,
      origin: [-INNER_RADIUS - Math.sin(half) * min[0] + Math.cos(half) * min[1],
        Math.cos(half) * min[0] + Math.sin(half) * min[1]],
    });
  }

  get grain() { return { ...super.grain, plyThickness: this.thickness / 5 }; }

  notchForPost(post) {
    const axes = this.getStockAxes();
    const cutter = post.footprint.map(([east, north]) => [axes[0], axes[2]].map(axis =>
      (east - this.origin[0]) * axis[0] - (north - this.origin[1]) * axis[2])).reverse();
    const profile = subtractProfile(this, cutter.map((from, i) => ({
      type: "line", from, to: cutter[(i + 1) % cutter.length],
    })));
    validateProfile(profile);
    this.outline = profile.outline;
    this.holes = profile.holes;
  }
}

export class BentPlywood extends Board {
  constructor({ profile, thickness, innerRadius, startAngle = 0, center = [0, 0], bottomHeight = 0 }) {
    validateDimensions("Bent plywood", { innerRadius });
    if (!Array.isArray(profile) || profile.length < 4 || profile.some(point =>
      point.length !== 2 || point.some(value => !Number.isFinite(value))) ||
      Math.min(...profile.map(point => point[0])) !== 0 ||
      Math.min(...profile.map(point => point[1])) !== 0 ||
      !Number.isFinite(startAngle) || !Number.isFinite(bottomHeight) ||
      center.length !== 2 || center.some(value => !Number.isFinite(value))) {
      throw new RangeError("Bent plywood requires a finite, origin-aligned flat outline and placement.");
    }
    triangulateProfile(profile);
    super({ length: Math.max(...profile.map(point => point[0])),
      width: Math.max(...profile.map(point => point[1])), thickness, material: PLYWOOD,
      stock: { kind: "plywood", thickness } });
    this.profile = profile.map(point => [...point]);
    this.bend = Object.freeze({ innerRadius, neutralRadius: innerRadius + thickness / 2,
      sweepRadians: this.length / (innerRadius + thickness / 2) });
    if (this.bend.sweepRadians >= Math.PI * 2) throw new RangeError("Bent plywood must not wrap onto itself.");
    this.startAngle = startAngle;
    this.center = [...center];
    this.bottomHeight = bottomHeight;
  }

  get grain() {
    return { direction: [0, 0, 1], endFaces: [], plyDirection: [0, 1, 0], plyThickness: this.thickness / 3 };
  }

  getBlankShape() {
    const count = this.profile.length;
    return {
      vertices: [0, this.thickness].flatMap(y => this.profile.map(([x, z]) => [x, y, z])),
      faces: [
        { name: "Outer face", axis: "thickness", indices: this.profile.map((_, i) => i) },
        { name: "Inner face", axis: "thickness", indices: this.profile.map((_, i) => count + i).reverse() },
        ...this.profile.map((point, i) => {
          const next = (i + 1) % count;
          return { name: `Edge ${i + 1}`,
            axis: Math.abs(point[0] - this.profile[next][0]) < 1e-8 ? "length" : "width",
            indices: [i, count + i, count + next, next] };
        }),
      ],
    };
  }

  getManufacturingDescription() { return { ...super.getManufacturingDescription(), bend: { ...this.bend } }; }

  getMaterialVolume() {
    return this.thickness * this.profile.reduce((sum, [x, z], i) => {
      const next = this.profile[(i + 1) % this.profile.length];
      return sum + x * next[1] - next[0] * z;
    }, 0) / 2;
  }

  getStockAxes() {
    const angle = this.startAngle + this.bend.sweepRadians / 2, c = Math.cos(angle), s = Math.sin(angle);
    return [[-s, 0, -c], [-c, 0, s], [0, 1, 0]];
  }

  getPlacement() {
    const c = Math.cos(this.startAngle), s = Math.sin(this.startAngle);
    return placementMatrix([[c, 0, -s], [0, 1, 0], [s, 0, c]],
      [this.center[0], this.bottomHeight, -this.center[1]]);
  }

  createDesign() {
    const local = new BentPlywood({ profile: this.profile, thickness: this.thickness,
      innerRadius: this.bend.innerRadius });
    return { ...super.createDesign(), geometry: local.createGeometry() };
  }

  createStockGeometry() {
    return geometryFromProfiles([this.profile, this.profile], [0, this.thickness], this.color,
      this.grain, this.profile.map((_, i) => i));
  }

  createGeometry() {
    const { innerRadius, neutralRadius, sweepRadians } = this.bend;
    // Include outline corners in the angular grid; keep every shared strip edge conforming.
    const count = Math.ceil(sweepRadians / (2 * Math.acos(1 - 0.001 / (innerRadius + this.thickness))));
    const xs = distinctCoordinates([...this.profile.map(point => point[0]),
      ...Array.from({ length: count + 1 }, (_, i) => this.length * i / count)]);
    const edges = this.profile.map((a, i) => [a, this.profile[(i + 1) % this.profile.length]]);
    const zAt = ([a, b], x) => a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
    const levels = xs.map(x => distinctCoordinates(edges.flatMap(edge => {
      const [a, b] = edge;
      if (x < Math.min(a[0], b[0]) - 1e-9 || x > Math.max(a[0], b[0]) + 1e-9) return [];
      return Math.abs(a[0] - b[0]) < 1e-9 ? [a[1], b[1]] : [zAt(edge, x)];
    })));
    const faces = [], endFaces = [];
    const at = ([x, z], y) => [x, y, z];
    for (let i = 0; i < xs.length - 1; i++) {
      const left = xs[i], right = xs[i + 1], mid = (left + right) / 2;
      if (right - left < 1e-9) continue;
      const crossing = edges.filter(([a, b]) => mid > Math.min(a[0], b[0]) && mid < Math.max(a[0], b[0]))
        .sort((a, b) => zAt(a, mid) - zAt(b, mid));
      for (let j = 0; j < crossing.length; j += 2) {
        const low = crossing[j], high = crossing[j + 1];
        const bottom = [zAt(low, left), zAt(low, right)], top = [zAt(high, left), zAt(high, right)];
        const polygon = [
          [left, bottom[0]], [right, bottom[1]],
          ...levels[i + 1].filter(z => z > bottom[1] + 1e-9 && z < top[1] - 1e-9).map(z => [right, z]),
          [right, top[1]], [left, top[0]],
          ...levels[i].filter(z => z > bottom[0] + 1e-9 && z < top[0] - 1e-9).reverse().map(z => [left, z]),
        ].filter((point, k, all) => k === 0 || Math.hypot(...point.map((v, axis) => v - all[k - 1][axis])) > 1e-9);
        for (const triangle of triangulateProfile(polygon)) {
          faces.push(triangle.map(index => at(polygon[index], 0)),
            triangle.map(index => at(polygon[index], this.thickness)).reverse());
        }
      }
    }
    for (const [a, b] of edges) {
      const vertical = Math.abs(a[0] - b[0]) < 1e-9;
      const interior = vertical
        ? levels[xs.findIndex(x => Math.abs(x - a[0]) < 1e-8)]
          .filter(z => z > Math.min(a[1], b[1]) + 1e-8 && z < Math.max(a[1], b[1]) - 1e-8).map(z => [a[0], z])
        : xs.filter(x => x > Math.min(a[0], b[0]) + 1e-8 && x < Math.max(a[0], b[0]) - 1e-8)
          .map(x => [x, zAt([a, b], x)]);
      interior.sort((p, q) => vertical ? (p[1] - q[1]) * Math.sign(b[1] - a[1])
        : (p[0] - q[0]) * Math.sign(b[0] - a[0]));
      const points = [a, ...interior, b];
      for (let i = 0; i < points.length - 1; i++) {
        const corners = [at(points[i], 0), at(points[i], this.thickness),
          at(points[i + 1], this.thickness), at(points[i + 1], 0)];
        for (const indices of [[0, 1, 2], [0, 2, 3]]) {
          endFaces.push(faces.length);
          faces.push(indices.map(index => corners[index]));
        }
      }
    }
    const geometry = geometryFromFaces(faces, this.color, { ...this.grain, endFaces, origin: [0, 0, 0] });
    for (let i = 0; i < geometry.positions.length; i += 3) {
      const angle = this.startAngle + geometry.positions[i] / neutralRadius;
      const radius = innerRadius + this.thickness - geometry.positions[i + 1];
      const height = geometry.positions[i + 2];
      geometry.positions.set([this.center[0] + radius * Math.cos(angle), this.bottomHeight + height,
        -this.center[1] - radius * Math.sin(angle)], i);
    }
    for (let i = 0; i < geometry.indices.length; i += 3) {
      const vertices = Array.from(geometry.indices.slice(i, i + 3), index => index * 3);
      const [a, b, c] = vertices.map(index => geometry.positions.slice(index, index + 3));
      const ab = b.map((v, axis) => v - a[axis]), ac = c.map((v, axis) => v - a[axis]);
      const normal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0]];
      const length = Math.hypot(...normal);
      for (const vertex of vertices) geometry.normals.set(normal.map(v => v / length), vertex);
    }
    return geometry;
  }
}

function moduleSidingRadius(module) {
  return INNER_RADIUS + module.steps[0].width;
}

function createModuleBaseRail(module, innerRadius, radius, name) {
  const { angle } = module.steps[0];
  const halfAngle = module.steps.length * angle / 2, c = Math.cos(halfAngle), s = Math.sin(halfAngle);
  const radial = [c, s], tangent = [-s, c], end = module.steps.length * angle;
  const frontAngle = 0;
  const frontNormal = [-Math.sin(frontAngle), Math.cos(frontAngle)];
  const firstSupport = module.steps[0].parts.topFrame.boards.southCrossPiece;
  const frontOffset = module.startIndex === 0 ? Math.max(...firstSupport.footprint.map(point => point[1])) : RISER_THICKNESS;
  const backNormal = [Math.sin(end), -Math.cos(end)];
  const left = innerRadius * c;
  const intersection = (normal, offset, z) =>
    (offset - (normal[0] * c + normal[1] * s) * z) / (normal[0] * tangent[0] + normal[1] * tangent[1]);
  const min = [intersection(frontNormal, frontOffset, radius), left];
  const blank = { length: intersection(backNormal, 0, radius) - min[0], width: radius - left };
  const project = point => [tangent, radial].map((axis, i) => point[0] * axis[0] + point[1] * axis[1] - min[i]);
  const center = project([0, 0]);
  const trapezoid = {
    left: { angleRadians: halfAngle + Math.PI / 2 - frontAngle, inset: frontOffset },
    right: { angleRadians: halfAngle + Math.PI / 2 - end, inset: 0 },
  };
  const arc = { center, radius }, notches = [];
  const rectangle = (points, name, clearance = 1 / 32) => {
    points = points.map(project);
    const cross = (points[1][0] - points[0][0]) * (points[2][1] - points[1][1]) -
      (points[1][1] - points[0][1]) * (points[2][0] - points[1][0]);
    if (cross < 0) points = [points[0], points[3], points[2], points[1]];
    const outside = point => Math.max(0, -point[0], point[0] - blank.length) ** 2 +
      Math.max(0, -point[1], point[1] - blank.width) ** 2;
    const reference = points.reduce((best, point, i) => outside(point) < outside(points[best]) - 1e-8 ? i : best, 0);
    points = [...points.slice(reference), ...points.slice(0, reference)];
    const u = points[1].map((value, i) => value - points[0][i]);
    const v = points[3].map((value, i) => value - points[0][i]);
    const width = Math.hypot(...u), depth = Math.hypot(...v);
    return { reference: points[0].map((value, i) => value - clearance * (u[i] / width + v[i] / depth)),
      width: width + 2 * clearance, depth: depth + 2 * clearance, angleRadians: Math.atan2(u[1], u[0]), name };
  };
  for (const [i, step] of module.steps.entries()) {
    const rotate = ([east, north]) => [
      Math.cos(i * angle) * (east + INNER_RADIUS) - Math.sin(i * angle) * north,
      Math.sin(i * angle) * (east + INNER_RADIUS) + Math.cos(i * angle) * north,
    ];
    const spindle = step.parts.frontSpindle;
    if (spindle && spindle.bottomHeight < BASE_RAIL_TOP_HEIGHT) notches.push(
      rectangle(spindle.footprint.map(rotate), `Step ${module.startIndex + i + 1} spindle clearance`));
    if (module.startIndex === 0 && i === 0) {
      for (const [board, name] of [[step.parts.newel, "Newel post clearance"],
        [step.parts.topFrame.boards.newelInnerBlock, "Inner newel block clearance"],
        [step.parts.topFrame.boards.newelRearBlock, "Rear newel block clearance"]]) {
        notches.push(rectangle(board.footprint.map(rotate), name));
      }
    }
  }
  const construction = { blank, trapezoid, arc, innerRadius, notches: [], openings: [],
    ...(module.startIndex === 0 && radius === moduleSidingRadius(module)
      ? { tangentExtension: { angleRadians: Math.PI / 2 + halfAngle - angle } } : {}) };
  const area = profile => [profile.outline, ...profile.holes].reduce((sum, loop) => sum + outlineArea(loop), 0);
  let remainingArea = area(constructionProfile(construction));
  for (const cut of notches) {
    construction.notches.push(cut);
    const nextArea = area(constructionProfile(construction));
    if (remainingArea - nextArea > 1e-8) remainingArea = nextArea;
    else construction.notches.pop();
  }
  const panel = new ProfiledPlywood({ construction,
    thickness: BASE_RAIL_THICKNESS,
    origin: [-INNER_RADIUS + tangent[0] * min[0] + radial[0] * min[1], tangent[1] * min[0] + radial[1] * min[1]],
    heading: halfAngle + Math.PI / 2, bottomHeight: BASE_RAIL_BOTTOM_HEIGHT });
  panel.name = name;
  return panel;
}

function createModuleSiding(module, spindles) {
  const { angle } = module.steps[0];
  const innerRadius = moduleSidingRadius(module);
  const neutralRadius = innerRadius + SIDING_THICKNESS / 2;
  const start = module.startIndex === 0 ? angle : 0;
  const end = module.steps.length * angle, cuts = [];
  if (!Number.isFinite(start) || start >= end) throw new RangeError("Curved siding requires a finite positive angular span.");
  for (const { spindle, index } of spindles) {
    const rotation = (index - module.startIndex) * angle, c = Math.cos(rotation), s = Math.sin(rotation);
    const footprint = spindle.footprint.map(([east, north]) =>
      [c * (east + INNER_RADIUS) - s * north, s * (east + INNER_RADIUS) + c * north]);
    const points = footprint.filter(point => {
      const radius = Math.hypot(...point);
      return radius >= innerRadius && radius <= innerRadius + SIDING_THICKNESS;
    });
    for (let i = 0; i < footprint.length; i++) {
      const a = footprint[i], b = footprint[(i + 1) % footprint.length], d = b.map((v, axis) => v - a[axis]);
      const aa = d[0] ** 2 + d[1] ** 2, bb = 2 * (a[0] * d[0] + a[1] * d[1]);
      for (const radius of [innerRadius, innerRadius + SIDING_THICKNESS]) {
        const discriminant = bb ** 2 - 4 * aa * (a[0] ** 2 + a[1] ** 2 - radius ** 2);
        if (discriminant < 0) continue;
        for (const t of [(-bb - Math.sqrt(discriminant)) / (2 * aa), (-bb + Math.sqrt(discriminant)) / (2 * aa)]) {
          if (t >= 0 && t <= 1) points.push(a.map((v, axis) => v + d[axis] * t));
        }
      }
    }
    if (!points.length) continue;
    const angles = points.map(([x, y]) => Math.atan2(y, x));
    const left = Math.max(start, Math.min(...angles)), right = Math.min(end, Math.max(...angles));
    if (right <= left) continue;
    const outward = footprint[1].map((v, i) => (v - footprint[0][i]) / spindle.width);
    // A through-cut clears both faces of the bent sheet, including the sloped spindle bottom.
    const floor = Math.min(...[left, right].flatMap(theta =>
      [innerRadius, innerRadius + SIDING_THICKNESS].map(radius =>
        spindle.bottomHeight + outward.reduce((sum, v, axis) =>
          sum + v * (radius * [Math.cos(theta), Math.sin(theta)][axis] - footprint[0][axis]), 0))));
    cuts.push({ left, right, floor });
  }
  const boundaries = distinctCoordinates([start, end, ...module.steps.map((_, i) => i * angle)
    .filter(value => value > start && value < end), ...cuts.flatMap(cut => [cut.left, cut.right])]);
  const top = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const left = boundaries[i], right = boundaries[i + 1], mid = (left + right) / 2;
    const height = Math.min(module.steps[Math.floor(mid / angle)].height,
      ...cuts.filter(cut => mid > cut.left && mid < cut.right).map(cut => cut.floor)) - FLOOR_CLEARANCE;
    if (height <= 0) throw new RangeError("Curved siding clearance removes the full panel height.");
    top.push([(left - start) * neutralRadius, height], [(right - start) * neutralRadius, height]);
  }
  const outline = [[0, 0], [(end - start) * neutralRadius, 0], ...top.reverse()];
  const profile = outline.filter((point, i) => i === 0 ||
    Math.hypot(...point.map((v, axis) => v - outline[i - 1][axis])) > 1e-8);
  const board = new BentPlywood({ profile, thickness: SIDING_THICKNESS, innerRadius, startAngle: start,
    center: [-INNER_RADIUS, 0], bottomHeight: FLOOR_CLEARANCE });
  board.name = "Side panel - curved";
  return board;
}

export class BackPanel extends FrameBoard {
  constructor(step) {
    const { leftRearUpright, leftUpright, rightRearUpright } = step.parts.uprights.boards;
    const left = (leftRearUpright ?? leftUpright).footprint, right = rightRearUpright.footprint;
    const [rearLeft, rearRight] = [step.footprint[3], step.footprint[2]];
    const length = Math.hypot(rearRight[0] - rearLeft[0], rearRight[1] - rearLeft[1]);
    const outward = [(rearLeft[1] - rearRight[1]) / length, (rearRight[0] - rearLeft[0]) / length];
    const offset = rearLeft[0] * outward[0] + rearLeft[1] * outward[1];
    const start = pointAtOffset(left[0], left[3], outward, offset);
    const end = pointAtOffset(right[1], right[2], outward, offset);
    const behind = point => point.map((value, axis) => value + outward[axis] * RISER_THICKNESS);
    const bottom = step.parts.bottomFrame.boards.rearSupportCrossPiece.bottomHeight;
    const top = step.parts.topFrame.boards.northCrossPiece.bottomHeight + 1.5;
    super([start, end, behind(end), behind(start)], {
      thickness: RISER_THICKNESS, width: top - bottom,
      length: Math.hypot(end[0] - start[0], end[1] - start[1]),
      material: PARTICLE_BOARD, stock: { kind: "plywood", thickness: RISER_THICKNESS },
    }, bottom);
  }
}

export class Newel extends UprightBoard {
  constructor(first, second, shoulderAscent = DEFAULT_SPINDLE_SHOULDER_ASCENT) {
    const size = FOUR_BY_FOUR_STOCK.width;
    const edge = first.footprint.slice(1, 3);
    const depth = Math.hypot(...edge[1].map((value, axis) => value - edge[0][axis]));
    const alongEdge = edge[1].map((value, axis) => (value - edge[0][axis]) / depth);
    const outward = [alongEdge[1], -alongEdge[0]];
    const innerEdge = edge.map(point => point.map((value, axis) => value + outward[axis] * (2 - size)));
    const support = first.parts.topFrame.boards.southCrossPiece;
    const front = pointAtOffset(...innerEdge, alongEdge,
      support.footprint[2].reduce((sum, value, axis) => sum + value * alongEdge[axis], 0));
    const back = front.map((value, axis) => value + alongEdge[axis] * size);
    const next = second.parts.topFrame.boards.southCrossPiece;
    const c = Math.cos(first.angle), s = Math.sin(first.angle), start = support.footprint[1];
    const end = [c * (next.footprint[1][0] + INNER_RADIUS) - s * next.footprint[1][1] - INNER_RADIUS,
      s * (next.footprint[1][0] + INNER_RADIUS) + c * next.footprint[1][1]];
    const run = Math.hypot(...end.map((value, axis) => value - start[axis]));
    const along = end.map((value, axis) => (value - start[axis]) / run);
    const rise = next.bottomHeight + next.width - support.bottomHeight - support.width;
    const reference = back.map((value, axis) => value + outward[axis] * size / 2);
    const top = support.bottomHeight + support.width + shoulderAscent + 3 +
      rise / run * reference.reduce((sum, value, axis) => sum + (value - start[axis]) * along[axis], 0);
    super(front, back, 1, top + TREAD_THICKNESS, {
      width: size, thickness: size, bottomHeight: FLOOR_CLEARANCE, frontSetback: front[1],
      stock: FOUR_BY_FOUR_STOCK,
    });
    this.material = OAK;
    const north = support.footprint[2][1];
    this.cornerBevel = {
      bottomHeight: Math.max(this.bottomHeight, support.bottomHeight),
      topHeight: Math.min(this.bottomHeight + this.length, support.bottomHeight + support.width),
      front: pointAtNorth(this.footprint[0], this.footprint[1], north),
      side: pointAtNorth(this.footprint[0], this.footprint[3], north),
    };
  }

  get bevelCutFaces() {
    const { front, side, bottomHeight, topHeight } = this.cornerBevel;
    const at = ([east, north], height) => [east, height, -north];
    return [
      { name: "Newel corner bevel", points: [
        at(side, bottomHeight), at(front, bottomHeight), at(front, topHeight), at(side, topHeight),
      ] },
      ...(bottomHeight > this.bottomHeight ? [{
        name: "Bevel bottom shoulder",
        points: [this.footprint[0], front, side].map(point => at(point, bottomHeight)),
      }] : []),
      { name: "Bevel top shoulder",
        points: [side, front, this.footprint[0]].map(point => at(point, topHeight)) },
    ];
  }

  get faceCuts() {
    const axes = this.getStockAxes(), origin = [this.footprint[0][0], this.bottomHeight, -this.footprint[0][1]];
    const { front, side, bottomHeight, topHeight } = this.cornerBevel;
    const distance = point => Math.hypot(...point.map((value, axis) => value - this.footprint[0][axis]));
    return this.bevelCutFaces.map(({ name, points }) => ({
      ...describeSurfaceCut(name,
        points.map(point => axes.map(axis => axis.reduce((sum, value, i) => sum + value * (point[i] - origin[i]), 0)))),
      ...(points.every(point => point[1] === points[0][1]) ? {
        cornerBevel: {
          start: bottomHeight - this.bottomHeight, end: topHeight - this.bottomHeight,
          frontWidth: distance(front), sideDepth: distance(side),
        },
      } : {}),
    }));
  }

  createStockGeometry() { return stockAlignedGeometry(this); }

  getPlacement() { return footprintPlacement(this); }

  createGeometry() {
    const [a, b, c, d] = this.footprint;
    const { front, side, bottomHeight, topHeight } = this.cornerBevel;
    const full = [a, front, b, c, d, side], beveled = [front, b, c, d, side];
    const top = this.bottomHeight + this.length, faces = [];
    const at = ([east, north], height) => [east, height, -north];
    const cap = (polygon, height, reverse) => {
      const center = [0, 1].map(axis => polygon.reduce((sum, point) => sum + point[axis], 0) / polygon.length);
      for (const [i, point] of polygon.entries()) {
        const face = [center, point, polygon[(i + 1) % polygon.length]].map(point => at(point, height));
        faces.push(reverse ? face.reverse() : face);
      }
    };
    cap(bottomHeight === this.bottomHeight ? beveled : full, this.bottomHeight, true);
    cap(full, top, false);
    // Split the uncut faces at both bevel endpoints so the stopped cut has no T-junctions.
    for (const [polygon, low, high] of [
      [full, this.bottomHeight, bottomHeight], [beveled, bottomHeight, topHeight], [full, topHeight, top],
    ]) {
      if (high <= low) continue;
      for (const [i, point] of polygon.entries()) {
        if (polygon === beveled && i === polygon.length - 1) continue;
        const next = polygon[(i + 1) % polygon.length];
        faces.push([at(point, low), at(next, low), at(next, high), at(point, high)]);
      }
    }
    faces.push(...this.bevelCutFaces.map(face => face.points));
    const endFaces = faces.flatMap((face, i) => face.every(point => point[1] === face[0][1]) ? [i] : []);
    return geometryFromFaces(faces, this.color, { ...this.grain, endFaces, endDirection: [1, 0, 0] });
  }
}

export class Spindle extends Board {
  constructor(step, upright, shoulderAscent = DEFAULT_SPINDLE_SHOULDER_ASCENT) {
    const size = TWO_BY_TWO_STOCK.width;
    const frontSupport = step.parts.topFrame.boards.southCrossPiece;
    const baselineStart = frontSupport.footprint[1];
    const c = Math.cos(step.angle), s = Math.sin(step.angle);
    const baselineEnd = [c * (baselineStart[0] + INNER_RADIUS) - s * baselineStart[1] - INNER_RADIUS,
      s * (baselineStart[0] + INNER_RADIUS) + c * baselineStart[1]];
    const along = upright.footprint[3].map((value, axis) =>
      (value - upright.footprint[0][axis]) / upright.width);
    const outward = [along[1], -along[0]];
    const run = baselineEnd.reduce((sum, value, axis) =>
      sum + (value - baselineStart[axis]) * along[axis], 0);
    const slope = step.stepRise / run;
    const descent = step.stepRise + 6;
    const frontHeight = shoulderAscent + 2 + descent;
    super({ length: frontHeight + slope * size, width: size, thickness: size,
      material: OAK, stock: TWO_BY_TWO_STOCK });
    const front = upright.footprint[1].map((value, axis) =>
      value + along[axis] * (upright.width - size) / 2);
    const back = front.map((value, axis) => value + along[axis] * size);
    const outer = point => point.map((value, axis) => value + outward[axis] * size);
    this.footprint = [front, outer(front), outer(back), back];
    this.bottomHeight = frontSupport.bottomHeight + frontSupport.width +
      slope * front.reduce((sum, value, axis) => sum + (value - baselineStart[axis]) * along[axis], 0)
      - descent;
    this.frontHeight = frontHeight;
    this.topRise = slope * size;
    this.notches = {
      endNear: { length: 2, lengths: [2, 2], depth: [0.5, 0.5] },
      endFar: { length: 2, lengths: [2, 2], depth: [0.5, 0.5] },
    };
  }

  getBlankShape() {
    const blank = super.getBlankShape();
    blank.vertices = blank.vertices.map(([x, y, z]) => [
      x === 0 ? z : this.frontHeight + (1 - y / this.thickness) * this.topRise, y, z,
    ]);
    return blank;
  }

  getStockAxes() {
    const front = this.footprint[0], back = this.footprint[3], outer = this.footprint[1];
    return [[0, 1, 0],
      [(front[0] - back[0]) / this.thickness, 0, -(front[1] - back[1]) / this.thickness],
      [(outer[0] - front[0]) / this.width, 0, -(outer[1] - front[1]) / this.width]];
  }

  getPlacement() {
    const back = this.footprint[3];
    return placementMatrix(this.getStockAxes(), [back[0], this.bottomHeight, -back[1]]);
  }

  createStockGeometry() {
    const depth = this.notches.endNear.depth[0], shoulder = this.notches.endNear.length;
    const width = this.width;
    const profiles = [this.frontHeight + this.topRise, this.frontHeight].map(top => [
      [0, 0], [top - shoulder, 0], [top - shoulder, depth], [top, depth],
      [top, width - depth], [top - shoulder, width - depth], [top - shoulder, width], [width, width],
    ]);
    return geometryFromProfiles(profiles, [0, this.thickness], this.color,
      { ...this.grain, origin: [0, 0, 0] }, [1, 3, 5, 7]);
  }

  createGeometry() {
    const geometry = this.createStockGeometry(), axes = this.getStockAxes(), back = this.footprint[3];
    const origin = [back[0], this.bottomHeight, -back[1]];
    for (let i = 0; i < geometry.positions.length; i += 3) {
      const position = geometry.positions.slice(i, i + 3), normal = geometry.normals.slice(i, i + 3);
      for (let axis = 0; axis < 3; axis++) {
        geometry.positions[i + axis] = origin[axis] + axes.reduce((sum, vector, j) =>
          sum + vector[axis] * position[j], 0);
        geometry.normals[i + axis] = axes.reduce((sum, vector, j) => sum + vector[axis] * normal[j], 0);
      }
    }
    return geometry;
  }
}

export class SpindleShim extends Board {
  constructor(footprint, topHeight, heading) {
    const across = [Math.cos(heading), 0, -Math.sin(heading)];
    const forward = [-Math.sin(heading), 0, -Math.cos(heading)];
    const axes = [[0, 1, 0], across, forward];
    const vertices = [false, true].flatMap(top => footprint.map(([east, north]) =>
      [east, topHeight - (top ? 0 : 4), -north]));
    const stockVertices = vertices.map(point => axes.map(axis =>
      axis.reduce((sum, value, i) => sum + value * point[i], 0)));
    const minimum = [0, 1, 2].map(axis => Math.min(...stockVertices.map(point => point[axis])));
    const maximum = [0, 1, 2].map(axis => Math.max(...stockVertices.map(point => point[axis])));
    if (maximum[1] - minimum[1] > TWO_BY_FOUR_STOCK.thickness + 1e-8) {
      throw new RangeError("A spindle shim must fit the thickness of oak 2x4 stock.");
    }
    super({ length: maximum[0] - minimum[0], thickness: TWO_BY_FOUR_STOCK.thickness,
      width: maximum[2] - minimum[2], material: OAK, stock: TWO_BY_FOUR_STOCK });
    this.vertices = vertices;
    this.stockVertices = stockVertices.map(point => point.map((value, axis) => value - minimum[axis]));
    this.axes = axes;
    this.faces = [[4, 5, 6, 7], [3, 2, 1, 0],
      ...footprint.map((_, i) => [i, (i + 1) % 4, (i + 1) % 4 + 4, i + 4])];
  }

  getStockAxes() { return this.axes; }

  getPlacement() {
    return placementMatrix(this.axes, this.vertices[0].map((value, axis) =>
      value - this.axes.reduce((sum, vector, i) => sum + vector[axis] * this.stockVertices[0][i], 0)));
  }

  get faceCuts() {
    return this.faces.map((indices, i) => {
      const points = indices.map(index => this.stockVertices[index]);
      return describeSurfaceCut(i < 2 ? ["Top end", "Bottom end"][i]
        : ["Front face", "Outer face", "Back face", "Inner face"][i - 2], points);
    });
  }

  createStockGeometry() {
    return geometryFromFaces(this.faces.map(face => face.map(index => this.stockVertices[index])), this.color,
      { ...this.grain, endFaces: [0, 1], origin: this.stockVertices[0] });
  }

  createGeometry() {
    return geometryFromFaces(this.faces.map(face => face.map(index => this.vertices[index])), this.color,
      { ...this.grain, direction: [0, 1, 0], endFaces: [0, 1], origin: this.vertices[0] });
  }
}

export class Step {
  constructor({ width, angle, height, stepRise,
    rearUprights = false, riserBottom, rightStepSupport = height > stepRise, frontStepSupportStock = null,
    extendRightEdge = false }) {
    validateDimensions("Step", { width, angle, height, stepRise });
    if (angle >= Math.PI) throw new RangeError("Step angle must be less than a half turn.");
    this.width = width;
    this.angle = angle;
    this.leftDepth = 2 * INNER_RADIUS * Math.sin(angle / 2);
    this.rightDepth = 2 * (INNER_RADIUS + width) * Math.sin(angle / 2);
    this.height = height;
    this.stepRise = stepRise;

    const insideBack = [INNER_RADIUS * (Math.cos(angle) - 1), INNER_RADIUS * Math.sin(angle)];
    this.footprint = [
      [0, 0],
      [width, 0],
      [insideBack[0] + width * Math.cos(this.angle),
        insideBack[1] + width * Math.sin(this.angle)],
      insideBack,
    ];
    // Straight framing sits on the castle's tangent plane, independently of the tread arc.
    const half = this.angle / 2, tangent = [Math.cos(half), Math.sin(half)];
    const tangentOffset = INNER_RADIUS * (1 - tangent[0]);
    this.footprint[0] = pointAtOffset(this.footprint[0], this.footprint[1], tangent, tangentOffset);
    this.footprint[3] = pointAtOffset(this.footprint[3], this.footprint[2], tangent, tangentOffset);
    if (extendRightEdge) {
      const c = Math.cos(this.angle), s = Math.sin(this.angle), back = this.footprint[2];
      const nextBack = [back[0] - s, back[1] + c];
      this.footprint[1] = pointAtNorth(back, nextBack, 0);
    }
    const frontSetback = rearUprights || height === stepRise || height === 2 * stepRise ? RISER_THICKNESS : 0;
    const bottomFrame = new BottomFrame();
    // Step 1's temporary uprights are replaced after fitting its top frame.
    const uprights = new Uprights(this.footprint, bottomFrame, height, rearUprights,
      frontSetback, frontSetback > 0,
      height === stepRise ? FLOOR_CLEARANCE : BASE_RAIL_TOP_HEIGHT);
    for (const key of ["leftUpright", "rightUpright"]) {
      if (!uprights.boards[key].frontBevel) uprights.boards[key].bevelFront(RISER_THICKNESS);
    }
    this.parts = { bottomFrame, uprights };
    this.parts.topFrame = new TopFrame(this.footprint, bottomFrame, uprights, height,
      rightStepSupport, frontStepSupportStock);
    const riserFootprint = this.footprint.map(point => [...point]);
    riserFootprint[0] = [0, 0];
    riserFootprint[3] = [0, this.footprint[3][1]];
    this.parts.riser = new Riser(riserFootprint, height, stepRise, riserBottom);
    this.parts.tread = new Tread({ width, angle: this.angle, height, extendRightEdge });
    this.parts.siding = new Siding(this.footprint, height);
  }

  get label() { return "Step"; }

  createGeometry(visibility = {}, includedBoards = null) {
    return combineGeometries(Object.entries(this.parts)
      .filter(([name]) => visibility[name] !== false)
      .map(([, part]) => includedBoards
        ? combineGeometries(Object.values(part.boards ? { ...part.boards, ...part.hardware } : { sheet: part })
          .filter(board => includedBoards.has(board)).map(board => board.createGeometry()))
        : part.createGeometry()));
  }
}

export function buildStairway(stairWidth = 24, stepCount = 9, moduleCount = Math.min(3, Math.floor(stepCount / 2)),
  spindleShoulderAscent = DEFAULT_SPINDLE_SHOULDER_ASCENT) {
  validateDimensions("Stairway", { stairWidth });
  if (!Number.isSafeInteger(stepCount) || stepCount < 4) {
    throw new RangeError("Stairway stepCount must be a safe integer of at least four.");
  }
  if (!Number.isSafeInteger(moduleCount) || moduleCount < 2 || moduleCount > Math.min(3, Math.floor(stepCount / 2))) {
    throw new RangeError("Stairway moduleCount must be an integer between 2 and 3, with at least two steps per module.");
  }
  if (!Number.isSafeInteger(spindleShoulderAscent) || spindleShoulderAscent < 25 || spindleShoulderAscent > 37) {
    throw new RangeError("Spindle shoulder ascent must be an integer between 25 and 37 inches.");
  }
  const angle = Math.PI / (2 * stepCount);
  const stepRise = Math.round(TOTAL_HEIGHT / (stepCount + 1) * 4) / 4;
  const landingRise = TOTAL_HEIGHT - stepCount * stepRise;
  const frontStepSupportStock = stepCount === 9
    ? ONE_BY_FOUR_STOCK
    : stepCount === 8
      ? { kind: "lumber", nominalSize: "2x4", thickness: SUPPORT_BEAM_THICKNESS, width: FRAME_WIDTH }
      : null;
  const stepsPerModule = Math.floor(stepCount / moduleCount);
  const bottomModuleSize = stepCount - (moduleCount - 1) * stepsPerModule;
  const steps = [];
  for (let i = 0; i < stepCount; i++) {
    const isModuleBack = i === bottomModuleSize - 1 ||
      (i >= bottomModuleSize && (i - bottomModuleSize + 1) % stepsPerModule === 0);
    steps.push(new Step({
      width: stairWidth, angle, height: (i + 1) * stepRise, stepRise,
      rearUprights: isModuleBack,
      rightStepSupport: i > 0,
      frontStepSupportStock: i === 0 ? frontStepSupportStock : null,
      extendRightEdge: i === 0,
    }));
  }
  delete steps[0].parts.topFrame.boards.northCrossPiece;
  const first = steps[0], cross = first.parts.topFrame.boards.southCrossPiece;
  first.parts.topFrame.boards.southCrossPiece = new FrameBoard([
    cross.footprint[0],
    cross.footprint[1],
    pointAtNorth(first.footprint[1], first.footprint[2], RISER_THICKNESS + TWO_BY_FOUR_STOCK.thickness),
    pointAtNorth(first.footprint[0], first.footprint[3], RISER_THICKNESS + TWO_BY_FOUR_STOCK.thickness),
  ], { thickness: TWO_BY_SIX_STOCK.thickness, width: TWO_BY_SIX_STOCK.width, length: cross.length,
    stock: TWO_BY_SIX_STOCK }, cross.bottomHeight + cross.width - TWO_BY_SIX_STOCK.width);
  addFrontStepSideSupports(steps[0], steps[1]);
  first.parts.newel = new Newel(first, steps[1], spindleShoulderAscent);
  const modules = [];
  for (let i = 0, startIndex = 0; i < moduleCount; i++) {
    const size = i === 0 ? bottomModuleSize : stepsPerModule;
    const moduleSteps = steps.slice(startIndex, startIndex + size);
    const boards = createSupportBeams(moduleSteps, i === 0);
    for (const step of moduleSteps) {
      if (step !== steps[0]) {
        addSupportCrossPiece(step);
        step.parts.frontSpindle = new Spindle(step, step.parts.uprights.boards.rightUpright, spindleShoulderAscent);
      }
    }
    addRearSupportCrossPiece(moduleSteps.at(-1));
    if (startIndex === 0) {
      finishFrontStepSupports(moduleSteps[0], moduleSteps[1]);
      addNewelFraming(moduleSteps[0], moduleSteps[1], boards);
    }
    const module = { startIndex, steps: moduleSteps, boards };
    const radius = moduleSidingRadius(module);
    boards.innerBaseRail = createModuleBaseRail(module, INNER_RADIUS, INNER_RADIUS + BASE_RAIL_WIDTH, "Base rail - inner");
    boards.outerBaseRail = createModuleBaseRail(module, radius - BASE_RAIL_WIDTH, radius, "Base rail - outer");
    addModuleCasters(module);
    for (const [j, step] of moduleSteps.entries()) {
      addSupportBlocks(step, startIndex > 0 && j === 0, steps[startIndex + j - 1]);
    }
    for (let j = 1; j < moduleSteps.length; j++) {
      if (moduleSteps[j] !== steps[1]) addBackSupportBlocks(moduleSteps[j], moduleSteps[j - 1]);
    }
    moduleSteps.at(-1).parts.backPanel = new BackPanel(moduleSteps.at(-1));
    const lastStep = moduleSteps.at(-1);
    lastStep.parts.rearSpindle = new Spindle(lastStep, lastStep.parts.uprights.boards.rightRearUpright, spindleShoulderAscent);
    modules.push({ startIndex, steps: moduleSteps, boards });
    startIndex += size;
  }
  const spindles = steps.flatMap((step, index) =>
    [step.parts.frontSpindle, step.parts.rearSpindle].filter(Boolean).map(spindle => ({ spindle, index })));
  for (let i = 0; i < modules.length - 1; i++) {
    const front = modules[i + 1].steps[0].parts.frontSpindle;
    const c = Math.cos(angle), s = Math.sin(angle);
    const boundary = front.footprint.slice(0, 2).map(([east, north]) => [
      c * (east + INNER_RADIUS) - s * north - INNER_RADIUS,
      s * (east + INNER_RADIUS) + c * north,
    ]);
    const step = modules[i].steps.at(-1), rear = step.parts.rearSpindle;
    const rearTop = rear.bottomHeight + rear.frontHeight + rear.topRise - 2;
    step.parts.spindleShim = new SpindleShim(
      [rear.footprint[3], rear.footprint[2], boundary[1], boundary[0]],
      rearTop, angle);
  }
  for (const module of modules) {
    module.boards.siding = createModuleSiding(module, spindles);
    for (const step of module.steps) {
      for (const post of [step.parts.frontSpindle, step.parts.rearSpindle].filter(Boolean)) {
        step.parts.tread.notchForPost(post);
      }
      if (step !== first) delete step.parts.siding;
    }
  }
  const footprints = new Map();
  const moduleSeparationRotation = (module, amount) =>
    ((module.startIndex + module.steps.length / 2) * angle - Math.PI / 4) * amount;
  const model = {
    label: "Curved stairway",
    stairWidth, stepCount, stepRise, landingRise, moduleCount, stepsPerModule, spindleShoulderAscent, steps, modules,
    totalHeight: TOTAL_HEIGHT,
    innerRadius: INNER_RADIUS,
    outerRadius: INNER_RADIUS + stairWidth,
    innerArcLength: INNER_ARC_LENGTH,
    createCastleGeometry,
    getModuleTransforms(moduleExplosion = 0) {
      if (!Number.isFinite(moduleExplosion) || moduleExplosion < 0 || moduleExplosion > 1) {
        throw new RangeError("Stairway moduleExplosion must be a finite number between 0 and 1.");
      }
      return modules.map(module => {
        const rotation = moduleSeparationRotation(module, moduleExplosion);
        const c = Math.cos(rotation), s = Math.sin(rotation);
        return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
      });
    },
    createFootprintGeometry(nodeId = null, stockAligned = false, inset = true, moduleExplosion = 0, moduleNumber = null) {
      if (!Number.isFinite(moduleExplosion) || moduleExplosion < 0 || moduleExplosion > 1) {
        throw new RangeError("Stairway moduleExplosion must be a finite number between 0 and 1.");
      }
      if (moduleNumber !== null && (!Number.isInteger(moduleNumber) || moduleNumber < 1 || moduleNumber > modules.length)) {
        throw new RangeError("Footprint moduleNumber must identify an existing module.");
      }
      if (nodeId === null && moduleExplosion > 0) {
        const geometry = this.createFootprintGeometry(null, stockAligned, inset, 0, moduleNumber);
        const positions = geometry.positions.slice();
        for (const module of modules) {
          const rotation = moduleSeparationRotation(module, moduleExplosion);
          const cosine = Math.cos(rotation), sine = Math.sin(rotation);
          for (let step = module.startIndex; step < module.startIndex + module.steps.length; step++) {
            const [start, end] = geometry.treadRanges[step];
            for (let i = start; i < end; i++) {
              const vertex = geometry.indices[i] * 3;
              const x = geometry.positions[vertex], z = geometry.positions[vertex + 2];
              positions[vertex] = cosine * x + sine * z;
              positions[vertex + 2] = -sine * x + cosine * z;
            }
          }
        }
        return { ...geometry, positions };
      }
      const key = `${nodeId ?? ""}:${stockAligned}:${inset}:${moduleNumber ?? ""}`;
      if (footprints.has(key)) return footprints.get(key);
      if (nodeId === null) {
        const seamInset = 1 / 16, backNormal = [Math.sin(angle), Math.cos(angle)];
        const referenceEdges = [], referenceArcs = [];
        const treads = steps.map((step, index) => {
          if (moduleNumber !== null) {
            const module = modules[moduleNumber - 1];
            if (index < module.startIndex || index >= module.startIndex + module.steps.length) {
              return combineGeometries([]);
            }
          }
          const piece = this.partTree.getLeaves().find(piece => piece.key === "tread" && piece.stepNumber === index + 1);
          const faces = [];
          const rotation = index * angle, cosine = Math.cos(rotation), sine = Math.sin(rotation);
          const frame = placementMatrix([[cosine, 0, -sine], [0, 1, 0], [sine, 0, cosine]],
            [cosine * INNER_RADIUS, 0, -sine * INNER_RADIUS]);
          const placement = composeTransforms(inverseTransform(frame), this.getPieceTransform(piece.id));
          const tread = transformGeometry(piece.part.createGeometry(), placement);
          const placePoint = (east, south, applyInset = true) => {
            let x = east + INNER_RADIUS, z = south;
            if (inset && applyInset && index > 0 && Math.abs(z) < 1e-5) z -= seamInset;
            else if (inset && applyInset && index < steps.length - 1 && Math.abs(x * backNormal[0] + z * backNormal[1]) < 1e-5) {
              x += backNormal[0] * seamInset;
              z += backNormal[1] * seamInset;
            }
            return [cosine * x + sine * z, 0, -sine * x + cosine * z];
          };
          const part = piece.part;
          const placeOutlinePoint = (x, z, applyInset = true) => placePoint(
            placement[12] + placement[0] * x + placement[8] * z,
            placement[14] + placement[2] * x + placement[10] * z, applyInset);
          for (const edge of part.outline.filter(edge => edge.type === "line")) {
            referenceEdges.push({ steps: [index + 1], edge: [edge.from, edge.to].map(([x, z]) =>
              placeOutlinePoint(x, z)) });
          }
          for (const arc of part.outline.filter(edge => edge.type === "arc")) {
            const [x, z] = arc.center;
            referenceArcs.push({
              center: placeOutlinePoint(x, z, false),
              radius: arc.radius, startAngle: arc.startAngle - Math.atan2(-placement[2], placement[0]) - rotation,
              sweepRadians: arc.sweepRadians, steps: [index + 1],
            });
          }
          for (let i = 0; i < tread.indices.length; i += 3) {
            const indices = [...tread.indices.slice(i, i + 3)];
            if (!indices.every(vertex => tread.normals[vertex * 3 + 1] > 1 - 1e-6)) continue;
            faces.push(indices.map(vertex =>
              placePoint(tread.positions[vertex * 3], tread.positions[vertex * 3 + 2])));
          }
          return geometryFromFaces(faces, [0.26, 0.28, 0.31],
            { direction: [1, 0, 0], endFaces: [], solidColor: true });
        });
        const geometry = combineGeometries(treads);
        geometry.referenceEdges = referenceEdges;
        geometry.referenceArcs = referenceArcs;
        let offset = 0;
        geometry.treadRanges = treads.map(tread => {
          const start = offset;
          offset += tread.indices.length;
          return [start, offset];
        });
        footprints.set(key, geometry);
        return geometry;
      }
      const node = this.partTree.getNode(nodeId), part = node.part;
      if (stockAligned && part.bend) return combineGeometries([]);
      const geometry = this.createFootprintGeometry(null, false, inset, 0, moduleNumber);
      const result = transformGeometry(geometry, inverseTransform(this.getPieceTransform(nodeId)));
      footprints.set(key, result);
      return result;
    },
    estimateNodeWeightLb(id = this.partTree.root.id) {
      return this.partTree.getLeaves(id)
        .filter(piece => ["lumber", "plywood"].includes(piece.kind))
        .reduce((sum, piece) => sum + piece.part.volume / 1728 * piece.part.material.density, 0);
    },
    createNodeGeometry(id, explosion = 0, moduleExplosion = 0, hiddenCategories = []) {
      this.partTree.getNode(id);
      return this.createGeometry({}, explosion, moduleExplosion, id, hiddenCategories);
    },
    getPieceTransform(id, explosion = 0, moduleExplosion = 0) {
      if (![explosion, moduleExplosion].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) {
        throw new RangeError("Piece explosion and moduleExplosion must be finite numbers between 0 and 1.");
      }
      const piece = this.partTree.getNode(id);
      if (!piece.part) throw new TypeError("An installation transform requires a Piece.");
      const module = this.partTree.getNode(piece.parentId).module;
      const rotation = (module.startIndex + piece.stepIndex * explosion) * angle +
        moduleSeparationRotation(module, moduleExplosion);
      const c = Math.cos(rotation), s = Math.sin(rotation);
      return composeTransforms(placementMatrix([[c, 0, -s], [0, 1, 0], [s, 0, c]], [0, 0, 0]), piece.transform);
    },
    createGeometry(visibility = {}, explosion = 0, moduleExplosion = 0, nodeId = null, hiddenCategories = []) {
      if (!Number.isFinite(explosion) || explosion < 0 || explosion > 1) {
        throw new RangeError("Stairway explosion must be a finite number between 0 and 1.");
      }
      if (!Number.isFinite(moduleExplosion) || moduleExplosion < 0 || moduleExplosion > 1) {
        throw new RangeError("Stairway moduleExplosion must be a finite number between 0 and 1.");
      }
      return combineGeometries(this.partTree.getLeaves(nodeId ?? this.partTree.root.id)
        .filter(piece => !hiddenCategories.includes(piece.category) && visibility[piece.visibilityKey] !== false)
        .map(piece => transformGeometry(piece.part.createGeometry(),
          this.getPieceTransform(piece.id, explosion, moduleExplosion))));
    },
  };
  model.parts = createPieces(model);
  model.partTree = new PieceTree(model);
  for (const [index, module] of modules.entries()) {
    module.estimatedWeightLb = model.estimateNodeWeightLb(`stairway/module-${index + 1}`);
  }
  model.estimatedWeightLb = modules.reduce((sum, module) => sum + module.estimatedWeightLb, 0);
  model.largestModuleWeightLb = Math.max(...modules.map(module => module.estimatedWeightLb));
  return model;
}

export function createInitialModel() {
  return buildStairway();
}
