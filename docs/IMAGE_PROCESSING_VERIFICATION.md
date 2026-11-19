# Image-processing verification

Branch: cursor/snapinset-revamp-ae47. Baseline: 980f4d052433e38e274c992e38c442f25365b65b. All eight original photos processed automatically; no manual corners or retouching.

Dimensions below are page-axis bounding boxes, L × W mm, at zero clearance. The supplied measurements differ from the fresh baseline run, so both are retained rather than presented as identical experiments. Existing UI defaults, including 2 mm clearance, were not changed.

| Tool | Supplied before | Rerun before (0 mm) | After (0 mm) | After (2 mm clearance) | Full runtime, s | Boundary support |
|---|---|---|---|---|---|---|
| Chrome slip-joint | 160.6 × 40.7 | 159.4 × 40.1 | 159.0 × 39.8 | 163.0 × 43.8 | 1.57 | 100.0% |
| Red/black long-nose | 163.6 × 58.8 | 161.7 × 58.7 | 162.8 × 59.9 | 166.8 × 64.0 | 1.52 | 99.2% |
| INGCO combination | 217.5 × 66.9 | 215.4 × 66.0 | 215.1 × 67.6 | 219.2 × 71.6 | 1.54 | 98.0% |
| INGCO diagonal cutters | 171.6 × 65.5 | 172.6 × 65.8 | 173.6 × 63.0 | 177.8 × 67.2 | 1.36 | 96.5% |
| Red/grey scissors | 119.7 × 84.6 | 149.5 × 84.9 | 210.8 × 83.8 | 214.8 × 87.8 | 1.49 | 99.9% |
| Blue centre punch | 132.5 × 37.6 | 132.5 × 36.1 | 131.7 × 35.0 | 135.8 × 39.2 | 1.51 | 100.0% |
| Yellow long-nose (1) | 172.2 × 66.3 | 170.5 × 65.3 | 170.4 × 64.9 | 174.4 × 69.0 | 1.40 | 97.9% |
| Yellow long-nose (2) | 171.6 × 66.6 | 170.8 × 65.7 | 170.8 × 65.0 | 174.8 × 69.0 | 1.46 | 98.3% |

Paper corners are numerically identical in 8/8 runs. Each final photo produces one component. The baseline scissors produced two components: 149.5 × 84.9 and 26.5 × 12.5 mm. Final scissors: 210.8 × 83.8 mm, one solid pocket with the finger holes filled.

Duplicate yellow pair differs by 0.40 mm in length and 0.14 mm in width (0.23% / 0.21%). These are two versions of the same source photo, not independent camera viewpoints.

Runtime is one headless Chrome processFile call per image, including decode, paper detection, rectification, segmentation, contour processing and preview generation, after a preceding segmentation call. These are warm, single-run desktop timings, not a mobile benchmark.

## What changed

Paper-relative RGB normalisation with a spatial upper-quantile background model and a global white floor; adaptive sharp-edge and local-contrast evidence for pale steel; neutral shading and weak reflected-colour rejection; 1.2 mm maximum gap closing before component splitting; discard components below 150 mm²; fill enclosed holes; cap repair at 1.2 mm; limit detection smoothing displacement to 0.2 mm and sample spacing to 0.3 mm. Existing configurable clearance is retained. Paper finding, UI, arrange, export, STL and tiling code are unchanged. No optional brush UI was added.

## Shadows and limitations

A synthetic 40 × 100 mm dark target measures 40.8 × 100.8 mm both with and without an 18 mm wide soft cast-shadow ramp. The added soft shadow causes no additional width. Pale grey metal, two separate tools, filled finger holes and isolated small-fragment checks pass. A deliberately sharply bounded shadow still fails: 56.2 mm width against 40 mm truth. This is a known failure, not a passing regression. Crisp shadows and highlights remain ambiguous in a single RGB photo. Photo overlays also retain small edge/shadow biases; no hand-labelled masks are available to quantify IoU or absolute contour error.

The confidence is a heuristic evidence score: boundary samples supported within 0.6 mm by detected edges, with a penalty near the paper edge, capped by paper confidence when stored on a tool. It is not a calibrated probability or a dimensional error bound. It cannot reliably detect a missed appendage or a sharp shadow. scaleWarning and detectionMetrics explicitly record the paper-plane assumption and uncorrected height parallax.

The INGCO combination remains about 215.1 mm before clearance; absolute accuracy is unverified. A paper homography corrects the paper plane, not raised handles. In a frontoparallel pinhole model apparent scale is H/(H-h), so height h=20 mm at camera distance H=400 mm would add about 5.3%. Those values are illustrative, not measured here. Camera distance, object height, lens distortion and true physical tool measurements are unavailable, so no guessed correction was applied. Clearance alone adds about 4 mm to each bounding dimension at the default 2 mm setting.

## Overlays

Green lines show zero-clearance contours on the rectified photograph. Original photos are not committed to the repository.

- Chrome slip-joint: overlays supplied in the local verification bundle — 20260629_111626.jpg
- Red/black long-nose: overlays supplied in the local verification bundle — 20260629_111459.jpg
- INGCO combination: overlays supplied in the local verification bundle — 20260629_111517.jpg
- INGCO diagonal cutters: overlays supplied in the local verification bundle — 20260629_110314.jpg
- Red/grey scissors: overlays supplied in the local verification bundle — 20260629_111722.jpg
- Blue centre punch: overlays supplied in the local verification bundle — 20260629_111912.jpg
- Yellow long-nose (1): overlays supplied in the local verification bundle — WhatsApp Image 2026-06-29 at 11.30.20 AM (1).jpeg
- Yellow long-nose (2): overlays supplied in the local verification bundle — WhatsApp Image 2026-06-29 at 11.30.20 AM.jpeg

To reproduce: install Playwright in your test environment, then run `node tests/verify-photos.cjs <photo-directory> <report-directory>`. Set CHROME_PATH to a Chrome executable or install Playwright Chromium. This is development verification only; the app still has no build step.
