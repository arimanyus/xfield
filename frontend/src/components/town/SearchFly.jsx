import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { cleanHandle, smallAvatar } from "@/lib/api";

export const SearchFly = ({ residents, onPick, onMoveIn }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const query = cleanHandle(q).toLowerCase();
  const hits = useMemo(() => (query ? residents.filter((r) => r.k.startsWith(query)).slice(0, 6) : []), [residents, query]);
  const exact = residents.find((r) => r.k === query);
  const pick = (k) => { onPick(k); setOpen(false); setQ(""); };

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="w-12 h-12 rounded-xl bg-white border-2 border-ink grid place-items-center hover:-translate-y-0.5 transition-transform" aria-label="Search the city" data-testid="search-open-button">
        <Search className="w-6 h-6" strokeWidth={2.5} />
      </button>
    );

  return (
    <div className="absolute right-0 top-0 z-30 w-[min(92vw,380px)]" data-testid="search-panel">
      <form
        onSubmit={(e) => { e.preventDefault(); if (exact) pick(exact.k); else if (query) { onMoveIn(query); setOpen(false); setQ(""); } }}
        className="panel flex items-center gap-2 px-3 h-12"
        style={{ "--panel-bg": "#FFFFFF", "--panel-r": "12px" }}
      >
        <Search className="w-5 h-5 shrink-0" strokeWidth={2.5} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a handle" className="flex-1 min-w-0 bg-transparent outline-none font-head font-semibold text-lg" data-testid="search-input" />
        <button type="button" onClick={() => setOpen(false)} aria-label="Close search" data-testid="search-close-button"><X className="w-5 h-5" strokeWidth={2.5} /></button>
      </form>
      {query && (
        <div className="panel mt-3 p-2" style={{ "--panel-r": "14px" }}>
          {hits.map((r) => (
            <button key={r.k} type="button" onClick={() => pick(r.k)} className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-brand/30 text-left" data-testid={`search-result-${r.k}`}>
              {r.a ? <img src={smallAvatar(r.a)} alt="" className="w-9 h-9 rounded-lg border border-ink object-cover" /> : <span className="w-9 h-9 rounded-lg border border-ink bg-sky-light" />}
              <span className="font-head font-semibold text-base truncate">@{r.h}</span>
              {r.s === "r" && <span className="ml-auto sticker bg-[#FEF3C7] text-[10px]">RESERVED</span>}
            </button>
          ))}
          {!exact && (
            <button type="button" onClick={() => { onMoveIn(query); setOpen(false); setQ(""); }} className="w-full font-head font-semibold text-base px-2 py-2 text-left hover:bg-brand/30 rounded-lg" data-testid="search-move-in-button">
              Not in XField yet. Reserve a lot for @{query}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
