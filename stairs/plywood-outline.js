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

function outerConstructionOutline(construction) {
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

export const reverseOutline = outline => outline.toReversed().map(edge => edge.type === "line"
  ? { type: "line", from: [...edge.to], to: [...edge.from] }
  : { ...edge, startAngle: edge.startAngle + edge.sweepRadians, sweepRadians: -edge.sweepRadians });

function edgeSlice(edge, start, end) {
  return edge.type === "line" ? { type: "line", from: outlinePoint(edge, start), to: outlinePoint(edge, end) }
    : { ...edge, startAngle: edge.startAngle + start * edge.sweepRadians,
      sweepRadians: (end - start) * edge.sweepRadians };
}

function intersections(a, b) {
  const cross = (u, v) => u[0] * v[1] - u[1] * v[0];
  const sub = (u, v) => u.map((value, i) => value - v[i]);
  const parameter = (edge, point) => edge.type === "arc" ?
    angleParameter(edge, Math.atan2(point[1] - edge.center[1], point[0] - edge.center[0])) :
    dot(sub(point, edge.from), sub(edge.to, edge.from)) / distance(edge.to, edge.from) ** 2;
  let points;
  if (a.type === "line" && b.type === "line") {
    const u = sub(a.to, a.from), v = sub(b.to, b.from), denominator = cross(u, v);
    if (Math.abs(denominator) < EPSILON) {
      if (Math.abs(cross(sub(b.from, a.from), u)) > EPSILON * Math.hypot(...u)) return [];
      points = [a.from, a.to, b.from, b.to];
    } else points = [outlinePoint(a, cross(sub(b.from, a.from), v) / denominator)];
  } else if (a.type === "arc" && b.type === "arc") {
    const delta = sub(b.center, a.center), d = Math.hypot(...delta);
    if (d < EPSILON) return [];
    const along = (a.radius ** 2 - b.radius ** 2 + d ** 2) / (2 * d);
    const h2 = a.radius ** 2 - along ** 2;
    if (h2 < -EPSILON) return [];
    const h = Math.sqrt(Math.max(0, h2));
    points = [-1, 1].map(sign => a.center.map((value, i) =>
      value + along * delta[i] / d + sign * h * (i === 0 ? -delta[1] : delta[0]) / d));
  } else {
    const [line, arc] = a.type === "line" ? [a, b] : [b, a];
    const u = sub(line.to, line.from), relative = sub(line.from, arc.center);
    const aa = dot(u, u), bb = 2 * dot(relative, u), cc = dot(relative, relative) - arc.radius ** 2;
    const discriminant = bb ** 2 - 4 * aa * cc;
    if (discriminant < -EPSILON) return [];
    points = [-1, 1].map(sign => outlinePoint(line, (-bb + sign * Math.sqrt(Math.max(0, discriminant))) / (2 * aa)));
  }
  return points.map(point => [parameter(a, point), parameter(b, point)])
    .filter(pair => pair.every(value => value >= -EPSILON && value <= 1 + EPSILON))
    .map(pair => pair.map(value => Math.max(0, Math.min(1, value))));
}

export function profileContains(profile, point) {
  let winding = 0;
  for (const edge of [profile.outline, ...profile.holes].flat()) {
    if (edge.type === "line") {
      const [a, b] = [edge.from, edge.to];
      if ((a[1] > point[1]) === (b[1] > point[1])) continue;
      const x = a[0] + (point[1] - a[1]) * (b[0] - a[0]) / (b[1] - a[1]);
      if (x > point[0]) winding += b[1] > a[1] ? 1 : -1;
    } else {
      const sine = (point[1] - edge.center[1]) / edge.radius;
      if (Math.abs(sine) >= 1) continue;
      for (const angle of [Math.asin(sine), Math.PI - Math.asin(sine)]) {
        const t = angleParameter(edge, angle), dy = Math.cos(angle) * edge.sweepRadians;
        if (dy > 0 ? t < 0 || t >= 1 : t <= 0 || t > 1) continue;
        if (edge.center[0] + edge.radius * Math.cos(angle) > point[0]) winding += dy > 0 ? 1 : -1;
      }
    }
  }
  return winding !== 0;
}

function subtractProfile(profile, cutter) {
  const boundaries = [profile.outline, ...profile.holes].flat();
  const pieces = [];
  const retained = point => profileContains(profile, point) &&
    !profileContains({ outline: cutter, holes: [] }, point);
  for (const [edges, others] of [[boundaries, cutter], [cutter, boundaries]]) {
    for (const edge of edges) {
      const stops = [0, 1, ...others.flatMap(other => intersections(edge, other).map(pair => pair[0]))]
        .sort((a, b) => a - b).filter((value, i, all) => i === 0 || value - all[i - 1] > EPSILON);
      for (let i = 1; i < stops.length; i++) {
        let piece = edgeSlice(edge, stops[i - 1], stops[i]);
        const midpoint = outlinePoint(piece, 0.5), from = outlinePoint(piece, 0), to = outlinePoint(piece, 1);
        const dx = to[0] - from[0], dz = to[1] - from[1], length = Math.hypot(dx, dz);
        if (length < EPSILON) continue;
        const probe = Math.min(1e-5, length / 100);
        const left = retained([midpoint[0] - dz / length * probe, midpoint[1] + dx / length * probe]);
        const right = retained([midpoint[0] + dz / length * probe, midpoint[1] - dx / length * probe]);
        if (left === right) continue;
        if (right) piece = reverseOutline([piece])[0];
        if (!pieces.some(existing => distance(outlinePoint(existing, 0), outlinePoint(piece, 0)) < EPSILON &&
          distance(outlinePoint(existing, 1), outlinePoint(piece, 1)) < EPSILON &&
          distance(outlinePoint(existing, 0.5), outlinePoint(piece, 0.5)) < EPSILON)) pieces.push(piece);
      }
    }
  }
  const loops = [];
  while (pieces.length) {
    const loop = [pieces.shift()], start = outlinePoint(loop[0], 0);
    while (distance(outlinePoint(loop.at(-1), 1), start) > EPSILON * 10) {
      const end = outlinePoint(loop.at(-1), 1);
      const next = pieces.findIndex(edge => distance(outlinePoint(edge, 0), end) < EPSILON * 10);
      if (next < 0) throw new RangeError("Plywood cut boundaries do not form closed contours.");
      loop.push(pieces.splice(next, 1)[0]);
    }
    loops.push(loop);
  }
  const outline = loops.filter(loop => outlineArea(loop) > EPSILON).sort((a, b) => outlineArea(b) - outlineArea(a))[0];
  if (!outline) throw new RangeError("Plywood cuts remove the entire part.");
  return { outline, holes: loops.filter(loop => outlineArea(loop) < -EPSILON &&
    profileContains({ outline, holes: [] }, outlinePoint(loop[0], 0.5))) };
}

export function constructionProfile(construction) {
  const { innerRadius, openings = [], notches = [] } = construction;
  if (innerRadius === undefined && !openings.length) {
    return { outline: outerConstructionOutline(construction), holes: [] };
  }
  let profile = { outline: outerConstructionOutline({ ...construction, notches: [] }), holes: [] };
  if (innerRadius !== undefined) {
    if (!Number.isFinite(innerRadius) || innerRadius <= 0 || innerRadius >= construction.arc.radius) {
      throw new RangeError("An inner arc radius must be positive and smaller than the outer radius.");
    }
    profile = subtractProfile(profile, [0, Math.PI].map(startAngle => ({
      type: "arc", center: [...construction.arc.center], radius: innerRadius, startAngle, sweepRadians: Math.PI,
    })));
  }
  for (const cut of [...notches, ...openings]) {
    const points = notchRectangle(cut);
    profile = subtractProfile(profile, points.map((from, i) => ({
      type: "line", from, to: points[(i + 1) % points.length],
    })));
  }
  validateOutline(profile.outline);
  for (const hole of profile.holes) validateOutline(reverseOutline(hole));
  return profile;
}

export function constructionOutline(construction) {
  return constructionProfile(construction).outline;
}

export function validateProfile({ outline, holes = [] }) {
  validateOutline(outline);
  for (const [i, hole] of holes.entries()) {
    validateOutline(reverseOutline(hole));
    if (!profileContains({ outline, holes: [] }, outlinePoint(hole[0], 0)) ||
      hole.some(edge => outline.some(boundary => intersections(edge, boundary).length))) {
      throw new RangeError("Plywood holes must lie strictly inside the outer outline.");
    }
    for (const other of holes.slice(0, i)) {
      if (hole.some(edge => other.some(boundary => intersections(edge, boundary).length)) ||
        profileContains({ outline: reverseOutline(other), holes: [] }, outlinePoint(hole[0], 0)) ||
        profileContains({ outline: reverseOutline(hole), holes: [] }, outlinePoint(other[0], 0))) {
        throw new RangeError("Plywood holes must not overlap or contain each other.");
      }
    }
  }
}

export function bridgeProfile(profile, sag) {
  let points = tessellateOutline(profile.outline, sag);
  const holes = profile.holes.map(hole => tessellateOutline(hole, sag));
  for (const hole of holes) {
    const h = hole.reduce((best, point, i) => point[0] < hole[best][0] ? i : best, 0);
    const from = hole[h];
    const edges = [points, ...holes].flatMap(loop => loop.map((point, i) => ({
      type: "line", from: point, to: loop[(i + 1) % loop.length],
    })));
    const candidates = points.map((point, i) => ({ point, i })).sort((a, b) => distance(from, a.point) - distance(from, b.point));
    const target = candidates.find(({ point }) => {
      const segment = { type: "line", from, to: point };
      return profileContains(profile, outlinePoint(segment, 0.5)) &&
        !edges.some(edge => intersections(segment, edge).some(([t]) => t > EPSILON && t < 1 - EPSILON));
    });
    if (!target) throw new RangeError("A plywood opening cannot be connected for triangulation.");
    points = [...points.slice(0, target.i + 1), ...hole.slice(h), ...hole.slice(0, h + 1),
      target.point, ...points.slice(target.i + 1)];
  }
  return points;
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
  if (!retained.length) throw new RangeError("A construction boundary removes the entire outline.");
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
