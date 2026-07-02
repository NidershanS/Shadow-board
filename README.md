# Shadow Board DXF Maker

Browser app for making laser-cut shadow-board contours from tool photos taken on A3 or A4 paper.

Live app: https://shadow-board-qlwk.vercel.app/

## Use

Open the live app or open `outputs/index.html` locally in a browser. Drop tool photos onto the page (or use Choose Files) to start contour detection automatically. Tune the contour in the review modal if needed, accept it, then arrange the drawer and export DXF or SVG.

Accepting a contour adds it straight to the drawer with a non-overlapping placement — there is no separate "add to drawer" step for the normal flow.

The finger-pull handles are exported as part of one continuous cut contour.

Projects auto-save in the browser. Use **Export Project** to save a portable `.json` project file and **Import Project** to reopen it on another PC (dropping a `.json` file onto the page also imports it).

Set **Project name** before saving/exporting to control project names and downloaded filenames.

Use **New Project / Clear Saved** to reset the browser-saved project and start fresh. Export a project JSON first if you want to keep a backup.

Use **Arrange Now** to auto-nest all drawer tools. Choose **Tidy** (0/90 degree only, for a visually neat drawer) or **Dense** (any rotation, for maximum packing) from **Arrange rotation**. The layout updates live on screen as better placements are found; use **Stop and keep best layout** to end the search early.

Finger-pull circles are pinned to the detected tool contour. Dragging a pull moves it along the contour, and export merges it into the tool as one rounded continuous cutout. Dragging any tool over another highlights the overlap in red before you even try to export.

Scroll to zoom the drawer canvas toward your cursor; drag empty canvas space to pan. Select a tool and press `R` (or `Shift+R`) to rotate it 15 degrees.

## Documentation

See `docs/TECHNICAL_DOCUMENTATION.md` for the processing pipeline, measurement model, nesting algorithm, DXF/SVG export behavior, performance notes, and known limitations.
