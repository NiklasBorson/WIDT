import assert from "node:assert/strict";
import test from "node:test";
import { buildStairway, NotchedBoard, Siding, BentPlywood, ProfiledPlywood, SpindleShim, PINE, DOUGLAS_FIR, PARTICLE_BOARD } from "./model.js";
import { PartInventory, PART_SUBSETS, PART_VISIBILITY_CATEGORIES, partVisibilityCategory,
  manufacturingSpecification } from "./part-list.js";
import { formatLength, formatPartDescription, getSimpleEdgeBevel } from "./part-description.js";
import { getPartFeatures } from "./part-annotations.js";
import { PieceTree, createPieces } from "./parts.js";
import { PartCatalog } from "./part-design.js";

const specification = description => JSON.stringify(manufacturingSpecification(description));
const boardDescription = (length = 10, material = PINE, notches = {}, dados = []) =>
  new NotchedBoard({ length, thickness: 0.75, width: 3.5, material,
    stock: { kind: "lumber", nominalSize: "1x4", thickness: 0.75, width: 3.5 } }, notches, dados)
    .getManufacturingDescription();

const uprightViews = [
  ["Up", [1, 0, 0]], ["Down", [-1, 0, 0]],
  ["Left", [0, -1, 0]], ["Right", [0, 1, 0]],
  ["Front", [0, 0, -1]], ["Back", [0, 0, 1]],
].map(([name, direction]) => ({ name, direction }));

function notchedUprightDescription(bevelToLeft = false) {
  const difference = 1.5 * Math.tan(5 * Math.PI / 180);
  const depths = bevelToLeft ? [difference, 0] : [0, difference];
  return new NotchedBoard({
    length: 44, thickness: 1.5, width: 3.5, material: PINE,
    stock: { kind: "lumber", nominalSize: "2x4", thickness: 1.5, width: 3.5 },
  }, {
    endNear: { length: 3.5, depth: depths.map(depth => depth + 0.75) },
    endFar: { length: 3.5, depth: [0.75, 0.75] },
  }, [{ face: "negativeY", start: 0, width: 1.5, depth: 0.5 }],
  [{ corner: "endNear", length: 44, depth: depths }]).getManufacturingDescription();
}

function inventoryTree(descriptions) {
  const catalog = new PartCatalog();
  const module = { id: "module", name: "Module", kind: "module", children: [] };
  const root = { id: "root", name: "Root", kind: "stairway", children: [module] };
  const leaves = descriptions.map((description, index) => ({
    id: `part-${index}`, name: `Role ${index}`, parentId: module.id,
    kind: description?.kind ?? "lumber",
    part: catalog.define(description, { kind: description?.kind ?? "lumber", unresolvedId: `part-${index}` }),
    getDescription: () => structuredClone(description),
  }));
  module.children = leaves;
  return { root, parts: catalog.parts, getLeaves: () => leaves, getAncestors: () => [root, module] };
}

function pieceTree(model) {
  model.innerRadius ??= 0;
  for (const module of model.modules) for (const step of module.steps) step.angle ??= 0;
  model.parts = createPieces(model);
  return new PieceTree(model);
}

const hardwareDescription = {
  kind: "hardware", productKey: "fixture-hardware", productName: "Fixture hardware",
  category: "Hardware", summary: "A purchased fixture part.",
};

test("Part creation reuses geometry and inventory counts existing Part references without reading piece specifications", () => {
  const catalog = new PartCatalog(), description = boardDescription();
  let generated = 0;
  const design = { flatGeometry: new NotchedBoard({ length: 10, thickness: 0.75, width: 3.5 })
    .createStockGeometry() };
  const part = catalog.define(description, { createDesign: () => { generated++; return design; } });
  const reused = catalog.define(structuredClone(description), {
    createDesign: () => assert.fail("Equivalent Parts must not generate independent geometry."),
  });
  assert.equal(reused, part);
  assert.equal(generated, 1);
  assert.equal(part.createStockGeometry(), reused.createStockGeometry());
  assert.equal(part.createGeometry(), part.createStockGeometry());
  assert.ok(Object.isFrozen(part.description.blank));
  assert.throws(() => { part.description.blank.length = 20; }, TypeError);
  assert.notEqual(catalog.define(boardDescription(12)), part);
  const tree = inventoryTree([description, description, boardDescription(12)]);
  for (const piece of tree.getLeaves()) {
    piece.getDescription = () => assert.fail("Inventory must not infer Parts from Piece descriptions.");
  }
  const inventory = new PartInventory(tree);
  assert.equal(inventory.entries.length, tree.parts.length);
  for (const entry of inventory.entries) {
    assert.ok(tree.parts.includes(entry.part));
    assert.equal(entry.description, entry.part.description);
    assert.equal(entry.quantity, tree.getLeaves().filter(piece => piece.part === entry.part).length);
  }
});

test("curved Pieces share finished and flat Part geometry while radius changes create a distinct Part", () => {
  const profile = [[0, 0], [10, 0], [10, 5], [0, 5]];
  const original = new BentPlywood({ profile, thickness: 0.125, innerRadius: 20 });
  const moved = new BentPlywood({ profile, thickness: 0.125, innerRadius: 20,
    startAngle: 1, center: [10, 15], bottomHeight: 8 });
  const different = new BentPlywood({ profile, thickness: 0.125, innerRadius: 21 });
  const model = { label: "Bent fixtures", stepCount: 3, innerRadius: 0,
    modules: [original, moved, different].map((siding, startIndex) => ({
      startIndex, boards: {}, steps: [{ angle: 0, parts: { siding } }],
    })) };
  const tree = pieceTree(model), [first, second, third] = tree.getLeaves();
  assert.equal(first.part, second.part);
  assert.notEqual(first.transform, second.transform);
  assert.notDeepEqual(first.transform, second.transform);
  assert.notEqual(first.part, third.part);
  assert.equal(first.part.geometry, second.part.geometry);
  assert.equal(first.part.flatGeometry, second.part.flatGeometry);
  assert.notEqual(first.part.flatGeometry, first.part.geometry);
  assert.equal(tree.parts.length, 2);
  assert.equal(new PartInventory(tree).findOccurrence(first.id).quantity, 2);
});

test("arc-cut manufacturing identity and radius annotations use analytic edges, not mesh facets or placement", () => {
  const rib = buildStairway().modules[1].boards.sidingRib, description = rib.getManufacturingDescription();
  const moved = new ProfiledPlywood({ construction: description.construction, thickness: rib.thickness,
    origin: [40, 70], heading: 1.2, bottomHeight: 20 });
  assert.equal(specification(description), specification(moved.getManufacturingDescription()));
  const original = specification(description);
  rib.createStockGeometry(0.1);
  rib.createStockGeometry(0.0001);
  assert.equal(specification(rib.getManufacturingDescription()), original);
  const rectangle = structuredClone(description);
  delete rectangle.outline;
  assert.notEqual(specification(rectangle), original);
  const formatted = formatPartDescription(description);
  assert.match(formatted.summary, /flat outline; arc radius/);
  assert.doesNotMatch(formatted.summary, /bend|Square cuts/);
  assert.match(formatted.outlines.join(" "), /line .*arc radius/);
  assert.match(formatted.dimensions, /Starting rectangle/);
  assert.match(formatted.cuts.join(" "), /marked reference corner/);
  const reordered = structuredClone(description);
  reordered.construction.notches.reverse();
  reordered.construction.openings.reverse();
  for (const cut of [...reordered.construction.notches, ...reordered.construction.openings]) cut.name = "Renamed cut";
  assert.equal(specification(reordered), original);
  for (const direction of [[0, 1, 0], [0, -1, 0]]) {
    const view = { direction, up: [1, 0, 0] };
    const arcs = getPartFeatures(description, view, []).filter(feature => feature.kind === "arc");
    assert.equal(arcs.length, 2, "Each concentric circle needs one radius annotation, even when interrupted.");
    assert.equal(arcs[0].radius, rib.outline.find(edge => edge.type === "arc").radius);
    const center = rib.outline.find(edge => edge.type === "arc").center;
    assert.deepEqual(arcs[0].radiusCenter, [center[0], direction[1] > 0 ? rib.thickness : 0, center[1]]);
    assert.deepEqual(arcs[0].lines, [], "The radius is labeled at its arrow, not in a separate note.");
    assert.equal(arcs[0].dimensions.length, 0);
    assert.equal(arcs[0].angles.length, 0);
  }
  const edgeView = { direction: [1, 0, 0], up: [0, 1, 0] };
  assert.equal(getPartFeatures(description, edgeView, []).filter(feature => feature.kind === "arc").length, 0);
});

test("plywood opening size and location distinguish otherwise identical manufacturing specifications", () => {
  const rib = new ProfiledPlywood({ thickness: 0.25, construction: {
    blank: { length: 20, width: 10 },
    trapezoid: { left: { angleRadians: Math.atan2(20, -10), inset: 0 },
      right: { angleRadians: Math.atan2(20, 10), inset: 0 } },
    arc: { center: [10, -10], radius: 20 }, innerRadius: 12, notches: [],
    openings: [7, 11].map(x => ({ reference: [x, 4], width: 2, depth: 2, angleRadians: 0 })),
  } });
  const original = specification(rib.getManufacturingDescription());
  for (const change of [
    opening => { opening.reference[0] += 0.125; },
    opening => { opening.width += 0.125; },
  ]) {
    const construction = structuredClone(rib.construction);
    change(construction.openings[0]);
    const changed = new ProfiledPlywood({ construction, thickness: rib.thickness });
    assert.notEqual(specification(changed.getManufacturingDescription()), original);
  }
  const description = rib.getManufacturingDescription();
  assert.equal(description.holes.length, 2);
  description.holes.reverse();
  assert.equal(specification(description), original, "Hole contour order is not a manufacturing difference.");
});

test("notch reference callouts use nearby blank edges and omit offsets on exact edges", () => {
  const construction = {
    blank: { length: 10, width: 10 }, trapezoid: {
      left: { angleRadians: Math.PI / 2, inset: -5 }, right: { angleRadians: Math.PI / 2, inset: -5 },
    },
    arc: { center: [5, -5], radius: 15 },
    notches: [{ reference: [0, 2], width: 2, depth: 10, angleRadians: 0 }],
  };
  const describe = () => new ProfiledPlywood({ construction, thickness: 0.5 }).getManufacturingDescription();
  const notch = () => getPartFeatures(describe(), { direction: [0, 1, 0], up: [1, 0, 0] })
    .find(feature => feature.kind === "rectangular-notch");
  assert.deepEqual(notch().lines, ["N1: 2 in from top", "Width 2 in; height 10 in", "Angle 0 deg from blank X"]);
  construction.notches[0].reference = [0, 0];
  assert.equal(notch().lines[0], "N1: Rectangular notch");
  construction.notches[0].reference = [7, 6];
  assert.deepEqual(notch().lines.slice(0, 2), ["N1: 3 in from right", "4 in from bottom"]);
  assert.deepEqual(notch().dimensions, []);
});

test("modeled part names use family-first qualifiers across every supported layout", () => {
  const names = {
    leftCaster: "Caster", rightCaster: "Caster", leftRearCaster: "Caster", rightRearCaster: "Caster",
    leftSupportBeam: "Beam - caster left", rightSupportBeam: "Beam - caster right",
    supportCrossPiece: "Beam - cross", rearSupportCrossPiece: "Beam - cross rear",
    leftUpright: "Upright - front left",
    leftRearUpright: "Upright - rear left",
    rightUpright: "Upright - front right",
    rightRearUpright: "Upright - rear right",
    leftSupportBlock: "Attachment block - upright left",
    rightSupportBlock: "Attachment block - upright right",
    leftRearSupportBlock: "Attachment block - upright rear left",
    rightRearSupportBlock: "Attachment block - upright rear right",
    southCrossPiece: "Tread support - front", northCrossPiece: "Tread support - rear",
    leftStepSupport: "Tread support - left", rightStepSupport: "Tread support - right",
    frontStepLeftSupport: "Tread support - first-step left",
    frontStepRightSupport: "Tread support - first-step right",
    frontStepRightRearSupport: "Tread support - first-step right rear",
    frontStepFrontBearing: "Beam - first-step front", frontStepRearBearing: "Beam - first-step rear",
    extendedLeftSupportCrossPiece: "Beam - extended left support",
    frontUprightBrace: "Front brace - lower",
    leftRearTreadBlock: "Attachment block - rear tread left",
    rightRearTreadBlock: "Attachment block - rear tread right",
    leftRearTreadFlange: "Threaded flange", rightRearTreadFlange: "Threaded flange",
    leftFrontUprightMendingPlate: "Mending plate", rightFrontUprightMendingPlate: "Mending plate",
    leftLowerUprightFlange: "Threaded flange", rightLowerUprightFlange: "Threaded flange",
    leftLowerUprightMendingPlate: "Mending plate", rightLowerUprightMendingPlate: "Mending plate",
    upperFrontSpindleFlange: "Threaded flange", lowerFrontSpindleFlange: "Threaded flange",
    frontSpindleBackingBlock: "Attachment block - spindle upper",
    frontSpindleBearingShim: "Spindle shim - upper bearing",
    newelInnerBlock: "Newel block - inner", newelRearBlock: "Newel block - rear",
    newel: "Newel post", riser: "Riser", tread: "Tread",
    frontSpindleBlock: ["Spindle block - front", "Spindle support - front"], rearSpindleBlock: "Spindle block - rear",
    frontSpindle: "Spindle - front", rearSpindle: "Spindle - rear", spindleShim: "Spindle shim",
    rearSpindleInsert: "Threaded insert",
    siding: ["Side panel - curved", "Side panel - right rear section"],
    frontSiding: "Side panel - right front section",
    sidingStiffener: ["Bottom rib - curved", "Bottom rib - rear section"],
    sidingStiffenerUpper: ["Bottom rib - curved", "Bottom rib - rear section"],
    frontPanelSupportBlock: "Panel support block - front", rearPanelSupportBlock: "Panel support block - rear",
    sidingRib: "Panel rib",
    sidingRib2: "Panel rib", sidingRib3: "Panel rib",
    intermediateSidingRib: "Panel rib - intermediate",
    intermediateSidingRib2: "Panel rib - intermediate", intermediateSidingRib3: "Panel rib - intermediate",
    frontRibSupportBlock: "Attachment block - panel rib front",
    rearRibSupportBlock: "Attachment block - panel rib rear",
    backRibSupportBlock: "Attachment block - panel rib back",
    frontIntermediateRibSupportBlock: "Attachment block - panel rib front",
    rearIntermediateRibSupportBlock: "Attachment block - panel rib rear",
    backIntermediateRibSupportBlock: "Attachment block - panel rib back",
  };
  const seen = new Set();
  for (const steps of [9]) for (const modules of [3]) {
    const model = buildStairway(24), inventory = new PartInventory(model.partTree);
    for (const node of model.partTree.getLeaves()) {
      assert.ok([names[node.key]].flat().includes(node.name), `${node.id}: ${node.name}`);
      assert.equal(node.getDescription().name, node.name);
      if (node.key === "siding") assert.equal(node.name,
        node.stepNumber === 1 ? "Side panel - right rear section" : "Side panel - curved");
      const entry = inventory.findOccurrence(node.id);
      assert.ok(entry.roles.some(role => role.label === node.name));
      assert.equal(entry.locations.find(location => location.id === node.id).name, node.name);
      seen.add(node.name);
    }
  }
  assert.deepEqual([...seen].sort(), [...new Set(Object.values(names).flat())].sort());
});

test("Douglas fir replaces oak in material sections and filters while retaining pine-first ordering", () => {
  const inventory = new PartInventory(buildStairway().partTree);
  assert.deepEqual([...new Set(inventory.sections.filter(section => section.kind === "lumber")
    .map(section => section.stock.materialKey))], ["pine", "douglas-fir"]);
  const sections = inventory.sections.filter(section => section.stock?.materialKey === "douglas-fir");
  assert.equal(sections.length, 3);
  assert.equal(sections.reduce((sum, section) => sum + section.quantity, 0), 14);
  for (const section of sections) {
    assert.equal(section.stock.material, "Douglas fir");
    const filtered = inventory.filter({ stockKey: section.key });
    assert.equal(filtered.occurrences.length, section.quantity);
    assert.ok(filtered.occurrences.every(({ entry }) => entry.description.stock.materialKey === "douglas-fir"));
  }
});

test("Parts inventory filters intersect module, subset, and stock category", () => {
  const model = buildStairway(), inventory = new PartInventory(model.partTree);
  const all = inventory.filter();
  assert.equal(all.occurrences.length, inventory.quantity);
  assert.equal(all.uniqueCount, inventory.entries.length);
  assert.equal(all.groups.length, all.uniqueCount);
  assert.equal(new Set(all.groups.map(({ entry }) => entry.key)).size, all.groups.length);
  assert.deepEqual(all.groups.flatMap(({ locations }) => locations.map(location => location.id)).sort(),
    all.occurrences.map(({ location }) => location.id).sort());
  assert.ok(all.groups.every(group => group.title === group.entry.title));
  const key = all.occurrences.find(({ location }) => location.category === "siding").entry.stockKey;
  const combined = inventory.filter({ moduleNumber: 1, stockKey: key });
  assert.ok(combined.occurrences.length);
  assert.ok(combined.occurrences.every(({ entry, location }) =>
    entry.stockKey === key && location.moduleNumber === 1 && location.category === "siding"));
  assert.equal(combined.uniqueCount, new Set(combined.occurrences.map(({ entry }) => entry.key)).size);
  assert.deepEqual(inventory.filter({ moduleNumber: 1, subset: "step-framing", stockKey: key }),
    { occurrences: [], groups: [], uniqueCount: 0 });
  assert.deepEqual(inventory.filter({ moduleNumber: 4 }), { occurrences: [], groups: [], uniqueCount: 0 });
  const framing = inventory.filter({ subset: "step-framing" });
  assert.ok(framing.occurrences.length);
  assert.ok(framing.occurrences.every(({ entry, location }) =>
    ["lumber", "hardware"].includes(entry.kind) || location.category === "base-rails" ||
      location.name === "Front brace - lower"));
  assert.throws(() => inventory.filter({ subset: "missing" }), /Unknown part subset/);
});

test("Stairway visibility partitions installed pieces by role instead of accumulating construction stages", () => {
  const model = buildStairway(), leaves = model.partTree.getLeaves();
  for (const [category, roles] of [
    ["foundation", ["leftCaster", "frontStepFrontBearing", "frontStepRearBearing", "supportCrossPiece",
      "frontStepLeftSupport", "frontStepRightSupport", "frontStepRightRearSupport"]],
    ["uprights", ["leftUpright", "rightRearUpright",
      "leftSupportBlock", "rightSupportBlock", "leftRearSupportBlock", "rightRearSupportBlock"]],
    ["step-framing", ["northCrossPiece", "leftStepSupport", "extendedLeftSupportCrossPiece",
      "leftRearTreadBlock", "rightRearTreadBlock", "leftRearTreadFlange", "rightRearTreadFlange"]],
    ["risers", ["riser", "frontUprightBrace"]],
    ["treads", ["tread"]],
    ["banister", ["newel", "newelInnerBlock", "frontSpindle", "rearSpindleBlock", "spindleShim", "rearSpindleInsert"]],
    ["ribs", ["sidingRib", "sidingStiffener", "frontRibSupportBlock", "rearPanelSupportBlock"]],
    ["siding", ["siding", "frontSiding"]],
  ]) {
    for (const role of roles) {
      const pieces = leaves.filter(node => node.key === role);
      assert.ok(pieces.length, role);
      for (const piece of pieces) assert.equal(partVisibilityCategory(piece), category, piece.id);
    }
  }
  for (const piece of leaves.filter(node => node.key === "southCrossPiece")) {
    assert.equal(partVisibilityCategory(piece), piece.stepNumber === 1 ? "foundation" : "step-framing");
  }
  assert.deepEqual(new Set(leaves.map(partVisibilityCategory)),
    new Set(PART_VISIBILITY_CATEGORIES.map(({ key }) => key)));
});

test("construction subsets are cumulative and add each role at its construction stage", () => {
  assert.deepEqual(PART_SUBSETS.map(subset => subset.label), [
    "Foundation", "Uprights", "Step framing", "Banister", "Ribs", "All parts",
  ]);
  const stages = {
    foundation: ["leftCaster", "rightCaster", "leftRearCaster", "rightRearCaster",
      "frontStepFrontBearing", "frontStepRearBearing", "leftSupportBeam", "rightSupportBeam",
      "supportCrossPiece", "rearSupportCrossPiece",
      "frontStepRightSupport", "frontStepRightRearSupport", "frontStepLeftSupport"],
    uprights: ["leftUpright", "rightUpright", "leftRearUpright", "rightRearUpright", "frontUprightBrace"],
    "step-framing": [
      "southCrossPiece", "northCrossPiece", "leftStepSupport", "rightStepSupport", "extendedLeftSupportCrossPiece",
      "leftRearTreadBlock", "rightRearTreadBlock",
      "leftRearTreadFlange", "rightRearTreadFlange",
      "leftFrontUprightMendingPlate", "rightFrontUprightMendingPlate",
      "leftLowerUprightFlange", "rightLowerUprightFlange",
      "leftLowerUprightMendingPlate", "rightLowerUprightMendingPlate",
      "upperFrontSpindleFlange", "lowerFrontSpindleFlange",
      "frontSpindleBackingBlock", "frontSpindleBearingShim",
      "leftSupportBlock", "rightSupportBlock", "leftRearSupportBlock", "rightRearSupportBlock"],
    banister: ["frontSpindleBlock", "rearSpindleBlock",
      "newel", "frontSpindle", "rearSpindle", "spindleShim", "rearSpindleInsert", "newelInnerBlock", "newelRearBlock"],
    ribs: ["sidingRib", "sidingStiffener", "sidingStiffenerUpper", "frontPanelSupportBlock", "rearPanelSupportBlock",
      "frontRibSupportBlock", "rearRibSupportBlock", "intermediateSidingRib",
      "frontIntermediateRibSupportBlock", "rearIntermediateRibSupportBlock",
      "sidingRib2", "sidingRib3", "intermediateSidingRib2", "intermediateSidingRib3",
      "backRibSupportBlock", "backIntermediateRibSupportBlock"],
    "": ["tread", "riser", "siding", "frontSiding", "backPanel"],
  };
  const keys = PART_SUBSETS.map(({ key }) => key);
  for (const steps of [9]) for (const modules of [3]) {
    const model = buildStairway(24), inventory = new PartInventory(model.partTree);
    const locations = new Map(inventory.filter().occurrences.map(({ location }) => [location.id, location]));
    const ids = subset => new Set(inventory.filter({ subset }).occurrences.map(({ location }) => location.id));
    let previous = new Set();
    for (const key of keys) {
      const current = ids(key);
      assert.ok([...previous].every(id => current.has(id)), key);
      assert.ok(current.size > previous.size, key);
      previous = current;
    }
    for (const node of model.partTree.getLeaves()) {
      const { id, key } = node;
      const stage = key === "southCrossPiece" && node.stepNumber === 1 ? "foundation"
        : key === "frontSpindleBlock" && node.stepNumber >= 3 ? "step-framing"
        : Object.keys(stages).find(stage => stages[stage].includes(key));
      assert.notEqual(stage, undefined, `Unclassified part role: ${key}`);
      const location = locations.get(id);
      assert.deepEqual(location.subsets, keys.slice(keys.indexOf(stage)).filter(Boolean), id);
      assert.equal(node.category === "ribs", stages.ribs.includes(key), id);
      if (["frontPanelSupportBlock", "rearPanelSupportBlock"].includes(key)) {
        assert.equal(node.visibilityKey, "supportBeams");
      }
      assert.ok(Object.isFrozen(location.subsets));
    }
    assert.equal(inventory.filter().occurrences.length, model.partTree.getLeaves().length);
  }
});

test("vertical spindle supports belong to Step framing while retained spindle blocks remain in Banister", () => {
  const model = buildStairway(), inventory = new PartInventory(model.partTree);
  const mounts = model.partTree.getLeaves().filter(node => ["frontSpindleBlock", "rearSpindleBlock"].includes(node.key));
  assert.equal(mounts.length, 11);
  for (const mount of mounts) {
    const support = mount.key === "frontSpindleBlock" && mount.stepNumber >= 3;
    assert.equal(partVisibilityCategory(mount), support ? "step-framing" : "banister");
    const location = inventory.findOccurrence(mount.id).locations.find(location => location.id === mount.id);
    assert.deepEqual(location.subsets, support ? ["step-framing", "banister", "ribs"] : ["banister", "ribs"]);
    assert.equal(mount.category === "step-framing", support);
  }
});

test("panel ribs retain analytic boundaries and half-inch plywood specifications without base rails", () => {
  for (const modules of [3]) {
    const model = buildStairway(24), inventory = new PartInventory(model.partTree);
    assert.ok(!inventory.entries.some(entry => entry.locations.some(location => location.category === "base-rails")));
    const ribs = model.partTree.getLeaves().filter(node => /^(sidingRib|intermediateSidingRib)\d?$/.test(node.key));
    assert.equal(ribs.length, 9);
    for (const node of ribs) {
      const description = node.getDescription();
      assert.equal(description.stock.thickness, 0.5);
      assert.equal(description.blank.thickness, 0.5);
      assert.equal(description.construction.arc.radius - description.construction.innerRadius, 3.5);
      const moved = new ProfiledPlywood({ construction: description.construction, thickness: 0.5,
        origin: [100, 200], heading: 1.3, bottomHeight: 50 });
      assert.equal(specification(description), specification(moved.getManufacturingDescription()));
      const features = getPartFeatures(description, { direction: [0, 1, 0], up: [0, 0, -1] });
      assert.equal(features.filter(feature => feature.kind === "arc").length, 2);
    }
  }
});

test("scoped Parts titles describe visible steps without changing global identity or quantity", () => {
  const inventory = new PartInventory(buildStairway().partTree);
  const tread = inventory.entries.find(entry => entry.title === "Tread (steps 3, 6, 9)");
  assert.ok(tread);
  assert.equal(tread.quantity, 3);
  const scoped = inventory.filter({ moduleNumber: 1 }).groups.find(group => group.entry.key === tread.key);
  assert.equal(scoped.entry, tread);
  assert.equal(scoped.title, "Tread (step 3)");
  assert.equal(scoped.locations.length, 1);
  assert.equal(tread.title, "Tread (steps 3, 6, 9)");
  const tree = inventoryTree([boardDescription(), boardDescription(12)]);
  tree.getLeaves().forEach(node => { node.name = "Shared"; });
  const variants = new PartInventory(tree);
  assert.ok(variants.filter().groups.every(group => group.title === group.entry.title));
  assert.ok(variants.filter().groups.every(group => group.title.includes(" - variant ")));
});

test("Parts titles merge only the two approved positional role pairs and retain occurrence names", () => {
  for (const [labels, title] of [
    [["Attachment block - rear support left", "Attachment block - rear support right"],
      "Attachment block - rear support"],
    [["Spindle - front", "Spindle - rear"], "Spindle"],
    [["Upright - front left", "Upright - front right"], "Upright - front left / Upright - front right"],
    [["Beam - caster left", "Beam - caster right"], "Beam - caster left / Beam - caster right"],
    [["Spindle - front", "Spindle shim"], "Spindle - front / Spindle shim"],
  ]) {
    const tree = inventoryTree(labels.map(() => boardDescription()));
    tree.getLeaves().forEach((node, index) => { node.name = labels[index]; });
    const inventory = new PartInventory(tree), [entry] = inventory.entries;
    assert.equal(inventory.entries.length, 1);
    assert.equal(entry.title, title);
    assert.equal(entry.quantity, labels.length);
    assert.deepEqual(entry.roles.map(role => role.label), labels);
    assert.deepEqual(entry.locations.map(location => location.name), labels);
    assert.equal(inventory.filter().groups[0].title, title);
  }
});

test("scoped Parts titles merge positional pairs only when both roles remain visible", () => {
  const tree = inventoryTree([boardDescription(), boardDescription()]);
  const [front, rear] = tree.getLeaves();
  front.name = "Spindle - front";
  rear.name = "Spindle - rear";
  const [module] = tree.root.children;
  const secondModule = { id: "module-2", name: "Module 2", kind: "module", children: [rear] };
  module.children = [front];
  rear.parentId = secondModule.id;
  tree.root.children.push(secondModule);
  tree.getAncestors = id => [tree.root, id === front.id ? module : secondModule];
  const inventory = new PartInventory(tree), [entry] = inventory.entries;
  assert.equal(entry.title, "Spindle");
  const [scoped] = inventory.filter({ moduleNumber: 1 }).groups;
  assert.equal(scoped.title, "Spindle - front");
  assert.equal(scoped.entry, entry);
  assert.equal(scoped.locations.length, 1);
  assert.equal(entry.quantity, 2);
});

test("role-specific visibility categories override the plywood category without changing stock kind", () => {
  const sheet = new NotchedBoard({ length: 12, width: 8, thickness: 0.125,
    stock: { kind: "plywood", thickness: 0.125 } });
  const post = new NotchedBoard({ length: 40, width: 3.5, thickness: 3.5, material: DOUGLAS_FIR,
    stock: { kind: "lumber", nominalSize: "4x4", thickness: 3.5, width: 3.5 } });
  const tree = pieceTree({
    label: "Fixture", stepCount: 1,
    modules: [{ startIndex: 0, boards: {},
      steps: [{ parts: { tread: sheet, siding: sheet, frontSiding: sheet, newel: post } }] }],
  });
  const [tread, siding, frontSiding, newel] = tree.getLeaves();
  assert.equal(tread.category, "plywood");
  assert.equal(siding.category, "siding");
  assert.equal(siding.kind, "plywood");
  assert.equal(siding.name, "Side panel - right rear section");
  assert.equal(siding.getDescription().stock.kind, "plywood");
  assert.equal(frontSiding.category, "siding");
  assert.equal(frontSiding.name, "Side panel - right front section");
  assert.equal(newel.category, "newel");
  assert.equal(newel.name, "Newel post");
  assert.equal(newel.getDescription().stock.nominalSize, "4x4");
  const inventory = new PartInventory(tree);
  const sidingGroup = inventory.filter().groups
    .find(group => group.locations.some(location => location.id === siding.id));
  assert.equal(sidingGroup.entry.quantity, 3);
  assert.deepEqual(sidingGroup.locations.filter(location => location.category === "siding")
    .map(location => location.name).sort(), ["Side panel - right front section", "Side panel - right rear section"]);
  assert.equal(inventory.filter({ subset: "ribs" }).occurrences.some(({ location }) => location.id === siding.id), false);
});

test("particle board has independent visibility and inventory identity while remaining sheet stock", () => {
  const dimensions = { length: 12, width: 8, thickness: 0.25,
    stock: { kind: "plywood", thickness: 0.25 } };
  const sheet = new NotchedBoard(dimensions);
  const particle = new NotchedBoard({ ...dimensions, material: PARTICLE_BOARD });
  const tree = pieceTree({
    label: "Fixture", stepCount: 1,
    modules: [{ startIndex: 0, boards: {},
      steps: [{ parts: { tread: sheet, siding: particle, backPanel: particle } }] }],
  });
  assert.deepEqual(tree.getLeaves().map(node => node.category), ["plywood", "particle-board", "particle-board"]);
  const inventory = new PartInventory(tree);
  assert.equal(inventory.issues.length, 0);
  assert.equal(inventory.entries.length, 2);
  assert.notEqual(specification(sheet.getManufacturingDescription()), specification(particle.getManufacturingDescription()));
});

test("the inventory lists existing catalog Parts and counts every Piece exactly once", () => {
  const tree = inventoryTree([
    boardDescription(), boardDescription(), boardDescription(10, DOUGLAS_FIR),
    hardwareDescription, hardwareDescription,
  ]), inventory = new PartInventory(tree);
  assert.equal(inventory.quantity, 5);
  assert.equal(inventory.quantity, tree.getLeaves().length);
  assert.equal(inventory.entries.length, 3);
  assert.equal(inventory.findOccurrence("part-0"), inventory.findOccurrence("part-1"));
  assert.equal(inventory.findOccurrence("part-0").quantity, 2);
  assert.equal(inventory.findOccurrence("part-0").roles.length, 2);
  assert.notEqual(inventory.findOccurrence("part-0"), inventory.findOccurrence("part-2"));
  assert.equal(inventory.findOccurrence("part-3"), inventory.findOccurrence("part-4"));
  assert.equal(inventory.findOccurrence("part-3").quantity, 2);
  const occurrences = inventory.entries.flatMap(entry => entry.occurrenceIds);
  assert.equal(new Set(occurrences).size, tree.getLeaves().length);
  assert.deepEqual([...occurrences].sort(), tree.getLeaves().map(node => node.id).sort());
  assert.equal(inventory.sections.reduce((sum, section) => sum + section.quantity, 0), inventory.quantity);
  assert.equal(inventory.issues.length, 0);
  assert.deepEqual(new PartInventory(tree).entries, inventory.entries);
  for (const entry of inventory.entries) {
    assert.equal(entry.quantity, entry.locations.length);
    assert.ok(entry.occurrenceIds.includes(entry.representativeId));
    assert.equal(inventory.getEntry(entry.key), entry);
    assert.ok(Object.isFrozen(entry.locations));
    for (const id of entry.occurrenceIds) assert.equal(inventory.findOccurrence(id), entry);
  }
  assert.equal(inventory.findOccurrence("missing"), null);
  assert.throws(() => inventory.getEntry("missing"), /Unknown inventory/);
});

test("rounded lengths mark errors greater than one hundredth inch as approximate", () => {
  for (const [value, expected] of [
    [4.625, "4 5/8"],
    [4.62, "4 5/8"],
    [4.615, "4 5/8"],
    [4.635, "4 5/8"],
    [4.6149, "~4 5/8"],
    [4.6351, "~4 5/8"],
    [1.01, "1"],
    [0.99, "1"],
    [1.0101, "~1"],
    [0.9899, "~1"],
    [0, "0"],
    [0.01, "0"],
    [0.0101, "~0"],
    [0.125, "1/8"],
    [0.111, "~1/8"],
  ]) {
    assert.equal(formatLength(value), expected, String(value));
    const negative = expected.replace(/^(~?)/, "$1-").replace(/-0$/, "0");
    assert.equal(formatLength(-value), negative, String(-value));
  }
});

test("stock, widths, full precision, and asymmetric joinery distinguish patterns", () => {
  const original = boardDescription();
  const a = specification(original);
  assert.notEqual(a, specification(boardDescription(10, DOUGLAS_FIR)));
  assert.notEqual(a, specification(boardDescription(10.0001)));
  assert.equal(formatLength(10), formatLength(10.0001));
  const narrower = structuredClone(original);
  narrower.stock.width = 4;
  assert.notEqual(a, specification(narrower));
  const notch = boardDescription(10, PINE, { endNear: { length: 2, depth: [0.5, 0.75] } });
  assert.notEqual(specification(notch),
    specification(boardDescription(10, PINE, { endNear: { length: 2, depth: [0.75, 0.5] } })));
  assert.notEqual(specification(notch),
    specification(boardDescription(10, PINE, { endFar: { length: 2, depth: [0.5, 0.75] } })));
  const shoulder = structuredClone(notch);
  shoulder.notches[0].lengths = [2, 1.75];
  assert.notEqual(specification(notch), specification(shoulder));
  const dado = face => boardDescription(10, PINE, {}, [{ face, start: 2, width: 0.75, depth: 0.25 }]);
  assert.notEqual(specification(dado("negativeY")), specification(dado("positiveY")));
  const ripped = new NotchedBoard({ length: 10, thickness: 0.75, width: 3, material: PINE,
    stock: { kind: "lumber", nominalSize: "1x4", thickness: 0.75, width: 3.5 } }).getManufacturingDescription();
  assert.notEqual(a, specification(ripped));
});

test("edge cutout profiles distinguish manufacturing patterns and provide cut text and annotations", () => {
  const plain = boardDescription(), cut = structuredClone(plain);
  cut.edgeNotches = [{ profiles: [[[2, 2], [3, 2]], [[2, 2.125], [3, 2.125]]] }];
  assert.notEqual(specification(plain), specification(cut));
  const altered = structuredClone(cut);
  altered.edgeNotches[0].profiles[1][1][1] += 0.125;
  assert.notEqual(specification(cut), specification(altered));
  const text = formatPartDescription(cut);
  assert.match(text.summary, /1 notches/);
  assert.ok(text.cuts.some(line => line.includes("Far-edge notch") && line.includes("Y=thickness")));
  for (const direction of [[0, 1, 0], [0, -1, 0], [0, 0, 1]]) {
    const feature = getPartFeatures(cut, { direction }, []).find(feature => feature.kind === "notch");
    assert.ok(feature);
    if (direction[1]) {
      assert.equal(feature.outline.length, 4);
      assert.ok(feature.outline.flat().every(Number.isFinite));
    } else assert.equal(feature.outline, null);
  }
});

test("edge cutout dimensions show nearest-end distance, opening, and distinct face-specific depths", () => {
  for (const { start, depths, distance } of [
    { start: 2, depths: [1.5, 1.5], distance: 2 },
    { start: 7.5, depths: [1.5, 1.5001], distance: 1 },
    { start: 0, depths: [1, 1.5], distance: 0 },
    { start: 8.5, depths: [1, 1.5], distance: 0 },
  ]) {
    const description = boardDescription();
    const profile = [[start, description.blank.width - depths[0]],
      [start + 1.5, description.blank.width - depths[1]]];
    description.edgeNotches = [{ profiles: [profile, profile] }];
    for (const direction of [[0, -1, 0], [0, 1, 0]]) {
      const feature = getPartFeatures(description, { direction }, []).find(feature => feature.kind === "notch");
      assert.equal(feature.id, "N1");
      const position = feature.dimensions.find(dimension => dimension.property.startsWith("from "));
      assert.equal(position?.value ?? 0, distance);
      assert.equal(feature.dimensions.find(dimension => dimension.property === "opening").value, 1.5);
      assert.equal(feature.dimensions.find(dimension => dimension.property === "depth 1").value, depths[0]);
      const depth2 = feature.dimensions.find(dimension => dimension.property === "depth 2");
      if (formatLength(depths[0]) !== formatLength(depths[1])) assert.equal(depth2.value, depths[1]);
      else assert.equal(depth2, undefined);
      assert.match(feature.lines.join(" "), /face; depths from blank/);
    }
  }
  const description = boardDescription();
  description.blank.profiles.positiveY = [[0.25, 0], [9.75, 0], [9.75, 3.5], [0.25, 3.5]];
  description.edgeNotches = [{ profiles: [
    [[7.5, 2], [9, 2]], [[7.75, 2.125], [9.25, 2.125]],
  ] }];
  const feature = getPartFeatures(description, { direction: [0, 1, 0] }, []).find(feature => feature.kind === "notch");
  assert.equal(feature.dimensions.find(dimension => dimension.property === "from +X").value, 0.5);
  assert.equal(feature.dimensions.find(dimension => dimension.property === "opening").value, 1.5);
  assert.equal(feature.dimensions.find(dimension => dimension.property === "depth 1").value, 1.375);
});

test("stock face cuts retain manufacturing identity and annotate only useful measurement views", () => {
  const footprint = [[0, 0], [1.4, 0.2], [1.4, 2.4], [0, 2.6]];
  const original = new SpindleShim(footprint, 10, 0).getManufacturingDescription();
  const higher = new SpindleShim(footprint, 20, 0).getManufacturingDescription();
  assert.equal(specification(original), specification(higher));
  const altered = structuredClone(original);
  altered.edgeCuts.find(cut => cut.surfaceCut).plane.offset += 0.125;
  assert.notEqual(specification(original), specification(altered));
  const text = formatPartDescription(original);
  assert.ok(text.cuts.some(line => line.includes("Top end") && line.includes("Face outline (X, Y, Z)")));
  for (const sign of [1, -1]) {
    const features = getPartFeatures(original, { direction: [0, sign, 0] }, []);
    assert.deepEqual(features, [], "A reference to an end view alone is not a face-view measurement");
  }
  const endFeatures = getPartFeatures(original, { direction: [1, 0, 0] });
  assert.deepEqual(endFeatures.map(feature => feature.id), ["B1", "B2"]);
  assert.ok(endFeatures.every(feature => feature.angles.length === 1));
});

test("inner newel block bevel appears only in the two views exposing its angle", () => {
  const model = buildStairway();
  const node = model.partTree.getLeaves().find(node => node.key === "newelInnerBlock");
  const description = node.getDescription(), views = model.partTree.getStockViews(node.id);
  for (const view of views) {
    const features = getPartFeatures(description, view, views);
    if (!["Up", "Down"].includes(view.name)) {
      assert.deepEqual(features, [], `${view.name} should not point to a bevel measured elsewhere`);
      continue;
    }
    assert.equal(features.length, 1);
    assert.equal(features[0].id, "B1");
    assert.equal(features[0].angles.length, 1);
    assert.ok(Math.abs(features[0].angles[0].valueDegrees - 10) < 1e-8);
    assert.ok(features[0].dimensions.some(dimension => dimension.property === "length"));
  }
});

test("simple edge bevels need only an actual end-profile angle, not linked feature constructions", () => {
  const model = buildStairway();
  const description = new NotchedBoard({
    length: 3.5, thickness: 0.75, width: 3.5, material: PINE,
    stock: { kind: "lumber", nominalSize: "1x4", thickness: 0.75, width: 3.5 },
  }, {}, [], [{ corner: "endNear", length: 3.5, depth: [0, 0.75 * Math.tan(5 * Math.PI / 180)] }])
    .getManufacturingDescription();
  const views = uprightViews;
  assert.ok(getSimpleEdgeBevel(description));
  assert.equal(formatPartDescription(description).summary, "One full-length edge bevel; square ends");
  for (const view of views) {
    const features = getPartFeatures(description, view, views);
    if (!view.direction[0]) {
      assert.deepEqual(features, []);
      continue;
    }
    assert.equal(features.length, 1);
    const [feature] = features, [angle] = feature.angles;
    assert.ok(feature.compact);
    assert.equal(feature.name, "Front edge bevel");
    assert.deepEqual(feature.lines, []);
    assert.deepEqual(feature.dimensions, []);
    assert.ok(Math.abs(angle.valueDegrees - 5) < 1e-8);
    const { vertex, referencePoint, cutPoint } = angle.directProfile;
    assert.equal(vertex[0], view.direction[0] > 0 ? description.blank.length : 0);
    assert.equal(vertex[2], 0);
    assert.equal(referencePoint[2], 0);
    assert.equal(Math.abs(referencePoint[1] - vertex[1]), description.blank.thickness);
    assert.ok(Math.abs(cutPoint[2] - Math.max(...description.notches[0].depth)) < 1e-8);
    assert.ok(angle.preferredViews.includes(view.name));
  }
  const rebateDescription = (corner, length, depth) => new NotchedBoard({
    length: 10, thickness: 0.75, width: 3.5, material: PINE,
    stock: { kind: "lumber", nominalSize: "1x4", thickness: 0.75, width: 3.5 },
  }, {}, [], [{ corner, length, depth }]).getManufacturingDescription();
  for (const corner of ["startNear", "endNear", "startFar", "endFar"]) {
    for (const depth of [[0, 0.25], [0.25, 0]]) {
      const description = rebateDescription(corner, 10, depth);
      assert.ok(getSimpleEdgeBevel(description));
      for (const sign of [-1, 1]) {
        const [feature] = getPartFeatures(description, { direction: [sign, 0, 0] });
        const { vertex, referencePoint, cutPoint } = feature.angles[0].directProfile;
        assert.equal(vertex[2], corner.endsWith("Near") ? 0 : 3.5);
        assert.equal(referencePoint[2], vertex[2]);
        const expected = Math.atan(0.25 / 0.75) * 180 / Math.PI;
        assert.ok(Math.abs(feature.angles[0].valueDegrees - expected) < 1e-8);
        assert.equal(Math.abs(cutPoint[2] - referencePoint[2]), 0.25);
      }
    }
  }
  for (const id of ["stairway/module-1/step-1-newel", "stairway/module-1/step-3-rightUpright",
    "stairway/module-1/step-3-spindleShim", "stairway/module-1/siding"]) {
    assert.equal(getSimpleEdgeBevel(model.partTree.getNode(id).getDescription()), null, id);
  }
  for (const [length, depth] of [[5, [0, 0.25]], [10, [0.25, 0.5]]]) {
    assert.equal(getSimpleEdgeBevel(rebateDescription("endNear", length, depth)), null);
  }
  assert.equal(getSimpleEdgeBevel(boardDescription()), null);
  const extraCut = structuredClone(description);
  extraCut.edgeCuts.push({ surfaceCut: true, miterDegrees: 0, bevelDegrees: 0 });
  assert.equal(getSimpleEdgeBevel(extraCut), null, "Additional finite surfaces must not be hidden");
});

test("newel bevel uses an exposed end angle and finite, separately located face extent", () => {
  for (const stepCount of [9]) {
    const newel = buildStairway(24).steps[0].parts.newel;
    const description = newel.getManufacturingDescription();
    const start = newel.cornerBevel.bottomHeight - newel.bottomHeight;
    const end = newel.cornerBevel.topHeight - newel.bottomHeight;
    const face = getPartFeatures(description, { direction: [0, -1, 0] })
      .find(feature => feature.name === "Newel corner bevel");
    assert.ok(face);
    assert.equal(face.outline, null);
    const feature = getPartFeatures(description, { direction: [-1, 0, 0] }, [])
      .find(feature => feature.id === face.id);
    const degrees = 90 / stepCount;
    if (start < 1e-8) assert.ok(Math.abs(feature.angles[0].valueDegrees - degrees) < 1e-8);
    else {
      assert.equal(feature, undefined, "An internal patch is not an exposed end feature");
      assert.equal(face.requiresSection, true, "Keep the section warning with the located face dimensions");
      assert.ok(face.lines.some(line => line.endsWith("section required")));
    }
    assert.ok(Math.abs(face.dimensions.find(dimension => dimension.property === "extent").value - (end - start)) < 1e-8);
    assert.ok(Math.abs((face.dimensions.find(dimension => dimension.property === "start")?.value ?? 0) - start) < 1e-8);
    assert.equal(face.angles.length, 0);
    const oppositeEnd = getPartFeatures(description, { direction: [1, 0, 0] })
      .find(entry => entry.id === face.id);
    assert.equal(oppositeEnd, undefined, "The opposite square end has no measurement of the stopped patch");
  }
});

test("finite notch shoulders have dashed edge-view traces through the callout anchor", () => {
  const model = buildStairway(), id = "stairway/module-1/step-2-frontSpindle";
  const spindle = model.partTree.getNode(id).getDescription(), views = model.partTree.getStockViews(id);
  for (const [name, notchIndex] of [["Left", 0], ["Right", 1]]) {
    const feature = getPartFeatures(spindle, views.find(view => view.name === name), views)
      .find(feature => feature.id === `N${notchIndex + 1}`);
    assert.ok(feature.outlineHidden);
    assert.ok(!feature.hidden, "Keep the leader and anchor for the exposed notch");
    assert.deepEqual(feature.outline, [
      [spindle.blank.length - 2, 0, notchIndex ? 1 : 0.5],
      [Math.max(...spindle.blank.profiles.positiveY.map(point => point[0])) - 2,
        spindle.blank.thickness, notchIndex ? 1 : 0.5],
    ], "Use each face's actual end, not a square-blank approximation");
    assert.deepEqual(feature.point, [0, 1, 2].map(axis =>
      (feature.outline[0][axis] + feature.outline[1][axis]) / 2));
  }
  const description = boardDescription(10, PINE, {
    startNear: { length: 2, depth: [0.5, 0.75] },
    endFar: { length: 3, depth: [0.25, 0.5] },
  });
  for (const direction of [[0, 0, -1], [0, 0, 1]]) {
    const features = getPartFeatures(description, { direction });
    assert.equal(features.length, 1, "Do not project the opposite edge's notch through the part");
    const feature = features[0], near = direction[2] < 0;
    assert.ok(feature.outlineHidden);
    assert.deepEqual(feature.outline, near ? [[2, 0, 0.5], [2, 0.75, 0.75]] :
      [[7, 0, 3.25], [7, 0.75, 3]]);
  }
  for (const direction of [[0, -1, 0], [0, 1, 0], [-1, 0, 0], [1, 0, 0]]) {
    assert.ok(getPartFeatures(description, { direction }).every(feature => !feature.outlineHidden),
      "Only edge views need the shoulder trace");
  }
  const rebate = structuredClone(description);
  rebate.notches = [{ ...rebate.notches[0], length: 10, lengths: [10, 10] }];
  assert.ok(getPartFeatures(rebate, { direction: [0, 0, -1] }).every(feature => !feature.outlineHidden),
    "A full-length rebate has no internal shoulder");
});

test("notched stock feature identities link exact per-face depths, exposed floor angles, and the hidden recess", () => {
  const description = notchedUprightDescription(), views = uprightViews;
  const features = name => getPartFeatures(description, views.find(view => view.name === name), views);
  const left = features("Left"), right = features("Right"), up = features("Up"), down = features("Down");
  assert.deepEqual(left.find(feature => feature.id === "N1").lines, []);
  assert.ok(left.find(feature => feature.id === "B1").lines.includes("Edge bevel: see Bottom"));
  assert.deepEqual(left.map(feature => feature.id), ["N1", "N2", "B1", "N3"]);
  assert.deepEqual(right.map(feature => feature.id), left.map(feature => feature.id));
  assert.equal(left.find(feature => feature.id === "B1").name, "Front edge bevel");
  for (const [face, list] of [[0, left], [1, right]]) {
    const dimension = list.find(feature => feature.id === "N1").dimensions.find(value => value.property === "depth");
    assert.equal(dimension.value, description.notches[0].depth[face]);
    assert.match(dimension.reference, new RegExp(`${face ? "Right" : "Left"} face`));
  }
  assert.equal(up.find(feature => feature.id === "N1").angles.length, 1);
  assert.equal(up.find(feature => feature.id === "B1").angles.length, 0, "The deeper end notch shadows this floor");
  assert.ok(up.find(feature => feature.id === "B1").hidden);
  assert.ok(!up.find(feature => feature.id === "N1").hidden);
  assert.ok(Math.abs(down.find(feature => feature.id === "B1").angles[0].valueDegrees - 5) < 1e-8);
  assert.ok(up.every(feature => feature.dimensions.length === 0), "No longitudinal dimensions parallel to sightline");
  assert.ok(right.find(feature => feature.id === "N3").hidden);
  assert.equal(right.find(feature => feature.id === "N3").dimensions.length, 0);
  assert.deepEqual(right.find(feature => feature.id === "N3").lines, []);
  const edgeRecess = features("Front").find(feature => feature.id === "N3");
  assert.equal(edgeRecess.dimensions[0].value, 0.5);
  assert.match(edgeRecess.dimensions[0].reference, /Normal to Left original face/);
});

test("hidden lumber recesses omit opposite-face prose but single-view plywood keeps the depth explanation", () => {
  const description = boardDescription(10, PINE, {},
    [{ face: "positiveY", start: 0, width: 1.5, depth: 0.25 }]);
  const view = { direction: [0, -1, 0] };
  const hidden = getPartFeatures(description, view)[0];
  assert.ok(hidden.hidden);
  assert.deepEqual(hidden.lines, []);
  assert.equal(hidden.outline.length, 4);
  description.kind = "plywood";
  const sheet = getPartFeatures(description, view)[0];
  assert.ok(sheet.lines.some(line => line.startsWith("Opening: see ")));
  assert.ok(sheet.lines.some(line => line.startsWith("Depth 1/4 in normal to ")));
});

test("notched stock bevel callouts give full-face width difference, not bevel length or total removal", () => {
    const description = notchedUprightDescription(true), views = uprightViews;
    const features = name => getPartFeatures(description, views.find(view => view.name === name), views);
    const bevel = features("Down").find(feature => feature.id === "B1");
    const notch = description.notches.find(notch => notch.length === description.blank.length);
    const difference = Math.abs(notch.depth[0] - notch.depth[1]);
    assert.ok(Math.abs(difference - 0.13123299528888602) < 1e-8);
    assert.ok(bevel.lines.includes(
      `Left face setback: ${formatLength(difference)} in from Right face (across width)`));
    assert.equal(bevel.dimensions.length, 0, "Do not anchor a profile dimension to the recessed-away face edge");
    assert.ok(Math.abs(bevel.angles[0].valueDegrees - 5) < 1e-8);
    assert.ok(!features("Up").find(feature => feature.id === "B1").lines.some(line => line.includes("face setback")),
      "Do not add the measurement to a bevel hidden by the deeper end notch");
});

test("single-view plywood retains both notch profiles and labels separate true-angle plane constructions", () => {
  const model = buildStairway();
  const step = model.steps[1], sheet = new Siding(step.footprint, step.height);
  sheet.edgeNotches.push({ profiles: [0, 1].map(face =>
    [[2, sheet.width - 2 + face / 8], [3.5, sheet.width - 2 + face / 8]]) });
  step.parts.siding = sheet;
  const tree = pieceTree(model), node = tree.getNode("stairway/module-1/step-2-siding");
  const description = node.getDescription(), views = tree.getStockViews(node.id);
  const view = views.find(view => view.name === "Right");
  const features = getPartFeatures(description, view, views);
  const notch = features.find(feature => feature.id === "N1");
  assert.ok(notch.lines.some(line => line.includes("face: X")));
  assert.ok(notch.lines.some(line => line.includes("depths from blank")));
  assert.ok(!features.some(feature => feature.lines.some(line => /see cutting description/.test(line))));
  const bevel = notch.angles.find(angle => angle.property === "Floor bevel");
  assert.ok(Math.abs(bevel.valueDegrees - Math.atan(0.125 / description.blank.thickness) * 180 / Math.PI) < 1e-8);
  assert.match(bevel.label, /plane profile/);
  for (const feature of features) for (const angle of feature.angles) {
    for (const normal of [angle.normal, angle.referenceNormal]) {
      assert.ok(Math.abs(normal.reduce((sum, value, axis) => sum + value * angle.viewDirection[axis], 0)) < 1e-8);
    }
  }
});

test("bending requirements distinguish identical flat patterns and explain the installed versus stock views", () => {
  const profile = [[0, 0], [20, 0], [20, 12], [10, 12], [10, 6], [0, 6]];
  const make = (innerRadius, startAngle = 0) => new BentPlywood({
    profile, thickness: 0.125, innerRadius, startAngle,
  }).getManufacturingDescription();
  const original = make(60);
  assert.equal(specification(original), specification(make(60, 0.5)));
  assert.notEqual(specification(original), specification(make(61)));
  const flat = structuredClone(original);
  delete flat.bend;
  assert.notEqual(specification(original), specification(flat));
  const formatted = formatPartDescription(original);
  assert.match(formatted.cuts.join(" "), /inner radius of 60 in.*mid-thickness/);
  assert.match(formatted.note, /flat cutting pattern.*installed bend/);
});

test("identity ignores naming, vertex enumeration, feature order, and numerical noise but not geometry", () => {
  const original = boardDescription(10, PINE, {
    startNear: { length: 1, depth: [0.5, 0.75] }, endFar: { length: 2, depth: [0.25, 0.5] },
  });
  const reordered = structuredClone(original);
  reordered.id = "somewhere-else";
  reordered.name = "Another role";
  reordered.blank.vertices.reverse();
  reordered.blank.faces.reverse();
  for (const face of reordered.blank.faces) {
    face.name = "Irrelevant face name";
    face.indices = face.indices.map(index => reordered.blank.vertices.length - 1 - index).reverse();
  }
  for (const points of Object.values(reordered.blank.profiles)) points.push(points.shift());
  reordered.edgeCuts.reverse();
  for (const cut of reordered.edgeCuts) {
    cut.name = "Another cut name";
    cut.points.reverse();
  }
  reordered.notches.reverse();
  reordered.notches[0].length += 1e-11;
  assert.equal(specification(original), specification(reordered));
  reordered.blank.faces[0].plane.offset += 0.001;
  assert.notEqual(specification(original), specification(reordered));
  const invalid = structuredClone(original);
  invalid.notches[0].depth[0] = NaN;
  assert.throws(() => manufacturingSpecification(invalid), /finite numbers/);
});

test("missing or invalid specifications remain individually accounted for and visibly unresolved", () => {
  const missingKey = boardDescription(), missingName = boardDescription(), invalidLength = boardDescription();
  delete missingKey.stock.materialKey;
  delete missingName.stock.material;
  invalidLength.cutLength = NaN;
  const tree = inventoryTree([null, missingKey, missingName, invalidLength, boardDescription()]);
  const inventory = new PartInventory(tree);
  assert.equal(inventory.quantity, tree.getLeaves().length);
  assert.equal(inventory.issues.length, 4);
  assert.equal(inventory.sections.at(-1).kind, "unresolved");
  assert.equal(inventory.sections.at(-1).entries.length, 4);
  assert.ok(inventory.issues.every(issue => issue.startsWith("Unresolved Part")));
  assert.ok(inventory.sections.at(-1).entries.every(entry => entry.quantity === 1 && entry.specification === null));
});

test("hardware grouping requires display metadata and never creates empty category sections", () => {
  const rebuild = change => {
    const changed = structuredClone(hardwareDescription);
    change(changed);
    return new PartInventory(inventoryTree([hardwareDescription, changed]));
  };
  const differentCategory = rebuild(description => { description.category = "Alternate category"; });
  assert.equal(differentCategory.entries.length, 1);
  assert.equal(differentCategory.sections.length, 1);
  assert.equal(differentCategory.sections[0].quantity, 2);
  const missingName = rebuild(description => { description.productName = ""; });
  assert.equal(missingName.quantity, 2);
  assert.equal(missingName.issues.length, 1);
  assert.match(missingName.issues[0], /Hardware product name is missing/);
});
