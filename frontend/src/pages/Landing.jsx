import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { HandleForm } from "@/components/HandleForm";
import { Ticker } from "@/components/Ticker";
import { StaticScreen } from "@/components/StaticScreen";
import { EpisodeGrid } from "@/components/EpisodeTile";
import { PredictionStrip } from "@/components/PredictionStrip";
import { getRecent, seCode } from "@/lib/api";

const HeroPreview = ({ ep }) => {
  if (!ep || !ep.image_url) {
    return (
      <div className="relative">
        <StaticScreen message="NO SIGNAL" roll={false} />
      </div>
    );
  }
  return (
    <Link to={`/ep/${ep.id}`} data-testid="hero-latest" className="block relative group">
      <div className="tape-frame relative aspect-video overflow-hidden bg-ink-2">
        <img src={ep.image_url} alt={`Still from ${ep.title}`} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.02]" />
        <div className="absolute inset-0 scanlines pointer-events-none" />
      </div>
      <div className="absolute -bottom-3 left-4 osd bg-ink px-2 text-sm">
        LATEST FIND · {seCode(ep)} · @{ep.handle}
      </div>
    </Link>
  );
};

export default function Landing() {
  const { data: recent = [] } = useQuery({ queryKey: ["recent"], queryFn: () => getRecent(24), refetchInterval: 30000 });
  return (
    <main data-testid="landing-page">
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16 pb-12 grid lg:grid-cols-[1.05fr_0.95fr] gap-10 lg:gap-14 items-center">
        <div className="animate-rise">
          <p className="osd" data-testid="hero-osd">
            <span className="text-red-500 animate-blink">●</span> 30 years of Simpsons predictions
          </p>
          <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl leading-[0.92] mt-4 tracking-wide" data-testid="hero-title">
            THE SIMPSONS PREDICTED TRUMP.
            <br />
            <span className="text-tape">THEY PREDICTED YOU TOO.</span>
          </h1>
          <p className="mt-5 text-slate-300 text-base sm:text-lg max-w-xl" data-testid="hero-sub">
            Type an X handle. Get the lost episode, the receipt, and two dated prophecies.
          </p>
          <HandleForm className="mt-8" idPrefix="hero" />
        </div>
        <div className="animate-rise" style={{ animationDelay: "120ms" }}>
          <HeroPreview ep={recent[0]} />
        </div>
      </section>

      <PredictionStrip />

      <Ticker items={recent} />

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14" data-testid="recent-section">
        <div className="flex items-end justify-between mb-5">
          <h2 className="font-display text-4xl tracking-wide">LATEST EPISODES</h2>
          <Link to="/leaderboards" data-testid="recent-leaderboards-link" className="font-osd text-lg text-tape hover:underline">
            Leaderboards →
          </Link>
        </div>
        <EpisodeGrid items={recent.slice(0, 9)} emptyText="Nothing yet. Be first." />
      </section>
    </main>
  );
}
