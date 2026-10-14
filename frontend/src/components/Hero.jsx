import { ArrowDown } from "lucide-react";
import { Stats } from "@/components/Stats";

export const Hero = ({ count }) => (
  <header className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-5" data-testid="hero">
    <div className="flex items-center justify-between gap-3">
      <a href="#top" className="title-toon-sm text-2xl sm:text-3xl" data-testid="logo">
        ALREADY AIRED
      </a>
      <span className="sticker bg-white text-base sm:text-lg -rotate-2" data-testid="hero-count-pill">
        {count} PREDICTIONS
      </span>
    </div>

    <div className="grid md:grid-cols-[1.25fr_1fr] items-center gap-6 md:gap-10 pt-10 sm:pt-16 pb-10">
      <div>
        <h1 className="title-toon text-5xl sm:text-6xl lg:text-7xl leading-[1.02] animate-pop" data-testid="hero-title">
          THE SIMPSONS
          <br />
          SAW IT COMING.
        </h1>
        <p className="mt-6 font-head font-bold text-xl sm:text-2xl text-white [text-shadow:2px_2px_0_#111]" data-testid="hero-subtitle">
          {count} times a cartoon called the future. Years early.
        </p>
        <a href="#timeline" className="btn-toon mt-8" data-testid="hero-cta">
          See the receipts <ArrowDown className="w-6 h-6 -mt-1" strokeWidth={3} />
        </a>
      </div>
      <div className="relative mx-auto w-64 sm:w-80 md:w-full max-w-md">
        <img src="/art/tv.webp" alt="Cartoon TV showing a crystal ball" className="w-full animate-bob drop-shadow-[8px_10px_0_rgba(0,0,0,0.25)]" data-testid="hero-tv-art" />
        <img src="/art/donut.webp" alt="" className="absolute -bottom-4 -left-6 w-24 sm:w-32 animate-spin-slow" aria-hidden="true" />
      </div>
    </div>

    <Stats />
  </header>
);
