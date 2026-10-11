import { Link } from "react-router-dom";
import { untilYear } from "@/lib/api";

export const TimelineCountdown = ({ ep }) => {
  const rows = [ep.coming_near, ep.coming_far].map((p) => ({ ...p, ...untilYear(p.year) }));
  return (
    <section className="panel p-4 sm:p-5" data-testid="timeline-countdown">
      <div className="osd">Your prophecies join the timeline</div>
      {rows.map((r) => (
        <div key={r.year} className="mt-3 pt-3 border-t border-white/10 flex items-start justify-between gap-3" data-testid={`countdown-${r.year}`}>
          <div className="min-w-0">
            <div className="font-display text-3xl text-tape leading-none">{r.year}</div>
            <div className="font-osd text-slate-400 text-base leading-tight mt-1 line-clamp-2">{r.text}</div>
          </div>
          <div className="text-right shrink-0 font-osd">
            <div className={`text-xl leading-none ${r.due ? "text-emerald-400" : "text-white"}`} data-testid={`countdown-${r.year}-label`}>
              {r.label}
            </div>
            <div className="text-slate-500 text-sm mt-1">{r.due ? "check it" : "until it's due"}</div>
          </div>
        </div>
      ))}
      <Link to="/timeline#pending" data-testid="countdown-timeline-link" className="inline-block mt-4 font-osd text-lg text-tape hover:underline">
        See it on the timeline →
      </Link>
    </section>
  );
};
