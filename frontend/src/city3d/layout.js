// Turns town data into a 3D city. Lots sit in 4x4 blocks between roads. The middle 3x3 blocks are the civic core:
// the mayor's house on a square, with the city's essentials around it. Districts own whole blocks further out,
// every home grows one story per person living in it, and roads only run where something is built.
const BLOCK = 4;
const MARGIN = 12;
export const WATER = -0.08;

const mod = (a, n) => ((a % n) + n) % n;
export const tileOf = (v) => v + Math.floor(v / BLOCK);
const isRoad = (t) => mod(t, BLOCK + 1) === BLOCK;
const blockOf = (v) => Math.floor(v / BLOCK);
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

const kit = (k, names) => names.map((n) => `${k}/${n}`);
const house = (letters) => kit("suburban", letters.split("").map((c) => `building-type-${c}`));
const STORY_MODELS = [
  house("mghi"),
  house("acefjopqstu"),
  house("klr"),
  kit("commercial", ["building-a", "building-b", "building-d", "building-h"]),
  kit("commercial", ["building-f", "building-g", "building-l"]),
  kit("commercial", ["building-m", "building-skyscraper-a"]),
  kit("commercial", ["building-skyscraper-c", "building-skyscraper-e", "building-skyscraper-b"]),
  kit("commercial", ["building-skyscraper-d"]),
];
const TREES = ["suburban/tree-large", "suburban/tree-small"];
export const MAYOR_HOUSE = "suburban/building-type-b";

export const LANDMARK_MODEL = {
  tech_campus: "commercial/building-k",
  stock_exchange: "commercial/building-j",
  power_grid: "industrial/windmill",
  central_station: "commercial/building-e",
  broadcast_tower: "industrial/water-tower",
  university: "commercial/building-n",
  stadium: "industrial/building-s",
  harbor: "industrial/building-r",
};

export const modelForStories = (n, key) => pick(STORY_MODELS[n <= 6 ? n - 1 : n <= 8 ? 6 : 7], key);

export const GRASS = "#7DB563";
const DIRT = "#B89B72";
const PLAZA = "#E7E2D6";
const SQUARE = "#F3EFE6";
const PARK = "#6FAF55";
const STONE = "#A8A29E";

// The ring around the mayor's square. Each is a workplace; parts are [model, dx, dz, scale, tint] in the
// building's own frame, where +z faces the square.
export const CORE = {
  "0,-1": { id: "park", name: "Central Park", job: "Gardener", color: "#16A34A", pad: PARK, y: 1.1, parts: [] },
  "1,-1": { id: "hospital", name: "Hospital", job: "Nurse", color: "#E11D48", y: 3.1, cross: 2.75, parts: [
    ["commercial/building-n", 0, -0.35, 1, "#F8FAFC"], ["cars/ambulance", 1.15, 1.2, 0.14], ["cars/ambulance", 0.7, 1.2, 0.14]] },
  "1,0": { id: "market", name: "Market", job: "Shopkeeper", color: "#059669", y: 1.7, parts: [
    ["commercial/building-c", -1.05, -0.5, 1], ["commercial/building-h", 0, -0.5, 1], ["commercial/building-d", 1.05, -0.5, 1],
    ["commercial/detail-parasol-a", -0.8, 0.8, 0.9], ["commercial/detail-parasol-b", 0, 1, 0.9], ["commercial/detail-parasol-a", 0.8, 0.8, 0.9]] },
  "1,1": { id: "school", name: "School", job: "Teacher", color: "#D97706", y: 1.9, parts: [
    ["commercial/building-e", 0, -0.5, 1.5, "#FDE68A"], ["suburban/fence-1x4", -0.6, 1.4, 1], ["suburban/fence-1x4", 0.6, 1.4, 1]] },
  "0,1": { id: "bank", name: "Bank", job: "Banker", color: "#0284C7", y: 2.3, parts: [
    ["commercial/building-j", 0, -0.3, 1.1, "#E0F2FE"], ["suburban/planter", -1.1, 1.2, 1], ["suburban/planter", 1.1, 1.2, 1]] },
  "-1,1": { id: "police", name: "Police", job: "Officer", color: "#1D4ED8", y: 2.2, parts: [
    ["commercial/building-b", 0, -0.4, 1.3, "#1D4ED8"], ["cars/police", -0.7, 1.15, 0.14], ["cars/police", 0.7, 1.15, 0.14]] },
  "-1,0": { id: "fire", name: "Fire Station", job: "Firefighter", color: "#DC2626", y: 2.2, parts: [
    ["commercial/building-a", 0, -0.4, 1.3, "#DC2626"], ["cars/garbage-truck", -0.45, 1.15, 0.14, "#DC2626"],
    ["cars/garbage-truck", 0.45, 1.15, 0.14, "#DC2626"]] },
  "-1,-1": { id: "power", name: "Power & Water", job: "Engineer", color: "#7C3AED", y: 2.6, parts: [
    ["industrial/windmill", -0.9, -0.9, 0.8], ["industrial/windmill", 0.9, -0.9, 0.8], ["industrial/water-tower", 0, 0.2, 0.7],
    ["industrial/solar-panel-landscape-group", -0.9, 1, 0.9], ["industrial/solar-panel-landscape-group", 0.9, 1, 0.9]] },
};
const CORE_KEYS = ["0,0", ...Object.keys(CORE)];

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

// Flat wherever the city is built, rolling hills and a ragged coast everywhere else, with a lake and a river
// cut into the countryside. Water never reaches a road.
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
  const nbs = town.neighbourhoods || [];
  const nbById = Object.fromEntries(nbs.map((n) => [n.id, n]));
  const homes = new Map();
  for (const r of town.residents) {
    const key = `${r.x},${r.y}`;
    if (!homes.has(key)) homes.set(key, { x: r.x, y: r.y, people: [] });
    homes.get(key).people.push(r);
  }
  const owner = new Map();
  for (const n of nbs) for (const [bx, by] of n.blocks || []) owner.set(`${bx},${by}`, n);
  const used = new Set([...CORE_KEYS, ...owner.keys()]);
  for (const h of homes.values()) used.add(`${blockOf(h.x)},${blockOf(h.y)}`);
  const blocks = [...used].map((k) => k.split(",").map(Number));
  const [b0, b1] = [Math.min(...blocks.map((b) => b[0])), Math.max(...blocks.map((b) => b[0]))];
  const [c0, c1] = [Math.min(...blocks.map((b) => b[1])), Math.max(...blocks.map((b) => b[1]))];
  const grid = [firstTile(b0) - 1, firstTile(b1 + 1) - 1, firstTile(c0) - 1, firstTile(c1 + 1) - 1];
  const island = [grid[0] - MARGIN, grid[1] + MARGIN, grid[2] - MARGIN, grid[3] + MARGIN];
  const built = blocks.map(([b, c]) => [firstTile(b) - 1.5, firstTile(b) + BLOCK + 0.5, firstTile(c) - 1.5, firstTile(c) + BLOCK + 0.5]);
  const water = {
    lakes: [{ x: grid[1] + 5.5, z: grid[2] - 4, rx: 2.6, rz: 2 }, { x: grid[0] - 6.5, z: (grid[2] + grid[3]) / 2 + 2, rx: 3, rz: 2.2 }],
    river: { x: grid[1] + 5.5, z: grid[2] - 4 },
  };
  const shape = { built, island, water };

  const buildings = [], pads = [], labels = [], homeList = [], crosses = [];
  const faceRoad = (tx, tz) => (isRoad(tz + 1) ? 0 : isRoad(tz - 1) ? Math.PI : isRoad(tx + 1) ? Math.PI / 2 : -Math.PI / 2);
  const tree = (x, z, key, y = 0) => buildings.push({ model: pick(TREES, key), x, z, y, rot: 0, scale: 0.8 + rand(key + "s") * 0.5 });
  const marks = new Map(nbs.map((n) => [`${n.bx},${n.by}`, n]));

  for (const [b, c] of blocks) {
    const key = `${b},${c}`, t0 = firstTile(b), u0 = firstTile(c), mid = [t0 + 1.5, u0 + 1.5];
    if (key === "0,0") {
      const mayor = town.city?.mayor;
      pads.push({ x: mid[0], z: mid[1], w: 4, d: 4, color: SQUARE });
      buildings.push({ model: MAYOR_HOUSE, x: mid[0], z: mid[1] - 0.2, rot: 0, scale: 1.5, tint: "#52525B", mark: { kind: "city_hall", mayor } });
      for (const [dx, dz] of [[0, 0], [3, 0], [0, 3], [3, 3]]) tree(t0 + dx, u0 + dz, `hall${dx}${dz}`);
      for (const dx of [0.9, 2.1]) buildings.push({ model: "suburban/planter", x: t0 + dx, z: u0 + 3.1, rot: 0, scale: 1 });
      labels.push({ kind: "mayor", pos: [mid[0], 3.3, mid[1]], mayor, text: mayor ? `Mayor @${mayor.h}` : "City Hall · no mayor yet" });
      continue;
    }
    const core = CORE[key];
    if (core) {
      placeCore(core, b, c, mid, { buildings, pads, labels, crosses }, town.workers?.[core.id] || 0, tree);
      continue;
    }
    const nb = owner.get(key);
    if (nb) pads.push({ x: mid[0], z: mid[1], w: 4, d: 4, color: mix(nb.color, "#FFFFFF", 0.62) });
    for (let i = 0; i < BLOCK; i++) {
      for (let j = 0; j < BLOCK; j++) {
        const x = b * BLOCK + i, y = c * BLOCK + j, tx = t0 + i, tz = u0 + j, lot = `${x},${y}`;
        const mark = marks.get(lot);
        if (mark) {
          buildings.push({ model: LANDMARK_MODEL[mark.landmark] || LANDMARK_MODEL.harbor, x: tx, z: tz, rot: faceRoad(tx, tz), fit: 0.98, tint: mark.color, mark: { kind: "district", nb: mark } });
          labels.push({ kind: "district", pos: [tx, 1.7, tz], text: mark.name || "New district", color: mark.color, id: mark.id,
                        sub: `${mark.size} citizens${town.city?.boost?.id === mark.id ? " · ×1.5 rent" : ""}` });
          continue;
        }
        const home = homes.get(lot);
        if (!home) {
          if (chance(lot + "g", nb ? 0.35 : 0.5)) tree(tx + (rand(lot) - 0.5) * 0.4, tz + (rand(lot + "z") - 0.5) * 0.4, lot);
          continue;
        }
        const head = home.people[0], n = home.people.length, tint = nbById[head.nb]?.color;
        const item = { x: tx, z: tz, rot: faceRoad(tx, tz), owner: head, people: home.people, stories: n };
        homeList.push({ ...item, color: tint || STONE });
        if (n === 1 && head.s === "r") {
          pads.push({ x: tx, z: tz, w: 0.8, d: 0.8, y: 0.02, color: DIRT });
          buildings.push({ ...item, model: "roads/construction-fence", scale: 1 });
          buildings.push({ model: "roads/construction-cone", x: tx + 0.25, z: tz + 0.25, rot: 0, scale: 1.4 });
        } else buildings.push({ ...item, model: modelForStories(n, head.k), fit: 0.86, tint: tint || STONE });
      }
    }
  }

  const roadAt = (tx, tz) => {
    if (!isRoad(tx) && !isRoad(tz)) return false;
    const bs = isRoad(tx) ? [tileBlock(tx - 1), tileBlock(tx + 1)] : [tileBlock(tx)];
    const cs = isRoad(tz) ? [tileBlock(tz - 1), tileBlock(tz + 1)] : [tileBlock(tz)];
    return bs.some((b) => cs.some((c) => used.has(`${b},${c}`)));
  };
  const roads = [], signals = [], crossings = new Set();
  for (let tx = grid[0]; tx <= grid[1]; tx++) {
    for (let tz = grid[2]; tz <= grid[3]; tz++) {
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
      if (h > 0.7 && chance(`${x}w${z}`, 0.006)) buildings.push({ model: "industrial/windmill", x: jx, z: jz, y: h - 0.05, rot: rand(`${x}r${z}`) * 6.3, scale: 0.7 });
      else if (chance(`${x}f${z}`, vnoise(x * 0.18 + 40, z * 0.18) > 0.55 ? 0.6 : 0.07)) tree(jx, jz, `${x}t${z}`, h - 0.02);
    }
  }

  return { roads, buildings, pads, signals, labels, lanes, crosses, homes: homeList, grid, island, built, water,
           center: [(grid[0] + grid[1]) / 2, (grid[2] + grid[3]) / 2] };
}

function placeCore(core, b, c, mid, { buildings, pads, labels, crosses }, workers, tree) {
  const rot = c ? (c > 0 ? Math.PI : 0) : b > 0 ? -Math.PI / 2 : Math.PI / 2;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const at = (dx, dz) => [mid[0] + dx * cos + dz * sin, mid[1] - dx * sin + dz * cos];
  pads.push({ x: mid[0], z: mid[1], w: 4, d: 4, color: core.pad || PLAZA });
  const mark = { kind: "civic", id: core.id, name: core.name, job: core.job, color: core.color, workers };
  core.parts.forEach(([model, dx, dz, scale, tint], i) => {
    const [x, z] = at(dx, dz);
    buildings.push({ model, x, z, rot, scale, tint, mark: i === 0 ? mark : undefined });
  });
  if (core.id === "park") {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, r = 1.35 + rand(`park${i}`) * 0.3;
      tree(mid[0] + Math.cos(a) * r, mid[1] + Math.sin(a) * r, `park${i}`);
    }
    for (let k = -3; k <= 3; k++) {
      buildings.push({ model: "suburban/path-stones-long", x: mid[0] + k * 0.4, z: mid[1], rot: Math.PI / 2, scale: 1 });
      buildings.push({ model: "suburban/path-stones-long", x: mid[0], z: mid[1] + k * 0.4, rot: 0, scale: 1 });
    }
    buildings.push({ model: "commercial/detail-parasol-b", x: mid[0], z: mid[1], rot: 0, scale: 1.2, mark });
  } else {
    for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6]]) tree(...at(dx, dz), `${core.id}${dx}`);
  }
  if (core.cross) crosses.push([...at(0, -0.35), core.cross]);
  labels.push({ kind: "civic", pos: [mid[0], core.y, mid[1]], text: core.name, color: core.color, id: core.id,
                sub: workers ? `${workers} ${core.job.toLowerCase()}${workers === 1 ? "" : "s"}` : `Hiring ${core.job.toLowerCase()}s` });
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
