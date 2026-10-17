// Reads a DWG file and flattens the model-space line work of a region into
// polylines. Blocks are exploded, curves become polylines, and everything is
// clipped to the region. Hatches, text and dimensions are left out.
import { Dwg_File_Type, LibreDwg } from '@mlightcad/libredwg-web';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));

export async function readDwg(file) {
  const lib = await LibreDwg.create(path.join(here, 'node_modules/@mlightcad/libredwg-web/wasm/'));
  const dwg = lib.dwg_read_data(fs.readFileSync(file), Dwg_File_Type.DWG);
  const db = lib.convert(dwg);
  lib.dwg_free(dwg);
  return db;
}

// 2D affine transform [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f
const I = [1, 0, 0, 1, 0, 0];
const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m, p) => [m[0] * p.x + m[2] * p.y + m[4], m[1] * p.x + m[3] * p.y + m[5]];
// An extrusion direction of (0, 0, -1) mirrors the object coordinate system in X.
const ocs = (e) => (e.extrusionDirection && e.extrusionDirection.z < 0 ? [-1, 0, 0, 1, 0, 0] : I);

function arcPoints(c, r, a0, a1) {
  while (a1 <= a0) a1 += 2 * Math.PI;
  const n = Math.max(8, Math.ceil(((a1 - a0) / (2 * Math.PI)) * 64));
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) };
  });
}

function bulgePoints(p, q, bulge) {
  const chord = Math.hypot(q.x - p.x, q.y - p.y);
  if (!bulge || chord < 1e-9) return [q];
  const theta = 4 * Math.atan(bulge);
  const r = chord / (2 * Math.sin(theta / 2));
  const h = r * Math.cos(theta / 2);
  const nx = -(q.y - p.y) / chord, ny = (q.x - p.x) / chord;
  const c = { x: (p.x + q.x) / 2 + nx * h, y: (p.y + q.y) / 2 + ny * h };
  const a0 = Math.atan2(p.y - c.y, p.x - c.x);
  const n = Math.max(4, Math.ceil(Math.abs(theta) / (Math.PI / 16)));
  const out = [];
  for (let i = 1; i <= n; i++) {
    const a = a0 + (theta * i) / n;
    out.push({ x: c.x + Math.abs(r) * Math.cos(a), y: c.y + Math.abs(r) * Math.sin(a) });
  }
  out[out.length - 1] = q;
  return out;
}

// Returns a list of point lists (in object coordinates) for one entity.
function shapes(e) {
  switch (e.type) {
    case 'LINE':
      return [[e.startPoint, e.endPoint]];
    case 'LWPOLYLINE': {
      const v = e.vertices;
      if (!v.length) return [];
      // In DWG data bit 512 marks a closed polyline (DXF uses bit 1).
      const closed = (e.flag & 512) !== 0;
      const pts = [v[0]];
      const n = closed ? v.length : v.length - 1;
      for (let i = 0; i < n; i++) pts.push(...bulgePoints(v[i], v[(i + 1) % v.length], v[i].bulge));
      return [pts];
    }
    case 'ARC':
      return [arcPoints(e.center, e.radius, e.startAngle, e.endAngle)];
    case 'CIRCLE':
      return [arcPoints(e.center, e.radius, 0, 2 * Math.PI)];
    case 'ELLIPSE': {
      const m = e.majorAxisEndPoint;
      const rot = Math.atan2(m.y, m.x), a = Math.hypot(m.x, m.y), b = a * e.axisRatio;
      let t0 = e.startAngle, t1 = e.endAngle;
      while (t1 <= t0) t1 += 2 * Math.PI;
      const n = 64;
      return [Array.from({ length: n + 1 }, (_, i) => {
        const t = t0 + ((t1 - t0) * i) / n;
        const x = a * Math.cos(t), y = b * Math.sin(t);
        return { x: e.center.x + x * Math.cos(rot) - y * Math.sin(rot), y: e.center.y + x * Math.sin(rot) + y * Math.cos(rot) };
      })];
    }
    case 'SPLINE':
      return [e.fitPoints?.length ? e.fitPoints : e.controlPoints];
    default:
      return [];
  }
}

// Liang-Barsky segment clipping against [X0, X1] x [Y0, Y1].
function clipSeg([x0, y0], [x1, y1], [X0, Y0, X1, Y1]) {
  const dx = x1 - x0, dy = y1 - y0;
  let u0 = 0, u1 = 1;
  for (const [p, q] of [[-dx, x0 - X0], [dx, X1 - x0], [-dy, y0 - Y0], [dy, Y1 - y0]]) {
    if (p === 0) {
      if (q < 0) return null;
    } else {
      const r = q / p;
      if (p < 0) { if (r > u1) return null; if (r > u0) u0 = r; }
      else { if (r < u0) return null; if (r < u1) u1 = r; }
    }
  }
  return [[x0 + u0 * dx, y0 + u0 * dy], [x0 + u1 * dx, y0 + u1 * dy]];
}

// Clips a polyline to the region and splits it where it leaves the region.
function clip(pts, box) {
  const [X0, Y0, X1, Y1] = box;
  const inside = ([x, y]) => x >= X0 && x <= X1 && y >= Y0 && y <= Y1;
  const segs = [];
  let cur = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const s = clipSeg(pts[i], pts[i + 1], box);
    if (!s) {
      if (cur.length > 1) segs.push(cur);
      cur = [];
      continue;
    }
    const [a, b] = s;
    const last = cur[cur.length - 1];
    if (!last || last[0] !== a[0] || last[1] !== a[1]) {
      if (cur.length > 1) segs.push(cur);
      cur = [a];
    }
    cur.push(b);
    if (!inside(pts[i + 1])) {
      segs.push(cur);
      cur = [];
    }
  }
  if (cur.length > 1) segs.push(cur);
  return segs;
}

// Returns [{ layer, aci, pts: [[x, y], ...] }] for the visible model-space
// line work inside box = [x0, y0, x1, y1].
export function extractRegion(db, box) {
  const layers = new Map(db.tables.LAYER.entries.map((l) => [l.name, l]));
  const blocks = new Map(db.tables.BLOCK_RECORD.entries.map((b) => [b.name, b]));
  const hidden = (name) => {
    const l = layers.get(name);
    return !l || l.off || l.frozen || name === 'Defpoints';
  };
  const out = [];

  function walk(entities, m, inheritLayer, inheritColor, depth) {
    for (const e of entities) {
      if (e.isVisible === false) continue;
      const layer = e.layer === '0' && inheritLayer ? inheritLayer : e.layer;
      if (hidden(layer)) continue;
      let color = e.colorIndex;
      if (color === 0) color = inheritColor ?? 7;
      if (color === 256) color = layers.get(layer)?.colorIndex ?? 7;
      if (e.type === 'INSERT') {
        const b = blocks.get(e.name);
        if (!b || depth > 8) continue;
        const p = e.insertionPoint, bp = b.basePoint || { x: 0, y: 0 };
        const c = Math.cos(e.rotation || 0), s = Math.sin(e.rotation || 0);
        let t = mul(ocs(e), [1, 0, 0, 1, p.x, p.y]);
        t = mul(t, [c, s, -s, c, 0, 0]);
        t = mul(t, [e.xScale || 1, 0, 0, e.yScale || 1, 0, 0]);
        t = mul(t, [1, 0, 0, 1, -bp.x, -bp.y]);
        walk(b.entities || [], mul(m, t), layer, color, depth + 1);
        continue;
      }
      const t = mul(m, ocs(e));
      for (const pts of shapes(e)) {
        const q = pts.map((p) => apply(t, p));
        if (q.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) continue;
        for (const seg of clip(q, box)) out.push({ layer, aci: Math.abs(color), pts: seg });
      }
    }
  }

  walk(blocks.get('*Model_Space').entities, I, null, null, 0);
  return out;
}
