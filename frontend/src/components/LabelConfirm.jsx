import { useState } from "react";
import { ChipPicker } from "@/components/ChipPicker";
import { SpiceToggle } from "@/components/SpiceToggle";
import { CHIP_KEYS } from "@/lib/chips";

export const LabelConfirm = ({ profile, labels, setLabels, spice, setSpice, onConfirm, foundBy }) => {
  const [editing, setEditing] = useState(null);
  return (
    <section className="panel p-5 sm:p-7 animate-tv-on origin-center" data-testid="confirm-screen">
      <div className="flex items-center gap-4">
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="w-14 h-14 sm:w-16 sm:h-16 object-cover border-2 border-tape/50" data-testid="confirm-avatar" />
        ) : (
          <div className="w-14 h-14 bg-ink-3 border-2 border-tape/50" />
        )}
        <div className="min-w-0">
          <div className="osd text-sm">Signal found · {profile.post_count} posts read</div>
          <div className="font-display text-3xl sm:text-4xl leading-none mt-1 truncate" data-testid="confirm-name">
            {profile.name}
          </div>
          <div className="font-osd text-slate-400 text-lg">@{profile.handle}{foundBy ? ` · found by @${foundBy}` : ""}</div>
        </div>
      </div>
      {profile.bio && <p className="mt-4 text-slate-300 text-sm sm:text-base line-clamp-2" data-testid="confirm-bio">{profile.bio}</p>}

      <h2 className="font-display text-2xl sm:text-3xl mt-6 tracking-wide">
        We read <span className="text-tape">@{profile.handle}</span> as
      </h2>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xl sm:text-2xl font-osd">
        {CHIP_KEYS.map((k, i) => (
          <span key={k} className="flex items-center gap-2">
            <button
              type="button"
              data-testid={`confirm-label-${k}`}
              onClick={() => setEditing(editing === k ? null : k)}
              className={`chip text-xl sm:text-2xl px-4 py-2 ${editing === k ? "chip-on" : "border-tape/50 text-tape"}`}
            >
              {labels[k]}
            </button>
            {i < 2 && <span className="text-slate-500">·</span>}
          </span>
        ))}
      </div>
      <p className="font-osd text-slate-500 mt-2 text-base">Tap a label to change it.</p>

      {editing && (
        <div className="mt-4">
          <ChipPicker
            category={editing}
            value={labels[editing]}
            testPrefix="confirm"
            onPick={(v) => {
              setLabels({ ...labels, [editing]: v });
              setEditing(null);
            }}
          />
        </div>
      )}

      <div className="mt-7 flex flex-col sm:flex-row sm:items-center gap-3">
        <SpiceToggle value={spice} onChange={setSpice} />
        <button type="button" data-testid="confirm-generate-btn" onClick={onConfirm} className="btn-tape sm:ml-auto">
          Pull the episode
        </button>
      </div>
    </section>
  );
};
