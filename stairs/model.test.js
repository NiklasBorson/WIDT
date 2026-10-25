import assert from "node:assert/strict";
import test from "node:test";
import {
  Board, OneByFour, NotchedBoard, Siding, Tread, BentPlywood, ProfiledPlywood, BASE_RAIL_THICKNESS, SpindleShim, Caster, CASTER_DIMENSIONS, INNER_RADIUS,
  buildStairway, combineGeometries, OAK, PLYWOOD, PARTICLE_BOARD,
} from "./model.js";
import { PartNode } from "./parts.js";
import { outlinePoint, outlineArea, outlineBounds, tessellateOutline, clipOutline, constructionTrapezoid, notchRectangle, constructionProfile, profileContains, reverseOutline } from "./plywood-outline.js";

function close(actual, expected, tolerance = 1e-5) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
}

test("flat arc-cut plywood retains analytic bounds and volume with bounded-error closed meshes", () => {
  const outline = [
    { type: "line", from: [0, 0], to: [10, 0] },
    { type: "arc", center: [0, 0], radius: 10, startAngle: 0, sweepRadians: Math.PI / 2 },
    { type: "line", from: [0, 10], to: [0, 0] },
  ];
  const board = new ProfiledPlywood({ outline, thickness: 0.5, heading: 0.4, origin: [3, 7], bottomHeight: 8 });
  assert.deepEqual(outlineBounds(outline), { min: [0, 0], max: [10, 10] });
  close(board.getMaterialVolume(), 12.5 * Math.PI);
  assertBoardsGeometry(board.createStockGeometry());
  assertBoardsGeometry(board.createGeometry());
  close(meshVolume(board.createStockGeometry()), board.getMaterialVolume(), 0.01);
  close(meshVolume(board.createGeometry()), meshVolume(board.createStockGeometry()), 1e-4);
  const points = tessellateOutline(outline);
  for (let i = 1; i < points.length - 1; i++) {
    const midpoint = points[i].map((value, axis) => (value + points[i + 1][axis]) / 2);
    assert.ok(10 - Math.hypot(...midpoint) <= 0.001 + 1e-10);
  }
  const clipped = clipOutline(outline, [1, 0], 3);
  assert.ok(clipped.some(edge => edge.type === "arc"));
  close(outlineArea(clipped), (100 * Math.acos(0.3) - 3 * Math.sqrt(91)) / 2);
  assert.throws(() => new ProfiledPlywood({ outline: outline.slice(1), thickness: 0.5 }), /closed path/);
  assert.throws(() => tessellateOutline(outline, 0), /sag/);
});

test("annular plywood subtracts enclosed, overlapping, and perimeter-crossing rectangles analytically", () => {
  const construction = {
    blank: { length: 20, width: 10 },
    trapezoid: { left: { angleRadians: Math.atan2(20, -10), inset: 0 },
      right: { angleRadians: Math.atan2(20, 10), inset: 0 } },
    arc: { center: [10, -10], radius: 20 }, innerRadius: 12, notches: [], openings: [],
  };
  const original = new ProfiledPlywood({ construction, thickness: 0.25 });
  construction.openings.push({ reference: [9, 4], width: 2, depth: 2, angleRadians: 0 });
  const pierced = new ProfiledPlywood({ construction, thickness: 0.25 });
  close(original.getMaterialVolume() - pierced.getMaterialVolume(), 1);
  assert.equal(pierced.holes.length, 1);
  assert.equal(profileContains(pierced, [10, 5]), false);
  construction.openings.push({ reference: [10, 5], width: 2, depth: 2, angleRadians: 0 });
  const overlapping = new ProfiledPlywood({ construction, thickness: 0.25 });
  close(original.getMaterialVolume() - overlapping.getMaterialVolume(), 7 / 4);
  assert.equal(overlapping.holes.length, 1, "Overlapping rectangles form one opening, not duplicate walls.");
  construction.openings.push({ reference: [16, 4], width: 10, depth: 10, angleRadians: 0 });
  const edgeCut = new ProfiledPlywood({ construction, thickness: 0.25 });
  assert.ok(edgeCut.getMaterialVolume() < overlapping.getMaterialVolume());
  assert.equal(edgeCut.holes.length, 1);
  assert.ok(edgeCut.outline.some(edge => edge.type === "line" && Math.abs(edge.from[0] - 16) < 1e-8));
  for (const board of [original, pierced, overlapping, edgeCut]) {
    const geometry = board.createStockGeometry();
    assertBoardsGeometry(geometry);
    close(meshVolume(geometry), board.getMaterialVolume(), 0.01);
  }
  for (const innerRadius of [0, 20, NaN]) assert.throws(
    () => constructionProfile({ ...construction, innerRadius }), /inner arc radius/);
  const outside = reverseOutline(notchRectangle({ reference: [0, 0], width: 2, depth: 2, angleRadians: 0 })
    .map((from, i, points) => ({ type: "line", from, to: points[(i + 1) % points.length] })));
  assert.throws(() => new ProfiledPlywood({ outline: original.outline, holes: [outside], thickness: 0.25 }), /strictly inside/);
  assert.throws(() => new ProfiledPlywood({ outline: pierced.outline, holes: [...pierced.holes, ...pierced.holes], thickness: 0.25 }),
    /must not overlap/);
});

test("radial side cuts derive trapezoid vertices and preserve signed perpendicular insets", () => {
  const centerZ = -(5 + 0.25 * Math.hypot(1, 0.2)) / 0.5;
  const construction = {
    blank: { length: 10, width: 10 },
    arc: { center: [7 + 0.3 * centerZ, centerZ], radius: 20 },
    trapezoid: {
      left: { angleRadians: Math.atan2(10, -2), inset: 0.25 },
      right: { angleRadians: Math.atan2(10, 3), inset: 0 },
    },
  };
  const { sides, vertices } = constructionTrapezoid(construction);
  vertices.flat().forEach((value, index) => close(value, [2, 0, 7, 0, 10, 10, 0, 10][index]));
  for (const side of sides) {
    for (const point of [side.top, side.bottom]) close(
      side.normal.reduce((sum, value, axis) => sum + value * (point[axis] - construction.arc.center[axis]), 0),
      side.inset);
    assert.deepEqual(side.guide.to, construction.arc.center);
    close(Math.hypot(...side.guide.from.map((value, axis) => value - side.guide.to[axis])), 20);
    close(side.normal.reduce((sum, value, axis) => sum + value * (side.guide.from[axis] - side.guide.to[axis]), 0), 0);
  }
  for (const change of [
    recipe => { recipe.trapezoid.top = [2, 7]; },
    recipe => { recipe.trapezoid.left.angleRadians = NaN; },
    recipe => { recipe.trapezoid.left.inset = Infinity; },
    recipe => { recipe.trapezoid.left.inset += 1; },
  ]) {
    const recipe = structuredClone(construction);
    change(recipe);
    assert.throws(() => constructionTrapezoid(recipe), RangeError);
  }
});

test("three-inch caster mesh and purchased-part details use the new reference hardware", () => {
  const caster = new Caster(), mesh = caster.createGeometry();
  assertBoardsGeometry(mesh);
  const tire = [];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    if (mesh.colors[i] > 0.7 && mesh.colors[i + 1] < 0.2 && mesh.colors[i + 2] < 0.2) {
      tire.push(Array.from(mesh.positions.slice(i, i + 3)));
    }
  }
  assert.ok(tire.length > 0, "The reference caster has a red tire.");
  const bounds = [0, 1, 2].map(axis => [
    Math.min(...tire.map(point => point[axis])), Math.max(...tire.map(point => point[axis])),
  ]);
  close(bounds[0][1] - bounds[0][0], 1.25);
  close(bounds[1][0], 0);
  close(bounds[1][1], 3);
  close(bounds[2][1] - bounds[2][0], 3);
  const contact = tire.filter(point => Math.abs(point[1]) < 1e-5).map(point => point[0]);
  close(Math.max(...contact) - Math.min(...contact), 1.25);
  const details = caster.getPartDescription();
  assert.equal(details.productUrl, "https://www.amazon.com/dp/B0GM477Q4M");
  assert.match(details.productName, /3-inch/);
  assert.match(details.specifications.join(" "), /3\.62 x 2\.5.*2\.75 x 1\.75/);
  assert.match(details.note, /4\.25.*4\.3.*6-inch-wide curved 3\/4-inch plywood base rail/);
});

test("two six-inch-wide three-quarter-inch base rails replace the panel and spacers below unchanged framing", () => {
  for (const width of [20, 24, 36]) for (const count of [4, 5, 6, 7, 8, 9]) for (const modules of [2, 3]) {
    if (count < modules * 2) continue;
    const model = buildStairway(width, count, modules);
    for (const module of model.modules) {
      assert.equal(module.boards.rib, undefined);
      const siding = module.boards.siding;
      for (const rib of [module.boards.innerBaseRail, module.boards.outerBaseRail]) {
        const innerRadius = rib === module.boards.innerBaseRail ? INNER_RADIUS : siding.bend.innerRadius - 6;
        const bounds = outlineBounds(rib.outline);
        assert.ok(bounds.min.every(value => value >= -1e-8));
        assert.ok(bounds.max[0] <= rib.length + 1e-8 && bounds.max[1] <= rib.width + 1e-8);
        assert.deepEqual(rib.construction.blank, { length: rib.length, width: rib.width });
        const support = module.steps[0].parts.topFrame.boards.frontStepSupport ??
          module.steps[0].parts.topFrame.boards.southCrossPiece;
        const frontOffset = module.startIndex === 0 ? Math.max(...support.footprint.map(point => point[1])) : 0.25;
        close(rib.construction.trapezoid.left.inset, frontOffset);
        assert.equal(rib.construction.trapezoid.right.inset, 0);
        assert.equal(rib.construction.trapezoid.top, undefined, "Corner coordinates are derived, not independently authored.");
        const angle = module.steps[0].angle, half = module.steps.length * angle / 2;
        assert.equal(rib.thickness, BASE_RAIL_THICKNESS);
        assert.equal(rib.thickness, 0.75);
        assert.equal(rib.bottomHeight, 4.25);
        close(rib.bottomHeight + rib.thickness, 5);
        assert.deepEqual(rib.construction.openings, [], "Casters mount beneath the rails without large openings.");
        close(rib.construction.innerRadius, innerRadius);
        assert.deepEqual([...new Set(rib.outline.filter(edge => edge.type === "arc").map(edge => edge.radius))].sort((a, b) => a - b),
          [innerRadius, innerRadius + 6]);
        const stock = rib.createStockGeometry(), installed = rib.createGeometry();
        assertBoardsGeometry(stock);
        assertBoardsGeometry(installed);
        close(meshVolume(stock), meshVolume(installed), 0.001);
        close(meshVolume(stock), rib.getMaterialVolume(), 0.02);
        const plan = ([x, z]) => [
          rib.origin[0] + Math.cos(rib.heading) * x + Math.sin(rib.heading) * z + INNER_RADIUS,
          rib.origin[1] + Math.sin(rib.heading) * x - Math.cos(rib.heading) * z,
        ];
        const left = innerRadius * Math.cos(half), back = module.steps.length * angle;
        for (const edge of rib.outline) for (const t of [0, 0.5, 1]) {
          const [east, north] = plan(outlinePoint(edge, t));
          if (edge.type === "arc") close(Math.hypot(east, north), edge.radius);
          assert.ok(north >= frontOffset - 1e-8);
          assert.ok(Math.sin(back) * east - Math.cos(back) * north >= -1e-8);
          assert.ok(Math.hypot(east, north) >= innerRadius - 1e-8);
        }
        close((rib.origin[0] + INNER_RADIUS) * Math.cos(half) + rib.origin[1] * Math.sin(half), left);
      }
      for (const key of ["leftSupportBeam", "rightSupportBeam"]) {
        const heights = Array.from(module.boards[key].createGeometry().positions).filter((_, i) => i % 3 === 1);
        close(Math.min(...heights), 5);
        close(Math.max(...heights), 6.5);
      }
      for (const step of module.steps) {
        for (const [key, caster] of Object.entries(step.parts.bottomFrame.hardware)) {
          const heights = Array.from(caster.createGeometry().positions).filter((_, i) => i % 3 === 1);
          close(Math.min(...heights), 0);
          close(Math.max(...heights), 4.25);
          close(module.boards.innerBaseRail.bottomHeight, Math.max(...heights));
          assert.equal(step.parts.bottomFrame.boards[`${key}Spacer`], undefined);
        }
        const frame = step.parts.bottomFrame.boards;
        if (!frame.supportCrossPiece) continue;
        close(frame.supportCrossPiece.bottomHeight + frame.supportCrossPiece.thickness, 8);
        assert.equal(frame.rightSupportBlock.bottomHeight, 8);
        assert.equal(frame.leftSupportBlock.bottomHeight, 8);
      }
    }
  }
});

test("rectangular notch references retain outside-looking-in handedness when rotated", () => {
  for (const angleRadians of [-1.2, 0, 0.7, 2.2]) {
    const notch = { reference: [4, 5], width: 3.5, depth: 2, angleRadians };
    const [leftInner, rightInner, rightOuter, leftOuter] = notchRectangle(notch);
    assert.deepEqual(leftInner, notch.reference);
    const u = rightInner.map((value, axis) => value - leftInner[axis]);
    const v = leftOuter.map((value, axis) => value - leftInner[axis]);
    close(Math.hypot(...u), notch.width);
    close(Math.hypot(...v), notch.depth);
    close(u[0] * v[0] + u[1] * v[1], 0);
    close(u[0] * v[1] - u[1] * v[0], notch.width * notch.depth);
    rightOuter.forEach((value, axis) => close(value, leftInner[axis] + u[axis] + v[axis]));
  }
  const rib = buildStairway().modules[0].boards.outerBaseRail, construction = structuredClone(rib.construction);
  construction.notches[1].width += 0.125;
  construction.notches[1].depth += 0.5;
  const changed = new ProfiledPlywood({ construction, thickness: rib.thickness });
  assert.notDeepEqual(changed.outline, rib.outline);
  assert.ok(changed.getMaterialVolume() < rib.getMaterialVolume());
  assert.throws(() => new ProfiledPlywood({ construction, outline: rib.outline, thickness: rib.thickness }), /not both/);
});

test("curved treads follow the castle and siding while straight framing clears the entire castle cylinder", () => {
  for (const count of [4, 7, 8, 9]) for (const width of [20, 24, 36]) for (const modules of [2, 3]) {
    if (count < modules * 2) continue;
    const model = buildStairway(width, count, modules);
    assert.equal(model.innerRadius, INNER_RADIUS);
    close(model.outerRadius, INNER_RADIUS + width);
    for (const [index, step] of model.steps.entries()) {
      const tread = step.parts.tread, arcs = tread.outline.filter(edge => edge.type === "arc");
      close(arcs.find(edge => edge.sweepRadians < 0).radius, INNER_RADIUS);
      assert.equal(arcs.filter(edge => edge.sweepRadians < 0).length, 1);
      assert.equal(arcs.some(edge => edge.sweepRadians > 0), index > 0);
      if (index) {
        const siding = model.modules.find(module => module.steps.includes(step)).boards.siding;
        close(arcs.find(edge => edge.sweepRadians > 0).radius, siding.bend.innerRadius);
      }
      for (const arc of arcs) for (const t of [0, 0.5, 1]) {
        const angle = arc.startAngle + arc.sweepRadians * t;
        const x = arc.center[0] + arc.radius * Math.cos(angle);
        const z = arc.center[1] + arc.radius * Math.sin(angle);
        close(Math.hypot(tread.origin[0] + INNER_RADIUS + Math.cos(tread.heading) * x +
          Math.sin(tread.heading) * z, tread.origin[1] + Math.sin(tread.heading) * x -
          Math.cos(tread.heading) * z), arc.radius);
      }
      const left = step.parts.topFrame.boards.leftStepSupport;
      if (left) {
        const upright = step.parts.uprights.boards.leftUpright;
        const inward = upright.footprint[1].map((value, axis) =>
          (value - upright.footprint[0][axis]) / upright.thickness);
        for (const point of left.footprint.slice(1, 3)) {
          close(point.reduce((sum, value, axis) =>
            sum + (value - upright.footprint[1][axis]) * inward[axis], 0), 0);
        }
      }
    }
    for (const node of model.partTree.getLeaves()) {
      const board = node.component;
      if (!board.footprint) continue;
      const footprint = board.footprint.map(([east, north]) => [east + INNER_RADIUS, north]);
      for (const [i, a] of footprint.entries()) {
        const b = footprint[(i + 1) % footprint.length], v = b.map((value, axis) => value - a[axis]);
        const t = Math.max(0, Math.min(1, -a.reduce((sum, value, axis) => sum + value * v[axis], 0) /
          v.reduce((sum, value) => sum + value * value, 0)));
        assert.ok(Math.hypot(...a.map((value, axis) => value + t * v[axis])) >= INNER_RADIUS - 1e-8,
          `${count}/${width}/${modules}: ${node.id} enters the castle`);
      }
    }
  }
});

test("analytic tread cutting outlines retain newel and spindle reliefs in closed installed and stock meshes", () => {
  for (const [count, modules] of [[7, 2], [8, 3], [9, 3]]) for (const width of [20, 24, 36]) {
    const model = buildStairway(width, count, modules);
    for (const [index, step] of model.steps.entries()) {
      const tread = step.parts.tread;
      const uncut = new Tread({ width, angle: step.angle, height: step.height, extendRightEdge: index === 0 });
      assert.ok(tread.getMaterialVolume() < uncut.getMaterialVolume());
      close(tread.length, uncut.length);
      close(tread.width, uncut.width);
      const description = tread.getManufacturingDescription();
      assert.deepEqual(description.outline, tread.outline);
      assertBoardsGeometry(tread.createGeometry());
      assertBoardsGeometry(tread.createStockGeometry());
      close(meshVolume(tread.createStockGeometry()), tread.getMaterialVolume(), 0.06);
      for (const post of [step.parts.newel, step.parts.frontSpindle, step.parts.rearSpindle].filter(Boolean)) {
        const axes = tread.getStockAxes(), [a, b, , d] = post.footprint;
        for (const u of [0.01, 0.5, 0.99]) for (const v of [0.01, 0.5, 0.99]) {
          const point = a.map((value, axis) => value + (b[axis] - value) * u + (d[axis] - value) * v);
          const stock = [axes[0], axes[2]].map(axis =>
            (point[0] - tread.origin[0]) * axis[0] - (point[1] - tread.origin[1]) * axis[2]);
          assert.equal(profileContains(tread, stock), false);
        }
      }
    }
  }
});

test("module matrices reproduce split piece positions and normals for even and unequal module layouts", () => {
  for (const [steps, count] of [[7, 2], [8, 2], [8, 3], [9, 3]]) {
    const model = buildStairway(24, steps, count);
    for (const amount of [0, 0.5, 1]) {
      const matrices = model.getModuleTransforms(amount);
      assert.equal(matrices.length, count);
      model.partTree.root.children.forEach((module, index) => {
        const base = model.createNodeGeometry(module.id), split = model.createNodeGeometry(module.id, 0, amount);
        const matrix = matrices[index];
        for (const key of ["positions", "normals"]) for (let i = 0; i < base[key].length; i += 3) {
          for (let axis = 0; axis < 3; axis++) {
            const expected = [0, 1, 2].reduce((sum, column) =>
              sum + matrix[column * 4 + axis] * base[key][i + column], key === "positions" ? matrix[12 + axis] : 0);
            close(split[key][i + axis], expected, 1e-4);
          }
        }
        assert.deepEqual(split.indices, base.indices);
      });
    }
    for (const amount of [-1, 2, NaN, Infinity]) assert.throws(() => model.getModuleTransforms(amount), /moduleExplosion/);
  }
});

test("split footprints follow actual module tread positions without changing assembled or part footprints", () => {
  for (const [steps, modules] of [[7, 2], [8, 2], [9, 3]]) {
    const model = buildStairway(24, steps, modules);
    const leaves = new Map(model.partTree.getLeaves().map(node => [node.component, node.id]));
    const id = leaves.get(model.steps[1].parts.tread);
    const assembled = model.createFootprintGeometry();
    const original = assembled.positions.slice();
    const preview = model.createFootprintGeometry(id), stock = model.createFootprintGeometry(id, true);
    const previewPositions = preview.positions.slice(), stockPositions = stock.positions.slice();
    for (const amount of [0.5, 1, 0.25, 0]) {
      const footprint = model.createFootprintGeometry(null, false, false, amount);
      for (const [stepIndex, step] of model.steps.entries()) {
        const tread = model.createNodeGeometry(leaves.get(step.parts.tread), 0, amount);
        const top = [];
        for (let i = 0; i < tread.indices.length; i += 3) {
          const triangle = [...tread.indices.slice(i, i + 3)];
          if (triangle.every(vertex => tread.normals[vertex * 3 + 1] > 1 - 1e-6)) top.push(...triangle);
        }
        const [start, end] = footprint.treadRanges[stepIndex];
        assert.equal(end - start, top.length);
        for (const [index, vertex] of top.entries()) {
          const floorVertex = footprint.indices[start + index] * 3;
          for (const axis of [0, 2]) {
            close(footprint.positions[floorVertex + axis], tread.positions[vertex * 3 + axis], 1e-4);
          }
          assert.equal(footprint.positions[floorVertex + 1], 0);
          [...footprint.normals.slice(floorVertex, floorVertex + 3)].forEach((value, axis) =>
            close(value, axis === 1 ? 1 : 0));
        }
      }
      model.createFootprintGeometry(null, false, true, amount);
      assert.equal(model.createFootprintGeometry(), assembled);
      assert.deepEqual(assembled.positions, original);
      assert.equal(model.createFootprintGeometry(id), preview);
      assert.equal(model.createFootprintGeometry(id, true), stock);
      assert.deepEqual(preview.positions, previewPositions);
      assert.deepEqual(stock.positions, stockPositions);
    }
    for (const amount of [-1, 2, NaN, Infinity]) {
      assert.throws(() => model.createFootprintGeometry(null, false, true, amount), /moduleExplosion/);
    }
  }
});

test("module footprints omit other modules in assembled and split layouts without retaining hidden vertices", () => {
  for (const [steps, modules] of [[7, 2], [8, 2], [9, 3]]) {
    const model = buildStairway(24, steps, modules);
    const assembled = model.createFootprintGeometry();
    for (const amount of [0, 0.5, 1]) {
      const full = model.createFootprintGeometry(null, false, true, amount);
      for (const [index, module] of model.modules.entries()) {
        const footprint = model.createFootprintGeometry(null, false, true, amount, index + 1);
        const expected = [], actual = [];
        for (let step = 0; step < steps; step++) {
          const [start, end] = footprint.treadRanges[step];
          const included = step >= module.startIndex && step < module.startIndex + module.steps.length;
          assert.equal(end > start, included);
          if (included) {
            const [fullStart, fullEnd] = full.treadRanges[step];
            for (const vertex of full.indices.slice(fullStart, fullEnd)) {
              expected.push(...full.positions.slice(vertex * 3, vertex * 3 + 3));
            }
          }
        }
        for (const vertex of footprint.indices) {
          actual.push(...footprint.positions.slice(vertex * 3, vertex * 3 + 3));
        }
        assert.deepEqual(actual, expected);
        assert.equal(new Set(footprint.indices).size * 3, footprint.positions.length);
      }
    }
    assert.equal(model.createFootprintGeometry(), assembled);
    for (const moduleNumber of [0, modules + 1, 1.5, NaN]) {
      assert.throws(() => model.createFootprintGeometry(null, false, true, 0, moduleNumber), /moduleNumber/);
    }
  }
});

test("front tread is tangent to step 2's outer arc and aligns the newel framing with it", () => {
  for (const stepCount of [7, 8, 9]) {
    const [first, second] = buildStairway(24, stepCount, 3).steps;
    for (const corner of [0, 2, 3]) assert.deepEqual(first.footprint[corner], second.footprint[corner]);
    close(first.footprint[1][1], 0);
    assert.ok(first.footprint[1][0] > second.footprint[1][0]);
    const c = Math.cos(first.angle), s = Math.sin(first.angle);
    const joint = [(INNER_RADIUS + 24) * c - INNER_RADIUS, (INNER_RADIUS + 24) * s];
    const edge = [joint, [joint[0] - s, joint[1] + c]];
    const length = Math.hypot(...edge[1].map((value, axis) => value - edge[0][axis]));
    const along = edge[1].map((value, axis) => (value - edge[0][axis]) / length);
    const across = [along[1], -along[0]];
    const project = (point, direction) => point.reduce((sum, value, axis) => sum + value * direction[axis], 0);
    for (const point of first.footprint.slice(1, 3)) {
      close(project(point, across), project(edge[0], across));
    }
    const newel = first.parts.newel, boards = first.parts.topFrame.boards;
    close(project(newel.footprint[1], across) - project(edge[0], across), 2);
    for (const board of [newel, boards.newelInnerBlock, boards.newelRearBlock]) {
      const [front, back] = [board.footprint[0], board.footprint[3]];
      close(project(front, across), project(back, across));
    }
    for (const board of [boards.southCrossPiece, boards.frontStepSupport, boards.rearStepSupport].filter(Boolean)) {
      for (const point of board.footprint.slice(1, 3)) {
        close(project(point, across), project(edge[0], across));
      }
    }
    close(project(newel.footprint[0], along), project(boards.southCrossPiece.footprint[2], along));
    close(project(boards.newelRearBlock.footprint[0], along), project(newel.footprint[3], along));
    close(project(boards.newelRearBlock.footprint[2], along), project(boards.newelRearBlock.footprint[3], along));
    for (const point of boards.newelRearBlock.footprint.slice(2)) {
      assert.ok(project(point, along) < project(boards.newelInnerBlock.footprint[2], along));
    }
    assert.equal(boards.southCrossPiece.cutFootprint, undefined);
    assert.equal(Object.keys(newel.notches).length, 0);
    close(boards.newelInnerBlock.footprint[0][1], 1.75);
    close(boards.newelInnerBlock.footprint[1][1], 1.75);
  }
});

test("left and right uprights meet caster beam tops without moving their tops or cross-beam shoulders", () => {
  for (const width of [20, 24, 36]) for (const count of [4, 5, 6, 7, 8, 9]) for (const modules of [2, 3]) {
    if (count < modules * 2) continue;
    const model = buildStairway(width, count, modules);
    for (const step of model.steps.slice(1)) {
      for (const [key, board] of Object.entries(step.parts.uprights.boards)) {
        const right = key.startsWith("right"), bottom = 6.5;
        close(board.bottomHeight, bottom);
        close(board.bottomHeight + board.length, step.height - 0.5);
        const crossPiece = step.parts.bottomFrame.boards[key.includes("Rear") ?
          "rearSupportCrossPiece" : "supportCrossPiece"];
        const description = board.getManufacturingDescription();
        const notch = description.dados.find(cut => cut.endNotch && cut.start === 0);
        assert.ok(notch);
        assert.equal(notch.face, right ? "negativeY" : "positiveY");
        close(notch.depth, 0.5);
        close(board.bottomHeight + notch.width, 8);
        close(board.bottomHeight + notch.width, crossPiece.bottomHeight + crossPiece.thickness);
        close(description.cutLength, step.height - 0.5 - bottom);
        const installed = board.createGeometry();
        for (const geometry of [installed, board.createStockGeometry()]) {
          assertBoardsGeometry(geometry);
          close(meshVolume(geometry), cutBoardVolume(board), 1e-3);
        }
        const heights = Array.from(installed.positions).filter((_, index) => index % 3 === 1);
        close(Math.min(...heights), bottom);
        close(Math.max(...heights), step.height - 0.5);
      }
    }
  }
});

test("rib relief clears the step-2 spindle, newel, and adjoining blocks", () => {
  for (const count of [7, 8, 9]) for (const modules of [2, 3]) {
    const model = buildStairway(24, count, modules), rib = model.modules[0].boards.outerBaseRail;
    const spindle = model.steps[1].parts.frontSpindle;
    const heights = Array.from(spindle.createGeometry().positions).filter((_, i) => i % 3 === 1);
    close(Math.min(...heights), spindle.bottomHeight, 1e-5);
    assert.ok(rib.construction.notches.some(cut => /spindle/i.test(cut.name)));
    const first = model.steps[0].parts;
    for (const [board, rotation] of [[spindle, model.steps[1].angle],
      [first.newel, 0], [first.topFrame.boards.newelInnerBlock, 0], [first.topFrame.boards.newelRearBlock, 0]]) {
      const c = Math.cos(rotation), s = Math.sin(rotation);
      const footprint = board.footprint;
      const samples = [...footprint, ...footprint.map((point, i) => point.map((value, axis) =>
        (value + footprint[(i + 1) % footprint.length][axis]) / 2))];
      for (const [east, north] of samples) {
        const delta = [c * (east + INNER_RADIUS) - s * north - INNER_RADIUS - rib.origin[0],
          s * (east + INNER_RADIUS) + c * north - rib.origin[1]];
        const point = [Math.cos(rib.heading) * delta[0] + Math.sin(rib.heading) * delta[1],
          Math.sin(rib.heading) * delta[0] - Math.cos(rib.heading) * delta[1]];
        assert.equal(profileContains(rib, point), false, "The sheet, not the post or spindle, must be relieved.");
      }
    }
  }
});

test("front step support reaches both tread edges while retaining its stock, height, and newel cutout", () => {
  for (const width of [24, 36]) for (const stepCount of [8, 9]) {
    const first = buildStairway(width, stepCount, 3).steps[0];
    const support = first.parts.topFrame.boards.frontStepSupport;
    for (const [start, end, corners] of [
      [first.footprint[0], first.footprint[3], [0, 3]],
      [first.footprint[1], first.footprint[2], [1, 2]],
    ]) {
      for (const corner of corners) {
        const point = support.footprint[corner];
        close((end[0] - start[0]) * (point[1] - start[1]) -
          (end[1] - start[1]) * (point[0] - start[0]), 0);
      }
    }
    close(support.footprint[0][1], 0.25);
    close(support.footprint[1][1], 0.25);
    close(support.footprint[2][1], 3.75);
    close(support.footprint[3][1], 3.75);
    close(support.bottomHeight, 6.5);
    close(support.bottomHeight + support.thickness, first.parts.tread.bottomHeight);
    close(support.length, support.footprint[1][0] - support.footprint[0][0]);
    assert.ok(support.planCuts.length);
    assert.ok(support.cutFootprint.length > support.footprint.length);
    const description = support.getManufacturingDescription();
    assert.equal(description.stock.nominalSize, stepCount === 9 ? "1x4" : "2x4");
    close(description.blank.thickness, stepCount === 9 ? 0.75 : 1.5);
    close(description.blank.width, 3.5);
    const world = support.createGeometry(), stock = support.createStockGeometry();
    assertBoardsGeometry(world);
    assertBoardsGeometry(stock);
    close(meshVolume(world), meshVolume(stock), 1e-4);
  }
});

test("step 1 keeps both flat siding pieces around the newel; curved siding starts at step 2", () => {
  for (const stepCount of [7, 8, 9]) {
    const model = buildStairway(24, stepCount, 3), first = model.steps[0];
    const { newel, frontSiding, siding } = first.parts;
    const curved = model.modules[0].boards.siding;
    const along = newel.footprint[3].map((value, axis) => (value - newel.footprint[0][axis]) / newel.width);
    const project = point => point.reduce((sum, value, axis) =>
      sum + (value - newel.footprint[0][axis]) * along[axis], 0);
    for (const point of frontSiding.footprint.slice(2)) close(project(point), 0);
    for (const point of siding.footprint.slice(0, 2)) close(project(point), newel.width);
    close(curved.startAngle, first.angle);
    close(curved.bend.sweepRadians, (model.modules[0].steps.length - 1) * first.angle);
    assert.ok(project(frontSiding.footprint[0]) < 0);
    assert.ok(project(siding.footprint[3]) > newel.width);
    for (const sheet of [frontSiding, siding]) {
      close(sheet.bottomHeight, 1);
      close(sheet.bottomHeight + sheet.width, first.height);
      const world = sheet.createGeometry(), stock = sheet.createStockGeometry();
      assertBoardsGeometry(world);
      assertBoardsGeometry(stock);
      close(meshVolume(world), meshVolume(stock), 1e-4);
      close(sheet.getManufacturingDescription().blank.thickness, 0.125);
    }
  }
});

test("curved module siding has a flat cutting pattern, midpoint bend, closed mesh and exact material weight", () => {
  for (const width of [20, 24, 36]) for (const steps of [4, 5, 6, 7, 8, 9]) for (const modules of [2, 3]) {
    if (steps < modules * 2) continue;
    const model = buildStairway(width, steps, modules);
    const leaves = model.partTree.getLeaves(), panels = leaves.filter(node => node.component instanceof BentPlywood);
    assert.equal(panels.length, modules);
    assert.equal(leaves.filter(node => node.category === "siding").length, modules + 2);
    assert.ok(model.steps.slice(1).every(step => !step.parts.siding));
    for (const node of panels) {
      const board = node.component, module = model.modules.find(module => module.boards.siding === board);
      const rear = module.steps.at(-1).parts.uprights.boards.rightRearUpright.createGeometry();
      const radius = model.outerRadius;
      for (let i = 0; i < rear.positions.length; i += 3) {
        assert.ok(Math.hypot(rear.positions[i] + INNER_RADIUS, rear.positions[i + 2]) <= radius + 1e-5);
      }
      close(board.bend.innerRadius, radius);
      close(board.bend.neutralRadius, radius + board.thickness / 2);
      close(board.length, board.bend.neutralRadius * board.bend.sweepRadians);
      const stock = board.createStockGeometry(), installed = board.createGeometry();
      assertBoardsGeometry(stock);
      assertBoardsGeometry(installed);
      close(meshVolume(stock), board.getMaterialVolume(), 1e-3);
      assert.ok(Math.abs(meshVolume(installed) / board.getMaterialVolume() - 1) < 0.0001);
      for (let i = 0; i < installed.positions.length; i += 3) {
        const r = Math.hypot(installed.positions[i] + INNER_RADIUS, installed.positions[i + 2]);
        assert.ok(Math.min(Math.abs(r - radius), Math.abs(r - radius - board.thickness)) < 1e-4);
      }
      const expectedWeight = board.getMaterialVolume() / 1728 * PLYWOOD.density;
      close(model.estimateNodeWeightLb(node.id), expectedWeight, 1e-10);
      board.createGeometry = () => assert.fail("Weight must use the cutting pattern, not tessellation");
      close(model.estimateNodeWeightLb(node.id), expectedWeight, 1e-10);
      assert.equal(model.createFootprintGeometry(node.id, true).indices.length, 0);
      assert.equal(model.partTree.getStockViews(node.id).length, 6);
    }
    close(model.estimatedWeightLb, model.estimateNodeWeightLb(), 1e-7);
  }
});

test("shoulder ascent changes spindle, shim, and newel tops without moving their mounting geometry", () => {
  const original = buildStairway();
  assert.equal(original.spindleShoulderAscent, 32);
  for (const ascent of [25, 31]) {
    const lowered = buildStairway(24, 9, 3, ascent), difference = 32 - ascent;
    assert.equal(lowered.spindleShoulderAscent, ascent);
    for (const [stepIndex, role] of [[1, "frontSpindle"], [2, "rearSpindle"]]) {
      const before = original.steps[stepIndex].parts[role], after = lowered.steps[stepIndex].parts[role];
      assert.deepEqual(after.footprint, before.footprint);
      close(after.bottomHeight, before.bottomHeight);
      close(after.frontHeight, before.frontHeight - difference);
      close(after.topRise, before.topRise);
      assert.deepEqual(after.notches, before.notches);
      close(after.getManufacturingDescription().cutLength, before.getManufacturingDescription().cutLength - difference);
    }
    for (const [index, module] of lowered.modules.entries()) {
      const shim = module.steps.at(-1).parts.spindleShim;
      if (!shim) continue;
      const before = original.modules[index].steps.at(-1).parts.spindleShim;
      shim.vertices.forEach((point, i) => point.forEach((value, axis) =>
        close(value, before.vertices[i][axis] - (axis === 1 ? difference : 0))));
    }
    const before = original.steps[0].parts.newel, after = lowered.steps[0].parts.newel;
    assert.deepEqual(after.footprint, before.footprint);
    assert.deepEqual(after.cornerBevel, before.cornerBevel);
    close(after.bottomHeight, 1);
    close(after.length, before.length - difference);
    assert.equal(after.material, OAK);
    assert.equal(after.stock.nominalSize, "4x4");
    close(after.getManufacturingDescription().cutLength, after.length);
    assertBoardsGeometry(after.createGeometry());
    close(meshVolume(before.createGeometry()) - meshVolume(after.createGeometry()), 3.5 ** 2 * difference, 1e-4);
  }
});

test("shoulder ascent rejects values outside its one-inch adjustment range", () => {
  for (const ascent of [24, 38, 25.5, NaN, Infinity, "37", null]) {
    assert.throws(() => buildStairway(24, 9, 3, ascent), /shoulder ascent/);
  }
});

test("invalid stock and manufacturing shapes fail explicitly", () => {
  const dimensions = { length: 12, width: 3.75, thickness: 0.75 };
  for (const stock of [
    { kind: "unknown", thickness: 0.75, width: 3.75 },
    { kind: "lumber", thickness: 0.75, width: 3 },
    { kind: "lumber", thickness: 0.5, width: 3.75 },
    { kind: "lumber", thickness: 0.75, width: NaN },
    { kind: "plywood", thickness: 0 },
  ]) assert.throws(() => new Board({ ...dimensions, stock }), RangeError);
  const board = new Board(dimensions);
  board.getBlankShape = () => ({ vertices: [[NaN, 0, 0]], faces: [] });
  assert.throws(() => board.getManufacturingDescription(), /finite stock-coordinate vertices/);
  assert.throws(() => new PartNode({ id: "part", key: "part", name: "", kind: "lumber" }), TypeError);
});

function meshVolume({ positions: p, indices }) {
  let volume = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    volume += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1])
      + p[a + 1] * (p[b + 2] * p[c] - p[b] * p[c + 2])
      + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return volume / 6;
}

test("particle board preserves sheet geometry and uses grain-free texture on every face", () => {
  const dimensions = { length: 12, width: 8, thickness: 0.25,
    stock: { kind: "plywood", thickness: 0.25 } };
  for (const [notches, dados] of [
    [{}, []],
    [{ endNear: { length: 2, depth: [1, 1] } }, []],
    [{}, [{ face: "positiveY", start: 2, width: 1, depth: 0.125 }]],
  ]) {
    const board = new NotchedBoard({ ...dimensions, material: PARTICLE_BOARD }, notches, dados);
    const mesh = board.createGeometry();
    const plywood = new NotchedBoard({ ...dimensions, material: PLYWOOD }, notches, dados).createGeometry();
    assert.deepEqual(mesh.positions, plywood.positions);
    assert.deepEqual(mesh.normals, plywood.normals);
    assert.deepEqual(mesh.indices, plywood.indices);
    for (let i = 0; i < mesh.grain.length; i += 4) assert.equal(mesh.grain[i + 3], -1);
    for (let i = 0; i < mesh.colors.length; i++) close(mesh.colors[i], PARTICLE_BOARD.color[i % 3]);
    const { stock } = board.getManufacturingDescription();
    assert.equal(stock.kind, "plywood");
    assert.equal(stock.materialKey, "particle-board");
    assert.equal(stock.material, "Particle board");
    assert.notEqual(PARTICLE_BOARD.density, PLYWOOD.density);
  }
});

test("broad-face cuts distinguish end notches from internal dados", () => {
  for (const face of ["negativeY", "positiveY"]) {
    for (const start of [0, 2, 11]) {
      const board = new NotchedBoard({ length: 12, thickness: 1.5, width: 3.5 }, {},
        [{ face, start, width: 1, depth: 0.5 }]);
      const [cut] = board.getManufacturingDescription().dados;
      assert.equal(cut.endNotch, start === 0 || start === 11);
      assert.equal(cut.face, face);
      close(meshVolume(board.createGeometry()), 12 * 1.5 * 3.5 - 1 * 0.5 * 3.5);
    }
  }
});

function cutBoardVolume(board) {
  const notches = Object.entries(board.notches);
  if (board.footprint && board.lengthEdge === undefined && board.grain.direction[1] === 0 && notches.length) {
    const profile = board.getManufacturingDescription().blank.profiles.negativeY;
    const area = polygon => Math.abs(polygon.reduce((sum, point, i) => {
      const next = polygon[(i + 1) % polygon.length];
      return sum + point[0] * next[1] - next[0] * point[1];
    }, 0)) / 2;
    let volume = area(profile) * board.thickness;
    for (const [corner, cut] of notches) {
      close(cut.depth[0], cut.depth[1]);
      let removed = profile;
      for (const [axis, limit, sign] of [
        [0, corner.startsWith("start") ? cut.length : board.length - cut.length,
          corner.startsWith("start") ? 1 : -1],
        [1, corner.endsWith("Near") ? cut.depth[0] : board.width - cut.depth[0],
          corner.endsWith("Near") ? 1 : -1],
      ]) {
        const clipped = [];
        for (const [i, point] of removed.entries()) {
          const next = removed[(i + 1) % removed.length];
          if (sign * (point[axis] - limit) <= 0) clipped.push(point);
          if ((point[axis] - limit) * (next[axis] - limit) < 0) {
            const t = (limit - point[axis]) / (next[axis] - point[axis]);
            clipped.push(point.map((value, j) => value + t * (next[j] - value)));
          }
        }
        removed = clipped;
      }
      volume -= area(removed) * board.thickness;
    }
    return volume;
  }
  const bounds = board.widthBounds ?? board.notchedStock?.widthBounds ??
    [[0, board.width], [0, board.width]];
  const widths = bounds.map(([near, far]) => far - near);
  const widthAt = height => widths[0] + (widths[1] - widths[0]) * height / board.thickness;
  if (board.rebates?.length) {
    const cuts = [...notches, ...board.rebates.map(({ corner, ...cut }) => [corner, cut])];
    const xs = [...new Set([0, board.length, ...cuts.map(([corner, cut]) =>
      corner.startsWith("start") ? cut.length : board.length - cut.length),
    ...board.dados.flatMap(dado => [dado.start, dado.start + dado.width])])].sort((a, b) => a - b);
    const ys = [...new Set([0, board.thickness, ...board.dados.map(dado =>
      dado.face === "negativeY" ? dado.depth : board.thickness - dado.depth)])].sort((a, b) => a - b);
    let volume = 0;
    for (let i = 1; i < xs.length; i++) {
      for (let j = 1; j < ys.length; j++) {
        const x = (xs[i - 1] + xs[i]) / 2, y = (ys[j - 1] + ys[j]) / 2;
        if (board.dados.some(dado => x > dado.start && x < dado.start + dado.width &&
          (dado.face === "negativeY" ? y < dado.depth : y > board.thickness - dado.depth))) continue;
        const active = cuts.filter(([corner, cut]) =>
          corner.startsWith("start") ? x < cut.length : x > board.length - cut.length);
        const depth = edge => Math.max(0, ...active.filter(([corner]) => corner.endsWith(edge))
          .map(([, cut]) => cut.depth[0] + (cut.depth[1] - cut.depth[0]) * y / board.thickness));
        volume += (xs[i] - xs[i - 1]) * (ys[j] - ys[j - 1]) *
          (widthAt(y) - depth("Near") - depth("Far"));
      }
    }
    return volume;
  }
  let volume = board.length * (widths[0] + widths[1]) / 2 * board.thickness;
  if (board.footprint && board.lengthEdge !== undefined) {
    volume = Math.abs(board.footprint.reduce((sum, point, i, polygon) => {
      const next = polygon[(i + 1) % polygon.length];
      return sum + point[0] * next[1] - next[0] * point[1];
    }, 0)) / 2 * board.width;
  }
  for (const [, cut] of notches) {
    const length = cut.lengths ? (cut.lengths[0] + cut.lengths[1]) / 2 : cut.length;
    volume -= length * (cut.depth[0] + cut.depth[1]) / 2 * board.thickness;
  }
  for (const dado of board.dados ?? []) {
    const lowY = dado.face === "negativeY" ? 0 : board.thickness - dado.depth;
    const highY = lowY + dado.depth;
    volume -= dado.width * dado.depth * widthAt((lowY + highY) / 2);
    for (const [name, cut] of notches) {
      const start = name.startsWith("start") ? 0 : board.length - cut.length;
      const overlap = Math.max(0, Math.min(start + cut.length, dado.start + dado.width) -
        Math.max(start, dado.start));
      const averageDepth = cut.depth[0] + (cut.depth[1] - cut.depth[0]) *
        (lowY + highY) / (2 * board.thickness);
      volume += overlap * dado.depth * averageDepth;
    }
  }
  return volume;
}

function assertBoardsGeometry({ positions, normals, colors, indices }) {
  assert.equal(positions.length % 3, 0);
  assert.equal(normals.length, positions.length);
  assert.ok(positions.every(Number.isFinite));
  assert.ok(indices.every(index => index < positions.length / 3));
  assert.equal(colors.length, positions.length);
  assert.ok(colors.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
  const edges = new Map();
  const point = index => Array.from(positions.subarray(index * 3, index * 3 + 3));
  for (let i = 0; i < indices.length; i += 3) {
    const a = point(indices[i]), b = point(indices[i + 1]), c = point(indices[i + 2]);
    const ab = b.map((value, axis) => value - a[axis]), ac = c.map((value, axis) => value - a[axis]);
    const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0]];
    const normal = normals.subarray(indices[i] * 3, indices[i] * 3 + 3);
    close(Math.hypot(...normal), 1);
    assert.ok(cross.reduce((sum, value, axis) => sum + value * normal[axis], 0) > 0);
    close(ab.reduce((sum, value, axis) => sum + value * normal[axis], 0), 0);
    close(ac.reduce((sum, value, axis) => sum + value * normal[axis], 0), 0);
    for (const [start, end] of [[a, b], [b, c], [c, a]]) {
      const first = start.join(","), second = end.join(",");
      const key = first < second ? `${first}|${second}` : `${second}|${first}`;
      edges.set(key, (edges.get(key) ?? 0) + (first < second ? 1 : -1));
    }
  }
  assert.ok([...edges.values()].every(value => value === 0), "Board meshes must be closed");
  if (indices.length > 0) assert.ok(meshVolume({ positions, indices }) > 0);
}

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

test("flat first-step side panels meet the original step edge without an outward clearance", () => {
  for (const width of [20, 24, 36]) for (const count of [7, 8, 9]) for (const modules of [2, 3]) {
    const first = buildStairway(width, count, modules).steps[0];
    const [, front, back] = first.footprint;
    const length = Math.hypot(back[0] - front[0], back[1] - front[1]);
    const normal = [(back[1] - front[1]) / length, (front[0] - back[0]) / length];
    const offset = point => point.reduce((sum, value, i) => sum + (value - front[i]) * normal[i], 0);
    for (const panel of [first.parts.frontSiding, first.parts.siding]) {
      for (const i of [0, 3]) close(offset(panel.footprint[i]), 0);
      for (const i of [1, 2]) close(offset(panel.footprint[i]), 0.125);
      assertBoardsGeometry(panel.createGeometry());
      assertBoardsGeometry(panel.createStockGeometry());
    }
  }
});

test("sheet edge cutouts preserve closed meshes and beveled floors at internal and end openings", () => {
  const angle = Math.PI / 18, radius = INNER_RADIUS, width = 24;
  const footprint = [[0, 0], [width, 0],
    [(radius + width) * Math.cos(angle) - radius, (radius + width) * Math.sin(angle)],
    [radius * Math.cos(angle) - radius, radius * Math.sin(angle)]];
  for (const end of ["internal", "start", "end"]) {
    const sheet = new Siding(footprint, 12, radius);
    const original = meshVolume(sheet.createGeometry());
    const blank = sheet.getManufacturingDescription().blank;
    const cut = { profiles: ["negativeY", "positiveY"].map((name, face) => {
      const xs = blank.profiles[name].map(point => point[0]);
      const start = end === "start" ? Math.min(...xs) : end === "end" ? Math.max(...xs) - 1.5 : 2;
      return [[start, sheet.width - 2 + face / 8], [start + 1.5, sheet.width - 2 + face / 8]];
    }) };
    sheet.edgeNotches.push(cut);
    const geometry = sheet.createGeometry(), stockGeometry = sheet.createStockGeometry();
    assertBoardsGeometry(geometry);
    assertBoardsGeometry(stockGeometry);
    close(meshVolume(geometry), original - 1.5 * (2 - 1 / 16) * sheet.thickness, 1e-4);
    close(meshVolume(stockGeometry), meshVolume(geometry), 1e-4);
    assert.deepEqual(sheet.getManufacturingDescription().edgeNotches, [cut]);
    sheet.getManufacturingDescription().edgeNotches[0].profiles[0][0][0] = 100;
    assert.deepEqual(sheet.getManufacturingDescription().edgeNotches, [cut]);
    sheet.edgeNotches.push(structuredClone(cut));
    assert.throws(() => sheet.createGeometry(), /must not overlap/);
  }
});

test("stopped newel corner bevels preserve square stock and closed meshes", () => {
  for (const stepCount of [7, 8, 9]) {
    const first = buildStairway(24, stepCount, 3).steps[0], newel = first.parts.newel;
    const { front, side, bottomHeight, topHeight } = newel.cornerBevel;
    const [east, north] = newel.footprint[0];
    const removedArea = Math.abs((front[0] - east) * (side[1] - north) -
      (front[1] - north) * (side[0] - east)) / 2;
    const expectedVolume = newel.length * newel.thickness * newel.width - removedArea * (topHeight - bottomHeight);
    for (const geometry of [newel.createGeometry(), newel.createStockGeometry()]) {
      assertBoardsGeometry(geometry);
      close(meshVolume(geometry), expectedVolume, 1e-4);
    }
    const description = newel.getManufacturingDescription();
    close(description.cutLength, newel.length);
    close(description.finishedWidth, newel.width);
    const cuts = description.edgeCuts.filter(cut => cut.surfaceCut);
    close(cuts[0].angleFromSquare, first.angle * 180 / Math.PI);
    assert.equal(cuts.length, bottomHeight > newel.bottomHeight ? 3 : 2);
    for (const cut of cuts) {
      for (const point of cut.points) {
        close(point.reduce((sum, value, axis) => sum + value * cut.plane.normal[axis], 0), cut.plane.offset);
        point.forEach((value, axis) => assert.ok(value >= -1e-8 &&
          value <= [newel.length, newel.thickness, newel.width][axis] + 1e-8));
      }
    }
  }
});

test("plan cutouts preserve closed concave meshes and describe cuts inside the original stock blank", () => {
  const first = buildStairway().steps[0];
  for (const board of [first.parts.topFrame.boards.frontStepSupport]) {
    const area = polygon => polygon.reduce((sum, point, i) => {
      const next = polygon[(i + 1) % polygon.length];
      return sum + point[0] * next[1] - point[1] * next[0];
    }, 0) / 2;
    assert.ok(area(board.cutFootprint) < area(board.footprint));
    for (const geometry of [board.createGeometry(), board.createStockGeometry()]) {
      assertBoardsGeometry(geometry);
      close(meshVolume(geometry), area(board.cutFootprint) * board.thickness, 1e-4);
    }
    const description = board.getManufacturingDescription();
    assert.equal(description.blank.vertices.length, 8);
    const cuts = description.edgeCuts.filter(cut => cut.surfaceCut);
    assert.equal(cuts.length, board.planCuts.length);
    for (const cut of cuts) {
      for (const point of cut.points) {
        close(point.reduce((sum, value, axis) => sum + value * cut.plane.normal[axis], 0), cut.plane.offset);
        point.forEach((value, axis) => assert.ok(value >= -1e-8 &&
          value <= [description.blank.length, description.blank.thickness, description.blank.width][axis] + 1e-8));
      }
    }
  }
});

test("whole caster plates fit their rails and relief cuts, with tangent headings except at step 1", () => {
  for (const width of [20, 24, 36]) for (const count of [7, 8, 9]) for (const modules of [2, 3]) {
    const model = buildStairway(width, count, modules);
    for (const module of model.modules) for (const side of ["left", "right"]) for (const rear of [false, true]) {
      const beam = module.boards[`${side}SupportBeam`];
      const rail = module.boards[side === "left" ? "innerBaseRail" : "outerBaseRail"];
      const caster = (rear ? module.steps.at(-1) : module.steps[0])
        .parts.bottomFrame.hardware[`${side}${rear ? "Rear" : ""}Caster`];
      const angle = rear ? (module.steps.length - 1) * module.steps[0].angle : 0;
      const along = [-Math.sin(caster.heading), Math.cos(caster.heading)];
      const across = [Math.cos(caster.heading), Math.sin(caster.heading)];
      if (module.startIndex === 0 && !rear) {
        const front = beam.footprint[0].map((value, i) => (value + beam.footprint[3][i]) / 2);
        const back = beam.footprint[1].map((value, i) => (value + beam.footprint[2][i]) / 2);
        close(caster.heading, Math.atan2(front[0] - back[0], back[1] - front[1]));
      } else {
        close(Math.sin(caster.heading - Math.atan2(caster.north, caster.east + INNER_RADIUS)), 0);
      }
      const centerOffset = [-INNER_RADIUS - caster.east, -caster.north];
      const nearest = Math.hypot(...[across, along].map((axis, i) =>
        Math.max(Math.abs(axis.reduce((sum, v, j) => sum + v * centerOffset[j], 0)) -
          [CASTER_DIMENSIONS.plateWidth, CASTER_DIMENSIONS.plateLength][i] / 2, 0)));
      assert.ok(nearest >= rail.construction.innerRadius - 1e-8,
        `${width}/${count}/${modules} ${side}/${rear}: an edge enters the inner opening`);
      const plate = [];
      for (const lengthSign of [-1, 1]) for (const widthSign of [-1, 1]) {
        const [east, north] = [caster.east, caster.north].map((value, axis) =>
          value + along[axis] * lengthSign * CASTER_DIMENSIONS.plateLength / 2 +
          across[axis] * widthSign * CASTER_DIMENSIONS.plateWidth / 2);
        const corner = [Math.cos(angle) * (east + INNER_RADIUS) - Math.sin(angle) * north - INNER_RADIUS,
          Math.sin(angle) * (east + INNER_RADIUS) + Math.cos(angle) * north];
        if (!rear) {
          assert.ok(corner[1] >= rail.construction.trapezoid.left.inset + 0.125 - 1e-8,
            `${width}/${count}/${modules}: the entire front mounting plate must be behind the rail's front edge.`);
        }
        if (!rear && beam.casterFrontBoundary !== undefined) {
          assert.ok(corner[1] >= beam.casterFrontBoundary + 0.125 - 1e-8);
        }
        assert.ok(Math.hypot(corner[0] + INNER_RADIUS, corner[1]) <= rail.construction.arc.radius + 1e-8);
        const delta = corner.map((v, i) => v - rail.origin[i]);
        const stock = [Math.cos(rail.heading) * delta[0] + Math.sin(rail.heading) * delta[1],
          Math.sin(rail.heading) * delta[0] - Math.cos(rail.heading) * delta[1]];
        assert.ok(profileContains(rail, stock), `${width}/${count}/${modules} ${side}/${rear}: unsupported corner`);
        plate.push(stock);
      }
      [plate[2], plate[3]] = [plate[3], plate[2]];
      for (const cut of rail.construction.notches) {
        const notch = notchRectangle(cut);
        const separated = [plate, notch].some(polygon => polygon.some((start, i) => {
          const end = polygon[(i + 1) % polygon.length], axis = [start[1] - end[1], end[0] - start[0]];
          const project = points => points.map(point => point.reduce((sum, v, j) => sum + v * axis[j], 0));
          const a = project(plate), b = project(notch);
          return Math.max(...a) <= Math.min(...b) + 1e-8 || Math.max(...b) <= Math.min(...a) + 1e-8;
        }));
        assert.ok(separated, `${width}/${count}/${modules} ${side}/${rear}: plate overlaps ${cut.name}`);
      }
    }
  }
});

test("square-ended vertical wedges preserve closed meshes, stock coordinates, and cutting planes", () => {
  for (const heading of [0, Math.PI / 7]) {
    const c = Math.cos(heading), s = Math.sin(heading);
    const footprint = [[0, 0], [1.4, 0.2], [1.4, 2.4], [0, 2.6]].map(([x, y]) =>
      [c * x - s * y + 4, s * x + c * y - 3]);
    const shim = new SpindleShim(footprint, 10, heading);
    const geometry = shim.createGeometry(), stockGeometry = shim.createStockGeometry();
    assertBoardsGeometry(geometry);
    assertBoardsGeometry(stockGeometry);
    close(meshVolume(geometry), 1.4 * (2.6 + 2.2) / 2 * 4);
    close(meshVolume(stockGeometry), meshVolume(geometry));
    const axes = shim.getStockAxes(), description = shim.getManufacturingDescription();
    close(description.cutLength, 4);
    assert.equal(shim.faces.length, 6);
    assert.equal(description.edgeCuts.filter(cut => cut.surfaceCut).length, 6);
    for (const cut of description.edgeCuts.filter(cut => cut.surfaceCut && /end$/.test(cut.name))) {
      close(cut.miterDegrees, 0);
      close(cut.bevelDegrees, 0);
    }
    const origin = shim.vertices[0].map((value, axis) => value -
      axes.reduce((sum, vector, j) => sum + vector[axis] * shim.stockVertices[0][j], 0));
    for (let i = 0; i < geometry.positions.length; i += 3) {
      for (let axis = 0; axis < 3; axis++) {
        close(geometry.positions[i + axis], origin[axis] +
          axes.reduce((sum, vector, j) => sum + vector[axis] * stockGeometry.positions[i + j], 0));
      }
    }
    for (const cut of description.edgeCuts.filter(cut => cut.surfaceCut)) {
      for (const point of cut.points) {
        close(point.reduce((sum, value, axis) => sum + value * cut.plane.normal[axis], 0), cut.plane.offset);
        point.forEach((value, axis) => assert.ok(value >= -1e-8 &&
          value <= [description.blank.length, description.blank.thickness, description.blank.width][axis] + 1e-8));
      }
    }
  }
  assert.throws(() => new SpindleShim([[0, 0], [2, 0], [2, 2], [0, 2]],
    10, 0), /fit the thickness/);
  assert.throws(() => new SpindleShim([[0, 0], [1, 0], [1, 4], [0, 4]],
    10, 0), /stock/);
});

test("shim ends stay level at the lower spindle shoulder while both beveled sides remain flush", () => {
  for (const width of [20, 24, 36]) for (const count of [7, 8, 9]) {
    for (const modules of [2, 3]) for (const ascent of [25, 37]) {
      const model = buildStairway(width, count, modules, ascent);
      for (let joint = 0; joint < model.modules.length - 1; joint++) {
        const step = model.modules[joint].steps.at(-1);
        const shim = step.parts.spindleShim, lower = step.parts.rearSpindle;
        const upper = model.modules[joint + 1].steps[0].parts.frontSpindle;
        const shoulder = lower.bottomHeight + lower.frontHeight + lower.topRise - 2;
        const upperShoulder = upper.bottomHeight + upper.frontHeight - 2;
        assert.ok(upperShoulder > shoulder);
        for (let corner = 0; corner < 4; corner++) {
          close(shim.vertices[corner][1], shoulder - 4);
          close(shim.vertices[corner + 4][1], shoulder);
        }
        const c = Math.cos(step.angle), s = Math.sin(step.angle);
        const upperEdge = upper.footprint.slice(0, 2).map(([east, north]) => [
          c * (east + INNER_RADIUS) - s * north - INNER_RADIUS,
          s * (east + INNER_RADIUS) + c * north,
        ]);
        const expected = [lower.footprint[3], lower.footprint[2], upperEdge[1], upperEdge[0]];
        for (const [corner, [east, north]] of expected.entries()) {
          close(shim.vertices[corner][0], east);
          close(shim.vertices[corner][2], -north);
          close(shim.vertices[corner + 4][0], east);
          close(shim.vertices[corner + 4][2], -north);
        }
        const cuts = shim.getManufacturingDescription().edgeCuts.filter(cut =>
          cut.surfaceCut && ["Front face", "Back face"].includes(cut.name));
        assert.equal(cuts.length, 2);
        for (const cut of cuts) close(Math.abs(cut.bevelDegrees), step.angle * 90 / Math.PI);
      }
      assert.equal(model.modules.at(-1).steps.at(-1).parts.spindleShim, undefined);
    }
  }
});

test("edge rebates retain rectangular stock and combine with deeper notches and dados", () => {
  const dimensions = { length: 12, thickness: 1, width: 4 };
  for (const length of [8, 12]) {
    const rebates = [{ corner: "endNear", length, depth: [0.125, 0.225] }];
    const board = new NotchedBoard(dimensions, {
      startNear: { length: 2, depth: [1, 1.1] },
      endNear: { length: 2, depth: [1, 1.1] },
    }, [{ face: "positiveY", start: 7, width: 1, depth: 0.25 }], rebates);
    assert.equal(board.width, 4);
    assertBoardsGeometry(board.createGeometry());
    close(meshVolume(board.createGeometry()), cutBoardVolume(board));
    assert.equal(board.getManufacturingDescription().notches.length, 3);
    const copy = new NotchedBoard(board, board.notches, [
      ...board.dados, { face: "positiveY", start: 4, width: 1, depth: 0.25 },
    ]);
    assert.deepEqual(copy.rebates, rebates);
    assertBoardsGeometry(copy.createGeometry());
    close(meshVolume(copy.createGeometry()), cutBoardVolume(copy));
    copy.rebates[0].depth[0] = 0.2;
    assert.equal(board.rebates[0].depth[0], 0.125);
    assert.equal(rebates[0].depth[0], 0.125);
  }
  const full = new NotchedBoard(dimensions, {}, [], [
    { corner: "endNear", length: 12, depth: [0.125, 0.125] },
  ]);
  assertBoardsGeometry(full.createGeometry());
  close(meshVolume(full.createGeometry()), 12 * (4 - 0.125));
  for (const rebate of [
    { corner: "unknown", length: 2, depth: [0.1, 0.1] },
    { corner: "endNear", length: 13, depth: [0.1, 0.1] },
    { corner: "endNear", length: 2, depth: [4, 4] },
  ]) {
    assert.throws(() => new NotchedBoard(dimensions, {}, [], [rebate]), RangeError);
  }
  assert.throws(() => new NotchedBoard(dimensions, {}, [], [
    { corner: "endNear", length: 8, depth: [3, 3] },
    { corner: "endFar", length: 8, depth: [2, 2] },
  ]), /connected strip/);
  assert.throws(() => new NotchedBoard(dimensions, {
    endNear: { length: 2, depth: [0.1, 0.3] },
  }, [], [{ corner: "endNear", length: 8, depth: [0.2, 0.2] }]), /must not cross/);
});

test("NotchedBoard cuts any combination of four beveled corner notches from the original stock", () => {
  const dimensions = { length: 12, width: 4, thickness: 0.75 };
  const names = ["startNear", "endNear", "endFar", "startFar"];
  assert.deepEqual(new NotchedBoard(dimensions).createGeometry(), new Board(dimensions).createGeometry());
  for (let mask = 1; mask < 16; mask++) {
    const notches = Object.fromEntries(names.filter((_, i) => mask & (1 << i))
      .map(name => [name, { length: 2, depth: [0.5, 1] }]));
    const board = new NotchedBoard(dimensions, notches);
    const geometry = board.createGeometry();
    assert.equal(board.length, dimensions.length);
    assert.equal(board.width, dimensions.width);
    assert.equal(board.thickness, dimensions.thickness);
    const removed = Object.keys(notches).length * 2 * 0.75 * 0.75;
    close(meshVolume(geometry), 12 * 4 * 0.75 - removed);
    assertBoardsGeometry(geometry);
    assert.ok(geometry.grain.every(Number.isFinite));
    for (let i = 0; i < geometry.positions.length / 3; i++) {
      const cutEnd = Math.abs(geometry.normals[i * 3]) > 0.99;
      assert.equal(geometry.grain[i * 4 + 2], cutEnd ? 1 : 0);
    }
    for (let i = 0; i < geometry.indices.length; i += 3) {
      const center = [0, 1, 2].map(axis => [0, 1, 2].reduce((sum, corner) =>
        sum + geometry.positions[geometry.indices[i + corner] * 3 + axis] / 3, 0));
      const depth = 0.5 + (center[1] / dimensions.thickness + 0.5) * 0.5;
      for (const name of Object.keys(notches)) {
        const inLength = name.startsWith("start") ? center[0] < -4 - 1e-6 : center[0] > 4 + 1e-6;
        const inWidth = name.endsWith("Near") ? center[2] < -2 + depth - 1e-6 :
          center[2] > 2 - depth + 1e-6;
        assert.ok(!inLength || !inWidth, "Triangles must not span removed corners");
      }
    }
  }
});

test("meeting end notches leave a closed board, including a bevel that collapses one face edge", () => {
  for (const edge of ["Near", "Far"]) {
    for (const depth of [1, [1, 1.5], [1.5, 1], [1.5, 2]]) {
      const geometry = new NotchedBoard({ length: 10, width: 4, thickness: 1 }, {
        [`start${edge}`]: { length: 5, depth: 1 },
        [`end${edge}`]: { length: 5, depth },
      }).createGeometry();
      const endDepth = Array.isArray(depth) ? (depth[0] + depth[1]) / 2 : depth;
      close(meshVolume(geometry), 40 - 5 - 5 * endDepth);
      assertBoardsGeometry(geometry);
    }
  }
});

test("invalid, overlapping, and severing notch descriptions fail explicitly", () => {
  const dimensions = { length: 10, width: 4, thickness: 1 };
  for (const notches of [null, [], { middle: {} },
    { startNear: null }, { startNear: { length: 0, depth: 1 } },
    { startNear: { length: 10, depth: 1 } },
    { startNear: { length: 2, depth: [1] } },
    { startNear: { length: 2, depth: [1, NaN] } },
    { startNear: { length: 2, depth: 4 } },
    { startNear: { length: 6, depth: 1 }, endNear: { length: 5, depth: 1.5 } },
    { startNear: { length: 5, depth: [1, 2] }, endNear: { length: 5, depth: [2, 1] } },
    { startNear: { length: 2, depth: 2 }, startFar: { length: 2, depth: 2 } },
    { startNear: { length: 6, depth: [1, 2] }, endFar: { length: 5, depth: [1, 2] } },
  ]) {
    assert.throws(() => new NotchedBoard(dimensions, notches), RangeError);
  }
});

test("overlapping same-plane end notches remove their union, with or without a dado", () => {
  for (const edge of ["Near", "Far"]) {
    for (const dados of [[], [{ face: "negativeY", start: 4.5, width: 1, depth: 0.25 }]]) {
      const board = new NotchedBoard({ length: 10, width: 4, thickness: 1 }, {
        [`start${edge}`]: { length: 6, depth: [1, 1.5] },
        [`end${edge}`]: { length: 5, depth: [1, 1.5] },
      }, dados);
      const geometry = board.createGeometry();
      assertBoardsGeometry(geometry);
      close(meshVolume(geometry), dados.length ? 26.765625 : 27.5);
      close(meshVolume(geometry), cutBoardVolume(board));
    }
  }
});

test("board construction replaces continuous notches with a narrower blank before downstream use", () => {
  for (const edge of ["Near", "Far"]) {
    for (const endLength of [4, 5]) {
      for (const depth of [[1, 1], [1, 1.5]]) {
        const board = new NotchedBoard({ length: 10, width: 4, thickness: 1 }, {
          [`start${edge}`]: { length: 6, depth },
          [`end${edge}`]: { length: endLength, depth },
        }, [{ face: "positiveY", start: 4.5, width: 1, depth: 0.25 }]);
        const original = board.createGeometry(), description = board.getManufacturingDescription();
        assert.deepEqual(board.notches, {});
        close(board.width, 3);
        assert.equal(board.stock.width, 4);
        assert.deepEqual(description.notches, []);
        close(description.finishedWidth, 3);
        assert.deepEqual(description.widthTrim, { from: 4, to: 3, removed: 1 });
        close(description.dados[0].acrossWidth, 4 - depth[1]);
        if (depth[0] !== depth[1]) {
          assert.ok(description.edgeCuts.some(cut => cut.axis === "width" && Math.abs(cut.bevelDegrees) > 0));
        }
        const stock = board.createStockGeometry();
        const z = stock.positions.filter((_, i) => i % 3 === 2);
        close(Math.min(...z), 0);
        close(Math.max(...z), 3);
        close(meshVolume(stock), meshVolume(original));
        assert.deepEqual(board.createGeometry(), original);
        const worldZ = original.positions.filter((_, i) => i % 3 === 2);
        close(Math.min(...worldZ), edge === "Near" ? -1 : -2);
        close(Math.max(...worldZ), edge === "Near" ? 2 : 1);
        const copied = new NotchedBoard(board, board.notches, board.dados);
        assert.deepEqual(copied.createGeometry(), original);
        assert.deepEqual(copied.getManufacturingDescription(), description);
      }
    }
  }
  const stepped = new NotchedBoard({ length: 10, width: 4, thickness: 1 }, {
    startNear: { length: 5, depth: 1 }, endNear: { length: 5, depth: 1.5 },
  });
  assert.deepEqual(stepped.notches, { endNear: { length: 5, depth: [0.5, 0.5] } });
  assert.equal(stepped.width, 3);
  assert.equal(stepped.getManufacturingDescription().notches.length, 1);
  assert.equal(stepped.getManufacturingDescription().finishedWidth, 3);
});

test("broad-face dados preserve stock, material, grain, and the exact uncut helper path", () => {
  const dimensions = { length: 10, width: 4, thickness: 1, material: OAK };
  const notches = { startNear: { length: 2, depth: [0.5, 1] } };
  assert.deepEqual(new NotchedBoard(dimensions, notches, []).createGeometry(),
    new NotchedBoard(dimensions, notches).createGeometry());
  for (const face of ["negativeY", "positiveY"]) {
    const dado = { face, start: 4, width: 0.75, depth: 0.125 };
    const board = new NotchedBoard(dimensions, {}, [dado]), geometry = board.createGeometry();
    assert.equal(board.material, OAK);
    assert.equal(board.length, 10);
    assert.equal(board.width, 4);
    assert.equal(board.thickness, 1);
    assert.deepEqual(board.dados, [dado]);
    close(meshVolume(geometry), 40 - 0.75 * 0.125 * 4);
    assertBoardsGeometry(geometry);
    let floorVertices = 0, shoulderVertices = 0;
    for (let i = 0; i < geometry.positions.length / 3; i++) {
      const [x, y] = geometry.positions.subarray(i * 3, i * 3 + 2);
      const normal = geometry.normals.subarray(i * 3, i * 3 + 3);
      assert.equal(geometry.grain[i * 4 + 2], Math.abs(normal[0]) > 0.99 ? 1 : 0);
      close(geometry.grain[i * 4 + 1], Math.abs(normal[0]) > 0.99 ? y + 0.5 : x + board.length / 2);
      for (let axis = 0; axis < 3; axis++) close(geometry.colors[i * 3 + axis], OAK.color[axis]);
      if (Math.abs(y - (face === "negativeY" ? -0.375 : 0.375)) < 1e-6 &&
        Math.abs(normal[1]) > 0.99) {
        close(normal[1], face === "negativeY" ? -1 : 1);
        floorVertices++;
      }
      if (Math.abs(normal[0]) > 0.99 && x > -5 + 1e-6 && x < 5 - 1e-6) shoulderVertices++;
    }
    assert.ok(floorVertices > 0 && shoulderVertices > 0);
  }
});

test("constructor normalization preserves original cut surfaces, input data, and subsequent dado additions", () => {
  for (const notches of [
    {
      startNear: { length: 6, depth: [0.5, 1] }, endNear: { length: 4, depth: [0.5, 1] },
      startFar: { length: 6, depth: [0.5, 0.25] }, endFar: { length: 5, depth: [0.5, 0.25] },
    },
    {
      startNear: { length: 6, depth: [0.5, 1] }, endNear: { length: 4, depth: [0.5, 1] },
      startFar: { length: 2, depth: [0.25, 0.5] },
    },
    { startNear: { length: 5, depth: [0.5, 1] }, endNear: { length: 5, depth: [1, 1.5] } },
    { startFar: { length: 5, depth: [1, 1.5] }, endFar: { length: 5, depth: [0.5, 1] } },
    { startNear: { length: 5, depth: 1 }, endNear: { length: 5, depth: [1, 1.5] } },
  ]) {
    const dimensions = { length: 10, width: 4, thickness: 1, material: OAK };
    const snapshot = structuredClone(notches);
    const initial = new NotchedBoard(dimensions, notches);
    for (const edge of ["Near", "Far"]) {
      const start = initial.notches[`start${edge}`], end = initial.notches[`end${edge}`];
      assert.ok(!start || !end || start.length + end.length < initial.length);
    }
    assert.deepEqual(notches, snapshot);
    assert.equal(dimensions.width, 4);
    assert.equal(initial.stock.width, 4);
    assert.equal(initial.material, OAK);
    assert.equal(initial.width, initial.getManufacturingDescription().blank.width);
    const dado = { face: "positiveY", start: 4.5, width: 1, depth: 0.25 };
    const board = new NotchedBoard(initial, initial.notches, [dado]);
    assert.deepEqual(board.widthBounds, initial.widthBounds);
    assert.deepEqual(initial.dados, []);
    const inWood = ([x, y, z]) => {
      if (Math.abs(x) > 5 || Math.abs(y) > 0.5 || Math.abs(z) > 2) return false;
      for (const [name, cut] of Object.entries(notches)) {
        const depths = Array.isArray(cut.depth) ? cut.depth : [cut.depth, cut.depth];
        const depth = depths[0] + (depths[1] - depths[0]) * (y + 0.5);
        if ((name.startsWith("start") ? x < -5 + cut.length : x > 5 - cut.length) &&
          (name.endsWith("Near") ? z < -2 + depth : z > 2 - depth)) return false;
      }
      return !(x > -5 + dado.start && x < -5 + dado.start + dado.width && y > 0.5 - dado.depth);
    };
    const geometry = board.createGeometry();
    assertBoardsGeometry(geometry);
    close(meshVolume(geometry), cutBoardVolume(board));
    for (let i = 0; i < geometry.indices.length; i += 3) {
      const center = [0, 1, 2].map(axis => [0, 1, 2].reduce((sum, corner) =>
        sum + geometry.positions[geometry.indices[i + corner] * 3 + axis] / 3, 0));
      const normal = geometry.normals.subarray(geometry.indices[i] * 3, geometry.indices[i] * 3 + 3);
      assert.equal(inWood(center.map((value, axis) => value - normal[axis] * 1e-4)), true);
      assert.equal(inWood(center.map((value, axis) => value + normal[axis] * 1e-4)), false);
    }
  }
});

test("dados and beveled corner notches form one external closed surface with union volume", () => {
  const dimensions = { length: 10, width: 4, thickness: 1 };
  for (const notches of [
    {},
    { startNear: { length: 5, depth: 1 } },
    { startFar: { length: 5, depth: [0.5, 1.5] } },
    { startNear: { length: 5, depth: 1 }, endNear: { length: 5, depth: [1, 1.5] } },
    { startNear: { length: 5, depth: [1, 1.5] }, endNear: { length: 5, depth: 1 } },
    { startFar: { length: 5, depth: 1 }, endFar: { length: 5, depth: [1, 1.5] } },
    { startNear: { length: 3, depth: [0.5, 1] }, endNear: { length: 3, depth: [1, 0.5] },
      startFar: { length: 6, depth: [1, 0.75] }, endFar: { length: 4, depth: 0.5 } },
  ]) {
    for (const face of ["negativeY", "positiveY"]) {
      for (const start of [0, 2.5, 4.5, 9]) {
        const dados = [{ face, start, width: 1, depth: 0.125 }];
        const board = new NotchedBoard(dimensions, notches, dados), geometry = board.createGeometry();
        assertBoardsGeometry(geometry);
        close(meshVolume(geometry), cutBoardVolume(board));
        const inWood = ([x, y, z]) => {
          const bounds = board.widthBounds[0].map((value, edge) =>
            value + (board.widthBounds[1][edge] - value) * (y + 0.5));
          if (Math.abs(x) > 5 || Math.abs(y) > 0.5 || z < bounds[0] || z > bounds[1]) return false;
          for (const [name, cut] of Object.entries(board.notches)) {
            const depth = cut.depth[0] + (cut.depth[1] - cut.depth[0]) * (y + 0.5);
            if ((name.startsWith("start") ? x < -5 + cut.length : x > 5 - cut.length) &&
              (name.endsWith("Near") ? z < bounds[0] + depth : z > bounds[1] - depth)) return false;
          }
          return !dados.some(dado => x > -5 + dado.start && x < -5 + dado.start + dado.width &&
            (face === "negativeY" ? y < -0.5 + dado.depth : y > 0.5 - dado.depth));
        };
        for (let i = 0; i < geometry.indices.length; i += 3) {
          const center = [0, 1, 2].map(axis => [0, 1, 2].reduce((sum, corner) =>
            sum + geometry.positions[geometry.indices[i + corner] * 3 + axis] / 3, 0));
          const normal = geometry.normals.subarray(geometry.indices[i] * 3, geometry.indices[i] * 3 + 3);
          assert.equal(inWood(center.map((value, axis) => value - normal[axis] * 1e-4)), true);
          assert.equal(inWood(center.map((value, axis) => value + normal[axis] * 1e-4)), false,
            "Every triangle must face air, not an internal partition");
        }
      }
    }
  }
});

test("multiple dados remain closed when separated, meeting, or on opposing faces", () => {
  const dimensions = { length: 10, width: 4, thickness: 1 };
  const first = { face: "negativeY", start: 2, width: 2, depth: 0.25 };
  for (const second of [
    { face: "negativeY", start: 4, width: 2, depth: 0.125 },
    { face: "positiveY", start: 3, width: 2, depth: 0.5 },
    { face: "positiveY", start: 4, width: 2, depth: 0.5 },
    { face: "positiveY", start: 5, width: 5, depth: 0.875 },
  ]) {
    const board = new NotchedBoard(dimensions, {
      startNear: { length: 5, depth: [0.5, 1] },
      endFar: { length: 6, depth: [1, 0.5] },
    }, [first, second]);
    const geometry = board.createGeometry();
    assertBoardsGeometry(geometry);
    close(meshVolume(geometry), cutBoardVolume(board));
  }
});

test("invalid, overlapping, and severing dado descriptions fail explicitly", () => {
  const dimensions = { length: 10, width: 4, thickness: 1 };
  const dado = { face: "negativeY", start: 2, width: 1, depth: 0.125 };
  for (const dados of [null, {}, [null], [{}],
    [{ ...dado, face: "near" }], [{ ...dado, start: -1 }], [{ ...dado, start: NaN }],
    [{ ...dado, start: Infinity }], [{ ...dado, width: 0 }], [{ ...dado, width: 9 }],
    [{ ...dado, width: Infinity }], [{ ...dado, depth: NaN }], [{ ...dado, depth: 0 }],
    [{ ...dado, depth: 1 }], [{ ...dado, depth: Infinity }], [dado, { ...dado, start: 2.5 }],
    [dado, { ...dado, face: "positiveY", depth: 0.875 }],
    [dado, { ...dado, face: "positiveY", start: 3, depth: 0.875 }],
  ]) {
    assert.throws(() => new NotchedBoard(dimensions, {}, dados), RangeError);
  }
});

test("combining many component meshes selects 32-bit indices without wrapping references", () => {
  const board = new OneByFour(12).createGeometry();
  const geometry = combineGeometries(Array(2731).fill(board));
  assert.ok(geometry.indices instanceof Uint32Array);
  assert.equal(geometry.positions.length, 2731 * 24 * 3);
  assert.equal(geometry.grain.length, 2731 * 24 * 4);
  assert.deepEqual(geometry.grain.subarray(-24 * 4), board.grain);
  assert.equal(geometry.indices.at(-1), 2731 * 24 - 1);
  assert.ok(geometry.indices.every(index => index < geometry.positions.length / 3));
});

test("board dimensions must be finite positive numbers", () => {
  for (const name of ["thickness", "width", "length"]) {
    for (const value of [0, -1, NaN, Infinity, undefined, "12"]) {
      assert.throws(() => new Board({ thickness: 0.75, width: 3.75, length: 12, [name]: value }),
        { name: "RangeError", message: `Board ${name} must be a finite positive number of inches.` });
    }
  }
});
