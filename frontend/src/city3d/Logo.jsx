const QUARTERS = [
  ["32,6 46,14 32,22 18,14", "#2563EB"],
  ["46,14 60,22 46,30 32,22", "#10B981"],
  ["32,22 46,30 32,38 18,30", "#FACC15"],
  ["18,14 32,22 18,30 4,22", "#EF4444"],
];

export function Mark({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 52" aria-hidden="true">
      <polygon points="4,22 32,38 32,48 4,32" fill="#1E293B" />
      <polygon points="32,38 60,22 60,32 32,48" fill="#334155" />
      {QUARTERS.map(([p, c]) => <polygon key={c} points={p} fill={c} />)}
      <g stroke="#0F172A" strokeWidth="5" strokeLinecap="round">
        <line x1="18" y1="14" x2="46" y2="30" />
        <line x1="46" y1="14" x2="18" y2="30" />
      </g>
      <g stroke="#FFFFFF" strokeWidth="1" strokeDasharray="2 2.5">
        <line x1="18" y1="14" x2="46" y2="30" />
        <line x1="46" y1="14" x2="18" y2="30" />
      </g>
    </svg>
  );
}

export function Logo({ size = 40 }) {
  return (
    <div className="flex items-center gap-2.5">
      <Mark size={size} />
      <div className="leading-none">
        <div className="font-display font-bold tracking-tight drop-shadow-sm" style={{ fontSize: size * 0.8 }}>XFIELD</div>
        <a href="https://x.com/indravahan" target="_blank" rel="noreferrer"
          className="pointer-events-auto text-[11px] font-semibold text-ink/60 hover:text-ink">by @indravahan</a>
      </div>
    </div>
  );
}
