import { formatLength, getSimpleEdgeBevel } from "./part-description.js";
import { STANDARD_VIEWS } from "./renderer.js";
import { getPartFeatures } from "./part-dimensions.js";
import { getProfileChains } from "./part-profile.js";
import { partViewLabel } from "./parts.js";
export { getPartFeatures } from "./part-dimensions.js";

const EPSILON = 1e-8;
const LANE = 28;
const FONT_SIZE = 9;
const CHARACTER_WIDTH = 5.25;
const LINE_HEIGHT = 13;
const CALLOUT_GAP = 10;
const ANGLE_SIZE = 66;
const ANGLE_GAP = 9;
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a, b) => a.reduce((sum, value, axis) => sum + value * b[axis], 0);

function routeCallout(start, end, labels) {
  const axes = ["x", "y"].map((axis, i) => [...new Set([start[axis], end[axis],
    ...labels.flatMap(box => i ? [box.top - 4, box.bottom + 4] : [box.left - 4, box.right + 4])])].sort((a, b) => a - b));
  const [xs, ys] = axes, columns = xs.length;
  const index = point => ys.indexOf(point.y) * columns + xs.indexOf(point.x);
  const point = index => ({ x: xs[index % columns], y: ys[Math.floor(index / columns)] });
  const clear = (a, b) => labels.every(box =>
    Math.max(a.x, b.x) <= box.left - 2 || Math.min(a.x, b.x) >= box.right + 2 ||
    Math.max(a.y, b.y) <= box.top - 2 || Math.min(a.y, b.y) >= box.bottom + 2);
  const first = index(start), last = index(end), distance = new Map([[first, 0]]), previous = new Map();
  const open = new Set([first]), closed = new Set();
  const estimate = node => distance.get(node) + Math.abs(point(node).x - end.x) + Math.abs(point(node).y - end.y);
  while (open.size) {
    const current = [...open].reduce((best, node) => estimate(node) < estimate(best) ? node : best);
    if (current === last) {
      const path = [];
      for (let node = last; node !== undefined; node = previous.get(node)) path.unshift(point(node));
      return path.filter((p, i) => !i || i === path.length - 1 ||
        (p.x - path[i - 1].x) * (path[i + 1].y - p.y) !== (p.y - path[i - 1].y) * (path[i + 1].x - p.x));
    }
    open.delete(current);
    closed.add(current);
    const a = point(current), x = current % columns, y = Math.floor(current / columns);
    const neighbors = [x > 0 ? current - 1 : -1, x + 1 < columns ? current + 1 : -1,
      y > 0 ? current - columns : -1, y + 1 < ys.length ? current + columns : -1];
    for (const next of neighbors) {
      if (next < 0 || closed.has(next)) continue;
      const b = point(next), cost = distance.get(current) + Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      if (!clear(a, b) || cost >= (distance.get(next) ?? Infinity)) continue;
      distance.set(next, cost);
      previous.set(next, current);
      open.add(next);
    }
  }
  return null;
}

function wrapLines(lines, width) {
  const limit = Math.max(12, Math.floor((width - 16) / CHARACTER_WIDTH));
  return lines.flatMap(line => {
    const wrapped = [];
    for (const word of line.match(/-?\d+ \d+\/\d+|\S+/g) ?? []) {
      if (!wrapped.length || wrapped.at(-1).length + word.length + 1 > limit) wrapped.push(word);
      else wrapped[wrapped.length - 1] += ` ${word}`;
    }
    return wrapped;
  });
}

function svgNode(parent, name, attributes = {}, content) {
  const node = parent.ownerDocument.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (content !== undefined) node.textContent = content;
  parent.append(node);
  return node;
}

function text(parent, x, y, lines, attributes = {}) {
  const node = svgNode(parent, "text", { x, y, "xml:space": "preserve", ...attributes });
  for (const [i, line] of lines.entries()) {
    svgNode(node, "tspan", { x, dy: i ? LINE_HEIGHT : 0 }, line);
  }
  return node;
}

export function addDimensionArrow(parent, id = "part-dimension-arrow", size = 8) {
  const marker = svgNode(parent, "marker", {
    id, viewBox: "0 0 8 8", refX: 7, refY: 4,
    markerWidth: size, markerHeight: size, orient: "auto-start-reverse", markerUnits: "userSpaceOnUse",
  });
  svgNode(marker, "path", { d: "M 1 1 L 7 4 L 1 7", fill: "none", stroke: "currentColor" });
}

export function layoutSegmentCallouts(segments, unit) {
  const result = segments.map(segment => ({ ...segment, calloutAlong: segment.mid - unit }));
  for (let i = result.length - 2; i >= 0; i--) {
    result[i].calloutAlong = Math.min(result[i].calloutAlong, result[i + 1].calloutAlong - unit);
  }
  let column = 1;
  for (const [index, segment] of result.entries()) {
    if (index) {
      const previous = result[index - 1];
      const clear = segment.calloutAlong >= previous.calloutAlong + unit - EPSILON &&
        segment.calloutAlong >= previous.mid;
      column = clear ? 1 : column + 1;
    }
    segment.calloutAcross = (segment.lineAcross ?? 0) + column * unit;
  }
  return result;
}

export function renderSegmentCallouts(parent, segments, arrowId = "part-dimension-arrow", flipLabels = false) {
  for (const segment of segments) {
    const { start, end, mid, label, short, value, lineAcross = 0 } = segment;
    const entry = svgNode(parent, "g", { class: "part-profile-dimension",
      "data-value": value, "data-short-span": short });
    const line = (x1, y1, x2, y2, attributes = {}) =>
      svgNode(entry, "line", { x1, y1, x2, y2, ...attributes });
    if (short) {
      line(lineAcross, start, lineAcross, end);
      for (const [tail, tip] of [[start - 12, start], [end + 12, end]]) {
        line(lineAcross, tail, lineAcross, tip, { "marker-end": `url(#${arrowId})` });
      }
    } else line(lineAcross, start, lineAcross, end, {
      "marker-start": `url(#${arrowId})`, "marker-end": `url(#${arrowId})`,
    });
    const x = segment.calloutAcross, y = segment.calloutAlong;
    svgNode(entry, "polyline", { class: "part-profile-label-leader", fill: "none",
      points: `${lineAcross + 3},${mid} ${x},${mid} ${x},${y}` });
    text(entry, x, y, [label], { "text-anchor": flipLabels ? "end" : "start", fill: "currentColor",
      ...(flipLabels ? { transform: `rotate(180 ${x} ${y})` } : {}) });
  }
}

export function renderPartCompass(svg, viewer, views = STANDARD_VIEWS) {
  svg.replaceChildren();
  svg.setAttribute("viewBox", "0 0 144 144");
  const origin = viewer.projectPoint([0, 0, 0]);
  svgNode(svg, "circle", { cx: 72, cy: 72, r: 69, class: "part-compass-background" });
  const star = svgNode(svg, "g", { "aria-hidden": "true" });
  for (const rotation of [0, 90, 180, 270]) {
    const arm = svgNode(star, "g", { transform: `rotate(${rotation} 72 72)` });
    svgNode(arm, "path", { d: "M72 72L65 65L72 48Z", class: "part-compass-dark" });
    svgNode(arm, "path", { d: "M72 72L72 48L79 65Z", class: "part-compass-light" });
  }
  svgNode(star, "circle", { cx: 72, cy: 72, r: 3 });
  const labels = [];
  for (const view of views) {
    const point = viewer.projectPoint(view.direction);
    const x = point.x - origin.x, y = point.y - origin.y, length = Math.hypot(x, y);
    if (length < EPSILON) continue;
    const label = partViewLabel(view.name);
    const side = Math.abs(x) > Math.abs(y) ? x > 0 ? "right" : "left" : y > 0 ? "below" : "above";
    labels.push(`${label} ${side}`);
    svgNode(svg, "text", {
      x: 72 + x / length * 48, y: 72 + y / length * 48,
      "text-anchor": "middle", "dominant-baseline": "central",
    }, label);
  }
  svg.setAttribute("aria-label", `Orientation compass: ${labels.join(", ")}`);
}

export function renderPartAnnotations(svg, drawing, viewer, description, views, { layoutOnly = false } = {}) {
  const width = Math.max(1, viewer.canvas.clientWidth);
  const stockView = STANDARD_VIEWS.find(view => view.name === viewer.standardView.name);
  const project = point => viewer.projectPoint(point);
  const compact = getSimpleEdgeBevel(description) !== null;
  const dimensions = [description.blank.length, description.blank.thickness, description.blank.width];
  const profileChains = description.outline ? [] : getProfileChains(viewer.geometry, stockView);
  const profileTolerance = Math.max(1, ...dimensions) * 1e-7;
  const blankLabel = axis => `${compact ? ["Length", "Thickness", "Width"][axis] :
    `Blank ${["length", "thickness", "width"][axis]}`}${
    axis === 2 && description.kind === "lumber" && description.widthTrim ? " (cut to)" : ""
  } ${formatLength(dimensions[axis])} in`;
  const center = project(dimensions.map(value => value / 2));
  const features = getPartFeatures(description, stockView, views).sort((a, b) =>
    project(a.point).x - project(b.point).x);
  const lanes = { top: [], bottom: [], left: [], right: [] };
  for (const feature of features) for (const dimension of feature.dimensions) {
    const chain = profileChains.find(chain => chain.axis === dimension.axis);
    if (chain && [dimension.from, dimension.to].every(point =>
      chain.stops.some(stop => Math.abs(stop[dimension.axis] - point[dimension.axis]) <= profileTolerance))) continue;
    const a = project(dimension.from), b = project(dimension.to);
    const direction = project(dimension.from.map((value, axis) => value + (axis === dimension.axis ? 1 : 0)));
    const horizontal = Math.abs(a.x - direction.x) > Math.abs(a.y - direction.y);
    const side = horizontal ? (a.y + b.y) / 2 < center.y ? "top" : "bottom" :
      (a.x + b.x) / 2 < center.x ? "left" : "right";
    lanes[side].push({ ...dimension, featureId: feature.id });
  }
  const bands = [true, false].map(above => {
    const entries = features.filter(feature => !feature.compact && (feature.lines.length || feature.angles.length) &&
      (project(feature.point).y < center.y - EPSILON) === above);
    if (description.construction) entries.sort((a, b) =>
      Number(b.kind === "corner-cut") - Number(a.kind === "corner-cut"));
    const columns = Math.min(Math.max(1, entries.length), 3, Math.max(1, Math.floor((width - 28) / 180)));
    const slotWidth = (width - 28) / columns;
    const wrapped = entries.map(feature => {
      const combineHeading = feature.angles.length > 0 && feature.lines.length === 1;
      const textX = feature.angles.length ? ANGLE_SIZE + ANGLE_GAP + 6 : 6;
      const textWidth = slotWidth - textX + 6;
      const lines = wrapLines(combineHeading ? [] : feature.lines, textWidth);
      let rowTop = 0;
      const angles = feature.angles.map((angle, index) => {
        const reference = angle.reference.replace(/^Square to (?:original )?blank /, "square ");
        const namedProperty = feature.name.toLowerCase().endsWith(angle.property.toLowerCase()) ?
          feature.name : `${feature.name} ${angle.property}`;
        const label = combineHeading && feature.name !== "End" ?
          angle.label.replace(`${feature.id} ${angle.property}`, `${feature.id} ${namedProperty}`) : angle.label;
        const labels = wrapLines([`${label} from ${reference[0].toLowerCase()}${reference.slice(1)} (dashed)`], textWidth);
        const headerHeight = index === 0 && lines.length ? lines.length * LINE_HEIGHT + 6 : 0;
        const textHeight = headerHeight + labels.length * LINE_HEIGHT;
        const height = Math.max(ANGLE_SIZE, textHeight + 8);
        const headerTop = rowTop + (height - textHeight) / 2;
        const result = { ...angle, labels, height, top: rowTop, headerTop, labelTop: headerTop + headerHeight };
        rowTop += height + 9;
        return result;
      });
      return { ...feature, lines, angles, textX,
        height: angles.length ? rowTop + 6 : lines.length * LINE_HEIGHT + 16 };
    });
    const rowHeights = [];
    for (let i = 0; i < wrapped.length; i += columns) {
      rowHeights.push(Math.max(...wrapped.slice(i, i + columns).map(feature => feature.height)));
    }
    return { above, features: wrapped,
      height: rowHeights.reduce((sum, height) => sum + height + 9, 0) };
  });
  const verticalAxis = stockView.up.findIndex(value => value !== 0);
  const chains = profileChains.map(chain => {
    const labelWidth = Math.max(...chain.stops.slice(1).map((point, index) =>
      `${formatLength(Math.abs(point[chain.axis] - chain.stops[index][chain.axis]))} in`.length * CHARACTER_WIDTH));
    const unit = Math.max(LANE, labelWidth + 8);
    return { ...chain, labelWidth, unit, fan: (chain.stops.length - 1) * unit };
  });
  const rightChain = chains.find(chain => chain.axis === verticalAxis);
  const bottomChain = chains.find(chain => chain.axis !== verticalAxis);
  const verticalLabelHalf = Math.max(
    blankLabel(verticalAxis).length,
    ...[...lanes.left, ...lanes.right].map(dimension => dimension.label.length),
  ) * CHARACTER_WIDTH / 2;
  const baseInsets = compact ? {
    top: features.length ? 160 : 104, bottom: features.length ? 80 : 40, left: 60, right: 24,
  } : {
    top: 104 + bands[0].height + verticalLabelHalf + (lanes.top.length + 1) * LANE,
    bottom: 24 + bands[1].height + verticalLabelHalf + lanes.bottom.length * LANE,
    left: 60 + lanes.left.length * LANE,
    right: 24 + lanes.right.length * LANE,
  };
  const height = Math.max(1, viewer.canvas.clientHeight);
  const chainSpace = {
    top: rightChain?.fan ?? 0,
    bottom: bottomChain ? LANE + bottomChain.fan + bottomChain.labelWidth : 0,
    right: Math.max(rightChain ? LANE + rightChain.fan + rightChain.labelWidth : 0,
      bottomChain ? bottomChain.fan + 20 : 0),
  };
  const insets = { ...baseInsets, top: baseInsets.top + chainSpace.top,
    bottom: baseInsets.bottom + chainSpace.bottom, right: baseInsets.right + chainSpace.right };
  viewer.setViewportInsets(insets);
  const minimumSize = {
    minHeight: `${insets.top + insets.bottom + 320}px`,
    minWidth: `${Math.max(description.construction?.openings?.length ? 720 : 360, insets.left + insets.right + 320)}px`,
  };
  if (layoutOnly) {
    Object.assign(drawing.style, minimumSize);
    return;
  }
  const corners = [0, dimensions[0]].flatMap(x =>
    [0, dimensions[1]].flatMap(y => [0, dimensions[2]].map(z => project([x, y, z]))));
  const bounds = {
    left: Math.min(...corners.map(point => point.x)), right: Math.max(...corners.map(point => point.x)),
    top: Math.min(...corners.map(point => point.y)), bottom: Math.max(...corners.map(point => point.y)),
  };
  const horizontalGap = 20 + Math.max(0, verticalLabelHalf - (bounds.bottom - bounds.top) / 2);
  const chainLayouts = chains.map(chain => {
    const horizontal = chain.axis !== verticalAxis, side = horizontal ? "bottom" : "right";
    const coordinate = bounds[side] + (horizontal ? horizontalGap : 20) + lanes[side].length * LANE;
    const stops = chain.stops.map(point => {
      const screen = project(point);
      return { point, local: horizontal ? { x: screen.y - coordinate, y: -screen.x } :
        { x: screen.x - coordinate, y: screen.y } };
    }).sort((a, b) => a.local.y - b.local.y);
    const segments = layoutSegmentCallouts(stops.slice(1).map((stop, index) => {
      const previous = stops[index];
      const start = previous.local.y, end = stop.local.y;
      const value = Math.abs(stop.point[chain.axis] - previous.point[chain.axis]);
      const label = `${formatLength(value)} in`, mid = (start + end) / 2;
      return { start, end, mid, value, label, short: end - start < label.length * CHARACTER_WIDTH + 18 };
    }), chain.unit);
    return { side, horizontal, coordinate, stops, segments, unit: chain.unit };
  });
  const verticalReferences = Object.fromEntries(["left", "right"].map(side => [side, [
    bounds.top, bounds.bottom,
    ...lanes[side].flatMap(entry => [project(entry.from).y, project(entry.to).y]),
    ...chainLayouts.filter(layout => layout.side === side).flatMap(layout =>
      layout.stops.map(stop => stop.local.y)),
  ]]));
  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("font-size", FONT_SIZE);
  svg.setAttribute("stroke-width", 1);
  svgNode(svg, "title", {}, compact ?
    "Dimensioned part views. Square ends and one full-length edge bevel. Dashed angle rays continue the original square edge; arcs show true geometric angles, not saw settings. Do not scale from screen." :
    description.construction ?
    "Construction cutting drawing. The dotted rectangle is the original blank; dashed guides show cuts. Dotted radial guidelines point toward circle center C. Side-cut insets are perpendicular distances from their authored radial guidelines toward retained material. Notch callouts locate the left inner vertex looking inward from the opening, give width along the inner edge and height toward the opening, and measure angles from blank X toward Z. Edge offsets on the blank boundary are omitted. Do not scale from screen." :
    "Dimensioned stock views. Feature IDs link views. Blank extents are not finished-edge lengths. Concentric arcs show arc-to-arc spacing and the innermost radius toward C. Angular diagrams show cut planes, not saw settings. Dashed outlines are hidden; dashed angle rays are references. Do not scale from screen.");
  const defs = svgNode(svg, "defs");
  addDimensionArrow(defs, "part-dimension-arrow", 6);
  const line = (parent, x1, y1, x2, y2, attributes = {}) =>
    svgNode(parent, "line", { x1, y1, x2, y2, ...attributes });
  const dimensionLine = (parent, x1, y1, x2, y2) => {
    const length = Math.hypot(x2 - x1, y2 - y1);
    if (length >= 16 || length < EPSILON) return line(parent, x1, y1, x2, y2, {
      "marker-start": "url(#part-dimension-arrow)", "marker-end": "url(#part-dimension-arrow)",
    });
    line(parent, x1, y1, x2, y2);
    const dx = (x2 - x1) / length, dy = (y2 - y1) / length;
    for (const [x, y, sign] of [[x1, y1, -1], [x2, y2, 1]]) {
      line(parent, x + sign * 10 * dx, y + sign * 10 * dy, x, y,
        { "marker-end": "url(#part-dimension-arrow)" });
    }
  };
  text(svg, width - 12, 20, ["inches / degrees", "Do not scale from screen",
    ...(compact && features.length ? ["Dashed: square edge"] : [])], { "text-anchor": "end" });
  const svgBounds = svg.getBoundingClientRect();
  const screenBounds = node => {
    const box = node.getBoundingClientRect();
    return {
      left: (box.left - svgBounds.left) * width / svgBounds.width,
      right: (box.right - svgBounds.left) * width / svgBounds.width,
      top: (box.top - svgBounds.top) * height / svgBounds.height,
      bottom: (box.bottom - svgBounds.top) * height / svgBounds.height,
    };
  };
  const dimension = (entry, side, index) => {
    const group = svgNode(svg, "g", {
      class: "part-feature-dimension",
      "data-feature-id": entry.featureId ?? "", "data-side": side, "data-lane": index,
    });
    svgNode(group, "title", {}, entry.reference);
    const a = project(entry.from), b = project(entry.to);
    const horizontal = side === "top" || side === "bottom";
    const sign = side === "top" || side === "left" ? -1 : 1;
    const coordinate = bounds[side] + sign * ((horizontal ? horizontalGap : 20) + index * LANE);
    if (horizontal) {
      for (const point of [a, b]) line(group, point.x, point.y + sign * 4, point.x, coordinate + sign * 7);
      dimensionLine(group, a.x, coordinate, b.x, coordinate);
      const halfLabel = Math.min(width / 2 - 8, entry.label.length * CHARACTER_WIDTH / 2);
      const labelX = Math.max(halfLabel + 8, Math.min(width - halfLabel - 8, (a.x + b.x) / 2));
      text(group, labelX, coordinate - 6, [entry.label], { "text-anchor": "middle" });
    } else {
      for (const point of [a, b]) line(group, point.x + sign * 4, point.y, coordinate + sign * 7, point.y);
      dimensionLine(group, coordinate, a.y, coordinate, b.y);
      const halfLabel = entry.label.length * CHARACTER_WIDTH / 2 + 8;
      const preferredY = bounds.bottom - bounds.top < halfLabel * 2 ? (bounds.top + bounds.bottom) / 2 :
        Math.max(bounds.top + halfLabel, Math.min(bounds.bottom - halfLabel, (a.y + b.y) / 2));
      const clearance = halfLabel + CALLOUT_GAP;
      const candidates = [preferredY, ...verticalReferences[side].flatMap(y => [y - clearance, y + clearance])];
      const labelY = candidates.filter(y => verticalReferences[side].every(reference =>
        Math.abs(y - reference) >= clearance - EPSILON))
        .reduce((best, y) => Math.abs(y - preferredY) < Math.abs(best - preferredY) ? y : best);
      const labelX = coordinate + sign * 8;
      if (Math.abs(labelY - preferredY) > EPSILON) {
        const elbowX = labelX + (sign > 0 ? 4 : -FONT_SIZE - 4), mid = (a.y + b.y) / 2;
        const endY = labelY + Math.sign(mid - labelY) * (halfLabel - 4);
        svgNode(group, "polyline", { class: "part-feature-label-leader", fill: "none",
          points: `${coordinate + sign * 3},${mid} ${elbowX},${mid} ${elbowX},${endY}` });
      }
      text(group, labelX, labelY, [entry.label], { "text-anchor": "middle",
        transform: `rotate(-90 ${labelX} ${labelY})` });
    }
  };
  for (const [side, entries] of Object.entries(lanes)) {
    entries.forEach((entry, index) => dimension(entry, side, index));
  }
  const horizontalAxis = [0, 1, 2].find(axis => axis !== verticalAxis && stockView.direction[axis] === 0);
  for (const [axis, side] of [[horizontalAxis, "top"], [verticalAxis, "left"]]) {
    const horizontal = side === "top";
    const coordinate = bounds[side] - (horizontal ? horizontalGap : 20) - lanes[side].length * LANE;
    const group = svgNode(svg, "g", { class: "part-blank-dimension", "data-side": side,
      "data-lane": lanes[side].length,
      transform: horizontal ? `translate(0 ${coordinate}) rotate(90)` : `translate(${coordinate} 0)` });
    svgNode(group, "title", {}, "Cutting-blank extent before joinery, not a finished-edge length");
    const points = [[0, 0, 0], [0, 1, 2].map(i => i === axis ? dimensions[axis] : 0)].map(point => {
      const screen = project(point);
      return horizontal ? { x: screen.y - coordinate, y: -screen.x } :
        { x: screen.x - coordinate, y: screen.y };
    });
    for (const point of points) line(group, point.x - 4, point.y, -7, point.y);
    dimensionLine(group, 0, points[0].y, 0, points[1].y);
    const y = (points[0].y + points[1].y) / 2;
    text(group, -8, y, [blankLabel(axis)], { "text-anchor": "middle", transform: `rotate(-90 -8 ${y})` });
  }

  for (const layout of chainLayouts) {
    const { horizontal, side, coordinate } = layout;
    const group = svgNode(svg, "g", { class: "part-profile-chain", "data-side": side,
      "data-callout-unit": layout.unit,
      transform: horizontal ? `translate(0 ${coordinate}) rotate(90)` : `translate(${coordinate} 0)` });
    svgNode(group, "title", {}, "Visible-profile partial dimensions; hidden and interior mesh edges are excluded.");
    for (const { local } of layout.stops) {
      line(group, local.x + 4, local.y, 7, local.y);
    }
    renderSegmentCallouts(group, layout.segments);
  }

  for (const feature of features) for (const angle of feature.angles) {
    if (!angle.directProfile) continue;
    const { vertex, cutPoint, referencePoint } = angle.directProfile;
    const anchor = project(vertex), cut = project(cutPoint), reference = project(referencePoint);
    const ray = point => {
      const length = Math.hypot(point.x - anchor.x, point.y - anchor.y);
      return { x: (point.x - anchor.x) / length, y: (point.y - anchor.y) / length, length };
    };
    const r = ray(reference), a = ray(cut), radius = Math.min(70, r.length * 0.7);
    const group = svgNode(svg, "g", { class: "part-direct-angle", "data-degrees": angle.valueDegrees });
    svgNode(group, "title", {}, `${feature.name}: ${angle.label} from the original square edge.`);
    line(group, anchor.x, anchor.y, reference.x, reference.y,
      { class: "part-angle-reference", "stroke-dasharray": "5 4" });
    line(group, anchor.x, anchor.y, cut.x, cut.y);
    svgNode(group, "path", { class: "part-angle-arc", fill: "none",
      d: `M ${anchor.x + r.x * radius} ${anchor.y + r.y * radius} A ${radius} ${radius} 0 0 ${r.x * a.y - r.y * a.x > 0 ? 1 : 0} ${anchor.x + a.x * radius} ${anchor.y + a.y * radius}` });
    const right = anchor.x > (bounds.left + bounds.right) / 2;
    const labelX = right ? bounds.right - 8 : bounds.left + 8;
    const labelY = r.y > 0 ? bounds.top - horizontalGap - 34 : bounds.bottom + 48 + chainSpace.bottom;
    const elbowX = right ? bounds.right + 8 : bounds.left - 8;
    svgNode(group, "polyline", { fill: "none",
      points: `${anchor.x + (r.x + a.x) * radius / 2},${anchor.y + (r.y + a.y) * radius / 2} ${elbowX},${anchor.y + r.y * radius} ${elbowX},${labelY - 5} ${labelX},${labelY - 5}` });
    text(group, labelX, labelY, [angle.label], { "text-anchor": right ? "end" : "start" });
  }

  const radiusGuides = [];
  const textNodes = node => node.localName === "text" ? [node] : [...node.children].flatMap(textNodes);
  const radiusLabels = textNodes(svg).map(screenBounds);
  const calloutAnchors = description.construction ?
    bands.flatMap(band => band.features.map(feature => project(feature.point))) : [];
  for (const feature of features) if (feature.radiusCenter) {
    const center = project(feature.radiusCenter);
    const rays = [{ point: feature.point, primary: true },
      ...(feature.radialGuides ?? []).map(guide => ({ point: guide.from, primary: false, guide }))].map(ray => {
      const anchor = project(ray.point), dx = center.x - anchor.x, dy = center.y - anchor.y;
      const exits = [[dx, anchor.x, 14, width - 14], [dy, anchor.y, 48, height - 14]]
        .filter(([delta]) => Math.abs(delta) > EPSILON)
        .map(([delta, coordinate, low, high]) => ((delta < 0 ? low : high) - coordinate) / delta)
        .filter(value => value > 0);
      const ratio = feature.radiusThroughBlank ? Math.min(1, ...exits) : Math.min(1, 80 / Math.hypot(dx, dy));
      return { ...ray, anchor, dx, dy, ratio, end: { x: anchor.x + dx * ratio, y: anchor.y + dy * ratio } };
    });
    const arrowY = center.y < rays[0].anchor.y ? Math.max(...rays.map(ray => ray.end.y)) :
      Math.min(...rays.map(ray => ray.end.y));
    for (const ray of rays) {
      const { anchor, dx, dy } = ray;
      const ratio = feature.radiusThroughBlank && Math.abs(dy) > EPSILON ?
        (arrowY - anchor.y) / dy : ray.ratio;
      const end = feature.radiusTo ? project(feature.radiusTo) :
        { x: anchor.x + dx * ratio, y: anchor.y + dy * ratio };
      const radius = line(svg, anchor.x, anchor.y, end.x, end.y, {
        class: `part-radius-reference${ray.primary ? "" : " part-radius-edge-reference"}`,
        "data-feature-id": feature.id,
        ...(ray.guide?.side ? { "data-cut-side": ray.guide.side, "data-cut-inset": ray.guide.inset } : {}),
        ...(feature.radiusTo ? { "data-radius-span": feature.radiusSpan } : {}),
        ...(feature.radiusCenterLabel ? { "data-center": feature.radiusCenterLabel } : {}),
        "stroke-dasharray": "1 4", "stroke-linecap": "round",
        ...(feature.radiusThroughBlank ? { "marker-end": "url(#part-dimension-arrow)" } : {}),
      });
      if (feature.radiusThroughBlank) radiusGuides.push(radius);
      svgNode(radius, "title", {}, feature.radiusTo ?
        `Concentric arc spacing: ${formatLength(feature.radiusSpan)} in toward center C.` : feature.radiusCenterLabel ?
        ratio < 1 - EPSILON ? `Toward center ${feature.radiusCenterLabel}; the arrow stops short of the off-sheet center.` :
          `Circle center ${feature.radiusCenterLabel}.` :
        "Radius direction toward the circle center; the line may be shortened.");
      if (feature.radiusThroughBlank) {
        const group = svgNode(svg, "g", { class: `part-feature-note part-feature-${ray.primary ? "arc" : "radius-edge"}`,
          "data-feature-id": feature.id });
        const callout = svgNode(group, "g", { class: "part-feature-callout" });
        text(callout, 0, 0, [feature.radiusTo ? `Arc spacing ${formatLength(feature.radiusSpan)} in` :
          ratio < 1 - EPSILON ? `To ${feature.radiusCenterLabel}` : feature.radiusCenterLabel]);
        if (ray.primary && !feature.radiusTo) text(callout, 0, LINE_HEIGHT, [`Radius ${formatLength(feature.radius)} in`]);
        const rows = ray.primary ? [0, -1, 1, -2, 2, -3, 3] : [-1, 0, -2, 1, -3, 2, 3];
        const sides = end.x > width / 2 ? [-1, 1] : [1, -1];
        let placed = false;
        for (const row of rows) {
          for (const side of sides) {
            for (const label of textNodes(callout)) label.setAttribute("text-anchor", side < 0 ? "end" : "start");
            callout.setAttribute("transform", `translate(${end.x + side * 8} ${end.y + 3 + row * LINE_HEIGHT})`);
            const boxes = textNodes(callout).map(screenBounds);
            if (boxes.some(box => box.left < 14 || box.right > width - 14 || box.top < 14 || box.bottom > height - 14 ||
              calloutAnchors.some(anchor => anchor.x > box.left - 4 && anchor.x < box.right + 4 &&
                anchor.y > box.top - 4 && anchor.y < box.bottom + 4) ||
              radiusLabels.some(other => box.left < other.right + 2 && box.right > other.left - 2 &&
                box.top < other.bottom + 2 && box.bottom > other.top - 2))) continue;
            radiusLabels.push(...boxes);
            placed = true;
            break;
          }
          if (placed) break;
        }
        if (!placed) throw new Error(`No clear radius label position for ${feature.id} in ${stockView.name} view.`);
      }
    }
  }

  for (const feature of features) if (feature.outline) {
    svgNode(svg, feature.closed ? "polygon" : "polyline", {
      class: "part-feature-outline", "data-feature-id": feature.id,
      "stroke-dasharray": feature.outlineDotted ? "1 4" : feature.hidden || feature.outlineHidden ? "5 4" : "none",
      points: feature.outline.map(point => {
        const screen = project(point);
        return `${screen.x},${screen.y}`;
      }).join(" "),
    });
  }

  const occupied = [bounds, ...calloutAnchors.map(anchor => ({
    left: anchor.x - 4, right: anchor.x + 4, top: anchor.y - 4, bottom: anchor.y + 4,
  }))];
  for (const node of svg.children) {
    if (["title", "defs"].includes(node.localName)) continue;
    if (node.getAttribute("class")?.split(" ").includes("part-radius-reference")) continue;
    const entries = node.getAttribute("class") === "part-profile-chain" ?
      [...node.children].filter(child => child.getAttribute("class") === "part-profile-dimension") : [node];
    for (const entry of entries) occupied.push(screenBounds(entry));
  }
  const dimensionLabels = [...svg.children].filter(node => node.getAttribute("class") === "part-feature-dimension" ||
    description.construction && node.getAttribute("class") === "part-blank-dimension")
    .map(node => screenBounds([...node.children].find(child => child.localName === "text")));
  dimensionLabels.push(...[...svg.children]
    .filter(node => ["part-feature-note part-feature-arc", "part-feature-note part-feature-radius-edge"]
      .includes(node.getAttribute("class"))).map(screenBounds));
  for (const band of bands) {
    for (const feature of band.features) {
      const group = svgNode(svg, "g", { class: `part-feature-note part-feature-${feature.kind}`,
        "data-feature-id": feature.id, "data-band": band.above ? "top" : "bottom" });
      const callout = svgNode(group, "g", { class: "part-feature-callout" });
      if (feature.lines.length) text(callout, feature.textX, (feature.angles[0]?.headerTop ?? 0) + 12, feature.lines);
      for (const angle of feature.angles) {
        const diagram = svgNode(callout, "g", { class: "part-angle-diagram",
          "data-property": angle.property, "data-degrees": angle.valueDegrees });
        svgNode(diagram, "title", {}, `${angle.label}; ${angle.reference}. True plane angle, not a tool setting.`);
        text(diagram, feature.textX, angle.labelTop + 12, angle.labels);
        const glyph = svgNode(diagram, "g", { class: "part-angle-glyph" });
        const profileDirection = angle.viewDirection;
        const profileView = STANDARD_VIEWS.find(view =>
          view.direction.every((value, axis) => value === profileDirection[axis]));
        const profileProjection = profileView.name === stockView.name ? project : point => {
          const right = cross(profileView.up, profileDirection);
          return { x: dot(point, right), y: -dot(point, profileView.up) };
        };
        const rayDirection = normal => {
          const ray = cross(profileDirection, normal), origin = profileProjection([0, 0, 0]);
          const projected = profileProjection(ray);
          const length = Math.hypot(projected.x - origin.x, projected.y - origin.y);
          return { x: (projected.x - origin.x) / length, y: (projected.y - origin.y) / length };
        };
        const reference = rayDirection(angle.referenceNormal);
        let actual = rayDirection(angle.normal);
        if (dot(angle.normal, angle.referenceNormal) < 0) actual = { x: -actual.x, y: -actual.y };
        const sign = reference.x < -EPSILON || Math.abs(reference.x) < EPSILON && reference.y < 0 ? -1 : 1;
        const r = { x: reference.x * sign, y: reference.y * sign };
        const a = { x: actual.x * sign, y: actual.y * sign };
        line(glyph, 0, 0, r.x * 33, r.y * 33,
          { class: "part-angle-reference", "stroke-dasharray": "5 4" });
        line(glyph, 0, 0, a.x * 33, a.y * 33);
        svgNode(glyph, "path", {
          class: "part-angle-arc", fill: "none",
          d: `M ${r.x * 22.5} ${r.y * 22.5} A 22.5 22.5 0 0 ${r.x * a.y - r.y * a.x > 0 ? 1 : 0} ${a.x * 22.5} ${a.y * 22.5}`,
          "marker-end": "url(#part-dimension-arrow)",
        });
        const box = glyph.getBBox();
        glyph.setAttribute("transform",
          `translate(${feature.textX - ANGLE_GAP - box.x - box.width} ${angle.top + angle.height / 2 - box.y - box.height / 2})`);
      }
      const anchor = project(feature.point), box = callout.getBBox();
      const candidates = [...new Set([anchor.x - box.width / 2,
        ...occupied.flatMap(other => [other.left - box.width - CALLOUT_GAP, other.right + CALLOUT_GAP])]
        .map(left => Math.max(14, Math.min(width - box.width - 14, left))))];
      const defaultElbow = band.above ? bounds.top + 4 : bounds.bottom - 4;
      const detours = [], alternatives = [];
      const clearRoute = points => dimensionLabels.every(label => points.slice(1).every((end, index) => {
        const start = points[index];
        return Math.max(start.x, end.x) <= label.left - 2 || Math.min(start.x, end.x) >= label.right + 2 ||
          Math.max(start.y, end.y) <= label.top - 2 || Math.min(start.y, end.y) >= label.bottom + 2;
      }));
      const placements = candidates.flatMap(left => {
        let top = band.above ? bounds.top - box.height - CALLOUT_GAP : bounds.bottom + CALLOUT_GAP;
        for (;;) {
          const collisions = occupied.filter(other =>
            left < other.right + CALLOUT_GAP - EPSILON && left + box.width > other.left - CALLOUT_GAP + EPSILON &&
            top < other.bottom + CALLOUT_GAP - EPSILON && top + box.height > other.top - CALLOUT_GAP + EPSILON);
          if (!collisions.length) break;
          top = band.above ? Math.min(...collisions.map(other => other.top - box.height - CALLOUT_GAP)) :
            Math.max(...collisions.map(other => other.bottom + CALLOUT_GAP));
        }
        const edge = band.above ? top + box.height : top;
        alternatives.push({ left, top, edge, distance: (left + box.width / 2 - anchor.x) ** 2 + (edge - anchor.y) ** 2 });
        const attachments = [...new Set([Math.max(left, Math.min(left + box.width, anchor.x)), left, left + box.width,
          ...dimensionLabels.flatMap(label => [label.left - CALLOUT_GAP, label.right + CALLOUT_GAP])]
          .filter(x => x >= left && x <= left + box.width))];
        if (description.construction) for (const right of [false, true]) {
          const routeX = right ? width - 4 : 4, edgeX = right ? left + box.width : left;
          const edgeY = top + box.height / 2;
          const points = [anchor, { x: routeX, y: anchor.y }, { x: routeX, y: edgeY }, { x: edgeX, y: edgeY }];
          if (clearRoute(points)) detours.push({ left, top, points,
            distance: (left + box.width / 2 - anchor.x) ** 2 + (edgeY - anchor.y) ** 2 + (routeX - anchor.x) ** 2 });
        }
        const elbows = description.construction ? [defaultElbow, anchor.y] : [defaultElbow];
        return elbows.flatMap(elbow => attachments.filter(x => feature.hidden || dimensionLabels.every(label => {
          const horizontal = elbow > label.top - 2 && elbow < label.bottom + 2 &&
            Math.min(anchor.x, x) < label.right + 2 && Math.max(anchor.x, x) > label.left - 2;
          const vertical = x > label.left - 2 && x < label.right + 2 &&
            Math.min(elbow, edge) < label.bottom + 2 && Math.max(elbow, edge) > label.top - 2;
          const initial = description.construction && anchor.x > label.left - 2 && anchor.x < label.right + 2 &&
            Math.min(anchor.y, elbow) < label.bottom + 2 && Math.max(anchor.y, elbow) > label.top - 2;
          return !horizontal && !vertical && !initial;
        })).map(edgeX => ({ left, top,
          points: [anchor, { x: anchor.x, y: elbow }, { x: edgeX, y: elbow }, { x: edgeX, y: edge }],
          distance: (left + box.width / 2 - anchor.x) ** 2 + (edge - anchor.y) ** 2 +
            (edgeX - anchor.x) ** 2 })));
      });
      const routes = placements.length ? placements : detours;
      if (!routes.length && description.construction) {
        for (const alternative of alternatives.sort((a, b) => a.distance - b.distance)) {
          const points = routeCallout(anchor, { x: alternative.left + box.width / 2, y: alternative.edge }, dimensionLabels);
          if (points) { routes.push({ ...alternative, points }); break; }
        }
      }
      if (!routes.length) throw new Error(`No clear callout-label route for ${feature.id} in ${stockView.name} view.`);
      const { left, top, points } = routes.reduce((best, next) => next.distance < best.distance ? next : best);
      callout.setAttribute("transform", `translate(${left - box.x} ${top - box.y})`);
      occupied.push({ left, right: left + box.width, top, bottom: top + box.height });
      if (description.construction) dimensionLabels.push({ left, right: left + box.width, top, bottom: top + box.height });
      if (!feature.hidden) {
        svgNode(group, "polyline", { fill: "none",
          points: points.map(point => `${point.x},${point.y}`).join(" ") });
        svgNode(group, "circle", { cx: anchor.x, cy: anchor.y, r: 2.5 });
        if (description.construction) points.slice(1).forEach((end, index) => {
          const start = points[index];
          occupied.push({ left: Math.min(start.x, end.x), right: Math.max(start.x, end.x),
            top: Math.min(start.y, end.y), bottom: Math.max(start.y, end.y) });
        });
      }
    }
  }
  if (radiusGuides.length) {
    const mask = svgNode(defs, "mask", { id: "part-radius-text-mask", maskUnits: "userSpaceOnUse",
      x: 0, y: 0, width, height, stroke: "none" });
    svgNode(mask, "rect", { x: 0, y: 0, width, height, fill: "white" });
    for (const label of textNodes(svg)) {
      const box = screenBounds(label);
      svgNode(mask, "rect", { x: box.left - 2, y: box.top - 2,
        width: box.right - box.left + 4, height: box.bottom - box.top + 4, fill: "black" });
    }
    for (const guide of radiusGuides) guide.setAttribute("mask", "url(#part-radius-text-mask)");
  }
  // Resizing during layout would change the SVG's screen bounds before measurement finishes.
  Object.assign(drawing.style, minimumSize);
}
