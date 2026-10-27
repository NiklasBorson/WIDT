export const SHOPPING_STOCK = Object.freeze({
  boardLengths: Object.freeze([96, 120, 144]), sheetLength: 96, sheetWidth: 48,
  kerf: 1 / 8, boardEndTrim: 2, sheetEdgeTrim: 1 / 2, blankAllowance: 1 / 2,
});

function blankDimension(value) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError("Shopping estimates require positive, finite cutting-blank dimensions.");
  }
  return Math.ceil((value + SHOPPING_STOCK.blankAllowance) * 4 - 1e-8) / 4;
}

function cuttingBlanks(section) {
  return section.entries.flatMap(entry => entry.occurrenceIds.map(id => ({
    id, length: blankDimension(entry.description.blank.length),
    ...(section.kind === "plywood" ? { width: blankDimension(entry.description.blank.width) } : {}),
  })));
}

function planBoards(section) {
  const { boardLengths, boardEndTrim, kerf } = SHOPPING_STOCK;
  const cuts = cuttingBlanks(section).sort((a, b) => b.length - a.length || a.id.localeCompare(b.id));
  const options = [];
  for (const maximumLength of boardLengths) {
    const usableLength = maximumLength - 2 * boardEndTrim;
    if (cuts.some(cut => cut.length + kerf > usableLength)) continue;
    const boards = [];
    for (const cut of cuts) {
      const required = cut.length + kerf;
      let board = boards.find(board => board.usedLength + required <= usableLength);
      if (!board) boards.push(board = { usedLength: 0, cuts: [] });
      board.cuts.push(cut);
      board.usedLength += required;
    }
    // Shorten each packed board to the smallest standard length that still fits.
    for (const board of boards) {
      board.length = boardLengths.find(length => board.usedLength <= length - 2 * boardEndTrim);
    }
    const purchases = boardLengths.map(length => ({
      length, quantity: boards.filter(board => board.length === length).length,
    })).filter(purchase => purchase.quantity);
    if (options.some(option => JSON.stringify(option.purchases) === JSON.stringify(purchases))) continue;
    options.push({ purchases, boards, quantity: boards.length,
      totalLength: boards.reduce((sum, board) => sum + board.length, 0) });
  }
  if (!options.length) {
    throw new RangeError(`${section.stock.material} ${section.stock.nominalSize}: ` +
      "a cutting blank exceeds the standard board lengths with the stated allowances.");
  }
  options.sort((a, b) => a.totalLength - b.totalLength || a.quantity - b.quantity ||
    a.purchases.at(-1).length - b.purchases.at(-1).length);
  return { stock: section.stock, pieceCount: cuts.length, options };
}

function planSheets(section) {
  const { sheetLength, sheetWidth, sheetEdgeTrim, kerf } = SHOPPING_STOCK;
  const cuts = cuttingBlanks(section).sort((a, b) =>
    b.width - a.width || b.length - a.length || a.id.localeCompare(b.id));
  const long = sheetLength - 2 * sheetEdgeTrim, short = sheetWidth - 2 * sheetEdgeTrim;
  // Keep the same stock/grain axes for every blank in a group.
  const orientation = [[long, short], [short, long]].find(([length, width]) =>
    cuts.every(cut => cut.length + kerf <= length && cut.width + kerf <= width));
  if (!orientation) {
    throw new RangeError(`${section.stock.material}, ${section.stock.thickness} in: ` +
      "cutting blanks cannot share a 4 x 8-ft sheet orientation with the stated allowances.");
  }
  const [length, width] = orientation, sheets = [];
  for (const cut of cuts) {
    let row;
    for (const sheet of sheets) {
      row = sheet.rows.find(row =>
        cut.width <= row.height && row.usedLength + cut.length + kerf <= length);
      if (row) break;
      if (sheet.usedWidth + cut.width + kerf <= width) {
        row = { height: cut.width, usedLength: 0, cuts: [] };
        sheet.rows.push(row);
        sheet.usedWidth += cut.width + kerf;
        break;
      }
    }
    if (!row) {
      row = { height: cut.width, usedLength: 0, cuts: [] };
      sheets.push({ usedWidth: cut.width + kerf, rows: [row] });
    }
    row.cuts.push(cut);
    row.usedLength += cut.length + kerf;
  }
  return { stock: section.stock, quantity: sheets.length, pieceCount: cuts.length,
    length, width, sheets };
}

export function createShoppingList(inventory) {
  if (inventory.issues.length) throw new Error(inventory.issues.join("\n"));
  const lumber = [], sheets = [], hardware = [];
  for (const section of inventory.sections) {
    if (section.kind === "lumber") lumber.push(planBoards(section));
    else if (section.kind === "plywood") sheets.push(planSheets(section));
    else if (section.kind === "hardware") {
      for (const entry of section.entries) {
        const { productName, productUrl, summary } = entry.description;
        if (!productName || new URL(productUrl).protocol !== "https:") {
          throw new TypeError("Purchased hardware requires a name and an HTTPS product link.");
        }
        hardware.push({ name: productName, url: productUrl, summary, quantity: entry.quantity });
      }
    } else throw new TypeError(`Unsupported shopping-list stock kind: ${section.kind}`);
  }
  return { lumber, sheets, hardware };
}
