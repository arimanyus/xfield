import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Sky } from "@/components/Sky";
import { WobbleDefs } from "@/components/WobbleDefs";
import TimelinePage from "@/pages/TimelinePage";
import TownPage from "@/pages/TownPage";

export default function App() {
  return (
    <BrowserRouter>
      <div className="App relative overflow-x-clip" id="top">
        <WobbleDefs />
        <Sky />
        <Routes>
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/h/:handle" element={<TownPage />} />
          <Route path="*" element={<TownPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
