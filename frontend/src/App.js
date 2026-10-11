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
        <footer className="max-w-6xl mx-auto px-4 py-10 font-osd text-slate-600 text-base" data-testid="footer-disclaimer">
          ALREADY AIRED · Fan parody. Not affiliated with The Simpsons, Disney or Fox.
        </footer>
        <Toaster theme="dark" position="top-center" richColors />
      </div>
    </BrowserRouter>
  );
}
