import { useEffect, useState } from "react";
import { BadgeCheck, Crown, EyeOff, ExternalLink, Loader2, MapPin } from "lucide-react";
import { api, getAdmin, openXPost } from "@/lib/api";
import { Sheet, Face, Stat, fmt } from "@/components/town/Sheet";
import { LawnSignPanel } from "@/components/town/LawnSignPanel";

const until = (iso) => {
  const m = Math.max(0, Math.ceil((new Date(iso) - Date.now()) / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};

const Neighbours = ({ list, onPick }) => (
  <div className="mt-5" data-testid="resident-neighbours">
    <div className="font-head font-semibold text-xs uppercase tracking-wider text-ink/60 mb-2">Neighbours</div>
    <div className="flex flex-wrap gap-2">
      {list.map((n) => (
        <button key={n.k} type="button" onClick={() => onPick(n.k)} className="hover:-translate-y-0.5 transition-transform" title={`@${n.h} · ${n.f || 1} floors`} data-testid={`neighbour-${n.k}`}>
          <Face src={n.a} size={48} ring={n.s === "r" ? "#FEF3C7" : "#FFFFFF"} alt={`@${n.h}`} />
        </button>
      ))}
    </div>
  </div>
);

const Head = ({ d, title, sub }) => (
  <div className="flex items-center gap-4 pr-10">
    <Face src={d.avatar_url} size={76} ring={d.status === "reserved" ? "#FEF3C7" : d.neighbourhood?.color || "#34D399"} alt={`@${d.h}`} />
    <div className="min-w-0">
      <div className="font-head font-bold text-2xl sm:text-3xl leading-tight break-words" data-testid="resident-title">
        {title}
        {d.status === "finished" && <BadgeCheck className="inline w-7 h-7 ml-1.5 -mt-1 text-[#1D9BF0]" strokeWidth={2.5} data-testid="resident-verified-badge" />}
      </div>
      {sub && <div className="font-head font-medium text-lg text-ink/70 mt-0.5" data-testid="resident-subtitle">{sub}</div>}
    </div>
  </div>
);

const Facts = ({ d, onDistrict }) => {
  const nb = d.neighbourhood;
  return (
    <div className="mt-4 flex flex-wrap gap-2" data-testid="resident-facts">
      <span className="sticker bg-white text-sm sm:text-base" data-testid="resident-tier">{d.tier_name.toUpperCase()} · {d.floors} FL</span>
      {nb && (
        <button type="button" onClick={() => onDistrict(nb.id)} className="chip text-sm sm:text-base" style={{ background: nb.color }} data-testid="resident-neighbourhood">
          {nb.founder || nb.mayor ? <Crown className="w-4 h-4" strokeWidth={2.5} /> : <MapPin className="w-4 h-4" strokeWidth={2.5} />}
          {(nb.name || "New district").toUpperCase()}
        </button>
      )}
      {d.brought > 0 && <span className="sticker bg-brand text-sm sm:text-base" data-testid="resident-brought">BROUGHT {d.brought} · {d.brought_lit} LIT</span>}
    </div>
  );
};

const Economy = ({ d, onDone, onCharter }) => {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const e = d.economy;
  const nb = d.neighbourhood;
  const ready = !e.next_claim_at || new Date(e.next_claim_at) <= Date.now();

  const act = async (path, ok) => {
    setBusy(true);
    setNote(null);
    try {
      const r = await api(path, { method: "POST" });
      setNote(ok(r));
      onDone();
    } catch (err) {
      setNote(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5" data-testid="resident-economy">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Credits" value={fmt(e.credits)} testId="economy-credits" />
        <Stat label="Rent" value={`+${fmt(e.rent.net)}`} testId="economy-yield" />
        <Stat label="Land value" value={fmt(d.land_value)} testId="economy-land-value" />
      </div>
      <div className="mt-3 grid gap-2">
        <button type="button" disabled={busy || !ready} onClick={() => act("/me/claim", (r) => `+${fmt(r.net)} credits collected.`)} className="btn-primary justify-center text-base" data-testid="economy-claim-button">
          {ready ? `COLLECT +${fmt(e.rent.net)}` : `NEXT PAYOUT IN ${until(e.next_claim_at)}`}
        </button>
        <button type="button" disabled={nb?.founder} onClick={onCharter} className="chip justify-center text-sm disabled:opacity-40" data-testid="economy-charter-button">
          FOUND A DISTRICT
        </button>
      </div>
      {note && <p className="mt-2 font-head font-semibold text-sm" data-testid="economy-note">{note}</p>}
    </div>
  );
};

const ReservedActions = ({ d, auth, onMoveIn, built }) => {
  const isOwner = auth.user?.k === d.k;
  const invite = <button type="button" onClick={() => openXPost(d.share.text, d.share.url)} className={`${built ? "btn-primary" : "chip"} w-full justify-center mt-3 text-lg`} data-testid="resident-tag-button">TAG @{d.h.toUpperCase()} ON X</button>;
  if (isOwner) return <button type="button" onClick={() => onMoveIn(d.h)} className="btn-primary w-full justify-center mt-6 text-xl sm:text-2xl" data-testid="resident-move-in-button">TURN MY LIGHTS ON</button>;
  return (
    <div className="mt-6">
      {built && invite}
      {auth.enabled ? (
        <button type="button" onClick={() => auth.login(`/h/${d.h}`)} className={built ? "mt-3 w-full font-head font-semibold text-lg underline" : "btn-primary w-full justify-center text-lg sm:text-xl"} data-testid="resident-signin-button">
          {built ? "Is this you? Sign in with X" : "IS THIS YOU? SIGN IN WITH X"}
        </button>
      ) : (
        <div className="sticker bg-white w-full text-center text-base" data-testid="resident-signin-soon">SIGN IN WITH X IS COMING SOON</div>
      )}
      {!built && invite}
    </div>
  );
};

export const ResidentSheet = ({ handle, mode, version, auth, onClose, onPick, onMoveIn, onHidden, onChanged, onDistrict, onCharter }) => {
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
        <button type="button" onClick={() => onMoveIn(handle)} className="btn-primary w-full justify-center mt-5" data-testid="resident-build-button">RESERVE @{handle.toUpperCase()}'S LOT</button>
      </Sheet>
    );
  if (!d || d.k !== handle.toLowerCase())
    return (
      <Sheet onClose={onClose} testId="resident-sheet">
        <Loader2 className="w-8 h-8 animate-spin mx-auto my-6" strokeWidth={2.5} />
      </Sheet>
    );

  const hide = async () => {
    await api(`/admin/residents/${d.h}/hide`, { method: "POST", body: { hidden: true }, headers: { "X-Admin-Key": admin } });
    onHidden();
  };
  const changed = () => { setTick((t) => t + 1); onChanged(); };
  const reserved = d.status === "reserved";
  const title = reserved
    ? mode === "built" ? `@${d.h}'s lot is reserved!` : mode === "ready" ? `@${d.h}, your lot is ready.` : `Reserved for @${d.h}`
    : mode === "celebrate" ? `Welcome to XField, @${d.h}!` : `@${d.h}`;
  const sub = reserved
    ? mode === "built" ? `Only @${d.h} can light it. Tag them.` : d.by_h ? `@${d.by_h} reserved it.` : "Only the owner can light it."
    : d.by_h ? `Brought in by @${d.by_h}` : d.name;
  const shareText = d.is_me ? d.share.text : `@${d.h} lives in XField. Claim your lot \u2192`;

  return (
    <Sheet onClose={onClose} testId="resident-sheet">
      <Head d={d} title={title} sub={sub} />
      {!reserved && <Facts d={d} onDistrict={onDistrict} />}
      {(mode === "celebrate" || mode === "built") && (
        <img src={d.card_url} alt={`@${d.h}'s card`} className="mt-5 w-full max-w-[260px] mx-auto rounded-xl border-2 border-ink aspect-[3/4] object-cover bg-sky-light" data-testid="resident-card-image" />
      )}
      {d.economy && !reserved && <Economy d={d} onDone={changed} onCharter={onCharter} />}
      <LawnSignPanel d={d} onSaved={changed} />
      {reserved ? (
        <ReservedActions d={d} auth={auth} onMoveIn={onMoveIn} built={mode === "built"} />
      ) : (
        <>
          {d.neighbours.length > 0 && <Neighbours list={d.neighbours} onPick={onPick} />}
          <button type="button" onClick={() => openXPost(shareText, d.share.url)} className="btn-primary w-full justify-center mt-6 text-lg sm:text-xl" data-testid="resident-share-button">
            {d.is_me ? "SHARE MY BLOCK" : "SHARE THIS BUILDING"}
          </button>
        </>
      )}
      <div className="mt-4 flex items-center justify-between gap-3">
        <a href={`https://x.com/${d.h}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-head font-semibold text-ink/70 hover:text-ink" data-testid="resident-x-link">
          @{d.h} on X <ExternalLink className="w-4 h-4" strokeWidth={2.5} />
        </a>
        {admin && (
          <button type="button" onClick={hide} className="inline-flex items-center gap-1.5 font-head font-semibold text-[#DC2626]" data-testid="resident-hide-button">
            <EyeOff className="w-4 h-4" strokeWidth={2.5} /> Hide building
          </button>
        )}
      </div>
    </Sheet>
  );
};
