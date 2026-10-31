import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Avatar, Panel, PrimaryButton, Title, ago } from "@/components/admin/kit";

function ChatRow({ m, onDelete, onMute }) {
  return (
    <li className={`flex items-start gap-3 border-t border-slate-100 py-2.5 first:border-0 ${m.deleted ? "opacity-50" : ""}`} data-testid={`chat-admin-row-${m.id}`}>
      <Avatar src={m.a} alt={`@${m.h}`} size={30} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2 text-sm">
          <a href={`/?at=${m.h}`} className="font-semibold hover:underline">@{m.h}</a>
          <span className="text-xs text-slate-400">{ago(m.at)}</span>
          {m.deleted && <span className="rounded bg-rose-50 px-1.5 text-xs font-semibold text-rose-700">Removed</span>}
          {m.muted && <span className="rounded bg-amber-50 px-1.5 text-xs font-semibold text-amber-800">Muted</span>}
        </div>
        <p className="break-words text-sm text-slate-700">{m.text}</p>
      </div>
      <div className="flex shrink-0 gap-1.5">
        {!m.deleted && <PrimaryButton tone="danger" className="px-2.5 py-1.5" onClick={() => onDelete(m)} testId={`chat-admin-delete-${m.id}`}>Remove</PrimaryButton>}
        <PrimaryButton tone="soft" className="px-2.5 py-1.5" onClick={() => onMute(m.h, !m.muted)} testId={`chat-admin-mute-${m.id}`}>
          {m.muted ? "Unmute" : "Mute"}
        </PrimaryButton>
      </div>
    </li>
  );
}

export function ChatPanel() {
  const [d, setD] = useState(null);
  const load = useCallback(() => api("/admin/chat").then(setD).catch((e) => toast.error(e.message)), []);
  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);
  if (!d) return <div className="text-slate-500">Loading…</div>;
  const act = async (fn, done) => {
    try {
      await fn();
      toast.success(done);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };
  const remove = (m) => act(() => api(`/admin/chat/${m.id}`, { method: "DELETE" }), "Message removed");
  const mute = (h, muted) => act(() => api(`/admin/chat/mute/${h}`, { method: "POST", body: { muted } }), muted ? `@${h} muted` : `@${h} can chat again`);
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <Panel testId="chat-admin-messages">
        <Title hint="The last 100 messages, newest first. Removing one takes it out of everyone's chat.">City chat</Title>
        {d.messages.length ? <ol>{d.messages.map((m) => <ChatRow key={m.id} m={m} onDelete={remove} onMute={mute} />)}</ol>
          : <div className="text-sm text-slate-500" data-testid="chat-admin-empty">Nobody has said anything yet.</div>}
      </Panel>
      <Panel testId="chat-admin-muted">
        <Title hint="Muted people can still read the chat, but can't post.">Muted</Title>
        {d.muted.length ? (
          <ul>
            {d.muted.map((p) => (
              <li key={p.k} className="flex items-center gap-2.5 border-t border-slate-100 py-2 first:border-0" data-testid={`chat-admin-muted-${p.k}`}>
                <Avatar src={p.a} alt={`@${p.h}`} size={28} />
                <span className="min-w-0 flex-1 truncate font-semibold">@{p.h}</span>
                <PrimaryButton tone="soft" className="px-2.5 py-1.5" onClick={() => mute(p.h, false)} testId={`chat-admin-unmute-${p.k}`}>Unmute</PrimaryButton>
              </li>
            ))}
          </ul>
        ) : <div className="text-sm text-slate-500">Nobody is muted.</div>}
      </Panel>
    </div>
  );
}
