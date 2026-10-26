import { buildStairway, combineGeometries } from "./model.js";
import { WebGLViewer, STANDARD_VIEWS } from "./renderer.js";
import { PART_VIEW_NAMES, partViewLabel as viewLabel } from "./parts.js";
import { PartInventory, PART_SUBSETS } from "./part-list.js";
import { formatLength, formatPartDescription, formatPartListDescription } from "./part-description.js";
import { getPartFeatures, renderPartAnnotations, renderPartCompass } from "./part-annotations.js";
import { PARAMETER_FIELDS, readParameters, parameterURL } from "./parameters.js";
import { PlacementPlanner } from "./placement.js";
import { renderPlacementAnnotations, renderTreadTemplate } from "./placement-drawing.js";

const canvas = document.querySelector("#viewer");
const error = document.querySelector("#error");

function showError(message) {
  error.textContent = message;
  error.hidden = false;
}

try {
  const isParameters = document.body.dataset.page === "parameters";
  const initialParameters = readParameters(window.location.search);
  let parameters = initialParameters.values;
  const notice = document.querySelector("#parameter-notice");
  function showURLNotice(warnings) {
    notice.textContent = warnings.join(" ");
    notice.hidden = warnings.length === 0;
  }
  showURLNotice(initialParameters.warnings);
  const stairWidth = document.querySelector("#stair-width");
  const stairCount = document.querySelector("#stair-count");
  const moduleCount = document.querySelector("#module-count");
  const spindleShoulderAscent = document.querySelector("#spindle-shoulder-ascent");
  const modulesView = document.querySelector("#view-modules");
  const castleView = isParameters ? null : document.querySelector("#view-castle");
  const identityTransform = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  let castleShown = false;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let modulesSeparated = false;
  let moduleExplosion = 0;
  let animationFrame = 0;
  const parameterInputs = isParameters ? [stairWidth, stairCount, moduleCount, spindleShoulderAscent] : [];
  for (const field of PARAMETER_FIELDS) {
    if (isParameters) document.querySelector(`#${field.id}`).value = String(parameters[field.key]);
  }
  const tabs = isParameters ? [] : ["stairway", "details", "placement"];
  const tabButtons = tabs.map(name => document.querySelector(`#${name}-tab`));
  const moduleFilter = document.querySelector("#parts-module");
  const subsetFilter = document.querySelector("#parts-subset");
  const typeFilter = document.querySelector("#parts-type");
  const partSearch = document.querySelector("#parts-search");
  const findPrevious = document.querySelector("#parts-find-previous");
  const findNext = document.querySelector("#parts-find-next");
  const clearSelectionButton = document.querySelector("#parts-clear-selection");
  const inventoryGroups = document.querySelector("#parts-groups");
  const partOptions = new Map();
  let filteredParts = [];
  let pickRanges = [];
  let meshCache = null;
  let findMatches = [];
  let locatedOccurrenceId = null;
  let renderedDetailsId = null;
  let renderedViewMode = null, placementPlanner = null, placementPlan = null;
  let selectedPlacementView = "Up", activeDrawingName = "Up", detailsGeometry = null, detailsStockCamera = null;
  const viewStates = new Map();
  const partDescription = document.querySelector("#part-description");
  const partDetailsError = document.querySelector("#part-details-error");
  const partViewsContainer = document.querySelector("#part-view-layout");
  const partViewSidebar = document.querySelector("#part-view-sidebar");
  const partThumbnails = document.querySelector("#part-views");
  const partPreviewCanvas = document.querySelector("#part-view-preview");
  const selectedPartCanvas = document.querySelector("#part-view-selected");
  const partAnnotations = document.querySelector("#part-view-annotations");
  const partCompass = document.querySelector("#part-view-compass");
  const placementDetailsToggle = document.querySelector("#placement-view-details-toggle");
  const placementMetadata = document.querySelector("#placement-view-metadata");
  let placementMetadataExpanded = false;
  const partTemplate = document.querySelector("#part-view-template");
  const placementInstance = document.querySelector("#placement-instance");
  const neighborPopup = document.querySelector("#placement-neighbor-popup");
  const neighborLink = document.querySelector("#placement-neighbor-link");
  let inspectedNeighborId = null;
  let pendingNeighbor = null;
  const partDrawing = document.querySelector("#part-view-drawing");
  const partDrawingStage = document.querySelector("#part-view-stage");
  let drawingViewport = null;
  let drawingScale = 1, defaultDrawingScale = 1, drawingX = 0, drawingY = 0;
  let selectedPartViewer = null;
  let partPreviewViewer = null;
  let selectedStockView = "Up";
  const partViews = (isParameters ? [] : PART_VIEW_NAMES).map(name => ({
    name, canvas: document.querySelector(`#part-view-${name.toLowerCase()}`),
    label: document.querySelector(`#part-view-choice-${name.toLowerCase()} span`),
    button: document.querySelector(`#part-view-choice-${name.toLowerCase()}`), viewer: null, standardView: null,
  }));
  let activeTab = "stairway";
  const detailsActive = () => !isParameters && activeTab !== "stairway";
  const placementActive = () => !isParameters && activeTab === "placement";
  const occurrenceTitle = location => `${location.name} (Module ${location.moduleNumber}${
    location.stepNumber === null ? "" : ` / Step ${location.stepNumber}`})`;
  function closeNeighborPopup() {
    neighborPopup?.hidePopover();
    inspectedNeighborId = null;
    pendingNeighbor = null;
  }
  function readModel() {
    return buildStairway(parameters.width, parameters.steps, parameters.modules, parameters.shoulderAscent);
  }
  function syncURL() {
    const url = parameterURL(window.location.href, parameters);
    if (!isParameters) {
      const state = {
        tab: activeTab === "stairway" ? "" : activeTab,
        parts: document.querySelector("#parts-sidebar").hidden ? "hidden" : "",
        module: moduleFilter.value,
        subset: subsetFilter.value,
        type: typeFilter.value,
        part: locatedOccurrenceId ?? "",
        castle: castleShown ? "shown" : "",
      };
      for (const [key, value] of Object.entries(state)) {
        if (value) url.searchParams.set(key, value);
        else url.searchParams.delete(key);
      }
    }
    window.history.replaceState(null, "", url.href);
    const link = document.querySelector("#page-link");
    const destination = new URL(isParameters ? "./index.html" : "./parameters.html", url);
    destination.search = url.search;
    link.href = destination.href;
  }
  function setPartsHidden(hidden) {
    const toggle = document.querySelector("#toggle-parts");
    document.querySelector("#parts-sidebar").hidden = hidden;
    document.querySelector(".workspace").setAttribute("data-parts-collapsed", String(hidden));
    toggle.setAttribute("aria-expanded", String(!hidden));
    toggle.textContent = hidden ? "Show parts" : "Hide parts";
  }
  function restoreViewState(search) {
    const query = new URLSearchParams(search), warnings = [];
    const read = (key, fallback, valid, label) => {
      const entries = query.getAll(key);
      if (!entries.length) return fallback;
      if (entries.length === 1 && valid(entries[0])) return entries[0];
      warnings.push(`${label} was invalid; using the default.`);
      return fallback;
    };
    activeTab = read("tab", "stairway", value => tabs.includes(value), "Selected tab");
    castleShown = read("castle", "hidden", value => ["shown", "hidden"].includes(value), "Castle visibility") === "shown";
    renderCastleButton();
    setPartsHidden(read("parts", "shown", value => ["shown", "hidden"].includes(value), "Parts visibility") === "hidden");
    moduleFilter.value = read("module", "", value => value === "" ||
      model.partTree.root.children.some((_, index) => value === String(index + 1)), "Module filter");
    subsetFilter.value = read("subset", "", value => PART_SUBSETS.some(subset => subset.key === value), "Subset filter");
    typeFilter.value = read("type", "", value => value === "" ||
      inventory.sections.some(section => section.key === value), "Type filter");
    locatedOccurrenceId = null;
    renderInventory();
    locatedOccurrenceId = read("part", "", value => value === "" ||
      filteredParts.some(group => group.locations.some(location => location.id === value)), "Selected part") || null;
    renderSelection();
    renderTabs();
    return warnings;
  }
  function viewerTransforms() {
    const transforms = model.getModuleTransforms(moduleExplosion);
    return castleShown ? [...transforms, identityTransform] : transforms;
  }
  function modelGeometry(model, locatedId = locatedOccurrenceId) {
    if (meshCache?.model !== model) {
      const modules = model.partTree.root.children.map((node, index) => ({
        bounds: model.createNodeGeometry(node.id),
        pieces: isParameters ? [] : model.partTree.getLeaves(node.id).map(piece => ({
          node: piece, geometry: model.createNodeGeometry(piece.id),
        })),
        footprint: model.createFootprintGeometry(null, false, true, 0, index + 1),
      }));
      meshCache = { model, modules, bounds: combineGeometries(modules.map(module => module.bounds)) };
    }
    pickRanges = [];
    const castle = castleShown ? model.createCastleGeometry() : null;
    const bounds = castle ? combineGeometries([meshCache.bounds, castle]) : meshCache.bounds;
    const moduleNumber = !isParameters && moduleFilter.value ? Number(moduleFilter.value) : null;
    const orbitKey = moduleNumber === null ? model.partTree.root.id : model.partTree.root.children[moduleNumber - 1].id;
    const visibleIds = isParameters ? null :
      new Set(filteredParts.flatMap(({ locations }) => locations.map(location => location.id)));
    const selectedKey = inventory?.findOccurrence(locatedId)?.key;
    const selectedIds = new Set(filteredParts.find(({ entry }) => entry.key === selectedKey)
      ?.locations.map(location => location.id));
    const transforms = model.getModuleTransforms(moduleExplosion);
    let triangleCount = 0;
    const batches = meshCache.modules.map((module, index) => {
      const geometry = isParameters ? module.bounds : combineGeometries(module.pieces
        .filter(({ node }) => visibleIds.has(node.id)).map(({ node, geometry }) => {
          const start = triangleCount;
          triangleCount += geometry.indices.length / 3;
          pickRanges.push({ id: node.id, start, end: triangleCount });
          if (!selectedIds.size) return geometry;
          const colors = geometry.colors.map((value, index) => selectedIds.has(node.id)
            ? value * 0.25 + [0.18, 0.8, 1][index % 3] * 0.75 : value * 0.6);
          return { ...geometry, colors };
        }));
      const footprint = moduleNumber === null || moduleNumber === index + 1
        ? module.footprint : combineGeometries([]);
      return { geometry, boundsGeometry: module.bounds, footprint,
        renderGeometry: combineGeometries([geometry, footprint]), transform: transforms[index] };
    });
    if (castle) {
      const empty = combineGeometries([]);
      // Hit-test the castle as an occluder without assigning it a selectable part.
      pickRanges.push({ id: null, start: triangleCount, end: triangleCount + castle.indices.length / 3 });
      batches.push({ geometry: castle, boundsGeometry: castle, footprint: empty,
        renderGeometry: castle, transform: identityTransform });
    }
    const visible = isParameters ? bounds : combineGeometries(batches.map(batch => batch.geometry));
    const camera = { orbitKey, orbitBatch: moduleNumber === null ? null : moduleNumber - 1, batches,
      renderGeometry: combineGeometries([visible, ...batches.map(batch => batch.footprint)]) };
    return { visible, bounds, camera };
  }
  function setMeasurementText(element, text) {
    const children = [];
    let end = 0;
    for (const match of text.matchAll(/\b(?:(\d+) )?(\d+)\/(2|4|8|16|32)\b/g)) {
      children.push(document.createTextNode(text.slice(end, match.index)));
      const measurement = document.createElement("span");
      measurement.className = "measurement";
      if (match[1]) {
        const whole = document.createElement("span");
        whole.className = "measurement-whole";
        whole.textContent = `${match[1]} `;
        measurement.append(whole);
      }
      const fraction = document.createElement("span");
      fraction.className = "diagonal-fraction";
      const numerator = document.createElement("span");
      numerator.className = "fraction-numerator";
      numerator.textContent = match[2];
      const denominator = document.createElement("span");
      denominator.className = "fraction-denominator";
      denominator.textContent = match[3];
      fraction.append(numerator, document.createTextNode("/"), denominator);
      measurement.append(fraction);
      children.push(measurement);
      end = match.index + match[0].length;
    }
    children.push(document.createTextNode(text.slice(end)));
    element.replaceChildren(...children);
  }
  function showModel(model) {
    if (isParameters) {
      moduleCount.max = String(Math.min(3, Math.floor(model.stepCount / 2)));
      moduleCount.value = String(model.moduleCount);
    }
    const middleRadius = model.innerRadius + model.stairWidth / 2;
    const run = middleRadius * Math.PI / (2 * model.stepCount);
    setMeasurementText(document.querySelector("#dimensions"),
      `Step rise: ${formatLength(model.stepRise)} in / Step run at middle: ${formatLength(run)} in / ` +
      `Rise to castle top: ${formatLength(model.landingRise)} in / ` +
      `Castle top: ${formatLength(model.totalHeight)} in / ` +
      `Inside arc: ${formatLength(model.innerArcLength)} in`);
    for (const input of parameterInputs) {
      const length = input === stairWidth || input === spindleShoulderAscent;
      const value = length ? formatLength(input.valueAsNumber) : input.value;
      const output = document.querySelector(`output[for="${input.id}"]`);
      output.value = `${value}${length ? " in" : ""}`;
      if (length) setMeasurementText(output, output.value);
      const unit = length ? "inches" : input === moduleCount ? "modules" : "steps";
      input.setAttribute("aria-valuetext", `${value} ${unit}`);
    }
  }
  let model = readModel();
  let inventory = isParameters ? null : new PartInventory(model.partTree);
  if (!isParameters) {
    renderFilters();
    showURLNotice([...initialParameters.warnings, ...restoreViewState(window.location.search)]);
  }
  const geometry = modelGeometry(model);
  const viewer = new WebGLViewer(canvas, geometry.visible, geometry.bounds, geometry.camera);
  showModel(model);
  syncURL();
  function renderTabs() {
    tabs.forEach((name, index) => {
      const selected = name === activeTab;
      tabButtons[index].setAttribute("aria-selected", String(selected));
      tabButtons[index].tabIndex = selected ? 0 : -1;
    });
    if (!isParameters) {
      document.querySelector("#stairway-panel").hidden = activeTab !== "stairway";
      document.querySelector("#part-details").hidden = activeTab === "stairway";
      document.querySelector("#part-details").setAttribute("aria-labelledby", `${activeTab}-tab`);
    }
  }
  function stockLabel(section) {
    const stock = section.stock;
    return section.kind === "hardware" ? `Hardware - ${section.category}` :
      section.kind === "unresolved" ? "Unresolved specifications" :
        section.kind === "plywood" ? `${stock.material} - ${formatLength(stock.thickness)} in` :
          `${stock.material} - ${stock.nominalSize ?? `${formatLength(stock.thickness)} x ${formatLength(stock.width)} in`}`;
  }
  function renderFilters() {
    const selectedModule = moduleFilter.value, selectedSubset = subsetFilter.value, selectedType = typeFilter.value;
    const option = (value, label) => {
      const element = document.createElement("option");
      element.value = value;
      element.textContent = label;
      return element;
    };
    moduleFilter.replaceChildren(option("", "All modules"),
      ...model.partTree.root.children.map((module, index) => option(String(index + 1), module.name)));
    subsetFilter.replaceChildren(...PART_SUBSETS.map(subset => option(subset.key, subset.label)));
    typeFilter.replaceChildren(option("", "All types"),
      ...inventory.sections.map(section => option(section.key, stockLabel(section))));
    moduleFilter.value = Number(selectedModule) <= model.moduleCount ? selectedModule : "";
    subsetFilter.value = selectedSubset;
    typeFilter.value = inventory.sections.some(section => section.key === selectedType) ? selectedType : "";
  }
  function renderSelection() {
    const selectedKey = inventory.findOccurrence(locatedOccurrenceId)?.key;
    for (const [key, option] of partOptions) option.setAttribute("aria-selected", String(key === selectedKey));
    inventoryGroups.setAttribute("aria-activedescendant", partOptions.get(selectedKey)?.id ?? "");
    clearSelectionButton.disabled = locatedOccurrenceId === null;
    renderFind();
  }
  function renderFind() {
    const query = partSearch.value.trim().toLocaleLowerCase();
    findMatches = query ? filteredParts.filter(group =>
      group.title.toLocaleLowerCase().includes(query) ||
      group.locations.some(location => location.name.toLocaleLowerCase().includes(query))) : [];
    const keys = new Set(findMatches.map(({ entry }) => entry.key));
    for (const [key, option] of partOptions) option.setAttribute("data-find-match", String(keys.has(key)));
    const selectedKey = inventory.findOccurrence(locatedOccurrenceId)?.key;
    const index = findMatches.findIndex(({ entry }) => entry.key === selectedKey);
    document.querySelector("#parts-find-status").textContent = !query ? "" :
      !findMatches.length ? "No matches" :
        index < 0 ? `${findMatches.length} matches` : `${index + 1} of ${findMatches.length} matches`;
    findPrevious.disabled = findNext.disabled = findMatches.length === 0;
  }
  function moveFind(direction) {
    if (!findMatches.length) return;
    const selectedKey = inventory.findOccurrence(locatedOccurrenceId)?.key;
    const current = findMatches.findIndex(({ entry }) => entry.key === selectedKey);
    const index = current < 0 ? (direction > 0 ? 0 : findMatches.length - 1) :
      (current + direction + findMatches.length) % findMatches.length;
    selectPart(findMatches[index].locations[0].id, true);
  }
  function renderVisibilitySummary() {
    const descriptions = [];
    if (moduleFilter.value) descriptions.push(`module ${moduleFilter.value}`);
    if (subsetFilter.value) {
      descriptions.push(PART_SUBSETS.find(subset => subset.key === subsetFilter.value).label.toLocaleLowerCase());
    }
    if (typeFilter.value) {
      descriptions.push(stockLabel(inventory.sections.find(section => section.key === typeFilter.value)));
    }
    document.querySelector("#parts-visibility-summary").textContent = descriptions.length
      ? `Showing ${moduleFilter.value ? "" : "all modules, "}${descriptions.join(", ")}` : "Show all parts";
  }
  function selectPart(id, reveal = false) {
    const key = inventory.findOccurrence(id)?.key;
    if (id !== null && !filteredParts.some(({ locations }) => locations.some(location => location.id === id))) {
      throw new RangeError(`Part is not in the current results: ${id}`);
    }
    locatedOccurrenceId = id;
    updateGeometry();
    renderSelection();
    if (detailsActive()) showInformation();
    if (reveal && id !== null) partOptions.get(key).scrollIntoView({ block: "nearest", inline: "nearest" });
    syncURL();
  }
  function clearSelection() {
    if (locatedOccurrenceId === null) return;
    try { selectPart(null); }
    catch (cause) { reportUpdateError(cause); }
  }
  function renderInventory() {
    const results = inventory.filter({
      moduleNumber: moduleFilter.value ? Number(moduleFilter.value) : null,
      subset: subsetFilter.value,
      stockKey: typeFilter.value,
    });
    filteredParts = results.groups;
    renderVisibilitySummary();
    const selectedKey = inventory.findOccurrence(locatedOccurrenceId)?.key;
    const selected = filteredParts.find(({ entry }) => entry.key === selectedKey);
    if (!selected?.locations.some(location => location.id === locatedOccurrenceId)) {
      locatedOccurrenceId = selected?.locations[0].id ?? null;
    }
    document.querySelector("#parts-count").textContent =
      `${results.uniqueCount} unique parts (${results.occurrences.length} total)`;
    const weight = results.occurrences.reduce((sum, { location }) => sum + model.estimateNodeWeightLb(location.id), 0);
    document.querySelector("#parts-weight").textContent = `Weight ~${Math.round(weight)} lb (wood only)`;
    const issues = document.querySelector("#parts-issues");
    const messages = [...new Set(filteredParts.map(({ entry }) => entry.issue).filter(Boolean))];
    issues.hidden = messages.length === 0;
    issues.textContent = messages.join("\n");
    document.querySelector("#parts-empty").hidden = filteredParts.length !== 0;
    inventoryGroups.replaceChildren();
    partOptions.clear();
    for (const [index, { entry, locations, title: partTitle }] of filteredParts.entries()) {
      const item = document.createElement("div");
      item.id = `part-option-${index}`;
      item.className = "part-option";
      item.setAttribute("role", "option");
      const title = document.createElement("strong");
      const partial = locations.length < entry.quantity;
      title.textContent = partTitle + (partial ? ` x ${locations.length} (of ${entry.quantity})` :
        locations.length > 1 ? ` x ${locations.length}` : "");
      const context = document.createElement("span");
      context.className = "part-option-context";
      const modules = [...new Set(locations.map(location => location.moduleNumber))].sort((a, b) => a - b);
      const steps = [...new Set(locations.map(location => location.stepNumber).filter(step => step !== null))]
        .sort((a, b) => a - b);
      context.textContent = `Module${modules.length > 1 ? "s" : ""} ${modules.join(", ")}` +
        (steps.length ? ` / Step${steps.length > 1 ? "s" : ""} ${steps.join(", ")}` : "");
      const description = document.createElement("span");
      description.className = "part-option-context";
      if (entry.issue) description.textContent = entry.issue;
      else {
        const formatted = formatPartListDescription(entry.description);
        setMeasurementText(description, [formatted.stock, formatted.dimensions].filter(Boolean).join(" / "));
      }
      item.append(title, context, description);
      item.addEventListener("click", () => {
        try {
          selectPart(locations[0].id);
          inventoryGroups.focus({ preventScroll: true });
        } catch (cause) { reportUpdateError(cause); }
      });
      partOptions.set(entry.key, item);
      inventoryGroups.append(item);
    }
    renderSelection();
  }
  function detailsNode() {
    if (locatedOccurrenceId) return model.partTree.getNode(locatedOccurrenceId);
    return null;
  }
  function showInformation() {
    closeNeighborPopup();
    if (isParameters) return;
    if (placementActive()) {
      showPlacementInformation();
      return;
    }
    if (renderedViewMode !== "details") {
      renderedDetailsId = null;
      renderedViewMode = "details";
    }
    document.querySelector("#placement-instance-control").hidden = true;
    document.querySelector("#part-details-heading").hidden = false;
    document.querySelector("#placement-status").hidden = true;
    const node = detailsNode();
    const leaf = ["lumber", "plywood", "hardware"].includes(node?.kind);
    partDescription.hidden = !leaf;
    canvas.setAttribute("aria-describedby", "dimensions controls");
    partDescription.replaceChildren();
    document.querySelector("#part-details-empty").hidden = leaf;
    if (!leaf || renderedDetailsId !== node.id) partDetailsError.hidden = true;
    if (!leaf) {
      document.querySelector("#part-details-heading").textContent = "Part details";
      partViewsContainer.hidden = true;
      renderedDetailsId = null;
      return;
    }
    document.querySelector("#part-details-heading").textContent = inventory.findOccurrence(node.id).title;
    const details = document.createElement("div");
    details.className = "part-details";
    partDescription.append(details);
    const description = node.getDescription();
    if (description?.kind === "hardware") {
      const product = document.createElement("p");
      const link = document.createElement("a");
      link.href = description.productUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = `${description.productName} on Amazon`;
      product.append(link);
      details.append(product);
      for (const text of [description.summary, ...description.specifications, description.note]) {
        const paragraph = document.createElement("p");
        paragraph.textContent = text;
        details.append(paragraph);
      }
      if (detailsActive() && renderedDetailsId !== node.id) renderPartViews();
      return;
    }
    if (!description || !["lumber", "plywood"].includes(description.kind)) {
      const unavailable = document.createElement("p");
      unavailable.textContent = "No description is available for this part.";
      details.append(unavailable);
      if (detailsActive() && renderedDetailsId !== node.id) renderPartViews();
      return;
    }
    const formatted = formatPartDescription(description);
    for (const text of [formatted.stock, formatted.summary]) {
      const paragraph = document.createElement("p");
      setMeasurementText(paragraph, text);
      details.append(paragraph);
    }
    if (detailsActive() && renderedDetailsId !== node.id) renderPartViews();
  }
  function updatePlacementDisclosure() {
    placementDetailsToggle.textContent = placementMetadataExpanded ? "Hide details" : "Show details";
    placementDetailsToggle.setAttribute("aria-expanded", String(placementMetadataExpanded));
    placementMetadata.hidden = !placementMetadataExpanded;
  }
  function showPlacementMetadata(view) {
    placementMetadata.replaceChildren();
    for (const [heading, entries] of [
      ["View notes", [`View status: ${view.status}.`, ...view.notes]],
      ["Measurement references", view.dimensions.map(dimension =>
        `${dimension.id}: ${dimension.label}. Reference: ${dimension.reference}`)],
      ["Limitations", placementPlan.unresolved],
    ]) {
      if (!entries.length) continue;
      const title = document.createElement("h3");
      title.textContent = heading;
      placementMetadata.append(title);
      for (const entry of entries) {
        const paragraph = document.createElement("p");
        setMeasurementText(paragraph, entry);
        placementMetadata.append(paragraph);
      }
    }
    placementMetadata.scrollTop = 0;
    placementDetailsToggle.hidden = false;
    updatePlacementDisclosure();
  }
  if (!isParameters) placementDetailsToggle.addEventListener("click", () => {
    placementMetadataExpanded = !placementMetadataExpanded;
    updatePlacementDisclosure();
  });
  function selectStockView(name) {
    closeNeighborPopup();
    activeDrawingName = name;
    if (placementActive()) {
      selectedPlacementView = name;
      const view = placementPlan.views.find(view => view.name === name);
      for (const choice of partViews) choice.button.setAttribute("aria-pressed", String(choice.name === name));
      selectedPartViewer.setGeometry(view.pickGeometry, view.boundsGeometry, { renderGeometry: view.renderGeometry });
      selectedPartViewer.setStandardView(view.standardView);
      document.querySelector("#part-view-selected-name").textContent =
        `View from ${name === "Up" ? "top" : name === "Down" ? "bottom" : name.toLowerCase()}`;
      selectedPartCanvas.setAttribute("aria-label", `${viewLabel(name)} placement of ${placementPlan.title}`);
      const status = document.querySelector("#placement-status");
      status.textContent = [
        placementPlan.status === "unresolved" ? "Placement unresolved." : "Partial placement references.",
        view.status === "no-visible-reference" ? "No visible reference in this view." : "",
        view.occluded.length ? `${view.occluded.length} occluding context parts omitted.` : "",
      ].filter(Boolean).join(" ");
      status.hidden = false;
      showPlacementMetadata(view);
      resetPartDrawing();
      return;
    }
    if (detailsNode()?.kind !== "plywood") selectedStockView = name;
    for (const view of partViews) view.button.setAttribute("aria-pressed", String(view.name === name));
    let caption = viewLabel(name);
    const selected = partViews.find(view => view.name === name);
    if (selected.standardView) {
      const direction = { Up: "top", Down: "bottom" }[name] ?? name.toLowerCase();
      caption = `View from ${direction}, showing ${viewLabel(name).toLowerCase()} ${selected.surface}`;
    }
    document.querySelector("#part-view-selected-name").textContent = caption;
    selectedPartCanvas.setAttribute("aria-label", `${caption} of selected part`);
    if (selectedPartViewer) {
      if (detailsGeometry) selectedPartViewer.setGeometry(detailsGeometry, detailsGeometry,
        name === "Up" ? {} : detailsStockCamera);
      selectedPartViewer.setStandardView(selected.standardView);
      resetPartDrawing();
    }
  }
  function updatePartAnnotations(layoutOnly = false) {
    const node = detailsNode();
    if (!node) return;
    if (placementActive()) {
      renderPlacementAnnotations(partAnnotations, partDrawing, selectedPartViewer,
        placementPlan.views.find(view => view.name === selectedPlacementView));
      renderPartCompass(partCompass, selectedPartViewer);
    } else if (node.kind !== "hardware") {
      const views = model.partTree.getStockViews(node.id);
      renderPartAnnotations(partAnnotations, partDrawing, selectedPartViewer, node.getDescription(),
        views, { layoutOnly });
      renderPartCompass(partCompass, selectedPartViewer, views);
    }
    const showTemplate = activeDrawingName === "Up" && (placementActive() || node.kind !== "hardware");
    partTemplate.style.display = showTemplate ? "" : "none";
    if (showTemplate) renderTreadTemplate(partTemplate, selectedPartViewer,
      placementActive() ? placementPlan.templateGeometry : model.createFootprintGeometry(node.id, true, false));
  }
  function transformPartDrawing() {
    partDrawing.style.transform = `translate(${drawingX}px, ${drawingY}px) scale(${drawingScale})`;
  }
  function resetPartDrawing() {
    if (!detailsActive() || !detailsNode() || partViewsContainer.hidden) return;
    const width = partDrawingStage.clientWidth, height = partDrawingStage.clientHeight;
    if (!width || !height) return;
    drawingViewport = { width, height };
    partDrawing.style.transform = "";
    partDrawing.style.minWidth = "0";
    partDrawing.style.minHeight = "0";
    partDrawing.style.width = `${width}px`;
    partDrawing.style.height = `${height}px`;
    if (placementActive() || detailsNode().kind !== "hardware") {
      updatePartAnnotations(true);
      partDrawing.style.width = `${Math.max(width, parseFloat(partDrawing.style.minWidth))}px`;
      updatePartAnnotations(true);
      partDrawing.style.height = `${Math.max(height, parseFloat(partDrawing.style.minHeight))}px`;
      updatePartAnnotations();
    }
    const drawingWidth = partDrawing.clientWidth, drawingHeight = partDrawing.clientHeight;
    const part = detailsNode().part;
    const preserveAnnotationScale = !placementActive() && part?.outline;
    defaultDrawingScale = drawingScale = preserveAnnotationScale ? 1 :
      Math.min(1, width / drawingWidth, height / drawingHeight);
    const partCenter = preserveAnnotationScale ?
      selectedPartViewer.projectPoint([part.length / 2, part.thickness / 2, part.width / 2]) : null;
    const center = {
      x: partCenter && drawingWidth > width ? partCenter.x : drawingWidth / 2,
      y: partCenter && drawingHeight > height ? partCenter.y : drawingHeight / 2,
    };
    drawingX = width / 2 - center.x * drawingScale;
    drawingY = height / 2 - center.y * drawingScale;
    transformPartDrawing();
    selectedPartViewer.requestRender();
  }
  const drawingControls = {
    pan(dx, dy) {
      drawingX += dx;
      drawingY += dy;
      transformPartDrawing();
    },
    zoom(factor) {
      const scale = Math.max(defaultDrawingScale / 4, Math.min(defaultDrawingScale * 16, drawingScale / factor));
      const ratio = scale / drawingScale;
      drawingX = partDrawingStage.clientWidth / 2 + (drawingX - partDrawingStage.clientWidth / 2) * ratio;
      drawingY = partDrawingStage.clientHeight / 2 + (drawingY - partDrawingStage.clientHeight / 2) * ratio;
      drawingScale = scale;
      transformPartDrawing();
    },
    reset: resetPartDrawing,
  };
  function reportPartViewError(cause) {
    console.error(cause);
    partAnnotations.replaceChildren();
    partViewsContainer.hidden = true;
    partDetailsError.textContent = `Could not render part views: ${cause.message}`;
    partDetailsError.hidden = false;
  }
  for (const view of partViews) view.button.addEventListener("click", () => {
    if (partThumbnails.hidden) return;
    try { selectStockView(view.name); }
    catch (cause) { reportPartViewError(cause); }
  });
  if (!isParameters && !placementActive()) selectStockView(selectedStockView);
  function showPlacementInformation() {
    const node = detailsNode();
    const heading = document.querySelector("#part-details-heading");
    document.querySelector("#part-details-empty").hidden = Boolean(node);
    partDescription.hidden = true;
    document.querySelector("#placement-status").hidden = !node;
    document.querySelector("#placement-instance-control").hidden = true;
    heading.hidden = false;
    if (!node) {
      heading.textContent = "Part placement";
      partViewsContainer.hidden = true;
      renderedDetailsId = null;
      return;
    }
    const key = inventory.findOccurrence(node.id).key;
    const group = filteredParts.find(group => group.entry.key === key);
    heading.textContent = occurrenceTitle(group.locations.find(location => location.id === node.id));
    placementInstance.replaceChildren(...group.locations.map(location => {
      const option = document.createElement("option");
      option.value = location.id;
      option.textContent = occurrenceTitle(location);
      return option;
    }));
    placementInstance.value = node.id;
    document.querySelector("#placement-instance-control").hidden = group.locations.length < 2;
    heading.hidden = group.locations.length > 1;
    if (renderedViewMode === "placement" && renderedDetailsId === node.id) return;
    try {
      placementPlanner ??= new PlacementPlanner(model);
      placementPlan = placementPlanner.plan(node.id);
      renderedViewMode = "placement";
      partDetailsError.hidden = true;
      partAnnotations.style.display = "";
      partCompass.style.display = "";
      partAnnotations.setAttribute("aria-label", "Placement references and dimensions");
      partViewSidebar.hidden = false;
      partThumbnails.hidden = false;
      partViewsContainer.className = "";
      for (const [index, choice] of partViews.entries()) {
        const view = placementPlan.views[index];
        choice.label.textContent = viewLabel(choice.name);
        choice.button.setAttribute("aria-label", `${viewLabel(choice.name)} placement`);
        choice.button.setAttribute("title", `${viewLabel(choice.name)} placement`);
        choice.standardView = view.standardView;
        if (choice.viewer) choice.viewer.setGeometry(placementPlan.geometry);
        else choice.viewer = new WebGLViewer(choice.canvas, placementPlan.geometry);
        choice.viewer.setStandardView(view.standardView);
      }
      if (partPreviewViewer) {
        partPreviewViewer.setGeometry(placementPlan.previewPickGeometry, placementPlan.previewGeometry,
          { renderGeometry: placementPlan.previewGeometry });
        partPreviewViewer.reset();
      } else partPreviewViewer = new WebGLViewer(partPreviewCanvas, placementPlan.previewPickGeometry,
        placementPlan.previewGeometry, { renderGeometry: placementPlan.previewGeometry });
      partPreviewCanvas.setAttribute("aria-label", `Rotatable placement preview of ${placementPlan.title}`);
      const first = placementPlan.views.find(view => view.name === selectedPlacementView);
      if (!selectedPartViewer) selectedPartViewer = new WebGLViewer(selectedPartCanvas, placementPlan.geometry,
        first.boundsGeometry, { renderGeometry: first.renderGeometry, transparent: true });
      partViewsContainer.hidden = false;
      selectStockView(selectedPlacementView);
      renderedDetailsId = node.id;
    } catch (cause) { reportPartViewError(cause); }
  }
  if (!isParameters) placementInstance.addEventListener("change", () => {
    try { selectPart(placementInstance.value); }
    catch (cause) { reportUpdateError(cause); }
  });
  function renderPartViews() {
    partDetailsError.hidden = true;
    partViewsContainer.hidden = true;
    try {
      const node = detailsNode();
      if (!node) throw new Error("Select a physical part before opening details.");
      const part = node.part;
      const hardware = node.kind === "hardware";
      placementDetailsToggle.hidden = true;
      placementMetadata.hidden = true;
      partTemplate.style.display = "none";
      partAnnotations.setAttribute("aria-label", "Feature dimensions and reference-angle diagrams");
      partAnnotations.style.display = hardware ? "none" : "";
      partCompass.style.display = hardware ? "none" : "";
      selectedPartCanvas.setAttribute("tabindex", "-1");
      partViewSidebar.hidden = hardware;
      if (hardware) {
        partThumbnails.hidden = true;
        partViewsContainer.className = "hardware-part-view";
        partAnnotations.replaceChildren();
        partDrawing.style.minHeight = "0";
        partDrawing.style.minWidth = "";
        const geometry = part.createGeometry();
        const camera = { renderGeometry: combineGeometries([geometry, model.createFootprintGeometry(node.id)]) };
        if (selectedPartViewer) selectedPartViewer.setGeometry(geometry, geometry, camera);
        else selectedPartViewer = new WebGLViewer(selectedPartCanvas, geometry, geometry, { ...camera, transparent: true });
        selectedPartViewer.setViewportInsets({});
        selectedPartViewer.reset();
        document.querySelector("#part-view-selected-name").textContent =
          "3D view";
        selectedPartCanvas.setAttribute("aria-label",
          "3D view of selected part");
        partViewsContainer.hidden = false;
        resetPartDrawing();
        renderedDetailsId = node.id;
        return;
      }
      if (typeof part.createStockGeometry !== "function") {
        throw new Error("Stock-aligned views are not available for this part.");
      }
      const geometry = part.createStockGeometry();
      const previewGeometry = part.createGeometry();
      const previewCamera = { renderGeometry: combineGeometries([
        previewGeometry, model.createFootprintGeometry(node.id),
      ]) };
      const stockCamera = { renderGeometry: combineGeometries([
        geometry, model.createFootprintGeometry(node.id, true),
      ]) };
      detailsGeometry = geometry;
      detailsStockCamera = stockCamera;
      if (partPreviewViewer) {
        partPreviewViewer.setGeometry(previewGeometry, previewGeometry, previewCamera);
        partPreviewViewer.reset();
      } else partPreviewViewer = new WebGLViewer(partPreviewCanvas, previewGeometry, previewGeometry, previewCamera);
      partPreviewCanvas.setAttribute("aria-label", `Rotatable 3D preview of ${inventory.findOccurrence(node.id).title}`);
      const views = model.partTree.getStockViews(node.id);
      const description = node.getDescription();
      const singleView = node.kind === "plywood";
      partThumbnails.hidden = singleView;
      partViewsContainer.className = singleView ? "single-stock-view" : "";
      for (const [index, view] of partViews.entries()) {
        const direction = views[index].direction;
        view.surface = views[index].surface;
        const caption = `${viewLabel(view.name)} ${view.surface}`;
        const annotated = getPartFeatures(description, views[index], views).some(feature =>
          feature.lines.length || feature.dimensions.length || feature.angles.length);
        view.label.textContent = viewLabel(view.name);
        if (annotated) {
          const marker = document.createElement("span");
          marker.className = "part-view-marker";
          marker.textContent = "\u25c6";
          marker.setAttribute("aria-hidden", "true");
          marker.setAttribute("title", "Measurements in this view");
          view.label.append(marker);
        }
        view.button.setAttribute("aria-label", `${caption}${annotated ? ", measurements in this view" : ""}`);
        view.button.setAttribute("title", annotated ? "Measurements in this view" : caption);
        view.standardView = STANDARD_VIEWS.find(stock =>
          stock.direction.every((value, axis) => value === direction[axis])).name;
        if (singleView) continue;
        if (view.viewer) view.viewer.setGeometry(geometry, geometry, stockCamera);
        else {
          view.viewer = new WebGLViewer(view.canvas, geometry, geometry, stockCamera);
        }
        view.viewer.setStandardView(view.standardView);
      }
      if (selectedPartViewer) selectedPartViewer.setGeometry(geometry, geometry, stockCamera);
      else selectedPartViewer = new WebGLViewer(selectedPartCanvas, geometry, geometry, { ...stockCamera, transparent: true });
      partViewsContainer.hidden = false;
      if (singleView) {
        const sheetViews = { riser: "Front", siding: "Right", frontSiding: "Right", backPanel: "Back" };
        selectStockView(sheetViews[node.key] ?? "Up");
      } else selectStockView(selectedStockView);
      renderedDetailsId = node.id;
    } catch (cause) {
      reportPartViewError(cause);
    }
  }
  function selectTab(name) {
    try {
      if (detailsActive() && renderedDetailsId && !partViewsContainer.hidden) {
        viewStates.set(activeTab, { id: renderedDetailsId, preview: partPreviewViewer ? {
          orientation: partPreviewViewer.orientation,
          zoomFactor: partPreviewViewer.zoomFactor, panOffset: [...partPreviewViewer.panOffset],
        } : null, viewport: drawingViewport, drawingScale, defaultDrawingScale, drawingX, drawingY });
      }
      activeTab = name;
      renderTabs();
      showInformation();
      const state = viewStates.get(name);
      if (state?.id === renderedDetailsId && detailsActive() && !partViewsContainer.hidden) {
        if (state.preview && partPreviewViewer) Object.assign(partPreviewViewer, state.preview);
        if (state.viewport?.width === drawingViewport?.width && state.viewport?.height === drawingViewport?.height) {
          ({ drawingScale, defaultDrawingScale, drawingX, drawingY } = state);
          transformPartDrawing();
        }
      }
      requestRenders();
      syncURL();
    } catch (cause) {
      reportUpdateError(cause);
    }
  }
  tabButtons.forEach((button, index) => {
    button.addEventListener("click", () => selectTab(tabs[index]));
    button.addEventListener("keydown", event => {
      let target;
      switch (event.key) {
        case "ArrowLeft": target = (index + tabs.length - 1) % tabs.length; break;
        case "ArrowRight": target = (index + 1) % tabs.length; break;
        case "Home": target = 0; break;
        case "End": target = tabs.length - 1; break;
        default: return;
      }
      event.preventDefault();
      selectTab(tabs[target]);
      tabButtons[target].focus();
    });
  });
  function applyPartFilters() {
    renderInventory();
    document.querySelector("#parts-results").scrollTop = 0;
    updateGeometry();
    showInformation();
    syncURL();
  }
  if (!isParameters) {
    clearSelectionButton.addEventListener("click", clearSelection);
    document.querySelector("#toggle-parts").addEventListener("click", () => {
      setPartsHidden(!document.querySelector("#parts-sidebar").hidden);
      requestRenders();
      syncURL();
    });
    for (const filter of [moduleFilter, subsetFilter, typeFilter]) {
      filter.addEventListener("change", () => {
        try { applyPartFilters(); }
        catch (cause) { reportUpdateError(cause); }
      });
    }
    document.querySelector("#parts-clear-filters").addEventListener("click", () => {
      try {
        moduleFilter.value = "";
        subsetFilter.value = "";
        typeFilter.value = "";
        applyPartFilters();
      } catch (cause) { reportUpdateError(cause); }
    });
    partSearch.addEventListener("input", () => {
      try {
        renderFind();
        if (findMatches.length) selectPart(findMatches[0].locations[0].id, true);
      } catch (cause) { reportUpdateError(cause); }
    });
    partSearch.addEventListener("keydown", event => {
      if (event.key !== "Enter" || event.isComposing) return;
      event.preventDefault();
      try { moveFind(event.shiftKey ? -1 : 1); }
      catch (cause) { reportUpdateError(cause); }
    });
    for (const [button, direction] of [[findPrevious, -1], [findNext, 1]]) {
      button.addEventListener("click", () => {
        try { moveFind(direction); }
        catch (cause) { reportUpdateError(cause); }
      });
    }
    inventoryGroups.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        event.preventDefault();
        clearSelection();
        return;
      }
      if (!filteredParts.length) return;
      const selectedKey = inventory.findOccurrence(locatedOccurrenceId)?.key;
      let index = filteredParts.findIndex(({ entry }) => entry.key === selectedKey);
      switch (event.key) {
        case "ArrowDown": index = Math.min(index + 1, filteredParts.length - 1); break;
        case "ArrowUp": index = index < 0 ? filteredParts.length - 1 : Math.max(0, index - 1); break;
        case "Home": index = 0; break;
        case "End": index = filteredParts.length - 1; break;
        default: return;
      }
      event.preventDefault();
      try { selectPart(filteredParts[index].locations[0].id, true); }
      catch (cause) { reportUpdateError(cause); }
    });
  }
  renderTabs();
  showInformation();
  function updateGeometry() {
    const updatedGeometry = modelGeometry(model);
    viewer.setGeometry(updatedGeometry.visible, updatedGeometry.bounds, updatedGeometry.camera);
    error.hidden = true;
  }
  function reportUpdateError(cause) {
    console.error(cause);
    showError(`Could not update the model: ${cause.message}`);
  }
  function setView() {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    const startValue = moduleExplosion;
    const target = modulesSeparated ? 1 : 0;
    const startTime = performance.now();
    try {
      if (reducedMotion.matches || startValue === target) {
        moduleExplosion = target;
        viewer.setBatchTransforms(viewerTransforms());
        return;
      }
      function animate(time) {
        animationFrame = 0;
        try {
          const progress = Math.max(0, Math.min(1, (time - startTime) / 600));
          const eased = progress * progress * (3 - 2 * progress);
          moduleExplosion = startValue + (target - startValue) * eased;
          viewer.setBatchTransforms(viewerTransforms());
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
  function renderModulesButton() {
    modulesView.textContent = modulesSeparated ? "Join modules" : "Split modules";
    modulesView.setAttribute("aria-pressed", String(modulesSeparated));
  }
  renderModulesButton();
  modulesView.addEventListener("click", () => {
    modulesSeparated = !modulesSeparated;
    renderModulesButton();
    setView();
  });
  function renderCastleButton() {
    if (!castleView) return;
    castleView.textContent = castleShown ? "Hide castle" : "Show castle";
    castleView.setAttribute("aria-pressed", String(castleShown));
  }
  castleView?.addEventListener("click", () => {
    try {
      castleShown = !castleShown;
      renderCastleButton();
      updateGeometry();
      syncURL();
    } catch (cause) {
      reportUpdateError(cause);
    }
  });
  reducedMotion.addEventListener("change", setView);
  function updateParameters(next, restoreFromURL = false) {
    try {
      const previous = parameters;
      parameters = next;
      let updatedModel;
      try { updatedModel = readModel(); }
      catch (cause) { parameters = previous; throw cause; }
      if (updatedModel.partTree.topologyKey !== model.partTree.topologyKey) locatedOccurrenceId = null;
      model = updatedModel;
      placementPlanner = null;
      placementPlan = null;
      viewStates.clear();
      if (!isParameters) {
        inventory = new PartInventory(model.partTree);
        renderedDetailsId = null;
        renderFilters();
        if (!restoreFromURL) renderInventory();
      }
      if (restoreFromURL) {
        showURLNotice([...readParameters(window.location.search).warnings,
          ...(!isParameters ? restoreViewState(window.location.search) : [])]);
      }
      showModel(updatedModel);
      updateGeometry();
      showInformation();
      syncURL();
      error.hidden = true;
    } catch (cause) {
      reportUpdateError(cause);
    }
  }
  for (const [index, input] of parameterInputs.entries()) {
    input.addEventListener("input", () => {
      updateParameters({ ...parameters, [PARAMETER_FIELDS[index].key]: input.valueAsNumber });
    });
  }
  if (isParameters) {
    document.querySelector("#reset-defaults").addEventListener("click", () => {
      for (const field of PARAMETER_FIELDS) document.querySelector(`#${field.id}`).value = String(field.default);
      updateParameters(Object.fromEntries(PARAMETER_FIELDS.map(field => [field.key, field.default])));
      notice.hidden = true;
    });
  }
  window.addEventListener("popstate", () => {
    const restored = readParameters(window.location.search);
    if (isParameters) {
      for (const field of PARAMETER_FIELDS) document.querySelector(`#${field.id}`).value = String(restored.values[field.key]);
    }
    updateParameters(restored.values, true);
  });
  function attachViewerControls(canvas, getViewer, onPick = null, rotate = true) {
    const pointers = new Map();
    let previous = null;
    let tap = null;
    function measure() {
      const [first, second] = pointers.values();
      if (!first) return null;
      return {
        count: pointers.size,
        x: second ? (first.x + second.x) / 2 : first.x,
        y: second ? (first.y + second.y) / 2 : first.y,
        distance: second ? Math.hypot(second.x - first.x, second.y - first.y) : 0,
        angle: second ? Math.atan2(second.y - first.y, second.x - first.x) : 0,
      };
    }
    canvas.addEventListener("pointerdown", event => {
      if (!getViewer()) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      canvas.setPointerCapture(event.pointerId);
      canvas.focus({ preventScroll: true });
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      tap = pointers.size === 1 ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
      previous = measure();
    });
    canvas.addEventListener("pointermove", event => {
      const viewer = getViewer();
      if (!viewer) return;
      if (!pointers.has(event.pointerId)) return;
      if (tap && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 5) tap = null;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const current = measure();
      if (previous?.count === 1 && current.count === 1) {
        if (rotate) viewer.orbit(current.x - previous.x, current.y - previous.y);
        else viewer.pan(current.x - previous.x, current.y - previous.y);
      } else if (previous?.count >= 2 && current.count >= 2) {
        viewer.pan(current.x - previous.x, current.y - previous.y);
        if (previous.distance > 0 && current.distance > 0) {
          viewer.zoom(previous.distance / current.distance);
          const delta = current.angle - previous.angle;
          if (rotate && delta !== 0) viewer.roll(Math.atan2(Math.sin(delta), Math.cos(delta)));
        }
      }
      previous = current;
    });
    function endPointer(event) {
      const pick = event.type === "pointerup" && tap?.id === event.pointerId &&
        Math.hypot(event.clientX - tap.x, event.clientY - tap.y) <= 5;
      tap = null;
      pointers.delete(event.pointerId);
      previous = measure();
      if (pick) onPick?.(event);
    }
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
      canvas.addEventListener(name, endPointer);
    }
    canvas.addEventListener("wheel", event => {
      const viewer = getViewer();
      if (!viewer) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
      const delta = Math.max(-1000, Math.min(1000, event.deltaY * unit));
      viewer.zoom(Math.exp(delta * 0.0015));
    }, { passive: false });
    canvas.addEventListener("keydown", event => {
      const viewer = getViewer();
      if (!viewer) return;
      function move(dx, dy) {
        if (!rotate || event.shiftKey) viewer.pan(dx, dy);
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
        case "Escape":
          if (isParameters || canvas.id !== "viewer" || activeTab !== "stairway") return;
          clearSelection();
          break;
        default: return;
      }
      event.preventDefault();
    });
  }
  attachViewerControls(canvas, () => viewer, event => {
    if (isParameters || activeTab !== "stairway") return;
    try {
      const bounds = canvas.getBoundingClientRect();
      const triangle = viewer.hitTest((event.clientX - bounds.left) * canvas.clientWidth / bounds.width,
        (event.clientY - bounds.top) * canvas.clientHeight / bounds.height);
      if (triangle === null) {
        clearSelection();
        return;
      }
      const hit = pickRanges.find(range => triangle >= range.start && triangle < range.end);
      if (!hit) throw new Error("The selected triangle has no matching part.");
      if (hit.id === null) clearSelection();
      else selectPart(hit.id, true);
    } catch (cause) { reportUpdateError(cause); }
  });
  if (!isParameters) {
    neighborLink.addEventListener("click", event => {
      event.preventDefault();
      if (inspectedNeighborId === null) return;
      try {
        const id = inspectedNeighborId;
        closeNeighborPopup();
        if (!filteredParts.some(group => group.locations.some(location => location.id === id))) {
          moduleFilter.value = "";
          subsetFilter.value = "";
          typeFilter.value = "";
          renderInventory();
        }
        selectPart(id, true);
      } catch (cause) { reportUpdateError(cause); }
    });
    window.addEventListener("scroll", closeNeighborPopup, true);
    window.addEventListener("wheel", closeNeighborPopup, { capture: true, passive: true });
    function pickPlacement(event, target, getViewer, getRanges) {
      if (!placementActive()) return;
      try {
        closeNeighborPopup();
        const bounds = target.getBoundingClientRect();
        const triangle = getViewer().hitTest(
          (event.clientX - bounds.left) * target.clientWidth / bounds.width,
          (event.clientY - bounds.top) * target.clientHeight / bounds.height);
        if (triangle === null) return;
        const hit = getRanges().find(range => triangle >= range.start && triangle < range.end);
        if (!hit) throw new Error("The selected Placement triangle has no matching part.");
        if (hit.id === locatedOccurrenceId) return;
        const location = inventory.findOccurrence(hit.id)?.locations.find(location => location.id === hit.id);
        if (!location) throw new Error("The selected Placement neighbor has no inventory instance.");
        pendingNeighbor = { id: hit.id, title: occurrenceTitle(location) };
      } catch (cause) { reportUpdateError(cause); }
    }
    function showNeighborPopup(event) {
      if (!pendingNeighbor) return;
      try {
        inspectedNeighborId = pendingNeighbor.id;
        neighborLink.textContent = pendingNeighbor.title;
        pendingNeighbor = null;
        neighborPopup.showPopover();
        const popupBounds = neighborPopup.getBoundingClientRect();
        neighborPopup.style.left = `${Math.max(8, Math.min(event.clientX + 10,
          window.innerWidth - popupBounds.width - 8))}px`;
        neighborPopup.style.top = `${Math.max(8, Math.min(event.clientY + 10,
          window.innerHeight - popupBounds.height - 8))}px`;
        neighborLink.focus();
      } catch (cause) { reportUpdateError(cause); }
    }
    // Opening on pointerup would let the same click immediately light-dismiss the popover.
    partDrawingStage.addEventListener("click", showNeighborPopup);
    partPreviewCanvas.addEventListener("click", showNeighborPopup);
    attachViewerControls(partDrawingStage, () =>
      detailsActive() && detailsNode() && !partViewsContainer.hidden ? drawingControls : null,
    event => pickPlacement(event, selectedPartCanvas, () => selectedPartViewer,
      () => placementPlan.views.find(view => view.name === selectedPlacementView).pickRanges), false);
    attachViewerControls(partPreviewCanvas, () =>
      detailsActive() && detailsNode() && !partViewSidebar.hidden ? partPreviewViewer : null,
    event => pickPlacement(event, partPreviewCanvas, () => partPreviewViewer, () => placementPlan.previewPickRanges));
    document.querySelector("#reset-part-preview").addEventListener("click", () => partPreviewViewer?.reset());
    partPreviewCanvas.addEventListener("webglcontextlost", () => {
      reportPartViewError(new Error("The WebGL context was lost. Reload the page to restore the part preview."));
    });
    selectedPartCanvas.addEventListener("webglcontextlost", () => {
      reportPartViewError(new Error("The WebGL context was lost. Reload the page to restore the part view."));
    });
  }
  canvas.addEventListener("webglcontextlost", () => {
    showError("The WebGL context was lost. Reload the page to restore the model.");
  });
  document.querySelector("#reset").addEventListener("click", () => viewer.reset());
  function requestRenders() {
    viewer.requestRender();
    if (detailsActive() && detailsNode()) {
      for (const view of partViews) view.viewer?.requestRender();
      selectedPartViewer?.requestRender();
      if (!partViewSidebar.hidden) partPreviewViewer?.requestRender();
      if (selectedPartViewer && !partViewsContainer.hidden) {
        try {
          if (drawingViewport?.width !== partDrawingStage.clientWidth ||
              drawingViewport?.height !== partDrawingStage.clientHeight) resetPartDrawing();
        }
        catch (cause) { reportPartViewError(cause); }
      }
    }
  }
  const observer = new ResizeObserver(requestRenders);
  observer.observe(canvas);
  for (const view of partViews) observer.observe(view.canvas);
  if (!isParameters) {
    observer.observe(selectedPartCanvas);
    observer.observe(partPreviewCanvas);
    observer.observe(partDrawingStage);
  }
  window.addEventListener("resize", () => {
    closeNeighborPopup();
    drawingViewport = null;
    requestRenders();
  });
} catch (cause) {
  console.error(cause);
  showError(`Could not display the model: ${cause.message}`);
}
