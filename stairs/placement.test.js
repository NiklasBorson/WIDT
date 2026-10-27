import test from "node:test";
import assert from "node:assert/strict";
import { combineGeometries, buildStairway, ProfiledPlywood } from "./model.js";
import { PlacementPlanner } from "./placement.js";

function mesh(faces) {
  const positions = [], normals = [], colors = [], grain = [], indices = [];
  for (const points of faces) {
    const offset = positions.length / 3;
    const a = points[1].map((v, i) => v - points[0][i]);
    const b = points[2].map((v, i) => v - points[0][i]);
    const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const size = Math.hypot(...n);
    for (const p of points) {
      positions.push(...p);
      normals.push(...n.map(v => v / size));
      colors.push(0.6, 0.4, 0.2);
      grain.push(0, 0, 0, 0);
    }
    for (let i = 1; i < points.length - 1; i++) indices.push(offset, offset + i, offset + i + 1);
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals),
    colors: new Float32Array(colors), grain: new Float32Array(grain), indices: new Uint16Array(indices) };
}

function box(x0, y0, z0, x1, y1, z1) {
  const p = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
    [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
  return mesh([[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1],
    [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]].map(face => face.map(i => p[i])));
}

function fixture(geometries, angle = 0) {
  const nodes = Object.keys(geometries).map(id => ({ id, name: id, stepNumber: 1 }));
  const calls = [];
  return {
    calls, steps: [{ angle }], stepCount: 1,
    partTree: { getLeaves: () => nodes, getAncestors: () => [
      { kind: "module", name: "Module 1", module: { startIndex: 0, steps: [{ angle }] } },
    ] },
    createNodeGeometry(id) { calls.push(id); return geometries[id]; },
    createFootprintGeometry: () => combineGeometries([]),
  };
}

function templateStrips(stations, width = 10) {
  const strips = stations.slice(1).map((front, index) => {
    const back = stations[index];
    return mesh([[[0, 0, back], [0, 0, front], [width, 0, front], [width, 0, back]]]);
  });
  const geometry = combineGeometries(strips);
  let offset = 0;
  geometry.treadRanges = strips.map(strip => {
    const start = offset;
    offset += strip.indices.length;
    return [start, offset];
  });
  return geometry;
}

const block = () => box(0, 1, 0, 2, 3, 2);
const seat = () => box(-2, 0, -2, 4, 1, 4);

test("arc-cut plywood retains its flat seat datum without treating arc facets as planar contacts", () => {
  const rib = new ProfiledPlywood({ thickness: 0.5, outline: [
    { type: "line", from: [0, 0], to: [10, 0] },
    { type: "arc", center: [0, 0], radius: 10, startAngle: 0, sweepRadians: Math.PI / 2 },
    { type: "line", from: [0, 10], to: [0, 0] },
  ] });
  const geometry = rib.createGeometry();
  let facet;
  for (let i = 0; i < geometry.indices.length; i += 3) {
    const index = geometry.indices[i] * 3;
    if (Math.abs(geometry.normals[index]) > 0.2 && Math.abs(geometry.normals[index + 2]) > 0.2 &&
      Math.abs(geometry.normals[index + 1]) < 1e-5) {
      facet = Array.from(geometry.indices.slice(i, i + 3), vertex =>
        Array.from(geometry.positions.slice(vertex * 3, vertex * 3 + 3))).reverse();
      break;
    }
  }
  assert.ok(facet);
  const model = fixture({ rib: geometry, facet: mesh([facet]), support: box(-1, -1, -1, 11, 0, 11) });
  const node = model.partTree.getLeaves()[0];
  node.part = rib;
  node.kind = "plywood";
  const plan = new PlacementPlanner(model).plan("rib");
  assert.ok(plan.evidence.relationships.some(relationship => relationship.neighbor === "support" && relationship.contact));
  assert.ok(plan.evidence.relationships.every(relationship => relationship.neighbor !== "facet"));
});

test("finite seat contact leaves two sliding directions and yaw unresolved without zero labels", () => {
  const plan = new PlacementPlanner(fixture({ block: block(), seat: seat() })).plan("block");
  assert.equal(plan.evidence.contactRank, 3);
  assert.equal(plan.evidence.measuredRank, 3);
  assert.equal(plan.status, "partial");
  assert.ok(plan.unresolved.some(s => s.includes("sliding/rotation")));
  assert.ok(plan.views.some(v => v.notes.some(n => n.startsWith("Surface contact"))));
  assert.equal(plan.views.flatMap(v => v.dimensions).length, 0);
  assert.ok(plan.previewGeometry.positions.length > plan.geometry.positions.length);
});

test("seat, flush side face and end stop provide six independent maintained-contact constraints", () => {
  const plan = new PlacementPlanner(fixture({
    block: block(), seat: seat(),
    side: box(-1, 1, 0, 0, 3, 2),
    end: box(0, 1, -1, 2, 3, 0),
  })).plan("block");
  assert.equal(plan.evidence.contactRank, 6);
  assert.equal(plan.evidence.relationships.length, 3);
  assert.equal(plan.views.flatMap(v => v.dimensions).length, 0);
  assert.equal(plan.status, "partial"); // Geometry cannot establish construction intent.
  assert.ok(plan.unresolved.some(s => s.includes("Construction intent")));
});

test("parallel finite faces yield one useful true-length clearance, not a bbox dimension", () => {
  const plan = new PlacementPlanner(fixture({
    block: block(), datum: box(3, 1, 0, 4, 3, 2),
  })).plan("block");
  const dimensions = plan.views.flatMap(v => v.dimensions);
  assert.equal(dimensions.length, 1);
  assert.equal(dimensions[0].value, 1);
  assert.equal(dimensions[0].from[0], 2);
  assert.equal(dimensions[0].to[0], 3);
  assert.deepEqual(dimensions[0].from, [2, 3, 1]); // Actual top edge, not a triangle diagonal.
  assert.match(dimensions[0].reference, /datum.*face/);
  assert.equal(plan.evidence.contactRank, 0);
  assert.ok(plan.unresolved.some(s => s.includes("orientation")));
});

test("overlapping bounds without finite surface overlap are not contact or a usable offset", () => {
  // Disjoint triangles share an AABB but not a finite face region.
  const a = mesh([[[0, 0, 0], [2, 0, 0], [0, 0, 2]]]);
  const b = mesh([[[2, 0, 2], [2, 0, 1.5], [1.5, 0, 2]]]);
  const plan = new PlacementPlanner(fixture({ selected: a, other: b })).plan("selected");
  assert.equal(plan.evidence.candidateCount, 1);
  assert.equal(plan.evidence.relationships.length, 0);
  assert.equal(plan.status, "unresolved");
});

test("empty and degenerate geometry stay unresolved, not success-shaped", () => {
  for (const geometry of [combineGeometries([]), mesh([[[0, 0, 0], [1, 0, 0], [2, 0, 0]]])]) {
    const planner = new PlacementPlanner(fixture({ selected: geometry, other: seat() }));
    const plan = planner.plan("selected");
    assert.equal(plan.status, "unresolved");
    assert.ok(plan.unresolved.some(s => s.includes("no usable")));
    assert.equal(plan.evidence.contactRank, 0);
    assert.throws(() => planner.plan("missing"), RangeError);
  }
});

test("approximate hardware is not used for exact clearance dimensions", () => {
  const model = fixture({ selected: block(), hardware: box(3, 1, 0, 4, 3, 2) });
  model.partTree.getLeaves().find(node => node.id === "hardware").kind = "hardware";
  const plan = new PlacementPlanner(model).plan("selected");
  assert.equal(plan.evidence.relationships.length, 0);
  assert.equal(plan.views.flatMap(view => view.dimensions).length, 0);
});

test("camera elision uses triangles and depth and keeps behind context in the opposite view", () => {
  const planner = new PlacementPlanner(fixture({
    block: block(), seat: seat(), side: box(-1, 1, 0, 0, 3, 2),
  }));
  const plan = planner.plan("block");
  assert.ok(plan.views.find(v => v.name === "Down").occluded.includes("seat"));
  assert.ok(plan.views.find(v => v.name === "Up").neighbors.includes("seat"));
  assert.ok(plan.views.find(v => v.name === "Left").occluded.includes("side"));
  assert.ok(plan.views.find(v => v.name === "Right").neighbors.includes("side"));
  assert.ok(plan.views.every(v => v.neighbors.every(id => !v.occluded.includes(id))));
});

test("projected bbox overlap alone does not elide physically disjoint context", () => {
  // A concave seat made from two finite bars, surrounding but not below the selected block.
  // The narrow left bar actually touches the block, so it is retained as useful contact.
  const surrounding = combineGeometries([
    box(-1, 1, -1, 0, 3, 3), box(-1, 1, 2.5, 3, 3, 3),
  ]);
  const plan = new PlacementPlanner(fixture({ block: block(), context: surrounding })).plan("block");
  assert.ok(plan.views.find(v => v.name === "Up").neighbors.includes("context"));
  assert.ok(!plan.views.find(v => v.name === "Up").occluded.includes("context"));
});

test("repeated selection reuses retained occurrence geometry and cached plan", () => {
  const model = fixture({ block: block(), seat: seat() }, Math.PI / 3);
  const planner = new PlacementPlanner(model);
  const plan = planner.plan("block");
  assert.equal(planner.plan("block"), plan);
  planner.plan("seat");
  assert.deepEqual(model.calls, ["block", "seat"]);
  const p = [2, 1, 0], c = Math.cos(-Math.PI / 6), s = Math.sin(-Math.PI / 6);
  assert.ok(Math.abs(plan.geometry.positions[3] - (c * p[0] + s * p[2])) < 1e-5);
  assert.ok(Math.abs(plan.geometry.positions[5] - (-s * p[0] + c * p[2])) < 1e-5);
  assert.match(plan.title, /Module 1 \/ Step 1/);
});

test("an oblique offset with no true standard view explicitly requires an additional reference", () => {
  const transform = geometry => {
    const rotate = values => Float32Array.from(values, (_, index) => {
      const start = index - index % 3;
      const x = values[start], y = values[start + 1], z = values[start + 2];
      const c = Math.cos(0.4), s = Math.sin(0.4);
      const yawX = c * x + s * z, yawZ = -s * x + c * z;
      return [c * yawX - s * y, s * yawX + c * y, yawZ][index % 3];
    });
    return { ...geometry, positions: rotate(geometry.positions), normals: rotate(geometry.normals) };
  };
  const plan = new PlacementPlanner(fixture({
    selected: transform(block()), datum: transform(box(3, 1, 0, 4, 3, 2)),
  })).plan("selected");
  assert.ok(plan.evidence.relationships.length > 0);
  assert.equal(plan.evidence.measuredRank, 0);
  assert.equal(plan.views.flatMap(view => view.dimensions).length, 0);
  assert.ok(plan.unresolved.some(note => note.includes("section or additional reference")));
});

test("actual assembled model retains measured surfaces and parameter-dependent plans", () => {
  for (const width of [24, 32]) {
    const model = buildStairway(width);
    const planner = new PlacementPlanner(model);
    const selected = model.partTree.getLeaves().find(node => node.key === "southCrossPiece");
    const plan = planner.plan(selected.id);
    assert.ok(plan.evidence.candidateCount > 0);
    assert.ok(plan.evidence.relationships.length > 0);
    assert.equal(plan.views.length, 6);
    for (const view of plan.views) for (const dimension of view.dimensions) {
      if (dimension.kind === "alignment") {
        assert.equal(dimension.value, 0);
        assert.deepEqual(dimension.from, dimension.to);
      } else assert.ok(dimension.value > 0);
      assert.ok(dimension.from.every(Number.isFinite));
      assert.ok(dimension.to.every(Number.isFinite));
      assert.ok(view.neighbors.length > 0);
    }
    const siding = model.partTree.getLeaves().find(node => node.part.bend);
    const sidingPlan = planner.plan(siding.id);
    const top = sidingPlan.views.find(view => view.name === "Up");
    assert.equal(top.planar.complete, false);
    assert.equal(sidingPlan.evidence.relationships.length, 0);
    assert.ok(sidingPlan.views.every(view => view.dimensions.length === 0));
    assert.ok(sidingPlan.unresolved.some(note => note.includes("curved-surface tessellation")));
    assert.ok(sidingPlan.previewPickRanges.length > 1);
    assert.equal(sidingPlan.geometry.positions.length, model.createNodeGeometry(siding.id).positions.length);
  }
});

test("finite contact positions and extreme template seams locate a long part without intermediate callouts", () => {
  const strips = [[-11, -9], [-9, -7], [-7, -5], [-5, -3], [-3, -1]].map(([back, front]) =>
    mesh([[[0, 0, back], [0, 0, front], [10, 0, front], [10, 0, back]]]));
  const template = combineGeometries(strips);
  let offset = 0;
  template.treadRanges = strips.map(strip => {
    const start = offset;
    offset += strip.indices.length;
    return [start, offset];
  });
  const model = fixture({
    beam: box(7, 1, -12, 8, 3, 0),
    support: box(0, 1, 0, 10, 3, 1),
  });
  model.createFootprintGeometry = () => template;
  const plan = new PlacementPlanner(model).plan("beam"), top = plan.views[0];
  const contact = top.dimensions.find(d => d.source === "contact-position");
  assert.deepEqual(contact.from, [10, 0, 0]);
  assert.deepEqual(contact.to, [8, 0, 0]);
  assert.equal(contact.value, 2);
  const crossings = top.dimensions.filter(d => d.source === "template-intersection");
  assert.equal(crossings.length, 2);
  assert.deepEqual(crossings.map(d => d.to[2]), [-3, -9], "Keep frontmost and backmost shared seams.");
  for (const dimension of crossings) {
    assert.equal(dimension.value, 2);
    assert.deepEqual(dimension.from, [10, 0, dimension.to[2]]);
    assert.deepEqual(dimension.to, [8, 0, dimension.to[2]]);
    assert.match(dimension.reference, /Tread template seam/);
  }
  assert.equal(top.dimensions.length, 3);
  assert.ok(top.notes.some(note => note.includes("horizontal plan")));
  assert.equal(top.pickGeometry.indices.length, top.pickRanges.at(-1).end * 3);
  assert.ok(top.boundsGeometry.positions.length > top.pickGeometry.positions.length);
});

test("shared contact corners stay unnumbered and projected crossings never imply physical contact", () => {
  const model = fixture({
    beam: box(9, 10, -8, 10, 12, 0),
    support: box(0, 10, 0, 10, 12, 1),
  });
  const template = mesh([[[0, 0, -6], [0, 0, -2], [12, 0, -2], [12, 0, -6]]]);
  template.treadRanges = [[0, template.indices.length]];
  model.createFootprintGeometry = () => template;
  const plan = new PlacementPlanner(model).plan("beam"), top = plan.views[0];
  assert.ok(!top.dimensions.some(d => d.source === "contact-position"), "A flush corner needs no setback.");
  assert.equal(top.planar.implicitRank, 3);
  assert.equal(top.dimensions.length, 0, "A visible flush-corner fit already locates the plan.");
  assert.ok(plan.evidence.relationships.every(r => r.neighbor === "support"));
  assert.equal(plan.evidence.contactRank, 3, "Projected template marks add no physical contact constraints.");
  const floating = fixture({ beam: box(9, 10, -8, 10, 12, 0) });
  floating.createFootprintGeometry = () => template;
  const floatingPlan = new PlacementPlanner(floating).plan("beam");
  assert.equal(floatingPlan.views[0].dimensions.filter(d => d.source === "template-intersection").length, 2);
  assert.equal(floatingPlan.evidence.contactRank, 0, "Removing the physical support removes contact, not template crossings.");
});

test("caster beam locates its support joint and both extreme tread-template crossings across layouts", () => {
  for (const [width, modules] of [[20, 2], [24, 2], [24, 3], [36, 2]]) {
    const model = buildStairway(width), planner = new PlacementPlanner(model);
    const node = model.partTree.getLeaves().find(n => n.key === "rightSupportBeam");
    const top = planner.plan(node.id).views[0], locations = top.dimensions.filter(d => d.source);
    assert.equal(top.planar.complete, true);
    assert.ok(locations.some(d => d.source === "contact-position"), `Missing joint for ${width}/9/${modules}`);
    const crossings = locations.filter(d => d.source === "template-intersection");
    assert.equal(crossings.length, 2);
    assert.ok(crossings[0].to[2] > crossings[1].to[2]);
    assert.ok(locations.length <= 3);
    for (const dimension of locations) {
      assert.ok(dimension.value > 0);
      assert.ok(Math.abs(Math.hypot(...dimension.from.map((v, i) => v - dimension.to[i])) - dimension.value) < 1e-6);
      assert.ok(dimension.from.every(Number.isFinite) && dimension.to.every(Number.isFinite));
    }
  }
});

test("a single seam gets a separated extension pair and an independent longitudinal location", () => {
  const model = fixture({ beam: box(7, 1, -4, 8, 3, 4) });
  model.createFootprintGeometry = () => templateStrips([-10, 0, 10]);
  const plan = new PlacementPlanner(model).plan("beam"), top = plan.views[0];
  const direct = top.dimensions.filter(d => d.source === "template-intersection");
  const extensions = top.dimensions.filter(d => d.extension && !d.purpose);
  const end = top.dimensions.find(d => d.purpose === "longitudinal");
  assert.equal(direct.length, 0, "The intermediate seam is redundant once both perimeter extensions locate this line.");
  assert.equal(extensions.length, 2);
  assert.deepEqual(extensions.map(d => d.to[2]).sort((a, b) => a - b), [-10, 10]);
  for (const dimension of extensions) {
    assert.equal(dimension.value, 2);
    assert.ok(dimension.extension.every(p => p[0] === 8 && p[1] === 0));
    assert.equal(Math.abs(dimension.extension[0][2]), 4);
    assert.equal(Math.abs(dimension.extension[1][2]), 10);
    assert.match(dimension.reference, /perimeter/);
  }
  assert.ok(end);
  assert.equal(end.value, 6);
  assert.equal(end.source, "template-setback");
  assert.equal(end.perpendicular, true);
  assert.equal(Math.abs(end.from[2]), 4);
  assert.equal(Math.abs(end.to[2]), 10);
  assert.equal(end.from[0], end.to[0], "Measure normally from the actual end to its parallel template edge.");
  assert.equal(top.dimensions.length, 3);
  assert.equal(top.planar.rank, 3);
  assert.equal(top.planar.implicitRank, 0);
  assert.equal(top.planar.complete, true);
  assert.ok(top.dimensions.every(d => d.kind !== "angle"));
  assert.equal(plan.evidence.contactRank, 0);
  assert.equal(plan.evidence.measuredRank, 0, "Virtual extensions do not pretend to prove physical constraints.");
  assert.ok(top.notes.some(note => note.includes("Dashed straight-edge extensions")));
});

test("a corner on a transverse seam already fixes longitudinal position", () => {
  const model = fixture({ beam: box(7, 1, 0, 8, 3, 4) });
  model.createFootprintGeometry = () => templateStrips([-10, 0, 10]);
  const top = new PlacementPlanner(model).plan("beam").views[0];
  assert.equal(top.dimensions.filter(d => d.extension).length, 2);
  assert.ok(!top.dimensions.some(d => d.purpose === "longitudinal"));
  assert.equal(top.planar.complete, true);
  assert.equal(top.planar.implicitRank, 2);
});

test("footprint-corner extensions are alignment marks, not zero-length measurements", () => {
  const model = fixture({ beam: box(9, 1, -4, 10, 3, 4) });
  model.createFootprintGeometry = () => templateStrips([-10, 0, 10]);
  const top = new PlacementPlanner(model).plan("beam").views[0];
  const alignments = top.dimensions.filter(d => d.kind === "alignment");
  assert.equal(alignments.length, 2);
  for (const dimension of alignments) {
    assert.equal(dimension.value, 0);
    assert.deepEqual(dimension.from, dimension.to);
    assert.equal(dimension.to[0], 10);
    assert.equal(Math.abs(dimension.to[2]), 10);
  }
  assert.ok(top.dimensions.filter(d => d.kind === "offset").every(d => d.value > 0));
  assert.ok(top.dimensions.some(d => d.purpose === "longitudinal"),
    "A corner on a parallel footprint edge does not stop longitudinal sliding.");
  assert.equal(top.planar.complete, true);
});

test("unreachable template references report an underconstrained plan instead of inventing locations", () => {
  const model = fixture({ beam: box(12, 1, 12, 13, 3, 14) });
  model.createFootprintGeometry = () => templateStrips([-10, 0, 10]);
  const top = new PlacementPlanner(model).plan("beam").views[0];
  assert.equal(top.planar.rank, 0);
  assert.equal(top.planar.complete, false);
  assert.equal(top.dimensions.length, 0);
  assert.ok(top.notes.some(note => /0\/3 planar freedoms; placement needs an additional reference/.test(note)));
});

test("full-width cross beams use real contacts or template references when the front brace hides the joint", () => {
  const model = buildStairway(24), planner = new PlacementPlanner(model);
  for (const [module, step] of [[1, 3], [2, 4]]) {
    const plan = planner.plan(`stairway/module-${module}/step-${step}-supportCrossPiece`);
    const top = plan.views[0];
    assert.equal(top.planar.complete, true);
    if (step === 3) {
      assert.equal(top.dimensions.some(d => d.source === "template-setback"), false);
      assert.equal(top.planar.implicitRank, 3);
      assert.ok(top.notes.some(note => note.startsWith("Surface contact:")));
      assert.equal(top.dimensions.length, 0);
    }
    else {
      assert.equal(top.planar.implicitRank, 0);
      assert.equal(top.dimensions.length, 3);
      assert.ok(top.occluded.includes("stairway/module-2/step-4-frontUprightBrace"));
      assert.ok(!top.dimensions.some(d => d.label === "Face clearance"),
        "The front brace fills the former quarter-inch gap; do not measure through it.");
      const setback = top.dimensions.find(d => d.kind === "offset");
      assert.equal(setback.source, "template-setback");
      assert.equal(setback.purpose, "longitudinal");
      assert.equal(setback.reference, "Tread template arc: Step 4");
      assert.ok(setback.value > 0 && setback.value < 0.025);
      assert.ok(plan.views.find(view => view.name === "Down").notes.some(note =>
        note.startsWith("Surface contact:") && note.includes("Front brace - lower")));
      const alignments = top.dimensions.filter(d => d.kind === "alignment");
      assert.equal(alignments.length, 2);
      assert.ok(alignments.every(d => d.source === "template-extension" && d.value === 0));
      assert.ok(top.dimensions.some(d => d.reference === "Tread template perimeter: Step 4"));
    }
  }
});

test("rear cross-beam parallel stations retain an independent along-beam joint location", () => {
  const model = fixture({
    beam: box(7, 1, -4, 8, 3, 4),
    rearPanel: box(6, 0, -5, 7, 5, 5),
    leftUpright: box(7, 3, -4, 8, 5, -3),
    rightUpright: box(7, 3, 3, 8, 5, 4),
  });
  model.partTree.getLeaves().find(node => node.id === "rearPanel").name = "Rear panel";
  model.createFootprintGeometry = () => templateStrips([-10, 0, 10]);
  const plan = new PlacementPlanner(model).plan("beam");
  const top = plan.views[0], bottom = plan.views[1];
  const stations = top.dimensions.filter(d => d.source === "template-extension");
  assert.equal(stations.length, 2);
  const edge = stations[0].selectedEdge;
  const slide = edge[1].map((value, i) => value - edge[0][i]);
  const span = Math.hypot(...slide);
  const setback = top.dimensions.find(d => d.source === "contact-position");
  assert.ok(setback, "Parallel line stations cannot prevent sliding along the beam.");
  const measurement = setback.to.map((value, i) => value - setback.from[i]);
  assert.ok(Math.abs(measurement.reduce((sum, value, i) => sum + value * slide[i], 0)) /
    (Math.hypot(...measurement) * span) > 0.99,
  "Require an actual along-beam measurement, not just the planner's complete flag.");
  assert.match(setback.reference, /Rear panel/);
  assert.ok(Math.abs(setback.value - 1) < 1e-4);
  assert.equal(top.planar.implicitRank, 2);
  assert.equal(top.planar.complete, true);
  for (const side of ["left", "right"]) {
    const id = `${side}Upright`;
    assert.ok(top.occluded.includes(id), "The upright genuinely overlaps the beam in the Top projection.");
    assert.ok(bottom.neighbors.includes(id), "Bottom shows both raised uprights' joint context.");
  }
});

test("a mitered end parallel to a template edge uses a centered normal gap in the actual rotated frame", () => {
  const model = fixture({ beam: mesh([[[12, 1, -4], [14, 1, 4], [18, 1, 4], [16, 1, -4]]]) }, 0.31);
  model.createFootprintGeometry = () => templateStrips([-6, 0, 6], 30);
  const top = new PlacementPlanner(model).plan("beam").views[0];
  const setback = top.dimensions.find(d => d.purpose === "longitudinal");
  assert.equal(top.planar.complete, true);
  assert.equal(setback.source, "template-setback");
  assert.equal(setback.perpendicular, true);
  assert.ok(Math.abs(setback.value - 2) < 1e-4);
  const delta = setback.to.map((value, i) => value - setback.from[i]);
  const end = setback.selectedEdge[1].map((value, i) => value - setback.selectedEdge[0][i]);
  assert.ok(Math.abs(delta.reduce((sum, value, i) => sum + value * end[i], 0)) < 1e-4);
  const longEdge = top.dimensions.find(d => !d.purpose).selectedEdge;
  const along = longEdge[1].map((value, i) => value - longEdge[0][i]);
  assert.ok(Math.abs(along.reduce((sum, value, i) => sum + value * end[i], 0)) > 1,
    "The end is mitered rather than square to the part's long edge.");
  for (const axis of [0, 2]) {
    assert.ok(Math.abs(setback.from[axis] -
      (setback.selectedEdge[0][axis] + setback.selectedEdge[1][axis]) / 2) < 1e-4);
  }
});

test("without parallel ends, a short near-square edge extension beats a shallow-angle reference", () => {
  const model = fixture({ beam: mesh([[[2, 1, -1], [3, 1, 1], [8, 1, 3], [7, 1, 1]]]) });
  model.createFootprintGeometry = () => templateStrips([-10, 0, 10]);
  const top = new PlacementPlanner(model).plan("beam").views[0];
  const setback = top.dimensions.find(d => d.purpose === "longitudinal");
  assert.equal(top.planar.complete, true);
  assert.equal(setback.source, "template-setback");
  assert.ok(!setback.perpendicular);
  assert.ok(setback.value < 2.2, "Avoid the longer extension from the oblique end.");
  const delta = setback.to.map((value, i) => value - setback.from[i]);
  const datum = setback.datumEdge[1].map((value, i) => value - setback.datumEdge[0][i]);
  const sine = Math.abs(delta[0] * datum[2] - delta[2] * datum[0]) /
    (Math.hypot(...delta) * Math.hypot(...datum));
  assert.ok(sine > 0.9, "Prefer the near-perpendicular crossing over the shallow-angle one.");
  assert.deepEqual(setback.extension, [setback.from, setback.to]);
});

test("a visible physical end stop fixes sliding without an extended end-edge measurement", () => {
  const model = fixture({
    beam: box(7, 1, -4, 8, 3, 4),
    stop: box(6, 0, 4, 9, 2, 5),
  });
  model.createFootprintGeometry = () => templateStrips([-10, 0, 10]);
  const top = new PlacementPlanner(model).plan("beam").views[0];
  assert.ok(top.neighbors.includes("stop"));
  assert.equal(top.planar.complete, true);
  assert.equal(top.planar.implicitRank, 2);
  assert.ok(!top.dimensions.some(d => d.purpose === "longitudinal"));
});

test("an obvious complete template fit needs no placement numbers", () => {
  const model = fixture({ beam: box(0, 1, -10, 10, 3, 10) });
  model.createFootprintGeometry = () => templateStrips([-10, 0, 10]);
  const top = new PlacementPlanner(model).plan("beam").views[0];
  assert.equal(top.planar.complete, true);
  assert.equal(top.planar.implicitRank, 3);
  assert.equal(top.dimensions.length, 0);
});
