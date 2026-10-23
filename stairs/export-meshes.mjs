import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildStairway } from "./model.js";

const escapeXml = value => String(value).replace(/[<>&"']/g, character => ({
  "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;",
})[character]);

export function serializeScene(model) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<scene version="1" units="inches" space="world" axes="east-up-south" stairWidth="${model.stairWidth}" stairCount="${model.stepCount}" moduleCount="${model.moduleCount}">`,
  ];
  for (const node of model.partTree.getLeaves()) {
    const module = model.partTree.getNode(node.parentId);
    const name = [module.name, ...(node.stepNumber === null ? [] : [`Step ${node.stepNumber}`]), node.name].join(" / ");
    const { positions, indices } = model.createNodeGeometry(node.id);
    if (!positions.length || positions.length % 3 || !indices.length || indices.length % 3 ||
      !positions.every(Number.isFinite) ||
      !indices.every(index => Number.isSafeInteger(index) && index >= 0 && index < positions.length / 3)) {
      throw new Error(`Invalid mesh for ${node.id}.`);
    }
    lines.push(`  <part id="${escapeXml(node.id)}" name="${escapeXml(name)}" kind="${escapeXml(node.kind)}">`,
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

export async function exportStairway(output, stairCount = 9, moduleCount = 3) {
  const model = buildStairway(24, stairCount, moduleCount);
  const xml = serializeScene(model);
  await mkdir(dirname(resolve(output)), { recursive: true });
  await writeFile(output, xml, "utf8");
  return model.partTree.getLeaves().length;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  const usage = "Usage: node export-meshes.mjs OUTPUT.xml [STAIR_COUNT=9] [MODULE_COUNT=3]";
  if (args.length === 1 && args[0] === "--help") {
    console.log(usage);
  } else {
    try {
      if (!args.length || args.length > 3) throw new Error(usage);
      const count = await exportStairway(args[0], args[1] === undefined ? 9 : Number(args[1]),
        args[2] === undefined ? 3 : Number(args[2]));
      console.log(`Exported ${count} parts to ${args[0]}.`);
    } catch (error) {
      console.error(error.message);
      process.exitCode = 2;
    }
  }
}
