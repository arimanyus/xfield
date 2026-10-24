import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { onX } from "@/city3d/Hud";

const INK = "#1C1A17";
const BODY = { fontFamily: "Georgia, 'Times New Roman', serif" };
const HEAD = { fontFamily: "'Playfair Display', Georgia, serif" };

const Rule = ({ double }) => <div className={double ? "border-t-[5px] border-double" : "border-t"} style={{ borderColor: INK }} />;

// Faces printed like newspaper photos.
function Photo({ people, size, visit }) {
  if (!people?.length) return null;
  return (
    <div className="flex justify-center gap-1.5 border p-2" style={{ borderColor: INK, background: "#E6DECB" }}>
      {people.slice(0, 4).map((p) => (
        <button key={p.k} type="button" onClick={() => visit(p)} title={`@${p.h}`}>
          <img src={p.a} alt={`@${p.h}`} className="object-cover grayscale contrast-125" style={{ width: size, height: size }} />
        </button>
      ))}
    </div>
  );
}

const Box = ({ title, children }) => (
  <section className="border-t-2 pt-1.5" style={{ borderColor: INK }}>
    <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.2em]">{title}</h4>
    {children}
  </section>
);

const Who = ({ p, visit, children }) => (
  <button type="button" onClick={() => visit(p)} className="flex w-full items-center gap-2 text-left text-[13px] hover:text-red-800">
    <img src={p.a} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover grayscale" />
    <b className="min-w-0 truncate">@{p.h}</b>
    {children}
  </button>
);

function Front({ p, census, votes, visit }) {
  const [lead, ...rest] = p.stories, n = p.numbers;
  return (
    <div className="px-5 py-4 sm:px-8 sm:py-6">
      <div className="flex justify-between gap-2 text-[10px] uppercase tracking-[0.18em] sm:text-[11px]">
        <span>No. {p.issue}</span><span className="hidden sm:inline">{p.label}</span><span>Free · {votes} votes a day</span>
      </div>
      <div className="mt-1"><Rule /></div>
      <h1 className="py-2 text-center text-[46px] leading-none sm:text-[76px]" style={{ fontFamily: "Masthead, serif" }}>The XField Ledger</h1>
      <div className="pb-1.5 text-center text-[11px] italic">“All the news that's fit to vote on.”<span className="sm:hidden"> · {p.label}</span></div>
      <Rule double />
      <h2 className="mt-3 text-center text-[30px] font-black leading-[1.05] sm:text-[48px]" style={HEAD}>{p.headline}</h2>
      {lead && lead.title !== p.headline && <div className="mt-1 text-center text-lg italic">{lead.title}</div>}
      <div className="mt-3"><Rule /></div>

      <div className="mt-4 grid gap-6 sm:grid-cols-[1.7fr_1fr]">
        <div>
          {lead ? (
            <article>
              <Photo people={lead.people} size={rest.length ? 88 : 110} visit={visit} />
              {lead.people?.length > 0 && <div className="mt-1 text-[11px] italic">Pictured: {lead.people.slice(0, 4).map((q) => `@${q.h}`).join(", ")}</div>}
              <p className="mt-2 text-[15px] leading-relaxed first-letter:float-left first-letter:mr-1.5 first-letter:text-[52px] first-letter:font-black first-letter:leading-[0.8]">
                {lead.body}
              </p>
            </article>
          ) : <p className="text-[15px] italic">Not much happened in XField since the last edition. The voters rest; the Docks wait.</p>}
          {rest.length > 0 && (
            <div className="mt-5 grid gap-x-5 gap-y-4 sm:grid-cols-2">
              {rest.map((s) => (
                <article key={s.title} className="border-t pt-2" style={{ borderColor: INK }}>
                  <h3 className="text-[19px] font-bold leading-tight" style={HEAD}>{s.title}</h3>
                  <p className="mt-1 text-[13px] leading-snug">{s.body}</p>
                  {s.people?.length > 0 && (
                    <div className="mt-1.5 flex -space-x-1">
                      {s.people.slice(0, 4).map((q) => (
                        <button key={q.k} type="button" onClick={() => visit(q)} title={`@${q.h}`}>
                          <img src={q.a} alt="" className="h-7 w-7 rounded-full border-2 object-cover grayscale" style={{ borderColor: "#F4EFE3" }} />
                        </button>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-4 sm:border-l sm:pl-5" style={{ borderColor: INK }}>
          {p.climbers?.length > 0 && (
            <Box title="The Climbers">
              <ol className="space-y-1">
                {p.climbers.map((c, i) => (
                  <li key={c.k} className="flex items-center gap-1.5">
                    <span className="w-4 text-[13px] font-bold">{i + 1}.</span>
                    <Who p={c} visit={visit}><span className="ml-auto font-bold tabular-nums text-emerald-800">+{c.pts}</span></Who>
                  </li>
                ))}
              </ol>
            </Box>
          )}
          {p.uptown?.length > 0 && (
            <Box title="Moved Uptown">
              <div className="space-y-1">{p.uptown.slice(0, 6).map((q) => <Who key={q.k} p={q} visit={visit}>{q.where && <span className="truncate text-[11px] italic">to {q.where}</span>}</Who>)}</div>
              {p.uptown.length > 6 && <div className="mt-1 text-[12px] italic">…and {p.uptown.length - 6} more.</div>}
            </Box>
          )}
          {p.arrivals?.length > 0 && (
            <Box title={`New on the Docks · ${p.arrivals.length}`}>
              <div className="flex flex-wrap gap-1">
                {p.arrivals.slice(0, 18).map((q) => (
                  <button key={q.k} type="button" onClick={() => visit(q)} title={`@${q.h}`}>
                    <img src={q.a} alt={`@${q.h}`} className="h-8 w-8 object-cover grayscale contrast-125" />
                  </button>
                ))}
              </div>
            </Box>
          )}
          {p.districts?.length > 0 && (
            <Box title="New Districts">
              <ul className="space-y-0.5 text-[13px] italic">{p.districts.map((d) => <li key={d}>{d}</li>)}</ul>
            </Box>
          )}
          {n && (
            <Box title="By the Numbers">
              <dl className="grid grid-cols-[1fr_auto] gap-x-2 text-[13px]">
                {[["Lights on", n.lit], ["On the Docks", n.docks], ["Uptown", n.uptown], ["Votes cast", n.votes], ["Lots taken", `${n.taken}/${n.capacity}`]].map(([k, v]) => (
                  <div key={k} className="contents"><dt className="border-b border-dotted" style={{ borderColor: INK }}>{k}</dt><dd className="text-right font-bold tabular-nums">{v}</dd></div>
                ))}
              </dl>
            </Box>
          )}
        </aside>
      </div>

      <div className="mt-5"><Rule double /></div>
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[12px]">
        <span className="italic">The next edition comes out tomorrow morning.</span>
        <span className="flex gap-2">
          {census && <a href={`/census/${census.issue}`} className="border px-2.5 py-1 font-bold uppercase tracking-wider hover:bg-black/5" style={{ borderColor: INK }}>Weekly census</a>}
          <a href={onX(p.share.text, p.share.url)} target="_blank" rel="noreferrer" className="px-2.5 py-1 font-bold uppercase tracking-wider text-[#F4EFE3] hover:opacity-90" style={{ background: INK }}>𝕏 Share this paper</a>
        </span>
      </div>
    </div>
  );
}

// Today's front page, over the city.
export function Newspaper({ votes, onVisit, onClose }) {
  const [p, setP] = useState(undefined);
  const [census, setCensus] = useState(null);
  useEffect(() => {
    api("/paper/latest").then(setP).catch(() => setP(null));
    api("/census/latest").then(setCensus).catch(() => {});
  }, []);
  useEffect(() => {
    const key = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const visit = (q) => { onClose(); onVisit(q); };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/60 p-3 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="paper-in relative max-h-[92vh] w-[min(96vw,880px)] overflow-y-auto shadow-2xl"
        style={{ ...BODY, color: INK, background: "#F4EFE3" }}>
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-2 top-1.5 text-2xl leading-none opacity-50 hover:opacity-100">×</button>
        {p === undefined && <div className="p-10 text-center italic">Hot off the press…</div>}
        {p === null && <div className="p-10 text-center italic">The first edition of The XField Ledger comes out tomorrow morning.</div>}
        {p && <Front p={p} census={census} votes={votes} visit={visit} />}
      </div>
    </div>
  );
}
