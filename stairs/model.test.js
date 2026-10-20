import assert from "node:assert/strict";
import test from "node:test";
import {
  Board, OneByFour, Step, BottomFrame, TopFrame, Riser, Tread,
  buildStairway, createInitialModel, combineGeometries,
  TOTAL_HEIGHT, INNER_ARC_LENGTH, INNER_RADIUS,
  FRAME_THICKNESS, FRAME_WIDTH, RISER_THICKNESS, TREAD_THICKNESS, FLOOR_CLEARANCE,
} from "./model.js";

function close(actual, expected, tolerance = 1e-5) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
}

function assertOutwardGeometry({ positions, normals, indices }) {
  const center = [0, 1, 2].map(axis => {
    let sum = 0;
    for (let i = axis; i < positions.length; i += 3) sum += positions[i];
    return sum / (positions.length / 3);
  });
  const vertex = index => Array.from(positions.subarray(index * 3, index * 3 + 3));
  const subtract = (a, b) => a.map((value, index) => value - b[index]);
  for (let i = 0; i < indices.length; i += 3) {
    const a = vertex(indices[i]);
    const ab = subtract(vertex(indices[i + 1]), a);
    const ac = subtract(vertex(indices[i + 2]), a);
    const cross = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    const offset = indices[i] * 3;
    const normal = normals.subarray(offset, offset + 3);
    close(Math.hypot(...normal), 1);
    assert.ok(cross.reduce((sum, value, axis) => sum + value * normal[axis], 0) > 0);
    assert.ok(a.reduce((sum, value, axis) => sum + (value - center[axis]) * normal[axis], 0) > 0);
    close(ab.reduce((sum, value, axis) => sum + value * normal[axis], 0), 0);
    close(ac.reduce((sum, value, axis) => sum + value * normal[axis], 0), 0);
  }
}

function assertBoardsGeometry({ positions, normals, colors, indices }) {
  assert.equal(positions.length % (24 * 3), 0);
  assert.equal(colors.length, positions.length);
  assert.ok(colors.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
  for (let i = 0; i < positions.length / (24 * 3); i++) {
    assertOutwardGeometry({
      positions: positions.subarray(i * 24 * 3, (i + 1) * 24 * 3),
      normals: normals.subarray(i * 24 * 3, (i + 1) * 24 * 3),
      indices: indices.subarray(i * 36, (i + 1) * 36).map(index => index - i * 24),
    });
  }
}

function withinPolygon(point, polygon) {
  return polygon.every((start, i) => {
    const end = polygon[(i + 1) % polygon.length];
    return (end[0] - start[0]) * (point[1] - start[1]) -
      (end[1] - start[1]) * (point[0] - start[0]) >= -1e-8;
  });
}

function assertUprightJoints(step) {
  const { leftEdge, rightEdge } = step.parts.bottomFrame.boards;
  const { leftUpright, rightUpright, leftRearUpright, rightRearUpright } = step.parts.bottomFrame.boards;
  const sides = [
    [leftEdge.footprint[1], leftEdge.footprint[2], 1],
    [rightEdge.footprint[0], rightEdge.footprint[3], -1],
  ];
  for (const [board, sideIndex, contactIndices, rear] of [
    [leftUpright, 0, [0, 3]], [rightUpright, 1, [1, 2]],
    ...(leftRearUpright ? [
      [leftRearUpright, 0, [0, 3], true], [rightRearUpright, 1, [1, 2], true],
    ] : []),
  ]) {
    assert.ok(board instanceof OneByFour);
    assert.equal(board.thickness, FRAME_THICKNESS);
    if (rear && sideIndex === 0) {
      assert.ok(board.width > 0 && board.width <= FRAME_WIDTH);
    } else {
      assert.equal(board.width, FRAME_WIDTH);
    }
    close(board.length, step.height - TREAD_THICKNESS - FLOOR_CLEARANCE);
    if (rear) {
      const [, , c, d] = step.footprint;
      const length = Math.hypot(c[0] - d[0], c[1] - d[1]);
      const distances = board.footprint.map(point =>
        ((c[1] - d[1]) * (point[0] - d[0]) -
          (c[0] - d[0]) * (point[1] - d[1])) / length);
      close(Math.min(...distances), 0);
      assert.ok(distances.every(distance => distance >= -1e-8));
    } else {
      close(Math.min(...board.footprint.map(point => point[1])), RISER_THICKNESS);
    }
    assert.ok(board.footprint.every(point => withinPolygon(point, step.footprint)));
    const edges = board.footprint.map((point, i) =>
      board.footprint[(i + 1) % 4].map((value, axis) => value - point[axis]));
    for (let i = 0; i < 4; i++) {
      close(Math.hypot(...edges[i]), i % 2 === 0 ? FRAME_THICKNESS : board.width);
      close(edges[i][0] * edges[(i + 1) % 4][0] +
        edges[i][1] * edges[(i + 1) % 4][1], 0);
    }
    for (const [index, [front, back, inwardSide]] of sides.entries()) {
      const length = Math.hypot(back[0] - front[0], back[1] - front[1]);
      const direction = back.map((value, axis) => (value - front[axis]) / length);
      const inward = [direction[1] * inwardSide, -direction[0] * inwardSide];
      for (const [corner, point] of board.footprint.entries()) {
        const inset = (point[0] - front[0]) * inward[0] + (point[1] - front[1]) * inward[1];
        assert.ok(inset >= -1e-8, "Uprights must not overlap either side board");
        if (index === sideIndex && contactIndices.includes(corner)) {
          close(inset, 0);
          const along = (point[0] - front[0]) * direction[0] +
            (point[1] - front[1]) * direction[1];
          assert.ok(along >= -1e-8 && along <= length + 1e-8, "Contact must lie along the side board");
        }
      }
    }
    const geometry = board.createGeometry();
    const heights = geometry.positions.filter((_, i) => i % 3 === 1);
    close(Math.min(...heights), FLOOR_CLEARANCE);
    close(Math.max(...heights), step.height - TREAD_THICKNESS);
    assertOutwardGeometry(geometry);
  }
  assert.ok(leftUpright.footprint.every(point => !withinPolygon(point, rightUpright.footprint)));
  assert.ok(rightUpright.footprint.every(point => !withinPolygon(point, leftUpright.footprint)));
  if (leftRearUpright) {
    const [front, back] = sides[0];
    const direction = back.map((value, axis) => value - front[axis]);
    const length = Math.hypot(...direction);
    const gap = leftRearUpright.footprint[0].reduce((sum, value, axis) =>
      sum + (value - leftUpright.footprint[3][axis]) * direction[axis], 0) / length;
    assert.ok(gap >= -1e-8, "Rear-left upright must not overlap the front-left upright");
    if (leftRearUpright.width < FRAME_WIDTH) close(gap, 0);
  }
}

function assertTopFrameJoints(step) {
  const { leftEdge, rightEdge, southCrossPiece, northCrossPiece } = step.parts.topFrame.boards;
  const { riser } = step.parts;
  const top = step.height - TREAD_THICKNESS;
  const frameTop = FLOOR_CLEARANCE + FRAME_WIDTH;
  const riserBottom = Math.max(FLOOR_CLEARANCE, step.height - step.stepRise);
  const sideBottom = Math.max(top - FRAME_WIDTH, frameTop);
  assert.equal(riser.thickness, RISER_THICKNESS);
  close(riser.length, step.frontWidth);
  assert.deepEqual(riser.footprint[0], step.footprint[0]);
  assert.deepEqual(riser.footprint[1], step.footprint[1]);
  for (const index of [0, 1]) close(riser.footprint[index][1], 0);
  for (const index of [2, 3]) close(riser.footprint[index][1], RISER_THICKNESS);
  assert.ok(riser.footprint.every(point => withinPolygon(point, step.footprint)));
  for (const [point, start, end] of [
    [riser.footprint[3], step.footprint[0], step.footprint[3]],
    [riser.footprint[2], step.footprint[1], step.footprint[2]],
  ]) {
    close((end[0] - start[0]) * (point[1] - start[1]) -
      (end[1] - start[1]) * (point[0] - start[0]), 0);
  }
  for (const [board, bottom] of [
    [leftEdge, sideBottom], [rightEdge, sideBottom],
    [southCrossPiece, sideBottom], [northCrossPiece, sideBottom], [riser, riserBottom],
  ]) {
    assert.ok(board instanceof Board);
    close(board.bottomHeight, bottom);
    close(board.width, top - bottom);
    const geometry = board.createGeometry();
    assert.equal(geometry.positions.length, 24 * 3);
    assert.equal(geometry.indices.length, 36);
    const heights = geometry.positions.filter((_, i) => i % 3 === 1);
    close(Math.min(...heights), bottom);
    close(Math.max(...heights), top);
    assertOutwardGeometry(geometry);
  }
  for (const [board, base, outerIndices, upright, contactIndices, inwardIndices] of [
    [leftEdge, step.parts.bottomFrame.boards.leftEdge, [0, 3],
      step.parts.bottomFrame.boards.leftUpright, [0, 3], [1, 2]],
    [rightEdge, step.parts.bottomFrame.boards.rightEdge, [1, 2],
      step.parts.bottomFrame.boards.rightUpright, [1, 2], [0, 3]],
  ]) {
    assert.equal(board.thickness, FRAME_THICKNESS);
    for (const index of [0, 1]) close(board.footprint[index][1], RISER_THICKNESS);
    const [outerFront, outerBack] = outerIndices.map(index => base.footprint[index]);
    const depth = Math.hypot(outerBack[0] - outerFront[0], outerBack[1] - outerFront[1]);
    const direction = outerBack.map((value, axis) => (value - outerFront[axis]) / depth);
    for (const i of [2, 3]) assert.deepEqual(board.footprint[i], base.footprint[i]);
    assert.ok(board.footprint.every(point => withinPolygon(point, step.footprint)));
    for (const index of outerIndices) {
      const point = board.footprint[index];
      close((point[0] - outerFront[0]) * direction[1] -
        (point[1] - outerFront[1]) * direction[0], 0);
    }
    close(board.length, Math.hypot(
      board.footprint[outerIndices[1]][0] - board.footprint[outerIndices[0]][0],
      board.footprint[outerIndices[1]][1] - board.footprint[outerIndices[0]][1]));
    const [inwardFront, inwardBack] = inwardIndices.map(index => board.footprint[index]);
    for (const point of [outerFront, outerBack]) {
      close(Math.abs((inwardBack[0] - inwardFront[0]) * (point[1] - inwardFront[1]) -
        (inwardBack[1] - inwardFront[1]) * (point[0] - inwardFront[0])) /
        Math.hypot(inwardBack[0] - inwardFront[0], inwardBack[1] - inwardFront[1]),
      FRAME_THICKNESS);
    }
    for (const index of contactIndices) {
      const point = upright.footprint[index];
      close((inwardBack[0] - inwardFront[0]) * (point[1] - inwardFront[1]) -
        (inwardBack[1] - inwardFront[1]) * (point[0] - inwardFront[0]), 0);
      assert.ok(point[1] >= inwardFront[1] - 1e-8 && point[1] <= inwardBack[1] + 1e-8);
    }
  }
  assertTopCrossPieceJoints(step);
}

function assertTopCrossPieceJoints(step) {
  const { leftEdge, rightEdge, southCrossPiece, northCrossPiece } = step.parts.topFrame.boards;
  for (const board of [southCrossPiece, northCrossPiece]) {
    assert.equal(board.thickness, FRAME_THICKNESS);
    close(board.width, leftEdge.width);
    assert.ok(board.footprint.every(point => withinPolygon(point, step.footprint)));
    for (const [side, nearIndex, farIndex, contactIndices, inwardSide] of [
      [leftEdge, 1, 2, [0, 3], 1], [rightEdge, 0, 3, [1, 2], -1],
    ]) {
      const near = side.footprint[nearIndex], far = side.footprint[farIndex];
      const length = Math.hypot(far[0] - near[0], far[1] - near[1]);
      const direction = far.map((value, axis) => (value - near[axis]) / length);
      const inward = [direction[1] * inwardSide, -direction[0] * inwardSide];
      for (const [index, point] of board.footprint.entries()) {
        const inset = (point[0] - near[0]) * inward[0] + (point[1] - near[1]) * inward[1];
        assert.ok(inset >= -1e-8, "Top cross-pieces must not overlap the side boards");
        if (contactIndices.includes(index)) {
          close(inset, 0);
          const along = (point[0] - near[0]) * direction[0] + (point[1] - near[1]) * direction[1];
          assert.ok(along >= -1e-8 && along <= length + 1e-8);
        }
      }
    }
  }
  for (const index of [0, 1]) close(southCrossPiece.footprint[index][1], RISER_THICKNESS);
  for (const index of [2, 3]) {
    close(southCrossPiece.footprint[index][1], RISER_THICKNESS + FRAME_THICKNESS);
  }
  const [, , outsideBack, insideBack] = step.footprint;
  const backWidth = Math.hypot(outsideBack[0] - insideBack[0], outsideBack[1] - insideBack[1]);
  const inward = [(outsideBack[1] - insideBack[1]) / backWidth,
    (insideBack[0] - outsideBack[0]) / backWidth];
  for (const [index, point] of northCrossPiece.footprint.entries()) {
    const inset = (point[0] - insideBack[0]) * inward[0] + (point[1] - insideBack[1]) * inward[1];
    close(inset, index < 2 ? FRAME_THICKNESS : 0);
  }
  assert.deepEqual(northCrossPiece.footprint[2], rightEdge.footprint[3]);
  assert.deepEqual(northCrossPiece.footprint[3], leftEdge.footprint[2]);
  assert.ok(southCrossPiece.footprint.every(point => !withinPolygon(point, northCrossPiece.footprint)));
  assert.ok(northCrossPiece.footprint.every(point => !withinPolygon(point, southCrossPiece.footprint)));
}

function assertCrossPieceJoints(step) {
  const { crossBrace, leftUpright, rightUpright } = step.parts.bottomFrame.boards;
  const front = Math.min(...crossBrace.footprint.map(point => point[1]));
  const back = Math.max(...crossBrace.footprint.map(point => point[1]));
  assert.equal(crossBrace.thickness, FRAME_THICKNESS);
  assert.equal(crossBrace.width, FRAME_WIDTH);
  close(back - front, FRAME_THICKNESS);
  close(front, Math.max(leftUpright.footprint[1][1], rightUpright.footprint[0][1]));
  assert.ok(front > Math.max(...step.parts.riser.footprint.map(point => point[1])),
    "The cross-piece must be behind the riser, not in its plane");
  close(crossBrace.length, crossBrace.footprint[1][0] - crossBrace.footprint[0][0]);
  for (const [upright, nearIndex, farIndex, contactIndices, inwardSide] of [
    [leftUpright, 1, 2, [0, 3], 1], [rightUpright, 0, 3, [1, 2], -1],
  ]) {
    const near = upright.footprint[nearIndex], far = upright.footprint[farIndex];
    const direction = far.map((value, axis) => (value - near[axis]) / FRAME_WIDTH);
    const inward = [direction[1] * inwardSide, -direction[0] * inwardSide];
    for (const [index, point] of crossBrace.footprint.entries()) {
      const inset = (point[0] - near[0]) * inward[0] + (point[1] - near[1]) * inward[1];
      assert.ok(inset >= -1e-8, "The cross-piece must not overlap an upright");
      if (contactIndices.includes(index)) {
        close(inset, 0);
        const along = (point[0] - near[0]) * direction[0] + (point[1] - near[1]) * direction[1];
        assert.ok(along >= -1e-8 && along <= FRAME_WIDTH + 1e-8,
          "Each complete cross-piece end must meet its upright");
      }
    }
    assert.ok(upright.length >= FRAME_WIDTH);
  }
  const geometry = crossBrace.createGeometry();
  const heights = geometry.positions.filter((_, i) => i % 3 === 1);
  close(Math.min(...heights), FLOOR_CLEARANCE);
  close(Math.max(...heights), FLOOR_CLEARANCE + FRAME_WIDTH);
  assertOutwardGeometry(geometry);
}

test("1x4 components retain the specified actual dimensions and variable length", () => {
  const board = new OneByFour(12);
  assert.ok(board instanceof OneByFour);
  assert.ok(board instanceof Board);
  assert.equal(board.thickness, 0.75);
  assert.equal(board.width, 3.75);
  assert.equal(board.length, 12);
  assert.equal(board.label, "1x4");
  assert.equal(new OneByFour(24).length, 24);
});

test("Board creates a centered prism using length X, thickness Y, and width Z", () => {
  const board = new Board({ thickness: 2, width: 4, length: 10 });
  const { positions, normals, indices } = board.createGeometry();
  assert.equal(positions.length, 24 * 3);
  assert.equal(normals.length, positions.length);
  assert.equal(indices.length, 12 * 3);
  for (const [axis, extent] of [5, 1, 2].entries()) {
    const values = positions.filter((_, index) => index % 3 === axis);
    assert.equal(Math.min(...values), -extent);
    assert.equal(Math.max(...values), extent);
  }
  assert.ok(indices.every(index => index < positions.length / 3));
});

test("every triangle has the outward winding required by back-face culling", () => {
  assertOutwardGeometry(new OneByFour(12).createGeometry());
  for (const step of createInitialModel().steps) assertBoardsGeometry(step.createGeometry());
});

test("initial stairway has eight steps and preserves the hard arc and height requirements", () => {
  const model = createInitialModel();
  assert.equal(TOTAL_HEIGHT, 77);
  assert.equal(INNER_ARC_LENGTH, 60.5);
  assert.equal(INNER_RADIUS, 121 / Math.PI);
  assert.equal(model.stepCount, 8);
  assert.equal(model.steps.length, 8);
  assert.equal(model.bottomStairWidth, 24);
  assert.equal(model.topStairWidth, 24);
  assert.equal(model.totalHeight, 77);
  assert.equal(model.innerArcLength, 60.5);
  assert.equal(model.innerRadius, INNER_RADIUS);
  assert.equal(model.stepRise, 77 / 9);
  close(model.steps[0].height, 77 / 9);
  close(model.steps.at(-1).height + model.stepRise, 77);
});

test("step sides and elevations follow equal angles, linear widening, and an extra landing rise", () => {
  for (const [bottomWidth, topWidth, count] of [[24, 36, 8], [20, 20, 3], [36, 24, 5], [24, 36, 1]]) {
    const model = buildStairway(bottomWidth, topWidth, count);
    const angle = Math.PI / (2 * count);
    for (const [i, step] of model.steps.entries()) {
      assert.ok(step instanceof Step);
      const frontWidth = bottomWidth + (topWidth - bottomWidth) * i / count;
      const backWidth = bottomWidth + (topWidth - bottomWidth) * (i + 1) / count;
      close(step.frontWidth, frontWidth);
      close(step.backWidth, backWidth);
      close(step.leftDepth, 2 * INNER_RADIUS * Math.sin(angle / 2));
      close(step.rightDepth, Math.hypot(
        (INNER_RADIUS + backWidth) * Math.cos(angle) - (INNER_RADIUS + frontWidth),
        (INNER_RADIUS + backWidth) * Math.sin(angle)));
      close(step.height, (i + 1) * 77 / (count + 1));
      close(step.stepRise, model.stepRise);
      close(step.angle, angle);
      const [insideFront, outsideFront, outsideBack, insideBack] = step.footprint;
      assert.deepEqual(insideFront, [0, 0]);
      assert.deepEqual(outsideFront, [frontWidth, 0]);
      close(Math.hypot(...insideBack), step.leftDepth);
      close(Math.hypot(...outsideBack.map((value, axis) => value - outsideFront[axis])), step.rightDepth);
      close(Math.hypot(...outsideBack.map((value, axis) => value - insideBack[axis])), step.backWidth);
    }
  }
});

test("Step reconstructs its local footprint and named parts without a global radius", () => {
  const radius = 18, angle = Math.PI / 6, frontWidth = 8, backWidth = 9, height = 8;
  const step = new Step({
    frontWidth, backWidth, height, stepRise: height,
    leftDepth: 2 * radius * Math.sin(angle / 2),
    rightDepth: Math.hypot((radius + backWidth) * Math.cos(angle) - (radius + frontWidth),
      (radius + backWidth) * Math.sin(angle)),
  });
  close(step.footprint[3][0], radius * (Math.cos(angle) - 1));
  close(step.footprint[3][1], radius * Math.sin(angle));
  close(step.angle, angle);
  const geometry = step.createGeometry();
  assert.equal(geometry.positions.length, 11 * 24 * 3);
  assert.equal(geometry.normals.length, geometry.positions.length);
  assert.equal(geometry.indices.length, 11 * 36);
  const { leftEdge, rightEdge, crossBrace } = step.parts.bottomFrame.boards;
  const frameGeometry = combineGeometries([leftEdge, rightEdge, crossBrace]
    .map(board => board.createGeometry()));
  for (let i = 1; i < frameGeometry.positions.length; i += 3) {
    assert.ok(frameGeometry.positions[i] === FLOOR_CLEARANCE ||
      frameGeometry.positions[i] === FLOOR_CLEARANCE + FRAME_WIDTH);
  }
  assertUprightJoints(step);
  assertTopFrameJoints(step);
  assertCrossPieceJoints(step);
  assert.deepEqual(Array.from(geometry.positions.subarray(0, 3)), [0, 4.75, -0]);
  assertBoardsGeometry(geometry);
});

test("world geometry translates each step East then rotates its position and normals about the origin", () => {
  const model = createInitialModel();
  const geometry = model.createGeometry();
  const verticesPerStep = 11 * 24;
  assert.equal(geometry.positions.length, (8 * verticesPerStep + 2 * 24) * 3);
  assert.equal(geometry.normals.length, geometry.positions.length);
  assert.equal(geometry.indices.length, (8 * 11 + 2) * 36);
  const angle = Math.PI / 16;
  for (const [i, step] of model.steps.entries()) {
    const local = step.createGeometry();
    const offset = i * verticesPerStep * 3;
    const cosine = Math.cos(i * angle), sine = Math.sin(i * angle);
    for (let j = 0; j < local.positions.length; j += 3) {
      const east = local.positions[j] + INNER_RADIUS, north = -local.positions[j + 2];
      close(geometry.positions[offset + j], east * cosine - north * sine);
      close(geometry.positions[offset + j + 1], local.positions[j + 1]);
      close(geometry.positions[offset + j + 2], -(east * sine + north * cosine));
      close(geometry.normals[offset + j], cosine * local.normals[j] + sine * local.normals[j + 2]);
      close(geometry.normals[offset + j + 1], local.normals[j + 1]);
      close(geometry.normals[offset + j + 2], -sine * local.normals[j] + cosine * local.normals[j + 2]);
      assert.deepEqual(geometry.colors.subarray(offset + j, offset + j + 3),
        local.colors.subarray(j, j + 3));
    }
    close(geometry.positions[offset], INNER_RADIUS * Math.cos(i * angle));
    close(geometry.positions[offset + 2], -INNER_RADIUS * Math.sin(i * angle));
    const stepVertices = (i === model.stepCount - 1 ? 13 : 11) * 24;
    for (let j = i * 11 * 36; j < i * 11 * 36 + stepVertices / 24 * 36; j++) {
      assert.ok(geometry.indices[j] >= i * verticesPerStep &&
        geometry.indices[j] < i * verticesPerStep + stepVertices);
    }
  }
  assertBoardsGeometry(geometry);
  close(geometry.positions[0], INNER_RADIUS);
  close(geometry.positions[1], FLOOR_CLEARANCE + FRAME_WIDTH);
  close(geometry.positions[2], 0);
  const lastInsideBack = 7 * verticesPerStep * 3 + 3 * 3;
  close(geometry.positions[lastInsideBack], 0);
  close(geometry.positions[lastInsideBack + 2], -INNER_RADIUS);
  const lastOutsideBack = 7 * verticesPerStep * 3 + 24 * 3 + 2 * 3;
  close(geometry.positions[lastOutsideBack], 0);
  close(geometry.positions[lastOutsideBack + 2], -(INNER_RADIUS + model.topStairWidth));
});

test("explosion increases only step rotation while preserving dimensions, heights and materials", () => {
  for (const [bottom, top, count] of [[20, 36, 7], [20, 36, 8], [36, 20, 9], [24, 24, 10], [24, 36, 1]]) {
    const model = buildStairway(bottom, top, count);
    const original = model.createGeometry();
    const originalSteps = JSON.stringify(model.steps);
    assert.deepEqual(model.createGeometry({}, 0), original);
    for (const explosion of [0.25, 0.5, 1]) {
      const geometry = model.createGeometry({}, explosion);
      assert.deepEqual(geometry.colors, original.colors);
      assert.deepEqual(geometry.indices, original.indices);
      assert.equal(geometry.positions.length, original.positions.length);
      let offset = 0;
      for (const [i, step] of model.steps.entries()) {
        const length = step.createGeometry().positions.length;
        const extraAngle = i * Math.PI / (2 * count) * explosion;
        const cosine = Math.cos(extraAngle), sine = Math.sin(extraAngle);
        close(Math.atan2(-geometry.positions[offset + 2], geometry.positions[offset]),
          i * Math.PI / (2 * count) * (1 + explosion));
        for (let j = offset; j < offset + length; j += 3) {
          close(geometry.positions[j], cosine * original.positions[j] + sine * original.positions[j + 2]);
          close(geometry.positions[j + 1], original.positions[j + 1]);
          close(geometry.positions[j + 2], -sine * original.positions[j] + cosine * original.positions[j + 2]);
          close(geometry.normals[j], cosine * original.normals[j] + sine * original.normals[j + 2]);
          close(geometry.normals[j + 1], original.normals[j + 1]);
          close(geometry.normals[j + 2], -sine * original.normals[j] + cosine * original.normals[j + 2]);
        }
        offset += length;
      }
      assertBoardsGeometry(geometry);
    }
    assert.equal(JSON.stringify(model.steps), originalSteps);
    assert.deepEqual(model.createGeometry(), original);
  }
});

test("explosion rejects invalid animation progress explicitly", () => {
  const model = createInitialModel();
  for (const value of [-1, 1.01, NaN, Infinity, null, false, "1"]) {
    assert.throws(() => model.createGeometry({}, value), {
      name: "RangeError", message: "Stairway explosion must be a finite number between 0 and 1.",
    });
  }
});

test("combining many component meshes selects 32-bit indices without wrapping references", () => {
  const board = new OneByFour(12).createGeometry();
  const geometry = combineGeometries(Array(2731).fill(board));
  assert.ok(geometry.indices instanceof Uint32Array);
  assert.equal(geometry.positions.length, 2731 * 24 * 3);
  assert.equal(geometry.indices.at(-1), 2731 * 24 - 1);
  assert.ok(geometry.indices.every(index => index < geometry.positions.length / 3));
});

test("all slider extremes, step counts, and fractional widths produce valid named parts", () => {
  for (const bottomWidth of [20, 24, 36]) {
    for (const topWidth of [20, 24.5, 36]) {
      for (const count of [7, 8, 9, 10]) {
        const model = buildStairway(bottomWidth, topWidth, count);
        const geometry = model.createGeometry();
        assert.equal(geometry.positions.length, (count * 11 + 2) * 24 * 3);
        assert.equal(geometry.indices.length, (count * 11 + 2) * 36);
        assert.ok(geometry.positions.every(Number.isFinite));
        assert.ok(geometry.normals.every(Number.isFinite));
        close(model.steps[0].frontWidth, bottomWidth);
        close(model.steps.at(-1).backWidth, topWidth);
        close(model.steps.at(-1).height + model.stepRise, TOTAL_HEIGHT);
        for (const step of model.steps) {
          assertBoardsGeometry(step.createGeometry());
          assertUprightJoints(step);
          assertTopFrameJoints(step);
          assertCrossPieceJoints(step);
          const center = [0, 1].map(axis =>
            step.footprint.reduce((sum, point) => sum + point[axis], 0) / 4);
          for (const board of Object.values(step.parts.bottomFrame.boards)) {
            assert.equal(withinPolygon(center, board.footprint), false);
            assert.ok(board.footprint.every(point => withinPolygon(point, step.footprint)));
          }
        }
      }
    }
  }
});

test("bottomFrame has full-depth 1x4 sides, two uprights, and a 1x4 cross-piece between them", () => {
  assert.equal(FRAME_THICKNESS, 0.75);
  assert.equal(FRAME_WIDTH, 3.75);
  assert.equal(RISER_THICKNESS, 0.125);
  assert.equal(TREAD_THICKNESS, 0.5);
  assert.equal(FLOOR_CLEARANCE, 1);
  const steps = buildStairway(24, 36, 8).steps;
  for (const [i, step] of steps.entries()) {
    assert.deepEqual(Object.keys(step.parts), ["bottomFrame", "topFrame", "riser", "tread"]);
    assert.ok(step.parts.bottomFrame instanceof BottomFrame);
    const { leftEdge, rightEdge, crossBrace } = step.parts.bottomFrame.boards;
    assert.deepEqual(Object.keys(step.parts.bottomFrame.boards),
      ["leftEdge", "rightEdge", "crossBrace", "leftUpright", "rightUpright",
        ...(i === steps.length - 1 ? ["leftRearUpright", "rightRearUpright"] : [])]);
    for (const board of [leftEdge, rightEdge, crossBrace]) {
      assert.ok(board instanceof Board);
      assert.equal(board.width, FRAME_WIDTH);
      const geometry = board.createGeometry();
      assert.equal(geometry.positions.length, 24 * 3);
      assert.equal(geometry.indices.length, 36);
      const heights = geometry.positions.filter((_, i) => i % 3 === 1);
      close(Math.min(...heights), 1);
      close(Math.max(...heights), 4.75);
    }
    assert.equal(leftEdge.thickness, FRAME_THICKNESS);
    assert.equal(rightEdge.thickness, FRAME_THICKNESS);
    assert.equal(crossBrace.thickness, FRAME_THICKNESS);
    close(leftEdge.length, step.leftDepth);
    close(rightEdge.length, step.rightDepth);
    assert.deepEqual(leftEdge.footprint[0], step.footprint[0]);
    assert.deepEqual(leftEdge.footprint[3], step.footprint[3]);
    assert.deepEqual(rightEdge.footprint[1], step.footprint[1]);
    assert.deepEqual(rightEdge.footprint[2], step.footprint[2]);
    for (const [board, start, end, insetIndices] of [
      [leftEdge, step.footprint[0], step.footprint[3], [1, 2]],
      [rightEdge, step.footprint[1], step.footprint[2], [0, 3]],
    ]) {
      const dx = end[0] - start[0], dy = end[1] - start[1];
      for (const index of insetIndices) {
        const point = board.footprint[index];
        close(Math.abs(dx * (point[1] - start[1]) - dy * (point[0] - start[0])) /
          Math.hypot(dx, dy), FRAME_THICKNESS);
      }
    }
    assertCrossPieceJoints(step);
  }
});

test("uprights belong to bottomFrame and retain their side-face and riser-corner contact", () => {
  for (const step of createInitialModel().steps) {
    assert.equal("uprights" in step.parts, false);
    assertUprightJoints(step);
  }
});

test("only the last step adds two rear uprights at the far radial boundary", () => {
  for (const bottom of [20, 24, 36]) {
    for (const top of [20, 24.5, 36]) {
      for (const count of [7, 8, 9, 10]) {
        const model = buildStairway(bottom, top, count);
        for (const [i, step] of model.steps.entries()) {
          const { boards } = step.parts.bottomFrame;
          const isLast = i === count - 1;
          assert.equal(Object.keys(boards).length, isLast ? 7 : 5);
          assert.equal("leftRearUpright" in boards, isLast);
          assert.equal("rightRearUpright" in boards, isLast);
          assertUprightJoints(step);
          assert.equal(step.createGeometry({ bottomFrame: false }).indices.length, 6 * 36);
        }
      }
    }
  }
  const singleStep = buildStairway(24, 24, 1).steps[0];
  assert.ok(singleStep.parts.bottomFrame.boards.leftRearUpright instanceof OneByFour);
  assert.ok(singleStep.parts.bottomFrame.boards.rightRearUpright instanceof OneByFour);
  assertUprightJoints(singleStep);
});

test("rear-left upright stays full width when possible and is narrowed only when necessary", () => {
  for (const count of [7, 8, 9, 10]) {
    const last = buildStairway(24, 24, count).steps.at(-1);
    const { leftUpright, leftRearUpright, rightRearUpright } = last.parts.bottomFrame.boards;
    assert.equal(leftUpright.width, FRAME_WIDTH);
    assert.equal(rightRearUpright.width, FRAME_WIDTH);
    if (count <= 8) {
      close(leftRearUpright.width, FRAME_WIDTH);
    } else {
      assert.ok(leftRearUpright.width < FRAME_WIDTH);
    }
    assertUprightJoints(last);
  }
});

test("topFrame has trimmed sides and two end cross-pieces, reducing step 0 height only when necessary", () => {
  for (const count of [7, 8, 9, 10]) {
    const model = buildStairway(24, 24, count);
    for (const [i, step] of model.steps.entries()) {
      assert.ok(step.parts.topFrame instanceof TopFrame);
      assert.deepEqual(Object.keys(step.parts.topFrame.boards),
        ["leftEdge", "rightEdge", "southCrossPiece", "northCrossPiece"]);
      assertTopFrameJoints(step);
      const { leftEdge, rightEdge } = step.parts.topFrame.boards;
      if (i === 0 && count >= 8) {
        close(leftEdge.bottomHeight, FLOOR_CLEARANCE + FRAME_WIDTH);
        close(rightEdge.bottomHeight, FLOOR_CLEARANCE + FRAME_WIDTH);
        close(leftEdge.width, step.height - TREAD_THICKNESS - FLOOR_CLEARANCE - FRAME_WIDTH);
        assert.ok(leftEdge.width < FRAME_WIDTH);
      } else {
        close(leftEdge.width, FRAME_WIDTH);
        close(rightEdge.width, FRAME_WIDTH);
      }
    }
  }
});

test("riser is independent and starts at the previous step elevation, with floor clearance on step 0", () => {
  for (const count of [7, 8, 9, 10]) {
    const model = buildStairway(24, 24, count);
    for (const [i, step] of model.steps.entries()) {
      const { riser } = step.parts;
      assert.ok(riser instanceof Riser);
      assert.ok(riser instanceof Board);
      close(riser.bottomHeight, i === 0 ? FLOOR_CLEARANCE : model.steps[i - 1].height);
      close(riser.width, model.stepRise - TREAD_THICKNESS - (i === 0 ? FLOOR_CLEARANCE : 0));
      assertTopFrameJoints(step);
    }
  }
});

test("top-frame backs stop at the next riser's south plane without changing tread clearance", () => {
  for (const [bottom, top, count] of [[20, 36, 8], [36, 20, 9], [24, 24, 10]]) {
    const model = buildStairway(bottom, top, count);
    const angle = Math.PI / (2 * count);
    const worldPoint = (point, index) => [
      (INNER_RADIUS + point[0]) * Math.cos(index * angle) - point[1] * Math.sin(index * angle),
      (INNER_RADIUS + point[0]) * Math.sin(index * angle) + point[1] * Math.cos(index * angle),
    ];
    for (let i = 0; i < count - 1; i++) {
      const step = model.steps[i], next = model.steps[i + 1];
      const origin = worldPoint(next.parts.riser.footprint[0], i + 1);
      const north = [-Math.sin((i + 1) * angle), Math.cos((i + 1) * angle)];
      for (const board of Object.values(step.parts.topFrame.boards)) {
        for (const point of board.footprint) {
          const world = worldPoint(point, i);
          assert.ok((world[0] - origin[0]) * north[0] +
            (world[1] - origin[1]) * north[1] <= 1e-8);
        }
      }
      const rear = step.parts.topFrame.boards.northCrossPiece;
      for (const point of rear.footprint.slice(2)) {
        const world = worldPoint(point, i);
        close((world[0] - origin[0]) * north[0] + (world[1] - origin[1]) * north[1], 0);
      }
      close(next.parts.riser.bottomHeight - (rear.bottomHeight + rear.width), TREAD_THICKNESS);
    }
  }
});

test("treads cover the top frame and riser, with their front edge on the front radial boundary", () => {
  for (const bottom of [20, 24, 36]) {
    for (const top of [20, 24.5, 36]) {
      for (const count of [7, 8, 9, 10]) {
        for (const step of buildStairway(bottom, top, count).steps) {
          const { tread, topFrame, riser } = step.parts;
          const { leftEdge, rightEdge } = topFrame.boards;
          assert.ok(tread instanceof Tread);
          assert.ok(tread instanceof Board);
          assert.equal(tread.thickness, TREAD_THICKNESS);
          assert.deepEqual(tread.footprint, step.footprint);
          assert.deepEqual(tread.footprint, [riser.footprint[0], riser.footprint[1],
            rightEdge.footprint[2], leftEdge.footprint[3]]);
          for (const board of Object.values(topFrame.boards)) {
            close(tread.bottomHeight, board.bottomHeight + board.width);
            assert.ok(board.footprint.every(point => withinPolygon(point, tread.footprint)));
          }
          for (const point of tread.footprint.slice(0, 2)) close(point[1], 0);
          assert.ok(riser.footprint.every(point => withinPolygon(point, tread.footprint)));
          close(tread.bottomHeight, riser.bottomHeight + riser.width);
          const geometry = tread.createGeometry();
          const heights = geometry.positions.filter((_, i) => i % 3 === 1);
          close(Math.min(...heights), step.height - TREAD_THICKNESS);
          close(Math.max(...heights), step.height);
          assertOutwardGeometry(geometry);
        }
      }
    }
  }
});

test("risers and treads share a lighter plywood color distinct from all framing", () => {
  const model = createInitialModel();
  for (const step of model.steps) {
    const { bottomFrame, topFrame, riser, tread } = step.parts;
    assert.deepEqual(riser.color, tread.color);
    for (const board of [...Object.values(bottomFrame.boards), ...Object.values(topFrame.boards)]) {
      assert.deepEqual(board.color, new OneByFour(12).color);
      assert.notDeepEqual(board.color, riser.color);
      for (let axis = 0; axis < 3; axis++) assert.ok(riser.color[axis] > board.color[axis]);
    }
    for (const board of [...Object.values(bottomFrame.boards), ...Object.values(topFrame.boards),
      riser, tread]) {
      const { positions, colors } = board.createGeometry();
      assert.equal(colors.length, positions.length);
      for (let i = 0; i < colors.length; i++) close(colors[i], board.color[i % 3]);
    }
  }
});

test("global part visibility filters geometry without changing part placement or the model", () => {
  const model = createInitialModel();
  const original = model.createGeometry();
  for (const bottomFrame of [false, true]) {
    for (const topFrame of [false, true]) {
      for (const mask of [0, 1, 2, 3]) {
        const riser = Boolean(mask & 1), tread = Boolean(mask & 2);
        const visibility = { bottomFrame, topFrame, riser, tread };
        const boardsPerStep = (bottomFrame ? 5 : 0) + (topFrame ? 4 : 0) +
          (riser ? 1 : 0) + (tread ? 1 : 0);
        const geometry = model.createGeometry(visibility);
        const boardCount = model.stepCount * boardsPerStep + (bottomFrame ? 2 : 0);
        assert.equal(geometry.positions.length, boardCount * 24 * 3);
        assert.equal(geometry.normals.length, geometry.positions.length);
        assert.equal(geometry.indices.length, boardCount * 36);
        assert.ok(geometry.indices.every(index => index < geometry.positions.length / 3));
        assertBoardsGeometry(geometry);
        const exploded = model.createGeometry(visibility, 1);
        assert.deepEqual(exploded.indices, geometry.indices);
        assert.deepEqual(exploded.colors, geometry.colors);
        assert.equal(exploded.positions.length, geometry.positions.length);
        assertBoardsGeometry(exploded);
        for (const step of model.steps) {
          const expected = combineGeometries([
            ...(bottomFrame ? [step.parts.bottomFrame.createGeometry()] : []),
            ...(topFrame ? [step.parts.topFrame.createGeometry()] : []),
            ...(riser ? [step.parts.riser.createGeometry()] : []),
            ...(tread ? [step.parts.tread.createGeometry()] : []),
          ]);
          assert.deepEqual(step.createGeometry(visibility), expected);
        }
        if (boardsPerStep > 0) {
          const heights = geometry.positions.filter((_, i) => i % 3 === 1);
          close(Math.min(...heights), riser || bottomFrame ?
            FLOOR_CLEARANCE : topFrame ? FLOOR_CLEARANCE + FRAME_WIDTH :
              model.steps[0].height - TREAD_THICKNESS);
          close(Math.max(...heights), model.steps.at(-1).height - (tread ? 0 : TREAD_THICKNESS));
        }
      }
    }
  }
  assert.deepEqual(model.createGeometry({ bottomFrame: false }),
    model.createGeometry({ bottomFrame: false, topFrame: true, riser: true }));
  assert.deepEqual(model.createGeometry({ topFrame: false }),
    model.createGeometry({ bottomFrame: true, topFrame: false, riser: true }));
  assert.deepEqual(model.createGeometry({ riser: false }),
    model.createGeometry({ bottomFrame: true, topFrame: true, riser: false }));
  assert.deepEqual(model.createGeometry({ tread: false }),
    model.createGeometry({ bottomFrame: true, topFrame: true, riser: true, tread: false }));
  assert.deepEqual(model.createGeometry(), original);
});

test("steps that cannot accommodate frame, upright, or riser stock fail explicitly", () => {
  assert.throws(() => buildStairway(1, 1, 8), {
    name: "RangeError", message: "Bottom frame side boards leave no room for the cross brace.",
  });
  assert.throws(() => buildStairway(2.5, 2.5, 8), {
    name: "RangeError", message: "Bottom frame uprights leave no room for the cross-piece.",
  });
  assert.throws(() => buildStairway(24, 24, 10000), RangeError);
  assert.throws(() => buildStairway(24, 24, 20), {
    name: "RangeError", message: "Bottom frame boards do not fit within the step footprint.",
  });
  assert.throws(() => new Step({
    ...createInitialModel().steps[0], height: FLOOR_CLEARANCE + TREAD_THICKNESS,
  }), {
    name: "RangeError", message: "Board length must be a finite positive number of inches.",
  });
  assert.throws(() => new Step({
    ...createInitialModel().steps[0], height: FLOOR_CLEARANCE + FRAME_WIDTH + TREAD_THICKNESS,
  }), {
    name: "RangeError", message: "Top frame sideHeight must be a finite positive number of inches.",
  });
  assert.throws(() => new Step({
    ...createInitialModel().steps[0], stepRise: TREAD_THICKNESS,
  }), {
    name: "RangeError", message: "Riser height must be a finite positive number of inches.",
  });
});

test("invalid stairway and step parameters fail explicitly", () => {
  for (const value of [0, -1, 1.5, NaN, Infinity, "8", Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => buildStairway(24, 36, value), {
      name: "RangeError", message: "Stairway stepCount must be a positive safe integer.",
    });
  }
  for (const value of [0, -1, NaN, Infinity, "24"]) {
    assert.throws(() => buildStairway(value, 36, 8), RangeError);
    assert.throws(() => buildStairway(24, value, 8), RangeError);
  }
  const valid = createInitialModel().steps[0];
  for (const name of ["frontWidth", "backWidth", "leftDepth", "rightDepth", "height", "stepRise"]) {
    for (const value of [0, -1, NaN, Infinity, undefined, "12"]) {
      assert.throws(() => new Step({ ...valid, [name]: value }), {
        name: "RangeError", message: `Step ${name} must be a finite positive number of inches.`,
      });
    }
  }
  assert.throws(() => new Step({ ...valid, rightDepth: valid.leftDepth }), {
    name: "RangeError", message: "Step edge lengths must form a nondegenerate radial footprint.",
  });
  assert.throws(() => new Step({
    frontWidth: 1, backWidth: 1, leftDepth: 20, rightDepth: 23,
    height: 1, stepRise: 1,
  }), RangeError);
});

test("board dimensions must be finite positive numbers", () => {
  for (const name of ["thickness", "width", "length"]) {
    for (const value of [0, -1, NaN, Infinity, undefined, "12"]) {
      assert.throws(() => new Board({ thickness: 0.75, width: 3.75, length: 12, [name]: value }),
        { name: "RangeError", message: `Board ${name} must be a finite positive number of inches.` });
    }
  }
});
