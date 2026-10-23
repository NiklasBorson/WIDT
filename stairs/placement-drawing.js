import { formatLength } from "./part-description.js";
import { addDimensionArrow, layoutSegmentCallouts, renderSegmentCallouts } from "./part-annotations.js";

const boundaries = new WeakMap();
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

function node(parent, name, attributes, text) {
  const child = parent.ownerDocument.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attributes)) child.setAttribute(key, value);
  if (text !== undefined) child.textContent = text;
  parent.append(child);
  return child;
}

function viewport(svg, viewer) {
  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${viewer.canvas.clientWidth} ${viewer.canvas.clientHeight}`);
}

export function renderTreadTemplate(svg, viewer, geometry) {
  viewport(svg, viewer);
  const project = index => viewer.projectPoint(Array.from(geometry.positions.subarray(index * 3, index * 3 + 3)));
  let fill = "";
  for (let i = 0; i < geometry.indices.length; i += 3) {
    const points = Array.from(geometry.indices.subarray(i, i + 3), project);
    fill += `M${points.map(point => `${point.x},${point.y}`).join("L")}Z`;
  }
  node(svg, "path", { d: fill, fill: "#4b4f55", stroke: "none" });
  let edges = boundaries.get(geometry);
  if (!edges) {
    const key = index => Array.from(geometry.positions.subarray(index * 3, index * 3 + 3),
      value => Math.round(value * 1e5)).join(",");
    const seams = new Map();
    for (const [start, end] of geometry.treadRanges) {
      const counts = new Map();
      for (let i = start; i < end; i += 3) for (let j = 0; j < 3; j++) {
        const a = geometry.indices[i + j], b = geometry.indices[i + (j + 1) % 3];
        const edgeKey = [key(a), key(b)].sort().join(":");
        const previous = counts.get(edgeKey);
        counts.set(edgeKey, { a, b, count: (previous?.count ?? 0) + 1 });
      }
      for (const [edgeKey, edge] of counts) if (edge.count === 1) seams.set(edgeKey, edge);
    }
    edges = [...seams.values()];
    boundaries.set(geometry, edges);
  }
  const lines = edges.map(({ a, b }) => {
    const from = project(a), to = project(b);
    return `M${from.x},${from.y}L${to.x},${to.y}`;
  }).join("");
  node(svg, "path", { d: lines, fill: "none", stroke: "#000", "stroke-width": 1 });
}

function measurementAxes(view, project) {
  const groups = [];
  for (const dimension of view.dimensions.filter(dimension => dimension.kind === "offset")) {
    const a = project(dimension.from), b = project(dimension.to);
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-6) throw new Error(`Placement dimension ${dimension.id} has no visible span.`);
    const direction = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    let group = groups.find(group => Math.abs(dot(group.direction, direction)) > 1 - 1e-8 &&
      Math.abs(dot(group.normal, a.map((value, axis) => value - group.origin[axis]))) < 24);
    if (!group) {
      group = { origin: a, direction, normal: [direction[1], -direction[0]], entries: [] };
      groups.push(group);
    }
    group.entries.push({ dimension, a, b, label: `${dimension.id}: ${formatLength(dimension.value)} in` });
  }
  return groups;
}

export function renderPlacementAnnotations(svg, drawing, viewer, view) {
  svg.setAttribute("font-size", 12);
  svg.setAttribute("stroke-width", 1.2);
  const project = point => {
    const p = viewer.projectPoint(point);
    return [p.x, p.y];
  };
  const initialAxes = measurementAxes(view, project);
  const calloutSpace = Math.max(0, ...initialAxes.map(group =>
    (group.entries.length + 1) * Math.max(20, ...group.entries.map(entry => entry.label.length * 4.5 + 6))));
  const lanes = Math.max(view.dimensions.length * 20, calloutSpace);
  const top = 24 + lanes, bottom = 24 + lanes;
  const side = Math.max(100 + view.dimensions.length * 20, calloutSpace + 24);
  drawing.style.minWidth = `${Math.max(720, side * 2 + 320)}px`;
  drawing.style.minHeight = `${Math.max(540, top + bottom + 320)}px`;
  viewer.setViewportInsets({ top, right: side, bottom, left: side });
  viewport(svg, viewer);
  const points = [];
  for (let i = 0; i < view.boundsGeometry.positions.length; i += 3) {
    points.push(project(Array.from(view.boundsGeometry.positions.subarray(i, i + 3))));
  }
  const center = [0, 1].map(axis => (Math.min(...points.map(p => p[axis])) +
    Math.max(...points.map(p => p[axis]))) / 2);
  const measurements = new Map();
  for (const [axisIndex, axis] of measurementAxes(view, project).entries()) {
    const middle = axis.entries.flatMap(entry => [entry.a, entry.b])
      .reduce((sum, point) => sum.map((value, i) => value + point[i] / (axis.entries.length * 2)), [0, 0]);
    if (dot(axis.normal, middle.map((value, i) => value - center[i])) < 0) {
      axis.direction = axis.direction.map(value => -value);
      axis.normal = axis.normal.map(value => -value);
    }
    const across = point => dot(axis.normal, point.map((value, i) => value - axis.origin[i]));
    const along = point => dot(axis.direction, point.map((value, i) => value - axis.origin[i]));
    const referencePoints = axis.entries.some(entry => !entry.dimension.source)
      ? points : axis.entries.flatMap(entry => [entry.a, entry.b]);
    const coordinate = Math.max(...referencePoints.map(across)) + 18;
    const origin = axis.origin.map((value, i) => value + axis.normal[i] * coordinate);
    const unit = Math.max(20, ...axis.entries.map(entry => entry.label.length * 4.5 + 6));
    const lanes = [];
    const segments = axis.entries.map(entry => {
      const [start, end] = [along(entry.a), along(entry.b)].sort((a, b) => a - b);
      return { ...entry, start, end, mid: (start + end) / 2, value: entry.dimension.value,
        short: end - start < entry.label.length * 4.5 + 12 };
    }).sort((a, b) => a.mid - b.mid);
    for (const segment of segments) {
      let lane = lanes.findIndex(entries => entries.every(other =>
        segment.end <= other.start + 1e-6 || segment.start >= other.end - 1e-6));
      if (lane < 0) { lane = lanes.length; lanes.push([]); }
      lanes[lane].push(segment);
      segment.lineAcross = lane * 12;
    }
    for (const segment of layoutSegmentCallouts(segments, unit)) {
      measurements.set(segment.dimension.id, { segment, origin, across, along, coordinate,
        axisIndex, unit, angle: Math.atan2(axis.normal[1], axis.normal[0]) * 180 / Math.PI,
        flip: axis.normal[0] < -1e-6 || (Math.abs(axis.normal[0]) <= 1e-6 && axis.normal[1] > 0) });
    }
  }
  const defs = node(svg, "defs", {});
  addDimensionArrow(defs, "placement-dimension-arrow", 5);
  const clip = node(defs, "clipPath", { id: "placement-datum-clip" });
  node(clip, "rect", { x: 0, y: top - lanes, width: viewer.canvas.clientWidth,
    height: Math.max(0, viewer.canvas.clientHeight - top - bottom + lanes * 2 + 10) });
  for (const dimension of view.dimensions) {
    const a = project(dimension.from), b = project(dimension.to);
    const group = node(svg, "g", { "data-placement": dimension.id, fill: "none",
      "font-size": 8, "stroke-width": 0.8 });
    if (dimension.extension) {
      const [from, to] = dimension.extension.map(project);
      node(group, "line", { x1: from[0], y1: from[1], x2: to[0], y2: to[1],
        "stroke-dasharray": "8 4", "data-edge-extension": "", "stroke-width": 1 });
    }
    if (dimension.kind === "alignment") {
      node(group, "circle", { cx: b[0], cy: b[1], r: 2.5 });
      node(group, "text", { x: b[0] + 5, y: b[1] - 5, fill: "currentColor" },
        `${dimension.id}: corner aligned`);
      continue;
    }
    if (dimension.kind === "angle") {
      const center = project(dimension.vertex);
      const first = a.map((value, axis) => value - center[axis]);
      const second = b.map((value, axis) => value - center[axis]);
      const firstLength = Math.hypot(...first), secondLength = Math.hypot(...second);
      if (Math.min(firstLength, secondLength) < 1e-6) {
        throw new Error(`Placement angle ${dimension.id} has a collapsed ray.`);
      }
      const angle = Math.atan2(first[0] * second[1] - first[1] * second[0], dot(first, second));
      if (Math.abs(Math.abs(angle) * 180 / Math.PI - dimension.value) > 1e-3) {
        throw new Error(`Placement angle ${dimension.id} is not shown in true projection.`);
      }
      const u = first.map(value => value / firstLength), v = second.map(value => value / secondLength);
      const start = center.map((value, axis) => value + u[axis] * 32);
      const end = center.map((value, axis) => value + v[axis] * 32);
      node(group, "path", { d: `M${center}L${center.map((value, axis) => value + u[axis] * 48)}`,
        "stroke-dasharray": "4 3" });
      node(group, "path", { d: `M${center}L${center.map((value, axis) => value + v[axis] * 48)}` });
      node(group, "path", { d: `M${start}A32,32 0 0 ${angle > 0 ? 1 : 0} ${end}` });
      const middle = Math.atan2(u[1], u[0]) + angle / 2;
      node(group, "text", { x: center[0] + Math.cos(middle) * 65,
        y: center[1] + Math.sin(middle) * 65, "text-anchor": "middle", fill: "currentColor" },
      `${dimension.id}: ${dimension.value.toFixed(2)} deg`);
      continue;
    }
    if (dimension.kind !== "offset") throw new Error(`Unsupported placement dimension: ${dimension.kind}`);
    if (dimension.datumEdge) {
      const [from, to] = dimension.datumEdge.map(project);
      node(group, "line", { x1: from[0], y1: from[1], x2: to[0], y2: to[1],
        "stroke-dasharray": "5 4", "stroke-width": 0.8, opacity: 0.7,
        "clip-path": "url(#placement-datum-clip)" });
    }
    if (dimension.perpendicular) {
      node(group, "line", { "data-perpendicular-gap": "", x1: a[0], y1: a[1], x2: b[0], y2: b[1],
        "stroke-dasharray": "4 3" });
      const edge = dimension.selectedEdge.map(project);
      const span = Math.hypot(...edge[1].map((value, i) => value - edge[0][i]));
      const gap = Math.hypot(...b.map((value, i) => value - a[i]));
      const room = Math.min(gap, ...edge.map(point => Math.hypot(...point.map((value, i) => value - a[i]))));
      if (room >= 8) {
        const along = edge[1].map((value, i) => (value - edge[0][i]) * 4 / span);
        const normal = b.map((value, i) => (value - a[i]) * 4 / gap);
        node(group, "polyline", { "data-right-angle": "", points: [
          a.map((value, i) => value + along[i]),
          a.map((value, i) => value + along[i] + normal[i]),
          a.map((value, i) => value + normal[i]),
        ].map(point => point.join(",")).join(" ") });
      }
    }
    const measurement = measurements.get(dimension.id);
    const { segment, origin, across, along, coordinate, axisIndex, unit, angle, flip } = measurement;
    const frame = node(group, "g", { "data-placement-axis": axisIndex, "data-callout-unit": unit,
      transform: `translate(${origin.join(" ")}) rotate(${angle})` });
    for (const point of [a, b]) node(frame, "line", {
      x1: across(point) - coordinate + 3, y1: along(point),
      x2: segment.lineAcross + 4, y2: along(point),
    });
    renderSegmentCallouts(frame, [segment], "placement-dimension-arrow", flip);
    for (const p of [a, b]) node(group, "circle", { cx: p[0], cy: p[1], r: 2 });
  }
}
