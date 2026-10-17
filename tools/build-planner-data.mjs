// Builds porch-planner/elevation-data.js from the house DWG.
//
// It takes the proposed front elevation of No. 20, moves it to local
// coordinates (x = 0 on the party wall, y = 0 at finished floor level), and
// removes the porch and the five front windows. The planner redraws those from
// the dimensions below, so it can move and resize them.
//
// Usage: node build-planner-data.mjs <drawing.dwg> [out.js]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractRegion, readDwg } from './dwg-lines.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const [, , dwgFile, outFile = path.join(here, '../porch-planner/elevation-data.js')] = process.argv;
if (!dwgFile) {
  console.error('usage: node build-planner-data.mjs <drawing.dwg> [out.js]');
  process.exit(1);
}

// Drawing coordinates of the local origin. Y is the finished floor level line.
// X is the party wall centre line with No. 19 on each elevation.
const PROPOSED = { x: 282100.8, y: -25473.8 };
const EXISTING = { x: 72020.3, y: -25473.8 };
// Region around the proposed front elevation, in local coordinates.
const VIEW = { x0: -1300, y0: -700, x1: 10499, y1: 9600 };

// Measured from the proposed front elevation, in local mm.
const HOUSE = { left: 0, right: 8667.1 };
// recess: how far the centre panel wall sits behind the bay fronts (ground floor plan).
const PANEL = { left: 3332.5, right: 5443.5, top: 5020, recess: 453.2 };
const GABLES = { left: 1816.3, right: 7055.3 };
const LEVELS = [
  { y: 8142.6, label: 'Ridge +8.143' },
  { y: 5410, label: 'Attic floor +5.410' },
  { y: 2730, label: 'First floor +2.730' },
  { y: 0, label: 'Ground floor ±0.000' },
  { y: -227, label: 'Exterior −0.227' },
];
const BOUNDARIES = [0, 9719.3];

// Window frames. Sashes, sills and head bands follow from these.
const FF = { bottom: 3610, top: 4790 };
const GF = { bottom: 780, top: 2050 };
const WINDOWS = {
  'ff-left': { label: 'First floor left', cx: 1511.6, width: 2000, panes: 3, ...FF, head: 0 },
  'ff-centre': { label: 'First floor centre', cx: 4540.8, width: 1230, panes: 2, ...FF, head: 0 },
  'ff-right': { label: 'First floor right', cx: 7042.1, width: 2100, panes: 3, ...FF, head: 0 },
  'gf-left': { label: 'Ground floor left', cx: 1511.6, width: 2000, panes: 3, ...GF, head: 250 },
  'gf-right': { label: 'Ground floor right', cx: 7042.1, width: 2100, panes: 3, ...GF, head: 250 },
};
const WINDOW_PARTS = { frame: 80, mullion: 80, transom: 50, topLight: 300, sillOverhang: 80, sillHeight: 80 };

const PORCH = {
  cx: 4388,
  body: 2811, // outside of the two corner posts
  post: 150,
  door: 1000, // door frame, outside to outside
  overhang: 300, // eaves beyond the posts
  ground: -227,
  step: -113.5,
  head: 2050,
  fasciaTop: 2300,
  slope: (3415.7 - 2300) / 1705.5, // roof rise per mm of run (about 33°)
  roofThickness: 119.5, // vertical offset of the inner roof line
  depth: 1696.8, // front of the porch to the bay fronts (ground floor plan)
};

// Ground floor plan, drawing coordinates. Used only to check the two depths above.
const GF_PLAN_REGION = [248000, -82000, 252800, -78900];
const GF_PLAN_CHECKS = [
  [249043.9, -81463.3], [251854.9, -81463.3], // front corners of the porch
  [249393.9, -79766.5], [251504.9, -79766.5], // bay fronts at the centre panel corners
  [249393.9, -79313.3], // centre panel wall
];

// Key vertices that must exist in the drawing. If the DWG changes, the build
// stops instead of drawing the planner from stale dimensions.
const CHECKS = [
  [3925.8, 3610], [5155.8, 4790], // centre first-floor window frame
  [511.6, 3610], [2511.6, 4790], // left first-floor window frame
  [5992.1, 3610], [8092.1, 4790], // right first-floor window frame
  [511.6, 780], [2511.6, 2050], // left ground-floor window frame
  [5992.1, 780], [8092.1, 2050], // right ground-floor window frame
  [2982.5, -227], [5793.5, 2050], // porch corner posts
  [4388, 3415.7], [2682.5, 2300], [6093.5, 2300], // porch roof
  [3332.5, 5020], [5443.5, 5020], // centre panel corners
  [1816.3, 6195.3], [7055.3, 6195.3], // gable apexes
];

const DROP_LAYERS = new Set([
  'A-ANNO-SPLV', 'A-TEXT', 'A-AREA', '00_AUX', 'A-ANNO-SECT', 'A-DIMS-GNRL', 'A-DIMENSION',
  'A-TAGS-NAME', 'A-ANNO-LEVL', 'A-ANNO-CRLN',
]);

const db = await readDwg(dwgFile);
const toLocal = (items, o) =>
  items.map((it) => ({ ...it, pts: it.pts.map(([x, y]) => [x - o.x, y - o.y]) }));
const regionFor = (o) => [VIEW.x0 + o.x, VIEW.y0 + o.y, VIEW.x1 + o.x, VIEW.y1 + o.y];

const proposed = toLocal(extractRegion(db, regionFor(PROPOSED)), PROPOSED);
const existing = toLocal(extractRegion(db, regionFor(EXISTING)), EXISTING);

const near = (a, b, tol = 0.6) => Math.abs(a - b) <= tol;
const expectVertices = (items, checks, where) => {
  for (const [x, y] of checks) {
    if (!items.some((it) => it.pts.some(([px, py]) => near(px, x) && near(py, y)))) {
      throw new Error(`expected a vertex at (${x}, ${y}) in the ${where}; has the drawing changed?`);
    }
  }
};
expectVertices(proposed, CHECKS, 'proposed front elevation');
expectVertices(extractRegion(db, GF_PLAN_REGION), GF_PLAN_CHECKS, 'proposed ground floor plan');

const bbox = (it) => {
  const xs = it.pts.map((p) => p[0]), ys = it.pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};
const inside = (b, [x0, y0, x1, y1]) => b[0] >= x0 - 1 && b[1] >= y0 - 1 && b[2] <= x1 + 1 && b[3] <= y1 + 1;

// Areas the planner redraws itself.
const cutouts = [
  ...Object.values(WINDOWS).map((w) => [
    w.cx - w.width / 2 - WINDOW_PARTS.sillOverhang, w.bottom - WINDOW_PARTS.sillHeight,
    w.cx + w.width / 2 + WINDOW_PARTS.sillOverhang, w.top + w.head,
  ]),
  [PORCH.cx - PORCH.body / 2 - PORCH.overhang, PORCH.ground, PORCH.cx + PORCH.body / 2 + PORCH.overhang, 3415.7],
];

// String courses and the plinth are drawn broken around the porch and windows.
// The planner draws them whole and lets the porch and windows cover them.
const BANDS = [
  { y: 0, x0: 75.1 }, { y: 550, x0: 75.1 }, { y: 700, x0: 0 }, { y: 3380, x0: 0 }, { y: 3530, x0: 0 },
];
const isBandPiece = (it, b) =>
  it.layer === 'A-MISC-ELEV' && b[1] === b[3] && b[0] >= -1 && b[2] <= HOUSE.right + 1 &&
  BANDS.some((band) => near(b[1], band.y));
// The centre panel corners stop at the porch roof. Drawn full height instead.
const isPanelCorner = (it, b) =>
  it.layer === 'A-WALL-ELEV' && b[0] === b[2] && (near(b[0], PANEL.left) || near(b[0], PANEL.right));

const style = (it, b) => {
  if (it.layer === 'A-WALL-EXTL' && b[1] === b[3] && near(b[1], -227, 1)) return 'g';
  if (it.layer === 'A-ROOF-GNRL' || it.layer === 'A-WALL-ELEV' || it.layer === 'A-WALL-EXTL') return 'o';
  if (it.aci === 2 || it.aci === 7) return 'o';
  return 'd';
};
const isNeighbour = (b) => b[2] < -80 || b[0] > BOUNDARIES[1] + 80;

const r = (v) => Math.round(v * 10) / 10;
const flat = (pts) => pts.flatMap(([x, y]) => [r(x), r(y)]);

const removed = new Map();
const lines = [];
for (const it of proposed) {
  if (DROP_LAYERS.has(it.layer)) continue;
  const b = bbox(it);
  if (isBandPiece(it, b) || isPanelCorner(it, b)) continue;
  const cut = cutouts.findIndex((c) => inside(b, c));
  if (cut >= 0) {
    removed.set(cut, (removed.get(cut) || 0) + 1);
    continue;
  }
  lines.push({ k: style(it, b), n: isNeighbour(b) ? 1 : 0, d: flat(it.pts) });
}
for (const band of BANDS) lines.push({ k: 'd', n: 0, d: [band.x0, band.y, HOUSE.right, band.y] });
for (const x of [PANEL.left, PANEL.right]) lines.push({ k: 'o', n: 0, d: [x, PORCH.ground, x, PANEL.top] });

// Ghost of the existing front: walls, roofs and window frames of No. 20 only.
const ghost = existing
  .filter((it) => !DROP_LAYERS.has(it.layer))
  .filter((it) => it.layer === 'A-ROOF-GNRL' || it.layer === 'A-WALL-ELEV' || (it.layer === 'A-WINDOW-ELEV' && it.aci === 2))
  .filter((it) => {
    const b = bbox(it);
    return b[0] >= -80 && b[2] <= HOUSE.right + 80;
  })
  .map((it) => flat(it.pts));

const data = {
  // Uploaded copies can carry an 8-character prefix; show the drawing's own name.
  source: path.basename(dwgFile).replace(/^[0-9a-f]{8}-/, ''),
  units: 'mm',
  note: 'Proposed front elevation of No. 20. x = 0 on the party wall with No. 19, y = 0 at finished floor level.',
  view: VIEW,
  house: HOUSE,
  panel: PANEL,
  gables: GABLES,
  levels: LEVELS,
  boundaries: BOUNDARIES,
  existing: { panelRight: 5873.5, windowCx: 4540.8, doorCx: 4551.2 },
  windows: WINDOWS,
  windowParts: WINDOW_PARTS,
  porch: PORCH,
  lines,
  ghost,
};
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(
  outFile,
  `// Generated by tools/build-planner-data.mjs from ${data.source}. Do not edit by hand.\n` +
    `window.ELEVATION = ${JSON.stringify(data)};\n`,
);
const names = [...Object.keys(WINDOWS), 'porch'];
console.log(`wrote ${lines.length} lines and ${ghost.length} ghost lines to ${outFile}`);
console.log('removed for redrawing:', Object.fromEntries([...removed].map(([i, n]) => [names[i], n])));
