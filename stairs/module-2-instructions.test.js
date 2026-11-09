import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildStairway, Tread } from "./model.js";
import { manufacturingSpecification, inverseTransform } from "./part-design.js";
import { partVisibilityCategory } from "./part-list.js";
import { formatLength } from "./part-description.js";
import { createCutPartCatalog } from "./cut-parts.js";
import { tessellateOutline } from "./plywood-outline.js";

const documents = new Map(["module1.html", "module2.html", "module3.html", "cuts.html"].map(filename =>
  [filename, readFileSync(new URL(`./${filename}`, import.meta.url), "utf8")]));
const assemblyHtml = documents.get("module2.html");
const cutsHtml = documents.get("cuts.html");
const html = `${assemblyHtml}\n${cutsHtml}`;
const manifest = JSON.parse(html.match(/<script type="application\/json" id="instruction-manifest">([^<]+)<\/script>/)[1]);
const model = buildStairway();
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const byNumber = new Map(manifest.pieces.filter(part => part.kind !== "hardware").map(part => [part.number, part]));
const byId = new Map(manifest.pieces.map(piece => [piece.id, piece]));
const printedPiece = n => manifest.pieces[Number(n) - 1];
const catalog = createCutPartCatalog(model);
const bearingWedge = piece => piece.key === "frontSpindleBearingShim" &&
  piece.getDescription().edgeCuts.some(cut => cut.surfaceCut && cut.angleFromSquare > 1e-6);
const hasOrientedRailFaces = piece => piece.key === "southCrossPiece" && piece.stepNumber >= 2 ||
  piece.key === "leftStepSupport" && piece.stepNumber % 3 === 0;
const apply = (t, p) => [0, 1, 2].map(a =>
  t[12 + a] + p.reduce((sum, value, i) => sum + t[i * 4 + a] * value, 0));
const area = points => Math.abs(points.reduce((sum, p, i) => {
  const q = points[(i + 1) % points.length];
  return sum + p[0] * q[1] - q[0] * p[1];
}, 0)) / 2;
const svgPoints = path => [...path.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)]
  .map(([, x, y]) => [Number(x), Number(y)]);
const cutPages = new Map([...html.matchAll(
  /<section class="page ([^"]*)" id="([^"]+)">([\s\S]*?)<\/section>/g,
)].filter(([, cls]) => cls.includes("cut-sheet")).map(([, , id, body]) => [id, body]));
const squareCutEntries = new Map([...cutsHtml.matchAll(
  /<article class="square-cut" id="([^"]+)">([\s\S]*?)<\/article>/g,
)].map(([, id, body]) => [id, body]));
const notchedSheets = manifest.cutProfiles.map(sheet => ({
  ...sheet, d: model.partTree.getNode(byNumber.get(sheet.numbers[0]).id).getDescription(),
})).filter(({ d }) => d.notches.length && d.notches.every(n => n.length < d.blank.length - 1e-7));

test("printed pieces cover the current module-2 scope exactly and detect stale source geometry", () => {
  const pieces = model.modules[1].pieces.filter(piece =>
    ["treads", "uprights", "step-framing", "risers"].includes(partVisibilityCategory(piece)));
  assert.deepEqual(manifest.pieces.map(part => part.id), pieces.map(piece => piece.id));
  for (const [i, piece] of pieces.entries()) {
    const printed = manifest.pieces[i];
    assert.equal(printed.sourceSpecification, hash(piece.part.specification), `${printed.number}: source changed`);
    assert.equal(printed.transform, hash(piece.transform), `${printed.number}: placement changed`);
    assert.ok(html.includes(`id="${printed.assemblyStep}"`), `${printed.number}: missing assembly operation`);
    if (piece.kind === "hardware") {
      assert.equal(printed.number, null);
      assert.ok(!catalog.byPiece.has(piece.id), `${piece.id}: hardware does not belong in the cutting catalog`);
    } else {
      assert.equal(printed.number, catalog.byPiece.get(piece.id).number);
      assert.ok(html.includes(`id="part-${printed.number}"`), `${printed.number}: missing cutting entry`);
      assert.ok(html.includes(`id="${printed.cutSheet}"`), `${printed.number}: missing cut sheet`);
    }
  }
});

test("wood part links lead to cut sheets and unnumbered hardware is identified beside its host", () => {
  const pages = new Map([...html.matchAll(
    /<section class="page [^"]*" id="([^"]+)">([\s\S]*?)<\/section>/g,
  )].map(([, id, body]) => [id, body]));
  assert.doesNotMatch(html, /id="inventory-\d+"|href="#inventory-|PART REGISTER|part register/i);
  for (const [i, printed] of manifest.pieces.entries()) {
    if (printed.kind === "hardware") {
      const connector = manifest.connectors.find(connector => connector.id === printed.id);
      assert.equal(printed.assemblyStep, byId.get(connector.hostId).assemblyStep,
        `${printed.number}: identify hardware with its own host`);
      assert.ok(assemblyHtml.includes(`data-hardware-piece="${printed.id}"`));
    } else {
      const destination = [...pages].find(([, body]) => body.includes(`id="part-${printed.number}"`));
      assert.ok(destination, `${printed.number}: missing link destination`);
      const [id, body] = destination;
      assert.ok(body.includes(`<span id="part-${printed.number}">${printed.number}</span>`));
      assert.ok(body.includes(`href="module2.html#${printed.assemblyStep}"`), `${printed.number}: retain assembly navigation`);
      assert.ok(id === printed.cutSheet || body.includes(`id="${printed.cutSheet}"`),
        `${printed.number}: anchor must be on its cutting page`);
      assert.ok(body.includes(`Step ${printed.step}`), `${printed.number}: retain its owning step`);
    }
  }
});

test("cut sheets retain source machining except deferred tread notches and normalized bearing wedges", () => {
  for (const printed of manifest.pieces.filter(part => part.kind !== "hardware")) {
    const piece = model.partTree.getNode(printed.id);
    const description = piece.key === "tread" ? new Tread({
      width: model.stairWidth, angle: model.steps[0].angle,
      height: model.steps[piece.stepNumber - 1].height,
    }).getManufacturingDescription() : bearingWedge(piece)
      ? catalog.byPiece.get(piece.id).description : piece.getDescription();
    assert.equal(printed.cuttingSpecification, hash(manufacturingSpecification(description)), printed.number);
    if (piece.key === "tread") {
      assert.notEqual(printed.cuttingSpecification, printed.sourceSpecification);
      assert.equal(description.outline.length, 4);
      assert.equal(description.holes?.length ?? 0, 0);
    }
  }
});

test("all cutting sheets omit procedures, coordinate tables and axis notation", () => {
  for (const [id, body] of cutPages) {
    assert.doesNotMatch(body, /<ol\b|<table\b|Dry-check the profile|Cut by measured marks/, id);
    const text = body.replace(/<[^>]*>/g, " ");
    assert.doesNotMatch(text, /\b[XYZ]\b/, `${id}: omit axis notation`);
    assert.doesNotMatch(text, /\(\s*[~\d-][\d./~ -]*,\s*[~\d-]/, `${id}: omit coordinate pairs`);
    assert.doesNotMatch(text, /exaggerat|enlarged/, `${id}: do not distort view scales`);
  }
});

test("all notched-rail notes distinguish the actual end, shoulder and floor angles", () => {
  const label = angle => Math.abs(angle) < 1e-6 ? "square" : `${Number(Math.abs(angle).toFixed(2))} deg bevel`;
  for (const { sheet, d } of notchedSheets) {
    const body = cutPages.get(sheet);
    assert.match(body, /Face A[^<]*original blank/);
    assert.doesNotMatch(body, /<text[^>]+class="tiny"[^>]*>[A-Z]<\/text>/,
      "omit vertex letters when there is no coordinate table");
    const cuts = d.edgeCuts.filter(cut => cut.axis === "length").sort((a, b) =>
      Math.min(...a.points.map(p => p[0])) - Math.min(...b.points.map(p => p[0])));
    if (Math.abs(Math.abs(cuts[0].bevelDegrees) - Math.abs(cuts[1].bevelDegrees)) < 1e-6) {
      assert.ok(body.includes(`End cuts: ${label(cuts[0].bevelDegrees)}`));
    } else {
      for (const [i, cut] of cuts.entries()) {
        assert.ok(body.includes(`${i ? "Right" : "Left"} end: ${label(cut.bevelDegrees)}`));
      }
    }
    for (const notch of d.notches) {
      const shoulders = ["negativeY", "positiveY"].map((face, i) => {
        const xs = d.blank.profiles[face].map(p => p[0]);
        return notch.corner.startsWith("start")
          ? Math.min(...xs) + (notch.lengths?.[i] ?? notch.length)
          : Math.max(...xs) - (notch.lengths?.[i] ?? notch.length);
      });
      const angle = Math.atan2(Math.abs(shoulders[1] - shoulders[0]), d.blank.thickness) * 180 / Math.PI;
      assert.ok(body.includes(`notch shoulders: ${label(angle)}`),
        "shoulder annotation must match the model, not incorrectly claim a square cut");
      assert.equal(notch.depth[0], notch.depth[1]);
      assert.ok(body.includes("notch floors: square"));
    }
  }
});

test("all rail drawings dimension each notch and project visible or hidden floor edges correctly", () => {
  const coordinates = drawing => drawing.match(
    /<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/,
  ).slice(1).map(Number);
  assert.match(html, /svg \.hidden-notch-floor,[^{]*\{[^}]*stroke-dasharray:[^}]*stroke-linecap:round/);
  for (const { sheet, d, A, B, numbers } of notchedSheets) {
    const body = cutPages.get(sheet);
    const blanks = [...body.matchAll(
      /<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)" class="blank"\/>/g,
    )].map(match => match.slice(1).map(Number));
    const [x, y, width, height] = blanks.at(-1);
    const sx = width / d.blank.length, sy = height / d.blank.thickness;
    const reverseB = hasOrientedRailFaces(model.partTree.getNode(byNumber.get(numbers[0]).id));
    const projectX = (value, face) => x + (reverseB && face === 1 ? d.blank.length - value : value) * sx;
    assert.ok(Math.abs(sx - sy) < 1e-4, "edge-view thickness must use the same scale as its length");
    assert.equal(width, blanks[0][2], "edge and broad-face views must use the same scale");
    for (const [i, face] of ["A", "B"].entries()) {
      const points = svgPoints(body.match(new RegExp(`<g data-cut-face="${face}"><path d="([^"]+)"`))[1]);
      assert.equal(points.length, [A, B][i].length);
      points.forEach(([px, py], j) => {
        assert.ok(Math.abs(px - projectX([A, B][i][j][0], i)) < 2e-4);
        assert.ok(Math.abs(py - blanks[i][1] - [A, B][i][j][1] * sx) < 2e-4);
      });
    }
    const fromFar = d.notches.every(n => n.corner.endsWith("Near"));
    assert.ok(body.includes(`data-frame-edge-view="${fromFar ? "far" : "near"}"`));
    const floors = new Map([...body.matchAll(
      /<g data-frame-notch-floor="([^"]+)" data-hidden="(true|false)">([\s\S]*?)<\/g>/g,
    )].map(([, corner, hidden, drawing]) => [corner, { hidden, drawing }]));
    const depths = [...body.matchAll(
      /<g data-frame-notch-depth="([^"]+)" data-face="([AB])" data-value="([^"]+)">([\s\S]*?)<\/g>/g,
    )];
    const lengths = [...body.matchAll(
      /<g data-frame-notch-length="([^"]+)" data-face="([AB])" data-value="([^"]+)">([\s\S]*?)<\/g>/g,
    )];
    assert.equal(floors.size, d.notches.length);
    assert.equal(depths.length, d.notches.length * 2);
    assert.equal(lengths.length, d.notches.length * 2);
    for (const notch of d.notches) {
      const near = notch.corner.endsWith("Near");
      const shoulders = ["negativeY", "positiveY"].map((face, i) => {
        const xs = d.blank.profiles[face].map(p => p[0]);
        return notch.corner.startsWith("start")
          ? Math.min(...xs) + (notch.lengths?.[i] ?? notch.length)
          : Math.max(...xs) - (notch.lengths?.[i] ?? notch.length);
      });
      const floor = floors.get(notch.corner);
      const hidden = fromFar ? near : !near;
      assert.equal(floor.hidden, String(hidden));
      assert.ok(floor.drawing.includes(`class="${hidden ? "hidden" : "visible"}-notch-floor"`));
      const [x1, y1, x2, y2] = coordinates(floor.drawing);
      for (const [actual, expected] of [[x1, x + shoulders[0] * sx], [x2, x + shoulders[1] * sx],
        [y1, fromFar ? y : y + height], [y2, fromFar ? y + height : y]]) {
        assert.ok(Math.abs(actual - expected) < 2e-4, "floor edge must meet the real shoulder on each face");
      }
      const bevel = Math.atan2(Math.abs(x2 - x1) / sx, Math.abs(y2 - y1) / sy) * 180 / Math.PI;
      assert.ok(Math.abs(bevel - Math.abs(notch.shoulderBevelDegrees)) < 0.001);
      for (const [i, face] of ["A", "B"].entries()) {
        const [, , , value, drawing] = depths.find(([, corner, f]) => corner === notch.corner && f === face);
        assert.ok(Math.abs(Number(value) - notch.depth[i]) < 1e-8);
        assert.ok(drawing.includes(formatLength(notch.depth[i])));
        const [, top, , bottom] = coordinates(drawing);
        assert.ok(Math.abs(top - (blanks[i][1] + (near ? 0 : d.blank.width - notch.depth[i]) * sx)) < 2e-4);
        assert.ok(Math.abs(bottom - (blanks[i][1] + (near ? notch.depth[i] : d.blank.width) * sx)) < 2e-4,
          "depth must measure from the floor to the correct original edge");
        const [, , , length, lengthDrawing] = lengths.find(([, corner, f]) => corner === notch.corner && f === face);
        assert.ok(Math.abs(Number(length) - (notch.lengths?.[i] ?? notch.length)) < 1e-8);
        assert.ok(lengthDrawing.includes(formatLength(notch.lengths?.[i] ?? notch.length)));
        const [left, y1, right, y2] = coordinates(lengthDrawing);
        const xs = d.blank.profiles[i ? "positiveY" : "negativeY"].map(p => p[0]);
        const end = notch.corner.startsWith("start") ? Math.min(...xs) : Math.max(...xs);
        const expected = [projectX(end, i), projectX(shoulders[i], i)].sort((a, b) => a - b);
        assert.ok(Math.abs(left - expected[0]) < 2e-4);
        assert.ok(Math.abs(right - expected[1]) < 2e-4,
          "notch length must measure from the actual beveled end to its shoulder");
        assert.equal(y1, y2);
        assert.ok(near ? y1 < blanks[i][1] : y1 > blanks[i][1] + d.blank.width * sx,
          "notch dimensions must sit outside the relevant edge of the board");
      }
    }
  }
});

test("generic edge views are adjacent 90-degree rotations of Face A", () => {
  const sides = new Set();
  for (const part of catalog.parts) {
    const body = cutPages.get(`cut-${Number(part.number.slice(2))}`);
    const edge = body?.match(/<g data-frame-edge-view="(near|far)" data-adjacent-face="A">([\s\S]*?)<\/g>/);
    if (!edge) continue;
    const d = part.description;
    const fromFar = edge[1] === "far";
    sides.add(edge[1]);
    const blanks = [...body.matchAll(
      /<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)" class="blank"\/>/g,
    )].map(match => match.slice(1).map(Number));
    const [faceX, faceY, faceWidth, faceHeight] = blanks[0];
    const [x, y, width, height] = blanks.at(-1);
    const scale = width / d.blank.length;
    assert.equal(x, faceX, `${part.number}: preserve the face's length direction and registration`);
    assert.equal(width, faceWidth);
    assert.ok(fromFar ? y > faceY + faceHeight : y + height < faceY,
      `${part.number}: the edge view belongs beside the corresponding face edge`);
    if (fromFar && d.notches.length) assert.ok(y + height < blanks[1][1],
      `${part.number}: the far-edge view must remain between Face A and Face B`);
    const points = svgPoints(edge[2].match(/<path d="([^"]+)"/)[1]);
    const vertices = d.blank.vertices.filter(p => Math.abs(p[2] - (fromFar ? d.blank.width : 0)) < 1e-6);
    assert.equal(points.length, vertices.length);
    for (const [stockX, stockY] of vertices) {
      const expectedX = x + stockX * scale;
      const expectedY = y + (fromFar ? stockY : d.blank.thickness - stockY) * scale;
      assert.ok(points.some(([px, py]) => Math.abs(px - expectedX) < 2e-4 && Math.abs(py - expectedY) < 2e-4),
        `${part.number}: the edge profile must rotate without reversing its length`);
      if (Math.abs(stockY) < 1e-7) {
        assert.ok(Math.abs(expectedY - (fromFar ? y : y + height)) < 2e-4,
          `${part.number}: Face A must be the thickness boundary nearest its face view`);
      }
    }
  }
  assert.deepEqual([...sides].sort(), ["far", "near"], "exercise rotations from both long edges");
});

test("all rail end views show the correct retained half, handedness and true scale", () => {
  for (const { sheet, d, numbers } of notchedSheets) {
    const body = cutPages.get(sheet);
    const faces = [...body.matchAll(
      /<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)" class="blank"\/>/g,
    )].slice(0, 2).map(match => match.slice(1).map(Number));
    const views = [...body.matchAll(
      /<g data-frame-notch-end="([^"]+)" data-face="([AB])">([\s\S]*?)<\/g>/g,
    )];
    const mixed = d.notches.some(n => n.corner.endsWith("Near")) && d.notches.some(n => n.corner.endsWith("Far"));
    const piece = model.partTree.getNode(byNumber.get(numbers[0]).id);
    const front = piece.key === "southCrossPiece";
    assert.deepEqual(views.map(([, , face]) => face), mixed ? ["A", "A", "B", "B"] : ["A", "B"]);
    for (const [, corner, face, view] of views) {
      const i = face === "A" ? 0 : 1;
      const notch = d.notches.find(notch => notch.corner === corner);
      const near = notch.corner.endsWith("Near");
      const [faceX, top, faceWidth, faceHeight] = faces[i];
      const scale = faceWidth / d.blank.length;
      const points = svgPoints(view.match(/<path d="([^"]+)"/)[1]);
      assert.equal(points.length, 4);
      const atEnd = corner.startsWith("end");
      const endOnRight = atEnd !== (hasOrientedRailFaces(piece) && face === "B");
      if (!mixed) assert.equal(atEnd, front ? face === "B" : !d.notches.some(n => n.corner.startsWith("start")));
      assert.ok(endOnRight
        ? Math.min(...points.map(p => p[0])) > faceX + faceWidth
        : Math.max(...points.map(p => p[0])) < faceX,
      "end view must sit beside the notched end of its face");
      if (endOnRight) assert.ok(Math.min(...points.map(p => p[0])) > faceX + faceWidth + 50,
        "right-end views must clear the adjacent notch-depth dimensions");
      for (const p of near ? points.slice(2) : points.slice(0, 2)) {
        assert.ok(Math.abs(p[1] - (top + (near ? faceHeight : 0))) < 2e-4, "uncut edges must align");
      }
      assert.ok(Math.abs(Math.abs(points[1][0] - points[0][0]) / scale - d.blank.thickness) < 1e-4,
        "end-view thickness must use the broad-face scale");
      const floorPoints = near ? [points[0], points[1]] : [points[3], points[2]];
      for (const [j, p] of floorPoints.entries()) {
        assert.ok(Math.abs((p[1] - top) / scale - (near ? notch.depth[j] : d.blank.width - notch.depth[j])) < 1e-4,
          "drawn end profile must retain the correct half of the stock");
      }
      const adjacent = floorPoints[i], opposite = floorPoints[1 - i];
      assert.ok(endOnRight ? adjacent[0] < opposite[0] : adjacent[0] > opposite[0],
        `${face} must be on the side adjacent to its broad-face view`);
      assert.ok(Math.abs(floorPoints[0][1] - floorPoints[1][1]) < 1e-4, "square floors must draw horizontally");
      assert.match(view, /Square floor/);
      assert.ok(view.includes(formatLength(d.blank.thickness)), "show fractional stock thickness");
      const [, blankTop, blankHeight] = view.match(
        /data-frame-end-blank="[AB]" x="[^"]+" y="([^"]+)" width="[^"]+" height="([^"]+)"/,
      );
      assert.ok(Math.abs(Number(blankTop) - top) < 1e-4);
      assert.ok(Math.abs(Number(blankHeight) - faceHeight) < 1e-4, "original far edges must also align");
    }
  }
});

test("face tapers show the cutting profile and retained end thicknesses at true scale", () => {
  const sheets = new Map(manifest.pieces.filter(part => part.kind !== "hardware")
    .map(part => [part.cutSheet, model.partTree.getNode(part.id)]));
  for (const [sheet, piece] of sheets) {
    const part = catalog.byPiece.get(piece.id);
    const d = part.description;
    const surface = d.edgeCuts.find(c => c.surfaceCut);
    if (!surface) continue;
    const body = cutPages.get(sheet);
    const keepB = surface.plane.normal[1] < 0;
    const [, side, section] = body.match(/<g data-face-taper-section="([AB])">([\s\S]*?)<\/g>/);
    assert.equal(side, keepB ? "B" : "A");
    const [x, y, width, height] = body.match(
      /<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)" class="blank"/,
    ).slice(1).map(Number);
    const scale = width / d.blank.length;
    assert.ok(Math.abs(height / scale - d.blank.thickness) < 1e-5);
    const face = svgPoints(body.match(/<path d="([^"]+)"/)[1]);
    assert.ok(Math.abs((face[2][1] - face[1][1]) / scale - d.blank.width) < 1e-5);
    const ends = surface.points.filter(p => Math.abs(p[2]) < 1e-7).sort((a, b) => a[0] - b[0]);
    const expected = keepB
      ? [ends[0], ends[1], [d.blank.length, d.blank.thickness], [0, d.blank.thickness]]
      : [[0, 0], [d.blank.length, 0], ends[1], ends[0]];
    const points = svgPoints(section.match(/<path d="([^"]+)"/)[1]);
    points.forEach(([px, py], i) => {
      assert.ok(Math.abs(px - x - expected[i][0] * scale) < 2e-4);
      assert.ok(Math.abs(py - y - (keepB ? d.blank.thickness - expected[i][1] : expected[i][1]) * scale) < 2e-4,
        "the retained uncut face must be the section boundary nearest its broad-face view");
    });
    const meshPiece = bearingWedge(piece)
      ? part.locations.map(location => model.partTree.getNode(location.id)).find(candidate =>
        hash(manufacturingSpecification(candidate.getDescription())) === hash(part.specification))
      : piece;
    assert.ok(meshPiece, `${sheet}: the canonical taper must match a source feather-edge wedge`);
    const geometry = meshPiece.part.createStockGeometry();
    let machinedArea = 0;
    for (let i = 0; i < geometry.indices.length; i += 3) {
      const triangle = Array.from(geometry.indices.slice(i, i + 3), index =>
        Array.from(geometry.positions.slice(index * 3, index * 3 + 3)));
      if (triangle.every(point => Math.abs(point[2]) < 1e-5)) {
        machinedArea += area(triangle.map(([px, py]) => [px, py]));
      }
    }
    assert.ok(Math.abs(area(points) / scale ** 2 - machinedArea) < 1e-4,
      `${sheet}: the shaded retained section must match the actual machined mesh`);
    const dimensions = [...body.matchAll(
      /<g data-cut-measure="taper-thickness" data-value="([^"]+)" data-end="(left|right)">([\s\S]*?)<\/g>/g,
    )];
    assert.equal(dimensions.length, 2);
    dimensions.forEach(([, value, end, drawing], i) => {
      assert.equal(end, i ? "right" : "left");
      const retained = keepB ? d.blank.thickness - ends[i][1] : ends[i][1];
      assert.ok(Math.abs(Number(value) - retained) < 1e-8);
      const [, top, , bottom] = drawing.match(
        /<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/,
      ).slice(1).map(Number);
      assert.ok(Math.abs((bottom - top) / scale - retained) < 1e-5);
      const label = retained < 1e-8 ? "Feather edge" : retained < 1 / 32 ? "&lt; 1/16" : formatLength(retained);
      assert.ok(drawing.includes(label), "tiny positive thicknesses must not be mislabeled as zero");
    });
    if (bearingWedge(piece)) {
      assert.match(body, /5 deg is the controlling angle/);
      assert.match(body, /thick-end thickness is reference only/);
      assert.match(body, /slice the wedges directly off the end of a 2x4; grain direction is unimportant/);
      assert.doesNotMatch(body, /taper long stock before final crosscuts/);
    } else {
      assert.match(body, /full-width face taper, not an end bevel/);
      assert.match(body, /taper long stock before final crosscuts/);
    }
  }
});

test("ripped edge-bevel boards show both retained widths and correctly handed true-scale end sections", () => {
  const printed = printedPiece(46);
  const d = model.partTree.getNode(printed.id).getDescription(), notch = d.notches[0];
  const body = cutPages.get(printed.cutSheet);
  const faces = [...body.matchAll(
    /<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)" class="blank"\/>/g,
  )].map(match => match.slice(1).map(Number));
  assert.equal(faces.length, 2);
  for (const [i, name] of ["A", "B"].entries()) {
    const [, top, width, height] = faces[i], scale = width / d.blank.length;
    const [, value, dimension] = body.match(new RegExp(
      `<g data-cut-measure="retained-width" data-value="([^"]+)" data-face="${name}">([\\s\\S]*?)<\\/g>`,
    ));
    assert.ok(Math.abs(Number(value) - d.blank.width + notch.depth[i]) < 1e-8);
    assert.ok(dimension.includes(formatLength(d.blank.width - notch.depth[i])));
    const [, view] = body.match(new RegExp(`<g data-edge-bevel-end="${name}">([\\s\\S]*?)<\\/g>`));
    const points = svgPoints(view.match(/<path d="([^"]+)"/)[1]);
    assert.equal(points.length, 4);
    for (const [j, point] of points.slice(0, 2).entries()) {
      assert.ok(Math.abs(point[1] - top - notch.depth[j] * scale) < 2e-4);
    }
    assert.ok(Math.abs(points[2][1] - top - height) < 2e-4);
    assert.ok(Math.abs(points[3][1] - top - height) < 2e-4);
    assert.ok(Math.abs(Math.abs(points[0][0] - points[1][0]) / scale - d.blank.thickness) < 1e-5);
    assert.ok(points[i][0] > points[1 - i][0], "the adjacent broad face must be on the right");
    const angle = Math.atan2(Math.abs(points[0][1] - points[1][1]),
      Math.abs(points[0][0] - points[1][0])) * 180 / Math.PI;
    assert.ok(Math.abs(angle - Math.abs(notch.bevelDegrees)) < 0.001);
  }
  assert.match(body, /class="hidden-cut-edge"/);
  assert.ok(body.includes(`Rip stock from ${formatLength(d.widthTrim.from)} to ${formatLength(d.widthTrim.to)}`));
});

test("end bevels and miters dimension the shorter finished edges from their actual cut endpoints", () => {
  for (const part of catalog.parts.filter(part => manifest.parts.some(printed => printed.number === part.number))) {
    const d = part.description;
    const body = cutPages.get(`cut-${Number(part.number.slice(2))}`);
    const views = [];
    if (d.edgeCuts.some(cut => Math.abs(cut.miterDegrees) > 1e-6)) {
      views.push({ name: "face-A", coordinate: 2, limit: d.blank.width, fixed: 1 });
    }
    if (d.edgeCuts.some(cut => cut.axis === "length" && Math.abs(cut.bevelDegrees) > 1e-6)) {
      const fromFar = d.notches.length > 0 && d.notches.every(notch => notch.corner.endsWith("Near"));
      views.push({ name: fromFar ? "far-edge" : "near-edge", coordinate: 1, limit: d.blank.thickness, fixed: 2, fromFar });
    }
    for (const view of views) {
      assert.ok(body, `${part.number}: illustrated cutting sheet`);
      assert.match(body, /data-cut-measure="overall-length"/);
      const blanks = [...body.matchAll(
        /<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)" class="blank"\/>/g,
      )].map(match => match.slice(1).map(Number));
      const [x, y, width, height] = view.name === "face-A" ? blanks[0] : blanks.at(-1);
      const scale = width / d.blank.length;
      const expected = [0, view.limit].map(coordinate => {
        const xs = d.blank.vertices.filter(p =>
          Math.abs(p[view.fixed]) < 1e-7 && Math.abs(p[view.coordinate] - coordinate) < 1e-7).map(p => p[0]);
        const start = Math.min(...xs), end = Math.max(...xs);
        return { coordinate, start, end, length: end - start };
      }).filter(edge => edge.length < d.blank.length - 1e-7);
      const unique = [...new Set(expected.map(edge => edge.length.toFixed(7)))].map(Number).sort((a, b) => a - b);
      const measurements = [...body.matchAll(
        /<g data-cut-measure="finished-edge-length" data-value="([^"]+)" data-view="([^"]+)" data-edge-coordinate="([^"]+)">([\s\S]*?)<\/g>/g,
      )].filter(([, , name]) => name === view.name);
      assert.deepEqual(measurements.map(([, value]) => Number(Number(value).toFixed(7))).sort((a, b) => a - b),
        unique, `${part.number}: every distinct shorter edge, without duplicate dimensions`);
      if (view.name === "face-A" && d.blank.profiles.negativeY.length === 4) {
        const overall = body.match(/<g data-cut-measure="overall-length"[^>]*><line x1="[^"]+" y1="([^"]+)"/);
        for (const [, , , , drawing] of measurements) {
          const dimensionY = Number(drawing.match(/<line x1="[^"]+" y1="([^"]+)"/)[1]);
          assert.ok(Number(overall[1]) > dimensionY, `${part.number}: overall length below both edge lengths`);
        }
      }
      for (const [, value, , coordinate, drawing] of measurements) {
        const edge = expected.find(edge => Math.abs(edge.coordinate - Number(coordinate)) < 1e-7);
        assert.ok(edge, `${part.number}: dimension a real longitudinal edge`);
        assert.ok(Math.abs(Number(value) - edge.length) < 1e-7);
        assert.ok(drawing.includes(`${formatLength(edge.length)} edge`));
        const [left, top, right, bottom] = drawing.match(
          /<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/,
        ).slice(1).map(Number);
        assert.ok(Math.abs(left - x - edge.start * scale) < 2e-4);
        assert.ok(Math.abs(right - x - edge.end * scale) < 2e-4,
          `${part.number}: measure between the real end-cut tips, not the blank ends`);
        assert.equal(top, bottom);
        const edgeY = y + (view.name === "face-A" || view.fromFar ? edge.coordinate : view.limit - edge.coordinate) * scale;
        assert.ok(edgeY < y + height / 2 ? top < y : top > y + height,
          `${part.number}: dimension sits outside the measured edge`);
      }
    }
  }
});

test("the first-step front beam identifies its floor-facing broad face", () => {
  const part = catalog.parts.find(part => part.locations.some(location =>
    model.partTree.getNode(location.id).key === "frontStepFrontBearing"));
  const body = cutPages.get(`cut-${Number(part.number.slice(2))}`);
  assert.match(body, /Face A is the UNDERSIDE, facing the FLOOR when installed\. Face B faces UP\./);
  for (const location of part.locations) {
    const transform = model.partTree.getNode(location.id).transform;
    assert.ok(Math.abs(transform[4]) < 1e-7 && Math.abs(transform[5] - 1) < 1e-7 && Math.abs(transform[6]) < 1e-7,
      "the source negative-thickness face must point downward when installed");
  }
});

test("both front tread-support variants label installed faces and edges in their diagrams", () => {
  const supports = catalog.parts.filter(part => part.locations.every(location =>
    model.partTree.getNode(location.id).key === "southCrossPiece" && location.stepNumber >= 2));
  assert.equal(supports.length, 2);
  for (const part of supports) {
    const body = cutPages.get(`cut-${Number(part.number.slice(2))}`);
    const drawing = body.match(/<svg[\s\S]*?<\/svg>/)[0];
    assert.match(drawing, /Face A - FRONT \/ DOWNHILL/);
    assert.match(drawing, /Face B - BACK \/ UPHILL/);
    assert.match(drawing, /BOTTOM EDGE VIEW \(from Face A\)/);
    assert.equal([...drawing.matchAll(/>BOTTOM EDGE<\/text>/g)].length, 2);
    assert.equal([...drawing.matchAll(/>TOP EDGE<\/text>/g)].length, 2);
    assert.doesNotMatch(drawing, /NEAR \/ BOTTOM|FAR \/ TOP/);
    const endViews = [...drawing.matchAll(
      /<g data-frame-notch-end="([^"]+)" data-face="([AB])"><text[^>]*>([^<]+)<\/text>/g,
    )];
    assert.deepEqual(endViews.map(([, corner, face, label]) => [corner, face, label]), [
      ["startFar", "A", "LEFT / INSIDE END"],
      ["endFar", "B", "RIGHT / OUTSIDE END"],
    ], `${part.number}: show the actual opposite ends, not the same end twice`);
    const faces = [...drawing.matchAll(
      /<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)" class="blank"\/>/g,
    )].slice(0, 2).map(match => match.slice(1).map(Number));
    for (const [, , face] of endViews) {
      const view = drawing.match(new RegExp(
        `<g data-frame-notch-end="[^"]+" data-face="${face}">([\\s\\S]*?)<\\/g>`,
      ))[1];
      const points = svgPoints(view.match(/<path d="([^"]+)"/)[1]);
      assert.ok(Math.max(...points.map(point => point[0])) < faces[face === "A" ? 0 : 1][0],
        `${part.number}: the inside end at the front and outside end at the back both appear to the left of their face view`);
    }
    for (const location of part.locations) {
      const { transform } = model.partTree.getNode(location.id);
      assert.ok(Math.abs(transform[8]) < 1e-7 && Math.abs(transform[9] - 1) < 1e-7 &&
        Math.abs(transform[10]) < 1e-7, "positive stock width points up; the near edge is the bottom");
      assert.ok(Math.abs(transform[5]) < 1e-7 && transform[6] < -0.9,
        "positive stock thickness faces back; Face A faces forward");
      assert.ok(Math.abs(transform[4] - transform[2]) < 1e-7 &&
        Math.abs(transform[6] + transform[0]) < 1e-7, "the broad faces follow the installed support's rotation");
    }
  }
});

for (const number of [26, 27]) test(`P-0${number} rotates every view together with installed bottom below top and readable annotations`, () => {
  const body = cutPages.get(`cut-${number}`);
  assert.ok(body.includes(`P-0${number}`));
  const drawing = body.match(/<svg[\s\S]*?<\/svg>/)[0];
  const [, height] = drawing.match(/viewBox="0 0 720 ([^"]+)"/);
  const [, centerX, centerY] = drawing.match(/data-cut-rotation="180" transform="rotate\(180 ([^ ]+) ([^)]+)\)"/);
  assert.equal(Number(centerX), 360);
  assert.equal(Number(centerY) * 2, Number(height));
  const screen = ([x, y]) => [2 * Number(centerX) - x, 2 * Number(centerY) - y];
  const blanks = [...drawing.matchAll(
    /<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)" class="blank"\/>/g,
  )].map(match => match.slice(1).map(Number));
  const texts = [...drawing.matchAll(/<text ([^>]+)>([^<]*)<\/text>/g)];
  for (const [, attributes] of texts) {
    const [, x, y] = attributes.match(/x="([^"]+)" y="([^"]+)"/);
    assert.ok(attributes.includes(`transform="rotate(180 ${x} ${y})"`),
      "every annotation must counter-rotate, including end-view labels and dimensions");
    assert.match(attributes, /dominant-baseline="text-before-edge"/);
  }
  const positions = label => texts.filter(([, , text]) => text === label)
    .map(([, attributes]) => screen(attributes.match(/x="([^"]+)" y="([^"]+)"/).slice(1).map(Number)));
  for (const [prefix, blank] of [
    ["Face A -", blanks[0]], ["Face B -", blanks[1]], ["BOTTOM EDGE VIEW", blanks[2]],
  ]) {
    const [, attributes] = texts.find(([, , text]) => text.startsWith(prefix));
    const point = screen(attributes.match(/x="([^"]+)" y="([^"]+)"/).slice(1).map(Number));
    const [x, y, width, height] = blank;
    const [left, top] = screen([x + width, y + height]);
    assert.match(attributes, /text-anchor="start"/, "view headings stay left-aligned after rotation");
    assert.ok(Math.abs(point[0] - left) < 2e-4);
    assert.ok(point[1] < top - 12, "view headings belong above their view, not below it");
    const measure = prefix === "BOTTOM EDGE VIEW"
      ? drawing.match(/<g data-cut-measure="finished-edge-length"[^>]*data-view="near-edge"[^>]*><line x1="([^"]+)" y1="([^"]+)"/)
      : drawing.match(new RegExp(`<g data-cut-measure="overall-length"[^>]*data-face="${prefix.startsWith("Face A") ? "A" : "B"}"><line x1="([^"]+)" y1="([^"]+)"`));
    const dimensionY = screen(measure.slice(1).map(Number))[1];
    assert.ok(point[1] + 16 < dimensionY, "headings must clear the upper dimension line as well as the profile");
  }
  const top = positions("TOP EDGE"), bottom = positions("BOTTOM EDGE");
  assert.equal(top.length, 2);
  assert.equal(bottom.length, 2);
  for (let face = 0; face < 2; face++) {
    assert.ok(top[face][1] < bottom[face][1], "the installed top is above the installed bottom");
    const [, y, , height] = blanks[face];
    assert.ok(top[face][1] > screen([0, y + height])[1] && bottom[face][1] < screen([0, y])[1]);
  }
  const [a, b, edge] = blanks.map(([x, y, width, height]) => screen([x + width / 2, y + height / 2]));
  assert.ok(b[1] < a[1] && a[1] < edge[1], "rotate the entire set: Face B, Face A, then bottom-edge view");
  const endViews = [...drawing.matchAll(
    /<g data-frame-notch-end="[^"]+" data-face="([AB])">([\s\S]*?)<\/g>/g,
  )];
  for (const [, face, view] of endViews) {
    const localPoints = svgPoints(view.match(/<path d="([^"]+)"/)[1]);
    const points = localPoints.map(screen);
    const [x, , width] = blanks[face === "A" ? 0 : 1];
    const wasLeft = Math.max(...localPoints.map(point => point[0])) < x;
    assert.ok(wasLeft
      ? Math.min(...points.map(point => point[0])) > screen([x, 0])[0]
      : Math.max(...points.map(point => point[0])) < screen([x + width, 0])[0],
    "rotated end views must remain adjacent to their matching face ends");
    const [, attributes] = view.match(/<text ([^>]+)>/);
    const heading = screen(attributes.match(/x="([^"]+)" y="([^"]+)"/).slice(1).map(Number));
    assert.match(attributes, /text-anchor="start"/, "end-view headings also stay left-aligned");
    assert.ok(heading[0] <= Math.min(...points.map(point => point[0])) + 2e-4);
    if (number === 27) assert.ok(Math.abs(heading[0] - Math.min(...points.map(point => point[0]))) < 2e-4,
      "the short support's end headings align with their profiles, clear of the face headings");
    assert.ok(heading[1] < Math.min(...points.map(point => point[1])) - 12,
      "end-view headings sit above the full view, including its thickness dimension");
  }
  assert.doesNotMatch(cutPages.get("cut-25"), /data-cut-rotation/);
});

test("the last-step left support labels its front and back ends rather than diagram-relative left and right", () => {
  const part = catalog.parts.find(part => part.locations.every(location =>
    model.partTree.getNode(location.id).key === "leftStepSupport" && location.stepNumber % 3 === 0));
  assert.ok(part);
  const body = cutPages.get(`cut-${Number(part.number.slice(2))}`);
  const drawing = body.match(/<svg[\s\S]*?<\/svg>/)[0];
  assert.match(drawing, /Face A - RIGHT \/ INSIDE FRAME/);
  assert.match(drawing, /Face B - LEFT \/ OUTSIDE FRAME/);
  assert.equal([...drawing.matchAll(/>FRONT END<\/text>/g)].length, 2);
  assert.equal([...drawing.matchAll(/>BACK END<\/text>/g)].length, 2);
  assert.doesNotMatch(drawing, />LEFT END<\/text>|>RIGHT END<\/text>/);
  assert.match(drawing, /BOTTOM EDGE VIEW \(from Face A\)/);
  assert.equal([...drawing.matchAll(/>BOTTOM EDGE<\/text>/g)].length, 2);
  assert.equal([...drawing.matchAll(/>TOP EDGE<\/text>/g)].length, 2);
  assert.doesNotMatch(drawing, /NEAR \/ BOTTOM|FAR \/ TOP/);
  for (const location of part.locations) {
    const { transform } = model.partTree.getNode(location.id);
    assert.ok(transform[2] < -0.9, "positive stock length points back; the start is the front end");
    assert.ok(transform[4] < -0.9, "positive stock thickness points left; Face B is outside the left frame");
    assert.ok(Math.abs(transform[9] - 1) < 1e-7, "positive stock width points up; the near edge is the bottom");
  }
});

test("end views use neutral labels unless their faces establish installed staircase directions", () => {
  let neutral = 0, oriented = 0;
  for (const body of cutPages.values()) {
    const views = [...body.matchAll(
      /<g data-frame-notch-end="(start|end)[^"]*" data-face="[AB]">([\s\S]*?)<\/g>/g,
    )];
    if (!views.length) continue;
    const part = catalog.parts.find(part => body.includes(`id="part-${part.number}"`));
    const pieces = part.locations.map(location => model.partTree.getNode(location.id));
    const front = pieces.every(piece => piece.key === "southCrossPiece" && piece.stepNumber >= 2);
    const side = pieces.every(piece => piece.key === "leftStepSupport" && piece.stepNumber % 3 === 0);
    for (const [, end, drawing] of views) {
      const expected = front ? end === "start" ? "LEFT / INSIDE END" : "RIGHT / OUTSIDE END"
        : side ? end === "start" ? "FRONT END" : "BACK END" : "END VIEW";
      assert.equal(drawing.match(/<text[^>]*>([^<]+)<\/text>/)[1], expected, part.number);
      if (front || side) oriented++;
      else neutral++;
    }
    if (front) {
      assert.match(body, /Face A - FRONT \/ DOWNHILL/);
      assert.match(body, /Face B - BACK \/ UPHILL/);
      assert.ok(pieces.every(piece => piece.transform[0] > 0.9), "positive stock length points right");
    } else if (!side) {
      assert.doesNotMatch(body, />LEFT END<\/text>|>RIGHT END<\/text>/);
    }
  }
  assert.ok(neutral > 0 && oriented > 0, "cover both neutral and staircase-oriented end views");
});

test("thin plywood risers extend their actual end-cut lines without exaggerating the bevel", () => {
  for (const number of [18, 35, 52].map(n => printedPiece(n).number)) {
    const printed = byNumber.get(number), body = cutPages.get(printed.cutSheet);
    const d = model.partTree.getNode(printed.id).getDescription();
    const [x, y, width, height] = [...body.matchAll(
      /<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)" class="blank"\/>/g,
    )].at(-1).slice(1).map(Number);
    const scale = width / d.blank.length;
    assert.ok(Math.abs(height / scale - d.stock.thickness) < 1e-5, "keep the true thickness scale");
    const extensions = [...body.matchAll(
      /<g data-end-cut-extension="(left|right)" data-bevel="([^"]+)">([\s\S]*?)<\/g>/g,
    )];
    assert.equal(extensions.length, 2);
    for (const [, end, angle, drawing] of extensions) {
      const cut = d.edgeCuts.filter(c => c.axis === "length").find(c =>
        (c.points.reduce((sum, p) => sum + p[0] / c.points.length, 0) < d.blank.length / 2) === (end === "left"));
      assert.equal(Number(angle), cut.bevelDegrees);
      const endpoints = cut.points.filter(p => Math.abs(p[2]) < 1e-6).sort((a, b) => b[1] - a[1]);
      const segments = [...drawing.matchAll(
        /<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)" class="template"\/>/g,
      )].map(match => match.slice(1).map(Number));
      assert.equal(segments.length, 2, "extend above and below the stock");
      for (const [i, segment] of segments.entries()) {
        const [x1, y1, x2, y2] = segment;
        const px = i ? x1 : x2, py = i ? y1 : y2;
        assert.ok(Math.abs(px - x - endpoints[i][0] * scale) < 2e-4);
        assert.ok(Math.abs(py - y - (d.blank.thickness - endpoints[i][1]) * scale) < 2e-4,
          "extension must meet the real cut at the stock face");
        const drawnAngle = Math.atan2(Math.abs(x2 - x1), Math.abs(y2 - y1)) * 180 / Math.PI;
        assert.ok(Math.abs(drawnAngle - Math.abs(cut.bevelDegrees)) < 0.001);
        assert.ok(Math.hypot(x2 - x1, y2 - y1) > height * 4, "extensions must make the thin cut legible");
      }
      assert.ok(segments[0][1] < y && segments[1][3] > y + height);
    }
    assert.match(body, /Near-edge view \(from Face A\); dashed cut extensions/);
  }
});

test("all cut-sheet lengths use sixteenths rather than decimals", () => {
  const pages = new Map([...html.matchAll(
    /<section class="page ([^"]*)" id="([^"]+)">([\s\S]*?)<\/section>/g,
  )].filter(([, cls, id]) => cls.includes("cut-sheet") || id === "square-cuts")
    .map(([, , id, body]) => [id, body]));
  assert.ok(html.includes('id="square-cuts"') && pages.has("tread-layout"));
  for (const [id, body] of pages) {
    const text = body.replace(/<[^>]*>/g, " ")
      .replace(/\b\d+\.\d+(?=-degree|\s+deg\b)/g, "ANGLE");
    assert.doesNotMatch(text, /\d+\.\d+/, `${id}: decimal length remains`);
  }
});

test("short left uprights use step-labelled drawings with fractional notch dimensions and the actual bevel", () => {
  for (const number of [2, 3].map(n => printedPiece(n).number)) {
    const printed = byNumber.get(number);
    const piece = model.partTree.getNode(printed.id);
    const d = piece.getDescription(), cut = d.edgeNotches[0];
    const body = html.match(new RegExp(`<section\\b[^>]*id="${printed.cutSheet}"[^>]*>([\\s\\S]*?)<\\/section>`))[1];
    const heading = body.match(/<h1>([\s\S]*?)<\/h1>/)[1];
    assert.ok(heading.includes(number) && body.includes(`Step ${printed.step}`), number);
    assert.doesNotMatch(body, /<ol\b|<table\b/, "a sufficient drawing needs no cutting instructions or coordinate table");
    assert.doesNotMatch(body.replace(/<[^>]*>/g, " "), /\d+\.\d+/, "visible lengths must use fractional inches");
    const profiles = manifest.cutProfiles.find(sheet => sheet.numbers.includes(number));
    for (const [i, face] of ["A", "B"].entries()) {
      const faceBody = body.split(`<g data-notch-face="${face}">`)[1]
        .split(face === "A" ? '<g data-notch-face="B">' : 'data-notch-section="floor"')[0];
      const path = faceBody.match(new RegExp(`<g data-retained-profile="${face}"><path d="([^"]+)"`))[1];
      const points = svgPoints(path);
      const scale = (Math.max(...points.map(p => p[0])) - Math.min(...points.map(p => p[0]))) / d.blank.length;
      assert.ok(Math.abs(area(points) / scale ** 2 - area(profiles[face])) < 1e-4,
        `${number} ${face}: drawn retained shape must match the machined face`);
      const expected = new Map([
        ["depth", d.blank.width - cut.profiles[i][0][1]],
        ["retained-width", cut.profiles[i][0][1]],
        ...(i ? [] : [["opening", cut.profiles[0][1][0]],
          ["uncut-length", d.blank.length - cut.profiles[0][1][0]]]),
      ]);
      const dimensions = new Map([...faceBody.matchAll(
        /<g data-notch-dimension="([^"]+)" data-value="([^"]+)">([\s\S]*?)<\/g>/g,
      )].map(([, key, value, drawing]) => [key, { value: Number(value), drawing }]));
      assert.equal(dimensions.size, expected.size);
      for (const [key, value] of expected) {
        const dimension = dimensions.get(key);
        assert.ok(Math.abs(dimension.value - value) < 1e-8, `${number} ${face} ${key}`);
        assert.ok(dimension.drawing.includes(formatLength(value)), `${key}: missing fractional label`);
        const [, x1, y1, x2, y2] = dimension.drawing.match(
          /<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/,
        );
        assert.ok(Math.abs(Math.hypot(Number(x2) - Number(x1), Number(y2) - Number(y1)) / scale - value) < 1e-4,
          `${number} ${face} ${key}: dimension must measure the actual drawn cut`);
      }
    }
    const bevel = Number(body.match(/data-notch-section="floor" data-bevel="([^"]+)"/)[1]);
    const expectedBevel = Math.atan2(Math.abs(cut.profiles[0][0][1] - cut.profiles[1][0][1]),
      d.blank.thickness) * 180 / Math.PI;
    assert.ok(Math.abs(bevel - expectedBevel) < 1e-8);
    assert.ok(body.includes(`${Number(expectedBevel.toFixed(2))} deg floor bevel`));
  }
});

test("upright end views align with each face and its dotted far bevel edge", () => {
  assert.match(html, /\.upright-cut \.hidden-floor\{[^}]*stroke-dasharray:[^}]*stroke-linecap:round/);
  for (const number of [2, 3].map(n => printedPiece(n).number)) {
    const printed = byNumber.get(number);
    const d = model.partTree.getNode(printed.id).getDescription();
    const cut = d.edgeNotches[0];
    const body = html.match(new RegExp(`<section\\b[^>]*id="${printed.cutSheet}"[^>]*>([\\s\\S]*?)<\\/section>`))[1];
    const sections = [...body.matchAll(
      /<g data-notch-section="floor" data-bevel="([^"]+)" data-face="([AB])">([\s\S]*?)<\/g>/g,
    )];
    assert.deepEqual(sections.map(([, , face]) => face), ["A", "B"]);
    for (const [i, [, bevel, face, endView]] of sections.entries()) {
      const points = svgPoints(body.match(new RegExp(
        `<g data-retained-profile="${face}"><path d="([^"]+)"`,
      ))[1]);
      const left = Math.min(...points.map(p => p[0]));
      const bottom = Math.max(...points.map(p => p[1]));
      const scale = (Math.max(...points.map(p => p[0])) - left) / d.blank.length;
      const end = svgPoints(endView.match(/<path d="([^"]+)"/)[1]);
      assert.equal(end.length, 4);
      assert.ok(Math.max(...end.map(p => p[0])) < left, "end view must sit beside its broad face");
      for (const p of [end[0], end[3]]) {
        assert.ok(Math.abs(p[1] - bottom) < 1e-4, "uncut edges must align");
      }
      assert.ok(Math.abs(Math.abs(end[0][0] - end[3][0]) / scale - d.blank.thickness) < 1e-4);
      for (const j of [0, 1]) {
        assert.ok(Math.abs((bottom - end[j + 1][1]) / scale - cut.profiles[j][0][1]) < 1e-4,
          "end view must show the actual floor height on each face");
      }
      const near = end[i ? 2 : 1], far = end[i ? 1 : 2];
      assert.ok(near[0] > far[0], "the adjacent face must be on the right in each end view");
      const drawnBevel = Math.atan2(Math.abs(near[1] - far[1]), near[0] - far[0]) * 180 / Math.PI;
      assert.ok(Math.abs(drawnBevel - Number(bevel)) < 0.001, "end view must preserve the actual bevel angle");
      const [, value, edge] = body.match(new RegExp(
        `<g data-far-bevel-edge="${face}" data-value="([^"]+)">([\\s\\S]*?)<\\/g>`,
      ));
      assert.equal(Number(value), cut.profiles[1 - i][0][1]);
      const [, x1, y1, x2, y2] = edge.match(
        /<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)" class="hidden-floor"/,
      ).map(Number);
      assert.ok(Math.abs(x1 - left) < 1e-4);
      assert.ok(Math.abs((x2 - x1) / scale - cut.profiles[i][1][0]) < 1e-4);
      assert.ok(Math.abs(y1 - far[1]) < 1e-4 && Math.abs(y2 - far[1]) < 1e-4,
        "dotted line must align with the far bevel edge, not the visible floor");
    }
  }
});

test("the tread drawing dimensions match the unnotched arcs and straight chords", () => {
  const description = new Tread({
    width: model.stairWidth, angle: model.steps[0].angle, height: 0,
  }).getManufacturingDescription();
  const arcs = description.outline.filter(edge => edge.type === "arc").sort((a, b) => a.radius - b.radius);
  const expected = new Map([
    ["inner-radius", arcs[0].radius], ["outer-radius", arcs[1].radius],
    ["inner-chord", 2 * arcs[0].radius * Math.sin(Math.abs(arcs[0].sweepRadians) / 2)],
    ["outer-chord", 2 * arcs[1].radius * Math.sin(Math.abs(arcs[1].sweepRadians) / 2)],
    ["radial-width", model.stairWidth],
  ]);
  const body = html.match(/<section\b[^>]*id="tread-layout"[^>]*>([\s\S]*?)<\/section>/)[1];
  const dimensions = new Map([...body.matchAll(
    /<g data-tread-dimension="([^"]+)" data-length="([^"]+)">([\s\S]*?)<\/g>/g,
  )].map(([, key, length, content]) => [key, { length: Number(length), content }]));
  assert.equal(dimensions.size, expected.size);
  const lines = new Map();
  let scale;
  for (const [key, length] of expected) {
    const printed = dimensions.get(key);
    assert.ok(Math.abs(printed.length - length) < 1e-8, key);
    assert.ok(printed.content.includes(`${formatLength(length)} in`), `${key}: sixteenth-inch label`);
    const [, x1, y1, x2, y2] = printed.content.match(
      /<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/,
    );
    const endpoints = [[Number(x1), Number(y1)], [Number(x2), Number(y2)]];
    lines.set(key, endpoints);
    const ratio = Math.hypot(endpoints[1][0] - endpoints[0][0], endpoints[1][1] - endpoints[0][1]) / length;
    scale ??= ratio;
    assert.ok(Math.abs(ratio - scale) < 1e-4, `${key}: dimension line must use the same geometric scale`);
  }
  const center = lines.get("inner-radius")[0];
  assert.deepEqual(center, lines.get("outer-radius")[0], "radii must start at the same center");
  const signedCross = (a, b, origin) =>
    (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0]);
  const radialEdges = description.outline.filter(edge => edge.type === "line");
  const outerChord = lines.get("outer-chord");
  assert.ok(signedCross(outerChord[0], outerChord[1], center) *
    signedCross(radialEdges[0].from, radialEdges[1].to, arcs[0].center) > 0,
  "construction view must rotate, not mirror, the labelled cutting-sheet endpoints");
  for (const side of ["inner", "outer"]) {
    for (const endpoint of lines.get(`${side}-chord`)) {
      assert.ok(Math.abs(Math.hypot(endpoint[0] - center[0], endpoint[1] - center[1]) -
        expected.get(`${side}-radius`) * scale) < 0.001, `${side}: chord must join points on its arc`);
    }
  }
  assert.match(body, /NOT cutting lines or arc lengths/);
  const pages = [...cutsHtml.matchAll(/<section class="page [^"]*" id="([^"]+)"/g)].map(([, id]) => id);
  const assembly = html.match(/<section\b[^>]*id="assembly-1"[^>]*>([\s\S]*?)<\/section>/)[1];
  assert.ok(assembly.includes(`<a href="cuts.html#tread-layout">dimensioned tread layout</a> (cut list, page ${pages.indexOf("tread-layout") + 1})`));
});

test("one combined tread sheet retains the construction drawing, cutting details and all part links", () => {
  const body = cutPages.get("tread-layout");
  assert.equal((body.match(/<svg\b/g) ?? []).length, 1, "keep only the radius-and-chord drawing");
  assert.match(body, /<strong>Make 8:<\/strong>/);
  assert.match(body, /<strong>Stock:<\/strong> 1\/2-inch plywood/);
  assert.match(body, /All cuts square through the thickness/);
  assert.match(body, /Spindle notches deferred/);
  for (const number of [19, 36, 53].map(n => printedPiece(n).number)) {
    const printed = byNumber.get(number);
    assert.ok(body.includes(number));
    assert.ok(body.includes(`id="${printed.cutSheet}"`), "cut-sheet links must land on the combined sheet");
    assert.ok(!cutPages.has(printed.cutSheet), "do not retain a separate tread cut-sheet page");
  }
  const description = new Tread({
    width: model.stairWidth, angle: model.steps[0].angle, height: 0,
  }).getManufacturingDescription();
  assert.ok(body.includes(`${formatLength(description.blank.length)} along grain`));
  assert.ok(body.includes(`${formatLength(description.blank.width)} across grain`));
  const grain = body.match(/<g data-tread-grain="true">([\s\S]*?)<\/g>/)[1];
  const [, x1, y1, x2, y2] = grain.match(
    /<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/,
  ).map(Number);
  assert.equal(x1, x2, "the construction diagram rotates the original grain direction to vertical");
  assert.notEqual(y1, y2);
  assert.match(grain, /GRAIN/);
});

test("printed broad-face cut profiles match actual machined mesh face areas", () => {
  for (const sheet of manifest.cutProfiles) {
    const piece = model.partTree.getNode(byNumber.get(sheet.numbers[0]).id);
    const geometry = piece.part.createStockGeometry();
    for (const [face, y] of [["A", 0], ["B", piece.part.description.stock.thickness]]) {
      let actual = 0;
      for (let i = 0; i < geometry.indices.length; i += 3) {
        const triangle = Array.from(geometry.indices.slice(i, i + 3), index =>
          Array.from(geometry.positions.slice(index * 3, index * 3 + 3)));
        if (triangle.every(point => Math.abs(point[1] - y) < 1e-5)) {
          actual += area(triangle.map(([x, , z]) => [x, z]));
        }
      }
      assert.ok(Math.abs(area(sheet[face]) - actual) < 1e-4,
        `${sheet.numbers.join(", ")} face ${face}: printed ${area(sheet[face])}, mesh ${actual}`);
    }
  }
});

test("connector centers lie on the stated host faces at the printed measured positions", () => {
  assert.equal(manifest.connectors.length, manifest.pieces.filter(part => part.kind === "hardware").length);
  for (const connector of manifest.connectors) {
    const piece = model.partTree.getNode(connector.id);
    const host = model.partTree.getNode(connector.hostId);
    const center = apply(inverseTransform(host.transform), piece.transform.slice(12, 15));
    center.forEach((value, i) => assert.ok(Math.abs(value - connector.center[i]) < 1e-8));
    const d = host.part.description;
    assert.ok(Math.abs(center[1] - (connector.face === "A" ? 0 : d.stock.thickness)) < 1e-5);
    assert.ok(center[0] >= 0 && center[0] <= d.blank.length);
    assert.ok(center[2] >= 0 && center[2] <= d.blank.width);
    assert.ok(Math.abs(connector.heightAboveP -
      (piece.transform[13] - manifest.heightDatum.modelHeight)) < 1e-8);
    const body = html.match(new RegExp(
      `<g data-hardware-callout="true" data-host="${connector.host}" data-hardware-piece="${connector.id}">([\\s\\S]*?)</g>`,
    ))?.[1];
    assert.ok(body, `${connector.id}: missing local mounting callout`);
    assert.ok(body.includes(`On ${connector.host} / face ${connector.face}`));
    assert.ok(body.includes(`${formatLength(center[0])}&quot; from START`));
    assert.ok(body.includes(`${formatLength(center[2])}&quot; from NEAR EDGE`));
  }
});

test("hardware image callouts point to source mounting centers in their hosts' assembly views", () => {
  assert.doesNotMatch(html, /Fit hardware while its faces are accessible|<th>Connector<\/th>|<th>Center above P<\/th>/);
  for (const connector of manifest.connectors) {
    const part = byId.get(connector.id), host = byId.get(connector.hostId);
    const body = html.match(new RegExp(
      `<section\\b[^>]*id="${host.assemblyStep}"[^>]*>([\\s\\S]*?)</section>`,
    ))[1];
    assert.equal(part.assemblyStep, host.assemblyStep, `${part.id}: fit before its host's joints close access`);
    assert.ok(body.includes(`data-piece="${host.id}"`), `${part.id}: show the assembled host`);
    assert.ok(body.includes(`data-mounted-hardware="${part.id}"`),
      `${part.id}: draw the actual connector on its host as well as the enlarged image`);
    const callout = body.match(new RegExp(
      `<g data-hardware-callout="true" data-host="${connector.host}" data-hardware-piece="${part.id}">([\\s\\S]*?)</g>`,
    ))?.[1];
    assert.ok(callout, `${part.id}: image belongs inside the host assembly SVG`);
    const type = model.partTree.getNode(part.id).getDescription().productName;
    const illustration = callout.match(new RegExp(`<g data-hardware-type="${type}">([\\s\\S]*)`))?.[1];
    assert.ok(illustration, `${part.id}: recognizable ${type} illustration`);
    const faces = [...illustration.matchAll(/<path d="([^"]+)"[^>]+fill-rule="evenodd"/g)];
    assert.ok(faces.length > 3, `${type}: show thickness and shaped surfaces`);
    assert.ok(faces.some(([, path]) => (path.match(/M/g) ?? []).length >= 4),
      `${type}: show the bore and two mounting holes/slots, not a solid silhouette`);
    const label = callout.match(/<text\b[^>]*>([^<]+)<\/text>/)[1];
    assert.equal(label, model.partTree.getNode(part.id).name);
    assert.equal(connector.name, label);
    assert.doesNotMatch(label, /P-\d+/);
    assert.doesNotMatch(callout, /id="part-P-/);
    const circle = callout.match(/<circle cx="([^"]+)" cy="([^"]+)"/);
    const leader = callout.match(/<line x1="([^"]+)" y1="([^"]+)"/);
    assert.deepEqual(circle.slice(1, 3), leader.slice(1, 3), `${part.id}: leader meets the mounting marker`);
    const diagram = body.match(/<svg\b[\s\S]*?<\/svg>/)[0];
    const sceneIds = [...new Set([...diagram.matchAll(/data-piece="([^"]+)"/g)].map(([, id]) => id))];
    const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
    const camera = p => [dot(manifest.assemblyView.right, p), -dot(manifest.assemblyView.up, p)];
    const points = sceneIds.flatMap(id => {
      const piece = model.partTree.getNode(id), positions = piece.part.createGeometry().positions;
      return Array.from({ length: positions.length / 3 }, (_, i) =>
        camera(apply(piece.transform, Array.from(positions.slice(i * 3, i * 3 + 3)))));
    });
    const min = [0, 1].map(a => Math.min(...points.map(p => p[a])));
    const max = [0, 1].map(a => Math.max(...points.map(p => p[a])));
    const height = Number(diagram.match(/viewBox="0 0 720 (\d+)"/)[1]);
    const scale = Math.min(600 / (max[0] - min[0]), (height - 45) / (max[1] - min[1]));
    const center = camera(model.partTree.getNode(part.id).transform.slice(12, 15));
    const projected = [(720 - (max[0] - min[0]) * scale) / 2 + (center[0] - min[0]) * scale,
      18 + (center[1] - min[1]) * scale];
    assert.ok(projected.every((value, i) => Math.abs(value - Number(circle[i + 1])) < 0.0001),
      `${part.id}: marker must use the actual hardware transform, not the board center`);
    assert.match(body, /actual purchased hardware to transfer mounting holes/);
    assert.match(body, /Confirm flange thread pitch/);
  }
  assert.equal((html.match(/data-hardware-callout=/g) ?? []).length, manifest.connectors.length,
    "show each connector once, alongside its host's first installation");
});

test("the caster-free foundation carries every printed lower block on a cross-piece above the long beams", () => {
  const module = model.modules[1];
  const expected = module.pieces.filter(piece =>
    partVisibilityCategory(piece) === "foundation" && piece.kind !== "hardware");
  assert.deepEqual(manifest.foundation.map(piece => piece.id), expected.map(piece => piece.id));
  for (const [i, piece] of expected.entries()) {
    assert.equal(manifest.foundation[i].sourceSpecification, hash(piece.part.specification));
    assert.equal(manifest.foundation[i].transform, hash(piece.transform));
  }
  const blocks = manifest.pieces.filter(part => /-(?:left|right)(?:Rear)?SupportBlock$/.test(part.id));
  assert.deepEqual(manifest.lowerJoints.map(joint => joint.block).sort(), blocks.map(part => part.number).sort());
  for (const joint of manifest.lowerJoints) {
    const piece = model.partTree.getNode(joint.blockId);
    const post = model.partTree.getNode(joint.postId);
    const crossPiece = model.partTree.getNode(joint.crossPiece);
    const step = model.steps[piece.stepNumber - 1];
    const block = step.parts.bottomFrame.boards[piece.key];
    const upright = step.parts.uprights.boards[post.key];
    const cross = step.parts.bottomFrame.boards[crossPiece.key];
    assert.equal(post.key, piece.key.replace("SupportBlock", "Upright"));
    assert.equal(crossPiece.key, post.key.includes("Rear") ? "rearSupportCrossPiece" : "supportCrossPiece");
    assert.equal(block.bottomHeight, cross.bottomHeight + cross.thickness);
    assert.equal(block.bottomHeight, upright.bottomHeight);
    assert.equal(block.bottomHeight, manifest.heightDatum.modelHeight);
    assert.equal(joint.blockBottom, block.bottomHeight - manifest.heightDatum.modelHeight);
    assert.equal(joint.blockTop, block.bottomHeight + block.width - manifest.heightDatum.modelHeight);
    for (const beam of [module.boards.leftSupportBeam, module.boards.rightSupportBeam]) {
      assert.equal(cross.bottomHeight, beam.bottomHeight + beam.thickness);
    }
    for (const p of block.footprint) {
      assert.ok(cross.footprint.every((a, i, polygon) => {
        const b = polygon[(i + 1) % polygon.length];
        return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= -1e-8;
      }), `${joint.block}: entire bottom must be supported by its cross-piece`);
    }
    const rear = post.key.includes("Rear");
    assert.deepEqual(rear ? block.footprint.slice(2).reverse() : block.footprint.slice(0, 2),
      rear ? upright.footprint.slice(0, 2) : upright.footprint.slice(2).reverse());
  }
});

test("square-cut sheets retain fractional blank lengths and named owning steps", () => {
  for (const printed of manifest.pieces.filter(piece => piece.kind !== "hardware")) {
    const row = squareCutEntries.get(printed.cutSheet);
    if (!row) continue;
    const piece = model.partTree.getNode(printed.id);
    assert.ok(row.includes(`${formatLength(piece.getDescription().blank.length)}&Prime;`), printed.number);
    assert.ok(row.includes(`Step ${printed.step}, ${piece.name}`), printed.number);
  }
  assert.doesNotMatch(html, /\b\d+\/32\b/);
});

test("all frames and uprights assemble off-base before lower blocks are fitted to the foundation", () => {
  const operations = new Map([...html.matchAll(
    /<section\b[^>]*\bid="(assembly-\d+)"[^>]*>([\s\S]*?)<\/section>/g,
  )].map(([, id, body]) => [id, body]));
  const order = id => [...operations.keys()].indexOf(id);
  const lowerParts = manifest.lowerJoints.map(joint => byId.get(joint.blockId));
  const firstLowerAttachment = Math.min(...lowerParts.map(part => order(part.assemblyStep)));
  const structuralNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 13, 14,
    28, 29, 30, 31, 42, 43, 44, 45, 46, 47, 48];
  for (const n of structuralNumbers) {
    const part = printedPiece(n);
    assert.ok(order(part.assemblyStep) >= 0);
    assert.ok(order(part.assemblyStep) < firstLowerAttachment, part.number);
    assert.ok(operations.get("assembly-6").includes(`data-piece="${part.id}"`),
      `${part.number}: missing from the dry-seated complete carcass`);
  }
  for (const [id, body] of operations) {
    if (order(id) < order("assembly-6")) {
      for (const part of manifest.foundation) {
        assert.ok(!body.includes(`data-piece="${part.id}"`), `${id}: foundation shown before transfer`);
      }
      for (const part of lowerParts) {
        assert.ok(!body.includes(`data-piece="${part.id}"`), `${id}: lower block fitted too early`);
      }
    }
  }
  assert.match(operations.get("assembly-5"), /brace.*extends 1 1\/2 BELOW/);
  const finalAttachment = operations.get(lowerParts[0].assemblyStep);
  assert.match(finalAttachment, /Dry-seat to trace the blocks, then lift clear/);
  assert.match(finalAttachment, /underneath the BARE foundation/);
  assert.match(finalAttachment, /BEFORE fastening any upright bottom/);
  for (const part of lowerParts) {
    assert.equal(part.assemblyStep, "assembly-6");
    assert.match(finalAttachment, new RegExp(`<path data-piece="${part.id}"[^>]+class="new-triangle"`));
  }
  for (const n of [18, 19, 24, 35, 36, 52, 53]) {
    assert.ok(order(printedPiece(n).assemblyStep) > firstLowerAttachment);
  }
});

test("shared right-front posts are installed with the preceding frame's rear support", () => {
  const operations = new Map([...html.matchAll(
    /<section\b[^>]*\bid="(assembly-\d+)"[^>]*>([\s\S]*?)<\/section>/g,
  )].map(([, id, body]) => [id, body]));
  for (const [stepIndex, supportNumber, postNumber, operation] of [
    [3, 12, 6, 3], [4, 29, 7, 4],
  ]) {
    const printed = printedPiece(postNumber);
    const support = printedPiece(supportNumber);
    assert.equal(printed.assemblyStep, `assembly-${operation}`, printed.number);
    for (const [number, expectedClass] of [[operation, "new-triangle"], [operation + 1, "old-triangle"]]) {
      const body = operations.get(`assembly-${number}`);
      const diagram = body.match(/<svg\b[\s\S]*?<\/svg>/)[0];
      const faces = [...diagram.matchAll(/<path data-piece="([^"]+)"[^>]* class="([^"]+)"/g)]
        .filter(([, id]) => id === printed.id);
      assert.ok(faces.length > 0, `${printed.number}: missing from assembly ${number}`);
      assert.ok(faces.every(([, , cls]) => cls === expectedClass),
        `${printed.number}: distinguish new installation from existing support`);
      assert.ok(body.includes(`data-plan-piece="${printed.id}"`), printed.number);
    }
    const body = operations.get(`assembly-${operation}`);
    assert.ok(body.includes(`data-plan-piece="${support.id}"`),
      `${support.number}: show the rear support beside its shared post`);
    const previous = operations.get(`assembly-${operation - 1}`).match(/<svg\b[\s\S]*?<\/svg>/)[0];
    assert.ok(!previous.includes(`data-piece="${printed.id}"`), `${printed.number}: not installed earlier`);
    const rear = model.steps[stepIndex].parts.topFrame.boards.northCrossPiece;
    const next = model.steps[stepIndex + 1];
    const post = next.parts.uprights.boards.rightUpright;
    const [a, b] = [rear.footprint[3], rear.footprint[2]];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (const [x, y] of post.footprint.slice(0, 2)) {
      const point = [Math.cos(next.angle) * (x + model.innerRadius) - Math.sin(next.angle) * y - model.innerRadius,
        Math.sin(next.angle) * (x + model.innerRadius) + Math.cos(next.angle) * y];
      const distance = ((point[0] - a[0]) * (b[1] - a[1]) -
        (point[1] - a[1]) * (b[0] - a[0])) / length;
      const along = ((point[0] - a[0]) * (b[0] - a[0]) +
        (point[1] - a[1]) * (b[1] - a[1])) / length;
      assert.ok(Math.abs(distance) < 1e-8, `${support.number}: must contact the post face`);
      assert.ok(along >= 0 && along <= length, `${support.number}: must span the full post width`);
    }
    assert.ok(rear.bottomHeight >= post.bottomHeight);
    assert.ok(rear.bottomHeight + rear.width <= post.bottomHeight + post.length);
  }
  assert.doesNotMatch(operations.get("assembly-4"), /Stand right post/);
  assert.doesNotMatch(operations.get("assembly-5"), /Stand right post/);
});

test("the step-4 rear support correctly hides the posts behind it, including the shared right-front post", () => {
  const body = html.match(/<section\b[^>]*id="assembly-4"[^>]*>([\s\S]*?)<\/section>/)[1];
  const diagram = body.match(/<svg\b[\s\S]*?<\/svg>/)[0];
  const paths = [...diagram.matchAll(
    /<path data-piece="([^"]+)" d="([^"]+)"[^>]*\/><path d="([^"]+)" class="([^"]+)"/g,
  )].map(([, id, d, edges, cls]) => ({
    id, loops: [...d.matchAll(/M([^Z]+)Z/g)].map(([, loop]) => svgPoints(loop)),
    edges: [...edges.matchAll(/M([^M]+)/g)].map(([, edge]) => svgPoints(edge)),
    stroke: cls === "new-edge" ? 0.7 : 0.5,
  }));
  const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
  const camera = p => [dot(manifest.assemblyView.right, p), -dot(manifest.assemblyView.up, p)];
  const meshes = [...new Set(paths.map(p => p.id))].map(id => {
    const piece = model.partTree.getNode(id), geometry = piece.part.createGeometry();
    const points = Array.from({ length: geometry.positions.length / 3 }, (_, i) =>
      apply(piece.transform, Array.from(geometry.positions.slice(i * 3, i * 3 + 3))));
    return { id, geometry, points };
  });
  const points = meshes.flatMap(mesh => mesh.points.map(camera));
  const min = [0, 1].map(a => Math.min(...points.map(p => p[a])));
  const max = [0, 1].map(a => Math.max(...points.map(p => p[a])));
  const height = Number(diagram.match(/viewBox="0 0 720 (\d+)"/)[1]);
  const scale = Math.min(600 / (max[0] - min[0]), (height - 45) / (max[1] - min[1]));
  const project = p => {
    const c = camera(p);
    return [(720 - (max[0] - min[0]) * scale) / 2 + (c[0] - min[0]) * scale,
      18 + (c[1] - min[1]) * scale, dot(manifest.assemblyView.towardViewer, p)];
  };
  const rear = printedPiece(12).id;
  const posts = [7, 2].map(n => printedPiece(n).id);
  const triangles = new Map(meshes.filter(mesh => [rear, ...posts].includes(mesh.id)).map(mesh => {
    const projected = mesh.points.map(project), triangles = [];
    for (let i = 0; i < mesh.geometry.indices.length; i += 3) {
      triangles.push(Array.from(mesh.geometry.indices.slice(i, i + 3), j => projected[j]));
    }
    return [mesh.id, triangles];
  }));
  const depthAt = (id, x, y) => Math.max(...triangles.get(id).map(([a, b, c]) => {
    const denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(denominator) < 1e-8) return -Infinity;
    const u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / denominator;
    const v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / denominator;
    return u > 1e-5 && v > 1e-5 && u + v < 1 - 1e-5 ? u * a[2] + v * b[2] + (1 - u - v) * c[2] : -Infinity;
  }));
  const contains = (loops, x, y) => loops.reduce((inside, loop) => {
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
      const a = loop[i], b = loop[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }, false);
  const onEdge = (path, x, y) => path.edges.some(([a, b]) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / lengthSquared)) : 0;
    return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy) < path.stroke / 2;
  });
  const region = paths.filter(p => p.id === rear).flatMap(p => p.loops.flat());
  for (const post of posts) {
    let checked = 0;
    for (let x = Math.min(...region.map(p => p[0])) + 0.3; x < Math.max(...region.map(p => p[0])); x += 0.3) {
      for (let y = Math.min(...region.map(p => p[1])) + 0.3; y < Math.max(...region.map(p => p[1])); y += 0.3) {
        const rearDepth = depthAt(rear, x, y), postDepth = depthAt(post, x, y);
        if (!Number.isFinite(rearDepth) || !Number.isFinite(postDepth) || rearDepth <= postDepth + 1e-4) continue;
        const covering = paths.filter(p => [rear, post].includes(p.id) && (contains(p.loops, x, y) || onEdge(p, x, y)));
        assert.equal(covering.at(-1)?.id, rear, `The step-4 rear support must hide ${post} at ${x}, ${y}`);
        checked++;
      }
    }
    assert.ok(checked > 0, "exercise an actual projected overlap, not just face-list order");
  }
});

test("every assembly and placement callout follows its part number with the source part name", () => {
  const pages = [...html.matchAll(/<section\b[^>]*id="(assembly-\d+)"[^>]*>([\s\S]*?)<\/section>/g)];
  let checked = 0;
  for (const [, page, body] of pages) {
    for (const [diagram] of body.matchAll(/<svg\b[\s\S]*?<\/svg>/g)) {
      const callouts = [...diagram.matchAll(/<g data-callout-piece="([^"]+)">([\s\S]*?)<\/g>/g)];
      const labelledIds = diagram.includes("data-plan-piece")
        ? [...diagram.matchAll(/data-plan-piece="([^"]+)"/g)].map(([, id]) => id)
        : [...diagram.matchAll(/<path data-piece="([^"]+)"[^>]*class="new-triangle"/g)].map(([, id]) => id);
      assert.deepEqual(new Set(callouts.map(([, id]) => id)), new Set(labelledIds), page);
      for (const [, id, label] of callouts) {
        const piece = model.partTree.getNode(id);
        const part = manifest.pieces.find(p => p.id === id);
        const number = part.number;
        const name = label.match(/<tspan class="callout-name"[^>]*> ([^<]+)<\/tspan>/);
        assert.ok(name, `${page}: missing small-print name`);
        assert.equal(name[1], piece.name, `${page}: use the existing part name`);
        assert.ok(label.includes(`>${number}<tspan`), `${page}: number must precede the name`);
        const leader = label.match(/<line[^>]+x2="([^"]+)" y2="([^"]+)"/);
        const text = label.match(/<text x="([^"]+)" y="([^"]+)"[^>]+text-anchor="([^"]+)"/);
        const left = text[3] === "end";
        assert.ok(left || text[3] === "start", `${page}: anchor the label at its leader-facing edge`);
        assert.equal(Number(leader[1]) - Number(text[1]), left ? 4 : -4,
          `${page}: leader must end beside the label, regardless of text width`);
        assert.ok(Math.abs(Number(leader[2]) - Number(text[2]) + 4) < 0.0001,
          `${page}: leader must meet the label's vertical center`);
        checked++;
      }
    }
  }
  assert.ok(checked > 50, "cover both assembly views and their placement plans");
  assert.match(html, /svg \.callout-name\{font-size:10px;font-weight:normal\}/);
});

test("the long left rail is drawn above its rear bearing, which is fitted only after raising the frame", () => {
  const rail = printedPiece(14), member = printedPiece(48);
  const bounds = printed => {
    const piece = model.partTree.getNode(printed.id);
    const positions = piece.part.createGeometry().positions;
    const heights = Array.from({ length: positions.length / 3 }, (_, i) =>
      apply(piece.transform, Array.from(positions.slice(i * 3, i * 3 + 3)))[1]);
    return { bottom: Math.min(...heights), top: Math.max(...heights) };
  };
  const railBounds = bounds(rail), memberBounds = bounds(member);
  assert.ok(Math.abs(railBounds.bottom - memberBounds.top) < 1e-5,
    "rail bottom must bear at the rear cross-member top");
  const assembly4 = html.match(/<section\b[^>]*id="assembly-3"[^>]*>([\s\S]*?)<\/section>/)[1];
  const diagrams = [...assembly4.matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map(([svg]) => svg);
  const plan = diagrams.find(svg => svg.includes("data-plan-piece"));
  assert.equal(diagrams.length, 2, "keep only the assembly and placement diagrams");
  assert.ok(diagrams[0].includes(`data-piece="${member.id}"`), "retain the rear bearing in the assembly view");
  assert.doesNotMatch(assembly4, /data-bearing-part|SIDE VIEW \(schematic\)/);
  const memberIndex = plan.indexOf(`data-plan-piece="${member.id}"`);
  const railIndex = plan.indexOf(`data-plan-piece="${rail.id}"`);
  assert.ok(memberIndex >= 0 && railIndex > memberIndex,
    "top-view rail must be painted over the lower cross-member");
  const assembly3 = html.match(/<section\b[^>]*id="assembly-2"[^>]*>([\s\S]*?)<\/section>/)[1];
  assert.ok(!assembly3.includes(`data-piece="${member.id}"`),
    "cross-member must not be shown attached during floor-level frame assembly");
  assert.doesNotMatch(assembly4, /<ol\b|<li\b/, "the assembly and layout diagrams replace Step 4's numbered instructions");
  assert.ok(assembly4.includes(`Fit ${member.number} AFTER raising the frame`));
  assert.match(assembly4, /retain supports and diagonal bracing/);
  assert.doesNotMatch(html, /assembly-3-continued|Fit the rear bearing; brace the bottom frame/);
});

test("the assembly view is unmirrored, upright and shows the downhill face of the bottom frame", () => {
  const { right, up, towardViewer } = manifest.assemblyView;
  const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
  const cross = [right[1] * up[2] - right[2] * up[1],
    right[2] * up[0] - right[0] * up[2], right[0] * up[1] - right[1] * up[0]];
  assert.ok(dot(cross, towardViewer) > 0, "screen right/up must agree with face visibility");
  assert.ok(towardViewer[0] < 0 && towardViewer[1] > 0 && towardViewer[2] > 0,
    "view must be above the front/inner side, not below or behind");
  assert.ok(up[1] > 0, "uprights must point up");
  const body = html.match(/<section\b[^>]*id="assembly-3"[^>]*>([\s\S]*?)<\/section>/)[1];
  const diagram = body.match(/<svg\b[\s\S]*?<\/svg>/)[0];
  const height = Number(diagram.match(/viewBox="0 0 720 (\d+)"/)[1]);
  const camera = point => [dot(right, point), -dot(up, point)];
  const scene = [1, 4, 5, 6, 8, 11, 12, 13, 14, 48].map(n =>
    model.partTree.getNode(printedPiece(n).id));
  const points = scene.flatMap(piece => {
    const positions = piece.part.createGeometry().positions;
    return Array.from({ length: positions.length / 3 }, (_, i) =>
      camera(apply(piece.transform, Array.from(positions.slice(i * 3, i * 3 + 3)))));
  });
  const min = [0, 1].map(a => Math.min(...points.map(point => point[a])));
  const max = [0, 1].map(a => Math.max(...points.map(point => point[a])));
  const scale = Math.min(600 / (max[0] - min[0]), (height - 45) / (max[1] - min[1]));
  const project = point => {
    const p = camera(point);
    return [(720 - (max[0] - min[0]) * scale) / 2 + (p[0] - min[0]) * scale,
      18 + (p[1] - min[1]) * scale];
  };
  const front = scene.find(piece => piece.id === printedPiece(11).id);
  const positions = front.part.createGeometry().positions;
  const bottomEdge = Array.from({ length: positions.length / 3 }, (_, i) =>
    Array.from(positions.slice(i * 3, i * 3 + 3)))
    .filter(([, y, z]) => Math.abs(y) < 1e-5 && Math.abs(z) < 1e-5)
    .sort((a, b) => a[0] - b[0]);
  assert.ok(bottomEdge.length >= 2);
  const corners = [bottomEdge[0], bottomEdge.at(-1)].map(p => project(apply(front.transform, p)));
  const frontFaces = [...diagram.matchAll(/<path data-piece="([^"]+)" d="([^"]+)"/g)]
    .filter(([, id]) => id === front.id)
    .map(([, , d]) => [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)]
      .map(([, x, y]) => [Number(x), Number(y)]));
  assert.ok(frontFaces.some(face => corners.every(corner =>
    face.some(point => Math.hypot(point[0] - corner[0], point[1] - corner[1]) < 0.001))),
  "the visible front face must contain both ends of its downhill bottom edge");
  const rail = printedPiece(14);
  assert.ok(diagram.includes(`data-piece="${rail.id}"`) && diagram.includes(`>${rail.number}<tspan`));
  assert.match(diagram, /VIEW FROM FRONT \/ INNER \(DOWNHILL-LEFT\)/);
});

test("the bottom-frame exploded view separates all four boards and guides three laps plus the butt joint", () => {
  const body = html.match(/<section\b[^>]*id="assembly-2"[^>]*>([\s\S]*?)<\/section>/)[1];
  const diagram = body.match(/<svg\b[\s\S]*?<\/svg>/)[0];
  const bounds = [11, 12, 13, 14].map(n => {
    const id = printedPiece(n).id;
    const faces = [...diagram.matchAll(/<path data-piece="([^"]+)" d="([^"]+)"/g)]
      .filter(([, piece]) => piece === id);
    assert.ok(faces.length > 0, `${id}: missing board`);
    const points = faces.flatMap(([, , d]) => {
      const coordinates = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map(([value]) => Number(value));
      return coordinates.filter((_, i) => i % 2 === 0).map((x, i) => [x, coordinates[i * 2 + 1]]);
    });
    return { n, points, min: [0, 1].map(a => Math.min(...points.map(p => p[a]))),
      max: [0, 1].map(a => Math.max(...points.map(p => p[a]))) };
  });
  const offsets = manifest.assemblyExplosions["assembly-2"];
  const { right, up } = manifest.assemblyView;
  const camera = point => [0, 1].map(a =>
    point.reduce((sum, v, i) => sum + v * (a ? -up[i] : right[i]), 0));
  const sourcePoints = bounds.map(({ n }) => {
    assert.equal(offsets[n][1], 0, `${printedPiece(n).number}: explode horizontally without changing board height`);
    const piece = model.partTree.getNode(printedPiece(n).id);
    const { positions } = piece.part.createGeometry();
    return Array.from({ length: positions.length / 3 }, (_, i) =>
      camera(apply(piece.transform, Array.from(positions.slice(i * 3, i * 3 + 3)))
        .map((v, axis) => v + offsets[n][axis])));
  });
  const allPoints = sourcePoints.flat();
  const min = [0, 1].map(a => Math.min(...allPoints.map(p => p[a])));
  const max = [0, 1].map(a => Math.max(...allPoints.map(p => p[a])));
  const height = Number(diagram.match(/viewBox="0 0 720 (\d+)"/)[1]);
  const top = 88;
  const scale = Math.min(600 / (max[0] - min[0]), (height - top - 27) / (max[1] - min[1]));
  for (const [i, board] of bounds.entries()) {
    const projected = sourcePoints[i].map(p => [
      (720 - (max[0] - min[0]) * scale) / 2 + (p[0] - min[0]) * scale,
      top + (p[1] - min[1]) * scale,
    ]);
    assert.ok(board.points.every(p =>
      projected.some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.001)),
    `${printedPiece(board.n).number}: drawn vertices must preserve the board's actual height`);
  }
  const labels = [...diagram.matchAll(/<g data-callout-piece="[^"]+">[\s\S]*?<text x="[^"]+" y="([^"]+)"/g)];
  assert.ok(Math.min(...bounds.map(b => b.min[1])) > Math.max(...labels.map(([, y]) => Number(y))) + 12,
    "reserve a clear label band above the enlarged exploded frame");
  for (const [i, a] of bounds.entries()) {
    for (const b of bounds.slice(i + 1)) {
      assert.ok([0, 1].some(axis => a.max[axis] < b.min[axis] || b.max[axis] < a.min[axis]),
        `${a.n} and ${b.n}: projected boards overlap`);
    }
  }
  const board = n => bounds.find(b => b.n === n);
  assert.ok(board(12).max[1] < board(14).min[1],
    "show the rear support above the long left rail, not across its front joint guides");
  assert.ok(board(13).max[1] < board(11).min[1],
    "show the right support above the front support to make an open rectangular frame");
  const joints = [...diagram.matchAll(/<g class="joint-guide" data-joint="([^"]+)" data-kind="([^"]+)">([\s\S]*?)<\/g>/g)];
  assert.deepEqual(joints.map(([, pair, kind]) => [pair, kind]), [
    [`${printedPiece(11).number}:${printedPiece(14).number}`, "half-lap"],
    [`${printedPiece(11).number}:${printedPiece(13).number}`, "half-lap"],
    [`${printedPiece(12).number}:${printedPiece(13).number}`, "half-lap"],
    [`${printedPiece(12).number}:${printedPiece(14).number}`, "butt"],
  ]);
  for (const [, , , guides] of joints) assert.equal([...guides.matchAll(/<line\b/g)].length, 2);
  assert.match(body, /gaps are illustrative, not measurements/);
  assert.match(body, /BUTT joint, not a fourth half-lap/);
  assert.doesNotMatch(body, /<ol\b|<li\b/, "the visuals replace Step 3's numbered instructions");
  assert.match(body, /1\/4&quot; behind tread FRONT/);
  assert.match(body, /1\/8&quot; out from INNER corner/);
});

test("placement diagrams occur in assembly order without a standalone Layouts section", () => {
  const pages = new Map([...html.matchAll(
    /<section class="page [^"]*" id="([^"]+)">([\s\S]*?)<\/section>/g,
  )].map(([, id, body]) => [id, body]));
  for (const id of ["layout", "post-layout", "frame4-layout", "frame56-layout", "backing-layout", "foundation-blocks"]) {
    assert.ok(!pages.has(id), `${id}: remove the standalone page`);
    assert.ok(!html.includes(`href="#${id}"`), `${id}: remove cross-document layout navigation`);
  }
  const plans = [
    ["assembly-2", [11, 12, 13, 14]],
    ["assembly-3", [1, 2, 3, 4, 5, 6, 7, 8, 14, 48]],
    ["assembly-4", [2, 6, 28, 29, 30, 31]],
    ["assembly-5", [3, 4, 7, 8, 42, 43, 44, 45, 46, 47]],
    ["assembly-6", manifest.lowerJoints.flatMap(j => [j.postId, j.blockId])
      .map(id => manifest.pieces.findIndex(piece => piece.id === id) + 1)],
    ["assembly-7", [15, 16, 17, 32, 33, 34, 49, 50, 51]],
  ];
  for (const [id, numbers] of plans) {
    for (const n of numbers) {
      const piece = printedPiece(n);
      assert.ok(pages.get(id).includes(`data-plan-piece="${piece.id}"`), `${id}: include ${piece.number}'s plan`);
    }
  }
  const order = [...pages.keys()];
  assert.equal(order[order.indexOf("assembly-3") + 1], "assembly-4");
  assert.match(pages.get("assembly-1"), /actual treads as temporary placement patterns/);
  assert.match(pages.get("assembly-6"), /REMOVE ALL THREE TREADS/);
});

test("assembly is a visual eight-section sequence with contextual hardware and foundation attachment consolidated", () => {
  const operations = [...html.matchAll(
    /<section\b[^>]*\bid="(assembly-\d+)"[^>]*>([\s\S]*?)<\/section>/g,
  )].map(([, id, body]) => ({ id, body }));
  assert.deepEqual(operations.map(op => op.id), Array.from({ length: 8 }, (_, i) => `assembly-${i + 1}`));
  for (const { id, body } of operations) {
    assert.doesNotMatch(body, /<ol\b|<li\b/, `${id}: diagrams replace numbered procedures`);
    assert.match(body, /<svg\b/, `${id}: retain a visual assembly reference`);
  }
  assert.match(operations[4].body, /<h1>5\. Complete the step-6 frame <a class="model-link"/);
  assert.match(operations[5].body, /<h1>6\. Attach steps to foundation <a class="model-link"/);
  assert.match(operations[5].body, /Upright and lower block seated on the cross-piece/);
  assert.match(operations[6].body, /<h1>7\. Add spindle backing/);
  assert.match(operations[7].body, /<h1>8\. Close the risers/);
  for (const n of [15, 16, 17, 32, 33, 34, 49, 50, 51]) {
    assert.equal(printedPiece(n).assemblyStep, "assembly-7");
  }
});

test("visible instructions omit coordinate tables, axis notation and paper-pattern procedures", () => {
  const visible = html.replace(/<script\b[\s\S]*?<\/script>/g, "").replace(/<[^>]*>/g, " ");
  assert.doesNotMatch(visible, /\b[XYZ]\b|\(\s*u\s*,\s*v\s*\)|\b[ABCD]\s*\(u,\s*v\)/);
  assert.doesNotMatch(visible, /paper|tracing|marking windows|CROSS-PIECE FRONT/i);
  assert.doesNotMatch(html, /<th>[ABCD](?: \(u, v\))?<\/th>/);
});

test("rear-post placement uses measured setbacks along the actual tread edge", () => {
  const body = html.match(/<section\b[^>]*id="assembly-3"[^>]*>([\s\S]*?)<\/section>/)[1];
  const tread = new Tread({ width: model.stairWidth, angle: model.steps[0].angle, height: 0 });
  const edge = tread.outline.filter(e => e.type === "line")[1];
  const ends = [edge.from, edge.to].map(([x, z]) => {
    const p = apply(tread.getPlacement(), [x, 0, z]);
    return [p[0], -p[2]];
  });
  for (const [n, end, corner] of [[4, 0, 3], [8, 1, 2]]) {
    const piece = model.partTree.getNode(printedPiece(n).id);
    const post = model.steps[5].parts.uprights.boards[piece.key];
    for (const p of post.footprint.slice(2)) {
      const cross = (p[0] - ends[0][0]) * (ends[1][1] - ends[0][1]) -
        (p[1] - ends[0][1]) * (ends[1][0] - ends[0][0]);
      assert.ok(Math.abs(cross) < 1e-8, "rear face must actually follow the tread edge");
    }
    const expected = Math.hypot(...post.footprint[corner].map((v, i) => v - ends[end][i]));
    const annotation = body.match(new RegExp(
      `<span data-post-setback="${printedPiece(n).number}" data-post-piece="${printedPiece(n).id}" data-value="([^"]+)">([^<]+)</span>`,
    ));
    assert.ok(Math.abs(Number(annotation[1]) - expected) < 1e-8);
    assert.equal(annotation[2], `${formatLength(expected)}&Prime;`);
  }
});

test("assembly and the shared cut list are separate printable documents with correct page numbers", () => {
  assert.doesNotMatch(assemblyHtml, /id="square-cuts"|class="page cut-sheet"/);
  assert.doesNotMatch(assemblyHtml, /id="review"|href="#review"|Review checklist|fastening worksheet/i);
  assert.doesNotMatch(cutsHtml, /id="assembly-\d+"|id="review"/);
  assert.match(cutsHtml, /Shared staircase cut list/);
  for (const [filename, body] of documents) {
    const footers = [...body.matchAll(/<footer>[\s\S]*?<span>(\d+)<\/span><\/footer>/g)];
    assert.deepEqual(footers.map(([, number]) => Number(number)),
      Array.from({ length: footers.length }, (_, i) => i + 1), filename);
    assert.ok(footers.length > 0, `${filename}: preserve printable pages`);
  }
  for (const part of manifest.pieces.filter(part => part.kind !== "hardware")) {
    const anchor = `id="part-${part.number}"`;
    assert.ok(cutsHtml.includes(anchor), `${part.number}: belongs in the shared cut list`);
    assert.ok(!assemblyHtml.includes(anchor), `${part.number}: do not duplicate cutting entries in assembly`);
  }
  assert.match(assemblyHtml, /href="cuts\.html#part-P-\d+"/);
});

test("every module section highlights only the emphasized assembly pieces, not pale context or placement guides", () => {
  const base = ["foundation", "uprights", "step-framing"];
  for (const moduleNumber of [1, 2, 3]) {
    const body = documents.get(`module${moduleNumber}.html`);
    const sections = [...body.matchAll(/<section class="page [^"]*" id="([^"]+)">([\s\S]*?)<\/section>/g)];
    assert.equal(sections.length, 9);
    for (const [, sectionId, section] of sections) {
      const label = `module ${moduleNumber}, ${sectionId}`;
      const link = section.match(/<h1>[\s\S]*?<a class="model-link" href="([^"]+)"[^>]*>\(3D\)<\/a><\/h1>/);
      assert.ok(link, `${label}: section heading has a 3D link`);
      const url = new URL(link[1].replaceAll("&amp;", "&"), "https://example.test/stairs/");
      assert.equal(url.pathname, "/stairs/model.html");
      assert.equal(url.searchParams.get("module"), String(moduleNumber));
      assert.equal(url.searchParams.has("part"), false);
      const ids = (url.searchParams.get("highlight") ?? "").split(" ").filter(Boolean);
      assert.equal(new Set(ids).size, ids.length);
      const diagrams = [...section.matchAll(/data-illustrated-pieces="([^"]*)"/g)];
      assert.ok(diagrams.length, `${label}: illustrated piece identities are recorded`);
      const illustrated = new Set(diagrams.flatMap(([, ids]) => ids.split(" ").filter(Boolean)));
      const faces = [...section.matchAll(/<path\b([^>]*)>/g)];
      const emphasized = new Set(faces.filter(([, attributes]) => /\bclass="new-triangle"/.test(attributes))
        .map(([, attributes]) => attributes.match(/\bdata-piece="([^"]+)"/)[1]));
      assert.deepEqual(new Set(ids), emphasized, `${label}: match only the dark assembly pieces`);
      for (const id of ids) {
        assert.ok(illustrated.has(id), `${label}: highlighted piece appears in the illustration`);
      }
      for (const [, attributes] of faces.filter(([, attributes]) => /\bclass="old-triangle"/.test(attributes))) {
        const id = attributes.match(/\bdata-piece="([^"]+)"/)[1];
        assert.ok(!emphasized.has(id), `${label}: pale supporting piece ${id} is not highlighted`);
      }
      const solidTreads = new Set([...section.matchAll(/data-piece="([^"]+)"/g)]
        .map(([, id]) => id).filter(id => model.partTree.getNode(id).key === "tread"));
      assert.deepEqual(new Set(ids.filter(id => model.partTree.getNode(id).key === "tread")), solidTreads,
        `${label}: highlight treads only when shown as actual pieces`);
      if (sectionId === "assembly-1") {
        assert.deepEqual(ids, [], `${label}: placement-only diagrams have no highlighted pieces`);
        assert.equal(url.searchParams.has("highlight"), false);
      }
      if (sectionId === "assembly-8") assert.equal(solidTreads.size, 3, `${label}: installed treads remain highlighted`);
      const categories = new Set(base);
      for (const id of ids) {
        const piece = model.partTree.getNode(id);
        assert.ok(piece && piece.id.startsWith(`stairway/module-${moduleNumber}/`), `${label}: ${id}`);
        categories.add(partVisibilityCategory(piece));
      }
      assert.deepEqual(new Set(url.searchParams.get("show").split(" ")), categories,
        `${label}: surrounding frame plus only categories required by illustrated pieces`);
      for (const [, attributes] of section.matchAll(/<svg([^>]*)>([\s\S]*?)<\/svg>/g)) {
        if (!attributes.includes("Top view;")) continue;
        const treadIds = attributes.match(/data-illustrated-pieces="([^"]*)"/)[1].split(" ")
          .filter(id => id && model.partTree.getNode(id).key === "tread");
        assert.equal(treadIds.length, 0, `${label}: dotted tread placement guides are excluded`);
      }
    }
  }
});

test("each cutting-part heading links to its visible model occurrence with minimal filters", () => {
  const headings = [...cutsHtml.matchAll(/<h([12])><span id="part-(P-\d+)">([\s\S]*?)<\/h\1>/g)];
  assert.deepEqual(headings.map(([, , number]) => number), manifest.parts.map(part => part.number));
  assert.equal((cutsHtml.match(/class="model-link"/g) ?? []).length, headings.length);
  const base = ["foundation", "uprights", "step-framing"];
  for (const [, , number, heading] of headings) {
    const link = heading.match(/<a class="model-link" href="([^"]+)"[^>]*>\(3D\)<\/a>/);
    assert.ok(link, `${number}: missing 3D link after heading`);
    const url = new URL(link[1].replaceAll("&amp;", "&"), "https://example.test/stairs/cuts.html");
    assert.equal(url.pathname, "/stairs/model.html");
    const part = catalog.parts.find(part => part.number === number);
    const selected = part.locations.find(location => location.id === url.searchParams.get("part"));
    assert.ok(selected, `${number}: selection must be an occurrence of this cutting part`);
    const category = partVisibilityCategory(model.partTree.getNode(selected.id));
    assert.deepEqual(url.searchParams.get("show").split(" "), [...new Set([...base, category])],
      `${number}: enable only the base frame and the selected part's category`);
    if (part.locations.some(location => base.includes(partVisibilityCategory(model.partTree.getNode(location.id))))) {
      assert.ok(base.includes(category), `${number}: prefer an occurrence already visible in the base frame`);
    }
    const modules = new Set(part.locations.map(location => location.moduleNumber));
    assert.equal(url.searchParams.get("module"), modules.size === 1 ? String(selected.moduleNumber) : null,
      `${number}: restrict modules only for parts exclusive to one module`);
    assert.deepEqual([...url.searchParams.keys()].sort(),
      modules.size === 1 ? ["module", "part", "show"] : ["part", "show"]);
  }
});

test("global cutting numbers group every wooden piece once, normalizing only treads and bearing wedges", () => {
  const leaves = model.partTree.getLeaves().filter(piece => piece.kind !== "hardware");
  assert.deepEqual([...catalog.byPiece.keys()].sort(), leaves.map(piece => piece.id).sort());
  assert.equal(new Set(catalog.parts.map(part => part.number)).size, catalog.parts.length);
  assert.equal(catalog.parts.reduce((sum, part) => sum + part.quantity, 0), leaves.length);
  assert.deepEqual(manifest.catalog, catalog.parts.map(part => ({
    number: part.number, specification: hash(part.specification), pieces: part.locations.map(location => location.id),
  })));
  for (const piece of leaves.filter(piece => piece.key !== "tread" && !bearingWedge(piece))) {
    assert.deepEqual(catalog.byPiece.get(piece.id).specification, manufacturingSpecification(piece.getDescription()));
  }
  const treads = leaves.filter(piece => piece.key === "tread");
  assert.equal(new Set(treads.filter(piece => piece.stepNumber !== 1)
    .map(piece => catalog.byPiece.get(piece.id).number)).size, 1);
  const [standard, first] = catalog.parts;
  assert.equal(standard.quantity, 8);
  assert.equal(first.quantity, 1);
  assert.equal(catalog.byPiece.get(treads.find(piece => piece.stepNumber === 1).id), first);
  assert.notDeepEqual(first.specification, standard.specification);
  assert.equal(standard.description.outline.length, 4);
  assert.equal(standard.description.holes?.length ?? 0, 0);
});

test("seven upper-bearing wedges share one feather-edge cutting part without changing installed geometry", () => {
  const source = buildStairway();
  const pieces = source.partTree.getLeaves().filter(piece => piece.key === "frontSpindleBearingShim");
  const before = pieces.map(piece => hash(piece.getDescription()));
  const normalized = createCutPartCatalog(source);
  const wedges = pieces.filter(bearingWedge);
  assert.equal(wedges.length, 7);
  const part = normalized.byPiece.get(wedges[0].id);
  assert.ok(wedges.every(piece => normalized.byPiece.get(piece.id) === part));
  assert.equal(part.quantity, 7);
  assert.deepEqual(part.locations.map(location => location.stepNumber), [3, 4, 5, 6, 7, 8, 9]);
  const surface = part.description.edgeCuts.find(cut => cut.surfaceCut);
  const ends = surface.points.filter(point => Math.abs(point[2]) < 1e-7).sort((a, b) => a[0] - b[0]);
  assert.ok(Math.abs(part.description.blank.thickness - ends[1][1]) < 1e-8, "thin end is a feather edge");
  assert.ok(Math.abs(Math.atan2(ends[1][1] - ends[0][1], ends[1][0] - ends[0][0]) * 180 / Math.PI - 5) < 1e-7);
  for (const point of surface.points) {
    assert.ok(Math.abs(point.reduce((sum, value, axis) => sum + value * surface.plane.normal[axis], 0) -
      surface.plane.offset) < 1e-8, "cutting plane and finished endpoints agree");
  }
  for (const piece of wedges) {
    const original = piece.getDescription();
    assert.deepEqual(part.description.blank, original.blank);
    assert.deepEqual(part.description.stock, original.stock);
    assert.deepEqual(surface.plane.normal, original.edgeCuts.find(cut => cut.surfaceCut).plane.normal);
  }
  assert.deepEqual(pieces.map(piece => hash(piece.getDescription())), before);
  const square = pieces.find(piece => !bearingWedge(piece));
  assert.ok(square, "retain the step-2 square shim");
  assert.notEqual(normalized.byPiece.get(square.id), part);
  const body = cutPages.get(`cut-${Number(part.number.slice(2))}`);
  assert.match(body, /<strong>Make 7:<\/strong>/);
  assert.match(body, /Feather edge/);
  assert.match(body, /No separate blank is needed for this method/);
  assert.doesNotMatch(body, /&lt; 1\/16/);
  assert.deepEqual([...body.matchAll(/data-used-piece="([^"]+)"/g)].map(([, id]) => id),
    part.locations.map(location => location.id));
});

test("each cutting part counts only pieces still to make and lists every use, marking assembled foundations", () => {
  const published = manifest.parts;
  assert.equal(new Set(published.map(part => part.number)).size, published.length);
  const assemblyDocuments = [...documents].filter(([filename]) => filename !== "cuts.html").map(([filename, body]) => ({
    filename, pages: [...body.matchAll(/<section class="page [^"]*" id="([^"]+)"/g)].map(([, id]) => id),
    pieces: JSON.parse(body.match(/<script type="application\/json" id="instruction-manifest">([^<]+)<\/script>/)[1]).pieces,
  }));
  for (const part of published) {
    const body = squareCutEntries.get(part.cutSheet) ??
      [...cutPages.values()].find(body => body.includes(`id="part-${part.number}"`));
    const expected = catalog.parts.find(entry => entry.number === part.number);
    const assembled = expected.locations.filter(location => location.moduleNumber > 1 &&
      partVisibilityCategory(model.partTree.getNode(location.id)) === "foundation");
    const make = Number(body.match(/<strong>Make (\d+):<\/strong>/)[1]);
    assert.equal(make, expected.quantity - assembled.length, part.number);
    assert.match(body, /<div class="used-in"><p><strong>Make \d+:<\/strong><\/p><ul>/);
    const titleEnd = body.search(/<\/h[12]>/);
    const countStart = body.indexOf('<div class="used-in">');
    const listEnd = body.indexOf("</ul></div>");
    const stockStart = body.indexOf("<strong>Stock:</strong>");
    assert.ok(titleEnd >= 0 && titleEnd < countStart && countStart < listEnd && listEnd < stockStart,
      `${part.number}: title, Make count, instances, then stock`);
    const drawingStart = body.indexOf("<svg ");
    if (drawingStart >= 0) assert.ok(stockStart < drawingStart, `${part.number}: stock precedes drawing`);
    assert.doesNotMatch(body, /<h[23]>Used in<\/h[23]>/);
    const uses = [...body.matchAll(/<li data-used-piece="([^"]+)">([\s\S]*?)<\/li>/g)];
    assert.deepEqual(uses.map(([, id]) => id), expected.locations.map(location => location.id), part.number);
    assert.equal(part.quantity, uses.length);
    assert.deepEqual(part.pieces, uses.map(([, id]) => id));
    for (const [, id, use] of uses) {
      const location = expected.locations.find(location => location.id === id);
      assert.ok(use.includes(`Module ${location.moduleNumber}`));
      assert.equal(use.endsWith(" (already assembled)"), assembled.includes(location), id);
      const document = assemblyDocuments.find(document => document.pieces.some(piece => piece.id === id));
      if (document) {
        const printed = document.pieces.find(piece => piece.id === id);
        assert.ok(use.includes(`href="${document.filename}#${printed.assemblyStep}"`));
        assert.ok(use.includes(`(p. ${document.pages.indexOf(printed.assemblyStep) + 1})`));
      } else {
        assert.doesNotMatch(use, /<a\b/);
      }
    }
  }
  assert.doesNotMatch(assemblyHtml.replace(/<script[\s\S]*?<\/script>/g, ""), /M2-\d+/);
});

test("diagram-free cutting entries share pages without splitting a part", () => {
  const sharedPages = [...cutPages.values()].filter(body => body.includes('class="square-cut"'));
  assert.ok(sharedPages.length > 0);
  assert.ok(sharedPages.length < squareCutEntries.size);
  assert.ok(sharedPages.some(body => [...body.matchAll(/<article class="square-cut"/g)].length > 1),
    "Use shared pages for multiple complete parts");
  assert.equal(cutPages.size, manifest.parts.length - squareCutEntries.size + sharedPages.length);
  assert.match(cutsHtml, /\.square-cut\{[^}]*break-inside:avoid;page-break-inside:avoid/);
  for (const body of sharedPages) {
    assert.doesNotMatch(body, /<svg\b/);
    const entries = [...body.matchAll(/<article class="square-cut" id="([^"]+)">([\s\S]*?)<\/article>/g)];
    for (const [entry, id, content] of entries) {
      const part = manifest.parts.find(part => part.cutSheet === id);
      assert.ok(part, id);
      assert.ok(content.includes(`id="part-${part.number}"`));
      assert.equal([...content.matchAll(/data-used-piece=/g)].length, part.quantity);
      assert.equal(cutsHtml.split(entry).length - 1, 1, `${id}: keep the entire part together once`);
    }
  }
});

test("cutting numbers follow printed order with consecutive square-cut parts immediately after treads", () => {
  const numbers = [...cutsHtml.matchAll(/id="part-P-(\d+)"/g)].map(([, number]) => Number(number));
  assert.deepEqual(numbers, Array.from({ length: numbers.length }, (_, i) => i + 1));
  const squares = [...squareCutEntries.values()].map(body =>
    Number(body.match(/id="part-P-(\d+)"/)[1]));
  assert.deepEqual(squares, Array.from({ length: squares.length }, (_, i) => i + 3));
  const pages = [...cutPages.values()];
  assert.ok(pages.slice(2, 2 + pages.filter(body => body.includes('class="square-cut"')).length)
    .every(body => body.includes('class="square-cut"')), "No illustrated parts interrupt the square-cut pages");
  for (const number of squares) {
    const part = catalog.parts[number - 1], d = part.description;
    assert.ok(!d.outline && !d.widthTrim && !d.notches.length && !d.dados.length &&
      !d.edgeNotches.length && d.edgeCuts.every(cut => cut.angleFromSquare < 1e-6));
  }
  assert.deepEqual(catalog.parts.map(part => Number(part.number.slice(2))),
    Array.from({ length: catalog.parts.length }, (_, i) => i + 1));
});

test("both tread parts lead the cut list and the first-step drawing retains its newel cutout and right rear angle", () => {
  assert.deepEqual([...cutPages.keys()].slice(0, 2), ["tread-layout", "first-tread-layout"]);
  const body = cutPages.get("first-tread-layout");
  assert.match(body, /<strong>Make 1:<\/strong>/);
  const tread = new Tread({ width: model.stairWidth, angle: model.steps[0].angle, height: 0, extendRightEdge: true });
  const outer = tread.outline[0], rear = tread.outline.at(-1);
  const outerDirection = outer.to.map((value, i) => value - outer.from[i]);
  const rearDirection = rear.to.map((value, i) => value - rear.from[i]);
  const cosine = outerDirection.reduce((sum, value, i) => sum + value * rearDirection[i], 0) /
    (Math.hypot(...outerDirection) * Math.hypot(...rearDirection));
  assert.ok(Math.abs(cosine) < 1e-12, "The straight outer and rear edges must be perpendicular");
  assert.match(body, /straight outer edge is at a right angle \(90&deg;\) to the REAR edge/);
  const uncutArea = area(tessellateOutline(tread.outline, 0.015));
  tread.notchForPost(model.steps[0].parts.newel);
  assert.deepEqual(catalog.parts[1].description.outline, tread.getManufacturingDescription().outline);
  const drawn = body.match(/data-first-tread-profile="true"><path d="([^"]+)"/)[1];
  const expectedArea = area(tessellateOutline(tread.outline, 0.015));
  assert.ok(Math.abs(area(svgPoints(drawn)) / 64 - expectedArea) < 0.001);
  assert.ok(Math.abs(uncutArea - expectedArea - 3.5 * 1.5) < 0.001);
  assert.match(body, /3 1\/2&quot; wide x 1 1\/2&quot; deep/);
  assert.match(body, /straight outer edge/);
});

test("printable documents are self-contained with valid local and cross-document anchors", () => {
  const ids = new Map([...documents].map(([filename, body]) =>
    [filename, [...body.matchAll(/\bid="([^"]+)"/g)].map(match => match[1])]));
  for (const [filename, body] of documents) {
    assert.equal(new Set(ids.get(filename)).size, ids.get(filename).length, filename);
    for (const [, destination, target] of body.matchAll(/href="([^"#]*)#([^"]+)"/g)) {
      const targetFile = destination.replace(/^\.\//, "") || filename;
      assert.ok(ids.get(targetFile)?.includes(target), `${filename}: ${destination}#${target}`);
    }
    assert.doesNotMatch(body, /<(?:script|img|link)\b[^>]*(?:src|href)=/i);
    assert.doesNotMatch(body, /(?:NaN|undefined|Infinity)/);
  }
});
