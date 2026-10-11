import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { StaticScreen } from "@/components/StaticScreen";
import { getTimeline, untilYear } from "@/lib/api";

const Confirmed = ({ p, index }) => (
  <li id={p.id} className="relative pl-8 sm:pl-12 scroll-mt-24 animate-rise" style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }} data-testid={`timeline-entry-${p.id}`}>
    <span className="absolute left-[3px] sm:left-[11px] top-5 w-3 h-3 bg-tape rounded-full ring-4 ring-ink" />
    <div className="panel p-4 sm:p-5 grid sm:grid-cols-[160px_1fr] gap-3 sm:gap-6 hover:border-tape/40 transition-colors">
      <div className="font-osd leading-tight">
        <div className="osd text-sm">Aired {p.aired}</div>
        <div className="text-white text-2xl mt-1">{p.code}</div>
        <div className="text-slate-400 text-base">“{p.title}”</div>
      </div>
      <div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-osd text-base sm:text-lg">
          <span className="text-emerald-400">✓ CAME TRUE {p.event}</span>
          <span className="text-slate-400">{p.gap_label || `${p.gap} years early`}</span>
          <span className="text-slate-600 uppercase">{p.category}</span>
        </div>
        <h3 className="font-display text-2xl sm:text-3xl tracking-wide leading-none mt-1.5">{p.headline}</h3>
        <p className="text-slate-300 text-sm sm:text-base mt-2">{p.detail}</p>
      </div>
    </div>
  </li>
);

const Pending = ({ p, index }) => {
  const t = untilYear(p.year);
  return (
    <li className="relative pl-8 sm:pl-12 animate-rise" style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }} data-testid={`pending-entry-${p.episode_id}-${p.year}`}>
      <span className="absolute left-[3px] sm:left-[11px] top-5 w-3 h-3 border-2 border-tape rounded-full ring-4 ring-ink bg-ink" />
      <Link to={`/ep/${p.episode_id}`} className="panel p-4 sm:p-5 grid sm:grid-cols-[160px_1fr] gap-3 sm:gap-6 hover:border-tape/40 transition-colors block">
        <div className="font-osd leading-tight">
          <div className="osd text-sm">Due {p.year}</div>
          <div className="text-white text-2xl mt-1">{p.code}</div>
          <div className="text-slate-400 text-base">“{p.title}”</div>
        </div>
        <div className="flex gap-4 items-start">
          {p.image_url && <img src={p.image_url} alt="" className="hidden sm:block w-28 aspect-video object-cover border border-white/15 shrink-0" />}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-osd text-base sm:text-lg">
              <span className={t.due ? "text-emerald-400" : "text-tape"}>{t.due ? "● DUE — CHECK IT" : `◌ PENDING · ${t.label}`}</span>
              <span className="text-slate-400">about @{p.handle}</span>
            </div>
            <p className="text-slate-100 text-base sm:text-lg mt-1.5 leading-snug">{p.text}</p>
          </div>
        </div>
      </Link>
    </li>
  );
};

export default function TimelinePage() {
  const { data, isLoading } = useQuery({ queryKey: ["timeline"], queryFn: getTimeline, staleTime: 600000 });
  const [cat, setCat] = useState("all");
  const { hash } = useLocation();

  useEffect(() => {
    if (!data || !hash) return;
    const el = document.getElementById(hash.slice(1));
    if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, [data, hash]);

  const confirmed = useMemo(() => (data?.confirmed || []).filter((p) => cat === "all" || p.category === cat), [data, cat]);
  const pendingByYear = useMemo(() => {
    const m = new Map();
    (data?.pending || []).forEach((p) => m.set(p.year, [...(m.get(p.year) || []), p]));
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [data]);

  if (isLoading) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-12">
        <StaticScreen message="REWINDING 30 SEASONS…" roll={false} />
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12" data-testid="timeline-page">
      <div className="osd">The receipts</div>
      <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl tracking-wide leading-[0.92] mt-2">
        THE SIMPSONS <span className="text-tape">PREDICTED IT.</span>
        <br />
        THEN IT HAPPENED.
      </h1>

      <div className="mt-6 flex flex-wrap gap-2" data-testid="timeline-filters">
        {["all", ...data.categories].map((c) => (
          <button key={c} type="button" data-testid={`timeline-filter-${c}`} onClick={() => setCat(c)} className={`chip ${cat === c ? "chip-on" : ""}`}>
            {c}
          </button>
        ))}
      </div>

      <ol className="relative mt-8 space-y-4 before:absolute before:left-[8px] sm:before:left-[16px] before:top-2 before:bottom-2 before:w-px before:bg-tape/30" data-testid="timeline-confirmed">
        {confirmed.map((p, i) => (
          <Confirmed key={`${p.id}-${i}`} p={p} index={i} />
        ))}
      </ol>

      <div id="pending" className="mt-16 scroll-mt-24">
        <div className="osd">From this archive · pending</div>
        <h2 className="font-display text-4xl sm:text-5xl tracking-wide leading-none mt-2">
          YOUR TURN ON THE <span className="text-tape">TIMELINE.</span>
        </h2>
        {pendingByYear.length === 0 ? (
          <div className="panel p-6 mt-6 font-osd text-xl text-slate-400" data-testid="pending-empty">
            Nothing yet. <Link to="/" className="text-tape hover:underline">Find your episode</Link>.
          </div>
        ) : (
          pendingByYear.map(([year, items]) => (
            <section key={year} className="mt-8" data-testid={`pending-year-${year}`}>
              <div className="flex items-center gap-3">
                <div className="font-display text-4xl text-tape leading-none">{year}</div>
                <div className="font-osd text-slate-400 text-lg">
                  {items.length} {items.length === 1 ? "prophecy" : "prophecies"} · {untilYear(year).label}
                </div>
                <div className="flex-1 h-px bg-tape/20" />
              </div>
              <ol className="relative mt-4 space-y-3 before:absolute before:left-[8px] sm:before:left-[16px] before:top-2 before:bottom-2 before:w-px before:bg-white/10">
                {items.map((p, i) => (
                  <Pending key={`${p.episode_id}-${p.year}`} p={p} index={i} />
                ))}
              </ol>
            </section>
          ))
        )}
        <div className="mt-10 panel p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 font-display text-3xl tracking-wide leading-none">GET ON THE CLOCK.</div>
          <Link to="/" data-testid="timeline-cta" className="btn-tape text-center">
            Find my episode
          </Link>
        </div>
      </div>
    </main>
  );
}
