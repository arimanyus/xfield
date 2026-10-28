import { useState } from "react";
import { Loader2, Lock, Plus, X } from "lucide-react";
import { api } from "@/lib/api";
import { CARD, Face, onX } from "@/city3d/Hud";

const MAX = 3;
const WARM = "#FCD34D";

export const tagText = (people) =>
  `${people.map((p) => `@${p.h}`).join(" ")} I saved you a house next to mine in XField. Come turn your lights on and vote me uptown →`;

const Chip = ({ p, locked, onRemove }) => (
  <li className="flex items-center gap-2 rounded-xl bg-slate-50 px-2 py-1.5" data-testid={`invite-chip-${p.k}`}>
    <Face p={p} size={28} ring={p.lit ? WARM : "#CBD5E1"} dim={!p.lit} />
    <span className="min-w-0 flex-1 leading-tight">
      <span className="block truncate text-sm font-bold">@{p.h}</span>
      <span className="block truncate text-[11px] text-ink/60">{p.lit ? "Already lives in XField" : "Gets a dark house next to yours"}</span>
    </span>
    {locked ? <Lock className="w-3.5 h-3.5 text-ink/40" strokeWidth={2.5} aria-label="Invited for good" />
      : (
        <button type="button" onClick={onRemove} className="text-ink/40 hover:text-ink" aria-label={`Remove @${p.h}`} data-testid={`invite-remove-${p.k}`}>
          <X className="w-4 h-4" strokeWidth={3} />
        </button>
      )}
  </li>
);

function Sent({ me, people, onTagged, onClose }) {
  const dark = people.filter((p) => !p.lit);
  return (
    <div className="pop" data-testid="invite-sent">
      <div className="font-display font-bold text-xl">Their houses are up</div>
      <div className="mt-1 text-sm text-ink/70">
        {dark.length ? "They're dark until they sign in. A tag on X is how they find out." : "They already live here. Now vote them up."}
      </div>
      <div className="mt-3 flex -space-x-2">{people.map((p) => <Face key={p.k} p={p} size={34} ring={p.lit ? WARM : "#CBD5E1"} dim={!p.lit} />)}</div>
      <div className="mt-4 flex gap-2">
        {dark.length > 0 && (
          <a href={onX(tagText(dark), me.share.url)} target="_blank" rel="noreferrer" onClick={onTagged}
            className="flex-1 rounded-lg bg-ink py-2 text-center text-sm font-bold text-white hover:bg-slate-700" data-testid="invite-tag-button">
            𝕏 Tag them
          </a>
        )}
        <button type="button" onClick={onClose} className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold hover:bg-slate-200" data-testid="invite-done-button">
          {dark.length ? "Later" : "Done"}
        </button>
      </div>
    </div>
  );
}

// Invite up to 3 people. Anyone not here yet gets a dark house next to yours. Invites are for good.
export function PeoplePicker({ me, onSaved, onTagged, onClose }) {
  const locked = me.street.map((p) => ({ k: p.k, h: p.h, a: p.a, lit: p.s === "f" }));
  const [fresh, setFresh] = useState([]);
  const [sent, setSent] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const left = MAX - locked.length - fresh.length;
  const has = (k) => [...locked, ...fresh].some((p) => p.k === k);

  const add = async () => {
    const h = text.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "").split(/[/?]/)[0];
    if (!h || left <= 0) return;
    if (has(h.toLowerCase())) return setText("");
    setBusy(true);
    setErr(null);
    try {
      const p = await api(`/people/lookup?handle=${encodeURIComponent(h)}`);
      setFresh((ps) => (ps.some((x) => x.k === p.k) ? ps : [...ps, p]));
      setText("");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const send = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api("/me/people", { method: "POST", body: { handles: fresh.map((p) => p.h) } });
      setSent([...locked, ...fresh]);
      await onSaved();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`${CARD} pop w-[min(92vw,400px)] p-4 pointer-events-auto`} data-testid="invite-picker">
      {sent ? <Sent me={me} people={sent} onTagged={() => { onTagged(); onClose(); }} onClose={onClose} /> : (
        <>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-display font-bold text-xl">Invite your people</div>
              <div className="mt-1 text-sm text-ink/70">
                Up to {MAX} people you talk to on X. Each gets a dark house next to yours until they sign in, adds a floor to yours when they do, and votes with you.
              </div>
            </div>
            <button type="button" onClick={onClose} className="text-ink/40 hover:text-ink text-lg leading-none" aria-label="Close" data-testid="invite-close-button">×</button>
          </div>
          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
            <label className="flex flex-1 items-center rounded-lg bg-slate-100 px-2.5 focus-within:ring-2 focus-within:ring-amber-300">
              <span className="text-ink/50 font-bold">@</span>
              <input value={text} onChange={(e) => setText(e.target.value)} disabled={left <= 0} placeholder={left <= 0 ? "That's all 3" : "handle"}
                className="w-full bg-transparent px-1 py-2 text-sm font-semibold outline-none" autoFocus data-testid="invite-input" />
            </label>
            <button type="submit" disabled={busy || left <= 0 || !text.trim()} className="rounded-lg bg-ink text-white px-3 text-sm font-bold disabled:opacity-40 inline-flex items-center gap-1" data-testid="invite-add-button">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" strokeWidth={3} />} Add
            </button>
          </form>
          {err && <div className="mt-1.5 text-xs font-semibold text-red-600" data-testid="invite-error">{err}</div>}
          <ul className="mt-3 space-y-1.5">
            {locked.map((p) => <Chip key={p.k} p={p} locked />)}
            {fresh.map((p) => <Chip key={p.k} p={p} onRemove={() => setFresh((ps) => ps.filter((x) => x.k !== p.k))} />)}
            {Array.from({ length: Math.max(0, left) }, (_, i) => (
              <li key={`empty${i}`} className="rounded-xl border-2 border-dashed border-slate-200 px-3 py-2 text-xs font-semibold text-ink/40">Empty lot next to yours</li>
            ))}
          </ul>
          <div className="mt-2 text-[11px] text-ink/50">Invites are for good: you can't swap someone out later. You lift your neighbours by voting for them.</div>
          <div className="mt-3 flex items-center gap-2">
            <span className="mr-auto text-xs font-bold text-ink/50 tabular-nums" data-testid="invite-count">{locked.length + fresh.length}/{MAX} invited</span>
            <button type="button" onClick={onClose} className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold hover:bg-slate-200" data-testid="invite-later-button">Later</button>
            <button type="button" onClick={send} disabled={busy || !fresh.length} className="rounded-lg bg-brand text-ink px-4 py-2 text-sm font-bold hover:bg-brand-dark disabled:opacity-40" data-testid="invite-send-button">
              {fresh.length > 1 ? `Send ${fresh.length} invites` : "Send invite"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
