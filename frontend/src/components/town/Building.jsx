import { memo, useMemo } from "react";
import { building, houseSpot, pts } from "@/lib/iso";
import { smallAvatar } from "@/lib/api";

const LABEL = [0, 24, 18];

const Pill = ({ y, text, size, fill = "#FFFFFF" }) => {
  const w = text.length * size * 0.58 + size * 1.3;
  return (
    <g transform={`translate(0 ${y})`}>
      <rect x={-w / 2} y={-size * 0.9} width={w} height={size * 1.8} rx={size * 0.45} fill={fill} stroke="#0F172A" strokeWidth={2.5} />
      <text textAnchor="middle" dominantBaseline="central" y={1} fontFamily="Inter" fontWeight="700" fontSize={size} fill="#0F172A">{text}</text>
    </g>
  );
};

const Badge = ({ r, top, level, mine, color }) => {
  const ring = mine ? "#34D399" : color || (r.s === "r" ? "#F59E0B" : "#FFFFFF");
  const size = LABEL[level];
  return (
    <g transform={`translate(${top[0]} ${top[1] - 54})`}>
      <line x1={0} y1={30} x2={0} y2={54} stroke="#0F172A" strokeWidth={3} />
      <circle r={36} fill={ring} stroke="#0F172A" strokeWidth={3} />
      {r.a ? (
        <image href={smallAvatar(r.a)} x={-29} y={-29} width={58} height={58} clipPath="url(#avatar-clip)" preserveAspectRatio="xMidYMid slice" />
      ) : (
        <text textAnchor="middle" dominantBaseline="central" fontFamily="Space Grotesk" fontWeight="700" fontSize={30} fill="#0F172A">{r.h[0].toUpperCase()}</text>
      )}
      <circle r={29} fill="none" stroke="#0F172A" strokeWidth={2} />
      {level > 0 && <Pill y={-36 - size * 1.3} text={`@${r.h}`} size={size} fill={r.s === "r" ? "#FEF3C7" : "#FFFFFF"} />}
    </g>
  );
};

const animStyle = (a) => {
  if (!a) return undefined;
  const s = a.delay ? { animationDelay: `${a.delay}ms` } : {};
  if (a.shift) Object.assign(s, { "--dx": `${a.shift[0]}px`, "--dy": `${a.shift[1]}px` });
  return s;
};

export const Building = memo(function Building({ r, level, anim, mine, ghost, color, onSelect }) {
  const floors = r.f || 1;
  const geo = useMemo(() => building(...houseSpot(r.x, r.y), floors, r.k, r.s === "r", r.s === "f", color), [r.x, r.y, floors, r.k, r.s, color]);
  return (
    <g
      onClick={(e) => { e.stopPropagation(); onSelect?.(r.k); }}
      cursor={ghost ? undefined : "pointer"}
      data-testid={ghost ? `ghost-house-${r.k}` : `house-${r.k}`}
      data-status={r.s}
    >
      <g className={anim?.cls} style={animStyle(anim)}>
        <g className={r.s === "r" ? "opacity-90" : undefined}>
          {geo.polys.map((p, i) => (
            <polygon key={i} points={pts(p.d)} fill={p.fill} stroke="#0F172A" strokeWidth={2} strokeLinejoin="round" strokeDasharray={r.s === "r" ? "8 6" : undefined} />
          ))}
          {geo.details.map((p, i) => <polygon key={`d${i}`} points={pts(p.d)} fill={p.fill} stroke="#0F172A" strokeWidth={1.25} strokeLinejoin="round" />)}
          {geo.lines.map((l, i) => (
            <line key={`l${i}`} x1={l.a[0]} y1={l.a[1]} x2={l.b[0]} y2={l.b[1]} stroke={l.wood ? "#B07032" : "#0F172A"} strokeWidth={l.w} strokeLinecap="round" />
          ))}
          {geo.antenna && <circle cx={geo.antenna[0]} cy={geo.antenna[1]} r={6} fill="#E5484D" stroke="#0F172A" strokeWidth={2} />}
        </g>
        <Badge r={r} top={geo.top} level={level} mine={mine} color={color} />
      </g>
    </g>
  );
});
