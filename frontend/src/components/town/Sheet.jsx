import { X } from "lucide-react";

export const Sheet = ({ onClose, children, testId, wide = false }) => (
  <div className="absolute inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3 sm:pb-5 pointer-events-none" data-testid={testId}>
    <div className={`panel pointer-events-auto w-full ${wide ? "max-w-lg sm:max-w-3xl" : "max-w-lg"} px-5 pt-5 pb-6 max-h-[78vh] overflow-y-auto animate-in slide-in-from-bottom-8 fade-in duration-300`} style={{ "--panel-r": "20px" }}>
      <button type="button" onClick={onClose} className="absolute right-4 top-4 w-9 h-9 rounded-lg border-2 border-ink bg-white grid place-items-center hover:bg-brand transition-colors" aria-label="Close" data-testid="sheet-close-button">
        <X className="w-5 h-5" strokeWidth={2.5} />
      </button>
      {children}
    </div>
  </div>
);

export const Face = ({ src, size = 64, ring = "#FFFFFF", alt = "" }) => (
  <span className="inline-grid place-items-center rounded-full border-2 border-ink shrink-0 overflow-hidden" style={{ width: size, height: size, background: ring, padding: 3 }}>
    {src ? <img src={src} alt={alt} className="w-full h-full rounded-full object-cover border border-ink" /> : <span className="w-full h-full rounded-full bg-sky-light border border-ink" />}
  </span>
);

export const Stat = ({ label, value, testId }) => (
  <div className="rounded-xl border-2 border-ink bg-white px-3 py-2" data-testid={testId}>
    <div className="font-head font-semibold text-[11px] uppercase tracking-wider text-ink/60">{label}</div>
    <div className="font-display font-bold text-xl leading-tight">{value}</div>
  </div>
);

export const fmt = (n) => Number(n || 0).toLocaleString();
