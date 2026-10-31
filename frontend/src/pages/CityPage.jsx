import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { buildCity, tileOf } from "@/city3d/layout";
import { City3D } from "@/city3d/City3D";
import { Logo } from "@/city3d/Logo";
import { Newspaper } from "@/city3d/Newspaper";
import { NextMove } from "@/city3d/NextMove";
import { PeoplePicker } from "@/city3d/PeoplePicker";
import { Tour } from "@/city3d/Tour";
import { AwayCard, CARD, Face, HouseCard, Minimap, PlaceCard, TickerBar, VoteCard, isLight } from "@/city3d/Hud";

const TITLE = "XField: your city on X, lit up by your friends";
const DAY = 86400000;
const SNAP_VERSION = "close-up-4";
const newsToast = (n) => ({ text: `💡 @${n.p.h} just moved in near you`, face: n.p, visit: n.p, cta: "Visit" });
const SIGNIN_ERRORS = {
  off: "Sign in with X is switched off right now.",
  cancelled: "Sign in was cancelled on X.",
  expired: "That sign in took too long or opened in another browser. Try again.",
  x_error: "X didn't let us in. Try again in a minute.",
};

// Pictures your house and street from the city, for your share card. Only when something on it changed, or a day on.
function useSnapshot({ me, mine, homeOf, snapRef, onSaved }) {
  const key = me?.status === "finished" && mine
    ? [SNAP_VERSION, mine.x, mine.z, mine.level, mine.stack.length, mine.owner.m, mine.owner.f, mine.owner.e, ...me.neighbours.map((p) => p.k + p.s)].join("|") : null;
  useEffect(() => {
    if (!key) return;
    const store = `xf_snap_${me.k}`;
    const prev = JSON.parse(localStorage.getItem(store) || "null");
    if (me.has_snap && prev?.key === key && Date.now() - prev.at < DAY) return;
    const id = setTimeout(async () => {
      if (!snapRef.current) return;
      const dark = me.neighbours.filter((p) => p.s === "r" && homeOf[p.k]).map((p) => homeOf[p.k]);
      const points = [{ k: me.k, pos: [mine.x, mine.top + 0.1, mine.z] }, ...dark.map((h) => ({ k: h.owner.k, pos: [h.x, h.top + 0.05, h.z] }))];
      const { blob, points: at } = await snapRef.current({ at: [mine.x, mine.z, mine.y], points });
      const inFrame = (p) => p.x > 30 && p.x < 610 && p.y > 90 && p.y < 610;
      const form = new FormData();
      form.append("image", blob, "house.jpg");
      form.append("meta", JSON.stringify({ me: [at[0].x, at[0].y], faces: at.slice(1).filter(inFrame).map(({ k, x, y }) => ({ k, x, y })) }));
      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/me/snapshot`, { method: "POST", body: form, credentials: "include" }).catch(() => null);
      if (res?.ok) {
        localStorage.setItem(store, JSON.stringify({ key, at: Date.now() }));
        onSaved();
      }
    }, 3000);
    return () => clearTimeout(id);
  }, [key, me?.has_snap]); // eslint-disable-line react-hooks/exhaustive-deps
}

function SignInCard({ at, error, onSignIn }) {
  return (
    <div className={`${CARD} w-[min(92vw,330px)] p-4 pointer-events-auto`} data-testid="sign-in-card">
      <div className="font-display font-bold text-lg">
        {at ? (at.s === "r" ? `@${at.h}'s house is dark` : `@${at.h} lives here`) : "Get a house in XField"}
      </div>
      <div className="mt-1 text-sm text-ink/70">
        {at?.s === "r" ? "Is it yours? Sign in with X to turn the lights on."
          : "A city of people on X. Sign in and your house goes up on the Docks with your face on it. Win votes to move uptown."}
      </div>
      {error && <div className="mt-2 rounded-md bg-red-50 text-red-700 text-sm font-semibold px-2 py-1" data-testid="sign-in-error">{error}</div>}
      <button type="button" onClick={onSignIn} className="mt-3 rounded-lg bg-ink text-white font-bold px-4 py-2 hover:bg-slate-700 transition-colors" data-testid="sign-in-button">
        Sign in with X
      </button>
    </div>
  );
}

export default function CityPage() {
  const [town, setTown] = useState(null);
  const [me, setMe] = useState(null);
  const [hover, setHover] = useState(null);
  const [picked, setPicked] = useState(null);
  const [place, setPlace] = useState(() => new URLSearchParams(window.location.search).get("place"));
  const [focus, setFocus] = useState(null);
  const [toast, setToast] = useState(null);
  const [flashes, setFlashes] = useState([]);
  const [away, setAway] = useState(null);
  const [skipped, setSkipped] = useState(false);
  const [replay, setReplay] = useState(false);
  const [picking, setPicking] = useState(false);
  const [signinError, setSigninError] = useState(null);
  const auth = useAuth();
  const labelNodes = useRef([]);
  const snapRef = useRef(null);
  const flashId = useRef(0);
  const lastLots = useRef(null);
  const pending = useRef([]);
  const seen = useRef(null);
  const startedRef = useRef(false);
  const atHandle = new URLSearchParams(window.location.search).get("at")?.toLowerCase();

  const flash = (list) => {
    const at = performance.now();
    setFlashes((fs) => [...fs.filter((f) => at - f.at < 1500), ...list.slice(0, 64).map((f) => ({ ...f, at, id: flashId.current++ }))]);
  };
  const version = useRef(null);
  const loadTown = useCallback(() => api(`/town${version.current === null ? "" : `?v=${version.current}`}`).then((t) => {
    if (t.unchanged) return;
    version.current = t.version;
    const was = lastLots.current, sig = (r) => `${r.s}${r.f}${r.u}${r.lv ?? ""}`;
    lastLots.current = new Map(t.residents.map((r) => [r.k, sig(r)]));
    if (was) pending.current = t.residents.filter((r) => (was.has(r.k) ? was.get(r.k) !== sig(r) : r.lv != null))
      .map((r) => ({ k: r.k, rise: !was.has(r.k) }));
    setTown(t);
  }).catch(() => {}), []);
  const loadMe = useCallback(() => {
    if (!auth.user) return setMe(null);
    return api(`/residents/${auth.user.h}`).then((m) => {
      setMe(m);
      const news = m.news || [];
      const last = seen.current ?? localStorage.getItem("xf_seen") ?? "";
      const fresh = news.filter((n) => n.at > last);
      if (seen.current === null) {
        if (last && fresh.length) setAway(fresh);
      } else if (fresh.length) setToast(newsToast(fresh[0]));
      seen.current = news[0]?.at > last ? news[0].at : last;
      localStorage.setItem("xf_seen", seen.current);
    }).catch(() => setMe(null));
  }, [auth.user]);
  useEffect(() => {
    loadTown();
    const id = setInterval(loadTown, 5000);
    return () => clearInterval(id);
  }, [loadTown]);
  useEffect(() => { loadMe(); }, [loadMe, town?.version]);
  useEffect(() => { document.title = TITLE; }, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    const why = url.searchParams.get("signin");
    if (!why) return;
    setSigninError(SIGNIN_ERRORS[why] || SIGNIN_ERRORS.x_error);
    url.searchParams.delete("signin");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, []);
  // Every new edition lands on everyone's screen once.
  const issue = town?.paper?.issue;
  useEffect(() => {
    if (issue > Number(localStorage.getItem("xf_paper") || 0)) setPlace("ledger");
  }, [issue]);

  const city = useMemo(() => {
    if (!town) return null;
    const c = buildCity(town);
    const mine = c.homes.find((h) => h.owner.k === auth.user?.k);
    c.mine = mine ? [mine.x, mine.z] : null;
    return c;
  }, [town, auth.user]);
  const homeOf = useMemo(() => Object.fromEntries((city?.homes || []).map((h) => [h.owner.k, h])), [city]);
  const myHome = homeOf[auth.user?.k];
  useEffect(() => {
    const list = pending.current.filter((p) => homeOf[p.k]).map((p) => {
      const h = homeOf[p.k];
      return { x: h.x, z: h.z, y: h.y, rise: p.rise, color: p.rise && h.owner.s === "r" ? "#94A3B8" : "#FCD34D" };
    });
    pending.current = [];
    if (list.length) flash(list);
  }, [homeOf]); // eslint-disable-line react-hooks/exhaustive-deps
  useSnapshot({ me, mine: myHome, homeOf, snapRef, onSaved: loadMe });
  useEffect(() => {
    if (!city || startedRef.current) return;
    startedRef.current = true;
    const there = atHandle && city.homes.find((h) => h.owner.k === atHandle);
    setFocus(there ? [there.x, there.z] : city.mine || [1.5, 1.5]);
    if (there) setPicked(there);
  }, [city, atHandle]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), toast.href || toast.visit ? 7000 : 3500);
    return () => clearTimeout(id);
  }, [toast]);

  if (!city) return <div className="fixed inset-0 grid place-items-center"><Logo size={72} /></div>;
  const nbById = Object.fromEntries(town.neighbourhoods.map((n) => [n.id, n]));
  const h = hover?.item, hs = h?.owner && homeOf[h.owner.k];
  const lit = me?.status === "finished";
  const touring = lit && myHome && (replay || (!me.done?.tour && !skipped));
  const labels = [...city.labels,
    ...(myHome ? [{ kind: "me", key: "me", pos: [myHome.x, myHome.top + 0.5, myHome.z], avatar: auth.user.avatar_url, score: myHome.owner.e }] : []),
    ...(myHome && me && myHome.owner.d != null && !myHome.level ? [{ kind: "lot", key: "lot", pos: [tileOf(me.x), 0.35, tileOf(me.y)] }] : [])];
  const refresh = () => Promise.all([loadTown(), loadMe()]);
  const pick = (it) => {
    setFocus([it.x, it.z]);
    setPicked(it.owner ? it : null);
    setPlace(it.mark?.kind === "place" ? it.mark.id : it.mark?.kind === "city_hall" ? "hall" : null);
  };
  const visit = (p) => homeOf[p.k] && pick(homeOf[p.k]);
  const closePaper = () => {
    if (issue) localStorage.setItem("xf_paper", String(issue));
    const url = new URL(window.location.href);
    if (url.searchParams.has("place")) {
      url.searchParams.delete("place");
      window.history.replaceState(null, "", url.pathname + url.search);
    }
    setPlace(null);
  };
  const markDone = (step) => api("/me/done", { method: "POST", body: { step } }).then(loadMe).catch(() => {});
  const endTour = (finished) => {
    setReplay(false);
    setSkipped(true);
    if (city.mine) setFocus([...city.mine, 46]);
    if (!finished) return;
    markDone("tour");
    if (me.invites_left > 0) setPicking(true);
  };
  const stops = touring ? [[myHome.x, myHome.z, 84], city.hall && [city.hall.x, city.hall.z, 40],
    myHome.level ? [myHome.x, myHome.z, 64] : [tileOf(me.x), tileOf(me.y), 64]] : [];
  const pickedNow = picked && homeOf[picked.owner.k];
  const at = atHandle && homeOf[atHandle]?.owner;
  const calm = !touring && !picking;

  return (
    <div className="fixed inset-0 overflow-clip select-none">
      <City3D city={city} labels={labels} labelNodes={labelNodes} focus={focus} flashes={flashes} snapRef={lit ? snapRef : null}
        onHover={setHover} onPick={pick} newest={town.newest} onFace={(k) => visit({ k })} />
      <div className="absolute inset-0 pointer-events-none">
        {labels.map((l, i) => (
          <div key={l.key || i} ref={(el) => { labelNodes.current[i] = el; }} className="absolute left-0 top-0 will-change-transform">
            {l.kind === "me" ? (
              <div className="flex flex-col items-center animate-bounce" data-testid="my-house-marker">
                <img src={l.avatar} alt="" className="w-10 h-10 rounded-full border-[3px] border-amber-300 shadow-lg bg-sky-light" />
                <span className="mt-1 rounded-full bg-amber-300 text-ink text-[11px] font-bold px-2 py-0.5 whitespace-nowrap tabular-nums">YOU{l.score != null && ` · ${l.score}`}</span>
              </div>
            ) : l.kind === "lot" ? (
              <div className="flex flex-col items-center" data-testid="my-lot-marker">
                <span className="rounded-full border-2 border-dashed border-amber-400 bg-white/90 px-2.5 py-0.5 text-[11px] font-bold text-ink whitespace-nowrap shadow-sm">
                  Your lot uptown
                </span>
                <span className="h-3 w-0.5 bg-amber-400" />
              </div>
            ) : l.kind === "place" ? (
              <button type="button" onClick={() => { setPlace(l.id); setPicked(null); }} data-testid={`place-label-${l.id}`}
                className="pointer-events-auto rounded-full bg-white/95 px-3 py-1 text-sm font-display font-bold text-ink shadow-md whitespace-nowrap hover:bg-white">
                {l.text}
              </button>
            ) : (
              <div className="flex flex-col items-center">
                <span className="rounded-lg px-2.5 py-1 font-display font-bold text-sm shadow-md whitespace-nowrap"
                  style={{ background: l.color, color: isLight(l.color) ? "#0F172A" : "#FFFFFF" }}>{l.text}</span>
                <span className="mt-1 flex items-center -space-x-1.5" title={l.host ? `@${l.host}'s mutuals` : undefined}>
                  {l.faces.map((p, i) => (
                    <button key={p.k} type="button" onClick={() => visit(p)} className="pointer-events-auto hover:z-10 hover:scale-110 transition-transform">
                      <Face p={p} size={i ? 22 : 28} ring={i ? "#FFFFFF" : l.color} />
                    </button>
                  ))}
                  {l.size > l.faces.length && (
                    <span className="!ml-1 rounded-full bg-white/90 px-1.5 text-[11px] font-bold text-ink/80 tabular-nums shadow-sm">+{l.size - l.faces.length}</span>
                  )}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="absolute left-4 top-4 pointer-events-none">
        <Logo size={44} />
        <div className="mt-1.5 flex gap-1.5 text-xs font-bold">
          <span className="rounded-full bg-white/85 px-2 py-0.5 shadow-sm tabular-nums" title="Ground spots with a building on them" data-testid="lots-stat">
            🏠 {Math.min(town.stats.taken, town.stats.capacity)}/{town.stats.capacity} ground spots
          </span>
          {(town.stats.floors > 0 || town.stats.taken >= town.stats.capacity) && (
            <button type="button" onClick={() => { setPlace("towers"); setPicked(null); }} title="The tallest buildings in the city"
              className="pointer-events-auto rounded-full bg-white/85 px-2 py-0.5 shadow-sm tabular-nums hover:bg-white transition-colors" data-testid="floors-stat">
              🏗 {town.stats.floors} {town.stats.floors === 1 ? "floor" : "floors"} built
            </button>
          )}
          <span className="rounded-full bg-white/85 px-2 py-0.5 shadow-sm tabular-nums" title="Houses on the Docks and uptown" data-testid="docks-stat">
            ⚓ {town.residents.filter((r) => r.d != null).length} · 🏙 {town.residents.filter((r) => r.u).length}
          </span>
        </div>
      </div>
      {touring && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-20">
          <Tour me={me} model={myHome.owner.m} home={myHome} line={town.ladder.uptown_at} stops={stops} onFocus={setFocus} onDone={endTour} />
        </div>
      )}
      {lit && picking && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-20">
          <PeoplePicker me={me} onSaved={refresh} onTagged={() => markDone("tag")} onClose={() => setPicking(false)} />
        </div>
      )}
      {lit && calm && (
        <div className="absolute right-4 top-24 sm:top-4">
          <VoteCard onVoted={refresh} />
        </div>
      )}
      <div className="absolute right-4 bottom-12 hidden sm:block">
        <Minimap city={city} me={city.mine} onPick={setFocus} />
      </div>
      <div className="absolute left-4 bottom-12 flex flex-col gap-2 items-start">
        {place && !pickedNow && <PlaceCard id={place} town={town} city={city} me={me} onVisit={visit} onClose={() => setPlace(null)} />}
        {pickedNow && (
          <HouseCard house={pickedNow} nb={nbById[pickedNow.owner.nb]} signedIn={Boolean(me)} onChanged={refresh} onVisit={visit}
            onLeft={() => { window.location.href = "/"; }} onClose={() => setPicked(null)} />
        )}
        {away && me && calm && !pickedNow && !place && <AwayCard news={away} onVisit={(p) => { setAway(null); visit(p); }} onClose={() => setAway(null)} />}
        {me && !lit && <div className={`${CARD} px-3 py-2 text-sm font-bold pointer-events-auto`} data-testid="lights-pending">🔌 Turning your lights on…</div>}
        {lit && calm && !pickedNow && !place && (
          <NextMove me={me} onFocus={() => city.mine && setFocus(city.mine)} onPeople={() => setPicking(true)} onVisit={visit}
            onDone={markDone} onTour={() => setReplay(true)} />
        )}
        {auth.ready && !auth.user && <SignInCard at={at} error={signinError} onSignIn={() => auth.login(window.location.pathname + window.location.search)} />}
      </div>

      {h?.owner && !picked && (
        <div className="absolute pointer-events-none z-10" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <div className={`${CARD} flex items-center gap-2 px-3 py-2`}>
            <Face p={h.owner} size={32} ring={h.owner.s === "f" ? "#FCD34D" : "#475569"} dim={h.owner.s !== "f"} />
            <div>
              <div className="text-sm font-bold">@{h.owner.h}</div>
              <div className="text-[11px] text-ink/70">
                {h.mansion ? `💎 Mansion #${h.mansion}` : h.owner.s === "f" ? (h.owner.u ? "🏙 Uptown" : "⚓ Docks") : "🌑 dark"} · 🏢 {hs?.stack.length > 1
                  ? (hs.level ? `floor ${hs.level + 1} of @${hs.stack[0].h}'s` : `${hs.stack.length} live here`)
                  : `${h.owner.f} ${h.owner.f === 1 ? "floor" : "floors"}`}
                {h.owner.s === "f" && ` · ${h.owner.e} pts`}
                {nbById[h.owner.nb] ? ` · ${nbById[h.owner.nb].name || "New district"}` : ""}
              </div>
            </div>
          </div>
        </div>
      )}
      {place === "ledger" && <Newspaper votes={town.ladder.votes} onVisit={visit} onClose={closePaper} />}
      <TickerBar events={town.ticker} people={Object.fromEntries(town.residents.map((r) => [r.k, r]))} onVisit={visit} />
      {toast && (
        <div className="pop absolute bottom-14 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-ink text-white text-sm font-bold pl-2 pr-2 py-1.5 shadow-lg pointer-events-auto whitespace-nowrap">
          {toast.face && <Face p={toast.face} size={26} />}
          <span className={toast.face ? "" : "pl-2"}>{toast.text || toast}</span>
          {toast.href ? (
            <a href={toast.href} target="_blank" rel="noreferrer" className="rounded-full bg-white text-ink px-3 py-1 text-xs">{toast.cta}</a>
          ) : toast.visit ? (
            <button type="button" onClick={() => { visit(toast.visit); setToast(null); }}
              className="rounded-full bg-amber-300 text-ink px-3 py-1 text-xs">{toast.cta}</button>
          ) : <span className="pr-2" />}
        </div>
      )}
    </div>
  );
}
