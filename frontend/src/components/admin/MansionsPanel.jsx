import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api } from "@/lib/api";
import { Avatar, Panel, PrimaryButton, Title, ago } from "@/components/admin/kit";

export const utc = (iso) => (iso ? `${new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit",
  minute: "2-digit", timeZone: "UTC" })} UTC` : "");

function Person({ p, rank, was, testId }) {
  return (
    <li className="flex items-center gap-3 border-t border-slate-100 py-2 first:border-0" data-testid={testId}>
      <span className="w-8 shrink-0 font-display text-lg font-bold tabular-nums text-slate-400">{rank ? `#${rank}` : "·"}</span>
      <Avatar src={p.a} alt={`@${p.h}`} size={30} />
      <a href={`/?at=${p.h}`} className="min-w-0 flex-1 truncate font-semibold hover:underline">@{p.h}</a>
      <span className="text-sm tabular-nums text-slate-600">
        {p.points} pts{was != null && was !== p.points && <span className="text-slate-400"> (was {was})</span>}
      </span>
      {rank && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{rank <= 2 ? "Estate" : "Villa"}</span>}
    </li>
  );
}

function HandOut({ onDone }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const d = await api("/admin/mansions/hand-out", { method: "POST" });
      toast.success(`Week ${d.week} handed out`);
      onDone(d);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };
  return (
    <>
      <PrimaryButton tone="brand" className="mt-4" disabled={busy} onClick={() => setOpen(true)} testId="mansions-hand-out-button">
        {busy ? "Handing out…" : "Hand out now"}
      </PrimaryButton>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent data-testid="mansions-hand-out-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Hand out all 10 mansions now?</AlertDialogTitle>
            <AlertDialogDescription>
              Everyone on the row moves out and the current top 10 move in until next Monday 9:00 UTC. The Monday handover still runs as usual.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="mansions-hand-out-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={go} data-testid="mansions-hand-out-confirm">Hand out now</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function MansionsPanel() {
  const [d, setD] = useState(null);
  const load = useCallback(() => api("/admin/mansions").then(setD).catch((e) => toast.error(e.message)), []);
  useEffect(() => { load(); }, [load]);
  if (!d) return <div className="text-slate-500">Loading…</div>;
  const first = !d.week;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel testId="mansions-holders-panel">
        <Title hint={first ? `No handover yet. The first one runs ${utc(d.next_at)}.`
          : `Week ${d.week}, handed out ${ago(d.handed_at)}. Keys until ${utc(d.until)}.`}>Millionaires' Row</Title>
        {first ? <div className="text-sm text-slate-500" data-testid="mansions-empty">The mansions show "Handover Monday" signs until then.</div> : (
          <ol data-testid="mansions-holders">
            {d.holders.map((p) => <Person key={p.k} p={p} rank={p.rank} was={p.was} testId={`mansions-holder-${p.rank}`} />)}
          </ol>
        )}
      </Panel>
      <Panel testId="mansions-next-panel">
        <Title hint={`Next automatic handover: ${utc(d.next_at)}. Every week the whole row is handed out again.`}>
          {first ? "Who moves in at the first handover" : "Next in line"}
        </Title>
        <ol data-testid="mansions-next">
          {d.next.map((p, i) => <Person key={p.k} p={p} rank={first ? i + 1 : null} testId={`mansions-next-${i + 1}`} />)}
        </ol>
        {!d.next.length && <div className="text-sm text-slate-500">Nobody is on the ladder yet.</div>}
        <HandOut onDone={setD} />
      </Panel>
    </div>
  );
}
