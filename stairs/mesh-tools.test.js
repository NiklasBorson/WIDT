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
  const model = buildStairway(24), xml = serializeScene(model);
  assert.equal(xml, serializeScene(model));
  assert.match(xml, /version="1" units="inches" space="world" axes="east-up-south"/);
  assert.match(xml, /stairWidth="24" stairCount="9" moduleCount="3"/);
  assert.equal((xml.match(/<part /g) ?? []).length, model.partTree.getLeaves().length + 1);
  assert.match(xml, /<part id="castle" name="Castle" kind="environment">/);
  const castle = xml.slice(xml.indexOf('<part id="castle"'), xml.lastIndexOf("</part>"));
  assert.deepEqual(castle.match(/<vertices>([\s\S]*?)<\/vertices>/)[1].trim().split(/\s+/).map(Number),
    Array.from(model.createCastleGeometry().positions, value => value === 0 ? 0 : value));
  assert.equal((xml.match(/kind="hardware"/g) ?? []).length, 12);
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
    createNodeGeometry: model.createNodeGeometry.bind(model),
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

test("explicit piece exclusions omit only selected panels, reject unknown IDs, and leave full exports unchanged", async context => {
  const model = buildStairway(), ids = model.modules.map((_, i) => `stairway/module-${i + 1}/siding`);
  const full = serializeScene(model), filtered = serializeScene(model, { excludePieceIds: ids });
  for (const id of ids) {
    assert.ok(full.includes(`<part id="${id}"`));
    assert.ok(!filtered.includes(`<part id="${id}"`));
  }
  for (const id of ["stairway/module-1/step-1-siding", "stairway/module-1/step-1-frontSiding"]) {
    assert.ok(filtered.includes(`<part id="${id}"`), "Both flat step-1 panels remain checked.");
  }
  assert.equal((full.match(/<part /g) ?? []).length - (filtered.match(/<part /g) ?? []).length, 3);
  assert.throws(() => serializeScene(model, { excludePieceIds: ["stairway/module-99/siding"] }), /Unknown excluded piece/);
  const directory = await temporaryDirectory(context), file = join(directory, "excluded.xml");
  const result = spawnSync(process.execPath, [join(root, "export-meshes.mjs"), file,
    ...ids.flatMap(id => ["--exclude-piece", id])], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(file, "utf8"), filtered);
  assert.match(result.stdout, /Excluded 3 pieces from clash coverage/);
  for (const id of ids) assert.ok(result.stdout.includes(id));
  const invalid = spawnSync(process.execPath, [join(root, "export-meshes.mjs"), join(directory, "invalid.xml"),
    "--exclude-piece", "unknown-piece"], { encoding: "utf8" });
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /Unknown excluded piece/);
  assert.deepEqual(await readdir(directory), ["excluded.xml"]);
});

test("export CLI uses default width and rejects invalid configurations without writing a scene", async context => {
  const directory = await temporaryDirectory(context), file = join(directory, "scene.xml");
  await exportStairway(file);
  assert.match(await readFile(file, "utf8"), /stairWidth="20" stairCount="9" moduleCount="3"/);
  const invalid = join(directory, "invalid.xml");
  const result = spawnSync(process.execPath, [join(root, "export-meshes.mjs"), invalid, "4"], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Usage:/);
  assert.deepEqual(await readdir(directory), ["scene.xml"]);
});

test("checker builds once, runs the fixed configuration and retains interference scenes", async context => {
  const directory = await temporaryDirectory(context), calls = [];
  const run = (command, args) => {
    calls.push({ command, args });
    return { status: command === "cargo" ? 0 : 1 };
  };
  const result = await checkConfigurations(directory, run);
  assert.deepEqual(result, { passed: 0, failed: 1, errors: 0, exitCode: 1 });
  assert.equal(calls.filter(call => call.command === "cargo").length, 1);
  assert.equal(calls.length, 2);
  assert.deepEqual(await readdir(directory),
    ["9-steps-3-modules.xml"]);
  for (const file of await readdir(directory)) {
    const scene = await readFile(join(directory, file), "utf8");
    assert.match(scene, /stairWidth="20"/);
    assert.match(scene, /id="stairway\/module-\d+\/siding"/);
    assert.match(scene, /id="stairway\/module-1\/step-1-siding"/);
    assert.match(scene, /id="stairway\/module-1\/step-1-frontSiding"/);
    assert.match(scene, /id="castle" name="Castle" kind="environment"/);
  }
  assert.deepEqual(calls.slice(1).map(call => call.args[0]),
    [join(directory, "9-steps-3-modules.xml")]);
});

test("checker reports errors separately from interference and removes clear scenes", async context => {
  const directory = await temporaryDirectory(context);
  const result = await checkConfigurations(directory, command => ({
    status: command === "cargo" ? 0 : 2,
  }));
  assert.deepEqual(result, { passed: 0, failed: 0, errors: 1, exitCode: 2 });
  assert.deepEqual(await readdir(directory), ["9-steps-3-modules.xml"]);
  assert.deepEqual(await checkConfigurations(directory, () => ({ status: 0 })),
    { passed: 1, failed: 0, errors: 0, exitCode: 0 });
  assert.deepEqual(await readdir(directory), []);
});

test("matrix fails explicitly on an unavailable Rust build", async context => {
  const directory = await temporaryDirectory(context);
  await assert.rejects(checkConfigurations(directory, () => ({ error: new Error("cargo unavailable") })),
    /cargo unavailable/);
});

test("installed curved treads and siding clear spindles and ribs across supported module layouts", async context => {
  const directory = await temporaryDirectory(context), file = join(directory, "siding-spindles.xml");
  const built = spawnSync("cargo", ["build", "--release", "--locked", "--quiet", "--manifest-path", manifest,
    "--target-dir", target], { encoding: "utf8", timeout: 120000 });
  assert.equal(built.status, 0, built.error?.message ?? `${built.stdout}\n${built.stderr}`);
  const executable = join(target, "release", process.platform === "win32" ? "mesh-clash.exe" : "mesh-clash");
  for (const width of [20, 24, 36]) {
    const model = buildStairway(width), modules = 3;
    const leaves = model.partTree.getLeaves(), selected = leaves.filter(node =>
      ["siding", "ribs"].includes(node.category) || ["frontSpindle", "rearSpindle"].includes(node.key) ||
      node.key === "tread");
    assert.equal(selected.filter(node => node.part.bend).length, modules);
    assert.ok(selected.some(node => node.key === "frontSpindle"));
    assert.ok(selected.some(node => node.key === "rearSpindle"));
    await writeFile(file, serializeScene(model, {
      excludePieceIds: leaves.filter(node => !selected.includes(node)).map(node => node.id),
    }));
    const result = spawnSync(executable, [file], { encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, 0, `${width}/9/${modules}: ${result.stdout}\n${result.stderr}`);
  }
});

test("rail-free foundation, half-lapped framing and panel blocks clear every installed piece", async context => {
  const directory = await temporaryDirectory(context), file = join(directory, "rib-fit.xml");
  const built = spawnSync("cargo", ["build", "--release", "--locked", "--quiet", "--manifest-path", manifest,
    "--target-dir", target], { encoding: "utf8", timeout: 120000 });
  assert.equal(built.status, 0, built.error?.message ?? `${built.stdout}\n${built.stderr}`);
  const executable = join(target, "release", process.platform === "win32" ? "mesh-clash.exe" : "mesh-clash");
  for (const width of [20, 24, 36]) {
    const model = buildStairway(width), modules = 3, leaves = model.partTree.getLeaves();
    const selected = leaves;
    assert.equal(selected.filter(node => node.category === "base-rails").length, 0);
    assert.equal(selected.filter(node => /frontStep(Front|Rear)Bearing/.test(node.key)).length, 2);
    assert.equal(selected.filter(node => /PanelSupportTie$/.test(node.key)).length, 0);
    assert.equal(selected.filter(node => /PanelSupportBlock$/.test(node.key)).length, 5);
    await writeFile(file, serializeScene(model, {
      excludePieceIds: leaves.filter(node => !selected.includes(node)).map(node => node.id),
    }));
    const result = spawnSync(executable, [file], { encoding: "utf8", timeout: 30000 });
    const report = `${width}/9/${modules}: ${result.stdout}\n${result.stderr}`;
    assert.equal(result.status, 0, report);
    assert.ok([0, 1].includes(result.status), report);
    assert.match(result.stdout, /0 errors;/, report);
    const fitFailures = result.stdout.split("\n").filter(line => line.startsWith("INTERFERENCE:") &&
      (/\/(?:innerBaseRail|outerBaseRail|step-\d+-rightSupportBlock)\]/.test(line) ||
        /\/step-1-(?:frontSiding|siding)\]/.test(line)));
    assert.deepEqual(fitFailures, [], report);
  }
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
  for (const [offset, status] of [[0, 1], [model.innerRadius + 3, 0]]) {
    await writeFile(file, serializeScene({
      ...model,
      partTree: { getLeaves: () => [{ ...node, id: "castle-probe", name: "Castle probe" }],
        getNode: () => ({ name: "Test module" }) },
      createNodeGeometry: () => ({
        ...geometry, positions: geometry.positions.map((value, i) => value + (i % 3 === 0 ? offset : 0)),
      }),
    }));
    const castleCheck = spawnSync(executable, [file], { encoding: "utf8", timeout: 30000 });
    assert.equal(castleCheck.status, status, `${castleCheck.stdout}\n${castleCheck.stderr}`);
    if (status) assert.match(castleCheck.stdout, /INTERFERENCE:.*Castle probe.*Castle \[castle\]/);
  }
  await writeFile(file, "<scene/>");
  const invalid = spawnSync(executable, [file], { encoding: "utf8" });
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /ERROR/);
});
