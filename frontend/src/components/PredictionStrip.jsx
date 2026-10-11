import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getTimeline } from "@/lib/api";

export const PredictionStrip = () => {
  const { data } = useQuery({ queryKey: ["timeline"], queryFn: getTimeline, staleTime: 600000 });
  const all = data?.confirmed || [];
  const picks = all.filter((p) => p.featured);
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-12" data-testid="prediction-strip">
      <div className="flex items-end justify-between gap-4 mb-4">
        <h2 className="font-display text-3xl sm:text-4xl tracking-wide leading-none">
          THE SIMPSONS <span className="text-tape">CALLED THESE.</span>
        </h2>
        <Link to="/timeline" data-testid="strip-timeline-link" className="font-osd text-lg sm:text-xl text-tape hover:underline whitespace-nowrap">
          Full timeline →
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-3 [scrollbar-width:thin]" data-testid="strip-scroller">
        {picks.map((p, i) => (
          <Link
            key={p.id}
            to={`/timeline#${p.id}`}
            data-testid={`strip-card-${p.id}`}
            className="shrink-0 w-60 sm:w-64 panel p-4 border-l-2 border-tape hover:bg-ink-3/80 transition-colors animate-rise"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="font-osd text-slate-400 text-base leading-none">
              AIRED {p.aired} · {p.code}
            </div>
            <div className="font-display text-2xl leading-[0.95] mt-2 text-white min-h-[2.1em]">{p.headline}</div>
            <div className="mt-3 flex items-center justify-between font-osd text-lg">
              <span className="text-emerald-400">✓ {p.event}</span>
              <span className="text-slate-400">{p.gap_label || `${p.gap} yrs early`}</span>
            </div>
          </Link>
        ))}
        <Link to="/timeline" className="shrink-0 w-44 panel p-4 flex flex-col justify-center items-start border-l-2 border-white/20 hover:border-tape transition-colors">
          <div className="font-display text-2xl leading-none text-tape">+{Math.max(all.length - picks.length, 0)} MORE</div>
          <div className="font-osd text-slate-400 mt-1">and yours →</div>
        </Link>
      </div>
    </section>
  );
};
