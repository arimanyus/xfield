import { memo, useMemo } from "react";
import { building, houseSpot, pts, wrapSign } from "@/lib/iso";
import { smallAvatar } from "@/lib/api";

const LABEL = [0, 26, 19];
const SIGN_FS = 15;

const Pill = ({ y, text, size, fill = "#FFFFFF" }) => {
  const w = text.length * size * 0.6 + size * 1.3;
  return (
    <g transform={`translate(0 ${y})`}>
      <rect x={-w / 2} y={-size * 0.95} width={w} height={size * 1.9} rx={size * 0.95} fill={fill} stroke="#111" strokeWidth={3} />
      <text textAnchor="middle" dominantBaseline="central" y={1} fontFamily="Fredoka" fontWeight="700" fontSize={size} fill="#111">{text}</text>
    </g>
  );
};

const SignPost = ({ bottom }) => (
  <>
    <line x1={0} y1={bottom} x2={0} y2={-30} stroke="#111" strokeWidth={8} />
    <line x1={0} y1={bottom} x2={0} y2={-30} stroke="#B07032" strokeWidth={3.5} />
  </>
);

const SignBoard = ({ text, bottom, k }) => {
  const lines = wrapSign(text, 16);
  const w = Math.max(...lines.map((l) => l.length)) * SIGN_FS * 0.66 + 30;
  const h = lines.length * (SIGN_FS + 4) + 20;
  const top = bottom - h;
  return (
    <g style={{ pointerEvents: "none" }} data-testid={`lawn-sign-${k}`}>
      <rect x={-w / 2} y={top} width={w} height={h} rx={8} fill="#FFFDF0" stroke="#111" strokeWidth={4} />
      <rect x={-w / 2 + 6} y={top + 6} width={w - 12} height={h - 12} rx={4} fill="none" stroke="#111" strokeWidth={1.5} />
      {lines.map((l, i) => (
        <text key={i} textAnchor="middle" x={0} y={top + 10 + SIGN_FS + i * (SIGN_FS + 4) - 1} fontFamily="Luckiest Guy" fontSize={SIGN_FS} fill="#111">{l}</text>
      ))}
    </g>
  );
};

const Badge = ({ r, top, level, mine, sign }) => {
  const ring = mine ? "#FFD90F" : r.s === "r" ? "#FFA94D" : "#FFFFFF";
  const size = LABEL[level];
  const pillY = -36 - size * 1.35;
  const signBottom = pillY - size * 0.95 - 10;
  return (
    <g transform={`translate(${top[0]} ${top[1] - 54})`}>
      <line x1={0} y1={30} x2={0} y2={54} stroke="#111" strokeWidth={4} />
      {sign && <SignPost bottom={signBottom + 4} />}
      <circle r={36} fill={ring} stroke="#111" strokeWidth={4} />
      {r.a ? (
        <image href={smallAvatar(r.a)} x={-29} y={-29} width={58} height={58} clipPath="url(#avatar-clip)" preserveAspectRatio="xMidYMid slice" />
      ) : (
        <text textAnchor="middle" dominantBaseline="central" fontFamily="Luckiest Guy" fontSize={32} fill="#111">{r.h[0].toUpperCase()}</text>
      )}
      <circle r={29} fill="none" stroke="#111" strokeWidth={3} />
      {level > 0 && <Pill y={pillY} text={`@${r.h}`} size={size} fill={r.s === "r" ? "#FFE6CC" : "#FFFFFF"} />}
      {sign && <SignBoard text={sign} bottom={signBottom} k={r.k} />}
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
        <Badge r={r} top={geo.top} level={level} mine={mine} sign={level === 2 && !ghost ? r.sg : null} />
      </g>
    </g>
  );
});
