import { useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { Panel, PrimaryButton, Title } from "@/components/admin/kit";

const ORIGIN = process.env.REACT_APP_BACKEND_URL;

// Shrinks a picture in the browser before it goes up, so big photos upload fast.
const shrink = (file) => new Promise((done, fail) => {
  const img = new Image();
  img.onload = () => {
    const s = Math.min(1, 2048 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * s);
    c.height = Math.round(img.height * s);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    c.toBlob((b) => (b ? done(b) : fail(new Error("Couldn't read that picture."))), "image/jpeg", 0.9);
    URL.revokeObjectURL(img.src);
  };
  img.onerror = () => fail(new Error("That file isn't a picture."));
  img.src = URL.createObjectURL(file);
});

async function upload(id, file) {
  const form = new FormData();
  form.append("file", await shrink(file), "billboard.jpg");
  const res = await fetch(`${ORIGIN}/api/admin/billboards/${id}/image`, { method: "POST", credentials: "include", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Upload failed.");
  return data;
}

function BillboardEditor({ board, onSaved }) {
  const [form, setForm] = useState({ caption: board.caption, link: board.link, enabled: board.enabled });
  const [busy, setBusy] = useState("");
  const fileRef = useRef(null);
  useEffect(() => setForm({ caption: board.caption, link: board.link, enabled: board.enabled }), [board]);
  const run = async (what, fn, done) => {
    setBusy(what);
    try {
      onSaved(await fn());
      toast.success(done);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy("");
    }
  };
  const save = () => run("save", () => api(`/admin/billboards/${board.id}`, { method: "PUT", body: form }), "Billboard saved");
  const toggle = (enabled) => {
    const next = { ...form, enabled };
    setForm(next);
    run("save", () => api(`/admin/billboards/${board.id}`, { method: "PUT", body: next }), enabled ? "Billboard switched on" : "Billboard switched off");
  };
  const pick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) run("upload", () => upload(board.id, f), "Picture uploaded");
  };
  const clear = () => run("clear", () => api(`/admin/billboards/${board.id}/image`, { method: "DELETE" }), "Picture removed");
  const id = board.id;
  return (
    <Panel testId={`billboard-${id}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-bold">{board.name}</h3>
          <p className="text-xs uppercase tracking-wide text-slate-500">{board.size === "huge" ? "Huge · downtown skyline" : "Regular"}</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          {form.enabled ? "Showing" : "Hidden"}
          <Switch checked={form.enabled} disabled={!!busy} onCheckedChange={toggle} data-testid={`billboard-${id}-enabled`} />
        </label>
      </div>
      <div className="relative mb-3 aspect-video overflow-hidden rounded-xl bg-slate-900" data-testid={`billboard-${id}-preview`}>
        {board.image_url ? <img src={`${ORIGIN}${board.image_url}`} alt={board.caption || board.name} className="h-full w-full object-cover" />
          : <div className="grid h-full place-items-center text-sm text-slate-400">No picture yet</div>}
        {form.caption && <div className="absolute inset-x-0 bottom-0 bg-slate-900/80 px-3 py-1.5 text-sm font-bold text-white">{form.caption}</div>}
      </div>
      <div className="space-y-2.5">
        <Input value={form.caption} maxLength={80} placeholder="Caption (optional)" onChange={(e) => setForm({ ...form, caption: e.target.value })} data-testid={`billboard-${id}-caption`} />
        <Input value={form.link} maxLength={500} placeholder="Link, e.g. https://…" onChange={(e) => setForm({ ...form, link: e.target.value })} data-testid={`billboard-${id}-link`} />
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pick} data-testid={`billboard-${id}-file`} />
        <div className="flex flex-wrap gap-2">
          <PrimaryButton onClick={save} disabled={!!busy} testId={`billboard-${id}-save`}>{busy === "save" ? "Saving…" : "Save"}</PrimaryButton>
          <PrimaryButton tone="soft" onClick={() => fileRef.current?.click()} disabled={!!busy} testId={`billboard-${id}-upload`}>
            <ImagePlus size={14} className="mr-1 inline" />{busy === "upload" ? "Uploading…" : board.image_url ? "Replace picture" : "Upload picture"}
          </PrimaryButton>
          {board.image_url && (
            <PrimaryButton tone="danger" onClick={clear} disabled={!!busy} testId={`billboard-${id}-clear`}><Trash2 size={14} className="mr-1 inline" />Remove</PrimaryButton>
          )}
        </div>
      </div>
    </Panel>
  );
}

export function BillboardsPanel() {
  const [boards, setBoards] = useState(null);
  useEffect(() => { api("/admin/billboards").then((d) => setBoards(d.billboards)).catch((e) => toast.error(e.message)); }, []);
  if (!boards) return <div className="text-slate-500">Loading billboards…</div>;
  const saved = (b) => setBoards((all) => all.map((x) => (x.id === b.id ? b : x)));
  return (
    <div data-testid="billboards-panel">
      <Title hint="A billboard shows in the city once it has a picture and is switched on. Clicking it opens its link.">Billboards</Title>
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {boards.map((b) => <BillboardEditor key={b.id} board={b} onSaved={saved} />)}
      </div>
    </div>
  );
}
