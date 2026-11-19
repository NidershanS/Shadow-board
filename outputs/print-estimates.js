function createPrintEstimator() {
  const density = 1.24; // g/cm³ for PLA
  const defaults = Object.freeze({
    infillPercent: 15,
    perimeters: 3,
    lineWidth: 0.45,
    layerHeight: 0.2,
    topLayers: 4,
    bottomLayers: 4,
    flow: 7
  });

  function normalize(settings = {}) {
    function clamp(name, low, high) {
      const input = settings[name];
      const value = input == null || input === "" ? NaN : Number(input);
      return Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : defaults[name];
    }
    return {
      infillPercent: clamp("infillPercent", 0, 100),
      perimeters: Math.round(clamp("perimeters", 0, 8)),
      lineWidth: clamp("lineWidth", 0.2, 1.2),
      layerHeight: clamp("layerHeight", 0.08, 0.6),
      topLayers: Math.round(clamp("topLayers", 0, 12)),
      bottomLayers: Math.round(clamp("bottomLayers", 0, 12)),
      flow: clamp("flow", 1, 35)
    };
  }

  function materials(solidMm3, skinMm3, perimeterMm3, settings) {
    const shellMm3 = skinMm3 + perimeterMm3;
    const infillMm3 = Math.max(0, solidMm3 - shellMm3) * settings.infillPercent / 100;
    const printedMm3 = shellMm3 + infillMm3;
    return {
      solidMm3, skinMm3, perimeterMm3, shellMm3, infillMm3, printedMm3,
      grams: printedMm3 * density / 1000,
      hours: printedMm3 / settings.flow / 3600
    };
  }

  function estimatePrintedTriangles(triangles, settings) {
    const profile = normalize(settings);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const triangle of triangles) {
      for (const { x, y } of triangle) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    const w = maxX - minX, h = maxY - minY;
    if (!(w > 0 && h > 0)) return materials(0, 0, 0, profile);

    // Every vertical line through these bed-down board meshes meets one material interval.
    // Sample the triangle surfaces to get the lower and upper ends of each interval.
    const shellWidth = profile.perimeters * profile.lineWidth;
    const pitch = Math.max(0.3375, Math.sqrt(w * h / 2_000_000), Math.max(w, h) / 10_000);
    const cols = Math.ceil(w / pitch) + 2, rows = Math.ceil(h / pitch) + 2;
    const originX = minX - pitch / 2, originY = minY - pitch / 2;
    const lower = new Float32Array(cols * rows).fill(Infinity);
    const upper = new Float32Array(cols * rows).fill(-Infinity);

    for (const [a, b, c] of triangles) {
      const ux = b.x - a.x, uy = b.y - a.y, vx = c.x - a.x, vy = c.y - a.y;
      const determinant = ux * vy - uy * vx;
      if (Math.abs(determinant) < 1e-12) continue;
      const uz = b.z - a.z, vz = c.z - a.z;
      const col0 = Math.max(1, Math.ceil((Math.min(a.x, b.x, c.x) - originX) / pitch - 1e-7));
      const col1 = Math.min(cols - 2, Math.floor((Math.max(a.x, b.x, c.x) - originX) / pitch + 1e-7));
      const row0 = Math.max(1, Math.ceil((Math.min(a.y, b.y, c.y) - originY) / pitch - 1e-7));
      const row1 = Math.min(rows - 2, Math.floor((Math.max(a.y, b.y, c.y) - originY) / pitch + 1e-7));
      for (let row = row0; row <= row1; row++) {
        const dy = originY + row * pitch - a.y;
        for (let col = col0; col <= col1; col++) {
          const dx = originX + col * pitch - a.x;
          const u = (dx * vy - dy * vx) / determinant;
          const v = (ux * dy - uy * dx) / determinant;
          if (u < -1e-7 || v < -1e-7 || u + v > 1 + 1e-7) continue;
          const z = a.z + u * uz + v * vz;
          const index = row * cols + col;
          if (z < lower[index]) lower[index] = z;
          if (z > upper[index]) upper[index] = z;
        }
      }
    }

    // A full infill core needs material within the perimeter width at its layer height.
    // Propagate adjacent height changes within that XY radius. Flat regions need no work.
    function erode(radius) {
      if (radius === 0) return { lower, upper };
      const coreLower = lower.slice(), coreUpper = upper.slice();
      const spans = Array.from({ length: radius * 2 + 1 }, (_, i) => {
        const dy = i - radius;
        return Math.floor(Math.sqrt(radius ** 2 - dy * dy));
      });
      function isHigherNeighbor(grid, index, value) {
        return (index % cols > 0 && grid[index - 1] > value) ||
          (index % cols < cols - 1 && grid[index + 1] > value) ||
          grid[index - cols] > value || grid[index + cols] > value;
      }
      function isLowerNeighbor(grid, index, value) {
        return (index % cols > 0 && grid[index - 1] < value) ||
          (index % cols < cols - 1 && grid[index + 1] < value) ||
          grid[index - cols] < value || grid[index + cols] < value;
      }
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const index = row * cols + col;
          const low = lower[index], high = upper[index];
          const raisesBottom = isLowerNeighbor(lower, index, low - 0.0001);
          const lowersTop = isHigherNeighbor(upper, index, high + 0.0001);
          if (!raisesBottom && !lowersTop) continue;
          for (let dy = -radius; dy <= radius; dy++) {
            const y = row + dy;
            if (y < 1 || y >= rows - 1) continue;
            const span = spans[dy + radius];
            const last = y * cols + Math.min(cols - 2, col + span);
            for (let k = y * cols + Math.max(1, col - span); k <= last; k++) {
              if (raisesBottom && low > coreLower[k]) coreLower[k] = low;
              if (lowersTop && high < coreUpper[k]) coreUpper[k] = high;
            }
          }
        }
      }
      return { lower: coreLower, upper: coreUpper };
    }

    // Interpolate across adjacent raster radii so a subpixel perimeter still contributes.
    const radius = shellWidth / pitch;
    const narrow = erode(Math.floor(radius + 1e-7));
    const ratio = Math.max(0, radius - Math.floor(radius + 1e-7));
    const wide = ratio > 1e-7 ? erode(Math.ceil(radius)) : narrow;
    const bottom = profile.layerHeight * profile.bottomLayers;
    const top = profile.layerHeight * profile.topLayers;
    let envelope = 0, skin = 0, perimeters = 0;
    for (let i = 0; i < lower.length; i++) {
      const depth = upper[i] - lower[i];
      if (depth <= 0) continue;
      const innerDepth = Math.max(0, depth - bottom - top);
      const innerTop = upper[i] - top, innerBottom = lower[i] + bottom;
      const narrowDepth = Math.max(0, Math.min(innerTop, narrow.upper[i]) - Math.max(innerBottom, narrow.lower[i]));
      const wideDepth = Math.max(0, Math.min(innerTop, wide.upper[i]) - Math.max(innerBottom, wide.lower[i]));
      const infillDepth = narrowDepth + ratio * (wideDepth - narrowDepth);
      envelope += depth;
      skin += depth - innerDepth;
      perimeters += Math.max(0, innerDepth - infillDepth);
    }
    const cellArea = pitch ** 2;
    return materials(envelope * cellArea, skin * cellArea, perimeters * cellArea, profile);
  }

  function estimatePrintedMesh(buffer, settings) {
    const view = ArrayBuffer.isView(buffer)
      ? new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
      : new DataView(buffer);
    const count = view.byteLength >= 84 ? view.getUint32(80, true) : -1;
    if (84 + count * 50 !== view.byteLength || count < 0) throw new Error("Invalid binary STL for print estimate.");
    const triangles = Array.from({ length: count }, (_, i) => {
      const start = 96 + i * 50;
      return [0, 12, 24].map(offset => ({
        x: view.getFloat32(start + offset, true),
        y: view.getFloat32(start + offset + 4, true),
        z: view.getFloat32(start + offset + 8, true)
      }));
    });
    return estimatePrintedTriangles(triangles, settings);
  }

  function total(estimates, settings) {
    const sum = estimates.reduce((a, b) => ({
      solidMm3: a.solidMm3 + b.solidMm3,
      skinMm3: a.skinMm3 + b.skinMm3,
      perimeterMm3: a.perimeterMm3 + b.perimeterMm3
    }), { solidMm3: 0, skinMm3: 0, perimeterMm3: 0 });
    return materials(sum.solidMm3, sum.skinMm3, sum.perimeterMm3, normalize(settings));
  }

  function format(estimate) {
    const grams = Math.round(estimate.grams);
    const hours = estimate.hours < 10 ? estimate.hours.toFixed(1) : Math.round(estimate.hours);
    return `~${grams} g PLA · ~${hours} h`;
  }

  function describe(settings) {
    const { infillPercent, perimeters, lineWidth, layerHeight, topLayers, bottomLayers, flow } = normalize(settings);
    return `${infillPercent}% infill · ${perimeters} perimeters at ${lineWidth} mm · ${topLayers} top / ${bottomLayers} bottom layers at ${layerHeight} mm · ${density} g/cm³ PLA · ${flow} mm³/s effective flow`;
  }

  return { defaults, normalize, estimatePrintedTriangles, estimatePrintedMesh, total, format, describe };
}

if (typeof module !== "undefined" && module.exports) module.exports = createPrintEstimator;
