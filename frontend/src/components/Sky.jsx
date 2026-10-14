const CLOUDS = [
  { top: "6%", w: 300, dur: 110, delay: -10 },
  { top: "16%", w: 200, dur: 85, delay: -60 },
  { top: "30%", w: 380, dur: 140, delay: -95 },
  { top: "46%", w: 240, dur: 100, delay: -30 },
  { top: "60%", w: 330, dur: 125, delay: -75 },
  { top: "74%", w: 210, dur: 90, delay: -15 },
  { top: "86%", w: 360, dur: 150, delay: -120 },
];

export const Cloud = ({ className = "", style }) => (
  <svg viewBox="0 0 200 100" className={className} style={style} aria-hidden="true">
    <g fill="#cfeaff" transform="translate(0 6)">
      <circle cx="55" cy="62" r="28" />
      <circle cx="92" cy="45" r="36" />
      <circle cx="135" cy="55" r="30" />
      <circle cx="165" cy="70" r="20" />
      <rect x="30" y="60" width="150" height="30" rx="15" />
    </g>
    <g fill="#ffffff">
      <circle cx="55" cy="62" r="28" />
      <circle cx="92" cy="45" r="36" />
      <circle cx="135" cy="55" r="30" />
      <circle cx="165" cy="70" r="20" />
      <rect x="30" y="60" width="150" height="30" rx="15" />
    </g>
  </svg>
);

export const Sky = () => (
  <div className="fixed inset-0 -z-10 sky-bg overflow-hidden pointer-events-none" data-testid="sky-background">
    {CLOUDS.map((c, i) => (
      <div
        key={i}
        className="absolute left-0 animate-drift will-change-transform"
        style={{ top: c.top, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }}
      >
        <Cloud style={{ width: c.w }} className="opacity-95" />
      </div>
    ))}
  </div>
);
