# Shadow Board DXF Maker

Browser app for making laser-cut shadow-board contours from tool photos taken on A3 or A4 paper.

## Use

Open `outputs/index.html` in a browser, upload tool photos, preview the detected contour, arrange the tools in the drawer layout, adjust the finger-pull handles, then export DXF.

The finger-pull handles are exported as part of one continuous cut contour.

Projects auto-save in the browser. Use **Export Project** to save a portable `.json` project file and **Import Project** to reopen it on another PC.

Set **Project name** before saving/exporting to control project names and downloaded filenames.

Use **New Project / Clear Saved** to reset the browser-saved project and start fresh. Export a project JSON first if you want to keep a backup.

Use **Auto Arrange All** after bulk import to lay out all detected tools inside the drawer automatically. The first version uses row packing with 0/90 degree rotation trials; manual cleanup is still available by dragging and rotating tools.

Finger-pull circles are pinned to the detected tool contour. Dragging a pull moves it along the contour, and export merges it into the tool as one rounded continuous cutout.

## Documentation

See `docs/TECHNICAL_DOCUMENTATION.md` for the processing pipeline, measurement model, DXF export behavior, performance notes, and known limitations.
