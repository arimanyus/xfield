import { useCallback, useEffect, useState } from "react";
import { Crown, Flag, Loader2 } from "lucide-react";
import { api, openXPost } from "@/lib/api";
import { Sheet, Face, Stat } from "@/components/town/Sheet";

const CharterForm = ({ options, title, cta, defaults = {}, onSubmit }) => {
  const [name, setName] = useState(defaults.name || "");
  const [color, setColor] = useState(defaults.color || options.colors[0]);
  const [landmark, setLandmark] = useState(defaults.landmark || Object.keys(options.landmarks)[0]);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ name: name.trim(), color, landmark }); }} className="mt-4 space-y-3" data-testid="charter-form">
      <div className="font-head font-semibold text-xs uppercase tracking-wider text-ink/60">{title}</div>
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={26} placeholder="District name" className="w-full rounded-xl border-2 border-ink bg-white px-3 py-2 font-head font-semibold text-lg outline-none focus:ring-2 focus:ring-brand" data-testid="charter-name-input" />
      <div className="flex flex-wrap gap-2">
        {options.colors.map((c) => (
          <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Colour ${c}`} aria-pressed={color === c} className={`w-9 h-9 rounded-lg border-2 border-ink ${color === c ? "ring-2 ring-offset-2 ring-ink" : ""}`} style={{ background: c }} data-testid={`charter-color-${c.slice(1)}`} />
        ))}
      </div>
      <select value={landmark} onChange={(e) => setLandmark(e.target.value)} className="w-full rounded-xl border-2 border-ink bg-white px-3 py-2 font-head font-semibold" data-testid="charter-landmark-select">
        {Object.entries(options.landmarks).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
      </select>
      <button type="submit" disabled={!name.trim()} className="btn-primary w-full justify-center" data-testid="charter-submit-button">{cta}</button>
    </form>
  );
};

export const CharterSheet = ({ options, onClose, onCreated }) => {
  const [error, setError] = useState(null);
  const submit = async (body) => {
    setError(null);
    try {
      const d = await api("/districts/charter", { method: "POST", body });
      onCreated(d.id);
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <Sheet onClose={onClose} testId="charter-sheet">
      <div className="title-display text-3xl leading-none pr-10">FOUND A DISTRICT</div>
      <p className="mt-2 font-head font-medium text-ink/70">You'll be its founder and first leader. Invite your people and fight for the field.</p>
      <CharterForm options={options} title="Charter" cta="FOUND IT" onSubmit={submit} />
      {error && <p className="mt-3 font-head font-semibold text-[#DC2626]" data-testid="charter-error">{error}</p>}
    </Sheet>
  );
};

export const DistrictSheet = ({ id, options, auth, version, onClose, onPick, onChanged }) => {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api(`/districts/${id}`).then(setD).catch((e) => setError(e.message)), [id]);
  useEffect(() => { setD(null); load(); }, [load, version, auth.user?.k]);

  const act = async (path, body) => {
    setBusy(true);
    setError(null);
    try {
      await api(path, { method: "POST", body });
      await load();
      onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!d)
    return (
      <Sheet onClose={onClose} testId="district-sheet">
        {error ? <p className="font-head font-semibold pr-10">{error}</p> : <Loader2 className="w-8 h-8 animate-spin mx-auto my-6" strokeWidth={2.5} />}
      </Sheet>
    );

  const me = d.me;
  const citizen = me?.member && me?.lit;
  const shareText = `${d.name || "My district"} stands ${d.floors} floors tall on XField today. Join our side \u2192`;
  return (
    <Sheet onClose={onClose} testId="district-sheet">
      <div className="flex items-center gap-3 pr-10">
        <span className="w-10 h-10 rounded-lg border-2 border-ink shrink-0" style={{ background: d.color }} />
        <div className="min-w-0">
          <div className="title-display text-2xl sm:text-3xl leading-tight break-words" data-testid="district-title">{d.name || "New district"}</div>
          <div className="font-head font-medium text-ink/70" data-testid="district-subtitle">
            {d.claimed ? <>Founded by @{d.founder?.h}{d.leader && d.leader.k !== d.founder?.k ? <> · Led by @{d.leader.h}</> : null}</> : <>Unclaimed · forming around @{d.anchor?.h}</>}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="Citizens" value={d.size} testId="district-size" />
        <Stat label="Floors" value={d.floors} testId="district-floors" />
        <Stat label="Crowns" value={d.titles || 0} testId="district-titles" />
      </div>

      {me?.can_claim && (
        <CharterForm options={options} title="This district has no leader yet" cta="LEAD THIS DISTRICT" defaults={{ name: d.name, color: d.color, landmark: d.landmark }}
          onSubmit={(body) => act(`/districts/${d.id}/claim`, body)} />
      )}

      {me?.lit && !me.member && (
        <button type="button" disabled={busy} onClick={() => act(`/districts/${d.id}/join`)} className="btn-primary w-full justify-center mt-4" data-testid="district-join-button">
          MOVE INTO {(d.name || "THIS DISTRICT").toUpperCase()}
        </button>
      )}
      {!auth.user && auth.enabled && (
        <button type="button" onClick={() => auth.login(`/d/${d.id}`)} className="btn-primary w-full justify-center mt-4" data-testid="district-signin-button">SIGN IN WITH X TO JOIN</button>
      )}

      {error && <p className="mt-3 font-head font-semibold text-[#DC2626]" data-testid="district-error">{error}</p>}

      <div className="mt-5" data-testid="district-election">
        <div className="font-head font-semibold text-xs uppercase tracking-wider text-ink/60 mb-2 inline-flex items-center gap-1"><Flag className="w-3.5 h-3.5" /> Election</div>
        {d.election.open ? (
          <p className="font-head font-medium text-sm text-ink/70 mb-2">Tap a citizen to vote. A majority of lit citizens makes a new leader.</p>
        ) : (
          <p className="font-head font-medium text-sm text-ink/70">Opens at {d.election.min} lit citizens ({d.lit}/{d.election.min}).</p>
        )}
        {d.election.tally.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {d.election.tally.map((t) => <span key={t.k} className="sticker bg-white text-xs">@{t.h} · {t.votes}</span>)}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2" data-testid="district-members">
        {d.members.map((m) => {
          const canVote = d.election.open && citizen && m.s === "f";
          return (
            <button key={m.k} type="button" disabled={busy}
              onClick={() => (canVote ? act(`/districts/${d.id}/vote`, { candidate: m.k }) : onPick(m.k))}
              className={`relative hover:-translate-y-0.5 transition-transform ${me?.vote === m.k ? "ring-2 ring-brand rounded-full" : ""}`} title={`@${m.h} · ${m.f} floors`} data-testid={`district-member-${m.k}`}>
              <Face src={m.a} size={44} ring={m.s === "r" ? "#FEF3C7" : d.color} alt={`@${m.h}`} />
              {(m.k === d.leader?.k) && <Crown className="absolute -top-2 -right-1 w-4 h-4 fill-[#FBBF24]" strokeWidth={2} />}
            </button>
          );
        })}
      </div>

      {d.allies.length > 0 && (
        <div className="mt-4 font-head font-medium text-sm" data-testid="district-allies">
          <span className="font-semibold">Allies:</span> {d.allies.map((a) => a.name || "New district").join(", ")}
        </div>
      )}

      <button type="button" onClick={() => openXPost(shareText, `${window.location.origin}/d/${d.id}`)} className="chip w-full justify-center mt-5" data-testid="district-share-button">
        SHARE THIS DISTRICT
      </button>
    </Sheet>
  );
};
