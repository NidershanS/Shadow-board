const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 840 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const file = path.resolve(__dirname, "../outputs/index.html").replaceAll("\\", "/");
    await page.goto("file:///" + file);
    const baseline = await page.evaluate(async () => {
      const points = coords => coords.map(([x, y]) => ({ x, y }));
      const complete = points([[0,10],[133,0],[169,15],[130,33],[92,40],[60,55],[0,50],[0,10]]);
      const missingBlade = points([[0,5],[100,0],[116,20],[112,54],[70,60],[22,62],[0,52],[0,5]]);
      const fake = (id, outline) => ({
        id, name: id, points: outline, accepted: false, scaleConfidence: 95, sourceIndex: 0,
        capture: { points: outline, clearance: 2, kind: "", expectedLength: null, measuredLength: null, shape: captureShape(outline) },
        defaultPulls: [], width: bboxPoints(outline).x1, height: bboxPoints(outline).y1,
        preview: samplePreview({ points: outline, width: bboxPoints(outline).x1, height: bboxPoints(outline).y1 })
      });
      const a = fake("Full scissors", complete), b = fake("Short scissors", missingBlade);
      const unassigned = checkCaptureContour(a);
      const expected = a.capture.shape.length;
      ingestPhoto = async () => [a, b];
      state.pendingFiles = [new File([""], "fixture.png", {type: "image/png"})];
      el.batchCaptureKind.value = "scissors";
      el.batchCaptureExpected.value = String(expected);
      el.batchCaptureAuto.checked = true;
      await detectPending();
      return {
        expected, unassigned: unassigned.canAutoAccept, accepted: a.accepted, shortAccepted: b.accepted,
        count: state.items.length, preview: state.previewToolId, warnings: checkCaptureContour(b).warnings
      };
    });
    assert.equal(baseline.unassigned, false);
    assert.equal(baseline.accepted, true);
    assert.equal(baseline.shortAccepted, false);
    assert.equal(baseline.count, 1);
    assert.equal(baseline.preview, "Short scissors");
    assert.match(baseline.warnings.join(" "), /short scissors.*full blade/i);
    await page.getByRole("button", { name: "Accept all", exact: true }).last().click();
    assert.equal(await page.evaluate(() => state.items.length), 2);
    await page.evaluate(() => {
      const tool = getTool("Full scissors");
      const copy = makeLayoutItem(tool);
      state.items.push(copy);
      for (const item of state.items.filter(item => item.toolId === tool.id)) {
        item.pulls = defaultFingerPulls(tool.points, tool.width, tool.height, 8);
        combinedLocalPoints(item);
      }
      showPreview(tool);
    });
    await page.locator("#captureKind").selectOption("pliers");
    await page.getByText("Raised handles and jaws", { exact: false }).isVisible().then(visible => assert.ok(visible));
    await page.locator("#captureMeasured").fill("180");
    await page.getByRole("button", { name: "Apply scale" }).click();
    const first = await page.evaluate(() => {
      const tool = getTool("Full scissors");
      return {
        length: tool.capture.measuredLength, width: tool.width, height: tool.height,
        radii: state.items.filter(item => item.toolId === tool.id).map(item => item.pulls.map(p => p.r)),
        points: tool.points,
        noMargin: buildCaliperPocket({ ...tool.capture, clearance: 0 }, 180 / tool.capture.shape.length).width
      };
    });
    assert.equal(first.length, 180);
    assert.ok(Math.abs(first.width - first.noMargin - 4) < .22);
    assert.deepEqual(first.radii, [[8, 8], [8, 8]]);
    await page.locator("#captureMeasured").fill("166.5");
    await page.getByRole("button", { name: "Apply scale" }).click();
    await page.locator("#captureMeasured").fill("180");
    await page.getByRole("button", { name: "Apply scale" }).click();
    const second = await page.evaluate(() => getTool("Full scissors").points);
    assert.deepEqual(second, first.points);
    const persistence = await page.evaluate(() => {
      const tool = getTool("Full scissors");
      hidePreview();
      applyProject(JSON.parse(JSON.stringify(serializeProject())));
      const restored = getTool(tool.id);
      return { span: restored.capture.measuredLength, clearance: restored.capture.clearance, same: JSON.stringify(restored.points) === JSON.stringify(tool.points) };
    });
    assert.deepEqual(persistence, { span: 180, clearance: 2, same: true });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ baseline, calibratedWidth: first.width, clearanceAdded: first.width - first.noMargin, persistence }));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
