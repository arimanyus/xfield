import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";

const plural = (n, one, many) => (n === 1 ? one : many);
const where = (e, fallback = "their district") => e.nb_name || fallback;

const LINES = {
  lights_on: (e) => `@${e.h} signed in and lit up their building`,
  built: (e) => `A lot went up for @${e.h}${e.n ? ` · ${e.n} neighbours reserved` : ""}`,
  moved: (e) => (e.nb_name ? `@${e.h} moved to ${e.nb_name}` : `@${e.h} moved closer to their people`),
  grew: (e) => `@${e.h}'s circle grew · ${e.n} ${plural(e.n, "lot", "lots")} reserved`,
  tower: (e) => (e.nb_name ? `New tower in ${e.nb_name}: @${e.h}` : `@${e.h} built a tower`),
  upgraded: (e) => `@${e.h} built up to ${e.n} floors in ${where(e, "XField")}`,
  new_nb: (e) => `New district on the map: ${e.name}`,
  nb_gone: (e) => `${e.name} emptied out`,
  claimed: (e) => `@${e.h} claimed the charter of ${where(e)}`,
  chartered: (e) => `@${e.h} founded ${where(e, "a new district")}`,
  joined: (e) => `@${e.h} moved into ${where(e)}`,
  new_mayor: (e) => `${where(e)} elected @${e.h} mayor`,
  expanded: (e) => (e.project === "height" ? `${where(e)} raised its height limit by ${e.n} floors` : `${where(e)} opened ${e.n} new lots`),
  highway: (e) => `A highway now links ${where(e)} and ${e.name}`,
  demolished: (e) => (e.n > 1 ? `${e.n} empty lots were cleared · ${e.n} spots opened up` : `@${e.h}'s empty lot was cleared · a spot opened up`),
  census: (e) => `City Ledger No. ${e.issue} is out`,
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
    <div className="inline-flex max-w-full items-center gap-2 bg-ink text-white rounded-lg pl-3 pr-4 py-1.5 mb-3" data-testid="town-ticker">
      <Megaphone className="w-4 h-4 text-brand shrink-0" strokeWidth={2.5} />
      <span key={i} className="font-head font-medium text-sm sm:text-base truncate animate-in fade-in slide-in-from-bottom-1 duration-300" data-testid="town-ticker-line">
        {line(e)}
      </span>
    </div>
  );
};
