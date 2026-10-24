import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Sky } from "@/components/Sky";
import TownPage from "@/pages/TownPage";
import CityPage from "@/pages/CityPage";

export default function App() {
  return (
    <BrowserRouter>
      <div className="App relative overflow-x-clip" id="top">
        <Sky />
        <Routes>
          <Route path="/h/:handle" element={<TownPage />} />
          <Route path="/d/:district" element={<TownPage />} />
          <Route path="/census/:issue" element={<TownPage />} />
          <Route path="/census" element={<TownPage />} />
          <Route path="*" element={<CityPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
