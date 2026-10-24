import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { buildCity } from "@/city3d/layout";
import { City3D } from "@/city3d/City3D";
import { Logo } from "@/city3d/Logo";
import { Newspaper } from "@/city3d/Newspaper";
import { Arrival, AwayCard, CARD, Face, HouseCard, Minimap, PlaceCard, StreetBar, TickerBar, VoteCard, isLight } from "@/city3d/Hud";

const TITLE = "XField: your city on X, lit up by your friends";
const newsToast = (n) => ({ text: `💡 @${n.p.h} just moved in near you`, face: n.p, visit: n.p, cta: "Visit" });

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
  const [arrived, setArrived] = useState(() => Boolean(localStorage.getItem("xf_arrived")));
  const auth = useAuth();
  const labelNodes = useRef([]);
  const flashId = useRef(0);
  const lastLots = useRef(null);
  const seen = useRef(null);
  const startedRef = useRef(false);
  const atHandle = new URLSearchParams(window.location.search).get("at")?.toLowerCase();
  const arrive = () => {
    localStorage.setItem("xf_arrived", "1");
    setArrived(true);
  };

  const flash = (list) => {
    const at = performance.now();
    setFlashes((fs) => [...fs.filter((f) => at - f.at < 1500), ...list.slice(0, 64).map((f) => ({ ...f, at, id: flashId.current++ }))]);
  };
  const version = useRef(null);
  const loadTown = useCallback(() => api(`/town${version.current === null ? "" : `?v=${version.current}`}`).then((t) => {
    if (t.unchanged) return;
    version.current = t.version;
    const was = lastLots.current;
    lastLots.current = new Map(t.residents.map((r) => [r.k, `${r.s}${r.f}${r.u}`]));
    if (was) flash(t.residents.filter((r) => was.has(r.k) && was.get(r.k) !== `${r.s}${r.f}${r.u}`).map((r) => ({ x: r.x, y: r.y, color: "#FCD34D" })));
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
  const homeOf = Object.fromEntries(city.homes.map((h) => [h.owner.k, h]));
  const myNb = me?.neighbourhood ? nbById[me.neighbourhood.id] : null;
  const h = hover?.item;
  const roof = (home) => 0.6 + 0.25 * home.stories;
  const myHome = homeOf[auth.user?.k];
  const labels = [...city.labels,
    ...(myHome ? [{ kind: "me", key: "me", pos: [myHome.x, roof(myHome) + 0.5, myHome.z], avatar: auth.user.avatar_url, score: myHome.owner.e }] : [])];
  const refresh = () => Promise.all([loadTown(), loadMe()]);
  const pick = (it) => {
    setFocus([it.x, it.z]);
    setPicked(it.owner ? it : null);
    setPlace(it.mark?.kind === "place" ? it.mark.id : it.mark?.kind === "city_hall" ? "hall" : null);
  };
  const visit = (p) => homeOf[p.k] && pick(homeOf[p.k]);
  const closePaper = () => {
    if (issue) localStorage.setItem("xf_paper", String(issue));
    setPlace(null);
  };
  const pickedNow = picked && homeOf[picked.owner.k];
  const at = atHandle && homeOf[atHandle]?.owner;

  return (
    <div className="fixed inset-0 overflow-clip select-none">
      <City3D city={city} labels={labels} labelNodes={labelNodes} focus={focus} flashes={flashes}
        onHover={setHover} onPick={pick} newest={town.newest} onFace={(k) => visit({ k })} />
      <div className="absolute inset-0 pointer-events-none">
        {labels.map((l, i) => (
          <div key={l.key || i} ref={(el) => { labelNodes.current[i] = el; }} className="absolute left-0 top-0 will-change-transform">
            {l.kind === "me" ? (
              <div className="flex flex-col items-center animate-bounce">
                <img src={l.avatar} alt="" className="w-10 h-10 rounded-full border-[3px] border-amber-300 shadow-lg bg-sky-light" />
                <span className="mt-1 rounded-full bg-amber-300 text-ink text-[11px] font-bold px-2 py-0.5 whitespace-nowrap tabular-nums">YOU{l.score != null && ` · ${l.score}`}</span>
              </div>
            ) : l.kind === "place" ? (
              <button type="button" onClick={() => { setPlace(l.id); setPicked(null); }}
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
          <span className="rounded-full bg-white/85 px-2 py-0.5 shadow-sm tabular-nums" title="Lots with a house on them">🏠 {town.stats.taken}/{town.stats.capacity} lots</span>
          <span className="rounded-full bg-white/85 px-2 py-0.5 shadow-sm tabular-nums" title="Houses on the Docks and uptown">
            ⚓ {town.residents.filter((r) => r.d != null).length} · 🏙 {town.residents.filter((r) => r.u).length}
          </span>
        </div>
      </div>
      {me?.status === "finished" && !arrived && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2">
          <Arrival me={me} nb={myNb} onClose={arrive} />
        </div>
      )}
      {me?.status === "finished" && arrived && (
        <div className="absolute right-4 top-4">
          <VoteCard onVoted={refresh} />
        </div>
      )}
      <div className="absolute right-4 bottom-12">
        <Minimap city={city} me={city.mine} onPick={setFocus} />
      </div>
      <div className="absolute left-4 bottom-12 flex flex-col gap-2 items-start">
        {place && !pickedNow && <PlaceCard id={place} town={town} me={me} onVisit={visit} onClose={() => setPlace(null)} />}
        {pickedNow && (
          <HouseCard house={pickedNow} nb={nbById[pickedNow.owner.nb]} signedIn={Boolean(me)} onChanged={refresh}
            onLeft={() => { window.location.href = "/"; }} onClose={() => setPicked(null)} />
        )}
        {away && me && !pickedNow && !place && <AwayCard news={away} onVisit={(p) => { setAway(null); visit(p); }} onClose={() => setAway(null)} />}
        {me && me.status !== "finished" && <div className={`${CARD} px-3 py-2 text-sm font-bold pointer-events-auto`}>🔌 Turning your lights on…</div>}
        {me?.status === "finished" && arrived && <StreetBar me={me} onFocus={() => city.mine && setFocus(city.mine)} onVisit={visit} />}
        {auth.ready && !auth.user && (
          <div className={`${CARD} w-[min(92vw,330px)] p-4 pointer-events-auto`}>
            <div className="font-display font-bold text-lg">
              {at ? (at.s === "r" ? `@${at.h}'s house is dark` : `@${at.h} lives here`) : "Your house is already here"}
            </div>
            <div className="mt-1 text-sm text-ink/70">
              {at?.s === "r" ? "Is it yours? Sign in with X to turn the lights on."
                : "XField is a city built from who talks to whom on X. Your friends live on your street. Sign in to turn your lights on."}
            </div>
            <button type="button" onClick={() => auth.login(window.location.pathname + window.location.search)}
              className="mt-3 rounded-lg bg-ink text-white font-bold px-4 py-2">
              Sign in with X
            </button>
          </div>
        )}
      </div>

      {h?.owner && !picked && (
        <div className="absolute pointer-events-none z-10" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <div className={`${CARD} flex items-center gap-2 px-3 py-2`}>
            <Face p={h.owner} size={32} ring={h.owner.s === "f" ? "#FCD34D" : "#475569"} dim={h.owner.s !== "f"} />
            <div>
              <div className="text-sm font-bold">@{h.owner.h}</div>
              <div className="text-[11px] text-ink/70">
                {h.owner.s === "f" ? (h.owner.u ? "🏙 Uptown" : "⚓ Docks") : "🌑 dark"} · 🏢 {h.owner.f} {h.owner.f === 1 ? "floor" : "floors"}
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
