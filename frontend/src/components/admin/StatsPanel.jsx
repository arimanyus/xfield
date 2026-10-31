import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { Avatar, Panel, Stat, Title, ago } from "@/components/admin/kit";

const People = ({ rows, right, testId }) => (
  <ol className="space-y-2" data-testid={testId}>
    {rows.map((r, i) => (
      <li key={r.k} className="flex items-center gap-2.5 text-sm">
        <span className="w-5 text-right font-semibold tabular-nums text-slate-400">{i + 1}</span>
        <Avatar src={r.a} alt={`@${r.h}`} />
        <a href={`/?at=${r.h}`} className="min-w-0 flex-1 truncate font-semibold hover:underline">@{r.h}</a>
        <span className="shrink-0 tabular-nums text-slate-500">{right(r)}</span>
      </li>
    ))}
  </ol>
);

// Everything at a glance, refreshed every 15 seconds.
export function StatsPanel() {
  const [s, setS] = useState(null);
  const [at, setAt] = useState(null);
  useEffect(() => {
    let live = true;
    const load = () => api("/admin/stats").then((d) => { if (live) { setS(d); setAt(new Date()); } }).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => { live = false; clearInterval(t); };
  }, []);
  if (!s) return <div className="text-slate-500" data-testid="stats-loading">Loading stats…</div>;
  const { people, ground, signups, votes, shares } = s;
  return (
    <div className="space-y-5" data-testid="stats-panel">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <RefreshCw size={12} className="animate-spin [animation-duration:3s]" /> Live · updated {at?.toLocaleTimeString()}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Lights on" value={people.lit} sub={`${people.dark} dark · ${people.hidden} hidden`} testId="stat-lit" />
        <Stat label="Sign-ups" value={signups.day} sub={`last 24h · ${signups.week} this week`} testId="stat-signups" />
        <Stat label="Votes" value={votes.day} sub={`last 24h · ${votes.total} all time`} testId="stat-votes" />
        <Stat label="Share clicks" value={shares.opens.day} sub={`last 24h · ${shares.opens.total} all time · ${shares.previews.total} X previews`} testId="stat-shares" />
        <Stat label="Ground spots" value={`${ground.taken}/${ground.capacity}`} sub={`${people.floors} floors built on top`} testId="stat-ground" />
        <Stat label="Uptown" value={people.uptown} sub={`${people.lit - people.uptown} on the Docks`} testId="stat-uptown" />
        <Stat label="Votes today" value={votes.today} sub="since midnight UTC" testId="stat-votes-today" />
        <Stat label="Latest Ledger" value={s.paper ? `No. ${s.paper.issue}` : "–"} sub={s.paper ? ago(s.paper.published_at) : "not published yet"} testId="stat-paper" />
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        <Panel><Title>Top of the ladder</Title><People rows={s.top} right={(r) => `${r.points} pts`} testId="stats-top" /></Panel>
        <Panel><Title>Tallest buildings</Title><People rows={s.tallest} right={(r) => `${r.size} floors`} testId="stats-tallest" /></Panel>
        <Panel><Title>Just moved in</Title><People rows={s.recent} right={(r) => ago(r.joined)} testId="stats-recent" /></Panel>
      </div>
    </div>
  );
}
