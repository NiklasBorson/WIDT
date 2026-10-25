import { formatLength, getSimpleEdgeBevel } from "./part-description.js";
import { assessPlaneAngle, STOCK_VIEWS } from "./part-angles.js";
import { partViewLabel } from "./parts.js";
import { outlinePoint, outlineExtrema, constructionOutline, constructionTrapezoid, notchRectangle, tessellateOutline } from "./plywood-outline.js";

const EPSILON = 1e-8;
const dot = (a, b) => a.reduce((sum, value, axis) => sum + value * b[axis], 0);
const subtract = (a, b) => a.map((value, axis) => value - b[axis]);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const midpoint = points => [0, 1, 2].map(axis =>
  points.reduce((sum, point) => sum + point[axis], 0) / points.length);
const angleText = value => `${Number(value.toFixed(2))} deg`;
const extent = (points, axis) => [Math.min(...points.map(point => point[axis])),
  Math.max(...points.map(point => point[axis]))];

function slice(points, axis, value) {
  const result = [];
  const add = point => {
    if (!result.some(other => Math.hypot(...subtract(point, other)) < EPSILON)) result.push(point);
  };
  points.forEach((a, index) => {
    const b = points[(index + 1) % points.length];
    if (Math.abs(a[axis] - value) < EPSILON) add(a);
    if ((a[axis] - value) * (b[axis] - value) < -EPSILON * EPSILON) {
      const ratio = (value - a[axis]) / (b[axis] - a[axis]);
      add(a.map((coordinate, i) => coordinate + ratio * (b[i] - coordinate)));
    }
  });
  return result;
}

export function getPartFeatures(description, view, suppliedViews = []) {
  const views = suppliedViews.length ? suppliedViews : STOCK_VIEWS;
  const viewName = direction => partViewLabel(views.find(candidate =>
    candidate.direction.every((value, axis) => value === direction[axis])).name);
  const currentName = views.find(candidate =>
    candidate.direction.every((value, axis) => value === view.direction[axis])).name;
  const { blank } = description, [x, y, z] = view.direction;
  const face = y > 0 ? 1 : 0;
  const faceNames = [viewName([0, -1, 0]), viewName([0, 1, 0])];
  const ranges = ["negativeY", "positiveY"].map(name => [0, 1].map(axis =>
    extent(blank.profiles[name], axis)));
  const features = [], counters = {};
  const identifier = prefix => `${prefix}${counters[prefix] = (counters[prefix] ?? 0) + 1}`;
  const feature = (id, kind, name, point) => ({
    id, kind, name, point, lines: [`${id}: ${name}`], dimensions: [], angles: [], outline: null,
  });
  const simpleBevel = getSimpleEdgeBevel(description);
  if (simpleBevel) {
    if (!x) return [];
    const near = simpleBevel.corner.endsWith("Near"), edge = near ? 0 : blank.width;
    const points = simpleBevel.depth.map((depth, face) =>
      [x > 0 ? blank.length : 0, face * blank.thickness, edge + (near ? depth : -depth)]);
    const vertexFace = simpleBevel.depth[0] < simpleBevel.depth[1] ? 0 : 1;
    const vertex = points[vertexFace], cutPoint = points[1 - vertexFace];
    const referencePoint = [vertex[0], cutPoint[1], edge];
    const normal = [0, -(points[1][2] - points[0][2]), blank.thickness];
    const angle = assessPlaneAngle(normal, [0, 0, 1], views);
    const entry = feature("B1", "bevel", `${viewName([0, 0, near ? -1 : 1])} edge bevel`, vertex);
    entry.compact = true;
    entry.lines = [];
    entry.angles.push({ ...angle, viewDirection: view.direction,
      property: "Edge bevel", reference: "Original square edge",
      label: `${angleText(angle.valueDegrees)} bevel`, directProfile: { vertex, cutPoint, referencePoint } });
    return [entry];
  }
  const dimension = (entry, from, to, property, reference, axis) => {
    const delta = subtract(to, from);
    axis ??= delta.findIndex(value => Math.abs(value) > EPSILON);
    if (axis < 0) return;
    const value = Math.abs(delta[axis]);
    if (!Number.isFinite(value)) throw new RangeError(`Invalid dimension for ${entry.id}.`);
    if (value < EPSILON || Math.abs(view.direction[axis]) > EPSILON) return;
    entry.dimensions.push({ from, to, axis, property, reference, value,
      label: `${entry.id} ${property} ${formatLength(value)} in` });
  };
  const inclination = (entry, normal, referenceNormal, property, reference, allowed = () => true) => {
    const result = assessPlaneAngle(normal, referenceNormal, views);
    if (!result.annotationRequired) return;
    const suitable = result.preferredViews.filter(name =>
      allowed(views.find(candidate => candidate.name === name).direction));
    if (suitable.includes(currentName) || description.kind === "plywood" && suitable.length) {
      const profileView = suitable.includes(currentName) ? null :
        views.find(candidate => candidate.name === suitable[0]);
      entry.angles.push({
        ...result, property, reference, viewDirection: profileView?.direction ?? view.direction,
        label: `${entry.id} ${property} ${angleText(result.valueDegrees)}${profileView
          ? ` (${partViewLabel(profileView.name)} plane profile)` : ""}`,
      });
    }
    else {
      if (!suitable.length) entry.requiresSection = true;
      entry.lines.push(suitable.length ? `${property}: see ${suitable.map(partViewLabel).join(" / ")}` :
        `${property} ${angleText(result.valueDegrees)}: ${result.status === "auxiliary"
          ? "auxiliary section required" : "section required"}`);
    }
  };

  for (const [index, notch] of description.notches.entries()) {
    const start = notch.corner.startsWith("start"), near = notch.corner.endsWith("Near");
    const lengths = notch.lengths ?? [notch.length, notch.length];
    const full = lengths.every((length, face) => length >= ranges[face][0][1] - ranges[face][0][0] - EPSILON);
    const beveled = Math.abs(notch.depth[1] - notch.depth[0]) > EPSILON;
    const id = identifier(full ? "B" : "N");
    const edgeName = viewName([0, 0, near ? -1 : 1]);
    const ends = ranges.map(range => range[0][start ? 0 : 1]);
    const shoulders = ends.map((end, face) => end + (start ? 1 : -1) * lengths[face]);
    const edges = ranges.map(range => range[1][near ? 0 : 1]);
    const floors = edges.map((edge, face) => edge + (near ? 1 : -1) * notch.depth[face]);
    if (!full && ((x && start !== (x < 0)) || (z && near !== (z < 0)))) continue;
    const entry = feature(id, full ? "bevel" : "notch",
      full ? `${edgeName} edge ${beveled ? "bevel" : "rebate"}` : `${edgeName} notch`,
      y ? [full ? (ends[face] + shoulders[face]) / 2 : shoulders[face],
        face * blank.thickness, floors[face]] :
        [x ? x > 0 ? blank.length : 0 : full ? (ends[0] + shoulders[0] + ends[1] + shoulders[1]) / 4 :
          (shoulders[0] + shoulders[1]) / 2,
          blank.thickness / 2, (floors[0] + floors[1]) / 2]);
    entry.source = `notch-${index}`;
    if (z && !full) {
      entry.outline = shoulders.map((shoulder, face) => [shoulder, face * blank.thickness, floors[face]]);
      entry.outlineHidden = true;
    }
    if (y) {
      const at = (x, z) => [x, face * blank.thickness, z];
      if (!full && (!face || Math.abs(lengths[0] - lengths[1]) > EPSILON)) {
        dimension(entry, at(ends[face], floors[face]), at(shoulders[face], floors[face]), "length",
          `From ${viewName([start ? -1 : 1, 0, 0])} blank end on ${faceNames[face]} face`);
      }
      if (!face || Math.abs(notch.depth[0] - notch.depth[1]) > EPSILON) {
        dimension(entry, at(full ? ends[face] : shoulders[face], edges[face]),
          at(full ? ends[face] : shoulders[face], floors[face]), "depth",
          `From original blank ${edgeName} edge on ${faceNames[face]} face`);
      }
      entry.lines.push(`Depth from blank ${edgeName} edge; ${faceNames[face]} face`);
      if (face && (!full && Math.abs(lengths[0] - lengths[1]) <= EPSILON ||
        Math.abs(notch.depth[0] - notch.depth[1]) <= EPSILON)) {
        entry.lines.push(`Matching dimensions: see ${faceNames[0]} face`);
      }
      if (notch.depth[face] < EPSILON) entry.lines.push("No removal at this face");
    } else entry.lines.push(`Length / depth: see ${faceNames.join(" / ")} face`);
    if (full) entry.lines.push("Full blank length");
    const exposedFloor = direction => {
      const atStart = direction[0] < 0;
      if (!full && atStart !== start) return false;
      return !description.notches.some((other, otherIndex) => {
        if (otherIndex === index || other.corner.endsWith("Near") !== near) return false;
        const otherLengths = other.lengths ?? [other.length, other.length];
        const reaches = other.corner.startsWith("start") === atStart ||
          otherLengths.every((length, face) => length >= ranges[face][0][1] - ranges[face][0][0] - EPSILON);
        return reaches && other.depth.every((depth, face) => depth >= notch.depth[face] - EPSILON) &&
          other.depth.some((depth, face) => depth > notch.depth[face] + EPSILON);
      });
    };
    inclination(entry, [0, -(floors[1] - floors[0]), blank.thickness], [0, 0, 1],
      full ? "Edge bevel" : "Floor bevel", `Square to original blank ${edgeName} edge`, exposedFloor);
    inclination(entry, [blank.thickness, -(shoulders[1] - shoulders[0]), 0], [1, 0, 0],
      "Shoulder bevel", "Square to original blank end");
    if (x && full && beveled && exposedFloor(view.direction)) {
      const shorter = notch.depth[0] > notch.depth[1] ? 0 : 1;
      entry.lines.push(`${faceNames[shorter]} face setback: ${formatLength(Math.abs(notch.depth[0] - notch.depth[1]))} in ` +
        `from ${faceNames[1 - shorter]} face (across width)`);
    }
    if (x && !exposedFloor(view.direction) || z && near !== (z < 0)) entry.hidden = true;
    if (y && !full && notch.depth[face] > EPSILON && !entry.angles.length && !entry.requiresSection) {
      entry.lines = [];
    }
    features.push(entry);
  }

  for (const notch of description.edgeNotches ?? []) {
    const id = identifier("N");
    const profiles = notch.profiles.map((profile, face) =>
      profile.map(([x, z]) => [x, face * blank.thickness, z]));
    if (x && !profiles.every((profile, face) =>
      Math.abs(profile[x < 0 ? 0 : 1][0] - ranges[face][0][x < 0 ? 0 : 1]) < EPSILON)) continue;
    const entry = feature(id, "notch", `${viewName([0, 0, 1])} edge notch`, midpoint(profiles.flat()));
    if (y) {
      const [a, b] = profiles[face], upper = point => [point[0], point[1], blank.width];
      entry.outline = [upper(a), a, b, upper(b)];
      const fromStart = a[0] - ranges[face][0][0] <= ranges[face][0][1] - b[0];
      const endName = viewName([fromStart ? -1 : 1, 0, 0]);
      const anchor = fromStart ? a : b;
      const end = fromStart ? ranges[face][0][0] : ranges[face][0][1];
      dimension(entry, [end, anchor[1], anchor[2]], anchor, `from ${endName}`,
        `From nearest blank end on ${faceNames[face]} face`);
      if (Math.abs(anchor[0] - end) < EPSILON) entry.lines.push(`Opening meets ${endName} blank end`);
      dimension(entry, a, b, "opening", `${faceNames[face]} face`, 0);
      dimension(entry, upper(a), a, "depth 1", `${faceNames[face]} face; blank far edge`);
      if (formatLength(blank.width - a[2]) !== formatLength(blank.width - b[2])) {
        dimension(entry, upper(b), b, "depth 2", `${faceNames[face]} face; blank far edge`);
      }
      entry.lines.push(`${faceNames[face]} face; depths from blank ${viewName([0, 0, 1])} edge`);
    } else entry.lines.push(`Opening dimensions: see ${faceNames.join(" / ")}`);
    const floorNormal = cross(subtract(profiles[0][1], profiles[0][0]),
      subtract(profiles[1][0], profiles[0][0]));
    inclination(entry, [floorNormal[0], 0, floorNormal[2]], [0, 0, 1],
      "Floor slope", "Original blank width edge in the broad-face plane");
    inclination(entry, floorNormal, [floorNormal[0], 0, floorNormal[2]],
      "Floor bevel", "Floor plane with the same face slope but no thickness bevel");
    for (const endpoint of [0, 1]) {
      inclination(entry, [blank.thickness, -(profiles[1][endpoint][0] - profiles[0][endpoint][0]), 0],
        [1, 0, 0], `Shoulder ${endpoint + 1} bevel`, "Square to original blank end");
    }
    if (description.kind === "plywood" && y) {
      const other = 1 - face, [a, b] = profiles[other];
      entry.lines.push(`${faceNames[other]} face: X ${formatLength(a[0])} to ${formatLength(b[0])} in from ${viewName([-1, 0, 0])} blank end`,
        `${faceNames[other]} depths from blank ${viewName([0, 0, 1])} edge: ${formatLength(blank.width - a[2])} / ${formatLength(blank.width - b[2])} in`);
    }
    features.push(entry);
  }

  for (const cut of description.edgeCuts) {
    const miter = Math.abs(cut.miterDegrees) > EPSILON, bevel = Math.abs(cut.bevelDegrees) > EPSILON;
    if (!miter && !bevel) continue;
    const id = identifier(miter && bevel ? "C" : miter ? "M" : "B");
    const axis = ["length", "thickness", "width"].indexOf(cut.axis);
    if (axis < 0) throw new RangeError(`Unsupported cut reference: ${cut.axis}.`);
    const entry = feature(id, miter && bevel ? "compound" : miter ? "miter" : "bevel",
      cut.name, midpoint(cut.points));
    const reference = [0, 0, 0];
    reference[axis] = 1;
    if (miter && axis !== 1) inclination(entry, [cut.plane.normal[0], 0, cut.plane.normal[2]],
      reference, "Miter trace", `Square ${cut.axis} cut in the broad-face plane`);
    if (bevel) inclination(entry, cut.plane.normal,
      axis === 1 ? reference : [cut.plane.normal[0], 0, cut.plane.normal[2]],
      "Bevel", axis === 1 ? "Original broad-face plane" : miter ? "Unbeveled cut with the same miter" :
        `Square to blank ${viewName(reference.map(value => value * Math.sign(cut.plane.normal[axis])))} ${axis === 0 ? "end" : "edge"}`,
      direction => {
        const normalAxis = direction.findIndex(value => value !== 0);
        const bound = direction[normalAxis] > 0 ? blank[["length", "thickness", "width"][normalAxis]] : 0;
        return cut.points.some(point => Math.abs(point[normalAxis] - bound) < EPSILON);
      });
    if (y) {
      const trace = slice(cut.points, 1, face * blank.thickness);
      if (trace.length >= 2) {
        entry.point = midpoint(trace);
        const [minX, maxX] = extent(trace, 0);
        if (maxX - minX > EPSILON && maxX - minX < blank.length - EPSILON) {
          const from = trace.reduce((a, b) => a[0] < b[0] ? a : b);
          const to = trace.reduce((a, b) => a[0] > b[0] ? a : b);
          dimension(entry, from, to, "extent", "Finite cut extent along the blank");
        }
        if (cut.surfaceCut && !miter && maxX - minX < blank.length - EPSILON) {
          const from = [...entry.point], to = [...entry.point];
          from[0] = 0; to[0] = minX;
          dimension(entry, from, to, "start", "From blank start; stopped cut");
          entry.lines.push(`Extent measured from ${viewName([-1, 0, 0])} blank end`);
        }
      }
    }
    const normalAxis = view.direction.findIndex(value => value !== 0);
    const bound = view.direction[normalAxis] > 0 ? [blank.length, blank.thickness, blank.width][normalAxis] : 0;
    const facing = dot(cut.plane.normal, view.direction);
    const blockedEnd = !y && Math.abs(facing) <= EPSILON &&
      !cut.points.some(point => Math.abs(point[normalAxis] - bound) < EPSILON);
    if (cut.surfaceCut && (facing < -EPSILON || blockedEnd)) {
      entry.hidden = true;
      entry.dimensions = [];
      entry.angles = [];
      entry.lines[0] = `${id}: ${cut.name} (not exposed)`;
      entry.lines.push(`Extent: see ${y ? faceNames[1 - face] : faceNames.join(" / ")} face`);
    }
    if (entry.angles.length && !y) {
      const visibleAxis = view.direction.findIndex(value => value !== 0);
      for (const dimensionAxis of [0, 1, 2].filter(value => value !== visibleAxis)) {
        const [min, max] = extent(cut.points, dimensionAxis);
        if (max - min < EPSILON || max - min >= blank[["length", "thickness", "width"][dimensionAxis]] - EPSILON) continue;
        if (dimensionAxis === 1 && formatLength(max - min) === formatLength(blank.thickness)) continue;
        const from = cut.points.reduce((a, b) => a[dimensionAxis] < b[dimensionAxis] ? a : b);
        const to = cut.points.reduce((a, b) => a[dimensionAxis] > b[dimensionAxis] ? a : b);
        dimension(entry, from, to, ["length", "thickness span", "setback"][dimensionAxis],
          "Stock-axis span of the cut profile, not sloping edge length", dimensionAxis);
      }
    }
    if (entry.dimensions.length || entry.angles.length ||
      entry.requiresSection && !entry.hidden && facing > EPSILON) features.push(entry);
  }

  for (const dado of description.dados) {
    const id = identifier(dado.endNotch ? "N" : "D");
    const positive = dado.face === "positiveY";
    if ((x < 0 && dado.start > EPSILON) ||
      (x > 0 && dado.start + dado.width < blank.length - EPSILON)) continue;
    const surface = positive ? blank.thickness : 0, floor = surface + (positive ? -1 : 1) * dado.depth;
    const entry = feature(id, dado.endNotch ? "notch" : "dado",
      `${faceNames[positive ? 1 : 0]} face ${dado.endNotch ? "end recess" : "dado"}`,
      [dado.start + dado.width / 2, (surface + floor) / 2, blank.width / 2]);
    entry.hidden = Boolean(y && positive !== (y > 0));
    if (y) {
      entry.outline = [[dado.start, surface, ranges[positive ? 1 : 0][1][0]],
        [dado.start + dado.width, surface, ranges[positive ? 1 : 0][1][0]],
        [dado.start + dado.width, surface, ranges[positive ? 1 : 0][1][1]],
        [dado.start, surface, ranges[positive ? 1 : 0][1][1]]];
      entry.closed = true;
      if (entry.hidden) entry.lines.push(`Opening: see ${faceNames[positive ? 1 : 0]} face`);
      else {
        dimension(entry, [0, surface, blank.width / 2], [dado.start, surface, blank.width / 2],
          "position", `From ${viewName([-1, 0, 0])} blank end`);
        dimension(entry, [dado.start, surface, blank.width / 2],
          [dado.start + dado.width, surface, blank.width / 2], "opening", "Along blank length");
        entry.lines.push(`Depth: see ${viewName([0, 0, -1])} / ${viewName([0, 0, 1])} edge`);
      }
      if (description.kind === "plywood") entry.lines.push(
        `Depth ${formatLength(dado.depth)} in normal to ${faceNames[positive ? 1 : 0]} face`);
      else if (entry.hidden) entry.lines = [];
    } else if (z) {
      const atX = dado.start + dado.width / 2, atZ = z > 0 ? blank.width : 0;
      dimension(entry, [atX, surface, atZ], [atX, floor, atZ], "depth",
        `Normal to ${faceNames[positive ? 1 : 0]} original face`);
    } else entry.lines.push(`Depth: see ${viewName([0, 0, -1])} / ${viewName([0, 0, 1])} edge`);
    features.push(entry);
  }
  if (y && description.outline) {
    const construction = description.construction, surface = y > 0 ? blank.thickness : 0;
    const point3 = ([x, z]) => [x, surface, z];
    let unnotched, radialCuts;
    if (construction) {
      const rectangle = feature("B1", "construction-blank", "Starting rectangle", [0, surface, 0]);
      rectangle.lines = [];
      rectangle.outline = [[0, 0], [blank.length, 0], [blank.length, blank.width], [0, blank.width]].map(point3);
      rectangle.closed = rectangle.outlineHidden = true;
      rectangle.outlineDotted = true;
      features.push(rectangle);
      radialCuts = constructionTrapezoid(construction).sides;
      const [left, right] = radialCuts.map(cut => cut.top[0]);
      for (const [index, from, to, bottom] of [
        [1, 0, left, [0, blank.width]], [2, right, blank.length, [blank.length, blank.width]],
      ]) {
        const { inset } = radialCuts[index - 1], trimmed = to - from > EPSILON;
        if (!trimmed && Math.abs(inset) < EPSILON) continue;
        const vertex = index === 1 ? to : from;
        const entry = feature(`C${index}`, "corner-cut", "Trapezoid corner cut", [vertex, surface, 0]);
        entry.lines = [trimmed ? `${entry.id}: ${formatLength(to - from)} in from ${index === 1 ? "left" : "right"}` :
          `${entry.id}: ${index === 1 ? "Left" : "Right"} cut`];
        if (Math.abs(inset) > EPSILON) entry.lines.push(
          `Cut ${formatLength(Math.abs(inset))} in ${inset > 0 ? "inside" : "outside"} radial guide`);
        if (trimmed) {
          entry.outline = [[from, 0], [to, 0], bottom].map(point3);
          entry.closed = entry.outlineHidden = true;
        }
        features.push(entry);
      }
      for (const [prefix, cuts] of [["N", construction.notches], ["H", construction.openings ?? []]]) {
        for (const [i, notch] of cuts.entries()) {
          const entry = feature(`${prefix}${i + 1}`, "rectangular-notch",
            notch.name ?? (prefix === "H" ? "Rectangular through-opening" : "Rectangular notch"), point3(notch.reference));
          const offsets = notch.reference.flatMap((coordinate, axis) => {
            const size = axis === 0 ? blank.length : blank.width;
            if (Math.abs(coordinate) < EPSILON || Math.abs(size - coordinate) < EPSILON) return [];
            const fromEnd = Math.abs(size - coordinate) < Math.abs(coordinate);
            const edge = axis === 0 ? fromEnd ? "right" : "left" : fromEnd ? "bottom" : "top";
            return [`${formatLength(fromEnd ? size - coordinate : coordinate)} in from ${edge}`];
          });
          entry.lines = [`${entry.id}: ${offsets[0] ?? (prefix === "H" ? "Rectangular opening" : "Rectangular notch")}`, ...offsets.slice(1),
            `Width ${formatLength(notch.width)} in; height ${formatLength(notch.depth)} in`,
            `Angle ${angleText(notch.angleRadians * 180 / Math.PI)} from blank X`];
          entry.outline = notchRectangle(notch).map(point3);
          entry.closed = entry.outlineHidden = true;
          features.push(entry);
        }
      }
      unnotched = constructionOutline({ ...construction, notches: [], openings: [] });
    }
    const arcs = [];
    for (const edge of description.outline.filter(edge => edge.type === "arc")) {
      const existing = arcs.find(arc => Math.abs(arc.radius - edge.radius) < EPSILON &&
        Math.hypot(...arc.center.map((value, i) => value - edge.center[i])) < EPSILON);
      if (!existing) arcs.push(edge);
      else if (Math.abs(edge.sweepRadians) > Math.abs(existing.sweepRadians)) arcs[arcs.indexOf(existing)] = edge;
    }
    const arcEdges = (unnotched ?? description.outline).filter(edge => edge.type === "arc");
    const sameCenter = (a, b) => Math.hypot(...a.center.map((value, i) => value - b.center[i])) < EPSILON;
    const onArc = (edge, angle) => {
      const turn = Math.PI * 2;
      const delta = ((angle - edge.startAngle) * Math.sign(edge.sweepRadians) % turn + turn) % turn;
      return delta <= Math.abs(edge.sweepRadians) + EPSILON || turn - delta < EPSILON;
    };
    for (const arc of arcs) {
      const concentric = arcs.filter(other => sameCenter(arc, other)).sort((a, b) => b.radius - a.radius);
      const outer = concentric[0];
      const commonPoint = concentric.length > 1 ?
        [outlinePoint(outer, 0.5), ...arcEdges.filter(edge => sameCenter(arc, edge)).flatMap(outlineExtrema)]
          .find(point => concentric.every(circle => arcEdges.some(edge =>
            sameCenter(circle, edge) && Math.abs(circle.radius - edge.radius) < EPSILON &&
            onArc(edge, Math.atan2(point[1] - arc.center[1], point[0] - arc.center[0]))))) : null;
      const inner = commonPoint ? concentric[concentric.indexOf(arc) + 1] : null;
      const commonRadius = commonPoint ? Math.hypot(...commonPoint.map((value, axis) => value - arc.center[axis])) : 0;
      const point = commonPoint ? commonPoint.map((value, axis) =>
        arc.center[axis] + (value - arc.center[axis]) * arc.radius / commonRadius) :
        unnotched ? arcEdges.flatMap(outlineExtrema).toSorted((a, b) => b[1] - a[1])[0] :
          outlinePoint(arc, 0.5), id = identifier("R");
      const entry = feature(id, "arc", "Arc cut", point3(point));
      entry.lines = [];
      entry.radius = arc.radius;
      entry.radiusCenter = point3(arc.center);
      entry.radiusThroughBlank = true;
      entry.radiusCenterLabel = "C";
      entry.radialGuides = [];
      if (inner) {
        entry.radiusTo = point3(point.map((value, axis) =>
          arc.center[axis] + (value - arc.center[axis]) * inner.radius / arc.radius));
        entry.radiusSpan = arc.radius - inner.radius;
      } else if (radialCuts) {
        entry.radialGuides = radialCuts.map(cut => ({
          from: point3(cut.guide.from), to: point3(cut.guide.to), side: cut.side, inset: cut.inset,
        }));
      } else {
        const tolerance = Math.max(1, blank.length, blank.width, arc.radius) * EPSILON;
        const ray = point => point.map((value, axis) => value - arc.center[axis]);
        const sameRay = (a, b) => Math.abs(a[0] * b[1] - a[1] * b[0]) <=
          tolerance * Math.max(Math.hypot(...a), Math.hypot(...b)) && dot(a, b) > 0;
        for (const edge of [...(unnotched ?? []), ...description.outline].filter(edge => edge.type === "line")) {
          const delta = edge.to.map((value, axis) => value - edge.from[axis]), relative = ray(edge.from);
          if (Math.abs(delta[0] * relative[1] - delta[1] * relative[0]) > tolerance * Math.hypot(...delta)) continue;
          const [from, to] = [edge.from, edge.to].sort((a, b) => Math.hypot(...ray(b)) - Math.hypot(...ray(a)));
          if (sameRay(ray(from), ray(point)) || entry.radialGuides.some(existing =>
            sameRay(ray([existing.from[0], existing.from[2]]), ray(from)))) continue;
          entry.radialGuides.push({ from: point3(from), to: point3(to) });
        }
      }
      if (unnotched) {
        entry.outline = tessellateOutline(unnotched, 0.005).map(point3);
        entry.closed = entry.outlineHidden = true;
      }
      features.push(entry);
    }
  }
  return features;
}
