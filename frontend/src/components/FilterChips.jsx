import { CATEGORIES, PREDICTIONS } from "@/data/predictions";
import { CAT_COLOR } from "@/data/look";

const count = (c) => (c === "all" ? PREDICTIONS.length : PREDICTIONS.filter((p) => p.category === c).length);

export const FilterChips = ({ value, onChange }) => (
  <div className="sticky top-3 z-30" data-testid="filter-bar">
    <div className="toon px-2 py-2" style={{ "--toon-bg": "#FFFFFF", "--toon-r": "999px" }}>
      <div className="flex gap-2 overflow-x-auto no-scrollbar px-1 py-1">
        {["all", ...CATEGORIES].map((c) => {
          const on = value === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              data-testid={`filter-chip-${c}`}
              aria-pressed={on}
              className={`chip-toon ${on ? "-translate-y-0.5" : "hover:bg-yellow-50"}`}
              style={on ? { background: c === "all" ? "#FFD90F" : CAT_COLOR[c] } : undefined}
            >
              {c !== "all" && <span className="w-3 h-3 rounded-full border-2 border-ink" style={{ background: CAT_COLOR[c] }} />}
              {c}
              <span className="font-display text-sm pt-0.5 opacity-70">{count(c)}</span>
            </button>
          );
        })}
      </div>
    </div>
  </div>
);
