import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { PREDICTIONS } from "@/data/predictions";
import { Hero } from "@/components/Hero";
import { FilterChips } from "@/components/FilterChips";
import { Timeline } from "@/components/Timeline";
import { Footer } from "@/components/Footer";

export default function TimelinePage() {
  const [cat, setCat] = useState("all");
  const { hash } = useLocation();
  const items = useMemo(() => PREDICTIONS.filter((p) => cat === "all" || p.category === cat), [cat]);

  useEffect(() => {
    if (!hash) return;
    setCat("all");
    const t = setTimeout(() => document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: "start" }), 120);
    return () => clearTimeout(t);
  }, [hash]);

  return (
    <>
      <Hero count={PREDICTIONS.length} />
      <main id="timeline" className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 scroll-mt-4" data-testid="timeline-page">
        <h2 className="title-toon text-4xl sm:text-5xl lg:text-6xl leading-none mb-8" data-testid="timeline-title">
          THE RECEIPTS
        </h2>
        <FilterChips value={cat} onChange={setCat} />
        <Timeline items={items} />
      </main>
      <Footer />
    </>
  );
}
