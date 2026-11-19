const assert = require('node:assert/strict');
const estimator = require('../outputs/print-estimates.js')();

function box(w, h, depth) {
  const vertices = [
    [0, 0, 0], [w, 0, 0], [w, h, 0], [0, h, 0],
    [0, 0, depth], [w, 0, depth], [w, h, depth], [0, h, depth]
  ].map(([x, y, z]) => ({ x, y, z }));
  const faces = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  return faces.flatMap(([a, b, c, d]) => [[a, b, c], [a, c, d]]).map(triangle => triangle.map(i => vertices[i]));
}

function binaryStl(triangles) {
  const buffer = Buffer.alloc(84 + triangles.length * 50);
  buffer.writeUInt32LE(triangles.length, 80);
  for (const [i, triangle] of triangles.entries()) {
    for (const [j, vertex] of triangle.entries()) {
      const start = 96 + i * 50 + j * 12;
      buffer.writeFloatLE(vertex.x, start);
      buffer.writeFloatLE(vertex.y, start + 4);
      buffer.writeFloatLE(vertex.z, start + 8);
    }
  }
  return buffer;
}

function near(actual, expected, tolerance = 1e-7) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${actual} within ${tolerance} of ${expected}`);
}

const w = 33.75, h = 20.25, thickness = 8;
const triangles = box(w, h, thickness);
const buffer = binaryStl(triangles);
const measure = settings => estimator.estimatePrintedMesh(buffer, settings);

const hollow = measure({ infillPercent: 0 });
const standard = measure();
const solid = measure({ infillPercent: 100 });
assert.ok(hollow.grams < standard.grams && standard.grams < solid.grams);
near(solid.printedMm3, w * h * thickness);
near(solid.grams, w * h * thickness / 1000 * 1.24);
near(standard.skinMm3, w * h * 1.6);
near(standard.perimeterMm3, (w * h - (w - 2.7) * (h - 2.7)) * (thickness - 1.6));
near(standard.infillMm3, (standard.solidMm3 - standard.shellMm3) * 0.15);
near(standard.grams, estimator.estimatePrintedTriangles(triangles).grams);

const perimeters = [0, 1, 2, 3, 4].map(count => measure({ perimeters: count }).grams);
assert.ok(perimeters.every((grams, i) => i === 0 || grams > perimeters[i - 1]));
const thin = estimator.estimatePrintedTriangles(box(w, h, 1), { infillPercent: 0 });
near(thin.printedMm3, w * h);
near(thin.perimeterMm3, 0);

const fast = measure({ flow: 14 });
near(fast.grams, standard.grams);
near(fast.hours, standard.hours / 2);
const total = estimator.total([standard, standard]);
near(total.grams, standard.grams * 2);
near(total.hours, standard.hours * 2);

console.log('Print estimator checks passed.');
