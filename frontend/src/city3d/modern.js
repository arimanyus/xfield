// The city's one building kit, built from boxes: flat colours, whole punched windows, and the owner's colour on roofs,
// awnings and trim. Designs sit on y = 0, centred on their lot, with their front at +z.
// Parts merge by kind: solid (fixed colours), wall (windows in a pale wash of the owner's colour, or in a fixed colour),
// glass (curtain wall), tone (the pale wash, no windows) and accent (the owner's full colour). Unlit houses get grey glass.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const FH = 0.12;
const BAY = 0.1;
const C = { white: "#FBF8F3", cream: "#F1E6D2", sand: "#E3D3B8", stone: "#D8D2C8", concrete: "#BFB8AD", dark: "#2E3440",
            wood: "#B98A62", trunk: "#8B6646", lawn: "#86C96E", leaf: "#5DB552", pine: "#2F8F4E", solar: "#27466E",
            water: "#6CB8F0", lamp: "#FBBF24", gold: "#D4A72C", hedge: "#3F8F3A", rose: "#F472B6", tulip: "#FACC15",
            marble: "#F5F2EC", pool: "#38BDF8" };
// The Docks: rust, tin, plywood and dirt.
const D = { tin: "#7F878C", rust: "#8E4628", rust2: "#5F2E1B", ply: "#A38B63", boards: "#6E5C43", dirt: "#655A4A", grime: "#4C463D",
            pane: "#353B44", black: "#26262A", bag: "#1E2530", cinder: "#8A867E", sheet: "#C9C3B4", tarp: "#3E6FA3", hull: "#3B4A52",
            fire: "#F97316", flame: "#FDE047", mud: "#4A4238" };
const corners = (h) => [[-h, -h], [h, -h], [-h, h], [h, h]];
// A ladder up the side of a Docks floor.
const ladder = (b, x, z, h = 0.2) => {
  for (const dz of [-0.04, 0.04]) b.solid(0.01, h, 0.01, x, 0, z + dz, D.black);
  for (let i = 1; i < 4; i++) b.solid(0.01, 0.006, 0.09, x, (i * h) / 4, z, D.black);
};

// 4x4 windows, a few with blinds down. A wall's window sits high in its floor over a sill; curtain glass runs edge
// to edge above a spandrel. Roofs sample the cell's bottom corner, which is plain.
function windowTexture(curtain, off) {
  const n = 4, px = 64, canvas = document.createElement("canvas");
  canvas.width = canvas.height = n * px;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = curtain ? "#E6ECF2" : "#FFFFFF";
  ctx.fillRect(0, 0, n * px, n * px);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const [x, y, w, h] = curtain ? [i * px + 2, j * px + 2, px - 4, px - 14] : [i * px + 14, j * px + 10, px - 28, px - 26];
      const k = (i * 5 + j * 3) % 7, g = ctx.createLinearGradient(0, y, 0, y + h);
      const [top, bottom] = off ? ["#A7B1BE", "#6B7787"] : k === 3 ? ["#A4C6E6", "#4C7BAD"] : ["#CDE6F8", "#6A9BCB"];
      g.addColorStop(0, top);
      g.addColorStop(1, bottom);
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      if (!off && k === 0) {
        ctx.fillStyle = "#F4E9D6";
        ctx.fillRect(x, y, w, h * 0.4);
      }
      if (!curtain) {
        ctx.fillStyle = "rgba(25,45,75,0.25)";
        ctx.fillRect(x, y, w, 3);
        ctx.fillStyle = "#E4DED4";
        ctx.fillRect(x - 3, y + h, w + 6, 4);
      }
    }
  }
  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}

let MATERIALS = null;
const materials = () => (MATERIALS ||= (() => {
  const lambert = (o) => new THREE.MeshLambertMaterial(o);
  const wall = [windowTexture(false, false), windowTexture(false, true)], glass = [windowTexture(true, false), windowTexture(true, true)];
  return {
    solid: [lambert({ vertexColors: true })],
    wall: wall.map((map) => lambert({ map })),
    facade: wall.map((map) => lambert({ map, vertexColors: true })),
    glass: glass.map((map) => lambert({ map })),
    tone: [lambert()],
    accent: [lambert()],
    lamp: [lambert({ color: "#D9A441", emissive: "#8A5A12", emissiveIntensity: 0.55 }), lambert({ color: "#353B44" })],
    warm: [lambert({ color: "#FDE68A", emissive: "#F59E0B", emissiveIntensity: 0.7 }), lambert({ color: "#6B7787" })],
  };
})());

function place(g, x, y, z, color, rot) {
  g.rotateY(rot);
  g.translate(x, y, z);
  const out = g.index ? g.toNonIndexed() : g, c = new THREE.Color(color), n = out.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  out.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return out;
}

// Every face shows as many whole floors and bays as fit; tops and bottoms are plain.
const cells = (len, size) => Math.max(1, Math.round(len / size)) / 4;
function box(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, across = [d, d, w, w, w, w].map((l) => cells(l, BAY)), up = cells(h, FH);
  for (let i = 0; i < uv.count; i++) {
    const f = Math.floor(i / 4);
    if (f === 2 || f === 3) uv.setXY(i, 0.01, 0.01);
    else uv.setXY(i, uv.getX(i) * across[f], uv.getY(i) * up);
  }
  return g;
}

// A pitched roof with its ridge along z, or hipped down to a short ridge (a point when square).
function gable(w, h, d, hip) {
  const g = new THREE.BoxGeometry(w, h, d), p = g.attributes.position, ridge = Math.max(0, d - w) / 2;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) < 0) continue;
    p.setX(i, 0);
    if (hip) p.setZ(i, Math.sign(p.getZ(i)) * ridge);
  }
  g.computeVertexNormals();
  return g;
}

function tube(r, h) {
  const g = new THREE.CylinderGeometry(r, r, h, 28, 1, true), uv = g.attributes.uv, across = cells(2 * Math.PI * r, BAY), up = cells(h, FH);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * across, uv.getY(i) * up);
  return g;
}

// A design may say where its sign hangs: y up its face, and the half-width and half-depth of the faces it hangs on.
function design(build) {
  const kinds = { solid: [], wall: [], facade: [], glass: [], tone: [], accent: [], lamp: [], warm: [] }, sign = {}, deck = {};
  const add = (kind, g, x, y, z, color = "#FFFFFF", rot = 0) => kinds[kind].push(place(g, x, y, z, color, rot));
  build({
    solid: (w, h, d, x, y, z, color = C.white, rot = 0) => add("solid", box(w, h, d), x, y + h / 2, z, color, rot),
    wall: (w, h, d, x, y, z, color, rot = 0) => add(color ? "facade" : "wall", box(w, h, d), x, y + h / 2, z, color, rot),
    glass: (w, h, d, x, y, z, rot = 0) => add("glass", box(w, h, d), x, y + h / 2, z, undefined, rot),
    tone: (w, h, d, x, y, z, rot = 0) => add("tone", box(w, h, d), x, y + h / 2, z, undefined, rot),
    accent: (w, h, d, x, y, z, rot = 0) => add("accent", box(w, h, d), x, y + h / 2, z, undefined, rot),
    roof: (w, h, d, x, y, z, rot = 0, hip = false) => add("accent", gable(w, h, d, hip), x, y + h / 2, z, undefined, rot),
    tube: (r, h, x, y, z) => add("glass", tube(r, h), x, y + h / 2, z),
    disc: (r, h, x, y, z, color) => add("solid", new THREE.CylinderGeometry(r, r, h, 20), x, y + h / 2, z, color),
    drum: (r, h, x, y, z) => add("accent", new THREE.CylinderGeometry(r, r, h, 20), x, y + h / 2, z),
    dome: (r, x, y, z) => add("accent", new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), x, y, z),
    // A striped shop awning along a face, y at its underside.
    awning: (w, x, y, z, rot = 0) => {
      const n = Math.max(3, Math.round(w / 0.07)), s = w / n;
      for (let i = 0; i < n; i++) {
        const o = (i + 0.5) * s - w / 2;
        add(i % 2 ? "solid" : "accent", box(s, 0.025, 0.08), x + o * Math.cos(rot), y + 0.0125, z - o * Math.sin(rot), C.white, rot);
      }
    },
    blade: (len, x, y, z, angle) => {
      const g = new THREE.BoxGeometry(0.08, len, 0.02);
      g.translate(0, len / 2, 0);
      g.rotateZ(angle);
      add("solid", g, x, y, z, C.white);
    },
    // A board nailed on at an angle (boarded windows, leaning planks), in the x-y plane, then turned by rot.
    plank: (len, x, y, z, angle, color, rot = 0) => add("solid", new THREE.BoxGeometry(len, 0.016, 0.008).rotateZ(angle), x, y, z, color, rot),
    // A pitched sheet in a fixed colour: tarps and tents.
    ridge: (w, h, d, x, y, z, color, rot = 0) => add("solid", gable(w, h, d, false), x, y + h / 2, z, color, rot),
    hedge: (w, d, x, z, y = 0.02) => add("solid", box(w, 0.05, d), x, y + 0.025, z, C.hedge),
    pool: (w, d, x, z, y = 0.02) => {
      add("solid", box(w + 0.03, 0.014, d + 0.03), x, y + 0.007, z, C.marble);
      add("solid", box(w, 0.006, d), x, y + 0.016, z, C.pool);
    },
    flowers: (w, x, z, y = 0.02) => {
      add("solid", box(w, 0.02, 0.05), x, y + 0.01, z, "#6B4F35");
      for (let i = 0; i < 4; i++) add("solid", box(0.022, 0.022, 0.022), x - w / 2 + (i + 0.5) * (w / 4), y + 0.03, z, i % 2 ? C.rose : C.tulip);
    },
    tree: (x, y, z, r) => {
      add("solid", new THREE.CylinderGeometry(r * 0.14, r * 0.2, r * 1.2, 6), x, y + r * 0.6, z, C.trunk);
      add("solid", new THREE.IcosahedronGeometry(r, 1), x, y + r * 1.75, z, C.leaf);
    },
    pine: (x, y, z, r) => {
      add("solid", new THREE.CylinderGeometry(r * 0.12, r * 0.16, r * 0.6, 6), x, y + r * 0.3, z, C.trunk);
      add("solid", new THREE.ConeGeometry(r, r * 1.8, 8), x, y + r * 1.3, z, C.pine);
      add("solid", new THREE.ConeGeometry(r * 0.7, r * 1.4, 8), x, y + r * 2, z, C.pine);
    },
    // Lit panes: a dim bulb behind a Docks window, or a warm room uptown. Both go dark with the house.
    lamp: (w, h, d, x, y, z, rot = 0) => add("lamp", box(w, h, d), x, y + h / 2, z, undefined, rot),
    warm: (w, h, d, x, y, z, rot = 0) => add("warm", box(w, h, d), x, y + h / 2, z, undefined, rot),
    sign: (y, x, z) => Object.assign(sign, { y, x, z }),
    // Where the roof is flat enough to build another floor on.
    top: (y) => Object.assign(deck, { y }),
  });
  const mats = materials(), parts = [], identity = new THREE.Matrix4();
  for (const [kind, list] of Object.entries(kinds)) {
    if (list.length) parts.push({ geometry: mergeGeometries(list), material: mats[kind][0], off: mats[kind][1], kind, matrix: identity });
  }
  const bounds = new THREE.Box3();
  for (const p of parts) {
    p.geometry.computeBoundingBox();
    bounds.union(p.geometry.boundingBox);
  }
  const size = bounds.getSize(new THREE.Vector3());
  return { parts, size, footprint: Math.max(size.x, size.z), height: size.y, sign, deck: deck.y ?? size.y };
}

// Each height has four designs, one per trade: lab, shop, studio, exchange.
const DESIGNS = {
  // Homes, one or two floors on a manicured garden: hedges, a pool, flower beds and a little gold.
  h0: (b) => {
    b.solid(0.78, 0.02, 0.68, 0, 0, 0, C.lawn);
    b.solid(0.14, 0.006, 0.16, 0.2, 0.02, 0.26, C.stone);
    b.glass(0.42, FH, 0.36, -0.07, 0.02, 0.02);
    b.solid(0.16, FH, 0.36, 0.22, 0.02, 0.02, C.wood);
    b.wall(0.6, FH, 0.46, 0.02, 0.02 + FH, -0.03);
    b.accent(0.64, 0.03, 0.5, 0.02, 0.02 + 2 * FH, -0.03);
    b.solid(0.645, 0.008, 0.505, 0.02, 0.05 + 2 * FH, -0.03, C.gold);
    b.solid(0.24, 0.015, 0.2, -0.06, 0.058 + 2 * FH, -0.08, C.solar);
    b.pool(0.2, 0.1, -0.22, 0.27);
    b.hedge(0.78, 0.035, 0, -0.322);
    b.hedge(0.035, 0.6, -0.372, -0.02);
    b.flowers(0.18, 0.2, 0.31);
    b.tree(0.33, 0.02, -0.25, 0.06);
    b.top(0.058 + 2 * FH);
    b.sign(0.02 + 1.5 * FH, 0.32, 0.2);
  },
  h1: (b) => {
    b.solid(0.78, 0.02, 0.68, 0, 0, 0, C.stone);
    b.glass(0.6, FH, 0.5, 0, 0.02, 0);
    b.awning(0.6, 0, 0.02 + FH - 0.03, 0.29);
    b.wall(0.62, FH, 0.52, 0, 0.02 + FH, 0);
    b.solid(0.66, 0.035, 0.56, 0, 0.02 + 2 * FH, 0, C.white);
    b.solid(0.67, 0.01, 0.57, 0, 0.055 + 2 * FH, 0, C.gold);
    b.pool(0.26, 0.16, 0.08, -0.06, 0.065 + 2 * FH);
    b.solid(0.12, 0.06, 0.1, -0.2, 0.065 + 2 * FH, -0.14, C.concrete);
    for (const x of [-0.33, 0.33]) {
      b.solid(0.012, 0.16, 0.012, x, 0.02, 0.31, C.dark);
      b.solid(0.035, 0.025, 0.035, x, 0.18, 0.31, C.lamp);
    }
    b.flowers(0.2, -0.18, 0.31);
    b.top(0.065 + 2 * FH);
    b.sign(0.02 + 1.5 * FH, 0.31, 0.26);
  },
  h2: (b) => {
    b.solid(0.78, 0.02, 0.68, 0, 0, 0, C.lawn);
    b.solid(0.1, 0.006, 0.12, 0, 0.02, 0.29, C.stone);
    b.wall(0.46, 2 * FH, 0.46, 0, 0.02, 0.02);
    b.roof(0.52, 0.22, 0.52, 0, 0.02 + 2 * FH, 0.02);
    b.solid(0.012, 0.012, 0.54, 0, 0.24 + 2 * FH, 0.02, C.gold);
    b.accent(0.08, 0.1, 0.012, 0, 0.02, 0.256);
    b.solid(0.06, 0.2, 0.06, 0.14, 0.32, -0.08, C.stone);
    for (const x of [-0.24, 0.24]) b.hedge(0.28, 0.035, x, 0.32);
    b.pool(0.12, 0.22, 0.31, -0.05);
    b.tree(-0.31, 0.02, 0.24, 0.07);
    b.tree(-0.31, 0.02, -0.22, 0.06);
    b.top(0.13 + 2 * FH);
    b.sign(0.02 + 1.5 * FH, 0.23, 0.25);
  },
  h3: (b) => {
    b.solid(0.78, 0.02, 0.68, 0, 0, 0, C.lawn);
    b.solid(0.16, 0.006, 0.12, 0, 0.02, 0.28, C.stone);
    b.wall(0.56, 2 * FH, 0.42, 0, 0.02, -0.04);
    for (const x of [-0.27, 0.27]) b.solid(0.04, 2 * FH, 0.04, x, 0.02, 0.16, C.cream);
    b.solid(0.62, 0.035, 0.48, 0, 0.02 + 2 * FH, -0.04, C.cream);
    b.roof(0.42, 0.14, 0.56, 0, 0.055 + 2 * FH, -0.04, Math.PI / 2, true);
    b.solid(0.24, 0.02, 0.1, 0, 0.02 + FH, 0.22, C.white);
    for (const x of [-0.1, 0.1]) b.solid(0.025, FH, 0.025, x, 0.02, 0.255, C.white);
    b.solid(0.24, 0.008, 0.1, 0, 0.04 + FH, 0.22, C.gold);
    b.accent(0.08, 0.1, 0.012, 0, 0.02, 0.176);
    for (const x of [-0.26, 0.26]) b.solid(0.16, 0.05, 0.06, x, 0.02, 0.28, C.leaf);
    b.disc(0.045, 0.02, 0, 0.026, 0.31, C.stone);
    b.disc(0.03, 0.008, 0, 0.046, 0.31, C.pool);
    b.hedge(0.78, 0.035, 0, -0.322);
    b.top(0.125 + 2 * FH);
    b.sign(0.02 + 1.5 * FH, 0.28, 0.17);
  },
  // Docks shacks, one for each home design: a tin shed, stacked containers, a patched plywood hut, a trailer. Boarded
  // windows, tarps, cinder blocks holding the roofs down, and rubbish everywhere.
  s0: (b) => {
    const h = 1.6 * FH, y = 0.015;
    b.solid(0.78, y, 0.68, 0, 0, 0, D.dirt);
    b.solid(0.22, 0.004, 0.14, -0.22, y, 0.25, D.mud);
    b.solid(0.5, h, 0.4, 0, y, -0.04, D.tin);
    b.solid(0.16, 0.1, 0.01, 0.13, y + 0.06, 0.162, D.rust);
    b.solid(0.1, 0.07, 0.01, -0.12, y + 0.08, 0.162, D.pane);
    for (const a of [0.55, -0.55]) b.plank(0.13, -0.12, y + 0.115, 0.168, a, D.boards);
    b.accent(0.09, 0.15, 0.01, 0.06, y, 0.162);
    b.solid(0.58, 0.02, 0.5, 0, y + h, -0.04, D.rust2);
    b.ridge(0.3, 0.03, 0.34, 0.1, y + h + 0.02, -0.06, D.tarp);
    for (const [x, z] of [[-0.2, 0.12], [0.22, -0.24], [-0.18, -0.24]]) b.solid(0.05, 0.03, 0.035, x, y + h + 0.02, z, D.cinder);
    b.solid(0.03, 0.15, 0.03, -0.05, y + h + 0.02, -0.15, D.black);
    b.disc(0.045, 0.1, -0.29, y, 0.24, D.rust);
    b.disc(0.05, 0.025, 0.28, y, 0.25, D.black);
    b.disc(0.05, 0.025, 0.29, y + 0.025, 0.24, D.black);
    b.plank(0.22, 0.31, y + 0.08, -0.05, 1.25, D.boards, Math.PI / 2);
    b.top(0.035 + 1.6 * FH);
    b.sign(y + 0.8 * FH, 0.25, 0.16);
  },
  s1: (b) => {
    const h = 1.5 * FH, y = 0.015;
    b.solid(0.78, y, 0.68, 0, 0, 0, D.grime);
    b.solid(0.62, h, 0.26, 0, y, -0.12, D.rust);
    for (let i = 0; i < 7; i++) b.solid(0.012, h, 0.272, -0.3 + i * 0.1, y, -0.12, D.rust2);
    b.accent(0.4, 1.3 * FH, 0.24, 0.08, y + h, -0.13);
    b.solid(0.1, 0.07, 0.01, 0.06, y + h + 0.05, -0.006, D.pane);
    b.plank(0.12, 0.06, y + h + 0.085, 0, 0.5, D.boards);
    b.solid(0.1, 0.13, 0.01, -0.15, y, 0.014, D.pane);
    for (const x of [-0.26, -0.2]) b.solid(0.01, h + 0.04, 0.01, x, y, 0.04, D.black);
    for (let i = 1; i < 5; i++) b.solid(0.06, 0.008, 0.01, -0.23, y + i * 0.04, 0.04, D.black);
    for (const x of [-0.32, 0.32]) b.solid(0.012, 0.18, 0.012, x, y, 0.26, D.boards);
    b.solid(0.64, 0.004, 0.004, 0, y + 0.17, 0.26, D.black);
    [[-0.18, "#9CA3AF"], [-0.05, "#9F3A3A"], [0.1, "#3B5B8C"], [0.22, "#A38B3A"]].forEach(([x, c]) => b.solid(0.07, 0.07, 0.006, x, y + 0.1, 0.26, c));
    b.disc(0.045, 0.11, 0.3, y, 0.12, D.rust2);
    b.solid(0.03, 0.03, 0.03, 0.3, y + 0.11, 0.12, D.fire);
    b.solid(0.016, 0.03, 0.016, 0.3, y + 0.13, 0.12, D.flame, 0.8);
    b.top(0.015 + 2.8 * FH);
    b.sign(y + 0.75 * FH, 0.31, 0.01);
  },
  s2: (b) => {
    const h = 1.7 * FH, y = 0.015;
    b.solid(0.78, y, 0.68, 0, 0, 0, D.dirt);
    b.solid(0.2, 0.004, 0.18, 0.24, y, -0.2, D.mud);
    b.solid(0.44, h, 0.4, 0, y, 0, D.ply);
    b.solid(0.18, h, 0.405, -0.13, y, 0, D.boards);
    b.roof(0.5, 0.14, 0.46, 0, y + h, 0);
    b.ridge(0.28, 0.15, 0.3, -0.1, y + h - 0.005, 0.06, D.tarp);
    b.solid(0.11, 0.08, 0.01, 0.11, y + 0.08, 0.203, D.pane);
    for (const a of [0.6, -0.6]) b.plank(0.14, 0.11, y + 0.12, 0.21, a, D.boards);
    b.solid(0.09, 0.15, 0.01, -0.1, y, 0.203, D.grime);
    b.solid(0.012, 0.12, 0.012, 0.2, y + h, 0.14, D.black);
    b.disc(0.05, 0.012, 0.2, y + h + 0.12, 0.14, D.sheet);
    b.solid(0.08, 0.06, 0.07, 0.3, y, 0.26, D.bag);
    b.solid(0.07, 0.05, 0.06, 0.24, y, 0.29, D.bag);
    b.solid(0.06, 0.05, 0.05, 0.33, y, 0.18, D.bag);
    b.solid(0.1, 0.03, 0.1, -0.3, y, 0.24, D.boards, 0.5);
    b.top(0.085 + 1.7 * FH);
    b.sign(y + 0.85 * FH, 0.22, 0.2);
  },
  s3: (b) => {
    const y = 0.055;
    b.solid(0.78, 0.015, 0.68, 0, 0, 0, D.grime);
    b.solid(0.26, 0.004, 0.12, -0.2, 0.015, 0.27, D.mud);
    for (const x of [-0.22, 0.22]) b.solid(0.07, 0.04, 0.07, x, 0.015, -0.02, D.cinder);
    b.solid(0.6, 1.4 * FH, 0.3, 0, y, -0.02, D.sheet);
    b.accent(0.602, 0.025, 0.302, 0, y + 0.6 * FH, -0.02);
    b.solid(0.62, 0.012, 0.32, 0, y + 1.4 * FH, -0.02, D.tin);
    b.solid(0.16, 0.008, 0.2, 0.18, y + 1.4 * FH + 0.012, 0, D.rust);
    b.solid(0.12, 0.05, 0.01, 0.15, y + 0.09, 0.132, D.pane);
    b.plank(0.13, 0.15, y + 0.115, 0.138, 0.35, D.boards);
    b.solid(0.08, 0.12, 0.01, -0.15, y, 0.132, D.grime);
    b.solid(0.1, 0.07, 0.008, 0.26, y, 0.131, D.rust);
    b.solid(0.32, 0.008, 0.16, -0.08, y + 1.25 * FH, 0.21, D.tarp);
    for (const x of [-0.23, 0.07]) b.solid(0.01, 0.2, 0.01, x, 0.015, 0.28, D.black);
    b.solid(0.06, 0.03, 0.06, 0.1, 0.015, 0.27, D.sheet);
    b.solid(0.08, 0.05, 0.05, 0.22, 0.015, 0.27, "#2F4A7A");
    b.disc(0.05, 0.02, -0.3, 0.015, -0.2, D.black);
    b.top(0.067 + 1.4 * FH);
    b.sign(y + 0.7 * FH, 0.3, 0.13);
  },
  // Mid-rises: five floors over the street.
  m0: (b) => {
    b.solid(0.86, 0.02, 0.86, 0, 0, 0, C.stone);
    b.glass(0.8, 5 * FH, 0.8, 0, 0.02, 0);
    for (const s of [-1, 1]) {
      for (const o of [-0.2, 0, 0.2]) {
        b.solid(0.02, 5 * FH, 0.04, o, 0.02, s * 0.41, C.white);
        b.solid(0.04, 5 * FH, 0.02, s * 0.41, 0.02, o, C.white);
      }
    }
    const top = 0.02 + 5 * FH;
    b.accent(0.84, 0.05, 0.84, 0, top, 0);
    b.solid(0.85, 0.012, 0.85, 0, top + 0.05, 0, C.gold);
    b.solid(0.3, 0.1, 0.22, 0.12, top + 0.062, -0.12, C.white);
    b.pool(0.26, 0.16, -0.16, 0.2, top + 0.062);
    b.solid(0.012, 0.25, 0.012, -0.25, top + 0.062, -0.25, C.dark);
    b.top(0.082 + 5 * FH);
    b.sign(0.02 + 4.5 * FH, 0.42, 0.42);
  },
  m1: (b) => {
    b.solid(0.86, 0.02, 0.86, 0, 0, 0, C.stone);
    b.glass(0.7, FH, 0.7, 0, 0.02, 0);
    b.awning(0.7, 0, 0.02 + FH - 0.03, 0.39);
    b.awning(0.7, 0.39, 0.02 + FH - 0.03, 0, Math.PI / 2);
    b.wall(0.76, 4 * FH, 0.76, 0, 0.02 + FH, 0);
    for (let i = 1; i < 4; i++) {
      for (const x of [-0.19, 0.19]) {
        const y = 0.02 + (1 + i) * FH;
        b.solid(0.2, 0.012, 0.05, x, y, 0.4, C.white);
        b.solid(0.2, 0.04, 0.008, x, y + 0.012, 0.425, C.white);
      }
    }
    const top = 0.02 + 5 * FH;
    b.solid(0.8, 0.03, 0.8, 0, top, 0, C.white);
    b.solid(0.56, 0.012, 0.56, -0.04, top + 0.03, -0.04, C.lawn);
    b.pool(0.2, 0.12, 0.08, 0.12, top + 0.042);
    b.tree(-0.2, top + 0.04, -0.18, 0.07);
    b.tree(0.14, top + 0.04, -0.22, 0.06);
    b.solid(0.81, 0.01, 0.81, 0, top - 0.005, 0, C.gold);
    b.top(0.062 + 5 * FH);
    b.sign(0.02 + FH + 0.06, 0.38, 0.38);
  },
  m2: (b) => {
    b.solid(0.86, 0.02, 0.86, 0, 0, 0, C.stone);
    b.glass(0.7, FH, 0.7, 0, 0.02, 0);
    b.accent(0.78, 0.03, 0.78, 0, 0.02 + FH, 0);
    b.wall(0.76, 3 * FH, 0.76, 0, 0.05 + FH, 0, C.white);
    const top = 0.05 + 4 * FH;
    b.solid(0.8, 0.025, 0.8, 0, top, 0, C.white);
    b.glass(0.5, FH, 0.5, -0.1, top + 0.025, -0.1);
    b.accent(0.62, 0.03, 0.62, -0.1, top + 0.025 + FH, -0.1);
    b.tree(0.26, top + 0.025, 0.26, 0.06);
    b.top(0.105 + 5 * FH);
    b.sign(0.05 + 2.5 * FH, 0.38, 0.38);
  },
  m3: (b) => {
    b.solid(0.86, 0.02, 0.86, 0, 0, 0, C.stone);
    b.solid(0.8, 0.05, 0.8, 0, 0.02, 0, C.sand);
    b.wall(0.74, 4 * FH, 0.74, 0, 0.07, 0);
    for (const [x, z] of corners(0.36)) b.solid(0.06, 4 * FH, 0.06, x, 0.07, z, C.cream);
    const top = 0.07 + 4 * FH;
    b.solid(0.82, 0.05, 0.82, 0, top, 0, C.cream);
    b.roof(0.7, 0.2, 0.7, 0, top + 0.05, 0, 0, true);
    b.accent(0.12, 0.14, 0.012, 0, 0.07, 0.376);
    b.solid(0.012, 0.32, 0.012, 0.3, top + 0.05, 0.3, C.dark);
    b.accent(0.1, 0.06, 0.006, 0.35, top + 0.3, 0.3);
    b.top(0.22 + 4 * FH);
    b.sign(0.07 + 3.5 * FH, 0.38, 0.38);
  },
  // Towers: fifteen floors or so.
  t0: (b) => {
    b.solid(0.86, 0.02, 0.86, 0, 0, 0, C.stone);
    b.glass(0.76, FH, 0.76, 0, 0.02, 0);
    b.solid(0.82, 0.03, 0.82, 0, 0.02 + FH, 0, C.white);
    const y0 = 0.05 + FH, top = y0 + 14 * FH;
    b.tube(0.3, 14 * FH, 0, y0, 0);
    for (const k of [5, 10]) b.drum(0.315, 0.025, 0, y0 + k * FH - 0.0125, 0);
    b.disc(0.33, 0.03, 0, top, 0, C.white);
    b.drum(0.2, 0.12, 0, top + 0.03, 0);
    b.disc(0.205, 0.015, 0, top + 0.15, 0, C.gold);
    b.disc(0.02, 0.45, 0, top + 0.165, 0, C.gold);
    b.solid(0.04, 0.04, 0.04, 0, top + 0.6, 0, C.lamp);
    b.top(0.215 + 15 * FH);
    b.sign(top - 0.3, 0.31, 0.31);
  },
  t1: (b) => {
    b.solid(0.86, 0.02, 0.86, 0, 0, 0, C.stone);
    b.glass(0.7, FH, 0.7, 0, 0.02, 0);
    b.awning(0.7, 0, 0.02 + FH - 0.03, 0.39);
    b.wall(0.78, FH, 0.78, 0, 0.02 + FH, 0);
    b.solid(0.82, 0.03, 0.82, 0, 0.02 + 2 * FH, 0, C.white);
    b.solid(0.26, 0.012, 0.76, 0.26, 0.05 + 2 * FH, 0, C.lawn);
    for (const z of [-0.22, 0.22]) b.tree(0.27, 0.06 + 2 * FH, z, 0.06);
    const y0 = 0.05 + 2 * FH, top = y0 + 12 * FH;
    b.wall(0.46, 12 * FH, 0.56, -0.12, y0, 0);
    for (let i = 1; i < 12; i += 2) b.solid(0.3, 0.012, 0.05, -0.12, y0 + i * FH, 0.3, C.white);
    b.accent(0.5, 0.05, 0.6, -0.12, top, 0);
    b.disc(0.17, 0.012, -0.12, top + 0.05, 0, C.dark);
    b.solid(0.025, 0.004, 0.14, -0.17, top + 0.062, 0, C.white);
    b.solid(0.025, 0.004, 0.14, -0.07, top + 0.062, 0, C.white);
    b.solid(0.1, 0.004, 0.025, -0.12, top + 0.062, 0, C.white);
    b.pool(0.16, 0.3, 0.27, 0, 0.05 + 2 * FH + 0.012);
    b.top(0.1 + 14 * FH);
    b.sign(0.02 + 1.5 * FH, 0.39, 0.39);
  },
  t2: (b) => {
    b.solid(0.86, 0.02, 0.86, 0, 0, 0, C.stone);
    b.glass(0.6, FH, 0.6, 0, 0.02, 0);
    let y = 0.02 + FH;
    for (let i = 0; i < 6; i++) {
      const [w, d] = i % 2 ? [0.44, 0.72] : [0.72, 0.44];
      if (i % 3 === 1) b.wall(w, 2 * FH, d, 0, y, 0, C.white);
      else b.wall(w, 2 * FH, d, 0, y, 0);
      y += 2 * FH;
      b.solid(w + 0.02, 0.025, d + 0.02, 0, y, 0, C.white);
      y += 0.025;
    }
    b.accent(0.3, 0.06, 0.3, 0, y, 0);
    b.solid(0.31, 0.012, 0.31, 0, y + 0.06, 0, C.gold);
    b.disc(0.012, 0.3, 0.1, y + 0.072, 0.1, C.gold);
    b.top(0.242 + 13 * FH);
    b.sign(0.02 + 2 * FH, 0.36, 0.22);
  },
  t3: (b) => {
    b.solid(0.86, 0.02, 0.86, 0, 0, 0, C.stone);
    b.solid(0.8, 0.05, 0.8, 0, 0.02, 0, C.sand);
    let y = 0.07;
    for (const [w, n] of [[0.74, 7], [0.58, 5], [0.42, 4]]) {
      b.wall(w, n * FH, w, 0, y, 0);
      for (const [x, z] of corners(w / 2)) b.solid(0.05, n * FH, 0.05, x, y, z, C.cream);
      y += n * FH;
      b.solid(w + 0.05, 0.035, w + 0.05, 0, y, 0, C.cream);
      y += 0.035;
    }
    b.accent(0.24, 0.16, 0.24, 0, y, 0);
    b.roof(0.24, 0.16, 0.24, 0, y + 0.16, 0, 0, true);
    b.solid(0.25, 0.012, 0.25, 0, y + 0.155, 0, C.gold);
    b.disc(0.012, 0.3, 0, y + 0.3, 0, C.gold);
    b.top(0.415 + 16 * FH);
    b.sign(0.07 + 6 * FH, 0.37, 0.37);
  },
  // Floors that stack on a building once the ground is full. On the Docks: containers, plywood, tin and trailers,
  // propped up crooked with a ladder up the side and one dim bulb each. Uptown: glass and steel with warm rooms.
  fd0: (b) => {
    b.solid(0.56, 0.02, 0.42, 0, 0, 0, D.boards);
    b.solid(0.54, 0.16, 0.36, 0, 0.02, -0.02, D.rust);
    for (let i = 0; i < 6; i++) b.solid(0.012, 0.16, 0.37, -0.22 + i * 0.088, 0.02, -0.02, D.rust2);
    b.lamp(0.1, 0.06, 0.012, 0.12, 0.08, 0.163);
    b.plank(0.13, 0.12, 0.11, 0.172, 0.5, D.boards);
    b.solid(0.2, 0.008, 0.2, -0.12, 0.18, 0, D.tarp);
    ladder(b, 0.285, 0.08);
    b.top(0.18);
    b.sign(0.1, 0.27, 0.16);
  },
  fd1: (b) => {
    b.solid(0.5, 0.02, 0.44, 0, 0, 0, D.cinder);
    b.solid(0.46, 0.16, 0.38, 0.02, 0.02, 0, D.ply);
    b.solid(0.16, 0.16, 0.385, -0.12, 0.02, 0, D.boards);
    b.lamp(0.09, 0.06, 0.012, 0.1, 0.08, 0.193);
    for (const a of [0.6, -0.6]) b.plank(0.12, 0.1, 0.11, 0.2, a, D.boards);
    b.ridge(0.3, 0.04, 0.34, 0.06, 0.18, 0, D.tarp);
    ladder(b, -0.265, 0.1);
    b.top(0.18);
    b.sign(0.1, 0.25, 0.19);
  },
  fd2: (b) => {
    b.solid(0.54, 0.02, 0.4, 0, 0, 0, D.boards);
    b.solid(0.5, 0.16, 0.34, 0, 0.02, 0, D.tin);
    for (let i = 0; i < 7; i++) b.solid(0.008, 0.16, 0.345, -0.21 + i * 0.07, 0.02, 0, D.sheet);
    b.lamp(0.08, 0.05, 0.012, -0.12, 0.09, 0.173);
    b.solid(0.1, 0.13, 0.01, 0.12, 0.02, 0.173, D.rust);
    b.solid(0.56, 0.012, 0.38, 0, 0.18, 0, D.rust2);
    for (const [x, z] of [[-0.2, 0.12], [0.18, -0.12]]) b.solid(0.05, 0.03, 0.035, x, 0.192, z, D.cinder);
    ladder(b, 0.265, -0.06);
    b.top(0.19);
    b.sign(0.1, 0.25, 0.17);
  },
  fd3: (b) => {
    b.solid(0.6, 0.02, 0.36, 0, 0, 0, D.grime);
    b.solid(0.56, 0.15, 0.3, 0, 0.02, 0, D.sheet);
    b.accent(0.562, 0.02, 0.302, 0, 0.09, 0);
    b.lamp(0.12, 0.05, 0.012, -0.1, 0.1, 0.153);
    b.solid(0.07, 0.11, 0.01, 0.16, 0.02, 0.153, D.grime);
    b.solid(0.58, 0.012, 0.32, 0, 0.17, 0, D.tin);
    b.solid(0.3, 0.004, 0.004, 0, 0.12, 0.2, D.black);
    [["#9CA3AF", -0.1], ["#9F3A3A", 0], ["#3B5B8C", 0.1]].forEach(([c, x]) => b.solid(0.06, 0.05, 0.004, x, 0.07, 0.2, c));
    ladder(b, -0.295, 0.04);
    b.top(0.18);
    b.sign(0.1, 0.28, 0.15);
  },
  fdcap: (b) => {
    b.ridge(0.36, 0.08, 0.3, 0, 0, 0, D.tarp);
    b.solid(0.012, 0.24, 0.012, 0.18, 0, -0.1, D.black);
    b.solid(0.1, 0.006, 0.006, 0.18, 0.22, -0.1, D.black);
    for (const [x, z] of [[-0.18, 0.1], [0.12, 0.12]]) b.solid(0.05, 0.03, 0.035, x, 0, z, D.cinder);
    b.disc(0.04, 0.08, -0.2, 0, -0.1, D.rust);
  },
  fu0: (b) => {
    b.solid(0.7, 0.02, 0.7, 0, 0, 0, C.white);
    b.glass(0.64, 0.16, 0.64, 0, 0.02, 0);
    for (const [x, z] of corners(0.32)) b.solid(0.03, 0.16, 0.03, x, 0.02, z, C.dark);
    for (const x of [-0.16, 0.16]) b.warm(0.18, 0.08, 0.008, x, 0.06, 0.324);
    for (const z of [-0.16, 0.16]) b.warm(0.18, 0.08, 0.008, 0.324, 0.06, z, Math.PI / 2);
    b.accent(0.68, 0.015, 0.68, 0, 0.165, 0);
    b.top(0.18);
    b.sign(0.1, 0.33, 0.33);
  },
  fu1: (b) => {
    b.solid(0.7, 0.02, 0.7, 0, 0, 0, C.white);
    b.wall(0.62, 0.16, 0.62, 0, 0.02, 0);
    for (const x of [-0.15, 0.15]) b.warm(0.14, 0.07, 0.008, x, 0.07, 0.313);
    for (const z of [-0.15, 0.15]) b.warm(0.14, 0.07, 0.008, 0.313, 0.07, z, Math.PI / 2);
    b.solid(0.32, 0.012, 0.07, 0, 0.02, 0.345, C.white);
    b.solid(0.32, 0.04, 0.006, 0, 0.032, 0.378, C.stone);
    b.solid(0.66, 0.015, 0.66, 0, 0.165, 0, C.gold);
    b.top(0.18);
    b.sign(0.12, 0.32, 0.32);
  },
  fucap: (b) => {
    b.solid(0.66, 0.025, 0.66, 0, 0, 0, C.white);
    b.solid(0.56, 0.012, 0.56, 0, 0.025, 0, C.lawn);
    b.tree(-0.18, 0.037, -0.16, 0.06);
    b.tree(0.18, 0.037, 0.14, 0.05);
    b.flowers(0.2, -0.08, 0.22, 0.037);
    b.pool(0.16, 0.1, 0.13, -0.15, 0.037);
    for (const s of [-1, 1]) {
      b.solid(0.66, 0.03, 0.008, 0, 0.025, s * 0.326, C.white);
      b.solid(0.008, 0.03, 0.66, s * 0.326, 0.025, 0, C.white);
    }
  },
  // Civic buildings, at the homes' scale so every window in the city is the same size.
  hospital: (b) => {
    b.solid(2.7, 0.03, 1.5, 0, 0, 0, C.stone);
    b.glass(2.4, FH, 1.2, 0, 0.03, 0);
    b.wall(2.5, 5 * FH, 1.3, 0, 0.03 + FH, 0, C.white);
    const top = 0.03 + 6 * FH, roof = top + 0.045;
    b.accent(2.54, 0.035, 1.34, 0, top, 0);
    b.solid(2.46, 0.01, 1.26, 0, top + 0.035, 0, C.white);
    b.accent(0.9, 0.03, 0.26, 0, 0.03 + FH - 0.03, 0.73);
    for (const x of [-0.4, 0.4]) b.solid(0.03, FH - 0.03, 0.03, x, 0.03, 0.83, C.white);
    b.accent(0.4, 0.012, 0.12, -0.7, roof, -0.1);
    b.accent(0.12, 0.012, 0.4, -0.7, roof, -0.1);
    b.disc(0.34, 0.02, 0.6, roof, -0.1, C.dark);
    for (const x of [0.54, 0.66]) b.solid(0.025, 0.006, 0.16, x, roof + 0.02, -0.1, C.white);
    b.solid(0.1, 0.006, 0.025, 0.6, roof + 0.02, -0.1, C.white);
    b.sign(0.03 + 4.5 * FH, 1.25, 0.65);
  },
  market: (b) => {
    b.solid(2.8, 0.03, 1.4, 0, 0, 0, C.stone);
    b.glass(2.6, FH, 1.2, 0, 0.03, 0);
    b.awning(2.6, 0, 0.03 + FH - 0.03, 0.64);
    b.wall(2.64, FH, 1.24, 0, 0.03 + FH, 0, C.cream);
    for (const x of [-0.88, 0, 0.88]) b.roof(0.88, 0.26, 1.28, x, 0.03 + 2 * FH, 0);
    b.sign(0.03 + 1.5 * FH, 1.32, 0.62);
  },
  stall: (b) => {
    b.solid(0.34, 0.1, 0.2, 0, 0, 0, C.wood);
    for (const [x, z] of corners(0.15)) b.solid(0.02, 0.22, 0.02, x, 0, z, C.dark);
    b.roof(0.36, 0.08, 0.44, 0, 0.22, 0, Math.PI / 2);
  },
  school: (b) => {
    b.solid(2.7, 0.03, 1.2, 0, 0, 0, C.stone);
    b.wall(2.5, 3 * FH, 1.0, 0, 0.03, 0, C.cream);
    const top = 0.03 + 3 * FH;
    b.accent(2.56, 0.04, 1.06, 0, top, 0);
    b.accent(0.5, 0.025, 0.2, 0, 0.03 + FH - 0.025, 0.6);
    b.solid(0.36, 0.34, 0.36, 0, top + 0.04, 0.1, C.cream);
    b.solid(0.2, 0.2, 0.012, 0, top + 0.1, 0.286, C.white);
    b.solid(0.016, 0.08, 0.014, 0, top + 0.2, 0.29, C.dark);
    b.solid(0.06, 0.016, 0.014, 0.03, top + 0.192, 0.29, C.dark);
    b.roof(0.42, 0.22, 0.42, 0, top + 0.38, 0.1, 0, true);
    b.sign(0.03 + 2 * FH, 1.25, 0.5);
  },
  bank: (b) => {
    b.solid(2.4, 0.05, 1.5, 0, 0, 0, C.stone);
    b.solid(2.2, 0.05, 1.3, 0, 0.05, 0, C.stone);
    b.wall(1.9, 3 * FH, 0.9, 0, 0.1, -0.15, C.cream);
    for (let i = 0; i < 6; i++) b.solid(0.09, 3 * FH, 0.09, -0.85 + i * 0.34, 0.1, 0.5, C.white);
    const top = 0.1 + 3 * FH;
    b.solid(2.1, 0.08, 1.2, 0, top, 0, C.white);
    b.roof(2.0, 0.26, 1.1, 0, top + 0.08, 0);
    b.sign(top + 0.04, 1.05, 0.6);
  },
  police: (b) => {
    b.solid(2.5, 0.03, 1.3, 0, 0, 0, C.stone);
    b.glass(2.2, FH, 1.0, 0, 0.03, 0);
    b.wall(2.3, 2 * FH, 1.1, 0, 0.03 + FH, 0, C.white);
    const top = 0.03 + 3 * FH;
    b.accent(2.36, 0.06, 1.16, 0, top, 0);
    b.solid(0.4, 0.04, 0.12, 0, top + 0.06, 0.2, C.dark);
    b.solid(0.14, 0.05, 0.1, -0.1, top + 0.1, 0.2, "#EF4444");
    b.solid(0.14, 0.05, 0.1, 0.1, top + 0.1, 0.2, "#60A5FA");
    b.solid(0.02, 0.5, 0.02, 0.9, top + 0.06, -0.3, C.dark);
    b.sign(0.03 + 2 * FH, 1.15, 0.55);
  },
  fire: (b) => {
    b.solid(2.5, 0.03, 1.4, 0, 0, 0, C.stone);
    b.accent(2.3, 0.3, 1.2, 0, 0.03, 0);
    for (const x of [-0.7, 0, 0.7]) b.solid(0.5, 0.26, 0.012, x, 0.03, 0.606, C.white);
    b.wall(2.3, 2 * FH, 1.2, 0, 0.33, 0, C.white);
    b.accent(2.34, 0.04, 1.24, 0, 0.33 + 2 * FH, 0);
    b.wall(0.36, 8 * FH, 0.36, 0.85, 0.03, -0.3, C.white);
    b.roof(0.42, 0.18, 0.42, 0.85, 0.03 + 8 * FH, -0.3, 0, true);
    b.sign(0.33 + FH, 1.15, 0.6);
  },
  watertower: (b) => {
    for (const [x, z] of corners(0.32)) b.solid(0.05, 0.9, 0.05, x, 0, z, C.concrete);
    b.solid(0.7, 0.03, 0.7, 0, 0.45, 0, C.concrete);
    b.drum(0.48, 0.42, 0, 0.9, 0);
    b.disc(0.5, 0.04, 0, 1.32, 0, C.white);
    b.disc(0.2, 0.08, 0, 1.36, 0, C.white);
    b.sign(1.11, 0.48, 0.48);
  },
  turbine: (b) => {
    b.disc(0.24, 0.04, 0, 0, 0, C.concrete);
    b.disc(0.06, 1.4, 0, 0.04, 0, C.white);
    b.accent(0.14, 0.13, 0.3, 0, 1.38, -0.02);
    for (let i = 0; i < 3; i++) b.blade(0.62, 0, 1.445, 0.14, (i * 2 * Math.PI) / 3 + 0.3);
  },
  solar: (b) => {
    for (const z of [-0.36, 0, 0.36]) {
      for (const x of [-0.5, 0.5]) b.solid(0.03, 0.1, 0.03, x, 0, z, C.concrete);
      b.solid(1.2, 0.025, 0.28, 0, 0.1, z, C.solar);
    }
  },
  fountain: (b) => {
    b.disc(0.42, 0.08, 0, 0, 0, C.stone);
    b.disc(0.37, 0.02, 0, 0.07, 0, C.water);
    b.disc(0.05, 0.26, 0, 0.08, 0, C.stone);
    b.disc(0.16, 0.03, 0, 0.3, 0, C.stone);
    b.disc(0.12, 0.012, 0, 0.33, 0, C.water);
  },
  // Downtown towers, one per job, with their sign up high.
  timeline: (b) => {
    b.solid(2.0, 0.04, 2.0, 0, 0, 0, C.stone);
    b.glass(1.8, 2 * FH, 1.8, 0, 0.04, 0);
    b.solid(1.9, 0.04, 1.9, 0, 0.04 + 2 * FH, 0, C.white);
    const y0 = 0.08 + 2 * FH, shaft = y0 + 26 * FH;
    b.glass(1.4, 26 * FH, 1.4, 0, y0, 0);
    for (const [x, z] of corners(0.7)) b.accent(0.1, 26 * FH, 0.1, x, y0, z);
    b.solid(1.5, 0.05, 1.5, 0, shaft, 0, C.white);
    b.glass(1.0, 5 * FH, 1.0, 0, shaft + 0.05, 0);
    const top = shaft + 0.05 + 5 * FH;
    b.accent(1.08, 0.16, 1.08, 0, top, 0);
    b.solid(0.03, 0.6, 0.03, 0, top + 0.16, 0, C.dark);
    b.sign(shaft - 0.3, 0.75, 0.75);
  },
  ledger: (b) => {
    b.solid(2.0, 0.04, 2.0, 0, 0, 0, C.stone);
    let y = 0.04;
    const tops = [];
    for (const [w, n] of [[1.7, 10], [1.36, 9], [1.0, 6]]) {
      b.wall(w, n * FH, w, 0, y, 0, C.cream);
      for (const [x, z] of corners(w / 2)) b.solid(0.08, n * FH, 0.08, x, y, z, C.white);
      y += n * FH;
      tops.push(y);
      b.solid(w + 0.1, 0.05, w + 0.1, 0, y, 0, C.white);
      y += 0.05;
    }
    b.accent(0.56, 0.3, 0.56, 0, y, 0);
    b.roof(0.56, 0.3, 0.56, 0, y + 0.3, 0, 0, true);
    b.solid(0.03, 0.4, 0.03, 0, y + 0.6, 0, C.dark);
    b.sign(tops[1] - 0.3, 0.74, 0.74);
  },
  post: (b) => {
    b.solid(2.0, 0.04, 2.0, 0, 0, 0, C.stone);
    b.glass(1.8, FH, 1.8, 0, 0.04, 0);
    b.wall(1.9, 2 * FH, 1.9, 0, 0.04 + FH, 0);
    b.solid(1.96, 0.04, 1.96, 0, 0.04 + 3 * FH, 0, C.white);
    const y0 = 0.08 + 3 * FH, top = y0 + 20 * FH;
    b.wall(1.2, 20 * FH, 1.2, 0, y0, 0, C.white);
    for (const s of [-1, 1]) for (const x of [-0.3, 0.3]) b.accent(0.06, 20 * FH, 0.04, x, y0, s * 0.62);
    b.accent(1.28, 0.14, 1.28, 0, top, 0);
    b.solid(0.04, 0.8, 0.04, 0.3, top + 0.14, 0.3, C.dark);
    b.sign(top - 0.3, 0.64, 0.64);
  },
  // District landmarks, one lot each, in the district's colour.
  lab: (b) => {
    b.solid(0.9, 0.03, 0.9, 0, 0, 0, C.stone);
    b.glass(0.76, 2 * FH, 0.76, 0, 0.03, 0);
    b.solid(0.84, 0.03, 0.84, 0, 0.03 + 2 * FH, 0, C.white);
    b.dome(0.34, 0, 0.06 + 2 * FH, 0);
    b.solid(0.02, 0.24, 0.02, 0, 0.38 + 2 * FH, 0, C.dark);
  },
  exchange: (b) => {
    b.solid(0.94, 0.04, 0.8, 0, 0, 0, C.stone);
    b.wall(0.76, 3 * FH, 0.5, 0, 0.04, -0.1, C.cream);
    for (let i = 0; i < 5; i++) b.solid(0.06, 3 * FH, 0.06, -0.36 + i * 0.18, 0.04, 0.3, C.white);
    b.solid(0.9, 0.06, 0.74, 0, 0.04 + 3 * FH, 0, C.white);
    b.roof(0.86, 0.2, 0.7, 0, 0.1 + 3 * FH, 0);
  },
  station: (b) => {
    b.solid(0.96, 0.03, 0.7, 0, 0, 0, C.stone);
    b.wall(0.9, 2 * FH, 0.6, 0, 0.03, 0, C.cream);
    b.glass(0.5, 2 * FH, 0.012, -0.12, 0.03, 0.306);
    b.roof(0.6, 0.16, 0.92, 0, 0.03 + 2 * FH, 0, Math.PI / 2);
    b.wall(0.2, 5 * FH, 0.2, 0.34, 0.03, -0.18, C.cream);
    b.solid(0.13, 0.13, 0.012, 0.34, 0.03 + 4 * FH, -0.074, C.white);
    b.roof(0.26, 0.16, 0.26, 0.34, 0.03 + 5 * FH, -0.18, 0, true);
  },
  mast: (b) => {
    b.solid(0.5, 0.04, 0.5, 0, 0, 0, C.concrete);
    for (let i = 0; i < 4; i++) {
      const w = 0.3 - i * 0.06, y = 0.04 + i * 0.3;
      if (i % 2) b.solid(w, 0.3, w, 0, y, 0, C.white);
      else b.accent(w, 0.3, w, 0, y, 0);
    }
    b.disc(0.2, 0.04, 0, 0.64, 0, C.white);
    b.solid(0.02, 0.3, 0.02, 0, 1.24, 0, C.dark);
  },
  college: (b) => {
    b.solid(0.96, 0.03, 0.7, 0, 0, 0, C.stone);
    b.wall(0.9, 3 * FH, 0.6, 0, 0.03, 0, C.cream);
    const top = 0.03 + 3 * FH;
    b.solid(0.94, 0.03, 0.64, 0, top, 0, C.white);
    b.disc(0.18, 0.08, 0, top + 0.03, 0, C.white);
    b.dome(0.17, 0, top + 0.11, 0);
  },
  stadium: (b) => {
    b.solid(0.96, 0.02, 0.96, 0, 0, 0, C.concrete);
    b.solid(0.62, 0.012, 0.62, 0, 0.02, 0, C.lawn);
    for (const s of [-1, 1]) {
      b.accent(0.96, 0.16, 0.15, 0, 0.02, s * 0.405);
      b.tone(0.15, 0.12, 0.66, s * 0.405, 0.02, 0);
    }
    for (const [x, z] of corners(0.44)) {
      b.solid(0.02, 0.5, 0.02, x, 0.02, z, C.dark);
      b.solid(0.08, 0.05, 0.08, x, 0.52, z, C.white);
    }
  },
  lighthouse: (b) => {
    b.disc(0.32, 0.05, 0, 0, 0, C.concrete);
    for (let i = 0; i < 4; i++) {
      const r = 0.17 - i * 0.015, y = 0.05 + i * 0.22;
      if (i % 2) b.disc(r, 0.22, 0, y, 0, C.white);
      else b.drum(r, 0.22, 0, y, 0);
    }
    b.disc(0.15, 0.03, 0, 0.93, 0, C.dark);
    b.disc(0.09, 0.12, 0, 0.96, 0, C.lamp);
    b.drum(0.12, 0.05, 0, 1.08, 0);
  },
  // The Docks: a gantry crane over the water and stacked shipping containers.
  crane: (b) => {
    for (const [x, z] of corners(0.3)) b.accent(0.05, 1.3, 0.05, x, 0, z);
    b.accent(0.08, 0.08, 1.9, -0.3, 1.3, -0.4);
    b.accent(0.08, 0.08, 1.9, 0.3, 1.3, -0.4);
    b.solid(0.68, 0.05, 0.08, 0, 1.3, 0.3, C.dark);
    b.solid(0.22, 0.16, 0.2, 0, 1.38, 0.15, C.white);
    b.solid(0.01, 0.6, 0.01, 0, 0.78, -0.9, C.dark);
    b.solid(0.24, 0.1, 0.12, 0, 0.68, -0.9, "#F97316");
  },
  junk: (b) => {
    b.disc(0.05, 0.11, -0.08, 0, -0.05, D.rust);
    b.disc(0.05, 0.11, 0.03, 0, -0.08, "#4B6075");
    b.disc(0.05, 0.025, 0.08, 0, 0.07, D.black);
    b.disc(0.05, 0.025, 0.09, 0.025, 0.06, D.black);
    b.solid(0.07, 0.06, 0.07, -0.08, 0, 0.08, D.bag);
  },
  bags: (b) => {
    [[0, 0, 0.08], [0.07, 0.03, 0.06], [-0.05, 0.06, 0.07], [0.02, -0.07, 0.06]].forEach(([x, z, s]) => b.solid(s, s * 0.8, s, x, 0, z, D.bag));
  },
  pallets: (b) => {
    for (let i = 0; i < 3; i++) {
      for (const z of [-0.07, 0, 0.07]) b.solid(0.2, 0.012, 0.035, 0, i * 0.03, z, D.boards);
      b.solid(0.2, 0.018, 0.17, 0, i * 0.03 + 0.012, 0, D.ply);
    }
  },
  wreck: (b) => {
    for (const [x, z] of corners(0.1)) b.solid(0.05, 0.04, 0.04, x * 1.6, 0, z, D.cinder);
    b.solid(0.42, 0.07, 0.2, 0, 0.04, 0, D.rust);
    b.solid(0.22, 0.06, 0.18, -0.03, 0.11, 0, D.rust2);
    b.solid(0.012, 0.045, 0.16, 0.085, 0.115, 0, D.pane);
    b.disc(0.045, 0.03, 0.15, 0, 0.13, D.black);
  },
  dumpster: (b) => {
    b.solid(0.34, 0.16, 0.2, 0, 0, 0, "#2F5D3A");
    b.solid(0.36, 0.015, 0.22, 0, 0.16, -0.01, "#244A2E");
    b.solid(0.1, 0.04, 0.06, 0.06, 0.175, 0.03, D.bag);
    b.solid(0.08, 0.05, 0.08, 0.22, 0, 0.06, D.bag);
  },
  // A rusty trawler, waterline at y = 0, bow at +z.
  trawler: (b) => {
    b.solid(0.34, 0.08, 1.1, 0, -0.04, 0, D.hull);
    b.solid(0.24, 0.06, 0.3, 0, -0.03, 0.62, D.hull);
    b.solid(0.36, 0.025, 1.12, 0, 0.04, 0, D.rust);
    b.solid(0.22, 0.16, 0.28, 0, 0.065, -0.22, D.sheet);
    b.solid(0.2, 0.04, 0.012, 0, 0.16, -0.075, D.pane);
    b.solid(0.24, 0.015, 0.3, 0, 0.225, -0.22, D.rust2);
    b.solid(0.02, 0.5, 0.02, 0, 0.065, 0.2, D.black);
    b.solid(0.36, 0.012, 0.012, 0, 0.45, 0.2, D.black);
    b.solid(0.18, 0.05, 0.16, 0.02, 0.065, 0.32, D.tarp);
  },
  pier: (b) => {
    b.solid(0.5, 0.03, 2.2, 0, 0, 0, D.boards);
    for (let i = 0; i < 11; i++) b.solid(0.52, 0.006, 0.02, 0, 0.03, -1.0 + i * 0.2, D.grime);
    for (const z of [-0.9, -0.3, 0.3, 0.9]) for (const x of [-0.23, 0.23]) b.solid(0.04, 0.7, 0.04, x, -0.66, z, D.grime);
    for (const z of [-0.6, 0.6]) b.disc(0.02, 0.05, 0.2, 0.03, z, D.black);
  },
  // Street furniture uptown.
  lamp: (b) => {
    b.disc(0.03, 0.02, 0, 0, 0, C.dark);
    b.disc(0.008, 0.3, 0, 0.02, 0, C.dark);
    b.solid(0.07, 0.008, 0.012, 0.03, 0.3, 0, C.dark);
    b.solid(0.035, 0.03, 0.035, 0.06, 0.27, 0, C.lamp);
    b.solid(0.045, 0.008, 0.045, 0.06, 0.3, 0, C.gold);
  },
  palm: (b) => {
    for (let i = 0; i < 5; i++) b.disc(0.022 - i * 0.002, 0.08, i * 0.008, i * 0.08, 0, C.trunk);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.solid(0.2, 0.012, 0.05, Math.cos(a) * 0.1 + 0.04, 0.4 - 0.02, -Math.sin(a) * 0.1, C.leaf, a);
    }
    b.solid(0.04, 0.04, 0.04, 0.04, 0.39, 0, "#6B4F35");
  },
  flowerbed: (b) => {
    b.solid(0.26, 0.04, 0.12, 0, 0, 0, C.marble);
    b.solid(0.24, 0.012, 0.1, 0, 0.04, 0, "#6B4F35");
    for (let i = 0; i < 6; i++) b.solid(0.026, 0.03, 0.026, -0.1 + i * 0.04, 0.052, (i % 2 ? 0.02 : -0.02), i % 3 ? C.rose : C.tulip);
  },
  statue: (b) => {
    b.solid(0.12, 0.08, 0.12, 0, 0, 0, C.marble);
    b.solid(0.05, 0.12, 0.04, 0, 0.08, 0, C.gold);
    b.disc(0.025, 0.04, 0, 0.2, 0, C.gold);
  },
  // More of the Docks: an oil drum burning, stacked tyres, a tarp tent, washing lines and a broken fence.
  barrel: (b) => {
    b.disc(0.05, 0.12, 0, 0, 0, D.rust2);
    b.disc(0.052, 0.012, 0, 0.04, 0, D.rust);
    b.solid(0.04, 0.03, 0.04, 0, 0.12, 0, D.fire, 0.4);
    b.solid(0.022, 0.04, 0.022, 0.005, 0.14, 0, D.flame, 1.1);
  },
  tires: (b) => {
    for (let i = 0; i < 3; i++) b.disc(0.06, 0.03, 0.01 * i, i * 0.03, 0, D.black);
    b.disc(0.045, 0.002, 0.02, 0.092, 0, D.grime);
    b.disc(0.06, 0.03, 0.12, 0, 0.06, D.black);
  },
  tent: (b) => {
    b.solid(0.36, 0.006, 0.3, 0, 0, 0, D.mud);
    b.ridge(0.28, 0.16, 0.32, 0, 0.006, 0, D.tarp);
    b.solid(0.08, 0.05, 0.06, 0.16, 0.006, 0.14, D.bag);
  },
  laundry: (b) => {
    for (const x of [-0.18, 0.18]) b.solid(0.012, 0.22, 0.012, x, 0, 0, D.boards);
    b.solid(0.36, 0.004, 0.004, 0, 0.21, 0, D.black);
    [[-0.11, "#9F3A3A"], [-0.03, "#C9C3B4"], [0.06, "#3B5B8C"], [0.13, "#8A7A3A"]].forEach(([x, c]) => b.solid(0.06, 0.07, 0.004, x, 0.14, 0, c));
  },
  fence: (b) => {
    for (const x of [-0.42, -0.14, 0.14, 0.42]) b.solid(0.016, 0.2, 0.016, x, 0, 0, D.grime);
    b.solid(0.86, 0.01, 0.01, 0, 0.18, 0, D.tin);
    b.solid(0.56, 0.01, 0.01, -0.15, 0.08, 0, D.tin);
    for (let i = 0; i < 9; i++) if (i !== 5 && i !== 6) b.solid(0.006, 0.16, 0.006, -0.4 + i * 0.1, 0.02, 0, D.cinder);
    b.plank(0.2, 0.3, 0.05, 0.02, 0.4, D.boards);
  },
  // Street furniture uptown.
  bench: (b) => {
    for (const x of [-0.1, 0.1]) b.solid(0.02, 0.05, 0.08, x, 0, 0, C.dark);
    b.solid(0.26, 0.015, 0.08, 0, 0.05, 0, C.wood);
    b.solid(0.26, 0.05, 0.012, 0, 0.065, -0.035, C.wood);
  },
  hydrant: (b) => {
    b.disc(0.025, 0.08, 0, 0, 0, "#DC2626");
    b.disc(0.03, 0.015, 0, 0.08, 0, "#DC2626");
    b.solid(0.07, 0.015, 0.015, 0, 0.05, 0, "#B91C1C");
  },
  planter: (b) => {
    b.solid(0.22, 0.05, 0.1, 0, 0, 0, C.concrete);
    for (const x of [-0.06, 0.06]) b.solid(0.08, 0.06, 0.07, x, 0.05, 0, C.leaf);
    b.solid(0.04, 0.03, 0.04, 0, 0.1, 0, "#F472B6");
  },
  containers: (b) => {
    const colors = ["#7C4A30", "#41566A", "#77693A", "#55654A", "#6B5168", "#86857C"];
    [[-0.2, 0, -0.2], [0.2, 0, -0.2], [-0.2, 0, 0.2], [0.2, 0, 0.2], [-0.2, 1, -0.2], [0.2, 1, 0.2]].forEach(([x, up, z], i) =>
      b.solid(0.36, 0.17, 0.34, x, up * 0.17, z, colors[i]));
  },
  // Millionaires' Row: grand estates for #1 and #2, villas for #3 to #10. The trim (gold for #1) is the tint.
  estate: (b) => {
    b.solid(2.0, 0.03, 1.8, 0, 0, 0, C.lawn);
    for (const s of [-1, 1]) { b.hedge(2.0, 0.07, 0, s * 0.86, 0.03); b.hedge(0.07, 1.8, s * 0.96, 0, 0.03); }
    b.solid(0.3, 0.012, 0.9, 0, 0.03, 0.42, C.marble);
    b.wall(1.2, 2 * FH, 0.62, 0, 0.03, -0.38, C.cream);
    for (const s of [-1, 1]) {
      b.wall(0.36, 2 * FH, 0.5, s * 0.74, 0.03, -0.34, C.cream);
      b.roof(0.4, 0.14, 0.54, s * 0.74, 0.03 + 2 * FH, -0.34, 0, true);
      b.tree(s * 0.78, 0.03, 0.55, 0.1);
    }
    for (let i = 0; i < 6; i++) b.solid(0.04, 2 * FH, 0.04, -0.3 + i * 0.12, 0.03, -0.04, C.white);
    b.accent(1.26, 0.04, 0.7, 0, 0.03 + 2 * FH, -0.36);
    b.roof(0.7, 0.12, 0.14, 0, 0.07 + 2 * FH, -0.03, Math.PI / 2);
    b.roof(1.2, 0.2, 0.62, 0, 0.07 + 2 * FH, -0.4, Math.PI / 2, true);
    b.pool(0.5, 0.3, -0.52, 0.42, 0.03);
    b.pool(0.5, 0.3, 0.52, 0.42, 0.03);
    b.disc(0.14, 0.05, 0, 0.03, 0.62, C.stone);
    b.disc(0.1, 0.012, 0, 0.08, 0.62, C.water);
    b.accent(0.03, 0.03, 0.03, 0, 0.11, 0.62);
    b.warm(0.5, 0.06, 0.01, 0, 0.03 + 0.6 * FH, -0.065);
    b.sign(0.03 + 1.3 * FH, 0.62, -0.06);
  },
  villa: (b) => {
    b.solid(1.5, 0.03, 1.4, 0, 0, 0, C.lawn);
    for (const s of [-1, 1]) { b.hedge(1.5, 0.06, 0, s * 0.67, 0.03); b.hedge(0.06, 1.4, s * 0.72, 0, 0.03); }
    b.wall(0.9, 2 * FH, 0.55, -0.1, 0.03, -0.25, C.white);
    b.wall(0.4, FH, 0.45, 0.42, 0.03, -0.2, C.white);
    b.glass(0.5, FH, 0.01, -0.1, 0.03, 0.03);
    b.accent(0.96, 0.03, 0.6, -0.1, 0.03 + 2 * FH, -0.25);
    b.solid(0.44, 0.02, 0.5, 0.42, 0.03 + FH, -0.2, C.white);
    b.pool(0.55, 0.28, -0.15, 0.38, 0.03);
    b.tree(0.5, 0.03, 0.4, 0.09);
    b.flowers(0.3, 0.45, 0.15, 0.03);
    b.warm(0.3, 0.05, 0.01, -0.1, 0.03 + 1.4 * FH, 0.03);
    b.sign(0.03 + 1.2 * FH, 0.55, 0.03);
  },
  // The Financial District's office towers, the tallest in town.
  office0: (b) => {
    b.solid(1.1, 0.04, 1.1, 0, 0, 0, C.stone);
    b.glass(0.9, 40 * FH, 0.9, 0, 0.04, 0);
    for (const [x, z] of corners(0.45)) b.accent(0.06, 40 * FH, 0.06, x, 0.04, z);
    b.solid(0.94, 0.06, 0.94, 0, 0.04 + 40 * FH, 0, C.white);
    b.glass(0.5, 4 * FH, 0.5, 0, 0.1 + 40 * FH, 0);
    b.solid(0.02, 0.5, 0.02, 0, 0.1 + 44 * FH, 0, C.dark);
  },
  office1: (b) => {
    b.solid(1.2, 0.04, 1.2, 0, 0, 0, C.stone);
    let y = 0.04;
    for (const [w, n] of [[1.0, 18], [0.78, 14], [0.56, 10]]) {
      b.glass(w, n * FH, w, 0, y, 0);
      y += n * FH;
      b.accent(w + 0.04, 0.05, w + 0.04, 0, y, 0);
      y += 0.05;
    }
    b.solid(0.03, 0.6, 0.03, 0, y, 0, C.dark);
  },
  office2: (b) => {
    b.solid(1.2, 0.04, 1.0, 0, 0, 0, C.stone);
    for (const [x, n] of [[-0.26, 34], [0.26, 28]]) {
      b.wall(0.46, n * FH, 0.8, x, 0.04, 0, C.white);
      b.accent(0.5, 0.06, 0.84, x, 0.04 + n * FH, 0);
    }
    b.glass(0.1, 22 * FH, 0.5, 0, 0.04, 0);
  },
  // Public buildings downtown, each with its name up front.
  library: (b) => {
    b.solid(2.0, 0.05, 1.3, 0, 0, 0, C.stone);
    b.wall(1.8, 3 * FH, 0.8, 0, 0.05, -0.2, C.sand);
    for (let i = 0; i < 8; i++) b.solid(0.07, 3 * FH, 0.07, -0.77 + i * 0.22, 0.05, 0.28, C.white);
    b.solid(1.9, 0.06, 1.0, 0, 0.05 + 3 * FH, -0.1, C.white);
    b.roof(1.9, 0.2, 1.0, 0, 0.11 + 3 * FH, -0.1, Math.PI / 2);
    b.sign(0.05 + 2.2 * FH, 0.9, 0.32);
  },
  museum: (b) => {
    b.solid(2.0, 0.05, 1.4, 0, 0, 0, C.stone);
    b.wall(1.7, 3 * FH, 1.0, 0, 0.05, -0.1, C.white);
    for (let i = 0; i < 6; i++) b.solid(0.08, 3 * FH, 0.08, -0.5 + i * 0.2, 0.05, 0.46, C.marble);
    b.solid(1.8, 0.06, 1.1, 0, 0.05 + 3 * FH, -0.05, C.marble);
    b.disc(0.34, 0.1, 0, 0.11 + 3 * FH, -0.1, C.white);
    b.dome(0.32, 0, 0.21 + 3 * FH, -0.1);
    b.sign(0.05 + 2.2 * FH, 0.85, 0.5);
  },
  cinema: (b) => {
    b.solid(2.0, 0.04, 1.3, 0, 0, 0, C.concrete);
    b.wall(1.8, 4 * FH, 1.0, 0, 0.04, -0.1, C.dark);
    b.accent(1.9, 0.12, 0.3, 0, 0.04 + 1.4 * FH, 0.5);
    for (let i = 0; i < 12; i++) b.warm(0.03, 0.03, 0.03, -0.85 + i * 0.155, 0.04 + 1.4 * FH + 0.12, 0.64);
    b.glass(1.2, FH, 0.01, 0, 0.04, 0.41);
    b.sign(0.04 + 2.8 * FH, 0.9, 0.41);
  },
  hotel: (b) => {
    b.solid(1.8, 0.04, 1.3, 0, 0, 0, C.stone);
    b.glass(1.5, FH, 0.9, 0, 0.04, -0.1);
    b.wall(1.4, 16 * FH, 0.8, 0, 0.04 + FH, -0.1, C.cream);
    b.accent(1.6, 0.03, 0.4, 0, 0.04 + FH - 0.03, 0.45);
    b.accent(1.46, 0.1, 0.86, 0, 0.04 + 17 * FH, -0.1);
    b.solid(0.6, 0.18, 0.4, 0, 0.14 + 17 * FH, -0.1, C.white);
    b.sign(0.04 + 13 * FH, 0.7, 0.31);
  },
  // Billboard plazas: a kiosk and a food truck.
  kiosk: (b) => {
    b.solid(0.3, 0.16, 0.24, 0, 0, 0, C.white);
    b.awning(0.3, 0, 0.16, 0.13);
    b.accent(0.32, 0.03, 0.26, 0, 0.2, 0);
    b.solid(0.08, 0.03, 0.08, 0, 0.23, 0, C.lamp);
  },
  foodtruck: (b) => {
    b.accent(0.44, 0.2, 0.2, 0, 0.04, 0);
    b.solid(0.12, 0.12, 0.19, 0.24, 0.04, 0, C.white);
    b.solid(0.22, 0.08, 0.01, -0.04, 0.12, 0.101, C.dark);
    b.awning(0.24, -0.04, 0.2, 0.13);
    for (const [x, z] of [[-0.14, 0.1], [0.18, 0.1], [-0.14, -0.1], [0.18, -0.1]]) b.disc(0.035, 0.03, x, 0.005, z, D.black);
  },
  // Neighbourhood buildings on empty lots; the sign says what each one is.
  shop: (b) => {
    b.solid(0.9, 0.02, 0.9, 0, 0, 0, C.concrete);
    b.glass(0.66, FH, 0.5, 0, 0.02, -0.08);
    b.wall(0.7, FH, 0.54, 0, 0.02 + FH, -0.08, C.white);
    b.awning(0.66, 0, 0.02 + FH - 0.03, 0.2);
    b.accent(0.72, 0.03, 0.56, 0, 0.02 + 2 * FH, -0.08);
    b.flowers(0.24, 0.26, 0.32, 0.02);
    b.solid(0.1, 0.06, 0.1, -0.28, 0.02, 0.32, C.concrete);
    b.sign(0.02 + 1.5 * FH, 0.35, 0.19);
  },
  playground: (b) => {
    b.solid(0.9, 0.02, 0.9, 0, 0, 0, "#E9C891");
    b.solid(0.06, 0.2, 0.06, -0.2, 0.02, -0.2, C.white);
    b.accent(0.12, 0.02, 0.12, -0.2, 0.22, -0.2);
    b.plank(0.32, -0.06, 0.13, -0.2, -0.6, "#F97316");
    for (const x of [0.12, 0.34]) b.solid(0.015, 0.22, 0.015, x, 0.02, 0.15, C.dark);
    b.solid(0.24, 0.015, 0.015, 0.23, 0.24, 0.15, C.dark);
    for (const x of [0.18, 0.28]) b.solid(0.05, 0.01, 0.03, x, 0.1, 0.15, "#3B82F6");
    b.tree(-0.3, 0.02, 0.28, 0.1);
    b.solid(0.2, 0.04, 0.2, 0.2, 0.02, -0.22, "#F4E4BC");
  },
  garden: (b) => {
    b.solid(0.9, 0.02, 0.9, 0, 0, 0, C.lawn);
    for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
      b.solid(0.3, 0.05, 0.3, x, 0.02, z, C.wood);
      for (let i = 0; i < 3; i++) b.solid(0.06, 0.06, 0.06, x - 0.08 + i * 0.08, 0.07, z, i % 2 ? C.leaf : C.tulip);
    }
    b.solid(0.1, 0.12, 0.08, 0.38, 0.02, -0.38, C.wood);
  },
  // A lot waiting for its owner to make it uptown: fenced, a slab poured, scaffolding up.
  site: (b) => {
    b.solid(0.86, 0.015, 0.86, 0, 0, 0, "#A08B6C");
    b.solid(0.56, 0.04, 0.46, 0, 0.015, -0.06, C.concrete);
    for (const [x, z] of corners(0.24)) b.solid(0.02, 0.36, 0.02, x, 0.055, z - 0.06, "#F59E0B");
    for (const y of [0.18, 0.36]) b.solid(0.5, 0.015, 0.015, 0, 0.055 + y, 0.18, "#F59E0B");
    for (const s of [-1, 1]) {
      b.solid(0.86, 0.1, 0.01, 0, 0.015, s * 0.42, "#FDE68A");
      b.solid(0.01, 0.1, 0.86, s * 0.42, 0.015, 0, "#FDE68A");
    }
    b.solid(0.12, 0.08, 0.12, 0.28, 0.015, 0.25, C.sand);
    b.sign(0.13, 0.44, 0.43);
  },
  // The Docks gate: a chain-link fence panel and the gate posts.
  chainlink: (b) => {
    for (const x of [-0.5, 0.5]) b.solid(0.025, 0.34, 0.025, x, 0, 0, D.tin);
    b.solid(1.0, 0.012, 0.012, 0, 0.33, 0, D.tin);
    b.solid(1.0, 0.012, 0.012, 0, 0.06, 0, D.tin);
    for (let i = 0; i < 10; i++) b.plank(0.38, -0.45 + i * 0.1, 0.19, 0, i % 2 ? 1.1 : -1.1, D.cinder);
    for (let i = 0; i < 6; i++) b.solid(0.008, 0.06, 0.008, -0.45 + i * 0.18, 0.34, 0, D.black);
  },
  gate: (b) => {
    for (const x of [-0.8, 0.8]) { b.solid(0.08, 0.6, 0.08, x, 0, 0, D.rust2); b.solid(0.04, 0.04, 0.04, x, 0.6, 0, D.flame); }
    b.solid(1.64, 0.06, 0.06, 0, 0.6, 0, D.rust);
    b.solid(0.6, 0.3, 0.02, -0.4, 0.02, 0.1, D.tin, -0.5);
    b.sign(0.5, 0.82, 0.06);
  },
  firebarrel: (b) => {
    b.disc(0.06, 0.15, 0, 0, 0, D.rust2);
    b.disc(0.062, 0.012, 0, 0.05, 0, D.rust);
    b.solid(0.05, 0.05, 0.05, 0, 0.15, 0, D.fire, 0.4);
    b.solid(0.03, 0.06, 0.03, 0.01, 0.17, 0, D.flame, 1.1);
  },
  bulbpole: (b) => {
    b.solid(0.025, 0.5, 0.025, 0, 0, 0, D.boards);
    b.solid(0.16, 0.012, 0.012, 0.07, 0.48, 0, D.boards);
    b.solid(0.008, 0.06, 0.008, 0.14, 0.42, 0, D.black);
  },
  // Outskirts landmarks, scaled up where they're placed.
  warehouse: (b) => {
    b.solid(1.6, 0.02, 1.0, 0, 0, 0, D.cinder);
    b.solid(1.4, 0.36, 0.8, 0, 0.02, 0, D.sheet);
    b.ridge(1.44, 0.14, 0.84, 0, 0.38, 0, D.tin, Math.PI / 2);
    for (const x of [-0.4, 0.1]) b.solid(0.34, 0.26, 0.01, x, 0.02, 0.405, D.rust);
    b.solid(0.3, 0.17, 0.34, 0.6, 0.02, 0.65, "#41566A");
  },
  ferris: (b) => {
    for (const s of [-1, 1]) {
      b.plank(1.0, s * 0.22, 0.48, 0.12, s * 1.15, C.white, Math.PI / 2);
      b.plank(1.0, s * 0.22, 0.48, -0.12, s * 1.15, C.white, Math.PI / 2);
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      b.plank(0.42, Math.cos(a) * 0.21, 0.92 + Math.sin(a) * 0.21, 0, a, C.white);
      b.solid(0.07, 0.07, 0.07, Math.cos(a) * 0.43, 0.88 + Math.sin(a) * 0.43, 0, ["#EF4444", "#FACC15", "#3B82F6", "#22C55E"][i % 4]);
    }
    b.disc(0.05, 0.1, 0, 0.87, -0.05, C.gold);
    b.solid(1.1, 0.03, 0.5, 0, 0, 0, C.concrete);
  },
  carousel: (b) => {
    b.disc(0.3, 0.05, 0, 0, 0, C.white);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; b.solid(0.012, 0.22, 0.012, Math.cos(a) * 0.24, 0.05, Math.sin(a) * 0.24, C.gold); }
    b.accent(0.62, 0.05, 0.62, 0, 0.27, 0);
    b.roof(0.62, 0.16, 0.62, 0, 0.32, 0, 0, true);
  },
  terminal: (b) => {
    b.solid(1.8, 0.02, 0.9, 0, 0, 0, C.concrete);
    b.glass(1.6, 2 * FH, 0.6, 0, 0.02, 0);
    b.accent(1.7, 0.05, 0.7, 0, 0.02 + 2 * FH, 0);
    b.disc(0.08, 9 * FH, 0.95, 0.02, -0.2, C.white);
    b.glass(0.3, 0.14, 0.3, 0.95, 0.02 + 9 * FH, -0.2);
    b.accent(0.34, 0.03, 0.34, 0.95, 0.16 + 9 * FH, -0.2);
  },
  plane: (b) => {
    b.solid(0.7, 0.08, 0.1, 0, 0.06, 0, C.white);
    b.solid(0.16, 0.02, 0.7, -0.02, 0.08, 0, C.white);
    b.solid(0.1, 0.02, 0.28, -0.32, 0.1, 0, C.white);
    b.accent(0.08, 0.14, 0.02, -0.32, 0.1, 0);
  },
  track: (b) => {
    b.solid(1.0, 0.012, 0.28, 0, 0, 0, D.cinder);
    for (let i = 0; i < 5; i++) b.solid(0.06, 0.012, 0.26, -0.4 + i * 0.2, 0.012, 0, D.boards);
    for (const z of [-0.08, 0.08]) b.solid(1.0, 0.016, 0.016, 0, 0.024, z, C.dark);
  },
  train: (b) => {
    for (const x of [-0.55, 0, 0.55]) {
      b.accent(0.5, 0.14, 0.18, x, 0.04, 0);
      b.glass(0.42, 0.05, 0.185, x, 0.11, 0);
    }
    b.solid(0.1, 0.12, 0.16, 0.85, 0.04, 0, C.dark);
  },
  // Trees.
  oak: (b) => b.tree(0, 0, 0, 0.2),
  pine: (b) => b.pine(0, 0, 0, 0.19),
};

export const MODERN = Object.fromEntries(Object.keys(DESIGNS).map((k) => [k, `modern/${k}`]));

const BUILT = new Map();
export function modernModel(model) {
  const k = model.slice("modern/".length);
  if (!BUILT.has(k)) BUILT.set(k, design(DESIGNS[k]));
  return BUILT.get(k);
}
