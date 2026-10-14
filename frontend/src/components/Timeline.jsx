import { motion, useReducedMotion } from "framer-motion";
import { PredictionCard } from "@/components/PredictionCard";

const group = (list) => {
  const m = new Map();
  list.forEach((p) => m.set(p.event, [...(m.get(p.event) || []), p]));
  return [...m.entries()];
};

const YearBubble = ({ year }) => (
  <div className="relative z-10 flex md:justify-center" data-testid={`year-${year}`}>
    <span className="font-display text-3xl sm:text-4xl leading-none bg-simp border-4 border-ink rounded-full px-5 pt-3 pb-1.5 -rotate-3 shadow-[4px_5px_0_#111]">
      {year}
    </span>
  </div>
);

export const Timeline = ({ items }) => {
  const reduce = useReducedMotion();
  let idx = 0;
  return (
    <ol className="relative mt-10" data-testid="timeline-list">
      <div aria-hidden="true" className="absolute top-2 bottom-2 left-[22px] md:left-1/2 w-3 -translate-x-1/2 rounded-full bg-ink" />
      {group(items).map(([year, list]) => (
        <li key={year} className="relative mb-12">
          <YearBubble year={year} />
          <ul className="mt-8 space-y-12">
            {list.map((p) => {
              const right = idx++ % 2 === 1;
              return (
                <motion.li
                  key={p.id}
                  initial={reduce ? false : { opacity: 0, y: 40, scale: 0.96 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true, amount: 0.15 }}
                  transition={{ type: "spring", stiffness: 260, damping: 22 }}
                  className={`relative pl-14 md:pl-0 md:w-[calc(50%-52px)] ${right ? "md:ml-auto" : ""}`}
                >
                  <span
                    aria-hidden="true"
                    className={`absolute top-14 h-2 bg-ink left-[22px] w-[34px] ${right ? "md:-left-[52px] md:w-[52px]" : "md:left-auto md:-right-[52px] md:w-[52px]"}`}
                  />
                  <PredictionCard p={p} tilt={right ? 0.8 : -0.8} />
                </motion.li>
              );
            })}
          </ul>
        </li>
      ))}
    </ol>
  );
};
