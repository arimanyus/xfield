// Turns town data into a 3D city. Lots sit in 4x4 blocks between roads. The middle 3x3 blocks are the civic core:
// city hall on a square, with the city's essentials around it, ringed by downtown towers. Districts own whole
// blocks further out, every house stays dark until its owner moves in and grows a floor for each friend who has,
// and roads only run where something is built.
// Around the city lies a margin of open land, then a coast down to the sea.
const BLOCK = 4;
const COAST = 9;
export const WATER = -0.08;

const mod = (a, n) => ((a % n) + n) % n;
export const tileOf = (v) => v + Math.floor(v / BLOCK);
export const isRoad = (t) => mod(t, BLOCK + 1) === BLOCK;
export const blockOf = (v) => Math.floor(v / BLOCK);
const tileBlock = (t) => Math.floor(t / (BLOCK + 1));
const firstTile = (b) => b * (BLOCK + 1);

const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
};
const rand = (key) => (hash(key) % 10000) / 10000;
const pick = (arr, key) => arr[hash(key) % arr.length];
const chance = (key, p) => rand(key) < p;

const TREES = ["modern/oak", "modern/pine"];
export const LANDMARK_MODEL = {
  tech_campus: "modern/lab",
  stock_exchange: "modern/exchange",
  power_grid: "modern/turbine",
  central_station: "modern/station",
  broadcast_tower: "modern/mast",
  university: "modern/college",
  stadium: "modern/stadium",
  harbor: "modern/lighthouse",
};

// Towers are modelled about 9 floors tall; taller towers stretch.
const TOWER_FLOORS = 9;

export const GRASS = "#7DB563";
const PLAZA = "#E7E2D6";
const SQUARE = "#F3EFE6";
const PARK = "#6FAF55";
const STONE = "#A8A29E";
const QUAY = "#8C877D";
const STAINS = ["#5B564D", "#4A463F", "#6F7E86", "#7A6A52"];
const PLOT = "#B9A98C";

// Everyone starts on the Docks: a strip of blocks on the north shore, filled outward from the middle, 16 houses a
// block, with a crane yard at each end. A house moves to its own lot near its friends once it wins its way uptown.
const DOCK_LOTS = BLOCK * BLOCK;
const dockBlock = (i) => (i % 2 ? -(i + 1) / 2 : i / 2);
export const dockTint = (color) => mix(color || STONE, "#64748B", 0.55);
// A house on the Docks is the shack matching its home design.
export const modelOf = (m, docks) => (docks ? `s${m[1]}` : m);

// The ring around city hall. Parts are [model, dx, dz, scale, tint] in the block's own frame, where +z faces the
// square. The first part carries the sign: [text, bg, fg].
const CAR = 0.14;
export const CORE = {
  "0,-1": { id: "park", name: "Central Park", color: "#16A34A", pad: PARK, sign: ["CENTRAL PARK", "#166534", "#DCFCE7"], parts: [] },
  "1,-1": { id: "hospital", name: "Hospital", color: "#E11D48", sign: ["✚ HOSPITAL", "#FFFFFF", "#E11D48"], parts: [
    ["modern/hospital", 0, -0.55, 1, "#E11D48"], ["cars/ambulance", 1.2, 1.3, CAR], ["cars/ambulance", 0.65, 1.3, CAR]] },
  "1,0": { id: "market", name: "Market", color: "#059669", sign: ["XFIELD MARKET", "#065F46", "#FDE68A"], parts: [
    ["modern/market", 0, -1.0, 1, "#059669"], ["modern/stall", -1.1, 0.6, 1, "#F97316"], ["modern/stall", -0.37, 0.9, 1, "#FACC15"],
    ["modern/stall", 0.37, 0.6, 1, "#EF4444"], ["modern/stall", 1.1, 0.9, 1, "#22C55E"], ["cars/delivery", -1.4, 1.5, CAR]] },
  "1,1": { id: "school", name: "School", color: "#D97706", sign: ["XFIELD HIGH", "#FACC15", "#1E293B"], field: true, parts: [
    ["modern/school", 0, -1.0, 1, "#D97706"], ["cars/van", 1.5, -0.1, CAR, "#FACC15"]] },
  "0,1": { id: "bank", name: "Bank", color: "#0284C7", sign: ["XFIELD BANK", "#0C4A6E", "#FDE047"], parts: [
    ["modern/bank", 0, -0.6, 1, "#0284C7"], ["cars/suv", 0.3, 1.5, CAR, "#0F172A"]] },
  "-1,1": { id: "police", name: "Police", color: "#1D4ED8", sign: ["★ POLICE", "#1E3A8A", "#FFFFFF"], parts: [
    ["modern/police", 0, -0.7, 1, "#1D4ED8"], ["cars/police", -0.9, 1.25, CAR], ["cars/police", -0.35, 1.25, CAR], ["cars/police", 0.2, 1.25, CAR]] },
  "-1,0": { id: "fire", name: "Fire Station", color: "#DC2626", sign: ["FIRE STATION 1", "#B91C1C", "#FFFFFF"], parts: [
    ["modern/fire", 0, -0.7, 1, "#DC2626"],
    ["cars/garbage-truck", -0.6, 1.2, CAR, "#DC2626"], ["cars/garbage-truck", 0.1, 1.2, CAR, "#DC2626"], ["cars/garbage-truck", 0.8, 1.2, CAR, "#DC2626"]] },
  "-1,-1": { id: "power", name: "Power & Water", color: "#7C3AED", sign: ["⚡ POWER & WATER", "#4C1D95", "#FDE047"], parts: [
    ["modern/watertower", 0, -0.2, 1, "#7C3AED"], ["modern/turbine", -1.2, -1.2, 1, "#7C3AED"], ["modern/turbine", 1.2, -1.2, 1, "#7C3AED"],
    ["modern/solar", -1, 1.2, 1], ["modern/solar", 1, 1.2, 1]] },
};

// Downtown: a ring of parkland around the core. Each corner and its two neighbours form one superblock with no
// streets inside; the four middles stand alone.
export const DOWNTOWN = 2;
// The downtown block in front of the bank is Arrivals, an open-air concert garden whose screen shows who just moved in.
const VENUE = "0,2";
// Three downtown corners hold the city's towers, one per job. top is where the tower's label floats.
const PLACES = {
  "-2,-2": { id: "timeline", label: "📰 The Timeline", model: "modern/timeline", tint: "#0EA5E9", top: 5.3,
             sign: ["THE TIMELINE", "#111827", "#F97316"] },
  "2,-2": { id: "ledger", label: "🗞 The Ledger", model: "modern/ledger", tint: "#EAB308", top: 4.6,
            sign: ["THE LEDGER", "#F8FAFC", "#0F172A"] },
  "-2,2": { id: "post", label: "📮 Post Office", model: "modern/post", tint: "#EF4444", top: 4.2,
            sign: ["POST OFFICE", "#B91C1C", "#FFFFFF"] },
};
const downtown = (b, c) => Math.max(Math.abs(b), Math.abs(c)) === DOWNTOWN;
const superblock = (b, c) => (!downtown(b, c) ? null : b === 0 || c === 0 ? `${b},${c}` : `${Math.sign(b)},${Math.sign(c)}`);
const CORE_KEYS = [];
for (let b = -DOWNTOWN; b <= DOWNTOWN; b++) for (let c = -DOWNTOWN; c <= DOWNTOWN; c++) CORE_KEYS.push(`${b},${c}`);

export const mix = (hex, other, t) => {
  const a = parseInt(hex.slice(1), 16), b = parseInt(other.slice(1), 16);
  const c = [16, 8, 0].map((s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};

function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi;
  const s = (t) => t * t * (3 - 2 * t);
  const h = (a, b) => rand(`${a}:${b}`);
  const a = h(xi, zi), b = h(xi + 1, zi), c = h(xi, zi + 1), d = h(xi + 1, zi + 1), u = s(fx), v = s(fz);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const smooth = (a, b, t) => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

// Flat across the city and its margin, rolling hills and a ragged coast everywhere else, with a lake and a river
// cut into the countryside. Water never reaches the city.
export function heightAt(x, z, city) {
  const { built, island } = city;
  let d = Infinity;
  for (const [x0, x1, z0, z1] of built) d = Math.min(d, Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1)));
  if (d === 0) return 0;
  const n = 0.6 * vnoise(x * 0.11, z * 0.11) + 0.3 * vnoise(x * 0.25 + 7, z * 0.25 + 3) + 0.1 * vnoise(x * 0.6, z * 0.6);
  const edge = Math.min(x - island[0], island[1] - x, z - island[2], island[3] - z) + (vnoise(x * 0.3 + 11, z * 0.3) - 0.5) * 2;
  const hill = smooth(1, 6, d) * (n * 2.4 - 0.45) - smooth(4.5, 0.5, edge) * 1.35;
  const w = smooth(2.5, 4, d) * waterAt(x, z, city.water);
  return w > 0 ? Math.min(hill, hill * (1 - w) - 0.55 * w * w) : hill;
}

// 0 on land, 1 in open water. A river runs from a hill lake down to the sea, and a second lake sits on the far side.
export function waterAt(x, z, water) {
  let w = 0;
  for (const l of water.lakes) w = Math.max(w, smooth(1.08, 0.78, Math.hypot((x - l.x) / l.rx, (z - l.z) / l.rz)));
  const r = water.river;
  if (z > r.z) {
    const cx = r.x + Math.sin(z * 0.23) * 1.4 + (vnoise(z * 0.15, 4.2) - 0.5) * 1.2;
    const half = 0.55 + Math.sin(z * 0.3 + 1) * 0.12 + smooth(r.z, r.z + 30, z) * 0.35;
    w = Math.max(w, smooth(half + 0.5, half - 0.02, Math.abs(x - cx)));
  }
  return w;
}

export function buildCity(town) {
  const nbs = town.neighbourhoods || [], bounds = town.bounds;
  const nbById = Object.fromEntries(nbs.map((n) => [n.id, n]));
  const homes = new Map(town.residents.map((r) => [`${r.x},${r.y}`, r]));
  const owner = new Map();
  for (const n of nbs) for (const [bx, by] of n.blocks || []) owner.set(`${bx},${by}`, n);
  const used = new Set([...CORE_KEYS, ...owner.keys()]);
  for (const h of homes.values()) used.add(`${blockOf(h.x)},${blockOf(h.y)}`);
  const docked = town.residents.filter((r) => r.d != null);
  const cD = Math.min(...[...used].map((k) => Number(k.split(",")[1]))) - 1;
  const nDock = Math.max(1, Math.ceil((Math.max(-1, ...docked.map((r) => r.d)) + 1) / DOCK_LOTS));
  const docks = new Map();
  for (let i = 0; i < nDock + 2; i++) docks.set(`${dockBlock(i)},${cD}`, i < nDock ? i : "yard");
  for (const k of docks.keys()) used.add(k);
  const atDock = new Map(docked.map((r) => [r.d, r]));
  const blocks = [...used].map((k) => k.split(",").map(Number));
  const [b0, b1] = [Math.min(...blocks.map((b) => b[0])), Math.max(...blocks.map((b) => b[0]))];
  const c1 = Math.max(...blocks.map((b) => b[1]));
  const grid = [firstTile(b0) - 1, firstTile(b1 + 1) - 1, firstTile(cD) - 1, firstTile(c1 + 1) - 1];
  const land = [tileOf(bounds[0]), tileOf(bounds[2]), firstTile(cD) - 1, tileOf(bounds[3])];
  const island = [land[0] - COAST, land[1] + COAST, land[2] - 1.5, land[3] + COAST];
  const built = [[land[0] - 0.5, land[1] + 0.5, land[2] - 0.5, land[3] + 0.5]];
  const water = {
    lakes: [{ x: land[1] + 5.5, z: land[3] + 4.5, rx: 2.6, rz: 2 }, { x: land[0] - 5.5, z: (land[2] + land[3]) / 2 + 2, rx: 2.4, rz: 3 }],
    river: { x: land[1] + 5.5, z: land[3] + 4.5 },
  };
  const shape = { built, island, water };

  const buildings = [], pads = [], labels = [], homeList = [], signs = [];
  const faceRoad = (tx, tz) => (isRoad(tz + 1) ? 0 : isRoad(tz - 1) ? Math.PI : isRoad(tx + 1) ? Math.PI / 2 : -Math.PI / 2);
  const tree = (x, z, key, y = 0) => buildings.push({ model: pick(TREES, key), x, z, y, rot: 0, scale: 0.8 + rand(key + "s") * 0.5 });
  const marks = new Map(nbs.map((n) => [`${n.bx},${n.by}`, n]));
  // A district's host and its tallest lit members.
  const lit = town.residents.filter((r) => r.s === "f");
  const facesOf = (n) => lit.filter((r) => r.nb === n.id).sort((a, b) => (b.h === n.host) - (a.h === n.host) || b.f - a.f).slice(0, 5);
  const filled = new Map();
  for (const h of homes.values()) filled.set(`${blockOf(h.x)},${blockOf(h.y)}`, (filled.get(`${blockOf(h.x)},${blockOf(h.y)}`) || 0) + 1);
  let hall = null, venue = null;
  const addHome = (home, tx, tz, onDocks) => {
    const dark = home.s === "r", tint = dark ? null : onDocks ? dockTint(nbById[home.nb]?.color) : nbById[home.nb]?.color || STONE;
    const item = { x: tx, z: tz, rot: faceRoad(tx, tz), owner: home, stories: home.f };
    homeList.push({ ...item, color: dark ? "#334155" : tint });
    buildings.push({ ...item, model: `modern/${modelOf(home.m, onDocks)}`, fit: 0.86, tint, dark, face: dark ? undefined : home.a,
                     stretch: home.m[0] === "t" ? Math.max(1, home.f / TOWER_FLOORS) : 1 });
  };

  for (const [b, c] of blocks) {
    const key = `${b},${c}`, t0 = firstTile(b), u0 = firstTile(c), mid = [t0 + 1.5, u0 + 1.5];
    if (key === "0,0") {
      pads.push({ x: mid[0], z: mid[1], w: 4, d: 4, color: SQUARE });
      hall = { x: mid[0], z: mid[1], mark: { kind: "city_hall" } };
      for (const [dx, dz] of [[0, 0], [3, 0], [0, 3], [3, 3]]) tree(t0 + dx, u0 + dz, `hall${dx}${dz}`);
      labels.push({ kind: "place", id: "hall", pos: [mid[0], 3.6, mid[1]], text: "🏛 City Hall" });
      continue;
    }
    const core = CORE[key];
    if (core) {
      placeCore(core, b, c, mid, { buildings, pads, signs }, tree);
      continue;
    }
    if (key === VENUE) {
      venue = { x: mid[0], z: mid[1] };
      pads.push({ x: mid[0], z: mid[1], w: 4, d: 4, color: PARK });
      for (const [dx, dz] of [[1.75, -1.75], [-1.75, 1.75], [0.4, -1.8], [-1.8, 0.4], [1.8, 0.9], [0.9, 1.8]]) tree(mid[0] + dx, mid[1] + dz, `venue${dx}${dz}`);
      labels.push({ kind: "place", id: "arrivals", pos: [mid[0], 2.7, mid[1]], text: "🛎 Arrivals" });
      continue;
    }
    const place = PLACES[key];
    if (place) {
      pads.push({ x: mid[0], z: mid[1], w: 4, d: 4, color: PLAZA });
      buildings.push({ model: place.model, x: mid[0], z: mid[1], rot: 0, tint: place.tint, sign: place.sign, mark: { kind: "place", id: place.id } });
      for (const [dx, dz] of [[0, 0], [3, 0], [0, 3], [3, 3]]) tree(t0 + dx, u0 + dz, `${key}${dx}${dz}`);
      labels.push({ kind: "place", id: place.id, pos: [mid[0], place.top, mid[1]], text: place.label });
      continue;
    }
    if (downtown(b, c)) {
      pads.push({ x: mid[0], z: mid[1], w: 4, d: 4, color: PARK });
      for (let i = 0; i < 6; i++) tree(t0 - 0.3 + rand(`${key}:${i}`) * 3.6, u0 - 0.3 + rand(`${key}:${i}z`) * 3.6, `${key}:${i}`);
      continue;
    }
    if (docks.has(key)) {
      const i = docks.get(key), prop = (model, x, z, k, scale) => buildings.push({ model, x, z, rot: rand(k + "r") * 6.3, scale });
      pads.push({ x: mid[0], z: mid[1], w: 4, d: 4, color: QUAY });
      for (let s = 0; s < 9; s++) {
        const k = `${key}stain${s}`, w = 0.3 + rand(k + "w") * 0.9;
        pads.push({ x: t0 - 0.4 + rand(k) * 3.8, z: u0 - 0.4 + rand(k + "z") * 3.8, w, d: w * (0.5 + rand(k + "d")), y: 0.014, color: pick(STAINS, k) });
      }
      const boat = (x, z, rot, k) => {
        const [dx, dz] = [Math.sin(rot) * 0.6, Math.cos(rot) * 0.6];
        if (heightAt(x + dx, z + dz, shape) < WATER - 0.05 && heightAt(x - dx, z - dz, shape) < WATER - 0.05)
          buildings.push({ model: "modern/trawler", x, z, y: WATER - 0.03, rot: rot + (rand(k) - 0.5) * 0.2 });
      };
      if (i === "yard") {
        for (const dx of [0.3, 2.7]) buildings.push({ model: "modern/crane", x: t0 + dx, z: u0 + 0.4, rot: 0, tint: "#B45309" });
        for (const [dx, dz] of [[0, 2], [1, 3], [2, 2], [3, 3]]) buildings.push({ model: "modern/containers", x: t0 + dx, z: u0 + dz, rot: 0 });
        prop("modern/wreck", t0 + 1.5, u0 + 1.6, key, 1);
        prop("modern/pallets", t0 + 0.4, u0 + 3.2, key + "p", 1);
        buildings.push({ model: "modern/pier", x: t0 + 1.5, z: u0 - 2.6, rot: 0 });
        boat(t0 + 2.1, u0 - 2.9, 0, key);
        continue;
      }
      if (i === 0) labels.push({ kind: "place", id: "docks", pos: [mid[0], 2.2, mid[1]], text: "⚓ The Docks" });
      boat(t0 + 0.8 + rand(key + "b") * 2.4, u0 - 2.7, Math.PI / 2, key + "b");
      for (let j = 0; j < DOCK_LOTS; j++) {
        const home = atDock.get(i * DOCK_LOTS + j), tx = t0 + Math.floor(j / BLOCK), tz = u0 + (j % BLOCK), k = `${key}:${j}`;
        if (home) addHome(home, tx, tz, true);
        else if (rand(k) < 0.7) prop(pick(["modern/wreck", "modern/pallets", "modern/dumpster", "modern/junk", "modern/bags"], k + "m"), tx, tz, k, 1.2);
      }
      for (let gx = 1; gx < BLOCK; gx++) {
        for (let gz = 1; gz < BLOCK; gz++) {
          const k = `${key}g${gx}${gz}`;
          if (rand(k) < 0.5) prop(pick(["modern/bags", "modern/junk"], k + "m"), t0 + gx - 0.5, u0 + gz - 0.5, k, 0.8);
        }
      }
      continue;
    }
    const nb = owner.get(key);
    if (nb) {
      for (let gx = 1; gx < BLOCK; gx++) {
        for (let gz = 1; gz < BLOCK; gz++) {
          const k = `${key}f${gx}${gz}`;
          if (rand(k) < 0.3) buildings.push({ model: pick(["modern/bench", "modern/hydrant", "modern/planter"], k + "m"), x: t0 + gx - 0.5, z: u0 + gz - 0.5,
                                              rot: (hash(k) % 4) * (Math.PI / 2) });
        }
      }
    }
    if (nb) pads.push({ x: mid[0], z: mid[1], w: 4, d: 4, color: mix(nb.color, "#FFFFFF", 0.8 - 0.45 * Math.min(1, (filled.get(key) || 0) / 10)) });
    for (let i = 0; i < BLOCK; i++) {
      for (let j = 0; j < BLOCK; j++) {
        const x = b * BLOCK + i, y = c * BLOCK + j, tx = t0 + i, tz = u0 + j, lot = `${x},${y}`;
        const mark = marks.get(lot);
        if (mark) {
          buildings.push({ model: LANDMARK_MODEL[mark.landmark] || LANDMARK_MODEL.harbor, x: tx, z: tz, rot: faceRoad(tx, tz), fit: 0.98, tint: mark.color, mark: { kind: "district", nb: mark } });
          labels.push({ kind: "district", pos: [tx, 1.7, tz], text: mark.name || "New district", color: mark.color, id: mark.id, size: mark.size,
                        host: mark.host, faces: facesOf(mark) });
          continue;
        }
        const home = homes.get(lot);
        if (!home) {
          if (chance(lot + "g", nb ? 0.35 : 0.5)) tree(tx + (rand(lot) - 0.5) * 0.4, tz + (rand(lot + "z") - 0.5) * 0.4, lot);
          continue;
        }
        if (home.d != null) pads.push({ x: tx, z: tz, w: 0.8, d: 0.8, y: 0.01, color: PLOT });
        else addHome(home, tx, tz, false);
      }
    }
  }

  const inside = (tx, tz) => {
    const bs = isRoad(tx) ? [tileBlock(tx - 1), tileBlock(tx + 1)] : [tileBlock(tx)];
    const cs = isRoad(tz) ? [tileBlock(tz - 1), tileBlock(tz + 1)] : [tileBlock(tz)];
    const groups = new Set(bs.flatMap((b) => cs.map((c) => superblock(b, c))));
    return groups.size === 1 && !groups.has(null);
  };
  const roadAt = (tx, tz) => {
    if ((!isRoad(tx) && !isRoad(tz)) || inside(tx, tz)) return false;
    const bs = isRoad(tx) ? [tileBlock(tx - 1), tileBlock(tx + 1)] : [tileBlock(tx)];
    const cs = isRoad(tz) ? [tileBlock(tz - 1), tileBlock(tz + 1)] : [tileBlock(tz)];
    return bs.some((b) => cs.some((c) => used.has(`${b},${c}`)));
  };
  const roads = [], signals = [], crossings = new Set();
  for (let tx = grid[0]; tx <= grid[1]; tx++) {
    for (let tz = grid[2]; tz <= grid[3]; tz++) {
      if ((isRoad(tx) || isRoad(tz)) && inside(tx, tz)) pads.push({ x: tx, z: tz, w: 1, d: 1, color: PARK });
      if (!roadAt(tx, tz)) continue;
      const arms = Object.keys(DIRS).filter((d) => roadAt(tx + DIRS[d][0], tz + DIRS[d][1]));
      const piece = roadPiece(arms);
      if (!piece) continue;
      roads.push({ model: piece.model, rot: piece.rot, x: tx, z: tz });
      if (arms.length >= 3) {
        crossings.add(`${tx},${tz}`);
        for (const arm of arms) signals.push({ x: tx + HEADS[arm].dx, z: tz + HEADS[arm].dz, rot: HEADS[arm].rot, axis: HEADS[arm].axis });
      } else if (piece.model === "roads/road-straight" && hash(`${tx},${tz}`) % 3 === 0) {
        const alongX = arms.includes("E"), side = hash(`${tz},${tx}`) % 2 ? 1 : -1;
        buildings.push({ model: "roads/light-square", x: tx + (alongX ? 0 : 0.46 * side), z: tz + (alongX ? 0.46 * side : 0),
                         rot: (alongX ? 0 : Math.PI / 2) + (side > 0 ? 0 : Math.PI), scale: 0.6 });
      }
    }
  }

  // Cars drive each continuous stretch of road and stop at its crossings.
  const lanes = [];
  const runs = (axis, line, from, to) => {
    let start = null;
    for (let t = from; t <= to + 1; t++) {
      const on = t <= to && (axis === "x" ? roadAt(t, line) : roadAt(line, t));
      if (on && start === null) start = t;
      if (!on && start !== null) {
        if (t - 1 - start >= 2) {
          const stops = [];
          for (let s = start; s < t; s++) if (crossings.has(axis === "x" ? `${s},${line}` : `${line},${s}`)) stops.push(s);
          lanes.push({ axis, line, from: start, to: t - 1, stops });
        }
        start = null;
      }
    }
  };
  for (let tz = grid[2]; tz <= grid[3]; tz++) if (isRoad(tz)) runs("x", tz, grid[0], grid[1]);
  for (let tx = grid[0]; tx <= grid[1]; tx++) if (isRoad(tx)) runs("z", tx, grid[2], grid[3]);

  for (let x = island[0]; x <= island[1]; x++) {
    for (let z = island[2]; z <= island[3]; z++) {
      const jx = x + (rand(`${x}j${z}`) - 0.5) * 0.8, jz = z + (rand(`${z}k${x}`) - 0.5) * 0.8;
      const h = heightAt(jx, jz, shape);
      if (h === 0 || h < WATER + 0.12 || h > 1.6) continue;
      if (h > 0.7 && chance(`${x}w${z}`, 0.006)) buildings.push({ model: "modern/turbine", x: jx, z: jz, y: h - 0.05, rot: rand(`${x}r${z}`) * 6.3, scale: 0.7 });
      else if (chance(`${x}f${z}`, vnoise(x * 0.18 + 40, z * 0.18) > 0.55 ? 0.6 : 0.07)) tree(jx, jz, `${x}t${z}`, h - 0.02);
    }
  }

  return { roads, buildings, pads, signals, labels, lanes, signs, hall, venue, homes: homeList, grid, island, built, water,
           center: [(grid[0] + grid[1]) / 2, (grid[2] + grid[3]) / 2] };
}

function placeCore(core, b, c, mid, { buildings, pads, signs }, tree) {
  const rot = c ? (c > 0 ? Math.PI : 0) : b > 0 ? -Math.PI / 2 : Math.PI / 2;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const at = (dx, dz) => [mid[0] + dx * cos + dz * sin, mid[1] - dx * sin + dz * cos];
  pads.push({ x: mid[0], z: mid[1], w: 4, d: 4, color: core.pad || PLAZA });
  if (core.field) pads.push({ x: at(-0.4, 0.75)[0], z: at(-0.4, 0.75)[1], w: 2.2, d: 2.2, y: 0.02, color: PARK });
  const mark = { kind: "civic", id: core.id, name: core.name, color: core.color };
  core.parts.forEach(([model, dx, dz, scale, tint], i) => {
    const [x, z] = at(dx, dz);
    buildings.push({ model, x, z, rot, tint, scale, mark: i === 0 ? mark : undefined, sign: i === 0 ? core.sign : undefined });
  });
  if (!core.parts.length) signs.push({ text: core.sign, x: mid[0] + 1.25, z: mid[1] + 1.25 });
  if (core.id === "park") {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, r = 1.35 + rand(`park${i}`) * 0.3;
      tree(mid[0] + Math.cos(a) * r, mid[1] + Math.sin(a) * r, `park${i}`);
    }
    for (const [w, d] of [[2.8, 0.3], [0.3, 2.8]]) pads.push({ x: mid[0], z: mid[1], w, d, y: 0.02, color: SQUARE });
    buildings.push({ model: "modern/fountain", x: mid[0], z: mid[1], rot: 0, mark });
  } else {
    for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6]]) tree(...at(dx, dz), `${core.id}${dx}`);
  }
}

// One green axis at a time, with a yellow in between. Every intersection shares the cycle.
export const LIGHT_CYCLE = 11;
const YELLOW = 1.4;
export function lightPhase(time) {
  const green = (LIGHT_CYCLE - 2 * YELLOW) / 2;
  const u = ((time % LIGHT_CYCLE) + LIGHT_CYCLE) % LIGHT_CYCLE;
  if (u < green) return { x: "g", z: "r" };
  if (u < green + YELLOW) return { x: "y", z: "r" };
  if (u < 2 * green + YELLOW) return { x: "r", z: "g" };
  return { x: "r", z: "y" };
}

// A signal on the near-right corner of each arm, facing the cars that arrive from it.
const HEADS = {
  W: { dx: -0.44, dz: 0.44, rot: -Math.PI / 2, axis: "x" },
  E: { dx: 0.44, dz: -0.44, rot: Math.PI / 2, axis: "x" },
  N: { dx: -0.44, dz: -0.44, rot: Math.PI, axis: "z" },
  S: { dx: 0.44, dz: 0.44, rot: 0, axis: "z" },
};

const DIRS = { E: [1, 0], W: [-1, 0], S: [0, 1], N: [0, -1] };
// Open sides of each Kenney road piece as modelled (measured from the meshes: asphalt reaches these edges).
const ROAD_ARMS = {
  "roads/road-straight": ["E", "W"],
  "roads/road-crossroad": ["E", "W", "S", "N"],
  "roads/road-intersection": ["E", "W", "S"],
  "roads/road-bend-sidewalk": ["W", "S"],
  "roads/road-end-round": ["E"],
};

function roadPiece(arms) {
  for (const [model, base] of Object.entries(ROAD_ARMS)) {
    if (base.length !== arms.length) continue;
    let dirs = base.map((d) => DIRS[d]);
    for (let k = 0; k < 4; k++) {
      if (dirs.every(([x, z]) => arms.some((a) => DIRS[a][0] === x && DIRS[a][1] === z))) return { model, rot: (k * Math.PI) / 2 };
      dirs = dirs.map(([x, z]) => [z, -x]);
    }
  }
  return null;
}
