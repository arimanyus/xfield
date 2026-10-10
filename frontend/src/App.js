import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { Nav } from "@/components/Nav";
import Landing from "@/pages/Landing";
import FindFlow from "@/pages/FindFlow";
import EpisodePage from "@/pages/EpisodePage";
import HandlePage from "@/pages/HandlePage";
import LeaderboardsPage from "@/pages/LeaderboardsPage";
import TimelinePage from "@/pages/TimelinePage";

export default function App() {
  return (
    <BrowserRouter>
      <div className="App relative bg-ink text-slate-50 vignette-bg">
        <div className="grain fixed inset-0 pointer-events-none z-[59]" />
        <div className="crt-overlay" />
        <Nav />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/find" element={<FindFlow />} />
          <Route path="/ep/:id" element={<EpisodePage />} />
          <Route path="/u/:handle" element={<HandlePage />} />
          <Route path="/leaderboards" element={<LeaderboardsPage />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="*" element={<Landing />} />
        </Routes>
        <footer className="max-w-6xl mx-auto px-4 py-10 font-osd text-slate-500 text-lg space-y-2">
          <div className="flex flex-wrap gap-x-6 gap-y-2 justify-between">
            <span>ALREADY AIRED · ARCHIVE OF “THE FORTUNES” · 30 SEASONS · 1990–2020</span>
            <span>Parody. Only public posts are read. Report any episode from its page.</span>
          </div>
          <p className="text-base text-slate-600" data-testid="footer-disclaimer">
            Inspired by the Simpsons-predictions phenomenon. Not affiliated with or endorsed by The Simpsons, Disney or Fox. “The Fortunes” and every episode here are fiction.
          </p>
        </footer>
        <Toaster theme="dark" position="top-center" richColors />
      </div>
    </BrowserRouter>
  );
}
