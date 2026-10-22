import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { api, openXPost } from "@/lib/api";
import { Sheet } from "@/components/town/Sheet";

const when = (iso) => new Date(iso).toLocaleString(undefined, { weekday: "long", hour: "numeric", minute: "2-digit" });

const Nav = ({ older, newer, onIssue }) => (
  <div className="mt-4 flex items-center justify-between gap-3">
    <button type="button" disabled={!older} onClick={() => onIssue(older.issue)} className="chip-toon text-sm sm:text-base disabled:opacity-40 disabled:hover:translate-y-0" data-testid="census-older-button">
      <ChevronLeft className="w-4 h-4" strokeWidth={3} /> Older
    </button>
    <button type="button" disabled={!newer} onClick={() => onIssue(newer.issue)} className="chip-toon text-sm sm:text-base disabled:opacity-40 disabled:hover:translate-y-0" data-testid="census-newer-button">
      Newer <ChevronRight className="w-4 h-4" strokeWidth={3} />
    </button>
  </div>
);

const Empty = ({ nextAt }) => (
  <div data-testid="census-empty">
    <div className="font-display text-3xl sm:text-4xl leading-none pt-1 pr-10">THE XFIELD CENSUS</div>
    <p className="mt-5 font-head font-bold text-xl sm:text-2xl leading-snug">The first census comes out {when(nextAt)}.</p>
    <p className="mt-2 font-head font-bold text-base text-ink/70">Every Monday: who grew, who moved, who lit up.</p>
  </div>
);

export const CensusSheet = ({ issue, onIssue, onClose }) => {
  const [list, setList] = useState(null);
  const [c, setC] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const current = issue || list?.issues[0]?.issue;

  useEffect(() => { api("/census").then(setList).catch(() => setList({ issues: [], next_at: null })); }, []);
  useEffect(() => {
    if (!current) return;
    let live = true;
    setC(null);
    setLoaded(false);
    api(`/census/${current}`).then((x) => live && setC(x)).catch(() => live && setC({ missing: true }));
    return () => { live = false; };
  }, [current]);

  if (!list || (current && !c))
    return <Sheet onClose={onClose} testId="census-sheet"><Loader2 className="w-8 h-8 animate-spin mx-auto my-6" strokeWidth={3} /></Sheet>;
  if (!current || c.missing) return <Sheet onClose={onClose} testId="census-sheet"><Empty nextAt={list.next_at || new Date().toISOString()} /></Sheet>;

  const idx = list.issues.findIndex((i) => i.issue === c.issue);
  return (
    <Sheet onClose={onClose} testId="census-sheet">
      <div className="pr-12">
        <div className="font-display text-3xl sm:text-4xl leading-none pt-1" data-testid="census-title">CENSUS No. {c.issue}</div>
        <div className="font-head font-bold text-base sm:text-lg text-ink/70 mt-1" data-testid="census-label">{c.label}</div>
      </div>
      <div className="relative mt-4 w-full max-w-[min(300px,calc((78vh-270px)*0.75))] mx-auto aspect-[3/4] rounded-2xl border-4 border-ink overflow-hidden bg-sky-light">
        {!loaded && <Loader2 className="absolute inset-0 m-auto w-8 h-8 animate-spin" strokeWidth={3} />}
        <img src={c.card_url} alt={`XField census No. ${c.issue}`} onLoad={() => setLoaded(true)} className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`} data-testid="census-card-image" />
      </div>
      <Nav older={list.issues[idx + 1]} newer={idx > 0 ? list.issues[idx - 1] : null} onIssue={onIssue} />
      <button type="button" onClick={() => openXPost(c.share.text, c.share.url)} className="btn-toon w-full justify-center mt-4 text-2xl sm:text-3xl" data-testid="census-share-button">
        SHARE THE CENSUS
      </button>
    </Sheet>
  );
};
