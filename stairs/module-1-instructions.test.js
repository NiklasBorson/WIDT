import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildStairway, Tread } from "./model.js";
import { createCutPartCatalog } from "./cut-parts.js";
import { partVisibilityCategory } from "./part-list.js";
import { inverseTransform, manufacturingSpecification } from "./part-design.js";
import { formatLength } from "./part-description.js";

const html = readFileSync(new URL("./module1.html", import.meta.url), "utf8");
const cuts = readFileSync(new URL("./cuts.html", import.meta.url), "utf8");
const manifest = JSON.parse(html.match(/id="instruction-manifest">([^<]+)<\/script>/)[1]);
const model = buildStairway();
const module = model.modules[0];
const catalog = createCutPartCatalog(model);
const categories = new Set(["foundation", "treads", "uprights", "step-framing", "risers"]);
const extraKeys = new Set(["newelInnerBlock", "newelRearBlock", "frontSpindleBlock"]);
const sourcePieces = module.pieces.filter(piece =>
  categories.has(partVisibilityCategory(piece)) && !/Caster$/.test(piece.key) || extraKeys.has(piece.key));
const printed = new Map(manifest.pieces.map(piece => [piece.id, piece]));
const operations = new Map([...html.matchAll(
  /<section class="page assembly" id="([^"]+)">([\s\S]*?)<\/section>/g,
)].map(([, id, body]) => [id, body]));
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const apply = (transform, point) => [0, 1, 2].map(axis =>
  transform[12 + axis] + point.reduce((sum, value, i) => sum + transform[i * 4 + axis] * value, 0));
const points = piece => {
  let geometry = piece.part.createGeometry();
  if (piece.key === "tread") {
    const tread = new Tread({ width: model.stairWidth, angle: model.steps[0].angle,
      height: 0, extendRightEdge: piece.stepNumber === 1 });
    if (piece.stepNumber === 1) tread.notchForPost(model.steps[0].parts.newel);
    geometry = tread.createStockGeometry();
  }
  const positions = geometry.positions;
  return Array.from({ length: positions.length / 3 }, (_, i) =>
    apply(piece.transform, Array.from(positions.slice(i * 3, i * 3 + 3))));
};
const bounds = points => [0, 1].map(axis =>
  [Math.min(...points.map(point => point[axis])), Math.max(...points.map(point => point[axis]))]);
const svgPoints = path => [...path.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)]
  .map(([, x, y]) => [Number(x), Number(y)]);
const source = (step, key) => sourcePieces.find(piece => piece.stepNumber === step && piece.key === key);
const projection = body => {
  const svg = body.match(/<svg\b[\s\S]*?<\/svg>/)[0];
  const ids = [...new Set([...svg.matchAll(/data-piece="([^"]+)"/g)].map(([, id]) => id))];
  const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
  const camera = point => [dot(manifest.assemblyView.right, point), -dot(manifest.assemblyView.up, point)];
  const [[minX, maxX], [minY, maxY]] = bounds(ids.flatMap(id => points(model.partTree.getNode(id)).map(camera)));
  const height = Number(svg.match(/viewBox="0 0 720 (\d+)"/)[1]);
  const top = Number(svg.match(/data-assembly-top="([^"]+)"/)[1]);
  const scale = Math.min(600 / (maxX - minX), (height - top - 27) / (maxY - minY));
  return { svg, ids, project: point => {
    const [x, y] = camera(point);
    return [(720 - (maxX - minX) * scale) / 2 + (x - minX) * scale, top + (y - minY) * scale];
  } };
};

test("module 1 includes its unbuilt foundation and structural supports without borrowing other modules", () => {
  assert.equal(manifest.module, 1);
  assert.deepEqual(manifest.pieces.map(piece => piece.id), sourcePieces.map(piece => piece.id));
  for (const piece of sourcePieces) {
    const record = printed.get(piece.id);
    assert.equal(record.sourceSpecification, hash(piece.part.specification), piece.id);
    assert.equal(record.transform, hash(piece.transform), piece.id);
    assert.ok(operations.has(record.assemblyStep), piece.id);
    if (piece.kind === "hardware") {
      assert.equal(record.number, null);
      assert.equal(record.cutSheet, null);
    } else {
      const part = catalog.byPiece.get(piece.id);
      assert.equal(record.number, part.number);
      assert.equal(record.cuttingSpecification, hash(manufacturingSpecification(part.description)));
      assert.ok(cuts.includes(`id="part-${part.number}"`));
    }
  }
  assert.match(html, /Build its wooden foundation as part of this document/);
  assert.match(html, /Step 1 has NO uprights or conventional four-board frame/);
  assert.match(html, /newel itself is deferred/);
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, "");
  const knownIds = new Set(sourcePieces.map(piece => piece.id));
  for (const [, id] of visible.matchAll(/data-(?:piece|plan-piece|hardware-piece|mounted-hardware)="([^"]+)"/g)) {
    assert.ok(knownIds.has(id), id);
    assert.doesNotMatch(id, /Caster|frontSpindle$|rearSpindle$|newel$/);
  }
});

test("foundation and first-step assembly views reproduce the actual source geometry and setting-out marks", () => {
  for (const operation of ["assembly-2", "assembly-4"]) {
    const { svg, ids, project } = projection(operations.get(operation));
    for (const id of ids) {
      const actual = bounds([...svg.matchAll(new RegExp(`<path data-piece="${id}" d="([^"]+)"`, "g"))]
        .flatMap(([, path]) => svgPoints(path)));
      const expected = bounds(points(model.partTree.getNode(id)).map(project));
      expected.forEach((range, axis) => range.forEach((value, end) => {
        assert.ok(Math.abs(value - actual[axis][end]) < 0.001, `${operation}: ${id}`);
      }));
    }
  }
  const foundation = projection(operations.get("assembly-2")).ids;
  assert.deepEqual(foundation.sort(), sourcePieces.filter(piece =>
    ["leftSupportBeam", "rightSupportBeam", "supportCrossPiece", "rearSupportCrossPiece"].includes(piece.key))
    .map(piece => piece.id).sort());
  for (const key of ["leftSupportBeam", "rightSupportBeam"]) {
    const piece = source(null, key);
    const footprint = module.boards[key].footprint;
    const front = footprint.filter(point => Math.abs(point[1] - 1) < 1e-8);
    assert.equal(front.length, 2);
    const across = Math.min(...front.map(point => point[0]));
    const value = Number(operations.get("assembly-2").match(new RegExp(
      `data-beam-setting="${piece.id}" data-across="([^"]+)"`,
    ))[1]);
    assert.ok(Math.abs(value - across) < 1e-8);
  }
  const datum = manifest.heightDatum.modelHeight;
  const top = (step, key) => Math.max(...points(source(step, key)).map(point => point[1]));
  assert.ok(Math.abs(top(2, "supportCrossPiece") - datum) < 1e-6);
  assert.ok(Math.abs(top(null, "leftSupportBeam") - (datum - 1.5)) < 1e-6);
  for (const key of ["newelInnerBlock", "newelRearBlock"]) {
    assert.ok(Math.abs(top(1, key) - (datum - 1.5)) < 1e-6);
  }
  for (const key of ["frontStepFrontBearing", "frontStepRearBearing"]) {
    assert.ok(Math.abs(top(1, key) - (datum - 0.75)) < 1e-6);
  }
  for (const key of ["southCrossPiece", "frontStepLeftSupport", "frontStepRightSupport", "frontStepRightRearSupport"]) {
    assert.ok(Math.abs(top(1, key) - (datum + 0.75)) < 1e-6);
    assert.equal(printed.get(source(1, key).id).assemblyStep, "assembly-4");
  }
});

test("the foundation plan aligns both long beams beneath the cross-pieces in one source-based projection", () => {
  const drawn = new Map([...operations.get("assembly-2").matchAll(
    /<g data-plan-piece="([^"]+)"><path d="([^"]+)"/g,
  )].map(([, id, path]) => [id, svgPoints(path)]));
  const expected = new Map([...drawn.keys()].map(id =>
    [id, points(model.partTree.getNode(id)).map(([x, , z]) => [x, -z])]));
  const [[minX, maxX], [, maxNorth]] = bounds([...expected.values()].flat());
  const [[left, right], [top]] = bounds([...drawn.values()].flat());
  const scale = (right - left) / (maxX - minX);
  const project = ([x, north]) => [left + (x - minX) * scale, top + (maxNorth - north) * scale];
  for (const [id, footprint] of expected) {
    const actualBounds = bounds(drawn.get(id));
    bounds(footprint.map(project)).forEach((range, axis) => range.forEach((value, end) => {
      assert.ok(Math.abs(value - actualBounds[axis][end]) < 0.004,
        `${id}: plan position and extent must match the assembled model`);
    }));
  }
});

test("the foundation plan shows dotted beam edges only beneath the cross-pieces", () => {
  const plan = [...operations.get("assembly-2").matchAll(/<svg\b[\s\S]*?<\/svg>/g)]
    .map(([svg]) => svg).find(svg => svg.includes("data-plan-piece"));
  const footprints = new Map([...plan.matchAll(
    /<g data-plan-piece="([^"]+)"><path d="([^"]+)"/g,
  )].map(([, id, path]) => [id, svgPoints(path)]));
  const hidden = [...plan.matchAll(
    /<g data-hidden-plan-piece="([^"]+)" clip-path="url\(#([^"]+)\)"><path d="([^"]+)" class="hidden-cut-edge"\/><\/g>/g,
  )];
  assert.deepEqual(hidden.map(([, id]) => id).sort(),
    ["leftSupportBeam", "rightSupportBeam"].map(key => source(null, key).id).sort());
  const crossPieces = [...footprints.keys()].filter(id =>
    ["supportCrossPiece", "rearSupportCrossPiece"].includes(model.partTree.getNode(id).key));
  for (const [markup, id, clipId, path] of hidden) {
    assert.deepEqual(svgPoints(path), footprints.get(id), "Hidden lines follow the actual beam perimeter");
    const clip = plan.match(new RegExp(`<clipPath id="${clipId}">([\\s\\S]*?)</clipPath>`))[1];
    assert.deepEqual([...clip.matchAll(/<polygon points="([^"]+)"\/>/g)].map(([, points]) => svgPoints(points)),
      crossPieces.map(id => footprints.get(id)), "Only the cross-piece footprints reveal the dotted edges");
    assert.ok(plan.indexOf(markup) > plan.lastIndexOf("data-plan-piece="),
      "Hidden edges must be drawn over the opaque cross-piece fills");
  }
});

test("locating blocks are fastened before permanent post installation and shared posts precede their own frame", () => {
  assert.equal(manifest.lowerJoints.length, 6);
  const dryFit = projection(operations.get("assembly-3")).svg;
  for (const joint of manifest.lowerJoints) {
    const block = model.partTree.getNode(joint.blockId), post = model.partTree.getNode(joint.postId);
    const cross = model.partTree.getNode(joint.crossPiece);
    assert.equal(printed.get(block.id).assemblyStep, "assembly-3");
    assert.match(printed.get(post.id).assemblyStep, /^assembly-[56]$/);
    assert.ok(dryFit.includes(`data-callout-piece="${block.id}"`));
    assert.ok(!dryFit.includes(`data-callout-piece="${post.id}"`));
    assert.ok(Math.abs(Math.min(...points(post).map(point => point[1])) - manifest.heightDatum.modelHeight) < 1e-6);
    assert.ok(Math.abs(Math.min(...points(block).map(point => point[1])) - manifest.heightDatum.modelHeight) < 1e-6);
    assert.ok(Math.abs(Math.max(...points(cross).map(point => point[1])) - manifest.heightDatum.modelHeight) < 1e-6);
  }
  assert.match(operations.get("assembly-3"), /DRY FIT only/);
  assert.match(operations.get("assembly-3"), /remove the posts and fasten the blocks from beneath/);
  assert.equal(printed.get(source(3, "rightUpright").id).assemblyStep, "assembly-5");
  assert.equal(printed.get(source(3, "southCrossPiece").id).assemblyStep, "assembly-6");
  assert.match(operations.get("assembly-5"), /step-3 right-front post/);
  assert.match(operations.get("assembly-8"), /Casters, siding, railing and module joining remain deferred/);
});

test("module-1 hardware uses source mounting positions and name-only contextual illustrations", () => {
  const hardware = sourcePieces.filter(piece => piece.kind === "hardware");
  assert.deepEqual(manifest.connectors.map(connector => connector.id).sort(), hardware.map(piece => piece.id).sort());
  for (const connector of manifest.connectors) {
    const piece = model.partTree.getNode(connector.id), host = model.partTree.getNode(connector.hostId);
    const operation = printed.get(host.id).assemblyStep;
    assert.equal(printed.get(piece.id).assemblyStep, operation);
    const body = operations.get(operation);
    const callout = body.match(new RegExp(
      `<g data-hardware-callout="true" data-host="${printed.get(host.id).number}" data-hardware-piece="${piece.id}">([\\s\\S]*?)</g>`,
    ))[1];
    assert.equal(callout.match(/<text\b[^>]*>([^<]+)<\/text>/)[1], piece.name);
    assert.ok(callout.includes(`data-hardware-type="${piece.getDescription().productName}"`));
    const center = apply(inverseTransform(host.transform), piece.transform.slice(12, 15));
    center.forEach((value, axis) => assert.ok(Math.abs(value - connector.center[axis]) < 1e-8));
    assert.ok(callout.includes(`${formatLength(center[0])}&quot; from START`));
    assert.ok(callout.includes(`${formatLength(center[2])}&quot; from NEAR EDGE`));
    const circle = callout.match(/<circle cx="([^"]+)" cy="([^"]+)"/);
    projection(body).project(piece.transform.slice(12, 15)).forEach((value, axis) =>
      assert.ok(Math.abs(value - Number(circle[axis + 1])) < 0.001));
  }
  assert.equal([...html.matchAll(/data-hardware-callout=/g)].length, hardware.length);
});

test("the first tread retains its newel opening and clipped foundation cuts dimension both extra vertices", () => {
  const first = source(1, "tread");
  const tread = new Tread({ width: model.stairWidth, angle: model.steps[0].angle, height: 0, extendRightEdge: true });
  tread.notchForPost(model.steps[0].parts.newel);
  assert.equal(printed.get(first.id).number, "P-002");
  assert.deepEqual(catalog.byPiece.get(first.id).description.outline, tread.outline);
  assert.match(operations.get("assembly-1"), /STRAIGHT outer edge and a newel cutout/);
  const { svg: finalSvg, project } = projection(operations.get("assembly-8"));
  const actualVertices = [...finalSvg.matchAll(new RegExp(`<path data-piece="${first.id}" d="([^"]+)"`, "g"))]
    .flatMap(([, path]) => svgPoints(path));
  const geometry = tread.createStockGeometry();
  const transformed = points(first);
  const visibleVertices = [];
  for (let i = 0; i < geometry.indices.length; i += 3) {
    const triangle = Array.from(geometry.indices.slice(i, i + 3), index => transformed[index]);
    const a = triangle[1].map((value, axis) => value - triangle[0][axis]);
    const b = triangle[2].map((value, axis) => value - triangle[0][axis]);
    const normal = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    if (normal.reduce((sum, value, axis) => sum + value * manifest.assemblyView.towardViewer[axis], 0) > 1e-8) {
      visibleVertices.push(...triangle.map(project));
    }
  }
  for (const [expected, actual] of [[visibleVertices, actualVertices], [actualVertices, visibleVertices]]) {
    for (const point of expected) {
      assert.ok(actual.some(other => Math.hypot(...point.map((value, axis) => value - other[axis])) < 0.001),
        "The assembled first tread must retain the actual newel opening and straight outer edge");
    }
  }
  const sheets = new Map([...cuts.matchAll(/<section class="page cut-sheet" id="([^"]+)">([\s\S]*?)<\/section>/g)]
    .map(([, id, body]) => [id, body]));
  for (const key of ["frontStepRearBearing", "rearSupportCrossPiece"]) {
    const piece = source(key === "frontStepRearBearing" ? 1 : 3, key);
    const description = catalog.byPiece.get(piece.id).description;
    const body = sheets.get(printed.get(piece.id).cutSheet);
    const clip = description.edgeCuts.find(cut => cut.axis === "width" && Math.abs(cut.miterDegrees) > 1e-6);
    const endpoints = clip.points.filter(point => Math.abs(point[1]) < 1e-7).map(point => [point[0], point[2]]);
    const annotations = [...body.matchAll(/data-clipped-cut-point="(\d)" data-distance="([^"]+)" data-from="([^"]+)"/g)];
    assert.equal(annotations.length, endpoints.length);
    for (const [, index, value, from] of annotations) {
      const point = endpoints[Number(index)];
      assert.ok(Math.abs(Number(value) - point[from === "near" ? 1 : 0]) < 1e-8);
    }
    const profile = svgPoints(body.match(/<g data-cut-face="A"><path d="([^"]+)"/)[1]);
    const [offsetX, offsetY] = [130, 150];
    const scale = Math.min(400 / description.blank.length, 170 / description.blank.width);
    assert.deepEqual(profile.map(point => point.map((value, axis) =>
      Number(((value - [offsetX, offsetY][axis]) / scale).toFixed(3)))),
    description.blank.profiles.negativeY.map(point => point.map(value => Number(value.toFixed(3)))));
  }
  for (const filename of ["module2.html", "module3.html"]) {
    const other = readFileSync(new URL(`./${filename}`, import.meta.url), "utf8");
    assert.deepEqual(manifest.parts, JSON.parse(other.match(/id="instruction-manifest">([^<]+)<\/script>/)[1]).parts);
  }
});
