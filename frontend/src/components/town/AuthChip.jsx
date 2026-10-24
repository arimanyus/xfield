import { useState } from "react";
import { LogIn, LogOut, Home, Landmark } from "lucide-react";
import { smallAvatar } from "@/lib/api";

const XLogo = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-label="X" role="img">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

export const AuthChip = ({ auth, onMyHouse, onMyDistrict }) => {
  const [open, setOpen] = useState(false);
  if (!auth.ready || !auth.enabled) return null;
  if (!auth.user)
    return (
      <button type="button" onClick={() => auth.login("/")} className="h-12 px-4 sm:px-5 rounded-xl bg-ink text-white border-2 border-ink font-head font-semibold text-sm sm:text-base inline-flex items-center gap-2 hover:-translate-y-0.5 transition-transform" data-testid="auth-signin-button">
        <LogIn className="w-5 h-5" strokeWidth={2.5} /> <span className="sm:hidden">Sign in</span><span className="hidden sm:inline-flex items-center gap-1.5">Sign in with <XLogo /></span>
      </button>
    );
  return (
    <div className="relative" data-testid="auth-user-chip">
      <button type="button" onClick={() => setOpen((v) => !v)} className="h-12 pl-1 pr-3 rounded-xl border-2 border-ink bg-white inline-flex items-center gap-2 hover:-translate-y-0.5 transition-transform" aria-label="My account" data-testid="auth-user-button">
        <img src={smallAvatar(auth.user.avatar_url)} alt={`@${auth.user.h}`} className="w-9 h-9 rounded-lg object-cover border border-ink" />
        <span className="font-display font-bold text-sm sm:text-base">@{auth.user.h}</span>
      </button>
      {open && (
        <div className="panel absolute right-0 mt-3 w-56 p-2" style={{ "--panel-r": "14px" }}>
          <div className="px-3 py-2 font-head font-semibold text-base truncate">@{auth.user.h}</div>
          <button type="button" onClick={() => { setOpen(false); onMyHouse(auth.user.k); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-brand/30 font-head font-semibold" data-testid="auth-my-house-button">
            <Home className="w-5 h-5" strokeWidth={2.5} /> My building
          </button>
          {auth.user.nb && (
            <button type="button" onClick={() => { setOpen(false); onMyDistrict(auth.user.nb); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-brand/30 font-head font-semibold" data-testid="auth-my-district-button">
              <Landmark className="w-5 h-5" strokeWidth={2.5} /> My district
            </button>
          )}
          <button type="button" onClick={() => { setOpen(false); auth.logout(); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-brand/30 font-head font-semibold" data-testid="auth-signout-button">
            <LogOut className="w-5 h-5" strokeWidth={2.5} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
};
