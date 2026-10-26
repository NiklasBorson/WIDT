import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildStairway } from "./model.js";
import { parseArgs } from "node:util";

const escapeXml = value => String(value).replace(/[<>&"']/g, character => ({
  "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;",
})[character]);

function excludedPieces(model, excludePieceIds) {
  if (!Array.isArray(excludePieceIds)) throw new TypeError("Piece exclusions must be an array of piece IDs.");
  const leaves = model.partTree.getLeaves();
  for (const id of excludePieceIds) {
    if (!leaves.some(node => node.id === id)) throw new RangeError(`Unknown excluded piece: ${id}`);
  }
  return leaves.filter(node => excludePieceIds.includes(node.id));
}

export function serializeScene(model, { excludePieceIds = [] } = {}) {
  const excluded = new Set(excludedPieces(model, excludePieceIds).map(node => node.id));
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<scene version="1" units="inches" space="world" axes="east-up-south" stairWidth="${model.stairWidth}" stairCount="${model.stepCount}" moduleCount="${model.moduleCount}">`,
  ];
  const meshes = model.partTree.getLeaves().filter(node => !excluded.has(node.id)).map(node => {
    const module = model.partTree.getNode(node.parentId);
    const name = [module.name, ...(node.stepNumber === null ? [] : [`Step ${node.stepNumber}`]), node.name].join(" / ");
    return { id: node.id, name, kind: node.kind, geometry: model.createNodeGeometry(node.id) };
  });
  if (model.createCastleGeometry) {
    meshes.push({ id: "castle", name: "Castle", kind: "environment", geometry: model.createCastleGeometry() });
  }
  for (const node of meshes) {
    const { positions, indices } = node.geometry;
    if (!positions.length || positions.length % 3 || !indices.length || indices.length % 3 ||
      !positions.every(Number.isFinite) ||
      !indices.every(index => Number.isSafeInteger(index) && index >= 0 && index < positions.length / 3)) {
      throw new Error(`Invalid mesh for ${node.id}.`);
    }
    lines.push(`  <part id="${escapeXml(node.id)}" name="${escapeXml(node.name)}" kind="${escapeXml(node.kind)}">`,
      "    <vertices>");
    for (let i = 0; i < positions.length; i += 3) {
      lines.push(`      ${positions[i]} ${positions[i + 1]} ${positions[i + 2]}`);
    }
    lines.push("    </vertices>", "    <triangles>");
    for (let i = 0; i < indices.length; i += 3) {
      lines.push(`      ${indices[i]} ${indices[i + 1]} ${indices[i + 2]}`);
    }
    lines.push("    </triangles>", "  </part>");
  }
  lines.push("</scene>", "");
  return lines.join("\n");
}

export async function exportStairway(output, stairCount = 9, moduleCount = 3, { excludePieceIds = [] } = {}) {
  const model = buildStairway(undefined, stairCount, moduleCount);
  const excluded = excludedPieces(model, excludePieceIds);
  const xml = serializeScene(model, { excludePieceIds });
  await mkdir(dirname(resolve(output)), { recursive: true });
  await writeFile(output, xml, "utf8");
  if (excluded.length) {
    console.log(`Excluded ${excluded.length} pieces from clash coverage:`);
    for (const node of excluded) console.log(`  ${node.id}: ${node.name}`);
  }
  return model.partTree.getLeaves().length - excluded.length + 1;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  const usage = "Usage: node export-meshes.mjs OUTPUT.xml [STAIR_COUNT=9] [MODULE_COUNT=3] [--exclude-piece ID ...]";
  if (args.length === 1 && args[0] === "--help") {
    console.log(usage);
  } else {
    try {
      const { values, positionals } = parseArgs({ args, allowPositionals: true,
        options: { "exclude-piece": { type: "string", multiple: true } } });
      if (!positionals.length || positionals.length > 3) throw new Error(usage);
      const count = await exportStairway(positionals[0], positionals[1] === undefined ? 9 : Number(positionals[1]),
        positionals[2] === undefined ? 3 : Number(positionals[2]), { excludePieceIds: values["exclude-piece"] ?? [] });
      console.log(`Exported ${count} meshes (including the castle) to ${positionals[0]}.`);
    } catch (error) {
      console.error(error.message);
      process.exitCode = 2;
    }
  }
}
