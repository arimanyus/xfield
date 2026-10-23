import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const TONES = [
  { id: "pun", label: "PUN" },
  { id: "roast", label: "ROAST" },
  { id: "kind", label: "KIND" },
];

export const LawnSignPanel = ({ d, onSaved }) => {
  const [tone, setTone] = useState(d.sign_tone);
  const [saving, setSaving] = useState(false);
  useEffect(() => setTone(d.sign_tone), [d.k, d.sign_tone]);
  if (!d.signs) return null;
  const canSet = d.is_me && d.status === "finished";

  const save = async () => {
    setSaving(true);
    try {
      await api("/me/sign", { method: "POST", body: { tone } });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-5" data-testid="lawn-sign-panel">
      <div className="font-head font-semibold text-xs uppercase tracking-wider text-ink/60 mb-2">Billboard</div>
      <div className="flex gap-2">
        {TONES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTone(t.id)}
            aria-pressed={tone === t.id}
            className={`chip text-xs sm:text-sm ${tone === t.id ? "bg-brand" : ""}`}
            data-testid={`lawn-sign-tone-${t.id}`}
          >
            {t.label}
            {d.sign_tone === t.id && <span className="text-[10px] opacity-60">· UP</span>}
          </button>
        ))}
      </div>
      <div className="mt-3 rounded-xl border-2 border-ink bg-ink px-5 py-4 text-center" data-testid="lawn-sign-board">
        <div className="font-display font-bold text-xl sm:text-2xl leading-tight text-[#FCE38A]" data-testid="lawn-sign-text">{d.signs[tone]}</div>
      </div>
      {canSet && tone !== d.sign_tone && (
        <button type="button" onClick={save} disabled={saving} className="btn-primary w-full justify-center mt-4 text-base sm:text-lg" data-testid="lawn-sign-save-button">
          PUT THIS ON MY BILLBOARD
        </button>
      )}
    </div>
  );
};
