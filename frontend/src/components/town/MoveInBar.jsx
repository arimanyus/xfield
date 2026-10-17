import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

const STEPS = {
  queued: (h) => `Booking a truck for @${h}…`,
  reading: (h) => `Reading @${h}'s posts…`,
  traffic: () => "The movers are stuck in traffic…",
  building: () => "Pouring the foundations…",
};

export const MoveInBar = ({ job, onSubmit, onReset, prefill }) => {
  const [value, setValue] = useState("");
  useEffect(() => { if (prefill) setValue(prefill); }, [prefill]);
  const working = job && job.state !== "error";

  return (
    <div className="w-full" data-testid="move-in-bar">
      {job?.state === "error" && (
        <button type="button" onClick={onReset} className="sticker bg-[#FF6B6B] text-white text-base sm:text-lg mb-3 -rotate-1 [text-shadow:none]" data-testid="move-in-error">
          {job.message}
        </button>
      )}
      <form
        onSubmit={(e) => { e.preventDefault(); if (!working && value.trim()) onSubmit(value); }}
        className="toon flex items-center gap-2 pl-5 pr-2 py-2"
        style={{ "--toon-bg": "#FFFFFF", "--toon-r": "999px" }}
      >
        {working ? (
          <div className="flex-1 flex items-center gap-3 font-head font-bold text-lg sm:text-2xl py-2 min-w-0" data-testid="move-in-progress">
            <Loader2 className="w-7 h-7 animate-spin shrink-0" strokeWidth={3} />
            <span className="truncate">{(STEPS[job.state] || STEPS.queued)(job.handle)}</span>
          </div>
        ) : (
          <>
            <span className="font-display text-2xl sm:text-3xl pt-1">@</span>
            <input
              value={value}
              onChange={(e) => { setValue(e.target.value); if (job) onReset(); }}
              placeholder="any X handle"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="flex-1 min-w-0 bg-transparent outline-none font-head font-bold text-xl sm:text-2xl py-2"
              data-testid="move-in-input"
            />
          </>
        )}
        <button type="submit" disabled={working} className="btn-toon text-lg sm:text-2xl px-5 sm:px-7 disabled:opacity-60" data-testid="move-in-submit">
          MOVE IN
        </button>
      </form>
    </div>
  );
};
