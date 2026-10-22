import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Sky } from "@/components/Sky";
import { WobbleDefs } from "@/components/WobbleDefs";
import TownPage from "@/pages/TownPage";

export default function App() {
  return (
    <BrowserRouter>
      <div className="App relative overflow-x-clip" id="top">
        <WobbleDefs />
        <Sky />
        <Routes>
          <Route path="/h/:handle" element={<TownPage />} />
          <Route path="/census/:issue" element={<TownPage />} />
          <Route path="/census" element={<TownPage />} />
          <Route path="*" element={<TownPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
