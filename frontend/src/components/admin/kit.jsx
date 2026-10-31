import { useState } from "react";

// Small building blocks shared by the admin panels.
export const Panel = ({ children, className = "", testId }) => (
  <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`} data-testid={testId}>{children}</section>
);

export const Title = ({ children, hint }) => (
  <div className="mb-4">
    <h2 className="font-display text-lg font-bold">{children}</h2>
    {hint && <p className="text-sm text-slate-500">{hint}</p>}
  </div>
);

export const PrimaryButton = ({ children, onClick, disabled, type = "button", className = "", testId, tone = "ink" }) => {
  const tones = { ink: "bg-ink text-white hover:bg-slate-700", soft: "bg-slate-100 text-ink hover:bg-slate-200",
    danger: "bg-rose-50 text-rose-700 hover:bg-rose-100", brand: "bg-brand text-ink hover:bg-brand-dark" };
  return (
    <button type={type} onClick={onClick} disabled={disabled} data-testid={testId}
      className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]} ${className}`}>
      {children}
    </button>
  );
};

export const Stat = ({ label, value, sub, testId }) => (
  <div className="rounded-xl bg-slate-50 px-4 py-3" data-testid={testId}>
    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
    <div className="font-display text-3xl font-bold tabular-nums">{value}</div>
    {sub && <div className="text-xs text-slate-500">{sub}</div>}
  </div>
);

export function Avatar({ src, alt, size = 28 }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return <span className="grid shrink-0 place-items-center rounded-full bg-slate-200 text-xs font-bold uppercase text-slate-600"
      style={{ width: size, height: size }}>{(alt || "?").replace("@", "")[0]}</span>;
  }
  return <img src={src} alt={alt} onError={() => setBroken(true)} className="shrink-0 rounded-full bg-sky-light object-cover" style={{ width: size, height: size }} />;
}

export const ago = (iso) => {
  if (!iso) return "";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};
