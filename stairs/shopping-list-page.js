import { buildStairway } from "./model.js";
import { PartInventory } from "./part-list.js";
import { createShoppingList } from "./shopping-list.js";
import { formatLength } from "./part-description.js";

function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function addRow(selector, values) {
  const row = element("tr");
  values.forEach((value, index) => {
    const cell = element(index === 0 ? "th" : "td");
    if (index === 0) cell.scope = "row";
    if (typeof value === "string" || typeof value === "number") cell.textContent = value;
    else cell.append(value);
    row.append(cell);
  });
  document.querySelector(selector).append(row);
}

try {
  const list = createShoppingList(new PartInventory(buildStairway().partTree));
  for (const item of list.lumber) {
    const stock = element("div");
    stock.append(element("strong", `${item.stock.material} ${item.stock.nominalSize}`),
      element("small", `${formatLength(item.stock.thickness)} x ${formatLength(item.stock.width)} in actual`));
    const choices = element("div");
    item.options.forEach((option, index) => {
      const choice = element("div");
      choice.append(element("strong", index === 0 ? "Suggested: " : "OR: "));
      choice.append(element("span", option.purchases.map(purchase =>
        `${purchase.quantity} ${purchase.quantity === 1 ? "board" : "boards"} x ${purchase.length / 12} ft`
      ).join(" + ")));
      choice.append(element("small", `${option.totalLength / 12} ft total`));
      choices.append(choice);
    });
    addRow("#shopping-lumber", [stock, choices, item.pieceCount]);
  }
  for (const item of list.sheets) {
    const stock = element("div");
    stock.append(element("strong", `${formatLength(item.stock.thickness)}-in ${item.stock.material.toLowerCase()}, 4 x 8 ft`));
    if (item.length < item.width) {
      stock.append(element("small", "8-ft direction follows panel height; confirm bending/grain direction with the supplier."));
    }
    addRow("#shopping-sheets", [stock, `${item.quantity} ${item.quantity === 1 ? "sheet" : "sheets"}`, item.pieceCount]);
  }
  for (const item of list.hardware) {
    const stock = element("div"), link = element("a", item.name);
    link.href = item.url;
    stock.append(link, element("small", item.summary));
    addRow("#shopping-hardware", [stock, `${item.quantity} pieces`]);
  }
  document.querySelector("#shopping-results").hidden = false;
} catch (cause) {
  console.error("Could not generate shopping list:", cause);
  const error = document.querySelector("#shopping-error");
  error.textContent = `Could not generate the shopping list: ${cause.message}`;
  error.hidden = false;
} finally {
  document.querySelector("#shopping-loading").hidden = true;
}
