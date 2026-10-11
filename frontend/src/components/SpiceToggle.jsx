export const SpiceToggle = ({ value, onChange, compact = false }) => (
  <div data-testid="spice-toggle" className={`inline-flex border border-white/15 bg-ink-2 ${compact ? "" : "w-full sm:w-auto"}`}>
    {[
      ["savage", "SAVAGE", "default"],
      ["roast", "ROAST", "affectionate"],
    ].map(([key, label, hint]) => {
      const on = value === key;
      return (
        <button
          type="button"
          key={key}
          data-testid={`spice-${key}`}
          aria-pressed={on}
          onClick={() => onChange(key)}
          className={`flex-1 px-4 py-2 text-left transition-colors ${on ? (key === "savage" ? "bg-red-500 text-white" : "bg-tape text-ink") : "text-slate-300 hover:text-white"}`}
        >
          <div className="font-display text-xl tracking-wider leading-none">{label}</div>
          {!compact && <div className={`font-osd text-sm ${on ? "opacity-80" : "text-slate-500"}`}>{hint}</div>}
        </button>
      );
    })}
  </div>
);
