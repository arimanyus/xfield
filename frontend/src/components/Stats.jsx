import { PREDICTIONS } from "@/data/predictions";

const gaps = PREDICTIONS.map((p) => p.gap);
const STATS = [
  { id: "count", big: PREDICTIONS.length, small: "came true", bg: "#FFD90F", tilt: "-rotate-2" },
  { id: "avg", big: `${Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length)} yrs`, small: "early, on average", bg: "#FFFFFF", tilt: "rotate-1" },
  { id: "max", big: `${Math.max(...gaps)} yrs`, small: "longest wait", bg: "#FF8FC7", tilt: "-rotate-1" },
];

export const Stats = () => (
  <div className="grid grid-cols-3 gap-3 sm:gap-6 max-w-3xl" data-testid="stats">
    {STATS.map((s) => (
      <div key={s.id} className={`toon ${s.tilt} px-3 sm:px-6 py-4 sm:py-5`} style={{ "--toon-bg": s.bg, "--toon-r": "22px" }} data-testid={`stat-${s.id}`}>
        <div className="font-display text-3xl sm:text-5xl leading-none pt-1">{s.big}</div>
        <div className="font-head font-bold text-sm sm:text-lg leading-tight mt-1">{s.small}</div>
      </div>
    ))}
  </div>
);
