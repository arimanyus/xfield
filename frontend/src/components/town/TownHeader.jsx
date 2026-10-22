import { Home, Lightbulb, MapPin, Newspaper } from "lucide-react";

export const TownHeader = ({ stats, onCensus }) => (
  <div className="pointer-events-none absolute left-3 top-3 sm:left-5 sm:top-5 z-20 max-w-[62vw]" data-testid="town-header">
    <h1 className="title-toon text-4xl sm:text-6xl leading-none" data-testid="town-title">
      XFIELD
    </h1>
    {stats && (
      <div className="mt-3 flex flex-wrap gap-2 pointer-events-auto">
        <span className="sticker bg-simp text-sm sm:text-lg inline-flex items-center gap-1.5" data-testid="stat-spots">
          <Home className="w-4 h-4 -mt-1" strokeWidth={3} /> {stats.taken}/{stats.capacity} SPOTS
        </span>
        <span className="sticker bg-white text-sm sm:text-lg inline-flex items-center gap-1.5" data-testid="stat-finished">
          <Lightbulb className="w-4 h-4 -mt-1" strokeWidth={3} /> {stats.finished} LIT
        </span>
        <button type="button" onClick={onCensus} className="sticker bg-[#9FE1B4] text-sm sm:text-lg inline-flex items-center gap-1.5 hover:-translate-y-0.5 hover:bg-[#B8EBC8] transition-[transform,background-color]" data-testid="census-open-button">
          <Newspaper className="w-4 h-4 -mt-1" strokeWidth={3} /> CENSUS
        </button>
        {stats.biggest && (
          <span className="sticker bg-[#FF8FC7] text-sm sm:text-lg hidden sm:inline-flex items-center gap-1.5" data-testid="stat-biggest">
            <MapPin className="w-4 h-4 -mt-1" strokeWidth={3} /> {stats.biggest.name} · {stats.biggest.size}
          </span>
        )}
      </div>
    )}
  </div>
);
