# 20 Glen Easton Gardens renovation

## Porch & window planner

`porch-planner/index.html` is the proposed front elevation from the CAD drawing. You can move and resize the porch and the five front windows in it. Open the file in a browser. It needs `elevation-data.js` next to it.

Use it to test where the porch and the first-floor centre window go now that the first-floor extension narrows the centre panel:

- Drag the porch or a window sideways. They snap to the panel centre, the house centre and to each other.
- Drag the square handles to change the width evenly about the centre. Set the number of panes in the side panel.
- Turn "Window top rails" off to draw every front window as full-height panes, with no rail and no top light.
- Select the porch to choose a hipped or gable roof, set the front pitch and the porch depth, run the hips to the centre panel corners or set their pitch, and switch between the photo design (brick piers, one door, tall side lights) and the drawn double doors.
- Choose **3D** to turn the front of the house and look at the porch from any angle. The viewpoint buttons stand at eye height at the front, at 40° from each side, from each side and from above. The model follows every change in the side panel. It loads three.js from cdnjs the first time it opens, and its code is in `porch-planner/house3d.js`.
- The symmetry checks show the offsets, the pane widths and the clearances in millimetres.

The 3D model is built from the front and side elevations and the ground floor plan. The rear, the side windows, the garden and No. 19 next door are simplified.

All dimensions are in mm. x is measured from the party wall with No. 19 and y from ground floor level. The porch and the windows are redrawn from the drawing's own dimensions. All other line work is the drawing itself.

## Rebuild the data from the DWG

The DWG is not stored in the repository. To rebuild after the drawing changes:

```sh
cd tools
npm install
node build-planner-data.mjs /path/to/26134.20_Glen_Easton_Gardens.WIP.dwg
```

The build stops with an error if the key points of the porch, the windows or the centre panel have moved in the drawing. In that case, update the dimensions at the top of `tools/build-planner-data.mjs`.

`tools/extract-elevation.mjs` dumps the line work of any other region of the drawing to JSON. Use it to look at the plans or the other elevations.
