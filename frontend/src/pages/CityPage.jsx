import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { buildCity, tileOf } from "@/city3d/layout";
import { City3D } from "@/city3d/City3D";
import { CARD, CivicCard, Face, HomeCard, MayorBar, Minimap, MyHome, TopDistricts, isLight, useNow } from "@/city3d/Hud";

export default function CityPage() {
  const [town, setTown] = useState(null);
  const [me, setMe] = useState(null);
  const [hover, setHover] = useState(null);
  const [picked, setPicked] = useState(null);
  const [focus, setFocus] = useState(null);
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const auth = useAuth();
  const now = useNow();
  const labelNodes = useRef([]);
  const params = new URLSearchParams(window.location.search);
  const invitedBy = params.get("invite");

  const loadTown = useCallback(() => api("/town").then(setTown).catch(() => {}), []);
  const loadMe = useCallback(() => {
    if (!auth.user) return setMe(null);
    return api(`/residents/${auth.user.h}`).then(setMe).catch(() => setMe(null));
  }, [auth.user]);
  useEffect(() => {
    loadTown();
    const id = setInterval(loadTown, 10000);
    return () => clearInterval(id);
  }, [loadTown]);
  useEffect(() => { loadMe(); }, [loadMe, town?.version]);
  useEffect(() => {
    if (town && new Date(town.city.ends_at).getTime() <= now) loadTown();
  }, [town, now, loadTown]);

  const city = useMemo(() => {
    if (!town) return null;
    const c = buildCity(town);
    const mine = c.homes.find((h) => h.people.some((p) => p.k === auth.user?.k));
    if (mine) c.labels.push({ kind: "me", pos: [mine.x, 0.5 + 0.25 * mine.stories, mine.z], avatar: auth.user.avatar_url });
    c.mine = mine ? [mine.x, mine.z] : null;
    return c;
  }, [town, auth.user]);
  const startedRef = useRef(false);
  useEffect(() => {
    if (!city || startedRef.current) return;
    startedRef.current = true;
    setFocus(city.mine || [1.5, 1.5]);
  }, [city]);

  const districts = useMemo(() => {
    if (!town) return [];
    const tallest = {};
    for (const r of town.residents) tallest[r.nb] = Math.max(tallest[r.nb] || 0, r.f || 1);
    return [...town.neighbourhoods].map((n) => ({ ...n, tallest: tallest[n.id] || 1 }))
      .sort((a, b) => b.size - a.size || (b.treasury || 0) - (a.treasury || 0));
  }, [town]);

  const act = async (fn, ok) => {
    setBusy(true);
    try {
      const r = await fn();
      if (ok) setToast(ok(r));
      await loadTown();
      await loadMe();
    } catch (e) {
      setToast(e.message);
    } finally {
      setBusy(false);
    }
  };
  const vote = (k) => act(() => api("/city/vote", { method: "POST", body: { candidate: k } }), () => `You voted for @${k}.`);
  const boost = (id) => act(() => api("/city/boost", { method: "POST", body: { nb_id: id } }), () => "Boost set for this term.");
  const collect = () => act(() => api("/me/claim", { method: "POST" }), (r) => `+₡${r.net} rent. ₡${r.tax} went to the city vault.`);
  const work = (place) => act(() => api("/me/work", { method: "POST", body: { place } }),
    (r) => `+₡${r.net} for shift ${r.shifts} as a ${r.title}. ₡${r.tax} went to the city vault.`);
  const run = () => act(() => api("/city/run", { method: "POST" }), () => "You're on the ballot. Tell your neighbours to vote for you.");
  const fund = () => act(() => api(`/districts/${me.neighbourhood.id}/contribute`, { method: "POST", body: { amount: 100 } }),
    (r) => (r.built?.length ? `Treasury funded a ${r.built.join(" and ")} project!` : "₡100 added to the treasury."));
  const invite = async () => {
    await navigator.clipboard.writeText(me.economy.invite_url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  if (!city) return <div className="fixed inset-0 grid place-items-center title-display text-5xl">XFIELD</div>;
  const nbById = Object.fromEntries(town.neighbourhoods.map((n) => [n.id, n]));
  const h = hover?.item;
  const running = new Set(town.city.race.map((c) => c.k));
  const pick = (it) => {
    setFocus([it.x, it.z]);
    setPicked(it.owner || it.mark?.kind === "civic" ? it : null);
  };

  return (
    <div className="fixed inset-0 overflow-hidden select-none">
      <City3D city={city} labelNodes={labelNodes} focus={focus} onHover={setHover} onPick={pick} />
      <div className="absolute inset-0 pointer-events-none">
        {city.labels.map((l, i) => (
          <div key={i} ref={(el) => (labelNodes.current[i] = el)} className="absolute left-0 top-0 will-change-transform">
            {l.kind === "me" ? (
              <div className="flex flex-col items-center animate-bounce">
                <img src={l.avatar} alt="" className="w-10 h-10 rounded-full border-[3px] border-white shadow-lg bg-sky-light" />
                <span className="mt-1 rounded-full bg-ink text-white text-[11px] font-bold px-2 py-0.5">YOU</span>
              </div>
            ) : l.kind === "mayor" ? (
              <div className="flex items-center gap-1.5 rounded-full bg-ink text-white pl-1 pr-3 py-1 shadow-lg">
                {l.mayor ? <Face p={l.mayor} size={22} /> : <span className="w-[22px] h-[22px] rounded-full bg-white/20" />}
                <span className="text-xs font-bold whitespace-nowrap">{l.text}</span>
              </div>
            ) : l.kind === "civic" ? (
              <div className="flex flex-col items-center">
                <span className="flex items-center gap-1.5 rounded-full bg-white/95 px-2 py-0.5 text-xs font-bold shadow whitespace-nowrap">
                  <span className="w-2 h-2 rounded-full" style={{ background: l.color }} />{l.text}
                </span>
                <span className="mt-0.5 text-[10px] font-semibold text-ink/70 bg-white/80 rounded px-1 whitespace-nowrap">{l.sub}</span>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <span className="rounded-lg px-2.5 py-1 font-display font-bold text-sm shadow-md whitespace-nowrap"
                  style={{ background: l.color, color: isLight(l.color) ? "#0F172A" : "#FFFFFF" }}>{l.text}</span>
                <span className="mt-0.5 text-[11px] font-semibold text-ink/80 bg-white/85 rounded px-1.5 whitespace-nowrap">{l.sub}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="absolute left-4 top-4 pointer-events-none">
        <div className="title-display text-4xl drop-shadow-sm">XFIELD</div>
        <div className="mt-1 text-sm font-semibold text-ink/70">
          {town.stats.taken}/{town.stats.capacity} citizens · {town.neighbourhoods.length} districts
        </div>
      </div>
      <div className="absolute top-4 left-1/2 -translate-x-1/2">
        <MayorBar city={town.city} me={me} districts={districts} onVote={vote} onBoost={boost} onRun={run} busy={busy} now={now} />
      </div>
      <div className="absolute right-4 top-4">
        <TopDistricts districts={districts} boost={town.city.boost?.id} onPick={(d) => setFocus([tileOf(d.bx), tileOf(d.by)])} />
      </div>
      <div className="absolute right-4 bottom-4">
        <Minimap city={city} me={city.mine} onPick={setFocus} />
      </div>
      <div className="absolute left-4 bottom-4 flex flex-col gap-2 items-start">
        {picked?.owner && (
          <HomeCard home={picked} nb={nbById[picked.owner.nb]} me={me} running={running} onVote={vote} onClose={() => setPicked(null)} />
        )}
        {picked?.mark && (
          <CivicCard place={city.buildings.find((b) => b.mark?.id === picked.mark.id)?.mark || picked.mark} me={me} now={now} busy={busy} onWork={work} onClose={() => setPicked(null)} />
        )}
        {me?.economy ? (
          <MyHome me={me} district={me.neighbourhood && nbById[me.neighbourhood.id]} city={town.city} now={now} busy={busy}
            onCollect={collect} onInvite={invite} onFund={fund} onWork={work} onCore={() => setFocus([1.5, 1.5])}
            onFocus={() => city.mine && setFocus(city.mine)} copied={copied} />
        ) : auth.ready && (
          <div className={`${CARD} w-[min(92vw,330px)] p-4 pointer-events-auto`}>
            <div className="font-display font-bold text-lg">
              {invitedBy ? `@${invitedBy} saved you a floor in their home` : "Move into XField"}
            </div>
            <div className="mt-1 text-sm text-ink/70">
              {invitedBy ? "Sign in with X and you'll move in with them. Your home grows a story, and you both get ₡300."
                : "Sign in with X. You get a home next to the people you talk to, and it grows a story for every friend who moves in."}
            </div>
            <button type="button" onClick={() => auth.login("/")} className="mt-3 rounded-lg bg-ink text-white font-bold px-4 py-2">
              Sign in with X
            </button>
          </div>
        )}
      </div>

      {h?.owner && !picked && (
        <div className="absolute pointer-events-none z-10" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <div className={`${CARD} flex items-center gap-2 px-3 py-2`}>
            <Face p={h.owner} size={32} />
            <div>
              <div className="text-sm font-bold">@{h.owner.h}{h.stories > 1 ? ` +${h.stories - 1}` : ""}</div>
              <div className="text-[11px] text-ink/70">
                {h.owner.s === "r" && h.stories === 1 ? "Reserved lot" : `${h.stories} ${h.stories === 1 ? "story" : "stories"}`}
                {nbById[h.owner.nb] ? ` · ${nbById[h.owner.nb].name}` : ""}
              </div>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-ink text-white text-sm font-semibold px-4 py-2 shadow-lg">{toast}</div>
      )}
    </div>
  );
}
