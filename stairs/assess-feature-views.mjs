import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildStairway } from "./model.js";
import { PartInventory } from "./part-list.js";
import { STOCK_VIEWS, assessPlaneAngle, validateViews } from "./part-angles.js";
export { assessPlaneAngle } from "./part-angles.js";

const EPSILON = 1e-8;
const AXIS_NAMES = ["length", "thickness", "width"];
const AXES = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const dot = (a, b) => a.reduce((sum, value, axis) => sum + value * b[axis], 0);
const subtract = (a, b) => a.map((value, axis) => value - b[axis]);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const degrees = radians => radians * 180 / Math.PI;

function vector(value) {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) {
    throw new TypeError("Expected a finite three-component stock-coordinate vector.");
  }
  return value;
}

function unit(value) {
  const magnitude = Math.hypot(...vector(value));
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    throw new RangeError("A direction or plane normal must have a finite, nonzero magnitude.");
  }
  return value.map(component => component / magnitude);
}

function scalar(value) {
  if (!Number.isFinite(value)) throw new TypeError("A geometric measurement must be finite.");
  return value;
}

function coordinate(property, axis, values, reference, views) {
  return {
    property, kind: "coordinate", units: "inches", axis: "XYZ"[axis],
    values: values.map(scalar), reference, status: "standard",
    preferredViews: views.filter(view => Math.abs(view.direction[axis]) <= EPSILON).map(view => view.name),
    presentation: "dimension-or-section",
  };
}

function outlineMeasurements(points, views) {
  points.forEach(vector);
  return AXES.map((_, axis) => coordinate(`boundary-${"XYZ"[axis]}`, axis,
    [...new Set(points.map(point => point[axis]))].sort((a, b) => a - b),
    `${"XYZ"[axis]}=0 stock datum; vertex associations retained in geometry.points`, views));
}

function polygonPlane(points) {
  if (points.length < 3) throw new RangeError("A surface requires at least three boundary points.");
  points.forEach(vector);
  for (let i = 1; i < points.length - 1; i++) {
    const candidate = cross(subtract(points[i], points[0]), subtract(points[i + 1], points[0]));
    if (Math.hypot(...candidate) <= EPSILON) continue;
    const normal = unit(candidate), offset = dot(normal, points[0]);
    const tolerance = EPSILON * Math.max(1, ...points.map(point => Math.hypot(...point)));
    if (points.some(point => Math.abs(dot(normal, point) - offset) > tolerance)) {
      throw new RangeError("Nonplanar feature boundary: a single cut plane would not describe it.");
    }
    return { normal, offset };
  }
  return null;
}

function cutFeature(id, name, points, axisName, views, metadata = {}, authoredPlane = null, allowCollapsed = false) {
  const plane = polygonPlane(points);
  const measurements = metadata.construction ? [] : outlineMeasurements(points, views);
  const boundary = metadata.construction ? { constructionPoints: points } : { points };
  if (!plane) {
    if (!allowCollapsed) throw new RangeError(`Degenerate cut patch: ${name}.`);
    return {
      id, name, kind: "collapsed-boundary", geometry: boundary, metadata, measurements,
      note: "Zero-area joinery boundary; coordinates are retained, but there is no independent plane angle.",
    };
  }
  if (authoredPlane) {
    const normal = unit(authoredPlane.normal), magnitude = Math.hypot(...authoredPlane.normal);
    const offset = scalar(authoredPlane.offset) / magnitude;
    if (Math.hypot(...cross(normal, plane.normal)) > EPSILON ||
      points.some(point => Math.abs(dot(normal, point) - offset) >
        EPSILON * Math.max(1, Math.hypot(...point)))) {
      throw new RangeError(`Cut outline does not lie on its authored plane: ${name}.`);
    }
    plane.normal = normal;
    plane.offset = offset;
  }
  const axis = AXIS_NAMES.indexOf(axisName);
  if (axis < 0) throw new RangeError(`Unsupported cut reference axis: ${axisName}.`);
  const n = plane.normal;
  const inclination = assessPlaneAngle(n, AXES[axis], views);
  if (inclination.valueDegrees > 0) measurements.push({
    property: "inclination-from-square", kind: "plane-angle", units: "degrees",
    reference: `Nominal ${"XYZ"[axis]}-normal stock plane`,
    independent: axis === 1, presentation: "edge-on-section-or-detail", ...inclination,
  });
  if (axis !== 1) {
    const projectedNormal = [n[0], 0, n[2]];
    if (Math.hypot(...projectedNormal) <= EPSILON) {
      throw new RangeError(`Length/width cut has no broad-face trace: ${name}.`);
    }
    const other = axis === 0 ? 2 : 0;
    const miter = degrees(Math.atan2(n[other], Math.abs(n[axis])));
    if (Math.abs(miter) > degrees(EPSILON)) measurements.push({
      property: "miter-trace", kind: "trace-angle", units: "degrees", valueDegrees: Math.abs(miter),
      signedDegrees: miter, reference: `Square ${axisName} cut trace in a Y-constant plane`,
      status: "standard", preferredViews: views.filter(view => Math.abs(view.direction[1]) > EPSILON)
        .map(view => view.name),
      presentation: Math.abs(n[1]) > EPSILON ? "explicit-section-trace" : "edge-on-outline",
    });
    const bevel = assessPlaneAngle(n, projectedNormal, views);
    if (bevel.valueDegrees > 0) measurements.push({
      property: "bevel", kind: "plane-angle", units: "degrees",
      reference: "Unbeveled cut plane with the same XZ normal direction",
      independent: true, presentation: "edge-on-section-or-detail", ...bevel,
    });
  }
  return { id, name, kind: "cut-plane", geometry: { ...boundary, plane }, metadata, measurements };
}

export function assessDescription(description, views = STOCK_VIEWS) {
  validateViews(views);
  if (!["lumber", "plywood"].includes(description.kind) ||
    description.units?.length !== "inches" || description.units?.angle !== "degrees") {
    throw new TypeError("Expected an analytical woodworking description in inches and degrees.");
  }
  const { blank } = description, features = [];
  for (const value of [blank.length, blank.thickness, blank.width]) {
    if (scalar(value) <= 0) throw new RangeError("Stock-coordinate blank dimensions must be positive.");
  }
  features.push({
    id: "blank", name: "Cutting blank", kind: "blank", geometry: blank,
    measurements: AXES.map((_, axis) => coordinate(AXIS_NAMES[axis], axis,
      [blank[AXIS_NAMES[axis]]], `Maximum cutting-blank extent along ${"XYZ"[axis]}; not an edge length`, views)),
  });
  if (description.widthTrim) features.push({
    id: "width-rip", name: "Width rip", kind: "width-rip", geometry: description.widthTrim,
    measurements: ["from", "to", "removed"].map(property => coordinate(property, 2,
      [description.widthTrim[property]], "Original stock width / finished blank width", views)),
  });
  description.edgeCuts.forEach((cut, index) => {
    features.push(cutFeature(`cut-${index}`, cut.name, cut.points, cut.axis, views, {
      surfaceCut: Boolean(cut.surfaceCut),
      signedMiterDegrees: scalar(cut.miterDegrees), signedBevelDegrees: scalar(cut.bevelDegrees),
      angleFromSquare: scalar(cut.angleFromSquare),
      ...(cut.cornerBevel ? { cornerBevel: cut.cornerBevel } : {}),
    }, cut.plane));
  });
  const faceRanges = ["negativeY", "positiveY"].map(face =>
    [0, 1].map(axis => [
      Math.min(...blank.profiles[face].map(point => point[axis])),
      Math.max(...blank.profiles[face].map(point => point[axis])),
    ]));
  description.notches.forEach((notch, index) => {
    const start = notch.corner.startsWith("start"), near = notch.corner.endsWith("Near");
    if (!["startNear", "startFar", "endNear", "endFar"].includes(notch.corner)) {
      throw new RangeError(`Unsupported notch corner: ${notch.corner}.`);
    }
    const lengths = notch.lengths ?? [notch.length, notch.length];
    if (lengths.length !== 2 || notch.depth.length !== 2) throw new RangeError("Notch requires two face profiles.");
    const ends = faceRanges.map(range => range[0][start ? 0 : 1]);
    const shoulders = ends.map((end, face) => end + (start ? 1 : -1) * scalar(lengths[face]));
    const edges = faceRanges.map(range => range[1][near ? 0 : 1]);
    const floors = edges.map((edge, face) => edge + (near ? 1 : -1) * scalar(notch.depth[face]));
    const id = `notch-${index}`, name = `Corner notch ${notch.corner}`;
    const construction = {
      construction: true, parentFeature: id,
      finiteRegion: "Plane construction only; the parent notch dimensions and original blank define the finite cut.",
    };
    const measurements = [0, 1].flatMap(face => [
      coordinate(`length-face-${face}`, 0, [lengths[face]], `X=${ends[face]} on Y=${face * blank.thickness}`, views),
      coordinate(`depth-face-${face}`, 2, [notch.depth[face]],
        `Z=${edges[face]} on Y=${face * blank.thickness}`, views),
    ]);
    features.push({ id, name, kind: "corner-notch", geometry: notch, measurements });
    const point = (x, face, z) => [x, face * blank.thickness, z];
    features.push(cutFeature(`${id}/floor`, `${name} floor`, [
      point(ends[0], 0, floors[0]), point(shoulders[0], 0, floors[0]),
      point(shoulders[1], 1, floors[1]), point(ends[1], 1, floors[1]),
    ], "width", views, construction, null, true));
    features.push(cutFeature(`${id}/shoulder`, `${name} shoulder`, [
      point(shoulders[0], 0, edges[0]), point(shoulders[0], 0, floors[0]),
      point(shoulders[1], 1, floors[1]), point(shoulders[1], 1, edges[1]),
    ], "length", views, construction, null, true));
  });
  description.dados.forEach((dado, index) => {
    if (!["negativeY", "positiveY"].includes(dado.face)) throw new RangeError(`Unsupported dado face: ${dado.face}.`);
    features.push({
      id: `dado-${index}`, name: dado.endNotch ? "Broad-face end notch" : "Dado",
      kind: dado.endNotch ? "end-notch" : "dado", geometry: dado,
      measurements: [
        coordinate("position", 0, [dado.start], "X=0 stock-start datum", views),
        coordinate("opening-width", 0, [dado.width], `X=${dado.start}`, views),
        coordinate("depth", 1, [dado.depth], `${dado.face} original broad face`, views),
        coordinate("across-width", 2, [dado.acrossWidth], "Broad-face width span", views),
      ],
    });
  });
  (description.edgeNotches ?? []).forEach((notch, index) => {
    if (notch.profiles.length !== 2 || notch.profiles.some(profile => profile.length !== 2)) {
      throw new RangeError("Sheet edge notch requires two corresponding two-point floor profiles.");
    }
    const points = notch.profiles.map((profile, face) => profile.map(([x, z]) => vector([x, face * blank.thickness, z])));
    const [a, b] = points;
    const id = `edge-notch-${index}`, name = "Far-edge sheet notch";
    features.push({
      id, name, kind: "edge-notch", geometry: { points: points.flat(), profiles: notch.profiles },
      measurements: [...outlineMeasurements(points.flat(), views),
        ...points.flatMap((profile, face) => [
          coordinate(`opening-face-${face}`, 0, [profile[1][0] - profile[0][0]],
            `X=${profile[0][0]} on Y=${face * blank.thickness}`, views),
          coordinate(`depths-face-${face}`, 2, profile.map(point => blank.width - point[2]),
            `Z=${blank.width} far edge on Y=${face * blank.thickness}`, views),
        ])],
    });
    features.push(cutFeature(`${id}/floor`, `${name} floor`, [a[0], a[1], b[1], b[0]], "width", views));
    for (const end of [0, 1]) {
      const upper = point => [point[0], point[1], blank.width];
      features.push(cutFeature(`${id}/shoulder-${end}`, `${name} shoulder ${end + 1}`,
        [a[end], b[end], upper(b[end]), upper(a[end])], "length", views, {
          construction: true, parentFeature: id,
          finiteRegion: "Plane construction only; clip the shoulder to the parent sheet notch and blank.",
        }, null, true));
    }
  });
  return features;
}

export function assessModel(model) {
  const inventory = new PartInventory(model.partTree);
  if (inventory.issues.length) throw new Error(inventory.issues.join("\n"));
  const parts = [], hardware = [];
  for (const entry of inventory.entries) {
    if (entry.kind === "hardware") {
      hardware.push({ title: entry.title, quantity: entry.quantity, occurrenceIds: entry.occurrenceIds });
      continue;
    }
    const views = model.partTree.getStockViews(entry.representativeId);
    let features;
    try { features = assessDescription(entry.description, views); }
    catch (cause) { throw new Error(`${entry.title} [${entry.representativeId}]: ${cause.message}`, { cause }); }
    parts.push({
      title: entry.title, representativeId: entry.representativeId,
      quantity: entry.quantity, occurrenceIds: entry.occurrenceIds,
      roles: entry.roles, views, features,
    });
  }
  const measurements = parts.flatMap(part => part.features.flatMap(feature => feature.measurements));
  const independentAuxiliary = measurements.filter(measurement =>
    measurement.status === "auxiliary" && measurement.independent !== false);
  return {
    configuration: {
      stairWidth: model.stairWidth, stepCount: model.stepCount, moduleCount: model.moduleCount,
      spindleShoulderAscent: model.spindleShoulderAscent,
    },
    summary: {
      occurrences: inventory.quantity, woodenPatterns: parts.length,
      woodenOccurrences: parts.reduce((sum, part) => sum + part.quantity, 0),
      hardwareOccurrences: hardware.reduce((sum, entry) => sum + entry.quantity, 0),
      features: parts.reduce((sum, part) => sum + part.features.length, 0),
      measurements: measurements.length,
      standardMeasurements: measurements.filter(measurement => measurement.status === "standard").length,
      independentAuxiliaryAngles: independentAuxiliary.length,
      diagnosticAuxiliaryAngles: measurements.filter(measurement =>
        measurement.status === "auxiliary" && measurement.independent === false).length,
      patternsRequiringAuxiliaryAngles: parts.filter(part => part.features.some(feature =>
        feature.measurements.some(measurement =>
          measurement.status === "auxiliary" && measurement.independent !== false))).length,
    },
    scope: "Geometric coverage only; standard views may require sections/details. Visibility and label layout are not assessed.",
    parts, hardware,
  };
}

export function assessConfigurations(matrix = false) {
  if (!matrix) return [assessModel(buildStairway())];
  const reports = [];
  for (const width of [20, 24, 36]) {
    reports.push(assessModel(buildStairway(width)));
  }
  return reports;
}

export function formatAssessment(reports) {
  const lines = ["Feature/view feasibility assessment (no rendering).",
    "Standard = geometric coverage, possibly using a section/detail; not a visibility guarantee."];
  for (const report of reports) {
    const { configuration: c, summary: s } = report;
    lines.push("",
      `${c.stepCount} steps / ${c.moduleCount} modules / width ${c.stairWidth} in / shoulder ${c.spindleShoulderAscent} in`,
      `${s.woodenPatterns} wooden patterns (${s.woodenOccurrences} occurrences); ${s.hardwareOccurrences} hardware occurrences excluded.`,
      `${s.features} features; ${s.standardMeasurements} standard-view measurements; ` +
        `${s.independentAuxiliaryAngles} independent angles require auxiliary views in ${s.patternsRequiringAuxiliaryAngles} patterns.`,
      `${s.diagnosticAuxiliaryAngles} additional derived total-inclination diagnostics require auxiliary views.`);
    for (const part of report.parts) {
      const cases = part.features.flatMap(feature => feature.measurements.filter(measurement =>
        measurement.status === "auxiliary" && measurement.independent !== false)
        .map(measurement => ({ feature, measurement })));
      if (!cases.length) continue;
      lines.push(`  ${part.title} x ${part.quantity} [${part.representativeId}]`);
      for (const { feature, measurement } of cases) lines.push(
        `    ${feature.name}: ${measurement.property} ${measurement.valueDegrees.toFixed(6)} deg; ` +
        `view along [${measurement.auxiliaryDirection.map(value => value.toFixed(6)).join(", ")}]`);
    }
  }
  lines.push("", `${reports.length} configuration(s) assessed. Exact planes, outlines and coverage are available with --json.`);
  return lines.join("\n");
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  const usage = "Usage: node assess-feature-views.mjs [--matrix] [--json]";
  try {
    if (args.length === 1 && args[0] === "--help") console.log(usage);
    else {
      if (new Set(args).size !== args.length || args.some(arg => !["--matrix", "--json"].includes(arg))) {
        throw new Error(usage);
      }
      const reports = assessConfigurations(args.includes("--matrix"));
      console.log(args.includes("--json") ? JSON.stringify(reports, null, 2) : formatAssessment(reports));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
