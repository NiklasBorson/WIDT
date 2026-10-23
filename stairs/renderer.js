const vertexSource = `
  attribute vec3 aPosition;
  attribute vec3 aNormal;
  attribute vec3 aColor;
  attribute vec4 aGrain;
  uniform mat4 uProjection;
  uniform mat4 uView;
  varying vec3 vNormal;
  varying vec3 vColor;
  varying vec4 vGrain;
  void main() {
    vNormal = mat3(uView) * aNormal;
    vColor = aColor;
    vGrain = aGrain;
    gl_Position = uProjection * uView * vec4(aPosition, 1.0);
  }
`;

const fragmentSource = `
  precision mediump float;
  uniform vec3 uLightDirection;
  varying vec3 vNormal;
  varying vec3 vColor;
  varying vec4 vGrain;
  float grainWave(float phase) {
    #ifdef GRAIN_DERIVATIVES
      float footprint = length(vec2(dFdx(phase), dFdy(phase)));
      return sin(phase) * (1.0 - smoothstep(0.7, 2.5, footprint));
    #else
      return sin(phase);
    #endif
  }
  float particleHash(vec2 point) {
    vec2 cell = mod(point, 97.0);
    float seed = mod(cell.x * 17.0 + cell.y * 43.0, 97.0);
    return fract(seed * (seed + 13.0) / 97.0);
  }
  float particleNoise(vec2 point) {
    vec2 cell = floor(point);
    vec2 blend = fract(point);
    blend = blend * blend * (3.0 - 2.0 * blend);
    return mix(mix(particleHash(cell), particleHash(cell + vec2(1.0, 0.0)), blend.x),
      mix(particleHash(cell + vec2(0.0, 1.0)), particleHash(cell + vec2(1.0, 1.0)), blend.x), blend.y);
  }
  void main() {
    vec3 light = normalize(uLightDirection);
    float diffuse = max(dot(normalize(vNormal), light), 0.0);
    float across = vGrain.x;
    float along = vGrain.y;
    float bend = 0.45 * sin(along * 0.35 + sin(across * 0.8));
    float faceGrain = 0.045 * grainWave(across * 8.0 + bend)
      + 0.02 * grainWave(across * 3.1 + along * 0.08);
    float endGrain = 0.045 * grainWave((across + along) * 7.0);
    float plywood = step(0.001, vGrain.w);
    float cutGrain = endGrain;
    if (plywood > 0.5) {
      cutGrain = 0.06 * grainWave(across * 3.14159265 / vGrain.w);
    }
    float pattern = mix(faceGrain * mix(1.0, 0.45, plywood), cutGrain, vGrain.z);
    float wood = 1.0 - 0.10 * vGrain.z + pattern;
    if (vGrain.w < 0.0) {
      vec2 point = vec2(across, along);
      float fine = particleNoise(point * 24.0) - 0.5;
      #ifdef GRAIN_DERIVATIVES
        fine *= 1.0 - smoothstep(0.5, 2.0, length(fwidth(point * 24.0)));
      #endif
      wood = 1.0 + 0.10 * (particleNoise(point * 6.0) - 0.5) + 0.08 * fine;
    }
    gl_FragColor = vec4(vColor * wood * (0.35 + 0.65 * diffuse), 1.0);
  }
`;

function shader(gl, type, source) {
  const result = gl.createShader(type);
  if (!result) throw new Error("Could not allocate a WebGL shader.");
  gl.shaderSource(result, source);
  gl.compileShader(result);
  if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(result);
    gl.deleteShader(result);
    throw new Error(`WebGL shader compilation failed: ${message}`);
  }
  return result;
}

function createProgram(gl) {
  const vertex = shader(gl, gl.VERTEX_SHADER, vertexSource);
  const derivatives = gl.getExtension("OES_standard_derivatives")
    ? "#extension GL_OES_standard_derivatives : enable\n#define GRAIN_DERIVATIVES\n" : "";
  const fragment = shader(gl, gl.FRAGMENT_SHADER, derivatives + fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error("Could not allocate a WebGL program.");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`WebGL program linking failed: ${message}`);
  }
  return program;
}

function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2), range = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * range, -1,
    0, 0, 2 * far * near * range, 0,
  ]);
}

export const STANDARD_VIEWS = Object.freeze([
  { name: "Top", direction: [0, 1, 0], up: [0, 0, -1] },
  { name: "Bottom", direction: [0, -1, 0], up: [0, 0, 1] },
  { name: "Left", direction: [-1, 0, 0], up: [0, 1, 0] },
  { name: "Right", direction: [1, 0, 0], up: [0, 1, 0] },
  { name: "Front", direction: [0, 0, 1], up: [0, 1, 0] },
  { name: "Back", direction: [0, 0, -1], up: [0, 1, 0] },
]);

const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = vector => {
  const length = Math.hypot(...vector);
  return vector.map(value => value / length);
};

function viewMatrix(eye, target, up = [0, 1, 0]) {
  const offset = eye.map((value, axis) => value - target[axis]);
  const distance = Math.hypot(...offset);
  const z = offset.map(value => value / distance);
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  const dot = vector => vector.reduce((sum, value, index) => sum + value * eye[index], 0);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x), -dot(y), -dot(z), 1,
  ]);
}

function geometryBounds(geometry) {
  if (geometry.positions.length === 0) {
    throw new Error("Camera framing requires nonempty model bounds.");
  }
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < geometry.positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      minimum[axis] = Math.min(minimum[axis], geometry.positions[i + axis]);
      maximum[axis] = Math.max(maximum[axis], geometry.positions[i + axis]);
    }
  }
  return {
    center: minimum.map((value, axis) => (value + maximum[axis]) / 2),
    size: maximum.map((value, axis) => value - minimum[axis]),
  };
}

export class WebGLViewer {
  constructor(canvas, geometry, boundsGeometry = geometry, cameraOptions = {}) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl", { alpha: Boolean(cameraOptions.transparent), antialias: true });
    if (!gl) throw new Error("WebGL is unavailable. Enable hardware acceleration or try another browser.");
    this.gl = gl;
    this.program = createProgram(gl);
    this.projection = gl.getUniformLocation(this.program, "uProjection");
    this.view = gl.getUniformLocation(this.program, "uView");
    this.lightDirection = gl.getUniformLocation(this.program, "uLightDirection");
    gl.useProgram(this.program);
    this.vertexBuffers = [];
    for (const [name, key, size] of [
      ["aPosition", "positions", 3], ["aNormal", "normals", 3], ["aColor", "colors", 3],
      ["aGrain", "grain", 4],
    ]) {
      const buffer = gl.createBuffer();
      if (!buffer) throw new Error("Could not allocate a WebGL vertex buffer.");
      this.vertexBuffers.push({ buffer, key });
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      const location = gl.getAttribLocation(this.program, name);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    }
    this.indexBuffer = gl.createBuffer();
    if (!this.indexBuffer) throw new Error("Could not allocate a WebGL index buffer.");
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    if (cameraOptions.transparent) gl.clearColor(0, 0, 0, 0);
    else gl.clearColor(14 / 255, 20 / 255, 28 / 255, 1);
    this.setGeometry(geometry, boundsGeometry, cameraOptions);
    this.reset();
  }

  setGeometry(geometry, boundsGeometry = geometry, {
    orbitGeometry = boundsGeometry, orbitKey = null, renderGeometry = geometry,
  } = {}) {
    const gl = this.gl;
    if (gl.isContextLost()) {
      throw new Error("The WebGL context was lost. Reload the page to restore the model.");
    }
    const framing = geometryBounds(boundsGeometry);
    const orbitCenter = orbitGeometry === boundsGeometry ? framing.center : geometryBounds(orbitGeometry).center;
    let indexType = gl.UNSIGNED_SHORT;
    if (renderGeometry.indices instanceof Uint32Array) {
      if (!gl.getExtension("OES_element_index_uint")) {
        throw new Error("This browser cannot render models requiring 32-bit geometry indices.");
      }
      indexType = gl.UNSIGNED_INT;
    }
    this.center = framing.center;
    this.boundsSize = framing.size;
    this.orbitCenter = orbitCenter;
    if (this.orbitKey !== undefined && orbitKey !== this.orbitKey) this.panOffset = [0, 0];
    this.orbitKey = orbitKey;
    this.radius = 0;
    for (let i = 0; i < boundsGeometry.positions.length; i += 3) {
      this.radius = Math.max(this.radius, Math.hypot(
        boundsGeometry.positions[i] - this.center[0],
        boundsGeometry.positions[i + 1] - this.center[1],
        boundsGeometry.positions[i + 2] - this.center[2]));
    }
    this.clipRadius = this.radius;
    for (let i = 0; renderGeometry !== geometry && i < renderGeometry.positions.length; i += 3) {
      this.clipRadius = Math.max(this.clipRadius, Math.hypot(
        renderGeometry.positions[i] - this.center[0],
        renderGeometry.positions[i + 1] - this.center[1],
        renderGeometry.positions[i + 2] - this.center[2]));
    }
    for (const { buffer, key } of this.vertexBuffers) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, renderGeometry[key], gl.DYNAMIC_DRAW);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, renderGeometry.indices, gl.DYNAMIC_DRAW);
    this.indexType = indexType;
    this.indexCount = geometry.indices.length;
    this.renderIndexCount = renderGeometry.indices.length;
    this.geometry = geometry;
    this.requestRender();
  }

  reset() {
    this.standardView = null;
    const yaw = 101 * Math.PI / 180, pitch = Math.PI / 7;
    this.orientation = [
      [Math.cos(yaw), 0, -Math.sin(yaw)],
      [-Math.sin(pitch) * Math.sin(yaw), Math.cos(pitch), -Math.sin(pitch) * Math.cos(yaw)],
      [Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)],
    ];
    this.zoomFactor = 1;
    this.panOffset = [0, 0];
    this.requestRender();
  }

  setStandardView(name) {
    const view = STANDARD_VIEWS.find(view => view.name === name);
    if (!view) throw new RangeError(`Unknown standard view: ${name}`);
    this.standardView = view;
    this.requestRender();
  }

  setViewportInsets({ top = 0, right = 0, bottom = 0, left = 0 }) {
    if (![top, right, bottom, left].every(value => Number.isFinite(value) && value >= 0)) {
      throw new RangeError("Viewport insets must be finite nonnegative CSS-pixel lengths.");
    }
    this.viewportInsets = { top, right, bottom, left };
    this.requestRender();
  }

  getStandardViewMatrices() {
    if (!this.standardView) throw new Error("Stock projection requires a standard view.");
    const width = Math.max(1, this.canvas.clientWidth), height = Math.max(1, this.canvas.clientHeight);
    const insets = this.viewportInsets ?? { top: 0, right: 0, bottom: 0, left: 0 };
    const availableWidth = Math.max(1, width - insets.left - insets.right);
    const availableHeight = Math.max(1, height - insets.top - insets.bottom);
    const aspect = availableWidth / availableHeight;
    const clipRadius = this.clipRadius ?? this.radius;
    const distance = clipRadius * 3 + 1;
    const eye = this.center.map((value, axis) => value + this.standardView.direction[axis] * distance);
    const view = viewMatrix(eye, this.center, this.standardView.up);
    const halfWidth = this.boundsSize.reduce((sum, size, axis) => sum + Math.abs(view[axis * 4]) * size / 2, 0);
    const halfHeight = this.boundsSize.reduce((sum, size, axis) => sum + Math.abs(view[axis * 4 + 1]) * size / 2, 0);
    const top = Math.max(halfHeight, halfWidth / aspect, 0.01) * 1.12;
    const right = top * aspect;
    const near = 0.01, far = distance + clipRadius * 2;
    const projection = new Float32Array([
      availableWidth / (width * right), 0, 0, 0,
      0, availableHeight / (height * top), 0, 0,
      0, 0, -2 / (far - near), 0,
      (insets.left - insets.right) / width, (insets.bottom - insets.top) / height,
      -(far + near) / (far - near), 1,
    ]);
    return { view, projection };
  }

  projectPoint(point) {
    if (!Array.isArray(point) || point.length !== 3 || !point.every(Number.isFinite)) {
      throw new RangeError("Projection requires a finite three-dimensional stock point.");
    }
    const { view, projection } = this.getStandardViewMatrices();
    const camera = [0, 1, 2].map(axis =>
      point.reduce((sum, value, i) => sum + value * view[i * 4 + axis], view[12 + axis]));
    return {
      x: (camera[0] * projection[0] + projection[12] + 1) * this.canvas.clientWidth / 2,
      y: (1 - camera[1] * projection[5] - projection[13]) * this.canvas.clientHeight / 2,
    };
  }

  applyStandardView() {
    const { view, projection } = this.getStandardViewMatrices();
    this.gl.uniformMatrix4fv(this.projection, false, projection);
    this.gl.uniformMatrix4fv(this.view, false, view);
  }

  orbit(dx, dy) {
    const [right, up, back] = this.orientation;
    const length = Math.hypot(dx, dy);
    if (length === 0) return;
    const axis = right.map((value, i) => (-dy * value - dx * up[i]) / length);
    const angle = length * 0.008, cosine = Math.cos(angle), sine = Math.sin(angle);
    const rotate = vector => {
      const perpendicular = cross(axis, vector);
      const along = vector.reduce((sum, value, i) => sum + value * axis[i], 0);
      return vector.map((value, i) =>
        value * cosine + perpendicular[i] * sine + axis[i] * along * (1 - cosine));
    };
    const nextBack = normalize(rotate(back));
    const nextUp = normalize(cross(nextBack, rotate(right)));
    this.orientation = [cross(nextUp, nextBack), nextUp, nextBack];
    this.requestRender();
  }

  roll(angle) {
    const [right, up, back] = this.orientation;
    const cosine = Math.cos(angle), sine = Math.sin(angle);
    const nextRight = normalize(right.map((value, axis) => value * cosine + up[axis] * sine));
    this.orientation = [nextRight, cross(back, nextRight), back];
    this.requestRender();
  }

  fitDistance() {
    const aspect = Math.max(1, this.canvas.clientWidth) / Math.max(1, this.canvas.clientHeight);
    const halfAngle = Math.min(Math.PI / 8, Math.atan(Math.tan(Math.PI / 8) * aspect));
    return this.radius / Math.sin(halfAngle) * 1.12;
  }

  zoom(factor) {
    this.zoomFactor = Math.max(this.radius * 0.55 / this.fitDistance(),
      Math.min(20, this.zoomFactor * factor));
    this.requestRender();
  }

  pan(dx, dy) {
    this.panOffset[0] -= dx;
    this.panOffset[1] += dy;
    this.requestRender();
  }

  requestRender() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  getCameraMatrices() {
    if (this.standardView) return this.getStandardViewMatrices();
    const distance = Math.max(this.radius * 0.55, this.fitDistance() * this.zoomFactor);
    const panScale = 2 * distance * Math.tan(Math.PI / 8) / Math.max(1, this.canvas.clientHeight);
    const [right, up, back] = this.orientation;
    const target = (this.orbitCenter ?? this.center).map((value, axis) =>
      value + (right[axis] * this.panOffset[0] + up[axis] * this.panOffset[1]) * panScale);
    const clipRadius = (this.clipRadius ?? this.radius) +
      Math.hypot(...target.map((value, axis) => value - this.center[axis]));
    const eye = back.map((value, axis) => value * distance + target[axis]);
    return {
      projection: perspective(Math.PI / 4,
        Math.max(1, this.canvas.clientWidth) / Math.max(1, this.canvas.clientHeight),
        Math.max(0.01, distance - clipRadius * 1.5), distance + clipRadius * 2),
      view: viewMatrix(eye, target, up),
    };
  }

  // Returns the zero-based triangle number in the current indexed mesh.
  hitTest(x, y) {
    if (![x, y].every(Number.isFinite)) throw new RangeError("Hit testing requires finite CSS-pixel coordinates.");
    const width = this.canvas.clientWidth, height = this.canvas.clientHeight;
    if (x < 0 || y < 0 || x >= width || y >= height || !this.indexCount) return null;
    const { view, projection } = this.getCameraMatrices();
    const screenX = 2 * x / width - 1, screenY = 1 - 2 * y / height;
    const unproject = depth => {
      const z = (projection[14] - depth * projection[15]) / (depth * projection[11] - projection[10]);
      const w = projection[11] * z + projection[15];
      const camera = [(screenX * w - projection[12]) / projection[0],
        (screenY * w - projection[13]) / projection[5], z];
      return [0, 1, 2].map(axis =>
        camera.reduce((sum, value, i) => sum + view[axis * 4 + i] * (value - view[12 + i]), 0));
    };
    const origin = unproject(-1), end = unproject(1);
    const direction = end.map((value, axis) => value - origin[axis]);
    const { positions, indices } = this.geometry;
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot = (a, b) => a.reduce((sum, value, axis) => sum + value * b[axis], 0);
    let nearest = Infinity, triangle = null;
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
      const edge1 = [0, 1, 2].map(axis => positions[b + axis] - positions[a + axis]);
      const edge2 = [0, 1, 2].map(axis => positions[c + axis] - positions[a + axis]);
      const p = cross(direction, edge2), determinant = dot(edge1, p);
      // Match WebGL's back-face culling, and test only the near-to-far clip segment.
      if (determinant <= 1e-10) continue;
      const offset = origin.map((value, axis) => value - positions[a + axis]);
      const u = dot(offset, p) / determinant;
      if (u < 0 || u > 1) continue;
      const q = cross(offset, edge1), v = dot(direction, q) / determinant;
      if (v < 0 || u + v > 1) continue;
      const distance = dot(edge2, q) / determinant;
      if (distance < 0 || distance > 1 || distance >= nearest) continue;
      nearest = distance;
      triangle = i / 3;
    }
    return triangle;
  }

  draw() {
    const gl = this.gl;
    if (gl.isContextLost()) return;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(this.canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(this.canvas.clientHeight * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const { view, projection } = this.getCameraMatrices();
    gl.uniformMatrix4fv(this.projection, false, projection);
    gl.uniformMatrix4fv(this.view, false, view);
    gl.uniform3f(this.lightDirection, -0.4, 0.85, 0.65);
    const count = this.renderIndexCount ?? this.indexCount;
    if (count > 0) gl.drawElements(gl.TRIANGLES, count, this.indexType, 0);
  }
}
