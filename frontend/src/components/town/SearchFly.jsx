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
      <button type="button" onClick={() => setOpen(true)} className="absolute right-3 top-3 sm:right-5 sm:top-5 z-20 w-14 h-14 rounded-full bg-white border-4 border-ink grid place-items-center hover:-translate-y-0.5 transition-transform" aria-label="Search the town" data-testid="search-open-button">
        <Search className="w-7 h-7" strokeWidth={3} />
      </button>
    );

  return (
    <div className="absolute right-3 top-3 sm:right-5 sm:top-5 z-30 w-[min(92vw,360px)]" data-testid="search-panel">
      <form
        onSubmit={(e) => { e.preventDefault(); if (exact) pick(exact.k); else if (query) { onMoveIn(query); setOpen(false); setQ(""); } }}
        className="toon flex items-center gap-2 px-3 py-2"
        style={{ "--toon-bg": "#FFFFFF", "--toon-r": "999px" }}
      >
        <Search className="w-6 h-6 shrink-0" strokeWidth={3} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a handle" className="flex-1 min-w-0 bg-transparent outline-none font-head font-bold text-xl" data-testid="search-input" />
        <button type="button" onClick={() => setOpen(false)} aria-label="Close search" data-testid="search-close-button"><X className="w-6 h-6" strokeWidth={3} /></button>
      </form>
      {query && (
        <div className="toon mt-3 p-2" style={{ "--toon-bg": "#FFFDF0", "--toon-r": "22px" }}>
          {hits.map((r) => (
            <button key={r.k} type="button" onClick={() => pick(r.k)} className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-simp/40 text-left" data-testid={`search-result-${r.k}`}>
              <img src={smallAvatar(r.a) || "/art/donut.webp"} alt="" className="w-10 h-10 rounded-full border-[3px] border-ink object-cover" />
              <span className="font-head font-bold text-lg truncate">@{r.h}</span>
              {r.s === "r" && <span className="ml-auto sticker bg-[#FFA94D] text-xs">RESERVED</span>}
            </button>
          ))}
          {!exact && (
            <button type="button" onClick={() => { onMoveIn(query); setOpen(false); setQ(""); }} className="w-full font-head font-bold text-lg px-2 py-2 text-left hover:bg-simp/40 rounded-xl" data-testid="search-move-in-button">
              Not in town yet. Move @{query} in
            </button>
          )}
        </div>
      )}
    </div>
  );
};
