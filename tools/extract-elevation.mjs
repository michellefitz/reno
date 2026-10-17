// Dumps the line work of one region of a DWG model space to JSON. Use it to
// look at other parts of the drawing (plans, other elevations).
//
// Usage: node extract-elevation.mjs <drawing.dwg> <out.json> <x0> <y0> <x1> <y1>
import fs from 'fs';
import path from 'path';
import { extractRegion, readDwg } from './dwg-lines.mjs';

const [, , inFile, outFile, ...box] = process.argv;
if (!inFile || !outFile || box.length !== 4) {
  console.error('usage: node extract-elevation.mjs <drawing.dwg> <out.json> <x0> <y0> <x1> <y1>');
  process.exit(1);
}
const region = box.map(Number);
const items = extractRegion(await readDwg(inFile), region);
const r = (v) => Math.round(v * 10) / 10;
fs.writeFileSync(outFile, JSON.stringify({
  source: path.basename(inFile),
  units: 'mm',
  region,
  items: items.map((o) => ({ ...o, pts: o.pts.map(([x, y]) => [r(x), r(y)]) })),
}));
console.log(`wrote ${items.length} items to ${outFile}`);
