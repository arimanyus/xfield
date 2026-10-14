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
      className="toon toon-lift scroll-mt-36 px-4 sm:px-5 pt-4 sm:pt-5 pb-6"
      style={{ "--toon-bg": p.featured ? "#FFD90F" : "#FFFDF0", transform: `rotate(${tilt}deg)` }}
      data-testid={`prediction-card-${p.id}`}
    >
      <span className="sticker absolute z-10 -top-5 right-4 rotate-3 text-base sm:text-xl" style={{ background: color }} data-testid={`prediction-gap-${p.id}`}>
        {gapLabel(p).toUpperCase()}
      </span>

      <img
        src={`/art/cards/${p.id}.webp`}
        alt={`Cartoon scene: ${p.headline}`}
        width="960"
        height="540"
        loading="lazy"
        className="block w-full aspect-video object-cover rounded-2xl border-4 border-ink bg-sky-light"
        data-testid={`prediction-image-${p.id}`}
      />

      <div className="px-1 sm:px-2">
        <div className="flex items-end gap-3 -mt-7 relative">
          <span className="shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-full border-4 border-ink grid place-items-center shadow-[3px_3px_0_#111]" style={{ background: color }}>
            <Icon className="w-7 h-7 sm:w-8 sm:h-8" strokeWidth={2.5} />
          </span>
          <div className="font-head font-bold text-sm sm:text-base uppercase tracking-wide text-ink/70 pb-1 min-w-0" data-testid={`prediction-episode-${p.id}`}>
            {p.code} · “{p.title}”
          </div>
        </div>
        <h3 className="font-head font-bold text-2xl sm:text-3xl leading-[1.1] mt-3" data-testid={`prediction-headline-${p.id}`}>
          {p.headline}
        </h3>

      <p className="font-body font-bold text-lg sm:text-xl leading-snug mt-3" data-testid={`prediction-detail-${p.id}`}>
        {p.detail}
      </p>

      <div className="mt-5 flex items-center gap-3" data-testid={`prediction-years-${p.id}`}>
        <YearTag label="Aired" year={p.aired} bg="#FFFFFF" />
        <ArrowRight className="w-7 h-7 shrink-0" strokeWidth={3.5} />
        <YearTag label="Came true" year={p.event} bg="#4ADE80" />
      </div>
      </div>
    </article>
  );
};
