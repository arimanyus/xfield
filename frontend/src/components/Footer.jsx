import { ArrowUp } from "lucide-react";

export const Footer = () => (
  <footer className="relative mt-20" data-testid="footer">
    <svg viewBox="0 0 1440 200" preserveAspectRatio="none" className="block w-full h-[120px] sm:h-[180px]" aria-hidden="true">
      <path d="M-10 110 C 240 30, 430 30, 650 100 S 1100 20, 1450 90 L1450 210 L-10 210 Z" fill="#8BD14A" stroke="#111" strokeWidth="5" vectorEffect="non-scaling-stroke" />
      <path d="M-10 160 C 300 95, 600 110, 860 155 S 1260 110, 1450 140 L1450 210 L-10 210 Z" fill="#5DB33A" stroke="#111" strokeWidth="5" vectorEffect="non-scaling-stroke" />
    </svg>
    <div className="bg-grass -mt-px px-4 pb-12 pt-2 text-center">
      <p className="font-head font-bold text-lg sm:text-xl text-ink" data-testid="footer-disclaimer">
        Fan site. Not affiliated with The Simpsons, Disney or Fox.
      </p>
      <a href="#top" className="btn-toon mt-6 text-lg sm:text-xl" data-testid="footer-back-to-top">
        Back to the sky <ArrowUp className="w-5 h-5 -mt-1" strokeWidth={3} />
      </a>
    </div>
  </footer>
);
