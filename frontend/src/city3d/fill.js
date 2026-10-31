// What fills the city between the homes: Millionaires' Row, the Financial District and the public buildings downtown,
// plazas round the billboards, shops on empty lots, building sites on lots whose owner is still on the Docks, the
// landmarks on the outskirts, the industrial yard that keeps the Docks apart, and the grime of the Docks themselves.
import { modernModel } from "@/city3d/modern";
import { chance, pick, rand } from "@/city3d/rng";
import { pointAt, railLoop } from "@/city3d/rail";

const PLAZA = "#E7E2D6";
const PAVING = "#F1EDE4";
const LAWN = "#9ED47F";
const CINDER = "#77736A";
const MUD = "#4A4238";
const OIL = ["#3A3631", "#2F2C28", "#4E4A43"];
const CONCRETE = "#C9C3B7";

// Millionaires' Row: the three front plots of downtown, best ranks nearest the camera. #1 and #2 get grand estates.
export const ROW = { "1,2": [1, 2], "2,1": [3, 4, 5, 6], "-1,2": [7, 8, 9, 10] };
const ESTATES = [[1.25, 0], [-1.25, 0]];
const VILLAS = [[1.2, 1.2], [-1.2, 1.2], [1.2, -1.2], [-1.2, -1.2]];
const TRIM = { 1: "#D4A72C", 2: "#CBD5E1" };
const ROW_MARK = { kind: "place", id: "row" };

export function addRow(ctx, key, mid) {
  const ranks = ROW[key], rot = key === "2,1" ? Math.PI / 2 : 0, grand = ranks[0] === 1;
  const model = grand ? "estate" : "villa", size = grand ? 2.3 : 2.15, kit = modernModel(`modern/${model}`);
  const top = (kit.height * size) / kit.footprint;
  ctx.pads.push({ x: mid[0], z: mid[1], w: ctx.span, d: ctx.span, color: LAWN });
  ranks.forEach((rank, i) => {
    const [dx, dz] = (grand ? ESTATES : VILLAS)[i], x = mid[0] + dx, z = mid[1] + dz, r = ctx.holders.get(rank);
    if (!r) {
      const sign = ctx.before ? ["HANDOVER MONDAY", "#1E3A8A", "#FDE68A"] : ["FOR SALE", "#B91C1C", "#FFFFFF"];
      ctx.buildings.push({ model: `modern/${model}`, x, z, rot, size, tint: "#94A3B8", dark: true, sign, mark: ROW_MARK });
      return;
    }
    const tint = TRIM[rank] || ctx.colorOf(r) || "#1E3A8A", item = { x, z, rot, owner: r, mansion: rank };
    ctx.buildings.push({ ...item, model: `modern/${model}`, size, tint, face: r.a, faceSize: grand ? 0.46 : 0.38 });
    ctx.homeList.push({ ...item, y: 0, top: top + 0.02, color: tint, stack: [r], level: 0, stories: r.f });
    const gold = rank === 1;
    ctx.signs.push({ text: [`#${rank} THIS WEEK`, gold ? "#D4A72C" : "#0F172A", gold ? "#0F172A" : "#FDE68A"],
                     x: x + size * 0.42, z: z + size * 0.42, height: 0.15, lift: 0.5 });
  });
  const trees = grand ? [[0, 2.3], [-2.3, 2.3], [2.3, -2.3], [-2.3, -2.3]] : [[0, 2.3], [2.3, 0], [0, -2.3], [-2.3, 0]];
  for (const [dx, dz] of trees) ctx.tree(mid[0] + dx, mid[1] + dz, `${key}row${dx}${dz}`);
  if (grand) ctx.labels.push({ kind: "place", id: "row", pos: [mid[0], 2.3, mid[1]], text: "💎 Millionaires' Row" });
}

// The Financial District: office towers, the tallest in town, at the back of downtown so the skyline frames it.
const TOWERS = [["office0", "#0EA5E9"], ["office1", "#334155"], ["office2", "#0F766E"], ["office1", "#1E3A8A"], ["office0", "#0369A1"],
                ["office2", "#475569"]];
const FINANCE = { kind: "civic", id: "finance", name: "Financial District" };

export function addOffices(ctx, key, mid, n) {
  ctx.pads.push({ x: mid[0], z: mid[1], w: ctx.span, d: ctx.span, color: PLAZA });
  [[-1.15, -1.15, 1.15], [1.2, -1.1, 0.95], [-1.1, 1.2, 0.9], [1.2, 1.2, 0.75]].forEach(([dx, dz, tall], i) => {
    const [model, tint] = TOWERS[(i + n * 3) % TOWERS.length];
    ctx.buildings.push({ model: `modern/${model}`, x: mid[0] + dx, z: mid[1] + dz, rot: 0, size: 1.3, tint, stretch: tall, mark: FINANCE });
  });
  for (const [dx, dz] of [[0, -2.2], [-2.2, 0], [0, 0.05]]) ctx.tree(mid[0] + dx, mid[1] + dz, `${key}fin${dx}${dz}`);
  for (const [dx, dz] of [[0.05, 1.6], [1.6, 0.05]]) ctx.buildings.push({ model: "modern/bench", x: mid[0] + dx, z: mid[1] + dz, rot: dx ? Math.PI / 2 : 0 });
}

// Public buildings on the west side of downtown, two to a plot, facing City Hall.
const PUBLIC = {
  "-2,-1": [["library", "LIBRARY", "#1E3A8A", "#FDE68A", "#1E3A8A", "Library"], ["museum", "MUSEUM", "#F5F2EC", "#7C2D12", "#B45309", "Museum"]],
  "-2,1": [["cinema", "CINEMA", "#111827", "#FACC15", "#DC2626", "Cinema"], ["hotel", "GRAND HOTEL", "#7C2D12", "#FDE68A", "#B45309", "Grand Hotel"]],
};
export const isPublic = (key) => Boolean(PUBLIC[key]);

export function addPublic(ctx, key, mid) {
  ctx.pads.push({ x: mid[0], z: mid[1], w: ctx.span, d: ctx.span, color: PLAZA });
  PUBLIC[key].forEach(([model, label, bg, fg, tint, name], i) => {
    ctx.buildings.push({ model: `modern/${model}`, x: mid[0] + 0.25, z: mid[1] + (i ? 1.25 : -1.25), rot: Math.PI / 2, size: 2.3, tint,
                         sign: [label, bg, fg], mark: { kind: "civic", id: model, name } });
  });
  for (const dz of [-2.1, 0, 2.1]) ctx.tree(mid[0] - 1.95, mid[1] + dz, `${key}pub${dz}`);
  for (const dz of [-0.6, 0.6]) ctx.buildings.push({ model: "modern/lamp", x: mid[0] + 1.9, z: mid[1] + dz, rot: 0 });
  ctx.buildings.push({ model: "modern/flowerbed", x: mid[0] + 1.75, z: mid[1], rot: Math.PI / 2 });
}

// A billboard plot: paving, food trucks and kiosks round the base, a fountain when the board is off.
const STALLS = [["foodtruck", 1.45, 2.05, 0], ["kiosk", 2.05, 1.2, Math.PI / 2], ["kiosk", -2.05, -1.2, -Math.PI / 2],
                ["foodtruck", -1.45, -2.05, Math.PI], ["bench", 2.1, -0.2, Math.PI / 2], ["bench", -0.2, 2.1, 0], ["lamp", 1.75, 1.75, 0],
                ["lamp", -1.75, -1.75, 0], ["planter", 0.6, 2.15, 0], ["planter", -2.15, -0.6, Math.PI / 2]];
const STALL_TINTS = ["#F97316", "#EF4444", "#22C55E", "#FACC15", "#3B82F6"];

export function addPlaza(ctx, key, mid, board) {
  ctx.pads.push({ x: mid[0], z: mid[1], w: ctx.span, d: ctx.span, color: PAVING });
  ctx.pads.push({ x: mid[0], z: mid[1], w: 2.6, d: 2.6, y: 0.016, color: PLAZA });
  STALLS.forEach(([model, dx, dz, rot], i) => ctx.buildings.push({ model: `modern/${model}`, x: mid[0] + dx, z: mid[1] + dz, rot,
                                                                     tint: pick(STALL_TINTS, `${key}${i}`) }));
  for (const [dx, dz] of [[2.1, -2.1], [-2.1, 2.1], [-2.2, -2.2], [2.2, 2.2]]) ctx.tree(mid[0] + dx, mid[1] + dz, `${key}plaza${dx}${dz}`);
  if (!board) ctx.buildings.push({ model: "modern/fountain", x: mid[0], z: mid[1], rot: 0, scale: 1.4 });
}

// Small neighbourhood buildings on empty lots. Each gives way as soon as someone is given the lot.
export const SHOPS = [
  { tint: "#16A34A", sign: ["CORNER SHOP", "#14532D", "#FDE68A"] },
  { tint: "#B45309", sign: ["CAFE", "#78350F", "#FEF3C7"] },
  { tint: "#059669", sign: ["✚ PHARMACY", "#FFFFFF", "#059669"] },
  { tint: "#DC2626", sign: ["GYM", "#111827", "#F87171"] },
  { tint: "#0284C7", sign: ["LAUNDROMAT", "#E0F2FE", "#075985"] },
];
const INFILL = [...SHOPS.map((s) => ({ ...s, model: "shop" })), { model: "playground" }, { model: "garden" }];

export function infill(ctx, lot, tx, tz, rot) {
  const it = pick(INFILL, `${lot}infill`);
  ctx.buildings.push({ model: `modern/${it.model}`, x: tx, z: tz, rot, size: 0.95, tint: it.tint, sign: it.sign });
}

// A lot waiting for its owner to win their way off the Docks: fenced, scaffolding up, their handle on the sign.
export function site(ctx, home, tx, tz, rot) {
  ctx.buildings.push({ model: "modern/site", x: tx, z: tz, rot, size: 0.95, owner: home, sign: [`@${home.h}`, "#FDE68A", "#1E293B"] });
}

// The industrial yard between the Docks and the city: warehouses, containers and pallets on cinder ground.
export function addYard(ctx, key, mid, t0, u0, E) {
  ctx.pads.push({ x: mid[0], z: mid[1], w: ctx.span, d: ctx.span, color: CINDER });
  for (let s = 0; s < 10; s++) {
    const k = `${key}oil${s}`, w = 0.4 + rand(k) * 0.9;
    ctx.pads.push({ x: t0 + rand(`${k}x`) * E, z: u0 + rand(`${k}z`) * E, w, d: w * 0.6, y: 0.014, color: pick(OIL, k) });
  }
  const flip = chance(key, 0.5) ? 1 : -1;
  ctx.buildings.push({ model: "modern/warehouse", x: mid[0] - 1.05 * flip, z: mid[1] - 0.9, rot: 0, scale: 1.6 });
  ctx.buildings.push({ model: "modern/warehouse", x: mid[0] + 1.1 * flip, z: mid[1] + 1.05, rot: Math.PI, scale: 1.4 });
  ctx.buildings.push({ model: "modern/containers", x: mid[0] + 1.5 * flip, z: mid[1] - 1.3, rot: 0, scale: 1.2 });
  ctx.buildings.push({ model: "modern/containers", x: mid[0] - 1.6 * flip, z: mid[1] + 1.4, rot: Math.PI / 2, scale: 1.1 });
  ctx.buildings.push({ model: "modern/pallets", x: mid[0] + 0.2, z: mid[1] + 0.1, rot: rand(`${key}p`) * 6.3, scale: 1.3 });
  ctx.buildings.push({ model: "cars/truck", x: mid[0] - 0.9 * flip, z: mid[1] + 0.4, rot: flip > 0 ? 0 : Math.PI, scale: 0.14 });
  ctx.haze.push({ x: mid[0], z: mid[1], w: ctx.span, d: ctx.span, y: 0.7 });
}

// The Docks: mud, burning barrels with smoke, bare bulbs on poles, haze, and a chain-link fence with a gate on the
// city side.
export function dockGrit(ctx, key, mid, t0, u0, E, first) {
  for (let s = 0; s < 5; s++) {
    const k = `${key}mud${s}`, w = 0.8 + rand(k) * 1.2;
    ctx.pads.push({ x: t0 + rand(`${k}x`) * E, z: u0 + rand(`${k}z`) * E, w, d: w * (0.5 + rand(`${k}d`) * 0.5), y: 0.013, color: MUD });
  }
  for (let s = 0; s < 3; s++) {
    const k = `${key}fire${s}`, along = 0.5 + Math.floor(rand(k) * E), [x, z] = s % 2 ? [t0 + 2, u0 + along] : [t0 + along, u0 + 2];
    ctx.buildings.push({ model: "modern/firebarrel", x, z, rot: 0, scale: 1.2 });
    ctx.smoke.push([x, 0.2, z]);
  }
  for (const [dx, dz] of [[-0.45, -0.45], [E + 0.45, -0.45], [-0.45, E + 0.45], [E + 0.45, E + 0.45], [E / 2, -0.45]]) {
    ctx.buildings.push({ model: "modern/bulbpole", x: t0 + dx, z: u0 + dz, rot: rand(`${key}${dx}${dz}`) * 6.3 > 3 ? 0 : Math.PI });
    ctx.bulbs.push([t0 + dx + (rand(`${key}${dx}${dz}`) * 6.3 > 3 ? 0.14 : -0.14), 0.44, u0 + dz]);
  }
  for (let i = 0; i <= E; i++) {
    const gate = first && i === Math.round(E / 2);
    if (gate) ctx.buildings.push({ model: "modern/gate", x: t0 + i, z: u0 + E + 0.48, rot: 0, sign: ["DOCKS", "#5F2E1B", "#FDE68A"] });
    else ctx.buildings.push({ model: "modern/chainlink", x: t0 + i, z: u0 + E + 0.48, rot: (rand(`${key}cl${i}`) - 0.5) * 0.08 });
  }
  ctx.haze.push({ x: mid[0], z: mid[1], w: ctx.span + 1, d: ctx.span + 1, y: 0.9 });
}

// Landmarks just outside the city's edge, moving outward as it grows: the stadium and the fair to the east, the
// university and the station to the west, the airport, where newcomers land at Arrivals, to the south. The stadium,
// the station and the airport each carry a billboard the admin fills.
const OUT = (name) => ({ kind: "civic", id: name.toLowerCase().replace(/\W+/g, "-"), name });

// One railway loop round the whole city: down the west side past Central Station, along the south below the airport,
// up the east beyond the stadium and the fair, and back along the open row between the city and the Docks yards.
// The train pulls up at the station platform; its lap and stop go to the scene as ctx.rail.
function addRailway(ctx, W, E, N, S, stationZ) {
  const loop = railLoop(W, E, N, S, 2), n = Math.round(loop.total), step = loop.total / n;
  for (let i = 0; i < n; i++) {
    const [x, z, rot] = pointAt(loop, (i + 0.5) * step);
    ctx.buildings.push({ model: "modern/track", x, z, rot, scale: step });
  }
  ctx.rail = { ...loop, stop: stationZ - (N + 2) + 1 };
}

export function addOutskirts(ctx, [x0, x1, z0, z1]) {
  const mz = Math.round((z0 + z1) / 2), mx = Math.round((x0 + x1) / 2), B = ctx.buildings, P = ctx.pads;
  const sx = x1 + 5, sz = mz - 3;
  P.push({ x: sx, z: sz, w: 6.2, d: 6.2, color: CONCRETE });
  B.push({ model: "modern/stadium", x: sx, z: sz, rot: 0, size: 5, tint: "#2563EB", sign: ["XFIELD STADIUM", "#1E3A8A", "#FFFFFF"], mark: OUT("Stadium") });
  ctx.addBoard("stadium", sx - 1.45, sz - 1.45, 1.1);
  const fx = x1 + 5, fz = mz + 5;
  P.push({ x: fx, z: fz, w: 6, d: 6, color: "#EAD9B5" });
  B.push({ model: "modern/ferris", x: fx - 0.9, z: fz - 0.8, rot: Math.PI / 4, size: 2.8, mark: OUT("Amusement Park") });
  B.push({ model: "modern/carousel", x: fx + 1.4, z: fz + 0.6, rot: 0, size: 1.6, tint: "#EC4899" });
  [["kiosk", 1.8, -1.6], ["foodtruck", -1.6, 1.9], ["kiosk", 0.2, 2.2], ["bench", 2.3, 2.2]].forEach(([m, dx, dz], i) =>
    B.push({ model: `modern/${m}`, x: fx + dx, z: fz + dz, rot: 0, tint: STALL_TINTS[i % STALL_TINTS.length] }));
  for (const [dx, dz] of [[-2.5, 2.5], [2.5, -2.6], [-2.6, -2.5]]) ctx.tree(fx + dx, fz + dz, `fair${dx}${dz}`);
  const ux = x0 - 5, uz = mz + 4;
  P.push({ x: ux, z: uz, w: 6.4, d: 6.4, color: LAWN });
  B.push({ model: "modern/college", x: ux + 0.2, z: uz - 0.6, rot: Math.PI / 2, size: 3.4, tint: "#7C2D12",
           sign: ["XFIELD UNIVERSITY", "#7C2D12", "#FDE68A"], mark: OUT("University") });
  B.push({ model: "modern/lab", x: ux - 1.7, z: uz + 2, rot: Math.PI / 2, size: 1.5, tint: "#7C2D12" });
  B.push({ model: "modern/college", x: ux + 1.6, z: uz + 2.1, rot: Math.PI / 2, size: 1.7, tint: "#7C2D12" });
  for (const [dx, dz] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 0.4], [2.6, 0.2], [0, 2.8]]) ctx.tree(ux + dx, uz + dz, `uni${dx}${dz}`);
  const tx = x0 - 5, tz = mz - 4, line = x0 - 8.5;
  P.push({ x: tx - 0.9, z: tz - 0.3, w: 5.2, d: 4.6, color: CONCRETE });
  B.push({ model: "modern/station", x: tx + 0.4, z: tz, rot: Math.PI / 2, size: 2.8, tint: "#B45309",
           sign: ["CENTRAL STATION", "#7C2D12", "#FFFFFF"], mark: OUT("Train Station") });
  ctx.addBoard("station", tx - 1.4, tz - 2.05, 0.9);
  P.push({ x: line + 0.75, z: tz, w: 0.5, d: 3.6, y: 0.03, color: "#D6D3D1" });
  addRailway(ctx, line, x1 + 9.5, ctx.railNorth, z1 + 9.5, tz);
  const az = z1 + 6.5;
  P.push({ x: mx, z: az, w: 18, d: 1.7, color: "#4B5563" });
  for (let i = -8; i <= 8; i += 2) P.push({ x: mx + i, z: az, w: 0.9, d: 0.08, y: 0.026, color: "#F8FAFC" });
  P.push({ x: mx + 3.5, z: az - 2.5, w: 11, d: 2.8, color: CONCRETE });
  B.push({ model: "modern/terminal", x: mx + 5.5, z: az - 2.6, rot: 0, size: 4, tint: "#0284C7", sign: ["XFIELD AIRPORT", "#0C4A6E", "#FFFFFF"],
           mark: OUT("Airport") });
  ctx.addBoard("airport", mx + 5.1, az - 4.5, 1);
  B.push({ model: "modern/plane", x: mx - 3, z: az, rot: 0, size: 1.6 });
  B.push({ model: "modern/plane", x: mx - 0.8, z: az - 2.3, rot: Math.PI / 2, size: 1.4 });
  ctx.arrivals = { x: mx + 1.75, z: az - 2.75 };
  ctx.labels.push({ kind: "place", id: "arrivals", pos: [mx + 1.75, 2.35, az - 2.75], text: "✈ Arrivals" });
}
