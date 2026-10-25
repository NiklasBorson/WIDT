import assert from "node:assert/strict";
import test from "node:test";
import { buildStairway, NotchedBoard, Siding, BentPlywood, ProfiledPlywood, SpindleShim, PINE, OAK, PARTICLE_BOARD } from "./model.js";
import { PartInventory, PART_SUBSETS, manufacturingSpecification } from "./part-list.js";
import { formatLength, formatPartDescription, getSimpleEdgeBevel } from "./part-description.js";
import { getPartFeatures } from "./part-annotations.js";
import { PartTree } from "./parts.js";

const specification = description => JSON.stringify(manufacturingSpecification(description));
const boardDescription = (length = 10, material = PINE, notches = {}, dados = []) =>
  new NotchedBoard({ length, thickness: 0.75, width: 3.5, material,
    stock: { kind: "lumber", nominalSize: "1x4", thickness: 0.75, width: 3.5 } }, notches, dados)
    .getManufacturingDescription();

function inventoryTree(descriptions) {
  const module = { id: "module", name: "Module", kind: "module", children: [] };
  const root = { id: "root", name: "Root", kind: "stairway", children: [module] };
  const leaves = descriptions.map((description, index) => ({
    id: `part-${index}`, name: `Role ${index}`, parentId: module.id,
    kind: description?.kind ?? "lumber",
    getDescription: () => structuredClone(description),
  }));
  module.children = leaves;
  return { root, getLeaves: () => leaves, getAncestors: () => [root, module] };
}

const hardwareDescription = {
  kind: "hardware", productKey: "fixture-hardware", productName: "Fixture hardware",
  category: "Hardware", summary: "A purchased fixture part.",
};

test("arc-cut manufacturing identity and radius annotations use analytic edges, not mesh facets or placement", () => {
  const rib = buildStairway().modules[0].boards.outerBaseRail, description = rib.getManufacturingDescription();
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
    innerBaseRail: "Base rail - inner", outerBaseRail: "Base rail - outer",
    leftSupportBeam: "Beam - caster left", rightSupportBeam: "Beam - caster right",
    supportCrossPiece: "Beam - cross", rearSupportCrossPiece: "Beam - cross rear",
    leftUpright: ["Upright - front left", "Upright - full left"],
    rightUpright: "Upright - front right",
    leftRearUpright: "Upright - rear left", rightRearUpright: "Upright - rear right",
    leftSupportBlock: "Attachment block - upright left",
    rightSupportBlock: "Attachment block - upright right",
    leftBackSupportBlock: "Attachment block - rear support left",
    rightBackSupportBlock: "Attachment block - rear support right",
    southCrossPiece: "Tread support - front", northCrossPiece: "Tread support - rear",
    leftStepSupport: "Tread support - left", rightStepSupport: "Tread support - right",
    frontStepSupport: "Tread support - first-step front", rearStepSupport: "Tread support - first-step rear",
    newelInnerBlock: "Newel block - inner", newelRearBlock: "Newel block - rear",
    newel: "Newel post", riser: "Riser", tread: "Tread", backPanel: "Rear panel",
    frontSpindle: "Spindle - front", rearSpindle: "Spindle - rear", spindleShim: "Spindle shim",
    siding: ["Side panel - curved", "Side panel - right rear section"],
    frontSiding: "Side panel - right front section",
  };
  const seen = new Set();
  for (const steps of [6, 7, 8, 9]) for (const modules of [2, 3]) {
    const model = buildStairway(24, steps, modules), inventory = new PartInventory(model.partTree);
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
  const combined = inventory.filter({ moduleNumber: 1, subset: "cladding", stockKey: key });
  assert.ok(combined.occurrences.length);
  assert.ok(combined.occurrences.every(({ entry, location }) =>
    entry.stockKey === key && location.moduleNumber === 1 && location.category === "siding"));
  assert.equal(combined.uniqueCount, new Set(combined.occurrences.map(({ entry }) => entry.key)).size);
  assert.deepEqual(inventory.filter({ moduleNumber: 1, subset: "framing", stockKey: key }),
    { occurrences: [], groups: [], uniqueCount: 0 });
  assert.deepEqual(inventory.filter({ moduleNumber: 4 }), { occurrences: [], groups: [], uniqueCount: 0 });
  const framing = inventory.filter({ subset: "framing" });
  assert.ok(framing.occurrences.length);
  assert.ok(framing.occurrences.every(({ entry, location }) =>
    location.category === "base-rails" ? entry.kind === "plywood" : entry.kind === "lumber" &&
      !["plywood", "siding", "particle-board", "newel", "spindles"].includes(location.category)));
  assert.throws(() => inventory.filter({ subset: "missing" }), /Unknown part subset/);
});

test("curated subsets cover every modeled role, overlap deliberately, and distinguish framing from without cladding", () => {
  assert.deepEqual(PART_SUBSETS.map(subset => subset.label), [
    "All parts", "Framing", "Foundation", "Step framing", "Treads and risers", "Cladding", "Banister", "Without cladding",
  ]);
  for (const steps of [6, 7, 8, 9]) for (const modules of [2, 3]) {
    const model = buildStairway(24, steps, modules), inventory = new PartInventory(model.partTree);
    const locations = new Map(inventory.filter().occurrences.map(({ location }) => [location.id, location]));
    const ids = subset => new Set(inventory.filter({ subset }).occurrences.map(({ location }) => location.id));
    const framing = ids("framing"), foundation = ids("foundation"), stepFraming = ids("step-framing");
    const cladding = ids("cladding"), banister = ids("banister"), surfaces = ids("treads-risers");
    const withoutCladding = ids("without-cladding");
    for (const node of model.partTree.getLeaves()) {
      const { id, key } = node;
      assert.ok([foundation, stepFraming, cladding, banister, surfaces].some(group => group.has(id)),
        `Unclassified part role: ${key}`);
      assert.equal(framing.has(id), (node.kind === "lumber" || node.category === "base-rails") &&
        (foundation.has(id) || stepFraming.has(id)));
      assert.equal(withoutCladding.has(id), !cladding.has(id));
      assert.equal(cladding.has(id), ["siding", "frontSiding", "backPanel"].includes(key));
      assert.equal(surfaces.has(id), ["tread", "riser"].includes(key));
      assert.equal(banister.has(id), ["newel", "frontSpindle", "rearSpindle", "spindleShim",
        "newelInnerBlock", "newelRearBlock", "rightUpright", "rightRearUpright"].includes(key) ||
        (key === "southCrossPiece" && node.stepNumber === 1));
      if (node.kind === "hardware") {
        assert.ok(foundation.has(id));
        assert.ok(withoutCladding.has(id));
        assert.ok(!framing.has(id));
      }
      if (node.category === "base-rails") {
        assert.ok(foundation.has(id) && framing.has(id) && !cladding.has(id) && !banister.has(id));
      }
      if (["newelInnerBlock", "newelRearBlock"].includes(key)) {
        assert.ok(framing.has(id) && stepFraming.has(id) && banister.has(id));
      }
      if (["rightUpright", "rightRearUpright"].includes(key)) {
        assert.ok(framing.has(id) && stepFraming.has(id) && banister.has(id));
      }
      if (["leftUpright", "leftRearUpright"].includes(key)) assert.ok(!banister.has(id));
      if (key === "southCrossPiece") assert.equal(foundation.has(id), node.stepNumber === 1);
      if (["frontStepSupport", "rearStepSupport"].includes(key)) assert.ok(foundation.has(id) && stepFraming.has(id));
      if (["newel", "frontSpindle", "rearSpindle", "spindleShim", "tread", "riser"].includes(key)) {
        assert.ok(withoutCladding.has(id) && !framing.has(id));
      }
      assert.ok(Object.isFrozen(locations.get(id).subsets));
    }
    assert.equal(inventory.filter().occurrences.length, model.partTree.getLeaves().length);
  }
});

test("base rails retain their analytic six-inch bands and three-quarter-inch plywood specifications", () => {
  for (const modules of [2, 3]) {
    const model = buildStairway(24, 9, modules), inventory = new PartInventory(model.partTree);
    const rails = inventory.entries.filter(entry => entry.locations.some(location => location.category === "base-rails"));
    assert.equal(rails.reduce((sum, entry) => sum + entry.quantity, 0), modules * 2);
    for (const entry of rails) for (const location of entry.locations) {
      assert.equal(entry.kind, "plywood");
      assert.ok(location.subsets.includes("foundation") && location.subsets.includes("framing") &&
        location.subsets.includes("without-cladding"));
    }
    for (const node of model.partTree.getLeaves().filter(node => node.category === "base-rails")) {
      const description = node.getDescription();
      assert.equal(description.stock.thickness, 0.75);
      assert.equal(description.blank.thickness, 0.75);
      assert.equal(description.construction.arc.radius - description.construction.innerRadius, 6);
      const moved = new ProfiledPlywood({ construction: description.construction, thickness: 0.75,
        origin: [100, 200], heading: 1.3, bottomHeight: 50 });
      assert.equal(specification(description), specification(moved.getManufacturingDescription()));
      const features = getPartFeatures(description, { direction: [0, 1, 0], up: [0, 0, -1] });
      assert.equal(features.filter(feature => feature.kind === "arc").length, 2);
    }
  }
});

test("scoped Parts titles describe visible steps without changing global identity or quantity", () => {
  const inventory = new PartInventory(buildStairway().partTree);
  const tread = inventory.entries.find(entry => entry.title === "Tread (steps 2-9)");
  assert.ok(tread);
  assert.equal(tread.quantity, 8);
  const scoped = inventory.filter({ moduleNumber: 1 }).groups.find(group => group.entry.key === tread.key);
  assert.equal(scoped.entry, tread);
  assert.equal(scoped.title, "Tread (steps 2-3)");
  assert.equal(scoped.locations.length, 2);
  assert.equal(tread.title, "Tread (steps 2-9)");
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
  const post = new NotchedBoard({ length: 40, width: 3.5, thickness: 3.5, material: OAK,
    stock: { kind: "lumber", nominalSize: "4x4", thickness: 3.5, width: 3.5 } });
  const tree = new PartTree({
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
  const sidingGroup = inventory.filter({ subset: "cladding" }).groups
    .find(group => group.locations.some(location => location.id === siding.id));
  assert.equal(sidingGroup.entry.quantity, 3);
  assert.equal(sidingGroup.locations.length, 2);
  assert.equal(sidingGroup.title, "Side panel - right rear section / Side panel - right front section");
  assert.ok(sidingGroup.locations.every(location => location.category === "siding"));
});

test("particle board has independent visibility and inventory identity while remaining sheet stock", () => {
  const dimensions = { length: 12, width: 8, thickness: 0.25,
    stock: { kind: "plywood", thickness: 0.25 } };
  const sheet = new NotchedBoard(dimensions);
  const particle = new NotchedBoard({ ...dimensions, material: PARTICLE_BOARD });
  const tree = new PartTree({
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

test("the inventory coalesces manufacturing patterns and retains every occurrence exactly once", () => {
  const tree = inventoryTree([
    boardDescription(), boardDescription(), boardDescription(10, OAK),
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
  assert.notEqual(a, specification(boardDescription(10, OAK)));
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
    assert.ok(Math.abs(features[0].angles[0].valueDegrees - 15) < 1e-8);
    assert.ok(features[0].dimensions.some(dimension => dimension.property === "length"));
  }
});

test("simple edge bevels need only an actual end-profile angle, not linked feature constructions", () => {
  const model = buildStairway();
  const node = model.partTree.getNode("stairway/module-1/step-3-leftBackSupportBlock");
  const description = node.getDescription(), views = model.partTree.getStockViews(node.id);
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
    assert.ok(Math.abs(cutPoint[2] - description.notches[0].depth[0]) < 1e-8);
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
  for (const stepCount of [7, 8, 9]) {
    const newel = buildStairway(24, stepCount, 3).steps[0].parts.newel;
    const description = newel.getManufacturingDescription();
    const start = newel.cornerBevel.bottomHeight - newel.bottomHeight;
    const end = newel.cornerBevel.topHeight - newel.bottomHeight;
    const face = getPartFeatures(description, { direction: [0, -1, 0] })
      .find(feature => feature.name === "Newel corner bevel");
    assert.ok(face);
    assert.equal(face.outline, null);
    const feature = getPartFeatures(description, { direction: [-1, 0, 0] }, [])
      .find(feature => feature.id === face.id);
    const degrees = stepCount === 9 ? 15 : 135 / stepCount;
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
      [47.75 - 2, spindle.blank.thickness, notchIndex ? 1 : 0.5],
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

test("upright feature identities link exact per-face depths, exposed floor angles, and the hidden recess", () => {
  const model = buildStairway();
  const node = model.partTree.getNode("stairway/module-1/step-3-rightUpright");
  const description = node.getDescription(), views = model.partTree.getStockViews(node.id);
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

test("upright bevel callouts give full-face width difference, not bevel length or total removal", () => {
  const model = buildStairway();
  for (const id of ["stairway/module-1/step-2-leftUpright", "stairway/module-2/step-4-leftUpright"]) {
    const node = model.partTree.getNode(id), description = node.getDescription();
    const views = model.partTree.getStockViews(id);
    const features = name => getPartFeatures(description, views.find(view => view.name === name), views);
    const bevel = features("Down").find(feature => feature.id === "B1");
    const notch = description.notches.find(notch => notch.length === description.blank.length);
    const difference = Math.abs(notch.depth[0] - notch.depth[1]);
    assert.ok(Math.abs(difference - 0.13123299528888602) < 1e-8);
    assert.ok(bevel.lines.includes(
      `Left face setback: ${formatLength(difference)} in from Right face (across width)`), id);
    assert.equal(bevel.dimensions.length, 0, "Do not anchor a profile dimension to the recessed-away face edge");
    assert.ok(Math.abs(bevel.angles[0].valueDegrees - 5) < 1e-8);
    assert.ok(!features("Up").find(feature => feature.id === "B1").lines.some(line => line.includes("face setback")),
      "Do not add the measurement to a bevel hidden by the deeper end notch");
  }
});

test("single-view plywood retains both notch profiles and labels separate true-angle plane constructions", () => {
  const model = buildStairway();
  const step = model.steps[1], sheet = new Siding(step.footprint, step.height, step.cornerRadius);
  sheet.edgeNotches.push({ profiles: [0, 1].map(face =>
    [[2, sheet.width - 2 + face / 8], [3.5, sheet.width - 2 + face / 8]]) });
  step.parts.siding = sheet;
  const tree = new PartTree(model), node = tree.getNode("stairway/module-1/step-2-siding");
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
  assert.ok(inventory.issues.every(issue => issue.startsWith("Could not group")));
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
