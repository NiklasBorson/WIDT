const EPSILON = 1e-8;
const dot = (a, b) => a.reduce((sum, value, axis) => sum + value * b[axis], 0);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export const STOCK_VIEWS = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].flatMap((direction, axis) =>
  [1, -1].map(sign => ({
    name: `${sign > 0 ? "+" : "-"}${"XYZ"[axis]}`,
    direction: direction.map(value => sign * value),
  })));

function unit(value) {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) {
    throw new TypeError("Expected a finite three-component stock-coordinate vector.");
  }
  const magnitude = Math.hypot(...value);
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    throw new RangeError("A direction or plane normal must have a finite, nonzero magnitude.");
  }
  return value.map(component => component / magnitude);
}

export function validateViews(views) {
  const directions = views.map(view => unit(view.direction));
  if (views.length !== 6 || directions.some(direction =>
    direction.filter(value => Math.abs(value) > EPSILON).length !== 1) ||
    new Set(directions.map(direction => direction.map(value =>
      Math.abs(value) <= EPSILON ? 0 : Math.sign(value)).join(","))).size !== 6) {
    throw new RangeError("Coverage requires all six distinct stock-axis views.");
  }
}

export function assessPlaneAngle(normal, referenceNormal, views = STOCK_VIEWS) {
  validateViews(views);
  const n = unit(normal), r = unit(referenceNormal), intersection = cross(n, r);
  const magnitude = Math.hypot(...intersection);
  const valueDegrees = magnitude <= EPSILON ? 0 :
    Math.atan2(magnitude, Math.abs(dot(n, r))) * 180 / Math.PI;
  const preferredViews = views.filter(view =>
    Math.abs(dot(n, unit(view.direction))) <= EPSILON &&
    Math.abs(dot(r, unit(view.direction))) <= EPSILON).map(view => view.name);
  const needsAuxiliary = valueDegrees > 0 && preferredViews.length === 0;
  return {
    valueDegrees, normal: n, referenceNormal: r, annotationRequired: valueDegrees > 0,
    status: needsAuxiliary ? "auxiliary" : "standard", preferredViews,
    auxiliaryDirection: needsAuxiliary ? unit(intersection) : null,
  };
}
