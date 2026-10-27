import assert from "node:assert/strict";
import test from "node:test";
import {
  Board, OneByFour, NotchedBoard, Siding, Tread, BentPlywood, ProfiledPlywood, SUPPORT_BEAM_TOP_HEIGHT, SpindleShim, Caster, CASTER_DIMENSIONS, ThreadedFlange, THREADED_FLANGE_DIMENSIONS, MendingPlate, INNER_RADIUS,
  ThreadedInsert, THREADED_INSERT_DIMENSIONS,
  buildStairway, combineGeometries, PINE, DOUGLAS_FIR, PLYWOOD, PARTICLE_BOARD, TOTAL_HEIGHT,
  PANEL_STIFFENER_THICKNESS, PANEL_STIFFENER_WIDTH, PANEL_STIFFENER_BOTTOM_HEIGHT,
  PANEL_SUPPORT_BLOCK_BOTTOM_HEIGHT, PANEL_SUPPORT_BLOCK_LENGTH, Spindle,
  SIDING_RIB_THICKNESS, SIDING_RIB_WIDTH, SIDING_RIB_BLOCK_LENGTH,
} from "./model.js";
import { Piece } from "./parts.js";
import { PartCatalog, transformGeometry } from "./part-design.js";
import { PartInventory } from "./part-list.js";
import { outlinePoint, outlineArea, outlineBounds, tessellateOutline, clipOutline, constructionTrapezoid, constructionTangentExtension, notchRectangle, constructionProfile, profileContains, reverseOutline } from "./plywood-outline.js";

function close(actual, expected, tolerance = 1e-5) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
}

function horizontalSurfaceCovers(mesh, point) {
  for (let i = 0; i < mesh.indices.length; i += 3) {
    if (Math.abs(mesh.normals[mesh.indices[i] * 3 + 1]) < 0.99) continue;
    const triangle = Array.from(mesh.indices.slice(i, i + 3), index =>
      [mesh.positions[index * 3], mesh.positions[index * 3 + 2]]);
    const sides = triangle.map((a, j) => {
      const b = triangle[(j + 1) % 3];
      return (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]);
    });
    if (sides.every(value => value >= -1e-8) || sides.every(value => value <= 1e-8)) return true;
  }
  return false;
}

function contactArea(footprint, boundary) {
  let polygon = footprint;
  for (const [i, a] of boundary.entries()) {
    const b = boundary[(i + 1) % boundary.length];
    const distance = point => (b[0] - a[0]) * (point[1] - a[1]) -
      (b[1] - a[1]) * (point[0] - a[0]);
    polygon = polygon.flatMap((point, index) => {
      const next = polygon[(index + 1) % polygon.length];
      const d = distance(point), nextD = distance(next);
      return [
        ...(d >= 0 ? [point] : []),
        ...((d >= 0) !== (nextD >= 0)
          ? [point.map((value, axis) => value + (next[axis] - value) * d / (d - nextD))] : []),
      ];
    });
  }
  return Math.abs(polygon.reduce((sum, point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return sum + point[0] * next[1] - point[1] * next[0];
  }, 0)) / 2;
}

function horizontalContactArea(lower, upper, height) {
  const faces = (board, up) => {
    const { positions, normals, indices } = board.createGeometry(), triangles = [];
    for (let i = 0; i < indices.length; i += 3) {
      const vertices = Array.from(indices.slice(i, i + 3));
      if (!vertices.every(vertex => Math.abs(positions[vertex * 3 + 1] - height) < 1e-4 &&
        normals[vertex * 3 + 1] * (up ? 1 : -1) > 0.99)) continue;
      const triangle = vertices.map(vertex => [positions[vertex * 3], -positions[vertex * 3 + 2]]);
      triangles.push(up ? triangle : triangle.reverse());
    }
    return triangles;
  };
  const upperFaces = faces(upper, false);
  return faces(lower, true).reduce((sum, triangle) =>
    sum + upperFaces.reduce((area, other) => area + contactArea(triangle, other), 0), 0);
}

function constructionBoard(model, piece) {
  const module = model.partTree.getNode(piece.parentId).module;
  if (piece.stepNumber === null) return module.boards[piece.key];
  const groups = Object.entries(model.steps[piece.stepNumber - 1].parts);
  return groups.flatMap(([key, component]) => component.boards
    ? Object.entries({ ...component.boards, ...component.hardware }) : [[key, component]])
    .find(([key]) => key === piece.key)?.[1];
}

test("fixed design has nine steps, three equal modules and source-defined railing ascent", () => {
  for (const width of [20, 24, 36]) {
    const model = buildStairway(width);
    assert.equal(model.stairWidth, width);
    assert.equal(model.spindleShoulderAscent, 32);
    assert.equal(model.stepCount, 9);
    assert.equal(model.steps.length, 9);
    assert.deepEqual(model.modules.map(module => module.steps.length), [3, 3, 3]);
    assert.equal(model.stepRise, 8.5);
    assert.equal(model.landingRise, 8.5);
    assert.equal(model.steps.at(-1).height, 76.5);
  }
});

test("installed rendering, Details, inventory and footprints use shared Parts without reading construction meshes", () => {
  const model = buildStairway(), pieces = model.partTree.getLeaves();
  const expected = model.createGeometry(), snapshot = expected.positions.slice();
  const sources = new Set(pieces.map(piece => constructionBoard(model, piece)));
  for (const source of sources) {
    source.createGeometry = source.createStockGeometry = source.getManufacturingDescription =
      () => assert.fail("Installed Pieces must not render or describe construction builders.");
  }
  assert.equal(model.parts.length, new Set(pieces.map(piece => piece.part)).size);
  for (const module of model.modules) {
    assert.ok(module.pieces.every(piece => piece instanceof Piece && model.parts.includes(piece.part)));
    assert.ok(module.pieces.every(piece => !("component" in piece)));
  }
  assert.deepEqual(model.createGeometry().positions, snapshot);
  assert.ok(model.createGeometry({}, 0.5, 1).indices.length);
  for (const amount of [-1, 2, NaN, Infinity]) {
    assert.throws(() => model.getPieceTransform(pieces[0].id, amount), /explosion/);
    assert.throws(() => model.getPieceTransform(pieces[0].id, 0, amount), /moduleExplosion/);
  }
  assert.ok(model.createFootprintGeometry().indices.length);
  assert.ok(model.createFootprintGeometry(pieces[0].id).indices.length);
  assert.equal(new PartInventory(model.partTree).quantity, pieces.length);
  assert.ok(model.estimateNodeWeightLb() > 0);
  const wooden = pieces.find(piece => piece.kind === "lumber");
  assert.equal(model.partTree.getStockViews(wooden.id).length, 6);
  assert.equal(wooden.getDescription().blank, wooden.part.description.blank);
  assert.ok(wooden.part.createStockGeometry().indices.length);
});

test("castle is a closed gray cylinder at the origin, separate from the part tree and stairway geometry", () => {
  const model = buildStairway(), stairway = model.createGeometry(), castle = model.createCastleGeometry();
  assertBoardsGeometry(castle);
  for (let i = 0; i < castle.positions.length; i += 3) {
    const [x, y, z] = castle.positions.slice(i, i + 3);
    close(Math.hypot(x, z), INNER_RADIUS);
    assert.ok(y === 0 || y === TOTAL_HEIGHT);
    assert.deepEqual(Array.from(castle.colors.slice(i, i + 3)), [0.5, 0.5, 0.5]);
  }
  close(meshVolume(castle) / (Math.PI * INNER_RADIUS ** 2 * TOTAL_HEIGHT), 1, 0.0001);
  assert.ok(castle.grain.every(value => value === 0));
  assert.ok(!model.partTree.getLeaves().some(node => /castle/i.test(node.id)));
  assert.deepEqual(model.createGeometry(), stairway);
});

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

test("threaded flange mesh retains reference plate dimensions and three open bores", () => {
  const flange = new ThreadedFlange(), mesh = flange.createGeometry();
  assertBoardsGeometry(mesh);
  const bounds = [0, 1, 2].map(axis => {
    const values = mesh.positions.filter((_, i) => i % 3 === axis);
    return [Math.min(...values), Math.max(...values)];
  });
  close(bounds[0][1] - bounds[0][0], 2.75);
  close(bounds[2][1] - bounds[2][0], 1.27);
  close(bounds[1][0], 0);
  assert.ok(bounds[1][1] > 5 / 25.4, "The boss must project beyond the mounting plate.");
  assert.ok(mesh.positions.some((value, i) => i % 3 === 1 && Math.abs(value - 5 / 25.4) < 1e-6));
  assert.ok(mesh.grain.every(value => value === 0), "Hardware must not have a wood texture.");
  const covered = point => horizontalSurfaceCovers(mesh, point);
  for (const point of [[0, 0], [0.18, 0], [-0.18, 0],
    [-1, 0], [-1.13, 0], [-0.87, 0], [1, 0], [1.13, 0], [0.87, 0]]) {
    assert.equal(covered(point), false, "The threaded and mounting holes must pass through the mesh.");
  }
  assert.equal(covered([0.6, 0.4]), true, "Material outside the openings must remain.");
  assert.equal(covered([0.2, 0]), true, "The boss must surround the nominal threaded opening.");
  const original = mesh.positions[0];
  mesh.positions[0] = 100;
  close(flange.createGeometry().positions[0], original);
});

test("threaded flange defines a reusable purchased Part with the requested name and source description", () => {
  const flange = new ThreadedFlange(), catalog = new PartCatalog();
  const description = flange.getPartDescription();
  const part = catalog.define(description, { createDesign: () => flange.createDesign() });
  assert.equal(flange.partKind, "hardware");
  assert.equal(part.kind, "hardware");
  assert.equal(part.issue, null);
  assert.equal(part.description.productName, "Threaded flange");
  assert.match(part.description.summary, /galvanized ceiling flange for ⅜-inch threaded rod/i);
  assert.equal(part.description.productUrl, "https://www.amazon.com/dp/B0F4N3DTHR");
  assert.match(part.description.note, /illustrative, not published dimensions/);
  assert.match(part.description.specifications.join(" "), /thread pitch is not specified/i);
  const second = new ThreadedFlange();
  assert.equal(catalog.define(second.getPartDescription(), { createDesign: () => second.createDesign() }), part);
  assert.deepEqual(part.createGeometry(), flange.createGeometry());
  assert.equal(part.material, null);
  assert.equal(part.volume, undefined, "Unspecified hardware weight must not become a wood estimate.");
});

test("mending plate is reusable purchased hardware with an open clearance bore and two mounting slots", () => {
  const plate = new MendingPlate(), mesh = plate.createGeometry(), catalog = new PartCatalog();
  assertBoardsGeometry(mesh);
  for (const [axis, expected] of [[0, 4.33], [1, 0.12], [2, 1.22]]) {
    const values = mesh.positions.filter((_, i) => i % 3 === axis);
    close(Math.max(...values) - Math.min(...values), expected);
  }
  close(Math.min(...mesh.positions.filter((_, i) => i % 3 === 1)), 0);
  assert.ok(mesh.grain.every(value => value === 0));
  for (const point of [[0, 0], [3 / 16, 0], [-3 / 16, 0],
    [-28 / 25.4, 0], [28 / 25.4, 0], [-37 / 25.4, 0], [37 / 25.4, 0]]) {
    assert.equal(horizontalSurfaceCovers(mesh, point), false, "The bolt bore and slots must remain open.");
  }
  for (const point of [[0.3, 0], [0, 0.4], [28 / 25.4, 0.4]]) {
    assert.equal(horizontalSurfaceCovers(mesh, point), true, "The plate must retain material around the openings.");
  }
  const part = catalog.define(plate.getPartDescription(), { createDesign: () => plate.createDesign() });
  assert.equal(plate.partKind, "hardware");
  assert.equal(part.kind, "hardware");
  assert.equal(part.issue, null);
  assert.equal(part.description.productName, "Mending plate");
  assert.equal(part.description.productUrl, "https://www.amazon.com/dp/B0F7Z44BS2");
  assert.match(part.description.note, /neither is specified/);
  assert.equal(part.material, null);
  assert.equal(part.volume, undefined);
  const second = new MendingPlate();
  assert.equal(catalog.define(second.getPartDescription(), { createDesign: () => second.createDesign() }), part);
  assert.deepEqual(part.createGeometry(), mesh);
  mesh.positions[0] = 100;
  assert.deepEqual(plate.createGeometry(), part.createGeometry(), "Callers must not mutate the cached mesh.");
});

test("threaded insert keeps full and flange-only closed meshes under one purchased Part", () => {
  const insert = new ThreadedInsert(), catalog = new PartCatalog();
  const part = catalog.define(insert.getPartDescription(), { createDesign: () => insert.createDesign() });
  const full = part.createGeometry(), installed = part.createInstalledGeometry();
  assert.notEqual(full, installed);
  for (const mesh of [full, installed]) {
    assertBoardsGeometry(mesh);
    for (const axis of [0, 2]) {
      const values = mesh.positions.filter((_, i) => i % 3 === axis);
      close(Math.max(...values) - Math.min(...values), THREADED_INSERT_DIMENSIONS.flangeDiameter);
    }
    assert.equal(horizontalSurfaceCovers(mesh, [0, 0]), mesh === installed);
    assert.equal(horizontalSurfaceCovers(mesh, [0.12, 0]), mesh === installed);
    assert.equal(horizontalSurfaceCovers(mesh, [0.21, 0]), true);
    assert.ok(mesh.grain.every(value => value === 0));
  }
  const fullHeights = full.positions.filter((_, i) => i % 3 === 1);
  const installedHeights = installed.positions.filter((_, i) => i % 3 === 1);
  close(Math.max(...fullHeights) - Math.min(...fullHeights), 10 / 25.4);
  close(Math.min(...installedHeights), 0);
  close(Math.max(...installedHeights), Math.max(...fullHeights));
  assert.ok(Math.max(...installedHeights) < THREADED_INSERT_DIMENSIONS.length / 10);
  assert.equal(part.description.productUrl, "https://www.amazon.com/dp/B0HFHNMTGR");
  assert.match(part.description.summary, /1\/4-20 x 10 mm/);
  assert.match(part.description.note, /illustrative/);
  assert.equal(part.material, null);
  assert.equal(part.volume, undefined);
  const second = new ThreadedInsert();
  assert.equal(catalog.define(second.getPartDescription(), { createDesign: () => second.createDesign() }), part);
  assert.deepEqual(insert.createGeometry(), installed);
  const mutable = insert.createGeometry();
  mutable.positions[0] = 100;
  assert.deepEqual(insert.createGeometry(), installed);
});

test("spindle joins install only insert flanges on the front faces of module 1 and 2 rear spindles", () => {
  for (const width of [20, 24, 36]) {
    const model = buildStairway(width);
    const pieces = model.partTree.getLeaves().filter(piece => piece.key === "rearSpindleInsert");
    assert.deepEqual(pieces.map(piece => piece.stepNumber), [3, 6]);
    assert.equal(pieces[0].part, pieces[1].part);
    const entry = new PartInventory(model.partTree).entries.find(entry => entry.key === pieces[0].part.key);
    assert.equal(entry.quantity, 2);
    for (const [index, piece] of pieces.entries()) {
      const step = model.modules[index].steps.at(-1), rear = step.parts.rearSpindle;
      const insert = step.parts.rearSpindleInsert, placement = insert.getPlacement();
      const normal = rear.getStockAxes()[1], across = rear.getStockAxes()[2];
      close(placement[12], (rear.footprint[0][0] + rear.footprint[1][0]) / 2);
      close(placement[14], -(rear.footprint[0][1] + rear.footprint[1][1]) / 2);
      close(placement[13], step.parts.spindleShim.vertices[0][1] + 2);
      assert.deepEqual(placement.slice(4, 7), normal);
      assert.ok(THREADED_INSERT_DIMENSIONS.flangeDiameter < rear.width);
      const local = insert.createGeometry();
      for (let i = 0; i < local.positions.length; i += 3) {
        const offset = Array.from(local.positions.slice(i, i + 3),
          (value, axis) => value - placement[12 + axis]);
        const projection = axis => offset.reduce((sum, value, j) => sum + value * axis[j], 0);
        assert.ok(projection(normal) >= -1e-5, "The flange must project outward, not into the wood.");
        assert.ok(Math.abs(projection(across)) < rear.width / 2);
      }
      assert.deepEqual(model.createNodeGeometry(piece.id),
        transformGeometry(piece.part.createInstalledGeometry(), model.getPieceTransform(piece.id)));
      for (const [explosion, moduleExplosion] of [[1, 0], [0, 1], [0.5, 0.5]]) {
        assert.deepEqual(model.createNodeGeometry(piece.id, explosion, moduleExplosion),
          transformGeometry(piece.part.createInstalledGeometry(),
            model.getPieceTransform(piece.id, explosion, moduleExplosion)));
      }
    }
    assert.equal(model.modules[2].steps.at(-1).parts.rearSpindleInsert, undefined);
    if (width === 20) close(model.estimateNodeWeightLb(), 181.86270468948476);
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
  assert.match(details.note, /4\.25.*4\.3.*flat 2x4 caster beam.*cross-beams bear directly/);
});

test("cross-beams sit directly on caster beams below unchanged upper framing without rails or spacers", () => {
  for (const width of [20, 24, 36]) for (const count of [9]) for (const modules of [3]) {
    if (count < modules * 2) continue;
    const model = buildStairway(width);
    for (const module of model.modules) {
      assert.equal(module.boards.rib, undefined);
      assert.equal(module.boards.innerBaseRail, undefined);
      assert.equal(module.boards.outerBaseRail, undefined);
      for (const key of ["leftSupportBeam", "rightSupportBeam"]) {
        const heights = Array.from(module.boards[key].createGeometry().positions).filter((_, i) => i % 3 === 1);
        close(Math.min(...heights), 4.25);
        close(Math.max(...heights), SUPPORT_BEAM_TOP_HEIGHT);
      }
      for (const step of module.steps) {
        for (const [key, caster] of Object.entries(step.parts.bottomFrame.hardware)) {
          const heights = Array.from(caster.createGeometry().positions).filter((_, i) => i % 3 === 1);
          close(Math.min(...heights), 0);
          close(Math.max(...heights), 4.25);
          close(module.boards[key.startsWith("left") ? "leftSupportBeam" : "rightSupportBeam"].bottomHeight,
            Math.max(...heights));
          assert.equal(step.parts.bottomFrame.boards[`${key}Spacer`], undefined);
        }
        const frame = step.parts.bottomFrame.boards;
        close(step.parts.tread.bottomHeight + 0.5, step.height);
        const raisedLeft = module.startIndex > 0 && step !== module.steps[0];
        for (const [key, upright] of Object.entries(step.parts.uprights.boards)) {
          close(upright.bottomHeight, raisedLeft && key === "leftUpright"
            ? module.steps[0].parts.topFrame.boards.leftStepSupport.bottomHeight : 7.25);
        }
        if (!frame.supportCrossPiece) continue;
        close(frame.supportCrossPiece.bottomHeight, SUPPORT_BEAM_TOP_HEIGHT);
        close(frame.supportCrossPiece.bottomHeight + frame.supportCrossPiece.thickness, 7.25);
        assert.equal(frame.rightSupportBlock.bottomHeight, 7.25);
        if (raisedLeft) assert.equal(frame.leftSupportBlock, undefined);
        else assert.equal(frame.leftSupportBlock.bottomHeight, 7.25);
        if (frame.rearSupportCrossPiece) close(frame.rearSupportCrossPiece.bottomHeight, SUPPORT_BEAM_TOP_HEIGHT);
      }
    }
  }
});

test("every lower cross-piece has real bearing on both caster beams, including the first-step carriers", () => {
  for (const width of [20, 24, 36]) for (const module of buildStairway(width).modules) {
    for (const [index, step] of module.steps.entries()) {
      const boards = step.parts.bottomFrame.boards, top = step.parts.topFrame.boards;
      const c = Math.cos(index * step.angle), s = Math.sin(index * step.angle);
      for (const cross of [boards.supportCrossPiece, boards.rearSupportCrossPiece,
        top.frontStepFrontBearing, top.frontStepRearBearing].filter(Boolean)) {
        const footprint = cross.footprint.map(([east, north]) =>
          [c * (east + INNER_RADIUS) - s * north - INNER_RADIUS, s * (east + INNER_RADIUS) + c * north]);
        for (const beam of [module.boards.leftSupportBeam, module.boards.rightSupportBeam]) {
          close(cross.bottomHeight, beam.bottomHeight + beam.thickness);
          assert.ok(contactArea(footprint, beam.footprint) > 2, "A crossing needs a positive bearing patch.");
        }
      }
    }
  }
});

test("radial panel blocks connect directly beneath existing cross-pieces without ties", () => {
  for (const width of [20, 24, 36]) for (const module of buildStairway(width).modules) {
    for (const side of ["front", "rear"]) {
      assert.equal(module.boards[`${side}PanelSupportTie`], undefined);
      const block = module.boards[`${side}PanelSupportBlock`];
      if (!block) continue;
      const index = side === "rear" ? module.steps.length - 1 : 1, step = module.steps[index];
      const cross = step.parts.bottomFrame.boards.supportCrossPiece;
      const c = Math.cos(index * step.angle), s = Math.sin(index * step.angle);
      const footprint = cross.footprint.map(([east, north]) =>
        [c * (east + INNER_RADIUS) - s * north - INNER_RADIUS, s * (east + INNER_RADIUS) + c * north]);
      close(block.bottomHeight + block.width, cross.bottomHeight);
      close(block.bottomHeight, module.boards.sidingStiffenerUpper.bottomHeight + PANEL_STIFFENER_THICKNESS);
      assert.ok(contactArea(block.footprint, footprint) > 5.5, "Most of the block's 6-square-inch top meets the cross-piece.");
      const description = block.getManufacturingDescription();
      assert.equal(description.stock.nominalSize, "2x4");
      close(description.blank.length, 4);
      close(description.blank.thickness, 1.5);
      close(description.blank.width, 3.5);
      assert.deepEqual(description.notches, []);
      for (const geometry of [block.createGeometry(), block.createStockGeometry()]) assertBoardsGeometry(geometry);
      close(meshVolume(block.createGeometry()), meshVolume(block.createStockGeometry()), 0.001);
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
  const rib = buildStairway().modules[1].boards.sidingRib, construction = structuredClone(rib.construction);
  construction.notches[0].width += 0.125;
  construction.notches[0].depth += 0.5;
  const changed = new ProfiledPlywood({ construction, thickness: rib.thickness });
  assert.notDeepEqual(changed.outline, rib.outline);
  assert.ok(changed.getMaterialVolume() < rib.getMaterialVolume());
  assert.throws(() => new ProfiledPlywood({ construction, outline: rib.outline, thickness: rib.thickness }), /not both/);
});

test("curved treads follow the castle and siding while straight framing clears the entire castle cylinder", () => {
  for (const count of [9]) for (const width of [20, 24, 36]) for (const modules of [3]) {
    if (count < modules * 2) continue;
    const model = buildStairway(width);
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
        const [front, back] = [step.footprint[0], step.footprint[3]];
        for (const point of [left.footprint[0], left.footprint[3]]) {
          close((point[0] - front[0]) * (back[1] - front[1]) -
            (point[1] - front[1]) * (back[0] - front[0]), 0);
        }
      }
    }
    for (const node of model.partTree.getLeaves()) {
      const board = constructionBoard(model, node);
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
  for (const modules of [3]) for (const width of [20, 24, 36]) {
    const model = buildStairway(width);
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

test("splitting moves every module away from the castle and increases the gaps between modules", () => {
  for (const [steps, count, width] of [[9, 2, 20], [9, 3, 36], [9, 3, 20]]) {
    const model = buildStairway(width);
    const base = model.partTree.root.children.map(module => model.createNodeGeometry(module.id));
    const centers = model.modules.map(module => {
      const angle = (module.startIndex + module.steps.length / 2) * Math.PI / (2 * steps);
      const radius = model.innerRadius + width / 2;
      return [radius * Math.cos(angle), -radius * Math.sin(angle)];
    });
    let previousCenters = centers;
    let previousRadii = base.map(geometry => geometry.positions.filter((_, i) => i % 3 === 0)
      .map((x, i) => Math.hypot(x, geometry.positions[i * 3 + 2])));
    for (const amount of [0.25, 0.5, 1]) {
      const matrices = model.getModuleTransforms(amount);
      const movedCenters = centers.map(([x, z], index) => {
        const matrix = matrices[index];
        close(Math.hypot(matrix[12], matrix[14]), width * amount, 1e-4);
        assert.equal(matrix[13], 0);
        return [matrix[0] * x + matrix[8] * z + matrix[12],
          matrix[2] * x + matrix[10] * z + matrix[14]];
      });
      for (let i = 0; i < count; i++) for (let j = i + 1; j < count; j++) {
        const gap = points => Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]);
        assert.ok(gap(movedCenters) > gap(previousCenters));
      }
      previousCenters = movedCenters;
      previousRadii = base.map((geometry, index) => {
        const matrix = matrices[index], radii = [];
        for (let i = 0; i < geometry.positions.length; i += 3) {
          const x = geometry.positions[i], z = geometry.positions[i + 2];
          const movedX = matrix[0] * x + matrix[8] * z + matrix[12];
          const movedZ = matrix[2] * x + matrix[10] * z + matrix[14];
          const radius = Math.hypot(movedX, movedZ);
          assert.ok(radius > previousRadii[index][i / 3], `Module ${index + 1} must move outward.`);
          radii.push(radius);
        }
        return radii;
      });
    }
    for (const matrix of model.getModuleTransforms(0)) {
      matrix.forEach((value, index) => close(value, index % 5 === 0 ? 1 : 0));
    }
  }
});

test("module matrices reproduce split piece positions and normals for even and unequal module layouts", () => {
  for (const count of [3]) {
    const model = buildStairway(24);
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
  for (const modules of [3]) {
    const model = buildStairway(24);
    const leaves = new Map(model.partTree.getLeaves().map(node => [constructionBoard(model, node), node.id]));
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
  for (const [steps, modules] of [[9, 3]]) {
    const model = buildStairway(24);
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
  for (const stepCount of [9]) {
    const [first, second] = buildStairway(24).steps;
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
    for (const board of [boards.southCrossPiece]) {
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
    close(boards.newelInnerBlock.footprint[0][1], 1);
    close(boards.newelInnerBlock.footprint[1][1], 1);
    assert.equal(boards.southCrossPiece.stock.nominalSize, "1x6");
    close(boards.southCrossPiece.thickness, 0.75);
    close(boards.southCrossPiece.bottomHeight, 2.5);
    close(boards.southCrossPiece.bottomHeight + boards.southCrossPiece.width, first.parts.tread.bottomHeight);
  }
});

test("rotated 1x4 uprights retain end bearing with only the four extended-support bottom seats", () => {
  for (const width of [20, 24, 36]) for (const count of [9]) for (const modules of [3]) {
    if (count < modules * 2) continue;
    const model = buildStairway(width);
    for (const step of model.steps.slice(1)) {
      for (const [key, board] of Object.entries(step.parts.uprights.boards)) {
        const rear = key.includes("Rear");
        const raised = key === "leftUpright" && [5, 6, 8, 9].includes(step.height / step.stepRise);
        const bottom = raised ? (step.height / step.stepRise < 7 ? 30 : 55.5) : 7.25;
        close(board.bottomHeight, bottom);
        const upper = step.parts.topFrame.boards[rear ? "northCrossPiece" : "southCrossPiece"];
        close(board.bottomHeight + board.length, upper.bottomHeight);
        const crossPiece = step.parts.bottomFrame.boards[key.includes("Rear") ?
          "rearSupportCrossPiece" : "supportCrossPiece"];
        const description = board.getManufacturingDescription();
        assert.equal(description.stock.nominalSize, "1x4");
        close(description.blank.thickness, 0.75);
        close(description.blank.width, 3.5);
        assert.deepEqual(description.notches, []);
        assert.deepEqual(description.dados, []);
        assert.equal(description.edgeNotches.length, Number(raised));
        const removed = description.edgeNotches.reduce((sum, { profiles }) => sum +
          (profiles[0][1][0] - profiles[0][0][0]) * board.thickness *
          (board.width - (profiles[0][0][1] + profiles[1][0][1]) / 2), 0);
        if (!raised) close(board.bottomHeight, crossPiece.bottomHeight + crossPiece.thickness);
        close(Math.hypot(...board.footprint[1].map((value, i) => value - board.footprint[0][i])), 3.5);
        close(Math.hypot(...board.footprint[3].map((value, i) => value - board.footprint[0][i])), 0.75);
        const installed = board.createGeometry();
        for (const geometry of [installed, board.createStockGeometry()]) {
          assertBoardsGeometry(geometry);
          close(meshVolume(geometry), board.length * 3.5 * 0.75 - removed, 1e-3);
        }
        const heights = Array.from(installed.positions).filter((_, index) => index % 3 === 1);
        close(Math.min(...heights), bottom);
        close(Math.max(...heights), upper.bottomHeight);
      }
    }
  }
});

test("flush front posts directly carry half-lapped front supports underneath the side supports", () => {
  for (const width of [20, 24, 36]) {
    const model = buildStairway(width);
    assert.equal(model.partTree.getLeaves().filter(piece => piece.category === "uprights").length, 22);
    for (const step of model.steps.slice(1)) {
      const frame = step.parts.topFrame.boards, front = frame.southCrossPiece;
      assert.equal(frame.frontBearingCap, undefined);
      assert.deepEqual(Object.keys(front.notches).sort(), ["endFar", "startFar"]);
      for (const key of ["leftUpright", "rightUpright"]) {
        const post = step.parts.uprights.boards[key];
        close(post.bottomHeight + post.length, front.bottomHeight);
        for (const point of post.footprint.slice(0, 2)) close(point[1], 0.25);
        for (const point of post.footprint) for (const [i, a] of front.footprint.entries()) {
          const b = front.footprint[(i + 1) % front.footprint.length];
          assert.ok((b[0] - a[0]) * (point[1] - a[1]) -
            (b[1] - a[1]) * (point[0] - a[0]) >= -1e-8, `${key} must bear fully under the front support`);
        }
      }
      for (const side of ["left", "right"]) {
        const support = frame[`${side}StepSupport`];
        const extended = side === "left" && [4, 7].includes(step.height / step.stepRise);
        assert.deepEqual(Object.keys(support.notches),
          extended ? ["startNear"] :
            ["startNear", step.parts.uprights.boards.rightRearUpright ? "endFar" : "endNear"]);
        const frontNotch = front.notches[side === "left" ? "startFar" : "endFar"];
        for (const notch of [frontNotch, support.notches.startNear]) {
          assert.ok(notch.lengths.every(length => length >= 0.75));
          assert.deepEqual(notch.depth, [1.75, 1.75]);
        }
        for (const point of support.footprint.slice(0, 2)) close(point[1], 0.25);
        close(support.bottomHeight + support.notches.startNear.depth[0],
          front.bottomHeight + front.width - frontNotch.depth[0]);
        assert.ok(horizontalContactArea(front, support, front.bottomHeight + 1.75) > 0.5,
          "The unchanged front half-lap must actually bear the side support.");
      }
      for (const key of ["southCrossPiece", "northCrossPiece", "leftStepSupport", "rightStepSupport"]) {
        const board = frame[key], description = board.getManufacturingDescription();
        assert.equal(description.stock.nominalSize, "1x4");
        close(board.bottomHeight + board.width, step.parts.tread.bottomHeight);
        const changedCorner = [4, 7].includes(step.height / step.stepRise) &&
          ["northCrossPiece", "leftStepSupport"].includes(key);
        assert.equal(description.notches.length, changedCorner ? 1 : 2);
        const stock = board.createStockGeometry(), installed = board.createGeometry();
        assertBoardsGeometry(stock);
        assertBoardsGeometry(installed);
        close(meshVolume(stock), meshVolume(installed), 0.001);
      }
    }
  }
});

test("upper modules extend their first left supports onto rear face cross-pieces and carry raised posts", () => {
  for (const width of [20, 24, 36]) {
    const model = buildStairway(width), inventory = new PartInventory(model.partTree);
    const installed = id => ({ createGeometry: () => model.createNodeGeometry(id) });
    const beams = model.partTree.getLeaves().filter(piece => piece.key === "extendedLeftSupportCrossPiece");
    assert.equal(beams.length, 2);
    assert.equal(beams[0].part, beams[1].part);
    for (const [moduleIndex, module] of model.modules.entries()) {
      const first = module.steps[0], last = module.steps.at(-1), stepNumber = module.startIndex + 1;
      const cross = last.parts.topFrame.boards.extendedLeftSupportCrossPiece;
      if (!moduleIndex) {
        assert.equal(cross, undefined);
        for (const step of module.steps) for (const post of Object.values(step.parts.uprights.boards)) {
          close(post.bottomHeight, 7.25);
        }
        continue;
      }
      const support = first.parts.topFrame.boards.leftStepSupport;
      const supportId = `stairway/module-${moduleIndex + 1}/step-${stepNumber}-leftStepSupport`;
      const crossId = `stairway/module-${moduleIndex + 1}/step-${stepNumber + 2}-extendedLeftSupportCrossPiece`;
      close(support.bottomHeight, moduleIndex === 1 ? 30 : 55.5);
      close(cross.bottomHeight + cross.width, support.bottomHeight);
      assert.equal(cross.stock.nominalSize, "1x4");
      close(cross.width, 3.5);
      close(cross.thickness, 0.75);
      assert.deepEqual(Object.keys(cross.notches), ["endFar"]);
      assert.deepEqual(cross.notches.endFar.depth, [0.5, 0.5]);
      assert.deepEqual(Object.keys(support.notches), ["startNear"]);
      assert.deepEqual(Object.keys(first.parts.topFrame.boards.northCrossPiece.notches), ["endFar"]);
      assert.ok(horizontalContactArea(installed(crossId), installed(supportId), support.bottomHeight) > 0.6,
        "The extended support must bear on the new cross-piece, not just touch its edge.");
      const rib = module.boards.sidingRib3, ribId = `stairway/module-${moduleIndex + 1}/sidingRib3`;
      assert.ok(!rib.construction.notches.some(cut => /extended left support cross piece/.test(cut.name)));
      assert.ok(horizontalContactArea(installed(crossId), installed(ribId), rib.bottomHeight) > 2,
        "The uncut rib must bear on the half-inch seat in the new cross-piece.");
      const piece = model.partTree.getNode(crossId);
      assert.equal(piece.category, "step-framing");
      assert.deepEqual(inventory.findOccurrence(crossId).locations.find(location => location.id === crossId).subsets,
        ["step-framing", "banister", "ribs"]);
      for (const side of ["left", "right"]) {
        const post = last.parts.uprights.boards[`${side}RearUpright`];
        const plane = post.footprint[0].reduce((sum, value, axis) => sum + value * post.along[axis], 0);
        for (const point of cross.footprint.slice(2)) close(
          point.reduce((sum, value, axis) => sum + value * post.along[axis], 0), plane);
        for (const point of post.footprint.slice(0, 2)) {
          const across = point.reduce((sum, value, axis) =>
            sum + (value - cross.footprint[3][axis]) * post.across[axis], 0);
          assert.ok(across >= -1e-8 && across <= cross.length + 1e-8);
        }
        assert.ok(cross.bottomHeight >= post.bottomHeight);
        assert.ok(cross.bottomHeight + cross.width <= post.bottomHeight + post.length);
      }
      const rear = first.parts.topFrame.boards.northCrossPiece;
      const [insideFront, insideRear] = support.footprint.slice(1, 3);
      const dx = insideRear[0] - insideFront[0], dy = insideRear[1] - insideFront[1];
      for (const point of [rear.footprint[0], rear.footprint[3]]) {
        close(((point[0] - insideFront[0]) * dy - (point[1] - insideFront[1]) * dx) /
          Math.hypot(dx, dy), 0);
      }
      for (const [index, step] of module.steps.entries()) {
        if (!index) continue;
        const post = step.parts.uprights.boards.leftUpright;
        const postId = `stairway/module-${moduleIndex + 1}/step-${stepNumber + index}-leftUpright`;
        close(post.bottomHeight, support.bottomHeight);
        close(post.bottomHeight + post.length, step.parts.topFrame.boards.southCrossPiece.bottomHeight);
        assert.equal(step.parts.bottomFrame.boards.leftSupportBlock, undefined);
        const bottomCuts = post.edgeNotches.filter(cut => cut.profiles[0][0][0] === 0);
        assert.equal(bottomCuts.length, 1);
        for (const profile of bottomCuts[0].profiles) close(profile[1][0], 3.5);
        assert.ok(horizontalContactArea(installed(supportId), installed(postId), support.bottomHeight + support.width) > 0.5,
          "Raised left uprights must actually sit on the extended support at their notch ceilings.");
      }
      for (const board of [cross, support, rear]) {
        const stock = board.createStockGeometry(), geometry = board.createGeometry();
        assertBoardsGeometry(stock);
        assertBoardsGeometry(geometry);
        close(meshVolume(geometry), meshVolume(stock), 0.001);
      }
    }
  }
});

test("reversed rear half-laps carry rear boards at module backs and sides between steps", () => {
  for (const width of [20, 24, 36]) for (const module of buildStairway(width).modules) {
    for (const step of module.steps) {
      const frame = step.parts.topFrame.boards, rear = frame.northCrossPiece;
      if (!rear) continue;
      const last = step === module.steps.at(-1), shoulder = rear.bottomHeight + 1.75;
      const extended = module.startIndex > 0 && step === module.steps[0];
      assert.deepEqual(Object.keys(rear.notches).sort(),
        last ? ["endNear", "startNear"] : extended ? ["endFar"] : ["endFar", "startFar"]);
      for (const side of ["left", "right"]) {
        const support = frame[`${side}StepSupport`];
        if (extended && side === "left") {
          assert.equal(support.notches.endNear, undefined);
          continue;
        }
        const sideNotch = support.notches[last ? "endFar" : "endNear"];
        const rearNotch = rear.notches[side === "left"
          ? last ? "startNear" : "startFar" : last ? "endNear" : "endFar"];
        assert.deepEqual(sideNotch.depth, [1.75, 1.75]);
        assert.deepEqual(rearNotch.depth, [1.75, 1.75]);
        assert.ok(horizontalContactArea(last ? support : rear, last ? rear : support, shoulder) > 0.5,
          "The retained lower half must present a real bearing shoulder beneath the upper half.");
        if (last) {
          const post = step.parts.uprights.boards[`${side}RearUpright`];
          close(post.bottomHeight + post.length, rear.bottomHeight);
          assert.deepEqual(post.edgeNotches, []);
          assert.ok(horizontalContactArea(post, rear, rear.bottomHeight) > 1.5);
        }
      }
    }
  }
});

test("intermediate side supports stop at the next post faces without tongue notches", () => {
  for (const width of [20, 24, 36]) {
    const model = buildStairway(width);
    let joints = 0;
    for (const module of model.modules) for (const [index, step] of module.steps.entries()) {
      if (step === module.steps.at(-1) || !step.parts.topFrame.boards.rightStepSupport) continue;
      const next = module.steps[index + 1];
      const c = Math.cos(step.angle), s = Math.sin(step.angle);
      for (const side of ["left", "right"]) {
        if (side === "left" && module.startIndex > 0 && index === 0) continue;
        const support = step.parts.topFrame.boards[`${side}StepSupport`];
        const post = next.parts.uprights.boards[`${side}Upright`];
        const ends = support.footprint.slice(2).map(([east, north]) =>
          [c * (east + INNER_RADIUS) + s * north - INNER_RADIUS, -s * (east + INNER_RADIUS) + c * north]);
        for (const point of ends) close(point[1], post.footprint[0][1]);
        assert.ok(post.edgeNotches.every(cut => cut.profiles.every(([start, end]) =>
          start[0] === 0 && end[0] === 3.5)),
        "Only the new bottom seats around full-length left supports may remain.");
        joints++;
      }
    }
    assert.equal(joints, 8);
    for (const module of model.modules.slice(1)) {
      for (const side of ["left", "right"]) {
        assert.deepEqual(module.steps[0].parts.uprights.boards[`${side}Upright`].edgeNotches, []);
      }
    }
  }
});

test("module backs have no plywood gussets or panels obstructing removable attachments", () => {
  for (const width of [20, 24, 36]) {
    const model = buildStairway(width), pieces = model.partTree.getLeaves();
    assert.ok(!pieces.some(piece =>
      ["upperBackGusset", "lowerBackGusset", "rearUprightBrace", "backPanel"].includes(piece.key)));
    for (const module of model.modules) {
      const step = module.steps.at(-1);
      assert.equal(step.parts.backPanel, undefined);
      assert.equal(step.parts.lowerBackGusset, undefined);
      assert.equal(step.parts.upperBackGusset, undefined);
      assert.equal(step.parts.rearUprightBrace, undefined);
    }
  }
});

test("lower front plywood braces retain the rear panel size and fill the module-front setback", () => {
  for (const width of [20, 24, 36]) {
    const model = buildStairway(width);
    const pieces = model.partTree.getLeaves().filter(piece => piece.key === "frontUprightBrace");
    assert.equal(pieces.length, 2);
    assert.equal(pieces[0].part, pieces[1].part);
    assert.ok(model.steps.every(step => step.parts.rearUprightBrace === undefined));
    for (const [moduleIndex, module] of model.modules.entries()) {
      const step = module.steps[0], brace = step.parts.frontUprightBrace;
      if (!moduleIndex) {
        assert.equal(brace, undefined);
        continue;
      }
      const posts = step.parts.uprights.boards, frame = step.parts.bottomFrame.boards;
      const left = posts.leftUpright, right = posts.rightUpright;
      const rear = module.steps.at(-1).parts.uprights.boards;
      const beam = frame.supportCrossPiece;
      close(brace.width, 8);
      close(brace.thickness, 0.25);
      close(brace.bottomHeight, beam.bottomHeight);
      close(brace.bottomHeight, 5.75);
      close(brace.length, Math.hypot(...rear.rightRearUpright.footprint[1].map((value, axis) =>
        value - rear.leftRearUpright.footprint[0][axis])));
      close((brace.footprint[0][0] + brace.footprint[1][0]) / 2,
        (left.footprint[0][0] + right.footprint[1][0]) / 2);
      for (const point of brace.footprint.slice(0, 2)) close(point[1], 0);
      for (const point of brace.footprint.slice(2)) close(point[1], 0.25);
      for (const side of ["left", "right"]) {
        const post = posts[`${side}Upright`];
        close(post.footprint[0][1], brace.footprint[3][1]);
        const overlap = Math.min(brace.footprint[2][0], post.footprint[1][0]) -
          Math.max(brace.footprint[3][0], post.footprint[0][0]);
        assert.ok(overlap > 3.4, "Both front posts must have broad-face contact with the brace.");
        const preceding = model.modules[moduleIndex - 1].steps.at(-1);
        const previousPost = preceding.parts.uprights.boards[`${side}RearUpright`];
        const c = Math.cos(step.angle), s = Math.sin(step.angle);
        const matingFace = previousPost.footprint.slice(2).map(([east, north]) => [
          c * (east + INNER_RADIUS) + s * north - INNER_RADIUS,
          -s * (east + INNER_RADIUS) + c * north,
        ]);
        for (const point of matingFace) close(point[1], brace.footprint[0][1]);
        const faceMin = Math.min(...matingFace.map(point => point[0]));
        const faceMax = Math.max(...matingFace.map(point => point[0]));
        const area = contactArea([
          [brace.footprint[0][0], brace.bottomHeight],
          [brace.footprint[1][0], brace.bottomHeight],
          [brace.footprint[1][0], brace.bottomHeight + brace.width],
          [brace.footprint[0][0], brace.bottomHeight + brace.width],
        ], [[faceMin, previousPost.bottomHeight], [faceMax, previousPost.bottomHeight],
          [faceMax, previousPost.bottomHeight + previousPost.length],
          [faceMin, previousPost.bottomHeight + previousPost.length]]);
        assert.ok(area > 20, "Each preceding rear post must meet the panel flush over a broad fastening face.");
      }
      const prefix = `stairway/module-${moduleIndex + 1}/step-${module.startIndex + 1}`;
      const installed = key => ({ createGeometry: () => model.createNodeGeometry(`${prefix}-${key}`) });
      assert.equal(brace.getManufacturingDescription().kind, "plywood");
      for (const geometry of [brace.createGeometry(), brace.createStockGeometry(),
        installed("frontUprightBrace").createGeometry()]) {
        assertBoardsGeometry(geometry);
        close(meshVolume(geometry), brace.length * 8 * 0.25, 0.001);
      }
    }
  }
});

test("rear tread attachment blocks face forward and meet the treads and side support inside faces", () => {
  for (const width of [20, 24, 36]) {
    const model = buildStairway(width), leaves = model.partTree.getLeaves();
    const pieces = leaves.filter(piece => /^(left|right)RearTreadBlock$/.test(piece.key));
    assert.equal(pieces.length, 4);
    assert.equal(new Set(pieces.map(piece => piece.part)).size, 1);
    assert.deepEqual([...new Set(pieces.map(piece => piece.stepNumber))], [3, 6]);
    for (const piece of pieces) {
      const step = model.steps[piece.stepNumber - 1], left = piece.key.startsWith("left");
      const block = step.parts.topFrame.boards[piece.key], side = left ? "left" : "right";
      const support = step.parts.topFrame.boards[`${side}StepSupport`];
      const edge = left ? [support.footprint[1], support.footprint[2]]
        : [support.footprint[0], support.footprint[3]];
      const depth = Math.hypot(...edge[1].map((value, axis) => value - edge[0][axis]));
      const along = edge[1].map((value, axis) => (value - edge[0][axis]) / depth);
      const distance = point => (point[0] - edge[0][0]) * along[1] -
        (point[1] - edge[0][1]) * along[0];
      const broadEdge = block.footprint[3].map((value, axis) => value - block.footprint[0][axis]);
      const rear = step.parts.topFrame.boards.northCrossPiece;
      const rearEdge = rear.footprint[1].map((value, axis) => value - rear.footprint[0][axis]);
      close(broadEdge[0] * rearEdge[1] - broadEdge[1] * rearEdge[0], 0);
      close(block.bottomHeight, piece.stepNumber === 3 ? 18 : 43.5);
      close(block.bottomHeight + block.length, step.parts.tread.bottomHeight);
      assert.equal(block.stock.nominalSize, "1x4");
      assert.deepEqual(block.grain.direction, [0, 1, 0]);
      const blank = piece.getDescription().blank;
      close(blank.length, 7);
      close(blank.width, block.width);
      close(blank.thickness, 0.75);
      {
        const upright = step.parts.uprights.boards[`${side}RearUpright`];
        const project = point => point.reduce((sum, value, axis) => sum + value * upright.across[axis], 0);
        close(project(block.footprint[2]), project(upright.footprint[left ? 1 : 0]));
        close(project(block.footprint[3]), project(upright.footprint[left ? 1 : 0]));
        assert.ok(block.width < 3.5);
        assert.ok(piece.getDescription().widthTrim, "The narrower block must record its rip from 1x4 stock.");
      }
      const [a, b] = rear.footprint;
      const rearClearance = block.footprint.map(point =>
        ((b[1] - a[1]) * (point[0] - a[0]) - (b[0] - a[0]) * (point[1] - a[1])) /
          Math.hypot(b[0] - a[0], b[1] - a[1]));
      assert.ok(rearClearance.every(value => value >= -1e-8));
      close(Math.min(...rearClearance), 0, 1e-8);
      const bevel = 0.75 * Math.tan(step.angle / 2);
      const area = 0.75 * (block.width - bevel / 2);
      close(horizontalContactArea(block, step.parts.tread, step.parts.tread.bottomHeight), area);
      const mesh = block.createGeometry();
      let sideContact = 0;
      const rearSurfaces = new Set();
      for (let i = 0; i < mesh.indices.length; i += 3) {
        const triangle = Array.from(mesh.indices.slice(i, i + 3), vertex =>
          [mesh.positions[vertex * 3], mesh.positions[vertex * 3 + 1], -mesh.positions[vertex * 3 + 2]]);
        if (triangle.every(point => Math.abs(distance([point[0], point[2]])) < 1e-5)) {
          sideContact += contactArea(triangle.map(point => [
            (point[0] - edge[0][0]) * along[0] + (point[2] - edge[0][1]) * along[1], point[1],
          ]), [[0, support.bottomHeight], [depth, support.bottomHeight],
            [depth, step.parts.tread.bottomHeight], [0, step.parts.tread.bottomHeight]]);
        }
        const onRear = triangle.every(point =>
          Math.abs(rearEdge[1] * (point[0] - a[0]) - rearEdge[0] * (point[2] - a[1])) < 1e-4);
        if (onRear) {
          const across = rearEdge.map(value => value / Math.hypot(...rearEdge));
          const project = ([east, north]) => east * across[0] + north * across[1];
          const face = triangle.map(point => [project([point[0], point[2]]), point[1]]);
          for (const [name, board] of [["rear support", rear],
            ["rear upright", step.parts.uprights.boards[`${side}RearUpright`]]]) {
            const xs = board.footprint.slice(0, 2).map(project);
            const bottom = board.bottomHeight, top = bottom + (board === rear ? board.width : board.length);
            if (contactArea(face, [[xs[0], bottom], [xs[1], bottom], [xs[1], top], [xs[0], top]]) > 0.01) {
              rearSurfaces.add(name);
            }
          }
        }
      }
      close(sideContact, 0.75 / Math.cos(step.angle / 2) * 3.5);
      assert.deepEqual(rearSurfaces, new Set(["rear support", "rear upright"]));
      for (const mesh of [block.createGeometry(), block.createStockGeometry(), model.createNodeGeometry(piece.id)]) {
        assertBoardsGeometry(mesh);
        close(meshVolume(mesh), 7 * area, 0.001);
      }
    }
  }
});

test("four threaded flanges mount vertically, centered across the blocks and one eighth inch above their bottoms", () => {
  for (const width of [20, 24, 36]) {
    const model = buildStairway(width);
    const pieces = model.partTree.getLeaves().filter(piece => /^(left|right)RearTreadFlange$/.test(piece.key));
    assert.equal(pieces.length, 4);
    assert.equal(new Set(pieces.map(piece => piece.part)).size, 1);
    assert.deepEqual([...new Set(pieces.map(piece => piece.stepNumber))], [3, 6]);
    for (const piece of pieces) {
      const step = model.steps[piece.stepNumber - 1], left = piece.key.startsWith("left");
      const flange = step.parts[piece.key];
      const block = step.parts.topFrame.boards[`${left ? "left" : "right"}RearTreadBlock`];
      const face = left ? block.footprint.slice(1, 3) : [block.footprint[0], block.footprint[3]];
      const bevel = block.rebates[0].depth[left ? 1 : 0];
      face[0] = face[0].map((value, axis) => value + (face[1][axis] - value) * bevel / block.width);
      const center = face[0].map((value, axis) => (value + face[1][axis]) / 2);
      const placement = flange.getPlacement();
      close(placement[12], center[0]);
      close(placement[13], block.bottomHeight + 1 / 8 + 2.75 / 2);
      close(placement[14], -center[1]);
      close(placement[0], 0);
      close(placement[1], 1, 1e-8);
      close(placement[2], 0);
      const mesh = flange.createGeometry();
      close(Math.min(...mesh.positions.filter((_, i) => i % 3 === 1)), block.bottomHeight + 1 / 8);
      const coordinates = [[], [], []];
      for (let i = 0; i < mesh.positions.length; i += 3) {
        for (let axis = 0; axis < 3; axis++) {
          coordinates[axis].push([0, 1, 2].reduce((sum, column) =>
            sum + (mesh.positions[i + column] - placement[12 + column]) * placement[axis * 4 + column], 0));
        }
      }
      close(Math.min(...coordinates[0]), -2.75 / 2);
      close(Math.max(...coordinates[0]), 2.75 / 2);
      close(Math.min(...coordinates[2]), -1.27 / 2);
      close(Math.max(...coordinates[2]), 1.27 / 2);
      close(Math.min(...coordinates[1]), 0);
      assert.ok(Math.max(...coordinates[1]) > 5 / 25.4, "The boss must project out from the block's front face.");
      assert.ok(placement[6] > 0.98, "The boss faces forward, not into the board or across the stairway.");
      assert.equal(piece.kind, "hardware");
      assert.equal(piece.part.issue, null);
      assert.equal(model.estimateNodeWeightLb(piece.id), 0);
      assertBoardsGeometry(mesh);
      close(meshVolume(model.createNodeGeometry(piece.id)), meshVolume(mesh), 0.001);
    }
  }
});

test("eight mending plates contact the backs of module-front uprights and align with the threaded flange axes", () => {
  for (const width of [20, 24, 36]) {
    const model = buildStairway(width), leaves = model.partTree.getLeaves();
    const plates = leaves.filter(piece => /^(left|right)(FrontUpright|LowerUpright)MendingPlate$/.test(piece.key));
    assert.equal(plates.length, 8);
    assert.equal(new Set(plates.map(piece => piece.part)).size, 1);
    assert.deepEqual(plates.map(piece => piece.stepNumber), [4, 4, 4, 4, 7, 7, 7, 7]);
    for (const piece of plates) {
      const side = piece.key.startsWith("left") ? "left" : "right";
      const step = model.steps[piece.stepNumber - 1];
      const upright = step.parts.uprights.boards[`${side}Upright`];
      const plate = step.parts[piece.key], placement = plate.getPlacement();
      const flangeKey = `${side}${piece.key.includes("LowerUpright") ? "LowerUprightFlange" : "RearTreadFlange"}`;
      const flange = leaves.find(candidate =>
        candidate.stepNumber === piece.stepNumber - 1 && candidate.key === flangeKey);
      const a = model.getPieceTransform(piece.id), b = model.getPieceTransform(flange.id);
      const difference = [0, 1, 2].map(axis => a[12 + axis] - b[12 + axis]);
      const separation = difference.reduce((sum, value, axis) => sum + value * b[4 + axis], 0);
      assert.ok(Math.abs(separation) > 1, "The plate and flange must lie on opposite sides of the joint.");
      for (let axis = 0; axis < 3; axis++) {
        close(difference[axis], separation * b[4 + axis], 1e-8);
        close(a[4 + axis], -b[4 + axis], 1e-8);
      }
      close(placement[1], 1, 1e-8);
      close(placement[6], -1, 1e-8);
      const mesh = plate.createGeometry();
      const bounds = [0, 1, 2].map(axis => {
        const values = mesh.positions.filter((_, i) => i % 3 === axis);
        return [Math.min(...values), Math.max(...values)];
      });
      close(bounds[2][1], -upright.footprint[3][1]);
      close(bounds[2][0], -upright.footprint[3][1] - 0.12);
      assert.ok(bounds[0][0] >= upright.footprint[3][0]);
      assert.ok(bounds[0][1] <= upright.footprint[2][0]);
      assert.ok(bounds[1][0] >= upright.bottomHeight);
      assert.ok(bounds[1][1] <= upright.bottomHeight + upright.length);
      assert.equal(piece.kind, "hardware");
      assert.equal(piece.part.issue, null);
      assert.equal(plate.category, "step-framing");
      assert.equal(model.estimateNodeWeightLb(piece.id), 0);
      assertBoardsGeometry(mesh);
      close(meshVolume(model.createNodeGeometry(piece.id)), meshVolume(mesh), 0.001);
      assert.deepEqual(plate.createDesign(), new MendingPlate().createDesign(),
        "Installed placement must not alter the canonical Part.");
    }
  }
});

test("both lower module connector pairs sit above upright blocks and use the existing front braces without spacers", () => {
  for (const width of [20, 24, 36]) {
    const model = buildStairway(width), leaves = model.partTree.getLeaves();
    const flanges = leaves.filter(piece => /^(left|right)LowerUprightFlange$/.test(piece.key));
    assert.equal(flanges.length, 4);
    assert.deepEqual(flanges.map(piece => piece.stepNumber), [3, 3, 6, 6]);
    assert.ok(!leaves.some(piece => /FrontUprightSpacer|ExtendedSupport(Flange|MendingPlate)/.test(piece.key)));
    const existing = leaves.find(piece => piece.key === "leftRearTreadFlange");
    for (const piece of flanges) {
      assert.equal(piece.part, existing.part);
      const side = piece.key.startsWith("left") ? "left" : "right";
      const step = model.steps[piece.stepNumber - 1], next = model.steps[piece.stepNumber];
      const upright = step.parts.uprights.boards[`${side}RearUpright`];
      const rearBlock = step.parts.bottomFrame.boards[`${side}RearSupportBlock`];
      const frontBlock = next.parts.bottomFrame.boards[`${side}SupportBlock`];
      const flange = step.parts[piece.key], placement = flange.getPlacement();
      close(placement[13], 13.04);
      close(placement[12], (upright.footprint[0][0] + upright.footprint[1][0]) / 2);
      close(placement[14], -(upright.footprint[0][1] + upright.footprint[1][1]) / 2);
      for (const [east, north] of upright.footprint.slice(0, 2)) {
        close((east - placement[12]) * placement[4] + (-north - placement[14]) * placement[6], 0);
      }
      const mesh = flange.createGeometry();
      const heights = mesh.positions.filter((_, i) => i % 3 === 1);
      assert.ok(Math.min(...heights) > rearBlock.bottomHeight + rearBlock.width);
      for (let i = 0; i < mesh.positions.length; i += 3) {
        const distance = (mesh.positions[i] - placement[12]) * placement[4] +
          (mesh.positions[i + 2] - placement[14]) * placement[6];
        assert.ok(distance >= -1e-5, "The flange must project forward, not into the rear upright.");
      }
      assertBoardsGeometry(mesh);
      const plate = next.parts[`${side}LowerUprightMendingPlate`];
      const plateBottom = Math.min(...plate.createGeometry().positions.filter((_, i) => i % 3 === 1));
      close(plateBottom, Math.max(rearBlock.bottomHeight + rearBlock.width,
        frontBlock.bottomHeight + frontBlock.width) + 1 / 8);
      const brace = next.parts.frontUprightBrace, boltRadius = 3 / 16;
      assert.ok(placement[13] - boltRadius > brace.bottomHeight);
      assert.ok(placement[13] + boltRadius < brace.bottomHeight + brace.width);
      const east = plate.getPlacement()[12];
      assert.ok(east - boltRadius > brace.footprint[0][0]);
      assert.ok(east + boltRadius < brace.footprint[1][0]);
    }
  }
});

test("module 2 and 3 front riser bottoms align with the preceding rear tread attachment block bottoms", () => {
  for (const width of [20, 24, 36]) {
    const model = buildStairway(width);
    for (const [index, step] of model.steps.entries()) {
      const extended = index === 3 || index === 6;
      const riser = step.parts.riser;
      const bottom = index === 0 ? 1 : extended
        ? model.steps[index - 1].parts.topFrame.boards.leftRearTreadBlock.bottomHeight
        : index * model.stepRise - 0.5;
      close(riser.bottomHeight, bottom);
      if (extended) close(bottom, model.steps[index - 1].parts.topFrame.boards.rightRearTreadBlock.bottomHeight);
      close(riser.bottomHeight + riser.width, step.parts.tread.bottomHeight);
      if (index > 0) close(riser.width, extended ? 15.5 : model.stepRise);
      const piece = model.partTree.getLeaves().find(piece =>
        piece.key === "riser" && piece.stepNumber === index + 1);
      close(piece.getDescription().blank.width, riser.width);
      close(meshVolume(model.createNodeGeometry(piece.id)), meshVolume(riser.createGeometry()), 0.001);
    }
  }
});

test("lower newel cheeks retain their height under the rail-free first-step carriers", () => {
  for (const count of [9]) for (const modules of [3]) {
    const model = buildStairway(24);
    const spindle = model.steps[1].parts.frontSpindle;
    const heights = Array.from(spindle.createGeometry().positions).filter((_, i) => i % 3 === 1);
    close(Math.min(...heights), spindle.bottomHeight, 1e-5);
    const first = model.steps[0].parts;
    for (const block of [first.topFrame.boards.newelInnerBlock, first.topFrame.boards.newelRearBlock]) {
      close(block.bottomHeight, 2.25);
      close(block.bottomHeight + block.width, SUPPORT_BEAM_TOP_HEIGHT);
      const heights = Array.from(block.createGeometry().positions).filter((_, i) => i % 3 === 1);
      close(Math.min(...heights), block.bottomHeight);
      close(Math.max(...heights), SUPPORT_BEAM_TOP_HEIGHT);
    }
    for (const key of ["frontStepFrontBearing", "frontStepRearBearing"]) {
      const bearing = first.topFrame.boards[key];
      close(bearing.bottomHeight, SUPPORT_BEAM_TOP_HEIGHT);
      close(bearing.bottomHeight + bearing.thickness, 6.5);
      assert.equal(bearing.stock.nominalSize, "1x4");
      close(bearing.getManufacturingDescription().blank.width, 3.5);
      assertBoardsGeometry(bearing.createGeometry());
      assertBoardsGeometry(bearing.createStockGeometry());
      close(meshVolume(bearing.createGeometry()), meshVolume(bearing.createStockGeometry()), 0.001);
    }
  }
});

test("three first-step supports run fore-and-aft on flat carriers, beside and behind the unnotched newel", () => {
  for (const width of [20, 24, 36]) {
    const model = buildStairway(width), first = model.steps[0];
    const { newel } = first.parts, boards = first.parts.topFrame.boards;
    assert.equal(boards.frontStepSupport, undefined);
    assert.equal(boards.rearStepSupport, undefined);
    const across = newel.footprint[1].map((value, axis) =>
      (value - newel.footprint[0][axis]) / newel.thickness);
    const along = [-across[1], across[0]];
    const project = (point, direction) =>
      point.reduce((sum, value, axis) => sum + (value - newel.footprint[0][axis]) * direction[axis], 0);
    const left = [first.footprint[0], first.footprint[3]];
    const rearNormal = [Math.sin(first.angle), -Math.cos(first.angle)];
    const rearOffset = first.footprint[3].reduce((sum, value, axis) => sum + value * rearNormal[axis], 0);
    for (const key of ["frontStepLeftSupport", "frontStepRightSupport", "frontStepRightRearSupport"]) {
      const support = first.parts.topFrame.boards[key];
      if (key === "frontStepLeftSupport") {
        for (const point of [support.footprint[0], support.footprint[3]]) {
          close((left[1][0] - left[0][0]) * (point[1] - left[0][1]) -
            (left[1][1] - left[0][1]) * (point[0] - left[0][0]), 0);
        }
        close(support.footprint[0][1], 1);
        close(support.footprint[1][1], 1);
      } else {
        const beside = key === "frontStepRightSupport";
        for (const i of [0, 3]) {
          close(project(support.footprint[i], across), beside ? -1.5 : 0);
          close(project(support.footprint[i === 0 ? 1 : 2], across), beside ? 0 : 1.5);
        }
        if (beside) {
          close(support.footprint[0][1], 1);
          close(support.footprint[1][1], 1);
        } else {
          for (const point of support.footprint.slice(0, 2)) close(project(point, along), newel.width);
        }
      }
      for (const point of support.footprint.slice(2)) {
        close(point.reduce((sum, value, axis) => sum + value * rearNormal[axis], 0), rearOffset);
      }
      assert.ok(support.footprint[3][1] - support.footprint[0][1] > 4);
      close(support.bottomHeight, 6.5);
      close(support.width, 1.5);
      close(support.bottomHeight + support.width, first.parts.tread.bottomHeight);
      for (const t of key === "frontStepRightRearSupport" ? [0.75, 0.9] : [0.1, 0.9]) {
        const point = [0, 1].map(axis =>
          ((1 - t) * (support.footprint[0][axis] + support.footprint[1][axis]) +
            t * (support.footprint[2][axis] + support.footprint[3][axis])) / 2);
        assert.ok([boards.frontStepFrontBearing, boards.frontStepRearBearing].some(bearing =>
          bearing.footprint.every((a, i, polygon) => {
            const b = polygon[(i + 1) % polygon.length];
            return (b[0] - a[0]) * (point[1] - a[1]) -
              (b[1] - a[1]) * (point[0] - a[0]) >= -1e-8;
          })), `${key} requires bearing on its carriers.`);
      }
      const description = support.getManufacturingDescription();
      const isLeft = key === "frontStepLeftSupport", sourceWidth = isLeft ? 2.5 : 3.5;
      assert.equal(description.stock.nominalSize, isLeft ? "1x3" : "2x4");
      close(description.blank.thickness, isLeft ? 0.75 : 1.5);
      close(description.blank.width, 1.5);
      assert.deepEqual(description.widthTrim, { from: sourceWidth, to: 1.5, removed: sourceWidth - 1.5 });
      assert.equal(description.notches.length, 0);
      assert.equal(description.edgeCuts.filter(cut => cut.surfaceCut).length, 0);
      const world = support.createGeometry(), stock = support.createStockGeometry();
      assertBoardsGeometry(world);
      assertBoardsGeometry(stock);
      close(meshVolume(world), meshVolume(stock), 1e-4);
    }
  }
});

test("step 1 keeps both flat siding pieces around the newel; curved siding starts at step 2", () => {
  for (const stepCount of [9]) {
    const model = buildStairway(24), first = model.steps[0];
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

test("lower upright blocks meet the posts directly and retain full cross-beam bearing", () => {
  for (const width of [20, 24, 36]) for (const step of buildStairway(width).steps) {
    const frame = step.parts.bottomFrame.boards;
    const beams = [frame.supportCrossPiece, frame.rearSupportCrossPiece].filter(Boolean);
    for (const [role, upright] of Object.entries(step.parts.uprights.boards)) {
      const rear = role.includes("Rear"), block = frame[role.replace("Upright", "SupportBlock")];
      if (upright.bottomHeight > 7.25) {
        assert.equal(block, undefined, "Raised posts must not leave detached lower attachment blocks.");
        continue;
      }
      assert.ok(block, `${role} requires its own face attachment block.`);
      const postFace = rear ? upright.footprint.slice(0, 2) : upright.footprint.slice(2).reverse();
      const blockFace = rear ? block.footprint.slice(2).reverse() : block.footprint.slice(0, 2);
      for (let i = 0; i < 2; i++) for (let axis = 0; axis < 2; axis++) {
        close(blockFace[i][axis], postFace[i][axis]);
      }
      const description = block.getManufacturingDescription();
      close(description.blank.length, 3.5);
      const height = role === "rightUpright" && step.height === 17 ? 2.25 : 3.5;
      close(description.blank.width, height);
      close(description.blank.thickness, 1.5);
      assert.equal(description.stock.nominalSize, "2x4");
      close(description.stock.thickness, 1.5);
      close(description.stock.width, 3.5);
      close(block.bottomHeight, upright.bottomHeight);
      close(block.bottomHeight + block.width, 7.25 + height);
      const [grain] = block.getStockAxes();
      close(Math.abs(grain[0] * upright.across[0] - grain[2] * upright.across[1]), 1);
      for (const u of [0, 0.5, 1]) for (const v of [0, 0.5, 1]) {
        const point = [0, 1].map(axis =>
          (1 - v) * ((1 - u) * block.footprint[0][axis] + u * block.footprint[1][axis]) +
          v * ((1 - u) * block.footprint[3][axis] + u * block.footprint[2][axis]));
        assert.ok(beams.some(beam => beam.footprint.every((a, index, polygon) => {
          const b = polygon[(index + 1) % polygon.length];
          return (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]) >= -1e-8;
        })), "The entire block bottom must bear on the lower cross-beams.");
      }
      const stock = block.createStockGeometry(), installed = block.createGeometry();
      assertBoardsGeometry(stock);
      assertBoardsGeometry(installed);
      close(meshVolume(stock), meshVolume(installed), 0.001);
    }
  }
});

test("previous rear supports meet the flush posts directly without obsolete front-face cleats", () => {
  for (const width of [20, 24, 36]) for (const count of [9]) for (const modules of [3]) {
    if (count < 2 * modules) continue;
    for (const module of buildStairway(width).modules) {
      for (const [index, step] of module.steps.entries()) {
        for (const side of ["left", "right"]) {
          assert.equal(step.parts.topFrame.boards[`${side}BackSupportBlock`], undefined);
          if (!index || module.startIndex + index === 1) continue;
          const support = module.steps[index - 1].parts.topFrame.boards.northCrossPiece;
          const upright = step.parts.uprights.boards[`${side}Upright`];
          const c = Math.cos(step.angle), s = Math.sin(step.angle);
          const edge = support.footprint.slice(2).map(([east, north]) =>
            [c * (east + INNER_RADIUS) + s * north - INNER_RADIUS, -s * (east + INNER_RADIUS) + c * north]);
          for (const point of edge) close(point[1], 0.25);
          const face = upright.footprint.slice(0, 2);
          for (const point of face) close(point[1], 0.25);
          const overlap = Math.min(...[edge, face].map(points => Math.max(...points.map(point => point[0])))) -
            Math.max(...[edge, face].map(points => Math.min(...points.map(point => point[0]))));
          const extended = module.startIndex > 0 && index === 1 && side === "left";
          assert.ok(overlap > (extended ? 2 : 3.4), "The rear board must meet the available post face.");
          assert.ok(support.bottomHeight >= upright.bottomHeight);
          assert.ok(support.bottomHeight + support.width <= upright.bottomHeight + upright.length);
        }
      }
    }
  }
});

test("3.5-inch panel ribs fit individual upright bays with face-mounted 2x2 bearing blocks", () => {
  for (const width of [20, 24, 36]) {
    const model = buildStairway(width), inventory = new PartInventory(model.partTree), blockParts = new Set();
    const installed = id => ({ createGeometry: () => model.createNodeGeometry(id, 0, 0) });
    let blockCount = 0;
    for (const [moduleIndex, module] of model.modules.entries()) {
      const ribs = Object.entries(module.boards).filter(([key]) => /^(sidingRib|intermediateSidingRib)\d?$/.test(key));
      assert.equal(ribs.length, [0, 3, 6][moduleIndex]);
      for (const [key, rib] of ribs) {
        const bay = Number(key.at(-1)) ? Number(key.at(-1)) - 1 : 0;
        const intermediate = key.startsWith("intermediate"), step = module.steps[bay];
        const next = module.steps[bay + 1], rearStep = next ?? step;
        const id = `stairway/module-${moduleIndex + 1}/${key}`;
        const topHeight = intermediate ? 30.625 : module.steps[0].parts.topFrame.boards.southCrossPiece.bottomHeight;
        close(rib.thickness, 0.5);
        close(rib.bottomHeight, topHeight - rib.thickness);
        close(rib.construction.arc.radius, module.boards.siding.bend.innerRadius);
        close(rib.construction.arc.radius - rib.construction.innerRadius, 3.5);
        close(rib.construction.arc.radius - rib.construction.innerRadius, SIDING_RIB_WIDTH);
        assert.ok(!rib.construction.notches.some(cut => /upright|rib support block/.test(cut.name)));
        const c = Math.cos(rib.heading), s = Math.sin(rib.heading);
        const points = rib.outline.flatMap(edge => [0, 0.5, 1].map(t => {
          const [x, z] = outlinePoint(edge, t);
          return [rib.origin[0] + INNER_RADIUS + c * x + s * z, rib.origin[1] + s * x - c * z];
        }));
        for (const point of points) {
          assert.ok(Math.hypot(...point) >= rib.construction.innerRadius - 1e-8);
          assert.ok(Math.hypot(...point) <= rib.construction.arc.radius + 1e-8);
        }
        for (const [post, stepIndex, direction] of [
          [step.parts.uprights.boards.rightUpright, bay, 1],
          [rearStep.parts.uprights.boards[next ? "rightUpright" : "rightRearUpright"], next ? bay + 1 : bay, -1],
        ]) {
          const c = Math.cos(stepIndex * step.angle), s = Math.sin(stepIndex * step.angle);
          const [east, north] = post.footprint[direction === 1 ? 3 : 0];
          const origin = [c * (east + INNER_RADIUS) - s * north, s * (east + INNER_RADIUS) + c * north];
          const normal = [c * post.along[0] - s * post.along[1], s * post.along[0] + c * post.along[1]];
          for (const point of points) assert.ok(point.reduce((sum, value, axis) =>
            sum + (value - origin[axis]) * normal[axis] * direction, 0) >= -1e-8,
          "Each rib ends at the facing surfaces, not through either upright.");
        }
        const suffix = intermediate ? "Intermediate" : "";
        for (const [owner, blockKey, postKey, direction] of [
          [step, !intermediate && bay === 0 ? "frontSpindleBlock" : `front${suffix}RibSupportBlock`, "rightUpright", 1],
          [rearStep, `${next ? "back" : "rear"}${suffix}RibSupportBlock`, next ? "rightUpright" : "rightRearUpright", -1],
        ]) {
          const block = owner.parts.topFrame.boards[blockKey];
          const stepNumber = module.startIndex + module.steps.indexOf(owner) + 1;
          const blockId = `stairway/module-${moduleIndex + 1}/step-${stepNumber}-${blockKey}`;
          close(block.bottomHeight + block.length, rib.bottomHeight);
          assert.ok(horizontalContactArea(installed(blockId), installed(id), rib.bottomHeight) > 1.5,
            `${blockId} must actually bear its rib.`);
          if (blockKey === "frontSpindleBlock") continue;
          blockCount++;
          const post = owner.parts.uprights.boards[postKey], origin = post.footprint[direction === 1 ? 3 : 0];
          const faceSetback = blockKey === "rearRibSupportBlock" ? 0.75 : 0;
          close(block.length, SIDING_RIB_BLOCK_LENGTH);
          assert.equal(block.stock.nominalSize, "2x2");
          close(block.thickness, 1.5);
          close(block.width, 1.5);
          assert.deepEqual(block.getStockAxes()[0], [0, 1, 0]);
          for (const point of block.footprint.slice(0, 2)) {
            close(point.reduce((sum, value, axis) => sum + (value - origin[axis]) * post.along[axis], 0),
              -faceSetback);
          }
          const across = block.footprint.map(point => point.reduce((sum, value, axis) =>
            sum + (value - origin[axis]) * post.across[axis], 0));
          const outerEdge = Math.max(...across);
          close(outerEdge - Math.min(...across), 1.5);
          assert.ok(outerEdge <= post.width + 1e-8);
          const panelLimit = module.boards.siding.bend.innerRadius - 1 / 32;
          const outerRadius = Math.max(...block.footprint.map(([east, north]) =>
            Math.hypot(east + INNER_RADIUS, north)));
          assert.ok(outerRadius <= panelLimit + 1e-8, "Rib blocks must clear the curved side panel.");
          assert.ok(Math.abs(outerEdge - post.width) < 1e-8 ||
            Math.abs(outerRadius - panelLimit) < 1e-8,
          "Rib blocks must be flush with the upright's outside edge unless panel clearance limits them.");
          const center = block.footprint.map(point => point.reduce((sum, value, axis) =>
            sum + (value - origin[axis]) * post.along[axis] * direction, 0));
          close(Math.min(...center), faceSetback);
          close(Math.max(...center), faceSetback + 1.5);
          assertBoardsGeometry(block.createGeometry());
          const occurrence = inventory.findOccurrence(blockId);
          assert.deepEqual(occurrence.locations.find(location => location.id === blockId).subsets, ["ribs"]);
          blockParts.add(occurrence.part);
        }
        const stock = rib.createStockGeometry();
        assertBoardsGeometry(stock);
        assertBoardsGeometry(rib.createGeometry());
        close(meshVolume(stock), meshVolume(rib.createGeometry()), 0.001);
        close(meshVolume(stock), rib.getMaterialVolume(), 0.03);
        const piece = model.partTree.getNode(id), occurrence = inventory.findOccurrence(id);
        assert.equal(occurrence.part, piece.part);
        assert.equal(piece.category, "ribs");
        assert.deepEqual(occurrence.locations.find(location => location.id === id).subsets, ["ribs"]);
        assert.equal(model.createNodeGeometry(id, 0, 0, ["ribs"]).indices.length, 0);
        for (const split of [0, 1]) {
          const heights = model.createNodeGeometry(id, 0, split).positions.filter((_, i) => i % 3 === 1);
          close(Math.min(...heights), rib.bottomHeight);
          close(Math.max(...heights), topHeight);
        }
      }
    }
    assert.equal(blockCount, 16);
    assert.equal(blockParts.size, 1, "All separate rib bearings use the same square-cut 2x2.");
    const module = model.modules[2], gap = module.boards.sidingRib.bottomHeight - SUPPORT_BEAM_TOP_HEIGHT;
    close(gap, 49.25);
    close(module.boards.intermediateSidingRib.bottomHeight + SIDING_RIB_THICKNESS / 2,
      SUPPORT_BEAM_TOP_HEIGHT + gap / 2);
  }
});

test("paired curved panel stiffeners follow panel interiors and stack against the support blocks", () => {
  for (const width of [20, 24, 36]) for (const count of [9]) for (const modules of [3]) {
    const model = buildStairway(width), inventory = new PartInventory(model.partTree);
    for (const [i, module] of model.modules.entries()) for (const [key, layer] of [
      ["sidingStiffener", 0], ["sidingStiffenerUpper", 1],
    ]) {
      const panel = module.boards.siding, strip = module.boards[key];
      assert.equal(strip.thickness, 0.5);
      assert.equal(strip.thickness, PANEL_STIFFENER_THICKNESS);
      close(strip.bottomHeight, 1.25 + layer * 0.5);
      close(strip.bottomHeight, PANEL_STIFFENER_BOTTOM_HEIGHT + layer * PANEL_STIFFENER_THICKNESS);
      if (layer === 1) {
        close(strip.bottomHeight, module.boards.sidingStiffener.bottomHeight + PANEL_STIFFENER_THICKNESS);
        close(strip.bottomHeight + strip.thickness, module.boards.rearPanelSupportBlock.bottomHeight);
      }
      close(strip.construction.arc.radius, panel.bend.innerRadius);
      close(strip.construction.innerRadius, panel.bend.innerRadius - 1);
      close(strip.construction.arc.radius - strip.construction.innerRadius, PANEL_STIFFENER_WIDTH);
      assert.equal(strip.construction.tangentExtension, undefined);
      assert.deepEqual(strip.construction.notches, []);
      const arcs = strip.outline.filter(edge => edge.type === "arc");
      assert.equal(arcs.length, 2);
      for (const edge of arcs) close(Math.abs(edge.sweepRadians), panel.bend.sweepRadians);
      const c = Math.cos(strip.heading), s = Math.sin(strip.heading);
      for (const edge of strip.outline) for (const t of [0, 0.5, 1]) {
        const [x, z] = outlinePoint(edge, t);
        const east = strip.origin[0] + INNER_RADIUS + c * x + s * z;
        const north = strip.origin[1] + s * x - c * z;
        assert.ok(Math.atan2(north, east) >= panel.startAngle - 1e-8);
        assert.ok(Math.atan2(north, east) <= panel.startAngle + panel.bend.sweepRadians + 1e-8);
        if (edge.type === "arc") close(Math.hypot(east, north), edge.radius);
      }
      const volume = (panel.bend.innerRadius ** 2 - (panel.bend.innerRadius - 1) ** 2) *
        panel.bend.sweepRadians / 2 * 0.5;
      close(strip.getMaterialVolume(), volume);
      for (const geometry of [strip.createStockGeometry(), strip.createGeometry()]) {
        assertBoardsGeometry(geometry);
        assert.ok(Math.abs(meshVolume(geometry) - volume) / volume < 0.0001);
      }
      const id = `stairway/module-${i + 1}/${key}`;
      const entry = inventory.findOccurrence(id);
      assert.equal(entry.part, model.partTree.getNode(id).part);
      assert.equal(entry.description.stock.thickness, 0.5);
      assert.ok(entry.locations.find(location => location.id === id).subsets.includes("ribs"));
      assert.ok(model.createNodeGeometry(id).indices.length);
      assert.equal(model.createNodeGeometry(id, 0, 0, ["ribs"]).indices.length, 0);
      assert.equal(entry.part, inventory.findOccurrence(`stairway/module-${i + 1}/sidingStiffener`).part);
    }
    const strips = model.partTree.getLeaves().filter(piece => piece.key.includes("Stiffener"));
    assert.equal(strips.length, 2 * modules + 2);
    const ribIds = new Set(inventory.filter({ subset: "ribs" }).occurrences.map(({ location }) => location.id));
    assert.ok(strips.every(piece => ribIds.has(piece.id)));
  }
});

test("flat rear-panel bottom stiffeners meet the newel while tiny front-panel ribs are omitted", () => {
  for (const width of [20, 24, 36]) for (const count of [9]) for (const modules of [3]) {
    const model = buildStairway(width), first = model.steps[0];
    assert.equal(first.parts.frontSidingStiffener, undefined);
    assert.equal(first.parts.frontSidingStiffenerUpper, undefined);
    assert.ok(first.parts.frontSiding);
    assert.ok(!model.partTree.getLeaves().some(piece => /frontSidingStiffener/.test(piece.key)));
    const newel = first.parts.newel;
    const along = newel.footprint[3].map((value, i) => (value - newel.footprint[0][i]) / newel.width);
    const project = point => point.reduce((sum, value, i) => sum + (value - newel.footprint[0][i]) * along[i], 0);
    for (const key of ["siding"]) for (const [suffix, layer] of [["", 0], ["Upper", 1]]) {
      const panel = first.parts[key], strip = first.parts[`${key}Stiffener${suffix}`];
      assert.ok(strip);
      close(strip.bottomHeight, 1.25 + layer * 0.5);
      assert.equal(strip.thickness, 0.5);
      const [a, , , d] = panel.footprint;
      const length = Math.hypot(d[0] - a[0], d[1] - a[1]);
      const outward = [(d[1] - a[1]) / length, (a[0] - d[0]) / length];
      strip.footprint.forEach((point, i) => close(
        point.reduce((sum, value, j) => sum + (value - a[j]) * outward[j], 0), i < 2 ? 0 : -1));
      for (const point of [strip.footprint[0], strip.footprint[3]]) close(project(point), newel.width);
      const description = strip.getManufacturingDescription();
      close(description.blank.width, 1);
      assert.equal(description.stock.thickness, 0.5);
      const stock = strip.createStockGeometry(), installed = strip.createGeometry();
      assertBoardsGeometry(stock);
      assertBoardsGeometry(installed);
      close(meshVolume(stock), meshVolume(installed), 1e-4);
    }
  }
});

test("four-inch edge-on panel support blocks sit beneath cross-pieces between the caster positions", () => {
  for (const width of [20, 24, 36]) for (const count of [9]) for (const modules of [3]) {
    const model = buildStairway(width), inventory = new PartInventory(model.partTree);
    const blockParts = new Set();
    for (const [i, module] of model.modules.entries()) {
      assert.equal(Boolean(module.boards.frontPanelSupportBlock), i !== 0);
      for (const rear of [false, true]) {
        const key = rear ? "rearPanelSupportBlock" : "frontPanelSupportBlock", block = module.boards[key];
        if (!block) continue;
        close(block.length, 4);
        close(block.length, PANEL_SUPPORT_BLOCK_LENGTH);
        close(block.width, 3.5);
        close(block.thickness, 1.5);
        close(block.bottomHeight, 2.25);
        close(block.bottomHeight, PANEL_SUPPORT_BLOCK_BOTTOM_HEIGHT);
        close(block.bottomHeight + block.width, SUPPORT_BEAM_TOP_HEIGHT);
        close(block.bottomHeight, module.boards.sidingStiffenerUpper.bottomHeight + PANEL_STIFFENER_THICKNESS);
        const angles = block.footprint.map(([east, north]) => Math.atan2(north, east + INNER_RADIUS));
        for (const index of [1, 2]) {
          const [east, north] = block.footprint[index];
          close(Math.hypot(east + INNER_RADIUS, north), model.outerRadius);
        }
        const step = rear ? module.steps.at(-1) : module.steps[0];
        const caster = step.parts.bottomFrame.hardware[rear ? "rightRearCaster" : "rightCaster"];
        const rotation = rear ? (module.steps.length - 1) * step.angle : 0;
        const c = Math.cos(rotation), s = Math.sin(rotation), positions = caster.createGeometry().positions;
        const casterAngles = [];
        for (let k = 0; k < positions.length; k += 3) {
          const east = positions[k] + INNER_RADIUS, north = -positions[k + 2];
          casterAngles.push(Math.atan2(s * east + c * north, c * east - s * north));
        }
        if (rear) assert.ok(Math.max(...angles) <= Math.min(...casterAngles) + 1e-6);
        else assert.ok(Math.min(...angles) >= Math.max(...casterAngles) - 1e-6);
        const id = `stairway/module-${i + 1}/${key}`, entry = inventory.findOccurrence(id);
        assert.equal(entry.description.stock.nominalSize, "2x4");
        const location = entry.locations.find(location => location.id === id);
        assert.ok(location.subsets.includes("ribs"));
        assert.ok(!location.subsets.includes("banister"));
        blockParts.add(entry.part);
        for (const geometry of [block.createStockGeometry(), model.createNodeGeometry(id)]) {
          assertBoardsGeometry(geometry);
          close(meshVolume(geometry), 4 * 3.5 * 1.5, 0.001);
        }
      }
    }
    assert.equal(blockParts.size, 1, "All square-cut support blocks share a manufacturing Part.");
  }
});

test("spindle bottoms are raised one inch without moving their tops or notch shoulders", () => {
  for (const count of [9]) {
    const model = buildStairway(24);
    for (const step of model.steps) for (const key of ["frontSpindle", "rearSpindle"]) {
      const spindle = step.parts[key];
      if (!spindle) continue;
      assert.ok(spindle instanceof Spindle);
      const support = step.parts.topFrame.boards.southCrossPiece;
      const block = step.parts.topFrame.boards[key === "rearSpindle" ? "rearSpindleBlock" : "frontSpindleBlock"];
      const length = Math.hypot(...block.footprint[2].map((value, i) => value - block.footprint[1][i]));
      const along = block.footprint[2].map((value, i) => (value - block.footprint[1][i]) / length);
      const baseline = support.bottomHeight + support.width + spindle.topRise / spindle.width *
        spindle.footprint[0].reduce((sum, value, i) => sum + (value - support.footprint[1][i]) * along[i], 0);
      const oldBottom = baseline - (step.stepRise + 6), oldHeight = model.spindleShoulderAscent + 2 + step.stepRise + 6;
      close(spindle.bottomHeight, oldBottom + 1);
      close(spindle.frontHeight, oldHeight - 1);
      close(spindle.bottomHeight + spindle.frontHeight, oldBottom + oldHeight);
      close(spindle.bottomHeight + spindle.frontHeight - spindle.notches.endNear.length,
        baseline + model.spindleShoulderAscent);
      assertBoardsGeometry(spindle.createGeometry());
    }
  }
});

test("curved module siding has a flat cutting pattern, midpoint bend, closed mesh and exact material weight", () => {
  for (const width of [20, 24, 36]) for (const steps of [9]) for (const modules of [3]) {
    if (steps < modules * 2) continue;
    const model = buildStairway(width);
    const leaves = model.partTree.getLeaves(), panels = leaves.filter(node => node.part.bend);
    assert.equal(panels.length, modules);
    assert.equal(leaves.filter(node => ["siding", "frontSiding"].includes(node.key)).length, modules + 2);
    assert.ok(model.steps.slice(1).every(step => !step.parts.siding));
    for (const node of panels) {
      const board = constructionBoard(model, node), module = model.partTree.getNode(node.parentId).module;
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

test("spindles mount flush on vertical front supports or retained broad-face blocks", () => {
  for (const width of [20, 36]) for (const step of buildStairway(width).steps.slice(1)) {
    for (const rear of [false, true]) {
      const spindle = step.parts[rear ? "rearSpindle" : "frontSpindle"];
      if (!spindle) continue;
      const block = step.parts.topFrame.boards[rear ? "rearSpindleBlock" : "frontSpindleBlock"];
      const upright = step.parts.uprights.boards[rear ? "rightRearUpright" : "rightUpright"];
      const vertical = !rear && step.height > 2 * step.stepRise;
      assert.equal(block.stock.nominalSize, vertical ? "2x2" : "2x4");
      close(block.width, vertical ? 1.5 : 3.5);
      const top = block.bottomHeight + (vertical ? block.length : block.width);
      const ribBearing = vertical && [4, 7].includes(step.height / step.stepRise);
      close(top, upright.bottomHeight + upright.length - (ribBearing ? SIDING_RIB_THICKNESS : 0));
      if (vertical) assert.deepEqual(block.footprint[1], upright.footprint[2]);
      else if (rear && step.parts.topFrame.boards.rightRearTreadBlock) {
        const support = step.parts.topFrame.boards.rightStepSupport;
        const a = support.footprint[0], b = support.footprint[3];
        for (const point of [block.footprint[0], block.footprint[3]]) {
          close((b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]), 0);
        }
        close(block.thickness, 1.5);
        assert.ok(block.length > 0.75, "The retained outboard block must support the spindle face.");
      } else assert.deepEqual(block.footprint[rear ? 3 : 0], upright.footprint[rear ? 0 : 3]);
      const face = block.footprint.slice(1, 3);
      const normal = [face[1][1] - face[0][1], face[0][0] - face[1][0]];
      for (const point of [spindle.footprint[0], spindle.footprint[3]]) {
        close(point.reduce((sum, value, i) => sum + (value - face[0][i]) * normal[i], 0), 0);
      }
      assert.ok(Math.min(top,
        spindle.bottomHeight + spindle.frontHeight) > Math.max(block.bottomHeight, spindle.bottomHeight) + 1);
    }
  }
});

test("vertical pine 2x2 spindle supports bear the framing or first upper rib flush behind right front posts", () => {
  for (const width of [20, 24, 36]) {
    const model = buildStairway(width), inventory = new PartInventory(model.partTree), parts = new Set();
    assert.equal(model.steps[0].parts.topFrame.boards.frontSpindleBlock, undefined);
    assert.equal(model.steps[1].parts.topFrame.boards.frontSpindleBlock.stock.nominalSize, "2x4");
    for (const [index, step] of model.steps.entries()) {
      if (index < 2) continue;
      const block = step.parts.topFrame.boards.frontSpindleBlock;
      const post = step.parts.uprights.boards.rightUpright, support = step.parts.topFrame.boards.rightStepSupport;
      const description = block.getManufacturingDescription();
      assert.equal(description.stock.nominalSize, "2x2");
      assert.equal(description.stock.materialKey, "pine");
      const carriesRib = index === 3 || index === 6;
      const length = step.stepRise - (carriesRib ? SIDING_RIB_THICKNESS : 0);
      close(description.blank.length, length);
      close(description.blank.thickness, 1.5);
      close(description.blank.width, 1.5);
      assert.deepEqual(description.notches, []);
      assert.deepEqual(description.dados, []);
      assert.deepEqual(block.getStockAxes()[0], [0, 1, 0]);
      close(block.bottomHeight + block.length, support.bottomHeight - (carriesRib ? SIDING_RIB_THICKNESS : 0));
      assert.deepEqual(block.footprint[1], post.footprint[2]);
      for (const point of block.footprint.slice(0, 2)) close(point[1], post.footprint[2][1]);
      for (const point of block.footprint.slice(1, 3)) close(point[0], post.footprint[1][0]);
      if (!carriesRib) assert.ok(horizontalContactArea(block, support, support.bottomHeight) > 1);
      for (const geometry of [block.createGeometry(), block.createStockGeometry()]) {
        assertBoardsGeometry(geometry);
        close(meshVolume(geometry), length * 1.5 * 1.5, 0.001);
      }
      const piece = model.partTree.getLeaves().find(piece =>
        piece.stepNumber === index + 1 && piece.key === "frontSpindleBlock");
      const entry = inventory.findOccurrence(piece.id);
      assert.deepEqual(entry.locations.find(location => location.id === piece.id).subsets,
        ["step-framing", "banister", "ribs"]);
      parts.add(entry.part);
    }
    assert.equal(parts.size, 2, "Five full-length supports and two half-inch-shorter rib bearings.");
  }
});

function spindleBearingSection(board, height, north) {
  const { positions, indices } = board.createGeometry(), intersections = [];
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = Array.from(indices.slice(i, i + 3),
      index => Array.from(positions.slice(index * 3, index * 3 + 3)));
    const u = [b[1] - a[1], b[2] - a[2]], v = [c[1] - a[1], c[2] - a[2]];
    const determinant = cross(u, v);
    if (Math.abs(determinant) < 1e-10) continue;
    const p = [height - a[1], -north - a[2]];
    const s = cross(p, v) / determinant, t = cross(u, p) / determinant;
    if (s >= -1e-7 && t >= -1e-7 && s + t <= 1 + 1e-7) {
      intersections.push(a[0] + s * (b[0] - a[0]) + t * (c[0] - a[0]));
    }
  }
  assert.ok(intersections.length >= 2, `${board.name} must contain the attachment axis.`);
  return [Math.min(...intersections), Math.max(...intersections)];
}

test("six upper-module front spindles have aligned flanges and uninterrupted equal-length bolt stacks", () => {
  for (const width of [20, 24, 36]) {
    const model = buildStairway(width), flangeParts = new Set();
    for (const [index, step] of model.steps.entries()) {
      const boards = step.parts.topFrame.boards;
      if (index < 3) {
        assert.equal(step.parts.upperFrontSpindleFlange, undefined);
        assert.equal(step.parts.lowerFrontSpindleFlange, undefined);
        assert.equal(boards.frontSpindleBackingBlock, undefined);
        assert.equal(Boolean(boards.frontSpindleBearingShim), index > 0);
        continue;
      }
      const mount = boards.frontSpindleBlock, support = boards.rightStepSupport;
      const upper = step.parts.upperFrontSpindleFlange.getPlacement();
      const lower = step.parts.lowerFrontSpindleFlange.getPlacement();
      close(upper[12], lower[12]);
      close(upper[14], lower[14]);
      close(lower[12], mount.footprint[0][0]);
      close(upper[13], support.bottomHeight + support.width / 2);
      close(lower[13] - THREADED_FLANGE_DIMENSIONS.plateLength / 2, mount.bottomHeight + 1 / 8);
      assert.ok(lower[13] + THREADED_FLANGE_DIMENSIONS.plateLength / 2 < mount.bottomHeight + mount.length);
      for (const [placement, backing] of [
        [upper, [boards.frontSpindleBackingBlock, support, boards.frontSpindleBearingShim]],
        [lower, [mount]],
      ]) {
        assert.deepEqual(Array.from(placement.slice(0, 3)), [0, 1, 0]);
        assert.deepEqual(Array.from(placement.slice(4, 7)), [-1, 0, 0]);
        const stack = [...backing, step.parts.frontSpindle].map(board =>
          spindleBearingSection(board, placement[13], -placement[14]));
        close(stack[0][0], placement[12]);
        for (let i = 1; i < stack.length; i++) close(stack[i - 1][1], stack[i][0]);
        close(stack.at(-1)[1] - placement[12], 3);
        assert.ok(-placement[14] - THREADED_FLANGE_DIMENSIONS.plateWidth / 2 > mount.footprint[0][1]);
        assert.ok(-placement[14] + THREADED_FLANGE_DIMENSIONS.plateWidth / 2 < mount.footprint[3][1]);
      }
      const leaves = model.partTree.getLeaves().filter(piece => piece.stepNumber === index + 1);
      for (const key of ["upperFrontSpindleFlange", "lowerFrontSpindleFlange"]) {
        const piece = leaves.find(piece => piece.key === key);
        assert.equal(piece.category, "step-framing");
        flangeParts.add(piece.part);
      }
    }
    assert.equal(flangeParts.size, 1, "Reuse the existing threaded-flange design.");
  }
});

test("module-one permanent front spindles have fitted upper bearing shims without removable hardware", () => {
  for (const width of [20, 24, 36]) {
    const model = buildStairway(width);
    for (const step of model.modules[0].steps.slice(1)) {
      const boards = step.parts.topFrame.boards, spindle = step.parts.frontSpindle;
      const height = boards.rightStepSupport.bottomHeight + boards.rightStepSupport.width / 2;
      const north = (spindle.footprint[0][1] + spindle.footprint[3][1]) / 2;
      const stack = [boards.rightStepSupport, boards.frontSpindleBearingShim, spindle]
        .map(board => spindleBearingSection(board, height, north));
      close(stack[0][1], stack[1][0]);
      close(stack[1][1], stack[2][0]);
      assert.equal(boards.frontSpindleBackingBlock, undefined);
      assert.equal(step.parts.upperFrontSpindleFlange, undefined);
      assert.equal(step.parts.lowerFrontSpindleFlange, undefined);
    }
    const shims = model.partTree.getLeaves().filter(piece => piece.key === "frontSpindleBearingShim");
    assert.equal(shims.length, 8);
    assert.equal(shims.find(piece => piece.stepNumber === 3).part,
      shims.find(piece => piece.stepNumber === 6).part);
  }
});

test("fitted spindle backing and bearing shims retain full 1x4 blanks and face-cut instructions", () => {
  for (const width of [20, 24, 36]) {
    const model = buildStairway(width);
    for (const [key, length] of [["frontSpindleBackingBlock", 3.5], ["frontSpindleBearingShim", 1.5]]) {
      const parts = new Set();
      for (const piece of model.partTree.getLeaves().filter(piece => piece.key === key)) {
        const board = constructionBoard(model, piece), description = piece.getDescription();
        assert.equal(piece.category, "step-framing");
        assert.equal(description.stock.nominalSize, "1x4");
        assert.equal(description.stock.materialKey, "pine");
        close(description.blank.length, length);
        close(description.blank.thickness, 0.75);
        close(description.blank.width, 3.5);
        const cut = description.edgeCuts.find(cut => cut.surfaceCut);
        assert.ok(cut);
        close(cut.bevelDegrees, piece.stepNumber === 2 ? 0 : 5);
        assert.ok(piece.part.volume > 0 && piece.part.volume < length * 0.75 * 3.5);
        for (const geometry of [board.createGeometry(), board.createStockGeometry()]) {
          assertBoardsGeometry(geometry);
          assert.ok(geometry.grain.every(Number.isFinite));
          close(meshVolume(geometry), piece.part.volume, 0.001);
        }
        parts.add(piece.part);
      }
      assert.equal(parts.size, key === "frontSpindleBearingShim" ? 3 : 2,
        "Step 2 needs parallel packing; intermediate and module-back supports need distinct tapers.");
    }
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
  assert.throws(() => new Piece({ id: "part", key: "part", name: "" }), TypeError);
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

test("banister wood uses Douglas fir descriptions, reduced weights and a color between pine and former oak", () => {
  const model = buildStairway();
  const roles = new Set(["newel", "frontSpindle", "rearSpindle", "spindleShim"]);
  const parts = model.partTree.getLeaves().filter(piece => roles.has(piece.key));
  assert.equal(parts.length, 14);
  assert.ok(model.partTree.getLeaves().every(piece => piece.getDescription().stock?.materialKey !== "oak"));
  for (const piece of parts) {
    const { stock } = piece.getDescription();
    assert.equal(stock.materialKey, "douglas-fir");
    assert.equal(stock.material, "Douglas fir");
    assert.equal(constructionBoard(model, piece).material, DOUGLAS_FIR);
    close(model.estimateNodeWeightLb(piece.id), piece.part.volume / 1728 * 32, 1e-10);
    const mesh = model.createNodeGeometry(piece.id);
    for (let i = 0; i < mesh.colors.length; i++) {
      const axis = i % 3, value = mesh.colors[i];
      close(value, DOUGLAS_FIR.color[axis]);
      assert.ok(value < PINE.color[axis]);
      assert.ok(value > [0.58, 0.32, 0.20][axis]);
    }
  }
});

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
  for (const width of [20, 24, 36]) for (const count of [9]) for (const modules of [3]) {
    const first = buildStairway(width).steps[0];
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
  for (const stepCount of [9]) {
    const first = buildStairway(24).steps[0], newel = first.parts.newel;
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

test("whole caster plates align with their beam undersides and retain edge clearance", () => {
  for (const width of [20, 24, 36]) for (const count of [9]) for (const modules of [3]) {
    if (count < modules * 2) continue;
    const model = buildStairway(width);
    for (const module of model.modules) for (const side of ["left", "right"]) for (const rear of [false, true]) {
      const beam = module.boards[`${side}SupportBeam`];
      const caster = (rear ? module.steps.at(-1) : module.steps[0])
        .parts.bottomFrame.hardware[`${side}${rear ? "Rear" : ""}Caster`];
      const angle = rear ? (module.steps.length - 1) * module.steps[0].angle : 0;
      const along = [-Math.sin(caster.heading), Math.cos(caster.heading)];
      const across = [Math.cos(caster.heading), Math.sin(caster.heading)];
      const beamHeading = Math.atan2(beam.footprint[0][0] - beam.footprint[1][0],
        beam.footprint[1][1] - beam.footprint[0][1]);
      close(Math.sin(caster.heading + angle - beamHeading), 0);
      close(beam.bottomHeight, Math.max(...Array.from(caster.createGeometry().positions)
        .filter((_, i) => i % 3 === 1)));
      for (const lengthSign of [-1, 1]) for (const widthSign of [-1, 1]) {
        const [east, north] = [caster.east, caster.north].map((value, axis) =>
          value + along[axis] * lengthSign * CASTER_DIMENSIONS.plateLength / 2 +
          across[axis] * widthSign * CASTER_DIMENSIONS.plateWidth / 2);
        const corner = [Math.cos(angle) * (east + INNER_RADIUS) - Math.sin(angle) * north - INNER_RADIUS,
          Math.sin(angle) * (east + INNER_RADIUS) + Math.cos(angle) * north];
        for (const [i, start] of beam.footprint.entries()) {
          const end = beam.footprint[(i + 1) % beam.footprint.length];
          const distance = ((end[0] - start[0]) * (corner[1] - start[1]) -
            (end[1] - start[1]) * (corner[0] - start[0])) / Math.hypot(end[0] - start[0], end[1] - start[1]);
          assert.ok(distance >= 0.125 - 1e-8,
            `${width}/${count}/${modules} ${side}/${rear}: plate corner has only ${distance} in beam edge clearance`);
        }
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
  for (const width of [20, 24, 36]) for (const count of [9]) {
    for (const modules of [3]) {
      const model = buildStairway(width);
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
        const edges = [[expected[0], expected[1]], [expected[3], expected[2]]].map(([a, b]) => {
          const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
          return b.map((value, axis) => (value - a[axis]) / length);
        });
        const angle = Math.acos(Math.min(1, edges[0].reduce((sum, value, axis) =>
          sum + value * edges[1][axis], 0))) * 180 / Math.PI;
        close(Math.abs(cuts.reduce((sum, cut) => sum + cut.bevelDegrees, 0)), angle);
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
  const dimensions = { length: 10, width: 4, thickness: 1, material: DOUGLAS_FIR };
  const notches = { startNear: { length: 2, depth: [0.5, 1] } };
  assert.deepEqual(new NotchedBoard(dimensions, notches, []).createGeometry(),
    new NotchedBoard(dimensions, notches).createGeometry());
  for (const face of ["negativeY", "positiveY"]) {
    const dado = { face, start: 4, width: 0.75, depth: 0.125 };
    const board = new NotchedBoard(dimensions, {}, [dado]), geometry = board.createGeometry();
    assert.equal(board.material, DOUGLAS_FIR);
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
      for (let axis = 0; axis < 3; axis++) close(geometry.colors[i * 3 + axis], DOUGLAS_FIR.color[axis]);
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
    const dimensions = { length: 10, width: 4, thickness: 1, material: DOUGLAS_FIR };
    const snapshot = structuredClone(notches);
    const initial = new NotchedBoard(dimensions, notches);
    for (const edge of ["Near", "Far"]) {
      const start = initial.notches[`start${edge}`], end = initial.notches[`end${edge}`];
      assert.ok(!start || !end || start.length + end.length < initial.length);
    }
    assert.deepEqual(notches, snapshot);
    assert.equal(dimensions.width, 4);
    assert.equal(initial.stock.width, 4);
    assert.equal(initial.material, DOUGLAS_FIR);
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
