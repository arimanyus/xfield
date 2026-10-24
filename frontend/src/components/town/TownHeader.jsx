import { Building2, Lightbulb, MapPin, Newspaper } from "lucide-react";

export const TownHeader = ({ stats, onCensus }) => (
  <div className="pointer-events-none absolute left-3 top-3 sm:left-5 sm:top-5 z-20 max-w-[62vw]" data-testid="town-header">
    <h1 className="title-display text-4xl sm:text-6xl leading-none" data-testid="town-title">
      XFIELD
    </h1>
    {stats && (
      <div className="mt-3 flex flex-wrap gap-2 pointer-events-auto">
        <span className="sticker bg-brand text-xs sm:text-sm inline-flex items-center gap-1.5" data-testid="stat-spots">
          <Building2 className="w-4 h-4" strokeWidth={2.5} /> {stats.taken}/{stats.capacity} LOTS
        </span>
        <span className="sticker bg-white text-xs sm:text-sm inline-flex items-center gap-1.5" data-testid="stat-finished">
          <Lightbulb className="w-4 h-4" strokeWidth={2.5} /> {stats.finished} LIT
        </span>
        <button type="button" onClick={onCensus} className="sticker bg-[#BFDBFE] text-xs sm:text-sm inline-flex items-center gap-1.5 hover:-translate-y-0.5 transition-transform" data-testid="census-open-button">
          <Newspaper className="w-4 h-4" strokeWidth={2.5} /> LEDGER
        </button>
        {stats.biggest && (
          <span className="sticker bg-white text-xs sm:text-sm hidden sm:inline-flex items-center gap-1.5" data-testid="stat-biggest">
            <MapPin className="w-4 h-4" strokeWidth={2.5} /> {stats.biggest.name} · {stats.biggest.size}
          </span>
        )}
      </div>
    )}
  </div>
);
