const cache = new WeakMap();
const dot = (a, b) => a.reduce((sum, value, axis) => sum + value * b[axis], 0);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export function getProfileChains(geometry, view) {
  let views = cache.get(geometry);
  if (!views) cache.set(geometry, views = new Map());
  const key = [...view.direction, ...view.up].join(",");
  if (views.has(key)) return views.get(key);
  const axes = [0, 1, 2].filter(axis => !view.direction[axis]);
  const { positions, indices } = geometry;
  let scale = 1;
  for (const value of positions) scale = Math.max(scale, Math.abs(value));
  const tolerance = scale * 1e-7;
  const edges = points => points.map((a, index) => {
    const b = points[(index + 1) % points.length];
    const dx = b[axes[0]] - a[axes[0]], dy = b[axes[1]] - a[axes[1]];
    const length = Math.hypot(dx, dy);
    return { a, b, dx: dx / length, dy: dy / length, length };
  });
  const distance = (edge, point) =>
    edge.dx * (point[axes[1]] - edge.a[axes[1]]) -
    edge.dy * (point[axes[0]] - edge.a[axes[0]]);
  const triangles = [];
  for (let i = 0; i < indices.length; i += 3) {
    const points = [0, 1, 2].map(corner =>
      Array.from(positions.subarray(indices[i + corner] * 3, indices[i + corner] * 3 + 3)));
    const normal = cross(points[1].map((value, axis) => value - points[0][axis]),
      points[2].map((value, axis) => value - points[0][axis]));
    if (dot(normal, view.direction) <= tolerance * tolerance) continue;
    if (distance(edges(points)[0], points[2]) < 0) [points[1], points[2]] = [points[2], points[1]];
    triangles.push(edges(points));
  }
  const boundary = [];
  for (const triangle of triangles) for (const edge of triangle) {
    let spans = [[0, 1]];
    for (const other of triangles) {
      if (other === triangle) continue;
      let low = 0, high = 1;
      for (const plane of other) {
        const start = distance(plane, edge.a), delta = distance(plane, edge.b) - start;
        if (Math.abs(delta) <= tolerance) {
          // A coincident edge hides this edge only if its material covers the outside.
          const outside = -plane.dx * edge.dx - plane.dy * edge.dy;
          if (start < -tolerance || Math.abs(start) <= tolerance && outside <= 0) {
            high = -1;
            break;
          }
        } else if (delta > 0) low = Math.max(low, -start / delta);
        else high = Math.min(high, -start / delta);
      }
      if (high <= low) continue;
      spans = spans.flatMap(([a, b]) => high <= a || low >= b ? [[a, b]] :
        [[a, Math.min(b, low)], [Math.max(a, high), b]].filter(([a, b]) => (b - a) * edge.length > tolerance));
      if (!spans.length) break;
    }
    for (const span of spans) boundary.push(span.map(t =>
      edge.a.map((value, axis) => value + t * (edge.b[axis] - value))));
  }
  const vertices = [];
  for (const segment of boundary) for (const [index, point] of segment.entries()) {
    let vertex = vertices.find(vertex => axes.every(axis => Math.abs(vertex.point[axis] - point[axis]) <= tolerance));
    if (!vertex) {
      vertex = { point, directions: [] };
      vertices.push(vertex);
    }
    const other = segment[1 - index], length = Math.hypot(...axes.map(axis => other[axis] - point[axis]));
    if (length > tolerance) vertex.directions.push(axes.map(axis => (other[axis] - point[axis]) / length));
  }
  const corners = vertices.filter(vertex => vertex.directions.some(a =>
    vertex.directions.some(b => Math.abs(a[0] * b[1] - a[1] * b[0]) > 1e-5))).map(vertex => vertex.point);
  const right = cross(view.up, view.direction);
  const chains = axes.flatMap(axis => {
    const perpendicular = view.up[axis] ? right : view.up;
    const stops = [];
    for (const point of corners.toSorted((a, b) => a[axis] - b[axis])) {
      if (!stops.length || Math.abs(point[axis] - stops.at(-1)[axis]) > tolerance) stops.push(point);
      else if (dot(point, perpendicular) < dot(stops.at(-1), perpendicular)) stops[stops.length - 1] = point;
    }
    return stops.length > 2 ? [{ axis, stops }] : [];
  });
  views.set(key, chains);
  return chains;
}
