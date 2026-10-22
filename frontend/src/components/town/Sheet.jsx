import { X } from "lucide-react";

export const Sheet = ({ onClose, children, testId, wide = false }) => (
  <div className="absolute inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3 sm:pb-5 pointer-events-none" data-testid={testId}>
    <div className={`toon pointer-events-auto w-full ${wide ? "max-w-lg sm:max-w-3xl" : "max-w-lg"} px-5 pt-5 pb-6 max-h-[78vh] overflow-y-auto animate-in slide-in-from-bottom-8 fade-in duration-300`} style={{ "--toon-bg": "#FFFDF0", "--toon-r": "30px" }}>
      <button type="button" onClick={onClose} className="absolute right-4 top-4 w-10 h-10 rounded-full border-[3px] border-ink bg-white grid place-items-center hover:bg-simp transition-colors" aria-label="Close" data-testid="sheet-close-button">
        <X className="w-5 h-5" strokeWidth={3} />
      </button>
      {children}
    </div>
  </div>
);

export const Face = ({ src, size = 64, ring = "#FFFFFF", alt = "" }) => (
  <span className="inline-grid place-items-center rounded-full border-4 border-ink shrink-0 overflow-hidden" style={{ width: size, height: size, background: ring, padding: 4 }}>
    {src ? <img src={src} alt={alt} className="w-full h-full rounded-full object-cover border-2 border-ink" /> : <span className="w-full h-full rounded-full bg-sky-light border-2 border-ink" />}
  </span>
);
