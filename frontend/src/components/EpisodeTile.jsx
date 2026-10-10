import { Link } from "react-router-dom";
import { seCode } from "@/lib/api";

export const EpisodeTile = ({ ep, index = 0 }) => (
  <Link
    to={`/ep/${ep.id}`}
    data-testid={`episode-tile-${ep.id}`}
    className="group block animate-rise"
    style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
  >
    <div className="relative aspect-video overflow-hidden bg-ink-2 border border-white/10 group-hover:border-tape/60 transition-colors">
      {ep.image_url ? (
        <img src={ep.image_url} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
      ) : (
        <div className="absolute inset-0 static-noise opacity-60" />
      )}
      <div className="absolute inset-0 scanlines pointer-events-none" />
      <div className="absolute top-2 left-2 font-osd text-tape text-base leading-none drop-shadow">{seCode(ep)}</div>
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent p-2 pt-6">
        <div className="font-display text-xl leading-none text-white truncate">“{ep.title}”</div>
        <div className="font-osd text-slate-300 text-base leading-tight truncate">
          @{ep.handle}
          {ep.found_by ? ` · by @${ep.found_by}` : ""}
        </div>
      </div>
    </div>
  </Link>
);

export const EpisodeGrid = ({ items = [], emptyText = "Nothing in the archive yet." }) =>
  items.length ? (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-5" data-testid="episode-grid">
      {items.map((ep, i) => (
        <EpisodeTile key={ep.id} ep={ep} index={i} />
      ))}
    </div>
  ) : (
    <p className="font-osd text-slate-500 text-xl" data-testid="episode-grid-empty">
      {emptyText}
    </p>
  );
