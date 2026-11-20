// Reject smooth neutral ramps cast outward from a sharp, darker tool edge.
// Inspect the RGB ratios before morphology can close a shadow's hard end edges.
function captureShadowMask(bright, saturation, width, height) {
  const ramps = new Uint8Array(bright.length);
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  for (let y = 3; y < height - 3; y++) for (let x = 3; x < width - 3; x++) {
    const start = y * width + x;
    if (bright[start] > .48) continue;
    for (const [dx, dy] of directions) {
      const delta = dx + dy * width;
      const first = start + delta;
      if (bright[first] < .58 || bright[first] > .83 || saturation[first] > .055 || bright[first] - bright[start] < .16) continue;
      const stepLength = Math.hypot(dx, dy);
      const minSteps = Math.ceil(5 * PROC_PX_PER_MM / stepLength);
      const maxSteps = Math.ceil(25 * PROC_PX_PER_MM / stepLength);
      const checkEvery = Math.max(2, Math.round(PROC_PX_PER_MM / stepLength));
      let last = bright[first], lightening = 0, k = 2;
      for (; k <= maxSteps; k++) {
        const tx = x + dx * k, ty = y + dy * k;
        if (tx < 2 || ty < 2 || tx >= width - 2 || ty >= height - 2) break;
        const idx = start + k * delta;
        const value = bright[idx];
        if (saturation[idx] > .055 || value - last > .035 || value - last < -.02) break;
        if ((k - 1) % checkEvery === 0 && value - bright[idx - checkEvery * delta] > .012) lightening++;
        if (value >= .94) {
          if (k >= minSteps && value - bright[first] >= .15 && lightening >= (k - 1) / checkEvery * .8) {
            for (let j = 1; j <= k; j++) {
              const at = start + j * delta;
              ramps[at] = 1;
            }
          }
          break;
        }
        last = value;
      }
    }
  }
  // Require a band with neighboring profiles. Extend over the narrow edge response
  // at the hard ends, then protect the dark or colored pixels of the actual tool.
  const supported = boxErode(ramps, width, height, 2);
  const trim = boxDilate(supported, width, height, 6);
  for (let i = 0; i < trim.length; i++) {
    if (bright[i] < .55 || saturation[i] > .07) trim[i] = 0;
  }
  return trim;
}

const CAPTURE_PROFILES = {
  scissors: { length: [130, 380], aspect: [1.5, 8], area: [420, 18000], fill: [.16, .84] },
  pliers: { length: [75, 420], aspect: [1.3, 10], area: [250, 19000], fill: [.17, .87], raised: true },
  "needle-nose": { length: [95, 380], aspect: [1.65, 12], area: [250, 15000], fill: [.12, .83], raised: true, tip: true },
  screwdriver: { length: [65, 490], aspect: [2.2, 35], area: [125, 12500], fill: [.13, .95], raised: true },
  punch: { length: [45, 300], aspect: [2, 32], area: [115, 8500], fill: [.2, .98], raised: true },
  wrench: { length: [55, 490], aspect: [1.65, 17], area: [160, 23000], fill: [.18, .92] }
};

function captureShape(points) {
  const hull = convexHull(points);
  let length = 0, longSide = 0, shortSide = 0, minBoxArea = Infinity;
  let box = null;
  for (let i = 0; i < hull.length; i++) {
    const p = hull[i], q = hull[(i + 1) % hull.length];
    const edgeLength = dist(p, q);
    if (!edgeLength) continue;
    const ux = (q.x - p.x) / edgeLength, uy = (q.y - p.y) / edgeLength;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let j = 0; j < hull.length; j++) {
      const v = hull[j];
      const x = v.x * ux + v.y * uy, y = v.y * ux - v.x * uy;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      if (j > i) length = Math.max(length, dist(p, v));
    }
    const w = x1 - x0, h = y1 - y0;
    if (w * h < minBoxArea) {
      minBoxArea = w * h;
      longSide = Math.max(w, h);
      shortSide = Math.min(w, h);
      box = w >= h ? { ux, uy, min: x0 } : { ux: -uy, uy: ux, min: y0 };
    }
  }
  const area = Math.abs(polygonArea(points));
  let tipWidth = Infinity;
  if (box && shortSide > 0) {
    const { ux, uy, min } = box;
    const projection = points.map(p => ({ x: p.x * ux + p.y * uy, y: p.y * ux - p.x * uy }));
    for (const fraction of [.08, .92]) {
      const x = min + longSide * fraction;
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < projection.length; i++) {
        const a = projection[i], b = projection[(i + 1) % projection.length];
        if ((a.x > x) === (b.x > x)) continue;
        const y = a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
        lo = Math.min(lo, y);
        hi = Math.max(hi, y);
      }
      if (Number.isFinite(hi)) tipWidth = Math.min(tipWidth, (hi - lo) / shortSide);
    }
  }
  return { length, area, aspect: longSide / shortSide, fill: area / minBoxArea, tipWidth };
}

function checkCaptureContour(tool) {
  const capture = tool.capture;
  const shape = capture?.shape || captureShape(tool.points);
  const profile = capture && CAPTURE_PROFILES[capture.kind];
  const expected = capture?.expectedLength;
  const warnings = [];
  if (tool.edgeWarning) warnings.push("Near the paper edge. Part of the tool may be clipped.");
  if (Number.isFinite(tool.scaleConfidence) && tool.scaleConfidence < 85) warnings.push("Weak paper scale or edge evidence. Check the outline against the photo.");
  if (!profile) warnings.push("Tool type unassigned. Check the complete outline against the photo.");
  if (profile) {
    const [minLength, maxLength] = profile.length;
    const [minAspect, maxAspect] = profile.aspect;
    const [minArea, maxArea] = profile.area;
    const [minFill, maxFill] = profile.fill;
    if (shape.length < minLength || shape.length > maxLength) {
      warnings.push(capture.kind === "scissors" && shape.length < minLength
        ? "Unusually short scissors outline. Check that the full blade is visible."
        : "Length is outside the usual range for this tool type.");
    }
    if (shape.aspect < minAspect || shape.aspect > maxAspect) warnings.push("Unusual length-to-width ratio. Check for a missing tip or an included shadow.");
    if (shape.area < minArea || shape.area > maxArea || shape.fill < minFill || shape.fill > maxFill) {
      warnings.push("Unusual contour area for this tool type. Check for missing or extra regions.");
    }
    if (profile.tip && shape.tipWidth > .56) warnings.push("The outline has no narrow end. Check the jaw tips.");
  }
  if (expected && Math.abs(shape.length - expected) > Math.max(4, expected * .06)) {
    warnings.push(shape.length < expected
      ? "Detected outline is shorter than expected. Check the blade or tip before rescaling."
      : "Detected outline is longer than expected. Check the paper scale and any shadows.");
  }
  return { shape, warnings, canAutoAccept: !!(profile && expected && tool.scaleConfidence >= 85 && !warnings.length) };
}

function captureMeasurement(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 && number <= 1000 ? number : null;
}

function restoreCaptureMetadata(value) {
  if (!value || !Array.isArray(value.points) || value.points.length < 3 ||
      value.points.some(p => !Number.isFinite(p?.x) || !Number.isFinite(p?.y))) return null;
  const kind = Object.hasOwn(CAPTURE_PROFILES, value.kind) ? value.kind : "";
  return {
    points: value.points,
    clearance: Number.isFinite(value.clearance) ? Math.max(0, value.clearance) : 0,
    shape: captureShape(value.points),
    kind,
    expectedLength: captureMeasurement(value.expectedLength),
    measuredLength: captureMeasurement(value.measuredLength)
  };
}

function buildCaliperPocket(capture, factor) {
  const points = capture.points.map(p => ({x:p.x*factor,y:p.y*factor}));
  return makeRoundPocket(points,capture.clearance);
}

function setCaliperLength(tool, measured) {
  const capture = tool.capture;
  if (!capture?.shape.length || capture.measuredLength === measured) return;
  const oldFactor = capture.measuredLength ? capture.measuredLength / capture.shape.length : 1;
  const factor = measured ? measured / capture.shape.length : 1;
  const oldOrigin = tool.captureOrigin || { x: -capture.clearance, y: -capture.clearance };
  const pocket = buildCaliperPocket(capture, factor);
  const { origin, ...norm } = pocket;
  const movePulls = (pulls = []) => pulls.map(pull => {
    const x = ((pull.anchorX ?? pull.x) + oldOrigin.x) * factor / oldFactor - origin.x;
    const y = ((pull.anchorY ?? pull.y) + oldOrigin.y) * factor / oldFactor - origin.y;
    const anchor = closestPointOnContour({ x, y }, norm.points);
    return pullFromContourPoint(anchor, pull.r, norm.points);
  });
  const items = state.items.filter(item => item.toolId === tool.id);
  const instancePulls = items.map(item => movePulls(itemPulls(item)));
  tool.defaultPulls = movePulls(tool.defaultPulls);
  Object.assign(tool, norm, { pocketPoints:norm.points, captureOrigin: origin, fitStatus: "" });
  defaultToolCurve(tool);
  capture.measuredLength = measured;
  items.forEach((item, i) => {
    item.pulls = instancePulls[i];
    invalidateContourCache(item);
  });
  state.lastArrangeReport = null;
}

function renderCaptureReview(tool) {
  const capture = tool.capture;
  const { shape, warnings } = checkCaptureContour(tool);
  el.captureKind.value = capture?.kind || "";
  el.captureExpected.value = capture?.expectedLength ?? "";
  el.captureMeasured.value = capture?.measuredLength ?? "";
  [el.captureKind, el.captureExpected, el.captureMeasured, el.applyCaliper].forEach(input => { input.disabled = !capture; });
  el.captureReading.textContent = capture
    ? `Detected span ${shape.length.toFixed(1)} mm · ${capture.measuredLength ? `Adjusted to ${capture.measuredLength} mm · ` : ""}${capture.clearance} mm clearance`
    : "Upload a photo to use caliper correction on this outline.";
  el.captureWarnings.textContent = warnings.join(" ");
  const raised = capture && CAPTURE_PROFILES[capture.kind]?.raised;
  el.captureParallax.textContent = capture
    ? raised
      ? "Raised handles and jaws can appear larger than they are. Take the photo straight down and check the span with calipers."
      : "Paper provides the scale. Raised areas can appear larger. Check the measurement for thicker tools."
    : "";
  el.acceptAllInPreview.disabled = !nextUnacceptedTool();
}

function updateCaptureChecks() {
  const tool = getTool(state.previewToolId);
  if (!tool?.capture) return;
  tool.capture.kind = el.captureKind.value;
  tool.capture.expectedLength = captureMeasurement(el.captureExpected.value);
  renderCaptureReview(tool);
  scheduleAutosave();
}

function applyCaptureCaliper() {
  const tool = getTool(state.previewToolId);
  if (!tool?.capture || !el.captureMeasured.reportValidity()) return;
  const measured = captureMeasurement(el.captureMeasured.value);
  if (measured === tool.capture.measuredLength) return;
  try {
    setCaliperLength(tool, measured);
    renderAll();
    showPreview(tool);
    showNotice(measured ? "Caliper scale applied to every copy of this tool." : "Photo scale restored.");
  } catch (err) {
    showNotice(err.message, "warn");
  }
}

function acceptAllCaptureContours() {
  const pending = state.tools.filter(tool => !tool.accepted);
  if (!pending.length) {
    showNotice("No contours are waiting for review.");
    return;
  }
  pending.forEach(tool => { tool.accepted = true; });
  if (state.previewToolId) hidePreview();
  addAcceptedToolsToDrawer();
  showNotice(`${pending.length} contour(s) accepted.`);
}
