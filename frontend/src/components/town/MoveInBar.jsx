import { useState } from "react";
import { Loader2 } from "lucide-react";

const STEPS = {
  queued: (h) => `Surveying a lot for @${h}…`,
  reading: (h) => `Reading who @${h} talks to…`,
  traffic: () => "X is slow right now. Still trying…",
  building: () => "Pouring the foundations…",
};

export const MoveInBar = ({ job, onSubmit, onReset, full }) => {
  const [value, setValue] = useState("");
  const working = job && job.state !== "error";

  return (
    <div className="w-full" data-testid="move-in-bar">
      {job?.state === "error" && (
        <button type="button" onClick={onReset} className="sticker bg-[#EF4444] text-white text-sm sm:text-base mb-3 normal-case" data-testid="move-in-error">
          {job.message}
        </button>
      )}
      {full && !working ? (
        <div className="panel px-6 py-4 text-center title-display text-2xl sm:text-3xl" style={{ "--panel-bg": "#34D399", "--panel-r": "14px" }} data-testid="town-full-banner">
          EVERY LOT IS TAKEN
        </div>
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); if (!working && value.trim()) onSubmit(value); }}
          className="panel flex items-center gap-2 pl-4 pr-2 py-2"
          style={{ "--panel-bg": "#FFFFFF", "--panel-r": "14px" }}
        >
          {working ? (
            <div className="flex-1 flex items-center gap-3 font-head font-semibold text-base sm:text-xl py-2 min-w-0" data-testid="move-in-progress">
              <Loader2 className="w-6 h-6 animate-spin shrink-0" strokeWidth={2.5} />
              <span className="truncate">{(STEPS[job.state] || STEPS.queued)(job.handle)}</span>
            </div>
          ) : (
            <>
              <span className="font-display font-bold text-2xl sm:text-3xl text-ink/60">@</span>
              <input
                value={value}
                onChange={(e) => { setValue(e.target.value); if (job) onReset(); }}
                placeholder="any X handle"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="flex-1 min-w-0 bg-transparent outline-none font-head font-semibold text-lg sm:text-2xl py-2"
                data-testid="move-in-input"
              />
            </>
          )}
          <button type="submit" disabled={working} className="btn-primary text-base sm:text-xl px-5 sm:px-7" data-testid="move-in-submit">
            BUILD
          </button>
        </form>
      )}
    </div>
  );
};
