// 3D view for the porch planner: the front of 20 Glen Easton Gardens, with the
// porch and the front windows built from the planner's current design.
//
// Units are mm. x runs along the front from the party wall with No. 19, y is up
// from ground floor level, and z points to the street from the bay fronts.
// Needs three.js r128 (window.THREE).
(() => {
  const T = window.THREE;
  const rad = (d) => (d * Math.PI) / 180;
  const ROOF_THICK = 140; // vertical thickness of the main and gable roofs
  const WALL = 300; // wall thickness

  // ---------- textures ----------
  function seeded(seed) {
    let s = seed;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  }
  function canvasTexture(size, draw, mmW, mmH) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(1 / mmW, 1 / mmH); // UVs are in mm
    t.encoding = T.sRGBEncoding;
    t.anisotropy = 8;
    return t;
  }
  // Stretcher bond, 215 x 65 mm bricks with 10 mm joints. One tile is 900 x 600 mm.
  function brickTexture(base, seed) {
    return canvasTexture(512, (g, n) => {
      const rnd = seeded(seed), sx = n / 900, sy = n / 600;
      g.fillStyle = '#cdc3b6';
      g.fillRect(0, 0, n, n);
      for (let row = 0; row < 8; row++) {
        const y = row * 75, off = row % 2 ? 112.5 : 0;
        for (let x = off - 225; x < 900; x += 225) {
          const k = 0.8 + rnd() * 0.32;
          g.fillStyle = `rgb(${(base[0] * k) | 0},${(base[1] * k) | 0},${(base[2] * k) | 0})`;
          g.fillRect((x + 5) * sx, n - (y + 70) * sy, 215 * sx, 65 * sy);
        }
      }
    }, 900, 600);
  }
  // Interlocking roof tiles, 300 mm courses. One tile is 1200 x 600 mm.
  function tileTexture() {
    return canvasTexture(256, (g, n) => {
      const rnd = seeded(11), sx = n / 1200, sy = n / 600;
      for (let row = 0; row < 2; row++) {
        const v = row * 300, off = row % 2 ? 150 : 0;
        for (let x = off - 300; x < 1200; x += 300) {
          const k = 0.85 + rnd() * 0.25;
          g.fillStyle = `rgb(${(78 * k) | 0},${(70 * k) | 0},${(66 * k) | 0})`;
          g.fillRect(x * sx, n - (v + 300) * sy, 296 * sx, 300 * sy);
          g.fillStyle = 'rgba(0,0,0,0.35)'; // shadow along the lower edge of each course
          g.fillRect(x * sx, n - (v + 26) * sy, 300 * sx, 26 * sy);
        }
      }
    }, 1200, 600);
  }

  function makeMaterials() {
    const std = (o) => new T.MeshStandardMaterial(o);
    const brickMap = brickTexture([140, 64, 46], 7);
    return {
      brick: std({ map: brickMap, roughness: 0.92 }),
      band: std({ map: brickTexture([176, 82, 56], 3), roughness: 0.9 }),
      neighbour: std({ map: brickMap, color: 0xd9cec6, roughness: 0.95 }),
      tile: std({ map: tileTexture(), roughness: 0.85 }),
      ridge: std({ color: 0x3f3936, roughness: 0.85 }),
      trim: std({ color: 0xf1f0ec, roughness: 0.55 }),
      trimUnder: std({ color: 0xe9e8e3, roughness: 0.7, side: T.DoubleSide }),
      sill: std({ color: 0xdcd6cc, roughness: 0.8 }),
      dark: std({ color: 0x24282b, roughness: 0.5 }),
      darkPanel: std({ color: 0x2f3337, roughness: 0.55 }),
      glass: std({ color: 0x26323b, roughness: 0.08, metalness: 0.55 }),
      steel: std({ color: 0xc9cdd1, roughness: 0.25, metalness: 0.85 }),
      lantern: std({ color: 0x1b1d1f, roughness: 0.5, metalness: 0.3 }),
      glow: std({ color: 0xffe2a8, emissive: 0xffb84d, emissiveIntensity: 0.9, roughness: 0.4 }),
      stone: std({ color: 0xcfc9bf, roughness: 0.85 }),
      floor: std({ color: 0x9a948c, roughness: 0.8 }),
      paving: std({ color: 0xb7aa9b, roughness: 0.95 }),
      pot: std({ color: 0xa65a3c, roughness: 0.8 }),
      cowl: std({ color: 0x6d6f71, roughness: 0.6, metalness: 0.4 }),
    };
  }

  // ---------- geometry helpers ----------
  // UVs in mm, projected along the main direction of each face.
  function boxUV(geo) {
    const p = geo.attributes.position, n = geo.attributes.normal;
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
      let u, v;
      if (az >= ax && az >= ay) { u = p.getX(i); v = p.getY(i); }
      else if (ax >= ay) { u = p.getZ(i); v = p.getY(i); }
      else { u = p.getX(i); v = p.getZ(i); }
      uv[2 * i] = u;
      uv[2 * i + 1] = v;
    }
    geo.setAttribute('uv', new T.BufferAttribute(uv, 2));
    return geo;
  }
  function mesh(geo, mat, group, shadows = true) {
    const m = new T.Mesh(geo, mat);
    m.castShadow = shadows;
    m.receiveShadow = true;
    group.add(m);
    return m;
  }
  function box(x0, y0, z0, x1, y1, z1, mat, group) {
    const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0), d = Math.abs(z1 - z0);
    if (w < 0.5 || h < 0.5 || d < 0.5) return null;
    const g = new T.BoxGeometry(w, h, d);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    if (mat.map) boxUV(g);
    return mesh(g, mat, group);
  }
  function shapeOf(points, holes = []) {
    const s = new T.Shape(points.map(([a, b]) => new T.Vector2(a, b)));
    for (const [x0, y0, x1, y1] of holes) {
      const h = new T.Path();
      h.moveTo(x0, y0); h.lineTo(x0, y1); h.lineTo(x1, y1); h.lineTo(x1, y0); h.lineTo(x0, y0);
      s.holes.push(h);
    }
    return s;
  }
  // A wall drawn in the x-y plane, front face at zFront, thickness going back.
  function frontWall(outline, holes, zFront, mat, group, thick = WALL) {
    const g = new T.ExtrudeGeometry(shapeOf(outline, holes), { depth: thick, bevelEnabled: false });
    g.translate(0, 0, zFront - thick);
    boxUV(g);
    return mesh(g, mat, group);
  }
  // A wall drawn in the z-y plane, outer face at xOuter, thickness going inwards
  // (towards +x when inward > 0).
  function sideWall(profileZY, xOuter, inward, mat, group, thick = WALL) {
    const pts = profileZY.map(([z, y]) => [inward > 0 ? -z : z, y]);
    const g = new T.ExtrudeGeometry(shapeOf(pts), { depth: thick, bevelEnabled: false });
    g.rotateY(inward > 0 ? Math.PI / 2 : -Math.PI / 2);
    g.translate(xOuter, 0, 0);
    boxUV(g);
    return mesh(g, mat, group);
  }
  // Triangles [[x,y,z] x3] with UVs from uvOf(point). Faces are turned upwards.
  function trisMesh(tris, uvOf, mat, group) {
    const pos = [], uv = [];
    for (let [a, b, c] of tris) {
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const ny = ab[2] * ac[0] - ab[0] * ac[2];
      if (ny < 0) [b, c] = [c, b];
      for (const p of [a, b, c]) {
        pos.push(...p);
        uv.push(...uvOf(p));
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return mesh(g, mat, group);
  }
  // Roof surface plus a light underside, so overhangs read as soffits from below.
  function roof(tris, uvOf, M, group, under = true) {
    trisMesh(tris, uvOf, M.tile, group);
    if (under) {
      const down = tris.map((t) => t.map(([x, y, z]) => [x, y - ROOF_THICK, z]));
      trisMesh(down, () => [0, 0], M.trimUnder, group).castShadow = false;
    }
  }
  // A board following a sloping line in the x-y plane (a bargeboard).
  function rakeBoard(points, depth, z0, z1, mat, group) {
    const top = points, bottom = points.map(([x, y]) => [x, y - depth]).reverse();
    const g = new T.ExtrudeGeometry(shapeOf([...top, ...bottom]), { depth: z1 - z0, bevelEnabled: false });
    g.translate(0, 0, z0);
    return mesh(g, mat, group);
  }

  // Clips a convex polygon [[x, z]] to a * x + b * z + c <= 0.
  function clipPoly(poly, a, b, c) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const P = poly[i], Q = poly[(i + 1) % poly.length];
      const fp = a * P[0] + b * P[1] + c, fq = a * Q[0] + b * Q[1] + c;
      if (fp <= 0) out.push(P);
      if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) {
        const t = fp / (fp - fq);
        out.push([P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])]);
      }
    }
    return out;
  }

  // ---------- the model ----------
  function create(container, E, K) {
    const WP = E.windowParts, PO = E.porch, H = E.house3d, MR = H.mainRoof;
    const G = PO.ground;
    const PANEL = E.panel;
    const M = makeMaterials();

    const renderer = new T.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';

    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(42, 1, 100, 150000);
    scene.add(new T.HemisphereLight(0xe6eef5, 0x8c7c6c, 0.62));
    const sun = new T.DirectionalLight(0xfff3e2, 0.95);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -17000, right: 17000, top: 17000, bottom: -17000, near: 1000, far: 70000 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 15;
    sun.position.set(-9000, 18000, 16000);
    sun.target.position.set(3500, 0, -2000);
    scene.add(sun, sun.target);

    const staticGroup = new T.Group();
    const dynamicGroup = new T.Group();
    scene.add(staticGroup, dynamicGroup);

    const tanR = (MR.ridgeY - MR.eavesY) / (MR.eavesZ - MR.ridgeZ);
    const cosR = Math.cos(Math.atan(tanR));
    const mainRoofY = (z) => (z >= MR.ridgeZ ? MR.eavesY + (MR.eavesZ - z) * tanR : MR.eavesY + (z - MR.rearEavesZ) * tanR);

    // Gable-topped bay front: wall top follows the underside of the front gable.
    function bayOutline(x0, x1, gable) {
      const s = (gable.apexY - gable.eavesY) / gable.half;
      const top = (x) => gable.apexY - ROOF_THICK - Math.abs(x - gable.apexX) * s;
      return [[x0, G], [x1, G], [x1, top(x1)], [gable.apexX, top(gable.apexX)], [x0, top(x0)]];
    }
    const mirrorGable = (g) => ({ ...g, apexX: -g.apexX });

    function addGableRoof(g, mat, group) {
      const A = [g.apexX - g.half, g.eavesY, MR.eavesZ], B = [g.apexX, g.apexY, MR.eavesZ], C = [g.apexX, g.apexY, g.backZ];
      const D = [g.apexX + g.half, g.eavesY, MR.eavesZ];
      const cos = Math.cos(Math.atan((g.apexY - g.eavesY) / g.half));
      roof([[A, B, C]], ([x, , z]) => [z, (x - A[0]) / cos], M, group);
      roof([[B, D, C]], ([x, , z]) => [z, (D[0] - x) / cos], M, group);
      rakeBoard([[A[0], A[1] + 20], [B[0], B[1] + 20], [D[0], D[1] + 20]], 210, MR.eavesZ - 10, MR.eavesZ + 25, M.trim, group);
    }

    // Boxed eaves along the front: fascia and soffit back to the wall.
    function eavesBox(x0, x1, wallZAt, group) {
      box(x0, MR.soffitY, MR.eavesZ - 25, x1, MR.eavesY + 6, MR.eavesZ, M.trim, group);
      const cuts = [x0, x1, PANEL.left, PANEL.right, -PANEL.left, -PANEL.right].filter((x) => x >= x0 && x <= x1).sort((a, b) => a - b);
      for (let i = 1; i < cuts.length; i++) {
        const mid = (cuts[i - 1] + cuts[i]) / 2;
        box(cuts[i - 1], MR.soffitY - 20, wallZAt(mid), cuts[i], MR.soffitY, MR.eavesZ, M.trim, group);
      }
    }

    function windowParts(w, def, zFace, rails, group, frameMat = M.trim) {
      const f = WP.frame, m = WP.mullion;
      const x0 = w.cx - w.width / 2, x1 = w.cx + w.width / 2, yb = def.bottom, yt = def.top;
      const zF = zFace - 60, zB = zF - 70;
      const bar = (a, b, c, d) => box(a, b, zB, c, d, zF, frameMat, group);
      bar(x0, yb, x0 + f, yt);
      bar(x1 - f, yb, x1, yt);
      bar(x0, yb, x1, yb + f);
      bar(x0, yt - f, x1, yt);
      const pw = (w.width - 2 * f - (w.panes - 1) * m) / w.panes;
      for (let i = 1; i < w.panes; i++) {
        const mx = x0 + f + i * pw + (i - 1) * m;
        bar(mx, yb, mx + m, yt);
      }
      if (rails) {
        const t1 = yt - f - WP.topLight;
        bar(x0 + f, t1 - WP.transom, x1 - f, t1);
      }
      box(x0 + f / 2, yb + f / 2, zB + 25, x1 - f / 2, yt - f / 2, zB + 31, M.glass, group);
      box(x0 - WP.sillOverhang, yb - WP.sillHeight, zFace - 60, x1 + WP.sillOverhang, yb, zFace + 50, M.sill, group);
      if (def.head) box(x0, yt, zFace, x1, yt + def.head, zFace + 12, M.band, group);
      return [x0, yb, x1, yt];
    }

    // Keeps a window opening inside its wall so the wall stays valid.
    function holeIn([x0, y0, x1, y1], wx0, wx1) {
      const a = Math.max(x0, wx0 + 30), b = Math.min(x1, wx1 - 30);
      return b - a > 50 ? [a, y0, b, y1] : null;
    }

    // ---------- static parts ----------
    function buildStatic() {
      const S = staticGroup;
      // Ground and pavement.
      box(-30000, G - 200, -30000, 34000, G, 30000, M.paving, S);

      // Main roof over both houses.
      const xL = -MR.vergeX, xR = MR.vergeX;
      const front = [[xL, MR.eavesY, MR.eavesZ], [xR, MR.eavesY, MR.eavesZ], [xR, MR.ridgeY, MR.ridgeZ], [xL, MR.ridgeY, MR.ridgeZ]];
      const back = [[xL, MR.ridgeY, MR.ridgeZ], [xR, MR.ridgeY, MR.ridgeZ], [xR, MR.eavesY, MR.rearEavesZ], [xL, MR.eavesY, MR.rearEavesZ]];
      roof([[front[0], front[1], front[2]], [front[0], front[2], front[3]]], ([x, , z]) => [x, (MR.eavesZ - z) / cosR], M, S);
      roof([[back[0], back[1], back[2]], [back[0], back[2], back[3]]], ([x, , z]) => [x, (z - MR.rearEavesZ) / cosR], M, S);
      box(xL, MR.ridgeY - 30, MR.ridgeZ - 130, xR, MR.ridgeY + 70, MR.ridgeZ + 130, M.ridge, S);
      // Verges at both gable ends, rear fascia.
      for (const [x, s] of [[xR, -1], [xL, 1]]) {
        const pts = [[MR.eavesZ, MR.eavesY + 20], [MR.ridgeZ, MR.ridgeY + 20], [MR.rearEavesZ, MR.eavesY + 20]];
        const g = new T.ExtrudeGeometry(shapeOf([...pts, ...pts.map(([z, y]) => [z, y - 210]).reverse()]), { depth: 30, bevelEnabled: false });
        g.rotateY(-Math.PI / 2);
        g.translate(x + (s < 0 ? 0 : 30), 0, 0);
        mesh(g, M.trim, S);
      }
      box(xL, MR.soffitY, MR.rearEavesZ, xR, MR.eavesY + 6, MR.rearEavesZ + 25, M.trim, S);

      // Gable end walls and rear wall.
      const wallTop = (z) => mainRoofY(z) - ROOF_THICK;
      const profile = [[0, G], [0, wallTop(0)], [MR.ridgeZ, MR.ridgeY - ROOF_THICK], [-H.depth, wallTop(-H.depth)], [-H.depth, G]];
      sideWall(profile, E.house.right, -1, M.brick, S);
      sideWall(profile, -E.house.right, 1, M.neighbour, S);
      box(-E.house.right, G, -H.depth, E.house.right, wallTop(-H.depth), -H.depth + WALL, M.brick, S);
      box(-E.house.right, MR.soffitY - 20, MR.rearEavesZ, E.house.right, MR.soffitY, -H.depth, M.trim, S);

      // Bay returns into the recessed centre.
      box(PANEL.left - WALL, G, -PANEL.recess, PANEL.left, MR.soffitY, 0, M.brick, S);
      box(PANEL.right, G, -PANEL.recess, PANEL.right + WALL, MR.soffitY, 0, M.brick, S);
      box(-PANEL.left, G, -PANEL.recess, -PANEL.left + WALL, MR.soffitY, 0, M.neighbour, S);

      // Front gables and boxed eaves.
      for (const g of H.gables) addGableRoof(g, M.tile, S);
      addGableRoof(mirrorGable(H.gables[0]), M.tile, S);
      const wallZ20 = (x) => (x > PANEL.left && x < PANEL.right ? -PANEL.recess : 0);
      for (const [a, b] of H.eavesBoxes) eavesBox(a, b, wallZ20, S);
      const wallZ19 = (x) => (x < -PANEL.left ? -PANEL.recess : 0);
      eavesBox(-H.eavesBoxes[0][1], 0, wallZ19, S);
      eavesBox(-MR.vergeX, -H.eavesBoxes[1][0], wallZ19, S);

      // String courses: plinth and first-floor sill bands.
      for (const [y0, y1] of [[550, 700], [3380, 3530]]) {
        box(0, y0, 0, PANEL.left, y1, 12, M.band, S);
        box(PANEL.left, y0, -PANEL.recess, PANEL.right, y1, -PANEL.recess + 12, M.band, S);
        box(PANEL.right, y0, 0, E.house.right, y1, 12, M.band, S);
        box(-PANEL.left, y0, 0, 0, y1, 12, M.band, S);
        box(-E.house.right, y0, -PANEL.recess, -PANEL.left, y1, -PANEL.recess + 12, M.band, S);
      }

      // Chimney on the party wall, on the front slope.
      const C = H.chimney;
      const cz = MR.eavesZ - (C.baseY - MR.eavesY) / tanR;
      box(C.x0, C.baseY - 600, cz - 700, C.x1, C.topY, cz, M.brick, S);
      box(C.x0 - C.cap, C.topY, cz - 700 - C.cap, C.x1 + C.cap, C.capTop, cz + C.cap, M.stone, S);
      for (const px of C.pots) {
        const pot = new T.CylinderGeometry(105, 115, C.potTop - C.capTop, 20);
        pot.translate(px, (C.capTop + C.potTop) / 2, cz - 350);
        mesh(pot, M.pot, S);
        const cowl = new T.ConeGeometry(120, C.cowlTop - C.potTop, 4);
        cowl.translate(px, (C.potTop + C.cowlTop) / 2, cz - 350);
        mesh(cowl, M.cowl, S);
      }

      // Rooflights on the front slope.
      const pitch = Math.atan(tanR);
      for (const [x0, x1] of H.rooflights) {
        const [ya, yb] = H.rooflightY;
        const len = (yb - ya) / Math.sin(pitch);
        const zc = MR.eavesZ - ((ya + yb) / 2 - MR.eavesY) / tanR;
        const g = new T.Group();
        box(-(x1 - x0) / 2, -len / 2, 0, (x1 - x0) / 2, len / 2, 70, M.dark, g);
        box(-(x1 - x0) / 2 + 50, -len / 2 + 50, 70, (x1 - x0) / 2 - 50, len / 2 - 50, 76, M.glass, g);
        g.rotation.x = pitch - Math.PI / 2;
        g.position.set((x0 + x1) / 2, (ya + yb) / 2, zc);
        S.add(g);
      }

      // No. 19, next door, kept simple and muted.
      const N = new T.Group();
      S.add(N);
      const w19 = [
        [{ cx: -E.windows['gf-left'].cx, width: E.windows['gf-left'].width, panes: 3 }, E.windows['gf-left'], 0],
        [{ cx: -E.windows['ff-left'].cx, width: E.windows['ff-left'].width, panes: 3 }, E.windows['ff-left'], 0],
        [{ cx: -E.existing.windowCx, width: 1230, panes: 2 }, E.windows['ff-centre'], -PANEL.recess],
        [{ cx: -7234, width: 1310, panes: 2 }, E.windows['ff-centre'], -PANEL.recess],
        [{ cx: -7042, width: 2100, panes: 3 }, E.windows['gf-right'], -PANEL.recess],
      ];
      const bayHoles = [], recessHoles = [];
      for (const [w, def, z] of w19) (z ? recessHoles : bayHoles).push(windowParts(w, def, z, true, N));
      const door = [-E.existing.doorCx - 450, 0, -E.existing.doorCx + 450, 2050];
      recessHoles.push(door);
      box(door[0], 0, -PANEL.recess - 120, door[2], 2010, -PANEL.recess - 70, M.trim, N);
      const bay19 = bayOutline(-PANEL.left, 0, mirrorGable(H.gables[0]));
      frontWall(bay19, bayHoles.map((h) => holeIn(h, -PANEL.left, 0)).filter(Boolean), 0, M.neighbour, N);
      frontWall([[-E.house.right, G], [-PANEL.left, G], [-PANEL.left, MR.soffitY], [-E.house.right, MR.soffitY]],
        recessHoles.map((h) => holeIn(h, -E.house.right, -PANEL.left)).filter(Boolean), -PANEL.recess, M.neighbour, N);
    }

    // ---------- parts that follow the design ----------
    function buildDynamic(d) {
      const D = dynamicGroup;
      const W = d.windows;
      const holes = { left: [], centre: [], right: [] };
      for (const id of ['gf-left', 'ff-left', 'ff-centre', 'gf-right', 'ff-right']) {
        const z = id === 'ff-centre' ? -PANEL.recess : 0;
        const h = windowParts(W[id], E.windows[id], z, d.rails, D);
        holes[id === 'ff-centre' ? 'centre' : id.endsWith('left') ? 'left' : 'right'].push(h);
      }
      frontWall(bayOutline(0, PANEL.left, H.gables[0]), holes.left.map((h) => holeIn(h, 0, PANEL.left)).filter(Boolean), 0, M.brick, D);
      frontWall(bayOutline(PANEL.right, E.house.right, H.gables[1]), holes.right.map((h) => holeIn(h, PANEL.right, E.house.right)).filter(Boolean), 0, M.brick, D);
      frontWall([[PANEL.left, G], [PANEL.right, G], [PANEL.right, MR.soffitY], [PANEL.left, MR.soffitY]],
        holes.centre.map((h) => holeIn(h, PANEL.left, PANEL.right)).filter(Boolean), -PANEL.recess, M.brick, D);
      buildPorch(d.porch, D);
    }

    function buildPorch(p, D) {
      const ov = PO.overhang, head = PO.head, base = PO.fasciaTop;
      const xl = p.cx - p.body / 2, xr = p.cx + p.body / 2, el = xl - ov, er = xr + ov;
      const zb = p.depth, zf = zb + ov;
      const pl = PANEL.left, pr = PANEL.right, rec = PANEL.recess;
      const wallZ = (x) => (x > pl + 0.5 && x < pr - 0.5 ? -rec : 0);
      const photo = p.front === 'photo';
      const pier = photo ? p.pier : PO.post;
      const frameMat = photo ? M.dark : M.trim;

      // Roof: the lowest of its planes over the roof footprint.
      const cosD = (deg) => Math.cos(rad(deg));
      let planes;
      if (p.roof === 'hipped') {
        const tf = Math.tan(rad(p.pitch)), te = Math.tan(rad(p.endPitch));
        planes = [
          { a: 0, b: -tf, c: base + zf * tf, uv: ([x, , z]) => [x, (zf - z) / cosD(p.pitch)] },
          { a: te, b: 0, c: base - el * te, uv: ([x, , z]) => [z, (x - el) / cosD(p.endPitch)] },
          { a: -te, b: 0, c: base + er * te, uv: ([x, , z]) => [z, (er - x) / cosD(p.endPitch)] },
        ];
      } else {
        const tg = Math.tan(rad(p.pitch));
        planes = [
          { a: tg, b: 0, c: base - el * tg, uv: ([x, , z]) => [z, (x - el) / cosD(p.pitch)] },
          { a: -tg, b: 0, c: base + er * tg, uv: ([x, , z]) => [z, (er - x) / cosD(p.pitch)] },
        ];
      }
      const pieces = [];
      const piece = (x0, x1, z0) => { if (x1 - x0 > 1) pieces.push([[x0, z0], [x1, z0], [x1, zf], [x0, zf]]); };
      piece(el, Math.min(pl, er), 0);
      piece(Math.max(el, pl), Math.min(er, pr), -rec);
      piece(Math.max(el, pr), er, 0);
      planes.forEach((P, i) => {
        const tris = [];
        for (const pc of pieces) {
          let poly = pc;
          planes.forEach((Q, j) => { if (j !== i) poly = clipPoly(poly, P.a - Q.a, P.b - Q.b, P.c - Q.c); });
          const pt = ([x, z]) => [x, P.a * x + P.b * z + P.c, z];
          for (let k = 1; k + 1 < poly.length; k++) tris.push([pt(poly[0]), pt(poly[k]), pt(poly[k + 1])]);
        }
        if (tris.length) trisMesh(tris, P.uv, M.tile, D);
      });
      // Ceiling and fascias.
      for (const pc of pieces) box(pc[0][0], head - 20, pc[0][1], pc[1][0], head, zf, M.trim, D);
      box(el, head, zf - 25, er, base, zf, M.trim, D);
      box(el, head, wallZ(el + 1), el + 25, base, zf, M.trim, D);
      box(er - 25, head, wallZ(er - 1), er, base, zf, M.trim, D);
      if (p.roof === 'gable') {
        const apex = base + ((er - el) / 2) * Math.tan(rad(p.pitch));
        rakeBoard([[el, base + 25], [p.cx, apex + 25], [er, base + 25]], 190, zf - 5, zf + 25, M.trim, D);
        const s = Math.tan(rad(p.pitch));
        const g = new T.ShapeGeometry(shapeOf([[el + 30, base], [er - 30, base], [p.cx, apex - (30 * s)]]));
        g.translate(0, 0, zf - 30);
        mesh(g, M.trim, D);
      }

      // Floor and step.
      for (const pc of pieces) {
        const x0 = Math.max(pc[0][0], xl), x1 = Math.min(pc[1][0], xr);
        if (x1 > x0) box(x0, G, pc[0][1], x1, 0, zb, M.floor, D);
      }
      box(xl, G, zb, xr, PO.step, zb + 340, M.stone, D);

      // Corner piers (photo design) or posts (as drawn).
      box(xl, G, zb - pier, xl + pier, head, zb, M.brick, D);
      box(xr - pier, G, zb - pier, xr, head, zb, M.brick, D);

      // Front frame between the piers.
      const a = xl + pier, dd = xr - pier, b = p.cx - PO.door / 2, c = p.cx + PO.door / 2;
      const zu = zb - (photo ? 110 : 40), zk = zu - 70;
      const member = (x0, y0, x1, y1) => box(x0, y0, zk, x1, y1, zu, frameMat, D);
      box(a, G, zk - 60, dd, 0, zu, M.brick, D);
      member(a, 0, dd, 50);
      member(a, head - 50, dd, head);
      member(a, 0, a + 50, head);
      member(dd - 50, 0, dd, head);
      member(b - 25, 0, b + 50, head);
      member(c - 50, 0, c + 25, head);
      for (const [l, r] of [[a + 50, b - 25], [c + 25, dd - 50]]) {
        if (r - l < 40) continue;
        member(l, PD().rails[0], r, PD().rails[1]);
        box(l, PD().rails[1], zk + 30, r, head - 50, zk + 36, M.glass, D);
        box(l, 50, zk + 10, r, PD().rails[0], zu - 15, photo ? M.darkPanel : M.trim, D);
      }
      const L0 = b + 50, L1 = c - 50;
      if (photo) {
        const PH = K.PHOTO;
        box(L0, PH.leaf[0], zk + 10, L1, PH.leaf[1], zu - 10, M.dark, D);
        const i0 = L0 + PH.stile, i1 = L1 - PH.stile;
        const pw = (i1 - i0 - 2 * PH.bar) / 3;
        for (let k = 0; k < 3; k++) {
          const x = i0 + k * (pw + PH.bar);
          box(x, PH.glass[0], zu - 30, x + pw, PH.glass[1], zu - 7, M.glass, D);
          box(x, PH.panels[0], zu - 16, x + pw, PH.panels[1], zu - 4, M.darkPanel, D);
        }
        box(L0 + PH.handle[0], PH.handle[2], zu - 10, L0 + PH.handle[1], PH.handle[3], zu + 45, M.steel, D);
        // Wall lanterns on the pier fronts.
        if (pier >= 2 * PH.lantern.cap) {
          for (const pc of [xl + pier / 2, xr - pier / 2]) {
            const [ly0, ly1] = PH.lantern.y;
            box(pc - 80, ly0, zb, pc + 80, ly0 + 25, zb + 170, M.lantern, D);
            box(pc - 80, ly1 - 25, zb, pc + 80, ly1, zb + 170, M.lantern, D);
            box(pc - 62, ly0 + 25, zb + 15, pc + 62, ly1 - 25, zb + 155, M.glow, D).castShadow = false;
            const cap = new T.ConeGeometry(118, 90, 4);
            cap.rotateY(Math.PI / 4);
            cap.translate(pc, ly1 + 45, zb + 85);
            mesh(cap, M.lantern, D);
          }
        }
      } else {
        // As drawn: double doors under a fanlight.
        const P = PD();
        member(b, P.doorHead - 80, c, P.fanlight[0]);
        box(b + 50, P.fanlight[0], zk + 30, c - 50, head - 50, zk + 36, M.glass, D);
        for (const [u0] of P.fanlightPanes.slice(1)) member(p.cx + u0 - 40, P.fanlight[0], p.cx + u0, head - 50);
        for (const s of [-1, 1]) {
          const x0 = p.cx + s * P.leaf[0], x1 = p.cx + s * P.leaf[1];
          box(Math.min(x0, x1), P.leaf[2], zk + 10, Math.max(x0, x1), P.leaf[3], zu - 10, M.trim, D);
          const g0 = p.cx + s * P.leafPanel[0], g1 = p.cx + s * P.leafPanel[1];
          box(Math.min(g0, g1), P.leafPanel[2], zu - 14, Math.max(g0, g1), P.leafPanel[3], zu - 6, M.glass, D);
        }
      }

      // Porch sides, from the house to the corner piers.
      for (const [xo, s] of [[xl, 1], [xr, -1]]) {
        const zBack = wallZ(xo + s), zFront = zb - pier;
        if (zFront - zBack < 60) continue;
        if (p.sides === 'brick') {
          box(xo, G, zBack, xo + s * 215, head, zFront, M.brick, D);
          continue;
        }
        const x0 = xo + s * 40, x1 = xo + s * 110;
        const sm = (z0, y0, z1, y1) => box(x0, y0, z0, x1, y1, z1, frameMat, D);
        box(xo, G, zBack, xo + s * 150, 0, zFront, M.brick, D);
        sm(zBack, 0, zFront, 50);
        sm(zBack, head - 50, zFront, head);
        sm(zBack, 0, zBack + 50, head);
        sm(zFront - 50, 0, zFront, head);
        sm(zBack + 50, PD().rails[0], zFront - 50, PD().rails[1]);
        box(xo + s * 66, PD().rails[1], zBack + 50, xo + s * 72, head - 50, zFront - 50, M.glass, D);
        box(xo + s * 55, 50, zBack + 50, xo + s * 100, PD().rails[0], zFront - 50, photo ? M.darkPanel : M.trim, D);
      }
    }
    const PD = () => K.PD;

    // ---------- camera ----------
    const view = { az: 0, el: 0.08, dist: 11000, target: new T.Vector3(4400, 1400, 800) };
    let lastDesign = null;
    function placeCamera() {
      const minY = G + 250;
      let { az, el, dist } = view;
      const t = view.target;
      if (t.y + dist * Math.sin(el) < minY) el = Math.asin((minY - t.y) / dist);
      view.el = el;
      camera.position.set(t.x + dist * Math.cos(el) * Math.sin(az), t.y + dist * Math.sin(el), t.z + dist * Math.cos(el) * Math.cos(az));
      camera.lookAt(t);
      request();
    }
    // Viewpoints at standing eye height (1.65 m), looking towards the porch.
    // d is the distance on the ground from the porch, ty the height looked at.
    const CAMERAS = {
      front: { az: 0, eye: 1650, d: 15500, ty: 3000 },
      left: { az: -40, eye: 1650, d: 14000, ty: 2800 },
      right: { az: 40, eye: 1650, d: 14000, ty: 2800 },
      // No. 19 is attached on the left, so the left view stands in its front garden.
      'left-side': { az: -65, eye: 1650, d: 9500, ty: 2400 },
      'right-side': { az: 84, eye: 1650, d: 10500, ty: 2400 },
      above: { az: -32, eye: 11500, d: 17000, ty: 2500 },
    };
    function setCamera(name) {
      const c = CAMERAS[name];
      const p = lastDesign ? lastDesign.porch : { cx: PO.cx, depth: PO.depth };
      view.target.set(p.cx, c.ty, p.depth * 0.45);
      const rise = c.eye - view.target.y;
      view.az = rad(c.az);
      view.el = Math.atan2(rise, c.d);
      view.dist = Math.hypot(c.d, rise);
      placeCamera();
    }

    const canvas = renderer.domElement;
    canvas.style.touchAction = 'none';
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', '3D view of the front of the house. Drag to turn it, scroll to zoom.');
    const pointers = new Map();
    let gesture = null;
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      gesture = pointers.size === 1 ? (e.shiftKey || e.button === 2 ? 'pan' : 'orbit') : 'pinch';
    });
    canvas.addEventListener('pointermove', (e) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      if (gesture === 'pinch' && pointers.size === 2) {
        const [p1, p2] = [...pointers.values()];
        const before = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const [q1, q2] = [...pointers.values()];
        const after = Math.hypot(q1.x - q2.x, q1.y - q2.y);
        if (before > 0 && after > 0) view.dist = Math.min(45000, Math.max(1500, view.dist * (before / after)));
        pan(dx / 2, dy / 2);
        placeCamera();
        return;
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (gesture === 'pan') pan(dx, dy);
      else {
        view.az -= dx * 0.006;
        view.el = Math.min(1.45, Math.max(-0.05, view.el + dy * 0.004));
      }
      placeCamera();
    });
    const lift = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size === 1) gesture = 'orbit';
      if (!pointers.size) gesture = null;
    };
    canvas.addEventListener('pointerup', lift);
    canvas.addEventListener('pointercancel', lift);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      view.dist = Math.min(45000, Math.max(1500, view.dist * Math.exp(e.deltaY * 0.0012)));
      placeCamera();
    }, { passive: false });
    canvas.addEventListener('keydown', (e) => {
      const k = { ArrowLeft: [0.08, 0], ArrowRight: [-0.08, 0], ArrowUp: [0, 0.05], ArrowDown: [0, -0.05] }[e.key];
      if (k) {
        view.az += k[0];
        view.el = Math.min(1.45, Math.max(-0.05, view.el + k[1]));
      } else if (e.key === '+' || e.key === '=') view.dist = Math.max(1500, view.dist * 0.9);
      else if (e.key === '-') view.dist = Math.min(45000, view.dist * 1.1);
      else return;
      e.preventDefault();
      placeCamera();
    });
    function pan(dx, dy) {
      const h = canvas.clientHeight || 1;
      const scale = (2 * view.dist * Math.tan(rad(camera.fov / 2))) / h;
      const right = new T.Vector3().setFromMatrixColumn(camera.matrix, 0);
      const up = new T.Vector3().setFromMatrixColumn(camera.matrix, 1);
      view.target.addScaledVector(right, -dx * scale).addScaledVector(up, dy * scale);
      view.target.y = Math.max(0, view.target.y);
    }

    // ---------- rendering ----------
    let frame = 0, rebuild = false;
    function request() {
      if (!frame) frame = requestAnimationFrame(draw);
    }
    function draw() {
      frame = 0;
      if (rebuild && lastDesign) {
        rebuild = false;
        for (const child of [...dynamicGroup.children]) {
          dynamicGroup.remove(child);
          child.traverse((o) => o.geometry && o.geometry.dispose());
        }
        buildDynamic(lastDesign);
      }
      const sky = getComputedStyle(container).getPropertyValue('--sky').trim() || '#dde5ea';
      scene.background = new T.Color(sky);
      renderer.render(scene, camera);
    }
    function resize() {
      const w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      request();
    }
    new ResizeObserver(resize).observe(container);

    buildStatic();
    resize();
    setCamera('left');
    return {
      update(design) {
        lastDesign = design;
        rebuild = true;
        request();
      },
      setCamera,
      resize,
      redraw: request,
    };
  }

  window.House3D = { create };
})();
