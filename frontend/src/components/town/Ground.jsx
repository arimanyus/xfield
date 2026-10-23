import { memo } from "react";
import { P, lotPad, pts } from "@/lib/iso";

const DEPTH = 34;

const Side = ({ d, fill }) => <polygon points={pts(d)} fill={fill} stroke="#0F172A" strokeWidth={2.5} strokeLinejoin="round" />;

const Dash = ({ a, b }) => <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#F8FAFC" strokeWidth={3} strokeDasharray="14 14" />;

export const Ground = memo(function Ground({ lots, tints }) {
  const set = new Set(lots.map((b) => b.join(",")));
  const sorted = [...lots].sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  return (
    <g data-testid="town-ground">
      {sorted.map(([lx, ly]) => {
        const [x0, x1, y0, y1] = [3 * lx, 3 * lx + 3, 3 * ly, 3 * ly + 3];
        return (
          <g key={`s${lx},${ly}`}>
            {!set.has(`${lx + 1},${ly}`) && <Side d={[P(x1, y1), P(x1, y0), P(x1, y0, -DEPTH), P(x1, y1, -DEPTH)]} fill="#8B6F4E" />}
            {!set.has(`${lx},${ly + 1}`) && <Side d={[P(x0, y1), P(x1, y1), P(x1, y1, -DEPTH), P(x0, y1, -DEPTH)]} fill="#735A3E" />}
          </g>
        );
      })}
      {sorted.map(([lx, ly]) => {
        const [x0, x1, y0, y1] = [3 * lx, 3 * lx + 3, 3 * ly, 3 * ly + 3];
        const tint = tints[`${lx},${ly}`];
        return (
          <g key={`t${lx},${ly}`}>
            <polygon points={pts([P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)])} fill="#7B828C" stroke="#7B828C" strokeWidth={1.5} />
            <polygon points={pts(lotPad(lx, ly))} fill="#86C36A" stroke="#6FAA55" strokeWidth={2} />
            {tint && <polygon points={pts(lotPad(lx, ly))} fill={tint} fillOpacity={0.28} stroke={tint} strokeWidth={5} />}
            <Dash a={P(x0 + 2.5, y0 + 0.2)} b={P(x0 + 2.5, y0 + 1.8)} />
            <Dash a={P(x0 + 0.2, y0 + 2.5)} b={P(x0 + 1.8, y0 + 2.5)} />
          </g>
        );
      })}
    </g>
  );
});

export const Tree = memo(function Tree({ tx, ty }) {
  const [x, y] = P(tx, ty);
  return (
    <g aria-hidden="true">
      <line x1={x} y1={y} x2={x} y2={y - 30} stroke="#5B4632" strokeWidth={5} strokeLinecap="round" />
      <polygon points={pts([[x, y - 78], [x + 22, y - 26], [x - 22, y - 26]])} fill="#3F8F5A" stroke="#0F172A" strokeWidth={2} strokeLinejoin="round" />
    </g>
  );
});

export const Highway = ({ a, b }) => {
  const [ax, ay] = P(3 * a.bx + 1, 3 * a.by + 1);
  const [bx, by] = P(3 * b.bx + 1, 3 * b.by + 1);
  return (
    <g aria-hidden="true">
      <line x1={ax} y1={ay} x2={bx} y2={by} stroke="#0F172A" strokeWidth={26} strokeLinecap="round" />
      <line x1={ax} y1={ay} x2={bx} y2={by} stroke="#4B5563" strokeWidth={20} strokeLinecap="round" />
      <line x1={ax} y1={ay} x2={bx} y2={by} stroke="#FBBF24" strokeWidth={3} strokeDasharray="18 16" />
    </g>
  );
};
