import { Home, Lightbulb, MapPin } from "lucide-react";

const fmt = (n) => (n ?? 0).toLocaleString("en-US");

export const TownHeader = ({ stats }) => (
  <div className="pointer-events-none absolute left-3 top-3 sm:left-5 sm:top-5 z-20 max-w-[70vw]" data-testid="town-header">
    <h1 className="title-toon-sm text-3xl sm:text-5xl leading-none" data-testid="town-title">
      SPRINGFIELD, X
    </h1>
    {stats && (
      <div className="mt-3 flex flex-wrap gap-2 pointer-events-auto">
        <span className="sticker bg-white text-sm sm:text-lg inline-flex items-center gap-1.5" data-testid="stat-population">
          <Home className="w-4 h-4 -mt-1" strokeWidth={3} /> {fmt(stats.population)}
        </span>
        <span className="sticker bg-simp text-sm sm:text-lg inline-flex items-center gap-1.5" data-testid="stat-finished">
          <Lightbulb className="w-4 h-4 -mt-1" strokeWidth={3} /> {fmt(stats.finished)} lit
        </span>
        {stats.biggest && (
          <span className="sticker bg-[#FF8FC7] text-sm sm:text-lg hidden sm:inline-flex items-center gap-1.5" data-testid="stat-biggest">
            <MapPin className="w-4 h-4 -mt-1" strokeWidth={3} /> {stats.biggest.name} · {stats.biggest.size}
          </span>
        )}
      </div>
    )}
  </div>
);
