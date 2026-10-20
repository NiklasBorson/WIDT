export const TOTAL_HEIGHT = 77;
export const INNER_ARC_LENGTH = 60.5;
export const INNER_RADIUS = INNER_ARC_LENGTH * 2 / Math.PI;
export const FRAME_THICKNESS = 0.75;
export const FRAME_WIDTH = 3.75;
export const RISER_THICKNESS = 1 / 8;
export const TREAD_THICKNESS = 1 / 2;
export const FLOOR_CLEARANCE = 1;

const FRAME_COLOR = [0.80, 0.60, 0.37];
const PLYWOOD_COLOR = [0.86, 0.72, 0.50];

function validateDimensions(component, dimensions) {
  for (const [name, value] of Object.entries(dimensions)) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`${component} ${name} must be a finite positive number of inches.`);
    }
  }
}

function geometryFromFaces(faces, color, { direction, endFaces, plyDirection, plyThickness = 0 }) {
  const positions = [], normals = [], colors = [], grain = [], indices = [];
  const origin = faces[0][0];
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
    let along = isEnd ? a.map(value => value / Math.hypot(...a)) : direction;
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
      // Across/along inches, cut-face flag, and illustrative ply thickness.
      grain.push(
        relative.reduce((sum, value, axis) => sum + value * across[axis], 0) / acrossLength,
        relative.reduce((sum, value, axis) => sum + value * along[axis], 0),
        isEnd ? 1 : 0, plyThickness,
      );
    }
    indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    grain: new Float32Array(grain),
    indices: new Uint16Array(indices),
  };
}

function extrudeFootprint(footprint, bottomHeight, height, color, grain) {
  // +X is East, +Y is Up, and -Z is North.
  const bottom = footprint.map(([east, north]) => [east, bottomHeight, -north]);
  const top = footprint.map(([east, north]) => [east, bottomHeight + height, -north]);
  const faces = [top, [...bottom].reverse()];
  for (let i = 0; i < footprint.length; i++) {
    const next = (i + 1) % footprint.length;
    faces.push([bottom[i], bottom[next], top[next], top[i]]);
  }
  return geometryFromFaces(faces, color, grain);
}

function footprintGrain(footprint, lengthEdge) {
  const start = footprint[lengthEdge], end = footprint[(lengthEdge + 1) % 4];
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
  return {
    direction: [(end[0] - start[0]) / length, 0, -(end[1] - start[1]) / length],
    endFaces: lengthEdge % 2 === 0 ? [3, 5] : [2, 4],
  };
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

export class Board {
  constructor({ thickness, width, length }) {
    validateDimensions("Board", { thickness, width, length });
    this.thickness = thickness;
    this.width = width;
    this.length = length;
  }

  get label() { return "Board"; }
  get color() { return FRAME_COLOR; }
  get grain() { return { direction: [1, 0, 0], endFaces: [0, 1] }; }

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
  constructor(length) {
    super({ thickness: FRAME_THICKNESS, width: FRAME_WIDTH, length });
  }

  get label() { return "1x4"; }
}

class FrameBoard extends Board {
  constructor(footprint, dimensions, bottomHeight = FLOOR_CLEARANCE, lengthEdge = 0) {
    super(dimensions);
    this.footprint = footprint;
    this.bottomHeight = bottomHeight;
    this.lengthEdge = lengthEdge;
  }

  get grain() { return footprintGrain(this.footprint, this.lengthEdge); }

  createGeometry() {
    return extrudeFootprint(this.footprint, this.bottomHeight, this.width, this.color, this.grain);
  }
}

function offsetCorner(corner, toward, inward) {
  const direction = toward.map((value, axis) => value - corner[axis]);
  const projection = direction[0] * inward[0] + direction[1] * inward[1];
  if (projection <= 0 || !Number.isFinite(projection)) {
    throw new RangeError("Bottom frame requires a convex radial footprint.");
  }
  return corner.map((value, axis) => value + direction[axis] * FRAME_THICKNESS / projection);
}

function pointAtNorth(front, back, north) {
  const fraction = (north - front[1]) / (back[1] - front[1]);
  return [front[0] + (back[0] - front[0]) * fraction, north];
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
  constructor(footprint, height, includeRearUprights = false) {
    const [a, b, c, d] = footprint;
    const leftLength = Math.hypot(d[0] - a[0], d[1] - a[1]);
    const rightLength = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const leftInward = [(d[1] - a[1]) / leftLength, (a[0] - d[0]) / leftLength];
    const rightInward = [(b[1] - c[1]) / rightLength, (c[0] - b[0]) / rightLength];
    // Offset the long faces by stock thickness, then trim their ends to the radial boundaries.
    const leftFront = offsetCorner(a, b, leftInward);
    const leftBack = offsetCorner(d, c, leftInward);
    const rightFront = offsetCorner(b, a, rightInward);
    const rightBack = offsetCorner(c, d, rightInward);
    const backDirection = [c[0] - d[0], c[1] - d[1]];
    if (leftFront[0] >= rightFront[0] ||
      (rightBack[0] - leftBack[0]) * backDirection[0] +
        (rightBack[1] - leftBack[1]) * backDirection[1] <= 0) {
      throw new RangeError("Bottom frame side boards leave no room for the cross brace.");
    }
    const leftUpright = new UprightBoard(leftFront, leftBack, 1, height);
    const rightUpright = new UprightBoard(rightFront, rightBack, -1, height);
    const [leftNear, leftFar] = [leftUpright.footprint[1], leftUpright.footprint[2]];
    const [rightNear, rightFar] = [rightUpright.footprint[0], rightUpright.footprint[3]];
    const braceFront = Math.max(leftNear[1], rightNear[1]);
    const braceBack = braceFront + FRAME_THICKNESS;
    if (braceBack > Math.min(leftFar[1], rightFar[1]) + 1e-8) {
      throw new RangeError("Bottom frame cross-piece does not fit between the uprights.");
    }
    const braceLeftFront = pointAtNorth(leftNear, leftFar, braceFront);
    const braceRightFront = pointAtNorth(rightNear, rightFar, braceFront);
    const braceLeftBack = pointAtNorth(leftNear, leftFar, braceBack);
    const braceRightBack = pointAtNorth(rightNear, rightFar, braceBack);
    if (braceLeftFront[0] >= braceRightFront[0] || braceLeftBack[0] >= braceRightBack[0]) {
      throw new RangeError("Bottom frame uprights leave no room for the cross-piece.");
    }
    const boardFootprints = {
      leftEdge: [a, leftFront, leftBack, d],
      rightEdge: [rightFront, b, c, rightBack],
      crossBrace: [braceLeftFront, braceRightFront, braceRightBack, braceLeftBack],
      leftUpright: leftUpright.footprint,
      rightUpright: rightUpright.footprint,
    };
    this.boards = {
      leftEdge: new FrameBoard(boardFootprints.leftEdge,
        { thickness: FRAME_THICKNESS, width: FRAME_WIDTH, length: leftLength }, FLOOR_CLEARANCE, 3),
      rightEdge: new FrameBoard(boardFootprints.rightEdge,
        { thickness: FRAME_THICKNESS, width: FRAME_WIDTH, length: rightLength }, FLOOR_CLEARANCE, 3),
      crossBrace: new FrameBoard(boardFootprints.crossBrace,
        { thickness: FRAME_THICKNESS, width: FRAME_WIDTH,
          length: braceRightFront[0] - braceLeftFront[0] }),
      leftUpright,
      rightUpright,
    };
    if (includeRearUprights) {
      const backWidth = Math.hypot(...backDirection);
      const backInward = [backDirection[1] / backWidth, -backDirection[0] / backWidth];
      this.boards.leftRearUpright = new UprightBoard(leftFront, leftBack, 1, height, backInward, leftUpright);
      this.boards.rightRearUpright = new UprightBoard(rightFront, rightBack, -1, height, backInward);
    }
    validateFootprints("Bottom frame", Object.values(this.boards).map(board => board.footprint), footprint);
  }

  createGeometry() {
    return combineGeometries(Object.values(this.boards).map(board => board.createGeometry()));
  }
}

class UprightBoard extends OneByFour {
  constructor(front, back, inwardSide, height, backInward = null, frontUpright = null) {
    super(height - TREAD_THICKNESS - FLOOR_CLEARANCE);
    const depth = Math.hypot(back[0] - front[0], back[1] - front[1]);
    const direction = back.map((value, axis) => (value - front[axis]) / depth);
    const inward = [direction[1] * inwardSide, -direction[0] * inwardSide];
    let near;
    if (backInward) {
      // Keep rectangular stock inside the far radial plane, with corner contact.
      const inset = Math.min(0,
        (inward[0] * backInward[0] + inward[1] * backInward[1]) * this.thickness);
      const offset = inset / (direction[0] * backInward[0] + direction[1] * backInward[1]);
      const end = back.map((value, axis) => value - direction[axis] * offset);
      if (frontUpright) {
        const availableWidth = end.reduce((sum, value, axis) =>
          sum + (value - frontUpright.footprint[2][axis]) * direction[axis], 0);
        this.width = Math.min(this.width, availableWidth);
        validateDimensions("Rear upright", { width: this.width });
      }
      near = end.map((value, axis) => value - direction[axis] * this.width);
    } else {
      // Keep the stock rectangular; its southernmost vertical corner touches the riser.
      near = pointAtNorth(front, back,
        RISER_THICKNESS - Math.min(0, inward[1] * this.thickness));
    }
    const nearInset = near.map((value, axis) => value + inward[axis] * this.thickness);
    const far = near.map((value, axis) => value + direction[axis] * this.width);
    const farInset = nearInset.map((value, axis) => value + direction[axis] * this.width);
    this.footprint = inwardSide > 0
      ? [near, nearInset, farInset, far]
      : [nearInset, near, far, farInset];
  }

  get grain() { return { direction: [0, 1, 0], endFaces: [0, 1] }; }

  createGeometry() {
    return extrudeFootprint(this.footprint, FLOOR_CLEARANCE, this.length, this.color, this.grain);
  }
}

export class TopFrame {
  constructor(footprint, bottomFrame, height) {
    const top = height - TREAD_THICKNESS;
    const sideBottom = Math.max(top - FRAME_WIDTH, FLOOR_CLEARANCE + FRAME_WIDTH);
    const sideHeight = top - sideBottom;
    validateDimensions("Top frame", { sideHeight });
    const createSide = board => {
      const [a, b, c, d] = board.footprint;
      const depth = Math.hypot(d[0] - a[0], d[1] - a[1]);
      const direction = d.map((value, axis) => (value - a[axis]) / depth);
      return new FrameBoard([
        pointAtNorth(a, d, RISER_THICKNESS),
        pointAtNorth(b, c, RISER_THICKNESS),
        c, d,
      ], {
        thickness: FRAME_THICKNESS, width: sideHeight,
        length: board.length - RISER_THICKNESS / direction[1],
      }, sideBottom, 3);
    };
    const leftEdge = createSide(bottomFrame.boards.leftEdge);
    const rightEdge = createSide(bottomFrame.boards.rightEdge);
    const [leftFront, leftBack] = [leftEdge.footprint[1], leftEdge.footprint[2]];
    const [rightFront, rightBack] = [rightEdge.footprint[0], rightEdge.footprint[3]];
    const [, , c, d] = footprint;
    const backWidth = Math.hypot(c[0] - d[0], c[1] - d[1]);
    const backInward = [(c[1] - d[1]) / backWidth, (d[0] - c[0]) / backWidth];
    const northLeftFront = offsetCorner(leftBack, leftFront, backInward);
    const northRightFront = offsetCorner(rightBack, rightFront, backInward);
    this.boards = {
      leftEdge,
      rightEdge,
      southCrossPiece: new FrameBoard([leftFront, rightFront,
        pointAtNorth(rightFront, rightBack, RISER_THICKNESS + FRAME_THICKNESS),
        pointAtNorth(leftFront, leftBack, RISER_THICKNESS + FRAME_THICKNESS)],
      { thickness: FRAME_THICKNESS, width: sideHeight, length: rightFront[0] - leftFront[0] },
      sideBottom),
      northCrossPiece: new FrameBoard([northLeftFront, northRightFront, rightBack, leftBack],
        { thickness: FRAME_THICKNESS, width: sideHeight,
          length: Math.hypot(rightBack[0] - leftBack[0], rightBack[1] - leftBack[1]) },
        sideBottom),
    };
    validateFootprints("Top frame", Object.values(this.boards).map(board => board.footprint), footprint);
  }

  createGeometry() {
    return combineGeometries(Object.values(this.boards).map(board => board.createGeometry()));
  }
}

export class Riser extends FrameBoard {
  get color() { return PLYWOOD_COLOR; }
  get grain() {
    return { ...super.grain, endFaces: [0, 1, 3, 5],
      plyDirection: [0, 0, 1], plyThickness: this.thickness / 3 };
  }

  constructor(footprint, height, stepRise) {
    const bottom = Math.max(FLOOR_CLEARANCE, height - stepRise);
    const riserHeight = height - TREAD_THICKNESS - bottom;
    validateDimensions("Riser", { height: riserHeight });
    const [a, b, c, d] = footprint;
    super([a, b, pointAtNorth(b, c, RISER_THICKNESS), pointAtNorth(a, d, RISER_THICKNESS)],
      { thickness: RISER_THICKNESS, width: riserHeight, length: b[0] - a[0] }, bottom);
  }
}

export class Tread extends Board {
  get color() { return PLYWOOD_COLOR; }
  get grain() {
    return { ...footprintGrain(this.footprint, 0), endFaces: [2, 3, 4, 5],
      plyDirection: [0, 1, 0], plyThickness: this.thickness / 5 };
  }

  constructor(footprint, height) {
    const [a, b, , d] = footprint;
    super({ thickness: TREAD_THICKNESS,
      width: Math.hypot(d[0] - a[0], d[1] - a[1]),
      length: Math.hypot(b[0] - a[0], b[1] - a[1]) });
    this.footprint = footprint;
    this.bottomHeight = height - TREAD_THICKNESS;
  }

  createGeometry() {
    return extrudeFootprint(this.footprint, this.bottomHeight, this.thickness, this.color, this.grain);
  }
}

export class Step {
  constructor({ frontWidth, backWidth, leftDepth, rightDepth, height, stepRise, isLast = false }) {
    validateDimensions("Step", { frontWidth, backWidth, leftDepth, rightDepth, height, stepRise });
    this.frontWidth = frontWidth;
    this.backWidth = backWidth;
    this.leftDepth = leftDepth;
    this.rightDepth = rightDepth;
    this.height = height;
    this.stepRise = stepRise;

    // Recover the shared inner radius from the four sides of a radial footprint.
    // The two inside corners are equally far from the front/back intersection.
    const ratio = (rightDepth ** 2 - leftDepth ** 2 - (backWidth - frontWidth) ** 2) /
      leftDepth ** 2;
    const sum = frontWidth + backWidth;
    const radius = (sum + Math.sqrt(sum ** 2 + 4 * ratio * frontWidth * backWidth)) /
      (2 * ratio);
    const sine = leftDepth / (2 * radius);
    if (!Number.isFinite(ratio) || ratio <= 0 || !Number.isFinite(sine) || sine <= 0 || sine >= 1) {
      throw new RangeError("Step edge lengths must form a nondegenerate radial footprint.");
    }
    this.angle = 2 * Math.asin(sine);
    const insideBack = [-leftDepth * sine, leftDepth * Math.sqrt(1 - sine ** 2)];
    this.footprint = [
      [0, 0],
      [frontWidth, 0],
      [insideBack[0] + backWidth * Math.cos(this.angle),
        insideBack[1] + backWidth * Math.sin(this.angle)],
      insideBack,
    ];
    this.parts = { bottomFrame: new BottomFrame(this.footprint, height, isLast) };
    this.parts.topFrame = new TopFrame(this.footprint, this.parts.bottomFrame, height);
    this.parts.riser = new Riser(this.footprint, height, stepRise);
    this.parts.tread = new Tread(this.footprint, height);
  }

  get label() { return "Step"; }

  createGeometry(visibility = {}) {
    return combineGeometries(Object.entries(this.parts)
      .filter(([name]) => visibility[name] !== false)
      .map(([, part]) => part.createGeometry()));
  }
}

export function buildStairway(bottomStairWidth = 24, topStairWidth = 24, stepCount = 8) {
  validateDimensions("Stairway", { bottomStairWidth, topStairWidth });
  if (!Number.isSafeInteger(stepCount) || stepCount < 1) {
    throw new RangeError("Stairway stepCount must be a positive safe integer.");
  }
  const angle = Math.PI / (2 * stepCount);
  const stepRise = TOTAL_HEIGHT / (stepCount + 1);
  const leftDepth = 2 * INNER_RADIUS * Math.sin(angle / 2);
  const steps = [];
  for (let i = 0; i < stepCount; i++) {
    const frontWidth = bottomStairWidth + (topStairWidth - bottomStairWidth) * i / stepCount;
    const backWidth = bottomStairWidth + (topStairWidth - bottomStairWidth) * (i + 1) / stepCount;
    const rightDepth = Math.hypot(backWidth - frontWidth,
      2 * Math.sqrt((INNER_RADIUS + frontWidth) * (INNER_RADIUS + backWidth)) *
        Math.sin(angle / 2));
    steps.push(new Step({
      frontWidth, backWidth, leftDepth, rightDepth, height: (i + 1) * stepRise, stepRise,
      isLast: i === stepCount - 1,
    }));
  }
  return {
    label: "Curved stairway",
    bottomStairWidth, topStairWidth, stepCount, stepRise, steps,
    totalHeight: TOTAL_HEIGHT,
    innerRadius: INNER_RADIUS,
    innerArcLength: INNER_ARC_LENGTH,
    createGeometry(visibility = {}, explosion = 0) {
      if (!Number.isFinite(explosion) || explosion < 0 || explosion > 1) {
        throw new RangeError("Stairway explosion must be a finite number between 0 and 1.");
      }
      return combineGeometries(steps.map((step, i) => {
        const geometry = step.createGeometry(visibility);
        const positions = new Float32Array(geometry.positions.length);
        const normals = new Float32Array(geometry.normals.length);
        const rotation = i * angle * (1 + explosion);
        const cosine = Math.cos(rotation), sine = Math.sin(rotation);
        for (let j = 0; j < geometry.positions.length; j += 3) {
          const x = geometry.positions[j] + INNER_RADIUS;
          const z = geometry.positions[j + 2];
          positions.set([cosine * x + sine * z, geometry.positions[j + 1],
            -sine * x + cosine * z], j);
          const nx = geometry.normals[j], nz = geometry.normals[j + 2];
          normals.set([cosine * nx + sine * nz, geometry.normals[j + 1],
            -sine * nx + cosine * nz], j);
        }
        return { positions, normals, colors: geometry.colors, grain: geometry.grain, indices: geometry.indices };
      }));
    },
  };
}

export function createInitialModel() {
  return buildStairway();
}
