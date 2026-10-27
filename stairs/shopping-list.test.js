import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { buildStairway } from "./model.js";
import { PartInventory } from "./part-list.js";
import { formatLength } from "./part-description.js";
import { createShoppingList, SHOPPING_STOCK } from "./shopping-list.js";

function inventoryFixture(kind, dimensions) {
  return {
    issues: [],
    sections: [{
      kind, stock: { kind, material: "Pine", nominalSize: "1x4", thickness: 0.75, width: 3.5 },
      entries: dimensions.map(([length, width], index) => ({
        description: { blank: { length, width } }, occurrenceIds: [`piece-${index}`],
      })),
    }],
  };
}

test("board estimates reuse practical offcuts while reserving end trim, blank allowances and saw kerfs", () => {
  const estimate = lengths => createShoppingList(inventoryFixture("lumber", lengths.map(length => [length]))).lumber[0];
  assert.equal(estimate([60, 50, 30, 20]).options[0].quantity, 2);
  assert.deepEqual(estimate([45.25, 45.25]).options[0].purchases, [{ length: 96, quantity: 1 }]);
  assert.deepEqual(estimate([45.375, 45.375]).options[0].purchases, [{ length: 120, quantity: 1 }],
    "Kerfs and rounding must not disappear at a tight fit.");
  assert.throws(() => estimate([144]), /exceeds the standard board lengths/);
  for (const invalid of [0, -1, NaN, Infinity]) assert.throws(() => estimate([invalid]), /cutting-blank dimensions/);
});

test("board choices include a mixed-length saving and the eight-foot-only alternative", () => {
  const { options } = createShoppingList(inventoryFixture("lumber", [[50], [50], [70]])).lumber[0];
  assert.deepEqual(options[0].purchases, [{ length: 96, quantity: 1 }, { length: 120, quantity: 1 }]);
  assert.equal(options[0].totalLength, 216);
  assert.ok(options.some(option =>
    option.purchases.length === 1 && option.purchases[0].length === 96 && option.purchases[0].quantity === 3));
  assert.equal(new Set(options.map(option => JSON.stringify(option.purchases))).size, options.length);
  const long = createShoppingList(inventoryFixture("lumber", [[130]])).lumber[0];
  assert.deepEqual(long.options[0].purchases, [{ length: 144, quantity: 1 }]);
});

test("sheet estimates use rectangular rows rather than area division or individually rotating grain axes", () => {
  const estimate = dimensions => createShoppingList(inventoryFixture("plywood", dimensions)).sheets[0];
  assert.equal(estimate(Array.from({ length: 4 }, () => [45, 20])).quantity, 1);
  assert.equal(estimate(Array.from({ length: 5 }, () => [45, 20])).quantity, 2);
  const tall = estimate([[30, 75]]);
  assert.equal(tall.quantity, 1);
  assert.deepEqual([tall.length, tall.width], [47, 95]);
  assert.throws(() => estimate([[70, 20], [20, 70]]), /cannot share a 4 x 8-ft sheet orientation/);
  assert.throws(() => estimate([[96, 48]]), /stated allowances/);
});

test("shopping plans cover every model occurrence exactly once without overfilling stock or changing inventory", () => {
  const { kerf, boardLengths, boardEndTrim, blankAllowance } = SHOPPING_STOCK;
  for (const width of [20, 24, 36]) {
    const model = buildStairway(width), inventory = new PartInventory(model.partTree);
    const snapshot = JSON.stringify(inventory.entries.map(entry => entry.description));
    const list = createShoppingList(inventory), planned = [];
    assert.deepEqual(createShoppingList(inventory), list);
    const checkCut = cut => {
      const source = inventory.findOccurrence(cut.id).description.blank;
      assert.ok(cut.length >= source.length + blankAllowance - 1e-8);
      if (cut.width !== undefined) assert.ok(cut.width >= source.width + blankAllowance - 1e-8);
    };
    for (const item of list.lumber) {
      for (const option of item.options) {
        assert.equal(option.quantity, option.boards.length);
        assert.equal(option.totalLength, option.purchases.reduce((sum, purchase) =>
          sum + purchase.quantity * purchase.length, 0));
        assert.equal(item.pieceCount, option.boards.flatMap(board => board.cuts).length);
        for (const board of option.boards) {
          assert.ok(boardLengths.includes(board.length));
          assert.ok(board.usedLength <= board.length - 2 * boardEndTrim);
          assert.equal(board.usedLength, board.cuts.reduce((sum, cut) => sum + cut.length + kerf, 0));
          board.cuts.forEach(checkCut);
        }
        assert.deepEqual(option.boards.flatMap(board => board.cuts.map(cut => cut.id)).sort(),
          inventory.sections.find(section => section.stock === item.stock)
          .entries.flatMap(entry => entry.occurrenceIds).sort());
      }
      planned.push(...item.options[0].boards.flatMap(board => board.cuts.map(cut => cut.id)));
    }
    for (const item of list.sheets) {
      assert.equal(item.quantity, item.sheets.length);
      assert.equal(item.pieceCount, item.sheets.flatMap(sheet => sheet.rows.flatMap(row => row.cuts)).length);
      for (const sheet of item.sheets) {
        assert.ok(sheet.usedWidth <= item.width);
        assert.equal(sheet.usedWidth, sheet.rows.reduce((sum, row) => sum + row.height + kerf, 0));
        for (const row of sheet.rows) {
          assert.ok(row.usedLength <= item.length);
          assert.equal(row.usedLength, row.cuts.reduce((sum, cut) => sum + cut.length + kerf, 0));
          assert.ok(row.cuts.every(cut => cut.width <= row.height));
          row.cuts.forEach(cut => { checkCut(cut); planned.push(cut.id); });
        }
      }
    }
    const woodenIds = model.partTree.getLeaves().filter(piece => piece.kind !== "hardware").map(piece => piece.id);
    assert.deepEqual(planned.sort(), woodenIds.sort());
    assert.deepEqual(list.hardware, inventory.entries.filter(entry => entry.kind === "hardware").map(entry => ({
      name: entry.description.productName, url: entry.description.productUrl,
      summary: entry.description.summary, quantity: entry.quantity,
    })));
    assert.equal(JSON.stringify(inventory.entries.map(entry => entry.description)), snapshot);
  }
});

test("unresolved parts and missing hardware product links cannot produce a success-shaped shopping list", () => {
  assert.throws(() => createShoppingList({ issues: ["Unresolved test part"] }), /Unresolved test part/);
  const inventory = { issues: [], sections: [{ kind: "hardware", entries: [{
    description: { productName: "Hardware" }, quantity: 2,
  }] }] };
  assert.throws(() => createShoppingList(inventory), TypeError);
});

function shoppingPage(list, failure = null) {
  const element = tag => ({
    tagName: tag, children: [], textContent: "", hidden: false,
    append(...children) { this.children.push(...children); },
  });
  const ids = ["shopping-lumber", "shopping-sheets", "shopping-hardware",
    "shopping-results", "shopping-loading", "shopping-error"];
  const nodes = new Map(ids.map(id => [`#${id}`, element("div")]));
  nodes.get("#shopping-results").hidden = nodes.get("#shopping-error").hidden = true;
  const errors = [];
  runInNewContext(readFileSync(new URL("./shopping-list-page.js", import.meta.url), "utf8")
    .replace(/^import .*;\r?$/gm, ""), {
    document: {
      createElement: element,
      querySelector(selector) {
        assert.ok(nodes.has(selector), `Unexpected shopping-page selector: ${selector}`);
        return nodes.get(selector);
      },
    },
    console: { error(...args) { errors.push(args); } },
    buildStairway: () => ({ partTree: {} }),
    PartInventory: class {},
    createShoppingList: () => { if (failure) throw failure; return list; },
    formatLength,
  });
  return { nodes, errors };
}

test("shopping page displays raw-stock quantities and individual hardware links, not cutting-piece rows", () => {
  const list = createShoppingList(new PartInventory(buildStairway().partTree));
  const { nodes, errors } = shoppingPage(list);
  assert.deepEqual(errors, []);
  assert.equal(nodes.get("#shopping-results").hidden, false);
  assert.equal(nodes.get("#shopping-loading").hidden, true);
  assert.equal(nodes.get("#shopping-error").hidden, true);
  const lumberRows = nodes.get("#shopping-lumber").children;
  assert.equal(lumberRows.length, list.lumber.length);
  lumberRows.forEach((row, index) => {
    const item = list.lumber[index], choices = row.children[1].children[0].children;
    assert.equal(choices.length, item.options.length);
    assert.equal(row.children[2].textContent, item.pieceCount);
    choices.forEach((choice, optionIndex) => {
      assert.equal(choice.children[0].textContent, optionIndex === 0 ? "Suggested: " : "OR: ");
      assert.equal(choice.children[1].textContent, item.options[optionIndex].purchases.map(purchase =>
        `${purchase.quantity} ${purchase.quantity === 1 ? "board" : "boards"} x ${purchase.length / 12} ft`
      ).join(" + "));
    });
  });
  const sheetRows = nodes.get("#shopping-sheets").children;
  assert.equal(sheetRows.length, list.sheets.length);
  sheetRows.forEach((row, index) => {
    assert.match(row.children[1].textContent, new RegExp(`^${list.sheets[index].quantity} `));
    assert.equal(row.children[2].textContent, list.sheets[index].pieceCount);
  });
  nodes.get("#shopping-hardware").children.forEach((row, index) => {
    assert.equal(row.children[0].children[0].children[0].href, list.hardware[index].url);
    assert.equal(row.children[1].textContent, `${list.hardware[index].quantity} pieces`);
  });
});

test("shopping page reports generation failures visibly instead of displaying partial quantities", () => {
  const { nodes, errors } = shoppingPage(null, new Error("Stock does not fit"));
  assert.equal(errors.length, 1);
  assert.equal(nodes.get("#shopping-results").hidden, true);
  assert.equal(nodes.get("#shopping-loading").hidden, true);
  assert.equal(nodes.get("#shopping-error").hidden, false);
  assert.match(nodes.get("#shopping-error").textContent, /Stock does not fit/);
});

test("shopping navigation links both pages and provides the requested wood references", () => {
  const home = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const page = readFileSync(new URL("./shopping-list.html", import.meta.url), "utf8");
  assert.match(home, /href="\.\/shopping-list\.html"/);
  assert.match(page, /href="\.\/index\.html"/);
  for (const slug of ["eastern-white-pine", "douglas-fir"]) {
    assert.ok(page.includes(`href="https://www.wood-database.com/${slug}/"`));
  }
});
