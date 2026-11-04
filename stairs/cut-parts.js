import { Tread } from "./model.js";
import { PartInventory, partVisibilityCategory } from "./part-list.js";
import { manufacturingSpecification } from "./part-design.js";

const assemblyCategories = new Set(["treads", "uprights", "step-framing", "risers"]);
const firstModuleRoles = new Set(["newelInnerBlock", "newelRearBlock", "frontSpindleBlock", "newel"]);

export function isInstructionCutPiece(piece) {
  const category = partVisibilityCategory(piece);
  return piece.kind !== "hardware" && (assemblyCategories.has(category) ||
    piece.id.startsWith("stairway/module-1/") && (category === "foundation" || firstModuleRoles.has(piece.key)));
}

export function isSquareCutPart(description) {
  return !description.outline && !description.widthTrim && !description.notches.length &&
    !description.dados.length && !description.edgeNotches.length &&
    description.edgeCuts.every(cut => cut.angleFromSquare < 1e-6);
}

export function createCutPartCatalog(model) {
  const inventory = new PartInventory(model.partTree);
  if (inventory.issues.length) throw new Error(inventory.issues.join("\n"));
  const parts = [], byPiece = new Map(), bySpecification = new Map();
  const locations = inventory.entries.filter(entry => entry.kind !== "hardware")
    .flatMap(entry => entry.locations.map(location => ({ entry, location })));
  const rank = ({ location }) => {
    const piece = model.partTree.getNode(location.id);
    return piece.key !== "tread" ? 2 : piece.stepNumber === 1 ? 1 : 0;
  };
  locations.sort((a, b) => rank(a) - rank(b));
  for (const { entry, location } of locations) {
    const piece = model.partTree.getNode(location.id);
    let description = piece.getDescription();
    if (piece.key === "tread") {
      const tread = new Tread({
        width: model.stairWidth, angle: model.steps[piece.stepNumber - 1].angle,
        height: 0, extendRightEdge: piece.stepNumber === 1,
      });
      if (piece.stepNumber === 1) tread.notchForPost(model.steps[0].parts.newel);
      description = tread.getManufacturingDescription();
    } else if (piece.key === "frontSpindleBearingShim") {
      description = {
        ...description,
        edgeCuts: description.edgeCuts.map(cut => {
          if (!cut.surfaceCut || cut.angleFromSquare < 1e-6) return cut;
          const shift = description.blank.thickness - Math.max(...cut.points.map(point => point[1]));
          return {
            ...cut,
            points: cut.points.map(([x, y, z]) => [x, y + shift, z]),
            plane: { ...cut.plane, offset: cut.plane.offset + cut.plane.normal[1] * shift },
          };
        }),
      };
    }
    const specification = manufacturingSpecification(description);
    const key = JSON.stringify(specification);
    let part = bySpecification.get(key);
    if (!part) {
      part = {
        title: piece.key === "tread" ? piece.stepNumber === 1 ? "First-step tread" : "Standard tread"
          : piece.key === "frontSpindleBearingShim" &&
            description.edgeCuts.some(cut => cut.surfaceCut && cut.angleFromSquare > 1e-6)
          ? "Spindle shim - upper bearing" : entry.title,
        specification, description, locations: [],
      };
      parts.push(part);
      bySpecification.set(key, part);
    }
    part.locations.push(location);
    byPiece.set(piece.id, part);
  }
  const partRank = part => {
    const pieces = part.locations.map(location => model.partTree.getNode(location.id));
    if (pieces[0].key === "tread") return pieces[0].stepNumber === 1 ? 1 : 0;
    return (pieces.some(isInstructionCutPiece) ? 2 : 4) + (isSquareCutPart(part.description) ? 0 : 1);
  };
  parts.sort((a, b) => partRank(a) - partRank(b));
  for (const [index, part] of parts.entries()) {
    part.number = `P-${String(index + 1).padStart(3, "0")}`;
    part.locations.sort((a, b) => a.moduleNumber - b.moduleNumber ||
      (a.stepNumber ?? 0) - (b.stepNumber ?? 0) || a.id.localeCompare(b.id, "en", { numeric: true }));
    part.quantity = part.locations.length;
  }
  return { parts, byPiece };
}
