import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { api, openXPost } from "@/lib/api";
import { Sheet } from "@/components/town/Sheet";

const when = (iso) => new Date(iso).toLocaleString(undefined, { weekday: "long", hour: "numeric", minute: "2-digit" });

const Nav = ({ older, newer, onIssue }) => (
  <div className="mt-4 flex items-center justify-between gap-3">
    <button type="button" disabled={!older} onClick={() => onIssue(older.issue)} className="chip text-sm disabled:opacity-40 disabled:hover:translate-y-0" data-testid="census-older-button">
      <ChevronLeft className="w-4 h-4" strokeWidth={2.5} /> Older
    </button>
    <button type="button" disabled={!newer} onClick={() => onIssue(newer.issue)} className="chip text-sm disabled:opacity-40 disabled:hover:translate-y-0" data-testid="census-newer-button">
      Newer <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
    </button>
  </div>
);

const Empty = ({ nextAt }) => (
  <div data-testid="census-empty">
    <div className="title-display text-3xl sm:text-4xl leading-none pt-1 pr-10">THE CITY LEDGER</div>
    <p className="mt-5 font-head font-semibold text-lg sm:text-xl leading-snug">The first ledger comes out {when(nextAt)}.</p>
    <p className="mt-2 font-head font-medium text-base text-ink/70">Every Monday: richest districts, new towers, who moved, who lit up.</p>
  </div>
);

const Leaders = ({ districts }) =>
  districts?.length ? (
    <ol className="mt-4 space-y-2" data-testid="census-districts">
      {districts.map((d, i) => (
        <li key={d.id} className="flex items-center gap-3 rounded-xl border-2 border-ink bg-white px-3 py-2">
          <span className="font-display font-bold text-lg w-5">{i + 1}</span>
          <span className="w-4 h-4 rounded border border-ink shrink-0" style={{ background: d.color || "#8A94A3" }} />
          <span className="font-head font-semibold truncate flex-1">{d.name}</span>
          <span className="font-head font-medium text-sm text-ink/70 shrink-0">{d.floors} floors · {d.lit} lit</span>
        </li>
      ))}
    </ol>
  ) : null;

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
    return <Sheet onClose={onClose} testId="census-sheet"><Loader2 className="w-8 h-8 animate-spin mx-auto my-6" strokeWidth={2.5} /></Sheet>;
  if (!current || c.missing) return <Sheet onClose={onClose} testId="census-sheet"><Empty nextAt={list.next_at || new Date().toISOString()} /></Sheet>;

  const idx = list.issues.findIndex((i) => i.issue === c.issue);
  return (
    <Sheet onClose={onClose} testId="census-sheet" wide>
      <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:gap-x-7">
        <div className="pr-12 sm:col-start-2 sm:row-start-1 sm:pt-2">
          <div className="title-display text-3xl sm:text-5xl leading-none pt-1" data-testid="census-title">LEDGER No. {c.issue}</div>
          <div className="font-head font-semibold text-base sm:text-lg text-ink/70 mt-1 sm:mt-3" data-testid="census-label">{c.label}</div>
          <Leaders districts={c.districts} />
        </div>
        <div className="relative w-full max-w-[min(300px,calc((78vh-270px)*0.75))] sm:w-[min(400px,calc((78vh-70px)*0.75))] sm:max-w-none mx-auto aspect-[3/4] rounded-xl border-2 border-ink overflow-hidden bg-sky-light sm:col-start-1 sm:row-start-1 sm:row-span-2">
          {!loaded && <Loader2 className="absolute inset-0 m-auto w-8 h-8 animate-spin" strokeWidth={2.5} />}
          <img src={c.card_url} alt={`XField City Ledger No. ${c.issue}`} onLoad={() => setLoaded(true)} className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`} data-testid="census-card-image" />
        </div>
        <div className="sm:col-start-2 sm:row-start-2 sm:self-end">
          <Nav older={list.issues[idx + 1]} newer={idx > 0 ? list.issues[idx - 1] : null} onIssue={onIssue} />
          <button type="button" onClick={() => openXPost(c.share.text, c.share.url)} className="btn-primary w-full justify-center mt-4" data-testid="census-share-button">
            SHARE THE LEDGER
          </button>
        </div>
      </div>
    </Sheet>
  );
};
