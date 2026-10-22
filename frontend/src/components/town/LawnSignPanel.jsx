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
      <div className="flex gap-2">
        {TONES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTone(t.id)}
            aria-pressed={tone === t.id}
            className={`chip-toon text-sm sm:text-base ${tone === t.id ? "bg-simp" : ""}`}
            data-testid={`lawn-sign-tone-${t.id}`}
          >
            {t.label}
            {d.sign_tone === t.id && <span className="text-xs opacity-60">· ON LAWN</span>}
          </button>
        ))}
      </div>
      <div className="mt-3 relative" data-testid="lawn-sign-board">
        <div className="toon px-5 py-5 text-center" style={{ "--toon-bg": "#FFFDF0", "--toon-r": "16px" }}>
          <div className="font-display text-2xl sm:text-3xl leading-tight pt-1" data-testid="lawn-sign-text">{d.signs[tone]}</div>
        </div>
      </div>
      {canSet && tone !== d.sign_tone && (
        <button type="button" onClick={save} disabled={saving} className="btn-toon w-full justify-center mt-4 text-lg sm:text-xl" data-testid="lawn-sign-save-button">
          PUT THIS ON MY LAWN
        </button>
      )}
    </div>
  );
};
