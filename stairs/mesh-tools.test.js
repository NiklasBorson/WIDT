import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { Board, buildStairway } from "./model.js";
import { exportStairway, serializeScene } from "./export-meshes.mjs";
import { checkConfigurations } from "./check-intersections.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const manifest = join(root, "mesh-clash", "Cargo.toml");
const target = join(root, "mesh-clash", "target");

async function temporaryDirectory(context) {
  const directory = await mkdtemp(join(tmpdir(), "stairs-mesh-tools-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("scene export is deterministic and includes every physical part in assembled world coordinates", () => {
  const model = buildStairway(24, 7, 2), xml = serializeScene(model);
  assert.equal(xml, serializeScene(model));
  assert.match(xml, /version="1" units="inches" space="world" axes="east-up-south"/);
  assert.match(xml, /stairWidth="24" stairCount="7" moduleCount="2"/);
  assert.equal((xml.match(/<part /g) ?? []).length, model.partTree.getLeaves().length);
  assert.equal((xml.match(/kind="hardware"/g) ?? []).length, 8);
  for (const node of model.partTree.getLeaves()) {
    const start = xml.indexOf(`<part id="${node.id}"`);
    assert.ok(start >= 0);
    const part = xml.slice(start, xml.indexOf("</part>", start));
    const geometry = model.createNodeGeometry(node.id);
    const positions = part.match(/<vertices>([\s\S]*?)<\/vertices>/)[1].trim().split(/\s+/).map(Number);
    const indices = part.match(/<triangles>([\s\S]*?)<\/triangles>/)[1].trim().split(/\s+/).map(Number);
    assert.deepEqual(positions, Array.from(geometry.positions, value => value === 0 ? 0 : value));
    assert.deepEqual(indices, Array.from(geometry.indices));
  }
});

test("XML names are escaped and malformed meshes are rejected with the part ID", () => {
  const model = buildStairway(), node = model.partTree.getLeaves()[0];
  const scene = {
    ...model,
    partTree: {
      getLeaves: () => [{ ...node, name: 'Board & <cut> "A" \'B\'' }],
      getNode: () => ({ name: "Module 1" }),
    },
  };
  assert.match(serializeScene(scene), /Board &amp; &lt;cut&gt; &quot;A&quot; &apos;B&apos;/);
  for (const geometry of [
    { positions: [NaN, 0, 0], indices: [0, 0, 0] },
    { positions: [0, 0, 0], indices: [0, 1, 2] },
    { positions: [], indices: [] },
    { positions: [0, 0], indices: [0, 0, 0] },
  ]) {
    assert.throws(() => serializeScene({ ...scene, createNodeGeometry: () => geometry }),
      error => error.message.includes(node.id));
  }
});

test("export CLI uses default width and rejects invalid configurations without writing a scene", async context => {
  const directory = await temporaryDirectory(context), file = join(directory, "scene.xml");
  await exportStairway(file, 8, 2);
  assert.match(await readFile(file, "utf8"), /stairWidth="24" stairCount="8" moduleCount="2"/);
  const invalid = join(directory, "invalid.xml");
  const result = spawnSync(process.execPath, [join(root, "export-meshes.mjs"), invalid, "7", "4"], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /moduleCount/);
  assert.deepEqual(await readdir(directory), ["scene.xml"]);
});

test("matrix builds once, runs all six configurations and retains only failures even after checker errors", async context => {
  const directory = await temporaryDirectory(context), calls = [], statuses = [0, 1, 2, 0, 1, 0];
  const run = (command, args) => {
    calls.push({ command, args });
    return { status: command === "cargo" ? 0 : statuses.shift() };
  };
  const result = await checkConfigurations(directory, run);
  assert.deepEqual(result, { passed: 3, failed: 2, errors: 1, exitCode: 2 });
  assert.equal(calls.filter(call => call.command === "cargo").length, 1);
  assert.equal(calls.length, 7);
  assert.deepEqual(await readdir(directory),
    ["7-steps-3-modules.xml", "8-steps-2-modules.xml", "9-steps-2-modules.xml"]);
  for (const file of await readdir(directory)) {
    assert.match(await readFile(join(directory, file), "utf8"), /stairWidth="24"/);
  }
  assert.deepEqual(calls.slice(1).map(call => call.args[0]),
    [7, 8, 9].flatMap(count => [2, 3].map(modules => join(directory, `${count}-steps-${modules}-modules.xml`))));
});

test("matrix fails explicitly on an unavailable Rust build", async context => {
  const directory = await temporaryDirectory(context);
  await assert.rejects(checkConfigurations(directory, () => ({ error: new Error("cargo unavailable") })),
    /cargo unavailable/);
});

test("Rust geometry regressions and CLI exit codes cover clear, touching, interfering and invalid scenes", async context => {
  const directory = await temporaryDirectory(context);
  for (const args of [
    ["test", "--locked", "--quiet", "--manifest-path", manifest],
    ["build", "--release", "--locked", "--quiet", "--manifest-path", manifest, "--target-dir", target],
  ]) {
    const built = spawnSync("cargo", args, { encoding: "utf8", timeout: 120000 });
    assert.equal(built.status, 0, built.error?.message ?? `${built.stdout}\n${built.stderr}`);
  }
  const executable = join(target, "release", process.platform === "win32" ? "mesh-clash.exe" : "mesh-clash");
  const board = new Board({ length: 2, width: 2, thickness: 2 });
  const geometry = board.createGeometry();
  const nodes = ["a", "b"].map(id => ({ id, name: `Board ${id}`, parentId: "module", stepNumber: null, kind: "lumber" }));
  const file = join(directory, "boxes.xml");
  for (const [offset, status] of [[3, 0], [2, 0], [1.999, 0], [1.99, 1], [1, 1], [0, 1]]) {
    const model = {
      stairWidth: 24, stepCount: 7, moduleCount: 2,
      partTree: { getLeaves: () => nodes, getNode: () => ({ name: 'Module & "one"' }) },
      createNodeGeometry: id => ({
        ...geometry,
        positions: geometry.positions.map((value, index) => value + (id === "b" && index % 3 === 0 ? offset : 0)),
      }),
    };
    await writeFile(file, serializeScene(model));
    const result = spawnSync(executable, [file], { encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, status, `${result.stdout}\n${result.stderr}`);
    if (status) {
      assert.match(result.stdout, /INTERFERENCE: Module & "one" \/ Board a \[a\] intersects/);
      assert.match(result.stdout, /Board b \[b\]/);
    }
    assert.match(result.stdout, /analysis inset 0.001 in per part/);
    if (offset === 1.999) {
      const unshaved = spawnSync(executable, [file, "--inset", "0"], { encoding: "utf8" });
      assert.equal(unshaved.status, 1, `${unshaved.stdout}\n${unshaved.stderr}`);
    }
    if (offset === 1.99) {
      const largerInset = spawnSync(executable, [file, "--inset", "0.01"], { encoding: "utf8" });
      assert.equal(largerInset.status, 0, `${largerInset.stdout}\n${largerInset.stderr}`);
    }
  }
  for (const value of ["-1", "NaN", "Infinity", "invalid"]) {
    const invalidInset = spawnSync(executable, [file, "--inset", value], { encoding: "utf8" });
    assert.equal(invalidInset.status, 2);
    assert.match(invalidInset.stderr, /Inset must be a finite nonnegative number/);
  }
  const model = buildStairway(), node = model.partTree.getLeaves()
    .find(part => part.id.endsWith("/step-3-leftUpright"));
  assert.ok(node);
  await writeFile(file, serializeScene({
    ...model,
    partTree: {
      getLeaves: () => [node, { ...node, id: "overlap-probe", name: "Overlap probe" }],
      getNode: id => model.partTree.getNode(id),
    },
    createNodeGeometry: () => model.createNodeGeometry(node.id),
  }));
  const duplicateUpright = spawnSync(executable, [file], { encoding: "utf8", timeout: 30000 });
  assert.equal(duplicateUpright.status, 1, `${duplicateUpright.stdout}\n${duplicateUpright.stderr}`);
  assert.ok(duplicateUpright.stdout.includes(`[${node.id}] intersects`));
  assert.match(duplicateUpright.stdout, /Overlap probe \[overlap-probe\]/);
  await writeFile(file, "<scene/>");
  const invalid = spawnSync(executable, [file], { encoding: "utf8" });
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /ERROR/);
});
