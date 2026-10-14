import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Sky } from "@/components/Sky";
import { WobbleDefs } from "@/components/WobbleDefs";
import { Footer } from "@/components/Footer";
import TimelinePage from "@/pages/TimelinePage";

export default function App() {
  return (
    <BrowserRouter>
      <div className="App relative overflow-x-clip" id="top">
        <WobbleDefs />
        <Sky />
        <Routes>
          <Route path="*" element={<TimelinePage />} />
        </Routes>
        <Footer />
      </div>
    </BrowserRouter>
  );
}
