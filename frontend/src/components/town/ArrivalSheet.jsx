import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Sheet, Face } from "@/components/town/Sheet";

export const ArrivalSheet = ({ handle, onClose, onPickTagged, onSkip }) => {
  const [d, setD] = useState(null);

  useEffect(() => {
    api(`/residents/${encodeURIComponent(handle)}`).then(setD).catch(() => onSkip());
  }, [handle, onSkip]);

  useEffect(() => {
    if (d && (d.status !== "finished" || !d.share.tags.length)) onSkip();
  }, [d, onSkip]);

  if (!d || d.status !== "finished" || !d.share.tags.length) return null;
  const tagged = d.neighbours.filter((n) => d.share.tags.includes(n.h));

  return (
    <Sheet onClose={onClose} testId="arrival-sheet">
      <div className="flex items-center gap-4 pr-10">
        <Face src={d.avatar_url} size={64} ring={d.neighbourhood?.color || "#34D399"} alt={`@${d.h}`} />
        <div className="font-head font-bold text-2xl sm:text-3xl leading-tight" data-testid="arrival-title">@{d.h}'s block</div>
      </div>
      <div className="title-display text-3xl sm:text-4xl mt-6 leading-none pt-1" data-testid="arrival-question">TAGGED? TAP YOUR FACE.</div>
      <div className="mt-5 grid grid-cols-3 gap-3">
        {tagged.map((n) => (
          <button key={n.k} type="button" onClick={() => onPickTagged(n.k)} className="flex flex-col items-center gap-2 hover:-translate-y-1 transition-transform" data-testid={`arrival-tagged-${n.k}`}>
            <Face src={n.a} size={84} ring="#F59E0B" alt={`@${n.h}`} />
            <span className="font-head font-bold text-base sm:text-lg truncate max-w-full">@{n.h}</span>
          </button>
        ))}
      </div>
      <button type="button" onClick={onSkip} className="mt-6 w-full font-head font-bold text-lg text-ink/70 hover:text-ink" data-testid="arrival-skip-button">
        Just looking around
      </button>
    </Sheet>
  );
};
