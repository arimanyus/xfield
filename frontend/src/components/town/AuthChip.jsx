import { useState } from "react";
import { LogIn, LogOut, Home } from "lucide-react";
import { smallAvatar } from "@/lib/api";

const XLogo = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-label="X" role="img">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

export const AuthChip = ({ auth, onMyHouse }) => {
  const [open, setOpen] = useState(false);
  if (!auth.ready || !auth.enabled) return null;
  if (!auth.user)
    return (
      <button type="button" onClick={() => auth.login("/")} className="h-14 px-4 sm:px-5 rounded-full bg-ink text-white border-4 border-ink font-head font-bold text-base sm:text-lg inline-flex items-center gap-2 hover:-translate-y-0.5 transition-transform" data-testid="auth-signin-button">
        <LogIn className="w-5 h-5" strokeWidth={3} /> <span className="sm:hidden">Sign in</span><span className="hidden sm:inline-flex items-center gap-1.5">Sign in with <XLogo /></span>
      </button>
    );
  return (
    <div className="relative" data-testid="auth-user-chip">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-14 h-14 rounded-full border-4 border-ink bg-simp p-1 hover:-translate-y-0.5 transition-transform" aria-label="My account" data-testid="auth-user-button">
        <img src={smallAvatar(auth.user.avatar_url)} alt={`@${auth.user.h}`} className="w-full h-full rounded-full object-cover border-2 border-ink" />
      </button>
      {open && (
        <div className="toon absolute right-0 mt-3 w-56 p-2" style={{ "--toon-bg": "#FFFDF0", "--toon-r": "20px" }}>
          <div className="px-3 py-2 font-head font-bold text-lg truncate">@{auth.user.h}</div>
          <button type="button" onClick={() => { setOpen(false); onMyHouse(auth.user.k); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-simp/40 font-head font-bold" data-testid="auth-my-house-button">
            <Home className="w-5 h-5" strokeWidth={3} /> My house
          </button>
          <button type="button" onClick={() => { setOpen(false); auth.logout(); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-simp/40 font-head font-bold" data-testid="auth-signout-button">
            <LogOut className="w-5 h-5" strokeWidth={3} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
};
