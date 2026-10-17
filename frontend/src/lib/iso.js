export const TW = 128;
export const TH = 64;
const WORLD = 72;
const PAD = 300;
export const WORLD_W = WORLD * 2 * TW + PAD * 2;
export const WORLD_H = WORLD * 2 * TH + PAD * 2 + 500;
const OX = WORLD * TW + PAD;
const OY = WORLD * TH + PAD + 500;

export const P = (gx, gy, up = 0) => [OX + ((gx - gy) * TW) / 2, OY + ((gx + gy) * TH) / 2 - up];
export const pts = (arr) => arr.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
export const blockPlots = (bx, by) => [[3 * bx, 3 * by], [3 * bx + 1, 3 * by], [3 * bx, 3 * by + 1], [3 * bx + 1, 3 * by + 1]];

export const djb2 = (s) => {
  let h = 5381;
  for (const c of s) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  return h;
};

const WALLS = ["#F7A8B8", "#9FE1B4", "#FFE27A", "#B9A7F5", "#9BD7FF", "#FFB97A"];
const ROOFS = ["#8B5E3C", "#E2553F", "#5B7BD6", "#4BAA6F", "#7C4A8C"];
const HEIGHTS = [30, 48, 96, 176];
const ROOF_H = [26, 30];
export const TIER_NAMES = ["Cottage", "House", "Apartments", "Tower"];

export const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
};

const face = (side, x0, x1, y0, y1) =>
  side === "left" ? (u, v) => P(x0 + u * (x1 - x0), y1, v) : (u, v) => P(x1, y1 - u * (y1 - y0), v);
const quad = (f, u0, u1, v0, v1) => [f(u0, v0), f(u1, v0), f(u1, v1), f(u0, v1)];

export function building(i, j, tier, key, reserved) {
  const half = tier <= 1 ? 0.3 : 0.36;
  const cx = i + 0.5;
  const cy = j + 0.5;
  const [x0, x1, y0, y1] = [cx - half, cx + half, cy - half, cy + half];
  const H = HEIGHTS[tier];
  const wall = reserved ? "#F3EBDD" : WALLS[djb2(key) % WALLS.length];
  const roof = reserved ? "#D6C8B2" : ROOFS[djb2(key + "r") % ROOFS.length];
  const T = [x0, y0], R = [x1, y0], B = [x1, y1], L = [x0, y1];
  const g = (p, v = 0) => P(p[0], p[1], v);
  const polys = [
    { d: [g(L), g(B), g(B, H), g(L, H)], fill: shade(wall, 0.82) },
    { d: [g(B), g(R), g(R, H), g(B, H)], fill: wall },
  ];
  const details = [];
  const lines = [];
  let top = H;
  const lf = face("left", x0, x1, y0, y1);
  const rf = face("right", x0, x1, y0, y1);
  if (tier <= 1) {
    const rh = ROOF_H[tier];
    const ym = (y0 + y1) / 2;
    const r0 = P(x0, ym, H + rh);
    const r1 = P(x1, ym, H + rh);
    polys.push({ d: [g(T, H), g(R, H), r1, r0], fill: shade(roof, 0.78) });
    polys.push({ d: [g(B, H), g(R, H), r1], fill: wall });
    polys.push({ d: [g(L, H), g(B, H), r1, r0], fill: roof });
    top = H + rh;
    if (!reserved) {
      details.push({ d: quad(rf, 0.38, 0.62, 0, H * 0.62), fill: "#7A4A2A" });
      details.push({ d: quad(lf, 0.28, 0.72, H * 0.36, H * 0.8), fill: "#BEE6FF" });
    }
  } else {
    polys.push({ d: [g(T, H), g(R, H), g(B, H), g(L, H)], fill: shade(wall, 1.12) });
    const rows = tier === 2 ? 3 : 6;
    for (const f of [lf, rf]) {
      for (let r = 0; r < rows; r++) {
        const v0 = H * (0.12 + (r * 0.82) / rows);
        const v1 = v0 + (H * 0.5) / rows;
        details.push({ d: quad(f, 0.15, 0.4, v0, v1), fill: "#BEE6FF" });
        details.push({ d: quad(f, 0.6, 0.85, v0, v1), fill: "#BEE6FF" });
      }
    }
    if (tier === 3) {
      const c = P(cx, cy, H);
      lines.push({ a: c, b: [c[0], c[1] - 28], w: 4 });
      top = H + 28;
    }
  }
  if (reserved) {
    for (const p of [L, B, R]) lines.push({ a: g(p), b: g(p, top + 8), w: 5, wood: true });
    for (const v of [H * 0.35, H * 0.78]) {
      lines.push({ a: g(L, v), b: g(B, v), w: 4, wood: true });
      lines.push({ a: g(B, v), b: g(R, v), w: 4, wood: true });
    }
  }
  return { polys, details, lines, top: P(cx, cy, top), antenna: tier === 3 ? P(cx, cy, top) : null };
}
