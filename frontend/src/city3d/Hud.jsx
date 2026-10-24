import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { WATER, dockTint, heightAt, modelOf } from "@/city3d/layout";
import { HousePreview } from "@/city3d/City3D";
import { tickerLine } from "@/components/town/Ticker";

export const CARD = "rounded-2xl bg-white/90 backdrop-blur border border-white shadow-[0_8px_30px_rgba(15,23,42,0.18)]";
const WARM = "#FCD34D";

export const isLight = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 170;
};

export const onX = (text, url = window.location.origin) =>
  `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;

export function Face({ p, size = 28, ring = "#FFFFFF", dim = false }) {
  return <img src={p?.a} alt={p ? `@${p.h}` : ""} title={p ? `@${p.h}` : ""} className={`rounded-full bg-sky-light shrink-0 ${dim ? "grayscale opacity-60" : ""}`}
    style={{ width: size, height: size, boxShadow: `0 0 0 2px ${ring}` }} />;
}

export function Btn({ children, onClick, disabled, tone = "ink", className = "", type = "button" }) {
  const tones = { ink: "bg-ink text-white hover:bg-slate-700", brand: "bg-brand text-ink hover:bg-brand-dark", soft: "bg-slate-100 text-ink hover:bg-slate-200" };
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`rounded-lg px-2.5 py-1 text-xs font-bold whitespace-nowrap transition-colors disabled:opacity-40 ${tones[tone]} ${className}`}>
      {children}
    </button>
  );
}

const XLink = ({ href, onClick, className = "", children }) => (
  <a href={href} target="_blank" rel="noreferrer" onClick={onClick}
    className={`rounded-lg bg-ink px-2.5 py-1.5 text-center text-xs font-bold text-white whitespace-nowrap hover:bg-slate-700 ${className}`}>{children}</a>
);
const Close = ({ onClick }) => <button type="button" onClick={onClick} className="self-start text-ink/40 hover:text-ink text-lg leading-none">×</button>;
const Heading = ({ children }) => <div className="mt-2 mb-1 text-[10px] font-bold uppercase tracking-widest text-ink/50">{children}</div>;
const nameOf = (d) => d?.name || "New district";
const names = (ps) => ps.map((p) => `@${p.h}`).join(ps.length > 2 ? ", " : " and ");

const People = ({ people, dim, children }) => (
  <div className="mt-2 flex items-center gap-2 text-sm">
    <span className="flex -space-x-2 shrink-0">{people.map((p) => <Face key={p.k} p={p} size={26} ring={dim ? "#CBD5E1" : WARM} dim={dim} />)}</span>
    <span className="text-ink/80">{children}</span>
  </div>
);

// The first thing a new citizen sees: their lit house, who they live next to, and who is still dark.
export function Arrival({ me, nb, onClose }) {
  const lit = me.street.filter((p) => p.s === "f").slice(0, 2), dark = me.street.filter((p) => p.s === "r").slice(0, 3);
  return (
    <div className={`${CARD} pop w-[min(92vw,360px)] p-4 pointer-events-auto`}>
      <div className="text-[10px] font-bold uppercase tracking-widest text-amber-600">💡 Your lights are on</div>
      <div className="mt-0.5 font-display font-bold text-xl">Welcome home, @{me.h}</div>
      {nb && <div className="text-sm text-ink/70">You live in <b style={{ color: nb.color }}>{nameOf(nb)}</b>, {nb.size} people strong.</div>}
      {lit.length > 0 && <People people={lit}>You're next to {names(lit)}.</People>}
      {dark.length > 0 && <People people={dark} dim>{names(dark)} {dark.length === 1 ? "hasn't" : "haven't"} moved in. Their houses are dark.</People>}
      {me.ladder && !me.ladder.uptown && (
        <div className="mt-2.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-ink/80">
          ⚓ Every house starts on the Docks. Win votes to reach {me.ladder.line} points and yours moves uptown, next to your friends.
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <XLink href={onX(me.share.text, me.share.url)} onClick={onClose} className="flex-1 py-2 text-sm">𝕏 Post your block</XLink>
        <Btn tone="soft" className="text-sm px-3" onClick={onClose}>Look around</Btn>
      </div>
    </div>
  );
}

// Your street: the people you talk to most, lit once they move in.
export function StreetBar({ me, onFocus, onVisit }) {
  const lit = me.street.filter((p) => p.s === "f").length;
  return (
    <div className={`${CARD} w-[min(92vw,340px)] p-2.5 pointer-events-auto`}>
      <div className="flex items-center gap-2.5">
        <button type="button" onClick={onFocus} title="Your house" className="shrink-0"><Face p={{ a: me.avatar_url, h: me.h }} size={40} ring={WARM} /></button>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="font-display font-bold">Your street</div>
          <div className="text-xs text-ink/60">💡 {lit} of {me.street.length} moved in · each adds a floor</div>
        </div>
        <XLink href={onX(me.share.text, me.share.url)}>𝕏 Post your block</XLink>
      </div>
      {me.ladder && <MyStanding l={me.ladder} />}
      {me.street.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {me.street.slice(0, 16).map((p) => (
            <button key={p.k} type="button" onClick={() => onVisit(p)} title={`@${p.h}${p.s === "f" ? "" : " · dark"}`} className="hover:scale-110 transition-transform">
              <Face p={p} size={24} ring={p.s === "f" ? WARM : "#CBD5E1"} dim={p.s !== "f"} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Where a lit house stands: Docks or uptown, its score, and its place among the houses competing.
export function Standing({ l }) {
  const state = !l.ranked ? "not competing" : l.away ? "away, score frozen" : `#${l.rank} of ${l.of}`;
  return <span>{l.uptown ? "🏙 Uptown" : "⚓ Docks"} · <b className="tabular-nums">{l.score}</b> pts · {state}</span>;
}

function MyStanding({ l }) {
  return (
    <div className="mt-2 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs leading-relaxed">
      <Standing l={l} />
      {!l.uptown && l.ranked && <div className="text-ink/60">{Math.max(0, l.line - l.score)} more points to move uptown</div>}
      {l.rabbit && (
        <div className="flex items-center gap-1.5 font-bold">
          🐇 <Face p={l.rabbit} size={16} /> {l.rabbit.gap > 0 ? `@${l.rabbit.h} is ${l.rabbit.gap} ahead of you` : `You're level with @${l.rabbit.h}`}
        </div>
      )}
    </div>
  );
}

const tintOf = (side) => (side.docks ? dockTint(side.c) : side.c || "#A8A29E");
const until = (iso) => {
  const m = Math.max(0, Math.round((new Date(iso) - Date.now()) / 60000));
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

const outcome = (r, who) =>
  r.moved ? `🎉 ${who} moved uptown!` : `+${r.pts} to ${who}. Now #${r.rank} of ${r.of}${r.uptown ? ", uptown" : `, ${r.to_go} pts from uptown`}.`;

// Two houses: your mutuals', or strangers' with no names. Your pick takes points from the other, then you see what it did.
export function VoteCard({ onVoted }) {
  const [a, setA] = useState(null);
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const load = () => api("/arena").then(setA).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!a) return null;
  const vote = async (pick) => {
    setBusy(true);
    setErr(null);
    try {
      setDone(await api("/arena/vote", { method: "POST", body: { pick } }));
      onVoted();
    } catch (e) {
      setErr(e.message);
      load();
    } finally {
      setBusy(false);
    }
  };
  const next = () => { setA(done); setDone(null); };
  const r = done?.last;
  const left = done ? done.left : a.left;
  return (
    <div className={`${CARD} w-[min(92vw,300px)] p-3 pointer-events-auto`}>
      <div className="flex items-center justify-between">
        <div className="font-display font-bold">{a.friends ? "🔥 Who should move up?" : "🗳 Which house wins?"}</div>
        <span className="flex gap-1" title={`${left} of ${a.of} votes left today`}>
          {Array.from({ length: a.of }, (_, i) => <span key={i} className={`h-2.5 w-2.5 rounded-full ${i < left ? "bg-amber-400" : "bg-slate-200"}`} />)}
        </span>
      </div>
      {a.pair.length === 2 ? (
        <>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {a.pair.map((side, i) => {
              const won = r && r.pick === i, lost = r && r.pick !== i;
              return (
                <button key={i} type="button" disabled={busy || !!r} onClick={() => vote(i)}
                  className={`relative overflow-hidden rounded-xl transition ${won ? "bg-amber-50 ring-2 ring-amber-400" : "bg-sky-50"}
                    ${lost ? "opacity-40 grayscale" : ""} ${r ? "" : "hover:bg-amber-50 hover:ring-2 hover:ring-amber-300 disabled:opacity-50"}`}>
                  {won && <span className="rise absolute right-1.5 top-1.5 z-10 rounded-full bg-emerald-500 px-1.5 text-xs font-bold text-white">+{r.pts}</span>}
                  {side.p && (
                    <div className="flex flex-col items-center pt-2">
                      <Face p={side.p} size={44} ring={WARM} />
                      <div className="mt-1 max-w-full truncate px-1 text-xs font-bold">@{side.p.h}</div>
                    </div>
                  )}
                  <HousePreview model={modelOf(side.m, side.docks)} tint={tintOf(side)} />
                  <div className="pb-1 text-[10px] font-bold uppercase tracking-widest text-ink/50">
                    {won && r.moved ? "🏙 Uptown" : side.docks ? "⚓ Docks" : "🏙 Uptown"}{side.e != null && ` · ${won ? r.e : side.e}`}
                  </div>
                </button>
              );
            })}
          </div>
          {r ? (
            <div className="pop mt-2">
              <div className="text-sm font-bold">{outcome(r, a.pair[r.pick].p ? `@${a.pair[r.pick].p.h}` : "that house")}</div>
              <Btn tone={left ? "brand" : "soft"} className="mt-2 w-full py-1.5 text-sm" onClick={next}>
                {left ? `Next pair · ${left} left` : "Done for today"}
              </Btn>
            </div>
          ) : (
            <div className="mt-1.5 text-[11px] text-ink/50">
              {a.friends ? "Tap the one who should move up. They gain points and may find out it was you." : "Tap the house you like. No names; it may find out it was you."}
            </div>
          )}
        </>
      ) : (
        <div className="mt-1.5 text-sm text-ink/70">{a.left ? "Not enough houses to vote on yet." : `✅ You've used your ${a.of} votes. ${a.of} more in ${until(a.next_at)}.`}</div>
      )}
      {err && <div className="mt-1 text-xs text-red-600">{err}</div>}
    </div>
  );
}

const FAMILIES = [["h", "Home", 1], ["m", "Mid-rise", 3], ["t", "Tower", 6]];

// Your own house: how your votes went, who voted for you, the one thing you can change, and the way out.
function MyLadder({ l, onChanged, onLeft }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const run = async (path, body, after) => {
    setBusy(true);
    setErr(null);
    try {
      await api(path, { method: "POST", body });
      await after();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {l.history.length > 0 && <Heading>Your last votes</Heading>}
      <div className="flex flex-wrap gap-1">
        {l.history.map((r) => (
          <span key={r.at} className={`rounded px-1.5 text-[11px] font-bold tabular-nums ${r.pts > 0 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-ink/40"}`}>
            {r.pts > 0 ? `+${r.pts}` : r.pts}
          </span>
        ))}
      </div>
      <Heading>Voted for you</Heading>
      {l.voters.length > 0
        ? <div className="flex -space-x-1.5">{l.voters.map((p) => <Face key={p.k} p={p} size={22} />)}</div>
        : <div className="text-xs text-ink/50">Nobody yet.</div>}
      <div className="text-[11px] text-ink/50">One more is revealed each day.</div>
      <Heading>Your design</Heading>
      <div className="grid grid-cols-4 gap-1">
        {FAMILIES.flatMap(([f, name, need]) => [0, 1, 2, 3].map((i) => {
          const id = `${f}${i}`, locked = l.floors < need;
          return (
            <button key={id} type="button" disabled={busy || locked} title={locked ? `Needs ${need} floors` : undefined}
              onClick={() => run("/me/design", { design: id }, onChanged)}
              className={`rounded-md px-1 py-0.5 text-[11px] font-bold disabled:opacity-40 ${l.design === id ? "bg-amber-300" : "bg-slate-100 hover:bg-slate-200"}`}>
              {name} {i + 1}
            </button>
          );
        }))}
      </div>
      {!l.uptown && <div className="mt-1 text-[11px] text-ink/50">On the Docks every house is a home. Taller designs go up once you move uptown.</div>}
      {err && <div className="mt-1 text-xs text-red-600">{err}</div>}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Btn tone="soft" disabled={busy} onClick={() => run("/me/ranked", { ranked: !l.ranked }, onChanged)}>
          {l.ranked ? "Stop competing" : "Start competing"}
        </Btn>
        <Btn tone="soft" disabled={busy} className="!text-red-600"
          onClick={() => window.confirm("Remove your house from XField and sign out?") && run("/me/leave", undefined, onLeft)}>
          Remove my house
        </Btn>
      </div>
    </>
  );
}

// A house: whose it is, whether its lights are on, and where it stands on the ladder.
export function HouseCard({ house, nb, signedIn, onChanged, onLeft, onClose }) {
  const o = house.owner, lit = o.s === "f";
  const [d, setD] = useState(null);
  const load = () => api(`/residents/${o.h}`).then(setD).catch(() => {});
  useEffect(() => {
    let live = true;
    api(`/residents/${o.h}`).then((r) => live && setD(r)).catch(() => {});
    return () => { live = false; };
  }, [o.h, o.s, o.e, o.m]);
  const fresh = d?.k === o.k ? d : null, l = fresh?.ladder;
  return (
    <div className={`${CARD} pop w-[min(92vw,330px)] p-3 pointer-events-auto`}>
      <div className="flex items-start gap-2.5">
        <Face p={o} size={44} ring={lit ? WARM : "#475569"} dim={!lit} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="font-display font-bold truncate">{fresh?.is_me ? "Your house" : `@${o.h}'s house`}</div>
          <div className="text-xs text-ink/70">
            {lit ? "💡 Lights on" : "🌑 Dark: not moved in yet"} · 🏢 {o.f} {o.f === 1 ? "floor" : "floors"}
            {nb && <> · <b style={{ color: nb.color }}>{nameOf(nb)}</b></>}
          </div>
        </div>
        <Close onClick={onClose} />
      </div>
      {l && <div className="mt-2 text-xs"><Standing l={l} /></div>}
      {fresh?.is_me && l && <MyLadder l={l} onChanged={async () => { await load(); await onChanged(); }} onLeft={onLeft} />}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {signedIn && !lit && fresh && <XLink href={onX(fresh.share.text, fresh.share.url)}>𝕏 Tag them</XLink>}
        <a href={`https://x.com/${o.h}`} target="_blank" rel="noreferrer" className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold">Profile</a>
      </div>
    </div>
  );
}

// Who moved in near you while you were gone.
export function AwayCard({ news, onVisit, onClose }) {
  return (
    <div className={`${CARD} pop w-[min(92vw,340px)] p-3 pointer-events-auto`}>
      <div className="flex items-center justify-between">
        <div className="font-display font-bold">While you were away</div>
        <Close onClick={onClose} />
      </div>
      <ul className="mt-1.5 space-y-1 text-xs">
        {news.slice(0, 6).map((n) => (
          <li key={`${n.p.k}${n.at}`}>
            <button type="button" onClick={() => onVisit(n.p)} className="flex items-center gap-1.5 hover:text-ink/70">
              <Face p={n.p} size={18} /><span>💡 <b>@{n.p.h}</b> moved in near you</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// The bottom ticker: what just happened in the city.
export function TickerBar({ events, people, onVisit }) {
  const items = events.map((e) => ({ text: tickerLine(e), face: people[e.h?.toLowerCase()], go: e.h ? { k: e.h.toLowerCase() } : null }));
  if (!items.length) return null;
  return (
    <div className="absolute inset-x-0 bottom-0 h-9 flex items-center bg-ink text-white text-xs pointer-events-auto">
      <span className="shrink-0 h-full flex items-center bg-red-600 px-3 font-bold tracking-widest">● LIVE</span>
      <div className="flex-1 overflow-hidden">
        <div className="marquee flex w-max" style={{ animationDuration: `${items.length * 5}s` }}>
          {[...items, ...items].map((it, i) => (
            <button key={i} type="button" onClick={() => it.go && onVisit(it.go)} className="flex items-center gap-1.5 px-5 whitespace-nowrap hover:text-amber-200">
              {it.face && <Face p={it.face} size={18} />}
              <span className="font-semibold">{it.text}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const PLACES = { hall: "🏛 City Hall", timeline: "📰 The Timeline", post: "📮 Post Office", arrivals: "🛎 Arrivals", docks: "⚓ The Docks" };

// What each building downtown is for.
export function PlaceCard({ id, town, me, onVisit, onClose }) {
  if (!PLACES[id]) return null;
  return (
    <div className={`${CARD} pop w-[min(92vw,360px)] p-3 pointer-events-auto`}>
      <div className="flex items-center justify-between">
        <div className="font-display font-bold text-lg">{PLACES[id]}</div>
        <Close onClick={onClose} />
      </div>
      <div className="max-h-[55vh] overflow-y-auto">
        {id === "hall" && <Hall town={town} onVisit={onVisit} />}
        {id === "timeline" && <Timeline events={town.ticker} />}
        {id === "post" && <PostOffice me={me} />}
        {id === "arrivals" && <Arrivals people={town.newest} onVisit={onVisit} />}
        {id === "docks" && <Docks town={town} me={me} />}
      </div>
    </div>
  );
}

const Said = ({ p, onVisit, children }) => (
  <li>
    <button type="button" onClick={() => onVisit(p)} className="flex gap-1.5 text-left hover:text-ink/70"><Face p={p} size={20} /><span><b>@{p.h}</b> {children}</span></button>
  </li>
);

function Hall({ town, onVisit }) {
  const { stats } = town;
  const top = town.residents.filter((r) => r.s === "f" && !r.out).sort((a, b) => b.e - a.e).slice(0, 8);
  return (
    <>
      <div className="text-sm text-ink/70">{stats.taken} of {stats.capacity} lots taken · {stats.finished} moved in · {stats.reserved} waiting · {town.neighbourhoods.length} districts</div>
      <Heading>How the city works</Heading>
      <ul className="space-y-1 text-sm">
        <li>🗳 Every day you get {town.ladder.votes} votes: two houses, no names, pick one. The winner takes points from the other.</li>
        <li>⚓ Every house starts on the Docks. At {town.ladder.uptown_at} points it moves uptown, next to your friends.</li>
        <li>📉 Each week, uptown houses that fell under the line go back to the Docks.</li>
        <li>🏢 Every friend who moves in adds a floor, and floors unlock taller designs.</li>
        <li>🗞 The Ledger comes out every morning with the day's climbers.</li>
      </ul>
      {top.length > 0 && <Heading>Top of the ladder</Heading>}
      <ul className="space-y-1.5 text-xs">{top.map((r) => <Said key={r.k} p={r} onVisit={onVisit}>· {r.e} pts{r.u ? " · uptown" : ""}</Said>)}</ul>
    </>
  );
}

const Timeline = ({ events }) => (
  <>
    <Heading>Just happened</Heading>
    <ul className="space-y-1 text-xs">{events.slice(0, 12).map((e, i) => <li key={i}>{tickerLine(e)}</li>)}</ul>
  </>
);

function Docks({ town, me }) {
  const docked = town.residents.filter((r) => r.d != null).length, l = me?.ladder;
  return (
    <div className="text-sm text-ink/70">
      <div>Every house starts here. {docked} {docked === 1 ? "house is" : "houses are"} on the Docks right now.</div>
      <div className="mt-1">Win votes to reach {town.ladder.uptown_at} points and your house moves uptown to its own lot near your friends.</div>
      {l && <div className="mt-2 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-ink"><Standing l={l} /></div>}
    </div>
  );
}

function PostOffice({ me }) {
  if (!me) return <div className="text-sm text-ink/70">Sign in to see who you know that hasn't moved in yet.</div>;
  const waiting = me.street.filter((p) => p.s === "r");
  if (!waiting.length) return <div className="text-sm text-ink/70">Everyone on your street has moved in.</div>;
  return (
    <>
      <div className="text-sm text-ink/70">These people's houses are waiting for them. A tag on X is how they find out.</div>
      <ul className="mt-2 space-y-1.5">
        {waiting.map((p) => (
          <li key={p.k} className="flex items-center gap-2 text-sm">
            <Face p={p} size={24} ring="#CBD5E1" dim />
            <span className="flex-1 min-w-0 truncate font-semibold">@{p.h}</span>
            <XLink href={onX(`@${p.h} your house in XField is waiting for you. Come move in →`, `${window.location.origin}/api/s/${p.h}`)}>𝕏 Tag</XLink>
          </li>
        ))}
      </ul>
    </>
  );
}

const Arrivals = ({ people, onVisit }) => (
  <ul className="mt-1 space-y-1.5">
    {people.map((p) => (
      <li key={p.k}>
        <button type="button" onClick={() => onVisit(p)} className="w-full flex items-center gap-2 text-left text-sm hover:text-ink/70">
          <Face p={p} size={28} ring={WARM} />
          <b>@{p.h}</b>
        </button>
      </li>
    ))}
  </ul>
);

export function Minimap({ city, me, onPick }) {
  const ref = useRef();
  const [x0, x1, z0, z1] = city.island;
  const W = 200, scale = W / (x1 - x0 + 1), H = Math.round((z1 - z0 + 1) * scale);
  useEffect(() => {
    const ctx = ref.current.getContext("2d");
    const px = (x) => (x - x0) * scale, pz = (z) => (z - z0) * scale;
    const img = ctx.createImageData(W, H);
    const data = img.data;
    for (let py = 0; py < H; py++) {
      for (let x = 0; x < W; x++) {
        const h = heightAt(x0 + (x + 0.5) / scale, z0 + (py + 0.5) / scale, city);
        const i = (py * W + x) * 4;
        const c = h < WATER + 0.02 ? [76, 151, 209] : h < WATER + 0.05 ? [228, 210, 168] : h < 0.9 ? [125, 181, 99] : [94, 154, 72];
        data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    for (const p of city.pads) {
      ctx.fillStyle = p.color;
      ctx.fillRect(px(p.x - p.w / 2 + 0.5), pz(p.z - p.d / 2 + 0.5), p.w * scale, p.d * scale);
    }
    ctx.fillStyle = "#94A3B8";
    for (const r of city.roads) ctx.fillRect(px(r.x), pz(r.z), scale, scale);
    for (const h of city.homes) {
      ctx.fillStyle = h.color;
      ctx.fillRect(px(h.x) + 0.5, pz(h.z) + 0.5, scale - 1, scale - 1);
    }
    if (me) {
      ctx.strokeStyle = "#0F172A";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px(me[0] + 0.5), pz(me[1] + 0.5), 5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [city, me, x0, z0, scale, W, H]);
  const click = (e) => {
    const b = e.currentTarget.getBoundingClientRect();
    onPick([x0 + ((e.clientX - b.left) / b.width) * (x1 - x0 + 1) - 0.5, z0 + ((e.clientY - b.top) / b.height) * (z1 - z0 + 1) - 0.5]);
  };
  return (
    <div className={`${CARD} p-1.5 pointer-events-auto`}>
      <canvas ref={ref} width={W} height={H} onClick={click} className="block rounded-xl cursor-pointer" style={{ width: W, height: H }} />
    </div>
  );
}
