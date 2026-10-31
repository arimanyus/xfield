import { Check, HelpCircle } from "lucide-react";
import { CARD, Face, Standing, onX } from "@/city3d/Hud";
import { tagText } from "@/city3d/PeoplePicker";

const WARM = "#FCD34D";

const Step = ({ n, done, title, sub, children, testId }) => (
  <li className="flex items-center gap-2.5" data-testid={testId} data-done={done ? "yes" : "no"}>
    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors ${done ? "bg-emerald-500 text-white" : "bg-slate-100 text-ink/70"}`}>
      {done ? <Check className="w-3.5 h-3.5" strokeWidth={4} /> : n}
    </span>
    <span className="min-w-0 flex-1 leading-tight">
      <span className={`block text-sm font-bold ${done ? "text-ink/50" : ""}`}>{title}</span>
      {sub && <span className="block text-[11px] text-ink/60">{sub}</span>}
    </span>
    {children}
  </li>
);

const Small = ({ onClick, href, children, testId, soft }) => {
  const cls = `shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold whitespace-nowrap transition-colors ${soft ? "bg-slate-100 text-ink hover:bg-slate-200" : "bg-ink text-white hover:bg-slate-700"}`;
  return href
    ? <a href={href} target="_blank" rel="noreferrer" onClick={onClick} className={cls} data-testid={testId}>{children}</a>
    : <button type="button" onClick={onClick} className={cls} data-testid={testId}>{children}</button>;
};

function Progress({ l }) {
  const frac = Math.max(0, Math.min(1, (l.score - l.start) / (l.line - l.start)));
  const toGo = Math.max(0, l.line - l.score);
  return (
    <div className="mt-2" data-testid="uptown-progress">
      <div className="h-2.5 rounded-full bg-slate-200 overflow-hidden"><div className="h-full bg-amber-300 transition-[width] duration-700" style={{ width: `${Math.max(4, frac * 100)}%` }} /></div>
      <div className="mt-1 flex justify-between text-[11px] font-bold text-ink/60 tabular-nums">
        <span>{l.uptown ? "You're uptown" : `${toGo} points to uptown`}</span><span>{l.line}</span>
      </div>
    </div>
  );
}

function VoteStep({ l, cast }) {
  if (l.need > 0) {
    return (
      <Step n={1} done={false} title="Cast your first votes" testId="goal-vote"
        sub={`Voting opens at ${l.of + l.need} players. ${l.need} more ${l.need === 1 ? "needs" : "need"} to sign in.`}>
        <span className="flex gap-1" title={`${l.of} of ${l.of + l.need} players`} data-testid="goal-vote-players">
          {Array.from({ length: l.of + l.need }, (_, i) => <span key={i} className={`h-2.5 w-2.5 rounded-full ${i < l.of ? "bg-amber-400" : "bg-slate-200"}`} />)}
        </span>
      </Step>
    );
  }
  return (
    <Step n={1} done={l.left === 0} title={cast ? "Cast today's votes" : "Cast your first votes"} testId="goal-vote"
      sub={l.left ? `${l.left} of 3 left today · lift your neighbours` : "Done for today. 3 more tomorrow."} />
  );
}

function TagStep({ me, onPeople, onDone }) {
  const street = me.street, lit = street.filter((p) => p.s === "f").length, dark = street.filter((p) => p.s === "r");
  const done = street.length > 0 && (lit === street.length || Boolean(me.done?.tag));
  const sub = street.length ? `${lit} of ${street.length} moved in · ${me.invites_left} ${me.invites_left === 1 ? "invite" : "invites"} left`
    : "Up to 3 people. Each gets a dark house next to yours.";
  return (
    <Step n={3} done={done} title="Tag your 3 on X to move them in" testId="goal-tag" sub={sub}>
      <span className="flex gap-1">
        {me.invites_left > 0 && <Small onClick={onPeople} soft={street.length > 0} testId="goal-invite-button">{street.length ? "+ Invite" : "Invite"}</Small>}
        {dark.length > 0 && <Small href={onX(tagText(dark), me.share.url)} onClick={() => onDone("tag")} testId="goal-tag-button">𝕏 Tag</Small>}
      </span>
    </Step>
  );
}

// Your building, once people live on top of it or you live on top of someone's.
function MyBuilding({ b, share }) {
  if (!b || b.size < 2) return null;
  const line = b.floor > 1 ? `You live on floor ${b.floor} of @${b.base.h}'s building` : `${b.size} people live on my building`;
  return (
    <div className="mt-2.5 flex items-center gap-2 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold" data-testid="next-move-building">
      <span className="min-w-0 flex-1">🏢 {line}{b.rank ? ` · #${b.rank} tallest` : ""}</span>
      {share && b.floor === 1 && <Small href={onX(share.text, share.url)} testId="next-move-share-building">𝕏 Share</Small>}
    </div>
  );
}

// What to do now you live here: vote, share your card, and bring your people in.
export function NextMove({ me, onFocus, onPeople, onVisit, onDone, onTour }) {
  const l = me.ladder, shared = Boolean(me.done?.share);
  return (
    <div className={`${CARD} w-[min(92vw,350px)] p-3 pointer-events-auto`} data-testid="next-move-card">
      <div className="flex items-center gap-2.5">
        <button type="button" onClick={onFocus} title="Your house" className="shrink-0" data-testid="next-move-my-house"><Face p={{ a: me.avatar_url, h: me.h }} size={40} ring={WARM} /></button>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="font-display font-bold">Your next move</div>
          {l && <div className="text-[11px] text-ink/70" data-testid="next-move-standing"><Standing l={l} /></div>}
        </div>
        <button type="button" onClick={onTour} title="How XField works" className="text-ink/40 hover:text-ink" data-testid="next-move-tour-button">
          <HelpCircle className="w-5 h-5" strokeWidth={2.5} />
        </button>
      </div>
      {l && <Progress l={l} />}
      <MyBuilding b={me.building} share={me.tower_share} />
      <ol className="mt-3 space-y-2.5">
        {l && <VoteStep l={l} cast={me.cast} />}
        <Step n={2} done={shared} title="Share your card on X" testId="goal-share"
          sub={shared ? "Shared. Post it again any time." : "Your house, your street and your rank, in one picture"}>
          <Small href={onX(me.share.text, me.share.url)} onClick={() => onDone("share")} soft={shared} testId="goal-share-button">𝕏 Post</Small>
        </Step>
        {!shared && (
          <a href={onX(me.share.text, me.share.url)} target="_blank" rel="noreferrer" onClick={() => onDone("share")} className="block" data-testid="share-card-preview">
            <img src={me.card_url} alt="Your share card" className="w-full aspect-[40/21] rounded-lg border border-slate-200 object-cover bg-sky-light hover:opacity-90 transition-opacity" />
          </a>
        )}
        <TagStep me={me} onPeople={onPeople} onDone={onDone} />
      </ol>
      {l?.rabbit && (
        <div className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold" data-testid="next-move-rabbit">
          <Face p={l.rabbit} size={16} /> {l.rabbit.gap > 0 ? `@${l.rabbit.h} is ${l.rabbit.gap} ahead of you` : `You're level with @${l.rabbit.h}`}
        </div>
      )}
      {me.neighbours.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1" data-testid="next-move-street">
          {me.neighbours.map((p) => (
            <button key={p.k} type="button" onClick={() => onVisit(p)} title={`@${p.h}${p.s === "f" ? "" : " · dark"}`} className="hover:scale-110 transition-transform">
              <Face p={p} size={24} ring={p.s === "f" ? WARM : "#CBD5E1"} dim={p.s !== "f"} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
