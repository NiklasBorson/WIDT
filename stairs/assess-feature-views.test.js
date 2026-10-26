import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  assessConfigurations, assessDescription, assessModel, assessPlaneAngle, formatAssessment,
} from "./assess-feature-views.mjs";
import { buildStairway } from "./model.js";
import { PartInventory } from "./part-list.js";

const radians = degrees => degrees * Math.PI / 180;
const dot = (a, b) => a.reduce((sum, value, axis) => sum + value * b[axis], 0);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7,
  `${actual} differs from ${expected}`);
const report = assessModel(buildStairway());
const script = fileURLToPath(new URL("./assess-feature-views.mjs", import.meta.url));

function descriptionWithCut(miter = 32, bevel = 7) {
  const n = [
    Math.cos(radians(bevel)) * Math.cos(radians(miter)),
    Math.sin(radians(bevel)),
    Math.cos(radians(bevel)) * Math.sin(radians(miter)),
  ];
  const point = (y, z) => [(5 - n[1] * y - n[2] * z) / n[0], y, z];
  return {
    kind: "lumber", units: { length: "inches", angle: "degrees" },
    blank: {
      length: 10, thickness: 2, width: 4,
      profiles: {
        negativeY: [[0, 0], [10, 0], [10, 4], [0, 4]],
        positiveY: [[0, 0], [10, 0], [10, 4], [0, 4]],
      },
    },
    edgeCuts: [{
      name: "Test end cut", axis: "length", points: [point(0, 0), point(2, 0), point(2, 4), point(0, 4)],
      plane: { normal: n, offset: 5 }, miterDegrees: miter, bevelDegrees: bevel,
      angleFromSquare: Math.acos(Math.abs(n[0])) * 180 / Math.PI,
    }],
    notches: [], dados: [], edgeNotches: [],
  };
}

test("simple miter and end/edge bevels select their true-angle stock views", () => {
  const miter = assessPlaneAngle([Math.cos(radians(30)), 0, Math.sin(radians(30))], [1, 0, 0]);
  close(miter.valueDegrees, 30);
  assert.deepEqual(miter.preferredViews, ["+Y", "-Y"]);
  const end = assessPlaneAngle([Math.cos(radians(12)), Math.sin(radians(12)), 0], [1, 0, 0]);
  close(end.valueDegrees, 12);
  assert.deepEqual(end.preferredViews, ["+Z", "-Z"]);
  const edge = assessPlaneAngle([0, Math.sin(radians(5)), Math.cos(radians(5))], [0, 0, 1]);
  close(edge.valueDegrees, 5);
  assert.deepEqual(edge.preferredViews, ["+X", "-X"]);
  for (const measurement of [miter, end, edge]) {
    assert.equal(measurement.status, "standard");
    assert.equal(measurement.auxiliaryDirection, null);
  }
});

test("compound true bevel has an auxiliary direction perpendicular to both reference planes", () => {
  const n = descriptionWithCut().edgeCuts[0].plane.normal, r = [n[0], 0, n[2]];
  const result = assessPlaneAngle(n, r);
  close(result.valueDegrees, 7);
  assert.equal(result.status, "auxiliary");
  assert.deepEqual(result.preferredViews, []);
  close(dot(result.auxiliaryDirection, n), 0);
  close(dot(result.auxiliaryDirection, r), 0);
  close(Math.hypot(...result.auxiliaryDirection), 1);
  for (const [normal, reference] of [
    [n.map(value => -3 * value), r.map(value => 2 * value)],
    [n.map(value => 1e-12 * value), r],
    [n, r.map(value => -value)],
  ]) {
    const transformed = assessPlaneAngle(normal, reference);
    close(transformed.valueDegrees, result.valueDegrees);
    close(Math.abs(dot(transformed.auxiliaryDirection, result.auxiliaryDirection)), 1);
  }
  const rotate = ([x, y, z]) => [z, x, y];
  const rotated = assessPlaneAngle(rotate(n), rotate(r));
  close(rotated.valueDegrees, result.valueDegrees);
  assert.equal(rotated.status, result.status);
  close(Math.abs(dot(rotated.auxiliaryDirection, rotate(result.auxiliaryDirection))), 1);
});

test("parallel oblique planes do not manufacture a spurious auxiliary angle", () => {
  for (const reference of [[2, 4, 6], [-2, -4, -6]]) {
    const result = assessPlaneAngle([1, 2, 3], reference);
    assert.equal(result.valueDegrees, 0);
    assert.equal(result.annotationRequired, false);
    assert.equal(result.status, "standard");
    assert.equal(result.auxiliaryDirection, null);
  }
  assert.equal(assessPlaneAngle([1, 1e-10, 0], [1, 0, 0]).annotationRequired, false);
  assert.equal(assessPlaneAngle([1, 1e-6, 0], [1, 0, 0]).annotationRequired, true);
});

test("invalid normals and incomplete or duplicate view sets fail explicitly", () => {
  for (const normal of [[0, 0, 0], [NaN, 0, 1], [Infinity, 0, 1], [1, 0]]) {
    assert.throws(() => assessPlaneAngle(normal, [1, 0, 0]), /finite|nonzero|three-component/);
  }
  assert.throws(() => assessPlaneAngle([1, 1, 0], [1, 0, 0], []), /six/);
  assert.throws(() => assessPlaneAngle([1, 1, 0], [1, 0, 0],
    Array.from({ length: 6 }, () => ({ name: "Repeated", direction: [1, 0, 0] }))), /six/);
});

test("compound cuts retain a standard section trace separately from true bevel and diagnostic inclination", () => {
  const description = descriptionWithCut();
  const cut = assessDescription(description).find(feature => feature.id === "cut-0");
  const miter = cut.measurements.find(measurement => measurement.property === "miter-trace");
  close(miter.valueDegrees, 32);
  assert.equal(miter.status, "standard");
  assert.deepEqual(miter.preferredViews, ["+Y", "-Y"]);
  assert.equal(miter.presentation, "explicit-section-trace");
  const bevel = cut.measurements.find(measurement => measurement.property === "bevel");
  close(bevel.valueDegrees, 7);
  assert.equal(bevel.independent, true);
  assert.equal(bevel.status, "auxiliary");
  const inclination = cut.measurements.find(measurement => measurement.property === "inclination-from-square");
  assert.equal(inclination.independent, false);
  assert.equal(inclination.status, "auxiliary");
  assert.deepEqual(cut.geometry.points, description.edgeCuts[0].points);
  const square = assessDescription(descriptionWithCut(0, 0)).find(feature => feature.id === "cut-0");
  assert.ok(square.measurements.every(measurement => measurement.kind === "coordinate"));
});

test("nonplanar, degenerate and inconsistent authored patches are errors", () => {
  const nonplanar = descriptionWithCut();
  nonplanar.edgeCuts[0].points[2][0] += 0.1;
  assert.throws(() => assessDescription(nonplanar), /Nonplanar/);
  const wrongPlane = descriptionWithCut();
  wrongPlane.edgeCuts[0].plane.offset += 1;
  assert.throws(() => assessDescription(wrongPlane), /authored plane/);
  const degenerate = descriptionWithCut();
  degenerate.edgeCuts[0].points = [[0, 0, 0], [1, 0, 0], [2, 0, 0]];
  assert.throws(() => assessDescription(degenerate), /Degenerate/);
  const unsupported = descriptionWithCut();
  unsupported.edgeCuts[0].axis = "unknown";
  assert.throws(() => assessDescription(unsupported), /Unsupported cut reference/);
});

test("notch slopes use absolute face-specific shoulders and retain collapsed boundaries without inventing angles", () => {
  const description = descriptionWithCut(0, 0);
  description.blank.profiles.positiveY = [[1, 0], [9, 0], [9, 4], [1, 4]];
  description.notches = [
    { corner: "startNear", length: 2, lengths: [2, 3], depth: [1, 2] },
    { corner: "startNear", length: 1, depth: [0, 0] },
  ];
  const features = assessDescription(description);
  const floor = features.find(feature => feature.id === "notch-0/floor");
  const shoulder = features.find(feature => feature.id === "notch-0/shoulder");
  close(floor.measurements.find(measurement => measurement.property === "bevel").valueDegrees,
    Math.atan2(1, 2) * 180 / Math.PI);
  close(shoulder.measurements.find(measurement => measurement.property === "bevel").valueDegrees, 45);
  assert.deepEqual(shoulder.geometry.constructionPoints.map(point => point[0]), [2, 2, 4, 4]);
  assert.equal(shoulder.geometry.points, undefined);
  assert.equal(shoulder.metadata.parentFeature, "notch-0");
  assert.equal(features.find(feature => feature.id === "notch-1/shoulder").kind, "collapsed-boundary");
  assert.deepEqual(features.find(feature => feature.id === "notch-0").geometry, description.notches[0]);
});

test("sheet notch preserves unequal face profiles and rejects a nonplanar connecting floor", () => {
  const description = descriptionWithCut(0, 0);
  description.edgeNotches = [{ profiles: [[[2, 3], [4, 3]], [[3, 2], [5, 2]]] }];
  const features = assessDescription(description);
  const notch = features.find(feature => feature.id === "edge-notch-0");
  assert.deepEqual(notch.geometry.profiles, description.edgeNotches[0].profiles);
  const floor = features.find(feature => feature.id === "edge-notch-0/floor");
  close(floor.measurements.find(measurement => measurement.property === "bevel").valueDegrees,
    Math.atan2(1, 2) * 180 / Math.PI);
  description.edgeNotches[0].profiles[1][1][1] += 0.2;
  assert.throws(() => assessDescription(description), /Nonplanar/);
});

test("an internal dado separates opening location, width and face-normal depth", () => {
  const description = descriptionWithCut(0, 0);
  description.dados = [{ face: "positiveY", start: 3, width: 1, depth: 0.5, acrossWidth: 4, endNotch: false }];
  const dado = assessDescription(description).find(feature => feature.kind === "dado");
  assert.deepEqual(dado.geometry, description.dados[0]);
  assert.deepEqual(dado.measurements.map(measurement => [measurement.property, measurement.axis, measurement.values]),
    [["position", "X", [3]], ["opening-width", "X", [1]], ["depth", "Y", [0.5]], ["across-width", "Z", [4]]]);
  assert.equal(dado.measurements.find(measurement => measurement.property === "depth").reference,
    "positiveY original broad face");
});

test("default model is exhaustively inventoried without invoking render-mesh generation or modifying descriptions", t => {
  const model = buildStairway(), leaves = model.partTree.getLeaves();
  const snapshot = JSON.stringify(leaves.map(node => node.getDescription()));
  t.mock.method(Object.getPrototypeOf(leaves[0].part), "createGeometry",
    () => assert.fail("Render geometry must not be read."));
  t.mock.method(Object.getPrototypeOf(leaves[0].part), "createStockGeometry",
    () => assert.fail("Cutting geometry must not be read."));
  const inventory = new PartInventory(model.partTree), actual = assessModel(model);
  assert.equal(actual.summary.occurrences, leaves.length);
  assert.equal(actual.summary.woodenPatterns, 71);
  assert.equal(actual.summary.woodenOccurrences, 161);
  assert.equal(actual.summary.hardwareOccurrences, 12);
  assert.equal(actual.parts.length + actual.hardware.length, inventory.entries.length);
  const occurrenceIds = [...actual.parts, ...actual.hardware].flatMap(part => part.occurrenceIds);
  assert.equal(new Set(occurrenceIds).size, leaves.length);
  assert.deepEqual([...occurrenceIds].sort(), leaves.map(node => node.id).sort());
  const categories = new Set();
  for (const part of actual.parts) {
    const source = inventory.entries.find(entry => entry.representativeId === part.representativeId).description;
    assert.equal(part.features.length, 1 + Number(Boolean(source.widthTrim)) + source.edgeCuts.length +
      source.notches.length * 3 + source.dados.length + source.edgeNotches.length * 4);
    assert.equal(part.features.filter(feature => feature.id.startsWith("cut-")).length, source.edgeCuts.length);
    source.edgeNotches.forEach((notch, index) => assert.deepEqual(
      part.features.find(feature => feature.id === `edge-notch-${index}`).geometry.profiles, notch.profiles));
    assert.deepEqual(part.views, model.partTree.getStockViews(part.representativeId));
    assert.equal(part.roles.flatMap(role => role.occurrenceIds).length, part.quantity);
    for (const feature of part.features) {
      categories.add(feature.kind);
      for (const measurement of feature.measurements) {
        assert.ok(["standard", "auxiliary"].includes(measurement.status));
        if (measurement.status === "standard") assert.ok(measurement.preferredViews.length);
        else {
          close(dot(measurement.auxiliaryDirection, measurement.normal), 0);
          close(dot(measurement.auxiliaryDirection, measurement.referenceNormal), 0);
        }
      }
    }
  }
  for (const kind of ["blank", "width-rip", "cut-plane", "corner-notch", "end-notch"]) {
    assert.ok(categories.has(kind), `The actual model did not exercise ${kind}.`);
  }
  assert.equal(JSON.stringify(leaves.map(node => node.getDescription())), snapshot);
});

test("actual shim has square ends and preserves its end-view side bevels", () => {
  const shim = report.parts.find(part => part.title === "Spindle shim");
  const ends = shim.features.filter(feature => /^(Top|Bottom) end$/.test(feature.name));
  assert.equal(ends.length, 2);
  for (const end of ends) {
    assert.equal(end.geometry.points.length, 4);
    assert.ok(end.measurements.every(measurement => measurement.kind === "coordinate"));
    close(end.metadata.signedMiterDegrees, 0);
    close(end.metadata.signedBevelDegrees, 0);
  }
  close(shim.features.find(feature => feature.id === "blank").geometry.length, 4);
  assert.ok(shim.features.every(feature => !/facet/.test(feature.name)));
  for (const name of ["Front face", "Back face"]) {
    const bevel = shim.features.find(feature => feature.name === name).measurements
      .find(measurement => measurement.property === "bevel");
    close(bevel.valueDegrees, 5);
    assert.deepEqual(bevel.preferredViews, ["Up", "Down"]);
  }
  for (const name of ["Inner face", "Outer face"]) {
    assert.ok(shim.features.find(feature => feature.name === name).measurements
      .every(measurement => measurement.kind === "coordinate"));
  }
});

test("actual stopped newel bevel retains its finite outline and broad-face end-notch depth retains its reference", () => {
  const newel = report.parts.find(part => part.title === "Newel post");
  const stopped = newel.features.find(feature => feature.metadata?.cornerBevel);
  assert.ok(stopped.geometry.points.length >= 3);
  assert.ok(stopped.metadata.cornerBevel.end > stopped.metadata.cornerBevel.start);
  assert.equal(stopped.name, "Bevel top shoulder");
  const bevelPatch = newel.features.find(feature => feature.name === "Newel corner bevel");
  assert.ok(bevelPatch.geometry.points.length >= 3);
  const bevel = bevelPatch.measurements.find(measurement => measurement.property === "bevel");
  close(bevel.valueDegrees, 10);
  assert.equal(bevel.status, "standard");
  const dado = report.parts.flatMap(part => part.features).find(feature => feature.kind === "end-notch");
  const depth = dado.measurements.find(measurement => measurement.property === "depth");
  assert.equal(depth.axis, "Y");
  assert.ok(depth.reference.includes(dado.geometry.face));
  assert.deepEqual(depth.values, [dado.geometry.depth]);
});

test("all 54 sampled UI configurations have standard-view coverage after simplifying the shim", () => {
  const reports = assessConfigurations(true);
  assert.equal(reports.length, 54);
  for (const actual of reports) {
    assert.equal(actual.summary.independentAuxiliaryAngles, 0);
    assert.equal(actual.summary.diagnosticAuxiliaryAngles, 0);
    assert.equal(actual.summary.patternsRequiringAuxiliaryAngles, 0);
    assert.equal(actual.summary.measurements, actual.summary.standardMeasurements +
      actual.summary.independentAuxiliaryAngles + actual.summary.diagnosticAuxiliaryAngles);
    const auxiliaryParts = actual.parts.filter(part => part.features.some(feature =>
      feature.measurements.some(measurement => measurement.status === "auxiliary" && measurement.independent !== false)));
    assert.deepEqual(auxiliaryParts, []);
  }
  const text = formatAssessment([report]);
  assert.match(text, /0 independent angles require auxiliary views/);
  assert.match(text, /not a visibility guarantee/);
  assert.match(text, /derived total-inclination/);
});

test("CLI emits parseable complete default JSON and reports invalid arguments as failures", () => {
  const actual = JSON.parse(execFileSync(process.execPath, [script, "--json"], { maxBuffer: 10 * 1024 * 1024 }));
  assert.equal(actual.length, 1);
  assert.deepEqual(actual[0].summary, report.summary);
  assert.ok(actual[0].parts.every(part => part.roles.every(role => typeof role.label === "string")));
  const invalid = spawnSync(process.execPath, [script, "--unknown"], { encoding: "utf8" });
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /Usage:/);
  assert.equal(invalid.stdout, "");
});
