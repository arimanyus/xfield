import { useState } from "react";
import { Link } from "react-router-dom";
import { StaticScreen } from "@/components/StaticScreen";
import { airedLabel, seCode } from "@/lib/api";

export const EpisodeCard = ({ ep }) => {
  const ready = ep.image_status === "ready" && ep.image_url;
  const [loaded, setLoaded] = useState(false);
  const failed = ep.image_status === "failed";
  return (
    <figure data-testid="episode-card" className="tape-frame relative aspect-video bg-ink-2 overflow-hidden">
      {ready && (
        <img
          src={ep.image_url}
          alt={`Still from ${ep.title}`}
          data-testid="episode-still"
          onLoad={() => setLoaded(true)}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      )}
      {(!ready || !loaded) && (
        <StaticScreen fill roll={!failed} message={failed ? "TAPE DAMAGED" : ready ? "LOADING STILL…" : "DEVELOPING THE STILL…"} />
      )}
    </figure>
  );
};

export const EpisodeMeta = ({ ep }) => (
  <div className="mt-5" data-testid="episode-meta">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 osd">
      <span data-testid="episode-code">{seCode(ep)}</span>
      <span className="text-slate-500">·</span>
      <span className="text-white" data-testid="episode-aired">AIRED {airedLabel(ep.aired_date)}</span>
    </div>
    <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl leading-[0.95] mt-2" data-testid="episode-title">
      “{ep.title}”
    </h1>
    {ep.cast?.length > 0 && (
      <div className="mt-2 font-osd text-base sm:text-lg text-slate-400 uppercase tracking-wide" data-testid="episode-cast">
        Starring {ep.cast.join(", ")} &amp; <span className="text-white">@{ep.handle}</span>
      </div>
    )}
    <div className="mt-2 font-osd text-lg sm:text-xl text-slate-300 flex flex-wrap items-center gap-x-2">
      <span>about</span>
      <Link to={`/u/${ep.handle}`} data-testid="episode-handle-link" className="text-tape hover:underline">
        @{ep.handle}
      </Link>
      {ep.found_by && (
        <>
          <span className="text-slate-500">·</span>
          <span>found by</span>
          <Link to={`/u/${ep.found_by}`} data-testid="episode-found-by-link" className="text-white hover:underline">
            @{ep.found_by}
          </Link>
        </>
      )}
    </div>
  </div>
);
