import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { Board, buildStairway, combineGeometries, NotchedBoard, ProfiledPlywood } from "./model.js";
import { WebGLViewer, STANDARD_VIEWS } from "./renderer.js";
import { PartBrowser, PART_VIEW_NAMES, partViewLabel } from "./parts.js";
import { PartInventory, PART_SUBSETS } from "./part-list.js";
import { PlacementPlanner } from "./placement.js";
import { renderPlacementAnnotations, renderTreadTemplate } from "./placement-drawing.js";
import { formatLength, formatPartDescription, formatPartListDescription, getSimpleEdgeBevel } from "./part-description.js";
import { getPartFeatures, renderPartAnnotations, renderPartCompass } from "./part-annotations.js";
import { getProfileChains } from "./part-profile.js";
import { outlineBounds, outlinePoint, outlineExtrema, constructionOutline, notchRectangle } from "./plywood-outline.js";
import { PARAMETER_FIELDS, readParameters, parameterURL } from "./parameters.js";

function close(actual, expected, tolerance = 1e-4) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
}

function transformedGeometry(geometry, matrix) {
  if (matrix.every((value, index) => value === (index % 5 === 0 ? 1 : 0))) return geometry;
  const positions = new Float32Array(geometry.positions.length), normals = new Float32Array(geometry.normals.length);
  for (let i = 0; i < positions.length; i += 3) for (let axis = 0; axis < 3; axis++) {
    positions[i + axis] = [0, 1, 2].reduce((sum, column) =>
      sum + matrix[column * 4 + axis] * geometry.positions[i + column], matrix[12 + axis]);
    normals[i + axis] = [0, 1, 2].reduce((sum, column) =>
      sum + matrix[column * 4 + axis] * geometry.normals[i + column], 0);
  }
  return { ...geometry, positions, normals };
}

function closeGeometry(actual, expected) {
  for (const key of ["positions", "normals", "colors", "grain"]) {
    assert.equal(actual[key].length, expected[key].length, key);
    actual[key].forEach((value, index) => close(value, expected[key][index]));
  }
  assert.deepEqual(actual.indices, expected.indices);
}

function screenPoint(viewer, point) {
  const { view, projection } = viewer.getCameraMatrices();
  const camera = [0, 1, 2, 3].map(axis =>
    point.reduce((sum, value, i) => sum + value * view[i * 4 + axis], view[12 + axis]));
  const clip = [0, 1, 2, 3].map(axis =>
    camera.reduce((sum, value, i) => sum + value * projection[i * 4 + axis], 0));
  return {
    x: (clip[0] / clip[3] + 1) * viewer.canvas.clientWidth / 2,
    y: (1 - clip[1] / clip[3]) * viewer.canvas.clientHeight / 2,
  };
}

function createViewer() {
  const viewer = Object.create(WebGLViewer.prototype);
  const matrices = {};
  const uploads = [], draws = [], deleted = [], allocated = [], bindings = {}, attributes = [];
  Object.assign(viewer, {
    canvas: { clientWidth: 800, clientHeight: 600 },
    center: [10, 20, 30],
    radius: 40,
    projection: "projection",
    view: "view",
    lightDirection: "light",
    modelTransform: "model",
    vertexBuffers: [["positions", 3], ["normals", 3], ["colors", 3], ["grain", 4]]
      .map(([key, size], location) => ({ key, size, location, buffer: {} })),
    indexBuffer: {},
    indexCount: 0,
    requestRender() {},
    gl: {
      ARRAY_BUFFER: 34962, ELEMENT_ARRAY_BUFFER: 34963, FLOAT: 5126,
      STATIC_DRAW: 35044, UNSIGNED_SHORT: 5123, UNSIGNED_INT: 5125, TRIANGLES: 4,
      isContextLost: () => false,
      viewport() {},
      clear() {},
      bindBuffer(target, buffer) { bindings[target] = buffer; },
      bufferData(...args) { uploads.push(args); },
      createBuffer() { const buffer = {}; allocated.push(buffer); return buffer; },
      deleteBuffer(buffer) { deleted.push(buffer); },
      vertexAttribPointer(location) { attributes[location] = bindings[this.ARRAY_BUFFER]; },
      getExtension: () => ({}),
      drawElements(...args) {
        draws.push({ args, model: Array.from(matrices.model),
          indexBuffer: bindings[this.ELEMENT_ARRAY_BUFFER], vertexBuffers: [...attributes] });
      },
      uniformMatrix4fv(name, transpose, matrix) { matrices[name] = matrix; },
      uniform3f(name, ...values) { matrices[name] = values; },
    },
  });
  viewer.reset();
  return { viewer, matrices, uploads, draws, deleted, allocated };
}

test("panning follows screen axes at different rotations, zooms, sizes and pixel densities", () => {
  const originalWindow = globalThis.window;
  try {
    for (const ratio of [1, 2]) {
      globalThis.window = { devicePixelRatio: ratio };
      for (const [width, height] of [[800, 600], [390, 844], [844, 390]]) {
        for (const [dx, dy] of [[0, 0], [160, 100], [-250, -175]]) {
          for (const zoom of [0.1, 1, 3]) {
            const { viewer, matrices } = createViewer();
            viewer.orbit(dx, dy);
            const orientation = viewer.orientation;
            viewer.zoomFactor = zoom;
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
            assert.deepEqual(viewer.orientation, orientation);
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

test("horizontal and vertical orbit rotate around the current camera axes, including tilted and inverted views", () => {
  const basis = viewer => {
    const { view } = viewer.getCameraMatrices();
    return [0, 1, 2].map(axis => [view[axis], view[axis + 4], view[axis + 8]]);
  };
  for (const moves of [[], [[130, 70]], [[0, 300], [200, 0], [0, -40]]]) {
    for (const [dx, dy] of [[37, 0], [0, -28]]) {
      const { viewer } = createViewer();
      for (const move of moves) viewer.orbit(...move);
      const [right, up, back] = basis(viewer), angle = (dx || dy) * 0.008;
      viewer.orbit(dx, dy);
      const after = basis(viewer);
      const expected = dx ? [
        right.map((value, axis) => value * Math.cos(angle) + back[axis] * Math.sin(angle)),
        up,
        back.map((value, axis) => value * Math.cos(angle) - right[axis] * Math.sin(angle)),
      ] : [
        right,
        up.map((value, axis) => value * Math.cos(angle) - back[axis] * Math.sin(angle)),
        back.map((value, axis) => value * Math.cos(angle) + up[axis] * Math.sin(angle)),
      ];
      after.forEach((vector, index) => vector.forEach((value, axis) => close(value, expected[index][axis])));
      const { view } = viewer.getCameraMatrices();
      const center = viewer.center.map((_, axis) => viewer.center.reduce((sum, value, i) =>
        sum + value * view[i * 4 + axis], view[12 + axis]));
      close(center[0], 0);
      close(center[1], 0);
      close(center[2], -viewer.fitDistance());
    }
  }
});

test("free orbit crosses the poles, reverses diagonal drags, and retains an orthonormal camera", () => {
  const { viewer } = createViewer();
  const initial = Array.from(viewer.getCameraMatrices().view);
  viewer.orbit(0, Math.PI / 0.008);
  viewer.orbit(0, Math.PI / 0.008);
  Array.from(viewer.getCameraMatrices().view).forEach((value, index) => close(value, initial[index]));
  viewer.orbit(83, -61);
  viewer.orbit(-83, 61);
  Array.from(viewer.getCameraMatrices().view).forEach((value, index) => close(value, initial[index]));
  for (let i = 0; i < 2000; i++) {
    viewer.orbit(13, i % 2 ? -9 : 17);
    viewer.roll((i % 5 - 2) * 0.023);
  }
  const { view } = viewer.getCameraMatrices();
  const axes = [0, 1, 2].map(axis => [view[axis], view[axis + 4], view[axis + 8]]);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    close(axes[i].reduce((sum, value, axis) => sum + value * axes[j][axis], 0), i === j ? 1 : 0, 1e-6);
  }
});

test("camera-depth roll follows the screen twist and preserves tilt, zoom, and screen-relative pan", () => {
  const { viewer } = createViewer();
  viewer.orbit(83, -61);
  viewer.pan(35, -22);
  viewer.zoom(0.8);
  const initial = Array.from(viewer.getCameraMatrices().view), orientation = viewer.orientation;
  const center = screenPoint(viewer, viewer.center);
  const point = viewer.center.map((value, axis) => value + orientation[0][axis] * 5);
  const before = screenPoint(viewer, point);
  const angle = Math.PI / 2;
  viewer.roll(angle);
  const after = screenPoint(viewer, point), rolledCenter = screenPoint(viewer, viewer.center);
  close(rolledCenter.x, center.x);
  close(rolledCenter.y, center.y);
  close(after.x, center.x);
  close(after.y - center.y, before.x - center.x);
  assert.deepEqual(viewer.orientation[2], orientation[2]);
  assert.deepEqual(viewer.panOffset, [-35, -22]);
  close(viewer.zoomFactor, 0.8);
  viewer.roll(-angle);
  Array.from(viewer.getCameraMatrices().view).forEach((value, index) => close(value, initial[index]));
  viewer.roll(angle);
  const panned = screenPoint(viewer, point);
  viewer.pan(15, -10);
  const moved = screenPoint(viewer, point);
  close(moved.x - panned.x, 15);
  close(moved.y - panned.y, -10);
});

test("geometry updates preserve pan and reset clears it along with rotation and zoom", () => {
  const { viewer } = createViewer();
  const initial = { orientation: viewer.orientation, zoom: viewer.zoomFactor };
  viewer.pan(80, 45);
  viewer.orbit(25, 10);
  viewer.zoom(0.8);
  const offset = [...viewer.panOffset];
  const geometry = new Board({ length: 12, width: 4, thickness: 1 }).createGeometry();
  viewer.setGeometry(geometry);
  assert.deepEqual(viewer.panOffset, offset);
  viewer.reset();
  assert.deepEqual(viewer.panOffset, [0, 0]);
  assert.deepEqual(viewer.orientation, initial.orientation);
  assert.equal(viewer.zoomFactor, initial.zoom);
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

test("camera-relative lighting stays fixed through camera and geometry updates and reset", () => {
  const { viewer, matrices } = createViewer();
  const originalWindow = globalThis.window;
  globalThis.window = { devicePixelRatio: 1 };
  try {
    viewer.draw();
    const originalLight = [...matrices.light];
    viewer.orbit(30, 15);
    viewer.pan(10, 20);
    viewer.zoom(0.8);
    viewer.setGeometry(new Board({ length: 12, width: 4, thickness: 1 }).createGeometry());
    viewer.draw();
    assert.deepEqual(matrices.light, originalLight);
    viewer.reset();
    viewer.draw();
    originalLight.forEach((value, axis) => close(matrices.light[axis], value));
    assert.deepEqual(viewer.panOffset, [0, 0]);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("six stock-aligned orthographic cameras frame generic stock without distortion or pole singularities", () => {
  const originalWindow = globalThis.window;
  globalThis.window = { devicePixelRatio: 2 };
  try {
    for (const board of [
      new Board({ length: 12, width: 4, thickness: 1 }),
      new NotchedBoard({ length: 10, width: 6, thickness: 0.75 },
        { endNear: { length: 2, depth: [0.5, 1] } }),
    ]) {
      const geometry = board.createStockGeometry();
      for (const [width, height] of [[800, 250], [250, 400]]) {
        const { viewer, matrices } = createViewer();
        Object.assign(viewer.canvas, { clientWidth: width, clientHeight: height });
        viewer.setGeometry(geometry);
        for (const { name, direction } of STANDARD_VIEWS) {
          viewer.setStandardView(name);
          viewer.draw();
          const { view, projection } = matrices;
          assert.ok([...view, ...projection].every(Number.isFinite));
          assert.equal(projection[11], 0);
          assert.equal(projection[15], 1);
          direction.forEach((value, axis) => close(view[axis * 4 + 2], value));
          close(projection[0] * width, projection[5] * height);
          for (let i = 0; i < geometry.positions.length; i += 3) {
            const [x, y, z] = geometry.positions.subarray(i, i + 3);
            const camera = [0, 1, 2].map(axis =>
              view[axis] * x + view[axis + 4] * y + view[axis + 8] * z + view[axis + 12]);
            assert.ok(Math.abs(camera[0] * projection[0]) < 0.9, `${name} width`);
            assert.ok(Math.abs(camera[1] * projection[5]) < 0.9, `${name} height`);
            assert.ok(Math.abs(camera[2] * projection[10] + projection[14]) < 1);
          }
        }
        assert.throws(() => viewer.setStandardView("Unknown"), RangeError);
      }
    }
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("stock projection matches WebGL in CSS pixels with reserved annotation space at any pixel density", () => {
  const originalWindow = globalThis.window;
  try {
    for (const ratio of [1, 2]) {
      globalThis.window = { devicePixelRatio: ratio };
      for (const [width, height] of [[800, 600], [271, 850], [951, 401]]) {
        const { viewer, matrices } = createViewer();
        viewer.canvas.clientWidth = width;
        viewer.canvas.clientHeight = height;
        viewer.setGeometry(new Board({ length: 12, width: 4, thickness: 1 }).createStockGeometry());
        const insets = { top: 108, right: 62, bottom: 130, left: 16 };
        viewer.setViewportInsets(insets);
        for (const { name } of STANDARD_VIEWS) {
          viewer.setStandardView(name);
          viewer.draw();
          const { view, projection } = matrices;
          const center = viewer.projectPoint(viewer.center);
          close(center.x, (width + insets.left - insets.right) / 2);
          close(center.y, (height + insets.top - insets.bottom) / 2);
          close(projection[0] * width, projection[5] * height);
          for (const point of [[0, 0, 0], viewer.center, [1, 2, 3]]) {
            const projected = viewer.projectPoint(point);
            const camera = [0, 1].map(axis =>
              point.reduce((sum, value, i) => sum + value * view[i * 4 + axis], view[12 + axis]));
            close(projected.x, (camera[0] * projection[0] + projection[12] + 1) * width / 2);
            close(projected.y, (1 - camera[1] * projection[5] - projection[13]) * height / 2);
          }
        }
        assert.throws(() => viewer.setViewportInsets({ left: -1 }), RangeError);
        assert.throws(() => viewer.setViewportInsets({ top: NaN }), RangeError);
        assert.throws(() => viewer.projectPoint([0, Infinity, 0]), RangeError);
        viewer.reset();
        assert.throws(() => viewer.projectPoint([0, 0, 0]), /requires a standard view/);
      }
    }
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("profile chains retain concave corners but ignore triangulation and covered edges", () => {
  const view = STANDARD_VIEWS.find(view => view.name === "Front");
  const geometry = triangles => ({
    positions: new Float32Array(triangles.flat(2)),
    indices: new Uint16Array(Array.from({ length: triangles.length * 3 }, (_, index) => index)),
  });
  const rectangle = [[0, 0, 0], [2, 0, 0], [4, 0, 0], [4, 1.5, 0],
    [4, 3, 0], [2, 3, 0], [0, 3, 0], [0, 1.5, 0]];
  const fan = rectangle.map((point, index) => [[2, 1.5, 0], point, rectangle[(index + 1) % rectangle.length]]);
  fan.push([[1, 0.5, -1], [3, 0.5, -1], [2, 2.5, -1]]);
  assert.deepEqual(getProfileChains(geometry(fan), view), []);
  const concaveTriangles = [
    [[0, 0, 0], [4, 0, 0], [4, 1, 0]],
    [[0, 0, 0], [4, 1, 0], [1, 1, 0]],
    [[0, 0, 0], [1, 1, 0], [1, 3, 0]],
    [[0, 0, 0], [1, 3, 0], [0, 3, 0]],
    [[0.25, 0.25, -1], [0.75, 0.25, -1], [0.25, 2, -1]],
  ];
  const concave = geometry(concaveTriangles);
  assert.deepEqual(getProfileChains(concave, view).map(({ axis, stops }) =>
    ({ axis, values: stops.map(point => point[axis]) })),
  [{ axis: 0, values: [0, 1, 4] }, { axis: 1, values: [0, 1, 3] }]);
  const filled = geometry([...concaveTriangles,
    [[1, 1, 1], [4, 1, 1], [4, 3, 1]], [[1, 1, 1], [4, 3, 1], [1, 3, 1]]]);
  assert.deepEqual(getProfileChains(filled, view), [], "Covered concave corners are not outline corners");
  assert.equal(getProfileChains(concave, view), getProfileChains(concave, view));
});

test("base rail construction annotations locate each authored cut corner and chain concentric radii", () => {
  for (const parameters of [[20, 4, 2], [24, 9, 3], [36, 9, 2]]) {
    for (const module of buildStairway(...parameters).modules) for (const rib of [module.boards.innerBaseRail, module.boards.outerBaseRail]) {
      const description = rib.getManufacturingDescription();
      const tangent = rib.construction.tangentExtension;
      const instructions = formatPartDescription(description).cuts.join(" ");
      if (tangent) assert.match(instructions, /Stop the outer arc at the join radius .*inner edge straight on blank Z = 0.*one piece/);
      else assert.doesNotMatch(instructions, /join radius|parallel tangents/);
      for (const direction of [[0, 1, 0], [0, -1, 0]]) {
        const features = getPartFeatures(description, { direction, up: [1, 0, 0] });
        const extensions = features.filter(feature => feature.kind === "tangent-extension");
        assert.equal(extensions.length, tangent ? 1 : 0);
        if (tangent) {
          assert.equal(extensions[0].id, "T1");
          assert.ok(extensions[0].lines.includes("Straight inner edge at blank Z = 0"));
          assert.match(extensions[0].lines.join(" "), /Join radius at .* from blank X/);
          assert.equal(extensions[0].outline.length, 4);
        }
        const surface = direction[1] > 0 ? rib.thickness : 0;
        const notches = features.filter(feature => feature.kind === "rectangular-notch");
        const cuts = [...rib.construction.notches, ...rib.construction.openings];
        assert.equal(notches.length, cuts.length);
        notches.forEach((feature, index) => {
          const notch = cuts[index], [x, z] = notch.reference;
          assert.deepEqual(feature.point, [x, surface, z]);
          assert.deepEqual(feature.outline, notchRectangle(notch).map(([x, z]) => [x, surface, z]));
          assert.deepEqual(feature.dimensions, []);
          const fromRight = Math.abs(rib.length - x) < Math.abs(x);
          assert.ok(feature.lines.includes(`${feature.id}: ${formatLength(fromRight ? rib.length - x : x)} in from ${fromRight ? "right" : "left"}`));
          assert.match(feature.lines.join(" "), /Width .*height .*Angle /);
        });
        const arcs = features.filter(feature => feature.kind === "arc");
        assert.equal(arcs.length, rib.construction.innerRadius === undefined ? 1 : 2);
        const arc = arcs.find(feature => !feature.radiusTo), outer = arcs.find(feature => feature.radiusTo);
        close(arc.radius, rib.construction.innerRadius ?? rib.construction.arc.radius);
        if (outer) close(outer.radiusSpan, outer.radius - arc.radius);
        assert.equal(arc.radiusCenterLabel, "C");
        assert.equal(arc.radialGuides.length, 2, "Both authored radial guidelines point toward C.");
        const inset = rib.construction.trapezoid.left.inset;
        assert.deepEqual(arc.radialGuides.map(guide => [guide.side, guide.inset]), [["left", inset], ["right", 0]]);
        assert.ok(features.find(feature => feature.id === "C1").lines.includes(`Cut ${formatLength(inset)} in inside radial guide`));
        for (const edge of arc.radialGuides) {
          const delta = edge.to.map((value, axis) => value - edge.from[axis]);
          const relative = arc.radiusCenter.map((value, axis) => value - edge.from[axis]);
          close(delta[0] * relative[2] - delta[2] * relative[0], 0);
        }
        close(Math.hypot(arc.point[0] - arc.radiusCenter[0], arc.point[2] - arc.radiusCenter[2]), arc.radius);
        assert.equal(arc.radiusThroughBlank, true);
        const blank = features.find(feature => feature.kind === "construction-blank");
        assert.equal(blank.outlineDotted, true);
        assert.deepEqual(blank.outline, [[0, surface, 0], [rib.length, surface, 0],
          [rib.length, surface, rib.width], [0, surface, rib.width]]);
      }
      assert.equal(getPartFeatures(description, { direction: [1, 0, 0], up: [0, 1, 0] })
        .filter(feature => ["construction-blank", "rectangular-notch", "corner-cut", "arc", "tangent-extension"].includes(feature.kind)).length, 0);
    }
  }
});

test("actual block end chains measure short face and setback without inventing recessed edges", () => {
  const model = buildStairway();
  const block = model.partTree.getNode("stairway/module-1/step-3-leftBackSupportBlock");
  const geometry = block.part.createStockGeometry();
  for (const view of STANDARD_VIEWS) {
    const chains = getProfileChains(geometry, view);
    if (!view.direction[0]) {
      assert.deepEqual(chains, []);
      continue;
    }
    assert.equal(chains.length, 1);
    const { axis, stops } = chains[0];
    assert.equal(axis, 2);
    const spans = stops.slice(1).map((point, index) => point[axis] - stops[index][axis]);
    close(spans[0], 0.13123299528888602);
    close(spans[1], 3.5 - 0.13123299528888602);
    assert.deepEqual(spans.map(formatLength), ["1/8", "3 3/8"]);
  }
  const upright = model.partTree.getNode("stairway/module-1/step-2-leftUpright");
  const down = STANDARD_VIEWS.find(view => view.direction[0] === -1);
  for (const { stops } of getProfileChains(upright.part.createStockGeometry(), down)) {
    assert.ok(stops.every(point => point[1] < 1.5 - 1e-6 || point[0] >= 1.5 - 1e-6),
      "No extension line starts at the removed Right-face edge of the Down end");
  }
});

function svgElement(document, name) {
  const transformedBox = (box, transform = "") => {
    let points = [[box.x, box.y], [box.x + box.width, box.y],
      [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]];
    const transforms = [...transform.matchAll(/(translate|rotate)\(([^)]+)\)/g)].reverse();
    for (const [, kind, values] of transforms) {
      const [a, b = 0, c = 0] = values.split(/[ ,]+/).map(Number);
      points = points.map(([x, y]) => kind === "translate" ? [x + a, y + b] :
        [b + (x - b) * Math.cos(a * Math.PI / 180) - (y - c) * Math.sin(a * Math.PI / 180),
          c + (x - b) * Math.sin(a * Math.PI / 180) + (y - c) * Math.cos(a * Math.PI / 180)]);
    }
    const x = Math.min(...points.map(point => point[0])), y = Math.min(...points.map(point => point[1]));
    return { x, y, width: Math.max(...points.map(point => point[0])) - x,
      height: Math.max(...points.map(point => point[1])) - y };
  };
  return {
    name, localName: name, ownerDocument: document, children: [], attributes: {},
    setAttribute(key, value) { this.attributes[key] = String(value); },
    getAttribute(key) { return this.attributes[key] ?? null; },
    append(child) { child.parentNode = this; this.children.push(child); },
    replaceChildren() { this.children = []; },
    getBBox() {
      const a = this.attributes;
      if (name === "text") {
        let fontSize = 12;
        for (let node = this; node; node = node.parentNode) {
          const value = node.getAttribute("font-size");
          if (value === null) continue;
          fontSize = Number(value);
          break;
        }
        const width = Math.max(...this.children.map(child => child.textContent.length * 7 * fontSize / 12));
        const x = Number(a.x) - (a["text-anchor"] === "middle" ? width / 2 : a["text-anchor"] === "end" ? width : 0);
        const lineHeight = Number(this.children[1]?.attributes.dy ?? fontSize);
        return { x, y: Number(a.y) - fontSize, width,
          height: fontSize + (this.children.length - 1) * lineHeight };
      }
      if (name === "line") return {
        x: Math.min(Number(a.x1), Number(a.x2)), y: Math.min(Number(a.y1), Number(a.y2)),
        width: Math.abs(Number(a.x2) - Number(a.x1)), height: Math.abs(Number(a.y2) - Number(a.y1)),
      };
      if (name === "polyline" || name === "polygon") {
        const points = a.points.split(" ").map(point => point.split(",").map(Number));
        const x = Math.min(...points.map(point => point[0])), y = Math.min(...points.map(point => point[1]));
        return { x, y, width: Math.max(...points.map(point => point[0])) - x,
          height: Math.max(...points.map(point => point[1])) - y };
      }
      const boxes = this.children.filter(child => !["title", "defs", "path"].includes(child.name))
        .map(child => transformedBox(child.getBBox(), child.attributes.transform));
      if (!boxes.length) return { x: 0, y: 0, width: 0, height: 0 };
      const x = Math.min(...boxes.map(box => box.x)), y = Math.min(...boxes.map(box => box.y));
      return { x, y, width: Math.max(...boxes.map(box => box.x + box.width)) - x,
        height: Math.max(...boxes.map(box => box.y + box.height)) - y };
    },
    getBoundingClientRect() {
      let box = this.getBBox();
      if (name === "svg") {
        const [x, y, width, height] = this.attributes.viewBox.split(" ").map(Number);
        box = { x, y, width, height };
      } else for (let node = this; node; node = node.parentNode) {
        box = transformedBox(box, node.getAttribute("transform") ?? "");
      }
      return { ...box, left: box.x, right: box.x + box.width, top: box.y, bottom: box.y + box.height };
    },
  };
}

test("the fixed compass labels all six assembly views and the selected part's stock-relative view", () => {
  const { viewer } = createViewer();
  viewer.setGeometry(new Board({ length: 6, width: 4, thickness: 1 }).createGeometry());
  const document = { createElementNS(namespace, name) { return svgElement(this, name); } };
  const compass = document.createElementNS("", "svg");
  const labels = () => Object.fromEntries(compass.children.filter(node => node.name === "text").map(node => {
    const x = Number(node.attributes.x), y = Number(node.attributes.y);
    return [x < 71 ? "left" : x > 73 ? "right" : y < 72 ? "above" : "below", node.textContent];
  }));
  for (const [name, [above, below, left, right]] of Object.entries({
    Top: ["Back", "Front", "Left", "Right"], Bottom: ["Front", "Back", "Left", "Right"],
    Left: ["Top", "Bottom", "Back", "Front"], Right: ["Top", "Bottom", "Front", "Back"],
    Front: ["Top", "Bottom", "Left", "Right"], Back: ["Top", "Bottom", "Right", "Left"],
  })) {
    viewer.setStandardView(name);
    renderPartCompass(compass, viewer);
    assert.deepEqual(labels(), { above, below, left, right });
    assert.ok(compass.getAttribute("aria-label").includes(`${above} above`));
  }
  const model = buildStairway(), views = model.partTree.getStockViews("stairway/module-1/step-2-leftUpright");
  const left = views.find(view => view.name === "Left");
  viewer.setStandardView(STANDARD_VIEWS.find(view =>
    view.direction.every((value, axis) => value === left.direction[axis])).name);
  renderPartCompass(compass, viewer, views);
  assert.deepEqual(labels(), { above: "Back", below: "Front", left: "Bottom", right: "Top" });
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /id="part-view-annotations"[\s\S]*?<\/div>\s*<svg id="part-view-compass"/,
    "The compass is outside the transformed drawing, not another co-transformed annotation");
});

test("short upright depth dimensions use external arrows and keep adjacent labels separate", () => {
  const model = buildStairway(24, 8), node = model.partTree.getNode("stairway/module-1/step-2-leftUpright");
  const views = model.partTree.getStockViews(node.id), left = views.find(view => view.name === "Left");
  const { viewer } = createViewer();
  viewer.canvas = { clientWidth: 800, clientHeight: 1000 };
  viewer.setGeometry(node.part.createStockGeometry());
  viewer.setStandardView(STANDARD_VIEWS.find(view =>
    view.direction.every((value, axis) => value === left.direction[axis])).name);
  const document = { createElementNS(namespace, name) { return svgElement(this, name); } };
  const svg = document.createElementNS("", "svg");
  renderPartAnnotations(svg, { style: {} }, viewer, node.getDescription(), views);
  const depths = svg.children.filter(group => group.attributes.class === "part-feature-dimension" &&
    group.children.some(child => child.name === "text" && child.children[0].textContent.includes(" depth ")));
  assert.ok(depths.length >= 2);
  const labels = depths.map(group => group.children.find(child => child.name === "text").getBoundingClientRect());
  for (const [index, a] of labels.entries()) for (const b of labels.slice(index + 1)) {
    assert.ok(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
  }
  const bevel = depths.find(group => group.attributes["data-feature-id"] === "B1");
  const arrows = bevel.children.filter(child => child.name === "line" &&
    child.attributes["marker-end"] && !child.attributes["marker-start"]);
  assert.equal(arrows.length, 2, "The short bevel depth has two external arrows, not overlapping internal heads");
  const tips = arrows.map(arrow => Number(arrow.attributes.y2));
  for (const arrow of arrows) {
    const tail = Number(arrow.attributes.y1);
    assert.ok(tail < Math.min(...tips) || tail > Math.max(...tips));
  }
});

test("base rail reference callouts do not overlap on narrow drawings", () => {
  for (const module of [...buildStairway().modules, ...buildStairway(20, 7, 2).modules])
    for (const rib of [module.boards.innerBaseRail, module.boards.outerBaseRail]) {
    for (const [width, height] of [[360, 1000], [600, 1000], [600, 119], [1106, 729]]) {
      const { viewer } = createViewer();
      viewer.canvas = { clientWidth: width, clientHeight: height };
      viewer.setGeometry(rib.createStockGeometry());
      viewer.setStandardView("Top");
      const document = { createElementNS(namespace, name) { return svgElement(this, name); } };
      const svg = document.createElementNS("", "svg");
      const drawing = { style: {} }, description = rib.getManufacturingDescription();
      renderPartAnnotations(svg, drawing, viewer, description, undefined, { layoutOnly: true });
      assert.equal(svg.children.length, 0, "Sizing must not route callouts in an undersized viewport.");
      viewer.canvas.clientWidth = Math.max(width, parseFloat(drawing.style.minWidth));
      viewer.canvas.clientHeight = Math.max(height, parseFloat(drawing.style.minHeight));
      renderPartAnnotations(svg, drawing, viewer, description);
      const texts = node => node.localName === "text" ? [node] : node.children.flatMap(texts);
      const labels = texts(svg);
      labels.forEach((label, index) => {
        const a = label.getBoundingClientRect();
        for (const other of labels.slice(index + 1)) {
          const b = other.getBoundingClientRect();
          assert.ok(Math.min(a.right, b.right) - Math.max(a.left, b.left) <= 1 ||
            Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) <= 1,
          `${width}px: ${label.children.map(node => node.textContent).join(" ")} overlaps ` +
            other.children.map(node => node.textContent).join(" "));
        }
      });
      for (const note of svg.children.filter(node => node.getAttribute("class")?.includes("part-feature-note"))) {
        const ownLabels = texts(note);
        for (const leader of note.children.filter(node => node.localName === "polyline")) {
          const points = leader.getAttribute("points").split(" ").map(point => point.split(",").map(Number));
          points.slice(1).forEach((end, index) => {
            const start = points[index];
            for (const label of labels.filter(label => !ownLabels.includes(label))) {
              const box = label.getBoundingClientRect();
              assert.ok(Math.max(start[0], end[0]) <= box.left || Math.min(start[0], end[0]) >= box.right ||
                Math.max(start[1], end[1]) <= box.top || Math.min(start[1], end[1]) >= box.bottom,
              `${width}px: a leader crosses ${label.children.map(node => node.textContent).join(" ")}`);
            }
          });
        }
      }
    }
  }
});

test("concentric arc dimensions chain from the outer cut to the inner cut and then toward C", () => {
  for (const [innerStart, innerEnd] of [[80, 100], [82, 84]]) {
    const outer = { type: "arc", center: [0, 0], radius: 120,
      startAngle: 80 * Math.PI / 180, sweepRadians: 20 * Math.PI / 180 };
    const inner = { type: "arc", center: [0, 0], radius: 116,
      startAngle: innerEnd * Math.PI / 180, sweepRadians: (innerStart - innerEnd) * Math.PI / 180 };
    const outline = [outer, { type: "line", from: outlinePoint(outer, 1), to: outlinePoint(inner, 0) },
      inner, { type: "line", from: outlinePoint(inner, 1), to: outlinePoint(outer, 0) }];
    const { min } = outlineBounds(outline);
    const translate = point => point.map((value, axis) => value - min[axis]);
    const plywood = new ProfiledPlywood({ thickness: 0.5, outline: outline.map(edge => edge.type === "arc" ?
      { ...edge, center: translate(edge.center) } : { ...edge, from: translate(edge.from), to: translate(edge.to) }) });
    const description = plywood.getManufacturingDescription();
    for (const view of ["Top", "Bottom"]) for (const width of [360, 600, 1106]) {
      const { viewer } = createViewer();
      viewer.canvas = { clientWidth: width, clientHeight: 729 };
      viewer.setGeometry(plywood.createStockGeometry());
      viewer.setStandardView(view);
      const document = { createElementNS(namespace, name) { return svgElement(this, name); } };
      const svg = document.createElementNS("", "svg"), drawing = { style: {} };
      renderPartAnnotations(svg, drawing, viewer, description, undefined, { layoutOnly: true });
      viewer.canvas.clientWidth = Math.max(width, parseFloat(drawing.style.minWidth));
      viewer.canvas.clientHeight = Math.max(729, parseFloat(drawing.style.minHeight));
      renderPartAnnotations(svg, drawing, viewer, description);
      const arcs = getPartFeatures(description, STANDARD_VIEWS.find(candidate => candidate.name === view))
        .filter(feature => feature.kind === "arc").sort((a, b) => b.radius - a.radius);
      assert.deepEqual(arcs.map(feature => feature.radius), [120, 116]);
      assert.equal(arcs[0].radiusSpan, 4);
      arcs.forEach(feature => {
        close(Math.hypot(...feature.point.map((value, axis) => value - feature.radiusCenter[axis])), feature.radius);
        const angle = Math.atan2(feature.point[2] - feature.radiusCenter[2],
          feature.point[0] - feature.radiusCenter[0]) * 180 / Math.PI;
        assert.ok(angle >= innerStart - 1e-8 && angle <= innerEnd + 1e-8,
          "The common radius must intersect both actual arc spans.");
        assert.equal(feature.radiusCenterLabel, "C");
      });
      arcs[0].radiusTo.forEach((value, axis) => close(value, arcs[1].point[axis]));
      const guides = svg.children.filter(node => node.getAttribute("class")?.split(" ").includes("part-radius-reference"));
      const spacing = guides.find(node => node.getAttribute("data-radius-span") !== null);
      assert.equal(spacing.getAttribute("data-radius-span"), "4");
      for (const [point, suffix] of [[arcs[0].point, "1"], [arcs[1].point, "2"]]) {
        const projected = viewer.projectPoint(point);
        close(Number(spacing.getAttribute(`x${suffix}`)), projected.x);
        close(Number(spacing.getAttribute(`y${suffix}`)), projected.y);
      }
      const towardC = guides.filter(node => node !== spacing);
      assert.ok(towardC.length >= 1);
      if (innerStart === 80) assert.equal(towardC.length, 3, "Both radial edges also point toward C.");
      const texts = node => node.localName === "text" ? [node] : node.children.flatMap(texts);
      const labels = texts(svg);
      assert.ok(labels.some(node => node.children[0].textContent === "Arc spacing 4 in"));
      assert.ok(labels.some(node => node.children[0].textContent === "Radius 116 in"));
      assert.equal(labels.filter(node => node.children[0].textContent === "To C").length, towardC.length);
      for (const guide of towardC) {
        close(Number(guide.getAttribute("y2")), Number(towardC[0].getAttribute("y2")));
        const [x1, y1, x2, y2] = ["x1", "y1", "x2", "y2"].map(name => Number(guide.getAttribute(name)));
        const center = viewer.projectPoint(arcs[1].radiusCenter);
        close((x2 - x1) * (center.y - y1) - (y2 - y1) * (center.x - x1), 0);
        assert.ok((x2 - x1) * (center.x - x1) + (y2 - y1) * (center.y - y1) > 0);
      }
      for (const guide of guides) {
        assert.equal(guide.getAttribute("marker-end"), "url(#part-dimension-arrow)");
        assert.equal(guide.getAttribute("stroke-dasharray"), "1 4");
      }
      labels.forEach((label, index) => {
        const a = label.getBoundingClientRect();
        for (const other of labels.slice(index + 1)) {
          const b = other.getBoundingClientRect();
          assert.ok(Math.min(a.right, b.right) - Math.max(a.left, b.left) <= 1 ||
            Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) <= 1);
        }
      });
    }
  }
});

test("upright face notes omit redundant notches but retain dimensions, outlines, and useful recess notes", () => {
  const model = buildStairway(), node = model.partTree.getNode("stairway/module-1/step-2-leftUpright");
  const description = node.getDescription(), views = model.partTree.getStockViews(node.id);
  const { viewer } = createViewer();
  viewer.canvas = { clientWidth: 800, clientHeight: 1000 };
  viewer.setGeometry(node.part.createStockGeometry());
  const document = { createElementNS(namespace, name) { return svgElement(this, name); } };
  const render = name => {
    const view = views.find(view => view.name === name);
    viewer.setStandardView(STANDARD_VIEWS.find(stock =>
      stock.direction.every((value, axis) => value === view.direction[axis])).name);
    const svg = document.createElementNS("", "svg");
    renderPartAnnotations(svg, { style: {} }, viewer, description, views);
    return svg;
  };
  const notes = svg => svg.children.filter(node => node.attributes.class?.startsWith("part-feature-note "));
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  const left = render("Left");
  assert.deepEqual(notes(left).map(note => note.attributes["data-feature-id"]), ["B1"]);
  const labels = descendants(left).filter(node => node.name === "text")
    .map(node => node.children.map(child => child.textContent).join(" "));
  assert.ok(labels.includes("N1 depth 7/8 in"), "The notch's non-profile depth dimension remains");
  assert.ok(labels.includes("3/4 in"), "The other notch's depth remains in the visible-profile chain");
  const hiddenRecess = left.children.find(node => node.attributes.class === "part-feature-outline" &&
    node.attributes["data-feature-id"] === "N3");
  assert.equal(hiddenRecess.name, "polygon");
  assert.equal(hiddenRecess.attributes["stroke-dasharray"], "5 4");
  const recess = getPartFeatures(description, views.find(view => view.name === "Left"), views)
    .find(feature => feature.id === "N3");
  assert.equal(hiddenRecess.attributes.points, recess.outline.map(point => {
    const screen = viewer.projectPoint(point);
    return `${screen.x},${screen.y}`;
  }).join(" "));
  const right = render("Right");
  const recessNote = notes(right).find(note => note.attributes["data-feature-id"] === "N3");
  assert.ok(descendants(recessNote).some(node => node.textContent === "N3: Right face end recess"));
  const chains = right.children.filter(node => node.attributes.class === "part-profile-chain");
  assert.ok(chains.flatMap(descendants).some(node => node.name === "text" &&
    node.children.some(child => child.textContent === "1 1/2 in")),
  "The recess opening remains dimensioned by the visible-profile chain");
  for (const [name, id] of [["Up", "N1"], ["Down", "B1"]]) {
    const note = notes(render(name)).find(note => note.attributes["data-feature-id"] === id);
    assert.ok(descendants(note).some(node => node.attributes.class === "part-angle-diagram"));
  }
});

test("dimension lanes and reference-angle notes stay finite and outside the part in wide and narrow views", () => {
  const board = new NotchedBoard({ length: 10, thickness: 1.5, width: 3.5 }, {
    startNear: { length: 1, depth: [0.5, 0.75] },
    endNear: { length: 2, depth: [0.5, 0.75] },
    startFar: { length: 1, depth: [0.5, 0.75] },
    endFar: { length: 2, depth: [0.5, 0.75] },
  });
  const description = board.getManufacturingDescription();
  const document = { createElementNS(namespace, name) { return svgElement(this, name); } };
  const model = buildStairway();
  const spindle = model.steps[1].parts.frontSpindle;
  const spindleBevel = Number((Math.atan(spindle.topRise / spindle.thickness) * 180 / Math.PI).toFixed(2));
  const cases = [{ description, geometry: board.createStockGeometry(), views: [] },
    ...["stairway/module-1/step-3-rightUpright", "stairway/module-1/step-3-spindleShim",
      "stairway/module-1/step-2-leftUpright", "stairway/module-2/step-4-leftUpright",
      "stairway/module-2/step-6-rightUpright", "stairway/module-2/step-5-rightUpright",
      "stairway/module-1/step-2-frontSpindle",
      "stairway/module-1/step-1-newel", "stairway/module-1/siding",
      "stairway/module-1/step-3-leftBackSupportBlock",
      "stairway/module-1/step-1-newelInnerBlock"].map(id => {
      const node = model.partTree.getNode(id);
      return { description: node.getDescription(), geometry: node.part.createStockGeometry(),
        views: model.partTree.getStockViews(id) };
    })];
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  let resets = 0, staggers = 0, redundant = 0, retained = 0, combined = 0, spindleBevels = 0;
  for (const { description, geometry, views } of cases) for (const width of [320, 800]) {
    const { viewer } = createViewer();
    viewer.canvas = { clientWidth: width, clientHeight: 1600 };
    viewer.setGeometry(geometry);
    for (const view of STANDARD_VIEWS) {
      viewer.canvas.clientWidth = width;
      viewer.canvas.clientHeight = 1600;
      viewer.setStandardView(view.name);
      const svg = document.createElementNS("", "svg"), drawing = { style: {} };
      renderPartAnnotations(svg, drawing, viewer, description, views);
      viewer.canvas.clientWidth = Math.max(width, parseFloat(drawing.style.minWidth));
      viewer.canvas.clientHeight = Math.max(1600, parseFloat(drawing.style.minHeight));
      renderPartAnnotations(svg, drawing, viewer, description, views);
      const { blank } = description;
      const corners = [0, blank.length].flatMap(x => [0, blank.thickness].flatMap(y =>
        [0, blank.width].map(z => viewer.projectPoint([x, y, z]))));
      const top = Math.min(...corners.map(point => point.y));
      const bottom = Math.max(...corners.map(point => point.y));
      const midline = (top + bottom) / 2;
      const notes = svg.children.filter(node => node.attributes.class?.startsWith("part-feature-note "));
      const simple = getSimpleEdgeBevel(description) !== null;
      if (simple) {
        assert.equal(notes.length, 0);
        const angles = svg.children.filter(node => node.attributes.class === "part-direct-angle");
        assert.equal(angles.length, Math.abs(view.direction[0]));
        for (const angle of angles) {
          close(Number(angle.attributes["data-degrees"]), 5);
          assert.ok(angle.children.some(child => child.attributes.class === "part-angle-arc"));
          assert.ok(angle.children.some(child => child.attributes.class === "part-angle-reference"));
          const label = angle.children.find(child => child.name === "text");
          assert.ok(Number(label.attributes.y) >= 0 && Number(label.attributes.y) <= viewer.canvas.clientHeight);
        }
      } else assert.equal(notes.length, getPartFeatures(description, view, views)
        .filter(feature => feature.lines.length || feature.angles.length).length);
      const overall = svg.children.filter(node => node.attributes.class === "part-blank-dimension");
      assert.deepEqual(overall.map(node => node.attributes["data-side"]).sort(), ["left", "top"]);
      for (const dimension of overall) {
        assert.equal(dimension.attributes.transform.includes("rotate(90)"), dimension.attributes["data-side"] === "top");
        assert.equal(dimension.children.find(node => node.name === "text").attributes["text-anchor"], "middle");
      }
      const featureLabels = descendants(svg).filter(node => node.attributes.class === "part-feature-dimension")
        .map(node => node.children.find(child => child.name === "text").children[0].textContent);
      const horizontalLines = descendants(svg).filter(node => node.name === "line")
        .map(node => node.getBoundingClientRect()).filter(box => box.height < 1e-7 && box.width > 1e-7);
      for (const dimension of svg.children.filter(node => node.attributes.class === "part-feature-dimension" &&
        ["left", "right"].includes(node.attributes["data-side"]))) {
        const label = dimension.children.find(node => node.name === "text"), box = label.getBoundingClientRect();
        assert.ok(horizontalLines.every(line => line.top <= box.top + 0.1 || line.top >= box.bottom - 0.1 ||
          line.right <= box.left || line.left >= box.right),
        `${label.children[0].textContent}: depth labels must clear dimension and profile extension lines`);
        assert.ok(box.top >= 0 && box.bottom <= viewer.canvas.clientHeight &&
          box.left >= 0 && box.right <= viewer.canvas.clientWidth, "External depth labels stay in the drawing");
      }
      const profile = getProfileChains(geometry, view);
      const tolerance = Math.max(1, blank.length, blank.thickness, blank.width) * 1e-7;
      for (const dimension of getPartFeatures(description, view, views).flatMap(feature => feature.dimensions)) {
        const chain = profile.find(chain => chain.axis === dimension.axis);
        const covered = chain && [dimension.from, dimension.to].every(point =>
          chain.stops.some(stop => Math.abs(stop[dimension.axis] - point[dimension.axis]) <= tolerance));
        assert.equal(featureLabels.includes(dimension.label), !covered,
          `${dimension.label}: suppress only measurements whose actual endpoints occur in the chain`);
        if (covered) redundant++;
        else retained++;
      }
      const chains = svg.children.filter(node => node.attributes.class === "part-profile-chain");
      assert.equal(chains.length, getProfileChains(geometry, view).length);
      for (const chain of chains) {
        const side = chain.attributes["data-side"];
        assert.ok(side === "bottom" || side === "right");
        assert.equal(chain.attributes.transform.includes("rotate(90)"), side === "bottom");
        const translation = chain.attributes.transform.match(/translate\((\S+) (\S+)\)/).slice(1).map(Number);
        const segments = chain.children.filter(node => node.attributes.class === "part-profile-dimension");
        assert.ok(segments.length > 1);
        let previous;
        for (const segment of segments) {
          const label = segment.children.find(node => node.name === "text");
          assert.equal(label.children[0].textContent, `${formatLength(Number(segment.attributes["data-value"]))} in`);
          assert.equal(label.attributes["text-anchor"], "start");
          assert.equal(label.attributes.transform, undefined, "Rotation belongs to the shared chain group");
          const leader = segment.children.find(node => node.attributes.class === "part-profile-label-leader");
          assert.equal(leader.name, "polyline");
          const points = leader.attributes.points.split(" ").map(point => point.split(",").map(Number));
          const x = Number(label.attributes.x), y = Number(label.attributes.y);
          const unit = Number(chain.attributes["data-callout-unit"]);
          const span = segment.children.find(node => node.name === "line");
          close(points[0][1], (Number(span.attributes.y1) + Number(span.attributes.y2)) / 2);
          close(points[0][1], points[1][1]);
          close(points[1][0], x);
          assert.deepEqual(points[2], [x, y]);
          assert.ok(y <= points[0][1] - unit + 1e-8);
          if (previous) {
            const clear = y >= previous.y + unit - 1e-8 && y >= previous.anchor;
            close(x, clear ? unit : previous.x + unit);
            close(previous.y, Math.min(previous.defaultY, y - unit));
            if (clear) resets++;
            else staggers++;
          } else close(x, unit);
          previous = { x, y, defaultY: points[0][1] - unit, anchor: points[0][1] };
          const screen = side === "bottom" ? { x: translation[0] - y, y: translation[1] + x } :
            { x: translation[0] + x, y: translation[1] + y };
          assert.ok(screen.x >= 0 && screen.x <= viewer.canvas.clientWidth);
          assert.ok(screen.y >= 0 && screen.y <= viewer.canvas.clientHeight);
          if (side === "bottom") {
            assert.ok(screen.y > bottom);
          }
        }
        close(previous.y, previous.defaultY);
      }
      const occupied = [{
        left: Math.min(...corners.map(point => point.x)), right: Math.max(...corners.map(point => point.x)),
        top, bottom,
      }];
      for (const node of svg.children) {
        if (["title", "defs"].includes(node.name) || notes.includes(node)) continue;
        const entries = node.attributes.class === "part-profile-chain" ?
          node.children.filter(child => child.attributes.class === "part-profile-dimension") : [node];
        occupied.push(...entries.map(node => node.getBoundingClientRect()));
      }
      const collides = (a, b, gap) => a.left < b.right + gap && a.right > b.left - gap &&
        a.top < b.bottom + gap && a.bottom > b.top - gap;
      for (const note of notes) {
        const labels = descendants(note).filter(node => node.name === "text");
        const anchor = note.children.find(node => node.name === "circle")?.attributes;
        const callout = note.children.find(node => node.attributes.class === "part-feature-callout");
        const [offsetX, offsetY] = callout.attributes.transform.match(/translate\((\S+) (\S+)\)/).slice(1).map(Number);
        const box = callout.getBoundingClientRect(), above = note.attributes["data-band"] === "top";
        const leader = note.children.find(node => node.name === "polyline");
        if (leader) {
          const points = leader.attributes.points.split(" ").map(point => point.split(",").map(Number));
          for (let i = 1; i < points.length; i++) {
            const [[x1, y1], [x2, y2]] = points.slice(i - 1, i + 1);
            for (const dimension of svg.children.filter(node => node.attributes.class === "part-feature-dimension")) {
              const label = dimension.children.find(node => node.name === "text"), bounds = label.getBoundingClientRect();
              const horizontal = Math.abs(y1 - y2) < 1e-7 && y1 > bounds.top + 0.1 &&
                y1 < bounds.bottom - 0.1 && Math.min(x1, x2) < bounds.right && Math.max(x1, x2) > bounds.left;
              const vertical = Math.abs(x1 - x2) < 1e-7 && x1 > bounds.left + 0.1 &&
                x1 < bounds.right - 0.1 && Math.min(y1, y2) < bounds.bottom && Math.max(y1, y2) > bounds.top;
              assert.ok(!horizontal && !vertical,
                `${label.children[0].textContent}: note leaders must not cross dimension text`);
            }
          }
        }
        assert.ok(occupied.every(other => !collides(box, other, 10 - 1e-6)),
          "The complete note and angle construction clear existing annotation bounds");
        const atDefault = Math.abs(above ? box.bottom - top + 10 : box.top - bottom - 10) < 1e-6;
        const closer = { ...box, top: box.top + (above ? 1 : -1), bottom: box.bottom + (above ? 1 : -1) };
        assert.ok(atDefault || occupied.some(other => collides(closer, other, 10 - 1e-6)),
          "Notes move only far enough outward to clear the occupied bounds");
        occupied.push(box);
        const feature = getPartFeatures(description, view, views).find(feature =>
          feature.id === note.attributes["data-feature-id"]);
        if (feature.outlineHidden) {
          const outline = svg.children.find(node => node.attributes.class === "part-feature-outline" &&
            node.attributes["data-feature-id"] === feature.id);
          assert.equal(outline.name, "polyline");
          assert.equal(outline.attributes["stroke-dasharray"], "5 4");
          assert.equal(outline.attributes.points, feature.outline.map(point => {
            const screen = viewer.projectPoint(point);
            return `${screen.x},${screen.y}`;
          }).join(" "));
          assert.ok(anchor, "A dashed shoulder trace retains its callout anchor");
          const point = viewer.projectPoint(feature.point);
          close(Number(anchor.cx), point.x);
          close(Number(anchor.cy), point.y);
        }
        if (feature.lines.length === 1 && feature.angles.length) {
          assert.ok(!callout.children.some(child => child.name === "text"), "The angle text replaces a redundant heading");
          combined++;
        }
        for (const label of labels) {
          const x = offsetX + Number(label.attributes.x), y = offsetY + Number(label.attributes.y);
          const bottomLine = y + (label.children.length - 1) * 13;
          if (note.attributes["data-band"] === "top") assert.ok(bottomLine < top);
          else assert.ok(y > bottom);
          if (anchor) assert.equal(note.attributes["data-band"] === "top", Number(anchor.cy) < midline - 1e-8);
          assert.ok(x >= 0 && x <= viewer.canvas.clientWidth);
          assert.ok(y >= 0 && bottomLine <= viewer.canvas.clientHeight);
        }
      }
      const lanes = new Set();
      for (const node of descendants(svg)) {
        assert.ok(!["pattern", "rect"].includes(node.name), "Ordinary views have no hatch or callout boxes");
        assert.ok(Object.values(node.attributes).every(value => !/NaN|Infinity/.test(value)));
        if (node.attributes.class === "part-feature-dimension") {
          const key = `${node.attributes["data-side"]}:${node.attributes["data-lane"]}`;
          assert.ok(!lanes.has(key));
          lanes.add(key);
        }
        if (node.attributes.class === "part-angle-diagram") {
          assert.ok(Number(node.attributes["data-degrees"]) > 0);
          const glyph = node.children.find(child => child.attributes.class === "part-angle-glyph");
          assert.ok(glyph.children.some(child => child.attributes.class === "part-angle-arc"));
          assert.ok(glyph.children.some(child => child.attributes.class === "part-angle-reference"));
          const labels = node.children.filter(child => child.name === "text");
          assert.equal(labels.length, 1, "Angle and reference share one paragraph beside the construction");
          const glyphBox = glyph.getBoundingClientRect(), labelBox = labels[0].getBoundingClientRect();
          close(labelBox.left - glyphBox.right, 9);
          const callout = node.parentNode;
          const header = callout.children.find(child => child.name === "text");
          const first = callout.children.find(child => child.attributes.class === "part-angle-diagram") === node;
          const textTop = first && header ? header.getBoundingClientRect().top : labelBox.top;
          assert.ok(Math.abs((glyphBox.top + glyphBox.bottom) / 2 - (textTop + labelBox.bottom) / 2) <= 5,
            "The fixed-size diagram is vertically centered beside its associated text block");
          for (const ray of glyph.children.filter(child => child.name === "line")) {
            close(Math.hypot(Number(ray.attributes.x2) - Number(ray.attributes.x1),
              Number(ray.attributes.y2) - Number(ray.attributes.y1)), 33);
          }
          const label = labels[0].children.map(child => child.textContent).join(" ");
          assert.ok(label.includes(" from ") && label.endsWith("(dashed)"));
          assert.ok(!label.includes("Reference:"));
          if (node.attributes["data-property"] === "Bevel" &&
            Math.abs(Number(node.attributes["data-degrees"]) - spindleBevel) < 0.01) {
            assert.equal(label, `B1 Bevel ${spindleBevel} deg from square Top end (dashed)`);
            spindleBevels++;
          }
        }
      }
    }
  }
  assert.ok(resets > 0, "Well-separated callouts reuse the default column");
  assert.ok(staggers > 0, "Crowded callouts stagger into separate columns");
  assert.ok(redundant > 0, "Profile chains replace redundant specialized dimensions");
  assert.ok(retained > 0, "Face-specific depths and internal recesses retain independent measurements");
  assert.ok(combined > 0, "Standalone angled cuts use one combined feature and angle note");
  assert.ok(spindleBevels > 0, "The spindle end bevel matches the combined-note convention");
});

test("Placement draws true projected angles as arcs and rejects foreshortened angles", () => {
  const { viewer } = createViewer();
  const geometry = new Board({ length: 6, width: 6, thickness: 1 }).createGeometry();
  viewer.setGeometry(geometry);
  viewer.setStandardView("Top");
  const document = { createElementNS(namespace, name) { return svgElement(document, name); } };
  const svg = svgElement(document, "svg"), drawing = { style: {} };
  const view = { name: "Up", boundsGeometry: geometry, notes: [], dimensions: [{
    id: "P1", kind: "angle", vertex: [0, 0, 0], from: [1, 0, 0], to: [1, 0, -1],
    value: 45, label: "Rotation", reference: "Reference edge",
  }] };
  renderPlacementAnnotations(svg, drawing, viewer, view);
  const group = svg.children.find(child => child.getAttribute("data-placement") === "P1");
  assert.ok(group.children.some(child => /A32,32/.test(child.getAttribute("d") ?? "")));
  assert.ok(group.children.some(child => child.textContent === "P1: 45.00 deg"));
  viewer.setStandardView("Front");
  assert.throws(() => renderPlacementAnnotations(svg, drawing, viewer, view), /not shown in true projection/);
});

test("Placement draws virtual edge extensions and zero-distance corner alignments explicitly", () => {
  const { viewer } = createViewer();
  const geometry = new Board({ length: 6, width: 6, thickness: 1 }).createGeometry();
  viewer.setGeometry(geometry);
  viewer.setStandardView("Top");
  const document = { createElementNS(namespace, name) { return svgElement(document, name); } };
  const svg = svgElement(document, "svg"), drawing = { style: {} };
  const view = { name: "Up", boundsGeometry: geometry, notes: [], dimensions: [{
    id: "L1", kind: "alignment", from: [3, 0, 3], to: [3, 0, 3], value: 0,
    source: "template-extension", extension: [[3, 0, 1], [3, 0, 3]],
    label: "Extended straight edge", reference: "Tread corner",
  }, {
    id: "L2", kind: "offset", from: [0, 0, -3], to: [3, 0, -3], value: 3,
    source: "template-extension", extension: [[3, 0, -1], [3, 0, -3]],
    label: "Extended straight edge", reference: "Tread perimeter",
  }] };
  renderPlacementAnnotations(svg, drawing, viewer, view);
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  for (const dimension of view.dimensions) {
    const group = svg.children.find(child => child.getAttribute("data-placement") === dimension.id);
    const line = group.children.find(child => child.getAttribute("data-edge-extension") !== null);
    assert.equal(line.getAttribute("stroke-dasharray"), "8 4");
    const [from, to] = dimension.extension.map(point => viewer.projectPoint(point));
    close(Number(line.getAttribute("x1")), from.x);
    close(Number(line.getAttribute("y1")), from.y);
    close(Number(line.getAttribute("x2")), to.x);
    close(Number(line.getAttribute("y2")), to.y);
    assert.ok(group.children.some(child => child.name === "circle"));
    assert.ok(descendants(group).some(child => child.textContent ===
      (dimension.kind === "alignment" ? "L1: corner aligned" : "L2: 3 in")));
  }
});

test("Placement fans close parallel measurements on a shared axis using Details segment callouts", () => {
  const model = buildStairway(24, 8, 2), planner = new PlacementPlanner(model);
  const beam = model.partTree.getLeaves().find(node => node.key === "leftSupportBeam");
  const view = planner.plan(beam.id).views[0];
  const document = { createElementNS(namespace, name) { return svgElement(this, name); } };
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  for (const width of [720, 1400]) {
    const { viewer } = createViewer();
    viewer.canvas = { clientWidth: width, clientHeight: 1000 };
    viewer.setGeometry(view.renderGeometry, view.boundsGeometry);
    viewer.setStandardView("Top");
    const svg = document.createElementNS("", "svg"), drawing = { style: {} };
    renderPlacementAnnotations(svg, drawing, viewer, view);
    viewer.canvas.clientWidth = Math.max(width, parseFloat(drawing.style.minWidth));
    viewer.canvas.clientHeight = Math.max(1000, parseFloat(drawing.style.minHeight));
    renderPlacementAnnotations(svg, drawing, viewer, view);
    const callouts = svg.children.filter(node => node.getAttribute("data-placement"));
    const first = callouts.find(node => node.getAttribute("data-placement") === "L1");
    const second = callouts.find(node => node.getAttribute("data-placement") === "L2");
    const firstAxis = first.children.find(node => node.getAttribute("data-placement-axis") !== null);
    const secondAxis = second.children.find(node => node.getAttribute("data-placement-axis") !== null);
    assert.equal(firstAxis.getAttribute("data-placement-axis"), secondAxis.getAttribute("data-placement-axis"));
    const labels = callouts.map(group => descendants(group).find(node => node.name === "text"));
    for (const [index, label] of labels.entries()) {
      const box = label.getBoundingClientRect();
      for (const other of labels.slice(index + 1)) {
        const next = other.getBoundingClientRect();
        assert.ok(box.right <= next.left || box.left >= next.right || box.bottom <= next.top || box.top >= next.bottom,
          "Fanned labels must not overlap after rotation into screen coordinates.");
      }
      assert.ok(box.left >= 0 && box.top >= 0 &&
        box.right <= viewer.canvas.clientWidth && box.bottom <= viewer.canvas.clientHeight);
    }
    for (const dimension of view.dimensions) {
      const group = callouts.find(node => node.getAttribute("data-placement") === dimension.id);
      const nodes = descendants(group);
      const label = nodes.find(node => node.name === "text");
      assert.equal(label.children[0].textContent, `${dimension.id}: ${formatLength(dimension.value)} in`);
      assert.ok(nodes.some(node => node.getAttribute("class") === "part-profile-label-leader"));
      assert.ok(nodes.some(node => node.getAttribute("marker-end") === "url(#placement-dimension-arrow)"));
    }
  }
});

test("Placement marks perpendicular setbacks with a right angle only when the gap and edge have room", () => {
  const { viewer } = createViewer();
  const geometry = new Board({ length: 6, width: 6, thickness: 1 }).createGeometry();
  viewer.canvas = { clientWidth: 1000, clientHeight: 1000 };
  viewer.setGeometry(geometry);
  viewer.setStandardView("Top");
  const document = { createElementNS(namespace, name) { return svgElement(document, name); } };
  for (const gap of [2, 0.01]) {
    const svg = svgElement(document, "svg"), drawing = { style: {} };
    const view = { name: "Up", boundsGeometry: geometry, notes: [], dimensions: [{
      id: "L1", kind: "offset", from: [3, 0, 0], to: [3 + gap, 0, 0], value: gap,
      selectedEdge: [[3, 0, -2], [3, 0, 2]], datumEdge: [[3 + gap, 0, -3], [3 + gap, 0, 3]],
      source: "template-setback", perpendicular: true,
      label: "Perpendicular end setback", reference: "Tread edge",
    }] };
    renderPlacementAnnotations(svg, drawing, viewer, view);
    const group = svg.children.find(child => child.getAttribute("data-placement") === "L1");
    const line = group.children.find(child => child.getAttribute("data-perpendicular-gap") !== null);
    const [from, to] = [view.dimensions[0].from, view.dimensions[0].to].map(point => viewer.projectPoint(point));
    close(Number(line.getAttribute("x1")), from.x);
    close(Number(line.getAttribute("y1")), from.y);
    close(Number(line.getAttribute("x2")), to.x);
    close(Number(line.getAttribute("y2")), to.y);
    const square = group.children.find(child => child.getAttribute("data-right-angle") !== null);
    if (gap === 0.01) {
      assert.equal(square, undefined, "Do not crowd a short gap with the right-angle symbol.");
      continue;
    }
    assert.ok(square);
    const [first, corner, last] = square.getAttribute("points").split(" ").map(point => point.split(",").map(Number));
    const a = first.map((value, i) => value - corner[i]), b = last.map((value, i) => value - corner[i]);
    close(a[0] * b[0] + a[1] * b[1], 0);
    close(Math.hypot(...a), 4);
    close(Math.hypot(...b), 4);
  }
});

test("hit testing uses the nearest visible indexed triangle with camera transforms, clipping, and back-face culling", () => {
  const originalWindow = globalThis.window;
  try {
    for (const ratio of [1, 2]) {
      globalThis.window = { devicePixelRatio: ratio };
      for (const [width, height] of [[800, 600], [390, 844]]) {
        for (const standard of [false, true]) {
          const { viewer, matrices } = createViewer();
          Object.assign(viewer.canvas, { clientWidth: width, clientHeight: height });
          const bounds = new Board({ length: 12, width: 4, thickness: 1 }).createGeometry();
          viewer.setGeometry(bounds);
          viewer.orbit(43, -17);
          viewer.pan(23, -11);
          viewer.zoom(0.85);
          if (standard) {
            viewer.setStandardView("Top");
            viewer.setViewportInsets({ top: 80, left: 20, bottom: 30, right: 10 });
          }
          viewer.draw();
          const { view, projection } = matrices;
          const distance = -viewer.center.reduce((sum, value, axis) => sum + value * view[axis * 4 + 2], view[14]);
          const near = projection[14] / (projection[10] - 1);
          const far = projection[14] / (projection[10] + 1);
          const clipNear = standard ? (projection[14] + 1) / projection[10] : near;
          const clipFar = standard ? (projection[14] - 1) / projection[10] : far;
          const world = point => [0, 1, 2].map(axis =>
            point.reduce((sum, value, i) => sum + (value - view[12 + i]) * view[axis * 4 + i], 0));
          const triangle = (depth, reverse = false) => {
            const vertices = [[1, 0, -depth], [3, 0, -depth], [2, 3, -depth]];
            if (!standard) for (const vertex of vertices) {
              vertex[0] *= depth / distance;
              vertex[1] *= depth / distance;
            }
            if (reverse) vertices.reverse();
            return vertices.flatMap(world);
          };
          const positions = new Float32Array([
            ...triangle(distance + 1), ...triangle(distance), ...triangle(distance - 1, true),
            ...triangle(clipNear / 2), ...triangle(clipFar + 10),
            ...world([2, 1, -distance]), ...world([2, 1, -distance]), ...world([2, 1, -distance]),
          ]);
          const geometry = { ...bounds, positions, indices: new Uint32Array(Array.from({ length: 18 }, (_, i) => i)) };
          viewer.setGeometry(geometry, bounds);
          const point = screenPoint(viewer, world([2, 1, -distance]));
          assert.equal(viewer.hitTest(point.x, point.y), 1);
          assert.equal(viewer.hitTest(0, 0), null);
          assert.equal(viewer.hitTest(-1, point.y), null);
          assert.equal(viewer.hitTest(width, point.y), null);
          assert.throws(() => viewer.hitTest(NaN, 0), RangeError);
          viewer.setGeometry({ ...geometry, indices: new Uint16Array([6, 7, 8]) }, bounds);
          assert.equal(viewer.hitTest(point.x, point.y), null);
          viewer.setGeometry({ ...geometry, indices: new Uint16Array([9, 10, 11, 12, 13, 14, 15, 16, 17]) }, bounds);
          assert.equal(viewer.hitTest(point.x, point.y), null);
          viewer.setGeometry({ ...geometry, indices: new Uint16Array() }, bounds);
          assert.equal(viewer.hitTest(point.x, point.y), null);
        }
      }
    }
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("module batches retain indexed buffers across transforms, bind each draw, and release surplus buffers", () => {
  const originalWindow = globalThis.window;
  globalThis.window = { devicePixelRatio: 1 };
  try {
    const { viewer, uploads, draws, deleted, allocated } = createViewer();
    const geometry = new Board({ length: 12, width: 4, thickness: 1 }).createGeometry();
    const model = buildStairway(), transforms = model.getModuleTransforms(1);
    const batches = transforms.map((transform, index) => ({
      geometry, transform,
      renderGeometry: index === 2 ? { ...geometry, indices: new Uint32Array(geometry.indices) } : geometry,
    }));
    viewer.setGeometry(combineGeometries(batches.map(batch => batch.geometry)), geometry, { batches });
    assert.equal(uploads.length, 15);
    assert.equal(allocated.length, 10);
    const resources = viewer.batches.map(batch => batch.indexBuffer);
    viewer.setBatchTransforms(model.getModuleTransforms(0.5));
    viewer.draw();
    assert.equal(uploads.length, 15, "Transform updates must not upload geometry.");
    assert.equal(allocated.length, 10, "Transform updates must not allocate GPU buffers.");
    assert.equal(draws.length, 3);
    viewer.batches.forEach((batch, index) => {
      assert.equal(draws[index].indexBuffer, resources[index]);
      assert.deepEqual(draws[index].vertexBuffers, batch.vertexBuffers.map(attribute => attribute.buffer));
      assert.deepEqual(draws[index].model, Array.from(batch.transform));
      assert.equal(draws[index].args[2], index === 2 ? viewer.gl.UNSIGNED_INT : viewer.gl.UNSIGNED_SHORT);
    });
    viewer.setGeometry(geometry, geometry, { batches });
    assert.deepEqual(viewer.batches.map(batch => batch.indexBuffer), resources);
    assert.equal(allocated.length, 10);
    viewer.setGeometry(geometry, geometry, { batches: batches.slice(0, 2) });
    assert.equal(deleted.length, 5);
    assert.ok(deleted.includes(resources[2]));
    viewer.setGeometry(geometry);
    assert.equal(deleted.length, 10);
    assert.equal(new Set(deleted).size, 10);
    viewer.draw();
    assert.equal(draws.at(-1).indexBuffer, viewer.indexBuffer);
    draws.at(-1).model.forEach((value, index) => close(value, index % 5 === 0 ? 1 : 0));
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("transformed batch picking matches world geometry, excluding footprints and empty batches", () => {
  const model = buildStairway(24, 7, 2);
  const { viewer } = createViewer(), { viewer: reference } = createViewer();
  const bounds = model.createGeometry(), empty = combineGeometries([]);
  const batches = model.partTree.root.children.map((module, index) => ({
    geometry: model.createNodeGeometry(module.id),
    boundsGeometry: model.createNodeGeometry(module.id),
    transform: model.getModuleTransforms(1)[index],
    renderGeometry: combineGeometries([model.createNodeGeometry(module.id), model.createFootprintGeometry()]),
  }));
  batches.splice(1, 0, { geometry: empty, boundsGeometry: bounds, transform: model.getModuleTransforms(0)[0] });
  viewer.setGeometry(bounds, bounds, { batches, orbitBatch: 2 });
  const world = combineGeometries(batches.map(batch => transformedGeometry(batch.geometry, batch.transform)));
  const worldBounds = combineGeometries(batches.map(batch => transformedGeometry(batch.boundsGeometry, batch.transform)));
  reference.setGeometry(world, worldBounds, {
    orbitGeometry: transformedGeometry(batches[2].boundsGeometry, batches[2].transform),
    renderGeometry: combineGeometries(batches.map(batch => transformedGeometry(batch.renderGeometry ?? batch.geometry, batch.transform))),
  });
  for (const standard of [false, true]) {
    if (standard) {
      viewer.setStandardView("Top");
      reference.setStandardView("Top");
    }
    let hits = 0;
    for (let y = 50; y < 600; y += 37) for (let x = 50; x < 800; x += 37) {
      const expected = reference.hitTest(x, y);
      assert.equal(viewer.hitTest(x, y), expected);
      if (expected !== null) hits++;
    }
    assert.ok(hits > 10, "Compare actual piece hits, not just background.");
  }
  viewer.orbitCenter.forEach((value, axis) => close(value, reference.orbitCenter[axis]));
  close(viewer.radius, reference.radius);
  close(viewer.clipRadius, reference.clipRadius);
  assert.throws(() => viewer.setBatchTransforms([]), /Every module/);
  const invalid = model.getModuleTransforms(0);
  invalid.splice(1, 0, invalid[0]);
  invalid[0][0] = 2;
  assert.throws(() => viewer.setBatchTransforms(invalid), /rigid/);
});

function createControls({
  reducedMotion = false, buildModel = buildStairway, failOnError = true,
  page = "home", search = "",
} = {}) {
  const nodes = new Map();
  const calls = [];
  const frames = new Map();
  const partViewers = [];
  const resizeCallbacks = [];
  const observedCanvases = [], errors = [];
  const historyReplacements = [];
  let time = 0, frameId = 0, geometry, bounds, renderGeometry, activeElement, mainViewer;
  function element(tagName = "div") {
    const handlers = new Map(), attributes = new Map();
    let text = "";
    return {
      tagName, children: [], hidden: false, ownerDocument: document,
      style: {}, clientWidth: 800, clientHeight: 600,
      get valueAsNumber() { return Number(this.value); },
      set valueAsNumber(value) { this.value = String(value); },
      get textContent() { return text + this.children.map(child => child.textContent).join(""); },
      set textContent(value) { text = String(value); this.children = []; },
      append(...children) {
        for (const child of children) child.parentNode = this;
        this.children.push(...children);
      },
      replaceChildren(...children) { text = ""; this.children = children; },
      addEventListener(name, handler) { handlers.set(name, handler); },
      setAttribute(name, value) { attributes.set(name, String(value)); },
      getAttribute(name) { return attributes.get(name) ?? null; },
      setPointerCapture() {},
      popoverOpen: false,
      showPopover() { this.popoverOpen = true; },
      hidePopover() { this.popoverOpen = false; },
      getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight }; },
      focus(options) { activeElement = this; this.focusOptions = options; },
      scrollIntoView(options) { this.scrollOptions = options; },
      dispatch(name, event = { preventDefault() {} }) {
        event.type = name;
        handlers.get(name)(event);
      },
    };
  }
  function node(selector) {
    if (!nodes.has(selector)) {
      const id = selector.slice(1);
      const value = ["parts-module", "parts-subset", "parts-type", "parts-search"].includes(id) ? ""
        : id === "stair-count" ? 9 : id === "module-count" ? 3
        : id === "spindle-shoulder-ascent" ? 32 : 24;
      nodes.set(selector, Object.assign(element(), {
        id,
        value: String(value),
        valueAsNumber: value,
        checked: !id.startsWith("view-") && !id.startsWith("hide-"),
      }));
    }
    return nodes.get(selector);
  }
  class Viewer {
    constructor(canvas, initialGeometry, initialBounds, cameraOptions) {
      this.canvas = canvas;
      this.isMain = canvas.id === "viewer";
      this.stockViewer = createViewer().viewer;
      this.stockViewer.canvas = canvas;
      this.setGeometry(initialGeometry, initialBounds, cameraOptions);
      if (this.isMain) mainViewer = this.stockViewer;
      if (!this.isMain) partViewers.push(this);
    }
    orbit(...args) { this.stockViewer.orbit(...args); calls.push(["orbit", ...args]); }
    roll(...args) { this.stockViewer.roll(...args); calls.push(["roll", ...args]); }
    pan(...args) { this.stockViewer.pan(...args); calls.push(["pan", ...args]); }
    zoom(...args) { this.stockViewer.zoom(...args); calls.push(["zoom", ...args]); }
    hitTest(...args) { calls.push(["hitTest", ...args]); return this.stockViewer.hitTest(...args); }
    reset() { this.stockViewer?.reset(); calls.push(["reset"]); }
    setGeometry(updatedGeometry, updatedBounds, cameraOptions) {
      this.stockViewer.setGeometry(updatedGeometry, updatedBounds, cameraOptions);
      this.renderGeometry = cameraOptions?.renderGeometry ?? updatedGeometry;
      if (this.isMain) { geometry = updatedGeometry; bounds = updatedBounds; renderGeometry = this.renderGeometry; }
      else {
        this.geometry = updatedGeometry;
      }
    }
    setBatchTransforms(transforms) { this.stockViewer.setBatchTransforms(transforms); }
    get standardView() { return this.stockViewer?.standardView; }
    get orientation() { return this.stockViewer.orientation; }
    set orientation(value) { this.stockViewer.orientation = value; }
    get zoomFactor() { return this.stockViewer.zoomFactor; }
    set zoomFactor(value) { this.stockViewer.zoomFactor = value; }
    get panOffset() { return this.stockViewer.panOffset; }
    set panOffset(value) { this.stockViewer.panOffset = value; }
    setStandardView(name) { this.stockViewer.setStandardView(name); }
    setViewportInsets(insets) { this.stockViewer.setViewportInsets(insets); }
    projectPoint(point) { return this.stockViewer.projectPoint(point); }
    requestRender() { this.renderRequests = (this.renderRequests ?? 0) + 1; }
  }
  const document = {
    body: { dataset: { page } },
    querySelector: node, createElement: element,
    createElementNS(namespace, name) { return svgElement(document, name); },
    createTextNode(text) {
      const child = element("#text");
      child.textContent = text;
      return child;
    },
  };
  const source = readFileSync(new URL("./main.js", import.meta.url), "utf8")
    .replace(/^import .*;\r?$/gm, "");
  let url = new URL(`http://localhost/${page === "home" ? "index" : "parameters"}.html${search}`);
  const windowEvents = new Map();
  const window = {
    innerWidth: 800, innerHeight: 600,
    matchMedia: () => ({ matches: reducedMotion, addEventListener() {} }),
    addEventListener(name, handler) { windowEvents.set(name, handler); },
    get location() { return url; },
    history: { replaceState(state, title, href) { url = new URL(href, url); historyReplacements.push(url.href); } },
  };
  runInNewContext(source, {
    document,
    window, URL, URLSearchParams, PARAMETER_FIELDS, readParameters, parameterURL,
    performance: { now: () => time },
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    ResizeObserver: class {
      constructor(callback) { resizeCallbacks.push(callback); }
      observe(canvas) { observedCanvases.push(canvas); }
    },
    buildStairway: buildModel,
    combineGeometries,
    PartBrowser,
    PartInventory,
    PART_SUBSETS,
    PART_VIEW_NAMES, viewLabel: partViewLabel,
    formatLength,
    formatPartDescription,
    formatPartListDescription,
    getPartFeatures,
    renderPartAnnotations,
    renderPartCompass,
    PlacementPlanner, renderPlacementAnnotations, renderTreadTemplate,
    WebGLViewer: Viewer,
    STANDARD_VIEWS,
    console: { error(cause) { errors.push(cause); if (failOnError) throw cause; } },
  });
  return {
    canvas: node("#viewer"), calls, node, partViewers, observedCanvases, errors, historyReplacements,
    get url() { return url; },
    restoreURL(search) {
      url.search = search;
      windowEvents.get("popstate")?.();
    },
    get geometry() {
      return mainViewer.batches
        ? combineGeometries(mainViewer.batches.map(batch => transformedGeometry(batch.geometry, batch.transform))) : geometry;
    },
    get bounds() {
      return mainViewer.batches
        ? combineGeometries(mainViewer.batches.map(batch => transformedGeometry(batch.boundsGeometry, batch.transform))) : bounds;
    },
    get renderGeometry() {
      return mainViewer.batches ? combineGeometries([
        this.geometry, ...mainViewer.batches.map(batch => transformedGeometry(batch.footprint, batch.transform)),
      ]) : renderGeometry;
    },
    get mainViewer() { return mainViewer; },
    get activeElement() { return activeElement; },
    resize() { resizeCallbacks.forEach(callback => callback()); },
    resizeWindow() { windowEvents.get("resize")?.(); },
    advance(milliseconds) {
      time += milliseconds;
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback(time);
    },
    separateModules(checked) {
      const button = node("#view-modules");
      if ((button.getAttribute("aria-pressed") === "true") !== checked) button.dispatch("click");
    },
  };
}

function expectedPartsGeometry(model, groups, selectedKey = null) {
  const visible = new Set(groups.flatMap(({ locations }) => locations.map(location => location.id)));
  const selected = new Set(groups.find(({ entry }) => entry.key === selectedKey)?.locations.map(location => location.id));
  return combineGeometries(model.partTree.getLeaves().filter(node => visible.has(node.id)).map(node => {
    const geometry = model.createNodeGeometry(node.id);
    if (!selected.size) return geometry;
    return { ...geometry, colors: geometry.colors.map((value, index) => selected.has(node.id)
      ? value * 0.25 + [0.18, 0.8, 1][index % 3] * 0.75 : value * 0.6) };
  }));
}

function visiblePartPoint(controls, model, groups, selectedKey, explosion = 0) {
  const keys = new Map(groups.flatMap(({ entry, locations }) => locations.map(location => [location.id, entry.key])));
  const ranges = [];
  let count = 0;
  for (const node of model.partTree.getLeaves().filter(node => keys.has(node.id))) {
    const start = count;
    count += model.createNodeGeometry(node.id, 0, explosion).indices.length / 3;
    ranges.push({ key: keys.get(node.id), start, end: count });
  }
  const { positions, indices } = controls.geometry;
  for (const range of ranges.filter(range => range.key === selectedKey)) {
    for (let triangle = range.start; triangle < range.end; triangle++) {
      const center = [0, 1, 2].map(axis => [0, 1, 2].reduce((sum, corner) =>
        sum + positions[indices[triangle * 3 + corner] * 3 + axis] / 3, 0));
      const point = screenPoint(controls.mainViewer, center);
      const hit = controls.mainViewer.hitTest(point.x, point.y);
      if (hit !== null && ranges.find(range => hit >= range.start && hit < range.end)?.key === selectedKey) return point;
    }
  }
  assert.fail("Expected a visible surface of the requested part group.");
}

function tapPart(controls, point, pointerType = "mouse") {
  const event = { pointerId: 1, pointerType, button: 0, clientX: point.x, clientY: point.y };
  controls.canvas.dispatch("pointerdown", { ...event });
  controls.canvas.dispatch("pointerup", { ...event });
}

test("3D clicks select and reveal the unique Parts row, highlight its group, and preserve Find and canvas focus", () => {
  const model = buildStairway(), inventory = new PartInventory(model.partTree);
  const controls = createControls({ buildModel: () => model });
  const groups = inventory.filter().groups;
  const selected = groups.find(({ entry }) => entry.roles.some(role => role.label === "Spindle - front"));
  assert.ok(selected.locations.length > 1);
  const point = visiblePartPoint(controls, model, groups, selected.entry.key);
  const search = controls.node("#parts-search");
  search.value = "no such part";
  search.dispatch("input");
  const list = controls.node("#parts-groups");
  const row = list.children[groups.indexOf(selected)];
  const camera = controls.mainViewer.getCameraMatrices();
  controls.canvas.getBoundingClientRect = () => ({ left: 41, top: 73, width: 400, height: 300 });
  tapPart(controls, { x: 41 + point.x / 2, y: 73 + point.y / 2 });
  assert.equal(row.getAttribute("aria-selected"), "true");
  assert.equal(list.getAttribute("aria-activedescendant"), row.id);
  assert.equal(row.scrollOptions.block, "nearest");
  assert.equal(controls.activeElement, controls.canvas);
  assert.equal(controls.node("#stairway-tab").getAttribute("aria-selected"), "true");
  assert.equal(search.value, "no such part");
  assert.equal(controls.node("#parts-find-status").textContent, "No matches");
  assert.deepEqual(controls.geometry, expectedPartsGeometry(model, groups, selected.entry.key));
  assert.deepEqual(controls.mainViewer.getCameraMatrices(), camera);
  tapPart(controls, { x: 41, y: 73 }, "touch");
  assert.equal(row.getAttribute("aria-selected"), "false");
  assert.deepEqual(controls.geometry, expectedPartsGeometry(model, groups));
});

test("Clear selection restores normal colors and empty views while retaining filters, Find, camera, and tab", () => {
  const model = buildStairway(), inventory = new PartInventory(model.partTree);
  const groups = inventory.filter({ moduleNumber: 2, subset: "banister" }).groups;
  for (const tab of ["stairway", "details", "placement"]) {
    const controls = createControls({ buildModel: () => model });
    const button = controls.node("#parts-clear-selection");
    assert.equal(button.disabled, true);
    controls.node("#parts-module").value = "2";
    controls.node("#parts-module").dispatch("change");
    controls.node("#parts-subset").value = "banister";
    controls.node("#parts-subset").dispatch("change");
    const search = controls.node("#parts-search");
    search.value = "spindle";
    search.dispatch("input");
    controls.node(`#${tab}-tab`).dispatch("click");
    controls.mainViewer.orbit(30, 15);
    controls.mainViewer.pan(12, -8);
    controls.mainViewer.zoom(0.8);
    const camera = controls.mainViewer.getCameraMatrices(), count = controls.node("#parts-count").textContent;
    assert.equal(button.disabled, false);
    assert.ok(controls.url.searchParams.has("part"));
    const replacementsBeforeClear = controls.historyReplacements.length;
    button.dispatch("click");
    assert.equal(button.disabled, true);
    assert.deepEqual(controls.geometry, expectedPartsGeometry(model, groups));
    assert.deepEqual(controls.mainViewer.getCameraMatrices(), camera);
    assert.equal(controls.node("#parts-count").textContent, count);
    assert.equal(controls.node("#parts-module").value, "2");
    assert.equal(controls.node("#parts-subset").value, "banister");
    assert.equal(search.value, "spindle");
    assert.equal(controls.node(`#${tab}-tab`).getAttribute("aria-selected"), "true");
    if (tab !== "stairway") {
      assert.equal(controls.node("#part-details-empty").hidden, false);
      assert.equal(controls.node("#part-view-layout").hidden, true);
    }
    assert.ok(controls.node("#parts-groups").children.every(row => row.getAttribute("aria-selected") === "false"));
    assert.equal(controls.node("#parts-groups").getAttribute("aria-activedescendant"), "");
    assert.equal(controls.url.searchParams.has("part"), false);
    assert.equal(controls.url.searchParams.get("module"), "2");
    assert.equal(controls.url.searchParams.get("subset"), "banister");
    assert.equal(controls.historyReplacements.length, replacementsBeforeClear + 1);
    const replacements = controls.historyReplacements.length;
    button.dispatch("click");
    assert.equal(controls.historyReplacements.length, replacements);
  }
});

test("empty mouse and touch taps and focused Escape shortcuts clear selection without moving focus", () => {
  const model = buildStairway(), controls = createControls({ buildModel: () => model });
  const list = controls.node("#parts-groups"), row = list.children[0];
  for (const pointerType of ["mouse", "touch"]) {
    row.dispatch("click");
    assert.ok(controls.url.searchParams.has("part"));
    assert.equal(controls.mainViewer.hitTest(0, 0), null);
    tapPart(controls, { x: 0, y: 0 }, pointerType);
    assert.equal(controls.url.searchParams.has("part"), false);
    assert.equal(controls.activeElement, controls.canvas);
  }
  for (const target of [controls.canvas, list]) {
    row.dispatch("click");
    target.focus();
    let prevented = false;
    target.dispatch("keydown", { key: "Escape", preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(controls.url.searchParams.has("part"), false);
    assert.equal(controls.activeElement, target);
  }
  row.dispatch("click");
  controls.node("#details-tab").dispatch("click");
  let prevented = false;
  controls.node("#part-view-stage").dispatch("keydown", { key: "Escape", preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
  assert.ok(controls.url.searchParams.has("part"));
});

test("background orbit drags, multi-touch, and cancelled gestures retain the selected part", () => {
  const controls = createControls();
  const row = controls.node("#parts-groups").children[0];
  row.dispatch("click");
  const selected = controls.url.searchParams.get("part");
  const pointer = (type, pointerId, x, y) => controls.canvas.dispatch(type, {
    pointerId, pointerType: "touch", clientX: x, clientY: y,
  });
  pointer("pointerdown", 1, 0, 0);
  pointer("pointermove", 1, 30, 10);
  pointer("pointermove", 1, 0, 0);
  pointer("pointerup", 1, 0, 0);
  assert.equal(controls.url.searchParams.get("part"), selected);
  pointer("pointerdown", 1, 0, 0);
  pointer("pointerdown", 2, 40, 0);
  pointer("pointerup", 2, 40, 0);
  pointer("pointerup", 1, 0, 0);
  assert.equal(controls.url.searchParams.get("part"), selected);
  for (const end of ["pointercancel", "lostpointercapture"]) {
    pointer("pointerdown", 1, 0, 0);
    pointer(end, 1, 0, 0);
    pointer("pointerup", 1, 0, 0);
    assert.equal(controls.url.searchParams.get("part"), selected);
  }
  assert.equal(row.getAttribute("aria-selected"), "true");
});

test("3D taps respect Filters, separated modules, URL parameters, and the active tab", () => {
  let model = buildStairway();
  const controls = createControls({ reducedMotion: true, search: "?width=30",
    buildModel: (...args) => (model = buildStairway(...args)) });
  controls.node("#parts-module").value = "2";
  controls.node("#parts-module").dispatch("change");
  controls.node("#parts-subset").value = "banister";
  controls.node("#parts-subset").dispatch("change");
  controls.separateModules(true);
  const inventory = new PartInventory(model.partTree);
  const groups = inventory.filter({ moduleNumber: 2, subset: "banister" }).groups;
  const selected = groups.find(({ entry }) => entry.roles.some(role => role.label === "Spindle - front"));
  const point = visiblePartPoint(controls, model, groups, selected.entry.key, 1);
  tapPart(controls, point, "touch");
  const row = controls.node("#parts-groups").children[groups.indexOf(selected)];
  assert.equal(row.getAttribute("aria-selected"), "true");
  assert.equal(row.scrollOptions.block, "nearest");
  assert.ok(controls.geometry.positions.length < controls.bounds.positions.length);
  const selectedColors = new Map(groups.flatMap(({ entry, locations }) => locations.map(location => [location.id, entry.key])));
  const expected = combineGeometries(model.partTree.getLeaves().filter(node => selectedColors.has(node.id)).map(node => {
    const geometry = model.createNodeGeometry(node.id, 0, 1);
    return { ...geometry, colors: geometry.colors.map((value, i) => selectedColors.get(node.id) === selected.entry.key
      ? value * 0.25 + [0.18, 0.8, 1][i % 3] * 0.75 : value * 0.6) };
  }));
  assert.deepEqual(controls.geometry, expected);
  controls.calls.length = 0;
  controls.node("#details-tab").dispatch("click");
  tapPart(controls, point);
  assert.ok(controls.calls.every(([name]) => name !== "hitTest"));
  controls.node("#stairway-tab").dispatch("click");
  controls.node("#parts-type").value = inventory.entries.find(entry => entry.roles.some(role => role.label === "Tread")).stockKey;
  controls.node("#parts-type").dispatch("change");
  assert.equal(controls.geometry.indices.length, 0);
  tapPart(controls, point);
  assert.equal(controls.node("#parts-groups").getAttribute("aria-activedescendant"), "");
});

test("3D selection ignores orbit drags, multi-touch, cancellation, capture loss, and secondary buttons", () => {
  const controls = createControls();
  const pointer = (type, id, x, y, extra = {}) => controls.canvas.dispatch(type, {
    pointerId: id, pointerType: "touch", clientX: x, clientY: y, ...extra,
  });
  pointer("pointerdown", 1, 100, 100);
  pointer("pointermove", 1, 120, 110);
  pointer("pointermove", 1, 100, 100);
  pointer("pointerup", 1, 100, 100);
  pointer("pointerdown", 1, 100, 100);
  pointer("pointerup", 1, 110, 100);
  pointer("pointerdown", 1, 100, 100);
  pointer("pointerdown", 2, 100, 100);
  pointer("pointerup", 2, 100, 100);
  pointer("pointerup", 1, 100, 100);
  for (const end of ["pointercancel", "lostpointercapture"]) {
    pointer("pointerdown", 1, 100, 100);
    pointer(end, 1, 100, 100);
    pointer("pointerup", 1, 100, 100);
  }
  pointer("pointerdown", 1, 100, 100, { pointerType: "mouse", button: 2 });
  pointer("pointerup", 1, 100, 100, { pointerType: "mouse", button: 2 });
  assert.ok(controls.calls.every(([name]) => name !== "hitTest"));
  assert.ok(controls.calls.some(([name]) => name === "orbit"));
  assert.equal(controls.node("#parts-groups").getAttribute("aria-activedescendant"), "");
});

test("Stairway is the default content tab and Details supports empty selection and keyboard navigation", () => {
  const model = buildStairway(), inventory = new PartInventory(model.partTree);
  const controls = createControls({ buildModel: () => model });
  const parts = controls.node("#stairway-tab"), parameters = controls.node("#details-tab");
  assert.equal(parts.getAttribute("aria-selected"), "true");
  assert.equal(parts.tabIndex, 0);
  assert.equal(parameters.getAttribute("aria-selected"), "false");
  assert.equal(parameters.tabIndex, -1);
  assert.equal(controls.node("#stairway-panel").hidden, false);
  assert.equal(controls.node("#part-details").hidden, true);
  assert.equal(controls.node("#parts-groups").children.length, inventory.entries.length);
  assert.deepEqual(controls.geometry, expectedPartsGeometry(model, inventory.filter().groups));
  assert.ok(controls.geometry.positions.length);
  const key = (tab, key) => tab.dispatch("keydown", { key, preventDefault() {} });
  key(parts, "ArrowRight");
  assert.equal(controls.node("#part-details-empty").hidden, false);
  assert.equal(controls.node("#part-view-layout").hidden, true);
  assert.equal(parameters.getAttribute("aria-selected"), "true");
  assert.equal(controls.activeElement, parameters);
  key(parameters, "Home");
  assert.equal(parts.getAttribute("aria-selected"), "true");
  assert.equal(controls.activeElement, parts);
  key(parts, "End");
  const placement = controls.node("#placement-tab");
  assert.equal(placement.getAttribute("aria-selected"), "true");
  assert.equal(controls.node("#part-details-heading").textContent, "Part placement");
  key(placement, "ArrowRight");
  assert.equal(parts.getAttribute("aria-selected"), "true");
  key(parts, "ArrowLeft");
  assert.equal(placement.getAttribute("aria-selected"), "true");
});

test("Placement uses a filtered instance dropdown while Details retains the unique title", () => {
  const model = buildStairway(), inventory = new PartInventory(model.partTree);
  const controls = createControls({ buildModel: () => model });
  const groups = inventory.filter().groups;
  const group = groups.find(group => group.entry.kind === "lumber" && group.locations.length > 1);
  controls.node("#parts-groups").children[groups.indexOf(group)].dispatch("click");
  controls.node("#placement-tab").dispatch("click");
  const selector = controls.node("#placement-instance");
  assert.equal(selector.value, group.locations[0].id);
  assert.equal(selector.children.length, group.locations.length);
  const location = group.locations.at(-1);
  selector.value = location.id;
  selector.dispatch("change");
  assert.ok(controls.node("#part-details-heading").textContent.includes(location.name));
  assert.ok(controls.node("#part-details-heading").textContent.includes(`Module ${location.moduleNumber}`));
  assert.equal(controls.node("#part-view-layout").hidden, false);
  for (const [id, label, direction] of [["up", "Top", "top"], ["down", "Bottom", "bottom"]]) {
    const button = controls.node(`#part-view-choice-${id}`);
    assert.equal(controls.node(`#part-view-choice-${id} span`).textContent, label);
    assert.equal(button.getAttribute("aria-label"), `${label} placement`);
    button.dispatch("click");
    assert.equal(controls.node("#part-view-selected-name").textContent, `View from ${direction}`);
    assert.ok(controls.node("#part-view-selected").getAttribute("aria-label").startsWith(`${label} placement of `));
  }
  controls.node("#details-tab").dispatch("click");
  assert.equal(controls.node("#part-details-heading").textContent, group.title);
  controls.node("#placement-tab").dispatch("click");
  assert.equal(selector.value, location.id);
  controls.node("#stairway-tab").dispatch("click");
  controls.node("#parts-groups").children[groups.indexOf(group)].dispatch("click");
  controls.node("#placement-tab").dispatch("click");
  assert.equal(selector.value, group.locations[0].id);
});

test("Stairway picking retains the exact occurrence for Placement without activating its tab", () => {
  const model = buildStairway(), inventory = new PartInventory(model.partTree);
  const controls = createControls({ buildModel: () => model });
  const groups = inventory.filter().groups;
  const group = groups.find(({ entry }) => entry.roles.some(role => role.label === "Spindle - front"));
  const point = visiblePartPoint(controls, model, groups, group.entry.key);
  const triangle = controls.mainViewer.hitTest(point.x, point.y);
  const visible = new Set(groups.flatMap(group => group.locations.map(location => location.id)));
  let count = 0, hitId;
  for (const node of model.partTree.getLeaves().filter(node => visible.has(node.id))) {
    count += model.createNodeGeometry(node.id).indices.length / 3;
    if (triangle < count) { hitId = node.id; break; }
  }
  tapPart(controls, point);
  assert.equal(controls.node("#stairway-tab").getAttribute("aria-selected"), "true");
  controls.node("#placement-tab").dispatch("click");
  assert.equal(controls.node("#placement-instance").value, hitId);
});

test("Placement drawings and preview inspect neighbors before navigating through their instance links", () => {
  const model = buildStairway(), inventory = new PartInventory(model.partTree);
  const groups = inventory.filter().groups;
  const group = groups.find(({ entry }) => entry.roles.some(role => role.label === "Spindle - front"));
  const plan = new PlacementPlanner(model).plan(group.locations[0].id);
  for (const preview of [false, true]) {
    const controls = createControls({ buildModel: () => model });
    controls.node("#parts-groups").children[groups.indexOf(group)].dispatch("click");
    controls.node("#placement-tab").dispatch("click");
    const target = controls.node(preview ? "#part-view-preview" : "#part-view-stage");
    const canvas = controls.node(preview ? "#part-view-preview" : "#part-view-selected");
    const viewer = controls.partViewers.find(viewer => viewer.stockViewer.canvas === canvas);
    let point, hitId;
    for (const view of preview ? [null] : plan.views) {
      if (view) controls.node(`#part-view-choice-${view.name.toLowerCase()}`).dispatch("click");
      const ranges = preview ? plan.previewPickRanges : view.pickRanges;
      const { positions, indices } = viewer.geometry;
      assert.equal(ranges.at(-1).end * 3, indices.length, "The footprint is not pickable.");
      for (let triangle = ranges[0].end; triangle < indices.length / 3; triangle++) {
        const center = [0, 1, 2].map(axis => [0, 1, 2].reduce((sum, corner) =>
          sum + positions[indices[triangle * 3 + corner] * 3 + axis] / 3, 0));
        const projected = screenPoint(viewer.stockViewer, center);
        const hit = viewer.stockViewer.hitTest(projected.x, projected.y);
        const range = ranges.find(range => hit !== null && hit >= range.start && hit < range.end);
        if (range && range.id !== group.locations[0].id &&
          (!preview || inventory.findOccurrence(range.id).stockKey !== group.entry.stockKey)) {
          point = projected;
          hitId = range.id;
          break;
        }
      }
      if (point) break;
    }
    assert.ok(point, `Expected a visible neighbor in ${preview ? "preview" : "drawing"}.`);
    if (preview) {
      controls.node("#parts-type").value = group.entry.stockKey;
      controls.node("#parts-type").dispatch("change");
      controls.node("#parts-search").value = "keep this query";
      controls.node("#parts-search").dispatch("input");
    }
    const event = { pointerId: 1, pointerType: "mouse", button: 0,
      clientX: point.x, clientY: point.y };
    target.dispatch("pointerdown", { ...event });
    target.dispatch("pointermove", { ...event, clientX: event.clientX + 12 });
    target.dispatch("pointerup", { ...event, clientX: event.clientX + 12 });
    target.dispatch("click", { ...event, clientX: event.clientX + 12 });
    assert.equal(controls.node("#placement-instance").value, group.locations[0].id);
    assert.equal(controls.node("#placement-neighbor-popup").popoverOpen, false);
    target.dispatch("keydown", { key: "Home", preventDefault() {} });
    canvas.getBoundingClientRect = () => ({ left: 40, top: 20, width: 400, height: 300 });
    const click = { ...event, clientX: 40 + point.x / 2, clientY: 20 + point.y / 2 };
    const geometry = viewer.geometry, title = controls.node("#part-description").textContent;
    target.dispatch("pointerdown", { ...click });
    target.dispatch("pointerup", { ...click });
    target.dispatch("click", { ...click });
    const popup = controls.node("#placement-neighbor-popup"), link = controls.node("#placement-neighbor-link");
    const location = inventory.findOccurrence(hitId).locations.find(location => location.id === hitId);
    assert.equal(popup.popoverOpen, true);
    assert.equal(link.textContent, `${location.name} (Module ${location.moduleNumber}${
      location.stepNumber === null ? "" : ` / Step ${location.stepNumber}`})`);
    assert.equal(controls.activeElement, link);
    assert.equal(controls.node("#placement-instance").value, group.locations[0].id);
    assert.equal(controls.node("#part-description").textContent, title);
    assert.equal(viewer.geometry, geometry);
    if (preview) {
      assert.equal(controls.node("#parts-type").value, group.entry.stockKey);
      assert.equal(controls.node("#parts-search").value, "keep this query");
    }
    controls.resizeWindow();
    assert.equal(popup.popoverOpen, false);
    assert.equal(controls.node("#placement-instance").value, group.locations[0].id);
    target.dispatch("pointerdown", { ...click });
    target.dispatch("pointerup", { ...click });
    target.dispatch("click", { ...click });
    assert.equal(popup.popoverOpen, true);
    controls.node("#details-tab").dispatch("click");
    assert.equal(popup.popoverOpen, false);
    controls.node("#placement-tab").dispatch("click");
    target.dispatch("pointerdown", { ...click });
    target.dispatch("pointerup", { ...click });
    target.dispatch("click", { ...click });
    assert.equal(popup.popoverOpen, true);
    link.dispatch("click");
    assert.equal(popup.popoverOpen, false);
    assert.equal(controls.node("#placement-instance").value, hitId);
    assert.equal(controls.node("#placement-tab").getAttribute("aria-selected"), "true");
    if (preview) {
      assert.equal(controls.node("#parts-type").value, "");
      assert.equal(controls.node("#parts-search").value, "keep this query");
    }
  }
});

test("Parts list groups unique specifications, highlights matching occurrences, and supports keyboard selection", () => {
  const model = buildStairway(), inventory = new PartInventory(model.partTree);
  const controls = createControls({ buildModel: () => model });
  controls.node("#stairway-tab").dispatch("click");
  const list = controls.node("#parts-groups");
  const groups = inventory.filter().groups;
  assert.equal(list.children.length, inventory.entries.length);
  for (const [index, { entry, locations }] of groups.entries()) {
    assert.equal(list.children[index].children[0].textContent,
      `${entry.title}${locations.length > 1 ? ` x ${locations.length}` : ""}`);
  }
  assert.equal(controls.node("#parts-count").textContent,
    `${inventory.entries.length} unique parts (${inventory.quantity} total)`);
  assert.equal(controls.node("#parts-weight").textContent,
    `Weight ~${Math.round(model.estimatedWeightLb)} lb (wood only)`);
  const selectedIndex = groups.findIndex(group => group.locations.length > 1);
  assert.ok(selectedIndex >= 0);
  list.children[selectedIndex].dispatch("click");
  assert.equal(list.children.filter(item => item.getAttribute("aria-selected") === "true").length, 1);
  assert.equal(list.getAttribute("aria-activedescendant"), list.children[selectedIndex].id);
  assert.equal(controls.node("#stairway-tab").getAttribute("aria-selected"), "true");
  const selectedIds = new Set(groups[selectedIndex].locations.map(location => location.id));
  const expected = combineGeometries(model.partTree.getLeaves().map(node => {
    const geometry = model.createNodeGeometry(node.id);
    return { ...geometry, colors: geometry.colors.map((value, index) => selectedIds.has(node.id)
      ? value * 0.25 + [0.18, 0.8, 1][index % 3] * 0.75 : value * 0.6) };
  }));
  assert.deepEqual(Array.from(controls.geometry.colors), Array.from(expected.colors));
  const key = key => list.dispatch("keydown", { key, preventDefault() {} });
  key("Home");
  key("ArrowDown");
  assert.equal(list.getAttribute("aria-activedescendant"), list.children[1].id);
  key("End");
  assert.equal(list.getAttribute("aria-activedescendant"), list.children.at(-1).id);
  key("Home");
  assert.equal(list.getAttribute("aria-activedescendant"), list.children[0].id);
  assert.ok(controls.calls.every(([name]) => name !== "reset"));
});

test("Parts Filters module, subset, and type filters update list, geometry, counts, and weight independently of Find", () => {
  const model = buildStairway(), inventory = new PartInventory(model.partTree);
  const controls = createControls({ buildModel: () => model });
  controls.node("#stairway-tab").dispatch("click");
  const module = controls.node("#parts-module"), type = controls.node("#parts-type");
  const subset = controls.node("#parts-subset");
  const search = controls.node("#parts-search");
  assert.equal(module.children.length, 4);
  assert.deepEqual(Array.from(subset.children, option => option.textContent), PART_SUBSETS.map(subset => subset.label));
  search.value = "SWIVEL";
  search.dispatch("input");
  module.value = "2";
  module.dispatch("change");
  subset.value = "foundation";
  subset.dispatch("change");
  const hardware = inventory.sections.find(section => section.kind === "hardware");
  type.value = hardware.key;
  type.dispatch("change");
  const expected = inventory.filter({ moduleNumber: 2, subset: "foundation", stockKey: hardware.key });
  assert.ok(expected.occurrences.length);
  assert.equal(controls.node("#parts-count").textContent,
    `${expected.uniqueCount} unique parts (${expected.occurrences.length} total)`);
  assert.equal(controls.node("#parts-weight").textContent, "Weight ~0 lb (wood only)");
  const list = controls.node("#parts-groups");
  assert.equal(list.children.length, expected.uniqueCount);
  assert.ok(list.children.every(item => item.children[1].textContent.startsWith("Module 2")));
  assert.equal(list.children[0].children[0].textContent,
    `${expected.groups[0].title} x ${expected.groups[0].locations.length} (of ${expected.groups[0].entry.quantity})`);
  assert.equal(list.children[0].getAttribute("aria-selected"), "true");
  assert.deepEqual(controls.geometry, expectedPartsGeometry(model, expected.groups, expected.groups[0].entry.key));
  assert.deepEqual(controls.bounds, model.createGeometry());
  assert.equal(search.value, "SWIVEL");
  assert.match(controls.node("#parts-visibility-summary").textContent, /^Showing module 2, foundation, Hardware/);
  assert.ok(controls.calls.every(([name]) => name !== "reset"));
});

test("Parts subsets preserve visible geometry across content tabs and support empty intersections", () => {
  const model = buildStairway(), inventory = new PartInventory(model.partTree);
  const controls = createControls({ buildModel: () => model });
  assert.equal(controls.node("#parts-visibility-summary").textContent, "Show all parts");
  controls.node("#stairway-tab").dispatch("click");
  const module = controls.node("#parts-module"), type = controls.node("#parts-type");
  const subset = controls.node("#parts-subset");
  module.value = "1";
  module.dispatch("change");
  subset.value = "framing";
  subset.dispatch("change");
  assert.equal(controls.node("#parts-visibility-summary").textContent, "Showing module 1, framing");
  const expected = inventory.filter({ moduleNumber: 1, subset: "framing" });
  assert.deepEqual(controls.geometry, expectedPartsGeometry(model, expected.groups));
  assert.equal(controls.node("#parts-groups").children.length, expected.uniqueCount);
  assert.equal(controls.node("#parts-count").textContent,
    `${expected.uniqueCount} unique parts (${expected.occurrences.length} total)`);
  const weight = expected.occurrences.reduce((sum, { location }) => sum + model.estimateNodeWeightLb(location.id), 0);
  assert.equal(controls.node("#parts-weight").textContent, `Weight ~${Math.round(weight)} lb (wood only)`);
  controls.node("#details-tab").dispatch("click");
  assert.deepEqual(controls.geometry, expectedPartsGeometry(model, expected.groups));
  controls.node("#stairway-tab").dispatch("click");
  assert.deepEqual(controls.geometry, expectedPartsGeometry(model, expected.groups));
  assert.equal(module.value, "1");
  assert.equal(subset.value, "framing");
  type.value = inventory.entries.find(entry => entry.roles.some(role => role.label.startsWith("Side panel"))).stockKey;
  type.dispatch("change");
  assert.equal(controls.node("#parts-groups").children.length, 0);
  assert.equal(controls.node("#parts-empty").hidden, false);
  assert.equal(controls.node("#parts-count").textContent, "0 unique parts (0 total)");
  assert.equal(controls.node("#parts-weight").textContent, "Weight ~0 lb (wood only)");
  assert.equal(controls.geometry.positions.length, 0);
  assert.deepEqual(controls.bounds, model.createGeometry());
  assert.equal(controls.node("#part-details-empty").hidden, false);
  assert.ok(controls.calls.every(([name]) => name !== "reset"));
});

test("Module filters limit footprints and orbit around the module while retaining orientation and framing scale", () => {
  const model = buildStairway(), controls = createControls({ buildModel: () => model });
  const viewer = controls.mainViewer, filter = controls.node("#parts-module");
  viewer.orbit(25, -14);
  viewer.roll(0.3);
  viewer.zoom(0.8);
  const orientation = viewer.orientation.map(axis => [...axis]);
  const radius = viewer.radius, center = [...viewer.orbitCenter];
  for (const amount of [0, 0.5, 1]) {
    if (amount === 0.5) {
      controls.node("#view-modules").dispatch("click");
      controls.advance(300);
    } else if (amount === 1) controls.advance(300);
    for (const [index, module] of model.partTree.root.children.entries()) {
      viewer.pan(12, -8);
      filter.value = String(index + 1);
      filter.dispatch("change");
      const geometry = model.createNodeGeometry(module.id, 0, amount);
      const expectedCenter = [0, 1, 2].map(axis => {
        const values = geometry.positions.filter((_, i) => i % 3 === axis);
        return (Math.min(...values) + Math.max(...values)) / 2;
      });
      viewer.orbitCenter.forEach((value, axis) => close(value, expectedCenter[axis]));
      assert.deepEqual(viewer.panOffset, [0, 0]);
      assert.deepEqual(viewer.orientation, orientation);
      assert.equal(viewer.zoomFactor, 0.8);
      const footprint = model.createFootprintGeometry(null, false, true, amount, index + 1).positions;
      controls.renderGeometry.positions.slice(controls.geometry.positions.length).forEach((value, i) => close(value, footprint[i]));
      const projected = screenPoint(viewer, expectedCenter);
      viewer.orbit(20, -15);
      const rotated = screenPoint(viewer, expectedCenter);
      close(rotated.x, projected.x);
      close(rotated.y, projected.y);
      viewer.orientation = orientation.map(axis => [...axis]);
    }
    filter.value = "";
    filter.dispatch("change");
    closeGeometry(controls.bounds, model.createGeometry({}, 0, amount));
  }
  controls.node("#view-modules").dispatch("click");
  controls.advance(600);
  assert.deepEqual(viewer.orbitCenter, center);
  close(viewer.radius, radius);
});

test("each Parts subset updates actual geometry, counts, weight, and Find without changing the camera", () => {
  const model = buildStairway(), inventory = new PartInventory(model.partTree);
  const controls = createControls({ buildModel: () => model });
  const subset = controls.node("#parts-subset"), search = controls.node("#parts-search");
  search.value = "no such part";
  search.dispatch("input");
  const camera = controls.mainViewer.getCameraMatrices();
  for (const { key, label } of PART_SUBSETS) {
    subset.value = key;
    subset.dispatch("change");
    const expected = inventory.filter({ subset: key });
    assert.deepEqual(controls.geometry, expectedPartsGeometry(model, expected.groups), label);
    assert.equal(controls.node("#parts-count").textContent,
      `${expected.uniqueCount} unique parts (${expected.occurrences.length} total)`);
    const weight = expected.occurrences.reduce((sum, { location }) => sum + model.estimateNodeWeightLb(location.id), 0);
    assert.equal(controls.node("#parts-weight").textContent, `Weight ~${Math.round(weight)} lb (wood only)`);
    assert.equal(controls.node("#parts-visibility-summary").textContent,
      key ? `Showing all modules, ${label.toLocaleLowerCase()}` : "Show all parts");
    assert.equal(search.value, "no such part");
    assert.equal(controls.node("#parts-find-status").textContent, "No matches");
    assert.deepEqual(controls.mainViewer.getCameraMatrices(), camera);
  }
});

test("Clear filters restores all Parts while preserving Find, selection, and disclosure state", () => {
  const model = buildStairway(), inventory = new PartInventory(model.partTree);
  const controls = createControls({ buildModel: () => model });
  const module = controls.node("#parts-module"), type = controls.node("#parts-type");
  const subset = controls.node("#parts-subset");
  const search = controls.node("#parts-search"), section = controls.node("#parts-visibility");
  const hardware = inventory.sections.find(stock => stock.kind === "hardware");
  section.open = true;
  module.value = "2";
  module.dispatch("change");
  type.value = hardware.key;
  type.dispatch("change");
  subset.value = "without-cladding";
  subset.dispatch("change");
  search.value = "caster";
  search.dispatch("input");
  const selectedKey = hardware.entries[0].key;
  assert.deepEqual(controls.geometry,
    expectedPartsGeometry(model, inventory.filter({ moduleNumber: 2, stockKey: hardware.key }).groups, selectedKey));
  controls.node("#parts-results").scrollTop = 100;
  controls.node("#parts-clear-filters").dispatch("click");
  assert.equal(module.value, "");
  assert.equal(type.value, "");
  assert.equal(subset.value, "");
  assert.equal(search.value, "caster");
  assert.equal(section.open, true);
  assert.equal(controls.node("#parts-results").scrollTop, 0);
  assert.equal(controls.node("#parts-visibility-summary").textContent, "Show all parts");
  assert.equal(controls.node("#parts-count").textContent,
    `${inventory.entries.length} unique parts (${inventory.quantity} total)`);
  assert.equal(controls.node("#parts-weight").textContent,
    `Weight ~${Math.round(model.estimatedWeightLb)} lb (wood only)`);
  assert.deepEqual(controls.geometry, expectedPartsGeometry(model, inventory.filter().groups, selectedKey));
  assert.ok(controls.node("#parts-groups").children.some(row => row.getAttribute("aria-selected") === "true"));
  assert.ok(controls.calls.every(([name]) => name !== "reset"));
  controls.node("#parts-clear-filters").dispatch("click");
  assert.deepEqual(controls.geometry, expectedPartsGeometry(model, inventory.filter().groups, selectedKey));
});

test("Parts Find locates whole unique-part rows, wraps matches, and never narrows list or quantities", () => {
  const model = buildStairway(), inventory = new PartInventory(model.partTree);
  const controls = createControls({ buildModel: () => model });
  controls.node("#stairway-tab").dispatch("click");
  const list = controls.node("#parts-groups"), search = controls.node("#parts-search");
  const rows = [...list.children], groups = inventory.filter().groups;
  const count = controls.node("#parts-count").textContent, weight = controls.node("#parts-weight").textContent;
  const shared = groups.find(group => ["Spindle - front", "Spindle - rear"]
    .every(name => group.entry.roles.some(role => role.label === name)));
  assert.equal(shared.locations.length, 11);
  const spindleRow = rows[groups.indexOf(shared)];
  for (const query of ["spindle", " FRONT "]) {
    search.focus();
    search.value = query;
    search.dispatch("input");
    assert.equal(controls.activeElement, search);
    assert.deepEqual(list.children, rows);
    assert.equal(controls.node("#parts-count").textContent, count);
    assert.equal(controls.node("#parts-weight").textContent, weight);
    assert.equal(spindleRow.getAttribute("data-find-match"), "true");
    assert.equal(spindleRow.children[0].textContent, "Spindle x 11");
    spindleRow.dispatch("click");
    assert.deepEqual(controls.geometry, expectedPartsGeometry(model, groups, shared.entry.key));
  }
  search.value = "front";
  search.dispatch("input");
  const matches = list.children.filter(row => row.getAttribute("data-find-match") === "true");
  assert.ok(matches.length > 1);
  assert.equal(matches[0].getAttribute("aria-selected"), "true");
  assert.ok(matches[0].scrollOptions);
  controls.node("#parts-find-next").dispatch("click");
  assert.equal(matches[1].getAttribute("aria-selected"), "true");
  controls.node("#parts-find-previous").dispatch("click");
  assert.equal(matches[0].getAttribute("aria-selected"), "true");
  search.dispatch("keydown", { key: "Enter", shiftKey: true, preventDefault() {} });
  assert.equal(matches.at(-1).getAttribute("aria-selected"), "true");
  search.dispatch("keydown", { key: "Enter", preventDefault() {} });
  assert.equal(matches[0].getAttribute("aria-selected"), "true");
  assert.equal(controls.node("#parts-find-status").textContent, `1 of ${matches.length} matches`);
  const geometry = controls.geometry;
  for (const query of ["no such part", ""]) {
    search.value = query;
    search.dispatch("input");
    assert.deepEqual(list.children, rows);
    assert.deepEqual(controls.geometry, geometry);
    assert.equal(matches[0].getAttribute("aria-selected"), "true");
    assert.ok(controls.node("#parts-find-next").disabled);
    assert.ok(controls.node("#parts-find-previous").disabled);
    assert.equal(controls.node("#parts-find-status").textContent, query ? "No matches" : "");
  }
});

test("Parts row titles show scoped steps and visible quantities out of the whole stairway", () => {
  const model = buildStairway(), inventory = new PartInventory(model.partTree);
  const controls = createControls({ buildModel: () => model });
  const module = controls.node("#parts-module"), list = controls.node("#parts-groups");
  module.value = "1";
  module.dispatch("change");
  assert.ok(list.children.some(row => row.children[0].textContent === "Tread (step 3) x 1 (of 3)"));
  let single;
  for (const moduleNumber of [1, 2, 3]) {
    single = inventory.filter({ moduleNumber }).groups
      .find(group => group.locations.length === 1 && group.entry.quantity > 1);
    if (!single) continue;
    module.value = String(moduleNumber);
    module.dispatch("change");
    assert.ok(list.children.some(row =>
      row.children[0].textContent === `${single.title} x 1 (of ${single.entry.quantity})`));
    break;
  }
  assert.ok(single, "Expected a filtered part with one visible occurrence out of multiple identical pieces");
});

test("Home restores URL parameters, filters, visibility, tab, and exact selection on popstate", () => {
  const controls = createControls();
  controls.node("#stairway-tab").dispatch("click");
  const module = controls.node("#parts-module"), search = controls.node("#parts-search");
  const subset = controls.node("#parts-subset");
  subset.value = "treads-risers";
  subset.dispatch("change");
  module.value = "3";
  module.dispatch("change");
  search.value = "tread";
  search.dispatch("input");
  const part = controls.url.searchParams.get("part");
  controls.restoreURL(`?width=28&module=3&subset=treads-risers&part=${encodeURIComponent(part)}`);
  assert.equal(module.value, "3");
  assert.equal(subset.value, "treads-risers");
  assert.equal(search.value, "tread");
  assert.ok(controls.node("#parts-groups").getAttribute("aria-activedescendant"));
  controls.restoreURL(`?width=28&modules=2&module=3&subset=treads-risers&part=${encodeURIComponent(part)}`);
  assert.equal(module.children.length, 3);
  assert.equal(module.value, "");
  assert.equal(subset.value, "treads-risers");
  assert.equal(search.value, "tread");
  assert.equal(controls.node("#parts-groups").getAttribute("aria-activedescendant"), "");
  assert.equal(controls.url.searchParams.has("module"), false);
  assert.equal(controls.url.searchParams.has("part"), false);
  assert.match(controls.node("#parameter-notice").textContent, /Module filter.*Selected part/);
  controls.restoreURL("?width=28&tab=placement&parts=hidden");
  assert.equal(subset.value, "");
  assert.equal(controls.node("#parts-sidebar").hidden, true);
  assert.equal(controls.node("#placement-tab").getAttribute("aria-selected"), "true");
  assert.equal(controls.node("#part-details-empty").hidden, false);
  assert.equal(controls.node("#parameter-notice").hidden, true);
});

test("viewer URLs hydrate all tabs, Parts visibility, filters, and an exact installed occurrence", () => {
  const model = buildStairway(30, 8, 2, 35), inventory = new PartInventory(model.partTree);
  const id = "stairway/module-2/step-5-rightUpright", entry = inventory.findOccurrence(id);
  assert.ok(entry);
  for (const tab of ["stairway", "details", "placement"]) {
    const query = new URLSearchParams({
      width: "30", steps: "8", modules: "2", shoulderAscent: "35",
      tab, parts: "hidden", module: "2", subset: "framing", type: entry.stockKey, part: id,
    });
    const controls = createControls({ search: `?${query}`, buildModel: () => model });
    assert.equal(controls.node(`#${tab}-tab`).getAttribute("aria-selected"), "true");
    assert.equal(controls.node("#parts-sidebar").hidden, true);
    assert.equal(controls.node(".workspace").getAttribute("data-parts-collapsed"), "true");
    assert.equal(controls.node("#toggle-parts").textContent, "Show parts");
    assert.equal(controls.node("#parts-module").value, "2");
    assert.equal(controls.node("#parts-subset").value, "framing");
    assert.equal(controls.node("#parts-type").value, entry.stockKey);
    const selected = controls.node("#parts-groups").children.find(row => row.getAttribute("aria-selected") === "true");
    assert.ok(selected.children[0].textContent.startsWith(entry.title));
    assert.equal(controls.url.searchParams.get("part"), id);
    assert.equal(controls.node("#part-details").hidden, tab === "stairway");
    if (tab === "placement") assert.equal(controls.node("#placement-instance").value, id);
    assert.equal(controls.node("#parameter-notice").hidden, true);
    assert.equal(new URL(controls.node("#page-link").href).search, controls.url.search);
    const visible = inventory.filter({ moduleNumber: 2, subset: "framing", stockKey: entry.stockKey });
    const ids = new Set(visible.occurrences.map(({ location }) => location.id));
    assert.deepEqual(controls.geometry.positions, combineGeometries(model.partTree.getLeaves()
      .filter(node => ids.has(node.id)).map(node => model.createNodeGeometry(node.id))).positions);
  }
});

test("viewer controls replace the current URL for tabs, Parts visibility, filters, and selection", () => {
  const controls = createControls();
  const change = (selector, event, value) => {
    const before = controls.historyReplacements.length, node = controls.node(selector);
    if (value !== undefined) node.value = value;
    node.dispatch(event);
    assert.equal(controls.historyReplacements.length, before + 1);
  };
  change("#parts-module", "change", "2");
  change("#parts-subset", "change", "framing");
  const type = controls.node("#parts-type").children.find(option => option.value).value;
  change("#parts-type", "change", type);
  assert.equal(controls.url.searchParams.get("module"), "2");
  assert.equal(controls.url.searchParams.get("subset"), "framing");
  assert.equal(controls.url.searchParams.get("type"), type);
  const row = controls.node("#parts-groups").children[0], before = controls.historyReplacements.length;
  row.dispatch("click");
  assert.equal(controls.historyReplacements.length, before + 1);
  assert.match(controls.url.searchParams.get("part"), /^stairway\/module-2\//);
  change("#details-tab", "click");
  assert.equal(controls.url.searchParams.get("tab"), "details");
  change("#toggle-parts", "click");
  assert.equal(controls.url.searchParams.get("parts"), "hidden");
  change("#toggle-parts", "click");
  assert.equal(controls.url.searchParams.has("parts"), false);
  change("#parts-clear-filters", "click");
  for (const key of ["module", "subset", "type"]) assert.equal(controls.url.searchParams.has(key), false);
  change("#placement-tab", "click");
  const instance = controls.node("#placement-instance"), next = instance.children.find(option => option.value !== instance.value);
  assert.ok(next);
  change("#placement-instance", "change", next.value);
  assert.equal(controls.url.searchParams.get("part"), next.value);
  change("#stairway-tab", "click");
  assert.equal(controls.url.searchParams.has("tab"), false);
  assert.equal(new URL(controls.node("#page-link").href).search, controls.url.search);
});

test("invalid, duplicate, and filtered-out viewer URL settings show notices and normalize safely", () => {
  const invalid = createControls({ search: "?width=invalid&tab=details&tab=placement&parts=maybe&module=9" +
    "&subset=unknown&type=unknown&part=missing&other=keep#view" });
  assert.equal(invalid.node("#stairway-tab").getAttribute("aria-selected"), "true");
  assert.equal(invalid.node("#parts-sidebar").hidden, false);
  for (const selector of ["#parts-module", "#parts-subset", "#parts-type"]) assert.equal(invalid.node(selector).value, "");
  for (const label of ["Stair width", "Selected tab", "Parts visibility", "Module filter", "Subset filter", "Type filter", "Selected part"]) {
    assert.ok(invalid.node("#parameter-notice").textContent.includes(label));
  }
  for (const key of ["tab", "parts", "module", "subset", "type", "part"]) assert.equal(invalid.url.searchParams.has(key), false);
  assert.equal(invalid.url.searchParams.get("other"), "keep");
  assert.equal(invalid.url.hash, "#view");
  const filtered = createControls({ search: "?tab=details&module=1&part=stairway%2Fmodule-2%2Fstep-5-rightUpright" });
  assert.equal(filtered.node("#parts-groups").getAttribute("aria-activedescendant"), "");
  assert.equal(filtered.node("#part-details-empty").hidden, false);
  assert.equal(filtered.url.searchParams.has("part"), false);
  assert.match(filtered.node("#parameter-notice").textContent, /Selected part/);
  const duplicate = createControls({ search: "?module=1&module=2&subset=framing&subset=banister&parts=hidden&parts=shown&part=a&part=b" });
  for (const key of ["module", "subset", "parts", "part"]) assert.equal(duplicate.url.searchParams.has(key), false);
  assert.equal(duplicate.node("#parameter-notice").hidden, false);
});

test("Parameters links, slider edits, and Reset defaults retain Home viewer URL settings", () => {
  const state = { tab: "placement", parts: "hidden", module: "2", subset: "framing",
    type: "a stock type", part: "stairway/module-2/step-5-rightUpright", castle: "shown" };
  const controls = createControls({ page: "parameters", search: `?${new URLSearchParams(state)}` });
  for (const action of [
    () => { const slider = controls.node("#stair-width"); slider.valueAsNumber = 30; slider.dispatch("input"); },
    () => controls.node("#reset-defaults").dispatch("click"),
  ]) {
    action();
    const home = new URL(controls.node("#page-link").href);
    assert.equal(home.pathname, "/index.html");
    for (const [key, value] of Object.entries(state)) {
      assert.equal(controls.url.searchParams.get(key), value);
      assert.equal(home.searchParams.get(key), value);
    }
  }
});

test("Details omits duplicate locations and preserves Parts selection and filters across tab switches", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /part-details-locations|part-details-location-list|part-details-path/);
  assert.doesNotMatch(html, /<dialog|show-part-details|close-part-details/);
  assert.match(html, /Select a part from the Parts list\./);
  const controls = createControls();
  controls.node("#stairway-tab").dispatch("click");
  const module = controls.node("#parts-module"), search = controls.node("#parts-search");
  const subset = controls.node("#parts-subset");
  module.value = "1";
  module.dispatch("change");
  subset.value = "foundation";
  subset.dispatch("change");
  search.value = "swivel";
  search.dispatch("input");
  const list = controls.node("#parts-groups"), details = controls.node("#details-tab");
  const selected = list.children.find(item => item.getAttribute("aria-selected") === "true");
  const context = selected.children[1].textContent;
  for (let iteration = 0; iteration < 2; iteration++) {
    details.dispatch("click");
    assert.equal(!controls.node("#part-details").hidden, true);
    assert.equal(controls.node("#part-details-heading").textContent,
      selected.children[0].textContent.replace(/ x \d+.*$/, ""));
    controls.node("#stairway-tab").dispatch("click");
    assert.equal(!controls.node("#part-details").hidden, false);
    assert.equal(module.value, "1");
    assert.equal(subset.value, "foundation");
    assert.equal(search.value, "swivel");
    assert.equal(selected.getAttribute("aria-selected"), "true");
    assert.equal(selected.children[1].textContent, context);
  }
});

test("Details uses unique inventory names rather than installed occurrence qualifiers", () => {
  const model = buildStairway(), inventory = new PartInventory(model.partTree);
  const controls = createControls({ buildModel: () => model });
  controls.node("#stairway-tab").dispatch("click");
  const items = controls.node("#parts-groups").children;
  for (const prefix of ["Spindle", "Attachment block - rear support", "Upright - front left"]) {
    const entry = inventory.entries.find(entry => entry.title === prefix || entry.title.startsWith(`${prefix} (`));
    assert.ok(entry, `Missing unique part: ${prefix}`);
    const item = items.find(item => item.children[0].textContent ===
      entry.title + (entry.quantity > 1 ? ` x ${entry.quantity}` : ""));
    assert.ok(item);
    item.dispatch("click");
    controls.node("#details-tab").dispatch("click");
    assert.equal(controls.node("#part-details-heading").textContent, entry.title);
    assert.equal(controls.node("#part-view-preview").getAttribute("aria-label"),
      `Rotatable 3D preview of ${entry.title}`);
    controls.node("#stairway-tab").dispatch("click");
  }
});

test("part thumbnails mark annotated views and Details captions describe the selected view", () => {
  const model = buildStairway();
  const controls = createControls({ buildModel: () => model });
  controls.node("#stairway-tab").dispatch("click");
  const items = controls.node("#parts-groups").children;
  const open = title => {
    const item = items.find(item => item.children[0].textContent.startsWith(title));
    assert.ok(item, `Missing inventory item: ${title}`);
    item.dispatch("click");
    controls.node("#details-tab").dispatch("click");
  };
  const check = id => {
    const node = model.partTree.getNode(id);
    const views = model.partTree.getStockViews(node.id);
    const description = node.getDescription();
    const markers = views.map(view => getPartFeatures(description, view, views).some(feature =>
      feature.lines.length || feature.dimensions.length || feature.angles.length));
    for (const [index, view] of views.entries()) {
      const id = `#part-view-choice-${view.name.toLowerCase()}`;
      const label = ({ Up: "Top", Down: "Bottom" }[view.name] ?? view.name);
      assert.equal(controls.node(`${id} span`).textContent,
        `${label}${markers[index] ? "\u25c6" : ""}`);
      assert.equal(controls.node(id).getAttribute("aria-label"),
        `${label} ${view.surface}${markers[index] ? ", measurements in this view" : ""}`);
      assert.equal(controls.node(id).getAttribute("title"), markers[index] ? "Measurements in this view" :
        `${label} ${view.surface}`);
      if (markers[index]) {
        const marker = controls.node(`${id} span`).children[0];
        assert.equal(marker.className, "part-view-marker");
        assert.equal(marker.getAttribute("aria-hidden"), "true");
        assert.equal(marker.getAttribute("title"), "Measurements in this view");
      }
      controls.node(id).dispatch("click");
      const direction = ["top", "bottom", "left", "right", "front", "back"][index];
      const caption = `View from ${direction}, showing ${label.toLowerCase()} ${view.surface}`;
      assert.equal(controls.node("#part-view-selected-name").textContent, caption);
      assert.equal(controls.node("#part-view-selected").getAttribute("aria-label"), `${caption} of selected part`);
    }
    return markers;
  };
  open("Newel post");
  const marked = check("stairway/module-1/step-1-newel");
  assert.ok(marked.some(Boolean));
  controls.node("#stairway-tab").dispatch("click");
  open("Newel block - rear");
  const unmarked = check("stairway/module-1/step-1-newelRearBlock");
  assert.ok(unmarked.every(value => !value));
  assert.match(controls.node("#part-view-drawing").style.minWidth, /px$/);
  controls.node("#stairway-tab").dispatch("click");
  open("Newel block - inner");
  assert.deepEqual(check("stairway/module-1/step-1-newelInnerBlock"),
    [true, true, false, false, false, false]);
  controls.node("#part-view-choice-back").dispatch("click");
  assert.doesNotMatch(controls.node("#part-view-annotations").textContent, /B1|Bevel: see/);
  assert.equal(controls.node("#part-view-annotations").getAttribute("font-size"), "9");
  controls.node("#placement-tab").dispatch("click");
  assert.equal(controls.node("#part-view-annotations").getAttribute("font-size"), "12");
  for (const name of PART_VIEW_NAMES) {
    const id = `#part-view-choice-${name.toLowerCase()}`;
    assert.equal(controls.node(`${id} span`).textContent, partViewLabel(name));
    assert.equal(controls.node(id).getAttribute("title"), `${partViewLabel(name)} placement`);
  }
  controls.node("#stairway-tab").dispatch("click");
  open("CWfutureparts");
  assert.equal(controls.node("#part-view-drawing").style.minWidth, "0");
  assert.equal(controls.node("#part-view-drawing").style.minHeight, "0");
});

test("arc-cut base rails show construction dimensions and a radius arrow through the blank in Details", () => {
  const model = buildStairway(), controls = createControls({ buildModel: () => model });
  controls.node("#part-view-selected").clientHeight = 1200;
  controls.node("#part-view-annotations").clientHeight = 1200;
  controls.node("#stairway-tab").dispatch("click");
  const item = controls.node("#parts-groups").children.find(item =>
    item.children[0].textContent.startsWith("Base rail - outer"));
  assert.ok(item);
  item.dispatch("click");
  controls.node("#details-tab").dispatch("click");
  assert.match(controls.node("#part-description").textContent, /flat outline; arc radius/);
  const svg = controls.node("#part-view-annotations");
  const groups = [...svg.children].filter(node => node.getAttribute("class")?.includes("part-feature-arc"));
  assert.equal(groups.length, 1);
  const overall = [...svg.children].filter(node => node.getAttribute("class") === "part-blank-dimension");
  assert.deepEqual(overall.map(node => node.getAttribute("data-side")), ["top", "left"]);
  const chains = [...svg.children].filter(node => node.getAttribute("class") === "part-profile-chain");
  assert.deepEqual(chains, []);
  const drawing = controls.partViewers.find(viewer => viewer.canvas.id === "part-view-selected");
  const arc = getPartFeatures(model.modules[0].boards.outerBaseRail.getManufacturingDescription(),
    STANDARD_VIEWS.find(view => view.direction[1] === 1)).find(feature => feature.kind === "arc" && !feature.radiusTo);
  const radius = [...svg.children].find(node => node.getAttribute("class") === "part-radius-reference" &&
    node.getAttribute("data-feature-id") === arc.id);
  assert.ok(radius);
  assert.equal(radius.getAttribute("stroke-dasharray"), "1 4");
  assert.equal(radius.getAttribute("marker-end"), "url(#part-dimension-arrow)");
  assert.equal(groups[0].children.filter(node => node.name === "polyline").length, 0,
    "The radius label has no separate callout leader.");
  const anchor = drawing.projectPoint(arc.point), center = drawing.projectPoint(arc.radiusCenter);
  const start = ["x1", "y1"].map(name => Number(radius.getAttribute(name)));
  const end = ["x2", "y2"].map(name => Number(radius.getAttribute(name)));
  const callout = groups.find(node => node.getAttribute("data-feature-id") === arc.id)
    .children.find(node => node.getAttribute("class") === "part-feature-callout");
  const centerShown = Math.hypot(end[0] - center.x, end[1] - center.y) < 0.001;
  assert.equal(callout.children.find(node => node.name === "text").children[0].textContent, centerShown ? "C" : "To C");
  const labelPosition = callout.getAttribute("transform").match(/translate\(([^ ]+) ([^)]+)\)/).slice(1).map(Number);
  close(Math.abs(labelPosition[0] - end[0]), 8);
  assert.ok(Math.abs(labelPosition[1] - end[1] - 3) <= 39);
  close(end[1], Math.max(48, center.y), 0.001);
  assert.equal(radius.getAttribute("data-center"), "C");
  close(start[0], anchor.x);
  close(start[1], anchor.y);
  const dx = end[0] - start[0], dy = end[1] - start[1];
  assert.ok(dx * (center.x - anchor.x) + dy * (center.y - anchor.y) > 0);
  close(dx * (center.y - anchor.y) - dy * (center.x - anchor.x), 0);
  const rib = model.modules[0].boards.outerBaseRail;
  const edgeGuides = [...svg.children].filter(node =>
    node.getAttribute("class")?.includes("part-radius-edge-reference"));
  assert.equal(edgeGuides.length, arc.radialGuides.length);
  assert.deepEqual(edgeGuides.map(guide => [guide.getAttribute("data-cut-side"), Number(guide.getAttribute("data-cut-inset"))]),
    [["left", rib.construction.trapezoid.left.inset], ["right", 0]]);
  const edgeLabels = svg.children.filter(node => node.getAttribute("class") === "part-feature-note part-feature-radius-edge");
  assert.equal(edgeLabels.length, edgeGuides.length);
  for (const note of edgeLabels) {
    const label = note.children.find(node => node.getAttribute("class") === "part-feature-callout")
      .children.find(node => node.name === "text");
    assert.equal(label.children[0].textContent, centerShown ? "C" : "To C");
  }
  const mask = svg.children.find(node => node.name === "defs").children.find(node =>
    node.getAttribute("id") === "part-radius-text-mask");
  assert.ok(mask);
  const corner = svg.children.find(node => node.getAttribute("class") === "part-feature-note part-feature-corner-cut" &&
    node.getAttribute("data-feature-id") === "C2").children.find(node =>
    node.getAttribute("class") === "part-feature-callout").children.find(node => node.name === "text");
  const cornerBox = corner.getBoundingClientRect();
  assert.ok(mask.children.some(node => node.getAttribute("fill") === "black" &&
    Number(node.getAttribute("x")) <= cornerBox.left && Number(node.getAttribute("y")) <= cornerBox.top &&
    Number(node.getAttribute("x")) + Number(node.getAttribute("width")) >= cornerBox.right &&
    Number(node.getAttribute("y")) + Number(node.getAttribute("height")) >= cornerBox.bottom),
  "Radius guides break behind corner-cut text instead of crossing its glyphs.");
  for (const guide of edgeGuides) {
    const [x1, y1, x2, y2] = ["x1", "y1", "x2", "y2"].map(name => Number(guide.getAttribute(name)));
    close(y2, end[1], 0.001);
    close((x2 - x1) * (center.y - y1) - (y2 - y1) * (center.x - x1), 0);
    assert.ok((x2 - x1) * (center.x - x1) + (y2 - y1) * (center.y - y1) > 0);
    assert.equal(guide.getAttribute("stroke-dasharray"), "1 4");
    assert.equal(guide.getAttribute("marker-end"), "url(#part-dimension-arrow)");
    assert.equal(guide.getAttribute("data-center"), "C");
    assert.equal(guide.getAttribute("mask"), "url(#part-radius-text-mask)");
  }
  const top = drawing.projectPoint([arc.point[0], rib.thickness, 0]);
  assert.ok(end[1] < top.y - 20, "Radius arrow continues above the original blank.");
  assert.ok(Math.hypot(dx, dy) <= Math.hypot(center.x - anchor.x, center.y - anchor.y) + 0.001,
    "The radius arrow must not extend past its center.");
  const dimensions = [...svg.children].filter(node => node.getAttribute("class") === "part-feature-dimension");
  assert.equal(dimensions.length, 0, "Construction callouts replace all piecewise and locating dimensions.");
  const blank = [...svg.children].find(node => node.getAttribute("class") === "part-feature-outline" &&
    node.getAttribute("data-feature-id") === "B1");
  assert.equal(blank.getAttribute("stroke-dasharray"), "1 4");
  assert.equal([...svg.children].filter(node => node.getAttribute("class")?.includes("part-feature-rectangular-notch")).length,
    rib.construction.notches.length + rib.construction.openings.length);
  assert.deepEqual(drawing.geometry.positions, rib.createStockGeometry().positions);
  const stage = controls.node("#part-view-stage");
  stage.clientWidth = 600;
  stage.clientHeight = 119;
  controls.resize();
  const transform = controls.node("#part-view-drawing").style.transform;
  assert.equal(Number(transform.match(/scale\(([^)]+)\)/)[1]), 1);
  stage.dispatch("keydown", { key: "ArrowRight", preventDefault() {} });
  assert.notEqual(controls.node("#part-view-drawing").style.transform, transform);
  stage.dispatch("keydown", { key: "Home", preventDefault() {} });
  assert.equal(controls.node("#part-view-drawing").style.transform, transform);
  controls.node("#placement-tab").dispatch("click");
  assert.ok(drawing.geometry.indices.length);
});

test("curved plywood Details keeps all stock views flat and its independent preview bent", () => {
  const model = buildStairway(), controls = createControls({ buildModel: () => model });
  const panel = model.partTree.getLeaves().find(node => node.part.bend);
  controls.node("#stairway-tab").dispatch("click");
  const item = controls.node("#parts-groups").children.find(item =>
    item.children[0].textContent.startsWith("Side panel - curved"));
  assert.ok(item);
  item.dispatch("click");
  controls.node("#details-tab").dispatch("click");
  assert.match(controls.node("#part-description").textContent, /inner radius.*flat cutting pattern/);
  const drawing = controls.partViewers.find(viewer => viewer.canvas.id === "part-view-selected");
  const preview = controls.partViewers.find(viewer => viewer.canvas.id === "part-view-preview");
  const stock = panel.part.createStockGeometry(), installed = panel.part.createGeometry();
  for (const name of PART_VIEW_NAMES) {
    controls.node(`#part-view-choice-${name.toLowerCase()}`).dispatch("click");
    assert.deepEqual(drawing.geometry.positions, stock.positions);
    assert.deepEqual(drawing.geometry.indices, stock.indices);
    assert.deepEqual(preview.geometry.positions, installed.positions);
  }
  assert.ok(installed.indices.length > stock.indices.length);
  assert.equal(controls.node("#part-view-sidebar").hidden, false);
  controls.node("#placement-tab").dispatch("click");
  assert.ok(drawing.geometry.indices.length >= installed.indices.length);
  assert.match(controls.node("#placement-view-metadata").textContent, /installed shape|flat cutting pattern/);
});

test("the reusable part preview rotates independently and survives view, size, and part changes", () => {
  const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");
  assert.match(css, /\.part-view-sidebar\s*\{[^}]*grid-auto-rows:\s*max-content/);
  const model = buildStairway();
  const controls = createControls({ buildModel: () => model });
  controls.node("#stairway-tab").dispatch("click");
  const items = controls.node("#parts-groups").children;
  const open = title => {
    if (!controls.node("#part-details").hidden) controls.node("#stairway-tab").dispatch("click");
    const item = items.find(item => item.children[0].textContent.startsWith(title));
    assert.ok(item, `Missing inventory item: ${title}`);
    item.dispatch("click");
    controls.node("#details-tab").dispatch("click");
  };
  const camera = viewer => [...viewer.orientation.flat(), viewer.zoomFactor, ...viewer.panOffset, viewer.standardView?.name];
  controls.canvas.dispatch("keydown", { key: "ArrowLeft", preventDefault() {} });
  const mainCamera = camera(controls.mainViewer);
  open("Attachment block - rear support");
  const preview = controls.partViewers.find(viewer => viewer.canvas.id === "part-view-preview");
  const drawing = controls.partViewers.find(viewer => viewer.canvas.id === "part-view-selected");
  const canvas = preview.canvas, initial = camera(preview.stockViewer);
  const drawingCamera = camera(drawing.stockViewer);
  assert.equal(controls.partViewers.length, 8);
  assert.equal(controls.node("#part-view-sidebar").hidden, false);
  assert.ok(controls.observedCanvases.includes(canvas));
  assert.equal(preview.standardView, null);
  assert.match(canvas.getAttribute("aria-label"), /Attachment block - rear support/);
  function pointer(name, pointerId, x, y) {
    canvas.dispatch(name, { pointerId, clientX: x, clientY: y, pointerType: "touch" });
  }
  pointer("pointerdown", 1, 100, 100);
  pointer("pointermove", 1, 130, 115);
  pointer("pointerup", 1, 130, 115);
  assert.notDeepEqual(camera(preview.stockViewer), initial);
  assert.deepEqual(camera(drawing.stockViewer), drawingCamera);
  assert.deepEqual(camera(controls.mainViewer), mainCamera);
  let previous = camera(preview.stockViewer);
  for (const event of [
    { key: "ArrowRight" }, { key: "ArrowDown", shiftKey: true }, { key: "+" },
  ]) {
    canvas.dispatch("keydown", { ...event, preventDefault() {} });
    assert.notDeepEqual(camera(preview.stockViewer), previous);
    previous = camera(preview.stockViewer);
  }
  canvas.dispatch("wheel", { deltaY: 100, deltaMode: 0, preventDefault() {} });
  assert.notDeepEqual(camera(preview.stockViewer), previous);
  pointer("pointerdown", 1, 100, 100);
  pointer("pointerdown", 2, 200, 100);
  const beforePinch = preview.stockViewer.zoomFactor;
  pointer("pointermove", 2, 240, 120);
  assert.notEqual(preview.stockViewer.zoomFactor, beforePinch);
  assert.ok(controls.calls.some(([name, angle]) => name === "roll" && angle > 0));
  pointer("pointercancel", 1, 100, 100);
  pointer("pointercancel", 2, 240, 120);
  const rotated = camera(preview.stockViewer), renderRequests = preview.renderRequests ?? 0;
  controls.node("#part-view-choice-left").dispatch("click");
  controls.resize();
  assert.deepEqual(camera(preview.stockViewer), rotated);
  assert.ok(preview.renderRequests > renderRequests);
  const leftCamera = camera(drawing.stockViewer);
  controls.node("#stairway-tab").dispatch("click");
  controls.node("#details-tab").dispatch("click");
  assert.deepEqual(camera(preview.stockViewer), rotated);
  assert.deepEqual(camera(drawing.stockViewer), leftCamera);
  controls.node("#reset-part-preview").dispatch("click");
  assert.deepEqual(camera(preview.stockViewer), initial);
  assert.deepEqual(camera(drawing.stockViewer), leftCamera);
  canvas.dispatch("keydown", { key: "ArrowRight", preventDefault() {} });
  canvas.dispatch("keydown", { key: "Home", preventDefault() {} });
  assert.deepEqual(camera(preview.stockViewer), initial);
  const oldGeometry = preview.geometry;
  open("Newel post");
  assert.notEqual(preview.geometry, oldGeometry);
  assert.deepEqual(camera(preview.stockViewer), initial);
  assert.equal(controls.partViewers.length, 8);
  assert.equal(controls.node("#part-view-choice-left").getAttribute("aria-pressed"), "true");
  open("Riser");
  assert.equal(controls.node("#part-views").hidden, true);
  assert.equal(controls.node("#part-view-sidebar").hidden, false);
  open("CWfutureparts");
  assert.equal(controls.node("#part-view-sidebar").hidden, true);
  const hardwareCamera = camera(drawing.stockViewer);
  canvas.dispatch("keydown", { key: "ArrowRight", preventDefault() {} });
  assert.deepEqual(camera(drawing.stockViewer), hardwareCamera);
  assert.deepEqual(camera(preview.stockViewer), initial);
  open("Attachment block - rear support");
  assert.equal(controls.partViewers.length, 8);
  assert.equal(controls.node("#part-view-sidebar").hidden, false);
  assert.equal(controls.node("#part-view-choice-left").getAttribute("aria-pressed"), "true");
  assert.deepEqual(camera(controls.mainViewer), mainCamera);
  controls.node("#stairway-tab").dispatch("click");
  canvas.dispatch("keydown", { key: "ArrowRight", preventDefault() {} });
  assert.deepEqual(camera(preview.stockViewer), initial);
});

test("loss of the preview WebGL context reports a visible Details error", () => {
  const controls = createControls({ failOnError: false });
  controls.node("#stairway-tab").dispatch("click");
  controls.node("#parts-groups").children[0].dispatch("click");
  controls.node("#details-tab").dispatch("click");
  controls.node("#part-view-preview").dispatch("webglcontextlost");
  assert.equal(controls.errors.length, 1);
  assert.equal(controls.node("#part-details-error").hidden, false);
  assert.match(controls.node("#part-details-error").textContent, /Reload the page to restore the part preview/);
  assert.equal(controls.node("#part-view-layout").hidden, true);
  controls.node("#stairway-tab").dispatch("click");
  controls.node("#details-tab").dispatch("click");
  assert.equal(controls.node("#part-details-error").hidden, false);
  assert.equal(controls.node("#part-view-layout").hidden, true);
});

test("Placement metadata is a collapsed caption disclosure, follows the view, and stays out of the drawing", () => {
  const model = buildStairway(), controls = createControls({ buildModel: () => model });
  const groups = new PartInventory(model.partTree).filter().groups;
  const index = groups.findIndex(group => group.locations.some(location =>
    location.id === "stairway/module-1/step-2-leftUpright"));
  controls.node("#parts-groups").children[index].dispatch("click");
  controls.node("#placement-tab").dispatch("click");
  const plan = new PlacementPlanner(model).plan(groups[index].locations[0].id);
  const toggle = controls.node("#placement-view-details-toggle"), metadata = controls.node("#placement-view-metadata");
  assert.equal(toggle.hidden, false);
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(metadata.hidden, true);
  toggle.dispatch("click");
  assert.equal(toggle.textContent, "Hide details");
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  for (const view of plan.views) {
    controls.node(`#part-view-choice-${view.name.toLowerCase()}`).dispatch("click");
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
    assert.equal(metadata.hidden, false);
    for (const note of [...view.notes, ...plan.unresolved]) assert.ok(metadata.textContent.includes(note), note);
    for (const dimension of view.dimensions) {
      assert.ok(metadata.textContent.includes(`${dimension.id}: ${dimension.label}`));
      assert.ok(metadata.textContent.includes(dimension.reference));
    }
    const texts = descendants(controls.node("#part-view-annotations")).filter(node => node.name === "text")
      .map(node => node.textContent);
    assert.ok(!texts.some(text => text.includes("Reference:") || view.notes.some(note => text === note)));
    assert.ok(!controls.node("#placement-status").textContent.includes("Construction intent"));
  }
  controls.node("#details-tab").dispatch("click");
  assert.equal(toggle.hidden, true);
  assert.equal(metadata.hidden, true);
  controls.node("#placement-tab").dispatch("click");
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  assert.equal(metadata.hidden, false);
  toggle.dispatch("click");
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(metadata.hidden, true);
  controls.node("#details-tab").dispatch("click");
  assert.equal(toggle.hidden, true);
  assert.equal(metadata.hidden, true);
  controls.node("#parts-groups").children.find(item =>
    item.children[0].textContent.startsWith("CWfutureparts")).dispatch("click");
  assert.equal(controls.node("#part-view-compass").style.display, "none");
  controls.node("#placement-tab").dispatch("click");
  assert.equal(controls.node("#part-view-compass").style.display, "");
});

for (const tab of ["Details", "Placement"]) test(`${tab} pan and zoom transform the complete drawing without rotating or laying out callouts again`, () => {
  const controls = createControls();
  const item = controls.node("#parts-groups").children.find(item => item.children[0].textContent.startsWith("Spindle x"));
  item.dispatch("click");
  controls.node(`#${tab.toLowerCase()}-tab`).dispatch("click");
  const stage = controls.node("#part-view-stage"), drawing = controls.node("#part-view-drawing");
  const annotations = controls.node("#part-view-annotations");
  const children = [...annotations.children], viewBox = annotations.getAttribute("viewBox");
  const compass = controls.node("#part-view-compass"), compassChildren = [...compass.children];
  const directions = compass.getAttribute("aria-label");
  const viewer = controls.partViewers.find(viewer => viewer.canvas.id === "part-view-selected");
  const camera = viewer.stockViewer.getStandardViewMatrices();
  const initial = drawing.style.transform;
  controls.calls.length = 0;
  const pointer = (type, pointerId, x, y, extra = {}) => stage.dispatch(type, {
    pointerId, pointerType: "touch", clientX: x, clientY: y, ...extra,
  });
  pointer("pointerdown", 1, 100, 100);
  pointer("pointermove", 1, 140, 125);
  pointer("pointerup", 1, 140, 125);
  assert.notEqual(drawing.style.transform, initial);
  let previous = drawing.style.transform;
  for (const key of ["ArrowRight", "ArrowUp", "+", "-"]) {
    stage.dispatch("keydown", { key, preventDefault() {} });
    assert.notEqual(drawing.style.transform, previous);
    previous = drawing.style.transform;
  }
  let prevented = false;
  stage.dispatch("wheel", { deltaY: -200, deltaMode: 0, preventDefault() { prevented = true; } });
  assert.ok(prevented);
  assert.notEqual(drawing.style.transform, previous);
  previous = drawing.style.transform;
  pointer("pointerdown", 1, 100, 100);
  pointer("pointerdown", 2, 200, 100);
  pointer("pointermove", 2, 240, 110);
  pointer("pointercancel", 1, 100, 100);
  pointer("lostpointercapture", 2, 240, 110);
  assert.notEqual(drawing.style.transform, previous);
  previous = drawing.style.transform;
  pointer("pointermove", 2, 300, 150);
  pointer("pointerdown", 3, 100, 100, { pointerType: "mouse", button: 2 });
  pointer("pointermove", 3, 150, 100, { pointerType: "mouse", button: 2 });
  pointer("pointerup", 3, 150, 100);
  controls.resize();
  assert.equal(drawing.style.transform, previous);
  assert.deepEqual(annotations.children, children);
  assert.equal(annotations.getAttribute("viewBox"), viewBox);
  assert.deepEqual(compass.children, compassChildren);
  assert.equal(compass.getAttribute("aria-label"), directions);
  assert.deepEqual(viewer.stockViewer.getStandardViewMatrices(), camera);
  assert.deepEqual(controls.calls, []);
  stage.dispatch("keydown", { key: "Home", preventDefault() {} });
  assert.equal(drawing.style.transform, initial);
});

test("Details restores its default transform on part, view, and viewport changes", () => {
  const controls = createControls();
  const items = controls.node("#parts-groups").children;
  items.find(item => item.children[0].textContent.startsWith("Spindle x")).dispatch("click");
  controls.node("#details-tab").dispatch("click");
  const stage = controls.node("#part-view-stage"), drawing = controls.node("#part-view-drawing");
  const annotations = controls.node("#part-view-annotations");
  const initial = drawing.style.transform;
  const pan = () => stage.dispatch("keydown", { key: "ArrowLeft", preventDefault() {} });
  pan();
  controls.node("#stairway-tab").dispatch("click");
  const panned = drawing.style.transform;
  controls.node("#details-tab").dispatch("click");
  assert.equal(drawing.style.transform, panned);
  items.find(item => item.children[0].textContent.startsWith("Newel post")).dispatch("click");
  assert.equal(drawing.style.transform, initial);
  pan();
  controls.node("#part-view-choice-left").dispatch("click");
  assert.equal(drawing.style.transform, initial);
  pan();
  const oldAnnotations = annotations.children;
  stage.clientWidth += 100;
  controls.resize();
  assert.notEqual(annotations.children, oldAnnotations);
  const resized = drawing.style.transform;
  pan();
  stage.dispatch("keydown", { key: "Home", preventDefault() {} });
  assert.equal(drawing.style.transform, resized);
  items.find(item => item.children[0].textContent.startsWith("CWfutureparts")).dispatch("click");
  assert.equal(drawing.style.transform, resized);
  controls.calls.length = 0;
  pan();
  assert.notEqual(drawing.style.transform, resized);
  assert.deepEqual(controls.calls, []);
});

test("Parameters sliders rebuild the complete model and update the URL without resetting the view", () => {
  const models = [];
  const controls = createControls({ page: "parameters", buildModel(...args) {
    const model = buildStairway(...args);
    models.push(model);
    return model;
  } });
  const slider = controls.node("#spindle-shoulder-ascent");
  const output = controls.node('output[for="spindle-shoulder-ascent"]');
  assert.equal(models.at(-1).spindleShoulderAscent, 32);
  assert.equal(output.value, "32 in");
  assert.equal(slider.getAttribute("aria-valuetext"), "32 inches");
  for (const ascent of [25, 31, 37]) {
    slider.valueAsNumber = ascent;
    slider.dispatch("input");
    assert.equal(models.at(-1).spindleShoulderAscent, ascent);
    assert.equal(output.value, `${ascent} in`);
    assert.equal(slider.getAttribute("aria-valuetext"), `${ascent} inches`);
    assert.equal(controls.url.searchParams.get("shoulderAscent"), String(ascent));
    assert.deepEqual(controls.geometry, models.at(-1).createGeometry());
  }
  assert.ok(controls.calls.every(([name]) => name !== "reset"));
});

test("Parameters hydrates sliders, links, URL history, and Reset defaults together", () => {
  const models = [];
  const controls = createControls({ page: "parameters", search: "?width=30&steps=8&modules=2&shoulderAscent=35",
    buildModel(...args) {
      const model = buildStairway(...args);
      models.push(model);
      return model;
    },
  });
  assert.equal(controls.node("#stair-width").value, "30");
  const home = new URL(controls.node("#page-link").href);
  assert.equal(home.pathname, "/index.html");
  assert.equal(home.search, controls.url.search);
  controls.restoreURL("?width=28.25&steps=7&modules=3&shoulderAscent=26");
  assert.equal(controls.node("#stair-width").value, "28.25");
  assert.equal(controls.node("#stair-count").value, "7");
  assert.equal(models.at(-1).stairWidth, 28.25);
  controls.node("#reset-defaults").dispatch("click");
  assert.equal(controls.url.search, "?width=24&steps=9&modules=3&shoulderAscent=32");
  assert.equal(controls.node("#page-link").href, `http://localhost/index.html${controls.url.search}`);
  assert.equal(controls.node("#stair-width").value, "24");
  assert.equal(controls.node("#stair-count").value, "9");
  assert.equal(controls.node("#module-count").value, "3");
  assert.equal(controls.node("#spindle-shoulder-ascent").value, "32");
  assert.equal(models.at(-1).stairWidth, 24);
  assert.equal(models.at(-1).stepCount, 9);
  assert.equal(controls.node("#parameter-notice").hidden, true);
  assert.ok(controls.calls.every(([name]) => name !== "reset"));
});

test("Parts collapse preserves Details and selection while requesting updated rendering", () => {
  const controls = createControls();
  const list = controls.node("#parts-groups");
  list.children[0].dispatch("click");
  controls.node("#details-tab").dispatch("click");
  const selected = list.getAttribute("aria-activedescendant");
  const toggle = controls.node("#toggle-parts");
  for (const collapsed of [true, false]) {
    toggle.dispatch("click");
    assert.equal(controls.node("#parts-sidebar").hidden, collapsed);
    assert.equal(toggle.textContent, collapsed ? "Show parts" : "Hide parts");
    assert.equal(toggle.getAttribute("aria-expanded"), String(!collapsed));
    assert.equal(controls.node(".workspace").getAttribute("data-parts-collapsed"), String(collapsed));
    assert.equal(controls.node("#part-details").hidden, false);
    assert.equal(list.getAttribute("aria-activedescendant"), selected);
  }
});

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
  close(calls.filter(([name]) => name === "roll").reduce((sum, [, angle]) => sum + angle, 0), 0);
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

test("two-pointer movement combines midpoint pan, pinch zoom, and camera-depth twist", () => {
  const { canvas, calls, mainViewer } = createControls();
  const [right, up, back] = mainViewer.orientation;
  const pointer = (name, pointerId, x, y) =>
    canvas.dispatch(name, { pointerId, clientX: x, clientY: y, pointerType: "touch" });
  pointer("pointerdown", 1, 100, 100);
  pointer("pointerdown", 2, 200, 100);
  pointer("pointermove", 2, 100, 300);
  assert.deepEqual(calls.splice(0), [["pan", -50, 100], ["zoom", 0.5], ["roll", Math.PI / 2]]);
  mainViewer.orientation[0].forEach((value, axis) => close(value, up[axis]));
  mainViewer.orientation[1].forEach((value, axis) => close(value, -right[axis]));
  assert.deepEqual(mainViewer.orientation[2], back);
  assert.deepEqual(mainViewer.panOffset, [50, 100]);
  close(mainViewer.zoomFactor, 0.5);
});

test("two-pointer twist wraps angles and resets its baseline after coincident touches and pointer changes", () => {
  const { canvas, calls } = createControls();
  const pointer = (name, pointerId, x, y) =>
    canvas.dispatch(name, { pointerId, clientX: x, clientY: y, pointerType: "touch" });
  pointer("pointerdown", 1, 200, 200);
  pointer("pointerdown", 2, 100, 201);
  pointer("pointermove", 2, 100, 199);
  close(calls.find(([name]) => name === "roll")[1], 2 * Math.atan(0.01));
  calls.length = 0;
  pointer("pointermove", 2, 200, 200);
  pointer("pointermove", 2, 200, 300);
  assert.deepEqual(calls.splice(0), [["pan", 50, 0.5], ["pan", 0, 50]]);
  pointer("pointermove", 2, 100, 200);
  close(calls.find(([name]) => name === "roll")[1], Math.PI / 2);
  calls.length = 0;
  pointer("pointerdown", 3, 300, 300);
  pointer("pointercancel", 1, 200, 200);
  pointer("pointermove", 3, 300, 310);
  close(calls.find(([name]) => name === "roll")[1], Math.atan2(110, 200) - Math.atan2(100, 200));
  calls.length = 0;
  pointer("pointerup", 2, 100, 200);
  pointer("pointermove", 3, 305, 315);
  assert.deepEqual(calls.splice(0), [["orbit", 5, 5]]);
});

test("view buttons float inside the 3D stage while model information occupies the bottom panel", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const start = html.indexOf('<section class="stage"');
  const stage = html.slice(start, html.indexOf("</section>", start));
  assert.match(stage, /class="view-controls" role="group" aria-label="3D view controls"/);
  assert.match(stage, /id="reset"[^>]*>Reset view<\/button>\s*<button id="view-modules"[^>]*>Split modules<\/button>/);
  assert.match(stage, /id="view-modules"[^>]*>Split modules<\/button>\s*<button id="view-castle"[^>]*>Show castle<\/button>/);
  assert.doesNotMatch(html, /<section class="view-controls"|<legend>View<\/legend>|type="checkbox"/);
  assert.doesNotMatch(stage, /id="model-information"/);
  assert.match(html.slice(html.indexOf("</section>", start)),
    /<section id="model-information" aria-label="Model information">[\s\S]*id="dimensions"[\s\S]*id="controls"/);
});

test("castle visibility persists in the URL, stays fixed during splitting, and never selects a part", () => {
  const model = buildStairway(), part = model.partTree.getLeaves()[0].id;
  const controls = createControls({ buildModel: () => model,
    search: `?part=${encodeURIComponent(part)}` });
  const button = controls.node("#view-castle"), partsCount = controls.node("#parts-groups").children.length;
  assert.equal(button.textContent, "Show castle");
  const stairGeometry = controls.geometry;
  button.dispatch("click");
  assert.equal(button.textContent, "Hide castle");
  assert.equal(button.getAttribute("aria-pressed"), "true");
  assert.equal(controls.url.searchParams.get("castle"), "shown");
  assert.equal(new URL(controls.node("#page-link").href).searchParams.get("castle"), "shown");
  const castle = controls.mainViewer.batches.at(-1);
  closeGeometry(castle.geometry, model.createCastleGeometry());
  controls.node("#view-modules").dispatch("click");
  controls.advance(300);
  closeGeometry(controls.bounds, combineGeometries([model.createGeometry({}, 0, 0.5), castle.geometry]));
  assert.deepEqual(Array.from(castle.transform), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  controls.advance(300);
  controls.mainViewer.setStandardView("Top");
  const point = screenPoint(controls.mainViewer, [0, model.totalHeight, 0]);
  assert.ok(controls.mainViewer.hitTest(point.x, point.y) >= stairGeometry.indices.length / 3);
  tapPart(controls, point);
  assert.equal(controls.url.searchParams.get("part"), null);
  assert.equal(controls.node("#parts-groups").children.length, partsCount);
  assert.deepEqual(controls.errors, []);
  button.dispatch("click");
  assert.equal(button.textContent, "Show castle");
  assert.equal(button.getAttribute("aria-pressed"), "false");
  assert.equal(controls.url.searchParams.get("castle"), null);
  assert.equal(controls.mainViewer.batches.length, model.moduleCount);
});

test("castle URL restoration validates visibility without changing Details or Placement geometry", () => {
  const model = buildStairway();
  const controls = createControls({ buildModel: () => model, search: "?castle=shown" });
  assert.equal(controls.node("#view-castle").textContent, "Hide castle");
  controls.node("#parts-groups").children[0].dispatch("click");
  for (const tab of ["details", "placement"]) {
    controls.node(`#${tab}-tab`).dispatch("click");
    const views = controls.partViewers.map(view => ({ view, geometry: view.geometry, render: view.renderGeometry }));
    const annotations = controls.node("#part-view-annotations").textContent;
    controls.node("#view-castle").dispatch("click");
    for (const { view, geometry, render } of views) {
      assert.deepEqual(view.geometry, geometry);
      assert.deepEqual(view.renderGeometry, render);
    }
    assert.equal(controls.node("#part-view-annotations").textContent, annotations);
  }
  for (const search of ["?castle=hidden", "", "?castle=yes", "?castle=shown&castle=shown"]) {
    controls.restoreURL(search);
    assert.equal(controls.node("#view-castle").textContent, "Show castle");
    assert.equal(controls.url.searchParams.has("castle"), false);
    if (search.includes("yes") || search.includes("&")) {
      assert.match(controls.node("#parameter-notice").textContent, /Castle visibility was invalid/);
    }
  }
  controls.restoreURL("?castle=shown");
  assert.equal(controls.node("#view-castle").textContent, "Hide castle");
  assert.deepEqual(controls.errors, []);
});

test("Split and Join modules buttons preserve smooth reversible animation and camera-only reset", () => {
  const model = buildStairway(), controls = createControls({ buildModel: () => model });
  const button = controls.node("#view-modules");
  const checkGeometry = amount => {
    closeGeometry(controls.bounds, model.createGeometry({}, 0, amount));
    const footprint = model.createFootprintGeometry(null, false, true, amount).positions;
    controls.renderGeometry.positions.slice(controls.geometry.positions.length).forEach((value, i) => close(value, footprint[i]));
  };
  assert.equal(button.textContent, "Split modules");
  assert.equal(button.getAttribute("aria-pressed"), "false");
  button.dispatch("click");
  assert.equal(button.textContent, "Join modules");
  assert.equal(button.getAttribute("aria-pressed"), "true");
  checkGeometry(0);
  controls.advance(300);
  checkGeometry(0.5);
  button.dispatch("click");
  assert.equal(button.textContent, "Split modules");
  assert.equal(button.getAttribute("aria-pressed"), "false");
  controls.advance(300);
  checkGeometry(0.25);
  button.dispatch("click");
  controls.advance(600);
  assert.equal(button.textContent, "Join modules");
  checkGeometry(1);
  controls.node("#reset").dispatch("click");
  assert.deepEqual(controls.calls.at(-1), ["reset"]);
  assert.equal(button.textContent, "Join modules");
  checkGeometry(1);
  button.dispatch("click");
  controls.advance(600);
  assert.equal(button.textContent, "Split modules");
  checkGeometry(0);
});

test("Split and Join animation ticks neither rebuild meshes nor upload or allocate buffers", () => {
  const model = buildStairway(), controls = createControls({ buildModel: () => model });
  for (const name of ["createGeometry", "createNodeGeometry", "createFootprintGeometry"]) {
    model[name] = () => assert.fail(`${name} must not run during Split/Join animation.`);
  }
  for (const name of ["bufferData", "createBuffer"]) {
    controls.mainViewer.gl[name] = () => assert.fail(`${name} must not run during Split/Join animation.`);
  }
  const meshes = controls.mainViewer.batches.map(batch => batch.geometry);
  for (let cycle = 0; cycle < 2; cycle++) {
    controls.node("#view-modules").dispatch("click");
    for (let frame = 0; frame < 40; frame++) controls.advance(15);
  }
  assert.deepEqual(controls.mainViewer.batches.map(batch => batch.geometry), meshes);
  assert.deepEqual(controls.mainViewer.batches.map(batch => batch.transform), model.getModuleTransforms(0));
});

test("Split and Join modules buttons update geometry immediately with reduced motion", () => {
  const model = buildStairway(), controls = createControls({ reducedMotion: true, buildModel: () => model });
  const button = controls.node("#view-modules");
  for (const split of [true, false, true, false]) {
    button.dispatch("click");
    assert.equal(button.textContent, split ? "Join modules" : "Split modules");
    assert.equal(button.getAttribute("aria-pressed"), String(split));
    closeGeometry(controls.bounds, model.createGeometry({}, 0, Number(split)));
    const footprint = model.createFootprintGeometry(null, false, true, Number(split)).positions;
    controls.renderGeometry.positions.slice(controls.geometry.positions.length).forEach((value, i) => close(value, footprint[i]));
  }
});

test("Split modules leaves Details and Placement drawings, previews, and footprints unchanged", () => {
  const model = buildStairway();
  const controls = createControls({ reducedMotion: true, buildModel: () => model });
  const item = controls.node("#parts-groups").children.find(item =>
    item.children[0].textContent.startsWith("Upright - front left"));
  item.dispatch("click");
  for (const tab of ["details", "placement"]) {
    controls.node(`#${tab}-tab`).dispatch("click");
    const views = controls.partViewers.map(view => ({ view, geometry: view.geometry, render: view.renderGeometry }));
    const annotations = controls.node("#part-view-annotations").textContent;
    const template = controls.node("#part-view-template").textContent;
    for (const separated of [true, false]) {
      controls.node("#stairway-tab").dispatch("click");
      controls.separateModules(separated);
      controls.node(`#${tab}-tab`).dispatch("click");
      for (const { view, geometry, render } of views) {
        assert.deepEqual(view.geometry, geometry);
        assert.deepEqual(view.renderGeometry, render);
      }
      assert.equal(controls.node("#part-view-annotations").textContent, annotations);
      assert.equal(controls.node("#part-view-template").textContent, template);
    }
  }
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

test("Ctrl+arrows use normal orbit and Shift pan controls", () => {
  const { canvas, calls } = createControls();
  let prevented = 0;
  for (const shiftKey of [false, true]) {
    for (const [key, dx, dy] of [
      ["ArrowLeft", -12, 0], ["ArrowRight", 12, 0],
      ["ArrowUp", 0, -12], ["ArrowDown", 0, 12],
    ]) {
      canvas.dispatch("keydown", { key, ctrlKey: true, shiftKey, preventDefault() { prevented++; } });
      assert.deepEqual(calls.pop(), [shiftKey ? "pan" : "orbit", dx, dy]);
    }
  }
  assert.equal(prevented, 8);
});

test("Ctrl+drag orbits normally and modifier changes during a drag do not jump", () => {
  const { canvas, calls } = createControls();
  canvas.dispatch("pointerdown", {
    pointerId: 1, pointerType: "mouse", button: 0, clientX: 100, clientY: 100, ctrlKey: true,
  });
  canvas.dispatch("pointermove", { pointerId: 1, clientX: 120, clientY: 110, ctrlKey: true });
  assert.deepEqual(calls.splice(0), [["orbit", 20, 10]]);
  canvas.dispatch("pointermove", { pointerId: 1, clientX: 125, clientY: 115, ctrlKey: false });
  assert.deepEqual(calls.splice(0), [["orbit", 5, 5]]);
  canvas.dispatch("pointermove", { pointerId: 1, clientX: 130, clientY: 120, ctrlKey: true });
  assert.deepEqual(calls.splice(0), [["orbit", 5, 5]]);
  canvas.dispatch("pointerup", { pointerId: 1 });
  canvas.dispatch("pointermove", { pointerId: 1, clientX: 180, clientY: 180, ctrlKey: true });
  assert.equal(calls.length, 0);
});
