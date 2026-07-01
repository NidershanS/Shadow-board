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
2. Upload one or more photos in the app.
3. Select paper size: A4 or A3. The app supports portrait and landscape photos.
4. Process images to detect the paper, segment the tool, smooth the outline, and apply the cut offset.
5. Preview each detected tool contour.
6. Add tools to the drawer layout and drag/rotate them into position.
7. Move the blue finger-pull handles.
8. Use `Auto Arrange All` to lay out bulk imports, if needed.
9. Export either the full drawer DXF or the selected tool DXF.

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

## DXF Export

The DXF writer emits simple `LWPOLYLINE` entities.

Full drawer export:

- Adds a `DRAWER` rectangle layer.
- Adds one `CUT_*` layer per arranged tool.
- Each tool is exported in its arranged drawer position and rotation.

Selected tool export:

- Exports the selected tool as one local `CUT` contour.
- Includes moved finger-pull handles as part of the same contour.

## Known Limitations

- Very shiny metal can still confuse segmentation if it reflects white paper strongly.
- Strong shadows touching the tool can become part of the contour.
- Finger-pull circles should overlap the main tool outline; fully separate circles are not intended.
- The app exports polylines rather than true spline/arc geometry.
- Browser `file://` security can block automated browser testing, but normal manual use is supported by opening the HTML file directly.
- Browser save storage has a size limit. For large projects, use `Export Project` to save a portable JSON file.

## Recommended Photo Setup

- Use a clean white A3 or A4 sheet.
- Keep the camera as perpendicular to the paper as practical.
- Avoid harsh side lighting.
- Leave visible white space around the entire tool.
- For shiny metal tools, diffuse the light or slightly change the camera angle to reduce white reflections.

## Nesting Roadmap

The first nesting module uses saved project geometry as its input. It:

- Reads all layout-item contours in millimeters.
- Includes finger-pull circle extents in the layout footprint.
- Uses `Arrange spacing mm` as the requested contour-to-contour clearance between nested tools.
- Tries `0`, `90`, `180`, and `270` degree rotations in the experimental Deepnest-lite branch.
- Uses simple shelf/row packing on `main`; the Deepnest-lite branch uses contour-aware candidate placement.
- Respects drawer width and drawer height as the target area.
- Keeps manual drag/rotate cleanup available after the automatic placement.

This is intentionally the first practical step, not final advanced nesting.

Deepnest is a useful reference for advanced nesting behavior such as DXF workflows, no-fit polygon placement, common-line merging, and speed-critical geometry. Directly embedding the whole Deepnest desktop project would make this app heavier, so the cleaner route is to build a browser-native nesting module around this app's own contour data.

Future improvements can add:

- More rotation candidates, such as `15` or `30` degree steps.
- Collision checks against the actual contour instead of only the layout footprint.
- No-fit polygon placement.
- Better scoring for tight drawer packing.
- Optional common-line or shared-edge behavior where it makes sense for foam cutting.
