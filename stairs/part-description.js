import { constructionTrapezoid } from "./plywood-outline.js";

export function formatLength(value) {
  if (!Number.isFinite(value)) throw new RangeError("A displayed length must be finite.");
  const thirtySeconds = Math.round(Math.abs(value) * 32);
  const roundingError = Math.abs(thirtySeconds / 32 - Math.abs(value));
  const prefix = roundingError > 0.01 + Number.EPSILON * Math.max(1, Math.abs(value)) ? "~" : "";
  const whole = Math.floor(thirtySeconds / 32);
  let numerator = thirtySeconds % 32, denominator = 32;
  if (numerator === 0) return prefix + String(value < 0 ? -whole : whole);
  while (numerator % 2 === 0) {
    numerator /= 2;
    denominator /= 2;
  }
  return `${prefix}${value < 0 ? "-" : ""}${whole ? `${whole} ` : ""}${numerator}/${denominator}`;
}

const inches = value => `${formatLength(value)} in`;
const angle = value => `${Number(value.toFixed(2))} deg`;
const faceNames = { negativeY: "Y=0 face", positiveY: "Y=thickness face" };
const cornerNames = {
  startNear: "Start / near", endNear: "End / near",
  startFar: "Start / far", endFar: "End / far",
};

export function formatPartListDescription(description) {
  if (description.kind === "hardware") {
    return { stock: "Purchased part", dimensions: "", summary: description.summary };
  }
  const { stock, cutLength, finishedWidth, widthTrim, boundingRectangle } = description;
  return {
    stock: description.kind === "lumber"
      ? `${stock.nominalSize ?? `${formatLength(stock.thickness)} x ${formatLength(stock.width)} in`} ${stock.material.toLowerCase()}`
      : `${formatLength(stock.thickness)}-inch ${stock.material.toLowerCase()}`,
    dimensions: description.kind === "lumber"
      ? `length ${inches(cutLength)}${widthTrim ? `; finished width ${inches(finishedWidth)}` : ""}`
      : `blank ${formatLength(boundingRectangle.length)} x ${formatLength(boundingRectangle.width)} in`,
    summary: formatPartDescription(description).summary,
  };
}

export function getSimpleEdgeBevel(description) {
  const { blank, notches } = description;
  if (description.kind !== "lumber" || description.widthTrim || notches.length !== 1 ||
    description.dados.length || description.edgeNotches?.length ||
    description.edgeCuts.some(cut => cut.surfaceCut ||
      Math.abs(cut.miterDegrees) > 1e-8 || Math.abs(cut.bevelDegrees) > 1e-8)) return null;
  const notch = notches[0], lengths = notch.lengths ?? [notch.length, notch.length];
  if (lengths.some(length => Math.abs(length - blank.length) > 1e-8) ||
    Math.abs(Math.min(...notch.depth)) > 1e-8 || Math.max(...notch.depth) <= 1e-8 ||
    Math.max(...notch.depth) >= blank.width - 1e-8) return null;
  const corners = [[0, 0], [blank.length, 0], [blank.length, blank.width], [0, blank.width]];
  if (Object.values(blank.profiles).some(profile => profile.length !== 4 ||
    !corners.every(corner => profile.some(point =>
      point.every((value, axis) => Math.abs(value - corner[axis]) <= 1e-8))))) return null;
  return notch;
}

export function formatPartDescription(description) {
  const { kind, stock, cutLength, finishedWidth, widthTrim, boundingRectangle, blank } = description;
  if (kind !== "lumber" && kind !== "plywood") {
    throw new TypeError("A woodworking description requires lumber or plywood.");
  }
  const material = stock.material.toLowerCase();
  const stockText = kind === "plywood"
    ? `Stock: ${formatLength(stock.thickness)}-inch ${material}.`
    : `Stock: ${stock.nominalSize ? `${stock.nominalSize} ` : ""}${material}` +
      ` (${formatLength(stock.thickness)} x ${formatLength(stock.width)} in actual).`;
  const dimensions = kind === "plywood"
    ? `${description.construction ? "Starting rectangle" : "Bounding rectangle"} (sheet/grain aligned): ${formatLength(boundingRectangle.length)} x ` +
      `${formatLength(boundingRectangle.width)} in.`
    : `Cut length (long point): ${inches(cutLength)}. Finished width: ${inches(finishedWidth)}.`;
  const features = [];
  const countFeature = (count, name, suffix = "") => {
    if (count) features.push(`${count} ${name}${suffix}`);
  };
  if (widthTrim) features.push("Width rip");
  countFeature(description.edgeCuts.filter(cut => Math.abs(cut.miterDegrees) > 1e-8).length, "mitered cuts");
  countFeature(description.edgeCuts.filter(cut => Math.abs(cut.bevelDegrees) > 1e-8).length, "beveled cuts");
  countFeature(description.notches.length + (description.edgeNotches?.length ?? 0) +
    description.dados.filter(dado => dado.endNotch).length, "notches",
    description.notches.some(notch => Math.abs(notch.bevelDegrees) > 1e-8 ||
      Math.abs(notch.shoulderBevelDegrees ?? 0) > 1e-8) ? " (with bevels)" : "");
  countFeature(description.dados.filter(dado => !dado.endNotch).length, "dados");
  let summary = getSimpleEdgeBevel(description) ? "One full-length edge bevel; square ends" : features.length > 1
    ? `${features.slice(0, -1).join(", ")} and ${features.at(-1)}`
    : features[0] ?? "Square cuts only";
  const cuts = [];
  if (description.outline) {
    const radii = [...new Set(description.outline.filter(edge => edge.type === "arc").map(edge => edge.radius))];
    summary = radii.length ? `Cut the flat outline; arc radius ${radii.map(inches).join(", ")}.` : "Cut the flat outline.";
    cuts.push(summary);
    if (description.construction) {
      const { notches } = description.construction, { sides } = constructionTrapezoid(description.construction);
      cuts.push(`Start with the rectangular blank. Trim ${inches(sides[0].top[0])} from the left top corner and ` +
        `${inches(blank.length - sides[1].top[0])} from the right top corner, each to the corresponding bottom corner. Cut the arc, then the notches.`);
      for (const side of sides) cuts.push(`${side.side === "left" ? "Left" : "Right"} cut: ` +
        `radial guide from C at ${angle(side.angleRadians * 180 / Math.PI)} from blank X toward +Z; ` +
        (Math.abs(side.inset) < 1e-8 ? "cut on the guide." :
          `cut ${inches(Math.abs(side.inset))} ${side.inset > 0 ? "inside" : "outside"} the guide.`));
      notches.forEach((notch, i) => cuts.push(`N${i + 1}: left inner vertex at (X, Z) = ` +
        `(${notch.reference.map(formatLength).join(", ")}) in from the original blank; width ${inches(notch.width)}, ` +
        `depth ${inches(notch.depth)}, angle ${angle(notch.angleRadians * 180 / Math.PI)} from blank X toward +Z.`));
      cuts.push("Notch references are the left inner vertices looking inward from each opening: the first inner vertex clockwise around the notch in the cutting-face view. Width runs to the other inner vertex; depth runs perpendicular toward the opening.");
    }
  }
  if (description.bend) {
    const forming = `After cutting the flat outline, bend to an inner radius of ${inches(description.bend.innerRadius)} ` +
      `through ${angle(description.bend.sweepRadians * 180 / Math.PI)}. ` +
      `Developed length uses the mid-thickness radius (${inches(description.bend.neutralRadius)}); ` +
      "Y=0 is the outer face and Y=thickness is the inner face.";
    cuts.push(forming);
    summary = forming + " Details show the flat cutting pattern; the preview and Placement show the installed bend.";
  }
  if (widthTrim) {
    cuts.push(`Rip width from ${inches(widthTrim.from)} to ${inches(widthTrim.to)} ` +
      `(remove ${inches(widthTrim.removed)}).`);
  }
  for (const cut of description.edgeCuts) {
    const instruction = Math.abs(cut.angleFromSquare) < 1e-8
      ? `${cut.name}: square cut.`
      : `${cut.name}: miter ${angle(cut.miterDegrees)}; bevel ${angle(cut.bevelDegrees)}.`;
    cuts.push(instruction + (cut.surfaceCut
      ? " Face outline (X, Y, Z): " + cut.points.map(point =>
        `(${point.map(formatLength).join(", ")})`).join(" - ") + "; close to first point."
      : ""));
  }
  for (const notch of description.notches) {
    const length = notch.lengths
      ? `${inches(notch.lengths[0])} at Y=0 and ${inches(notch.lengths[1])} at Y=thickness`
      : inches(notch.length);
    cuts.push(`${cornerNames[notch.corner]} notch: ${length} along the length; ` +
      `depth ${inches(notch.depth[0])} at Y=0 and ${inches(notch.depth[1])} at Y=thickness; ` +
      `bevel ${angle(notch.bevelDegrees)}` +
      (notch.lengths ? `; shoulder bevel ${angle(notch.shoulderBevelDegrees)}` : "") + ".");
  }
  for (const dado of description.dados) {
    cuts.push(`${dado.endNotch ? "End notch" : "Dado"} on ${faceNames[dado.face]}: ` +
      `starts ${inches(dado.start)} from the start; ` +
      `${inches(dado.width)} opening along the length, ${inches(dado.depth)} deep, ` +
      `across the full ${inches(dado.acrossWidth)} width.`);
  }
  for (const cut of description.edgeNotches ?? []) {
    cuts.push("Far-edge notch; bottom corners (X, Z): " + cut.profiles.map((profile, face) =>
      `${faceNames[face ? "positiveY" : "negativeY"]}: ` +
      profile.map(([x, z]) => `(${formatLength(x)}, ${formatLength(z)})`).join(" to "))
      .join("; ") + ". Cut from the far edge to these corners.");
  }
  const outlines = [];
  if (description.outline) {
    outlines.push("Flat cutting outline (X, Z): " + description.outline.map(edge =>
      edge.type === "line"
        ? `line (${edge.from.map(formatLength).join(", ")}) to (${edge.to.map(formatLength).join(", ")})`
        : `arc radius ${inches(edge.radius)}`).join("; ") + "; close to first point.");
  } else if (kind === "plywood") {
    const { negativeY, positiveY } = blank.profiles;
    const sameOutline = negativeY.length === positiveY.length && negativeY.every(point =>
      positiveY.some(other => point.every((value, axis) => Math.abs(value - other[axis]) < 1e-8)));
    const profileText = profile => profile.map(([x, z]) =>
      `(${formatLength(x)}, ${formatLength(z)})`).join(" - ");
    if (sameOutline) {
      outlines.push(`Outline on both broad faces (X, Z): ${profileText(negativeY)}; close to first point.`);
    } else {
      for (const [face, profile] of Object.entries(blank.profiles)) {
        outlines.push(`Outline on ${faceNames[face]} (X, Z): ${profileText(profile)}; close to first point.`);
      }
    }
  }
  return {
    stock: stockText, dimensions, summary, cuts, outlines,
    note: (description.bend ? "Details show the flat cutting pattern; the preview and Placement show the installed bend. " : "") +
      "Stock coordinates: X along length" + (description.bend ? ", grain along Z" : "/grain") +
      ", Y through thickness, Z across width. " +
      "Start/end are minimum/maximum X; near/far are minimum/maximum Z. " +
      "Outline coordinates are in inches. Dimensions rounded to the nearest 1/32 in; signed angles to 0.01 deg.",
  };
}
