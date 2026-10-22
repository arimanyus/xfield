import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useTown } from "@/hooks/useTown";
import { useAuth } from "@/hooks/useAuth";
import { useMoveIn } from "@/hooks/useMoveIn";
import { useTownAnims } from "@/hooks/useTownAnims";
import { TownMap } from "@/components/town/TownMap";
import { TownHeader } from "@/components/town/TownHeader";
import { SearchFly } from "@/components/town/SearchFly";
import { AuthChip } from "@/components/town/AuthChip";
import { MoveInBar } from "@/components/town/MoveInBar";
import { Ticker } from "@/components/town/Ticker";
import { ResidentSheet } from "@/components/town/ResidentSheet";
import { ArrivalSheet } from "@/components/town/ArrivalSheet";
import { TownHallSheet } from "@/components/town/TownHallSheet";
import { CensusSheet } from "@/components/town/CensusSheet";

const SIGNIN_ERRORS = {
  off: "Sign in with X is coming soon.",
  cancelled: "Sign in was cancelled.",
  expired: "That sign in took too long. Try again.",
  x_error: "X didn't let us in. Try again.",
};

export default function TownPage() {
  const { town, error, refresh } = useTown();
  const auth = useAuth();
  const { handle: routeHandle, issue: routeIssue } = useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const map = useRef(null);
  const [sel, setSel] = useState(null);
  const [hall, setHall] = useState(false);
  const [census, setCensus] = useState(pathname.startsWith("/census") ? Number(routeIssue) || 0 : null);
  const [arrival, setArrival] = useState(params.get("arrive") ? routeHandle : null);
  const welcome = useRef(Boolean(params.get("welcome")));
  const anims = useTownAnims(town);
  const routed = useRef(false);

  const fly = useCallback((k, data = town) => {
    const r = data?.residents.find((x) => x.k === k.toLowerCase());
    if (r) map.current?.flyTo(r.x, r.y);
  }, [town]);

  const select = useCallback((k, mode = "view") => { setHall(false); setCensus(null); setSel({ k: k.toLowerCase(), mode }); fly(k); }, [fly]);

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

  if (!town)
    return (
      <div className="fixed inset-0 grid place-items-center" data-testid="town-loading">
        <div className="text-center">
          <div className="title-toon text-5xl sm:text-7xl">XFIELD</div>
          {error ? <p className="mt-4 font-head font-bold text-xl text-white">{error}</p> : <Loader2 className="w-10 h-10 animate-spin mx-auto mt-6 text-white" strokeWidth={3} />}
        </div>
      </div>
    );

  const full = town.stats.taken >= town.stats.capacity;
  const openCensus = () => { setSel(null); setHall(false); setCensus(0); };
  const closeCensus = () => { setCensus(null); if (pathname.startsWith("/census")) navigate("/", { replace: true }); };
  return (
    <div className="fixed inset-0 overflow-hidden" data-testid="town-page">
      <TownMap ref={map} town={town} anims={anims} me={auth.user?.k} onSelect={(k) => select(k)} onTownHall={() => { setSel(null); closeCensus(); setHall(true); }} onBackground={() => { setSel(null); setHall(false); if (census !== null) closeCensus(); }} />
      <TownHeader stats={town.stats} onCensus={openCensus} />
      <div className="absolute right-3 top-3 sm:right-5 sm:top-5 z-30 flex items-start gap-2">
        <AuthChip auth={auth} onMyHouse={(k) => select(k)} />
        <SearchFly residents={town.residents} onPick={(k) => select(k)} onMoveIn={startMoveIn} />
      </div>
      {!sel && !arrival && !hall && census === null && (
        <div className="absolute inset-x-0 bottom-0 z-20 px-3 pb-3 sm:pb-6 flex justify-center pointer-events-none">
          <div className="w-full max-w-xl pointer-events-auto">
            <Ticker events={town.ticker} />
            <MoveInBar job={moveIn.job} onSubmit={startMoveIn} onReset={moveIn.reset} full={full} />
            <p className="mt-2 text-center" data-testid="fan-disclaimer">
              <span className="inline-block bg-white/85 rounded-full px-3 py-0.5 font-head font-bold text-xs sm:text-sm text-ink/80">Fan site. Not affiliated with The Simpsons, Disney or Fox.</span>
            </p>
          </div>
        </div>
      )}
      {hall && <TownHallSheet stats={town.stats} onClose={() => setHall(false)} />}
      {census !== null && !sel && <CensusSheet issue={census} onIssue={setCensus} onClose={closeCensus} />}
      {arrival && <ArrivalSheet handle={arrival} onClose={() => setArrival(null)} onSkip={skipArrival} onPickTagged={(k) => { setArrival(null); select(k, "ready"); }} />}
      {sel && !arrival && (
        <ResidentSheet handle={sel.k} mode={sel.mode} version={town.version} auth={auth} onClose={() => setSel(null)} onPick={(k) => select(k)}
          onMoveIn={startMoveIn} onHidden={() => { setSel(null); refresh(true); }} onChanged={() => refresh(true)} />
      )}
    </div>
  );
}
