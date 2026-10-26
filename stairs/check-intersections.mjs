import { mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { exportStairway } from "./export-meshes.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const rust = join(root, "mesh-clash");

export async function checkConfigurations(directory = join(root, ".clash-results"), run = spawnSync) {
  directory = resolve(directory);
  const build = run("cargo", ["build", "--release", "--locked", "--quiet",
    "--manifest-path", join(rust, "Cargo.toml"), "--target-dir", join(rust, "target")], { stdio: "inherit" });
  if (build.error) throw build.error;
  if (build.status !== 0) throw new Error(`Rust checker build failed (exit ${build.status}).`);
  const executable = join(rust, "target", "release", process.platform === "win32" ? "mesh-clash.exe" : "mesh-clash");
  await mkdir(directory, { recursive: true });
  let passed = 0, failed = 0, errors = 0;
  for (const stairCount of [7, 8, 9]) {
    for (const moduleCount of [2, 3]) {
      const label = `${stairCount} steps / ${moduleCount} modules / width 20 in`;
      const file = join(directory, `${stairCount}-steps-${moduleCount}-modules.xml`);
      console.log(`\nChecking ${label}`);
      try {
        await rm(file, { force: true });
        await exportStairway(file, stairCount, moduleCount);
        const checked = run(executable, [file], { stdio: "inherit" });
        if (checked.error) throw checked.error;
        if (checked.status === 0) {
          await rm(file);
          passed++;
        } else {
          if (checked.status === 1) failed++;
          else errors++;
          console.error(`${checked.status === 1 ? "INTERFERENCE" : "CHECK ERROR"}: ${label}; retained ${file}`);
        }
      } catch (error) {
        errors++;
        console.error(`ERROR: ${label}: ${error.message}`);
      }
    }
  }
  console.log(`\nSix configurations: ${passed} clear, ${failed} with interference, ${errors} errors. All physical pieces and the castle included.`);
  return { passed, failed, errors, exitCode: errors ? 2 : Number(failed > 0) };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log("Usage: node check-intersections.mjs [RESULTS_DIRECTORY]");
  } else {
    try {
      if (args.length > 1) throw new Error("Usage: node check-intersections.mjs [RESULTS_DIRECTORY]");
      process.exitCode = (await checkConfigurations(args[0])).exitCode;
    } catch (error) {
      console.error(error.message);
      process.exitCode = 2;
    }
  }
}
