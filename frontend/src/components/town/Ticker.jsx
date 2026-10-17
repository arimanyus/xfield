import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";

const line = (e) =>
  e.type === "lights_on"
    ? `@${e.h}'s lights are on${e.by_h ? ` · moved in by @${e.by_h}` : ""}`
    : `@${e.h} just moved in${e.n ? ` · ${e.n} houses reserved` : ""}`;

export const Ticker = ({ events }) => {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!events?.length) return;
    const t = setInterval(() => setI((v) => (v + 1) % events.length), 3800);
    return () => clearInterval(t);
  }, [events]);
  if (!events?.length) return null;
  const e = events[i % events.length];
  return (
    <div className="inline-flex max-w-full items-center gap-2 bg-ink text-white rounded-full pl-3 pr-4 py-1.5 mb-3" data-testid="town-ticker">
      <Megaphone className="w-4 h-4 text-simp shrink-0" strokeWidth={3} />
      <span key={i} className="font-head font-bold text-sm sm:text-base truncate animate-in fade-in slide-in-from-bottom-1 duration-300" data-testid="town-ticker-line">
        {line(e)}
      </span>
    </div>
  );
};
