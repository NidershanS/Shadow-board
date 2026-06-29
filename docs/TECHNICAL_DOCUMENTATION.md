# Shadow Board DXF Maker - Technical Documentation

## Purpose

Shadow Board DXF Maker converts photos of tools placed on A3 or A4 paper into laser-cut DXF outlines for drawer shadow boards. The workflow is designed for a browser-only setup: upload photos, detect the paper and tool, preview the contour, arrange tools on a drawer-sized board, place finger-pull handles, then export DXF.

## Main Files

- `outputs/shadow_board_app.html`: self-contained browser application.
- `outputs/shadow_board_from_a4.py`: reference Python command-line processing script used during prototyping.
- `README.md`: short user-facing project overview.
- `.gitignore`: excludes generated previews and test outputs from Git.

## User Workflow

1. Photograph a tool on a white A3 or A4 sheet.
2. Upload one or more photos in the app.
3. Select paper size: A4 or A3. The app supports portrait and landscape photos.
4. Process images to detect the paper, segment the tool, smooth the outline, and apply the cut offset.
5. Preview each detected tool contour.
6. Add tools to the drawer layout and drag/rotate them into position.
7. Move the blue finger-pull handles.
8. Export either the full drawer DXF or the selected tool DXF.

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

Important export behavior:

- The circles are not exported as separate DXF circles.
- The app unions the tool contour and finger-pull circles into one raster mask.
- That combined mask is retraced into one continuous `LWPOLYLINE`.
- The red outline shown on the drawer is the actual single contour that will be exported.

For clean results, each pull handle should overlap the tool contour. If a pull circle is moved far away from the tool, the union may become disconnected and the tracer will keep the largest closed contour.

## Performance Notes

Combining finger-pull handles into a single contour is more expensive than drawing separate circles. The app uses two optimizations:

- Combined contours are cached per layout item.
- Dragging a whole tool only redraws the canvas; it does not rebuild side panels or recompute the local contour.

The combined contour is recalculated only when:

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

## Recommended Photo Setup

- Use a clean white A3 or A4 sheet.
- Keep the camera as perpendicular to the paper as practical.
- Avoid harsh side lighting.
- Leave visible white space around the entire tool.
- For shiny metal tools, diffuse the light or slightly change the camera angle to reduce white reflections.
