import { useEffect, useState } from "react";
import { BadgeCheck, EyeOff, ExternalLink, Loader2 } from "lucide-react";
import { api, getAdmin, openXPost } from "@/lib/api";
import { TIER_NAMES } from "@/lib/iso";
import { Sheet, Face } from "@/components/town/Sheet";
import { LawnSignPanel } from "@/components/town/LawnSignPanel";

const Neighbours = ({ list, onPick }) => (
  <div className="mt-5" data-testid="resident-neighbours">
    <div className="font-head font-bold text-sm uppercase tracking-wide text-ink/60 mb-2">Neighbours</div>
    <div className="flex flex-wrap gap-2">
      {list.map((n) => (
        <button key={n.k} type="button" onClick={() => onPick(n.k)} className="hover:-translate-y-0.5 transition-transform" title={`@${n.h}`} data-testid={`neighbour-${n.k}`}>
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
      <div className="font-head font-bold text-2xl sm:text-3xl leading-tight break-words" data-testid="resident-title">
        {title}
        {d.status === "finished" && <BadgeCheck className="inline w-7 h-7 ml-1.5 -mt-1 text-[#1D9BF0]" strokeWidth={2.5} data-testid="resident-verified-badge" />}
      </div>
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

const ReservedActions = ({ d, auth, onMoveIn, built }) => {
  const isOwner = auth.user?.k === d.k;
  const invite = <button type="button" onClick={() => openXPost(d.share.text, d.share.url)} className={`btn-toon w-full justify-center mt-3 text-xl sm:text-2xl ${built ? "" : "bg-white hover:bg-white"}`} data-testid="resident-tag-button">TAG @{d.h.toUpperCase()} ON X</button>;
  if (isOwner) return <button type="button" onClick={() => onMoveIn(d.h)} className="btn-toon w-full justify-center mt-6 text-2xl sm:text-3xl" data-testid="resident-move-in-button">TURN MY LIGHTS ON</button>;
  return (
    <div className="mt-6">
      {built && invite}
      {auth.enabled ? (
        <button type="button" onClick={() => auth.login(`/h/${d.h}`)} className={`${built ? "mt-3 w-full font-head font-bold text-lg underline" : "btn-toon w-full justify-center text-xl sm:text-2xl"}`} data-testid="resident-signin-button">
          {built ? `Is this you? Sign in with X` : `IS THIS YOU? SIGN IN WITH X`}
        </button>
      ) : (
        <div className="sticker bg-white w-full text-center text-base sm:text-lg" data-testid="resident-signin-soon">SIGN IN WITH X IS COMING SOON</div>
      )}
      {!built && invite}
    </div>
  );
};

export const ResidentSheet = ({ handle, mode, version, auth, onClose, onPick, onMoveIn, onHidden, onChanged }) => {
  const [d, setD] = useState(null);
  const [missing, setMissing] = useState(false);
  const [tick, setTick] = useState(0);
  const admin = getAdmin();

  useEffect(() => {
    let live = true;
    setMissing(false);
    api(`/residents/${encodeURIComponent(handle)}`).then((x) => live && setD(x)).catch((e) => live && e.status === 404 && setMissing(true));
    return () => { live = false; };
  }, [handle, version, tick, auth.user]);

  if (missing)
    return (
      <Sheet onClose={onClose} testId="resident-sheet">
        <div className="font-head font-bold text-2xl sm:text-3xl pr-10" data-testid="resident-title">@{handle} isn't in XField yet.</div>
        <button type="button" onClick={() => onMoveIn(handle)} className="btn-toon w-full justify-center mt-5" data-testid="resident-build-button">BUILD @{handle.toUpperCase()}'S HOUSE</button>
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
  const reserved = d.status === "reserved";
  const title = reserved
    ? mode === "built" ? `@${d.h}'s house is up!` : mode === "ready" ? `@${d.h}, your house is ready.` : `Reserved for @${d.h}`
    : mode === "celebrate" ? `Welcome home, @${d.h}!` : `@${d.h}`;
  const sub = reserved
    ? mode === "built" ? `Only @${d.h} can light it. Tag them.` : d.by_h ? `@${d.by_h} moved you in.` : "Only the owner can light it."
    : d.by_h ? `Moved in by @${d.by_h}` : d.name;
  const shareText = d.is_me ? d.share.text : `@${d.h} lives in XField. Find your house \u2192`;

  return (
    <Sheet onClose={onClose} testId="resident-sheet">
      <Head d={d} title={title} sub={sub} />
      {!reserved && <Facts d={d} />}
      {(mode === "celebrate" || mode === "built") && (
        <img src={d.card_url} alt={`@${d.h}'s street card`} className="mt-5 w-full max-w-[260px] mx-auto rounded-2xl border-4 border-ink aspect-[3/4] object-cover bg-sky-light" data-testid="resident-card-image" />
      )}
      <LawnSignPanel d={d} onSaved={() => { setTick((t) => t + 1); onChanged(); }} />
      {reserved ? (
        <ReservedActions d={d} auth={auth} onMoveIn={onMoveIn} built={mode === "built"} />
      ) : (
        <>
          {mode !== "celebrate" && d.neighbours.length > 0 && <Neighbours list={d.neighbours} onPick={onPick} />}
          <button type="button" onClick={() => openXPost(shareText, d.share.url)} className="btn-toon w-full justify-center mt-6 text-2xl sm:text-3xl" data-testid="resident-share-button">
            {d.is_me ? "SHARE MY STREET" : "SHARE THIS HOUSE"}
          </button>
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
