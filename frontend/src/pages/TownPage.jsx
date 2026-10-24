import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useTown } from "@/hooks/useTown";
import { useAuth } from "@/hooks/useAuth";
import { useMoveIn } from "@/hooks/useMoveIn";
import { useTownAnims } from "@/hooks/useTownAnims";
import { TownMap } from "@/components/town/TownMap";
import { Logo } from "@/city3d/Logo";
import { TownHeader } from "@/components/town/TownHeader";
import { SearchFly } from "@/components/town/SearchFly";
import { AuthChip } from "@/components/town/AuthChip";
import { MoveInBar } from "@/components/town/MoveInBar";
import { Ticker } from "@/components/town/Ticker";
import { ResidentSheet } from "@/components/town/ResidentSheet";
import { ArrivalSheet } from "@/components/town/ArrivalSheet";
import { TownHallSheet } from "@/components/town/TownHallSheet";
import { CensusSheet } from "@/components/town/CensusSheet";
import { CharterSheet, DistrictSheet } from "@/components/town/DistrictSheet";

const SIGNIN_ERRORS = {
  off: "Sign in with X is coming soon.",
  cancelled: "Sign in was cancelled.",
  expired: "That sign in took too long. Try again.",
  x_error: "X didn't let us in. Try again.",
};

export default function TownPage() {
  const { town, error, refresh } = useTown();
  const auth = useAuth();
  const { handle: routeHandle, issue: routeIssue, district: routeDistrict } = useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const map = useRef(null);
  const [sel, setSel] = useState(null);
  const [hall, setHall] = useState(false);
  const [census, setCensus] = useState(pathname.startsWith("/census") ? Number(routeIssue) || 0 : null);
  const [district, setDistrict] = useState(routeDistrict || null);
  const [arrival, setArrival] = useState(params.get("arrive") ? routeHandle : null);
  const welcome = useRef(Boolean(params.get("welcome")));
  const anims = useTownAnims(town);
  const routed = useRef(false);

  const fly = useCallback((k, data = town) => {
    const r = data?.residents.find((x) => x.k === k.toLowerCase());
    if (r) map.current?.flyTo(r.x, r.y);
  }, [town]);

  const select = useCallback((k, mode = "view") => { setHall(false); setCensus(null); setDistrict(null); setSel({ k: k.toLowerCase(), mode }); fly(k); }, [fly]);

  const onDone = useCallback(async (h, code) => {
    const data = (await refresh(true)) || town;
    fly(h, data);
    setSel({ k: h.toLowerCase(), mode: code === "lit" ? "celebrate" : code === "reserved" ? "built" : "view" });
  }, [refresh, town, fly]);
  const moveIn = useMoveIn(onDone);
  const startMoveIn = useCallback((h) => { setSel(null); moveIn.start(h); }, [moveIn]);

  useEffect(() => {
    const key = params.get("admin");
    const signin = params.get("signin");
    if (signin) moveIn.fail(SIGNIN_ERRORS[signin] || SIGNIN_ERRORS.x_error);
    if (key) {
      api("/admin/check", { method: "POST", headers: { "X-Admin-Key": key } })
        .then(() => localStorage.setItem("aa_admin", key))
        .catch(() => localStorage.removeItem("aa_admin"));
    }
    if (key || signin || params.get("welcome")) {
      ["admin", "signin", "welcome"].forEach((p) => params.delete(p));
      setParams(params, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!town || routed.current || !routeHandle) return;
    routed.current = true;
    if (welcome.current) { moveIn.watch(routeHandle); return; }
    setTimeout(() => { fly(routeHandle); if (!arrival) setSel({ k: routeHandle.toLowerCase(), mode: "ready" }); }, 300);
  }, [town, routeHandle, arrival, fly, moveIn]);

  const skipArrival = useCallback(() => { setArrival(null); if (routeHandle) setSel({ k: routeHandle.toLowerCase(), mode: "ready" }); }, [routeHandle]);

  useEffect(() => {
    const nb = town?.neighbourhoods.find((n) => n.id === routeDistrict);
    if (nb) setTimeout(() => map.current?.flyTo(nb.bx, nb.by), 300);
  }, [Boolean(town), routeDistrict]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!town)
    return (
      <div className="fixed inset-0 grid place-items-center" data-testid="town-loading">
        <div className="text-center">
          <div className="flex justify-center"><Logo size={72} /></div>
          {error ? <p className="mt-4 font-head font-semibold text-xl">{error}</p> : <Loader2 className="w-10 h-10 animate-spin mx-auto mt-6" strokeWidth={2.5} />}
        </div>
      </div>
    );

  const full = town.stats.taken >= town.stats.capacity;
  const changed = () => { refresh(true); auth.reload(); };
  const closeRoute = () => { if (/^\/(census|d)(\/|$)/.test(pathname)) navigate("/", { replace: true }); };
  const openCensus = () => { setSel(null); setHall(false); setDistrict(null); setCensus(0); };
  const closeCensus = () => { setCensus(null); closeRoute(); };
  const closeDistrict = () => { setDistrict(null); closeRoute(); };
  const openDistrict = (id) => {
    setSel(null); setHall(false); setCensus(null); setDistrict(id);
    const nb = town.neighbourhoods.find((n) => n.id === id);
    if (nb) map.current?.flyTo(nb.bx, nb.by);
  };
  return (
    <div className="fixed inset-0 overflow-hidden" data-testid="town-page">
      <TownMap ref={map} town={town} anims={anims} me={auth.user?.k} onSelect={(k) => select(k)} onDistrict={openDistrict}
        onTownHall={() => { setSel(null); setDistrict(null); closeCensus(); setHall(true); }}
        onBackground={() => { setSel(null); setHall(false); if (census !== null) closeCensus(); if (district) closeDistrict(); }} />
      <TownHeader stats={town.stats} onCensus={openCensus} />
      <div className="absolute right-3 top-3 sm:right-5 sm:top-5 z-30 flex items-start gap-2">
        <AuthChip auth={auth} onMyHouse={(k) => select(k)} onMyDistrict={openDistrict} />
        <SearchFly residents={town.residents} onPick={(k) => select(k)} onMoveIn={startMoveIn} />
      </div>
      {!sel && !arrival && !hall && !district && census === null && (
        <div className="absolute inset-x-0 bottom-0 z-20 px-3 pb-3 sm:pb-6 flex justify-center pointer-events-none">
          <div className="w-full max-w-xl pointer-events-auto">
            <Ticker events={town.ticker} />
            <MoveInBar job={moveIn.job} onSubmit={startMoveIn} onReset={moveIn.reset} full={full} />
          </div>
        </div>
      )}
      {hall && <TownHallSheet stats={town.stats} onClose={() => setHall(false)} />}
      {census !== null && !sel && <CensusSheet issue={census} onIssue={setCensus} onClose={closeCensus} />}
      {district === "new" && <CharterSheet options={town.options} onClose={closeDistrict} onCreated={(id) => { changed(); setDistrict(id); }} />}
      {district && district !== "new" && (
        <DistrictSheet id={district} options={town.options} auth={auth} version={town.version} onClose={closeDistrict} onPick={(k) => select(k)} onChanged={changed} />
      )}
      {arrival && <ArrivalSheet handle={arrival} onClose={() => setArrival(null)} onSkip={skipArrival} onPickTagged={(k) => { setArrival(null); select(k, "ready"); }} />}
      {sel && !arrival && (
        <ResidentSheet handle={sel.k} mode={sel.mode} version={town.version} auth={auth} onClose={() => setSel(null)} onPick={(k) => select(k)}
          onMoveIn={startMoveIn} onHidden={() => { setSel(null); refresh(true); }} onChanged={changed}
          onDistrict={openDistrict} onCharter={() => openDistrict("new")} />
      )}
    </div>
  );
}
