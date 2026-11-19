# SnapInset — technical documentation

Tagline: Snap your tools. Print the fit.

## Purpose

SnapInset converts photos of tools on A4, A3, or US Letter paper into a drawer shadow board. The same layout exports a 3D-printable hollow shell (STL, or a zip of bed-sized tiles) and a laser-cut DXF or SVG. The app is one vanilla HTML file, `outputs/index.html`, with no build step and no framework. Export functions stay in that file so they can later move behind a server function without a rewrite.

## Main Files

- `outputs/index.html`: the application.
- `outputs/shadow_board_from_a4.py`: the earlier Python prototype. The browser pipeline has moved past it.
- `README.md`: short user overview.

## User Workflow

1. Photograph tools on a whole sheet. All four corners must be in frame. Several tools can share one photo if they do not touch.
2. Drop the photo, or use Choose photos. A phone can use the camera input. Detection starts on its own.
3. Choose the paper size: A4, A3, or US Letter. Portrait and landscape both work.
4. The app finds the paper corners, rectifies the sheet, and segments every tool on it.
5. Review each outline. Offset, gap repair, and smoothing live in the review dialog under advanced settings, and a change reprocesses that tool.
6. If the sheet is not found, place the four corners by hand. There is no silent fallback to an arbitrary scale.
7. Accept adds the tool to the drawer.
8. Drag, nudge, or Auto-arrange. Overlaps are hatched. Ctrl+Z / Ctrl+Shift+Z undo and redo layout edits (50 steps).
9. Export STL, or Export tiles. Switch to Laser cut for DXF and SVG.

The stepper (Capture, Review, Arrange, Export) is a set of buttons. Capture and Arrange switch views. Review opens the current outline. Export scrolls to the drawer card.

## Project Persistence

The app stores the latest project in `localStorage` under `shadowBoardDxfMaker.project.v1`, so a browser that already had a project from the previous app still restores it.

- Autosave writes that key. There is no separate Save button.
- Export project downloads a portable JSON file. New files set `app` to `SnapInset` and `version` to `2`.
- Import project, or dropping a `.json` file, loads it. The loader does not reject a file because of the `app` name. Fields added later (pocket depth, scale confidence, paper corners, bed size) are optional.
- New project clears the browser save after a confirm.

The JSON stores contours and preview images, not the original photos.

## Measurement Model

Scale comes from the paper, after a perspective rectification, not from a stretched bounding box.

- A4: 210 × 297 mm
- A3: 297 × 420 mm
- US Letter: 215.9 × 279.4 mm
- `PROC_PX_PER_MM` is 5. The rectified sheet is `paper millimetres × 5` pixels on a side.

### Paper corners and homography

`findPaperCorners` builds a bright, low-saturation mask, keeps the largest component, and takes the four sharpest hull corners. Each edge is refit to the mask boundary and pushed outward by 1.7 detection pixels, because the threshold sits inside the true edge of the sheet. A homography (similarity-normalized, solved by Gaussian elimination) warps the quad onto the known paper size with bilinear sampling. Pixels outside the quad are white so the table is not traced as a tool.

Confidence is an integer from 1 to 99, shown on the tool card. It drops when the quad is skewed, the corners are soft, or the sheet fills the frame oddly.

If no sheet is found, or the corners are cut off, detection stops and the message is: "No paper sheet found. Include the whole sheet, with all four corners visible, or place the corners yourself." The corner editor is the manual fallback. Applying those four points runs the same warp.

### Several tools, and the paper edge

`segmentTools` keeps every component of at least 150 mm², up to eight. A hard shadow is not walked into: the mask grows through a brightness ramp but stops when a pixel is more than 12 levels darker than the seed, which is what a cast shadow looks like. Components whose bounding box is within 12 mm of the sheet edge are kept and flagged. They used to be discarded. The card shows "near edge" because that side of the outline can be clipped by the sheet.

The default 2 mm offset is pocket clearance for the cut, not a scale correction. Scale checks use offset 0.

## Image Processing Pipeline

### 1. Paper Detection

See Measurement Model. The sheet is a rectified quad, not an axis-aligned crop. A photo with no paper does not produce a board.

### 2. Background Correction

The image is locally corrected to reduce uneven lighting, shadows, and mild paper gradients. This is important because many photos contain directional shadows from the tool or phone flash.

### 3. Tool Masking

The tool is segmented from the white paper using brightness and color difference. The `Metal repair mm` setting helps bridge broken regions for shiny or silver tools where reflections can look similar to the white paper.

### 4. Offset

The detected tool mask is dilated by the configured `Offset mm`. The default is `2 mm`, which creates clearance around the tool for foam cutting.

### 5. Hole Filling and Tracing

Interior holes are filled so the shadow-board cutout is treated as a single outer pocket. The app traces the largest closed contour from the offset mask.

### 6. Smoothing

The contour is resampled and smoothed with Gaussian smoothing plus a Chaikin pass. The key settings are:

- `Smooth mm`: higher values create softer curves.
- `Point spacing mm`: higher values reduce DXF point count.

## Finger-Pull Handles

Each layout item starts with two finger-pull handles. They are shown as blue circles while the item is selected.

Important behavior:

- Pull handles are pinned to the nearest point on the detected tool contour.
- Dragging a pull handle slides it along the contour instead of allowing it to float freely.
- The pull-circle center is offset slightly outward from the contour, so the circle always intersects the main tool shape.
- The circles are not exported as separate DXF circles.
- The drawer canvas draws the tool outline and pull circles separately so editing stays fast.
- On export, the app unions the tool contour and finger-pull circles into one raster mask.
- That combined mask is retraced into one continuous `LWPOLYLINE` for the DXF.
- Export smoothing is raised around pull-circle merges to create a larger rounded transition between the pull and the main contour.

Because the pull handles are contour-pinned, the exported union should stay connected. If importing an older project, the app projects older free-position pull handles back onto the nearest tool contour.

## Performance Notes

Combining finger-pull handles into a single contour is more expensive than drawing separate circles. The app therefore keeps the live canvas simple and only performs the union when exporting.

The app also uses caching so repeated exports do not redo unchanged work. The combined contour is recalculated only when:

- A finger-pull handle moves.
- Offset, smoothing, or point spacing changes.
- A DXF export needs the current contour.

`combinedLocalPoints`, which rasterizes the tool contour plus finger pulls before retracing, fills the raster with a scanline polygon fill (evaluating polygon edges once per scanline row) and direct circle stamping for pull handles, rather than testing every raster pixel against the full contour point-in-polygon test. On a real multi-hundred-point contour this is roughly 60x faster than a naive per-pixel test and keeps `validateLayout` (which calls it for every layout item) cheap enough to run on every render.

`autoArrangeAll` yields to the browser between placement steps so the busy overlay stays responsive and `Stop and keep best layout` remains clickable during a long search. The yield (`nextFrame`) uses `requestAnimationFrame` while the tab is visible, but falls back to a `MessageChannel` post when `document.hidden` is true, since background tabs throttle `requestAnimationFrame` and `setTimeout` to roughly once per second — without the fallback, an arrange started just before the tab loses focus would spend nearly its entire time budget asleep instead of searching.

## DXF Export

The DXF writer emits a minimal `HEADER` section (`$INSUNITS = 4` for millimeters, `$MEASUREMENT = 1` metric) followed by `LWPOLYLINE` entities. Declaring units explicitly avoids CAM software guessing inches on import.

Canvas coordinates are Y-down (screen space); DXF is Y-up. Export flips Y (`y' = drawerHeight - y` for the drawer export, `y' = boundsTop - y` for a single selected-tool export) so the exported geometry is not mirrored vertically when opened in CAD/CAM tools.

Full drawer export:

- Adds a `DRAWER` rectangle layer.
- Adds one `CUT_*` layer per arranged tool, named from the tool's (possibly renamed) label.
- Each tool is exported in its arranged drawer position and rotation.
- Export is blocked (with the reasons listed in the export report) until the layout has no overlaps, no out-of-drawer tools, and no unreviewed contours in the drawer.

Selected tool export:

- Exports the selected tool as one local `CUT` contour.
- Includes moved finger-pull handles as part of the same contour.

## SVG Export

The drawer export modal also offers `Download SVG`, generating a millimeter-true `<svg>` (`viewBox="0 0 drawerW drawerH"`, `width`/`height` in `mm`) with one `<path>` per tool cutout plus a drawer boundary rectangle. This targets laser-cutter software (Lightburn, xTool Creative Space, etc.) that consumes SVG rather than DXF.

## Printable STL

Export STL builds a hollow shell from the same arranged contours as the DXF. It is a normal output, not an experiment.

Print orientation:

- The solid skin is the face at z = 0, so it sits on the bed. The outline is a closed face with no through-holes.
- The outer wall rises from a 0.3 mm, 45° chamfer to the board thickness. The chamfer is an inset of the outline, so the first layer is slightly smaller than the finished footprint.
- Each pocket has a floor at `thickness − depth`. The default depth is 15 mm, editable per tool, and stored on the layout item. The floor is never thinner than the skin.
- The cavity is the region more than a rim-band away from the outside and from the pockets. It is open at the top. Nothing bridges.
- Material islands inside a pocket get walls from the surrounding floor up to the top.

`STL cavity detail mm` is the grid pitch for that cavity only. Walls and pocket floors follow the polygons. If the grid would exceed 350,000 cells, the pitch widens by 1.25× until it fits or it reaches 12 mm, and the toast says so. A 1200 × 800 mm board exports this way instead of failing.

Filament mass is the signed mesh volume in mm³, divided by 1000, times 1.24 g/cm³. The export notice and the readout after export use that mesh mass and call it an estimate. The live readout before export is an analytical stand-in (block, minus pocket voids, minus the cavity) and will not match the mesh to the gram.

`buildShellStl` runs `makePrintableShellStl` in a Web Worker created from a Blob URL. The worker is the function source plus the helpers it calls. On a worker error or a 120 second timeout the same function runs on the main thread. The mass readout's `data-threaded` attribute is `1` when the worker produced the file.

Laser DXF and SVG are unchanged: the DXF is Y-up, the SVG is millimeter-true, and both still go through the export preview.

## Bed tiles

Export tiles splits the board when it is larger than the printer. The zip contains one STL per tile, `clearance-coupon.stl`, and `tiles.txt`.

Beds, with an editable margin that defaults to 3 mm per side:

| Preset | Bed (mm) |
| --- | --- |
| Bambu A1 mini | 180 × 180 |
| Bambu A1 / P1S / X1C | 256 × 256 |
| Bambu H2D | 325 × 320 |
| Prusa MK4S | 250 × 210 |
| Prusa CORE One | 250 × 220 |
| Ender-3 V3 | 220 × 220 |
| Custom | typed width and depth |

Usable length is the bed minus two margins. A tile body is capped at 200 mm, and also at usable length minus 8 mm, so the dovetail key that sticks past the body still lands inside the usable area. The socket is a notch, so it does not grow the footprint.

Seam positions come from a dynamic program. Candidates are stepped every 2 mm (4 mm on a long board). The cost of a cut is the millimetres of pocket the cut line crosses. The search picks the cuts that keep every span under the cap and minimise that cost. `tiles.txt` also reports the cost of an even split with the same number of tiles.

Joints are dovetail keys extruded in Z, built as polygons on the tile outline rather than as voxels. Neck 8 mm, head 12 mm, depth 8 mm. Clearance defaults to 0.25 mm per side and can be set from 0.20 to 0.30. Keys sit on the high side of each seam (the tile toward the origin carries the key; the next tile carries the socket). A key is placed only in a stretch of seam that stays at least 20 mm clear of every pocket. A seam with no such stretch is a butt joint.

The seam wall is 10 mm, not 5 mm. An 8 mm socket in a 5 mm wall would open into the cavity. The extra 2 mm past the key depth keeps the socket in solid plastic. The skin stays at the wall setting, usually 2 mm. Pockets that cross a seam are clipped 0.2 mm inside the tile so the cut does not share an edge with the outline.

The bottom edge has the same 0.3 mm chamfer as a one-piece board. Tile numbers are raised 0.6 mm on the cavity floor, as a single polygon per character, when a clear spot exists in the largest cavity. The filename carries the label (A1, B1, …) either way.

The clearance coupon is two small shells in one STL: a key and a matching socket at the chosen clearance, separated so they can be broken apart and pressed together before printing the set.

The zip is STORE method (no compression), written in the page. There is no multi-plate 3MF export.

## Known Limitations

- Very shiny metal can still break a contour where it reflects the paper.
- A shadow that is attached to the tool and only slightly darker can still be included. A hard cast shadow is excluded.
- A tool within about 12 mm of the sheet edge is measured, and warned, rather than dropped. That side can read a couple of millimetres large.
- Finger-pull circles should overlap the main outline.
- DXF and SVG are polylines, not splines.
- Nesting uses a raster no-fit proposal (see Nesting). Thin concavities can be missed at the 3 mm raster.
- The cavity wall is only as accurate as the cavity grid. Pocket walls follow the polygons.
- Two label holes that share one horizontal line make this ear-clipper drop an edge. Characters are staggered by 0.45 mm so that does not happen. If a label still will not close, that tile is exported without the number.
- A seam with no 20 mm of clear plastic has no dovetail.
- The seam wall is 10 mm so the key stays in solid. It is not the 5 mm wall drawn in the early joint sketch.
- 3MF multi-plate export is not implemented.
- Browser save storage is limited. Export the project JSON for a large board.

## Recommended Photo Setup

- Use a clean white A3 or A4 sheet.
- Keep the camera as perpendicular to the paper as practical.
- Avoid harsh side lighting.
- Leave visible white space around the entire tool.
- For shiny metal tools, diffuse the light or slightly change the camera angle to reduce white reflections.

## Nesting

Auto-arrange runs a multi-strategy nesting search over saved project geometry (`autoArrangeAll`):

- Reads all layout-item contours in millimeters, using the exact polygon (not just the bounding box) for collision checks.
- Includes finger-pull circles in the layout footprint, in collision checks, and in spacing checks alongside the tool contour.
- Uses `Arrange spacing mm` as the requested clearance between nested tools and pull circles.
- Uses `Arrange rotation` to pick the rotation set: **Tidy** (`0, 90, 180, 270`, for a visually neat drawer) or **Dense** (12 steps of 30 degrees, for maximum packing).
- Locked items (`Lock Position`) are excluded from placement and treated as fixed obstacles for everything else.
- Tries five orderings (by area, by height, by width, by aspect ratio, and insertion order) plus a fast bounding-box baseline and a shelf-packing fallback, and keeps whichever complete layout scores best (packed height, then width, then wasted area).
- Runs against a wall-clock time budget (`Arrange time limit sec`), shown live in the busy overlay (`Pass X/Y, item N/M, orientation Z deg`). The best complete layout found is applied even if the budget runs out before every ordering finishes.
- **Stop and keep best layout**: a button in the busy overlay lets the user end the search early; the canvas already shows the best layout found so far, since the layout is applied live every time a better ordering completes, not only at the end.

### Candidate placement: raster no-fit polygon (NFP)

Early versions only tried candidate positions derived from bounding-box corners of already-placed parts, which finds tight rectangular packing but essentially never nests one part *inside* a concavity of another (a bar sliding into the mouth of a C-shaped bracket, for example). The nesting search now generates candidates from an approximate no-fit polygon instead:

1. **`buildOccupancy`** rasterizes every already-placed part (contour plus finger-pull circles) into an occupancy grid at `NEST_RASTER_MM` resolution (3&nbsp;mm), then dilates the occupied cells by the arrange-spacing gap so the raster already encodes the clearance requirement.
2. **`nfpCandidates`** rasterizes the candidate part for a given rotation, then slides it over the occupancy grid (checking only the part's own boundary cells against the grid, which is cheap) to find every position where it fits without collision. Only the *contact band* — positions within a couple of raster cells of touching a wall or another part — is kept as candidates; this is the practical equivalent of the true NFP boundary, where dense and interlocking placements live.
3. Raster candidates are merged with the older bounding-box-corner candidates (`mergedCandidates`) and de-duplicated.
4. Every candidate, regardless of source, is still scored with cheap bounding-box math first; only candidates that could possibly beat the current best are checked with the **exact polygon-distance collision test** (`placementFits` / `polygonSetsTooClose`), so the raster step is a proposer only — it never overrides exact geometry. Candidates are scored before the exact check and evaluated best-score-first, stopping at the first exact-geometry pass, which keeps the expensive polygon math off the majority of candidates.

This is not a full Minkowski-difference NFP implementation (no true polygon-boundary sliding, no genetic-algorithm ordering search of the kind Deepnest uses) but it recovers the concave-nesting behavior that a pure bounding-box candidate generator cannot produce, at a cost proportional to raster resolution rather than polygon complexity.

### Manual editing after auto-arrange

- Manual drag/rotate cleanup remains available after automatic placement; dragging a tool over another paints the overlapping contour red immediately (`updateDragOverlap`, exact polygon-distance check against every other placed item).
- Zoom (buttons or mouse wheel toward the cursor) and pan (drag on empty canvas) let you inspect the drawer without changing its dimensions; `Fit View` recenters with a clean top-left margin.
- The export report panel and the Auto-arrange busy overlay both surface the same validation used to gate DXF/SVG export, so overlap or out-of-bounds issues are visible before an export attempt.

### Possible future improvements

- True Minkowski-sum NFP (e.g. via `clipper2` or a ported SVGnest NFP generator) for exact boundary sliding instead of raster approximation.
- A genetic/evolutionary search over part ordering and rotation, replacing the fixed set of heuristic orderings.
- Moving the search to a Web Worker so very large layouts (dozens of tools) do not compete with UI rendering for main-thread time.
- Optional common-line or shared-edge behavior where it makes sense for foam cutting.
