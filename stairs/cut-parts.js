import { Tread } from "./model.js";
import { PartInventory } from "./part-list.js";
import { manufacturingSpecification } from "./part-design.js";

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
    }
    const specification = manufacturingSpecification(description);
    const key = JSON.stringify(specification);
    let part = bySpecification.get(key);
    if (!part) {
      part = {
        number: `P-${String(parts.length + 1).padStart(3, "0")}`,
        title: piece.key === "tread" ? piece.stepNumber === 1 ? "First-step tread" : "Standard tread" : entry.title,
        specification, description, locations: [],
      };
      parts.push(part);
      bySpecification.set(key, part);
    }
    part.locations.push(location);
    byPiece.set(piece.id, part);
  }
  for (const part of parts) {
    part.locations.sort((a, b) => a.moduleNumber - b.moduleNumber ||
      (a.stepNumber ?? 0) - (b.stepNumber ?? 0) || a.id.localeCompare(b.id, "en", { numeric: true }));
    part.quantity = part.locations.length;
  }
  return { parts, byPiece };
}
