// Turns town data into a 3D city. House lots sit in 2x2 blocks between roads. The civic core and the Docks use big
// blocks, 2x2 house blocks with no streets inside. The middle 3x3 big blocks are the civic core:
// city hall on a square, with the city's essentials around it, ringed by downtown towers. Districts own whole
// blocks further out, every house stays dark until its owner moves in and grows a floor for each friend who has,
// and roads only run where something is built.
// Around the city lies a margin of open land, then a coast down to the sea.
// Once every ground spot is taken, homes stack as floors on top of a building: patched together on the Docks, glass
// and steel uptown.
import { modernModel } from "@/city3d/modern";
import { hash, rand, pick, chance } from "@/city3d/rng";
import { ROW, SHOPS, addOffices, addOutskirts, addPlaza, addPublic, addRow, addYard, dockGrit, infill, isPublic, site } from "@/city3d/fill";

const BLOCK = 2;
const BIG = 2;
const BIG_W = BIG * (BLOCK + 1) - 1;
const SIDE = BIG * BLOCK;
const bigOf = (b) => Math.floor(b / BIG);
// Tile offset of the i-th lot across a big block, stepping over the street its house blocks would have had.
const bigLot = (i) => i + Math.floor(i / BLOCK);
const FLOOR_H = 0.2;
const DOCK_FLOORS = ["fd0", "fd1", "fd2", "fd3"];
const UP_FLOORS = ["fu0", "fu1"];
// Every house grows to fill its lot, garden to the edges; floors stacked on it grow with it.
const LOT = 0.98;
const fillOf = (model) => LOT / modernModel(`modern/${model}`).footprint;
// How high a design's roof is once placed, where the next floor goes.
const deckOf = (model, stretch) => modernModel(`modern/${model}`).deck * fillOf(model) * stretch;
const COAST = 9;
export const WATER = -0.08;

const mod = (a, n) => ((a % n) + n) % n;
export const tileOf = (v) => v + Math.floor(v / BLOCK);
export const isRoad = (t) => mod(t, BLOCK + 1) === BLOCK;
export const blockOf = (v) => Math.floor(v / BLOCK);
const tileBlock = (t) => Math.floor(t / (BLOCK + 1));
const firstTile = (b) => b * (BLOCK + 1);

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
const QUAY = "#77736A";
const STAINS = ["#4E4A43", "#3F3B35", "#5F6B70", "#6A5B45", "#35302B"];
const PUDDLE = "#3E4A50";

// Everyone starts on the Docks: a strip of blocks on the north shore, filled outward from the middle, 16 houses a
// block, with a crane yard at each end. A row of industrial yards always keeps it apart from the city. A house moves to
// its own lot near its friends once it wins its way uptown.
const DOCK_LOTS = SIDE * SIDE;
const dockBlock = (i) => (i % 2 ? -(i + 1) / 2 : i / 2);
export const dockTint = (color) => mix(color || STONE, "#5B6470", 0.72);
// A house on the Docks is the shack matching its home design.
export const modelOf = (m, docks) => (docks ? `s${m[1]}` : m);

// The ring around city hall, keyed by big block. Parts are [model, dx, dz, scale, tint] in the block's own frame,
// where +z faces the square. The first part carries the sign: [text, bg, fg].
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
// The Financial District's two plots at the back of downtown.
const FINANCE = { "-1,-2": 0, "1,-2": 1 };
// Billboard spots the admin fills: downtown parkland by big block, the Docks crane yard, and the outskirts landmarks.
export const BILLBOARD_SPOTS = { hero: "0,-2", west: "-2,0", east: "2,0", corner: "2,2", ledger: "2,-1", docks: "yard", stadium: "stadium",
  airport: "airport", station: "station" };
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
  const ground = town.residents.filter((r) => r.lv == null);
  const homes = new Map(ground.map((r) => [`${r.x},${r.y}`, r]));
  // Floors by building: a Docks slot or a city lot, lowest first.
  const floorsAt = new Map();
  for (const r of town.residents) {
    if (r.lv == null) continue;
    const key = r.on === "dock" ? `d:${r.d}` : `l:${r.x},${r.y}`;
    floorsAt.set(key, [...(floorsAt.get(key) || []), r]);
  }
  for (const list of floorsAt.values()) list.sort((a, b) => a.lv - b.lv);
  const owner = new Map();
  for (const n of nbs) for (const [bx, by] of n.blocks || []) owner.set(`${bx},${by}`, n);
  const used = new Set(owner.keys());
  const addBig = (key) => {
    const [B, C] = key.split(",").map(Number);
    for (let i = 0; i < BIG; i++) for (let j = 0; j < BIG; j++) used.add(`${B * BIG + i},${C * BIG + j}`);
  };
  CORE_KEYS.forEach(addBig);
  for (const h of town.residents) used.add(`${blockOf(h.x)},${blockOf(h.y)}`);
  joinUp(used);
  const docked = ground.filter((r) => r.d != null);
  // The Docks row, then its yards, then one open row with the railway and two streets across it, then the city.
  const cD = bigOf(Math.min(...[...used].map((k) => Number(k.split(",")[1])))) - 3;
  const slots = town.residents.filter((r) => r.d != null).map((r) => r.d);
  const nDock = Math.max(1, Math.ceil((Math.max(-1, ...slots) + 1) / DOCK_LOTS));
  const docks = new Map();
  const yards = new Set();
  for (let i = 0; i < nDock + 2; i++) {
    docks.set(`${dockBlock(i)},${cD}`, i < nDock ? i : "yard");
    yards.add(`${dockBlock(i)},${cD + 1}`);
  }
  const cityBlocks = [...used].map((k) => k.split(",").map(Number));
  for (const k of [...docks.keys(), ...yards]) addBig(k);
  const atDock = new Map(docked.map((r) => [r.d, r]));
  const blocks = [...used].map((k) => k.split(",").map(Number));
  const [b0, b1] = [Math.min(...blocks.map((b) => b[0])), Math.max(...blocks.map((b) => b[0]))];
  const c1 = Math.max(...blocks.map((b) => b[1]));
  const grid = [firstTile(b0) - 1, firstTile(b1 + 1) - 1, firstTile(cD * BIG) - 1, firstTile(c1 + 1) - 1];
  const dockBs = [...docks.keys()].map((k) => Number(k.split(",")[0]));
  const land = [Math.min(tileOf(bounds[0]), firstTile(Math.min(...dockBs) * BIG) - 1),
                Math.max(tileOf(bounds[2]), firstTile((Math.max(...dockBs) + 1) * BIG) - 1), firstTile(cD * BIG) - 1, tileOf(bounds[3])];
  const island = [land[0] - COAST, land[1] + COAST, land[2] - 1.5, land[3] + COAST];
  const built = [[land[0] - 0.5, land[1] + 0.5, land[2] - 0.5, land[3] + 0.5]];
  const water = {
    lakes: [{ x: land[1] + 5.5, z: land[3] + 4.5, rx: 2.6, rz: 2 }, { x: land[0] - 5.5, z: (land[2] + land[3]) / 2 + 2, rx: 2.4, rz: 3 }],
    river: { x: land[1] + 5.5, z: land[3] + 4.5 },
  };
  const shape = { built, island, water };

  const buildings = [], pads = [], labels = [], homeList = [], signs = [], boards = [];
  const spotBoards = new Map((town.billboards || []).map((bb) => [BILLBOARD_SPOTS[bb.id], bb]));
  const addBoard = (key, x, z, lift) => {
    const bb = spotBoards.get(key);
    if (bb) boards.push({ ...bb, x, z, lift });
    return !!bb;
  };
  const faceRoad = (tx, tz) => (isRoad(tz + 1) ? 0 : isRoad(tz - 1) ? Math.PI : isRoad(tx + 1) ? Math.PI / 2 : -Math.PI / 2);
  const tree = (x, z, key, y = 0) => buildings.push({ model: pick(TREES, key), x, z, y, rot: 0, scale: 0.8 + rand(key + "s") * 0.5 });
  const marks = new Map(nbs.map((n) => [`${n.bx},${n.by}`, n]));
  // A district's host and its tallest lit members.
  const lit = town.residents.filter((r) => r.s === "f");
  const facesOf = (n) => lit.filter((r) => r.nb === n.id).sort((a, b) => (b.h === n.host) - (a.h === n.host) || b.f - a.f).slice(0, 5);
  const filled = new Map();
  for (const h of homes.values()) filled.set(`${blockOf(h.x)},${blockOf(h.y)}`, (filled.get(`${blockOf(h.x)},${blockOf(h.y)}`) || 0) + 1);
  let hall = null;
  const byK = new Map(town.residents.map((r) => [r.k, r]));
  const holders = new Map((town.mansions?.holders || []).filter((h) => byK.get(h.k)?.s === "f").map((h) => [h.rank, byK.get(h.k)]));
  const held = new Set([...holders.values()].map((r) => r.k));
  const smoke = [], haze = [], bulbs = [];
  const ctx = { buildings, pads, signs, labels, homeList, tree, smoke, haze, bulbs, holders, addBoard, before: !town.mansions, span: BIG_W,
                colorOf: (r) => nbById[r.nb]?.color };
  const tintOf = (r, onDocks) => (r.s === "r" ? null : onDocks ? dockTint(nbById[r.nb]?.color) : nbById[r.nb]?.color || STONE);
  // A building: its ground home, then a floor for everyone stacked on it, crooked on the Docks, then a roof cap.
  // Someone who moved into a mansion leaves their home shut: a shop opens on their lot uptown, their shack goes dark.
  const addHome = (home, rest, tx, tz, onDocks) => {
    const away = held.has(home.k), shop = away && !onDocks ? pick(SHOPS, `${tx},${tz}shop`) : null;
    const dark = home.s === "r" || away, tint = shop ? shop.tint : tintOf(home, onDocks), rot = faceRoad(tx, tz);
    const model = shop ? "shop" : modelOf(home.m, onDocks);
    const stretch = !shop && home.m[0] === "t" ? Math.max(1, home.f / TOWER_FLOORS) : 1, deck = deckOf(model, stretch);
    const s = fillOf(model), fh = FLOOR_H * s;
    const stack = [home, ...rest], item = { x: tx, z: tz, rot, owner: shop ? undefined : home, stories: home.f };
    if (!away) homeList.push({ ...item, y: 0, top: deck + 0.02, color: dark ? "#334155" : tint, stack, level: 0 });
    buildings.push({ ...item, model: `modern/${model}`, scale: s, tint, dark: dark && !shop, face: dark ? undefined : home.a, sign: shop?.sign, stretch });
    if (onDocks && !dark && chance(`${home.k}smoke`, 0.3)) smoke.push([tx + 0.12, deck + 0.05, tz - 0.1]);
    rest.forEach((r, i) => {
      const y = deck + i * fh, k = `${r.k}:floor`, off = r.s === "r" || held.has(r.k), shake = onDocks ? s : 0;
      if (!held.has(r.k)) homeList.push({ x: tx, z: tz, y, top: y + fh + 0.02, rot, owner: r, stories: 1, color: off ? "#334155" : tintOf(r, onDocks), stack, level: i + 1 });
      buildings.push({ x: tx + (rand(k) - 0.5) * 0.08 * shake, z: tz + (rand(`${k}z`) - 0.5) * 0.08 * shake, y, scale: s,
                       rot: rot + (rand(`${k}r`) - 0.5) * 0.3 * (onDocks ? 1 : 0), owner: r, model: `modern/${pick(onDocks ? DOCK_FLOORS : UP_FLOORS, r.k)}`,
                       tint: tintOf(r, onDocks), dark: off, face: off ? undefined : r.a });
    });
    if (rest.length) buildings.push({ x: tx, z: tz, y: deck + rest.length * fh, rot, scale: s, model: onDocks ? "modern/fdcap" : "modern/fucap" });
  };

  for (const [b, c] of blocks) {
    const B = bigOf(b), C = bigOf(c), bigKey = `${B},${C}`;
    const isBig = Math.max(Math.abs(B), Math.abs(C)) <= DOWNTOWN || docks.has(bigKey) || yards.has(bigKey);
    if (isBig && (b !== B * BIG || c !== C * BIG)) continue;
    const key = isBig ? bigKey : `${b},${c}`, t0 = firstTile(b), u0 = firstTile(c), span = isBig ? BIG_W : BLOCK;
    const mid = [t0 + (span - 1) / 2, u0 + (span - 1) / 2], E = span - 1, corners = [[0, 0], [E, 0], [0, E], [E, E]];
    if (key === "0,0") {
      pads.push({ x: mid[0], z: mid[1], w: BIG_W, d: BIG_W, color: SQUARE });
      hall = { x: mid[0], z: mid[1], mark: { kind: "city_hall" } };
      for (const [dx, dz] of corners) tree(t0 + dx, u0 + dz, `hall${dx}${dz}`);
      labels.push({ kind: "place", id: "hall", pos: [mid[0], 3.6, mid[1]], text: "🏛 City Hall" });
      continue;
    }
    const core = CORE[key];
    if (core) {
      placeCore(core, B, C, mid, { buildings, pads, signs }, tree);
      continue;
    }
    const place = PLACES[key];
    if (place) {
      pads.push({ x: mid[0], z: mid[1], w: BIG_W, d: BIG_W, color: PLAZA });
      buildings.push({ model: place.model, x: mid[0], z: mid[1], rot: 0, tint: place.tint, sign: place.sign, mark: { kind: "place", id: place.id } });
      for (const [dx, dz] of corners) tree(t0 + dx, u0 + dz, `${key}${dx}${dz}`);
      labels.push({ kind: "place", id: place.id, pos: [mid[0], place.top, mid[1]], text: place.label });
      continue;
    }
    if (ROW[key]) {
      addRow(ctx, key, mid);
      continue;
    }
    if (FINANCE[key] !== undefined) {
      addOffices(ctx, key, mid, FINANCE[key]);
      continue;
    }
    if (isPublic(key)) {
      addPublic(ctx, key, mid);
      continue;
    }
    if (downtown(B, C)) {
      addPlaza(ctx, key, mid, addBoard(key, mid[0], mid[1]));
      continue;
    }
    if (isBig && yards.has(key)) {
      addYard(ctx, key, mid, t0, u0, E);
      continue;
    }
    if (isBig && docks.has(key)) {
      const i = docks.get(key), prop = (model, x, z, k, scale) => buildings.push({ model, x, z, rot: rand(k + "r") * 6.3, scale });
      pads.push({ x: mid[0], z: mid[1], w: BIG_W, d: BIG_W, color: QUAY });
      for (let s = 0; s < 22; s++) {
        const k = `${key}stain${s}`, w = 0.3 + rand(k + "w") * 0.9;
        pads.push({ x: t0 - 0.4 + rand(k) * (E + 0.8), z: u0 - 0.4 + rand(k + "z") * (E + 0.8), w, d: w * (0.5 + rand(k + "d")), y: 0.014, color: pick(STAINS, k) });
      }
      for (let s = 0; s < 6; s++) {
        const k = `${key}puddle${s}`, w = 0.25 + rand(k + "w") * 0.4;
        pads.push({ x: t0 - 0.3 + rand(k) * (E + 0.6), z: u0 - 0.3 + rand(k + "z") * (E + 0.6), w, d: w * (0.6 + rand(k + "d") * 0.6), y: 0.016, color: PUDDLE });
      }
      for (let f = 0; f < SIDE; f++) {
        const k = `${key}fence${f}`;
        if (rand(k) < 0.65) buildings.push({ model: "modern/fence", x: t0 + bigLot(f), z: u0 - 0.58, rot: (rand(k + "r") - 0.5) * 0.25 });
      }
      const boat = (x, z, rot, k) => {
        const [dx, dz] = [Math.sin(rot) * 0.6, Math.cos(rot) * 0.6];
        if (heightAt(x + dx, z + dz, shape) < WATER - 0.05 && heightAt(x - dx, z - dz, shape) < WATER - 0.05)
          buildings.push({ model: "modern/trawler", x, z, y: WATER - 0.03, rot: rot + (rand(k) - 0.5) * 0.2 });
      };
      if (i === "yard") {
        for (const dx of [0.3, E - 0.3]) buildings.push({ model: "modern/crane", x: t0 + dx, z: u0 + 0.4, rot: 0, tint: "#B45309" });
        for (const [dx, dz] of [[0, 2], [1, 3], [2, 2], [3, 3]]) buildings.push({ model: "modern/containers", x: t0 + bigLot(dx), z: u0 + bigLot(dz), rot: 0 });
        const first = !boards.some((bb) => bb.id === "docks");
        if (!(first && addBoard("yard", mid[0], mid[1] - 0.2))) prop("modern/wreck", mid[0], mid[1] + 0.1, key, 1);
        prop("modern/pallets", t0 + 0.4, u0 + E + 0.2, key + "p", 1);
        buildings.push({ model: "modern/pier", x: mid[0], z: u0 - 2.6, rot: 0 });
        boat(mid[0] + 0.6, u0 - 2.9, 0, key);
        continue;
      }
      if (i === 0) labels.push({ kind: "place", id: "docks", pos: [mid[0], 2.2, mid[1]], text: "⚓ The Docks" });
      dockGrit(ctx, key, mid, t0, u0, E, i === 0);
      boat(t0 + 0.8 + rand(key + "b") * (E - 0.6), u0 - 2.7, Math.PI / 2, key + "b");
      for (let j = 0; j < DOCK_LOTS; j++) {
        const slot = i * DOCK_LOTS + j, tx = t0 + bigLot(Math.floor(j / SIDE)), tz = u0 + bigLot(j % SIDE), k = `${key}:${j}`;
        const fl = floorsAt.get(`d:${slot}`) || [], own = atDock.get(slot), home = own || fl[0];
        if (home) addHome(home, own ? fl : fl.slice(1), tx, tz, true);
        else if (rand(k) < 0.8) prop(pick(["modern/wreck", "modern/pallets", "modern/dumpster", "modern/junk", "modern/bags", "modern/tent", "modern/tires",
                                           "modern/barrel", "modern/laundry"], k + "m"), tx, tz, k, 1.2);
      }
      for (let gx = 1; gx < SIDE; gx++) {
        for (let gz = 1; gz < SIDE; gz++) {
          const k = `${key}g${gx}${gz}`, gap = (g) => (bigLot(g - 1) + bigLot(g)) / 2;
          if (rand(k) < 0.65) prop(pick(["modern/bags", "modern/junk", "modern/barrel", "modern/tires", "modern/bags"], k + "m"), t0 + gap(gx), u0 + gap(gz), k, 0.8);
        }
      }
      continue;
    }
    const nb = owner.get(key);
    if (nb || filled.get(key)) {
      for (let gx = 1; gx < BLOCK; gx++) {
        for (let gz = 1; gz < BLOCK; gz++) {
          const k = `${key}f${gx}${gz}`;
          const model = pick(["modern/lamp", "modern/palm", "modern/flowerbed", "modern/bench", "modern/fountain", "modern/statue",
                              "modern/planter", "modern/palm"], k + "m");
          buildings.push({ model, x: t0 + gx - 0.5, z: u0 + gz - 0.5, rot: (hash(k) % 4) * (Math.PI / 2), scale: model === "modern/fountain" ? 0.42 : undefined });
        }
      }
      for (const [dx, dz] of [[-0.5, -0.5], [BLOCK - 0.5, -0.5], [-0.5, BLOCK - 0.5], [BLOCK - 0.5, BLOCK - 0.5]]) {
        const k = `${key}c${dx}${dz}`;
        if (chance(k, 0.6)) tree(t0 + dx, u0 + dz, k);
      }
    }
    if (nb) pads.push({ x: mid[0], z: mid[1], w: BLOCK, d: BLOCK, color: mix(nb.color, "#FFFFFF", 0.8 - 0.45 * Math.min(1, (filled.get(key) || 0) / (BLOCK * BLOCK))) });
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
        const home = homes.get(lot), fl = floorsAt.get(`l:${lot}`) || [];
        const base = home && home.d == null ? home : fl[0];
        if (!home && !base) {
          infill(ctx, lot, tx, tz, faceRoad(tx, tz));
          continue;
        }
        if (base) addHome(base, base === home ? fl : fl.slice(1), tx, tz, false);
        else site(ctx, home, tx, tz, faceRoad(tx, tz));
      }
    }
  }

  // Streets never run inside a big block, nor between the downtown corners and their two neighbours.
  const groupOf = (b, c) => {
    const B = bigOf(b), C = bigOf(c), big = `${B},${C}`;
    if (docks.has(big)) return `dock ${big}`;
    if (yards.has(big)) return `yard ${big}`;
    if (Math.max(Math.abs(B), Math.abs(C)) > DOWNTOWN) return null;
    return downtown(B, C) && B !== 0 && C !== 0 ? `corner ${Math.sign(B)},${Math.sign(C)}` : `big ${big}`;
  };
  const near = (t) => (isRoad(t) ? [tileBlock(t - 1), tileBlock(t + 1)] : [tileBlock(t)]);
  const around = (tx, tz) => near(tx).flatMap((b) => near(tz).map((c) => [b, c]));
  const inside = (tx, tz) => {
    const groups = new Set(around(tx, tz).map(([b, c]) => groupOf(b, c)));
    return groups.size === 1 && !groups.has(null);
  };
  // A street left out between two big blocks of one downtown corner turns to parkland; inside a big block its pad covers it.
  const between = (tx, tz) => new Set(around(tx, tz).map(([b, c]) => `${bigOf(b)},${bigOf(c)}`)).size > 1;
  const roadAt = (tx, tz) => {
    if ((!isRoad(tx) && !isRoad(tz)) || inside(tx, tz)) return false;
    return around(tx, tz).some(([b, c]) => used.has(`${b},${c}`));
  };
  const gapTop = firstTile((cD + 2) * BIG) - 1, crossing = new Set();
  for (const cx of [firstTile(0) - 1, firstTile(BIG) - 1]) {
    for (let tz = gapTop + 1; tz <= grid[3] && !roadAt(cx, tz); tz++) crossing.add(`${cx},${tz}`);
  }
  const streetAt = (tx, tz) => crossing.has(`${tx},${tz}`) || roadAt(tx, tz);
  const roads = [], signals = [], crossings = new Set();
  for (let tx = grid[0]; tx <= grid[1]; tx++) {
    for (let tz = grid[2]; tz <= grid[3]; tz++) {
      if ((isRoad(tx) || isRoad(tz)) && inside(tx, tz) && between(tx, tz)) pads.push({ x: tx, z: tz, w: 1, d: 1, color: PARK });
      if (!streetAt(tx, tz)) continue;
      const arms = Object.keys(DIRS).filter((d) => streetAt(tx + DIRS[d][0], tz + DIRS[d][1]));
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
      const on = t <= to && (axis === "x" ? streetAt(t, line) : streetAt(line, t));
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

  const xs = cityBlocks.map(([b]) => b), zs = cityBlocks.map(([, c]) => c);
  const box = [firstTile(Math.min(...xs)) - 1, firstTile(Math.max(...xs) + 1) - 1, firstTile(Math.min(...zs)) - 1, firstTile(Math.max(...zs) + 1) - 1];
  ctx.railNorth = gapTop + 3;
  addOutskirts(ctx, box);
  const farm = (x, z) => x < box[0] - 3 && z > (box[2] + box[3]) / 2;
  for (let x = island[0]; x <= island[1]; x++) {
    for (let z = island[2]; z <= island[3]; z++) {
      const jx = x + (rand(`${x}j${z}`) - 0.5) * 0.8, jz = z + (rand(`${z}k${x}`) - 0.5) * 0.8;
      const h = heightAt(jx, jz, shape);
      if (h === 0 || h < WATER + 0.12 || h > 1.6) continue;
      if (h > (farm(jx, jz) ? 0.3 : 0.7) && chance(`${x}w${z}`, farm(jx, jz) ? 0.09 : 0.006)) buildings.push({ model: "modern/turbine", x: jx, z: jz, y: h - 0.05, rot: rand(`${x}r${z}`) * 6.3, scale: 0.7 });
      else if (chance(`${x}f${z}`, vnoise(x * 0.18 + 40, z * 0.18) > 0.55 ? 0.6 : 0.07)) tree(jx, jz, `${x}t${z}`, h - 0.02);
    }
  }

  return { roads, buildings, pads, signals, labels, lanes, signs, hall, venue: ctx.arrivals, rail: ctx.rail, boards, homes: homeList, grid, island, built, water,
           smoke, haze, bulbs, center: [(grid[0] + grid[1]) / 2, (grid[2] + grid[3]) / 2] };
}

// A block cut off from the rest (someone housed out past an empty stretch) gets joined back up: the fewest blocks
// between it and the city are added, so they fill with shops and their streets link it in. Corners touching count.
function joinUp(used) {
  const parse = (k) => k.split(",").map(Number);
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]], N8 = [...N4, [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const reach = (from) => {
    const seen = new Set([from]), q = [from];
    while (q.length) {
      const [b, c] = parse(q.pop());
      for (const [db, dc] of N8) {
        const n = `${b + db},${c + dc}`;
        if (used.has(n) && !seen.has(n)) seen.add(n) && q.push(n);
      }
    }
    return seen;
  };
  let city = reach("0,0");
  for (const k of [...used]) {
    if (city.has(k)) continue;
    const part = reach(k), prev = new Map([...part].map((p) => [p, null])), q = [...part];
    let hit = null;
    for (let i = 0; i < q.length && !hit; i++) {
      const [b, c] = parse(q[i]);
      for (const [db, dc] of N4) {
        const n = `${b + db},${c + dc}`;
        if (prev.has(n)) continue;
        prev.set(n, q[i]);
        if (city.has(n)) {
          hit = n;
          break;
        }
        q.push(n);
      }
    }
    for (let p = prev.get(hit); p && !part.has(p); p = prev.get(p)) used.add(p);
    city = reach("0,0");
  }
}

function placeCore(core, b, c, mid, { buildings, pads, signs }, tree) {
  const rot = c ? (c > 0 ? Math.PI : 0) : b > 0 ? -Math.PI / 2 : Math.PI / 2;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const at = (dx, dz) => [mid[0] + dx * cos + dz * sin, mid[1] - dx * sin + dz * cos];
  pads.push({ x: mid[0], z: mid[1], w: BIG_W, d: BIG_W, color: core.pad || PLAZA });
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
