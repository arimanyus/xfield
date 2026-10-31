import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { Panel, PrimaryButton, Title, ago } from "@/components/admin/kit";

const StoryEditor = ({ s, i, onChange, onRemove, canRemove }) => (
  <div className="rounded-xl border border-slate-200 p-3" data-testid={`paper-story-${i}`}>
    <div className="mb-2 flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Story {i + 1}</span>
      {canRemove && (
        <button type="button" onClick={onRemove} className="ml-auto text-slate-400 transition-colors hover:text-rose-600" data-testid={`paper-story-${i}-remove`}>
          <Trash2 size={15} />
        </button>
      )}
    </div>
    <Input value={s.title} maxLength={140} onChange={(e) => onChange({ ...s, title: e.target.value })} placeholder="Title" className="mb-2 font-semibold" data-testid={`paper-story-${i}-title`} />
    <Textarea value={s.body} maxLength={1500} rows={3} onChange={(e) => onChange({ ...s, body: e.target.value })} placeholder="Story" data-testid={`paper-story-${i}-body`} />
  </div>
);

export function PaperPanel() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState("");
  const load = () => api("/admin/paper").then((d) => { setData(d); setForm(d.paper && { headline: d.paper.headline, stories: d.paper.stories }); });
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, []);
  useEffect(() => {
    if (!data?.publishing) return undefined;
    const t = setInterval(() => load().catch(() => {}), 4000);
    return () => clearInterval(t);
  }, [data?.publishing]);
  if (!data) return <div className="text-slate-500">Loading the Ledger…</div>;
  const save = async () => {
    setBusy("save");
    try {
      const d = await api("/admin/paper", { method: "PUT", body: form });
      setData(d);
      toast.success("Front page updated");
    } catch (e) { toast.error(e.message); } finally { setBusy(""); }
  };
  const publish = async () => {
    setBusy("publish");
    try {
      await api("/admin/paper/publish", { method: "POST" });
      toast.success("Writing a fresh paper. It appears here in about a minute.");
      setData({ ...data, publishing: true });
    } catch (e) { toast.error(e.message); } finally { setBusy(""); }
  };
  const setStory = (i, s) => setForm({ ...form, stories: form.stories.map((x, j) => (j === i ? s : x)) });
  const p = data.paper;
  return (
    <Panel testId="paper-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Title hint={p ? `No. ${p.issue} · ${p.label} · published ${ago(p.published_at)}` : "Nothing published yet."}>Today's Ledger</Title>
        <PrimaryButton tone="brand" onClick={publish} disabled={!!busy || data.publishing} testId="paper-publish-button">
          {data.publishing ? "Writing a new paper…" : "Publish a fresh paper now"}
        </PrimaryButton>
      </div>
      {form && (
        <div className="space-y-3">
          <Input value={form.headline} maxLength={140} onChange={(e) => setForm({ ...form, headline: e.target.value })}
            className="h-12 font-display text-lg font-bold" data-testid="paper-headline-input" />
          {form.stories.map((s, i) => (
            <StoryEditor key={i} s={s} i={i} onChange={(x) => setStory(i, x)} canRemove={form.stories.length > 1}
              onRemove={() => setForm({ ...form, stories: form.stories.filter((_, j) => j !== i) })} />
          ))}
          <div className="flex flex-wrap gap-2">
            <PrimaryButton onClick={save} disabled={!!busy || !form.headline.trim() || form.stories.some((s) => !s.title.trim() || !s.body.trim())} testId="paper-save-button">
              {busy === "save" ? "Saving…" : "Save front page"}
            </PrimaryButton>
            {form.stories.length < 6 && (
              <PrimaryButton tone="soft" onClick={() => setForm({ ...form, stories: [...form.stories, { title: "", body: "" }] })} testId="paper-add-story">
                <Plus size={14} className="mr-1 inline" />Add a story
              </PrimaryButton>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
