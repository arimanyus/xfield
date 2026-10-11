import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { EpisodeCard, EpisodeMeta } from "@/components/EpisodeCard";
import { ProphecyLines } from "@/components/ProphecyLines";
import { ShareBar } from "@/components/ShareBar";
import { ReportButton } from "@/components/ReportButton";
import { RerollButton } from "@/components/RerollButton";
import { TimelineCountdown } from "@/components/TimelineCountdown";
import { HandleForm } from "@/components/HandleForm";
import { StaticScreen } from "@/components/StaticScreen";
import { cleanHandle, errMsg, getEpisode, HANDLE_RE, retryEpisode, seCode } from "@/lib/api";

const WritingScreen = ({ ep }) => {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 45000);
    return () => clearTimeout(t);
  }, []);
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12" data-testid="episode-writing">
      <div className="osd mb-4">Searching the archive…</div>
      <StaticScreen message="SEARCHING THE SPRINGFIELD ARCHIVE…" sub={`@${ep.handle}`} />
      <p className="font-osd text-slate-500 text-lg mt-4" data-testid="writing-note">
        {slow ? "Slow day in the writers' room. Still working." : "Updates by itself."}
      </p>
    </main>
  );
};

const FailedScreen = ({ ep }) => {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const retry = async () => {
    setBusy(true);
    try {
      const fresh = await retryEpisode(ep.id);
      qc.setQueryData(["ep", ep.id], fresh);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12" data-testid="episode-failed">
      <div className="osd mb-4">Signal lost</div>
      <StaticScreen message="TAPE DAMAGED" sub={`@${ep.handle}`} roll={false} />
      <section className="panel p-5 mt-6">
        <h2 className="font-display text-3xl tracking-wide">The archive hiccuped.</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" onClick={retry} disabled={busy} data-testid="episode-retry-btn" className="btn-tape">
            {busy ? "Rewinding…" : "Try again"}
          </button>
          <Link to="/" data-testid="episode-failed-home" className="btn-ghost">
            Start over
          </Link>
        </div>
      </section>
    </main>
  );
};

const ProphesyFriend = ({ ep }) => {
  const navigate = useNavigate();
  const [friend, setFriend] = useState("");
  const [you, setYou] = useState(ep.found_by || ep.handle);
  const go = (e) => {
    e.preventDefault();
    const f = cleanHandle(friend);
    const y = cleanHandle(you);
    if (!HANDLE_RE.test(f)) return toast.error("Enter your friend's handle.");
    if (!HANDLE_RE.test(y)) return toast.error("Add your handle too.");
    navigate(`/find?handle=${f}&by=${y}`);
  };
  return (
    <form onSubmit={go} className="panel p-4 sm:p-5" data-testid="prophesy-friend-form">
      <div className="osd">Prophesy a friend</div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <input data-testid="friend-handle-input" value={friend} onChange={(e) => setFriend(e.target.value)} placeholder="@friend" className="input-tape text-lg py-2" autoCapitalize="none" spellCheck={false} />
        <input data-testid="friend-your-handle-input" value={you} onChange={(e) => setYou(e.target.value)} placeholder="@you" className="input-tape text-lg py-2" autoCapitalize="none" spellCheck={false} />
      </div>
      <button type="submit" data-testid="friend-submit" className="btn-ghost w-full mt-3 text-lg py-2">
        Find their episode
      </button>
    </form>
  );
};

export default function EpisodePage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const fresh = params.get("fresh") === "1";
  const [shares, setShares] = useState(null);
  const { data: ep, error, isLoading } = useQuery({
    queryKey: ["ep", id],
    queryFn: () => getEpisode(id),
    retry: 2,
    refetchInterval: (q) => {
      const d = q.state.data;
      return d && (d.text_status === "pending" || d.image_status === "pending") ? 2000 : false;
    },
  });

  useEffect(() => {
    if (ep?.title) document.title = `${seCode(ep)} “${ep.title}” — @${ep.handle} · Already Aired`;
    return () => {
      document.title = "Already Aired — The Simpsons predicted you";
    };
  }, [ep]);

  if (isLoading) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-12">
        <StaticScreen message="REWINDING…" roll={false} />
      </main>
    );
  }
  if (error || !ep) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-12" data-testid="episode-missing">
        <StaticScreen message="NOT IN THE ARCHIVE" sub={errMsg(error)} roll={false} />
        <Link to="/" className="btn-tape inline-block mt-6">Find your episode</Link>
      </main>
    );
  }

  if (ep.text_status === "pending") return <WritingScreen ep={ep} />;
  if (ep.text_status === "failed") return <FailedScreen ep={ep} />;

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10" data-testid="episode-page">
      <div className="grid lg:grid-cols-[1.25fr_0.75fr] gap-8 lg:gap-12 items-start">
        <div className="animate-tv-on">
          <EpisodeCard ep={ep} />
          <EpisodeMeta ep={ep} />
          <ShareBar ep={ep} onShared={setShares} />
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 font-osd text-lg text-slate-500">
            <span data-testid="share-count">{shares ?? ep.shares} shares</span>
            <RerollButton ep={ep} />
            <ReportButton ep={ep} />
          </div>
        </div>

        <aside className="space-y-8 animate-rise" style={{ animationDelay: "150ms" }}>
          <ProphecyLines ep={ep} fresh={fresh} />
          <TimelineCountdown ep={ep} />
          <ProphesyFriend ep={ep} />
          <Link to={`/u/${ep.handle}`} data-testid="see-all-handle-link" className="block font-osd text-xl text-tape hover:underline">
            See all episodes about @{ep.handle} →
          </Link>
        </aside>
      </div>

      <section className="mt-16 border-t border-tape/20 pt-10 grid lg:grid-cols-2 gap-8 items-center" data-testid="episode-cta">
        <h2 className="font-display text-4xl sm:text-5xl tracking-wide leading-[0.95]">
          THE SIMPSONS GOT TRUMP. <span className="text-tape">THEY'LL GET YOU TOO.</span>
        </h2>
        <HandleForm idPrefix="cta" />
      </section>
    </main>
  );
}
