import test from "node:test";
import assert from "node:assert/strict";
import { readParameters, parameterURL } from "./parameters.js";

test("model parameters round-trip between page URLs with defaults for omitted settings", () => {
  assert.deepEqual(readParameters("").values, { width: 20, steps: 9, modules: 3, shoulderAscent: 32 });
  const { values, warnings } = readParameters("?width=28.25&steps=7&modules=2&shoulderAscent=37");
  assert.deepEqual(values, { width: 28.25, steps: 7, modules: 2, shoulderAscent: 37 });
  assert.deepEqual(warnings, []);
  const url = parameterURL("https://example.com/stairs2/parameters.html?other=keep#view", values);
  assert.deepEqual(readParameters(url.search), { values, warnings });
  assert.equal(url.searchParams.get("other"), "keep");
  assert.equal(url.hash, "#view");
  assert.deepEqual(readParameters("?width=20").values,
    { width: 20, steps: 9, modules: 3, shoulderAscent: 32 });
});

test("invalid model query values use defaults and explicitly identify each invalid setting", () => {
  for (const search of [
    "?width=&steps=no&modules=Infinity&shoulderAscent=NaN",
    "?width=19.75&steps=10&modules=1&shoulderAscent=38",
    "?width=24.1&steps=8.5&modules=2.5&shoulderAscent=30.5",
    "?width=24&width=28&steps=9&steps=8&modules=2&modules=3&shoulderAscent=32&shoulderAscent=33",
  ]) {
    const result = readParameters(search);
    assert.deepEqual(result.values, { width: 20, steps: 9, modules: 3, shoulderAscent: 32 });
    assert.equal(result.warnings.length, 4);
    for (const label of ["Stair width", "Steps", "Modules", "Railing bottom ascent"]) {
      assert.ok(result.warnings.some(warning => warning.startsWith(`${label} was invalid; using `)));
    }
  }
});
