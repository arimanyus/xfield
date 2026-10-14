import { ArrowRight } from "lucide-react";
import { CAT_COLOR, gapLabel, iconFor } from "@/data/look";

const YearTag = ({ label, year, bg }) => (
  <span className="sticker px-4" style={{ background: bg }}>
    <span className="block font-head font-bold text-xs sm:text-sm uppercase tracking-wide">{label}</span>
    <span className="block text-2xl sm:text-3xl mt-0.5">{year}</span>
  </span>
);

export const PredictionCard = ({ p, tilt }) => {
  const Icon = iconFor(p.id);
  const color = CAT_COLOR[p.category];
  return (
    <article
      id={p.id}
      className="toon toon-lift scroll-mt-36 px-5 sm:px-7 pt-8 pb-6"
      style={{ "--toon-bg": p.featured ? "#FFD90F" : "#FFFDF0", transform: `rotate(${tilt}deg)` }}
      data-testid={`prediction-card-${p.id}`}
    >
      <span className="sticker absolute -top-5 right-4 rotate-3 text-base sm:text-xl" style={{ background: color }} data-testid={`prediction-gap-${p.id}`}>
        {gapLabel(p).toUpperCase()}
      </span>

      <div className="flex items-start gap-4">
        <span className="shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-full border-4 border-ink grid place-items-center shadow-[3px_3px_0_#111]" style={{ background: color }}>
          <Icon className="w-7 h-7 sm:w-8 sm:h-8" strokeWidth={2.5} />
        </span>
        <div className="min-w-0">
          <div className="font-head font-bold text-sm sm:text-base uppercase tracking-wide text-ink/70" data-testid={`prediction-episode-${p.id}`}>
            {p.code} · “{p.title}”
          </div>
          <h3 className="font-head font-bold text-2xl sm:text-3xl leading-[1.1] mt-1" data-testid={`prediction-headline-${p.id}`}>
            {p.headline}
          </h3>
        </div>
      </div>

      <p className="font-body font-bold text-lg sm:text-xl leading-snug mt-4" data-testid={`prediction-detail-${p.id}`}>
        {p.detail}
      </p>

      <div className="mt-5 flex items-center gap-3" data-testid={`prediction-years-${p.id}`}>
        <YearTag label="Aired" year={p.aired} bg="#FFFFFF" />
        <ArrowRight className="w-7 h-7 shrink-0" strokeWidth={3.5} />
        <YearTag label="Came true" year={p.event} bg="#4ADE80" />
      </div>
    </article>
  );
};
