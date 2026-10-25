const EPSILON = 1e-8;
const TAU = Math.PI * 2;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function notchRectangle({ reference, width, depth, angleRadians }) {
  if (!Array.isArray(reference) || reference.length !== 2 || !reference.every(Number.isFinite) ||
    ![width, depth, angleRadians].every(Number.isFinite) || width <= 0 || depth <= 0) {
    throw new RangeError("Rectangular notches require a finite reference, angle, and positive width and depth.");
  }
  // From the opening looking inward, reference is the left inner corner and u points right.
  const u = [Math.cos(angleRadians), Math.sin(angleRadians)], v = [-u[1], u[0]];
  return [[0, 0], [width, 0], [width, depth], [0, depth]]
    .map(([x, z]) => reference.map((value, i) => value + x * u[i] + z * v[i]));
}

export function constructionTrapezoid({ blank, trapezoid, arc }) {
  if (!blank || !arc || ![blank.length, blank.width, arc.radius].every(Number.isFinite) ||
    blank.length <= 0 || blank.width <= 0 || arc.radius <= 0 ||
    !Array.isArray(arc.center) || arc.center.length !== 2 || !arc.center.every(Number.isFinite) ||
    !trapezoid || "top" in trapezoid) {
    throw new RangeError("Plywood construction requires a rectangular blank, radial side cuts, and a finite circle.");
  }
  const tolerance = EPSILON * Math.max(1, blank.length, blank.width, arc.radius);
  const sides = ["left", "right"].map((side, index) => {
    const cut = trapezoid[side];
    if (!cut || ![cut.angleRadians, cut.inset].every(Number.isFinite) || Math.sin(cut.angleRadians) <= EPSILON) {
      throw new RangeError("Radial side cuts require a finite angle toward the blank and a finite signed inset.");
    }
    const outward = [Math.cos(cut.angleRadians), Math.sin(cut.angleRadians)];
    const normal = index === 0 ? [outward[1], -outward[0]] : [-outward[1], outward[0]];
    const offset = dot(normal, arc.center) + cut.inset;
    const topX = offset / normal[0], bottomX = (offset - normal[1] * blank.width) / normal[0];
    const bottom = [index === 0 ? 0 : blank.length, blank.width];
    if (Math.abs(bottomX - bottom[0]) > tolerance) {
      throw new RangeError("Radial side cuts must meet the corresponding bottom corners of the original blank.");
    }
    return { side, angleRadians: cut.angleRadians, inset: cut.inset, normal, offset, outward, top: [topX, 0], bottom,
      guide: { from: arc.center.map((value, axis) => value + arc.radius * outward[axis]), to: [...arc.center] } };
  });
  if (sides[0].top[0] < -tolerance || sides[1].top[0] > blank.length + tolerance ||
    sides[0].top[0] >= sides[1].top[0]) {
    throw new RangeError("Radial side cuts must trim inward, nonoverlapping corners of the original blank.");
  }
  return { sides, vertices: [sides[0].top, sides[1].top, sides[1].bottom, sides[0].bottom] };
}

export function constructionOutline(construction) {
  const { arc, notches } = construction;
  const { sides } = constructionTrapezoid(construction);
  const planes = [...sides, { normal: [0, 1], offset: 0 }];
  const outwardPoint = (point, direction) => {
    const relative = point.map((value, i) => value - arc.center[i]);
    const projection = dot(relative, direction);
    const radicand = projection ** 2 + arc.radius ** 2 - dot(relative, relative);
    if (radicand < -EPSILON) throw new RangeError("A notch side does not intersect the arc.");
    const depth = -projection + Math.sqrt(Math.max(0, radicand));
    return { point: point.map((value, i) => value + depth * direction[i]), depth };
  };
  const slots = notches.map(notch => {
    const inner = notchRectangle(notch).slice(0, 2);
    const direction = [-Math.sin(notch.angleRadians), Math.cos(notch.angleRadians)];
    const outer = inner.map(point => {
      const intersection = outwardPoint(point, direction);
      if (intersection.depth < -EPSILON || intersection.depth > notch.depth + EPSILON) {
        throw new RangeError("The rectangular notch must open through the arc.");
      }
      for (const plane of planes.filter(plane => plane.outward)) {
        if (Math.abs(dot(plane.normal, point) - plane.offset) < EPSILON * Math.hypot(...plane.normal)) {
          const magnitude = Math.hypot(...plane.outward);
          return outwardPoint(point, plane.outward.map(value => value / magnitude)).point;
        }
      }
      return intersection.point;
    });
    return { inner, outer, start: Math.atan2(outer[1][1] - arc.center[1], outer[1][0] - arc.center[0]),
      end: Math.atan2(outer[0][1] - arc.center[1], outer[0][0] - arc.center[0]) };
  }).sort((a, b) => a.start - b.start);
  const circlePoint = angle => arc.center.map((value, i) => value + arc.radius * [Math.cos(angle), Math.sin(angle)][i]);
  let cursor = 0, outline = [{ type: "line", from: [...arc.center], to: circlePoint(0) }];
  for (const slot of slots) {
    if (slot.start < cursor - EPSILON || slot.end <= slot.start) throw new RangeError("Plywood notches overlap or reverse.");
    if (slot.start > cursor + EPSILON) outline.push({ type: "arc", ...arc, startAngle: cursor, sweepRadians: slot.start - cursor });
    outline.push({ type: "line", from: slot.outer[1], to: slot.inner[1] },
      { type: "line", from: slot.inner[1], to: slot.inner[0] },
      { type: "line", from: slot.inner[0], to: slot.outer[0] });
    cursor = slot.end;
  }
  outline.push({ type: "arc", ...arc, startAngle: cursor, sweepRadians: Math.PI - cursor },
    { type: "line", from: circlePoint(Math.PI), to: [...arc.center] });
  for (const { normal, offset } of planes) outline = clipOutline(outline, normal, offset);
  validateOutline(outline);
  return outline;
}

export function outlinePoint(edge, t) {
  if (edge.type === "line") return edge.from.map((value, i) => value + (edge.to[i] - value) * t);
  const angle = edge.startAngle + edge.sweepRadians * t;
  return edge.center.map((value, i) => value + edge.radius * [Math.cos(angle), Math.sin(angle)][i]);
}

function angleParameter(edge, angle) {
  const direction = Math.sign(edge.sweepRadians);
  const delta = ((angle - edge.startAngle) * direction % TAU + TAU) % TAU;
  return delta / Math.abs(edge.sweepRadians);
}

export function outlineExtrema(edge) {
  const ts = [0, 1];
  if (edge.type === "arc") for (let i = 0; i < 4; i++) {
    const t = angleParameter(edge, i * Math.PI / 2);
    if (t > EPSILON && t < 1 - EPSILON) ts.push(t);
  }
  return ts.sort((a, b) => a - b).map(t => outlinePoint(edge, t));
}

export function outlineBounds(outline) {
  const points = outline.flatMap(outlineExtrema);
  return {
    min: [0, 1].map(i => Math.min(...points.map(point => point[i]))),
    max: [0, 1].map(i => Math.max(...points.map(point => point[i]))),
  };
}

export function outlineArea(outline) {
  return outline.reduce((sum, edge) => {
    const a = outlinePoint(edge, 0), b = outlinePoint(edge, 1);
    return sum + (edge.type === "line" ? a[0] * b[1] - b[0] * a[1]
      : edge.center[0] * (b[1] - a[1]) - edge.center[1] * (b[0] - a[0]) +
        edge.radius ** 2 * edge.sweepRadians);
  }, 0) / 2;
}

export function validateOutline(outline) {
  const point = value => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
  if (!Array.isArray(outline) || outline.length < 2 || outline.some(edge =>
    !edge || (edge.type === "line" ? !point(edge.from) || !point(edge.to) || distance(edge.from, edge.to) < EPSILON
      : edge.type !== "arc" || !point(edge.center) || !Number.isFinite(edge.radius) || edge.radius <= 0 ||
        !Number.isFinite(edge.startAngle) || !Number.isFinite(edge.sweepRadians) ||
        Math.abs(edge.sweepRadians) < EPSILON || Math.abs(edge.sweepRadians) >= TAU))) {
    throw new RangeError("Plywood outlines require finite, nondegenerate line or circular-arc edges.");
  }
  for (let i = 0; i < outline.length; i++) {
    if (distance(outlinePoint(outline[i], 1), outlinePoint(outline[(i + 1) % outline.length], 0)) > EPSILON) {
      throw new RangeError("Plywood outline edges must form a continuous closed path.");
    }
  }
  if (outlineArea(outline) <= EPSILON) throw new RangeError("Plywood outlines must enclose positive counterclockwise area.");
}

export function tessellateOutline(outline, sag = 0.001) {
  if (!Number.isFinite(sag) || sag <= 0) throw new RangeError("Arc tessellation sag must be positive and finite.");
  return outline.flatMap(edge => {
    if (edge.type === "line") return [[...edge.from]];
    const count = Math.ceil(Math.abs(edge.sweepRadians) /
      (2 * Math.acos(Math.max(-1, 1 - sag / edge.radius))));
    const ts = Array.from({ length: count }, (_, i) => i / count);
    for (let i = 0; i < 4; i++) {
      const t = angleParameter(edge, i * Math.PI / 2);
      if (t > EPSILON && t < 1 - EPSILON) ts.push(t);
    }
    return ts.sort((a, b) => a - b).filter((t, i, all) => i === 0 || t - all[i - 1] > EPSILON)
      .map(t => outlinePoint(edge, t));
  });
}

// Retain the main connected component; a boundary notch can detach a small corner.
export function clipOutline(outline, normal, offset) {
  const retained = [];
  for (const edge of outline) {
    const ts = [0, 1];
    if (edge.type === "line") {
      const a = dot(normal, edge.from) - offset, b = dot(normal, edge.to) - offset;
      if (a * b < 0) ts.push(a / (a - b));
    } else {
      const ratio = (offset - dot(normal, edge.center)) / (Math.hypot(...normal) * edge.radius);
      if (Math.abs(ratio) <= 1) {
        const direction = Math.atan2(normal[1], normal[0]), delta = Math.acos(ratio);
        for (const angle of [direction - delta, direction + delta]) {
          const t = angleParameter(edge, angle);
          if (t > EPSILON && t < 1 - EPSILON) ts.push(t);
        }
      }
    }
    ts.sort((a, b) => a - b);
    for (let i = 0; i < ts.length - 1; i++) {
      const from = ts[i], to = ts[i + 1];
      if (to - from < EPSILON || dot(normal, outlinePoint(edge, (from + to) / 2)) < offset - EPSILON) continue;
      if (edge.type === "line" &&
        Math.abs(dot(normal, edge.from) - offset) < EPSILON &&
        Math.abs(dot(normal, edge.to) - offset) < EPSILON &&
        dot([normal[1], -normal[0]], edge.to.map((value, j) => value - edge.from[j])) < 0) continue;
      retained.push(edge.type === "line"
        ? { type: "line", from: outlinePoint(edge, from), to: outlinePoint(edge, to) }
        : { ...edge, startAngle: edge.startAngle + edge.sweepRadians * from, sweepRadians: edge.sweepRadians * (to - from) });
    }
  }
  if (!retained.length) throw new RangeError("A rib boundary removes its entire outline.");
  const gap = retained.findIndex((edge, i) =>
    distance(outlinePoint(edge, 1), outlinePoint(retained[(i + 1) % retained.length], 0)) > EPSILON);
  if (gap < 0) return retained;
  const ordered = [...retained.slice(gap + 1), ...retained.slice(0, gap + 1)], runs = [];
  for (const edge of ordered) {
    if (!runs.length || distance(outlinePoint(runs.at(-1).at(-1), 1), outlinePoint(edge, 0)) > EPSILON) runs.push([]);
    runs.at(-1).push(edge);
  }
  const tangent = [normal[1], -normal[0]], unused = new Set(runs.keys()), components = [];
  while (unused.size) {
    const first = unused.values().next().value, component = [];
    let current = first;
    do {
      unused.delete(current);
      component.push(...runs[current]);
      const end = outlinePoint(runs[current].at(-1), 1);
      const candidates = [...unused, first].map(index => {
        const start = outlinePoint(runs[index][0], 0);
        return { index, start, along: dot(tangent, start.map((value, j) => value - end[j])) };
      }).filter(candidate => candidate.along >= -EPSILON).sort((a, b) => a.along - b.along);
      if (!candidates.length) throw new RangeError("Clipped plywood boundary cannot be closed.");
      const next = candidates[0];
      if (distance(end, next.start) > EPSILON) component.push({ type: "line", from: end, to: next.start });
      current = next.index;
    } while (current !== first);
    components.push(component);
  }
  return components.reduce((largest, component) => outlineArea(component) > outlineArea(largest) ? component : largest);
}
