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
        <StaticScreen message="NO SIGNAL" sub="be the first handle in the archive" roll={false} />
        <div className="absolute -bottom-3 left-4 osd bg-ink px-2 text-sm">ARCHIVE PREVIEW</div>
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

const steps = [
  ["01", "Type a handle", "Yours, or a friend's. No login, nothing posted on your behalf."],
  ["02", "We read the posts", "Only public, original posts and the bio. Confirm three labels in one tap. Savage by default."],
  ["03", "The episode airs", "A Simpsons still with the real cast, what already came true, and two dated prophecies that join the timeline. Share the card. Tag them."],
];

export default function Landing() {
  const { data: recent = [] } = useQuery({ queryKey: ["recent"], queryFn: () => getRecent(24), refetchInterval: 30000 });
  return (
    <main data-testid="landing-page">
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16 pb-12 grid lg:grid-cols-[1.05fr_0.95fr] gap-10 lg:gap-14 items-center">
        <div className="animate-rise">
          <p className="osd" data-testid="hero-osd">
            <span className="text-red-500 animate-blink">●</span> Inspired by 30 years of Simpsons predictions
          </p>
          <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl leading-[0.92] mt-4 tracking-wide" data-testid="hero-title">
            THE SIMPSONS DID IT TO THE WORLD.
            <br />
            <span className="text-tape">NOW IT'S YOUR TURN.</span>
          </h1>
          <p className="mt-5 text-slate-300 text-base sm:text-lg max-w-xl leading-relaxed" data-testid="hero-sub">
            The Simpsons called President Trump 16 years early, Disney buying Fox 21 years early, the smartwatch 20 years early. Type an X
            handle and we pull the lost Springfield episode that predicted <em>them</em> — Homer, Mr. Burns and the rest of the cast
            included. One thing that already came true, two still coming.
          </p>
          <HandleForm className="mt-8" idPrefix="hero" />
        </div>
        <div className="animate-rise" style={{ animationDelay: "120ms" }}>
          <HeroPreview ep={recent[0]} />
        </div>
      </section>

      <PredictionStrip />

      <Ticker items={recent} />

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 grid md:grid-cols-3 gap-6" data-testid="how-it-works">
        {steps.map(([n, h, p]) => (
          <div key={n} className="border-t-2 border-tape/40 pt-4">
            <div className="osd">{n}</div>
            <h2 className="font-display text-3xl mt-1 tracking-wide">{h}</h2>
            <p className="text-slate-400 mt-2 text-sm sm:text-base">{p}</p>
          </div>
        ))}
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16" data-testid="recent-section">
        <div className="flex items-end justify-between mb-5">
          <div>
            <div className="osd">Recently recovered</div>
            <h2 className="font-display text-4xl tracking-wide mt-1">Latest episodes</h2>
          </div>
          <Link to="/leaderboards" data-testid="recent-leaderboards-link" className="font-osd text-lg text-tape hover:underline">
            Leaderboards →
          </Link>
        </div>
        <EpisodeGrid items={recent.slice(0, 9)} emptyText="The archive is empty. Yours would be the first." />
      </section>
    </main>
  );
}
