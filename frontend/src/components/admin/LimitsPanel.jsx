import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { Panel, PrimaryButton, Title } from "@/components/admin/kit";

export function LimitsPanel() {
  const [d, setD] = useState(null);
  const [form, setForm] = useState({ town_capacity: "", moveins_per_hour: "" });
  const [busy, setBusy] = useState(false);
  const edited = useRef(false);
  const take = (x) => { setD(x); setForm({ town_capacity: String(x.town_capacity), moveins_per_hour: String(x.moveins_per_hour) }); };
  const edit = (k, v) => { edited.current = true; setForm((f) => ({ ...f, [k]: v })); };
  useEffect(() => {
    api("/admin/settings").then((x) => (edited.current ? setD(x) : take(x))).catch((e) => toast.error(e.message));
  }, []);
  if (!d) return <div className="text-slate-500">Loading…</div>;
  const save = async () => {
    setBusy(true);
    try {
      take(await api("/admin/settings", { method: "PUT", body: { town_capacity: Number(form.town_capacity), moveins_per_hour: Number(form.moveins_per_hour) } }));
      edited.current = false;
      toast.success("City limits saved");
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  const cap = Number(form.town_capacity);
  return (
    <Panel className="max-w-xl" testId="limits-panel">
      <Title hint={`${d.taken} ground spots taken now, ${d.floors} floors built on top.`}>City limits</Title>
      <div className="space-y-4">
        <div>
          <Label htmlFor="cap" className="font-semibold">Ground spots</Label>
          <Input id="cap" type="number" min={10} max={100000} value={form.town_capacity} onChange={(e) => edit("town_capacity", e.target.value)} className="mt-1.5" data-testid="limits-capacity-input" />
          <p className="mt-1 text-xs text-slate-500">
            {cap > d.taken ? `${cap - d.taken} new arrivals will get their own ground spot before floors start again.`
              : "The ground is full at this number: newcomers move in as floors on top of buildings."}
          </p>
        </div>
        <div>
          <Label htmlFor="rate" className="font-semibold">Move-ins per hour (per visitor)</Label>
          <Input id="rate" type="number" min={1} max={100000} value={form.moveins_per_hour} onChange={(e) => edit("moveins_per_hour", e.target.value)} className="mt-1.5" data-testid="limits-rate-input" />
          <p className="mt-1 text-xs text-slate-500">How many houses one visitor can add in an hour, to stop spam.</p>
        </div>
        <PrimaryButton onClick={save} disabled={busy || !form.town_capacity || !form.moveins_per_hour} testId="limits-save-button">{busy ? "Saving…" : "Save limits"}</PrimaryButton>
      </div>
    </Panel>
  );
}
