import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EpisodeGrid } from "@/components/EpisodeTile";
import { getLeaderboard } from "@/lib/api";

const HandleRows = ({ rows = [], unit, testid }) =>
  rows.length ? (
    <ol className="divide-y divide-white/10" data-testid={testid}>
      {rows.map((r, i) => (
        <li key={r.handle} className="flex items-center gap-4 py-3 animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
          <span className={`font-display text-3xl w-10 ${i < 3 ? "text-tape" : "text-slate-500"}`}>{String(i + 1).padStart(2, "0")}</span>
          {r.avatar_url ? <img src={r.avatar_url} alt="" className="w-10 h-10 object-cover border border-tape/40" /> : <div className="w-10 h-10 bg-ink-3 border border-white/10" />}
          <div className="min-w-0 flex-1">
            <Link to={`/u/${r.handle}`} className="font-display text-2xl tracking-wide hover:text-tape truncate block">
              @{r.handle}
            </Link>
            <Link to={`/ep/${r.latest_id}`} className="font-osd text-slate-400 text-base hover:text-white truncate block">
              latest: “{r.latest_title}”
            </Link>
          </div>
          <div className="text-right">
            <div className="font-display text-3xl text-white leading-none">{r.count}</div>
            <div className="font-osd text-slate-500 text-sm">{unit}</div>
          </div>
        </li>
      ))}
    </ol>
  ) : (
    <p className="font-osd text-slate-500 text-xl py-6" data-testid={`${testid}-empty`}>Nothing here yet.</p>
  );

export default function LeaderboardsPage() {
  const [period, setPeriod] = useState("all");
  const prophesied = useQuery({ queryKey: ["lb", "prophesied", period], queryFn: () => getLeaderboard("prophesied", period) });
  const prophets = useQuery({ queryKey: ["lb", "prophets", period], queryFn: () => getLeaderboard("prophets", period) });
  const shared = useQuery({ queryKey: ["lb", "shared", period], queryFn: () => getLeaderboard("shared", period) });

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12" data-testid="leaderboards-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="osd">Ratings</div>
          <h1 className="font-display text-5xl sm:text-6xl tracking-wide leading-[0.95]">LEADERBOARDS</h1>
        </div>
        <div className="inline-flex border border-white/15 font-osd text-lg" data-testid="period-toggle">
          {[
            ["today", "TODAY"],
            ["all", "ALL TIME"],
          ].map(([k, l]) => (
            <button key={k} type="button" data-testid={`period-${k}`} onClick={() => setPeriod(k)} className={`px-3 py-1 ${period === k ? "bg-tape text-ink" : "text-slate-300 hover:text-white"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <Tabs defaultValue="prophesied" className="mt-8">
        <TabsList className="bg-ink-2 border border-white/10 h-auto p-1 flex flex-wrap justify-start">
          <TabsTrigger value="prophesied" data-testid="tab-prophesied" className="font-display text-xl tracking-wider data-[state=active]:bg-tape data-[state=active]:text-ink">
            Most prophesied
          </TabsTrigger>
          <TabsTrigger value="prophets" data-testid="tab-prophets" className="font-display text-xl tracking-wider data-[state=active]:bg-tape data-[state=active]:text-ink">
            Top prophets
          </TabsTrigger>
          <TabsTrigger value="shared" data-testid="tab-shared" className="font-display text-xl tracking-wider data-[state=active]:bg-tape data-[state=active]:text-ink">
            Most shared
          </TabsTrigger>
        </TabsList>
        <TabsContent value="prophesied" className="mt-4">
          <p className="font-osd text-slate-400 text-lg mb-2">Handles with the most episodes found about them.</p>
          <HandleRows rows={prophesied.data} unit="episodes" testid="lb-prophesied" />
        </TabsContent>
        <TabsContent value="prophets" className="mt-4">
          <p className="font-osd text-slate-400 text-lg mb-2">Handles that found the most episodes about others.</p>
          <HandleRows rows={prophets.data} unit="found" testid="lb-prophets" />
        </TabsContent>
        <TabsContent value="shared" className="mt-4">
          <p className="font-osd text-slate-400 text-lg mb-4">Episodes with the most share clicks.</p>
          <div data-testid="lb-shared">
            <EpisodeGrid items={shared.data || []} emptyText="No shares counted yet." />
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}
