import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { buildStairway } from "./model.js";
import { WebGLViewer } from "./renderer.js";

function close(actual, expected, tolerance = 1e-4) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
}

function createViewer() {
  const viewer = Object.create(WebGLViewer.prototype);
  const matrices = {};
  Object.assign(viewer, {
    canvas: { clientWidth: 800, clientHeight: 600 },
    center: [10, 20, 30],
    radius: 40,
    projection: "projection",
    view: "view",
    lightDirection: "light",
    vertexBuffers: [],
    indexCount: 0,
    requestRender() {},
    gl: {
      isContextLost: () => false,
      viewport() {},
      clear() {},
      bindBuffer() {},
      bufferData() {},
      drawElements() {},
      uniformMatrix4fv(name, transpose, matrix) { matrices[name] = matrix; },
      uniform3f(name, ...values) { matrices[name] = values; },
    },
  });
  viewer.reset();
  return { viewer, matrices };
}

test("panning follows screen axes at different rotations, zooms, sizes and pixel densities", () => {
  const originalWindow = globalThis.window;
  try {
    for (const ratio of [1, 2]) {
      globalThis.window = { devicePixelRatio: ratio };
      for (const [width, height] of [[800, 600], [390, 844], [844, 390]]) {
        for (const [yaw, pitch] of [[0, 0], [1.3, 0.8], [-2, -1.4]]) {
          for (const zoom of [0.1, 1, 3]) {
            const { viewer, matrices } = createViewer();
            Object.assign(viewer, { yaw, pitch, zoomFactor: zoom });
            Object.assign(viewer.canvas, { clientWidth: width, clientHeight: height });
            viewer.draw();
            const before = Array.from(matrices.view);
            viewer.pan(35, -22);
            viewer.draw();
            const distance = Math.max(viewer.radius * 0.55, viewer.fitDistance() * zoom);
            const scale = 2 * distance * Math.tan(Math.PI / 8) / height;
            close(matrices.view[12] - before[12], 35 * scale);
            close(matrices.view[13] - before[13], 22 * scale);
            close(matrices.view[14], before[14]);
            for (let i = 0; i < 12; i++) close(matrices.view[i], before[i]);
            assert.equal(viewer.yaw, yaw);
            assert.equal(viewer.pitch, pitch);
            assert.equal(viewer.zoomFactor, zoom);
          }
        }
      }
    }
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("geometry updates preserve pan and reset clears it along with rotation and zoom", () => {
  const { viewer } = createViewer();
  viewer.pan(80, 45);
  viewer.orbit(25, 10);
  viewer.zoom(0.8);
  const offset = [...viewer.panOffset];
  const geometry = buildStairway().createGeometry();
  viewer.setGeometry(geometry);
  assert.deepEqual(viewer.panOffset, offset);
  viewer.reset();
  assert.deepEqual(viewer.panOffset, [0, 0]);
  assert.equal(viewer.yaw, Math.PI / 5);
  assert.equal(viewer.pitch, Math.PI / 7);
  assert.equal(viewer.zoomFactor, 1);
});

test("interleaving pinch zoom with pan does not change the accumulated screen displacement", () => {
  const { viewer } = createViewer();
  viewer.pan(10, 5);
  viewer.zoom(0.7);
  viewer.pan(10, 5);
  viewer.zoom(1 / 0.7);
  assert.deepEqual(viewer.panOffset, [-20, 10]);
  close(viewer.zoomFactor, 1);
});

test("camera-relative light adjustments preserve camera state, survive orbit and geometry updates, and reset", () => {
  const { viewer, matrices } = createViewer();
  const originalWindow = globalThis.window;
  globalThis.window = { devicePixelRatio: 1 };
  try {
    viewer.draw();
    const originalView = matrices.view;
    const originalProjection = matrices.projection;
    const length = Math.hypot(-0.4, 0.85, 0.65);
    const originalLight = [-0.4, 0.85, 0.65].map(value => value / length);
    originalLight.forEach((value, axis) => close(matrices.light[axis], value));
    viewer.rotateLight(40, -20);
    const yaw = viewer.lightYaw, pitch = viewer.lightPitch;
    viewer.draw();
    assert.deepEqual(matrices.view, originalView);
    assert.deepEqual(matrices.projection, originalProjection);
    close(Math.hypot(...matrices.light), 1);
    assert.notDeepEqual(matrices.light, originalLight);
    const rotatedLight = [...matrices.light];
    viewer.orbit(30, 15);
    viewer.pan(10, 20);
    viewer.zoom(0.8);
    viewer.setGeometry(buildStairway().createGeometry({}, 1));
    viewer.draw();
    assert.deepEqual(matrices.light, rotatedLight);
    assert.equal(viewer.lightYaw, yaw);
    assert.equal(viewer.lightPitch, pitch);
    viewer.rotateLight(0, -10000);
    assert.equal(viewer.lightPitch, Math.PI / 2);
    viewer.rotateLight(0, 10000);
    assert.equal(viewer.lightPitch, -Math.PI / 2);
    viewer.reset();
    viewer.draw();
    originalLight.forEach((value, axis) => close(matrices.light[axis], value));
    assert.equal(viewer.yaw, Math.PI / 5);
    assert.equal(viewer.pitch, Math.PI / 7);
    assert.equal(viewer.zoomFactor, 1);
    assert.deepEqual(viewer.panOffset, [0, 0]);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

function createControls() {
  const nodes = new Map();
  const calls = [];
  function node(selector) {
    if (!nodes.has(selector)) {
      const handlers = new Map();
      const id = selector.slice(1);
      nodes.set(selector, {
        id,
        value: id === "stair-count" ? "8" : "24",
        valueAsNumber: id === "stair-count" ? 8 : 24,
        checked: id !== "exploded-view",
        addEventListener(name, handler) { handlers.set(name, handler); },
        setAttribute() {},
        setPointerCapture() {},
        focus() {},
        dispatch(name, event) { handlers.get(name)(event); },
      });
    }
    return nodes.get(selector);
  }
  class Viewer {
    orbit(...args) { calls.push(["orbit", ...args]); }
    rotateLight(...args) { calls.push(["light", ...args]); }
    pan(...args) { calls.push(["pan", ...args]); }
    zoom(...args) { calls.push(["zoom", ...args]); }
    reset() { calls.push(["reset"]); }
    setGeometry() {}
    requestRender() {}
  }
  const source = readFileSync(new URL("./main.js", import.meta.url), "utf8")
    .replace(/^import .*;\r?$/gm, "");
  runInNewContext(source, {
    document: { querySelector: node },
    window: { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {} },
    ResizeObserver: class { observe() {} },
    buildStairway,
    WebGLViewer: Viewer,
    console: { error(cause) { throw cause; } },
  });
  return { canvas: node("#viewer"), calls, node };
}

test("two-pointer translation pans by its midpoint while preserving pinch zoom", () => {
  const { canvas, calls } = createControls();
  function pointer(name, pointerId, x, y) {
    canvas.dispatch(name, { pointerId, clientX: x, clientY: y, pointerType: "touch" });
  }
  pointer("pointerdown", 1, 100, 100);
  pointer("pointermove", 1, 110, 105);
  assert.deepEqual(calls.splice(0), [["orbit", 10, 5]]);
  pointer("pointerdown", 2, 210, 105);
  assert.equal(calls.length, 0);
  pointer("pointermove", 1, 130, 115);
  pointer("pointermove", 2, 230, 115);
  assert.deepEqual(calls.filter(([name]) => name === "pan"), [["pan", 10, 5], ["pan", 10, 5]]);
  const zoom = calls.filter(([name]) => name === "zoom");
  close(zoom[0][1] * zoom[1][1], 1);
  calls.length = 0;
  pointer("pointerup", 2, 230, 115);
  pointer("pointermove", 1, 140, 120);
  assert.deepEqual(calls.splice(0), [["orbit", 10, 5]]);
  pointer("pointerdown", 2, 140, 120);
  pointer("pointermove", 2, 150, 120);
  assert.deepEqual(calls.splice(0), [["pan", 5, 0]]);
  pointer("pointercancel", 2, 150, 120);
  pointer("pointermove", 1, 145, 125);
  assert.deepEqual(calls.splice(0), [["orbit", 5, 5]]);
  pointer("lostpointercapture", 1, 145, 125);
  pointer("pointermove", 1, 200, 200);
  assert.equal(calls.length, 0);
});

test("Shift+arrows pan, plain arrows orbit, and keyboard and button reset remain available", () => {
  const { canvas, calls, node } = createControls();
  let prevented = 0;
  for (const shiftKey of [false, true]) {
    for (const [key, dx, dy] of [
      ["ArrowLeft", -12, 0], ["ArrowRight", 12, 0],
      ["ArrowUp", 0, -12], ["ArrowDown", 0, 12],
    ]) {
      canvas.dispatch("keydown", { key, shiftKey, preventDefault() { prevented++; } });
      assert.deepEqual(calls.pop(), [shiftKey ? "pan" : "orbit", dx, dy]);
    }
  }
  for (const key of ["+", "-", "Home"]) {
    canvas.dispatch("keydown", { key, preventDefault() { prevented++; } });
  }
  assert.deepEqual(calls.splice(0), [["zoom", 0.9], ["zoom", 1 / 0.9], ["reset"]]);
  assert.equal(prevented, 11);
  node("#reset").dispatch("click");
  assert.deepEqual(calls, [["reset"]]);
});

test("Ctrl+arrows rotate the light, taking precedence over Shift", () => {
  const { canvas, calls } = createControls();
  let prevented = 0;
  for (const shiftKey of [false, true]) {
    for (const [key, dx, dy] of [
      ["ArrowLeft", -12, 0], ["ArrowRight", 12, 0],
      ["ArrowUp", 0, -12], ["ArrowDown", 0, 12],
    ]) {
      canvas.dispatch("keydown", { key, ctrlKey: true, shiftKey, preventDefault() { prevented++; } });
      assert.deepEqual(calls.pop(), ["light", dx, dy]);
    }
  }
  assert.equal(prevented, 8);
});

test("Ctrl+drag rotates the light and modifier changes during a drag do not jump", () => {
  const { canvas, calls } = createControls();
  canvas.dispatch("pointerdown", {
    pointerId: 1, pointerType: "mouse", button: 0, clientX: 100, clientY: 100, ctrlKey: true,
  });
  canvas.dispatch("pointermove", { pointerId: 1, clientX: 120, clientY: 110, ctrlKey: true });
  assert.deepEqual(calls.splice(0), [["light", 20, 10]]);
  canvas.dispatch("pointermove", { pointerId: 1, clientX: 125, clientY: 115, ctrlKey: false });
  assert.deepEqual(calls.splice(0), [["orbit", 5, 5]]);
  canvas.dispatch("pointermove", { pointerId: 1, clientX: 130, clientY: 120, ctrlKey: true });
  assert.deepEqual(calls.splice(0), [["light", 5, 5]]);
  canvas.dispatch("pointerup", { pointerId: 1 });
  canvas.dispatch("pointermove", { pointerId: 1, clientX: 180, clientY: 180, ctrlKey: true });
  assert.equal(calls.length, 0);
});
