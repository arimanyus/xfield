import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { Avatar, Panel, PrimaryButton, Title } from "@/components/admin/kit";

function ResidentRow({ r, onChanged }) {
  const [points, setPoints] = useState(String(r.points));
  const [busy, setBusy] = useState(false);
  useEffect(() => setPoints(String(r.points)), [r.points]);
  const act = async (path, body, done) => {
    setBusy(true);
    try {
      await api(`/admin/residents/${r.h}/${path}`, { method: "POST", body });
      toast.success(done);
      onChanged();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  const id = r.k;
  return (
    <tr className="border-t border-slate-100 align-middle" data-testid={`resident-row-${id}`}>
      <td className="py-2.5 pr-3">
        <div className="flex items-center gap-2.5">
          <Avatar src={r.a} alt={`@${r.h}`} size={32} />
          <div className="min-w-0 leading-tight">
            <a href={`/?at=${r.h}`} className="block truncate font-semibold hover:underline">@{r.h}</a>
            <span className="text-xs text-slate-500">{r.name}</span>
          </div>
        </div>
      </td>
      <td className="py-2.5 pr-3 text-sm" data-testid={`resident-where-${id}`}>{r.where}</td>
      <td className="py-2.5 pr-3">
        {r.lit ? (
          <div className="flex items-center gap-1.5">
            <Input type="number" min={0} max={5000} value={points} onChange={(e) => setPoints(e.target.value)} className="h-8 w-24" data-testid={`resident-points-${id}`} />
            <PrimaryButton tone="soft" className="px-2.5 py-1.5" disabled={busy || points === String(r.points) || points === ""}
              onClick={() => act("points", { points: Number(points) }, "Points updated")} testId={`resident-points-save-${id}`}>Set</PrimaryButton>
          </div>
        ) : <span className="text-sm text-slate-400">–</span>}
      </td>
      <td className="py-2.5 pr-3">
        {r.lit && !r.hidden && (
          <PrimaryButton tone="soft" className="px-2.5 py-1.5" disabled={busy} testId={`resident-move-${id}`}
            onClick={() => act("move", { to: r.uptown ? "docks" : "uptown" }, r.uptown ? "Moved to the Docks" : "Moved uptown")}>
            {r.uptown ? "Send to Docks" : "Move uptown"}
          </PrimaryButton>
        )}
      </td>
      <td className="py-2.5">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={!r.hidden} disabled={busy} data-testid={`resident-visible-${id}`}
            onCheckedChange={(v) => act("hide", { hidden: !v }, v ? "Back in the city" : "Hidden from the city")} />
          {r.hidden ? "Hidden" : "Visible"}
        </label>
      </td>
    </tr>
  );
}

export function ResidentsPanel() {
  const [q, setQ] = useState("");
  const [hidden, setHidden] = useState(false);
  const [rows, setRows] = useState(null);
  const load = useCallback(() => {
    api(`/admin/residents?q=${encodeURIComponent(q)}&hidden=${hidden}`).then((d) => setRows(d.residents)).catch((e) => toast.error(e.message));
  }, [q, hidden]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);
  return (
    <Panel testId="residents-panel">
      <Title hint="Points alone never move anyone. Move uptown lifts points to 1030 if they're lower; Send to Docks drops them to 1029.">Residents</Title>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by handle" className="pl-8" data-testid="residents-search-input" />
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <Switch checked={hidden} onCheckedChange={setHidden} data-testid="residents-hidden-only" /> Hidden only
        </label>
      </div>
      {!rows ? <div className="text-slate-500">Loading…</div> : !rows.length ? <div className="text-slate-500" data-testid="residents-empty">Nobody matches.</div> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left" data-testid="residents-table">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="pb-2">Resident</th><th className="pb-2">Where</th><th className="pb-2">Points</th><th className="pb-2">Move</th><th className="pb-2">In the city</th></tr>
            </thead>
            <tbody>{rows.map((r) => <ResidentRow key={r.k} r={r} onChanged={load} />)}</tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
