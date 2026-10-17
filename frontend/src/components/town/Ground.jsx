import { memo } from "react";
import { P, pts, blockPlots } from "@/lib/iso";

const DEPTH = 30;

const Side = ({ d, fill }) => <polygon points={pts(d)} fill={fill} stroke="#111" strokeWidth={4} strokeLinejoin="round" />;

export const Ground = memo(function Ground({ blocks }) {
  const set = new Set(blocks.map((b) => b.join(",")));
  const sorted = [...blocks].sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  return (
    <g data-testid="town-ground">
      {sorted.map(([bx, by]) => {
        const [x0, x1, y0, y1] = [3 * bx, 3 * bx + 3, 3 * by, 3 * by + 3];
        return (
          <g key={`s${bx},${by}`}>
            {!set.has(`${bx + 1},${by}`) && <Side d={[P(x1, y1), P(x1, y0), P(x1, y0, -DEPTH), P(x1, y1, -DEPTH)]} fill="#A0673A" />}
            {!set.has(`${bx},${by + 1}`) && <Side d={[P(x0, y1), P(x1, y1), P(x1, y1, -DEPTH), P(x0, y1, -DEPTH)]} fill="#8A5530" />}
          </g>
        );
      })}
      {sorted.map(([bx, by]) => {
        const [x0, x1, y0, y1] = [3 * bx, 3 * bx + 3, 3 * by, 3 * by + 3];
        return (
          <g key={`t${bx},${by}`}>
            <polygon points={pts([P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)])} fill="#9A9CA3" stroke="#9A9CA3" strokeWidth={1.5} />
            {blockPlots(bx, by).map(([i, j]) => (
              <polygon key={`${i},${j}`} points={pts([P(i + 0.05, j + 0.05), P(i + 0.95, j + 0.05), P(i + 0.95, j + 0.95), P(i + 0.05, j + 0.95)])} fill="#7CC242" stroke="#5FA334" strokeWidth={2} />
            ))}
            <line x1={P(x0 + 2.5, y0 + 0.15)[0]} y1={P(x0 + 2.5, y0 + 0.15)[1]} x2={P(x0 + 2.5, y0 + 1.85)[0]} y2={P(x0 + 2.5, y0 + 1.85)[1]} stroke="#FFE45C" strokeWidth={3} strokeDasharray="10 10" />
            <line x1={P(x0 + 0.15, y0 + 2.5)[0]} y1={P(x0 + 0.15, y0 + 2.5)[1]} x2={P(x0 + 1.85, y0 + 2.5)[0]} y2={P(x0 + 1.85, y0 + 2.5)[1]} stroke="#FFE45C" strokeWidth={3} strokeDasharray="10 10" />
          </g>
        );
      })}
    </g>
  );
});

export const Tree = memo(function Tree({ i, j }) {
  const [x, y] = P(i + 0.5, j + 0.5);
  return (
    <g aria-hidden="true">
      <line x1={x} y1={y} x2={x} y2={y - 26} stroke="#111" strokeWidth={7} strokeLinecap="round" />
      <line x1={x} y1={y} x2={x} y2={y - 26} stroke="#8B5E3C" strokeWidth={3} strokeLinecap="round" />
      <circle cx={x} cy={y - 40} r={20} fill="#4BAA6F" stroke="#111" strokeWidth={3.5} />
      <circle cx={x - 6} cy={y - 46} r={6} fill="#7FD49B" />
    </g>
  );
});
