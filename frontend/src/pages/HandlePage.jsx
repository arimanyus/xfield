import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { EpisodeGrid } from "@/components/EpisodeTile";
import { StaticScreen } from "@/components/StaticScreen";
import { errMsg, getHandle } from "@/lib/api";

export default function HandlePage() {
  const { handle } = useParams();
  const { data, error, isLoading } = useQuery({ queryKey: ["handle", handle], queryFn: () => getHandle(handle) });

  if (isLoading) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-12">
        <StaticScreen message={`TUNING TO @${handle.toUpperCase()}…`} roll={false} />
      </main>
    );
  }
  if (error) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-12" data-testid="handle-error">
        <StaticScreen message="NO SUCH CHANNEL" sub={errMsg(error)} roll={false} />
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12" data-testid="handle-page">
      <header className="flex flex-col sm:flex-row sm:items-end gap-5 animate-rise">
        {data.avatar_url ? (
          <img src={data.avatar_url} alt="" className="w-24 h-24 sm:w-28 sm:h-28 object-cover border-2 border-tape/60 tape-frame" data-testid="handle-avatar" />
        ) : (
          <div className="w-24 h-24 sm:w-28 sm:h-28 bg-ink-2 border-2 border-tape/60 static-noise" />
        )}
        <div className="min-w-0 flex-1">
          <div className="osd">Channel</div>
          <h1 className="font-display text-5xl sm:text-6xl leading-[0.95] tracking-wide truncate" data-testid="handle-name">
            {data.name}
          </h1>
          <div className="font-osd text-xl text-slate-300" data-testid="handle-at">@{data.handle}</div>
          {data.bio && <p className="text-slate-400 mt-2 max-w-2xl text-sm sm:text-base" data-testid="handle-bio">{data.bio}</p>}
        </div>
        <div className="flex gap-6 font-osd text-lg">
          <div>
            <div className="text-slate-500">EPISODES ABOUT</div>
            <div className="font-display text-4xl text-tape leading-none" data-testid="handle-episode-count">{data.episode_count}</div>
          </div>
          <div>
            <div className="text-slate-500">FOUND FOR OTHERS</div>
            <div className="font-display text-4xl text-white leading-none" data-testid="handle-prophet-count">{data.prophet_count}</div>
          </div>
        </div>
      </header>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link to={`/find?handle=${data.handle}`} data-testid="handle-find-another" className="btn-tape">
          Another episode about @{data.handle}
        </Link>
        <Link to="/" data-testid="handle-find-mine" className="btn-ghost">
          Find mine
        </Link>
      </div>

      <section className="mt-10">
        <div className="osd mb-4">All episodes · newest first</div>
        <EpisodeGrid items={data.episodes} emptyText={`No episode about @${data.handle} yet. Be the one who finds it.`} />
      </section>
    </main>
  );
}
