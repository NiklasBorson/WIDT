import { buildStairway } from "./model.js";
import { WebGLViewer } from "./renderer.js";

const canvas = document.querySelector("#viewer");
const error = document.querySelector("#error");

function showError(message) {
  error.textContent = message;
  error.hidden = false;
}

try {
  const bottomWidth = document.querySelector("#bottom-stair-width");
  const topWidth = document.querySelector("#top-stair-width");
  const stairCount = document.querySelector("#stair-count");
  const explodedView = document.querySelector("#exploded-view");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let explosion = 0;
  let animationFrame = 0;
  const partInputs = {
    bottomFrame: document.querySelector("#show-bottom-frame"),
    topFrame: document.querySelector("#show-top-frame"),
    riser: document.querySelector("#show-riser"),
    tread: document.querySelector("#show-tread"),
  };
  const parameterInputs = [bottomWidth, topWidth, stairCount];
  function readModel() {
    return buildStairway(bottomWidth.valueAsNumber, topWidth.valueAsNumber, stairCount.valueAsNumber);
  }
  function modelGeometry(model) {
    const bounds = model.createGeometry({}, explosion);
    const visibility = Object.fromEntries(Object.entries(partInputs)
      .map(([name, input]) => [name, input.checked]));
    const visible = Object.values(visibility).every(Boolean) ? bounds : model.createGeometry(visibility, explosion);
    return { visible, bounds };
  }
  function showModel(model) {
    document.querySelector("#model-name").textContent = `${model.stepCount}-step ${model.label.toLowerCase()}`;
    const middleRadius = model.innerRadius + (model.bottomStairWidth + model.topStairWidth) / 4;
    const run = middleRadius * Math.PI / (2 * model.stepCount);
    document.querySelector("#dimensions").textContent =
      `Widths: ${model.bottomStairWidth} to ${model.topStairWidth} in / ` +
      `Step rise: ${model.stepRise.toFixed(2)} in / Step run at middle: ${run.toFixed(2)} in / ` +
      `Landing: ${model.totalHeight} in / ` +
      `Inside arc: ${model.innerArcLength} in`;
    for (const input of parameterInputs) {
      document.querySelector(`output[for="${input.id}"]`).value =
        `${input.value}${input === stairCount ? "" : " in"}`;
      input.setAttribute("aria-valuetext", `${input.value}${input === stairCount ? " steps" : " inches"}`);
    }
  }
  let model = readModel();
  const geometry = modelGeometry(model);
  const viewer = new WebGLViewer(canvas, geometry.visible, geometry.bounds);
  showModel(model);
  function updateGeometry() {
    const updatedGeometry = modelGeometry(model);
    viewer.setGeometry(updatedGeometry.visible, updatedGeometry.bounds);
    error.hidden = true;
  }
  function reportUpdateError(cause) {
    console.error(cause);
    showError(`Could not update the model: ${cause.message}`);
  }
  function setExplodedView() {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    const startValue = explosion;
    const target = explodedView.checked ? 1 : 0;
    const startTime = performance.now();
    try {
      if (reducedMotion.matches || startValue === target) {
        explosion = target;
        updateGeometry();
        return;
      }
      function animate(time) {
        animationFrame = 0;
        try {
          const progress = Math.max(0, Math.min(1, (time - startTime) / 600));
          const eased = progress * progress * (3 - 2 * progress);
          explosion = startValue + (target - startValue) * eased;
          updateGeometry();
          if (progress < 1) animationFrame = requestAnimationFrame(animate);
        } catch (cause) {
          reportUpdateError(cause);
        }
      }
      animationFrame = requestAnimationFrame(animate);
    } catch (cause) {
      reportUpdateError(cause);
    }
  }
  explodedView.addEventListener("input", setExplodedView);
  reducedMotion.addEventListener("change", setExplodedView);
  for (const input of [...parameterInputs, ...Object.values(partInputs)]) {
    input.addEventListener("input", () => {
      try {
        const updatedModel = readModel();
        const updatedGeometry = modelGeometry(updatedModel);
        viewer.setGeometry(updatedGeometry.visible, updatedGeometry.bounds);
        model = updatedModel;
        showModel(updatedModel);
        error.hidden = true;
      } catch (cause) {
        reportUpdateError(cause);
      }
    });
  }
  const pointers = new Map();
  let previous = null;
  function measure() {
    const [first, second] = pointers.values();
    if (!first) return null;
    return {
      count: pointers.size,
      x: second ? (first.x + second.x) / 2 : first.x,
      y: second ? (first.y + second.y) / 2 : first.y,
      distance: second ? Math.hypot(second.x - first.x, second.y - first.y) : 0,
    };
  }
  canvas.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId);
    canvas.focus({ preventScroll: true });
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    previous = measure();
  });
  canvas.addEventListener("pointermove", event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const current = measure();
    if (previous?.count === 1 && current.count === 1) {
      if (event.ctrlKey) viewer.rotateLight(current.x - previous.x, current.y - previous.y);
      else viewer.orbit(current.x - previous.x, current.y - previous.y);
    } else if (previous?.count >= 2 && current.count >= 2) {
      viewer.pan(current.x - previous.x, current.y - previous.y);
      if (previous.distance > 0 && current.distance > 0) {
        viewer.zoom(previous.distance / current.distance);
      }
    }
    previous = current;
  });
  function endPointer(event) {
    pointers.delete(event.pointerId);
    previous = measure();
  }
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
    canvas.addEventListener(name, endPointer);
  }
  canvas.addEventListener("wheel", event => {
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
    const delta = Math.max(-1000, Math.min(1000, event.deltaY * unit));
    viewer.zoom(Math.exp(delta * 0.0015));
  }, { passive: false });
  canvas.addEventListener("keydown", event => {
    function move(dx, dy) {
      if (event.ctrlKey) viewer.rotateLight(dx, dy);
      else if (event.shiftKey) viewer.pan(dx, dy);
      else viewer.orbit(dx, dy);
    }
    switch (event.key) {
      case "ArrowLeft": move(-12, 0); break;
      case "ArrowRight": move(12, 0); break;
      case "ArrowUp": move(0, -12); break;
      case "ArrowDown": move(0, 12); break;
      case "+": case "=": viewer.zoom(0.9); break;
      case "-": viewer.zoom(1 / 0.9); break;
      case "Home": viewer.reset(); break;
      default: return;
    }
    event.preventDefault();
  });
  canvas.addEventListener("webglcontextlost", () => {
    showError("The WebGL context was lost. Reload the page to restore the model.");
  });
  document.querySelector("#reset").addEventListener("click", () => viewer.reset());
  const observer = new ResizeObserver(() => viewer.requestRender());
  observer.observe(canvas);
  window.addEventListener("resize", () => viewer.requestRender());
} catch (cause) {
  console.error(cause);
  showError(`Could not display the model: ${cause.message}`);
}
