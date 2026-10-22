import { memo, useMemo } from "react";
import { building, houseSpot, signSpot, P, pts, wrapSign } from "@/lib/iso";
import { smallAvatar } from "@/lib/api";

const LABEL = [0, 26, 19];

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
    <g transform={`translate(${top[0]} ${top[1] - 54})`}>
      <line x1={0} y1={30} x2={0} y2={54} stroke="#111" strokeWidth={4} />
      <circle r={36} fill={ring} stroke="#111" strokeWidth={4} />
      {r.a ? (
        <image href={smallAvatar(r.a)} x={-29} y={-29} width={58} height={58} clipPath="url(#avatar-clip)" preserveAspectRatio="xMidYMid slice" />
      ) : (
        <text textAnchor="middle" dominantBaseline="central" fontFamily="Luckiest Guy" fontSize={32} fill="#111">{r.h[0].toUpperCase()}</text>
      )}
      <circle r={29} fill="none" stroke="#111" strokeWidth={3} />
      {level > 0 && <Pill y={-36 - size * 1.35} text={`@${r.h}`} size={size} fill={r.s === "r" ? "#FFE6CC" : "#FFFFFF"} />}
    </g>
  );
};

const LawnSign = ({ x, y, text }) => {
  const lines = wrapSign(text);
  const fs = 15;
  const w = Math.max(...lines.map((l) => l.length)) * fs * 0.66 + 26;
  const h = lines.length * (fs + 4) + 18;
  const [sx, sy] = P(...signSpot(x, y));
  return (
    <g transform={`translate(${sx} ${sy})`} style={{ pointerEvents: "none" }}>
      <line x1={-w / 3} y1={0} x2={-w / 3} y2={-22} stroke="#111" strokeWidth={7} />
      <line x1={w / 3} y1={0} x2={w / 3} y2={-22} stroke="#111" strokeWidth={7} />
      <line x1={-w / 3} y1={0} x2={-w / 3} y2={-22} stroke="#B07032" strokeWidth={3} />
      <line x1={w / 3} y1={0} x2={w / 3} y2={-22} stroke="#B07032" strokeWidth={3} />
      <rect x={-w / 2} y={-22 - h} width={w} height={h} rx={8} fill="#FFFDF0" stroke="#111" strokeWidth={4} />
      {lines.map((l, i) => (
        <text key={i} textAnchor="middle" x={0} y={-22 - h + 12 + fs + i * (fs + 4) - 2} fontFamily="Luckiest Guy" fontSize={fs} fill="#111">{l}</text>
      ))}
    </g>
  );
};

const animStyle = (a) => {
  if (!a) return undefined;
  const s = a.delay ? { animationDelay: `${a.delay}ms` } : {};
  if (a.shift) Object.assign(s, { "--dx": `${a.shift[0]}px`, "--dy": `${a.shift[1]}px` });
  return s;
};

export const Building = memo(function Building({ r, level, anim, mine, ghost, onSelect }) {
  const geo = useMemo(() => building(...houseSpot(r.x, r.y), r.t, r.k, r.s === "r"), [r.x, r.y, r.t, r.k, r.s]);
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
            <polygon key={i} points={pts(p.d)} fill={p.fill} stroke="#111" strokeWidth={3.5} strokeLinejoin="round" strokeDasharray={r.s === "r" ? "9 6" : undefined} />
          ))}
          {geo.details.map((p, i) => <polygon key={`d${i}`} points={pts(p.d)} fill={p.fill} stroke="#111" strokeWidth={2.5} strokeLinejoin="round" />)}
          {geo.lines.map((l, i) => (
            <line key={`l${i}`} x1={l.a[0]} y1={l.a[1]} x2={l.b[0]} y2={l.b[1]} stroke={l.wood ? "#B07032" : "#111"} strokeWidth={l.w} strokeLinecap="round" />
          ))}
          {geo.antenna && <circle cx={geo.antenna[0]} cy={geo.antenna[1]} r={8} fill="#FF6B6B" stroke="#111" strokeWidth={3} />}
        </g>
        <Badge r={r} top={geo.top} level={level} mine={mine} />
      </g>
      {level === 2 && r.sg && !ghost && <LawnSign x={r.x} y={r.y} text={r.sg} />}
    </g>
  );
});
