import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { CARD, Face } from "@/city3d/Hud";

const WHERE = { docks: "⚓ Docks", uptown: "🏙 Uptown" };
const SEEN = "xf_chat_seen";
const ago = (iso) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
  return m < 1 ? "now" : m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`;
};

// The city chat: polls every few seconds while open, slowly while closed so the button can count what's new.
function useChat(open) {
  const [messages, setMessages] = useState([]);
  const [muted, setMuted] = useState(false);
  const last = useRef(null);
  const add = useCallback((list, removed = []) => setMessages((ms) => {
    const gone = new Set(removed), have = new Set(ms.map((m) => m.id));
    return [...ms.filter((m) => !gone.has(m.id)), ...list.filter((m) => !have.has(m.id))].slice(-200);
  }), []);
  const pull = useCallback(() => api(`/chat${last.current ? `?after=${encodeURIComponent(last.current)}` : ""}`).then((d) => {
    setMuted(Boolean(d.me?.muted));
    if (d.messages.length) last.current = d.messages[d.messages.length - 1].at;
    add(d.messages, d.removed);
  }).catch(() => {}), [add]);
  useEffect(() => {
    pull();
    const id = setInterval(pull, open ? 3000 : 15000);
    return () => clearInterval(id);
  }, [pull, open]);
  const send = async (text) => add([await api("/chat", { method: "POST", body: { text } })]);
  return { messages, muted, send };
}

// @handles in a message open that person's house.
const Text = ({ text, onVisit }) => text.split(/(@\w{1,15})/g).map((part, i) => (/^@\w+$/.test(part)
  ? <button key={i} type="button" onClick={() => onVisit({ k: part.slice(1).toLowerCase() })} className="font-semibold text-sky-700 hover:underline">{part}</button>
  : <span key={i}>{part}</span>));

function Message({ m, mine, onVisit }) {
  return (
    <li className="flex gap-2" data-testid={`chat-message-${m.id}`}>
      <button type="button" onClick={() => onVisit(m)} className="shrink-0 self-start transition-transform hover:scale-110">
        <Face p={m} size={28} ring={mine ? "#FCD34D" : "#FFFFFF"} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5 text-[11px]">
          <button type="button" onClick={() => onVisit(m)} className="truncate text-xs font-bold text-ink hover:underline">@{m.h}</button>
          <span className="shrink-0 text-ink/50">{m.where === "mansion" ? `💎 Mansion #${m.rank}` : WHERE[m.where]}</span>
          <span className="ml-auto shrink-0 tabular-nums text-ink/40">{ago(m.at)}</span>
        </div>
        <div className="break-words text-sm text-ink/90" data-testid="chat-message-text"><Text text={m.text} onVisit={onVisit} /></div>
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

function ChatWindow({ messages, me, state, onSend, onSignIn, onVisit, onClose }) {
  const list = useRef();
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [messages.length]);
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
      <ul ref={list} className="flex-1 space-y-2.5 overflow-y-auto px-3 py-2.5" data-testid="chat-messages">
        {messages.map((m) => <Message key={m.id} m={m} mine={m.k === me?.k} onVisit={onVisit} />)}
        {!messages.length && <li className="py-8 text-center text-sm text-ink/50" data-testid="chat-empty">No messages yet. Say hi to the city.</li>}
      </ul>
      <div className="border-t border-slate-200/70 p-2.5"><Composer state={state} onSend={onSend} onSignIn={onSignIn} /></div>
    </div>
  );
}

// One chat room for the whole city. Anyone can read it; residents whose lights are on can post.
export function Chat({ user, me, onSignIn, onVisit }) {
  const [open, setOpen] = useState(false);
  const { messages, muted, send } = useChat(open);
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
    return <ChatWindow messages={messages} me={user} state={state} onSend={send} onSignIn={onSignIn} onClose={() => setOpen(false)}
      onVisit={(p) => { setOpen(window.innerWidth >= 640); onVisit(p); }} />;
  }
  return (
    <button type="button" onClick={() => setOpen(true)} data-testid="chat-open-button"
      className="pointer-events-auto absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-ink py-2 pl-3.5 pr-3 text-sm font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5 sm:bottom-12 sm:right-[240px] sm:top-auto">
      💬 City chat
      {unread > 0 && <span className="rounded-full bg-amber-300 px-1.5 text-xs tabular-nums text-ink" data-testid="chat-unread">{unread > 9 ? "9+" : unread}</span>}
    </button>
  );
}
