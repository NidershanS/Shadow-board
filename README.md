# SnapInset

Snap your tools. Print the fit.

Browser app that turns photos of tools on A4, A3, or US Letter paper into a drawer shadow board. It exports a hollow-shell STL for 3D printing and a DXF or SVG for laser cutting.

Open `outputs/index.html` in a browser, or use the hosted app. There is no build step.

## Use

1. Photograph one or more tools on a whole sheet of paper, with all four corners in frame. The tools should not touch.
2. Drop the photo on the page, or use Choose photos. Detection starts on its own.
3. Review each outline. Accept adds it to the drawer.
4. Drag tools into place, or use Auto-arrange. Arrow keys nudge the selection. Ctrl+Z undoes a layout change.
5. Export STL, or Export tiles when the board is larger than the printer. Switch to Laser cut for DXF and SVG.

The layout autosaves in this browser. Export project JSON to move it to another computer. Older project files still load. New files are marked `app: "SnapInset"` and `version: 2`.

## What you get

- A printable shell with the solid skin on the bed, a floor in every pocket, and a hollow interior that opens upward.
- Per-tool pocket depth. The default is 15 mm.
- A rough PLA mass, from the mesh volume at 1.24 g/cm³, labeled as an estimate.
- Tiles with dovetail keys when the board is larger than the chosen bed, plus a clearance coupon, in one zip file.

## Documentation

`docs/TECHNICAL_DOCUMENTATION.md` covers scale, the print shell, tiling, nesting, and DXF/SVG export.
