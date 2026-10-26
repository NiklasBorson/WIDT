import { combineGeometries } from "./model.js";
import { STANDARD_VIEWS } from "./renderer.js";

const EPS = 1e-4; // Inches; above Float32 noise at stairway scale.
const ANGULAR = 1e-5;
const MAX_GAP = 6;
const AREA = 1e-5;
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, s) => a.map(v => v * s);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = a => Math.hypot(...a);
const unit = a => mul(a, 1 / length(a));
const average = points => mul(points.reduce(add, [0, 0, 0]), 1 / points.length);
const key = p => p.map(v => Math.round(v / EPS)).join(",");

function rotate(geometry, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const transform = values => {
    const result = new Float32Array(values.length);
    for (let i = 0; i < values.length; i += 3) {
      result.set([c * values[i] + s * values[i + 2], values[i + 1],
        -s * values[i] + c * values[i + 2]], i);
    }
    return result;
  };
  return { ...geometry, positions: transform(geometry.positions),
    normals: transform(geometry.normals),
    ...(geometry.referenceEdges ? { referenceEdges: geometry.referenceEdges.map(datum => ({
      ...datum, edge: datum.edge.map(([x, y, z]) => [c * x + s * z, y, -s * x + c * z]),
    })) } : {}),
    ...(geometry.referenceArcs ? { referenceArcs: geometry.referenceArcs.map(arc => ({
      ...arc, center: [c * arc.center[0] + s * arc.center[2], arc.center[1],
        -s * arc.center[0] + c * arc.center[2]], startAngle: arc.startAngle - angle,
    })) } : {}) };
}

function triangles(geometry) {
  const result = [];
  for (let i = 0; i < geometry.indices.length; i += 3) {
    const points = Array.from(geometry.indices.slice(i, i + 3),
      index => Array.from(geometry.positions.slice(index * 3, index * 3 + 3)));
    if (points.some(p => p.some(v => !Number.isFinite(v)))) continue;
    const normal = cross(sub(points[1], points[0]), sub(points[2], points[0]));
    if (length(normal) > AREA) result.push({ points, normal: unit(normal), index: i / 3 });
  }
  return result;
}

function bounds(geometry) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < geometry.positions.length; i++) {
    const v = geometry.positions[i], axis = i % 3;
    if (!Number.isFinite(v)) continue;
    min[axis] = Math.min(min[axis], v);
    max[axis] = Math.max(max[axis], v);
  }
  return { min, max };
}

function separation(a, b) {
  return Math.hypot(...a.min.map((v, i) => Math.max(0, v - b.max[i], b.min[i] - a.max[i])));
}

function basis(normal) {
  const u = unit(cross(normal, Math.abs(normal[1]) < 0.8 ? [0, 1, 0] : [1, 0, 0]));
  return [u, cross(normal, u)];
}

const cross2 = (a, b) => a[0] * b[1] - a[1] * b[0];
const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];
function signedArea(points) {
  return points.reduce((sum, p, i) => sum + cross2(p, points[(i + 1) % points.length]), 0) / 2;
}

// Convex clipping is used on triangles, never on the possibly concave merged face.
function clip(subject, boundary) {
  let result = subject;
  const sign = signedArea(boundary) < 0 ? -1 : 1;
  for (let i = 0; i < boundary.length && result.length; i++) {
    const a = boundary[i], b = boundary[(i + 1) % boundary.length], edge = sub2(b, a);
    const distance = p => sign * cross2(edge, sub2(p, a));
    const input = result;
    result = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j], q = input[(j + 1) % input.length], dp = distance(p), dq = distance(q);
      if (dp >= 0) result.push(p);
      if ((dp < 0) !== (dq < 0)) {
        const t = dp / (dp - dq);
        result.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    }
  }
  return result;
}

function surfaces(mesh) {
  const edges = new Map(), adjacency = mesh.map(() => []);
  mesh.forEach((triangle, i) => {
    triangle.points.forEach((p, j) => {
      const edge = [key(p), key(triangle.points[(j + 1) % 3])].sort().join("|");
      for (const other of edges.get(edge) ?? []) {
        adjacency[i].push(other);
        adjacency[other].push(i);
      }
      if (!edges.has(edge)) edges.set(edge, []);
      edges.get(edge).push(i);
    });
  });
  const result = [], visited = new Set();
  for (let i = 0; i < mesh.length; i++) {
    if (visited.has(i)) continue;
    const normal = mesh[i].normal, d = dot(normal, mesh[i].points[0]);
    const stack = [i], component = [];
    while (stack.length) {
      const index = stack.pop(), triangle = mesh[index];
      if (visited.has(index) || length(sub(triangle.normal, normal)) > ANGULAR ||
        triangle.points.some(p => Math.abs(dot(normal, p) - d) > EPS)) continue;
      visited.add(index);
      component.push(triangle);
      stack.push(...adjacency[index]);
    }
    result.push({ normal, d, triangles: component });
  }
  return result;
}

function intersection(a, b) {
  const [u, v] = basis(a.normal);
  const project = p => [dot(p, u), dot(p, v)];
  const pieces = [];
  for (const ta of a.triangles) for (const tb of b.triangles) {
    const polygon = clip(ta.points.map(project), tb.points.map(project));
    if (polygon.length >= 3 && Math.abs(signedArea(polygon)) > AREA) pieces.push(polygon);
  }

  if (!pieces.length) return null;
  const lift = p => add(add(mul(u, p[0]), mul(v, p[1])), mul(a.normal, a.d));
  // Use the largest actual overlap polygon, not a centroid spanning disconnected overlap.
  pieces.sort((p, q) => Math.abs(signedArea(q)) - Math.abs(signedArea(p)));
  return { points: pieces.flatMap(p => p.map(lift)),
    anchor: average(pieces[0].map(lift)) };
}

function segmentClear(from, to, meshes) {
  const direction = sub(to, from), distance = length(direction);
  if (distance <= EPS) return true;
  for (const triangle of meshes) {
    const denominator = dot(triangle.normal, direction);
    if (Math.abs(denominator) < EPS) continue;
    const t = dot(triangle.normal, sub(triangle.points[0], from)) / denominator;
    if (t * distance <= EPS || (1 - t) * distance <= EPS) continue;
    const point = add(from, mul(direction, t));
    if (triangle.points.every((p, i) => dot(triangle.normal,
      cross(sub(triangle.points[(i + 1) % 3], p), sub(point, p))) >= -EPS)) return false;
  }
  return true;
}

function boundaryEdges(surface) {
  const edges = new Map();
  for (const triangle of surface.triangles) triangle.points.forEach((p, i) => {
    const q = triangle.points[(i + 1) % 3], edgeKey = [key(p), key(q)].sort().join("|");
    const entry = edges.get(edgeKey);
    if (entry) entry.count++;
    else edges.set(edgeKey, { count: 1, points: [p, q] });
  });
  return [...edges.values()].filter(edge => edge.count === 1).map(edge => edge.points);
}

function commonBoundaryAnchors(a, b, gap) {
  const anchors = [];
  for (const [p, q] of boundaryEdges(a)) for (const edge of boundaryEdges(b)) {
    const direction = unit(sub(q, p)), extent = length(sub(q, p));
    const [r, s] = edge.map(point => sub(point, mul(a.normal, gap)));
    if (length(cross(direction, sub(r, p))) > EPS ||
      length(cross(direction, sub(s, p))) > EPS) continue;
    const ends = [dot(sub(r, p), direction), dot(sub(s, p), direction)].sort((x, y) => x - y);
    const low = Math.max(0, ends[0]), high = Math.min(extent, ends[1]);
    if (high - low > EPS) anchors.push(add(p, mul(direction, (low + high) / 2)));
  }
  return anchors.sort((p, q) => q[1] - p[1] || q[0] - p[0] || q[2] - p[2]);
}

const planPoint = p => [p[0], 0, p[2]];
const planCross = (a, b) => a[0] * b[2] - a[2] * b[0];

function lineIntersection(a, b) {
  const u = sub(a[1], a[0]), v = sub(b[1], b[0]), denominator = planCross(u, v);
  if (Math.abs(denominator) < ANGULAR * length(u) * length(v)) return null;
  const delta = sub(b[0], a[0]);
  const t = planCross(delta, v) / denominator, s = planCross(delta, u) / denominator;
  return { point: add(a[0], mul(u, t)), t, s };
}

function segmentIntersection(a, b) {
  const hit = lineIntersection(a, b);
  if (!hit) return null;
  const { t, s } = hit, u = sub(a[1], a[0]), v = sub(b[1], b[0]);
  if (t < -EPS / length(u) || t > 1 + EPS / length(u) ||
    s < -EPS / length(v) || s > 1 + EPS / length(v)) return null;
  return { point: add(a[0], mul(u, Math.max(0, Math.min(1, t)))), t, s };
}

function insidePlan(point, mesh) {
  return mesh.some(triangle => triangle.points.every((p, i) =>
    planCross(sub(triangle.points[(i + 1) % 3], p), sub(point, p)) *
      Math.sign(planCross(sub(triangle.points[1], triangle.points[0]),
        sub(triangle.points[2], triangle.points[0]))) >= -EPS * EPS));
}

// Keep the silhouette of the projected surface union, not triangle or bevel seams.
function planOutline(mesh, faces = null) {
  const top = mesh.filter(triangle => triangle.normal[1] > ANGULAR);
  const raw = surfaces(top).flatMap(surface => boundaryEdges(surface))
    .map(edge => edge.map(planPoint)).filter(edge => length(sub(edge[1], edge[0])) > EPS);
  const edges = new Map();
  for (const edge of raw) {
    const direction = unit(sub(edge[1], edge[0])), extent = length(sub(edge[1], edge[0]));
    const stops = [0, extent];
    for (const other of raw) {
      const intersection = segmentIntersection(edge, other);
      if (intersection) stops.push(Math.max(0, Math.min(extent, intersection.t * extent)));
      for (const p of other) if (length(cross(direction, sub(p, edge[0]))) < EPS) {
        const t = dot(sub(p, edge[0]), direction);
        if (t > EPS && t < extent - EPS) stops.push(t);
      }
    }
    stops.sort((a, b) => a - b);
    for (let i = 1; i < stops.length; i++) {
      if (stops[i] - stops[i - 1] < EPS) continue;
      const a = add(edge[0], mul(direction, stops[i - 1]));
      const b = add(edge[0], mul(direction, stops[i]));
      const middle = average([a, b]), normal = mul([direction[2], 0, -direction[0]], EPS * 4);
      if (insidePlan(add(middle, normal), top) === insidePlan(sub(middle, normal), top)) continue;
      edges.set([key(a), key(b)].sort().join("|"), [a, b]);
    }
  }
  const result = [...edges.values()];
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < result.length && !merged; i++) for (let j = i + 1; j < result.length; j++) {
      const shared = result[i].find(p => result[j].some(q => length(sub(p, q)) < EPS));
      if (!shared || result.filter(edge => edge.some(p => length(sub(p, shared)) < EPS)).length !== 2) continue;
      const a = result[i].find(p => length(sub(p, shared)) >= EPS);
      const b = result[j].find(p => length(sub(p, shared)) >= EPS);
      if (length(cross(unit(sub(a, shared)), unit(sub(b, shared)))) > ANGULAR) continue;
      result[i] = [a, b];
      result.splice(j, 1);
      merged = true;
      break;
    }
  }
  return faces === null ? result : result.filter(edge => faces.some(face =>
    Math.abs(face.normal[1]) < ANGULAR && edge.every(point => Math.abs(dot(face.normal, point) - face.d) < EPS)));
}

function templateEdges(geometry) {
  // Arc tessellation vertices are not physical corners or straight-edge datums.
  if (geometry.referenceEdges) return geometry.referenceEdges;
  const edges = new Map();
  for (const [index, [start, end]] of (geometry.treadRanges ?? []).entries()) {
    const mesh = triangles({ ...geometry, indices: geometry.indices.subarray(start, end) });
    for (const edge of planOutline(mesh)) {
      const id = edge.map(key).sort().join("|");
      if (!edges.has(id)) edges.set(id, { edge, steps: [] });
      edges.get(id).steps.push(index + 1);
    }
  }
  return [...edges.values()];
}

function pointOnSegment(point, edge) {
  const delta = sub(edge[1], edge[0]), extent = length(delta), direction = unit(delta);
  const t = dot(sub(point, edge[0]), direction);
  return length(cross(direction, sub(point, edge[0]))) <= EPS && t >= -EPS && t <= extent + EPS;
}

function clearPlanExtension(from, to, selectedEdges, selectedTop) {
  const extent = length(sub(to, from));
  const stops = [0, 1, ...selectedEdges.map(boundary => segmentIntersection([from, to], boundary))
    .filter(Boolean).map(hit => Math.max(0, Math.min(1, hit.t)))].sort((a, b) => a - b);
  return !stops.some((t, i) => i && t - stops[i - 1] > EPS / extent &&
    insidePlan(add(from, mul(sub(to, from), (t + stops[i - 1]) / 2)), selectedTop));
}

function edgeExtensions(edge, perimeter, datums, selectedEdges, selectedTop) {
  const extensions = [];
  for (const [index, endpoint] of edge.entries()) {
    const direction = unit(sub(endpoint, edge[1 - index]));
    const ray = [endpoint, add(endpoint, direction)];
    const hits = perimeter.map(boundary => {
      const hit = lineIntersection(ray, boundary);
      const tolerance = EPS / length(sub(boundary[1], boundary[0]));
      return hit && hit.t > EPS && hit.s >= -tolerance && hit.s <= 1 + tolerance ? hit : null;
    }).filter(Boolean)
      .sort((a, b) => a.t - b.t);
    if (!hits.length) continue;
    const point = hits[0].point;
    const extension = [endpoint, point];
    if (!clearPlanExtension(endpoint, point, selectedEdges, selectedTop)) continue;
    const candidates = [];
    for (const { edge: datum, steps } of datums) {
      if (!pointOnSegment(point, datum)) continue;
      const from = [...datum].sort((a, b) => length(sub(a, point)) - length(sub(b, point)))[0];
      const value = length(sub(point, from)), aligned = value <= EPS;
      candidates.push({ from, to: aligned ? from : point, value: aligned ? 0 : value,
        kind: aligned ? "alignment" : "offset", datumEdge: datum, selectedEdge: edge,
        source: "template-extension", extension: [endpoint, aligned ? from : point],
        label: "Template corner to extended straight edge",
        reference: `Tread template perimeter: Step ${steps.join(" / ")}` });
    }
    candidates.sort((a, b) => a.value - b.value || a.reference.localeCompare(b.reference));
    if (candidates.length) extensions.push(candidates[0]);
  }
  return extensions;
}

function templateSetbacks(selectedEdges, perimeter, datums, selectedTop, arcs = []) {
  const candidates = selectedEdges.flatMap(edge =>
    edgeExtensions(edge, perimeter, datums, selectedEdges, selectedTop).map(candidate => ({
      ...candidate, kind: "offset", from: candidate.extension[0], to: candidate.extension[1],
      value: length(sub(candidate.extension[1], candidate.extension[0])),
      source: "template-setback", label: "Part corner to template perimeter along extended straight edge",
    })));
  for (const edge of selectedEdges) for (const { edge: datum, steps } of datums) {
    const direction = unit(sub(edge[1], edge[0])), normal = [direction[2], 0, -direction[0]];
    if (length(cross(direction, unit(sub(datum[1], datum[0])))) > ANGULAR) continue;
    const stations = datum.map(point => dot(sub(point, edge[0]), direction)).sort((a, b) => a - b);
    const low = Math.max(0, stations[0]), high = Math.min(length(sub(edge[1], edge[0])), stations[1]);
    if (high - low <= EPS) continue;
    const from = add(edge[0], mul(direction, (low + high) / 2));
    const gap = dot(sub(datum[0], from), normal), value = Math.abs(gap);
    if (value <= EPS) continue;
    const to = add(from, mul(normal, gap));
    if (!perimeter.some(boundary => pointOnSegment(to, boundary)) ||
      perimeter.some(boundary => {
        const hit = segmentIntersection([from, to], boundary);
        return hit && hit.t > EPS / value && hit.t < 1 - EPS / value;
      }) || !clearPlanExtension(from, to, selectedEdges, selectedTop)) continue;
    candidates.push({ from, to, value, datumEdge: datum, selectedEdge: edge,
      kind: "offset", source: "template-setback", perpendicular: true,
      label: "Perpendicular setback from part edge to template perimeter",
      reference: `Tread template perimeter: Step ${steps.join(" / ")}` });
  }
  for (const edge of selectedEdges) for (const arc of arcs) {
    const from = average(edge), direction = unit(sub(edge[1], edge[0]));
    const normal = [direction[2], 0, -direction[0]], delta = sub(from, arc.center);
    const b = dot(delta, normal), discriminant = b ** 2 - dot(delta, delta) + arc.radius ** 2;
    if (discriminant < 0) continue;
    for (const gap of [-b - Math.sqrt(discriminant), -b + Math.sqrt(discriminant)]) {
      const value = Math.abs(gap);
      if (value <= EPS || value > MAX_GAP) continue;
      const to = add(from, mul(normal, gap));
      const theta = Math.atan2(to[2] - arc.center[2], to[0] - arc.center[0]);
      const turn = Math.PI * 2, sign = Math.sign(arc.sweepRadians);
      const progress = ((theta - arc.startAngle) * sign % turn + turn) % turn;
      if (progress > Math.abs(arc.sweepRadians) + ANGULAR ||
        !clearPlanExtension(from, to, selectedEdges, selectedTop) ||
        perimeter.some(boundary => {
          const hit = segmentIntersection([from, to], boundary);
          return hit && hit.t > EPS / value && hit.t < 1 - (0.001 + EPS) / value;
        })) continue;
      const radial = unit(sub(to, arc.center)), tangent = [-radial[2], 0, radial[0]];
      candidates.push({ from, to, value, datumEdge: [sub(to, tangent), add(to, tangent)],
        selectedEdge: edge, kind: "offset", source: "template-setback", perpendicular: true,
        label: "Perpendicular setback from part edge to tread arc",
        reference: `Tread template arc: Step ${arc.steps.join(" / ")}` });
    }
  }
  const crossing = candidate => length(cross(unit(sub(candidate.to, candidate.from)),
    unit(sub(candidate.datumEdge[1], candidate.datumEdge[0]))));
  const cost = candidate => candidate.value / Math.max(ANGULAR, crossing(candidate));
  const margin = candidate => Math.min(...candidate.datumEdge.map(point => length(sub(point, candidate.to))));
  return candidates.sort((a, b) => {
    const difference = cost(a) - cost(b), angleDifference = crossing(b) - crossing(a);
    return (Math.abs(difference) > EPS ? difference : 0) ||
      (Math.abs(angleDifference) > ANGULAR ? angleDifference : 0) ||
      Number(Boolean(b.perpendicular)) - Number(Boolean(a.perpendicular)) ||
      margin(b) - margin(a) || a.reference.localeCompare(b.reference);
  });
}

function planLocations(selectedMesh, selectedFaces, contexts, relationships, view, template, node, origin, radius) {
  const planarRow = (normal, point) => [normal[0], normal[2],
    cross(sub(point, origin), normal)[1] / radius];
  const implicitRows = [];
  if (node.kind === "hardware" || node.part?.bend) {
    view.planar = { rank: 0, implicitRank: 0, required: 3, complete: false };
    return [];
  }
  const selectedEdges = planOutline(selectedMesh, node.part?.outline ? selectedFaces : null), contacts = [];
  const selectedTop = selectedMesh.filter(triangle => triangle.normal[1] > ANGULAR);
  const approachesFromOutside = (from, to) => !insidePlan(average([from, to]), selectedTop) &&
    !insidePlan(add(to, mul(unit(sub(from, to)), EPS * 4)), selectedTop);
  for (const id of view.neighbors) {
    const context = contexts.get(id);
    if (context.node.kind === "hardware") continue;
    const contact = relationships.filter(r => r.contact && r.neighbor === id && Math.abs(r.normal[1]) < ANGULAR);
    if (!contact.length) continue;
    for (const datum of planOutline(context.mesh, context.node.part?.outline ? context.faces : null)) for (const edge of selectedEdges) {
      const direction = unit(sub(datum[1], datum[0])), extent = length(sub(datum[1], datum[0]));
      if (!contact.some(r => edge.every(p => Math.abs(dot(r.normal, sub(p, planPoint(r.from)))) < EPS)) ||
        edge.some(p => length(cross(direction, sub(p, datum[0]))) > EPS)) continue;
      const stations = edge.map(p => dot(sub(p, datum[0]), direction)).sort((a, b) => a - b);
      const low = Math.max(0, stations[0]), high = Math.min(extent, stations[1]);
      if (high - low > EPS) {
        const normal = [direction[2], 0, -direction[0]];
        implicitRows.push(...[low, high].map(t => planarRow(normal, add(datum[0], mul(direction, t)))));
      }
      // A shared corner already locates this joint; do not dimension its other end.
      if (edge.some(p => datum.some(q => length(sub(p, q)) < EPS))) {
        for (const point of edge.filter(p => datum.some(q => length(sub(p, q)) < EPS))) {
          implicitRows.push(planarRow([1, 0, 0], point), planarRow([0, 0, 1], point));
        }
        continue;
      }
      for (const to of edge) {
        const t = dot(sub(to, datum[0]), direction);
        if (t <= EPS || t >= extent - EPS) continue;
        const from = [...datum].sort((a, b) => length(sub(a, to)) - length(sub(b, to)))[0];
        if (!approachesFromOutside(from, to)) continue;
        contacts.push({ from, to, value: length(sub(to, from)), datumEdge: datum,
          source: "contact-position", neighbor: id, label: "Corner to joint along contact edge",
          reference: `${context.node.name}${context.node.stepNumber != null ? ` (Step ${context.node.stepNumber})` : ""}` });
      }
    }
  }
  contacts.sort((a, b) => a.value - b.value || a.neighbor.localeCompare(b.neighbor));
  const chosen = contacts.slice(0, 1), crossings = [], datums = templateEdges(template);
  for (const point of selectedEdges.flat()) for (const { edge } of datums) {
    if (!pointOnSegment(point, edge)) continue;
    const direction = unit(sub(edge[1], edge[0]));
    implicitRows.push(planarRow([direction[2], 0, -direction[0]], point));
    if (edge.some(corner => length(sub(point, corner)) < EPS)) {
      implicitRows.push(planarRow([1, 0, 0], point), planarRow([0, 0, 1], point));
    }
  }
  if (rank(implicitRows, 3) === 3) {
    view.planar = { rank: 3, implicitRank: 3, required: 3, complete: true };
    return [];
  }
  const locationRow = dimension => {
    const direction = unit(sub(dimension.datumEdge[1], dimension.datumEdge[0]));
    if (dimension.source === "contact-position") return planarRow(direction, dimension.to);
    if (dimension.source === "template-setback") {
      return planarRow([direction[2], 0, -direction[0]], dimension.to);
    }
    const edgeDirection = unit(sub(dimension.selectedEdge[1], dimension.selectedEdge[0]));
    return planarRow([edgeDirection[2], 0, -edgeDirection[0]], dimension.to);
  };
  const existingRows = view.dimensions.map(dimension =>
    planarRow(unit(sub(dimension.to, dimension.from)), dimension.from));
  for (const { edge: datum, steps } of datums) for (const edge of selectedEdges) {
    const hit = segmentIntersection(edge, datum);
    if (!hit || hit.t * length(sub(edge[1], edge[0])) <= EPS ||
      (1 - hit.t) * length(sub(edge[1], edge[0])) <= EPS ||
      hit.s * length(sub(datum[1], datum[0])) <= EPS ||
      (1 - hit.s) * length(sub(datum[1], datum[0])) <= EPS) continue;
    const from = [...datum].sort((a, b) => length(sub(a, hit.point)) - length(sub(b, hit.point)))[0];
    if (!approachesFromOutside(from, hit.point)) continue;
    crossings.push({ from, to: hit.point, value: length(sub(hit.point, from)), datumEdge: datum, selectedEdge: edge,
      source: "template-intersection", label: "Template corner to part edge along template edge",
      seam: steps.length > 1,
      reference: steps.length > 1 ? `Tread template seam: Steps ${steps.join(" / ")}` :
        `Tread template: Step ${steps[0]} outline` });
  }
  const perimeter = planOutline(triangles(template));
  const groups = selectedEdges.map(edge => {
    const distinct = crossings.filter(candidate => candidate.selectedEdge === edge);
    const seams = distinct.filter(candidate => candidate.seam);
    const ordered = (seams.length ? seams : distinct)
      .sort((a, b) => a.to[2] - b.to[2] ||
        dot(sub(a.to, b.to), sub(edge[1], edge[0])) || a.reference.localeCompare(b.reference));
    const extensions = ordered.length < 2 ? edgeExtensions(edge, perimeter, datums, selectedEdges, selectedTop) : [];
    return { edge, ordered, extensions, span: length(sub(edge[1], edge[0])),
      offset: [...ordered, ...extensions].reduce((sum, candidate) => sum + candidate.value, 0) /
        Math.max(1, ordered.length + extensions.length) };
  }).filter(group => group.ordered.length || group.extensions.length);
  const lineSpan = group => Math.max(0, ...[...group.ordered, ...group.extensions].flatMap(a =>
    [...group.ordered, ...group.extensions].map(b => length(sub(a.to, b.to)))));
  groups.sort((a, b) => Number(lineSpan(b) > EPS) - Number(lineSpan(a) > EPS) ||
    (Math.abs(b.span - a.span) > EPS ? b.span - a.span : 0) ||
    lineSpan(b) - lineSpan(a) || Math.min(2, b.ordered.length) - Math.min(2, a.ordered.length) ||
    a.offset - b.offset ||
    a.edge.map(key).sort().join("|").localeCompare(b.edge.map(key).sort().join("|")));
  const group = groups[0], ordered = group?.ordered ?? [];
  // Front is +Z in the assembly frame. Keep its two extreme stations, not
  // two sides of the same seam or two short offsets at intermediate seams.
  const lineCandidates = ordered.length > 1 ? [ordered.at(-1), ordered[0]]
    : [...(group?.extensions ?? []), ...ordered];
  const lineRows = [];
  for (const candidate of lineCandidates) {
    const row = locationRow(candidate);
    if (rank([...lineRows, row], 3) <= rank(lineRows, 3)) continue;
    chosen.push(candidate);
    lineRows.push(row);
    if (rank(lineRows, 3) === 2) break;
  }
  const rows = [...implicitRows, ...existingRows, ...chosen.map(locationRow)];
  if (group) {
    const direction = unit(sub(group.edge[1], group.edge[0]));
    if (rank(rows, 3) < 3) {
      const endEdges = selectedEdges.filter(edge => edge !== group.edge &&
        edge.some(point => group.edge.some(corner => length(sub(point, corner)) < EPS)) &&
        length(cross(unit(sub(edge[1], edge[0])), direction)) > ANGULAR);
      const endLocations = endEdges.flatMap(edge => edgeExtensions(edge, perimeter, datums, selectedEdges, selectedTop))
        .sort((a, b) => length(sub(a.extension[1], a.extension[0])) - length(sub(b.extension[1], b.extension[0])) ||
          a.value - b.value || a.reference.localeCompare(b.reference));
      const fallback = groups.filter(candidate => candidate !== group)
        .flatMap(candidate => [...candidate.ordered, ...candidate.extensions]);
      const setbacks = templateSetbacks(selectedEdges, perimeter, datums, selectedTop, template.referenceArcs);
      for (const candidate of [...setbacks, ...endLocations, ...fallback]) {
        const row = locationRow(candidate);
        if (rank([...rows, row], 3) <= rank(rows, 3)) continue;
        chosen.push({ ...candidate, purpose: "longitudinal",
          label: candidate.source === "template-setback" ? candidate.label :
            "Template reference fixing longitudinal position" });
        rows.push(row);
        if (rank(rows, 3) === 3) break;
      }
    }
  }
  for (const candidate of contacts.slice(1)) {
    if (rank(rows, 3) === 3) break;
    const row = locationRow(candidate);
    if (rank([...rows, row], 3) <= rank(rows, 3)) continue;
    chosen.push(candidate);
    rows.push(row);
  }
  view.planar = { rank: rank(rows, 3), implicitRank: rank(implicitRows, 3),
    required: 3, complete: rank(rows, 3) === 3 };
  return chosen.map((dimension, index) => ({ kind: "offset", ...dimension, id: `L${index + 1}` }));
}

function rank(rows, columns = 6) {
  const matrix = rows.map(row => [...row]);
  const tolerance = columns === 3 ? ANGULAR : 1e-6;
  let pivot = 0;
  while (pivot < columns && pivot < matrix.length) {
    let bestRow = pivot, bestColumn = pivot;
    // Pivot across both axes so a small coordinate component cannot amplify rounding noise.
    for (let row = pivot; row < matrix.length; row++) for (let column = pivot; column < columns; column++) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[bestRow][bestColumn])) {
        bestRow = row;
        bestColumn = column;
      }
    }
    if (Math.abs(matrix[bestRow][bestColumn]) < tolerance) break;
    [matrix[pivot], matrix[bestRow]] = [matrix[bestRow], matrix[pivot]];
    for (const row of matrix) [row[pivot], row[bestColumn]] = [row[bestColumn], row[pivot]];
    const divisor = matrix[pivot][pivot];
    matrix[pivot] = matrix[pivot].map(v => v / divisor);
    for (let row = 0; row < matrix.length; row++) if (row !== pivot) {
      const factor = matrix[row][pivot];
      matrix[row] = matrix[row].map((v, j) => v - factor * matrix[pivot][j]);
    }
    pivot++;
  }
  return pivot;
}

function faceName(n) {
  const axis = n.findIndex(v => Math.abs(v) > 1 - ANGULAR);
  if (axis >= 0) return [
    n[0] > 0 ? "outward face" : "inward face",
    n[1] > 0 ? "top face" : "bottom face",
    n[2] > 0 ? "front face" : "back face",
  ][axis];
  if (Math.abs(n[1]) > ANGULAR) return n[1] > 0 ? "upward sloping face" : "downward sloping face";
  return Math.abs(n[0]) > Math.abs(n[2])
    ? `${n[0] > 0 ? "outward" : "inward"} angled face`
    : `${n[2] > 0 ? "front" : "back"} angled face`;
}

function dimmed(geometry) {
  return { ...geometry, colors: Float32Array.from(geometry.colors, value => 0.48 + value * 0.18) };
}

function projection(mesh, direction) {
  const [u, v] = basis(direction);
  return mesh.filter(t => dot(t.normal, direction) > ANGULAR).map(t => ({
    polygon: t.points.map(p => [dot(p, u), dot(p, v)]),
    depths: t.points.map(p => dot(p, direction)),
  })).filter(t => Math.abs(signedArea(t.polygon)) > AREA);
}

function depthAt(triangle, p) {
  const [a, b, c] = triangle.polygon, denominator = cross2(sub2(b, a), sub2(c, a));
  const beta = cross2(sub2(p, a), sub2(c, a)) / denominator;
  const gamma = cross2(sub2(b, a), sub2(p, a)) / denominator;
  return triangle.depths[0] * (1 - beta - gamma) + triangle.depths[1] * beta + triangle.depths[2] * gamma;
}

function occludes(selected, neighbor) {
  for (const a of selected) for (const b of neighbor) {
    let overlap = clip(a.polygon, b.polygon);
    if (overlap.length < 3 || Math.abs(signedArea(overlap)) <= AREA) continue;
    // Depth difference is affine: clip the overlap to the genuinely front portion.
    const input = overlap;
    overlap = [];
    for (let i = 0; i < input.length; i++) {
      const p = input[i], q = input[(i + 1) % input.length];
      const dp = depthAt(b, p) - depthAt(a, p) - EPS;
      const dq = depthAt(b, q) - depthAt(a, q) - EPS;
      if (dp >= 0) overlap.push(p);
      if ((dp < 0) !== (dq < 0)) {
        const t = dp / (dp - dq);
        overlap.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    }
    if (overlap.length >= 3 && Math.abs(signedArea(overlap)) > AREA) return true;
  }
  return false;
}

function anchorVisible(point, projected, direction) {
  const [u, v] = basis(direction), p = [dot(point, u), dot(point, v)], depth = dot(point, direction);
  for (const t of projected) {
    const sign = signedArea(t.polygon) < 0 ? -1 : 1;
    const inside = t.polygon.every((a, i) =>
      sign * cross2(sub2(t.polygon[(i + 1) % 3], a), sub2(p, a)) >= -EPS);
    if (inside && depthAt(t, p) > depth + EPS) return false;
  }
  return true;
}

export class PlacementPlanner {
  constructor(model) {
    this.model = model;
    this.occurrences = model.partTree.getLeaves().map(node => {
      const geometry = model.createNodeGeometry(node.id, 0, 0);
      let planarTriangles = null;
      if (node.part?.outline) {
        const lines = [node.part.outline, ...(node.part.holes ?? [])].flat().filter(edge => edge.type === "line");
        planarTriangles = new Set(triangles(node.part.createStockGeometry()).filter(triangle =>
          Math.abs(triangle.normal[1]) > 1 - ANGULAR || lines.some(edge => {
            const direction = sub([edge.to[0], 0, edge.to[1]], [edge.from[0], 0, edge.from[1]]);
            const normal = unit([direction[2], 0, -direction[0]]), d = dot(normal, [edge.from[0], 0, edge.from[1]]);
            return triangle.points.every(point => Math.abs(dot(normal, point) - d) < EPS);
          })).map(triangle => triangle.index));
      }
      return { node, geometry, bounds: bounds(geometry), mesh: triangles(geometry), planarTriangles };
    });
    this.cache = new Map();
    this.footprint = model.createFootprintGeometry();
    this.template = model.createFootprintGeometry(null, false, false);
  }

  plan(occurrenceId) {
    if (this.cache.has(occurrenceId)) return this.cache.get(occurrenceId);
    const selected = this.occurrences.find(item => item.node.id === occurrenceId);
    if (!selected) throw new RangeError(`Placement requires a physical occurrence: ${occurrenceId}`);
    const node = selected.node, ancestors = this.model.partTree.getAncestors(node.id);
    const moduleNode = ancestors.find(ancestor => ancestor.kind === "module");
    const module = moduleNode?.module;
    const stepAngle = this.model.steps?.[0]?.angle ?? (Math.PI / (2 * this.model.stepCount));
    const midpoint = node.stepNumber != null ? node.stepNumber - 0.5
      : module ? module.startIndex + module.steps.length / 2 : 0;
    const angle = Number.isFinite(stepAngle) ? -midpoint * stepAngle : 0;
    const geometry = rotate(selected.geometry, angle);
    const footprint = rotate(this.footprint, angle);
    const templateGeometry = rotate(this.template, angle);
    const curved = Boolean(node.part?.bend);
    const selectedMesh = triangles(geometry), selectedFaces = curved ? [] :
      surfaces(selectedMesh.filter(triangle => selected.planarTriangles === null || selected.planarTriangles.has(triangle.index)));
    const selectedBounds = bounds(geometry);
    const origin = selectedMesh.length ? average(selectedMesh.flatMap(t => t.points)) : [0, 0, 0];
    const radius = Math.max(1, ...selectedBounds.min.map((v, i) => selectedBounds.max[i] - v)
      .filter(Number.isFinite));
    const candidates = this.occurrences.filter(item => item !== selected &&
      separation(selected.bounds, item.bounds) <= MAX_GAP + EPS);
    const contexts = new Map(), relationships = [];
    for (const candidate of candidates) {
      const contextGeometry = rotate(candidate.geometry, angle), mesh = triangles(contextGeometry);
      const faces = candidate.node.part?.bend ? [] : surfaces(mesh.filter(triangle =>
        candidate.planarTriangles === null || candidate.planarTriangles.has(triangle.index)));
      contexts.set(candidate.node.id, { ...candidate, geometry: dimmed(contextGeometry), mesh, faces });
      if (curved || candidate.node.part?.bend) continue;
      for (const a of selectedFaces) for (const b of faces) {
        if (length(add(a.normal, b.normal)) > ANGULAR) continue;
        const gap = -b.d - a.d;
        if (gap < -EPS || gap > MAX_GAP + EPS) continue;
        const overlap = intersection(a, b);
        if (!overlap) continue;
        const contact = gap <= EPS;
        if (!contact && (node.kind === "hardware" || candidate.node.kind === "hardware")) continue;
        const practicalAnchors = contact ? [] : commonBoundaryAnchors(a, b, gap);
        const from = practicalAnchors[0] ?? overlap.anchor;
        const to = add(from, mul(a.normal, Math.max(0, gap)));
        if (!contact && !segmentClear(from, to, [...selectedMesh, ...mesh])) continue;
        const rows = (contact ? overlap.points : [from]).map(p =>
          [...a.normal, ...mul(cross(sub(p, origin), a.normal), 1 / radius)]);
        relationships.push({ neighbor: candidate.node.id, normal: a.normal, gap: Math.max(0, gap),
          practicalAnchors,
          from, to, contact, rows,
          reference: `${candidate.node.name}: ${faceName(b.normal)}`,
          selectedFace: faceName(a.normal) });
      }
    }
    const localTriangles = [...selectedMesh, ...[...contexts.values()].flatMap(context => context.mesh)];
    for (const relation of relationships) if (!relation.contact) {
      relation.practicalAnchors = relation.practicalAnchors.filter(point =>
        segmentClear(point, add(point, mul(relation.normal, relation.gap)), localTriangles));
      if (relation.practicalAnchors.length) {
        relation.from = relation.practicalAnchors[0];
        relation.to = add(relation.from, mul(relation.normal, relation.gap));
        relation.rows = [[...relation.normal,
          ...mul(cross(sub(relation.from, origin), relation.normal), 1 / radius)]];
      }
    }
    relationships.sort((a, b) => Number(b.contact) - Number(a.contact) ||
      Number(b.practicalAnchors.length > 0) - Number(a.practicalAnchors.length > 0) || a.gap - b.gap ||
      a.neighbor.localeCompare(b.neighbor) || a.reference.localeCompare(b.reference) ||
      key(a.from).localeCompare(key(b.from)));
    const chosen = [], rows = [];
    for (const relation of relationships) {
      const before = rank(rows), after = rank([...rows, ...relation.rows]);
      if (after <= before) continue;
      chosen.push({ ...relation, id: `placement-${chosen.length + 1}` });
      rows.push(...relation.rows);
      if (after === 6) break;
    }
    const contactRows = chosen.filter(r => r.contact).flatMap(r => r.rows);
    const contactRank = rank(contactRows);
    const unresolved = [];
    if (curved) unresolved.push("Bent plywood is shown in its installed shape. Automatic placement dimensions and contacts are not inferred from curved-surface tessellation; use Details for the flat cutting pattern.");
    if (!selectedFaces.length) unresolved.push("Selected geometry has no usable finite planar surfaces.");
    if (!chosen.length) unresolved.push("No verified opposing finite-face reference within 6 inches.");
    if (contactRank < 6) {
      unresolved.push(`Surface contacts constrain ${contactRank}/6 local pose freedoms; remaining sliding/rotation is not self-locating.`);
    }
    unresolved.push("Construction intent is not supplied by the model. Face contacts and measured clearances are geometric evidence, not a fastening or installation specification.");
    const views = STANDARD_VIEWS.map(standard => ({
      name: standard.name === "Top" ? "Up" : standard.name === "Bottom" ? "Down" : standard.name,
      standardView: standard.name, direction: standard.direction,
      neighbors: [], occluded: [], dimensions: [], notes: [],
    }));
    const usefulIds = curved ? [...contexts.keys()]
      : [...new Set([...chosen, ...relationships.filter(r => r.contact)].map(r => r.neighbor))];
    if (node.kind === "hardware" || usefulIds.some(id => contexts.get(id).node.kind === "hardware")) {
      unresolved.push("Hardware geometry is approximate: contacts describe the mesh only; verify the real mounting plate, installed height and fastener pattern. No hardware clearance dimensions are generated.");
    }
    for (const view of views) {
      const selectedProjection = projection(selectedMesh, view.direction);
      const retainedProjection = [...selectedProjection];
      for (const id of usefulIds) {
        const projected = projection(contexts.get(id).mesh, view.direction);
        if (occludes(selectedProjection, projected)) view.occluded.push(id);
        else {
          view.neighbors.push(id);
          retainedProjection.push(...projected);
        }
      }
      view._projection = retainedProjection;
      if (view.occluded.length) view.notes.push("Relevant context elided because actual projected surfaces obscure the selected part; inspect another view or the preview.");
    }
    for (const relation of chosen) {
      const eligible = views.filter(view => view.neighbors.includes(relation.neighbor) &&
        Math.abs(dot(relation.normal, view.direction)) < ANGULAR);
      if (relation.contact) {
        if (!eligible.length) unresolved.push(`${relation.reference}: Placement needs a section or additional reference to explain this contact.`);
        for (const view of eligible) {
          view.notes.push(`Surface contact: ${relation.selectedFace} against ${relation.reference}.`);
        }
        continue;
      }
      let view;
      for (const candidateView of eligible) {
        const anchor = relation.practicalAnchors.find(point =>
          anchorVisible(point, candidateView._projection, candidateView.direction) &&
          anchorVisible(add(point, mul(relation.normal, relation.gap)),
            candidateView._projection, candidateView.direction));
        if (!anchor) continue;
        relation.from = anchor;
        relation.to = add(anchor, mul(relation.normal, relation.gap));
        view = candidateView;
        break;
      }
      if (!view) {
        unresolved.push(`${relation.reference}: Placement needs a section or additional reference (no true-length view with visible anchors).`);
        continue;
      }
      view.dimensions.push({
        id: relation.id, kind: "offset", from: relation.from, to: relation.to,
        value: relation.gap, label: "Face clearance",
        reference: relation.reference,
      });
    }
    // No angle is silently treated as determined by a box or by stock orientation.
    if (contactRank < 6) unresolved.push("No authored orientation datum: unsupported angular placement is unresolved; no angle is inferred from arbitrary mesh edges.");
    for (const view of views) {
      if (view.name === "Up") {
        const locations = planLocations(selectedMesh, selectedFaces, contexts, relationships, view, templateGeometry, node, origin, radius);
        view.dimensions.push(...locations);
        if (!view.planar.complete) {
          view.notes.push(`Top-plan references constrain ${view.planar.rank}/3 planar freedoms; placement needs an additional reference.`);
        } else {
          view.notes.push("Top-plan references constrain 3/3 planar freedoms: left-right, front-back and rotation.");
        }
        if (locations.some(dimension => dimension.source.startsWith("template-"))) {
          view.notes.push("Tread-template dimensions are horizontal plan references, not height or physical tread contact.");
        }
        if (locations.some(dimension => dimension.extension)) {
          view.notes.push("Dashed straight-edge extensions locate the part's line on the footprint; they are not physical contact.");
        }
      }
      const physical = [geometry, ...view.neighbors.map(id => contexts.get(id).geometry)];
      view.pickGeometry = view.boundsGeometry = combineGeometries(physical);
      const anchors = view.dimensions.filter(dimension => dimension.source)
        .flatMap(dimension => [dimension.from, dimension.to]);
      if (anchors.length) view.boundsGeometry = combineGeometries([view.boundsGeometry, {
        positions: new Float32Array(anchors.flat()), normals: new Float32Array(anchors.length * 3),
        colors: new Float32Array(anchors.length * 3), grain: new Float32Array(anchors.length * 4),
        indices: new Uint16Array(),
      }]);
      let triangle = 0;
      view.pickRanges = [occurrenceId, ...view.neighbors].map((id, index) => {
        const start = triangle;
        triangle += physical[index].indices.length / 3;
        return { id, start, end: triangle };
      });
      view.renderGeometry = combineGeometries([...physical, ...(view.name === "Up" ? [] : [footprint])]);
      view.status = !selectedFaces.length ? "unresolved"
        : view.dimensions.length || view.notes.some(note => note.startsWith("Surface contact"))
          ? "partial" : "no-visible-reference";
      delete view._projection;
      delete view.direction;
    }
    const previewParts = [geometry, ...usefulIds.map(id => contexts.get(id).geometry)];
    const previewPickGeometry = combineGeometries(previewParts);
    let previewTriangle = 0;
    const previewPickRanges = [occurrenceId, ...usefulIds].map((id, index) => {
      const start = previewTriangle;
      previewTriangle += previewParts[index].indices.length / 3;
      return { id, start, end: previewTriangle };
    });
    const plan = {
      title: `${node.name} (${[moduleNode?.name, node.stepNumber != null ? `Step ${node.stepNumber}` : null].filter(Boolean).join(" / ") || node.id})`,
      geometry, footprint, templateGeometry, views,
      previewGeometry: combineGeometries([...previewParts, footprint]),
      previewPickGeometry, previewPickRanges,
      status: chosen.length || views.some(view => view.dimensions.length) ? "partial" : "unresolved", unresolved,
      // Diagnostic evidence, deliberately not a declaration that the piece self-locates.
      evidence: { contactRank,
        measuredRank: rank([...contactRows, ...chosen.filter(r =>
          views.some(view => view.dimensions.some(d => d.id === r.id))).map(r =>
          [...r.normal, ...mul(cross(sub(r.from, origin), r.normal), 1 / radius)])]),
        candidateCount: candidates.length,
        relationships: chosen.map(({ rows: ignored, ...relationship }) => relationship) },
    };
    this.cache.set(occurrenceId, plan);
    return plan;
  }
}
