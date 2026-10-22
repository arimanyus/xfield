import { memo } from "react";
import { P, pts } from "@/lib/iso";

const DEPTH = 34;

const Side = ({ d, fill }) => <polygon points={pts(d)} fill={fill} stroke="#111" strokeWidth={4} strokeLinejoin="round" />;

const Dash = ({ a, b }) => <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#FFE45C" strokeWidth={4} strokeDasharray="14 14" />;

export const Ground = memo(function Ground({ lots }) {
  const set = new Set(lots.map((b) => b.join(",")));
  const sorted = [...lots].sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  return (
    <g data-testid="town-ground">
      {sorted.map(([lx, ly]) => {
        const [x0, x1, y0, y1] = [3 * lx, 3 * lx + 3, 3 * ly, 3 * ly + 3];
        return (
          <g key={`s${lx},${ly}`}>
            {!set.has(`${lx + 1},${ly}`) && <Side d={[P(x1, y1), P(x1, y0), P(x1, y0, -DEPTH), P(x1, y1, -DEPTH)]} fill="#A0673A" />}
            {!set.has(`${lx},${ly + 1}`) && <Side d={[P(x0, y1), P(x1, y1), P(x1, y1, -DEPTH), P(x0, y1, -DEPTH)]} fill="#8A5530" />}
          </g>
        );
      })}
      {sorted.map(([lx, ly]) => {
        const [x0, x1, y0, y1] = [3 * lx, 3 * lx + 3, 3 * ly, 3 * ly + 3];
        return (
          <g key={`t${lx},${ly}`}>
            <polygon points={pts([P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)])} fill="#9A9CA3" stroke="#9A9CA3" strokeWidth={1.5} />
            <polygon points={pts([P(x0 + 0.08, y0 + 0.08), P(x0 + 1.92, y0 + 0.08), P(x0 + 1.92, y0 + 1.92), P(x0 + 0.08, y0 + 1.92)])} fill="#7CC242" stroke="#5FA334" strokeWidth={3} />
            <Dash a={P(x0 + 2.5, y0 + 0.2)} b={P(x0 + 2.5, y0 + 1.8)} />
            <Dash a={P(x0 + 0.2, y0 + 2.5)} b={P(x0 + 1.8, y0 + 2.5)} />
          </g>
        );
      })}
    </g>
  );
});

export const Tree = memo(function Tree({ tx, ty, size = 1 }) {
  const [x, y] = P(tx, ty);
  const s = size;
  return (
    <g aria-hidden="true">
      <line x1={x} y1={y} x2={x} y2={y - 34 * s} stroke="#111" strokeWidth={9 * s} strokeLinecap="round" />
      <line x1={x} y1={y} x2={x} y2={y - 34 * s} stroke="#8B5E3C" strokeWidth={4 * s} strokeLinecap="round" />
      <circle cx={x} cy={y - 54 * s} r={27 * s} fill="#4BAA6F" stroke="#111" strokeWidth={4} />
      <circle cx={x - 8 * s} cy={y - 62 * s} r={8 * s} fill="#7FD49B" />
    </g>
  );
});
