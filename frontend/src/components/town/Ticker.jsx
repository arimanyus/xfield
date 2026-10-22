import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";

const plural = (n, one, many) => (n === 1 ? one : many);

const LINES = {
  lights_on: (e) => `@${e.h} signed in and turned the lights on`,
  built: (e) => `@${e.h}'s house went up${e.n ? ` · ${e.n} neighbours reserved` : ""}`,
  moved: (e) => (e.nb_name ? `@${e.h} moved to ${e.nb_name}` : `@${e.h} moved closer to their people`),
  grew: (e) => `@${e.h}'s circle grew · ${e.n} ${plural(e.n, "house", "houses")} reserved`,
  tower: (e) => (e.nb_name ? `New tower on ${e.nb_name}: @${e.h}` : `@${e.h}'s place is a tower now`),
  new_nb: (e) => `New neighbourhood: ${e.name}`,
  nb_gone: (e) => `${e.name} emptied out`,
  demolished: (e) => (e.n > 1 ? `${e.n} empty houses came down · ${e.n} spots opened up` : `@${e.h}'s empty house came down · a spot opened up`),
  census: (e) => `Census No. ${e.issue} is out`,
};

const line = (e) => (LINES[e.type] || ((x) => `@${x.h} moved in${x.n ? ` · ${x.n} neighbours reserved` : ""}`))(e);

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
