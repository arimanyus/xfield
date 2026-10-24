import { memo, useMemo } from "react";
import { P, landmark, pts } from "@/lib/iso";

const NAME_SIZE = [72, 40, 26];

const Label = ({ x, y, text, size, sub, color, onClick, testId }) => {
  const w = text.length * size * 0.62 + size * 1.4;
  return (
    <g transform={`translate(${x} ${y})`} style={{ pointerEvents: onClick ? "auto" : "none" }} cursor={onClick ? "pointer" : undefined}
      onClick={(e) => { e.stopPropagation(); onClick?.(); }} data-testid={testId}>
      <rect x={-w / 2} y={-size} width={w} height={size * 2} rx={size * 0.4} fill={color} stroke="#0F172A" strokeWidth={Math.max(2.5, size / 12)} />
      <text textAnchor="middle" dominantBaseline="central" y={2} fontFamily="Space Grotesk" fontWeight="700" fontSize={size} fill="#0F172A">{text}</text>
      {sub && (
        <text textAnchor="middle" y={size * 1.9} fontFamily="Inter" fontWeight="700" fontSize={size * 0.6} fill="#0F172A" stroke="#fff" strokeWidth={size / 7} paintOrder="stroke">
          {sub}
        </text>
      )}
    </g>
  );
};

export const Landmark = memo(function Landmark({ bx, by, kind, color, onClick, testId }) {
  const geo = useMemo(() => landmark(bx, by, kind), [bx, by, kind]);
  const [fx, fy] = geo.flag;
  return (
    <g onClick={(e) => { e.stopPropagation(); onClick?.(); }} cursor={onClick ? "pointer" : undefined} data-testid={testId}>
      {geo.polys.map((p, i) => <polygon key={i} points={pts(p.d)} fill={p.fill} stroke="#0F172A" strokeWidth={2} strokeLinejoin="round" />)}
      {color && (
        <>
          <line x1={fx} y1={fy} x2={fx} y2={fy - 56} stroke="#0F172A" strokeWidth={3} />
          <polygon points={pts([[fx, fy - 56], [fx + 34, fy - 47], [fx, fy - 38]])} fill={color} stroke="#0F172A" strokeWidth={2} strokeLinejoin="round" />
        </>
      )}
    </g>
  );
});

export const LandmarkLabel = memo(function LandmarkLabel({ bx, by, name, sub, level, color, onClick }) {
  const [x, yb] = P(3 * bx + 2, 3 * by + 2);
  const size = NAME_SIZE[level];
  return <Label x={x} y={yb + size * 0.9} text={name.toUpperCase()} size={size} sub={level > 0 ? sub : null} color={color} onClick={onClick} testId={`landmark-label-${bx}-${by}`} />;
});
