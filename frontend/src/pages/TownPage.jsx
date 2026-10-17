import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { api, getMe, setMe } from "@/lib/api";
import { useTown } from "@/hooks/useTown";
import { useMoveIn } from "@/hooks/useMoveIn";
import { useTownAnims } from "@/hooks/useTownAnims";
import { TownMap } from "@/components/town/TownMap";
import { TownHeader } from "@/components/town/TownHeader";
import { SearchFly } from "@/components/town/SearchFly";
import { MoveInBar } from "@/components/town/MoveInBar";
import { Ticker } from "@/components/town/Ticker";
import { ResidentSheet } from "@/components/town/ResidentSheet";
import { ArrivalSheet } from "@/components/town/ArrivalSheet";

export default function TownPage() {
  const { town, error, refresh } = useTown();
  const { handle: routeHandle } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const map = useRef(null);
  const [me, setMeState] = useState(getMe());
  const [sel, setSel] = useState(null);
  const [arrival, setArrival] = useState(params.get("arrive") ? routeHandle : null);
  const anims = useTownAnims(town);
  const routed = useRef(false);

  const fly = useCallback((k, data = town) => {
    const r = data?.residents.find((x) => x.k === k.toLowerCase());
    if (r) map.current?.flyTo(r.x, r.y);
  }, [town]);

  const select = useCallback((k, mode = "view") => { setSel({ k, mode }); fly(k); }, [fly]);

  const onDone = useCallback(async (h, already) => {
    const data = (await refresh(true)) || town;
    if (!getMe()) { setMe(h); setMeState(h.toLowerCase()); }
    fly(h, data);
    setSel({ k: h.toLowerCase(), mode: already ? "view" : "celebrate" });
  }, [refresh, town, fly]);
  const moveIn = useMoveIn(onDone);
  const startMoveIn = useCallback((h) => { setSel(null); moveIn.start(h, me && me !== h.toLowerCase() ? me : null); }, [moveIn, me]);

  useEffect(() => {
    const key = params.get("admin");
    if (!key) return;
    api("/admin/check", { method: "POST", headers: { "X-Admin-Key": key } })
      .then(() => localStorage.setItem("aa_admin", key))
      .catch(() => localStorage.removeItem("aa_admin"))
      .finally(() => { params.delete("admin"); setParams(params, { replace: true }); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!town || routed.current || !routeHandle) return;
    routed.current = true;
    setTimeout(() => { fly(routeHandle); if (!arrival) setSel({ k: routeHandle.toLowerCase(), mode: "ready" }); }, 300);
  }, [town, routeHandle, arrival, fly]);

  const skipArrival = useCallback(() => { setArrival(null); if (routeHandle) setSel({ k: routeHandle.toLowerCase(), mode: "ready" }); }, [routeHandle]);
  const pickTagged = (k) => { setArrival(null); setMe(k); setMeState(k); select(k, "ready"); };

  if (!town)
    return (
      <div className="fixed inset-0 grid place-items-center" data-testid="town-loading">
        <div className="text-center">
          <div className="title-toon text-4xl sm:text-6xl">SPRINGFIELD, X</div>
          {error ? <p className="mt-4 font-head font-bold text-xl text-white">{error}</p> : <Loader2 className="w-10 h-10 animate-spin mx-auto mt-6 text-white" strokeWidth={3} />}
        </div>
      </div>
    );

  return (
    <div className="fixed inset-0 overflow-hidden" data-testid="town-page">
      <TownMap ref={map} town={town} anims={anims} me={me} onSelect={(k) => select(k)} onTownHall={() => navigate("/timeline")} onBackground={() => setSel(null)} />
      <TownHeader stats={town.stats} />
      <SearchFly residents={town.residents} onPick={(k) => select(k)} onMoveIn={startMoveIn} />
      {!sel && !arrival && (
        <div className="absolute inset-x-0 bottom-0 z-20 px-3 pb-3 sm:pb-6 flex justify-center pointer-events-none">
          <div className="w-full max-w-xl pointer-events-auto">
            <Ticker events={town.ticker} />
            <MoveInBar job={moveIn.job} onSubmit={startMoveIn} onReset={moveIn.reset} />
            <p className="mt-2 text-center font-head font-bold text-xs sm:text-sm text-white/90 [text-shadow:0_1px_4px_rgba(0,40,90,0.5)]" data-testid="fan-disclaimer">
              Fan site. Not affiliated with The Simpsons, Disney or Fox.
            </p>
          </div>
        </div>
      )}
      {arrival && <ArrivalSheet handle={arrival} onClose={() => setArrival(null)} onSkip={skipArrival} onPickTagged={pickTagged} />}
      {sel && !arrival && (
        <ResidentSheet handle={sel.k} mode={sel.mode} version={town.version} onClose={() => setSel(null)} onPick={(k) => select(k)} onMoveIn={startMoveIn} onHidden={() => { setSel(null); refresh(true); }} />
      )}
    </div>
  );
}
