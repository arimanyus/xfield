export const TW = 128;
export const TH = 64;
const WORLD = 72;
const PAD = 300;
export const WORLD_W = WORLD * 2 * TW + PAD * 2;
export const WORLD_H = WORLD * 2 * TH + PAD * 2 + 600;
const OX = WORLD * TW + PAD;
const OY = WORLD * TH + PAD + 600;
export const HOUSE_SCALE = 1.7;

export const P = (gx, gy, up = 0) => [OX + ((gx - gy) * TW) / 2, OY + ((gx + gy) * TH) / 2 - up];
export const pts = (arr) => arr.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
export const houseSpot = (x, y) => [3 * x + 0.85, 3 * y + 0.85];
export const lotPad = (x, y) => [P(3 * x + 0.08, 3 * y + 0.08), P(3 * x + 1.92, 3 * y + 0.08), P(3 * x + 1.92, 3 * y + 1.92), P(3 * x + 0.08, 3 * y + 1.92)];

export const djb2 = (s) => {
  let h = 5381;
  for (const c of s) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  return h;
};

const WALLS = ["#E8E2D6", "#D9C3A5", "#C98B6B", "#BFC7CF", "#E3D5B8", "#A8B5C2"];
const NEUTRAL_ROOF = "#8A94A3";
const GLASS = "#9CC7EA";
const LIT = "#FCE38A";
const FLOOR_H = 16;
export const TIER_NAMES = ["Cottage", "Rowhouse", "Mid-rise", "Tower"];

export const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
};

const face = (side, x0, x1, y0, y1) =>
  side === "left" ? (u, v) => P(x0 + u * (x1 - x0), y1, v) : (u, v) => P(x1, y1 - u * (y1 - y0), v);
const quad = (f, u0, u1, v0, v1) => [f(u0, v0), f(u1, v0), f(u1, v1), f(u0, v1)];

export function isoBox(x0, y0, x1, y1, z, h, fill) {
  const g = (x, y, v) => P(x, y, z + v);
  return [
    { d: [g(x0, y1, 0), g(x1, y1, 0), g(x1, y1, h), g(x0, y1, h)], fill: shade(fill, 0.82) },
    { d: [g(x1, y1, 0), g(x1, y0, 0), g(x1, y0, h), g(x1, y1, h)], fill },
    { d: [g(x0, y0, h), g(x1, y0, h), g(x1, y1, h), g(x0, y1, h)], fill: shade(fill, 1.1) },
  ];
}

export function building(cx, cy, floors, key, reserved, lit, color, k = HOUSE_SCALE) {
  const half = (floors <= 2 ? 0.3 : floors <= 5 ? 0.35 : 0.4) * k;
  const [x0, x1, y0, y1] = [cx - half, cx + half, cy - half, cy + half];
  const H = (20 + FLOOR_H * floors) * k;
  const wall = reserved ? "#EEF1F5" : WALLS[djb2(key) % WALLS.length];
  const roof = color || NEUTRAL_ROOF;
  const polys = isoBox(x0, y0, x1, y1, 0, H, wall).slice(0, 2);
  const details = [];
  const lines = [];
  const lf = face("left", x0, x1, y0, y1);
  const rf = face("right", x0, x1, y0, y1);
  let top = H;
  if (floors <= 2) {
    const rh = 24 * k;
    const ym = (y0 + y1) / 2;
    const T = [x0, y0], R = [x1, y0], B = [x1, y1], L = [x0, y1];
    const g = (p, v) => P(p[0], p[1], v);
    const r0 = P(x0, ym, H + rh);
    const r1 = P(x1, ym, H + rh);
    polys.push({ d: [g(T, H), g(R, H), r1, r0], fill: shade(roof, 0.78) });
    polys.push({ d: [g(B, H), g(R, H), r1], fill: wall });
    polys.push({ d: [g(L, H), g(B, H), r1, r0], fill: roof });
    top = H + rh;
  } else {
    polys.push(isoBox(x0, y0, x1, y1, 0, H, roof)[2]);
    for (const f of [lf, rf]) details.push({ d: quad(f, 0, 1, H - 7 * k, H), fill: roof });
  }
  if (!reserved) {
    const win = lit ? LIT : GLASS;
    for (const f of [lf, rf]) {
      for (let r = 0; r < floors; r++) {
        const v0 = (12 + r * FLOOR_H) * k;
        const v1 = v0 + FLOOR_H * 0.55 * k;
        details.push({ d: quad(f, 0.18, 0.42, v0, v1), fill: win });
        details.push({ d: quad(f, 0.58, 0.82, v0, v1), fill: win });
      }
    }
    if (floors >= 8) {
      const c = P(cx, cy, H);
      lines.push({ a: c, b: [c[0], c[1] - 46], w: 4 });
      top = H + 46;
    }
  } else {
    for (const p of [[x0, y1], [x1, y1], [x1, y0]]) lines.push({ a: P(...p), b: P(...p, top + 10), w: 5, wood: true });
    for (const v of [H * 0.35, H * 0.75]) {
      lines.push({ a: P(x0, y1, v), b: P(x1, y1, v), w: 4, wood: true });
      lines.push({ a: P(x1, y1, v), b: P(x1, y0, v), w: 4, wood: true });
    }
  }
  return { polys, details, lines, top: P(cx, cy, top), antenna: floors >= 8 && !reserved ? P(cx, cy, top) : null };
}

const BOXES = {
  city_hall: [[0.2, 0.2, 1.8, 1.8, 0, 50, "#E7E1D3"], [0.55, 0.55, 1.45, 1.45, 50, 44, "#E7E1D3"], [0.8, 0.8, 1.2, 1.2, 94, 26, "#D4A93C"]],
  stock_exchange: [[0.2, 0.3, 1.8, 1.7, 0, 72, "#EDE7DA"], [0.12, 0.22, 1.88, 1.78, 72, 12, "#C9C1B0"]],
  power_grid: [[0.2, 0.9, 1.0, 1.8, 0, 55, "#B8BEC6"], [1.1, 1.0, 1.8, 1.7, 0, 90, "#D3D8DE"], [1.2, 0.3, 1.55, 0.65, 0, 150, "#9AA3AD"], [1.2, 0.3, 1.55, 0.65, 150, 20, "#E5484D"]],
  tech_campus: [[0.2, 0.2, 1.2, 1.8, 0, 150, "#7FB3E8"], [1.3, 0.4, 1.8, 1.6, 0, 60, "#A9CDF2"]],
  central_station: [[0.15, 0.4, 1.85, 1.6, 0, 60, "#C9A27A"], [0.1, 0.35, 1.9, 1.65, 60, 14, "#8C6A4F"], [0.8, 0.8, 1.2, 1.2, 74, 70, "#C9A27A"]],
  university: [[0.2, 0.2, 1.8, 1.0, 0, 70, "#C46A4E"], [0.2, 1.1, 1.0, 1.8, 0, 70, "#C46A4E"], [1.2, 1.2, 1.6, 1.6, 0, 120, "#B85C42"]],
  stadium: [[0.4, 0.4, 1.6, 1.6, 0, 4, "#5FB04A"], [0.15, 0.15, 1.85, 0.4, 0, 40, "#D9DDE3"], [0.15, 0.4, 0.4, 1.6, 0, 40, "#D9DDE3"], [1.6, 0.4, 1.85, 1.6, 0, 40, "#D9DDE3"], [0.15, 1.6, 1.85, 1.85, 0, 40, "#D9DDE3"]],
  broadcast_tower: [[0.6, 0.6, 1.4, 1.4, 0, 40, "#E2E6EA"], [0.92, 0.92, 1.08, 1.08, 40, 210, "#E5484D"]],
  harbor: [[0.1, 0.1, 1.9, 1.9, 0, 2, "#3B82C4"], [0.2, 1.0, 1.3, 1.8, 0, 45, "#D98C4A"], [1.4, 0.3, 1.55, 0.45, 0, 150, "#F2B705"], [0.5, 0.3, 1.55, 0.45, 140, 10, "#F2B705"]],
};

export const LANDMARK_KINDS = Object.keys(BOXES);

export function landmark(bx, by, kind) {
  const boxes = (BOXES[kind] || BOXES.harbor).map(([u0, v0, u1, v1, z, h, fill]) => ({ u0, v0, u1, v1, z, h, fill }));
  boxes.sort((a, b) => a.u0 + a.v0 + a.u1 + a.v1 - (b.u0 + b.v0 + b.u1 + b.v1) || a.z - b.z);
  const ox = 3 * bx;
  const oy = 3 * by;
  const polys = boxes.flatMap((b) => isoBox(ox + b.u0, oy + b.v0, ox + b.u1, oy + b.v1, b.z, b.h, b.fill));
  const top = Math.max(...boxes.map((b) => b.z + b.h));
  return { polys, flag: P(ox + 1, oy + 1, top) };
}
