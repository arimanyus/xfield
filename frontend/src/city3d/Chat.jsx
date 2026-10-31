import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SmilePlus } from "lucide-react";
import { api } from "@/lib/api";
import { CARD, Face } from "@/city3d/Hud";

const WHERE = { docks: "⚓ Docks", uptown: "🏙 Uptown" };
const SEEN = "xf_chat_seen";
const REACTIONS = [["fire", "🔥"], ["lol", "😂"], ["love", "❤️"], ["eyes", "👀"], ["gem", "💎"]];
const EMOJI = Object.fromEntries(REACTIONS);
const byTime = (a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0);
const ago = (iso) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
  return m < 1 ? "now" : m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`;
};

// The city chat: polls every few seconds while open, more slowly while closed so the button can count what's new and
// mentions still arrive. Each poll brings what was posted, reacted to or removed since the last one.
function useChat(open, onMentions) {
  const [messages, setMessages] = useState([]);
  const [muted, setMuted] = useState(false);
  const cursor = useRef(null);
  const mentions = useRef(onMentions);
  mentions.current = onMentions;
  const merge = useCallback((list, removed = []) => setMessages((ms) => {
    const gone = new Set(removed), next = new Map(ms.filter((m) => !gone.has(m.id)).map((m) => [m.id, m]));
    for (const m of list) if (!gone.has(m.id)) next.set(m.id, m);
    return [...next.values()].sort(byTime).slice(-200);
  }), []);
  const pull = useCallback(() => api(`/chat${cursor.current ? `?after=${encodeURIComponent(cursor.current)}` : ""}`).then((d) => {
    cursor.current = d.cursor;
    setMuted(Boolean(d.me?.muted));
    merge(d.messages, d.removed);
    if (d.me?.mentions?.length) mentions.current(d.me.mentions);
  }).catch(() => {}), [merge]);
  useEffect(() => {
    pull();
    const id = setInterval(pull, open ? 3000 : 10000);
    return () => clearInterval(id);
  }, [pull, open]);
  const send = async (text) => merge([await api("/chat", { method: "POST", body: { text } })]);
  const react = (id, r) => api(`/chat/${id}/react`, { method: "POST", body: { r } }).then((m) => merge([m])).catch((e) => toast.error(e.message));
  return { messages, muted, send, react };
}

// @handles in a message open that person's house; your own handle is highlighted.
const Text = ({ text, meK, onVisit }) => text.split(/(@\w{1,15})/g).map((part, i) => {
  if (!/^@\w+$/.test(part)) return <span key={i}>{part}</span>;
  const k = part.slice(1).toLowerCase();
  return (
    <button key={i} type="button" onClick={() => onVisit({ k })}
      className={`font-semibold text-sky-700 hover:underline ${k === meK ? "rounded bg-amber-100 px-0.5" : ""}`}>{part}</button>
  );
});

function Reactions({ m, picking, canReact, onReact }) {
  if (!m.reactions.length && !picking) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1" data-testid={`chat-reactions-${m.id}`}>
      {m.reactions.map((x) => (
        <button key={x.r} type="button" disabled={!canReact} onClick={() => onReact(x.r)} data-testid={`chat-reaction-${m.id}-${x.r}`}
          className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs tabular-nums transition-colors disabled:cursor-default ${x.mine ? "bg-amber-100 ring-1 ring-amber-300" : "bg-slate-100 enabled:hover:bg-slate-200"}`}>
          <span>{EMOJI[x.r]}</span><span className="font-semibold text-ink/70">{x.n}</span>
        </button>
      ))}
      {picking && (
        <div className="pop flex gap-0.5 rounded-full bg-white px-1 py-0.5 shadow ring-1 ring-slate-200" data-testid={`chat-react-picker-${m.id}`}>
          {REACTIONS.map(([r, e]) => (
            <button key={r} type="button" onClick={() => onReact(r)} data-testid={`chat-react-${m.id}-${r}`} aria-label={r}
              className="rounded-full px-1 text-base transition-transform hover:scale-125">{e}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function Message({ m, meK, flash, canReact, onReact, onVisit }) {
  const [picking, setPicking] = useState(false);
  const react = (r) => { setPicking(false); onReact(m.id, r); };
  return (
    <li data-msg={m.id} data-testid={`chat-message-${m.id}`}
      className={`group flex gap-2 rounded-lg px-1 py-0.5 transition-colors duration-700 ${flash ? "bg-amber-100" : ""}`}>
      <button type="button" onClick={() => onVisit(m)} className="shrink-0 self-start transition-transform hover:scale-110">
        <Face p={m} size={28} ring={m.k === meK ? "#FCD34D" : "#FFFFFF"} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[11px]">
          <button type="button" onClick={() => onVisit(m)} className="truncate text-xs font-bold text-ink hover:underline">@{m.h}</button>
          <span className="shrink-0 text-ink/50">{m.where === "mansion" ? `💎 Mansion #${m.rank}` : WHERE[m.where]}</span>
          <span className="shrink-0 tabular-nums text-ink/40">· {ago(m.at)}</span>
          {canReact && (
            <button type="button" onClick={() => setPicking((p) => !p)} aria-label="React" data-testid={`chat-react-open-${m.id}`}
              className="ml-auto shrink-0 rounded-full p-0.5 text-ink/40 transition-opacity hover:bg-slate-100 hover:text-ink sm:opacity-0 sm:group-hover:opacity-100">
              <SmilePlus size={14} />
            </button>
          )}
        </div>
        <div className="break-words text-sm text-ink/90" data-testid="chat-message-text"><Text text={m.text} meK={meK} onVisit={onVisit} /></div>
        <Reactions m={m} picking={picking} canReact={canReact} onReact={react} />
      </div>
    </li>
  );
}

const NOTE = {
  dark: ["chat-not-lit", "Your lights come on first, then you can chat."],
  muted: ["chat-muted", "You're muted in the city chat. You can still read it."],
};

function Composer({ state, onSend, onSignIn }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  if (state === "out") {
    return (
      <button type="button" onClick={onSignIn} data-testid="chat-sign-in"
        className="w-full rounded-lg bg-ink py-2 text-sm font-bold text-white transition-colors hover:bg-slate-700">Sign in with X to chat</button>
    );
  }
  if (NOTE[state]) return <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-ink/70" data-testid={NOTE[state][0]}>{NOTE[state][1]}</div>;
  const submit = async (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await onSend(t);
      setText("");
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} data-testid="chat-form">
      <div className="flex gap-1.5">
        <input value={text} maxLength={280} onChange={(e) => setText(e.target.value)} placeholder="Say something to the city…" data-testid="chat-input"
          className="min-w-0 flex-1 rounded-lg bg-slate-100 px-3 py-2 text-sm outline-none transition-shadow focus:ring-2 focus:ring-amber-300" />
        <button type="submit" disabled={busy || !text.trim()} data-testid="chat-send"
          className="rounded-lg bg-ink px-3.5 text-sm font-bold text-white transition-colors hover:bg-slate-700 disabled:opacity-40">Send</button>
      </div>
      {err && <div className="mt-1 text-xs text-red-600" data-testid="chat-error">{err}</div>}
      {text.length > 240 && <div className="mt-1 text-right text-[11px] tabular-nums text-ink/50">{280 - text.length} left</div>}
    </form>
  );
}

function ChatWindow({ messages, me, state, target, onSend, onReact, onSignIn, onVisit, onClose }) {
  const list = useRef();
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [messages.length]);
  useEffect(() => {
    list.current?.querySelector(`[data-msg="${target?.id}"]`)?.scrollIntoView({ block: "center" });
  }, [target, messages.length]);
  return (
    <div className={`${CARD} pop pointer-events-auto fixed inset-x-2 bottom-10 z-30 flex h-[65vh] flex-col sm:absolute sm:inset-x-auto sm:bottom-12 sm:right-4 sm:h-[min(62vh,520px)] sm:w-[360px]`}
      data-testid="chat-panel">
      <div className="flex items-center justify-between border-b border-slate-200/70 px-3 py-2.5">
        <div className="leading-tight">
          <div className="font-display text-lg font-bold">💬 City chat</div>
          <div className="text-[11px] text-ink/60">Everyone in XField, live</div>
        </div>
        <button type="button" onClick={onClose} data-testid="chat-close" className="text-lg leading-none text-ink/40 hover:text-ink">×</button>
      </div>
      <ul ref={list} className="flex-1 space-y-1.5 overflow-y-auto px-2 py-2.5" data-testid="chat-messages">
        {messages.map((m) => (
          <Message key={m.id} m={m} meK={me?.k} flash={target?.id === m.id} canReact={state === "in"} onReact={onReact} onVisit={onVisit} />
        ))}
        {!messages.length && <li className="py-8 text-center text-sm text-ink/50" data-testid="chat-empty">No messages yet. Say hi to the city.</li>}
      </ul>
      <div className="border-t border-slate-200/70 p-2.5"><Composer state={state} onSend={onSend} onSignIn={onSignIn} /></div>
    </div>
  );
}

function MentionToast({ m, count, onJump, onClose }) {
  const key = count > 1 ? "many" : m.id;
  return (
    <div className={`${CARD} flex w-[min(92vw,360px)] items-start gap-2.5 p-3`} data-testid={`mention-toast-${key}`}>
      <Face p={m} size={34} ring="#FCD34D" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold">{count > 1 ? `You were mentioned ${count} times while you were away` : `@${m.h} mentioned you`}</div>
        {count === 1 && <div className="line-clamp-2 break-words text-xs text-ink/70">{m.text}</div>}
        <div className="mt-2 flex items-center gap-3">
          <button type="button" onClick={onJump} data-testid={`mention-toast-jump-${key}`}
            className="rounded-lg bg-ink px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-slate-700">Jump in</button>
          <button type="button" onClick={onClose} data-testid={`mention-toast-dismiss-${key}`} className="text-xs text-ink/50 hover:text-ink">Dismiss</button>
        </div>
      </div>
    </div>
  );
}

// Mentions you haven't seen: shown once as toasts (or one summary when many piled up), then marked seen.
// With the chat already open the message just lights up instead.
function useMentionAlerts(openRef, jump) {
  const shown = useRef(new Set());
  return useCallback((list) => {
    const fresh = list.filter((m) => !shown.current.has(m.id));
    if (!fresh.length) return;
    fresh.forEach((m) => shown.current.add(m.id));
    api("/chat/mentions/seen", { method: "POST", body: { ids: fresh.map((m) => m.id) } }).catch(() => {});
    if (openRef.current) return jump(fresh[fresh.length - 1].msg_id);
    const show = (m, count, to) => toast.custom((t) => (
      <MentionToast m={m} count={count} onJump={() => { toast.dismiss(t); jump(to); }} onClose={() => toast.dismiss(t)} />
    ), { duration: 12000 });
    if (fresh.length > 3) show(fresh[fresh.length - 1], fresh.length, fresh[0].msg_id);
    else fresh.forEach((m) => show(m, 1, m.msg_id));
  }, [openRef, jump]);
}

// One chat room for the whole city. Anyone can read it; residents whose lights are on can post and react.
export function Chat({ user, me, onSignIn, onVisit }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(null);
  const openRef = useRef(open);
  openRef.current = open;
  const jump = useCallback((id) => {
    setOpen(true);
    setTarget({ id, t: Date.now() });
  }, []);
  const { messages, muted, send, react } = useChat(open, useMentionAlerts(openRef, jump));
  useEffect(() => {
    if (!target) return;
    const id = setTimeout(() => setTarget(null), 3500);
    return () => clearTimeout(id);
  }, [target]);
  const [seen, setSeen] = useState(() => localStorage.getItem(SEEN));
  const newest = messages[messages.length - 1]?.at || "";
  useEffect(() => {
    if (!newest || (seen !== null && (!open || newest <= seen))) return;
    localStorage.setItem(SEEN, newest);
    setSeen(newest);
  }, [open, newest, seen]);
  const unread = seen === null ? 0 : messages.filter((m) => m.at > seen && m.k !== user?.k).length;
  const state = !user ? "out" : muted ? "muted" : me?.status !== "finished" ? "dark" : "in";
  if (open) {
    return <ChatWindow messages={messages} me={user} state={state} target={target} onSend={send} onReact={react} onSignIn={onSignIn}
      onClose={() => setOpen(false)} onVisit={(p) => { setOpen(window.innerWidth >= 640); onVisit(p); }} />;
  }
  return (
    <button type="button" onClick={() => setOpen(true)} data-testid="chat-open-button"
      className="pointer-events-auto absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-ink py-2 pl-3.5 pr-3 text-sm font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5 sm:bottom-12 sm:right-[240px] sm:top-auto">
      💬 City chat
      {unread > 0 && <span className="rounded-full bg-amber-300 px-1.5 text-xs tabular-nums text-ink" data-testid="chat-unread">{unread > 9 ? "9+" : unread}</span>}
    </button>
  );
}
