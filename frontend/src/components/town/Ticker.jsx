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
  new_nb: (e) => (e.h ? `New district: ${e.name}, home of @${e.h} and their mutuals` : `New district on the map: ${e.name}`),
  nb_gone: (e) => `${e.name} emptied out`,
  claimed: (e) => `@${e.h} claimed the charter of ${where(e)}`,
  chartered: (e) => `@${e.h} founded ${where(e, "a new district")}`,
  joined: (e) => `@${e.h} moved into ${where(e)}`,
  new_leader: (e) => `${where(e)} elected @${e.h} as its leader`,
  renamed: (e) => `@${e.h} renamed their district ${e.name}`,
  uptown: (e) => `🏙 @${e.h}'s house won its way off the Docks and moved uptown`,
  top: (e) => (e.rank === 1 ? `🥇 @${e.h}'s house is now #1 in XField` : `🏁 @${e.h}'s house broke into the top 10`),
  docked: (e) => `⚓ The weekly reshuffle sent ${e.n} ${plural(e.n, "house", "houses")} back to the Docks`,
  demolished: (e) => (e.n > 1 ? `${e.n} empty lots were cleared · ${e.n} spots opened up` : `@${e.h}'s empty lot was cleared · a spot opened up`),
  census: (e) => `City Ledger No. ${e.issue} is out`,
  paper: (e) => `🗞 Today's Ledger: ${e.headline}`,
};

export const tickerLine = (e) => (LINES[e.type] || ((x) => `@${x.h} moved in${x.n ? ` · ${x.n} neighbours reserved` : ""}`))(e);

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
        {tickerLine(e)}
      </span>
    </div>
  );
};
