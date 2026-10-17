import { memo, useMemo } from "react";
import { building, pts } from "@/lib/iso";
import { smallAvatar } from "@/lib/api";

const LABEL = [0, 20, 16];

const Pill = ({ y, text, size, fill = "#FFFFFF" }) => {
  const w = text.length * size * 0.6 + size * 1.3;
  return (
    <g transform={`translate(0 ${y})`}>
      <rect x={-w / 2} y={-size * 0.95} width={w} height={size * 1.9} rx={size * 0.95} fill={fill} stroke="#111" strokeWidth={3} />
      <text textAnchor="middle" dominantBaseline="central" y={1} fontFamily="Fredoka" fontWeight="700" fontSize={size} fill="#111">{text}</text>
    </g>
  );
};

const Badge = ({ r, top, level, mine }) => {
  const ring = mine ? "#FFD90F" : r.s === "r" ? "#FFA94D" : "#FFFFFF";
  const size = LABEL[level];
  return (
    <g transform={`translate(${top[0]} ${top[1] - 40})`}>
      <line x1={0} y1={22} x2={0} y2={40} stroke="#111" strokeWidth={3} />
      <circle r={27} fill={ring} stroke="#111" strokeWidth={3} />
      {r.a ? (
        <image href={smallAvatar(r.a)} x={-21} y={-21} width={42} height={42} clipPath="url(#avatar-clip)" preserveAspectRatio="xMidYMid slice" />
      ) : (
        <text textAnchor="middle" dominantBaseline="central" fontFamily="Luckiest Guy" fontSize={24} fill="#111">{r.h[0].toUpperCase()}</text>
      )}
      <circle r={21} fill="none" stroke="#111" strokeWidth={2.5} />
      {(level === 2 || (level === 1 && (r.s === "f" || mine))) && <Pill y={-27 - size * 1.3} text={`@${r.h}`} size={size} fill={r.s === "r" ? "#FFE6CC" : "#FFFFFF"} />}
    </g>
  );
};

export const Building = memo(function Building({ r, level, anim, delay, mine, onSelect }) {
  const geo = useMemo(() => building(r.x, r.y, r.t, r.k, r.s === "r"), [r.x, r.y, r.t, r.k, r.s]);
  return (
    <g
      className={anim || undefined}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
      onClick={(e) => { e.stopPropagation(); onSelect(r.k); }}
      cursor="pointer"
      data-testid={`house-${r.k}`}
      data-status={r.s}
    >
      <g className={r.s === "r" ? "opacity-90" : undefined}>
        {geo.polys.map((p, i) => (
          <polygon key={i} points={pts(p.d)} fill={p.fill} stroke="#111" strokeWidth={3} strokeLinejoin="round" strokeDasharray={r.s === "r" ? "7 5" : undefined} />
        ))}
        {geo.details.map((p, i) => <polygon key={`d${i}`} points={pts(p.d)} fill={p.fill} stroke="#111" strokeWidth={2} strokeLinejoin="round" />)}
        {geo.lines.map((l, i) => (
          <line key={`l${i}`} x1={l.a[0]} y1={l.a[1]} x2={l.b[0]} y2={l.b[1]} stroke={l.wood ? "#B07032" : "#111"} strokeWidth={l.w} strokeLinecap="round" />
        ))}
        {geo.antenna && <circle cx={geo.antenna[0]} cy={geo.antenna[1]} r={6} fill="#FF6B6B" stroke="#111" strokeWidth={3} />}
      </g>
      <Badge r={r} top={geo.top} level={level} mine={mine} />
    </g>
  );
});
