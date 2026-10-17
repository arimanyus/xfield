import { memo } from "react";
import { P, TW } from "@/lib/iso";
import META from "@/data/landmarkMeta.json";

const NAME_SIZE = [76, 40, 26];

const Label = ({ x, y, text, size, sub, onClick, testId }) => {
  const w = text.length * size * 0.62 + size * 1.4;
  return (
    <g transform={`translate(${x} ${y})`} style={{ pointerEvents: onClick ? "auto" : "none" }} cursor={onClick ? "pointer" : undefined}
      onClick={(e) => { e.stopPropagation(); onClick?.(); }} data-testid={testId}>
      <rect x={-w / 2} y={-size} width={w} height={size * 2} rx={size} fill="#FFD90F" stroke="#111" strokeWidth={Math.max(3, size / 9)} />
      <text textAnchor="middle" dominantBaseline="central" y={2} fontFamily="Luckiest Guy" fontSize={size} fill="#111">{text}</text>
      {sub && (
        <text textAnchor="middle" y={size * 1.9} fontFamily="Fredoka" fontWeight="700" fontSize={size * 0.6} fill="#111" stroke="#fff" strokeWidth={size / 7} paintOrder="stroke">
          {sub}
        </text>
      )}
    </g>
  );
};

export const Landmark = memo(function Landmark({ bx, by, kind, onClick, testId }) {
  const meta = META[kind] || META.lard_lad;
  const w = 2 * TW * 1.12;
  const h = (meta.h / meta.w) * w;
  const [x, yb] = P(3 * bx + 2, 3 * by + 2);
  return (
    <g onClick={(e) => { e.stopPropagation(); onClick?.(); }} cursor={onClick ? "pointer" : undefined} data-testid={testId}>
      <image href={`/art/landmarks/${kind}.webp`} x={x - w / 2} y={yb - h + 10} width={w} height={h} />
    </g>
  );
});

export const LandmarkLabel = memo(function LandmarkLabel({ bx, by, name, sub, level, onClick }) {
  const [x, yb] = P(3 * bx + 2, 3 * by + 2);
  const size = NAME_SIZE[level];
  return <Label x={x} y={yb + size * 0.9} text={name.toUpperCase()} size={size} sub={level > 0 ? sub : null} onClick={onClick} testId={`landmark-label-${bx}-${by}`} />;
});
