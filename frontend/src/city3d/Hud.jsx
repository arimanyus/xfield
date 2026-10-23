import { useEffect, useRef, useState } from "react";
import { CORE, WATER, heightAt } from "@/city3d/layout";

export const CARD = "rounded-2xl bg-white/90 backdrop-blur border border-white shadow-[0_8px_30px_rgba(15,23,42,0.18)]";
export const fmt = (n) => `₡${Math.round(n || 0).toLocaleString()}`;

export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export const countdown = (iso, now) => {
  const s = Math.max(0, Math.floor((new Date(iso).getTime() - now) / 1000));
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  return `${hh ? `${hh}:` : ""}${String(mm).padStart(hh ? 2 : 1, "0")}:${String(ss).padStart(2, "0")}`;
};

export const isLight = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 170;
};

export function Face({ p, size = 28, ring = "#FFFFFF" }) {
  return <img src={p?.a} alt={p ? `@${p.h}` : ""} title={p ? `@${p.h}` : ""} className="rounded-full bg-sky-light shrink-0"
    style={{ width: size, height: size, boxShadow: `0 0 0 2px ${ring}` }} />;
}

function Btn({ children, onClick, disabled, tone = "ink", className = "" }) {
  const tones = { ink: "bg-ink text-white hover:bg-slate-700", brand: "bg-brand text-ink hover:bg-brand-dark", soft: "bg-slate-100 text-ink hover:bg-slate-200" };
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors disabled:opacity-40 ${tones[tone]} ${className}`}>
      {children}
    </button>
  );
}

export function MayorBar({ city, me, districts, onVote, onBoost, onRun, busy, now }) {
  const [open, setOpen] = useState(false);
  const e = me?.economy;
  const mine = e?.vote;
  const isMayor = me && city.mayor?.k === me.k;
  return (
    <div className={`${CARD} w-[min(92vw,440px)] pointer-events-auto`}>
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 px-3 py-2 text-left">
        {city.mayor ? <Face p={city.mayor} size={34} ring="#0F172A" /> : <div className="w-[34px] h-[34px] rounded-full bg-slate-200" />}
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-widest text-ink/50">Mayor of XField</div>
          <div className="font-display font-bold truncate">{city.mayor ? `@${city.mayor.h}` : "Nobody yet"}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-bold uppercase tracking-widest text-ink/50">Next mayor in</div>
          <div className="font-display font-bold tabular-nums text-lg leading-none">{countdown(city.ends_at, now)}</div>
        </div>
        <span className="rounded-lg bg-ink text-white text-xs font-bold px-2 py-1">{mine ? "VOTED" : "VOTE"}</span>
      </button>
      {open && (
        <div className="border-t border-slate-200 px-3 py-2 space-y-2 text-sm">
          <div className="text-xs text-ink/70">
            Anyone can run for {fmt(city.run_fee)}, and every citizen gets one vote per term. The winner runs the city
            for {city.term_hours >= 1 ? `${city.term_hours}h` : `${Math.round(city.term_hours * 60)} min`}, picks one district to earn
            ×1.5 rent, and is paid the city vault ({fmt(city.vault)}: campaign fees plus the {Math.round(city.tax * 100)}% tax on rent and wages) when the term ends.
          </div>
          {e && (e.running ? <div className="text-xs font-bold text-brand-dark">You're on the ballot. Get your neighbours to vote for you.</div>
            : <Btn tone="brand" disabled={busy || e.credits < city.run_fee} onClick={onRun}>Run for mayor · {fmt(city.run_fee)}</Btn>)}
          {city.race.length ? city.race.map((c, i) => (
            <div key={c.k} className="flex items-center gap-2">
              <span className="w-4 text-xs font-bold text-ink/50">{i + 1}</span>
              <Face p={c} size={24} />
              <span className="font-semibold truncate flex-1">@{c.h}</span>
              <div className="w-24 h-2 rounded-full bg-slate-200 overflow-hidden">
                <div className="h-full bg-brand" style={{ width: `${(100 * c.votes) / Math.max(1, city.voters)}%` }} />
              </div>
              <span className="w-6 text-right text-xs font-bold tabular-nums">{c.votes}</span>
              {me && c.k !== me.k && mine !== c.k && <Btn tone="soft" onClick={() => onVote(c.k)}>Vote</Btn>}
              {mine === c.k && <span className="text-xs font-bold text-brand-dark">your vote</span>}
            </div>
          )) : <div className="text-xs text-ink/60">Nobody is running yet. If nobody runs, the mayor stays on.</div>}
          <div className="text-xs text-ink/60">{city.voters} of {city.citizens} citizens voted.</div>
          <div className="text-xs font-semibold">
            Boost: {city.boost ? <span style={{ color: city.boost.color }}>{city.boost.name} earns ×1.5 rent</span> : "the mayor hasn't picked a district yet"}
          </div>
          {isMayor && (
            <div className="flex flex-wrap gap-1.5">
              {districts.map((d) => (
                <Btn key={d.id} tone="soft" onClick={() => onBoost(d.id)} disabled={city.boost?.id === d.id}>
                  <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: d.color }} />{d.name || "New district"}
                </Btn>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TopDistricts({ districts, boost, onPick }) {
  const [open, setOpen] = useState(true);
  return (
    <div className={`${CARD} w-60 pointer-events-auto`}>
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-3 py-2">
        <span className="text-[11px] font-bold uppercase tracking-widest text-ink/60">Top districts</span>
        <span className="text-xs text-ink/40">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <ol className="px-2 pb-2">
          {districts.slice(0, 10).map((d, i) => (
            <li key={d.id}>
              <button type="button" onClick={() => onPick(d)} className="w-full flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-slate-100 text-left">
                <span className="w-4 text-xs font-bold text-ink/40">{i + 1}</span>
                <span className="w-3 h-3 rounded shrink-0" style={{ background: d.color }} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold truncate">{d.name || "New district"}{boost === d.id ? " ⚡" : ""}</span>
                  <span className="block text-[11px] text-ink/60">{d.size} citizens · tallest {d.tallest} · {fmt(d.treasury)}</span>
                </span>
              </button>
            </li>
          ))}
          {!districts.length && <li className="px-2 py-1 text-xs text-ink/60">No districts yet. Six friends in one place make one.</li>}
        </ol>
      )}
    </div>
  );
}

function Task({ done, title, sub, action }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className={`w-4 h-4 rounded-full border-2 grid place-items-center text-[9px] ${done ? "bg-brand border-brand text-ink" : "border-slate-300"}`}>{done ? "✓" : ""}</span>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-semibold ${done ? "text-ink/40 line-through" : ""}`}>{title}</div>
        {sub && <div className="text-[11px] text-ink/60">{sub}</div>}
      </div>
      {action}
    </div>
  );
}

export const shiftReady = (e, now) => !e.next_shift_at || new Date(e.next_shift_at).getTime() <= now;

export function MyHome({ me, district, city, now, busy, onCollect, onInvite, onFund, onFocus, onWork, onCore, copied }) {
  const e = me.economy, r = e.rent;
  const ready = !e.next_claim_at || new Date(e.next_claim_at).getTime() <= now;
  const working = shiftReady(e, now);
  const place = Object.values(CORE).find((c) => c.id === e.job);
  const mates = me.home.mates.filter((m) => m.k !== me.k);
  const [open, setOpen] = useState(true);
  const left = [ready, working, !e.guests, !e.vote].filter(Boolean).length;
  return (
    <div className={`${CARD} w-[min(92vw,330px)] pointer-events-auto`}>
      <div className="flex items-center gap-3 px-3 pt-3">
        <button type="button" onClick={onFocus}><Face p={{ a: me.avatar_url, h: me.h }} size={44} ring={district?.color || "#0F172A"} /></button>
        <div className="min-w-0 flex-1">
          <div className="font-display font-bold truncate">@{me.h}</div>
          <div className="text-xs text-ink/70 truncate">
            {me.floors}-story home{district ? <> in <b style={{ color: district.color }}>{district.name || "a new district"}</b></> : " · no district yet"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-bold uppercase tracking-widest text-ink/50">Credits</div>
          <div className="font-display font-bold text-xl leading-none tabular-nums">{fmt(e.credits)}</div>
        </div>
      </div>
      {mates.length > 0 && (
        <div className="flex items-center gap-1 px-3 pt-2 text-[11px] text-ink/60">
          Living with {mates.slice(0, 6).map((m) => <Face key={m.k} p={m} size={18} />)}
        </div>
      )}
      <div className="mx-3 mt-3 rounded-xl bg-slate-50 px-3 py-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-ink/50">Rent</div>
            <div className="font-display font-bold tabular-nums">{fmt(r.net)}<span className="text-xs text-ink/50"> / payout</span></div>
          </div>
          {ready ? <Btn tone="brand" disabled={busy} onClick={onCollect} className="text-sm px-3 py-1.5">COLLECT {fmt(r.net)}</Btn>
            : <span className="text-xs font-semibold text-ink/60 tabular-nums">next in {countdown(e.next_claim_at, now)}</span>}
        </div>
        <div className="mt-1 text-[11px] text-ink/60">
          ₡100 base + ₡{40 * (r.stories - 1)} for {r.stories} {r.stories === 1 ? "story" : "stories"} + ₡{10 * Math.min(r.neighbours, 30)} for {r.neighbours} neighbours
          {r.mult !== 1 ? ` × ${r.mult.toFixed(2)}` : ""} − {Math.round(city.tax * 100)}% city tax
        </div>
      </div>
      <div className="px-3 py-2">
        <button type="button" onClick={() => setOpen(!open)} className="w-full flex justify-between text-[10px] font-bold uppercase tracking-widest text-ink/50 mb-0.5">
          <span>Next up · {left} to do</span><span>{open ? "−" : "+"}</span>
        </button>
        {open && <>
        <Task done={!ready} title="Collect your rent" sub={ready ? "It's ready." : "Collected. Come back when it refills."} />
        {place ? (
          <Task done={!working} title={`Work your shift at the ${place.name}`}
            sub={working ? `${e.title} · shift ${e.shifts + 1}. Pay rises every shift you stay.` : `Back on shift in ${countdown(e.next_shift_at, now)}.`}
            action={working && <Btn tone="brand" disabled={busy} onClick={() => onWork(e.job)}>{fmt(e.wage.net)}</Btn>} />
        ) : (
          <Task done={false} title="Get a job" sub="Hospital, school, bank, police… click any building around the mayor's square."
            action={<Btn tone="soft" onClick={onCore}>Show me</Btn>} />
        )}
        <Task done={e.guests > 0} title="Bring a friend home"
          sub={e.guests ? `${e.guests} moved in with you. Every friend adds a story and pays you both ${fmt(e.bounty)}.`
            : `Each friend who moves in adds a story to your home, and you both get ${fmt(e.bounty)}.`}
          action={<Btn onClick={onInvite}>{copied ? "Copied!" : "Copy link"}</Btn>} />
        <Task done={!!e.vote} title="Vote for mayor" sub={e.vote ? `You voted for @${e.vote}.` : "Open the mayor bar to see who's running."} />
        {district && (
          <Task done={false} title={`Fund ${district.name || "your district"}`}
            sub={`Treasury ${fmt(e.treasury)}. Projects add plots, height or highways.`}
            action={<Btn tone="soft" disabled={busy || e.credits < 100} onClick={onFund}>₡100</Btn>} />
        )}
        </>}
      </div>
    </div>
  );
}

export function Minimap({ city, me, onPick }) {
  const ref = useRef();
  const [x0, x1, z0, z1] = city.island;
  const W = 200, scale = W / (x1 - x0 + 1), H = Math.round((z1 - z0 + 1) * scale);
  useEffect(() => {
    const ctx = ref.current.getContext("2d");
    const px = (x) => (x - x0) * scale, pz = (z) => (z - z0) * scale;
    const img = ctx.createImageData(W, H);
    const data = img.data;
    for (let py = 0; py < H; py++) {
      for (let x = 0; x < W; x++) {
        const h = heightAt(x0 + (x + 0.5) / scale, z0 + (py + 0.5) / scale, city);
        const i = (py * W + x) * 4;
        const c = h < WATER + 0.02 ? [76, 151, 209] : h < WATER + 0.05 ? [228, 210, 168] : h < 0.9 ? [125, 181, 99] : [94, 154, 72];
        data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    for (const p of city.pads) {
      ctx.fillStyle = p.color;
      ctx.fillRect(px(p.x - p.w / 2 + 0.5), pz(p.z - p.d / 2 + 0.5), p.w * scale, p.d * scale);
    }
    ctx.fillStyle = "#94A3B8";
    for (const r of city.roads) ctx.fillRect(px(r.x), pz(r.z), scale, scale);
    for (const h of city.homes) {
      ctx.fillStyle = h.color;
      ctx.fillRect(px(h.x) + 0.5, pz(h.z) + 0.5, scale - 1, scale - 1);
    }
    if (me) {
      ctx.strokeStyle = "#0F172A";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px(me[0] + 0.5), pz(me[1] + 0.5), 5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [city, me, x0, z0, scale, W, H]);
  const click = (e) => {
    const b = e.currentTarget.getBoundingClientRect();
    onPick([x0 + ((e.clientX - b.left) / b.width) * (x1 - x0 + 1) - 0.5, z0 + ((e.clientY - b.top) / b.height) * (z1 - z0 + 1) - 0.5]);
  };
  return (
    <div className={`${CARD} p-1.5 pointer-events-auto`}>
      <canvas ref={ref} width={W} height={H} onClick={click} className="block rounded-xl cursor-pointer" style={{ width: W, height: H }} />
    </div>
  );
}

export function CivicCard({ place, me, now, busy, onWork, onClose }) {
  const e = me?.economy;
  const mine = e?.job === place.id;
  const pay = e && (mine ? e.wage : e.wage_new);
  return (
    <div className={`${CARD} w-[min(92vw,320px)] p-3 pointer-events-auto`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-display font-bold" style={{ color: place.color }}>{place.name}</div>
          <div className="text-xs text-ink/70">{place.workers || "No"} {place.job.toLowerCase()}{place.workers === 1 ? "" : "s"} work here</div>
        </div>
        <button type="button" onClick={onClose} className="text-ink/40 hover:text-ink text-lg leading-none">×</button>
      </div>
      {e ? (
        <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2">
          <div className="text-sm">
            {mine ? <>You're a <b>{place.job}</b> here · {e.shifts} {e.shifts === 1 ? "shift" : "shifts"}</> : <>Work as a <b>{place.job}</b></>}
          </div>
          <div className="text-[11px] text-ink/60">
            {fmt(pay.net)} a shift after tax, rising {fmt(6)} every shift you stay, up to double.
            {!mine && e.job ? " Switching jobs starts you over." : ""}
          </div>
          <div className="mt-2">
            {shiftReady(e, now) ? <Btn tone="brand" disabled={busy} onClick={() => onWork(place.id)} className="text-sm px-3 py-1.5">Work a shift · {fmt(pay.net)}</Btn>
              : <span className="text-xs font-semibold text-ink/60 tabular-nums">Off shift for {countdown(e.next_shift_at, now)}</span>}
          </div>
        </div>
      ) : <div className="mt-2 text-xs text-ink/60">Sign in with X to work here.</div>}
    </div>
  );
}

export function HomeCard({ home, nb, me, running, onVote, onClose }) {
  return (
    <div className={`${CARD} w-[min(92vw,320px)] p-3 pointer-events-auto`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-display font-bold">@{home.owner.h}'s home</div>
          <div className="text-xs text-ink/70">
            {home.owner.s === "r" && home.stories === 1 ? "Reserved lot · they haven't moved in yet" : `${home.stories} ${home.stories === 1 ? "story" : "stories"}`}
            {nb ? <> · <b style={{ color: nb.color }}>{nb.name || "New district"}</b></> : ""}
          </div>
        </div>
        <button type="button" onClick={onClose} className="text-ink/40 hover:text-ink text-lg leading-none">×</button>
      </div>
      <div className="mt-2 space-y-1.5">
        {home.people.map((p) => (
          <div key={p.k} className="flex items-center gap-2">
            <Face p={p} size={26} />
            <a href={`https://x.com/${p.h}`} target="_blank" rel="noreferrer" className="flex-1 text-sm font-semibold truncate hover:underline">@{p.h}</a>
            {p.s === "r" ? <span className="text-[11px] text-ink/50">reserved</span>
              : me && p.k !== me.k && running.has(p.k) && (me.economy?.vote === p.k ? <span className="text-[11px] font-bold text-brand-dark">your vote</span>
                : <Btn tone="soft" onClick={() => onVote(p.k)}>Vote for mayor</Btn>)}
          </div>
        ))}
      </div>
    </div>
  );
}
