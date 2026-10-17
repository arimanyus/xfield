import { useEffect, useState } from "react";
import { EyeOff, ExternalLink, Loader2 } from "lucide-react";
import { api, getAdmin } from "@/lib/api";
import { TIER_NAMES } from "@/lib/iso";
import { Sheet, Face } from "@/components/town/Sheet";

const shareToX = (share) => {
  const url = `https://x.com/intent/post?text=${encodeURIComponent(share.text)}&url=${encodeURIComponent(share.url)}`;
  window.open(url, "_blank", "noopener,noreferrer");
};

const Neighbours = ({ list, onPick }) => (
  <div className="mt-5" data-testid="resident-neighbours">
    <div className="font-head font-bold text-sm uppercase tracking-wide text-ink/60 mb-2">Neighbours</div>
    <div className="flex flex-wrap gap-2">
      {list.map((n) => (
        <button key={n.k} type="button" onClick={() => onPick(n.k)} className="relative hover:-translate-y-0.5 transition-transform" title={`@${n.h}`} data-testid={`neighbour-${n.k}`}>
          <Face src={n.a} size={48} ring={n.s === "r" ? "#FFA94D" : "#FFFFFF"} alt={`@${n.h}`} />
        </button>
      ))}
    </div>
  </div>
);

const Head = ({ d, title, sub }) => (
  <div className="flex items-center gap-4 pr-10">
    <Face src={d.avatar_url} size={76} ring={d.status === "reserved" ? "#FFA94D" : "#FFD90F"} alt={`@${d.h}`} />
    <div className="min-w-0">
      <div className="font-head font-bold text-2xl sm:text-3xl leading-tight break-words" data-testid="resident-title">{title}</div>
      {sub && <div className="font-head font-bold text-lg text-ink/70 mt-0.5" data-testid="resident-subtitle">{sub}</div>}
    </div>
  </div>
);

const Facts = ({ d }) => (
  <div className="mt-4 flex flex-wrap gap-2" data-testid="resident-facts">
    <span className="sticker bg-white text-base sm:text-lg" data-testid="resident-tier">{TIER_NAMES[d.tier].toUpperCase()}</span>
    {d.neighbourhood?.name && <span className="sticker bg-simp text-base sm:text-lg" data-testid="resident-neighbourhood">{d.neighbourhood.name.toUpperCase()}</span>}
    {d.brought > 0 && <span className="sticker bg-[#9FE1B4] text-base sm:text-lg" data-testid="resident-brought">BROUGHT {d.brought} · {d.brought_lit} LIT</span>}
  </div>
);

export const ResidentSheet = ({ handle, mode, version, onClose, onPick, onMoveIn, onHidden }) => {
  const [d, setD] = useState(null);
  const [missing, setMissing] = useState(false);
  const admin = getAdmin();

  useEffect(() => {
    let live = true;
    setMissing(false);
    api(`/residents/${encodeURIComponent(handle)}`).then((x) => live && setD(x)).catch((e) => live && e.status === 404 && setMissing(true));
    return () => { live = false; };
  }, [handle, version]);

  if (missing)
    return (
      <Sheet onClose={onClose} testId="resident-sheet">
        <div className="font-head font-bold text-2xl sm:text-3xl pr-10" data-testid="resident-title">@{handle} isn't in town yet.</div>
        <button type="button" onClick={() => onMoveIn(handle)} className="btn-toon w-full justify-center mt-5" data-testid="resident-move-in-button">MOVE @{handle.toUpperCase()} IN</button>
      </Sheet>
    );
  if (!d || d.k !== handle.toLowerCase())
    return (
      <Sheet onClose={onClose} testId="resident-sheet">
        <Loader2 className="w-8 h-8 animate-spin mx-auto my-6" strokeWidth={3} />
      </Sheet>
    );

  const hide = async () => {
    await api(`/admin/residents/${d.h}/hide`, { method: "POST", body: { hidden: true }, headers: { "X-Admin-Key": admin } });
    onHidden();
  };

  return (
    <Sheet onClose={onClose} testId="resident-sheet">
      {d.status === "reserved" ? (
        <>
          <Head d={d} title={mode === "ready" ? `@${d.h}, your house is ready.` : `Reserved for @${d.h}`} sub={d.by_h ? `@${d.by_h} moved you in.` : null} />
          <button type="button" onClick={() => onMoveIn(d.h)} className="btn-toon w-full justify-center mt-6 text-2xl sm:text-3xl" data-testid="resident-move-in-button">MOVE IN</button>
        </>
      ) : (
        <>
          <Head d={d} title={mode === "celebrate" ? `Welcome home, @${d.h}!` : `@${d.h}`} sub={d.by_h ? `Moved in by @${d.by_h}` : d.name} />
          <Facts d={d} />
          {mode === "celebrate" && d.card_url && (
            <img src={d.card_url} alt={`@${d.h}'s street card`} className="mt-5 w-full max-w-[300px] mx-auto rounded-2xl border-4 border-ink aspect-[3/4] object-cover bg-sky-light" data-testid="resident-card-image" />
          )}
          {mode !== "celebrate" && d.neighbours.length > 0 && <Neighbours list={d.neighbours} onPick={onPick} />}
          <button type="button" onClick={() => shareToX(d.share)} className="btn-toon w-full justify-center mt-6 text-2xl sm:text-3xl" data-testid="resident-share-button">SHARE MY STREET</button>
        </>
      )}
      <div className="mt-4 flex items-center justify-between gap-3">
        <a href={`https://x.com/${d.h}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-head font-bold text-ink/70 hover:text-ink" data-testid="resident-x-link">
          @{d.h} on X <ExternalLink className="w-4 h-4" strokeWidth={3} />
        </a>
        {admin && (
          <button type="button" onClick={hide} className="inline-flex items-center gap-1.5 font-head font-bold text-[#D9363E]" data-testid="resident-hide-button">
            <EyeOff className="w-4 h-4" strokeWidth={3} /> Hide house
          </button>
        )}
      </div>
    </Sheet>
  );
};
