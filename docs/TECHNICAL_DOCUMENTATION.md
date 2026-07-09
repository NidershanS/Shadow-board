# Shadow Board DXF Maker - Technical Documentation

## Purpose

Shadow Board DXF Maker converts photos of tools placed on A3 or A4 paper into laser-cut DXF outlines for drawer shadow boards. The workflow is designed for a browser-only setup: upload photos, detect the paper and tool, preview the contour, arrange tools on a drawer-sized board, place finger-pull handles, then export DXF.

## Main Files

- `outputs/index.html`: self-contained browser application.
- `outputs/shadow_board_from_a4.py`: reference Python command-line processing script used during prototyping.
- `README.md`: short user-facing project overview.
- `.gitignore`: excludes generated previews and test outputs from Git.

## Hosted App

The current Vercel-hosted app is available at:

https://shadow-board-qlwk.vercel.app/

The app can also run locally by opening `outputs/index.html` directly in a browser.

## User Workflow

1. Photograph a tool on a white A3 or A4 sheet.
2. Drop one or more photos onto the page, or use `Choose Files`. Detection starts automatically once files are selected or dropped; `Detect Contours` remains available to re-run manually.
3. Select paper size: A4 or A3. The app supports portrait and landscape photos.
4. The app detects the paper, segments the tool, smooths the outline, and applies the cut offset.
5. Preview each detected tool contour in the review modal. Rename the tool, and tune `Offset mm`, `Gap repair mm`, and `Smooth mm` directly in the modal — changing a value automatically re-detects the contour after a short pause.
6. Accept the contour. Accepting adds the tool straight to the drawer at a non-overlapping position; the modal auto-advances to the next unreviewed contour.
7. Drag/rotate tools into position, or use `Arrange Now` to auto-nest everything (see Nesting below).
8. Move the blue finger-pull handles; dragging a tool over another highlights the overlap in red.
9. Export the full drawer as DXF or SVG, or export the selected tool alone as DXF.

## Project Persistence

The app stores the latest project in browser `localStorage` so a refresh can restore the detected tools, drawer layout, finger-pull positions, previews, and settings.

Manual project controls:

- `Project name`: stores a human-friendly project name and controls exported project/DXF filenames.
- `Save Project`: writes the current project to this browser.
- `Load Saved`: reloads the browser-saved project.
- `New Project / Clear Saved`: removes the browser-saved project and resets the current workspace.
- `Export Project`: downloads a portable `shadow_board_project.json`.
- `Import Project`: loads a previously exported project JSON on the same or another PC.

The project JSON stores detected contours and preview images, not the original uploaded photos. This keeps the app usable after refresh without requiring access to the original image files.

Browser save and exported project files are separate. Clearing the saved browser project does not delete any `.json` project file already downloaded to the PC.

## Measurement Model

The app uses the detected paper rectangle as the scale reference.

- A4: `210 x 297 mm`
- A3: `297 x 420 mm`
- Portrait or landscape orientation is inferred from the detected paper aspect.
- Internal processing uses `PROC_PX_PER_MM = 3`, meaning 3 raster-processing pixels per millimeter.

The DXF output is in millimeters.

## Image Processing Pipeline

### 1. Paper Detection

The app looks for the large bright white paper region in the uploaded photo. It crops and rectifies the image area around that sheet before tool segmentation. This helps ignore drawer edges, dark table areas, and extra background outside the page.

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

## Experimental 3D Printable STL Export

The `Export 3D STL` workflow generates an experimental printable shell for testing printed drawer inserts.

The STL export uses the same arranged drawer geometry as the full DXF export:

- The drawer rectangle becomes the printable board footprint.
- Each arranged tool contour, including merged finger-pull geometry, becomes a through-opening.
- The board is extruded by `Board thickness mm`.
- `Wall / skin mm` defaults to `2 mm`.
- The outside perimeter and every tool-opening wall extend to the bottom of the model.
- Tool openings and the board perimeter are meshed as exact polygon extrusions: the arranged contours become smooth vertical walls, so opening quality no longer depends on a grid resolution.
- Flat faces (top skin, underside, cavity ceiling) are meshed with a Delaunay triangulation over the exact contour vertices plus an interior point grid, producing small well-shaped triangles that shade cleanly in smooth-shading STL viewers. An ear-clipping triangulator with centroid subdivision is the automatic fallback for degenerate clearances.
- Areas away from perimeters and openings are shelled from the underside, leaving only the configured top skin thickness. Only this hidden internal cavity is computed on a grid: its outline is traced with marching squares and smoothed, so `STL cavity detail mm` only affects the invisible underside pocket.
- Binary STL output includes computed facet normals for cleaner shading in slicers and viewers.

This export is intentionally separate from the laser/DXF workflow. It is a first practical printable shell, not a final CAD boolean model. Always inspect the STL in the slicer before printing, especially around narrow tool gaps and small finger-pull features.

## Known Limitations

- Very shiny metal can still confuse segmentation if it reflects white paper strongly.
- Strong shadows touching the tool can become part of the contour.
- Finger-pull circles should overlap the main tool outline; fully separate circles are not intended.
- The app exports polylines rather than true spline/arc geometry.
- Paper detection crops to a bounding box only; it does not perspective-correct an angled photo, so a photo not taken roughly square-on to the paper will produce a dimensionally distorted contour.
- The nesting search uses a raster approximation of the no-fit polygon (see Nesting), not exact Minkowski-sum boundaries, so extremely thin concave openings may be missed at the default 3&nbsp;mm raster resolution.
- In the experimental STL export, only the hidden underside cavity outline is grid-traced (at the selected cavity detail) and deliberately conservative, which can leave internal walls marginally thicker than configured. Tool openings themselves follow the exact arranged contours.
- Browser `file://` security can block automated browser testing, but normal manual use is supported by opening the HTML file directly.
- Browser save storage has a size limit. For large projects, use `Export Project` to save a portable JSON file.

## Recommended Photo Setup

- Use a clean white A3 or A4 sheet.
- Keep the camera as perpendicular to the paper as practical.
- Avoid harsh side lighting.
- Leave visible white space around the entire tool.
- For shiny metal tools, diffuse the light or slightly change the camera angle to reduce white reflections.

## Nesting

`Arrange Now` runs a multi-strategy nesting search over saved project geometry (`autoArrangeAll`):

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
- The export report panel and the `Arrange Now` busy overlay both surface the same validation used to gate DXF/SVG export, so overlap or out-of-bounds issues are visible before an export attempt.

### Possible future improvements

- True Minkowski-sum NFP (e.g. via `clipper2` or a ported SVGnest NFP generator) for exact boundary sliding instead of raster approximation.
- A genetic/evolutionary search over part ordering and rotation, replacing the fixed set of heuristic orderings.
- Moving the search to a Web Worker so very large layouts (dozens of tools) do not compete with UI rendering for main-thread time.
- Optional common-line or shared-edge behavior where it makes sense for foam cutting.
