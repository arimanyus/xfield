import { Link, NavLink } from "react-router-dom";

export const Nav = () => (
  <header className="sticky top-0 z-40 backdrop-blur-xl bg-ink/80 border-b border-tape/20">
    <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
      <Link to="/" data-testid="nav-logo" className="font-display text-2xl sm:text-3xl tracking-[0.08em] leading-none">
        <span className="text-tape">ALREADY</span> <span className="text-white">AIRED</span>
        <span className="hidden sm:inline-block ml-3 align-middle font-osd text-sm tracking-[0.2em] text-slate-400">ARCHIVE</span>
      </Link>
      <nav className="flex items-center gap-2 sm:gap-4 font-osd text-lg sm:text-xl uppercase tracking-wider">
        <NavLink
          to="/leaderboards"
          data-testid="nav-leaderboards"
          className={({ isActive }) => `px-2 py-1 transition-colors ${isActive ? "text-tape" : "text-slate-300 hover:text-tape"}`}
        >
          Leaderboards
        </NavLink>
        <Link to="/" data-testid="nav-find" className="bg-tape text-ink px-3 py-1 hover:bg-tape-dark transition-colors whitespace-nowrap">
          Find episode
        </Link>
      </nav>
    </div>
  </header>
);
