import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { Nav } from "@/components/Nav";
import Landing from "@/pages/Landing";
import FindFlow from "@/pages/FindFlow";
import EpisodePage from "@/pages/EpisodePage";
import HandlePage from "@/pages/HandlePage";
import LeaderboardsPage from "@/pages/LeaderboardsPage";

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
          <Route path="*" element={<Landing />} />
        </Routes>
        <footer className="max-w-6xl mx-auto px-4 py-10 font-osd text-slate-500 text-lg flex flex-wrap gap-x-6 gap-y-2 justify-between">
          <span>ALREADY AIRED · ARCHIVE OF “THE FORTUNES” · 30 SEASONS · 1990–2020</span>
          <span>Parody. Only public posts are read. Report any episode from its page.</span>
        </footer>
        <Toaster theme="dark" position="top-center" richColors />
      </div>
    </BrowserRouter>
  );
}
