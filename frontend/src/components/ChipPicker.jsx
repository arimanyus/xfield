import { useState } from "react";
import { CHIPS } from "@/lib/chips";

export const ChipPicker = ({ category, value, onPick, testPrefix }) => {
  const def = CHIPS[category];
  const [custom, setCustom] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  return (
    <div data-testid={`${testPrefix}-chips-${category}`} className="animate-rise">
      <div className="flex flex-wrap gap-2">
        {def.options.map((o) => (
          <button
            type="button"
            key={o}
            data-testid={`${testPrefix}-chip-${category}-${o.replace(/\s+/g, "-")}`}
            onClick={() => onPick(o)}
            className={`chip ${value === o ? "chip-on" : ""}`}
          >
            {o}
          </button>
        ))}
        <button
          type="button"
          data-testid={`${testPrefix}-chip-${category}-other`}
          onClick={() => setShowCustom(true)}
          className={`chip border-dashed ${showCustom ? "chip-on" : ""}`}
        >
          something else…
        </button>
      </div>
      {showCustom && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (custom.trim()) onPick(custom.trim().toLowerCase().slice(0, 40));
          }}
        >
          <input
            data-testid={`${testPrefix}-custom-${category}`}
            autoFocus
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            maxLength={40}
            placeholder={`type their ${def.label}…`}
            className="input-tape text-lg py-2"
          />
          <button type="submit" data-testid={`${testPrefix}-custom-${category}-save`} className="btn-ghost text-lg py-2">
            Use it
          </button>
        </form>
      )}
    </div>
  );
};
