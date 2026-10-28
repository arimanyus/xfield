import { useEffect, useState } from "react";
import { ArrowRight, Building2, Home, MousePointerClick, Users } from "lucide-react";
import { HousePreview } from "@/city3d/City3D";
import { modelOf } from "@/city3d/layout";
import { CARD, Face } from "@/city3d/Hud";

const WARM = "#FCD34D";

const ShackPicture = ({ me, model }) => (
  <div className="relative rounded-xl bg-sky-50 overflow-hidden">
    <HousePreview model={modelOf(model, true)} tint="#94A3B8" />
    <div className="absolute left-1/2 top-2 -translate-x-1/2"><Face p={{ a: me.avatar_url, h: me.h }} size={40} ring={WARM} /></div>
    <span className="absolute right-2 bottom-2 rounded-full bg-ink text-white text-[11px] font-bold px-2 py-0.5 tabular-nums">1000 pts</span>
  </div>
);

const VotePicture = () => (
  <div className="relative h-28 rounded-xl bg-sky-50 grid grid-cols-2 gap-3 p-3">
    {["#F59E0B", "#38BDF8"].map((c, i) => (
      <div key={c} className={`rounded-lg bg-white grid place-items-center ${i === 0 ? "ring-2 ring-amber-400" : "opacity-60"}`}>
        <Home className="w-10 h-10" style={{ color: c }} strokeWidth={2.5} />
        {i === 0 && <span className="rise absolute left-[26%] top-2 rounded-full bg-emerald-500 px-1.5 text-xs font-bold text-white">+16</span>}
      </div>
    ))}
    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink text-white text-xs font-bold px-2 py-1">VS</span>
    <MousePointerClick className="absolute left-[30%] bottom-3 w-6 h-6 text-ink" strokeWidth={2.5} />
    <span className="absolute right-3 top-2 flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="h-2.5 w-2.5 rounded-full bg-amber-400" />)}</span>
  </div>
);

const UptownPicture = ({ line }) => (
  <div className="h-28 rounded-xl bg-sky-50 px-4 py-3 flex flex-col justify-between">
    <div className="flex items-center justify-between text-ink">
      <span className="flex flex-col items-center text-[11px] font-bold"><Home className="w-8 h-8 text-slate-400" strokeWidth={2.5} />Docks</span>
      <ArrowRight className="w-6 h-6" strokeWidth={3} />
      <span className="flex flex-col items-center text-[11px] font-bold"><Building2 className="w-10 h-10 text-amber-500" strokeWidth={2.5} />Uptown</span>
      <span className="flex flex-col items-center text-[11px] font-bold"><Users className="w-8 h-8 text-emerald-500" strokeWidth={2.5} />+1 floor each</span>
    </div>
    <div>
      <div className="h-2.5 rounded-full bg-slate-200 overflow-hidden"><div className="h-full w-2/3 bg-amber-300" /></div>
      <div className="mt-1 flex justify-between text-[10px] font-bold text-ink/60 tabular-nums"><span>1000</span><span>{line}</span></div>
    </div>
  </div>
);

// Shown on every visit until it's finished: three picture cards while the camera visits your shack, City Hall where the
// votes are counted, then your empty lot uptown.
export function Tour({ me, model, line, stops, onFocus, onDone }) {
  const [i, setI] = useState(0);
  useEffect(() => { if (stops[i]) onFocus(stops[i]); }, [i]); // eslint-disable-line react-hooks/exhaustive-deps
  const steps = [
    { title: "This is your house", text: "Everyone starts here, in a shack on the Docks, the poor side of town, with 1000 points.", pic: <ShackPicture me={me} model={model} /> },
    { title: "Two houses. Pick one.", text: "You get 3 votes a day. Every point the winner gains, the loser loses. Vote your neighbours up.", pic: <VotePicture /> },
    { title: `Reach ${line} and move uptown`, text: "Your lot uptown is waiting. Invite up to 3 people: each gets a dark house next to yours, and every one who moves in adds a floor.", pic: <UptownPicture line={line} /> },
  ];
  const s = steps[i], last = i === steps.length - 1;
  return (
    <div className={`${CARD} pop w-[min(92vw,380px)] p-4 pointer-events-auto`} data-testid="tour-card">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-amber-600" data-testid="tour-step">How XField works · {i + 1} of 3</span>
        <button type="button" onClick={() => onDone(false)} className="text-xs font-bold text-ink/50 hover:text-ink" data-testid="tour-skip-button">Skip</button>
      </div>
      <div key={i} className="pop mt-2">
        {s.pic}
        <div className="mt-3 font-display font-bold text-xl" data-testid="tour-title">{s.title}</div>
        <div className="mt-1 text-sm text-ink/75" data-testid="tour-text">{s.text}</div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <span className="flex gap-1.5 mr-auto">{steps.map((_, j) => <span key={j} className={`h-2 rounded-full transition-all ${j === i ? "w-5 bg-ink" : "w-2 bg-slate-300"}`} />)}</span>
        {i > 0 && <button type="button" onClick={() => setI(i - 1)} className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold hover:bg-slate-200" data-testid="tour-back-button">Back</button>}
        <button type="button" onClick={() => (last ? onDone(true) : setI(i + 1))} className="rounded-lg bg-ink text-white px-4 py-2 text-sm font-bold hover:bg-slate-700" data-testid="tour-next-button">
          {last ? "Invite my people" : "Next"}
        </button>
      </div>
    </div>
  );
}
