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

function viewMatrix(eye, target) {
  const offset = eye.map((value, axis) => value - target[axis]);
  const distance = Math.hypot(...offset);
  const z = offset.map(value => value / distance);
  const horizontal = Math.hypot(z[0], z[2]);
  const x = [z[2] / horizontal, 0, -z[0] / horizontal];
  const y = [z[1] * x[2], z[2] * x[0] - z[0] * x[2], -z[1] * x[0]];
  const dot = vector => vector.reduce((sum, value, index) => sum + value * eye[index], 0);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x), -dot(y), -dot(z), 1,
  ]);
}

export class WebGLViewer {
  constructor(canvas, geometry, boundsGeometry = geometry) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl", { alpha: false, antialias: true });
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
    gl.clearColor(14 / 255, 20 / 255, 28 / 255, 1);
    this.setGeometry(geometry, boundsGeometry);
    this.reset();
  }

  setGeometry(geometry, boundsGeometry = geometry) {
    const gl = this.gl;
    if (gl.isContextLost()) {
      throw new Error("The WebGL context was lost. Reload the page to restore the model.");
    }
    if (boundsGeometry.positions.length === 0) {
      throw new Error("Camera framing requires nonempty model bounds.");
    }
    let indexType = gl.UNSIGNED_SHORT;
    if (geometry.indices instanceof Uint32Array) {
      if (!gl.getExtension("OES_element_index_uint")) {
        throw new Error("This browser cannot render models requiring 32-bit geometry indices.");
      }
      indexType = gl.UNSIGNED_INT;
    }
    const minimum = [Infinity, Infinity, Infinity];
    const maximum = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < boundsGeometry.positions.length; i += 3) {
      for (let axis = 0; axis < 3; axis++) {
        minimum[axis] = Math.min(minimum[axis], boundsGeometry.positions[i + axis]);
        maximum[axis] = Math.max(maximum[axis], boundsGeometry.positions[i + axis]);
      }
    }
    this.center = minimum.map((value, axis) => (value + maximum[axis]) / 2);
    this.radius = 0;
    for (let i = 0; i < boundsGeometry.positions.length; i += 3) {
      this.radius = Math.max(this.radius, Math.hypot(
        boundsGeometry.positions[i] - this.center[0],
        boundsGeometry.positions[i + 1] - this.center[1],
        boundsGeometry.positions[i + 2] - this.center[2]));
    }
    for (const { buffer, key } of this.vertexBuffers) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, geometry[key], gl.DYNAMIC_DRAW);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.indices, gl.DYNAMIC_DRAW);
    this.indexType = indexType;
    this.indexCount = geometry.indices.length;
    this.requestRender();
  }

  reset() {
    this.yaw = Math.PI / 5;
    this.pitch = Math.PI / 7;
    this.zoomFactor = 1;
    this.panOffset = [0, 0];
    this.lightYaw = Math.atan2(-0.4, 0.65);
    this.lightPitch = Math.atan2(0.85, Math.hypot(-0.4, 0.65));
    this.requestRender();
  }

  orbit(dx, dy) {
    this.yaw -= dx * 0.008;
    this.pitch = Math.max(-Math.PI / 2 + 0.05,
      Math.min(Math.PI / 2 - 0.05, this.pitch + dy * 0.008));
    this.requestRender();
  }

  rotateLight(dx, dy) {
    this.lightYaw += dx * 0.008;
    this.lightPitch = Math.max(-Math.PI / 2,
      Math.min(Math.PI / 2, this.lightPitch - dy * 0.008));
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
    const distance = Math.max(this.radius * 0.55, this.fitDistance() * this.zoomFactor);
    const panScale = 2 * distance * Math.tan(Math.PI / 8) / Math.max(1, this.canvas.clientHeight);
    const right = [Math.cos(this.yaw), 0, -Math.sin(this.yaw)];
    const up = [-Math.sin(this.pitch) * Math.sin(this.yaw), Math.cos(this.pitch),
      -Math.sin(this.pitch) * Math.cos(this.yaw)];
    const target = this.center.map((value, axis) =>
      value + (right[axis] * this.panOffset[0] + up[axis] * this.panOffset[1]) * panScale);
    const horizontal = distance * Math.cos(this.pitch);
    const eye = [horizontal * Math.sin(this.yaw), distance * Math.sin(this.pitch),
      horizontal * Math.cos(this.yaw)].map((value, axis) => value + target[axis]);
    gl.uniformMatrix4fv(this.projection, false,
      perspective(Math.PI / 4, width / height,
        Math.max(0.01, distance - this.radius * 1.5), distance + this.radius * 2));
    gl.uniformMatrix4fv(this.view, false, viewMatrix(eye, target));
    gl.uniform3f(this.lightDirection,
      Math.cos(this.lightPitch) * Math.sin(this.lightYaw), Math.sin(this.lightPitch),
      Math.cos(this.lightPitch) * Math.cos(this.lightYaw));
    if (this.indexCount > 0) gl.drawElements(gl.TRIANGLES, this.indexCount, this.indexType, 0);
  }
}
