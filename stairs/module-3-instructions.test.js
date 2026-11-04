import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildStairway } from "./model.js";
import { createCutPartCatalog } from "./cut-parts.js";
import { inverseTransform, manufacturingSpecification } from "./part-design.js";
import { formatLength } from "./part-description.js";
import { partVisibilityCategory } from "./part-list.js";

const html = readFileSync(new URL("./module3.html", import.meta.url), "utf8");
const cuts = readFileSync(new URL("./cuts.html", import.meta.url), "utf8");
const manifest = JSON.parse(html.match(/<script type="application\/json" id="instruction-manifest">([^<]+)<\/script>/)[1]);
const model = buildStairway();
const module = model.modules[2];
const catalog = createCutPartCatalog(model);
const included = new Set(["treads", "uprights", "step-framing", "risers"]);
const sourcePieces = module.pieces.filter(piece => included.has(partVisibilityCategory(piece)));
const printedById = new Map(manifest.pieces.map(piece => [piece.id, piece]));
const operations = new Map([...html.matchAll(
  /<section class="page assembly" id="([^"]+)">([\s\S]*?)<\/section>/g,
)].map(([, id, body]) => [id, body]));
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const apply = (transform, point) => [0, 1, 2].map(axis =>
  transform[12 + axis] + point.reduce((sum, value, i) => sum + transform[i * 4 + axis] * value, 0));
const points = piece => {
  const positions = piece.part.createGeometry().positions;
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
  const sceneIds = [...new Set([...svg.matchAll(/data-piece="([^"]+)"/g)].map(([, id]) => id))];
  const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
  const camera = point => [
    dot(manifest.assemblyView.right, point), -dot(manifest.assemblyView.up, point),
  ];
  const [[minX, maxX], [minY, maxY]] = bounds(sceneIds.flatMap(id =>
    points(model.partTree.getNode(id)).map(camera)));
  const height = Number(svg.match(/viewBox="0 0 720 (\d+)"/)[1]);
  const scale = Math.min(600 / (maxX - minX), (height - 45) / (maxY - minY));
  return { svg, sceneIds, project: point => {
    const [x, y] = camera(point);
    return [(720 - (maxX - minX) * scale) / 2 + (x - minX) * scale, 18 + (y - minY) * scale];
  } };
};

test("module 3 covers its own source pieces and starts with its completed foundation", () => {
  assert.equal(manifest.module, 3);
  assert.deepEqual(manifest.pieces.map(piece => piece.id), sourcePieces.map(piece => piece.id));
  for (const piece of sourcePieces) {
    const printed = printedById.get(piece.id);
    assert.equal(printed.sourceSpecification, hash(piece.part.specification), piece.id);
    assert.equal(printed.transform, hash(piece.transform), piece.id);
    if (piece.kind === "hardware") {
      assert.equal(printed.number, null);
    } else {
      const part = catalog.byPiece.get(piece.id);
      assert.equal(printed.number, part.number);
      assert.equal(printed.cuttingSpecification, hash(manufacturingSpecification(part.description)));
      assert.ok(cuts.includes(`id="part-${part.number}"`));
    }
  }
  assert.match(html, /Module 3 &middot; steps 7&ndash;9/);
  assert.match(html, /wooden foundation is already complete/);
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, "");
  assert.doesNotMatch(visible, /step-[456]\b|leftRearTreadBlock|rightRearTreadBlock/);
  const knownIds = new Set(module.pieces.map(piece => piece.id));
  for (const [, id] of visible.matchAll(/data-(?:piece|plan-piece|hardware-piece|mounted-hardware)="([^"]+)"/g)) {
    assert.ok(knownIds.has(id), `${id}: never borrow module-2 geometry`);
  }
});

test("module 3 assembly drawings use the actual taller post geometry", () => {
  const { svg, sceneIds, project } = projection(operations.get("assembly-3"));
  const posts = sceneIds.map(id => model.partTree.getNode(id)).filter(piece => /Upright$/.test(piece.key));
  assert.ok(posts.length >= 5);
  for (const piece of posts) {
    const paths = [...svg.matchAll(new RegExp(`<path data-piece="${piece.id}" d="([^"]+)"`, "g"))];
    const actual = bounds(paths.flatMap(([, path]) => svgPoints(path)));
    const expected = bounds(points(piece).map(project));
    expected.forEach((range, axis) => range.forEach((value, end) => {
      assert.ok(Math.abs(value - actual[axis][end]) < 0.001, `${piece.id}: source-projected post bounds`);
    }));
    const previousId = piece.id.replace("module-3", "module-2")
      .replace(/step-(\d+)/, (_, step) => `step-${Number(step) - 3}`);
    const previous = model.partTree.getNode(previousId);
    const rise = model.steps[6].height - model.steps[3].height;
    assert.ok(Math.abs(piece.getDescription().blank.length - previous.getDescription().blank.length - rise) < 1e-8);
  }
});

test("module 3 retains the shared-post sequence and seats all lower joints on its own caster-free foundation", () => {
  const middlePost = source(8, "rightUpright"), lastPost = source(9, "rightUpright");
  assert.equal(printedById.get(middlePost.id).assemblyStep, "assembly-3");
  assert.equal(printedById.get(lastPost.id).assemblyStep, "assembly-4");
  assert.ok(operations.get("assembly-3").includes(`data-piece="${middlePost.id}"`));
  assert.ok(operations.get("assembly-4").includes(`data-piece="${lastPost.id}"`));
  assert.equal(printedById.get(source(9, "northCrossPiece").id).assemblyStep, "assembly-5");
  const foundation = module.pieces.filter(piece => partVisibilityCategory(piece) === "foundation" && piece.kind !== "hardware");
  assert.deepEqual(manifest.foundation, foundation.map(piece => ({
    id: piece.id, sourceSpecification: hash(piece.part.specification), transform: hash(piece.transform),
  })));
  for (const piece of foundation) {
    for (const operation of ["assembly-2", "assembly-3", "assembly-4", "assembly-5"]) {
      assert.ok(!operations.get(operation).includes(`data-piece="${piece.id}"`));
    }
    assert.ok(operations.get("assembly-6").includes(`data-piece="${piece.id}"`));
  }
  assert.equal(manifest.lowerJoints.length, 6);
  for (const joint of manifest.lowerJoints) {
    const block = model.partTree.getNode(joint.blockId), post = model.partTree.getNode(joint.postId);
    const cross = model.partTree.getNode(joint.crossPiece);
    assert.ok(joint.crossPiece.startsWith("stairway/module-3/"));
    const datum = manifest.heightDatum.modelHeight;
    for (const piece of [block, post]) {
      assert.ok(Math.abs(Math.min(...points(piece).map(point => point[1])) - datum) < 1e-5);
    }
    assert.ok(Math.abs(Math.max(...points(cross).map(point => point[1])) - datum) < 1e-5);
    assert.equal(printedById.get(block.id).assemblyStep, "assembly-6");
  }
  assert.match(operations.get("assembly-6"), /casters remain off/);
  assert.match(operations.get("assembly-5"), /no rear tread blocks or intermodule flanges/);
});

test("module 3 hardware is unnumbered and mounted at actual source positions beside its host", () => {
  const hardware = sourcePieces.filter(piece => piece.kind === "hardware");
  assert.deepEqual(manifest.connectors.map(connector => connector.id).sort(), hardware.map(piece => piece.id).sort());
  for (const connector of manifest.connectors) {
    const piece = model.partTree.getNode(connector.id), host = model.partTree.getNode(connector.hostId);
    const printed = printedById.get(piece.id), hostPrinted = printedById.get(host.id);
    assert.equal(printed.assemblyStep, hostPrinted.assemblyStep);
    const body = operations.get(hostPrinted.assemblyStep);
    const callout = body.match(new RegExp(
      `<g data-hardware-callout="true" data-host="${hostPrinted.number}" data-hardware-piece="${piece.id}">([\\s\\S]*?)</g>`,
    ))?.[1];
    assert.ok(callout, piece.id);
    assert.equal(callout.match(/<text\b[^>]*>([^<]+)<\/text>/)[1], piece.name);
    assert.doesNotMatch(callout, /id="part-P-/);
    assert.ok(callout.includes(`data-hardware-type="${piece.getDescription().productName}"`));
    const center = apply(inverseTransform(host.transform), piece.transform.slice(12, 15));
    center.forEach((value, axis) => assert.ok(Math.abs(value - connector.center[axis]) < 1e-8));
    assert.ok(callout.includes(`${formatLength(center[0])}&quot; from START`));
    assert.ok(callout.includes(`${formatLength(center[2])}&quot; from NEAR EDGE`));
    const projected = projection(body).project(piece.transform.slice(12, 15));
    const circle = callout.match(/<circle cx="([^"]+)" cy="([^"]+)"/);
    projected.forEach((value, axis) => assert.ok(Math.abs(value - Number(circle[axis + 1])) < 0.001));
  }
  assert.equal([...html.matchAll(/data-hardware-callout=/g)].length, hardware.length);
});

test("the shared cut list covers all assemblies without renumbering or adding unrelated parts", () => {
  const expected = new Set(model.modules.flatMap((module, index) =>
    module.pieces.filter(piece => piece.kind !== "hardware" &&
      (included.has(partVisibilityCategory(piece)) || index === 0 &&
        (partVisibilityCategory(piece) === "foundation" || ["newelInnerBlock", "newelRearBlock", "frontSpindleBlock"].includes(piece.key))))
      .map(piece => catalog.byPiece.get(piece.id).number)));
  assert.deepEqual(manifest.parts.map(part => part.number).sort(), [...expected].sort());
  const module2 = readFileSync(new URL("./module2.html", import.meta.url), "utf8");
  const otherManifest = JSON.parse(module2.match(/id="instruction-manifest">([^<]+)<\/script>/)[1]);
  assert.deepEqual(manifest.parts, otherManifest.parts);
  for (const piece of sourcePieces.filter(piece => piece.kind !== "hardware")) {
    const printed = printedById.get(piece.id);
    assert.ok(cuts.includes(`href="module3.html#${printed.assemblyStep}"`));
  }
});
