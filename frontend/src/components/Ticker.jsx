import { Link } from "react-router-dom";
import { seCode } from "@/lib/api";

export const Ticker = ({ items = [] }) => {
  if (!items.length) {
    return (
      <div className="border-y border-tape/20 bg-ink-2/60 py-2 font-osd text-lg text-slate-400 overflow-hidden" data-testid="ticker-empty">
        <div className="max-w-6xl mx-auto px-4 flex items-center gap-3">
          <span className="text-red-500 animate-blink">●</span> NO EPISODES FOUND YET · THE ARCHIVE IS WAITING FOR THE FIRST HANDLE
        </div>
      </div>
    );
  }
  const row = [...items, ...items];
  return (
    <div className="border-y border-tape/20 bg-ink-2/60 py-2 overflow-hidden relative" data-testid="ticker">
      <div className="absolute left-0 top-0 bottom-0 z-10 px-3 flex items-center bg-ink-2 font-osd text-tape text-lg border-r border-tape/30">
        <span className="text-red-500 animate-blink mr-2">●</span> JUST FOUND
      </div>
      <div className="flex gap-10 whitespace-nowrap animate-marquee pl-40 hover:[animation-play-state:paused]">
        {row.map((ep, i) => (
          <Link key={`${ep.id}-${i}`} to={`/ep/${ep.id}`} className="font-osd text-lg sm:text-xl text-slate-200 hover:text-tape inline-flex items-center gap-3">
            {ep.image_url ? (
              <img src={ep.image_url} alt="" className="h-7 w-12 object-cover border border-white/20" />
            ) : (
              <span className="h-7 w-12 static-noise inline-block border border-white/20" />
            )}
            <span className="text-tape">{seCode(ep)}</span>
            <span>@{ep.handle}</span>
            <span className="text-slate-500">“{ep.title}”</span>
          </Link>
        ))}
      </div>
    </div>
  );
};
